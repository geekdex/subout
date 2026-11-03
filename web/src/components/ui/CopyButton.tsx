import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary" | "outline";
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label = "复制",
  copiedLabel = "已复制",
  size = "sm",
  variant = "ghost",
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-1 gap-1.5 h-7",
    md: "text-sm px-3 py-1.5 gap-2 h-9",
  };

  const variantClasses = {
    ghost: "text-slate-400 hover:text-slate-100 hover:bg-slate-800/80",
    secondary:
      "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700",
    outline:
      "border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800",
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={twMerge(
        clsx(
          "inline-flex items-center justify-center font-medium rounded-md transition-all select-none active:scale-95",
          sizeClasses[size],
          variantClasses[variant],
          copied && "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
          className,
        ),
      )}
      title="点击复制"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 shrink-0" />
          {label && <span>{label}</span>}
        </>
      )}
    </button>
  );
};
