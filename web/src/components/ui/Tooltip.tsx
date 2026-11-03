import React, { useState } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = "top",
  className,
}) => {
  const [visible, setVisible] = useState(false);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
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
              "absolute z-50 px-2 py-1 text-[11px] font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95 duration-100",
              positionClasses[position],
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
