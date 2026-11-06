import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  width?: "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
  isClosing?: boolean;
}

const EXIT_ANIMATION_MS = 200;

export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  width = "xl",
  isClosing: externalClosing = false,
}) => {
  const [shouldRender, setShouldRender] = useState(open);
  const [internalClosing, setInternalClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isClosing = externalClosing || internalClosing;

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setInternalClosing(false);
    } else if (shouldRender) {
      setInternalClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setInternalClosing(false);
      }, EXIT_ANIMATION_MS);
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
    if (internalClosing || externalClosing) return;
    setInternalClosing(true);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, EXIT_ANIMATION_MS);
  }, [internalClosing, externalClosing, onClose]);

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

  const widthClasses = {
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-2xl",
    "2xl": "max-w-4xl",
    "3xl": "max-w-5xl",
    full: "max-w-full",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
      data-state={isClosing ? "closing" : "open"}
    >
      {/* Backdrop with smooth fade in/out */}
      <div
        className={clsx(
          "fixed inset-0 bg-black/60 backdrop-blur-sm",
          isClosing ? "animate-backdrop-out" : "animate-backdrop-in",
        )}
        onClick={triggerSmoothClose}
      />

      {/* Drawer panel with smooth slide + scale in/out */}
      <div
        className={twMerge(
          clsx(
            "relative w-full h-full bg-slate-900 border-l border-slate-800 shadow-2xl z-10 flex flex-col",
            isClosing ? "animate-drawer-out" : "animate-drawer-in",
            widthClasses[width],
            className,
          ),
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-slate-100">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-slate-400 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={triggerSmoothClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="关闭编辑器"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {children}
        </div>

        {footer && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
