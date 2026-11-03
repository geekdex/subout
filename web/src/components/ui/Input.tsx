import React, { forwardRef } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  clearable?: boolean;
  onClear?: () => void;
  size?: "sm" | "md" | "lg";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      icon,
      iconRight,
      clearable,
      onClear,
      size = "md",
      disabled,
      value,
      ...props
    },
    ref,
  ) => {
    const sizeStyles = {
      sm: "text-xs px-2.5 py-1.5 h-8",
      md: "text-sm px-3.5 py-2 h-10",
      lg: "text-base px-4 py-2.5 h-12",
    };

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-slate-300 select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {icon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            disabled={disabled}
            value={value}
            className={twMerge(
              clsx(
                "w-full bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 disabled:opacity-50 disabled:cursor-not-allowed",
                sizeStyles[size],
                icon && "pl-9",
                (iconRight || clearable) && "pr-9",
                error &&
                  "border-rose-500 focus:border-rose-500 focus:ring-rose-500/40",
                className,
              ),
            )}
            {...props}
          />
          {clearable && value && !disabled && (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-3 p-0.5 text-slate-400 hover:text-slate-200 transition-colors rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {!clearable && iconRight && (
            <div className="absolute right-3 flex items-center pointer-events-none text-slate-400">
              {iconRight}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-rose-400">{error}</span>}
        {!error && helperText && (
          <span className="text-xs text-slate-400">{helperText}</span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
