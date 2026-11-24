import React from "react";

import {
  Plus,
  Trash2,
  Globe,
  Sparkles,
  Layers,
  ArrowUp,
  ArrowDown,
  GitBranch,
  Wand2,
} from "lucide-react";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";
import { PlatformType } from "../../../types/api";

import {
  SingBoxVisualConfig,
  RuleSetItem,
  RouteRuleItem,
  OFFICIAL_RULE_SET_PRESETS,
  collectMissingRuleSetTags,
  ensureRuleSetsInConfig,
} from "./types";
import { CollapsibleToolbar } from "./CollapsibleToolbar";
import { RuleTreeEditor } from "./RuleTreeEditor";

import { moveArrayItem } from "./shared";

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
  /** Quick view shows curated shortcuts only; experts see all raw fields. */
  quick?: boolean;
}

export const RouteTabPanel: React.FC<RouteTabPanelProps> = ({
  quick = false,
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
        defaultOpen={!!quick}
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

      {!quick && (
        <>
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
        </>
      )}
    </div>
  );
};

