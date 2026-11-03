import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: "pills" | "cards" | "underline";
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = "pills",
  className,
}) => {
  if (variant === "cards") {
    return (
      <div
        className={twMerge(
          clsx(
            "flex gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl",
            className,
          ),
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all select-none",
                isActive
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60",
                tab.disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge && <span className="ml-1">{tab.badge}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "underline") {
    return (
      <div
        className={twMerge(
          clsx("flex border-b border-slate-800 gap-6", className),
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={clsx(
                "flex items-center gap-2 py-3 text-xs font-medium border-b-2 transition-all select-none -mb-px",
                isActive
                  ? "border-sky-500 text-sky-400"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700",
                tab.disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge && <span className="ml-1">{tab.badge}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  // Default: pills
  return (
    <div
      className={twMerge(
        clsx(
          "flex flex-wrap gap-1.5 p-1 bg-slate-900/80 border border-slate-800 rounded-lg",
          className,
        ),
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={clsx(
              "flex items-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-all select-none",
              isActive
                ? "bg-slate-800 text-sky-400 shadow-sm border border-slate-700/80"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40",
              tab.disabled && "opacity-40 cursor-not-allowed",
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && <span className="ml-1">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
};
