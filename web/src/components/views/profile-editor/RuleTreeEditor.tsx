import React, { useState } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Filter,
  Sparkles,
  Copy,
  Smartphone,
  Monitor,
} from "lucide-react";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";
import { PlatformType } from "../../../types/api";
import {
  RouteRuleItem,
  DnsRuleItem,
  NestedRuleItem,
  OFFICIAL_RULE_SET_PRESETS,
} from "./types";
import { TagListInput } from "./TagListInput";

interface RuleTreeEditorProps {
  kind: "route" | "dns";
  platform: PlatformType;
  rules: (RouteRuleItem | DnsRuleItem)[];
  onChange: (next: (RouteRuleItem | DnsRuleItem)[]) => void;
  outboundTags: string[];
  dnsServerTags: string[];
  inboundTags: string[];
  ruleSetTags: string[];
}

const DNS_QUERY_TYPE_SUGGESTIONS = [
  { value: "A", label: "A" },
  { value: "AAAA", label: "AAAA" },
  { value: "CNAME", label: "CNAME" },
  { value: "HTTPS", label: "HTTPS" },
  { value: "TXT", label: "TXT" },
  { value: "SRV", label: "SRV" },
  { value: "PTR", label: "PTR" },
];

const PROTOCOL_SUGGESTIONS = [
  { value: "tls", label: "tls" },
  { value: "http", label: "http" },
  { value: "quic", label: "quic" },
  { value: "dns", label: "dns" },
  { value: "stun", label: "stun" },
  { value: "bittorrent", label: "bittorrent" },
  { value: "ssh", label: "ssh" },
  { value: "rdp", label: "rdp" },
  { value: "ntp", label: "ntp" },
];

const NETWORK_SUGGESTIONS = [
  { value: "tcp", label: "tcp" },
  { value: "udp", label: "udp" },
  { value: "icmp", label: "icmp" },
];

function summarizeCondition(rule: NestedRuleItem): string {
  if (rule.type === "logical") {
    const modeStr = (rule.mode || "and").toUpperCase();
    const count = Array.isArray(rule.rules) ? rule.rules.length : 0;
    return `逻辑组合 (${modeStr}, ${count} 条子规则)${rule.invert ? " [取反]" : ""}`;
  }

  const parts: string[] = [];
  if (rule.rule_set?.length)
    parts.push(`rule_set(${rule.rule_set.slice(0, 3).join(", ")}${rule.rule_set.length > 3 ? "..." : ""})`);
  if (rule.domain?.length)
    parts.push(`domain(${rule.domain.slice(0, 2).join(", ")}${rule.domain.length > 2 ? "..." : ""})`);
  if (rule.domain_suffix?.length)
    parts.push(`suffix(${rule.domain_suffix.slice(0, 3).join(", ")}${rule.domain_suffix.length > 3 ? "..." : ""})`);
  if (rule.domain_keyword?.length)
    parts.push(`keyword(${rule.domain_keyword.slice(0, 2).join(", ")})`);
  if (rule.domain_regex?.length)
    parts.push(`regex(${rule.domain_regex.length})`);
  if (rule.ip_cidr?.length)
    parts.push(`ip_cidr(${rule.ip_cidr.slice(0, 2).join(", ")})`);
  if (rule.ip_is_private) parts.push("私有IP");
  if (rule.query_type?.length)
    parts.push(`query_type(${rule.query_type.join(",")})`);
  if (rule.protocol?.length) parts.push(`protocol(${rule.protocol.join(",")})`);
  if (rule.port?.length) parts.push(`port(${rule.port.join(",")})`);
  if (rule.port_range?.length)
    parts.push(`port_range(${rule.port_range.join(",")})`);
  if (rule.process_name?.length)
    parts.push(`process(${rule.process_name.slice(0, 2).join(", ")})`);
  if (rule.process_path?.length)
    parts.push(`process_path(${rule.process_path.length})`);
  if (rule.package_name?.length)
    parts.push(`package(${rule.package_name.slice(0, 2).join(", ")})`);
  if (rule.clash_mode) parts.push(`clash_mode=${rule.clash_mode}`);
  if (rule.inbound?.length) parts.push(`inbound(${rule.inbound.join(",")})`);
  if (rule.network?.length) parts.push(`network(${rule.network.join(",")})`);

  if (parts.length === 0) {
    return "全匹配 / 无特定条件";
  }
  return parts.join(" + ") + (rule.invert ? " [取反]" : "");
}

function summarizeAction(
  rule: RouteRuleItem | DnsRuleItem,
  kind: "route" | "dns",
): { text: string; variant: "info" | "success" | "warning" | "danger" | "neutral" } {
  const act = rule.action || "route";
  if (kind === "route") {
    const r = rule as RouteRuleItem;
    switch (act) {
      case "sniff":
        return { text: "协议嗅探 (sniff)", variant: "info" };
      case "hijack-dns":
        return { text: "劫持 DNS (hijack-dns)", variant: "warning" };
      case "reject":
        return {
          text: `拦截拒绝 (reject${r.method ? `:${r.method}` : ""})`,
          variant: "danger",
        };
      case "resolve":
        return {
          text: `解析域名 (resolve${r.server ? ` → ${r.server}` : ""})`,
          variant: "info",
        };
      case "bypass":
        return {
          text: `绕过 (bypass${r.outbound ? ` → ${r.outbound}` : ""})`,
          variant: "neutral",
        };
      case "route-options":
        return { text: "路由选项 (route-options)", variant: "neutral" };
      default:
        return {
          text: `路由出站 → ${r.outbound || "direct"}`,
          variant: r.outbound === "direct" ? "success" : "info",
        };
    }
  } else {
    const d = rule as DnsRuleItem;
    switch (act) {
      case "reject":
        return {
          text: `拒绝解析 (reject${d.method ? `:${d.method}` : ""})`,
          variant: "danger",
        };
      case "predefined":
        return {
          text: `预定义响应 (${d.rcode || "NOERROR"})`,
          variant: "warning",
        };
      case "evaluate":
        return {
          text: `评估解析 → ${d.server || "-"}`,
          variant: "info",
        };
      case "respond":
        return { text: "直接响应 (respond)", variant: "neutral" };
      case "route-options":
        return { text: "DNS 选项 (route-options)", variant: "neutral" };
      default:
        return {
          text: `DNS 服务器 → ${d.server || "default"}`,
          variant: "info",
        };
    }
  }
}

interface ConditionFieldsEditorProps {
  kind: "route" | "dns";
  platform: PlatformType;
  item: NestedRuleItem;
  onChange: (next: NestedRuleItem) => void;
  inboundTags: string[];
  ruleSetSuggestions: { value: string; label?: string }[];
}

const ConditionFieldsEditor: React.FC<ConditionFieldsEditorProps> = ({
  kind,
  platform,
  item,
  onChange,
  inboundTags,
  ruleSetSuggestions,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(() =>
    Boolean(
      item.domain_regex?.length ||
        item.source_ip_cidr?.length ||
        item.source_ip_is_private ||
        item.source_port?.length ||
        item.source_port_range?.length ||
        item.port_range?.length ||
        item.inbound?.length ||
        item.ip_version ||
        item.clash_mode ||
        item.process_path?.length ||
        item.process_path_regex?.length ||
        item.package_name_regex?.length ||
        item.rule_set_ip_cidr_match_source ||
        item.query_dnssec ||
        item.match_response ||
        item.response_rcode,
    ),
  );

  const isAndroid = platform === "android";

  const updateField = <K extends keyof NestedRuleItem>(
    key: K,
    value: NestedRuleItem[K],
  ) => {
    const next: NestedRuleItem = { ...item };
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Primary matching fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TagListInput
          label="规则集匹配 (rule_set)"
          values={item.rule_set || []}
          onChange={(v) => updateField("rule_set", v)}
          placeholder="输入或点选下方规则集标签..."
          suggestions={ruleSetSuggestions.slice(0, 12)}
        />

        {kind === "dns" ? (
          <TagListInput
            label="DNS 查询类型 (query_type)"
            values={item.query_type || []}
            onChange={(v) => updateField("query_type", v)}
            placeholder="例如: A, AAAA, CNAME, HTTPS"
            suggestions={DNS_QUERY_TYPE_SUGGESTIONS}
          />
        ) : (
          <TagListInput
            label="探测协议 (protocol)"
            values={item.protocol || []}
            onChange={(v) => updateField("protocol", v)}
            placeholder="例如: dns, tls, http, quic, bittorrent"
            suggestions={PROTOCOL_SUGGESTIONS}
          />
        )}

        <TagListInput
          label="域名后缀匹配 (domain_suffix)"
          values={item.domain_suffix || []}
          onChange={(v) => updateField("domain_suffix", v)}
          placeholder="例如: .google, .io, .org, .dev, .ai, .app"
        />

        <TagListInput
          label="完整域名匹配 (domain)"
          values={item.domain || []}
          onChange={(v) => updateField("domain", v)}
          placeholder="例如: claude.ai, api.openai.com"
        />

        <TagListInput
          label="域名关键字匹配 (domain_keyword)"
          values={item.domain_keyword || []}
          onChange={(v) => updateField("domain_keyword", v)}
          placeholder="例如: google, github, openai"
        />

        <TagListInput
          label="目标 IP 段匹配 (ip_cidr)"
          values={item.ip_cidr || []}
          onChange={(v) => updateField("ip_cidr", v)}
          placeholder="例如: 1.1.1.1/32, 8.8.8.0/24, 2001:4860::/32"
        />
      </div>

      {/* Platform-Exclusive Matching Section (docs/v0.3.md 4.1) */}
      <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/90 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
            {isAndroid ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Android 平台专属包名分流规则</span>
              </>
            ) : (
              <>
                <Monitor className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  桌面端 ({platform.toUpperCase()}) 专属进程分流规则
                </span>
              </>
            )}
          </div>
          <span className="text-[10px] text-slate-500">
            自动适配目标平台 Schema 约束
          </span>
        </div>

        {isAndroid ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TagListInput
              label="Android 应用包名 (package_name)"
              values={item.package_name || []}
              onChange={(v) => updateField("package_name", v)}
              placeholder="例如: org.telegram.messenger, com.android.chrome"
            />
            <TagListInput
              label="Android 包名正则 (package_name_regex)"
              values={item.package_name_regex || []}
              onChange={(v) => updateField("package_name_regex", v)}
              placeholder="例如: ^com\\.google\\..*"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TagListInput
              label="进程名称 (process_name)"
              values={item.process_name || []}
              onChange={(v) => updateField("process_name", v)}
              placeholder="例如: curl, git, chrome, Code"
            />
            <TagListInput
              label="进程完整路径 (process_path)"
              values={item.process_path || []}
              onChange={(v) => updateField("process_path", v)}
              placeholder="例如: /usr/bin/curl, C:\\Program Files\\..."
            />
            <TagListInput
              label="进程路径正则 (process_path_regex)"
              values={item.process_path_regex || []}
              onChange={(v) => updateField("process_path_regex", v)}
              placeholder="例如: .*/Steam/.*"
            />
          </div>
        )}
      </div>

      {/* Quick Boolean Switches + Port / Network */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-300 block">
              私有 IP 匹配 (ip_is_private)
            </span>
            <span className="text-[10px] text-slate-500">
              匹配局域网 / 内网保留地址
            </span>
          </div>
          <Switch
            checked={Boolean(item.ip_is_private)}
            onChange={(val) => updateField("ip_is_private", val || undefined)}
          />
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-300 block">
              条件结果取反 (invert)
            </span>
            <span className="text-[10px] text-slate-500">
              反转当前规则的匹配结果
            </span>
          </div>
          <Switch
            checked={Boolean(item.invert)}
            onChange={(val) => updateField("invert", val || undefined)}
          />
        </div>

        <TagListInput
          label="目标端口 (port)"
          values={item.port || []}
          onChange={() => {}}
          numeric
          onChangeNumeric={(nums) => updateField("port", nums)}
          placeholder="例如: 53, 80, 443"
        />
      </div>

      {/* Toggle More Condition Fields */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
        >
          {showAdvanced ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          <span>
            {showAdvanced
              ? "收起更多高级匹配条件"
              : "展开更多高级匹配条件 (网络类型 / 入站 / 端口范围 / 正则 / Clash 模式等)"}
          </span>
        </button>

        {showAdvanced && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TagListInput
              label="域名正则表达式 (domain_regex)"
              values={item.domain_regex || []}
              onChange={(v) => updateField("domain_regex", v)}
              placeholder="例如: ^.+\\.example\\.com$"
            />

            <TagListInput
              label="网络协议类型 (network)"
              values={item.network || []}
              onChange={(v) => updateField("network", v)}
              placeholder="tcp 或 udp"
              suggestions={NETWORK_SUGGESTIONS}
            />

            <TagListInput
              label="指定入站标签 (inbound)"
              values={item.inbound || []}
              onChange={(v) => updateField("inbound", v)}
              placeholder="入站 tag，如 tun-in, mixed-in"
              suggestions={inboundTags.map((t) => ({ value: t, label: t }))}
            />

            <TagListInput
              label="端口范围 (port_range)"
              values={item.port_range || []}
              onChange={(v) => updateField("port_range", v)}
              placeholder="例如: 1000:2000, :3000, 4000:"
            />

            <TagListInput
              label="源 IP 段 (source_ip_cidr)"
              values={item.source_ip_cidr || []}
              onChange={(v) => updateField("source_ip_cidr", v)}
              placeholder="例如: 192.168.1.0/24"
            />

            <div className="grid grid-cols-2 gap-2">
              <Select
                label="IP 协议版本 (ip_version)"
                value={item.ip_version ? String(item.ip_version) : ""}
                onChange={(val) =>
                  updateField(
                    "ip_version",
                    val === "4" ? 4 : val === "6" ? 6 : undefined,
                  )
                }
                options={[
                  { value: "", label: "不限 (IPv4 & IPv6)" },
                  { value: "4", label: "仅 IPv4 (4)" },
                  { value: "6", label: "仅 IPv6 (6)" },
                ]}
              />

              <Input
                label="Clash 模式 (clash_mode)"
                value={item.clash_mode || ""}
                onChange={(e) =>
                  updateField("clash_mode", e.target.value || undefined)
                }
                placeholder="如: Direct / Global / Rule"
              />
            </div>

            {kind === "dns" && (
              <>
                <TagListInput
                  label="探测协议 (protocol)"
                  values={item.protocol || []}
                  onChange={(v) => updateField("protocol", v)}
                  placeholder="例如: dns, tls, http, quic"
                  suggestions={PROTOCOL_SUGGESTIONS}
                />
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-slate-300 block">
                      匹配响应 (match_response)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      对 DNS 响应结果进行匹配
                    </span>
                  </div>
                  <Switch
                    checked={Boolean(item.match_response)}
                    onChange={(val) =>
                      updateField("match_response", val || undefined)
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const RuleTreeEditor: React.FC<RuleTreeEditorProps> = ({
  kind,
  platform,
  rules,
  onChange,
  outboundTags,
  dnsServerTags,
  inboundTags,
  ruleSetTags,
}) => {
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({
    "0": true,
  });

  // Merge user's rule_set tags with official presets for quick selection
  const ruleSetSuggestions = React.useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label?: string }[] = [];
    for (const t of ruleSetTags) {
      if (t && !seen.has(t)) {
        seen.add(t);
        list.push({ value: t, label: t });
      }
    }
    for (const preset of OFFICIAL_RULE_SET_PRESETS) {
      if (!seen.has(preset.tag)) {
        seen.add(preset.tag);
        list.push({ value: preset.tag, label: preset.tag });
      }
    }
    return list;
  }, [ruleSetTags]);

  const toggleExpand = (key: string) => {
    setExpandedMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const defaultTargetTag =
    kind === "route"
      ? outboundTags[0] || "proxy"
      : dnsServerTags[0] || "remote-dns";

  const addTopLevelNormalRule = () => {
    const newRule: RouteRuleItem | DnsRuleItem =
      kind === "route"
        ? { domain_suffix: [".example.com"], outbound: defaultTargetTag }
        : { domain_suffix: [".cn"], server: defaultTargetTag };
    const nextIdx = rules.length;
    onChange([...rules, newRule]);
    setExpandedMap((prev) => ({ ...prev, [String(nextIdx)]: true }));
  };

  const addTopLevelLogicalRule = () => {
    const newRule: RouteRuleItem | DnsRuleItem =
      kind === "route"
        ? {
            type: "logical",
            mode: "and",
            outbound: defaultTargetTag,
            rules: [
              { network: ["tcp", "udp"] },
              {
                type: "logical",
                mode: "or",
                rules: [
                  { rule_set: ["geosite-google", "geosite-github"] },
                  { domain_suffix: [".io", ".dev", ".ai"] },
                ],
              },
            ],
          }
        : {
            server: dnsServerTags[0] || "remote-dns",
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
                    domain_suffix: [
                      ".io",
                      ".google",
                      ".org",
                      ".dev",
                      ".ai",
                      ".app",
                    ],
                  },
                  {
                    domain: ["claude.ai"],
                  },
                ],
              },
            ],
          };
    const nextIdx = rules.length;
    onChange([...rules, newRule]);
    setExpandedMap((prev) => ({ ...prev, [String(nextIdx)]: true }));
  };

  const insertPresetRule = (presetRule: RouteRuleItem | DnsRuleItem) => {
    const nextIdx = rules.length;
    onChange([...rules, presetRule]);
    setExpandedMap((prev) => ({ ...prev, [String(nextIdx)]: true }));
  };

  const updateTopRule = (idx: number, nextRule: RouteRuleItem | DnsRuleItem) => {
    const next = [...rules];
    next[idx] = nextRule;
    onChange(next);
  };

  const moveTopRule = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    const [removed] = next.splice(idx, 1);
    next.splice(target, 0, removed);
    onChange(next);
  };

  const duplicateTopRule = (idx: number) => {
    const copy = JSON.parse(JSON.stringify(rules[idx])) as
      | RouteRuleItem
      | DnsRuleItem;
    const next = [...rules];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  };

  const deleteTopRule = (idx: number) => {
    onChange(rules.filter((_, i) => i !== idx));
  };

  // Renders nested child rules at depth 1 or depth 2 (supports up to 2 levels of nesting)
  const renderNestedRulesList = (
    parentRule: NestedRuleItem,
    onUpdateParent: (nextParent: NestedRuleItem) => void,
    depth: 1 | 2,
    pathPrefix: string,
  ) => {
    const children = Array.isArray(parentRule.rules) ? parentRule.rules : [];

    const updateChildAt = (cIdx: number, nextChild: NestedRuleItem) => {
      const nextChildren = [...children];
      nextChildren[cIdx] = nextChild;
      onUpdateParent({ ...parentRule, rules: nextChildren });
    };

    const removeChildAt = (cIdx: number) => {
      onUpdateParent({
        ...parentRule,
        rules: children.filter((_, i) => i !== cIdx),
      });
    };

    const moveChildAt = (cIdx: number, dir: -1 | 1) => {
      const target = cIdx + dir;
      if (target < 0 || target >= children.length) return;
      const nextChildren = [...children];
      const [removed] = nextChildren.splice(cIdx, 1);
      nextChildren.splice(target, 0, removed);
      onUpdateParent({ ...parentRule, rules: nextChildren });
    };

    const addLeafChild = () => {
      const leaf: NestedRuleItem =
        kind === "dns"
          ? { domain_suffix: [".example.com"] }
          : { domain_suffix: [".example.com"] };
      onUpdateParent({ ...parentRule, rules: [...children, leaf] });
    };

    const addLevel2LogicalChild = () => {
      const nestedLogical: NestedRuleItem = {
        type: "logical",
        mode: "or",
        rules: [
          {
            rule_set: ["geosite-google", "geosite-github", "geosite-openai"],
          },
          {
            domain_suffix: [".io", ".dev", ".ai", ".app"],
          },
          {
            domain: ["claude.ai"],
          },
        ],
      };
      onUpdateParent({ ...parentRule, rules: [...children, nestedLogical] });
    };

    return (
      <div
        className={`space-y-3 pl-3 sm:pl-4 border-l-2 ${
          depth === 1 ? "border-sky-500/40" : "border-indigo-500/40"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={depth === 1 ? "info" : "neutral"} size="sm">
              {depth === 1 ? "第 1 层子规则列表" : "第 2 层嵌套子规则列表"}
            </Badge>
            <span className="text-[11px] text-slate-400">
              父逻辑关系:{" "}
              <strong className="text-sky-300 font-mono">
                {(parentRule.mode || "and").toUpperCase()}
              </strong>{" "}
              ({parentRule.mode === "or" ? "满足任一子规则即可" : "需同时满足所有子规则"})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={addLeafChild}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              添加条件子规则
            </Button>
            {depth === 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={addLevel2LogicalChild}
                icon={<GitBranch className="w-3.5 h-3.5 text-indigo-400" />}
              >
                添加二级嵌套逻辑规则 (and/or)
              </Button>
            )}
          </div>
        </div>

        {children.length === 0 && (
          <div className="p-3 rounded-lg bg-slate-950/60 border border-dashed border-slate-800 text-center text-xs text-slate-500">
            当前逻辑组暂无子规则，请点击上方按钮添加条件子规则
            {depth === 1 ? "或二级嵌套逻辑规则" : ""}。
          </div>
        )}

        {children.map((child, cIdx) => {
          const isChildLogical = child.type === "logical";
          const childKey = `${pathPrefix}-${cIdx}`;
          const isChildExpanded = expandedMap[childKey] ?? true;

          return (
            <div
              key={childKey}
              className={`rounded-xl border transition-all ${
                isChildLogical
                  ? "bg-indigo-950/20 border-indigo-500/30"
                  : "bg-slate-900/70 border-slate-800"
              }`}
            >
              {/* Sub-rule header */}
              <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-800/70">
                <button
                  type="button"
                  onClick={() => toggleExpand(childKey)}
                  className="flex items-center gap-2 text-left min-w-0 flex-1"
                >
                  {isChildExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    #{cIdx + 1}
                  </span>
                  {isChildLogical ? (
                    <Badge variant="info" size="sm">
                      二级逻辑组 ({(child.mode || "or").toUpperCase()})
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      条件子规则
                    </Badge>
                  )}
                  <span className="text-xs text-slate-200 truncate font-mono">
                    {summarizeCondition(child)}
                  </span>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {depth === 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isChildLogical) {
                          updateChildAt(cIdx, {
                            domain_suffix: [".example.com"],
                          });
                        } else {
                          updateChildAt(cIdx, {
                            type: "logical",
                            mode: "or",
                            rules: [{ ...child }],
                          });
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="切换普通条件子规则与二级逻辑组"
                    >
                      {isChildLogical ? "转为普通子规则" : "转为二级逻辑组"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={cIdx === 0}
                    onClick={() => moveChildAt(cIdx, -1)}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
                    title="上移"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={cIdx === children.length - 1}
                    onClick={() => moveChildAt(cIdx, 1)}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
                    title="下移"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeChildAt(cIdx)}
                    className="p-1 rounded text-rose-400 hover:text-rose-300"
                    title="删除此子规则"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sub-rule body */}
              {isChildExpanded && (
                <div className="p-3 space-y-3">
                  {isChildLogical ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                        <Select
                          label="二级逻辑模式 (mode)"
                          value={child.mode || "or"}
                          onChange={(val) =>
                            updateChildAt(cIdx, {
                              ...child,
                              type: "logical",
                              mode: val as "and" | "or",
                            })
                          }
                          options={[
                            {
                              value: "or",
                              label: "OR (满足以下任一子规则即命中)",
                            },
                            {
                              value: "and",
                              label: "AND (必须同时满足以下所有子规则)",
                            },
                          ]}
                        />
                        <div className="flex items-center justify-between px-2 pt-4">
                          <span className="text-xs text-slate-300">
                            整组逻辑取反 (invert)
                          </span>
                          <Switch
                            checked={Boolean(child.invert)}
                            onChange={(val) =>
                              updateChildAt(cIdx, {
                                ...child,
                                invert: val || undefined,
                              })
                            }
                          />
                        </div>
                      </div>

                      {renderNestedRulesList(
                        child,
                        (nextGrandParent) =>
                          updateChildAt(cIdx, nextGrandParent),
                        2,
                        childKey,
                      )}
                    </>
                  ) : (
                    <ConditionFieldsEditor
                      kind={kind}
                      platform={platform}
                      item={child}
                      onChange={(nextLeaf) => updateChildAt(cIdx, nextLeaf)}
                      inboundTags={inboundTags}
                      ruleSetSuggestions={ruleSetSuggestions}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar & Quick Templates */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-sky-400" />
              <span>
                {kind === "route"
                  ? "路由分流规则链 (route.rules)"
                  : "DNS 分流规则链 (dns.rules)"}{" "}
                — 共 {rules.length} 条规则
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              按自上而下顺序依次匹配，支持普通规则与最多 2 层嵌套的逻辑组合规则 (
              <code className="text-sky-300">type: &quot;logical&quot;</code>,{" "}
              <code className="text-sky-300">mode: &quot;and&quot; | &quot;or&quot;</code>)。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={addTopLevelNormalRule}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              新增普通规则
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={addTopLevelLogicalRule}
              icon={<GitBranch className="w-3.5 h-3.5 text-sky-400" />}
            >
              新增双层嵌套逻辑规则
            </Button>
          </div>
        </div>

        {/* Quick Preset Templates Bar */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            快捷插入常用规则模板:
          </span>

          {kind === "route" ? (
            <>
              <button
                type="button"
                onClick={() => insertPresetRule({ action: "sniff" })}
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
              >
                + 协议嗅探 (sniff)
              </button>
              <button
                type="button"
                onClick={() =>
                  insertPresetRule({
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
                  insertPresetRule({
                    rule_set: ["geosite-category-ads-all"],
                    action: "reject",
                  })
                }
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
              >
                + 广告拦截 (reject)
              </button>
              <button
                type="button"
                onClick={() =>
                  insertPresetRule({
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
                  insertPresetRule({
                    rule_set: ["geosite-cn", "geoip-cn"],
                    outbound: "direct",
                  })
                }
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
              >
                + 国内域名/IP 直连 (geosite-cn + geoip-cn)
              </button>
              <button
                type="button"
                onClick={() =>
                  insertPresetRule({
                    rule_set: ["geosite-geolocation-!cn"],
                    outbound: defaultTargetTag,
                  })
                }
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
              >
                + 非中国大陆走代理 (!cn)
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={addTopLevelLogicalRule}
                className="px-2 py-1 rounded-md text-[11px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 transition-colors"
              >
                + 海外常见域名双层逻辑分流 (A/AAAA/CNAME + OR 规则组 → remote-dns)
              </button>
              <button
                type="button"
                onClick={() =>
                  insertPresetRule({
                    rule_set: ["geosite-cn"],
                    server:
                      dnsServerTags.find((t) => t.includes("local") || t.includes("cn")) ||
                      dnsServerTags[0] ||
                      "local-dns",
                  })
                }
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
              >
                + 国内域名直连解析 (geosite-cn)
              </button>
              <button
                type="button"
                onClick={() =>
                  insertPresetRule({
                    rule_set: ["geosite-category-ads-all"],
                    action: "reject",
                  })
                }
                className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70 transition-colors"
              >
                + 广告域名拒绝解析 (reject)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Empty State */}
      {rules.length === 0 && (
        <div className="p-8 rounded-xl bg-slate-950/50 border border-dashed border-slate-800 text-center space-y-2">
          <p className="text-xs text-slate-400">
            当前暂无{kind === "route" ? "路由" : "DNS"}分流规则。
          </p>
          <p className="text-[11px] text-slate-500">
            点击上方「新增普通规则」、「新增双层嵌套逻辑规则」或快捷模板即可开始可视化编排。
          </p>
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-3">
        {rules.map((rule, idx) => {
          const isLogical = rule.type === "logical";
          const key = String(idx);
          const isExpanded = expandedMap[key] ?? false;
          const actionSummary = summarizeAction(rule, kind);

          return (
            <div
              key={key}
              className={`rounded-xl border transition-all ${
                isLogical
                  ? "bg-slate-900/90 border-sky-500/40 shadow-sm shadow-sky-500/5"
                  : "bg-slate-900/60 border-slate-800"
              }`}
            >
              {/* Rule Card Header */}
              <div className="px-4 py-2.5 flex items-center justify-between gap-2 border-b border-slate-800/80">
                <button
                  type="button"
                  onClick={() => toggleExpand(key)}
                  className="flex items-center gap-2 text-left min-w-0 flex-1"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="text-xs font-mono font-bold text-slate-400 shrink-0">
                    #{idx + 1}
                  </span>
                  {isLogical ? (
                    <Badge variant="info" size="sm">
                      逻辑组合 ({(rule.mode || "and").toUpperCase()})
                    </Badge>
                  ) : (
                    <Badge variant="neutral" size="sm">
                      普通规则
                    </Badge>
                  )}
                  <span className="text-xs text-slate-200 truncate font-mono">
                    {summarizeCondition(rule)}
                  </span>
                  <Badge variant={actionSummary.variant} size="sm">
                    {actionSummary.text}
                  </Badge>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (isLogical) {
                        const {
                          type: _t,
                          mode: _m,
                          rules: _r,
                          ...rest
                        } = rule;
                        updateTopRule(idx, {
                          ...rest,
                          domain_suffix: [".example.com"],
                        });
                      } else {
                        const {
                          action,
                          outbound,
                          server,
                          method,
                          rcode,
                          ...condRest
                        } = rule as RouteRuleItem & DnsRuleItem;
                        const childCond: NestedRuleItem =
                          Object.keys(condRest).length > 0
                            ? condRest
                            : { domain_suffix: [".example.com"] };
                        updateTopRule(idx, {
                          type: "logical",
                          mode: "and",
                          ...(action ? { action } : {}),
                          ...(outbound ? { outbound } : {}),
                          ...(server ? { server } : {}),
                          ...(method ? { method } : {}),
                          ...(rcode ? { rcode } : {}),
                          rules: [childCond],
                        });
                      }
                      setExpandedMap((prev) => ({ ...prev, [key]: true }));
                    }}
                    className="px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {isLogical ? "转为普通规则" : "转为逻辑组合"}
                  </button>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveTopRule(idx, -1)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                    title="上移规则"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === rules.length - 1}
                    onClick={() => moveTopRule(idx, 1)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                    title="下移规则"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateTopRule(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="克隆此规则"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTopRule(idx)}
                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    title="删除此规则"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Rule Card Body */}
              {isExpanded && (
                <div className="p-4 space-y-4">
                  {/* Top-Level Rule Action Editor */}
                  <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-3">
                    <div className="text-xs font-semibold text-sky-400">
                      规则执行动作 (Rule Action)
                    </div>

                    {kind === "route" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Select
                          label="动作类型 (action)"
                          value={(rule as RouteRuleItem).action || "route"}
                          onChange={(val) => {
                            const next: RouteRuleItem = {
                              ...(rule as RouteRuleItem),
                              action: val as RouteRuleItem["action"],
                            };
                            if (val === "route" && !next.outbound) {
                              next.outbound = defaultTargetTag;
                            }
                            updateTopRule(idx, next);
                          }}
                          options={[
                            {
                              value: "route",
                              label: "路由至出站 (route - 默认)",
                            },
                            {
                              value: "reject",
                              label: "拦截连接 (reject)",
                            },
                            {
                              value: "hijack-dns",
                              label: "劫持 DNS 请求 (hijack-dns)",
                            },
                            {
                              value: "sniff",
                              label: "协议流量嗅探 (sniff)",
                            },
                            {
                              value: "resolve",
                              label: "预先解析域名 (resolve)",
                            },
                            {
                              value: "bypass",
                              label: "绕过路由 (bypass)",
                            },
                            {
                              value: "route-options",
                              label: "修改路由选项 (route-options)",
                            },
                          ]}
                        />

                        {((rule as RouteRuleItem).action || "route") ===
                          "route" && (
                          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Select
                              label="目标出站节点/策略组 (outbound)"
                              value={
                                (rule as RouteRuleItem).outbound ||
                                defaultTargetTag
                              }
                              onChange={(val) =>
                                updateTopRule(idx, {
                                  ...rule,
                                  outbound: val,
                                })
                              }
                              options={[
                                ...outboundTags.map((t) => ({
                                  value: t,
                                  label:
                                    t === "direct"
                                      ? "direct (直连出站)"
                                      : t,
                                })),
                                ...(outboundTags.includes(
                                  (rule as RouteRuleItem).outbound || "",
                                ) || !(rule as RouteRuleItem).outbound
                                  ? []
                                  : [
                                      {
                                        value: (rule as RouteRuleItem)
                                          .outbound!,
                                        label: `${(rule as RouteRuleItem).outbound} (自定义标签)`,
                                      },
                                    ]),
                              ]}
                            />
                            <Input
                              label="或手动输入出站 Tag (outbound)"
                              value={(rule as RouteRuleItem).outbound || ""}
                              onChange={(e) =>
                                updateTopRule(idx, {
                                  ...rule,
                                  outbound: e.target.value,
                                })
                              }
                              placeholder="例如: proxy, direct, AUTO-Test"
                            />
                          </div>
                        )}

                        {(rule as RouteRuleItem).action === "reject" && (
                          <Select
                            label="拒绝方式 (method)"
                            value={(rule as RouteRuleItem).method || "default"}
                            onChange={(val) =>
                              updateTopRule(idx, {
                                ...rule,
                                method: val as RouteRuleItem["method"],
                              })
                            }
                            options={[
                              {
                                value: "default",
                                label: "默认拒绝 (default - TCP RST / ICMP)",
                              },
                              {
                                value: "drop",
                                label: "静默丢弃数据包 (drop)",
                              },
                              {
                                value: "reply",
                                label: "返回拒绝响应 (reply)",
                              },
                            ]}
                          />
                        )}

                        {(rule as RouteRuleItem).action === "sniff" && (
                          <Input
                            label="嗅探超时时间 (timeout)"
                            value={(rule as RouteRuleItem).timeout || ""}
                            onChange={(e) =>
                              updateTopRule(idx, {
                                ...rule,
                                timeout: e.target.value || undefined,
                              })
                            }
                            placeholder="例如: 300ms, 1s (留空默认)"
                          />
                        )}

                        {(rule as RouteRuleItem).action === "resolve" && (
                          <>
                            <Select
                              label="指定 DNS 服务器 (server)"
                              value={(rule as RouteRuleItem).server || ""}
                              onChange={(val) =>
                                updateTopRule(idx, {
                                  ...rule,
                                  server: val || undefined,
                                })
                              }
                              options={[
                                { value: "", label: "使用默认 DNS 服务器" },
                                ...dnsServerTags.map((t) => ({
                                  value: t,
                                  label: t,
                                })),
                              ]}
                            />
                            <Select
                              label="解析策略 (strategy)"
                              value={(rule as RouteRuleItem).strategy || ""}
                              onChange={(val) =>
                                updateTopRule(idx, {
                                  ...rule,
                                  strategy: val as RouteRuleItem["strategy"],
                                })
                              }
                              options={[
                                { value: "", label: "默认策略" },
                                {
                                  value: "prefer_ipv4",
                                  label: "优先 IPv4 (prefer_ipv4)",
                                },
                                {
                                  value: "prefer_ipv6",
                                  label: "优先 IPv6 (prefer_ipv6)",
                                },
                                {
                                  value: "ipv4_only",
                                  label: "仅 IPv4 (ipv4_only)",
                                },
                                {
                                  value: "ipv6_only",
                                  label: "仅 IPv6 (ipv6_only)",
                                },
                              ]}
                            />
                          </>
                        )}
                      </div>
                    ) : (
                      /* DNS Rule Action Editor */
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Select
                          label="DNS 动作类型 (action)"
                          value={(rule as DnsRuleItem).action || "route"}
                          onChange={(val) => {
                            const next: DnsRuleItem = {
                              ...(rule as DnsRuleItem),
                              action: val as DnsRuleItem["action"],
                            };
                            if (val === "route" && !next.server) {
                              next.server = defaultTargetTag;
                            }
                            updateTopRule(idx, next);
                          }}
                          options={[
                            {
                              value: "route",
                              label: "路由至指定 DNS 服务器 (route - 默认)",
                            },
                            {
                              value: "reject",
                              label: "拒绝 DNS 查询 (reject)",
                            },
                            {
                              value: "predefined",
                              label: "返回预定义 DNS 响应 (predefined)",
                            },
                            {
                              value: "evaluate",
                              label: "预先评估解析 (evaluate)",
                            },
                            {
                              value: "respond",
                              label: "返回已评估响应 (respond)",
                            },
                            {
                              value: "route-options",
                              label: "修改 DNS 路由选项 (route-options)",
                            },
                          ]}
                        />

                        {((rule as DnsRuleItem).action || "route") ===
                          "route" && (
                          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Select
                              label="目标 DNS 服务器 (server)"
                              value={
                                (rule as DnsRuleItem).server ||
                                defaultTargetTag
                              }
                              onChange={(val) =>
                                updateTopRule(idx, {
                                  ...rule,
                                  server: val,
                                })
                              }
                              options={[
                                ...dnsServerTags.map((t) => ({
                                  value: t,
                                  label: t,
                                })),
                                ...(dnsServerTags.includes(
                                  (rule as DnsRuleItem).server || "",
                                ) || !(rule as DnsRuleItem).server
                                  ? []
                                  : [
                                      {
                                        value: (rule as DnsRuleItem).server!,
                                        label: `${(rule as DnsRuleItem).server} (自定义标签)`,
                                      },
                                    ]),
                              ]}
                            />
                            <Input
                              label="手动输入 DNS Server Tag"
                              value={(rule as DnsRuleItem).server || ""}
                              onChange={(e) =>
                                updateTopRule(idx, {
                                  ...rule,
                                  server: e.target.value,
                                })
                              }
                              placeholder="例如: remote-dns, local-dns"
                            />
                            <div className="flex items-center justify-between px-2.5 pt-4">
                              <span className="text-xs text-slate-300">
                                禁用缓存 (disable_cache)
                              </span>
                              <Switch
                                checked={Boolean(
                                  (rule as DnsRuleItem).disable_cache,
                                )}
                                onChange={(val) =>
                                  updateTopRule(idx, {
                                    ...rule,
                                    disable_cache: val || undefined,
                                  })
                                }
                              />
                            </div>
                          </div>
                        )}

                        {(rule as DnsRuleItem).action === "reject" && (
                          <Select
                            label="拒绝方式 (method)"
                            value={(rule as DnsRuleItem).method || "default"}
                            onChange={(val) =>
                              updateTopRule(idx, {
                                ...rule,
                                method: val as DnsRuleItem["method"],
                              })
                            }
                            options={[
                              {
                                value: "default",
                                label: "默认拒绝 (REFUSED)",
                              },
                              { value: "drop", label: "静默丢弃 (drop)" },
                              { value: "reply", label: "返回响应 (reply)" },
                            ]}
                          />
                        )}

                        {(rule as DnsRuleItem).action === "predefined" && (
                          <Select
                            label="预定义响应状态码 (rcode)"
                            value={(rule as DnsRuleItem).rcode || "NOERROR"}
                            onChange={(val) =>
                              updateTopRule(idx, {
                                ...rule,
                                rcode: val as DnsRuleItem["rcode"],
                              })
                            }
                            options={[
                              { value: "NOERROR", label: "NOERROR (空成功响应)" },
                              {
                                value: "NXDOMAIN",
                                label: "NXDOMAIN (域名不存在)",
                              },
                              { value: "REFUSED", label: "REFUSED (拒绝查询)" },
                              {
                                value: "SERVFAIL",
                                label: "SERVFAIL (服务器失败)",
                              },
                              { value: "FORMERR", label: "FORMERR (格式错误)" },
                              { value: "NOTIMP", label: "NOTIMP (未实现)" },
                            ]}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Rule Matching Conditions or 2-Level Logical Tree */}
                  {isLogical ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-sky-950/20 border border-sky-500/30">
                        <Select
                          label="顶层逻辑组合模式 (mode)"
                          value={rule.mode || "and"}
                          onChange={(val) =>
                            updateTopRule(idx, {
                              ...rule,
                              type: "logical",
                              mode: val as "and" | "or",
                            })
                          }
                          options={[
                            {
                              value: "and",
                              label: "AND (同时满足下方所有子规则)",
                            },
                            {
                              value: "or",
                              label: "OR (满足下方任一子规则即命中)",
                            },
                          ]}
                        />
                        <div className="flex items-center justify-between px-3 pt-4">
                          <div>
                            <span className="text-xs font-medium text-slate-200 block">
                              逻辑组合结果取反 (invert)
                            </span>
                            <span className="text-[10px] text-slate-400">
                              对整个逻辑组合的布尔结果取反
                            </span>
                          </div>
                          <Switch
                            checked={Boolean(rule.invert)}
                            onChange={(val) =>
                              updateTopRule(idx, {
                                ...rule,
                                invert: val || undefined,
                              })
                            }
                          />
                        </div>
                      </div>

                      {renderNestedRulesList(
                        rule,
                        (nextLogicalParent) =>
                          updateTopRule(
                            idx,
                            nextLogicalParent as RouteRuleItem | DnsRuleItem,
                          ),
                        1,
                        key,
                      )}
                    </div>
                  ) : (
                    <ConditionFieldsEditor
                      kind={kind}
                      platform={platform}
                      item={rule}
                      onChange={(nextCond) =>
                        updateTopRule(
                          idx,
                          nextCond as RouteRuleItem | DnsRuleItem,
                        )
                      }
                      inboundTags={inboundTags}
                      ruleSetSuggestions={ruleSetSuggestions}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
