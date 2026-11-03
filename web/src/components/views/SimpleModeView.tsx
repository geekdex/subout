import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Zap,
  Globe2,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
  Server,
  Lock,
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
  nodes: NodeItem[];
}

export const SimpleModeView: React.FC<SimpleModeViewProps> = ({ nodes }) => {
  const [config, setConfig] = useState<SimpleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await api.getSimpleConfig();
      setConfig(cfg);
    } catch (err: unknown) {
      error("加载小白模式配置失败", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.saveSimpleConfig(config);
      success("小白模式配置已保存生效");
    } catch (err: unknown) {
      error("保存配置失败", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        加载配置中...
      </div>
    );
  }

  const isDirectAll = config.route.mode === "direct_all";

  const modes: Array<{
    id: SimpleConfig["route"]["mode"];
    title: string;
    desc: string;
    badge?: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "smart",
      title: "智能分流",
      desc: "国内域名与 IP 走直连；国外及被阻断流量走代理。最适合日常办公与流媒体。",
      badge: "推荐",
      icon: <Sparkles className="w-5 h-5 text-sky-400" />,
    },
    {
      id: "gfw",
      title: "GFW 列表代理",
      desc: "仅被防火墙阻断的境外域名走代理，国内与未受限国外流量均直连，最省流量。",
      icon: <Globe2 className="w-5 h-5 text-indigo-400" />,
    },
    {
      id: "global",
      title: "全部代理",
      desc: "所有非局域网流量全部转发至选中的代理出口节点，无国内分流。",
      icon: <Zap className="w-5 h-5 text-purple-400" />,
    },
    {
      id: "direct_all",
      title: "全部直连",
      desc: "所有流量均绕过代理直连网络，本地 Local DNS 解析，临时暂停翻墙无需退出服务。",
      badge: "出口锁定",
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
    },
  ];

  // Options for default outbound
  const outboundOptions = [
    {
      value: "AUTO-Test",
      label: "⚡ 自动测速优选 (AUTO-Test)",
      description: "挑选最低延迟节点",
    },
    { value: "proxy", label: "🔀 默认节点选择器 (proxy)" },
    { value: "direct", label: "🌐 始终直连 (direct)" },
    ...nodes.map((n) => ({
      value: n.tag,
      label: `📌 指定节点: ${n.tag} (${n.node_type})`,
      description: `${n.server}:${n.port}`,
    })),
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header banner */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>小白模式 (Simple Mode)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            无需繁复的 sing-box JSON 配置，4
            种智能分流策略一键切换，顶级优先级规则自动注入。
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          loading={saving}
          onClick={handleSave}
          icon={<CheckCircle2 className="w-4 h-4" />}
        >
          保存并应用
        </Button>
      </div>

      {/* 4 Routing Mode Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">分流策略模式</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {modes.map((m) => {
            const isSelected = config.route.mode === m.id;
            return (
              <div
                key={m.id}
                onClick={() =>
                  setConfig({
                    ...config,
                    route: { ...config.route, mode: m.id },
                  })
                }
                className={`p-5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "bg-sky-500/10 border-sky-500 shadow-lg shadow-sky-500/10"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    {m.icon}
                    <h4 className="text-sm font-bold text-white">{m.title}</h4>
                  </div>
                  {m.badge && (
                    <Badge variant={isSelected ? "info" : "neutral"} size="sm">
                      {m.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                  {m.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outbound & Priority Rules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Outbound Node Selector */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">
                出口节点选择策略
              </h3>
            </div>
            {isDirectAll && (
              <span className="text-[11px] text-amber-400 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                已在全部直连模式下锁定
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400">选择分流的代理出站</label>
            <Select
              disabled={isDirectAll}
              value={config.route.default_outbound}
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
                ? "全部直连模式下所有流量直接走本地网络，出站选择器强制锁定。"
                : "推荐使用「自动测速优选」，系统将以 gstatic 204 为目标自动探测最低延迟节点。"}
            </p>
          </div>
        </div>

        {/* Priority Rules Injection */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">
                最高优先级直出保护
              </h3>
            </div>
            <Badge variant="success" size="sm">
              强制前置
            </Badge>
          </div>

          <div className="space-y-3.5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200">
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
              <div>
                <span className="text-xs font-medium text-slate-200">
                  私有局域网直连 (LAN Bypass)
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 强制直连
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

      {/* Advanced Inbound / DNS Toggles */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-white">
              入站与 DNS 解析策略
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-slate-400">接管方式</label>
            <Select
              value={config.inbound.inbound_type}
              onChange={(val) =>
                setConfig({
                  ...config,
                  inbound: { ...config.inbound, inbound_type: val },
                })
              }
              options={[
                { value: "tun", label: "TUN 虚拟网卡 (全局透明代理，推荐)" },
                { value: "mixed", label: "Mixed 混合端口 (HTTP + SOCKS5)" },
              ]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400">DNS 预设方案</label>
            <Select
              value={config.dns.mode}
              onChange={(val) =>
                setConfig({ ...config, dns: { ...config.dns, mode: val } })
              }
              options={[
                {
                  value: "preset_fakeip",
                  label: "FakeIP 虚拟 IP 池 (防污染最强)",
                },
                {
                  value: "preset_domestic_foreign",
                  label: "国内阿里 223.5.5.5 + 国外 DoH 1.1.1.1",
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
