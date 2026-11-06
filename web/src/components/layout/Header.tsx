import React from "react";
import { clsx } from "clsx";
import {
  Play,
  Square,
  RotateCw,
  LogOut,
  Globe,
  Sparkles,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  Menu,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Switch } from "../ui/Switch";
import { Tooltip } from "../ui/Tooltip";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";
import { ServiceStatus, SystemInfo, ConfigProfile } from "../../types/api";

interface HeaderProps {
  systemInfo: SystemInfo | null;
  serviceStatus: ServiceStatus | null;
  runningProfile: ConfigProfile | null;
  actionLoading: boolean;
  onStartService: () => void;
  onStopService: () => void;
  onRestartService: () => void;
  onToggleSystemProxy: (enabled: boolean) => void;
  onSwitchMode: (mode: "simple" | "expert") => void;
  onLogout: () => void;
  onOpenSudoSettings?: () => void;
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  systemInfo,
  serviceStatus,
  runningProfile,
  actionLoading,
  onStartService,
  onStopService,
  onRestartService,
  onToggleSystemProxy,
  onSwitchMode,
  onLogout,
  onOpenSudoSettings,
  onToggleMobileMenu,
  isMobileMenuOpen,
}) => {
  const isRunning = serviceStatus?.running ?? false;
  const isReady = serviceStatus?.ready ?? false;
  const systemProxyEnabled = serviceStatus?.system_proxy_enabled ?? false;
  const appMode = systemInfo?.app_mode ?? "simple";

  const isRoot = systemInfo?.is_root ?? false;
  const sudoConfigured = systemInfo?.sudo_configured ?? false;

  // 计算系统代理是否可以点击及对应合理提示
  const isExpertWithoutProfile = appMode === "expert" && !runningProfile;
  const isProxySupported = serviceStatus?.system_proxy_supported ?? true;
  const unsupportedReason = serviceStatus?.system_proxy_unsupported_reason;
  const mixedPort = serviceStatus?.mixed_port;
  const hasProxyPort = mixedPort !== null && mixedPort !== undefined;

  let isProxyClickable = true;
  let proxyTooltip = "";

  if (actionLoading) {
    isProxyClickable = false;
    proxyTooltip = "正在处理中...";
  } else if (!isProxySupported) {
    isProxyClickable = false;
    proxyTooltip =
      unsupportedReason ||
      "当前操作系统环境未安装或不支持桌面代理配置工具，建议使用 TUN 透明代理模式";
  } else if (isExpertWithoutProfile) {
    isProxyClickable = false;
    proxyTooltip = "请先在控制面板绑定当前平台的运行配置";
  } else if (!hasProxyPort) {
    isProxyClickable = false;
    proxyTooltip = "当前配置未包含混合/HTTP/SOCKS入站端口，无法设置为系统代理";
  } else if (isRunning) {
    proxyTooltip = systemProxyEnabled
      ? `系统代理已生效 (127.0.0.1:${mixedPort})，点击关闭`
      : `点击开启系统代理 (127.0.0.1:${mixedPort})`;
  } else {
    proxyTooltip = systemProxyEnabled
      ? `已预设开启：启动服务时将自动为系统配置代理 (127.0.0.1:${mixedPort})`
      : `点击预设开启系统代理（启动服务时将自动应用至系统网络）`;
  }

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 flex items-center justify-between shrink-0 z-20 gap-2 w-full">
      {/* Left: Mobile Menu Toggle & Brand & Status & (Desktop Only Extended Info) */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-initial">
        {/* Mobile Hamburger Menu Button */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className={clsx(
              "lg:hidden w-9 h-9 -ml-1 flex items-center justify-center rounded-xl border transition-all active:scale-90 shrink-0",
              isMobileMenuOpen
                ? "bg-sky-500/20 text-sky-400 border-sky-500/40 shadow-sm shadow-sky-500/10"
                : "bg-slate-800/60 text-slate-300 hover:text-slate-100 hover:bg-slate-800 border-slate-700/60",
            )}
            aria-label="打开菜单"
            aria-expanded={isMobileMenuOpen ?? false}
            title={isMobileMenuOpen ? "关闭菜单" : "打开菜单"}
          >
            <Menu className="w-5 h-5 transition-transform duration-200" />
          </button>
        )}

        {/* Brand name for mobile */}
        <span className="lg:hidden font-bold text-sm text-slate-100 tracking-tight shrink-0">
          Subout
        </span>

        {/* Host OS Badge (Desktop only) */}
        {systemInfo?.host_os && (
          <span className="hidden md:inline-flex shrink-0">
            <Badge platform={systemInfo.host_os} size="sm">
              {systemInfo.host_os.toUpperCase()} ({systemInfo.host_arch})
            </Badge>
          </span>
        )}

        {/* Mode / Profile Label (Desktop only) */}
        <div className="hidden md:flex items-center min-w-0">
          {appMode === "simple" ? (
            <div className="flex items-center gap-1.5 text-xs text-sky-400 font-medium shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>小白极简模式</span>
            </div>
          ) : runningProfile ? (
            <div className="flex items-center gap-1 text-xs text-slate-300 min-w-0 truncate">
              <span className="text-slate-500">运行配置:</span>
              <span className="font-medium text-sky-400 truncate max-w-[120px] lg:max-w-xs">
                {runningProfile.name}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                ({String(runningProfile.version_code ?? "").slice(-6)})
              </span>
            </div>
          ) : (
            <div className="text-xs text-amber-400 shrink-0">未指定配置</div>
          )}
        </div>

        <div className="hidden md:block h-4 w-px bg-slate-800 mx-1 shrink-0" />

        {/* Status Badge */}
        <Badge
          variant={isRunning ? (isReady ? "success" : "warning") : "neutral"}
          dot
          size="sm"
          className="shrink-0"
        >
          <span className="hidden sm:inline">
            {isRunning ? (isReady ? "运行就绪" : "启动中") : "已停止"}
          </span>
          <span className="sm:hidden">
            {isRunning ? (isReady ? "就绪" : "启动中") : "已停止"}
          </span>
        </Badge>

        <div className="hidden md:block h-4 w-px bg-slate-800 mx-1 shrink-0" />

        {/* Cockpit-style Sudo Administrative Access Button (Desktop only on Header) */}
        <div className="hidden md:flex shrink-0">
          {isRoot ? (
            <button
              type="button"
              onClick={onOpenSudoSettings}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-all"
              title="程序直接以最高管理员 (Root) 运行，点击查看权限状态"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>管理员权限</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded font-mono">
                Root
              </span>
            </button>
          ) : sudoConfigured ? (
            <button
              type="button"
              onClick={onOpenSudoSettings}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-all group"
              title="已配置系统提权密码（永久有效）。点击管理或清除密码"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>管理员权限</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded font-normal">
                永久有效
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenSudoSettings}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-medium transition-all shadow-sm shadow-amber-500/10 group cursor-pointer"
              title="当前权限受限。点击输入 Sudo 密码开启管理员权限"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>功能受限</span>
              <span className="text-[10px] bg-amber-500/25 group-hover:bg-amber-500/40 text-amber-200 px-1.5 py-0.2 rounded font-normal transition-colors">
                点击提权
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Right: Quick Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Global Theme Switcher (Auto / Light / Dark) */}
        <ThemeSwitcher variant="compact" className="hidden sm:inline-flex" />

        {/* Mode Switcher (Visible on desktop) */}
        <div className="hidden lg:flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 text-xs shrink-0">
          <button
            type="button"
            onClick={() => onSwitchMode("simple")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              appMode === "simple"
                ? "bg-sky-500 text-white font-medium shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="切换为小白模式"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>小白模式</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode("expert")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              appMode === "expert"
                ? "bg-sky-500 text-white font-medium shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="切换为专业模式"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>专业模式</span>
          </button>
        </div>

        {/* System Proxy Switch */}
        <Tooltip
          content={proxyTooltip}
          position="bottom"
          align="end"
          className="max-w-[260px] sm:max-w-[300px]"
        >
          <div
            className={clsx(
              "flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-800 text-xs text-slate-300 shrink-0 select-none transition-colors",
              !isProxyClickable
                ? "opacity-60 cursor-not-allowed"
                : "hover:border-slate-700 cursor-pointer",
            )}
            onClick={() => {
              if (isProxyClickable && !actionLoading) {
                onToggleSystemProxy(!systemProxyEnabled);
              }
            }}
          >
            <Globe
              className={clsx(
                "w-3.5 h-3.5 transition-colors",
                systemProxyEnabled ? "text-sky-400" : "text-slate-400",
              )}
            />
            <span className="hidden sm:inline">系统代理</span>
            {systemProxyEnabled && !isRunning && (
              <span
                className="hidden xl:inline text-[10px] text-sky-400 font-normal bg-sky-500/10 px-1 py-0.2 rounded border border-sky-500/20"
                title="已预设开启，启动服务时自动生效"
              >
                预设
              </span>
            )}
            <Switch
              checked={systemProxyEnabled}
              disabled={!isProxyClickable}
              onChange={onToggleSystemProxy}
            />
          </div>
        </Tooltip>

        {/* Service Action Buttons */}
        {isRunning ? (
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              loading={actionLoading}
              onClick={onRestartService}
              icon={<RotateCw className="w-3.5 h-3.5" />}
              title="重启服务"
              className="px-2 sm:px-3"
            >
              <span className="hidden sm:inline">重启</span>
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={actionLoading}
              onClick={onStopService}
              icon={<Square className="w-3.5 h-3.5" />}
              title="停止服务"
              className="px-2 sm:px-3"
            >
              <span className="hidden sm:inline">停止</span>
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            loading={actionLoading}
            onClick={onStartService}
            disabled={appMode === "expert" && !runningProfile}
            icon={<Play className="w-3.5 h-3.5" />}
            title={
              appMode === "expert" && !runningProfile
                ? "请先绑定当前平台的运行配置"
                : "启动服务"
            }
            className="shrink-0 px-2.5 sm:px-3"
          >
            <span>启动</span>
            <span className="hidden sm:inline">服务</span>
          </Button>
        )}

        <div className="hidden md:block h-4 w-px bg-slate-800 shrink-0" />

        {/* Logout (Desktop only on Header) */}
        <button
          type="button"
          onClick={onLogout}
          className="hidden md:block p-1.5 sm:p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors shrink-0"
          title="退出登录"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
