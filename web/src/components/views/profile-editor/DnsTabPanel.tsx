import React from "react";

import {
  Plus,
  Trash2,
  Globe,
  Server,
  Sparkles,
  ArrowUp,
  ArrowDown,
  GitBranch,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";
import { PlatformType } from "../../../types/api";

import {
  SingBoxVisualConfig,
  DnsServerItem,
  RouteRuleItem,
  DnsRuleItem,
  collectMissingRuleSetTags,
  ensureRuleSetsInConfig,
  ensureDnsServers,
} from "./types";
import { CollapsibleToolbar } from "./CollapsibleToolbar";
import { RuleTreeEditor } from "./RuleTreeEditor";

import { moveArrayItem, isPlaintextIpForEncryptedDns } from "./shared";

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
  /** Quick view shows curated shortcuts only; experts see all raw fields. */
  quick?: boolean;
}

export const DnsTabPanel: React.FC<DnsTabPanelProps> = ({
  quick = false,
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
        defaultOpen={!!quick}
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

      {!quick && (
        <>
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

                    const incompatibleType = isPlaintextIpForEncryptedDns(
                      srv.type || "udp",
                      srv.server || "",
                    );

                    return (
                      <div
                        key={`dns-server-${idx}`}
                        className="p-3 rounded-lg bg-slate-950/75 border border-slate-800/90 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                      >
                        {incompatibleType && (
                          <div className="sm:col-span-12 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-200">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                            <span>
                              地址{" "}
                              <code className="font-mono">{srv.server}</code>{" "}
                              是纯明文 DNS 服务器，不提供加密 DNS（
                              {srv.type.toUpperCase()}
                              ）。启动时会因连接超时失败。 请改用{" "}
                              <code className="font-mono">udp</code>{" "}
                              类型，或更换为支持加密 DNS 的地址（如 1.1.1.1 /
                              8.8.8.8 / 223.5.5.5 / 1.12.12.12）。
                            </span>
                          </div>
                        )}
                        <div className="sm:col-span-3">
                          <Input
                            label={`#${idx + 1} 标签 (tag)`}
                            value={srv.tag || ""}
                            onChange={(e) =>
                              updateServerAt(idx, {
                                ...srv,
                                tag: e.target.value,
                              })
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
                      ...(!dns.final && fallbackTag
                        ? { final: fallbackTag }
                        : {}),
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
        </>
      )}
    </div>
  );
};
