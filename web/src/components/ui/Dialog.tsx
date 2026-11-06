import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full";
}

const DIALOG_EXIT_MS = 180;

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}) => {
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, DIALOG_EXIT_MS);
      return () => clearTimeout(timer);
    }
  }, [open, shouldRender]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const triggerSmoothClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, DIALOG_EXIT_MS);
  }, [isClosing, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !isClosing) {
        triggerSmoothClose();
      }
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, isClosing, triggerSmoothClose]);

  if (!shouldRender && !open) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-3xl",
    "3xl": "max-w-4xl",
    "4xl": "max-w-5xl",
    full: "max-w-6xl",
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 bg-black/60 backdrop-blur-sm",
          isClosing ? "animate-backdrop-out" : "animate-backdrop-in",
        )}
        onClick={triggerSmoothClose}
      />

      {/* Dialog content */}
      <div
        className={twMerge(
          clsx(
            "relative w-full bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-4 sm:p-6 z-10",
            isClosing ? "animate-dialog-out" : "animate-dialog-in",
            sizeClasses[size],
            className,
          ),
        )}
      >
        <button
          type="button"
          onClick={triggerSmoothClose}
          className="absolute right-4 top-4 p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {title && (
          <div className="mb-4 pr-6">
            <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
            {description && (
              <p className="text-xs text-slate-400 mt-1">{description}</p>
            )}
          </div>
        )}

        <div className="text-sm text-slate-200">{children}</div>

        {footer && (
          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
