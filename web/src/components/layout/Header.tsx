import React from "react";
import {
  Play,
  Square,
  RotateCw,
  LogOut,
  Globe,
  Sparkles,
  Sliders,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Switch } from "../ui/Switch";
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
  onSwitchMode: (mode: "simple" | "logical") => void;
  onLogout: () => void;
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
}) => {
  const isRunning = serviceStatus?.running ?? false;
  const isReady = serviceStatus?.ready ?? false;
  const systemProxyEnabled = serviceStatus?.system_proxy_enabled ?? false;
  const appMode = systemInfo?.app_mode ?? "simple";

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between shrink-0 z-20">
      {/* Left: Host & Status */}
      <div className="flex items-center gap-3">
        {systemInfo?.host_os && (
          <Badge platform={systemInfo.host_os} size="sm">
            {systemInfo.host_os.toUpperCase()} ({systemInfo.host_arch})
          </Badge>
        )}

        {runningProfile ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="text-slate-500">运行配置:</span>
            <span className="font-medium text-sky-400">
              {runningProfile.name}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              ({String(runningProfile.version_code ?? "").slice(-6)})
            </span>
          </div>
        ) : (
          <div className="text-xs text-amber-400">未指定运行配置</div>
        )}

        <div className="h-4 w-px bg-slate-800 mx-1" />

        <Badge
          variant={isRunning ? (isReady ? "success" : "warning") : "neutral"}
          dot
          size="sm"
        >
          {isRunning ? (isReady ? "运行就绪" : "启动中") : "已停止"}
        </Badge>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-3">
        {/* Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 text-xs">
          <button
            type="button"
            onClick={() => onSwitchMode("simple")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              appMode === "simple"
                ? "bg-sky-500 text-white font-medium shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>小白模式</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode("logical")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
              appMode === "logical"
                ? "bg-sky-500 text-white font-medium shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>专业模式</span>
          </button>
        </div>

        {/* System Proxy Switch */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-800 text-xs text-slate-300">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span>系统代理</span>
          <Switch
            checked={systemProxyEnabled}
            disabled={actionLoading || !isRunning}
            onChange={onToggleSystemProxy}
          />
        </div>

        {/* Service Action Buttons */}
        {isRunning ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              loading={actionLoading}
              onClick={onRestartService}
              icon={<RotateCw className="w-3.5 h-3.5" />}
              title="重启服务"
            >
              重启
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={actionLoading}
              onClick={onStopService}
              icon={<Square className="w-3.5 h-3.5" />}
            >
              停止
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            loading={actionLoading}
            onClick={onStartService}
            icon={<Play className="w-3.5 h-3.5" />}
          >
            启动服务
          </Button>
        )}

        <div className="h-4 w-px bg-slate-800" />

        <button
          type="button"
          onClick={onLogout}
          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
          title="退出登录"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
