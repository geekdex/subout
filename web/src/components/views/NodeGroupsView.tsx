import React, { useState, useMemo } from "react";
import {
  FolderKanban,
  Plus,
  Hash,
  Layers,
  Trash2,
  Edit,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Check,
  Zap,
  Shield,
  Shuffle,
  Globe,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { NodeGroup, NodeItem, Subscription } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { formatLatency, getErrorMessage } from "../../utils/format";

interface NodeGroupsViewProps {
  groups: NodeGroup[];
  versionCode: string;
  nodes?: NodeItem[];
  subscriptions?: Subscription[];
  onRefresh: () => void;
}

// Helper to test if a node matches dynamic auto-match criteria
function matchesGroupCriteria(
  node: NodeItem,
  selectedSubscriptions: string[], // empty means all
  includeKeywordsStr: string,
  excludeKeywordsStr?: string,
): boolean {
  if (!node.enabled) return false;

  // 1. Subscription filter
  if (
    selectedSubscriptions.length > 0 &&
    !selectedSubscriptions.includes("all")
  ) {
    const isCustomMatch =
      node.is_custom && selectedSubscriptions.includes("custom");
    const isSubMatch =
      node.subscription_id !== null &&
      selectedSubscriptions.includes(String(node.subscription_id));
    if (!isCustomMatch && !isSubMatch) {
      return false;
    }
  }

  const tagLower = (node.tag || "").toLowerCase();
  const serverLower = (node.server || "").toLowerCase();

  // 2. Include keywords (OR: matches any keyword)
  const incKws = includeKeywordsStr
    .split(/[,，\n\t]+/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  if (incKws.length > 0) {
    const matched = incKws.some(
      (kw) => tagLower.includes(kw) || serverLower.includes(kw),
    );
    if (!matched) return false;
  }

  // 3. Exclude keywords (NOT: excluded if any keyword matches)
  if (excludeKeywordsStr) {
    const excKws = excludeKeywordsStr
      .split(/[,，\n\t]+/)
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    if (excKws.length > 0) {
      const excluded = excKws.some(
        (kw) => tagLower.includes(kw) || serverLower.includes(kw),
      );
      if (excluded) return false;
    }
  }

  return true;
}

export const NodeGroupsView: React.FC<NodeGroupsViewProps> = ({
  groups,
  versionCode,
  nodes = [],
  subscriptions = [],
  onRefresh,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<NodeGroup | null>(null);

  // Form states
  const [tag, setTag] = useState("");
  const [groupType, setGroupType] = useState<string>("selector");
  const [matchType, setMatchType] = useState<"auto" | "static">("auto");
  const [url, setUrl] = useState("https://www.gstatic.com/generate_204");
  const [interval, setInterval] = useState("3m");
  const [tolerance, setTolerance] = useState<number>(50);

  // Auto-match form states
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [includeKeywords, setIncludeKeywords] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");

  // Static selection form states
  const [selectedStaticTags, setSelectedStaticTags] = useState<string[]>([]);
  const [staticFilterSub, setStaticFilterSub] = useState<string>("all");
  const [staticFilterSearch, setStaticFilterSearch] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { success, error } = useToast();
  const safeNodes = useMemo(
    () => (Array.isArray(nodes) ? nodes : []),
    [nodes],
  );
  const safeSubscriptions = useMemo(
    () => (Array.isArray(subscriptions) ? subscriptions : []),
    [subscriptions],
  );

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setTag("");
    setGroupType("selector");
    setMatchType("auto");
    setUrl("https://www.gstatic.com/generate_204");
    setInterval("3m");
    setTolerance(50);
    setSelectedSubs([]);
    setIncludeKeywords("");
    setExcludeKeywords("");
    setSelectedStaticTags([]);
    setStaticFilterSub("all");
    setStaticFilterSearch("");
    setModalOpen(true);
  };

  const handleOpenEdit = (g: NodeGroup) => {
    setEditingGroup(g);
    setTag(g.tag);
    setGroupType(g.group_type || "selector");
    const isStatic = g.match_type === "static";
    setMatchType(isStatic ? "static" : "auto");
    setUrl(g.url || "https://www.gstatic.com/generate_204");
    setInterval(g.interval || "3m");
    setTolerance(g.tolerance ?? 50);

    // Auto-match fields
    if (g.subscriptions && g.subscriptions !== "all") {
      setSelectedSubs(
        g.subscriptions
          .split(/[,，\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else {
      setSelectedSubs([]);
    }
    setIncludeKeywords(g.include_keywords || g.filter_rules || "");
    setExcludeKeywords(g.exclude_keywords || "");

    // Static fields
    try {
      setSelectedStaticTags(JSON.parse(g.static_nodes || "[]"));
    } catch {
      setSelectedStaticTags([]);
    }
    setStaticFilterSub("all");
    setStaticFilterSearch("");
    setModalOpen(true);
  };

  // Toggle subscription in auto-match mode
  const handleToggleSub = (subIdStr: string) => {
    if (subIdStr === "all") {
      setSelectedSubs([]);
      return;
    }
    setSelectedSubs((prev) => {
      if (prev.includes(subIdStr)) {
        return prev.filter((id) => id !== subIdStr);
      } else {
        return [...prev, subIdStr];
      }
    });
  };

  // Real-time matched nodes for auto-match mode preview
  const liveAutoMatchedNodes = useMemo(() => {
    if (matchType !== "auto") return [];
    return safeNodes.filter((n) =>
      matchesGroupCriteria(
        n,
        selectedSubs,
        includeKeywords,
        excludeKeywords,
      ),
    );
  }, [matchType, safeNodes, selectedSubs, includeKeywords, excludeKeywords]);

  // Candidates for static selection modal
  const staticCandidateNodes = useMemo(() => {
    if (matchType !== "static") return [];
    return safeNodes.filter((node) => {
      if (!node.enabled) return false;
      // Filter by subscription
      if (staticFilterSub !== "all") {
        if (staticFilterSub === "custom") {
          if (!node.is_custom) return false;
        } else if (String(node.subscription_id) !== staticFilterSub) {
          return false;
        }
      }
      // Filter by search / keywords
      if (staticFilterSearch.trim()) {
        const q = staticFilterSearch.toLowerCase();
        const matchTag = (node.tag || "").toLowerCase().includes(q);
        const matchServer = (node.server || "").toLowerCase().includes(q);
        const matchType = (node.node_type || "").toLowerCase().includes(q);
        const matchSub = (node.subscription_label || "")
          .toLowerCase()
          .includes(q);
        if (!matchTag && !matchServer && !matchType && !matchSub) return false;
      }
      return true;
    });
  }, [matchType, safeNodes, staticFilterSub, staticFilterSearch]);

  const handleToggleStaticNode = (nodeTag: string) => {
    setSelectedStaticTags((prev) =>
      prev.includes(nodeTag)
        ? prev.filter((t) => t !== nodeTag)
        : [...prev, nodeTag],
    );
  };

  const handleSelectAllStaticFiltered = () => {
    const candidateTags = staticCandidateNodes.map((n) => n.tag);
    setSelectedStaticTags((prev) => {
      const set = new Set([...prev, ...candidateTags]);
      return Array.from(set);
    });
  };

  const handleDeselectAllStaticFiltered = () => {
    const candidateTags = new Set(staticCandidateNodes.map((n) => n.tag));
    setSelectedStaticTags((prev) => prev.filter((t) => !candidateTags.has(t)));
  };

  const handleSave = async () => {
    if (!tag.trim()) {
      error("请输入组合标识 (Tag)");
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<NodeGroup> = {
        tag: tag.trim(),
        group_type: groupType,
        match_type: matchType,
        url:
          groupType === "urltest" || groupType === "fallback" ? url : undefined,
        interval:
          groupType === "urltest" || groupType === "fallback"
            ? interval
            : undefined,
        tolerance:
          groupType === "urltest" || groupType === "fallback"
            ? tolerance
            : undefined,
      };

      if (matchType === "auto") {
        payload.subscriptions =
          selectedSubs.length > 0 ? selectedSubs.join(",") : "all";
        payload.include_keywords = includeKeywords.trim() || undefined;
        payload.exclude_keywords = excludeKeywords.trim() || undefined;
        payload.static_nodes = JSON.stringify(
          liveAutoMatchedNodes.map((n) => n.tag),
        );
      } else {
        payload.subscriptions = "all";
        payload.include_keywords = undefined;
        payload.exclude_keywords = undefined;
        payload.static_nodes = JSON.stringify(selectedStaticTags);
      }

      if (editingGroup) {
        await api.updateNodeGroup(editingGroup.id, payload);
        success("节点组合已更新");
      } else {
        await api.createNodeGroup(payload);
        success("节点组合已创建");
      }
      setModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      error("保存失败", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSyncGroup = async (g: NodeGroup) => {
    setSyncingId(g.id);
    try {
      const res = await api.syncNodeGroup(g.id);
      let count = 0;
      try {
        count = JSON.parse(res.static_nodes || "[]").length;
      } catch {
        // ignore
      }
      success(
        "同步完成",
        `组合「${g.tag}」已重新计算，当前包含 ${count} 个有效节点`,
      );
      onRefresh();
    } catch (err: unknown) {
      error("同步失败", getErrorMessage(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await api.deleteNodeGroup(deleteConfirmId);
      success("节点组合已删除");
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err: unknown) {
      error("删除失败", getErrorMessage(err));
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top action & VersionCode banner */}
      <div className="glass-panel p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-sky-400" />
              <span>节点组合管理 (Node Groups)</span>
              <Badge variant="neutral" size="sm">
                共 {groups.length} 组
              </Badge>
            </h2>
            <Badge variant="info" size="md">
              <Hash className="w-3 h-3 mr-0.5" />
              全局版本号: {versionCode || "未初始化"}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            将节点池中的节点动态按订阅/关键词自动匹配，或静态手动挑选组装为
            sing-box 出站策略组。变动自动递增版本号并触发客户端懒同步。
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreate}
          icon={<Plus className="w-4 h-4" />}
          className="w-full sm:w-auto"
        >
          新建节点组合
        </Button>
      </div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {groups.map((g) => {
          const isStatic = g.match_type === "static";
          let parsedNodes: string[] = [];
          try {
            parsedNodes = JSON.parse(g.static_nodes || "[]");
          } catch {
            parsedNodes = [];
          }

          // Compute subscription display for auto groups
          const subPills: string[] = [];
          if (!isStatic) {
            const rawSubs = g.subscriptions || "all";
            if (rawSubs === "all") {
              subPills.push("全部订阅");
            } else {
              const ids = rawSubs.split(/[,，\s]+/).filter(Boolean);
              for (const id of ids) {
                if (id === "custom") {
                  subPills.push("自定义节点");
                } else {
                  const s = safeSubscriptions.find(
                    (sub) => String(sub.id) === id,
                  );
                  subPills.push(s?.label || `订阅 #${id}`);
                }
              }
            }
          }

          return (
            <div
              key={g.id}
              className="glass-panel p-5 flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="w-4 h-4 text-sky-400 shrink-0" />
                    <h3 className="text-sm font-bold text-white truncate">
                      {g.tag}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      variant={isStatic ? "neutral" : "success"}
                      size="sm"
                    >
                      {isStatic ? "📌 静态节点" : "⚡ 自动匹配"}
                    </Badge>
                    <Badge
                      variant={
                        g.group_type === "urltest"
                          ? "warning"
                          : g.group_type === "fallback"
                            ? "danger"
                            : "info"
                      }
                      size="sm"
                    >
                      {g.group_type === "urltest" ? (
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" /> urltest
                        </span>
                      ) : g.group_type === "fallback" ? (
                        <span className="flex items-center gap-1">
                          <Shield className="w-3 h-3" /> fallback
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Shuffle className="w-3 h-3" /> selector
                        </span>
                      )}
                    </Badge>
                  </div>
                </div>

                {/* Strategy details if urltest / fallback */}
                {(g.group_type === "urltest" || g.group_type === "fallback") && (
                  <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800 flex items-center justify-between">
                    <span className="truncate max-w-[180px]" title={g.url || ""}>
                      {g.url || "默认测速目标"}
                    </span>
                    <span className="font-mono text-slate-500 shrink-0">
                      间隔: {g.interval || "3m"} | 容差: {g.tolerance ?? 50}ms
                    </span>
                  </div>
                )}

                {/* Rule summary */}
                {!isStatic ? (
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px] font-medium">
                        所属订阅:
                      </span>
                      <span className="text-sky-300 text-[11px] font-mono">
                        {subPills.join(", ")}
                      </span>
                    </div>

                    {g.include_keywords && (
                      <div className="flex items-start justify-between text-xs gap-2">
                        <span className="text-slate-400 text-[11px] font-medium shrink-0">
                          包含关键词:
                        </span>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {g.include_keywords
                            .split(/[,，\n\t]+/)
                            .map((k) => k.trim())
                            .filter(Boolean)
                            .map((k, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-800/50"
                              >
                                {k}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
                      <span className="text-slate-500 text-[10px]">
                        系统自动更新时自动计算加入
                      </span>
                      <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                        当前匹配 {parsedNodes.length} 个节点
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px] font-medium">
                        静态固定组合:
                      </span>
                      <span className="text-slate-300 font-mono text-[11px]">
                        包含 {parsedNodes.length} 个节点
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      系统自动更新时若遇下架或超时将自动剔除失效节点
                    </p>
                  </div>
                )}

                {/* Node Tags List (1 node per line) */}
                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                    <span>包含节点列表</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      共 {parsedNodes.length} 个节点
                    </span>
                  </div>
                  {parsedNodes.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg bg-slate-950/60 p-1.5 border border-slate-800/80 divide-y divide-slate-800/50">
                      {parsedNodes.map((t, i) => (
                        <div
                          key={i}
                          className="py-1 px-2 text-xs font-mono text-slate-200 hover:text-white hover:bg-slate-900/60 rounded flex items-center justify-between gap-2 transition-colors"
                          title={t}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[10px] text-slate-500 font-mono w-5 shrink-0 text-right">
                              {i + 1}.
                            </span>
                            <span className="truncate font-medium">{t}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-600 italic py-2.5 text-center bg-slate-950/30 rounded-lg border border-slate-800/40">
                      暂无可用节点（运行或下发时安全降级至 direct）
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">
                  ID: {g.id}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={syncingId === g.id}
                    onClick={() => handleSyncGroup(g)}
                    title="立即重新计算并同步该组合的最新节点"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(g)}
                    title="编辑组合配置"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(g.id)}
                    className="text-rose-400 hover:text-rose-300"
                    title="删除节点组合"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / Create Dialog */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="3xl"
        title={editingGroup ? "编辑节点组合" : "新建节点组合"}
        description="支持自动匹配规则动态聚合与手动挑选静态组合，两种类型都会被系统自动更新功能更新维护。"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModalOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={handleSave}
            >
              保存组合
            </Button>
          </>
        }
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {/* Tag & Group Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="组合标识 (Tag)"
              placeholder="例如: HK-Auto 或 常用专线"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 select-none">
                出站策略类型
              </label>
              <Select
                value={groupType}
                onChange={setGroupType}
                options={[
                  { value: "selector", label: "🔀 手动选择器 (selector)" },
                  { value: "urltest", label: "⚡ 自动测速优选组 (urltest)" },
                  { value: "fallback", label: "🛡️ 故障转移备用组 (fallback)" },
                ]}
              />
            </div>
          </div>

          {/* If urltest or fallback, show extra configuration */}
          {(groupType === "urltest" || groupType === "fallback") && (
            <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label="测速 URL"
                  placeholder="https://www.gstatic.com/generate_204"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div>
                <Input
                  label="测速间隔"
                  placeholder="3m"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                />
              </div>
              <div>
                <Input
                  label="延迟容差 (ms)"
                  type="number"
                  placeholder="50"
                  value={String(tolerance)}
                  onChange={(e) => setTolerance(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {/* Match Type Switcher */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 select-none">
              组合模式
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/90 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setMatchType("auto")}
                className={`py-2 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${
                  matchType === "auto"
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>自动匹配类型节点</span>
              </button>

              <button
                type="button"
                onClick={() => setMatchType("static")}
                className={`py-2 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${
                  matchType === "static"
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>静态节点组合</span>
              </button>
            </div>
          </div>

          {/* SECTION A: Auto-Match Mode */}
          {matchType === "auto" && (
            <div className="space-y-4 pt-1 animate-in fade-in duration-200">
              {/* Subscription filter pills (multi-select) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">
                    所属订阅筛选 (支持选择多个)
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {selectedSubs.length === 0
                      ? "已选择全部订阅"
                      : `已勾选 ${selectedSubs.length} 个订阅`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleToggleSub("all")}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      selectedSubs.length === 0
                        ? "bg-sky-500/20 border-sky-500 text-sky-300 font-semibold shadow-sm"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    全部订阅
                  </button>

                  {safeSubscriptions.map((sub) => {
                    const isSelected = selectedSubs.includes(String(sub.id));
                    const nodeCount = safeNodes.filter(
                      (n) => n.subscription_id === sub.id,
                    ).length;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => handleToggleSub(String(sub.id))}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-sky-500/20 border-sky-500 text-sky-300 font-semibold shadow-sm"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-sky-400" />}
                        <span>{sub.label || `订阅 #${sub.id}`}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({nodeCount})
                        </span>
                      </button>
                    );
                  })}

                  {safeNodes.some((n) => n.is_custom) && (
                    <button
                      type="button"
                      onClick={() => handleToggleSub("custom")}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all flex items-center gap-1.5 ${
                        selectedSubs.includes("custom")
                          ? "bg-amber-500/20 border-amber-500 text-amber-300 font-semibold"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {selectedSubs.includes("custom") && (
                        <Check className="w-3 h-3 text-amber-400" />
                      )}
                      <span>自定义节点</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ({safeNodes.filter((n) => n.is_custom).length})
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Keyword matching */}
              <div className="space-y-3">
                <Input
                  label="包含关键词 (支持多个，以英文逗号隔开)"
                  placeholder="例如: 香港, HK, 专线, IPLC"
                  value={includeKeywords}
                  onChange={(e) => setIncludeKeywords(e.target.value)}
                  helperText="直接手填，多个关键词以英文逗号 ',' 隔开，符合任一关键词即可加入；留空则包含所选订阅下的所有节点。"
                />

                <Input
                  label="排除关键词 (可选)"
                  placeholder="例如: 官网, 剩余, 流量, 重置"
                  value={excludeKeywords}
                  onChange={(e) => setExcludeKeywords(e.target.value)}
                  helperText="排除包含上述关键词的节点，多个关键词同样用逗号隔开。"
                />
              </div>

              {/* LIVE MATCHED NODES PREVIEW */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>符合条件的节点列表 (弹框实时预览)</span>
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    已匹配 {liveAutoMatchedNodes.length} 个节点
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/70 p-2 space-y-1">
                  {liveAutoMatchedNodes.length > 0 ? (
                    liveAutoMatchedNodes.map((n) => {
                      const { text, color } = formatLatency(
                        n.last_web_latency ?? n.last_tcp_latency,
                      );
                      return (
                        <div
                          key={n.id}
                          className="flex items-center justify-between p-2 rounded bg-slate-900/60 hover:bg-slate-900 text-xs border border-slate-800/60 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-slate-200 truncate">
                              {n.tag}
                            </span>
                            <Badge variant="neutral" size="sm">
                              {n.node_type.toUpperCase()}
                            </Badge>
                            <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                              {n.subscription_label ||
                                (n.is_custom ? "自定义节点" : "未知订阅")}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-[11px] text-slate-500 hidden sm:inline">
                              {n.server}:{n.port}
                            </span>
                            <span className={`font-mono text-xs font-medium ${color}`}>
                              {text}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-500">
                      暂无符合条件的节点，请调整上方所属订阅或关键词筛选
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION B: Static Selection Mode */}
          {matchType === "static" && (
            <div className="space-y-4 pt-1 animate-in fade-in duration-200">
              {/* Filtering toolbar for picking static nodes */}
              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-300">
                  筛选待选节点池
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Select
                    value={staticFilterSub}
                    onChange={setStaticFilterSub}
                    options={[
                      {
                        value: "all",
                        label: `全部订阅 (${safeNodes.length})`,
                      },
                      ...safeSubscriptions.map((s) => ({
                        value: String(s.id),
                        label: `${s.label || "订阅"} (${safeNodes.filter((n) => n.subscription_id === s.id).length})`,
                      })),
                      ...(safeNodes.some((n) => n.is_custom)
                        ? [
                            {
                              value: "custom",
                              label: `自定义节点 (${safeNodes.filter((n) => n.is_custom).length})`,
                            },
                          ]
                        : []),
                    ]}
                  />

                  <Input
                    placeholder="按关键词搜索待选节点..."
                    value={staticFilterSearch}
                    onChange={(e) => setStaticFilterSearch(e.target.value)}
                    icon={<Search className="w-3.5 h-3.5" />}
                    clearable
                    onClear={() => setStaticFilterSearch("")}
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400">
                    当前筛选显示{" "}
                    <span className="text-sky-300 font-semibold font-mono">
                      {staticCandidateNodes.length}
                    </span>{" "}
                    个节点
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllStaticFiltered}
                      className="text-sky-400 hover:text-sky-300 text-xs font-medium"
                    >
                      全选当前筛选
                    </button>
                    <span className="text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllStaticFiltered}
                      className="text-slate-400 hover:text-slate-200 text-xs"
                    >
                      取消所选
                    </button>
                    <span className="text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedStaticTags([])}
                      className="text-rose-400 hover:text-rose-300 text-xs"
                    >
                      清空全部
                    </button>
                  </div>
                </div>
              </div>

              {/* Node candidates selection checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">
                    点击勾选需要加入组合的节点
                  </span>
                  <span className="font-mono text-sky-400 font-semibold">
                    总计已选 {selectedStaticTags.length} 个节点
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/70 p-2 space-y-1">
                  {staticCandidateNodes.length > 0 ? (
                    staticCandidateNodes.map((n) => {
                      const isSelected = selectedStaticTags.includes(n.tag);
                      const { text, color } = formatLatency(
                        n.last_web_latency ?? n.last_tcp_latency,
                      );
                      return (
                        <div
                          key={n.id}
                          onClick={() => handleToggleStaticNode(n.tag)}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs border transition-all ${
                            isSelected
                              ? "bg-sky-950/40 border-sky-500/50 text-white"
                              : "bg-slate-900/50 border-slate-800/60 hover:bg-slate-900 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-sky-400 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-500 shrink-0" />
                            )}
                            <span className="font-semibold truncate">
                              {n.tag}
                            </span>
                            <Badge variant="neutral" size="sm">
                              {n.node_type.toUpperCase()}
                            </Badge>
                            <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                              {n.subscription_label ||
                                (n.is_custom ? "自定义节点" : "未知订阅")}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-[11px] text-slate-500 hidden sm:inline">
                              {n.server}:{n.port}
                            </span>
                            <span className={`font-mono text-xs font-medium ${color}`}>
                              {text}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-500">
                      没有符合当前筛选的节点
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Nodes Tag Preview */}
              {selectedStaticTags.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                    <span>已选节点预览 ({selectedStaticTags.length} 个)</span>
                    <button
                      type="button"
                      onClick={() => setSelectedStaticTags([])}
                      className="text-rose-400 hover:text-rose-300 text-[10px]"
                    >
                      清空已选
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto p-1.5 bg-slate-900/60 rounded border border-slate-800">
                    {selectedStaticTags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-sky-950 text-sky-300 border border-sky-800/60"
                      >
                        <span className="truncate max-w-[140px]">{t}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStaticNode(t);
                          }}
                          className="hover:text-rose-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="确认删除该节点组合？"
        description="删除策略组后将同步触发全局 versionCode 更新，下发配置将自动降级修复。"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteConfirmId(null)}
            >
              取消
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              确认删除
            </Button>
          </>
        }
      >
        <div className="text-xs text-rose-300">此操作不可撤销。</div>
      </Dialog>
    </div>
  );
};
