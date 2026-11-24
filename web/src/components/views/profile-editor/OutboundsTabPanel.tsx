import React from "react";
import { useState } from "react";

import {
  Plus,
  Trash2,
  RefreshCw,
  Server,
  Shield,
  Network,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";
import { NodeGroup, NodeItem } from "../../../types/api";

import {
  SingBoxVisualConfig,
  OutboundItem,
} from "./types";
import { TagListInput } from "./TagListInput";
import { CollapsibleToolbar } from "./CollapsibleToolbar";

import { moveArrayItem } from "./shared";

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
  /** Quick view shows curated shortcuts only; experts see all raw fields. */
  quick?: boolean;
}

export const OutboundsTabPanel: React.FC<OutboundsTabPanelProps> = ({
  quick = false,
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
        defaultOpen={!!quick}
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

      {!quick && (
        <>
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
        </>
      )}
    </div>
  );
};
