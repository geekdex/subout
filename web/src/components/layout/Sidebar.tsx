import React from "react";
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

  const handleTabClick = (tabId: NavTab) => {
    onSelectTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderNavContent = (isMobileView: boolean) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-sky-500/20">
            S
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
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
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="关闭导航菜单"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Mobile-only Mode Switcher */}
        {isMobileView && onSwitchMode && (
          <div className="mb-3 p-1 bg-slate-950/80 rounded-xl border border-slate-800 grid grid-cols-2 gap-1 text-xs">
            <button
              type="button"
              onClick={() => onSwitchMode("simple")}
              className={clsx(
                "flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all font-medium",
                appMode === "simple"
                  ? "bg-sky-500 text-white shadow-sm"
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
                "flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all font-medium",
                appMode === "expert"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>专业模式</span>
            </button>
          </div>
        )}

        <div className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
          导航菜单
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
                "w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all group relative",
                isActive
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/20 font-semibold"
                  : isLocked
                    ? "text-slate-600 cursor-not-allowed opacity-60"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/60",
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
      <div className="p-3.5 border-t border-slate-800 text-[11px] text-slate-500 flex flex-col gap-2 shrink-0 bg-slate-900/60">
        <div className="flex items-center justify-between">
          <span>模式: {appMode === "simple" ? "小白模式" : "专业模式"}</span>
          <span className="flex items-center gap-1.5">
            <span
              className={clsx(
                "w-2 h-2 rounded-full",
                isKernelReady ? "bg-emerald-400" : "bg-amber-400 animate-pulse",
              )}
            />
            <span>{isKernelReady ? "内核就绪" : "内核未就绪"}</span>
          </span>
        </div>

        {isMobileView && onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors border border-slate-800"
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

      {/* Mobile Off-canvas Slide-over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={onCloseMobile}
          />

          {/* Drawer content */}
          <div className="relative w-72 max-w-[85vw] h-full bg-slate-900 border-r border-slate-800 shadow-2xl z-10 flex flex-col animate-in slide-in-from-left duration-250 select-none">
            {renderNavContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
