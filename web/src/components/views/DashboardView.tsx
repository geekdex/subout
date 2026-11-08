import React, { useState } from "react";
import {
  Activity,
  Cpu,
  HardDrive,
  Clock,
  ShieldCheck,
  AlertCircle,
  Network,
  Radio,
  ExternalLink,
  ChevronRight,
  Sparkles,
  X,
  RotateCw,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Badge } from "../ui/Badge";
import { formatBytes, formatDuration } from "../../utils/format";
import { ServiceStatus, SystemInfo, ConfigProfile } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";
import { NavTab } from "../layout/Sidebar";

interface DashboardViewProps {
  systemInfo: SystemInfo | null;
  serviceStatus: ServiceStatus | null;
  configs: ConfigProfile[];
  runningProfile: ConfigProfile | null;
  onRefreshConfigs: () => void;
  onNavigateTab: (tab: NavTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  systemInfo,
  serviceStatus,
  configs,
  runningProfile,
  onRefreshConfigs,
  onNavigateTab,
}) => {
  const [switchingConfig, setSwitchingConfig] = useState(false);
  const [siteTesting, setSiteTesting] = useState(false);
  const [siteStatuses, setSiteStatuses] = useState<
    Record<
      string,
      {
        status: "idle" | "testing" | "success" | "error";
        latency_ms?: number | null;
        status_code?: number | null;
        error?: string | null;
      }
    >
  >({});
  const [hideConflictTip, setHideConflictTip] = useState<boolean>(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      return (
        window.localStorage.getItem("subout_hide_conflict_tip_date") === today
      );
    } catch {
      return false;
    }
  });
  const { success, error } = useToast();

  const handleDismissConflictTipToday = () => {
    setHideConflictTip(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      window.localStorage.setItem("subout_hide_conflict_tip_date", today);
    } catch {
      // ignore
    }
  };

  const isRunning = serviceStatus?.running ?? false;
  const hostOs = systemInfo?.host_os ?? "unknown";
  const isSimpleMode = (systemInfo?.app_mode ?? "simple") === "simple";

  // Filter configs matching host platform
  const eligibleConfigs = configs.filter((c) => c.platform === hostOs);

  const handleSelectRunningConfig = async (configIdStr: string) => {
    const id = parseInt(configIdStr, 10);
    if (!id || id === runningProfile?.id) return;

    setSwitchingConfig(true);
    try {
      await api.setRunningConfig(id);
      success("已更新本机运行配置");
      onRefreshConfigs();
    } catch (err: unknown) {
      error("切换运行配置失败", getErrorMessage(err));
    } finally {
      setSwitchingConfig(false);
    }
  };

  const probeSites = [
    {
      id: "baidu",
      name: "百度 (国内直连)",
      url: "https://www.baidu.com",
      description: "国内主站直连响应",
    },
    {
      id: "google",
      name: "Google (境外加速)",
      url: "https://www.google.com",
      description: "国际主流站点代理连通性",
    },
    {
      id: "cloudflare",
      name: "Cloudflare (边缘网络)",
      url: "https://1.1.1.1",
      description: "全球 Anycast 边缘节点",
    },
    {
      id: "github",
      name: "GitHub (全球代码库)",
      url: "https://github.com",
      description: "开发者海外网络访问",
    },
  ];

  const handleRunSiteTest = async () => {
    setSiteTesting(true);

    // Set all to testing state for dynamic progress indicators
    const initialStatuses: Record<
      string,
      {
        status: "idle" | "testing" | "success" | "error";
        latency_ms?: number | null;
        status_code?: number | null;
        error?: string | null;
      }
    > = {};
    for (const s of probeSites) {
      initialStatuses[s.id] = { status: "testing" };
    }
    setSiteStatuses(initialStatuses);

    // Concurrently trigger server-side site probe
    const testSite = async (site: (typeof probeSites)[0]) => {
      try {
        const res = await api.probeSite(site.url, 4500);
        setSiteStatuses((prev) => ({
          ...prev,
          [site.id]: {
            status: res.success ? "success" : "error",
            latency_ms: res.latency_ms,
            status_code: res.status_code,
            error: res.error,
          },
        }));
      } catch (err: unknown) {
        setSiteStatuses((prev) => ({
          ...prev,
          [site.id]: {
            status: "error",
            latency_ms: null,
            error: getErrorMessage(err),
          },
        }));
      }
    };

    await Promise.allSettled(probeSites.map(testSite));
    setSiteTesting(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Safe conflict reminder */}
      {!hideConflictTip && (
        <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4 flex items-center justify-between gap-3 text-xs text-sky-300">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              安全提示：启动 TUN 或系统代理前，请先退出 Clash、v2rayN、Surge
              等其他客户端，以避免 TUN 网卡互斥或端口占用冲突。
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismissConflictTipToday}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-sky-400 hover:bg-sky-500/15 transition-colors shrink-0 whitespace-nowrap"
            title="今日不再提示此提醒"
          >
            <span>今日不再提示</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Service Status */}
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>服务运行状态</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-100">
              {isRunning
                ? serviceStatus?.ready
                  ? "正常运行"
                  : "启动中"
                : "已停止"}
            </span>
            {serviceStatus?.pid && (
              <span className="text-xs text-slate-500 font-mono">
                PID {serviceStatus.pid}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>
              运行时间: {formatDuration(serviceStatus?.uptime_secs ?? 0)}
            </span>
          </div>
        </div>

        {/* Card 2: Network / Inbound Mode */}
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>网络接管模式</span>
            <Network className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-100">
              {serviceStatus?.is_tun ? "TUN 虚拟网卡" : "Mixed 混合代理"}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-400 flex items-center justify-between">
            {serviceStatus?.mixed_port ? (
              <span>端口: {serviceStatus.mixed_port}</span>
            ) : serviceStatus?.is_tun ? (
              <span className="text-emerald-400 font-medium">全局透明接管</span>
            ) : (
              <span>端口: 未配置</span>
            )}
            {serviceStatus?.tun_interface && (
              <span className="font-mono text-[11px] text-sky-400">
                网卡: {serviceStatus.tun_interface}
              </span>
            )}
          </div>
        </div>

        {/* Card 3: CPU Usage */}
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>内核 CPU 占用</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-100">
              {(serviceStatus?.cpu_usage ?? 0).toFixed(1)}%
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(serviceStatus?.cpu_usage ?? 0, 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Card 4: Memory Usage */}
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>内存消耗</span>
            <HardDrive className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-100">
              {formatBytes(serviceStatus?.memory_bytes ?? 0)}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-400">
            <span>sing-box 进程常驻内存</span>
          </div>
        </div>
      </div>

      {/* Main Row: Running Config & Site Probes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 cols: Running Profile / Simple Mode Status */}
        <div className="lg:col-span-2 glass-panel p-6 space-y-5">
          {isSimpleMode ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>小白极简运行模式</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    小白模式下全局维护单一轻量配置，网络接管参数针对当前宿主平台（
                    <span className="font-medium text-slate-200">
                      {hostOs.toUpperCase()}
                    </span>
                    ）全自动推荐与自适应。
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateTab("simple")}
                  iconRight={<ChevronRight className="w-3.5 h-3.5" />}
                >
                  分流策略设置
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-slate-400">
                    分流与出口状态
                  </span>
                  <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>开箱即用 · 智能分流与自动测速</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    国内网站与 IP
                    自动直连，国外受限网站通过最优节点代理加速，自动拦截恶意广告。
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateTab("simple")}
                >
                  调整策略
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    本机运行配置绑定
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    sing-box 本地客户端仅能运行符合当前宿主操作系统（
                    <span className="font-medium text-slate-200">
                      {hostOs.toUpperCase()}
                    </span>
                    ）的配置文件。
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateTab("profiles")}
                  iconRight={<ChevronRight className="w-3.5 h-3.5" />}
                >
                  配置中心
                </Button>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-slate-400">
                      选择本机生效配置文件
                    </span>
                    <div className="w-full sm:w-72">
                      <Select
                        value={
                          runningProfile ? runningProfile.id.toString() : ""
                        }
                        disabled={switchingConfig}
                        onChange={handleSelectRunningConfig}
                        options={eligibleConfigs.map((c) => ({
                          value: c.id.toString(),
                          label: `${c.name} (${c.platform})`,
                          description: `版本: ${c.version_code}`,
                        }))}
                        placeholder="选择适用于本机的配置..."
                      />
                    </div>
                  </div>

                  {runningProfile && (
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant="success" dot size="md">
                        当前运行: {runningProfile.name}
                      </Badge>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Token: {String(runningProfile.token || "").slice(0, 8)}
                        ...
                      </span>
                    </div>
                  )}
                </div>

                {eligibleConfigs.length === 0 && (
                  <div className="p-4 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 text-xs text-amber-300 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <p className="font-medium">
                        未发现适用于 {hostOs.toUpperCase()} 平台的配置！
                      </p>
                      <p className="text-slate-400 mt-0.5">
                        请前往「配置中心」新建一份针对当前操作系统的配置文件，并设为本机运行。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right 1 col: Quick Connectivity Probe */}
        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  网络连通性探针
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                服务端本机直接连通性探测
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={siteTesting}
              onClick={handleRunSiteTest}
              icon={
                <RotateCw
                  className={`w-3.5 h-3.5 ${siteTesting ? "animate-spin text-sky-400" : ""}`}
                />
              }
            >
              测速探针
            </Button>
          </div>

          <div className="space-y-3">
            {probeSites.map((s) => {
              const st = siteStatuses[s.id];
              return (
                <div
                  key={s.id}
                  className="p-3 rounded-lg bg-slate-800/40 border border-slate-800/80 flex items-center justify-between text-xs transition-colors hover:border-slate-700"
                >
                  <div className="space-y-1 pr-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-200">
                        {s.name}
                      </span>
                    </div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-mono text-slate-400 hover:text-sky-400 flex items-center gap-1 transition-colors truncate"
                      title={s.url}
                    >
                      <span>{s.url}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                    </a>
                  </div>

                  <div className="shrink-0 flex items-center justify-end">
                    {!st || st.status === "idle" ? (
                      <span className="text-slate-500 text-[11px] px-2 py-0.5 rounded bg-slate-900/60">
                        未测试
                      </span>
                    ) : st.status === "testing" ? (
                      <span className="text-[11px] text-sky-400 font-medium flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                        <RotateCw className="w-3 h-3 animate-spin text-sky-400" />
                        <span>测速中...</span>
                      </span>
                    ) : st.status === "success" ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {st.latency_ms ?? 0} ms
                      </span>
                    ) : (
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 truncate max-w-[110px]"
                        title={st.error || "失败 / 超时"}
                      >
                        {st.error && st.error.length <= 10
                          ? st.error
                          : "超时 / 阻断"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed pt-1 border-t border-slate-800/60">
            💡
            由程序服务端宿主机直接发起探测，无论代理是否开启均可准确检测境外与境内网络的实际连通性与延迟。
          </p>
        </div>
      </div>
    </div>
  );
};
