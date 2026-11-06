import React, { useState } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end" | "left" | "right";
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = "top",
  align = "center",
  className,
}) => {
  const [visible, setVisible] = useState(false);

  const getPositionClass = () => {
    const isEnd = align === "end" || align === "right";
    const isStart = align === "start" || align === "left";

    if (position === "top") {
      if (isEnd) return "bottom-full right-0 left-auto translate-x-0 mb-2";
      if (isStart) return "bottom-full left-0 right-auto translate-x-0 mb-2";
      return "bottom-full left-1/2 -translate-x-1/2 mb-2";
    }
    if (position === "bottom") {
      if (isEnd) return "top-full right-0 left-auto translate-x-0 mt-2";
      if (isStart) return "top-full left-0 right-auto translate-x-0 mt-2";
      return "top-full left-1/2 -translate-x-1/2 mt-2";
    }
    if (position === "left") {
      if (isEnd) return "right-full bottom-0 top-auto translate-y-0 mr-2";
      if (isStart) return "right-full top-0 bottom-auto translate-y-0 mr-2";
      return "right-full top-1/2 -translate-y-1/2 mr-2";
    }
    if (position === "right") {
      if (isEnd) return "left-full bottom-0 top-auto translate-y-0 ml-2";
      if (isStart) return "left-full top-0 bottom-auto translate-y-0 ml-2";
      return "left-full top-1/2 -translate-y-1/2 ml-2";
    }
    return "bottom-full left-1/2 -translate-x-1/2 mb-2";
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && content && (
        <div
          className={twMerge(
            clsx(
              "absolute z-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-100 max-w-[280px] sm:max-w-xs break-words whitespace-normal text-left leading-relaxed",
              getPositionClass(),
              className,
            ),
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
};
