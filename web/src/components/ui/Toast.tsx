import React, { useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { ToastContext, ToastItem, ToastType } from "../../hooks/useToast";

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      title: string,
      options?: { type?: ToastType; message?: string; duration?: number },
    ) => {
      const id = Math.random().toString(36).substring(2, 9);
      const type = options?.type || "info";
      const duration = options?.duration ?? 4000;

      const newToast: ToastItem = {
        id,
        title,
        message: options?.message,
        type,
        duration,
      };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (title: string, message?: string) =>
      showToast(title, { type: "success", message }),
    [showToast],
  );
  const error = useCallback(
    (title: string, message?: string) =>
      showToast(title, { type: "error", message }),
    [showToast],
  );
  const warning = useCallback(
    (title: string, message?: string) =>
      showToast(title, { type: "warning", message }),
    [showToast],
  );
  const info = useCallback(
    (title: string, message?: string) =>
      showToast(title, { type: "info", message }),
    [showToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const icons = {
            success: (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ),
            error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
            warning: (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            ),
            info: <Info className="w-5 h-5 text-sky-400 shrink-0" />,
          };

          const borderColors = {
            success: "border-emerald-500/30 bg-slate-900/95",
            error: "border-rose-500/30 bg-slate-900/95",
            warning: "border-amber-500/30 bg-slate-900/95",
            info: "border-sky-500/30 bg-slate-900/95",
          };

          return (
            <div
              key={toast.id}
              className={clsx(
                "pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-3 duration-200",
                borderColors[toast.type],
              )}
            >
              {icons[toast.type]}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-100">
                  {toast.title}
                </h4>
                {toast.message && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {toast.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
