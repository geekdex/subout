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
} from "lucide-react";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { Badge } from "../ui/Badge";
import { SimpleConfig, NodeItem } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

interface SimpleModeViewProps {
  nodes?: NodeItem[];
}

const defaultSimpleConfig: SimpleConfig = {
  log: {
    level: "info",
    timestamp: true,
    disabled: false,
    output: "",
  },
  dns: {
    mode: "preset_fakeip",
    domestic_dns: "223.5.5.5",
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
}) => {
  const [config, setConfig] = useState<SimpleConfig>(defaultSimpleConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteTesting, setSiteTesting] = useState(false);
  const [siteResults, setSiteResults] = useState<{
    [site: string]: number | null;
  }>({});
  const { success, error } = useToast();

  const safeNodes = Array.isArray(nodes) ? nodes : [];

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await api.getSimpleConfig();
      if (cfg && typeof cfg === "object") {
        setConfig({
          log: { ...defaultSimpleConfig.log, ...(cfg.log || {}) },
          dns: { ...defaultSimpleConfig.dns, ...(cfg.dns || {}) },
          inbound: { ...defaultSimpleConfig.inbound, ...(cfg.inbound || {}) },
          route: { ...defaultSimpleConfig.route, ...(cfg.route || {}) },
        });
      }
    } catch (err: unknown) {
      error("加载小白模式配置失败", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async (apply: boolean) => {
    if (!config) return;
    setSaving(true);
    try {
      await api.saveSimpleConfig(config, apply);
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

  const handleRunSiteTest = async () => {
    setSiteTesting(true);
    const sites = [
      { name: "Baidu (国内直连)", host: "www.baidu.com" },
      { name: "Cloudflare (全球CDN)", host: "1.1.1.1" },
      { name: "Google (境外加速)", host: "www.google.com" },
      { name: "GitHub (开发者库)", host: "github.com" },
    ];

    const testSite = async (site: { name: string; host: string }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const start = Date.now();
      try {
        await fetch(`https://${site.host}/favicon.ico`, {
          mode: "no-cors",
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timer);
        return { name: site.name, latency: Date.now() - start };
      } catch {
        clearTimeout(timer);
        return { name: site.name, latency: 0 };
      }
    };

    const testResults = await Promise.all(sites.map(testSite));
    const results: { [site: string]: number | null } = {};
    for (const r of testResults) {
      results[r.name] = r.latency;
    }
    setSiteResults(results);
    setSiteTesting(false);
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
          {/* 4 Routing Mode Cards */}
          <div className="space-y-3">
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

          {/* Outbound & Priority Rules (Grid 2 cols on Left Area) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        {/* Right Column: Routing Topology & Real-time Network Probe (4 cols on XL) */}
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
                      ? "拦截 block"
                      : "未开启"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Live Network Probe */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  网络连通性一键测速
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                loading={siteTesting}
                onClick={handleRunSiteTest}
                icon={<RotateCw className="w-3.5 h-3.5" />}
              >
                测速
              </Button>
            </div>

            <div className="space-y-2.5">
              {[
                { name: "Baidu (国内直连)", key: "Baidu (国内直连)" },
                { name: "Cloudflare (全球CDN)", key: "Cloudflare (全球CDN)" },
                { name: "Google (境外加速)", key: "Google (境外加速)" },
                { name: "GitHub (开发者库)", key: "GitHub (开发者库)" },
              ].map((site) => {
                const latency = siteResults[site.key];
                return (
                  <div
                    key={site.key}
                    className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80"
                  >
                    <span className="text-slate-300">{site.name}</span>
                    <span className="font-mono text-xs">
                      {latency === undefined || latency === null ? (
                        <span className="text-slate-500">未测试</span>
                      ) : latency === 0 ? (
                        <span className="text-rose-400 font-medium">
                          超时/阻断
                        </span>
                      ) : (
                        <span
                          className={`font-semibold ${
                            latency < 120
                              ? "text-emerald-400"
                              : latency < 350
                                ? "text-amber-400"
                                : "text-rose-400"
                          }`}
                        >
                          {latency} ms
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              通过浏览器直接请求常用探测节点，验证分流策略是否生效。
            </p>
          </div>

          {/* DNS & Security Spec */}
          <div className="glass-panel p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                DNS 与内核规约
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  DNS 解析
                </span>
                <span className="text-slate-200 font-mono font-medium">
                  FakeIP 防污染
                </span>
              </div>
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  国内 DNS
                </span>
                <span className="text-slate-200 font-mono font-medium">
                  {config.dns.domestic_dns || "223.5.5.5"}
                </span>
              </div>
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  接入模式
                </span>
                <span className="text-sky-400 font-mono font-medium">
                  {config.inbound.inbound_type === "mixed"
                    ? `Mixed (:${config.inbound.mixed_port || 2080})`
                    : "TUN 虚拟网卡"}
                </span>
              </div>
              <div className="p-2.5 rounded bg-slate-950/40 border border-slate-800">
                <span className="text-[11px] text-slate-500 block">
                  路由内核
                </span>
                <span className="text-slate-200 font-mono font-medium">
                  sing-box 1.14+
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
