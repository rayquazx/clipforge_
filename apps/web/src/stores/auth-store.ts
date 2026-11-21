import { create } from "zustand";
import { User } from "@/types";
import api from "@/lib/api";
import {
  clearTokens,
  getAccessToken,
  setAccessToken,
  setRefreshToken,
} from "@/lib/auth";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post("/auth/login", { email, password });
      const { access_token, refresh_token, user } = response.data;
      setAccessToken(access_token);
      setRefreshToken(refresh_token);
      set({ user, isAuthenticated: true, isLoading: false, isInitialized: true });
    } catch (err: any) {
      const message =
        err.response?.data?.detail || "Invalid login credentials";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post("/auth/register", {
        email,
        password,
        display_name: displayName,
      });
      const { access_token, refresh_token, user } = response.data;
      setAccessToken(access_token);
      setRefreshToken(refresh_token);
      set({ user, isAuthenticated: true, isLoading: false, isInitialized: true });
    } catch (err: any) {
      const message =
        err.response?.data?.detail || "Registration failed. Try again.";
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  logout: () => {
    clearTokens();
    set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true, error: null });
  },

  loadUser: async () => {
    if (get().isLoading) return;
    const token = getAccessToken();
    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true });
      return;
    }
    set({ isLoading: true });
    try {
      const response = await api.get("/auth/me");
      set({ user: response.data, isAuthenticated: true, isLoading: false, isInitialized: true });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false, isInitialized: true });
    }
  },
}));
