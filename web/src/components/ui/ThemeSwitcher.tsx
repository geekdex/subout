import React from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import { clsx } from "clsx";
import { useTheme, ThemeMode } from "../../hooks/useTheme";

export interface ThemeSwitcherProps {
  variant?: "compact" | "full" | "cards";
  className?: string;
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  shortLabel: string;
  desc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: "system",
    label: "自动跟随系统",
    shortLabel: "自动",
    desc: "根据操作系统深浅色外观自动切换（默认）",
    icon: Monitor,
  },
  {
    id: "light",
    label: "亮色模式",
    shortLabel: "亮色",
    desc: "清爽高对比度浅色界面，适合日间或明亮环境",
    icon: Sun,
  },
  {
    id: "dark",
    label: "暗色模式",
    shortLabel: "暗色",
    desc: "柔和护眼深色界面，适合夜间或极客终端环境",
    icon: Moon,
  },
];

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  variant = "compact",
  className,
}) => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (variant === "cards") {
    return (
      <div
        className={clsx("grid grid-cols-1 sm:grid-cols-3 gap-3", className)}
        role="radiogroup"
        aria-label="全局主题模式选择"
      >
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setTheme(opt.id)}
              className={clsx(
                "flex flex-col items-start p-3.5 rounded-xl border text-left transition-all select-none",
                isActive
                  ? "bg-sky-500/10 border-sky-500 ring-1 ring-sky-500/40 shadow-sm"
                  : "bg-slate-800/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/70",
              )}
            >
              <div className="w-full flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={clsx(
                      "p-1.5 rounded-lg transition-colors",
                      isActive
                        ? "bg-sky-500 text-white"
                        : "bg-slate-800 text-slate-400",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span
                    className={clsx(
                      "text-xs font-semibold",
                      isActive ? "text-sky-400" : "text-slate-200",
                    )}
                  >
                    {opt.label}
                  </span>
                </div>
                {isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-medium">
                    {opt.id === "system"
                      ? `当前: ${resolvedTheme === "light" ? "亮色" : "暗色"}`
                      : "使用中"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {opt.desc}
              </p>
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "full") {
    return (
      <div
        className={clsx(
          "p-1 bg-slate-950/80 rounded-xl border border-slate-800/90 grid grid-cols-3 gap-1 text-xs shadow-inner",
          className,
        )}
        role="radiogroup"
        aria-label="全局主题模式切换"
      >
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setTheme(opt.id)}
              title={opt.label}
              className={clsx(
                "flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg transition-all font-medium active:scale-[0.98]",
                isActive
                  ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{opt.shortLabel}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Default: compact segmented pill for Header / Login
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-0.5 bg-slate-800/70 p-1 rounded-lg border border-slate-700/60 text-xs shrink-0",
        className,
      )}
      role="radiogroup"
      aria-label="主题切换"
    >
      {THEME_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isActive = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`切换主题为${opt.label}`}
            title={
              opt.id === "system"
                ? `${opt.label} (当前生效: ${resolvedTheme === "light" ? "亮色" : "暗色"})`
                : opt.label
            }
            onClick={() => setTheme(opt.id)}
            className={clsx(
              "flex items-center gap-1 px-2 py-1 rounded-md transition-all select-none",
              isActive
                ? "bg-sky-500 text-white font-medium shadow-sm"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">{opt.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
};
