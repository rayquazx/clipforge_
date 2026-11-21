"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    warning: (msg: string) => void;
  };
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toastMethods = React.useMemo(
    () => ({
      success: (msg: string) => addToast("success", msg),
      error: (msg: string) => addToast("error", msg),
      info: (msg: string) => addToast("info", msg),
      warning: (msg: string) => addToast("warning", msg),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toast: toastMethods }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const icons = {
            success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
            error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
            warning: <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />,
            info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
          };

          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl border shadow-xl bg-surface/95 backdrop-blur-md transition-all animate-in slide-in-from-bottom-2",
                t.type === "success" && "border-emerald-500/20",
                t.type === "error" && "border-red-500/20",
                t.type === "warning" && "border-amber-500/20",
                t.type === "info" && "border-blue-500/20"
              )}
            >
              <div className="flex items-center gap-2.5 text-xs text-text-primary font-medium">
                {icons[t.type]}
                <span>{t.message}</span>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    return {
      toast: {
        success: (msg: string) => console.log("[Toast Success]:", msg),
        error: (msg: string) => console.error("[Toast Error]:", msg),
        info: (msg: string) => console.log("[Toast Info]:", msg),
        warning: (msg: string) => console.warn("[Toast Warning]:", msg),
      },
    };
  }
  return context;
}
