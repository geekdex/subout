import React from "react";
import { Sparkles, Globe2, Zap, ShieldCheck } from "lucide-react";
import {
  RouteRuleItem,
  SingBoxVisualConfig,
  ensureRuleSetsInConfig,
} from "./types";

export type RoutingStrategy = "smart" | "gfw" | "global" | "direct_all";

interface QuickRoutingStrategiesProps {
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  /** Tag of the proxy outbound used as the default route target. */
  proxyTag?: string;
}

const STRATEGIES: Array<{
  id: RoutingStrategy;
  title: string;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: "smart",
    title: "智能分流",
    desc: "国内直连、国外走代理，日常推荐",
    icon: <Sparkles className="w-3.5 h-3.5 text-sky-400" />,
  },
  {
    id: "gfw",
    title: "GFW 列表代理",
    desc: "仅被阻断域名走代理，最省流量",
    icon: <Globe2 className="w-3.5 h-3.5 text-indigo-400" />,
  },
  {
    id: "global",
    title: "全部代理",
    desc: "所有非局域网流量走代理出口",
    icon: <Zap className="w-3.5 h-3.5 text-purple-400" />,
  },
  {
    id: "direct_all",
    title: "全部直连",
    desc: "临时暂停代理，全部流量直连",
    icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />,
  },
];

/**
 * Strategies that change the default outbound globally must start from a clean
 * rule list; domain-based strategies can safely append to the user's rules.
 * The UI surfaces this distinction before the user clicks.
 */
export const REPLACES_RULES: Record<RoutingStrategy, boolean> = {
  smart: false,
  gfw: false,
  global: true,
  direct_all: true,
};

/** Rules every strategy needs: local traffic, DNS hijack and QUIC blocking. */
function baseRules(): RouteRuleItem[] {
  return [
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
  ];
}

/**
 * Translate a user-facing strategy into explicit sing-box route fields.
 * No `route.mode` is written — the generated config stays WYSIWYG and valid
 * against the official schema.
 */
export function applyRoutingStrategy(
  config: SingBoxVisualConfig,
  strategy: RoutingStrategy,
  proxyTag = "proxy",
): SingBoxVisualConfig {
  const existingRules = Array.isArray(config.route?.rules)
    ? config.route.rules
    : [];
  const rules: RouteRuleItem[] = REPLACES_RULES[strategy]
    ? baseRules()
    : [...existingRules, ...baseRules()];
  let ruleSetTags: string[] = [];
  let final = proxyTag;

  switch (strategy) {
    case "smart":
      ruleSetTags = [
        "geoip-cn",
        "geosite-geolocation-cn",
        "geosite-geolocation-!cn",
      ];
      rules.push(
        { rule_set: ["geosite-geolocation-cn"], outbound: "direct" },
        {
          type: "logical",
          mode: "and",
          rules: [
            { rule_set: ["geoip-cn"] },
            { rule_set: ["geosite-geolocation-!cn"], invert: true },
          ],
          outbound: "direct",
        },
      );
      break;
    case "gfw":
      ruleSetTags = ["geosite-geolocation-!cn"];
      rules.push({
        rule_set: ["geosite-geolocation-!cn"],
        outbound: proxyTag,
      });
      final = "direct";
      break;
    case "global":
      break;
    case "direct_all":
      final = "direct";
      break;
  }

  const withRuleSets = ensureRuleSetsInConfig(config, ruleSetTags, proxyTag);
  return {
    ...withRuleSets,
    route: {
      ...(withRuleSets.route || {}),
      rules,
      final,
      auto_detect_interface: true,
    },
  };
}

export const QuickRoutingStrategies: React.FC<QuickRoutingStrategiesProps> = ({
  config,
  onChange,
  proxyTag = "proxy",
}) => {
  const existingRuleCount = Array.isArray(config.route?.rules)
    ? config.route.rules.length
    : 0;

  return (
    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
      <div>
        <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          路由策略预设（快速视图）
        </h4>
        <p className="text-[11px] text-slate-400 mt-1">
          点击即写入显式的 route
          规则与规则集，不会添加任何隐藏字段。详细规则可在专家视图中继续调整。
        </p>
      </div>

      {existingRuleCount > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 leading-relaxed">
          当前已有 {existingRuleCount} 条分流规则：「智能分流」「GFW
          列表代理」会保留并追加；
          「全部代理」「全部直连」会清空现有规则。需要保留原规则请先切换到专家模式手动调整。
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() =>
              onChange(applyRoutingStrategy(config, s.id, proxyTag))
            }
            className="text-left p-3 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-sky-500/60 hover:bg-sky-500/5 transition-colors"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-100">
              {s.icon}
              {s.title}
            </span>
            <span className="block text-[11px] text-slate-400 mt-1">
              {s.desc}（{REPLACES_RULES[s.id] ? "清空现有规则" : "保留现有规则"}
              ）
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
