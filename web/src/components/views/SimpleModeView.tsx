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

export const SimpleModeView: React.FC<SimpleModeViewProps> = ({ nodes = [] }) => {
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

  const currentMode = config?.route?.mode ?? "smart";
  const isDirectAll = currentMode === "direct_all";

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
      desc: "国内网站与 IP 自动直连，国外及被阻断流量走代理加速。最适合日常办公与娱乐。",
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
      <div className="p-8 text-center text-slate-500 text-sm">
        加载小白模式配置中...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header banner */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>小白极简模式 (Simple Mode)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            开箱即用，免除繁杂配置。选择 4 种智能分流策略之一，系统自动完成网卡适配与规则前置注入。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            loading={saving}
            onClick={() => handleSave(false)}
            icon={<Save className="w-4 h-4" />}
          >
            保存设置
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={saving}
            onClick={() => handleSave(true)}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            保存并应用
          </Button>
        </div>
      </div>

      {/* 4 Routing Mode Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">选择分流策略</h3>
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
                className={`p-5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "bg-sky-500/10 border-sky-500 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/50"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80"
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
              <span className="text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                <Lock className="w-3 h-3" />
                直连模式下已锁定
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400">选择分流走代理的出站出口</label>
            <Select
              disabled={isDirectAll}
              value={isDirectAll ? "direct" : config.route.default_outbound || "AUTO-Test"}
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
              <h3 className="text-sm font-semibold text-white">
                内置顶级优先级安全防护
              </h3>
            </div>
            <Badge variant="success" size="sm">
              优先保障
            </Badge>
          </div>

          <div className="space-y-3">
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
  );
};
