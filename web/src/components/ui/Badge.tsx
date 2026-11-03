import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface BadgeProps {
  variant?:
    | "success"
    | "danger"
    | "warning"
    | "info"
    | "neutral"
    | "platform"
    | "outline";
  dot?: boolean;
  platform?: "linux" | "macos" | "windows" | "android" | string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  dot = false,
  platform,
  children,
  className,
  size = "md",
}) => {
  const sizeStyles = {
    sm: "text-[10px] px-1.5 py-0.5 gap-1",
    md: "text-xs px-2.5 py-0.5 gap-1.5",
  };

  const getVariantStyles = () => {
    if (platform) {
      switch (platform.toLowerCase()) {
        case "linux":
          return "bg-amber-500/10 text-amber-400 border border-amber-500/30";
        case "macos":
          return "bg-slate-700/50 text-slate-200 border border-slate-600";
        case "windows":
          return "bg-sky-500/10 text-sky-400 border border-sky-500/30";
        case "android":
          return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
        default:
          return "bg-slate-800 text-slate-300 border border-slate-700";
      }
    }

    switch (variant) {
      case "success":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "danger":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      case "warning":
        return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "info":
        return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
      case "outline":
        return "bg-transparent text-slate-300 border border-slate-700";
      case "neutral":
      default:
        return "bg-slate-800/80 text-slate-300 border border-slate-700/60";
    }
  };

  const getDotStyles = () => {
    switch (variant) {
      case "success":
        return "bg-emerald-400";
      case "danger":
        return "bg-rose-400";
      case "warning":
        return "bg-amber-400";
      case "info":
        return "bg-sky-400";
      default:
        return "bg-slate-400";
    }
  };

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center font-medium rounded-full select-none shrink-0",
          sizeStyles[size],
          getVariantStyles(),
          className,
        ),
      )}
    >
      {dot && (
        <span
          className={clsx("w-1.5 h-1.5 rounded-full shrink-0", getDotStyles())}
        />
      )}
      {children}
    </span>
  );
};
