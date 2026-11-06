import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  Sparkles,
  Layers,
  Rss,
  Server,
  FolderKanban,
  RefreshCw,
  FileText,
  Settings,
  Lock,
  X,
  SlidersHorizontal,
  LogOut,
} from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "../ui/Tooltip";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";
import { KernelDownloadStatus } from "../../types/api";

export type NavTab =
  | "dashboard"
  | "simple"
  | "profiles"
  | "subscriptions"
  | "nodes"
  | "groups"
  | "auto-update"
  | "logs"
  | "settings";

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isKernelReady: boolean;
  downloadStatus?: KernelDownloadStatus | null;
  appMode: "simple" | "expert";
  versionCode?: string | number;
  nodeCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onSwitchMode?: (mode: "simple" | "expert") => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isKernelReady,
  downloadStatus,
  appMode,
  versionCode,
  mobileOpen = false,
  onCloseMobile,
  onSwitchMode,
  onLogout,
}) => {
  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    requiresKernel: boolean;
    badge?: string;
    showInMode: "all" | "simple" | "expert";
  }> = [
    {
      id: "dashboard",
      label: "控制面板",
      icon: <LayoutDashboard className="w-4 h-4" />,
      requiresKernel: false,
      showInMode: "all",
    },
    {
      id: "simple",
      label: "小白模式",
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      requiresKernel: true,
      showInMode: "simple",
    },
    {
      id: "profiles",
      label: "配置中心",
      icon: <Layers className="w-4 h-4" />,
      requiresKernel: true,
      showInMode: "expert",
    },
    {
      id: "subscriptions",
      label: "订阅管理",
      icon: <Rss className="w-4 h-4" />,
      requiresKernel: true,
      showInMode: "all",
    },
    {
      id: "nodes",
      label: appMode === "simple" ? "节点列表" : "节点池",
      icon: <Server className="w-4 h-4" />,
      requiresKernel: true,
      showInMode: "all",
    },
    {
      id: "groups",
      label: "节点组合",
      icon: <FolderKanban className="w-4 h-4" />,
      requiresKernel: true,
      badge: versionCode ? `v${String(versionCode).slice(-4)}` : undefined,
      showInMode: "expert",
    },
    {
      id: "auto-update",
      label: "自动更新中心",
      icon: <RefreshCw className="w-4 h-4" />,
      requiresKernel: true,
      showInMode: "expert",
    },
    {
      id: "logs",
      label: "内核日志",
      icon: <FileText className="w-4 h-4" />,
      requiresKernel: false,
      showInMode: "all",
    },
    {
      id: "settings",
      label: "系统设置",
      icon: <Settings className="w-4 h-4" />,
      requiresKernel: false,
      showInMode: "all",
    },
  ];

  const visibleNavItems = navItems.filter(
    (item) => item.showInMode === "all" || item.showInMode === appMode,
  );

  // Animation and mount lifecycle for mobile off-canvas drawer
  const [prevMobileOpen, setPrevMobileOpen] = useState(mobileOpen);
  const [isMounted, setIsMounted] = useState(mobileOpen);
  const [isVisible, setIsVisible] = useState(false);

  // Touch gesture state for swipe-to-dismiss
  const [touchStart, setTouchStart] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const [dragTranslateX, setDragTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Synchronously update isMounted on mobileOpen prop change for instant render availability
  if (mobileOpen !== prevMobileOpen) {
    setPrevMobileOpen(mobileOpen);
    if (mobileOpen) {
      setIsMounted(true);
    }
  }

  // Handle smooth enter / exit transition and auto unmount
  useEffect(() => {
    if (mobileOpen) {
      // Trigger slide-in next frame to ensure initial off-screen style is acknowledged
      const raf = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      setDragTranslateX(0);
      setIsDragging(false);
      const timer = setTimeout(() => {
        setIsMounted(false);
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [mobileOpen]);

  // Lock body scroll while mobile drawer is open to prevent background jitter
  useEffect(() => {
    if (isMounted) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMounted]);

  // Keyboard accessibility: Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen && onCloseMobile) {
        onCloseMobile();
      }
    };
    if (isMounted) {
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isMounted, mobileOpen, onCloseMobile]);

  // Swipe-to-dismiss touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY, time: Date.now() });
    setIsDragging(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;

    // Detect horizontal swipe intent (not vertical scroll)
    if (
      isDragging ||
      (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8)
    ) {
      if (deltaX < 0) {
        // Dragging left (towards close)
        setIsDragging(true);
        setDragTranslateX(deltaX);
      } else {
        setDragTranslateX(0);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaTime = Math.max(Date.now() - touchStart.time, 1);
    const velocityX = Math.abs(deltaX) / deltaTime; // px/ms

    setTouchStart(null);
    setIsDragging(false);

    // If dragged left more than 50px OR fast flick (velocity > 0.3 px/ms and dragged > 20px)
    if (deltaX < -50 || (deltaX < -20 && velocityX > 0.3)) {
      setDragTranslateX(0);
      if (onCloseMobile) {
        onCloseMobile();
      }
    } else {
      // Spring back to open
      setDragTranslateX(0);
    }
  };

  const handleTouchCancel = () => {
    setTouchStart(null);
    setIsDragging(false);
    setDragTranslateX(0);
  };

  const handleTabClick = (tabId: NavTab) => {
    onSelectTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderNavContent = (isMobileView: boolean) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div
        className={clsx(
          "border-b border-slate-800/80 flex items-center justify-between shrink-0",
          isMobileView
            ? "pt-[max(1.25rem,env(safe-area-inset-top,1.25rem))] px-5 pb-4 bg-slate-900/60"
            : "p-5",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-sky-500/20 shrink-0">
            S
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-100 flex items-center gap-1.5">
              <span>Subout</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400">
                v0.3
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              sing-box 订阅与配置中台
            </p>
          </div>
        </div>
        {isMobileView && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 active:scale-90 transition-all shrink-0 border border-slate-800"
            aria-label="关闭导航菜单"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 overscroll-contain">
        {/* Mobile-only Mode & Theme Switcher */}
        {isMobileView && (
          <div className="mb-3 space-y-2">
            {onSwitchMode && (
              <div className="p-1 bg-slate-950/80 rounded-xl border border-slate-800/90 grid grid-cols-2 gap-1 text-xs shadow-inner">
                <button
                  type="button"
                  onClick={() => onSwitchMode("simple")}
                  className={clsx(
                    "flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all font-medium active:scale-[0.98]",
                    appMode === "simple"
                      ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>小白模式</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSwitchMode("expert")}
                  className={clsx(
                    "flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all font-medium active:scale-[0.98]",
                    appMode === "expert"
                      ? "bg-sky-500 text-white shadow-sm shadow-sky-500/20"
                      : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>专业模式</span>
                </button>
              </div>
            )}
            <ThemeSwitcher variant="full" />
          </div>
        )}

        <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase flex items-center justify-between">
          <span>导航菜单</span>
          {isMobileView && (
            <span className="text-[10px] text-slate-600 font-normal lowercase tracking-normal">
              左滑收起
            </span>
          )}
        </div>
        {visibleNavItems.map((item) => {
          const isLocked = item.requiresKernel && !isKernelReady;
          const isActive = currentTab === item.id;

          const buttonContent = (
            <button
              type="button"
              disabled={isLocked}
              onClick={() => !isLocked && handleTabClick(item.id)}
              className={clsx(
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group relative",
                isActive
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20 font-semibold"
                  : isLocked
                    ? "text-slate-600 cursor-not-allowed opacity-60"
                    : "text-slate-300 hover:text-slate-100 hover:bg-slate-800/60 active:scale-[0.98] active:bg-slate-800/80",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={clsx(
                    "shrink-0 transition-colors",
                    isActive
                      ? "text-white"
                      : "text-slate-400 group-hover:text-slate-200",
                  )}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {item.badge && (
                  <span
                    className={clsx(
                      "text-[10px] px-1.5 py-0.5 rounded font-mono font-normal",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-800 text-slate-400 border border-slate-700",
                    )}
                  >
                    {item.badge}
                  </span>
                )}
                {isLocked && (
                  <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
              </div>
            </button>
          );

          if (isLocked) {
            return (
              <Tooltip
                key={item.id}
                content="内核未就绪，该功能已被门禁锁定"
                position={isMobileView ? "top" : "right"}
                className="w-full"
              >
                {buttonContent}
              </Tooltip>
            );
          }

          return <div key={item.id}>{buttonContent}</div>;
        })}
      </div>

      {/* Footer Info */}
      <div
        className={clsx(
          "border-t border-slate-800/80 text-[11px] text-slate-500 flex flex-col gap-2.5 shrink-0 bg-slate-900/60",
          isMobileView
            ? "p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))]"
            : "p-3.5",
        )}
      >
        <div className="flex items-center justify-between px-0.5">
          <span className="text-slate-400">
            模式:{" "}
            <strong className="text-slate-200 font-medium">
              {appMode === "simple" ? "小白模式" : "专业模式"}
            </strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={clsx(
                "w-2 h-2 rounded-full",
                isKernelReady
                  ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                  : downloadStatus?.status === "downloading" ||
                      downloadStatus?.status === "extracting"
                    ? "bg-amber-400 animate-spin"
                    : "bg-amber-400 animate-pulse",
              )}
            />
            <span
              className={
                isKernelReady
                  ? "text-emerald-400 font-medium"
                  : downloadStatus?.status === "downloading"
                    ? "text-amber-300 font-medium"
                    : downloadStatus?.status === "extracting"
                      ? "text-cyan-300 font-medium"
                      : "text-amber-400"
              }
            >
              {isKernelReady
                ? "内核就绪"
                : downloadStatus?.status === "downloading"
                  ? `下载中 ${downloadStatus.progress.toFixed(0)}%`
                  : downloadStatus?.status === "extracting"
                    ? "正在安装..."
                    : "内核未就绪"}
            </span>
          </span>
        </div>

        {isMobileView && onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] active:bg-rose-500/20 transition-all border border-slate-800 hover:border-rose-500/30"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出当前管理会话</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex w-64 bg-slate-900/90 border-r border-slate-800 flex-col shrink-0 select-none">
        {renderNavContent(false)}
      </aside>

      {/* Mobile Off-canvas Slide-over Drawer (Portal + Swipe-to-dismiss + Spring Curve) */}
      {isMounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 lg:hidden flex"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
          >
            {/* Backdrop with smooth opacity transition */}
            <div
              className={clsx(
                "fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ease-out",
                isVisible && !isDragging
                  ? "opacity-100"
                  : isDragging
                    ? ""
                    : "opacity-0 pointer-events-none",
              )}
              style={
                isDragging
                  ? {
                      opacity: Math.max(
                        0,
                        (1 - Math.abs(dragTranslateX) / 300) * 0.75,
                      ),
                      transition: "none",
                    }
                  : undefined
              }
              onClick={onCloseMobile}
            />

            {/* Drawer panel with swipe-to-dismiss gesture and spring bezier curve */}
            <div
              ref={drawerRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
              style={{
                transform: isDragging
                  ? `translate3d(${dragTranslateX}px, 0, 0)`
                  : isVisible
                    ? "translate3d(0, 0, 0)"
                    : "translate3d(-100%, 0, 0)",
                transition: isDragging
                  ? "none"
                  : "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              className="relative w-72 max-w-[85vw] h-full max-h-[100dvh] bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/60 shadow-[20px_0_50px_rgba(0,0,0,0.6)] z-10 flex flex-col select-none touch-pan-y"
            >
              {/* Right edge visual affordance / drag handle indicator */}
              <div
                className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-10 rounded-full bg-slate-700/50 pointer-events-none"
                aria-hidden="true"
              />

              {renderNavContent(true)}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
