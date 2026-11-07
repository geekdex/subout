import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Zap,
  Globe2,
  ShieldCheck,
  CheckCircle2,
  Save,
  Server,
  Lock,
  ArrowRight,
  Activity,
  RotateCw,
  SlidersHorizontal,
  Check,
  Layers,
  Network,
  Info,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Input";
import { SimpleConfig, NodeItem, SystemInfo } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

interface SimpleModeViewProps {
  nodes?: NodeItem[];
  systemInfo?: SystemInfo;
}

const defaultSimpleConfig: SimpleConfig = {
  log: {
    level: "info",
    timestamp: true,
    disabled: false,
    output: "",
  },
  dns: {
    mode: "local_fakeip",
    domestic_dns: "local",
    foreign_dns: "fakeip",
  },
  inbound: {
    inbound_type: "tun",
    mixed_port: 2080,
    allow_lan: false,
    tun_stack: "system",
    tun_auto_route: true,
  },
  route: {
    mode: "smart",
    block_ads: true,
    bypass_lan: true,
    default_outbound: "AUTO-Test",
  },
};

export const SimpleModeView: React.FC<SimpleModeViewProps> = ({
  nodes = [],
  systemInfo: propSystemInfo,
}) => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | undefined>(
    propSystemInfo,
  );

  useEffect(() => {
    if (propSystemInfo) {
      setSystemInfo(propSystemInfo);
    } else if (typeof api?.getSystemInfo === "function") {
      api.getSystemInfo().then(setSystemInfo).catch(() => {});
    }
  }, [propSystemInfo]);

  const isLinux = systemInfo
    ? systemInfo.host_os === "linux" || systemInfo.is_linux === true
    : true;
  const osName = (
    systemInfo?.host_os || (systemInfo?.is_linux ? "linux" : "未知系统")
  ).toUpperCase();

  const [config, setConfig] = useState<SimpleConfig>(defaultSimpleConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  const safeNodes = Array.isArray(nodes) ? nodes : [];

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await api.getSimpleConfig();
      if (cfg && typeof cfg === "object") {
        setConfig({
          log: { ...defaultSimpleConfig.log, ...(cfg.log || {}) },
          dns: { ...defaultSimpleConfig.dns, ...(cfg.dns || {}) },
          inbound: {
            ...defaultSimpleConfig.inbound,
            ...(cfg.inbound || {}),
            tun_auto_route: isLinux
              ? ((cfg.inbound || {}).tun_auto_route ?? true)
              : false,
          },
          route: { ...defaultSimpleConfig.route, ...(cfg.route || {}) },
        });
      }
    } catch (err: unknown) {
      error("加载小白模式配置失败", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [error, isLinux]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async (apply: boolean) => {
    if (!config) return;
    setSaving(true);
    try {
      const payloadConfig: SimpleConfig = {
        ...config,
        inbound: {
          ...config.inbound,
          tun_auto_route: isLinux
            ? (config.inbound?.tun_auto_route ?? true)
            : false,
        },
      };
      await api.saveSimpleConfig(payloadConfig, apply);
      success(
        apply ? "小白模式配置已保存并生效" : "小白模式配置已保存",
        apply ? "sing-box 已热重载并应用最新分流规则" : undefined,
      );
    } catch (err: unknown) {
      error("保存配置失败", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const currentMode = config?.route?.mode ?? "smart";
  const isDirectAll = currentMode === "direct_all";
  const currentOutbound = isDirectAll
    ? "direct"
    : config?.route?.default_outbound || "AUTO-Test";

  const modes: Array<{
    id: SimpleConfig["route"]["mode"];
    title: string;
    desc: string;
    badge?: string;
    badgeVariant?: "success" | "warning" | "info" | "neutral";
    icon: React.ReactNode;
  }> = [
    {
      id: "smart",
      title: "智能分流",
      desc: "国内网站与 IP 自动直连，国外及被阻断流量走代理加速。最适合日常办公、学习与娱乐。",
      badge: "推荐",
      badgeVariant: "info",
      icon: <Sparkles className="w-5 h-5 text-sky-400" />,
    },
    {
      id: "gfw",
      title: "GFW 列表代理",
      desc: "仅被防火墙阻断的境外域名走代理，国内与未受限国外流量均直连，最省流量与服务器带宽。",
      badge: "省流量",
      badgeVariant: "neutral",
      icon: <Globe2 className="w-5 h-5 text-indigo-400" />,
    },
    {
      id: "global",
      title: "全部代理",
      desc: "所有非局域网流量全部转发至选中的代理出口节点，无国内分流。用于出海合规或完全海外环境。",
      badge: "全局出口",
      badgeVariant: "warning",
      icon: <Zap className="w-5 h-5 text-purple-400" />,
    },
    {
      id: "direct_all",
      title: "全部直连",
      desc: "所有流量均绕过代理直连网络，本地 Local DNS 解析，临时暂停翻墙无需退出客户端进程。",
      badge: "出口锁定",
      badgeVariant: "neutral",
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
    },
  ];

  // Options for default outbound
  const outboundOptions = [
    {
      value: "AUTO-Test",
      label: "⚡ 自动测速优选 (AUTO-Test)",
      description: "以 gstatic 204 为目标自动挑选最低延迟节点",
    },
    { value: "proxy", label: "🔀 默认节点选择器 (proxy)" },
    { value: "direct", label: "🌐 始终直连 (direct)" },
    ...safeNodes.map((n) => ({
      value: n.tag,
      label: `📌 指定节点: ${n.tag} (${n.node_type || "proxy"})`,
      description: `${n.server}:${n.port}`,
    })),
  ];

  // Inbound options & helpers
  const inboundType = config?.inbound?.inbound_type || "tun";
  const tunStack = config?.inbound?.tun_stack || "system";
  const mixedPort = config?.inbound?.mixed_port || 2080;
  const allowLan = config?.inbound?.allow_lan || false;
  const tunAutoRoute = isLinux
    ? (config?.inbound?.tun_auto_route ?? true)
    : false;

  // DNS options & helpers
  const dnsMode =
    config?.dns?.mode === "custom" ? "custom" : "local_fakeip";
  const domesticDns = config?.dns?.domestic_dns || "local";
  const foreignDns = config?.dns?.foreign_dns || "fakeip";

  // Domestic DNS Presets
  const domesticPreset =
    domesticDns === "223.5.5.5" || domesticDns.includes("alidns")
      ? "ali"
      : domesticDns === "119.29.29.29" ||
          domesticDns === "1.12.12.12" ||
          domesticDns.includes("dnspod") ||
          domesticDns.includes("doh.pub")
        ? "tencent"
        : "custom";

  // Foreign DNS Presets
  const foreignPreset =
    foreignDns === "8.8.8.8" || foreignDns.includes("dns.google")
      ? "google"
      : foreignDns === "1.1.1.1" || foreignDns.includes("cloudflare")
        ? "cloudflare"
        : "custom";

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm">
        <RotateCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-500" />
        加载小白模式配置中...
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Header banner */}
      <div className="glass-panel p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>小白极简模式 (Simple Mode)</span>
            </h2>
            <Badge variant="info" size="sm">
              即启即用
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
            开箱即用，免除繁杂配置。选择 4
            种智能分流策略之一，系统自动完成网卡适配与规则前置注入。
          </p>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
          <Button
            variant="secondary"
            size="md"
            loading={saving}
            onClick={() => handleSave(false)}
            icon={<Save className="w-4 h-4" />}
            className="flex-1 sm:flex-initial"
          >
            保存设置
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={saving}
            onClick={() => handleSave(true)}
            icon={<CheckCircle2 className="w-4 h-4" />}
            className="flex-1 sm:flex-initial"
          >
            保存并应用
          </Button>
        </div>
      </div>

      {/* Main Two-Column Layout for Desktop & Fluid Stacking for Mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column: Core Configuration Controls (8 cols on XL) */}
        <div className="xl:col-span-8 space-y-6">
          {/* 1. 4 Routing Mode Cards */}
          <div className="space-y-3 relative z-40">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                <span>选择分流策略</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                当前: {modes.find((m) => m.id === currentMode)?.title}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {modes.map((m) => {
                const isSelected = currentMode === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() =>
                      setConfig({
                        ...config,
                        route: { ...config.route, mode: m.id },
                      })
                    }
                    className={`p-5 rounded-xl border cursor-pointer transition-all relative overflow-hidden group ${
                      isSelected
                        ? "bg-sky-500/10 border-sky-500 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/50"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-0 right-0 w-8 h-8 overflow-hidden">
                        <div className="bg-sky-500 text-white w-12 h-12 transform rotate-45 translate-x-3 -translate-y-6 flex items-end justify-center pb-0.5">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      </div>
                    )}
                    <div className="flex items-start justify-between pr-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-2 rounded-lg transition-colors ${
                            isSelected
                              ? "bg-sky-500/20 text-sky-300"
                              : "bg-slate-800 text-slate-400 group-hover:text-slate-200"
                          }`}
                        >
                          {m.icon}
                        </div>
                        <h4 className="text-sm font-bold text-slate-100">
                          {m.title}
                        </h4>
                      </div>
                      {m.badge && (
                        <Badge
                          variant={
                            isSelected ? "info" : m.badgeVariant || "neutral"
                          }
                          size="sm"
                        >
                          {m.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                      {m.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Inbound Mode Configuration */}
          <div className="glass-panel p-5 space-y-4 relative z-30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  代理入站接入方式
                </h3>
              </div>
              <Badge
                variant={inboundType === "tun" ? "info" : "success"}
                size="sm"
              >
                {inboundType === "tun" ? "TUN 网卡模式" : "混合端口 (免提权)"}
              </Badge>
            </div>

            {/* Inbound Type Selector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option A: TUN Mode */}
              <div
                onClick={() =>
                  setConfig({
                    ...config,
                    inbound: { ...config.inbound, inbound_type: "tun" },
                  })
                }
                className={`p-4 rounded-xl border cursor-pointer transition-all relative ${
                  inboundType === "tun"
                    ? "bg-sky-500/10 border-sky-500 shadow-md shadow-sky-500/10 ring-1 ring-sky-500/50"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🛡️</span>
                    <span className="text-sm font-bold text-slate-100">
                      TUN 虚拟网卡 (默认)
                    </span>
                  </div>
                  <Badge variant="info" size="sm">
                    全局接管
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  系统虚拟网卡接管操作系统底层所有流量，所有应用程序均免配置代理，启动需要管理员/root提权。
                </p>
              </div>

              {/* Option B: Mixed Port Mode */}
              <div
                onClick={() =>
                  setConfig({
                    ...config,
                    inbound: { ...config.inbound, inbound_type: "mixed" },
                  })
                }
                className={`p-4 rounded-xl border cursor-pointer transition-all relative ${
                  inboundType === "mixed"
                    ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/50"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <span className="text-sm font-bold text-slate-100">
                      混合代理端口 (备选)
                    </span>
                  </div>
                  <Badge variant="success" size="sm">
                    免提权
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  提供本地 HTTP 与 SOCKS5 混合代理服务端口，完全无需管理员或
                  root 权限即可稳定启动，适合无提权环境与容器部署。
                </p>
              </div>
            </div>

            {/* Inbound Details Sub-form */}
            {inboundType === "tun" ? (
              <div className="pt-2 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* TUN Stack Type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 block">
                      TUN 堆栈类型 (TUN Stack)
                    </label>
                    <Select
                      value={tunStack}
                      onChange={(val) =>
                        setConfig({
                          ...config,
                          inbound: { ...config.inbound, tun_stack: val },
                        })
                      }
                      options={[
                        {
                          value: "system",
                          label: "System (系统网络协议栈 - 推荐)",
                          description: "直接调用操作系统内核网络协议栈，性能优异，开销低",
                        },
                        {
                          value: "gvisor",
                          label: "gVisor (用户态沙盒协议栈)",
                          description: "Google 用户态网络协议栈，跨平台隔离兼容性极高",
                        },
                        {
                          value: "mixed",
                          label: "Mixed (混合网络协议栈)",
                          description: "TCP 使用系统网络栈，UDP 使用 gVisor 协议栈",
                        },
                      ]}
                    />
                  </div>

                  {/* Mixed Port */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 block">
                      辅助混合代理端口 (Mixed Port)
                    </label>
                    <Input
                      type="number"
                      min={1024}
                      max={65535}
                      value={mixedPort}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          inbound: {
                            ...config.inbound,
                            mixed_port: parseInt(e.target.value, 10) || 2080,
                          },
                        })
                      }
                      placeholder="2080"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isLinux
                        ? "bg-slate-800/40 border-slate-800"
                        : "bg-slate-900/40 border-slate-800/60 opacity-80"
                    }`}
                  >
                    <div className="pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-200 block">
                          TUN 自动配置路由 (Auto Route)
                        </span>
                        {!isLinux && (
                          <Badge variant="warning" size="sm">
                            仅限 Linux
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        {isLinux
                          ? "自动接管默认网关路由表，免手动设置网络接口"
                          : `Auto Route 仅在 Linux 平台受支持；当前系统（${osName}）已禁用，不可开启`}
                      </p>
                    </div>
                    <Switch
                      disabled={!isLinux}
                      checked={tunAutoRoute}
                      onChange={(checked) => {
                        if (!isLinux) return;
                        setConfig({
                          ...config,
                          inbound: {
                            ...config.inbound,
                            tun_auto_route: checked,
                          },
                        });
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div>
                      <span className="text-xs font-medium text-slate-200 block">
                        允许局域网设备连接 (Allow LAN)
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        监听 0.0.0.0，供局域网内其他设备连接代理
                      </p>
                    </div>
                    <Switch
                      checked={allowLan}
                      onChange={(checked) =>
                        setConfig({
                          ...config,
                          inbound: { ...config.inbound, allow_lan: checked },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-2 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 block">
                      本地混合代理监听端口 (HTTP / SOCKS5)
                    </label>
                    <Input
                      type="number"
                      min={1024}
                      max={65535}
                      value={mixedPort}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          inbound: {
                            ...config.inbound,
                            mixed_port: parseInt(e.target.value, 10) || 2080,
                          },
                        })
                      }
                      placeholder="2080"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800 h-10 self-end">
                    <span className="text-xs font-medium text-slate-200 block">
                      允许局域网其他设备连接 (Allow LAN)
                    </span>
                    <Switch
                      checked={allowLan}
                      onChange={(checked) =>
                        setConfig({
                          ...config,
                          inbound: { ...config.inbound, allow_lan: checked },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-300 flex items-start gap-2.5">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <div className="leading-relaxed">
                    <span className="font-semibold text-emerald-200 block">
                      免提权运行模式已就绪
                    </span>
                    当前配置不创建虚拟网卡，普通用户即可无 root 密码平滑启动
                    sing-box。可在终端配置{" "}
                    <code className="px-1.5 py-0.5 rounded bg-emerald-950/60 font-mono text-[11px] text-emerald-300">
                      export http_proxy=http://127.0.0.1:{mixedPort}
                    </code>{" "}
                    或在浏览器插件中配置对应端口。
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. DNS Configuration */}
          <div className="glass-panel p-5 space-y-4 relative z-20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  DNS 解析策略
                </h3>
              </div>
              <Badge
                variant={dnsMode === "local_fakeip" ? "info" : "neutral"}
                size="sm"
              >
                {dnsMode === "local_fakeip"
                  ? "LocalDNS + FakeIP (默认)"
                  : "自定义 DNS"}
              </Badge>
            </div>

            {/* DNS Mode Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option A: LocalDNS + FakeIP */}
              <div
                onClick={() =>
                  setConfig({
                    ...config,
                    dns: {
                      ...config.dns,
                      mode: "local_fakeip",
                      domestic_dns: "local",
                      foreign_dns: "fakeip",
                    },
                  })
                }
                className={`p-4 rounded-xl border cursor-pointer transition-all relative ${
                  dnsMode === "local_fakeip"
                    ? "bg-sky-500/10 border-sky-500 shadow-md shadow-sky-500/10 ring-1 ring-sky-500/50"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🚀</span>
                    <span className="text-sm font-bold text-slate-100">
                      LocalDNS + FakeIP (默认)
                    </span>
                  </div>
                  <Badge variant="info" size="sm">
                    推荐 / 最快
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  国内域名走本地 LocalDNS 直连解析，国外域名走 FakeIP
                  虚拟解析，杜绝 DNS 污染且建连速度最快。
                </p>
              </div>

              {/* Option B: Custom DNS */}
              <div
                onClick={() =>
                  setConfig({
                    ...config,
                    dns: {
                      ...config.dns,
                      mode: "custom",
                      domestic_dns:
                        domesticDns === "local" ? "223.5.5.5" : domesticDns,
                      foreign_dns:
                        foreignDns === "fakeip" ? "8.8.8.8" : foreignDns,
                    },
                  })
                }
                className={`p-4 rounded-xl border cursor-pointer transition-all relative ${
                  dnsMode === "custom"
                    ? "bg-sky-500/10 border-sky-500 shadow-md shadow-sky-500/10 ring-1 ring-sky-500/50"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚙️</span>
                    <span className="text-sm font-bold text-slate-100">
                      自定义 DNS (Custom)
                    </span>
                  </div>
                  <Badge variant="neutral" size="sm">
                    自由配置
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  国内可自选阿里、腾讯或自行填写；国外可自选谷歌、Cloudflare
                  或自行填写，满足专用解析需求。
                </p>
              </div>
            </div>

            {/* Custom DNS Form */}
            {dnsMode === "custom" && (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-slate-800/80">
                {/* Domestic DNS Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200">
                      国内 DNS 服务器 (Domestic DNS)
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {domesticDns}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={domesticPreset === "ali" ? "primary" : "secondary"}
                      onClick={() =>
                        setConfig({
                          ...config,
                          dns: { ...config.dns, domestic_dns: "223.5.5.5" },
                        })
                      }
                      className="text-xs flex-1"
                    >
                      阿里 DNS
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        domesticPreset === "tencent" ? "primary" : "secondary"
                      }
                      onClick={() =>
                        setConfig({
                          ...config,
                          dns: { ...config.dns, domestic_dns: "119.29.29.29" },
                        })
                      }
                      className="text-xs flex-1"
                    >
                      腾讯 DNS
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        domesticPreset === "custom" ? "primary" : "secondary"
                      }
                      onClick={() => {
                        if (domesticPreset !== "custom") {
                          setConfig({
                            ...config,
                            dns: { ...config.dns, domestic_dns: "" },
                          });
                        }
                      }}
                      className="text-xs flex-1"
                    >
                      自行填写
                    </Button>
                  </div>

                  {domesticPreset === "custom" && (
                    <div className="pt-1">
                      <Input
                        value={domesticDns}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            dns: {
                              ...config.dns,
                              domestic_dns: e.target.value.trim(),
                            },
                          })
                        }
                        placeholder="例如 223.5.5.5 或 https://223.5.5.5/dns-query"
                      />
                    </div>
                  )}
                </div>

                {/* Foreign DNS Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200">
                      国外 DNS 服务器 (Foreign DNS)
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {foreignDns}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={
                        foreignPreset === "google" ? "primary" : "secondary"
                      }
                      onClick={() =>
                        setConfig({
                          ...config,
                          dns: { ...config.dns, foreign_dns: "8.8.8.8" },
                        })
                      }
                      className="text-xs flex-1"
                    >
                      谷歌 DNS
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        foreignPreset === "cloudflare"
                          ? "primary"
                          : "secondary"
                      }
                      onClick={() =>
                        setConfig({
                          ...config,
                          dns: { ...config.dns, foreign_dns: "1.1.1.1" },
                        })
                      }
                      className="text-xs flex-1"
                    >
                      Cloudflare
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        foreignPreset === "custom" ? "primary" : "secondary"
                      }
                      onClick={() => {
                        if (foreignPreset !== "custom") {
                          setConfig({
                            ...config,
                            dns: { ...config.dns, foreign_dns: "" },
                          });
                        }
                      }}
                      className="text-xs flex-1"
                    >
                      自行填写
                    </Button>
                  </div>

                  {foreignPreset === "custom" && (
                    <div className="pt-1">
                      <Input
                        value={foreignDns}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            dns: {
                              ...config.dns,
                              foreign_dns: e.target.value.trim(),
                            },
                          })
                        }
                        placeholder="例如 8.8.8.8 或 https://8.8.8.8/dns-query"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. Outbound & Priority Rules (Grid 2 cols on Left Area) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            {/* Outbound Node Selector */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    出口节点选择策略
                  </h3>
                </div>
                {isDirectAll && (
                  <span className="text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                    <Lock className="w-3 h-3" />
                    直连模式下已锁定
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">
                  选择分流走代理的出站出口
                </label>
                <Select
                  disabled={isDirectAll}
                  value={
                    isDirectAll
                      ? "direct"
                      : config.route.default_outbound || "AUTO-Test"
                  }
                  onChange={(val) =>
                    setConfig({
                      ...config,
                      route: { ...config.route, default_outbound: val },
                    })
                  }
                  options={outboundOptions}
                  searchable
                />
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  {isDirectAll
                    ? "在「全部直连」模式下，所有流量直接绕过代理走本地网络，出站策略自动锁定为 direct。"
                    : "推荐保持「⚡ 自动测速优选」，系统将自动从可用节点池中测速并切换最低延迟节点。"}
                </p>
              </div>
            </div>

            {/* Priority Rules Injection */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    内置顶级优先级安全防护
                  </h3>
                </div>
                <Badge variant="success" size="sm">
                  优先保障
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
                  <div className="pr-2">
                    <span className="text-xs font-medium text-slate-200 block">
                      广告与恶意追踪拦截
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      基于 geosite-category-ads-all 拦截，DNS 立即返回 NOERROR
                    </p>
                  </div>
                  <Switch
                    disabled={isDirectAll}
                    checked={config.route.block_ads}
                    onChange={(checked) =>
                      setConfig({
                        ...config,
                        route: { ...config.route, block_ads: checked },
                      })
                    }
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
                  <div className="pr-2">
                    <span className="text-xs font-medium text-slate-200 block">
                      局域网私有地址直连 (LAN Bypass)
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 自动绕过代理直连
                    </p>
                  </div>
                  <Switch
                    disabled={isDirectAll}
                    checked={config.route.bypass_lan}
                    onChange={(checked) =>
                      setConfig({
                        ...config,
                        route: { ...config.route, bypass_lan: checked },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Routing Topology & Specification (4 cols on XL) */}
        <div className="xl:col-span-4 space-y-6">
          {/* Visual Routing Topology */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  实时流量分流拓扑
                </h3>
              </div>
              <Badge variant="info" size="sm">
                动态计算
              </Badge>
            </div>

            <div className="space-y-3">
              {/* Route 1: China Traffic */}
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🇨🇳</span>
                  <div>
                    <span className="text-slate-200 font-medium block">
                      大陆网站与 IP
                    </span>
                    <span className="text-[10px] text-slate-500">
                      geosite:cn, geoip:cn
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-right font-mono">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      currentMode === "global"
                        ? "bg-purple-500/20 text-purple-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {currentMode === "global" ? "代理出口" : "直连 direct"}
                  </span>
                </div>
              </div>

              {/* Route 2: Foreign Traffic */}
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🌐</span>
                  <div>
                    <span className="text-slate-200 font-medium block">
                      境外/受限流量
                    </span>
                    <span className="text-[10px] text-slate-500 truncate max-w-[110px] block">
                      出口: {currentOutbound}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-right font-mono">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      isDirectAll
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-sky-500/20 text-sky-300"
                    }`}
                  >
                    {isDirectAll ? "直连 direct" : currentOutbound}
                  </span>
                </div>
              </div>

              {/* Route 3: Ads Block */}
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🛑</span>
                  <div>
                    <span className="text-slate-200 font-medium block">
                      广告与隐私追踪
                    </span>
                    <span className="text-[10px] text-slate-500">
                      category-ads-all
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-right font-mono">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      config.route.block_ads && !isDirectAll
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {config.route.block_ads && !isDirectAll
                      ? "拦截 reject"
                      : "未开启"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* DNS & Security Spec */}
          <div className="glass-panel p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                DNS 与入站规约
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  DNS 解析策略
                </span>
                <span className="text-slate-200 font-mono font-medium truncate block">
                  {dnsMode === "local_fakeip" ? "LocalDNS+FakeIP" : "自定义解析"}
                </span>
              </div>
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  国内 DNS
                </span>
                <span className="text-slate-200 font-mono font-medium truncate block">
                  {domesticDns === "local" ? "LocalDNS (系统)" : domesticDns}
                </span>
              </div>
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  入站接入方式
                </span>
                <span className="text-sky-400 font-mono font-medium truncate block">
                  {inboundType === "mixed"
                    ? `Mixed (:${mixedPort})`
                    : `TUN (${tunStack})`}
                </span>
              </div>
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  国外 DNS
                </span>
                <span className="text-slate-200 font-mono font-medium truncate block">
                  {foreignDns === "fakeip" ? "FakeIP 虚拟分配" : foreignDns}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
