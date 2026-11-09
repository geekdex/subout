import React, { useState } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Globe,
  Server,
  Shield,
  Sliders,
  Sparkles,
  Network,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Wand2,
  Search,
} from "lucide-react";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";
import { PlatformType, NodeGroup, NodeItem } from "../../../types/api";
import {
  SingBoxVisualConfig,
  RuleSetItem,
  DnsServerItem,
  InboundItem,
  OutboundItem,
  RouteRuleItem,
  DnsRuleItem,
  OFFICIAL_RULE_SET_PRESETS,
  collectMissingRuleSetTags,
  ensureRuleSetsInConfig,
  ensureDnsServers,
} from "./types";
import { TagListInput } from "./TagListInput";
import { CollapsibleToolbar } from "./CollapsibleToolbar";
import { RuleTreeEditor } from "./RuleTreeEditor";

function moveArrayItem<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
  if (toIdx < 0 || toIdx >= arr.length || fromIdx === toIdx) return arr;
  const next = [...arr];
  const [removed] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, removed);
  return next;
}

/* ============================================================================
 * 1. Route & Rule Sets Tab (Top Collapsible Toolbar + Bottom Reorderable Lists)
 * ========================================================================== */
interface RouteTabPanelProps {
  platform: PlatformType;
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  outboundTags: string[];
  dnsServerTags: string[];
  inboundTags: string[];
  httpClientTags: string[];
}

export const RouteTabPanel: React.FC<RouteTabPanelProps> = ({
  platform,
  config,
  onChange,
  outboundTags,
  dnsServerTags,
  inboundTags,
  httpClientTags,
}) => {
  const route = config.route || {};
  const rules: RouteRuleItem[] = Array.isArray(route.rules) ? route.rules : [];
  const ruleSets: RuleSetItem[] = Array.isArray(route.rule_set)
    ? route.rule_set
    : [];

  const defaultTargetTag =
    outboundTags.find((t) => t !== "direct") || outboundTags[0] || "proxy";

  const missingRuleSetTags = React.useMemo(
    () => collectMissingRuleSetTags(config),
    [config],
  );

  const updateRoute = (patch: Record<string, unknown>) => {
    const nextRoute: Record<string, unknown> = { ...route, ...patch };
    for (const [k, v] of Object.entries(nextRoute)) {
      if (v === undefined || v === "") delete nextRoute[k];
    }
    onChange({ ...config, route: nextRoute as SingBoxVisualConfig["route"] });
  };

  const appendRouteRule = (
    newRule: RouteRuleItem,
    extraRuleSets?: string[],
  ) => {
    const nextConfig = {
      ...config,
      route: {
        ...route,
        rules: [...rules, newRule],
      },
    };
    if (extraRuleSets && extraRuleSets.length > 0) {
      onChange(
        ensureRuleSetsInConfig(nextConfig, extraRuleSets, defaultTargetTag),
      );
    } else {
      onChange(nextConfig);
    }
  };

  const addRuleSet = (preset?: { tag: string; url: string }) => {
    const tag = preset?.tag || `ruleset-${ruleSets.length + 1}`;
    if (ruleSets.some((r) => r.tag === tag)) return;
    const defaultClient = httpClientTags.includes("proxy")
      ? "proxy"
      : undefined;
    const nextItem: RuleSetItem = {
      type: "remote",
      tag,
      format: "binary",
      url:
        preset?.url ||
        `https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/${tag}.srs`,
      ...(defaultClient ? { http_client: defaultClient } : {}),
    };
    updateRoute({ rule_set: [...ruleSets, nextItem] });
  };

  const handleAutoCompleteMissingRuleSets = () => {
    if (missingRuleSetTags.length === 0) return;
    const nextConfig = ensureRuleSetsInConfig(
      config,
      missingRuleSetTags,
      defaultTargetTag,
    );
    onChange(nextConfig);
  };

  const updateRuleSetAt = (idx: number, nextItem: RuleSetItem) => {
    const next = [...ruleSets];
    next[idx] = nextItem;
    updateRoute({ rule_set: next });
  };

  const removeRuleSetAt = (idx: number) => {
    updateRoute({
      rule_set: ruleSets.filter((_, i) => i !== idx),
    });
  };

  const moveRuleSetTo = (fromIdx: number, toIdx: number) => {
    updateRoute({
      rule_set: moveArrayItem(ruleSets, fromIdx, toIdx),
    });
  };

  const resolverStr =
    typeof route.default_domain_resolver === "string"
      ? route.default_domain_resolver
      : "";

  const ruleSetTags = ruleSets.map((r) => r.tag).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* TOP PANE: Collapsible Shortcut Toolbar */}
      <CollapsibleToolbar
        title="路由分流与规则集工具箱"
        subtitle="点击下方快捷键可一键向当前配置追加分流规则、单层/双层嵌套逻辑结构或远程规则集"
        headerActions={
          missingRuleSetTags.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleAutoCompleteMissingRuleSets}
              icon={<Wand2 className="w-3.5 h-3.5" />}
            >
              一键补齐已引用规则集 ({missingRuleSetTags.length})
            </Button>
          ) : undefined
        }
      >
        {/* Row 1: Core Rule Structure Builders */}
        <div className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-300 mr-1">
            添加规则结构:
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              appendRouteRule({
                domain_suffix: [".example.com"],
                outbound: defaultTargetTag,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增普通规则
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appendRouteRule(
                {
                  type: "logical",
                  mode: "or",
                  outbound: "direct",
                  rules: [
                    { rule_set: ["geosite-cn"] },
                    { rule_set: ["geoip-cn"] },
                  ],
                },
                ["geosite-cn", "geoip-cn"],
              )
            }
            icon={<GitBranch className="w-3.5 h-3.5 text-sky-400" />}
          >
            新增单层逻辑组合 (AND/OR)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appendRouteRule(
                {
                  type: "logical",
                  mode: "and",
                  outbound: defaultTargetTag,
                  rules: [
                    { network: ["tcp", "udp"] },
                    {
                      type: "logical",
                      mode: "or",
                      rules: [
                        {
                          rule_set: [
                            "geosite-google",
                            "geosite-github",
                            "geosite-openai",
                          ],
                        },
                        { domain_suffix: [".io", ".dev", ".ai", ".app"] },
                        { domain: ["claude.ai"] },
                      ],
                    },
                  ],
                },
                ["geosite-google", "geosite-github", "geosite-openai"],
              )
            }
            icon={<GitBranch className="w-3.5 h-3.5 text-indigo-400" />}
          >
            新增双层嵌套逻辑规则
          </Button>
          <button
            type="button"
            onClick={() => {
              const localResolver =
                dnsServerTags.find((t) => t.includes("local")) ||
                dnsServerTags[0] ||
                undefined;
              updateRoute({
                rules: [
                  ...rules,
                  { action: "sniff" },
                  { protocol: ["dns"], action: "hijack-dns" },
                  { ip_is_private: true, outbound: "direct" },
                ],
                auto_detect_interface: true,
                ...(localResolver
                  ? { default_domain_resolver: localResolver }
                  : {}),
              });
            }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 transition-colors"
          >
            ★ 官方客户端：基础 TUN 路由三件套
          </button>
          <button
            type="button"
            onClick={() => {
              const nextRuleSets = [...ruleSets];
              for (const preset of [
                {
                  tag: "geoip-cn",
                  url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
                },
                {
                  tag: "geosite-geolocation-cn",
                  url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-cn.srs",
                },
                {
                  tag: "geosite-geolocation-!cn",
                  url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-!cn.srs",
                },
              ]) {
                if (!nextRuleSets.some((r) => r.tag === preset.tag)) {
                  nextRuleSets.push({
                    type: "remote",
                    tag: preset.tag,
                    format: "binary",
                    url: preset.url,
                  });
                }
              }
              updateRoute({
                rules: [
                  ...rules,
                  { action: "sniff" },
                  {
                    type: "logical",
                    mode: "or",
                    rules: [{ protocol: ["dns"] }, { port: [53] }],
                    action: "hijack-dns",
                  },
                  { ip_is_private: true, outbound: "direct" },
                  {
                    type: "logical",
                    mode: "or",
                    rules: [
                      { port: [853] },
                      { network: ["udp"], port: [443] },
                      { protocol: ["stun"] },
                    ],
                    action: "reject",
                  },
                  {
                    rule_set: ["geosite-geolocation-cn"],
                    outbound: "direct",
                  },
                  {
                    type: "logical",
                    mode: "and",
                    rules: [
                      { rule_set: ["geoip-cn"] },
                      {
                        rule_set: ["geosite-geolocation-!cn"],
                        invert: true,
                      },
                    ],
                    outbound: "direct",
                  },
                ],
                rule_set: nextRuleSets,
                final: defaultTargetTag,
                auto_detect_interface: true,
              });
            }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition-colors"
          >
            ★ 官方客户端：中国大陆防泄漏分流规则组
          </button>
        </div>

        {/* Row 2: Best-Practice Route Rule Presets */}
        <div className="flex flex-wrap items-center gap-1.5 pb-2.5 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            常用分流规则快捷键:
          </span>
          <button
            type="button"
            onClick={() => appendRouteRule({ action: "sniff" })}
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + 协议嗅探 (sniff)
          </button>
          <button
            type="button"
            onClick={() =>
              appendRouteRule({
                protocol: ["dns"],
                action: "hijack-dns",
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + DNS 流量劫持 (hijack-dns)
          </button>
          <button
            type="button"
            onClick={() =>
              appendRouteRule(
                {
                  rule_set: ["geosite-category-ads-all"],
                  action: "reject",
                },
                ["geosite-category-ads-all"],
              )
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + 广告拦截 (reject)
          </button>
          <button
            type="button"
            onClick={() =>
              appendRouteRule({
                ip_is_private: true,
                outbound: "direct",
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + 局域网私有 IP 直连
          </button>
          <button
            type="button"
            onClick={() =>
              appendRouteRule(
                {
                  rule_set: ["geosite-cn", "geoip-cn"],
                  outbound: "direct",
                },
                ["geosite-cn", "geoip-cn"],
              )
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + 国内域名/IP 直连 (geosite-cn + geoip-cn)
          </button>
          <button
            type="button"
            onClick={() =>
              appendRouteRule(
                {
                  rule_set: ["geosite-geolocation-!cn"],
                  outbound: defaultTargetTag,
                },
                ["geosite-geolocation-!cn"],
              )
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + 非中国大陆走代理 (!cn)
          </button>
          {platform === "android" ? (
            <button
              type="button"
              onClick={() =>
                appendRouteRule({
                  package_name: [
                    "org.telegram.messenger",
                    "com.android.chrome",
                  ],
                  outbound: defaultTargetTag,
                })
              }
              className="px-2 py-1 rounded-md text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 transition-colors"
            >
              + Android 应用包名分流预设
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                appendRouteRule({
                  process_name: ["curl", "git"],
                  outbound: defaultTargetTag,
                })
              }
              className="px-2 py-1 rounded-md text-[11px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-500/30 transition-colors"
            >
              + 桌面进程分流预设 (process_name)
            </button>
          )}
        </div>

        {/* Row 3: Official Rule-Set Quick Add Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-300 mr-1">
            一键添加规则集 (rule_set):
          </span>
          <button
            type="button"
            onClick={() => addRuleSet()}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/20 text-sky-200 border border-sky-500/40 hover:bg-sky-500/30"
          >
            + 自定义规则集
          </button>
          {OFFICIAL_RULE_SET_PRESETS.map((preset) => {
            const exists = ruleSets.some((r) => r.tag === preset.tag);
            return (
              <button
                key={preset.tag}
                type="button"
                disabled={exists}
                onClick={() => addRuleSet(preset)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
                  exists
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                    : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-sky-500/50 hover:text-sky-300"
                }`}
                title={preset.label}
              >
                {exists ? `✓ ${preset.tag}` : `+ ${preset.tag}`}
              </button>
            );
          })}
        </div>
      </CollapsibleToolbar>

      {/* BOTTOM PANE: Global Route Options + Reorderable Route Rules + Rule Sets */}
      <div className="space-y-4">
        {/* Global Route Options Card (Direct Rendering) */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>路由全局基础参数 (route)</span>
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="默认兜底出站 (route.final)"
              value={route.final || ""}
              onChange={(val) => updateRoute({ final: val || undefined })}
              options={[
                { value: "", label: "未指定 (空)" },
                ...outboundTags.map((t) => ({
                  value: t,
                  label: t === "direct" ? "direct (直连)" : t,
                })),
                ...(route.final && !outboundTags.includes(route.final)
                  ? [{ value: route.final, label: route.final }]
                  : []),
              ]}
            />

            <Select
              label="默认域名解析器 (default_domain_resolver)"
              value={resolverStr}
              onChange={(val) =>
                updateRoute({ default_domain_resolver: val || undefined })
              }
              options={[
                { value: "", label: "未指定 (空)" },
                ...dnsServerTags.map((t) => ({ value: t, label: t })),
                ...(resolverStr && !dnsServerTags.includes(resolverStr)
                  ? [{ value: resolverStr, label: resolverStr }]
                  : []),
              ]}
            />

            <Select
              label="默认 HTTP 客户端 (default_http_client)"
              value={route.default_http_client || ""}
              onChange={(val) =>
                updateRoute({ default_http_client: val || undefined })
              }
              options={[
                { value: "", label: "未指定 (空)" },
                ...httpClientTags.map((t) => ({ value: t, label: t })),
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-300">
                自动检测网卡 (auto_detect_interface)
              </span>
              <Switch
                checked={Boolean(route.auto_detect_interface)}
                onChange={(val) =>
                  updateRoute({ auto_detect_interface: val || undefined })
                }
              />
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-300">
                查找本地进程 (find_process)
              </span>
              <Switch
                checked={Boolean(route.find_process)}
                onChange={(val) =>
                  updateRoute({ find_process: val || undefined })
                }
              />
            </div>

            {platform === "android" && (
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                <span className="text-xs text-slate-300">
                  接管 Android VPN (override_android_vpn)
                </span>
                <Switch
                  checked={Boolean(route.override_android_vpn)}
                  onChange={(val) =>
                    updateRoute({ override_android_vpn: val || undefined })
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Route Rules List (Reorderable + 2-Level Nested) */}
        <RuleTreeEditor
          kind="route"
          platform={platform}
          rules={rules}
          onChange={(nextRules) =>
            updateRoute({ rules: nextRules as RouteRuleItem[] })
          }
          outboundTags={outboundTags}
          dnsServerTags={dnsServerTags}
          inboundTags={inboundTags}
          ruleSetTags={ruleSetTags}
        />

        {/* Rule Set Reorderable List */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-bold text-slate-200">
                已配置规则集列表 (route.rule_set)
              </span>
              <Badge variant="neutral" size="sm">
                {ruleSets.length} 个
              </Badge>
            </div>
            {ruleSets.length > 0 && (
              <button
                type="button"
                onClick={() => updateRoute({ rule_set: [] })}
                className="px-2 py-1 rounded text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20"
              >
                清空规则集
              </button>
            )}
          </div>

          {ruleSets.length === 0 ? (
            <div className="p-5 rounded-lg bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
              当前未添加任何规则集。可在上方工具栏一键点选官方规则集或点击「一键补齐已引用规则集」。
            </div>
          ) : (
            <div className="space-y-2">
              {ruleSets.map((rs, idx) => (
                <div
                  key={`ruleset-${idx}`}
                  className="p-3 rounded-lg bg-slate-950/75 border border-slate-800/90 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                >
                  <div className="sm:col-span-3">
                    <Input
                      label={`#${idx + 1} 标签 (tag)`}
                      value={rs.tag || ""}
                      onChange={(e) =>
                        updateRuleSetAt(idx, { ...rs, tag: e.target.value })
                      }
                      placeholder="如: geosite-cn"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Select
                      label="类型 (type)"
                      value={rs.type || "remote"}
                      onChange={(val) =>
                        updateRuleSetAt(idx, {
                          ...rs,
                          type: val as RuleSetItem["type"],
                        })
                      }
                      options={[
                        { value: "remote", label: "远程 (remote)" },
                        { value: "local", label: "本地 (local)" },
                      ]}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Select
                      label="格式 (format)"
                      value={rs.format || "binary"}
                      onChange={(val) =>
                        updateRuleSetAt(idx, {
                          ...rs,
                          format: val as RuleSetItem["format"],
                        })
                      }
                      options={[
                        { value: "binary", label: "二进制 (.srs)" },
                        { value: "source", label: "源码 (.json)" },
                      ]}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    {rs.type === "local" ? (
                      <Input
                        label="本地路径 (path)"
                        value={rs.path || ""}
                        onChange={(e) =>
                          updateRuleSetAt(idx, {
                            ...rs,
                            path: e.target.value,
                            url: undefined,
                          })
                        }
                        placeholder="/etc/sing-box/ruleset.srs"
                      />
                    ) : (
                      <Input
                        label="远程地址 (url)"
                        value={rs.url || ""}
                        onChange={(e) =>
                          updateRuleSetAt(idx, {
                            ...rs,
                            url: e.target.value,
                            path: undefined,
                          })
                        }
                        placeholder="https://.../geosite-cn.srs"
                      />
                    )}
                  </div>
                  <div className="sm:col-span-2 flex items-center justify-end gap-1 pb-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveRuleSetTo(idx, idx - 1)}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                      title="上移"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === ruleSets.length - 1}
                      onClick={() => moveRuleSetTo(idx, idx + 1)}
                      className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                      title="下移"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRuleSetAt(idx)}
                      className="p-1.5 rounded text-rose-400 hover:text-rose-300"
                      title="删除规则集"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. DNS Tab (Top Collapsible Toolbar + Bottom Servers & Rules Reorderable Lists)
 * ========================================================================== */
interface DnsTabPanelProps {
  platform: PlatformType;
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  outboundTags: string[];
  inboundTags: string[];
  ruleSetTags: string[];
}

export const DnsTabPanel: React.FC<DnsTabPanelProps> = ({
  platform,
  config,
  onChange,
  outboundTags,
  inboundTags,
  ruleSetTags,
}) => {
  const dns = config.dns || {};
  const servers: DnsServerItem[] = Array.isArray(dns.servers)
    ? dns.servers
    : [];
  const rules: DnsRuleItem[] = Array.isArray(dns.rules) ? dns.rules : [];
  const serverTags = servers.map((s) => s.tag).filter(Boolean) as string[];
  const effectiveServerTags =
    serverTags.length > 0 ? serverTags : ["remote-dns", "local-dns"];

  const defaultProxyDetour =
    outboundTags.find((t) => t !== "direct") || "proxy";

  const missingRuleSetTags = React.useMemo(
    () => collectMissingRuleSetTags(config),
    [config],
  );

  const handleAutoCompleteMissingRuleSets = () => {
    if (missingRuleSetTags.length === 0) return;
    const nextConfig = ensureRuleSetsInConfig(
      config,
      missingRuleSetTags,
      defaultProxyDetour,
    );
    onChange(nextConfig);
  };

  const updateDns = (patch: Record<string, unknown>) => {
    const nextDns: Record<string, unknown> = { ...dns, ...patch };
    for (const [k, v] of Object.entries(nextDns)) {
      if (v === undefined || v === "") delete nextDns[k];
    }
    onChange({ ...config, dns: nextDns as SingBoxVisualConfig["dns"] });
  };

  const addServer = (preset?: Partial<DnsServerItem>) => {
    let tag = preset?.tag;
    if (!tag) {
      tag = `dns-${servers.length + 1}`;
    } else if (servers.some((s) => s.tag === tag)) {
      tag = `${tag}-${servers.length + 1}`;
    }
    const newServer: DnsServerItem = {
      type: "udp",
      server: "223.5.5.5",
      ...preset,
      tag,
    };
    if (newServer.type === "local" || newServer.type === "fakeip") {
      delete newServer.server;
    }
    const isLocalOrDirect =
      newServer.type === "local" || newServer.tag?.includes("local");
    const nextRoute = {
      ...(config.route || {}),
      ...(!config.route?.default_domain_resolver && isLocalOrDirect
        ? { default_domain_resolver: tag }
        : {}),
    };
    onChange({
      ...config,
      dns: {
        ...dns,
        servers: [...servers, newServer],
        ...(!dns.final ? { final: tag } : {}),
      },
      route: nextRoute,
    });
  };

  const updateServerAt = (idx: number, nextItem: DnsServerItem) => {
    const next = [...servers];
    next[idx] = nextItem;
    updateDns({ servers: next });
  };

  const removeServerAt = (idx: number) => {
    updateDns({ servers: servers.filter((_, i) => i !== idx) });
  };

  const moveServerTo = (fromIdx: number, toIdx: number) => {
    updateDns({ servers: moveArrayItem(servers, fromIdx, toIdx) });
  };

  const appendDnsRule = (
    newRule: DnsRuleItem,
    extraServers?: string[],
    extraRuleSets?: string[],
  ) => {
    let targetServerTag = newRule.server;
    if (!targetServerTag && (newRule.action === "route" || !newRule.action)) {
      targetServerTag =
        serverTags.find((t) => t.includes("local")) ||
        effectiveServerTags[0] ||
        "local-dns";
      newRule = { ...newRule, server: targetServerTag };
    }

    const tagsToEnsure = [
      ...(targetServerTag ? [targetServerTag] : []),
      ...(extraServers || []),
    ];

    const nextServers =
      tagsToEnsure.length > 0
        ? ensureDnsServers(servers, tagsToEnsure, defaultProxyDetour)
        : servers.length === 0
          ? ensureDnsServers(servers, ["local-dns"], defaultProxyDetour)
          : servers;

    const fallbackTag =
      nextServers.find((s) => s.tag === "local-dns" || s.tag?.includes("local"))
        ?.tag ||
      nextServers[0]?.tag ||
      targetServerTag ||
      "local-dns";

    const nextDns: SingBoxVisualConfig["dns"] = {
      ...dns,
      servers: nextServers,
      rules: [...rules, newRule],
      ...(!dns.final && fallbackTag ? { final: fallbackTag } : {}),
    };

    const localResolverTag =
      nextServers.find((s) => s.type === "local" || s.tag?.includes("local"))
        ?.tag ||
      nextServers.find((s) => s.type !== "fakeip")?.tag ||
      fallbackTag;

    const nextRoute = {
      ...(config.route || {}),
      ...(!config.route?.default_domain_resolver && localResolverTag
        ? { default_domain_resolver: localResolverTag }
        : {}),
    };

    if (extraRuleSets && extraRuleSets.length > 0) {
      const updatedConfig = ensureRuleSetsInConfig(
        { ...config, dns: nextDns, route: nextRoute },
        extraRuleSets,
        defaultProxyDetour,
      );
      onChange(updatedConfig);
    } else {
      onChange({ ...config, dns: nextDns, route: nextRoute });
    }
  };

  const addTwoLevelLogicalDnsRule = () => {
    const targetServerTag =
      serverTags.find(
        (t) =>
          t === "remote-dns" ||
          t.includes("remote") ||
          t.includes("google") ||
          t.includes("cf"),
      ) || "remote-dns";

    const hasLocalServer = servers.some(
      (s) => s.tag === "local-dns" || s.tag?.includes("local"),
    );

    const nextServers = ensureDnsServers(
      servers,
      [targetServerTag, hasLocalServer ? "" : "local-dns"],
      defaultProxyDetour,
    );

    const fallbackTag =
      nextServers.find((s) => s.tag === "local-dns" || s.tag?.includes("local"))
        ?.tag ||
      nextServers[0]?.tag ||
      targetServerTag;

    const newRule: DnsRuleItem = {
      server: targetServerTag,
      type: "logical",
      mode: "and",
      rules: [
        {
          query_type: ["A", "AAAA", "CNAME"],
        },
        {
          type: "logical",
          mode: "or",
          rules: [
            {
              rule_set: [
                "geosite-google",
                "geosite-youtube",
                "geosite-twitter",
                "geosite-facebook",
                "geosite-instagram",
                "geosite-telegram",
                "geosite-netflix",
                "geosite-github",
                "geosite-openai",
                "geosite-apple",
                "geosite-jetbrains",
              ],
            },
            {
              domain_suffix: [".io", ".google", ".org", ".dev", ".ai", ".app"],
            },
            {
              domain: ["claude.ai"],
            },
          ],
        },
      ],
    };

    const nextDns: SingBoxVisualConfig["dns"] = {
      ...dns,
      servers: nextServers,
      rules: [...rules, newRule],
      ...(!dns.final && fallbackTag ? { final: fallbackTag } : {}),
    };

    const ruleSetTagsToEnsure = [
      "geosite-google",
      "geosite-youtube",
      "geosite-twitter",
      "geosite-facebook",
      "geosite-instagram",
      "geosite-telegram",
      "geosite-netflix",
      "geosite-github",
      "geosite-openai",
      "geosite-apple",
      "geosite-jetbrains",
    ];

    const localResolverTag =
      nextServers.find((s) => s.type === "local" || s.tag?.includes("local"))
        ?.tag ||
      nextServers.find((s) => s.type !== "fakeip")?.tag ||
      fallbackTag;

    const nextRoute = {
      ...(config.route || {}),
      ...(!config.route?.default_domain_resolver && localResolverTag
        ? { default_domain_resolver: localResolverTag }
        : {}),
    };

    const updatedConfig = ensureRuleSetsInConfig(
      { ...config, dns: nextDns, route: nextRoute },
      ruleSetTagsToEnsure,
      defaultProxyDetour,
    );
    onChange(updatedConfig);
  };

  return (
    <div className="space-y-4">
      {/* TOP PANE: Collapsible DNS Shortcut Toolbar */}
      <CollapsibleToolbar
        title="DNS 服务器与解析分流工具箱"
        subtitle="上半部分可一键添加常用 DNS 服务器、普通规则与双层嵌套逻辑规则，下半部分管理列表与调整顺序"
        headerActions={
          missingRuleSetTags.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleAutoCompleteMissingRuleSets}
              icon={<Wand2 className="w-3.5 h-3.5" />}
            >
              一键补齐已引用规则集 ({missingRuleSetTags.length})
            </Button>
          ) : undefined
        }
      >
        {/* Row 1: DNS Rule Structure Builders */}
        <div className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-300 mr-1">
            添加 DNS 分流规则:
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              const targetTag =
                serverTags.find(
                  (t) => t === "local-dns" || t.includes("local"),
                ) ||
                effectiveServerTags[0] ||
                "local-dns";
              appendDnsRule(
                {
                  domain_suffix: [".cn"],
                  server: targetTag,
                },
                [targetTag],
              );
            }}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增普通规则
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const targetTag =
                serverTags.find(
                  (t) => t === "local-dns" || t.includes("local"),
                ) ||
                effectiveServerTags[0] ||
                "local-dns";
              appendDnsRule(
                {
                  type: "logical",
                  mode: "or",
                  server: targetTag,
                  rules: [
                    { rule_set: ["geosite-cn"] },
                    { domain_suffix: [".cn"] },
                  ],
                },
                [targetTag],
                ["geosite-cn"],
              );
            }}
            icon={<GitBranch className="w-3.5 h-3.5 text-sky-400" />}
          >
            新增单层逻辑组合 (AND/OR)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={addTwoLevelLogicalDnsRule}
            icon={<GitBranch className="w-3.5 h-3.5 text-indigo-400" />}
          >
            新增双层嵌套逻辑规则
          </Button>
          <button
            type="button"
            onClick={() => {
              const nextServers = [...servers];
              if (!nextServers.some((s) => s.tag === "google")) {
                nextServers.push({
                  tag: "google",
                  type: "tls",
                  server: "8.8.8.8",
                  ...(defaultProxyDetour && defaultProxyDetour !== "direct"
                    ? { detour: defaultProxyDetour }
                    : {}),
                });
              }
              if (!nextServers.some((s) => s.tag === "local")) {
                nextServers.push({
                  tag: "local",
                  type: "udp",
                  server: "223.5.5.5",
                });
              }
              const nextRoute = {
                ...(config.route || {}),
                ...(!config.route?.default_domain_resolver
                  ? { default_domain_resolver: "local" }
                  : {}),
              };
              onChange({
                ...config,
                dns: {
                  ...dns,
                  servers: nextServers,
                  strategy: dns.strategy || "ipv4_only",
                  ...(!dns.final ? { final: "local" } : {}),
                },
                route: nextRoute,
              });
            }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 transition-colors"
          >
            ★ 官方客户端：基础双 DNS (google + local)
          </button>
          <button
            type="button"
            onClick={() => {
              const nextServers = [...servers];
              if (!nextServers.some((s) => s.tag === "google")) {
                nextServers.push({
                  tag: "google",
                  type: "tls",
                  server: "8.8.8.8",
                  ...(defaultProxyDetour && defaultProxyDetour !== "direct"
                    ? { detour: defaultProxyDetour }
                    : {}),
                });
              }
              if (!nextServers.some((s) => s.tag === "local")) {
                nextServers.push({
                  tag: "local",
                  type: "udp",
                  server: "223.5.5.5",
                });
              }
              if (!nextServers.some((s) => s.tag === "remote")) {
                nextServers.push({
                  tag: "remote",
                  type: "fakeip",
                  inet4_range: "198.18.0.0/15",
                  inet6_range: "2001:2::/48",
                });
              }
              const nextRoute = {
                ...(config.route || {}),
                ...(!config.route?.default_domain_resolver
                  ? { default_domain_resolver: "local" }
                  : {}),
              };
              onChange({
                ...config,
                dns: {
                  ...dns,
                  servers: nextServers,
                  rules: [
                    ...rules,
                    {
                      query_type: ["A", "AAAA"],
                      server: "remote",
                    },
                  ],
                  ...(!dns.final ? { final: "local" } : {}),
                },
                route: nextRoute,
              });
            }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition-colors"
          >
            ★ 官方客户端：FakeIP 极速防泄漏解析
          </button>
          <button
            type="button"
            onClick={() => {
              const nextServers = [...servers];
              if (!nextServers.some((s) => s.tag === "google")) {
                nextServers.push({
                  tag: "google",
                  type: "tls",
                  server: "8.8.8.8",
                  ...(defaultProxyDetour && defaultProxyDetour !== "direct"
                    ? { detour: defaultProxyDetour }
                    : {}),
                });
              }
              if (!nextServers.some((s) => s.tag === "local")) {
                nextServers.push({
                  tag: "local",
                  type: "https",
                  server: "223.5.5.5",
                });
              }
              const nextDns: SingBoxVisualConfig["dns"] = {
                ...dns,
                servers: nextServers,
                rules: [
                  ...rules,
                  {
                    rule_set: ["geosite-geolocation-cn"],
                    server: "local",
                  },
                  {
                    type: "logical",
                    mode: "and",
                    rules: [
                      {
                        rule_set: ["geosite-geolocation-!cn"],
                        invert: true,
                      },
                      {
                        rule_set: ["geoip-cn"],
                      },
                    ],
                    server: "google",
                  },
                ],
                ...(!dns.final ? { final: "local" } : {}),
              };
              const nextRoute = {
                ...(config.route || {}),
                ...(!config.route?.default_domain_resolver
                  ? { default_domain_resolver: "local" }
                  : {}),
              };
              const updatedConfig = ensureRuleSetsInConfig(
                { ...config, dns: nextDns, route: nextRoute },
                [
                  "geosite-geolocation-cn",
                  "geosite-geolocation-!cn",
                  "geoip-cn",
                ],
                defaultProxyDetour,
              );
              onChange(updatedConfig);
            }}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-500/30 transition-colors"
          >
            ★ 官方客户端：中国大陆防泄漏 DNS 规则
          </button>
        </div>

        {/* Row 2: Quick DNS Rule Presets */}
        <div className="flex flex-wrap items-center gap-1.5 pb-2.5 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            常用 DNS 规则快捷键:
          </span>
          <button
            type="button"
            onClick={addTwoLevelLogicalDnsRule}
            className="px-2 py-1 rounded-md text-[11px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 transition-colors"
          >
            + 海外常见域名双层逻辑分流 (A/AAAA/CNAME + OR 规则组 → remote-dns)
          </button>
          <button
            type="button"
            onClick={() => {
              const targetTag =
                serverTags.find(
                  (t) => t === "local-dns" || t.includes("local"),
                ) || "local-dns";
              appendDnsRule(
                {
                  rule_set: ["geosite-cn"],
                  server: targetTag,
                },
                [targetTag],
                ["geosite-cn"],
              );
            }}
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + 国内域名直连解析 (geosite-cn)
          </button>
          <button
            type="button"
            onClick={() =>
              appendDnsRule(
                {
                  rule_set: ["geosite-category-ads-all"],
                  action: "reject",
                },
                servers.length === 0 ? ["local-dns"] : undefined,
                ["geosite-category-ads-all"],
              )
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + 广告域名拦截解析 (reject)
          </button>
          <button
            type="button"
            onClick={() => {
              const targetTag =
                serverTags.find(
                  (t) => t === "fakeip-dns" || t.includes("fakeip"),
                ) || "fakeip-dns";
              const hasFallback = servers.some(
                (s) => s.tag === "local-dns" || s.tag?.includes("local"),
              );
              appendDnsRule(
                {
                  query_type: ["A", "AAAA"],
                  server: targetTag,
                  rewrite_ttl: 1,
                },
                [targetTag, hasFallback ? "" : "local-dns"],
              );
            }}
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
          >
            + A/AAAA 查询走 FakeIP
          </button>
        </div>

        {/* Row 3: Quick Add DNS Servers */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-300 mr-1">
            一键添加 DNS 服务器:
          </span>
          <button
            type="button"
            onClick={() => addServer()}
            className="px-2 py-1 rounded-md text-[11px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40"
          >
            + 自定义 DNS 服务器
          </button>
          <button
            type="button"
            onClick={() =>
              addServer({
                tag: "local-dns",
                type: "local",
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70"
          >
            + 本地系统 DNS (local)
          </button>
          <button
            type="button"
            onClick={() =>
              addServer({
                tag: "local-dns",
                type: "udp",
                server: "223.5.5.5",
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70"
          >
            + 国内阿里 UDP (223.5.5.5)
          </button>
          <button
            type="button"
            onClick={() =>
              addServer({
                tag: "dnspod-dns",
                type: "https",
                server: "1.12.12.12",
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70"
          >
            + 国内腾讯 DoH (1.12.12.12)
          </button>
          <button
            type="button"
            onClick={() =>
              addServer({
                tag: "remote-dns",
                type: "https",
                server: "1.1.1.1",
                detour: outboundTags.find((t) => t !== "direct") || "proxy",
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70"
          >
            + 海外 Cloudflare DoH (1.1.1.1)
          </button>
          <button
            type="button"
            onClick={() =>
              addServer({
                tag: "google-dns",
                type: "https",
                server: "8.8.8.8",
                detour: outboundTags.find((t) => t !== "direct") || "proxy",
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70"
          >
            + 海外 Google DoH (8.8.8.8)
          </button>
          <button
            type="button"
            onClick={() =>
              addServer({
                tag: "fakeip-dns",
                type: "fakeip",
                inet4_range: "198.18.0.0/15",
                inet6_range: "fc00::/18",
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70"
          >
            + FakeIP 服务器 (198.18.0.0/15)
          </button>
        </div>
      </CollapsibleToolbar>

      {/* BOTTOM PANE: DNS Global Options + DNS Servers List + DNS Rules List */}
      <div className="space-y-4">
        {/* Global DNS Options (Direct Rendering) */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>DNS 全局参数 (dns)</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="默认兜底 DNS 服务器 (dns.final)"
              value={dns.final || ""}
              onChange={(val) => updateDns({ final: val || undefined })}
              options={[
                { value: "", label: "未指定 (空)" },
                ...serverTags.map((t) => ({ value: t, label: t })),
                ...(dns.final && !serverTags.includes(dns.final)
                  ? [{ value: dns.final, label: dns.final }]
                  : []),
              ]}
            />

            <Select
              label="解析策略 (dns.strategy)"
              value={dns.strategy || ""}
              onChange={(val) => updateDns({ strategy: val || undefined })}
              options={[
                { value: "", label: "未指定 (空)" },
                { value: "prefer_ipv4", label: "优先 IPv4 (prefer_ipv4)" },
                { value: "prefer_ipv6", label: "优先 IPv6 (prefer_ipv6)" },
                { value: "ipv4_only", label: "仅 IPv4 (ipv4_only)" },
                { value: "ipv6_only", label: "仅 IPv6 (ipv6_only)" },
              ]}
            />

            <Input
              label="EDNS 客户端子网 (client_subnet)"
              value={dns.client_subnet || ""}
              onChange={(e) =>
                updateDns({ client_subnet: e.target.value || undefined })
              }
              placeholder="例如: 114.114.114.114/24"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-300">
                禁用 DNS 缓存 (disable_cache)
              </span>
              <Switch
                checked={Boolean(dns.disable_cache)}
                onChange={(val) =>
                  updateDns({ disable_cache: val || undefined })
                }
              />
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-300">
                禁用 TTL 过期 (disable_expire)
              </span>
              <Switch
                checked={Boolean(dns.disable_expire)}
                onChange={(val) =>
                  updateDns({ disable_expire: val || undefined })
                }
              />
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <span className="text-xs text-slate-300">
                IP 反向映射 (reverse_mapping)
              </span>
              <Switch
                checked={Boolean(dns.reverse_mapping)}
                onChange={(val) =>
                  updateDns({ reverse_mapping: val || undefined })
                }
              />
            </div>
          </div>
        </div>

        {/* DNS Servers Reorderable List */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-bold text-slate-200">
                DNS 服务器列表 (dns.servers)
              </span>
              <Badge variant="info" size="sm">
                {servers.length} 个
              </Badge>
            </div>
            {servers.length > 0 && (
              <button
                type="button"
                onClick={() => updateDns({ servers: [] })}
                className="px-2 py-1 rounded text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20"
              >
                清空服务器列表
              </button>
            )}
          </div>

          {servers.length === 0 ? (
            <div className="p-5 rounded-lg bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
              当前未配置任何 DNS
              服务器。请使用上方「快捷工具栏」一键添加国内/海外 DNS 服务器。
            </div>
          ) : (
            <div className="space-y-2.5">
              {servers.map((srv, idx) => {
                const needsAddress = [
                  "udp",
                  "tcp",
                  "tls",
                  "https",
                  "h3",
                  "quic",
                ].includes(srv.type || "udp");
                const isFakeIp = srv.type === "fakeip";

                return (
                  <div
                    key={`dns-server-${idx}`}
                    className="p-3 rounded-lg bg-slate-950/75 border border-slate-800/90 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                  >
                    <div className="sm:col-span-3">
                      <Input
                        label={`#${idx + 1} 标签 (tag)`}
                        value={srv.tag || ""}
                        onChange={(e) =>
                          updateServerAt(idx, { ...srv, tag: e.target.value })
                        }
                        placeholder="如: remote-dns"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Select
                        label="协议类型 (type)"
                        value={srv.type || "udp"}
                        onChange={(val) => {
                          const nextType = val as DnsServerItem["type"];
                          const copy: DnsServerItem = {
                            type: nextType,
                            tag: srv.tag,
                          };
                          if (
                            [
                              "udp",
                              "tcp",
                              "tls",
                              "https",
                              "h3",
                              "quic",
                            ].includes(nextType)
                          ) {
                            copy.server = srv.server || "1.1.1.1";
                            if (srv.detour) copy.detour = srv.detour;
                          } else if (nextType === "fakeip") {
                            copy.inet4_range = "198.18.0.0/15";
                            copy.inet6_range = "fc00::/18";
                          }
                          updateServerAt(idx, copy);
                        }}
                        options={[
                          { value: "udp", label: "UDP" },
                          { value: "https", label: "HTTPS (DoH)" },
                          { value: "tls", label: "TLS (DoT)" },
                          { value: "h3", label: "HTTP/3 (DoH3)" },
                          { value: "quic", label: "QUIC (DoQ)" },
                          { value: "tcp", label: "TCP" },
                          { value: "local", label: "系统本地 (local)" },
                          { value: "fakeip", label: "FakeIP" },
                          { value: "dhcp", label: "DHCP" },
                        ]}
                      />
                    </div>

                    {needsAddress && (
                      <>
                        <div className="sm:col-span-3">
                          <Input
                            label="服务器地址 (server)"
                            value={srv.server || ""}
                            onChange={(e) =>
                              updateServerAt(idx, {
                                ...srv,
                                server: e.target.value,
                              })
                            }
                            placeholder="如: 223.5.5.5 或 1.1.1.1"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Select
                            label="出站绕行 (detour)"
                            value={srv.detour || ""}
                            onChange={(val) =>
                              updateServerAt(idx, {
                                ...srv,
                                detour: val || undefined,
                              })
                            }
                            options={[
                              { value: "", label: "直连 (无 detour)" },
                              ...outboundTags
                                .filter((t) => t !== "direct")
                                .map((t) => ({ value: t, label: t })),
                            ]}
                          />
                        </div>
                      </>
                    )}

                    {isFakeIp && (
                      <>
                        <div className="sm:col-span-3">
                          <Input
                            label="IPv4 地址池 (inet4_range)"
                            value={srv.inet4_range || ""}
                            onChange={(e) =>
                              updateServerAt(idx, {
                                ...srv,
                                inet4_range: e.target.value || undefined,
                              })
                            }
                            placeholder="198.18.0.0/15"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            label="IPv6 地址池 (inet6_range)"
                            value={srv.inet6_range || ""}
                            onChange={(e) =>
                              updateServerAt(idx, {
                                ...srv,
                                inet6_range: e.target.value || undefined,
                              })
                            }
                            placeholder="fc00::/18"
                          />
                        </div>
                      </>
                    )}

                    {!needsAddress && !isFakeIp && (
                      <div className="sm:col-span-5 text-xs text-slate-500 pb-2">
                        该服务器类型无需额外地址参数
                      </div>
                    )}

                    <div className="sm:col-span-2 flex items-center justify-end gap-1 pb-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveServerTo(idx, idx - 1)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                        title="上移"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === servers.length - 1}
                        onClick={() => moveServerTo(idx, idx + 1)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                        title="下移"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeServerAt(idx)}
                        className="p-1.5 rounded text-rose-400 hover:text-rose-300"
                        title="删除 DNS 服务器"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* DNS Rules Reorderable List (with 2-level nesting) */}
        <RuleTreeEditor
          kind="dns"
          platform={platform}
          rules={rules}
          onChange={(nextRules) => {
            const referencedServers = new Set<string>();
            const walk = (rList: (RouteRuleItem | DnsRuleItem)[]) => {
              for (const r of rList) {
                const s = (r as DnsRuleItem).server;
                if (s && typeof s === "string" && s.trim()) {
                  referencedServers.add(s.trim());
                }
                if (r.rules) walk(r.rules);
              }
            };
            walk(nextRules);
            const missingServers = Array.from(referencedServers).filter(
              (tag) => !servers.some((s) => s.tag === tag),
            );
            if (missingServers.length > 0) {
              const nextServers = ensureDnsServers(
                servers,
                missingServers,
                defaultProxyDetour,
              );
              const fallbackTag =
                nextServers.find(
                  (s) => s.tag === "local-dns" || s.tag?.includes("local"),
                )?.tag || nextServers[0]?.tag;
              const nextRoute = {
                ...(config.route || {}),
                ...(!config.route?.default_domain_resolver && fallbackTag
                  ? { default_domain_resolver: fallbackTag }
                  : {}),
              };
              onChange({
                ...config,
                dns: {
                  ...dns,
                  servers: nextServers,
                  rules: nextRules as DnsRuleItem[],
                  ...(!dns.final && fallbackTag ? { final: fallbackTag } : {}),
                },
                route: nextRoute,
              });
            } else {
              updateDns({ rules: nextRules as DnsRuleItem[] });
            }
          }}
          outboundTags={outboundTags}
          dnsServerTags={effectiveServerTags}
          inboundTags={inboundTags}
          ruleSetTags={ruleSetTags}
        />
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. Inbounds Tab (Top Collapsible Toolbar + Bottom Reorderable List)
 * ========================================================================== */
interface InboundsTabPanelProps {
  platform: PlatformType;
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
}

export const InboundsTabPanel: React.FC<InboundsTabPanelProps> = ({
  platform,
  config,
  onChange,
}) => {
  const inbounds: InboundItem[] = Array.isArray(config.inbounds)
    ? config.inbounds
    : [];
  const isAndroid = platform === "android";

  const updateInbounds = (next: InboundItem[]) => {
    onChange({ ...config, inbounds: next });
  };

  const appendInbound = (item: InboundItem) => {
    updateInbounds([...inbounds, item]);
  };

  const updateInboundAt = (idx: number, nextItem: InboundItem) => {
    const next = [...inbounds];
    next[idx] = nextItem;
    updateInbounds(next);
  };

  const removeInboundAt = (idx: number) => {
    updateInbounds(inbounds.filter((_, i) => i !== idx));
  };

  const moveInboundTo = (fromIdx: number, toIdx: number) => {
    updateInbounds(moveArrayItem(inbounds, fromIdx, toIdx));
  };

  return (
    <div className="space-y-4">
      {/* TOP PANE: Collapsible Inbounds Toolbar */}
      <CollapsibleToolbar
        title="入站监听快捷工具箱 (参考 sing-box /manual/proxy/client/)"
        subtitle="支持三种客户端代理接入方式：虚拟网卡 (Virtual Interface - TUN)、系统代理 (System Proxy - Mixed/HTTP/SOCKS)、防火墙透明转发 (TProxy/Redirect)"
      >
        <div className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-300 mr-1">
            客户端入站方式:
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              appendInbound({
                type: "tun",
                tag: `tun-in${inbounds.length ? `-${inbounds.length + 1}` : ""}`,
                address: ["172.19.0.1/30"],
                auto_route: true,
                strict_route: true,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 TUN 虚拟网卡
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appendInbound({
                type: "mixed",
                tag: `mixed-in${inbounds.length ? `-${inbounds.length + 1}` : ""}`,
                listen: "127.0.0.1",
                listen_port: 2080,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 Mixed 混合端口
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appendInbound({
                type: "socks",
                tag: "socks-in",
                listen: "127.0.0.1",
                listen_port: 1080,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 SOCKS5 入站
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appendInbound({
                type: "http",
                tag: "http-in",
                listen: "127.0.0.1",
                listen_port: 8080,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 HTTP 入站
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            官方客户端手册预设:
          </span>
          <button
            type="button"
            onClick={() =>
              appendInbound({
                type: "tun",
                tag: "tun-in",
                address: ["172.19.0.1/30"],
                auto_route: true,
                strict_route: true,
                ...(platform === "linux" ? { auto_redirect: true } : {}),
              })
            }
            className="px-2.5 py-1 rounded-md text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30"
          >
            ★ 官方客户端：TUN 虚拟网卡 (IPv4 Only)
          </button>
          <button
            type="button"
            onClick={() =>
              appendInbound({
                type: "tun",
                tag: "tun-in",
                address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
                mtu: 9000,
                auto_route: true,
                strict_route: true,
                ...(platform === "linux" ? { auto_redirect: true } : {}),
              })
            }
            className="px-2.5 py-1 rounded-md text-[11px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-500/30"
          >
            + IPv4/IPv6 双栈高性能 TUN 网卡
          </button>
          <button
            type="button"
            onClick={() =>
              appendInbound({
                type: "mixed",
                tag: "mixed-in",
                listen: "127.0.0.1",
                listen_port: 2080,
                set_system_proxy: true,
              })
            }
            className="px-2.5 py-1 rounded-md text-[11px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30"
          >
            ★ 官方客户端：System Proxy (Mixed 127.0.0.1:2080)
          </button>
          <button
            type="button"
            onClick={() =>
              appendInbound({
                type: "mixed",
                tag: "mixed-lan",
                listen: "0.0.0.0",
                listen_port: 2080,
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70"
          >
            + 局域网共享 Mixed 代理 (0.0.0.0:2080)
          </button>
        </div>
      </CollapsibleToolbar>

      {/* BOTTOM PANE: Inbounds Reorderable List */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs font-bold text-slate-200">
              入站配置列表 (inbounds)
            </span>
            <Badge variant="info" size="sm">
              {inbounds.length} 个
            </Badge>
          </div>
          {inbounds.length > 0 && (
            <button
              type="button"
              onClick={() => updateInbounds([])}
              className="px-2 py-1 rounded text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20"
            >
              清空入站列表
            </button>
          )}
        </div>

        {inbounds.length === 0 ? (
          <div className="p-8 rounded-lg bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
            当前入站列表为空 (<code className="text-sky-300">[]</code>
            )。请从上方快捷工具栏添加 TUN 或 Mixed 入站。
          </div>
        ) : (
          <div className="space-y-3">
            {inbounds.map((inb, idx) => {
              const isTun = inb.type === "tun";
              return (
                <div
                  key={`inbound-${idx}`}
                  className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-sky-300">
                        #{idx + 1}
                      </span>
                      <Badge variant="info" size="sm">
                        {(inb.type || "mixed").toUpperCase()}
                      </Badge>
                      <span className="text-xs font-mono text-slate-200">
                        {inb.tag || `inbound-${idx + 1}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveInboundTo(idx, idx - 1)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                        title="上移"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === inbounds.length - 1}
                        onClick={() => moveInboundTo(idx, idx + 1)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                        title="下移"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeInboundAt(idx)}
                        className="p-1.5 rounded text-rose-400 hover:text-rose-300"
                        title="删除入站"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Select
                      label="入站类型 (type)"
                      value={inb.type || "mixed"}
                      onChange={(val) => {
                        if (val === "tun") {
                          updateInboundAt(idx, {
                            type: "tun",
                            tag: inb.tag || "tun-in",
                            address: ["172.19.0.1/30"],
                            auto_route: true,
                            strict_route: true,
                          });
                        } else {
                          updateInboundAt(idx, {
                            type: val,
                            tag: inb.tag || `${val}-in`,
                            listen: "127.0.0.1",
                            listen_port: 2080,
                          });
                        }
                      }}
                      options={[
                        { value: "tun", label: "TUN 虚拟网卡 (tun)" },
                        {
                          value: "mixed",
                          label: "HTTP+SOCKS 混合代理 (mixed)",
                        },
                        { value: "http", label: "HTTP 代理 (http)" },
                        { value: "socks", label: "SOCKS5 代理 (socks)" },
                        { value: "redirect", label: "透明重定向 (redirect)" },
                        { value: "tproxy", label: "透明代理 (tproxy)" },
                        { value: "direct", label: "直连转发 (direct)" },
                      ]}
                    />

                    <Input
                      label="入站标签 (tag)"
                      value={inb.tag || ""}
                      onChange={(e) =>
                        updateInboundAt(idx, { ...inb, tag: e.target.value })
                      }
                      placeholder="如: tun-in, mixed-in"
                    />

                    {isTun ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="网卡名称 (interface_name)"
                          value={inb.interface_name || ""}
                          onChange={(e) =>
                            updateInboundAt(idx, {
                              ...inb,
                              interface_name: e.target.value || undefined,
                            })
                          }
                          placeholder={
                            platform === "macos"
                              ? "留空或 utun9"
                              : "留空自动分配"
                          }
                        />
                        <Input
                          label="MTU 大小 (mtu)"
                          type="number"
                          value={inb.mtu ? String(inb.mtu) : ""}
                          onChange={(e) =>
                            updateInboundAt(idx, {
                              ...inb,
                              mtu: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            })
                          }
                          placeholder="默认 (如 9000)"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="监听地址 (listen)"
                          value={inb.listen || ""}
                          onChange={(e) =>
                            updateInboundAt(idx, {
                              ...inb,
                              listen: e.target.value,
                            })
                          }
                          placeholder="127.0.0.1"
                        />
                        <Input
                          label="端口 (listen_port)"
                          type="number"
                          value={
                            inb.listen_port !== undefined
                              ? String(inb.listen_port)
                              : ""
                          }
                          onChange={(e) =>
                            updateInboundAt(idx, {
                              ...inb,
                              listen_port: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            })
                          }
                          placeholder="2080"
                        />
                      </div>
                    )}
                  </div>

                  {isTun && (
                    <div className="space-y-3">
                      <TagListInput
                        label="TUN 网卡地址段 (address)"
                        values={inb.address || []}
                        onChange={(v) =>
                          updateInboundAt(idx, { ...inb, address: v })
                        }
                        placeholder="如: 172.19.0.1/30, fdfe:dcba:9876::1/126"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                          <span className="text-xs text-slate-300">
                            自动配置路由 (auto_route)
                          </span>
                          <Switch
                            checked={Boolean(inb.auto_route)}
                            onChange={(val) =>
                              updateInboundAt(idx, {
                                ...inb,
                                auto_route: val || undefined,
                              })
                            }
                          />
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                          <span className="text-xs text-slate-300">
                            严格路由防泄漏 (strict_route)
                          </span>
                          <Switch
                            checked={Boolean(inb.strict_route)}
                            onChange={(val) =>
                              updateInboundAt(idx, {
                                ...inb,
                                strict_route: val || undefined,
                              })
                            }
                          />
                        </div>

                        {(platform === "linux" ||
                          Boolean(inb.auto_redirect)) && (
                          <div
                            className={`p-2.5 rounded-lg border flex items-center justify-between ${
                              platform !== "linux" && Boolean(inb.auto_redirect)
                                ? "bg-rose-500/10 border-rose-500/40"
                                : "bg-slate-900/80 border-slate-800"
                            }`}
                          >
                            <div>
                              <span
                                className={`text-xs block ${
                                  platform !== "linux" &&
                                  Boolean(inb.auto_redirect)
                                    ? "text-rose-200 font-semibold"
                                    : "text-slate-300"
                                }`}
                              >
                                NFTables 自动重定向 (auto_redirect)
                              </span>
                              {platform !== "linux" &&
                                Boolean(inb.auto_redirect) && (
                                  <span className="text-[10px] text-rose-300">
                                    仅 Linux 支持，当前平台不支持，请关闭后保存
                                  </span>
                                )}
                            </div>
                            <Switch
                              checked={Boolean(inb.auto_redirect)}
                              onChange={(val) =>
                                updateInboundAt(idx, {
                                  ...inb,
                                  auto_redirect: val || undefined,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300 block">
                          TUN 协议栈类型 (stack)
                        </label>
                        <select
                          value={(inb.stack as string) || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateInboundAt(idx, {
                              ...inb,
                              stack: val || undefined,
                            });
                          }}
                          className="w-full text-xs bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">未指定 (系统默认)</option>
                          <option value="system">system (系统网络协议栈 - 性能好开销低)</option>
                          <option value="gvisor">gvisor (用户态沙盒协议栈 - 跨平台隔离)</option>
                          <option value="mixed">mixed (混合协议栈 - TCP系统/UDP gVisor)</option>
                        </select>
                      </div>

                      {(isAndroid ||
                        Boolean(
                          inb.include_package?.length ||
                          inb.exclude_package?.length,
                        )) && (
                        <div
                          className={`grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 ${
                            !isAndroid
                              ? "p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40"
                              : ""
                          }`}
                        >
                          {!isAndroid && (
                            <div className="md:col-span-2 flex items-center justify-between text-xs text-rose-200">
                              <span>
                                当前非 Android 平台配置包含 Android
                                专属包名分流字段，请清空后再保存：
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateInboundAt(idx, {
                                    ...inb,
                                    include_package: undefined,
                                    exclude_package: undefined,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-500/30"
                              >
                                一键清空包名字段
                              </button>
                            </div>
                          )}
                          <TagListInput
                            label="仅代理指定 Android 应用包名 (include_package)"
                            values={inb.include_package || []}
                            onChange={(v) =>
                              updateInboundAt(idx, {
                                ...inb,
                                include_package: v.length ? v : undefined,
                              })
                            }
                            placeholder="留空则代理全部应用"
                          />
                          <TagListInput
                            label="排除指定 Android 应用包名 (exclude_package)"
                            values={inb.exclude_package || []}
                            onChange={(v) =>
                              updateInboundAt(idx, {
                                ...inb,
                                exclude_package: v.length ? v : undefined,
                              })
                            }
                            placeholder="例如: com.tencent.mm"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {(inb.type === "mixed" || inb.type === "http") && (
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium text-slate-300 block">
                          自动配置系统代理 (set_system_proxy)
                        </span>
                        <span className="text-[10px] text-slate-500">
                          客户端启动时自动将该入站端口注册为操作系统 HTTP 代理
                        </span>
                      </div>
                      <Switch
                        checked={Boolean(inb.set_system_proxy)}
                        onChange={(val) =>
                          updateInboundAt(idx, {
                            ...inb,
                            set_system_proxy: val || undefined,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. Outbounds Tab (Switch to Import Nodes & Node Groups + Full Visual Display)
 * ("出站（开始时空的，开启后某个开关，直接导入节点和节点组合，但是要显示出来看）")
 * ========================================================================== */
interface OutboundsTabPanelProps {
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  nodes: NodeItem[];
  nodeGroups: NodeGroup[];
  onSyncFromNodePool: () => void;
  syncing: boolean;
}

export const OutboundsTabPanel: React.FC<OutboundsTabPanelProps> = ({
  config,
  onChange,
  nodes,
  nodeGroups,
  onSyncFromNodePool,
  syncing,
}) => {
  const [expandedNodeMap, setExpandedNodeMap] = useState<
    Record<string, boolean>
  >({});
  const [nodeFilterQuery, setNodeFilterQuery] = useState("");

  const outbounds: OutboundItem[] = Array.isArray(config.outbounds)
    ? config.outbounds
    : [];
  const enabledNodes = nodes.filter((n) => n.enabled !== false);
  const existingTags = new Set(
    outbounds.map((o) => o.tag).filter(Boolean) as string[],
  );
  const allCandidateTags = Array.from(
    new Set([
      ...Array.from(existingTags),
      "direct",
      ...nodeGroups.map((g) => g.tag),
      ...enabledNodes.map((n) => n.tag),
    ]),
  );

  const updateOutbounds = (next: OutboundItem[]) => {
    onChange({ ...config, outbounds: next });
  };

  const addOutbound = (item: OutboundItem) => {
    if (item.tag && existingTags.has(item.tag)) return;
    updateOutbounds([...outbounds, item]);
  };

  const parseNodeToOutbound = (n: NodeItem): OutboundItem => {
    if (n.raw_json) {
      try {
        const parsed = JSON.parse(n.raw_json) as OutboundItem;
        if (parsed && typeof parsed === "object" && parsed.type) {
          return {
            ...parsed,
            tag: parsed.tag || n.tag,
          };
        }
      } catch {
        // fallback below
      }
    }
    return {
      type: n.node_type || "socks",
      tag: n.tag,
      server: n.server,
      server_port: n.port,
    };
  };

  const resolveGroupMemberTags = (g: NodeGroup): string[] => {
    if (g.match_type === "static" || g.static_nodes) {
      try {
        const parsed = JSON.parse(g.static_nodes || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(String);
        }
      } catch {
        // ignore
      }
    }
    const incKws = (g.include_keywords || "")
      .split(/[,，\n\t]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const excKws = (g.exclude_keywords || "")
      .split(/[,，\n\t]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    return enabledNodes
      .filter((n) => {
        const tagLower = (n.tag || "").toLowerCase();
        const serverLower = (n.server || "").toLowerCase();
        if (
          incKws.length > 0 &&
          !incKws.some(
            (kw) => tagLower.includes(kw) || serverLower.includes(kw),
          )
        ) {
          return false;
        }
        if (
          excKws.length > 0 &&
          excKws.some((kw) => tagLower.includes(kw) || serverLower.includes(kw))
        ) {
          return false;
        }
        return true;
      })
      .map((n) => n.tag);
  };

  const buildNodeGroupOutbound = (g: NodeGroup): OutboundItem => {
    const memberTags = resolveGroupMemberTags(g);
    const fallbackMembers =
      memberTags.length > 0
        ? memberTags
        : enabledNodes.length > 0
          ? enabledNodes.map((n) => n.tag)
          : ["direct"];

    if (g.group_type === "urltest") {
      return {
        type: "urltest",
        tag: g.tag,
        outbounds: fallbackMembers,
        url: g.url || "http://cp.cloudflare.com/generate_204",
        interval: g.interval || "3m",
        tolerance: g.tolerance ?? 50,
      };
    }
    return {
      type: "selector",
      tag: g.tag,
      outbounds: fallbackMembers,
      ...(g.default_selected ? { default: g.default_selected } : {}),
    };
  };

  // Determine whether resource library node groups / nodes are currently imported
  const resourceGroupTagSet = new Set(nodeGroups.map((g) => g.tag));
  const resourceNodeTagSet = new Set(enabledNodes.map((n) => n.tag));

  const importedGroupsCount = nodeGroups.filter((g) =>
    existingTags.has(g.tag),
  ).length;
  const importedNodesCount = enabledNodes.filter((n) =>
    existingTags.has(n.tag),
  ).length;

  const isGroupsImported =
    nodeGroups.length > 0 && importedGroupsCount === nodeGroups.length;
  const isNodesImported =
    enabledNodes.length > 0 && importedNodesCount === enabledNodes.length;
  const isAllResourcesImported =
    nodeGroups.length > 0 || enabledNodes.length > 0
      ? (nodeGroups.length === 0 || isGroupsImported) &&
        (enabledNodes.length === 0 || isNodesImported)
      : outbounds.length > 0;

  // Master switch handler: toggle importing both Node Groups and Nodes directly into outbounds
  const handleToggleImportAllResources = (checked: boolean) => {
    if (checked) {
      const nextList: OutboundItem[] = [...outbounds];
      const seen = new Set(existingTags);

      // 1. Import all Node Groups
      for (const g of nodeGroups) {
        if (!seen.has(g.tag)) {
          nextList.push(buildNodeGroupOutbound(g));
          seen.add(g.tag);
        }
      }

      // If no nodeGroups exist in DB, create a default "proxy" selector pointing to all nodes + direct
      if (nodeGroups.length === 0 && !seen.has("proxy")) {
        const allNodeTags = enabledNodes.map((n) => n.tag);
        nextList.push({
          type: "selector",
          tag: "proxy",
          outbounds:
            allNodeTags.length > 0 ? [...allNodeTags, "direct"] : ["direct"],
        });
        seen.add("proxy");
      }

      // 2. Ensure "direct" outbound exists (as in /manual/proxy/client/)
      if (!seen.has("direct")) {
        nextList.push({ type: "direct", tag: "direct" });
        seen.add("direct");
      }

      // 3. Import all enabled Nodes
      for (const n of enabledNodes) {
        if (!seen.has(n.tag)) {
          nextList.push(parseNodeToOutbound(n));
          seen.add(n.tag);
        }
      }

      updateOutbounds(nextList);
    } else {
      // Remove imported resource nodeGroups & nodes (and auto-created proxy/direct if empty)
      const remaining = outbounds.filter((o) => {
        if (!o.tag) return false;
        if (resourceGroupTagSet.has(o.tag)) return false;
        if (resourceNodeTagSet.has(o.tag)) return false;
        if (
          nodeGroups.length === 0 &&
          (o.tag === "proxy" || o.tag === "direct")
        ) {
          return false;
        }
        return true;
      });
      // If only "direct" is left after removing all resource groups/nodes, clear to []
      if (remaining.length === 1 && remaining[0].tag === "direct") {
        updateOutbounds([]);
      } else {
        updateOutbounds(remaining);
      }
    }
  };

  // Sub-switch 1: Toggle importing Node Groups only
  const handleToggleImportGroupsOnly = (checked: boolean) => {
    if (checked) {
      const nextList = [...outbounds];
      const seen = new Set(existingTags);
      for (const g of nodeGroups) {
        if (!seen.has(g.tag)) {
          nextList.push(buildNodeGroupOutbound(g));
          seen.add(g.tag);
        }
      }
      if (!seen.has("direct")) {
        nextList.push({ type: "direct", tag: "direct" });
      }
      updateOutbounds(nextList);
    } else {
      updateOutbounds(
        outbounds.filter((o) => !o.tag || !resourceGroupTagSet.has(o.tag)),
      );
    }
  };

  // Sub-switch 2: Toggle importing Nodes only
  const handleToggleImportNodesOnly = (checked: boolean) => {
    if (checked) {
      const nextList = [...outbounds];
      const seen = new Set(existingTags);
      for (const n of enabledNodes) {
        if (!seen.has(n.tag)) {
          nextList.push(parseNodeToOutbound(n));
          seen.add(n.tag);
        }
      }
      if (!seen.has("direct")) {
        nextList.push({ type: "direct", tag: "direct" });
      }
      updateOutbounds(nextList);
    } else {
      updateOutbounds(
        outbounds.filter((o) => !o.tag || !resourceNodeTagSet.has(o.tag)),
      );
    }
  };

  const addNodeGroupOnDemand = (g: NodeGroup) => {
    if (existingTags.has(g.tag)) return;
    const groupItem = buildNodeGroupOutbound(g);
    const memberTags = groupItem.outbounds || [];
    const nextList = [...outbounds, groupItem];
    const addedSet = new Set([...Array.from(existingTags), g.tag]);
    for (const mTag of memberTags) {
      if (addedSet.has(mTag)) continue;
      if (mTag === "direct") {
        nextList.push({ type: "direct", tag: "direct" });
        addedSet.add("direct");
        continue;
      }
      const matchedNode = enabledNodes.find((n) => n.tag === mTag);
      if (matchedNode) {
        nextList.push(parseNodeToOutbound(matchedNode));
        addedSet.add(mTag);
      }
    }
    updateOutbounds(nextList);
  };

  const addSingleNodeOnDemand = (n: NodeItem) => {
    if (existingTags.has(n.tag)) return;
    updateOutbounds([...outbounds, parseNodeToOutbound(n)]);
  };

  const updateOutboundAt = (idx: number, nextItem: OutboundItem) => {
    const next = [...outbounds];
    next[idx] = nextItem;
    updateOutbounds(next);
  };

  const removeOutboundAt = (idx: number) => {
    updateOutbounds(outbounds.filter((_, i) => i !== idx));
  };

  const moveOutboundTo = (fromIdx: number, toIdx: number) => {
    updateOutbounds(moveArrayItem(outbounds, fromIdx, toIdx));
  };

  // Partition outbounds into Strategy Groups / Basic Outbounds vs Concrete Proxy Nodes (with original index preserved)
  const indexedOutbounds = outbounds.map((item, idx) => ({ item, idx }));
  const strategyAndBasicOutbounds = indexedOutbounds.filter(({ item }) =>
    ["selector", "urltest", "direct", "block", "dns"].includes(item.type),
  );
  const concreteNodeOutbounds = indexedOutbounds.filter(
    ({ item }) =>
      !["selector", "urltest", "direct", "block", "dns"].includes(item.type),
  );

  const filteredConcreteNodeOutbounds = concreteNodeOutbounds.filter(
    ({ item }) => {
      if (!nodeFilterQuery.trim()) return true;
      const q = nodeFilterQuery.trim().toLowerCase();
      return (
        (item.tag || "").toLowerCase().includes(q) ||
        (item.type || "").toLowerCase().includes(q) ||
        (item.server || "").toLowerCase().includes(q)
      );
    },
  );

  const summarizeNodeSecurityAndTransport = (item: OutboundItem): string[] => {
    const badges: string[] = [];
    const raw = item as Record<string, unknown>;
    if (raw.tls && typeof raw.tls === "object") {
      const tlsObj = raw.tls as Record<string, unknown>;
      if (tlsObj.enabled) {
        badges.push("TLS");
        if (typeof tlsObj.server_name === "string" && tlsObj.server_name) {
          badges.push(`SNI: ${tlsObj.server_name}`);
        }
        if (tlsObj.reality && typeof tlsObj.reality === "object") {
          const rObj = tlsObj.reality as Record<string, unknown>;
          if (rObj.enabled) badges.push("Reality");
        }
      }
    }
    if (raw.transport && typeof raw.transport === "object") {
      const trObj = raw.transport as Record<string, unknown>;
      if (typeof trObj.type === "string" && trObj.type) {
        badges.push(`传输: ${trObj.type.toUpperCase()}`);
      }
    }
    if (typeof raw.flow === "string" && raw.flow) {
      badges.push(`Flow: ${raw.flow}`);
    }
    if (typeof raw.network === "string" && raw.network) {
      badges.push(`Network: ${raw.network}`);
    }
    return badges;
  };

  return (
    <div className="space-y-4">
      {/* PRIMARY SWITCH BAR: One-Switch Import of Node Groups & Nodes */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-sky-500/10 via-slate-900/90 to-indigo-500/10 border border-sky-500/30 space-y-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-slate-100">
                一键导入资源库「节点组合」与「节点」开关
              </span>
              <Badge
                variant={isAllResourcesImported ? "success" : "neutral"}
                size="sm"
              >
                {isAllResourcesImported
                  ? `已导入 (${importedGroupsCount} 组合 / ${importedNodesCount} 节点)`
                  : "默认空出站 (未开启导入)"}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400">
              新建配置默认出站为空 (<code className="text-sky-300">[]</code>
              )。打开右侧开关即可将当前资源库中的节点组合与全部可用节点直接导入并在下方完整展示出来。
            </p>
          </div>

          <div
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-sky-500/30"
            data-testid="master-import-outbounds-switch-box"
          >
            <span className="text-xs font-semibold text-sky-200">
              开启导入节点与节点组合
            </span>
            <Switch
              checked={isAllResourcesImported}
              onChange={handleToggleImportAllResources}
            />
          </div>
        </div>

        {/* Granular Sub-Switches for Node Groups vs Nodes + Sync Button */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80">
          <div className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                导入全部节点组合 ({importedGroupsCount}/{nodeGroups.length})
              </span>
              <span className="text-[10px] text-slate-500">
                将节点组合转为 selector / urltest 策略组
              </span>
            </div>
            <Switch
              checked={isGroupsImported}
              onChange={handleToggleImportGroupsOnly}
              disabled={nodeGroups.length === 0}
            />
          </div>

          <div className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                导入全部可用节点 ({importedNodesCount}/{enabledNodes.length})
              </span>
              <span className="text-[10px] text-slate-500">
                将节点池中的启用节点写入 outbounds 并展示
              </span>
            </div>
            <Switch
              checked={isNodesImported}
              onChange={handleToggleImportNodesOnly}
              disabled={enabledNodes.length === 0}
            />
          </div>

          <div className="px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-200 block">
                包含直连出站 (direct)
              </span>
              <span className="text-[10px] text-slate-500">
                官方客户端手册必备基础直连出站
              </span>
            </div>
            <Switch
              checked={existingTags.has("direct")}
              onChange={(checked) => {
                if (checked) {
                  addOutbound({ type: "direct", tag: "direct" });
                } else {
                  updateOutbounds(outbounds.filter((o) => o.tag !== "direct"));
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* TOP PANE: Collapsible Outbound & Resource Import Toolbar */}
      <CollapsibleToolbar
        title="出站策略组与按需点选工具箱"
        subtitle="支持手动新增自定义策略组，或从「节点组合」与「节点池」单独点选导入指定项"
        headerActions={
          <Button
            variant="secondary"
            size="sm"
            loading={syncing}
            onClick={onSyncFromNodePool}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            从后端重算并同步最新节点池
          </Button>
        }
      >
        {/* Row 1: Basic Outbound & Strategy Group Creators */}
        <div className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-300 mr-1">
            手动添加出站与策略组:
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={existingTags.has("direct")}
            onClick={() => addOutbound({ type: "direct", tag: "direct" })}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            {existingTags.has("direct")
              ? "已包含 direct 直连"
              : "添加 direct 直连出站"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const nextOutbounds = [...outbounds];
              if (!existingTags.has("direct")) {
                nextOutbounds.push({ type: "direct", tag: "direct" });
              }
              nextOutbounds.push({
                type: "selector",
                tag: existingTags.has("proxy")
                  ? `selector-${outbounds.length + 1}`
                  : "proxy",
                outbounds: ["direct"],
              });
              updateOutbounds(nextOutbounds);
            }}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增手动选择组 (selector)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const nextOutbounds = [...outbounds];
              if (!existingTags.has("direct")) {
                nextOutbounds.push({ type: "direct", tag: "direct" });
              }
              nextOutbounds.push({
                type: "urltest",
                tag: existingTags.has("AUTO-Test")
                  ? `urltest-${outbounds.length + 1}`
                  : "AUTO-Test",
                outbounds: ["direct"],
                url: "http://cp.cloudflare.com/generate_204",
                interval: "3m",
                tolerance: 50,
              });
              updateOutbounds(nextOutbounds);
            }}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增自动测速组 (urltest)
          </Button>
        </div>

        {/* Row 2: On-Demand Import from Existing Node Groups */}
        {nodeGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2.5 border-b border-slate-800/80">
            <span className="text-[11px] font-semibold text-slate-300 mr-1">
              按需点选单个节点组合 ({nodeGroups.length}):
            </span>
            {nodeGroups.map((g) => {
              const exists = existingTags.has(g.tag);
              return (
                <button
                  key={g.id || g.tag}
                  type="button"
                  disabled={exists}
                  onClick={() => addNodeGroupOnDemand(g)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                    exists
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                      : "bg-slate-950/80 text-sky-300 border-sky-500/30 hover:bg-sky-500/20"
                  }`}
                >
                  {exists
                    ? `✓ ${g.tag} (${g.group_type})`
                    : `+ 导入策略组: ${g.tag} (${g.group_type})`}
                </button>
              );
            })}
          </div>
        )}

        {/* Row 3: On-Demand Import from Existing Nodes Pool */}
        {enabledNodes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto">
            <span className="text-[11px] font-semibold text-slate-300 mr-1">
              按需点选单个节点 ({enabledNodes.length}):
            </span>
            {enabledNodes.slice(0, 40).map((n) => {
              const exists = existingTags.has(n.tag);
              return (
                <button
                  key={n.id || n.tag}
                  type="button"
                  disabled={exists}
                  onClick={() => addSingleNodeOnDemand(n)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
                    exists
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                      : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-sky-500/50 hover:text-sky-300"
                  }`}
                >
                  {exists ? `✓ ${n.tag}` : `+ ${n.tag}`}
                </button>
              );
            })}
          </div>
        )}
      </CollapsibleToolbar>

      {/* BOTTOM PANE: Full Visual Display of Imported Strategy Groups & Concrete Proxy Nodes */}
      {outbounds.length === 0 ? (
        <div className="p-8 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-center space-y-2">
          <div className="text-xs font-medium text-slate-300">
            当前出站列表为空 (<code className="text-sky-300">[]</code>)
          </div>
          <p className="text-[11px] text-slate-500 max-w-xl mx-auto">
            请打开上方「
            <span className="text-sky-300">开启导入节点与节点组合</span>
            」开关，系统将直接把节点组合与节点导入到此处并完整展示出来供查看与调整。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SECTION A: Strategy Groups & Basic Outbounds (selector / urltest / direct) */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-xs font-bold text-slate-200">
                  已导入节点组合 / 策略组与基础出站 (selector / urltest /
                  direct)
                </span>
                <Badge variant="info" size="sm">
                  {strategyAndBasicOutbounds.length} 项
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => updateOutbounds([])}
                className="px-2 py-1 rounded text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20"
              >
                清空全部出站 ({outbounds.length})
              </button>
            </div>

            {strategyAndBasicOutbounds.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                暂无策略组或直连出站，可在上方打开「导入全部节点组合」开关或手动添加。
              </div>
            ) : (
              <div className="space-y-3">
                {strategyAndBasicOutbounds.map(({ item, idx }) => {
                  const isSelector = item.type === "selector";
                  const isUrltest = item.type === "urltest";
                  const memberCount = Array.isArray(item.outbounds)
                    ? item.outbounds.length
                    : 0;

                  return (
                    <div
                      key={`outbound-custom-${idx}`}
                      className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-sky-300">
                            #{idx + 1}
                          </span>
                          <Badge
                            variant={
                              item.type === "direct" ? "success" : "info"
                            }
                            size="sm"
                          >
                            {item.type.toUpperCase()}
                          </Badge>
                          <span className="text-xs font-mono font-bold text-slate-100">
                            {item.tag || `outbound-${idx + 1}`}
                          </span>
                          {(isSelector || isUrltest) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/20">
                              包含 {memberCount} 个成员节点
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveOutboundTo(idx, 0)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                            title="置顶"
                          >
                            <ChevronsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveOutboundTo(idx, idx - 1)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                            title="上移"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === outbounds.length - 1}
                            onClick={() => moveOutboundTo(idx, idx + 1)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                            title="下移"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === outbounds.length - 1}
                            onClick={() =>
                              moveOutboundTo(idx, outbounds.length - 1)
                            }
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                            title="置底"
                          >
                            <ChevronsDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOutboundAt(idx)}
                            className="p-1.5 rounded text-rose-400 hover:text-rose-300"
                            title="移除此出站"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Input
                          label="出站标签 (tag)"
                          value={item.tag || ""}
                          onChange={(e) =>
                            updateOutboundAt(idx, {
                              ...item,
                              tag: e.target.value,
                            })
                          }
                          placeholder="如: proxy, AUTO-Test, direct"
                        />

                        <Select
                          label="出站类型 (type)"
                          value={item.type}
                          onChange={(val) =>
                            updateOutboundAt(idx, { ...item, type: val })
                          }
                          options={[
                            {
                              value: "selector",
                              label: "手动选择策略组 (selector)",
                            },
                            {
                              value: "urltest",
                              label: "自动测速策略组 (urltest)",
                            },
                            { value: "direct", label: "直连出站 (direct)" },
                          ]}
                        />

                        {isSelector && (
                          <Select
                            label="默认选中出站 (default)"
                            value={item.default || ""}
                            onChange={(val) =>
                              updateOutboundAt(idx, {
                                ...item,
                                default: val || undefined,
                              })
                            }
                            options={[
                              { value: "", label: "默认列表首项" },
                              ...(item.outbounds || []).map((t) => ({
                                value: t,
                                label: t,
                              })),
                            ]}
                          />
                        )}

                        {isUrltest && (
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              label="测速周期 (interval)"
                              value={item.interval || ""}
                              onChange={(e) =>
                                updateOutboundAt(idx, {
                                  ...item,
                                  interval: e.target.value || undefined,
                                })
                              }
                              placeholder="3m"
                            />
                            <Input
                              label="容差 ms (tolerance)"
                              type="number"
                              value={
                                item.tolerance !== undefined
                                  ? String(item.tolerance)
                                  : ""
                              }
                              onChange={(e) =>
                                updateOutboundAt(idx, {
                                  ...item,
                                  tolerance: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                })
                              }
                              placeholder="50"
                            />
                          </div>
                        )}
                      </div>

                      {(isSelector || isUrltest) && (
                        <TagListInput
                          label="包含的子出站/节点标签列表 (outbounds)"
                          values={item.outbounds || []}
                          onChange={(v) =>
                            updateOutboundAt(idx, { ...item, outbounds: v })
                          }
                          placeholder="输入或点选下方节点标签..."
                          suggestions={allCandidateTags
                            .filter((t) => t !== item.tag)
                            .slice(0, 24)
                            .map((t) => ({ value: t, label: t }))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION B: Concrete Proxy Nodes Display List ("直接导入节点和节点组合，但是要显示出来看") */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">
                  已导入代理节点明细列表 (Nodes in outbounds)
                </span>
                <Badge variant="success" size="sm">
                  {concreteNodeOutbounds.length} 个节点
                </Badge>
              </div>

              {concreteNodeOutbounds.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={nodeFilterQuery}
                      onChange={(e) => setNodeFilterQuery(e.target.value)}
                      placeholder="筛选已导入节点名称/协议/地址..."
                      className="pl-8 pr-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {concreteNodeOutbounds.length === 0 ? (
              <div className="p-5 rounded-lg bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                当前未导入任何具体代理节点。打开上方「导入全部可用节点」或「开启导入节点与节点组合」开关后，所有节点将在此处完整展示。
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {filteredConcreteNodeOutbounds.map(({ item, idx }) => {
                  const key = `${item.tag || idx}-${idx}`;
                  const isExpanded = Boolean(expandedNodeMap[key]);
                  const extraBadges = summarizeNodeSecurityAndTransport(item);

                  return (
                    <div
                      key={key}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700 transition-colors space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-sky-300">
                            #{idx + 1}
                          </span>
                          <Badge variant="success" size="sm">
                            {(item.type || "proxy").toUpperCase()}
                          </Badge>
                          <span className="text-xs font-mono font-bold text-slate-100 truncate">
                            {item.tag || `node-${idx + 1}`}
                          </span>
                          {item.server && (
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-[11px] font-mono text-slate-300 border border-slate-800">
                              {item.server}
                              {item.server_port ? `:${item.server_port}` : ""}
                            </span>
                          )}
                          {extraBadges.map((b, bIdx) => (
                            <span
                              key={bIdx}
                              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                            >
                              {b}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedNodeMap((prev) => ({
                                ...prev,
                                [key]: !prev[key],
                              }))
                            }
                            className="px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronDown className="w-3 h-3" />
                                <span>收起详情</span>
                              </>
                            ) : (
                              <>
                                <ChevronRight className="w-3 h-3" />
                                <span>查看/编辑节点</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveOutboundTo(idx, 0)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                            title="置顶"
                          >
                            <ChevronsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveOutboundTo(idx, idx - 1)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                            title="上移"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === outbounds.length - 1}
                            onClick={() => moveOutboundTo(idx, idx + 1)}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                            title="下移"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === outbounds.length - 1}
                            onClick={() =>
                              moveOutboundTo(idx, outbounds.length - 1)
                            }
                            className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                            title="置底"
                          >
                            <ChevronsDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOutboundAt(idx)}
                            className="p-1.5 rounded text-rose-400 hover:text-rose-300"
                            title="移除此节点"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Input
                              label="节点标签 (tag)"
                              value={item.tag || ""}
                              onChange={(e) =>
                                updateOutboundAt(idx, {
                                  ...item,
                                  tag: e.target.value,
                                })
                              }
                            />
                            <Input
                              label="服务器地址 (server)"
                              value={item.server || ""}
                              onChange={(e) =>
                                updateOutboundAt(idx, {
                                  ...item,
                                  server: e.target.value,
                                })
                              }
                            />
                            <Input
                              label="服务器端口 (server_port)"
                              type="number"
                              value={
                                item.server_port !== undefined
                                  ? String(item.server_port)
                                  : ""
                              }
                              onChange={(e) =>
                                updateOutboundAt(idx, {
                                  ...item,
                                  server_port: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </div>

                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="text-[10px] font-semibold text-slate-400 mb-1">
                              节点完整配置结构 (只读预览):
                            </div>
                            <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap break-all select-text">
                              {JSON.stringify(item, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 5. Direct Form Rendering for Log, Experimental, NTP, Certificate
 * ("log这类配置，理论上不需要那么复杂，那么就把相关组件直接渲染出来选择就完事了")
 * ========================================================================== */
interface BasicDirectTabPanelProps {
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  outboundTags: string[];
}

export const BasicDirectTabPanel: React.FC<BasicDirectTabPanelProps> = ({
  config,
  onChange,
  outboundTags,
}) => {
  const log = config.log || {};
  const exp = config.experimental || {};
  const cacheFile = exp.cache_file || {};
  const clashApi = exp.clash_api || {};
  const ntp = config.ntp || {};
  const cert = config.certificate || {};

  const updateLog = (
    patch: Partial<NonNullable<SingBoxVisualConfig["log"]>>,
  ) => {
    onChange({
      ...config,
      log: { ...log, ...patch },
    });
  };

  const updateExp = (
    patch: Partial<NonNullable<SingBoxVisualConfig["experimental"]>>,
  ) => {
    onChange({
      ...config,
      experimental: { ...exp, ...patch },
    });
  };

  const updateNtp = (
    patch: Partial<NonNullable<SingBoxVisualConfig["ntp"]>>,
  ) => {
    onChange({
      ...config,
      ntp: { ...ntp, ...patch },
    });
  };

  const updateCert = (
    patch: Partial<NonNullable<SingBoxVisualConfig["certificate"]>>,
  ) => {
    onChange({
      ...config,
      certificate: { ...cert, ...patch },
    });
  };

  return (
    <div className="space-y-4">
      {/* Direct Rendering: Log Section */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>日志配置 (log) — 直接选择即可生效</span>
          </h4>
          {Object.keys(log).length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...config, log: {} })}
              className="text-[11px] text-slate-400 hover:text-rose-300"
            >
              重置为空对象 &#123;&#125;
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                禁用日志 (disabled)
              </span>
              <span className="text-[10px] text-slate-500">
                关闭所有日志输出
              </span>
            </div>
            <Switch
              checked={Boolean(log.disabled)}
              onChange={(val) => updateLog({ disabled: val || undefined })}
            />
          </div>

          <Select
            label="日志级别 (log.level)"
            value={log.level || ""}
            onChange={(val) =>
              updateLog({
                level: (val || undefined) as NonNullable<
                  SingBoxVisualConfig["log"]
                >["level"],
              })
            }
            options={[
              { value: "", label: "未设置 (默认)" },
              { value: "trace", label: "trace (追踪)" },
              { value: "debug", label: "debug (调试)" },
              { value: "info", label: "info (常规信息 - 推荐)" },
              { value: "warn", label: "warn (警告)" },
              { value: "error", label: "error (错误)" },
              { value: "fatal", label: "fatal (致命)" },
              { value: "panic", label: "panic (崩溃)" },
            ]}
          />

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                输出时间戳 (timestamp)
              </span>
              <span className="text-[10px] text-slate-500">
                每行日志附带时间
              </span>
            </div>
            <Switch
              checked={Boolean(log.timestamp)}
              onChange={(val) => updateLog({ timestamp: val || undefined })}
            />
          </div>

          <Input
            label="日志文件路径 (log.output)"
            value={log.output || ""}
            onChange={(e) => updateLog({ output: e.target.value || undefined })}
            placeholder="留空输出到控制台"
          />
        </div>
      </div>

      {/* Direct Rendering: Experimental Cache & Clash API */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>实验性缓存与 Clash 面板接口 (experimental)</span>
          </h4>
          {Object.keys(exp).length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...config, experimental: {} })}
              className="text-[11px] text-slate-400 hover:text-rose-300"
            >
              重置为空对象 &#123;&#125;
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                启用缓存文件 (cache_file.enabled)
              </span>
              <span className="text-[10px] text-slate-500">
                本地持久化远程规则集 (.srs)
              </span>
            </div>
            <Switch
              checked={Boolean(cacheFile.enabled)}
              onChange={(val) =>
                updateExp({
                  cache_file: { ...cacheFile, enabled: val || undefined },
                })
              }
            />
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                持久化 FakeIP (store_fakeip)
              </span>
              <span className="text-[10px] text-slate-500">
                重启后保持 FakeIP 映射表
              </span>
            </div>
            <Switch
              checked={Boolean(cacheFile.store_fakeip)}
              onChange={(val) =>
                updateExp({
                  cache_file: {
                    ...cacheFile,
                    store_fakeip: val || undefined,
                  },
                })
              }
            />
          </div>

          <Input
            label="缓存文件路径 (cache_file.path)"
            value={cacheFile.path || ""}
            onChange={(e) =>
              updateExp({
                cache_file: {
                  ...cacheFile,
                  path: e.target.value || undefined,
                },
              })
            }
            placeholder="默认 cache.db"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/70">
          <Input
            label="Clash API 监听地址 (external_controller)"
            value={clashApi.external_controller || ""}
            onChange={(e) =>
              updateExp({
                clash_api: {
                  ...clashApi,
                  external_controller: e.target.value || undefined,
                },
              })
            }
            placeholder="如: 127.0.0.1:9090"
          />
          <Input
            label="Clash API 访问密钥 (secret)"
            value={clashApi.secret || ""}
            onChange={(e) =>
              updateExp({
                clash_api: {
                  ...clashApi,
                  secret: e.target.value || undefined,
                },
              })
            }
            placeholder="留空无密钥"
          />
          <Input
            label="默认路由模式 (default_mode)"
            value={clashApi.default_mode || ""}
            onChange={(e) =>
              updateExp({
                clash_api: {
                  ...clashApi,
                  default_mode: e.target.value || undefined,
                },
              })
            }
            placeholder="如: Rule"
          />
        </div>
      </div>

      {/* Direct Rendering: NTP & Certificate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200">
              NTP 时间同步 (ntp)
            </h4>
            <Switch
              checked={Boolean(ntp.enabled)}
              onChange={(val) => updateNtp({ enabled: val || undefined })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Input
              label="NTP 服务器 (ntp.server)"
              value={ntp.server || ""}
              onChange={(e) =>
                updateNtp({ server: e.target.value || undefined })
              }
              placeholder="如: time.apple.com"
            />
            <Input
              label="同步间隔 (ntp.interval)"
              value={ntp.interval || ""}
              onChange={(e) =>
                updateNtp({ interval: e.target.value || undefined })
              }
              placeholder="如: 30m"
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200">
              证书信任库与 Schema (certificate & $schema)
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Select
              label="系统根证书库 (certificate.store)"
              value={cert.store || ""}
              onChange={(val) =>
                updateCert({
                  store: (val || undefined) as NonNullable<
                    SingBoxVisualConfig["certificate"]
                  >["store"],
                })
              }
              options={[
                { value: "", label: "未设置 (默认)" },
                { value: "system", label: "系统根证书 (system)" },
                { value: "mozilla", label: "Mozilla 内置根证书 (mozilla)" },
                { value: "chrome", label: "Chrome 根证书 (chrome)" },
                { value: "none", label: "不加载默认证书 (none)" },
              ]}
            />
            <Input
              label="JSON Schema 引用 ($schema)"
              value={
                config.$schema || "https://sing-box.sagernet.org/schema.json"
              }
              onChange={(e) =>
                onChange({
                  ...config,
                  $schema:
                    e.target.value ||
                    "https://sing-box.sagernet.org/schema.json",
                })
              }
            />
          </div>
        </div>
      </div>

      {/* HTTP Clients Direct List */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-200">
              HTTP 客户端池 (http_clients) — 共{" "}
              {(config.http_clients || []).length} 个
            </h4>
            <p className="text-[11px] text-slate-400">
              供远程规则集下载等模块复用的 HTTP 客户端定义
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                onChange({
                  ...config,
                  http_clients: [
                    { tag: "direct" },
                    {
                      tag: "proxy",
                      detour:
                        outboundTags.find((t) => t !== "direct") || "proxy",
                    },
                  ],
                })
              }
            >
              + 一键生成 direct + proxy 客户端
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  ...config,
                  http_clients: [
                    ...(config.http_clients || []),
                    { tag: `client-${(config.http_clients || []).length + 1}` },
                  ],
                })
              }
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              新增客户端
            </Button>
          </div>
        </div>

        {(config.http_clients || []).length > 0 && (
          <div className="space-y-2">
            {(config.http_clients || []).map((hc, idx) => (
              <div
                key={`http-client-${idx}`}
                className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
              >
                <div className="sm:col-span-4">
                  <Input
                    label="标签 (tag)"
                    value={hc.tag || ""}
                    onChange={(e) => {
                      const next = [...(config.http_clients || [])];
                      next[idx] = { ...hc, tag: e.target.value };
                      onChange({ ...config, http_clients: next });
                    }}
                    placeholder="如: direct, proxy"
                  />
                </div>
                <div className="sm:col-span-4">
                  <Select
                    label="出站绕行 (detour)"
                    value={hc.detour || ""}
                    onChange={(val) => {
                      const next = [...(config.http_clients || [])];
                      next[idx] = { ...hc, detour: val || undefined };
                      onChange({ ...config, http_clients: next });
                    }}
                    options={[
                      { value: "", label: "直连 (无 detour)" },
                      ...outboundTags
                        .filter((t) => t !== "direct")
                        .map((t) => ({ value: t, label: t })),
                    ]}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Input
                    label="连接超时 (connect_timeout)"
                    value={hc.connect_timeout || ""}
                    onChange={(e) => {
                      const next = [...(config.http_clients || [])];
                      next[idx] = {
                        ...hc,
                        connect_timeout: e.target.value || undefined,
                      };
                      onChange({ ...config, http_clients: next });
                    }}
                    placeholder="如: 5s"
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end pb-1">
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...config,
                        http_clients: (config.http_clients || []).filter(
                          (_, i) => i !== idx,
                        ),
                      })
                    }
                    className="p-1.5 rounded text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
