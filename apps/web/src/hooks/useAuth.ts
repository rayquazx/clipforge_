import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const loadUser = useAuthStore((s) => s.loadUser);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!isInitialized) {
      loadUser();
    }
  }, [isInitialized, loadUser]);

  return {
    user,
    isAuthenticated,
    isLoading: isLoading || !isInitialized,
    isInitialized,
    login,
    register,
    logout,
    loadUser,
  };
}

export default useAuth;
