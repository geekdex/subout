import React, { useState, useEffect, useRef } from "react";
import {
  Server,
  Activity,
  Trash2,
  Search,
  Zap,
  CheckSquare,
  Square,
  Globe,
  Radio,
  StopCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileCode,
  Info,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { Table, Column } from "../ui/Table";
import { Dialog } from "../ui/Dialog";
import { Select } from "../ui/Select";
import { CopyButton } from "../ui/CopyButton";
import { NodeItem, Subscription, SPEED_TEST_ENDPOINTS } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import {
  formatDate,
  formatLatency,
  getErrorMessage,
  getTestEndpointName,
} from "../../utils/format";

interface NodesViewProps {
  nodes?: NodeItem[];
  subscriptions?: Subscription[];
  onRefresh: () => void;
  serviceRunning?: boolean;
  onStopService?: () => Promise<void>;
}

export const NodesView: React.FC<NodesViewProps> = ({
  nodes = [],
  subscriptions = [],
  onRefresh,
  serviceRunning = false,
  onStopService,
}) => {
  // Local nodes state allowing instant one-by-one rendering during speed tests
  const [localNodes, setLocalNodes] = useState<NodeItem[]>(nodes);
  useEffect(() => {
    setLocalNodes(nodes);
  }, [nodes]);

  const [search, setSearch] = useState("");
  const [selectedSubscription, setSelectedSubscription] =
    useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Pagination states: default 20, supports 50, 100, 200
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Detail Modal states
  const [detailNode, setDetailNode] = useState<NodeItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"info" | "json">("info");

  // Reset to page 1 when filtering or changing page size
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedSubscription, pageSize]);

  // Testing states
  const [testingBatchActive, setTestingBatchActive] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testingNodeMap, setTestingNodeMap] = useState<
    Record<number, "pending" | "testing" | "completed">
  >({});
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);

  // Speed test endpoint state, persisted in localStorage safely
  const [selectedEndpointUrl, setSelectedEndpointUrl] = useState<string>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        return (
          window.localStorage.getItem("subout_speedtest_endpoint") ||
          SPEED_TEST_ENDPOINTS[0].url
        );
      } catch {
        return SPEED_TEST_ENDPOINTS[0].url;
      }
    }
    return SPEED_TEST_ENDPOINTS[0].url;
  });

  // Sorting state
  const [sortKey, setSortKey] = useState<string>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const { success, error } = useToast();

  const safeNodes = Array.isArray(localNodes) ? localNodes : [];
  const safeSubscriptions = Array.isArray(subscriptions) ? subscriptions : [];

  const currentEndpoint =
    SPEED_TEST_ENDPOINTS.find((ep) => ep.url === selectedEndpointUrl) ||
    SPEED_TEST_ENDPOINTS[0];

  const handleEndpointChange = (url: string) => {
    setSelectedEndpointUrl(url);
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem("subout_speedtest_endpoint", url);
      } catch {
        // ignore
      }
    }
  };

  const filteredNodes = safeNodes.filter((n) => {
    // 1. Subscription filter
    if (selectedSubscription !== "all") {
      if (selectedSubscription === "custom") {
        if (!n.is_custom) return false;
      } else {
        const subId = Number(selectedSubscription);
        if (n.subscription_id !== subId) return false;
      }
    }

    // 2. Search query filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTag = (n.tag || "").toLowerCase().includes(q);
      const matchServer = (n.server || "").toLowerCase().includes(q);
      const matchType = (n.node_type || "").toLowerCase().includes(q);
      const matchSub = (n.subscription_label || "").toLowerCase().includes(q);
      if (!matchTag && !matchServer && !matchType && !matchSub) {
        return false;
      }
    }

    return true;
  });

  const sortedNodes = [...filteredNodes].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "tag") {
      cmp = (a.tag || "").localeCompare(b.tag || "");
    } else if (sortKey === "subscription") {
      const labelA = a.subscription_label || (a.is_custom ? "自定义节点" : "");
      const labelB = b.subscription_label || (b.is_custom ? "自定义节点" : "");
      cmp = labelA.localeCompare(labelB);
    } else if (sortKey === "node_type") {
      cmp = (a.node_type || "").localeCompare(b.node_type || "");
    } else if (sortKey === "server") {
      cmp = `${a.server}:${a.port}`.localeCompare(`${b.server}:${b.port}`);
    } else if (sortKey === "latency_ms") {
      const latA =
        a.last_web_latency ?? a.last_tcp_latency ?? a.latency_ms ?? null;
      const latB =
        b.last_web_latency ?? b.last_tcp_latency ?? b.latency_ms ?? null;
      const score = (v: number | null) => {
        if (v === null || v === undefined) return 999999;
        if (v <= 0) return 888888;
        return v;
      };
      cmp = score(latA) - score(latB);
    } else if (sortKey === "last_tested_at") {
      const dateA = a.last_tested_at || "";
      const dateB = b.last_tested_at || "";
      cmp = dateA.localeCompare(dateB);
    } else {
      cmp = a.id - b.id;
    }
    return sortDirection === "asc" ? cmp : -cmp;
  });

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "latency_ms" ? "asc" : "desc");
    }
  };

  // Pagination calculations: 20 per page by default, supports 50, 100, 200
  const totalCount = sortedNodes.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const pagedNodes = sortedNodes.slice(startIndex, endIndex);

  const currentPageIds = pagedNodes.map((n) => n.id);
  const isAllCurrentPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedIds.includes(id));

  const handleSelectAll = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !currentPageIds.includes(id)),
      );
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...currentPageIds])),
      );
    }
  };

  const handleToggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // Cancel running speed test
  const handleCancelTest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setTestingBatchActive(false);
    setTestingNodeMap({});
  };

  // Single node speed test
  const handleTestLatency = async (node: NodeItem) => {
    if (serviceRunning) {
      error(
        "无法测速",
        "sing-box 代理服务正在运行中，请先关闭代理服务后再进行节点测速。",
      );
      return;
    }
    setTestingId(node.id);
    setTestingNodeMap((prev) => ({ ...prev, [node.id]: "testing" }));
    try {
      const res = await api.testNodeLatency(node.id, selectedEndpointUrl);
      const l = res.web_latency ?? res.latency_ms;
      const isTimeout = l === null || l === undefined || l <= 0;
      const nowStr = new Date()
        .toISOString()
        .replace("T", " ")
        .substring(0, 19);

      // Render updated node immediately
      setLocalNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? {
                ...n,
                last_web_latency: res.web_latency ?? (isTimeout ? -1 : l),
                last_tcp_latency: res.tcp_latency,
                last_tested_at: nowStr,
                last_target_url: selectedEndpointUrl,
              }
            : n,
        ),
      );

      setDetailNode((prev) =>
        prev && prev.id === node.id
          ? {
              ...prev,
              last_web_latency: res.web_latency ?? (isTimeout ? -1 : l),
              last_tcp_latency: res.tcp_latency,
              last_tested_at: nowStr,
              last_target_url: selectedEndpointUrl,
            }
          : prev,
      );

      if (isTimeout) {
        success(
          "测速完成",
          `${node.tag} (${currentEndpoint.name}): 超时 / 不可达`,
        );
      } else {
        const tcpExtra =
          res.tcp_latency && res.tcp_latency > 0
            ? ` (TCP: ${res.tcp_latency} ms)`
            : "";
        success(
          "测速完成",
          `${node.tag} (${currentEndpoint.name}): ${l} ms${tcpExtra}`,
        );
      }
      onRefresh();
    } catch (err: unknown) {
      error("测速失败", getErrorMessage(err));
    } finally {
      setTestingId(null);
      setTestingNodeMap((prev) => {
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
    }
  };

  // Batch speed test using real-time streaming: tests and renders node by node
  const runBatchTest = async (targetIds: number[], label: string) => {
    if (targetIds.length === 0) return;
    if (serviceRunning) {
      error(
        "无法测速",
        "sing-box 代理服务正在运行中，请先关闭代理服务后再进行节点测速。",
      );
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    // Mark all target nodes as pending in the UI so each displays a progressbar
    const initialMap: Record<number, "pending" | "testing" | "completed"> = {};
    for (const id of targetIds) {
      initialMap[id] = "pending";
    }
    setTestingNodeMap(initialMap);
    setBatchProgress({ completed: 0, total: targetIds.length });
    setTestingBatchActive(true);

    try {
      await api.pingNodesStream(
        {
          ids: targetIds,
          targetUrl: selectedEndpointUrl,
          testType: "both",
        },
        (event) => {
          if (event.status === "testing") {
            setTestingNodeMap((prev) => ({
              ...prev,
              [event.id]: "testing",
            }));
          } else if (event.status === "completed") {
            // Immediately update and render this single node
            setTestingNodeMap((prev) => {
              const next = { ...prev };
              delete next[event.id];
              return next;
            });
            const effectiveWeb =
              event.web_latency !== null && event.web_latency !== undefined
                ? event.web_latency
                : -1;
            const effectiveTcp =
              event.tcp_latency !== null && event.tcp_latency !== undefined
                ? event.tcp_latency
                : -1;
            const nowStr =
              event.tested_at ||
              new Date().toISOString().replace("T", " ").substring(0, 19);

            setLocalNodes((prev) =>
              prev.map((n) =>
                n.id === event.id
                  ? {
                      ...n,
                      last_web_latency: effectiveWeb,
                      last_tcp_latency: effectiveTcp,
                      last_tested_at: nowStr,
                      last_target_url: event.target_url || selectedEndpointUrl,
                    }
                  : n,
              ),
            );
            setBatchProgress((prev) => ({
              ...prev,
              completed: event.completed ?? prev.completed + 1,
            }));
          }
        },
        ac.signal,
      );
      success(
        `${label}完成`,
        `已使用「${currentEndpoint.name}」测速 ${targetIds.length} 个节点`,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        success("测速已中止", "已保留所有已测速节点的最新结果");
      } else {
        error("测速失败", getErrorMessage(err));
      }
    } finally {
      setTestingBatchActive(false);
      setTestingNodeMap({});
      abortControllerRef.current = null;
      onRefresh();
    }
  };

  const handleTestSelected = () => {
    runBatchTest(selectedIds, "所选测速");
  };

  const handleTestAll = () => {
    const allIds = safeNodes.map((n) => n.id);
    runBatchTest(allIds, "全量测速");
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    try {
      const res = await api.batchDeleteNodes(selectedIds);
      success("批量删除成功", `已移除 ${res.count} 个节点`);
      setSelectedIds([]);
      setBatchDeleteModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      error("删除失败", getErrorMessage(err));
    } finally {
      setBatchDeleting(false);
    }
  };

  // Node pool statistics
  const testedCount = safeNodes.filter(
    (n) => n.last_web_latency !== null || n.last_tcp_latency !== null,
  ).length;
  const availableCount = safeNodes.filter((n) => {
    if (n.last_web_latency !== null && n.last_web_latency !== undefined) {
      return n.last_web_latency > 0;
    }
    const lat = n.last_tcp_latency ?? n.latency_ms;
    return lat !== null && lat !== undefined && lat > 0;
  }).length;

  const progressPercent =
    batchProgress.total > 0
      ? Math.round((batchProgress.completed / batchProgress.total) * 100)
      : 0;

  const columns: Column<NodeItem>[] = [
    {
      key: "select",
      header: (
        <button
          type="button"
          onClick={handleSelectAll}
          className="p-1 text-slate-400 hover:text-slate-200"
          title="全选当前页 / 取消全选"
        >
          {isAllCurrentPageSelected ? (
            <CheckSquare className="w-4 h-4 text-sky-400" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      ),
      render: (node) => (
        <button
          type="button"
          onClick={() => handleToggleSelect(node.id)}
          className="p-1 text-slate-400 hover:text-slate-200"
        >
          {selectedIds.includes(node.id) ? (
            <CheckSquare className="w-4 h-4 text-sky-400" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      ),
      className: "w-10 text-center",
    },
    {
      key: "tag",
      header: "节点标识 (Tag)",
      sortable: true,
      render: (node) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-100">{node.tag}</span>
          <span className="text-[11px] text-slate-500 font-mono">
            ID: {node.id}
          </span>
        </div>
      ),
    },
    {
      key: "subscription",
      header: "所属订阅 / 来源",
      sortable: true,
      render: (node) => {
        if (node.is_custom) {
          return (
            <Badge variant="warning" size="sm">
              自定义节点
            </Badge>
          );
        }
        return (
          <span
            className="text-xs text-slate-300 font-medium truncate max-w-[140px] inline-block"
            title={node.subscription_label || "未知订阅"}
          >
            {node.subscription_label || "未知订阅"}
          </span>
        );
      },
    },
    {
      key: "node_type",
      header: "协议类型",
      sortable: true,
      render: (node) => (
        <Badge variant="neutral" size="sm">
          {node.node_type.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: "server",
      header: "服务器与端口",
      sortable: true,
      render: (node) => (
        <span className="font-mono text-slate-300">
          {node.server}:{node.port}
        </span>
      ),
    },
    {
      key: "latency_ms",
      header: "测速结果 / 测试点",
      sortable: true,
      render: (node) => {
        const testStatus = testingNodeMap[node.id];
        const isNodeTesting = testStatus === "testing" || testingId === node.id;
        const isNodePending = testStatus === "pending";

        // Dynamic testing state: render active animated progress bar
        if (isNodeTesting) {
          return (
            <div className="flex flex-col gap-1.5 w-36 py-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-sky-400 font-medium flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                  </span>
                  测速中...
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden relative">
                <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 rounded-full animate-progress" />
              </div>
            </div>
          );
        }

        // Queued state: render animated waiting progress bar
        if (isNodePending) {
          return (
            <div className="flex flex-col gap-1.5 w-36 py-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                  排队中...
                </span>
              </div>
              <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden relative">
                <div className="absolute inset-y-0 w-1/4 bg-slate-600/50 rounded-full animate-progress-slow" />
              </div>
            </div>
          );
        }

        // Completed / Default state: renders measured result immediately upon completion
        const primaryLatency =
          node.last_web_latency !== null &&
          node.last_web_latency !== undefined &&
          node.last_web_latency > 0
            ? node.last_web_latency
            : node.last_web_latency === -1 || node.last_tcp_latency === -1
              ? -1
              : (node.last_tcp_latency ?? node.latency_ms);
        const { text, color } = formatLatency(primaryLatency);
        const endpointName = getTestEndpointName(node.last_target_url);

        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`font-mono text-xs font-semibold ${color}`}>
                {text}
              </span>
              {node.last_tcp_latency !== null &&
                node.last_tcp_latency !== undefined &&
                node.last_tcp_latency > 0 &&
                node.last_web_latency !== null &&
                node.last_web_latency !== undefined && (
                  <span
                    className="text-[10px] text-slate-500 font-mono"
                    title={`TCP 握手延迟: ${node.last_tcp_latency} ms`}
                  >
                    (TCP {node.last_tcp_latency}ms)
                  </span>
                )}
            </div>
            {node.last_tested_at ? (
              <div
                className="flex items-center gap-1 text-[11px] text-slate-400"
                title={`测试点: ${endpointName}\n目标 URL: ${node.last_target_url || "-"}\n测试时间: ${node.last_tested_at}`}
              >
                <span className="text-slate-300 font-medium truncate max-w-[130px]">
                  {endpointName}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500 font-mono text-[10px] shrink-0">
                  {formatDate(node.last_tested_at)}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-slate-600">暂未测试</span>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      render: (node) => {
        const isTestingThis =
          testingId === node.id || testingNodeMap[node.id] !== undefined;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={testingBatchActive}
              onClick={() => {
                setDetailNode(node);
                setDetailTab("info");
                setDetailModalOpen(true);
              }}
              icon={<Eye className="w-3.5 h-3.5 text-sky-400" />}
              title="查看节点详情与配置 JSON"
            >
              详情
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={isTestingThis}
              disabled={testingBatchActive || serviceRunning}
              onClick={() => handleTestLatency(node)}
              icon={<Zap className="w-3.5 h-3.5" />}
              title={
                serviceRunning
                  ? "sing-box 正在运行，请先停止服务后再测速"
                  : `使用当前测试点 [${currentEndpoint.name}] 测速`
              }
            >
              测速
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={testingBatchActive}
              onClick={async () => {
                try {
                  await api.deleteNode(node.id);
                  success("节点已删除");
                  onRefresh();
                } catch (err: unknown) {
                  error("删除失败", getErrorMessage(err));
                }
              }}
              className="text-rose-400 hover:text-rose-300"
              title="删除节点"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* sing-box is running alert banner */}
      {serviceRunning && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-amber-300">
                sing-box 代理服务正在运行中
              </div>
              <div className="text-xs text-amber-400/80 mt-0.5">
                为保证测速数据真实性并避免网络流量环路，在开启 sing-box 时已禁用节点测速。请先关闭代理服务后再进行测速。
              </div>
            </div>
          </div>
          {onStopService && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onStopService}
              className="shrink-0 border-amber-500/40 text-amber-200 hover:bg-amber-500/20 active:bg-amber-500/30"
            >
              停止代理服务
            </Button>
          )}
        </div>
      )}

      {/* Top action header */}
      <div className="glass-panel p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Server className="w-5 h-5 text-sky-400" />
            <span>节点池管理 (Node Pool)</span>
            <Badge variant="info" size="sm">
              共 {safeNodes.length} 个
            </Badge>
          </h2>
          <p className="text-xs text-slate-400">
            订阅拉取的所有出站节点统一汇集在此，可切换测试点单点测速、批量测速、或供节点组合动态聚合。
          </p>
          <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              当前测试点:{" "}
              <span className="font-semibold text-sky-300">
                {currentEndpoint.name}
              </span>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              已测速:{" "}
              <span className="text-slate-200 font-medium">{testedCount}</span>{" "}
              / {safeNodes.length}
            </span>
            <span>
              可用:{" "}
              <span className="text-emerald-400 font-medium">
                {availableCount}
              </span>
            </span>
          </div>
        </div>

        {/* Speed test controls & batch actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          {/* Endpoint selector dropdown */}
          <div className="w-full sm:w-60">
            <Select
              disabled={testingBatchActive}
              value={selectedEndpointUrl}
              onChange={handleEndpointChange}
              options={SPEED_TEST_ENDPOINTS.map((ep) => ({
                value: ep.url,
                label: ep.name,
                description: ep.url,
              }))}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.length > 0 && !testingBatchActive && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={serviceRunning}
                  onClick={handleTestSelected}
                  icon={<Radio className="w-3.5 h-3.5 text-sky-400" />}
                  title={
                    serviceRunning
                      ? "sing-box 正在运行，请先停止服务后再测速"
                      : `使用 [${currentEndpoint.name}] 测速选中的 ${selectedIds.length} 个节点`
                  }
                >
                  测速所选 ({selectedIds.length})
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBatchDeleteModalOpen(true)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  删除所选 ({selectedIds.length})
                </Button>
              </>
            )}

            {testingBatchActive ? (
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancelTest}
                icon={<StopCircle className="w-4 h-4 text-rose-300" />}
                title="中止当前正在进行的批量测速"
              >
                停止测速 ({batchProgress.completed}/{batchProgress.total})
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={serviceRunning}
                onClick={handleTestAll}
                icon={<Activity className="w-4 h-4 text-emerald-400" />}
                title={
                  serviceRunning
                    ? "sing-box 正在运行，请先停止服务后再测速"
                    : `使用 [${currentEndpoint.name}] 对全部节点执行测速`
                }
              >
                全量测速
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Global Batch Speed Test Progress Banner */}
      {testingBatchActive && (
        <div className="glass-panel p-4 border border-sky-500/30 bg-sky-500/10 rounded-xl space-y-2 animate-in fade-in duration-300">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-100 font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400 animate-spin" />
              正在测试节点连通性及延迟 · 目标:{" "}
              <span className="text-sky-300 font-semibold">
                {currentEndpoint.name}
              </span>
            </span>
            <span className="text-sky-300 font-mono font-semibold">
              {batchProgress.completed} / {batchProgress.total} (
              {progressPercent}%)
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-2xl">
          <div className="w-full sm:w-72">
            <Input
              placeholder="搜索节点名称、IP 或所属订阅..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
              clearable
              onClear={() => setSearch("")}
            />
          </div>

          <div className="w-full sm:w-60">
            <Select
              value={selectedSubscription}
              onChange={setSelectedSubscription}
              options={[
                {
                  value: "all",
                  label: `全部来源 (${safeNodes.length})`,
                },
                ...safeSubscriptions.map((s) => {
                  const count = safeNodes.filter(
                    (n) => n.subscription_id === s.id,
                  ).length;
                  return {
                    value: String(s.id),
                    label: `${s.label || "未命名订阅"} (${count})`,
                  };
                }),
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
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="text-xs text-slate-400">
            已选中{" "}
            <span className="font-semibold text-sky-400">
              {selectedIds.length}
            </span>{" "}
            个节点
          </div>
        )}
      </div>

      {/* Nodes Table */}
      <Table
        columns={columns}
        data={pagedNodes}
        keyField="id"
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      {/* Pagination Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-1 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>
            显示第{" "}
            <span className="font-semibold text-slate-200">
              {totalCount > 0 ? startIndex + 1 : 0}
            </span>{" "}
            到 <span className="font-semibold text-slate-200">{endIndex}</span>{" "}
            条，共{" "}
            <span className="font-semibold text-sky-400">{totalCount}</span>{" "}
            条节点
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px]">每页</span>
            <div className="w-28">
              <Select
                value={String(pageSize)}
                onChange={(v) => setPageSize(Number(v))}
                options={[
                  { value: "20", label: "20 条" },
                  { value: "50", label: "50 条" },
                  { value: "100", label: "100 条" },
                  { value: "200", label: "200 条" },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(1)}
              icon={<ChevronsLeft className="w-3.5 h-3.5" />}
              title="首页"
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              icon={<ChevronLeft className="w-3.5 h-3.5" />}
              title="上一页"
            />
            <span className="px-2 font-mono text-slate-300 select-none">
              {safeCurrentPage} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              icon={<ChevronRight className="w-3.5 h-3.5" />}
              title="下一页"
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
              icon={<ChevronsRight className="w-3.5 h-3.5" />}
              title="末页"
            />
          </div>
        </div>
      </div>

      {/* Batch Delete Confirmation Modal */}
      <Dialog
        open={batchDeleteModalOpen}
        onClose={() => setBatchDeleteModalOpen(false)}
        title="确认批量删除节点？"
        description={`即将永久删除选中的 ${selectedIds.length} 个节点，属于策略组的静态引用也将被移除。`}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBatchDeleteModalOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={batchDeleting}
              onClick={handleBatchDelete}
            >
              确认批量删除
            </Button>
          </>
        }
      >
        <div className="text-xs text-rose-300">
          批量删除节点将自动触发全局版本号（versionCode）更新，各客户端订阅下次访问将按需懒同步。
        </div>
      </Dialog>

      {/* Node Detail Modal with JSON View */}
      <Dialog
        open={detailModalOpen && !!detailNode}
        onClose={() => setDetailModalOpen(false)}
        size="2xl"
        title={
          <div className="flex items-center gap-2">
            <span>节点配置详情</span>
            {detailNode && (
              <Badge variant="neutral" size="sm">
                {detailNode.node_type.toUpperCase()}
              </Badge>
            )}
          </div>
        }
        description={detailNode ? detailNode.tag : ""}
        footer={
          <>
            {detailNode && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  handleTestLatency(detailNode);
                }}
                icon={<Zap className="w-3.5 h-3.5 text-sky-400" />}
              >
                立即测速
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetailModalOpen(false)}
            >
              关闭
            </Button>
          </>
        }
      >
        {detailNode && (
          <div className="space-y-4">
            {/* View Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setDetailTab("info")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${
                  detailTab === "info"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                <span>节点参数详情</span>
              </button>

              <button
                type="button"
                onClick={() => setDetailTab("json")}
                className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${
                  detailTab === "json"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>原始 JSON 视图</span>
              </button>
            </div>

            {/* TAB 1: Structured Details */}
            {detailTab === "info" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-500">
                      节点标识 (Tag)
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-100 truncate">
                        {detailNode.tag}
                      </span>
                      <CopyButton text={detailNode.tag} size="sm" />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-500">
                      所属订阅 / 来源
                    </span>
                    <div>
                      {detailNode.is_custom ? (
                        <Badge variant="warning" size="sm">
                          自定义节点
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          {detailNode.subscription_label || "未知订阅"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-500">
                      服务器与端口
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-200">
                        {detailNode.server}:{detailNode.port}
                      </span>
                      <CopyButton
                        text={`${detailNode.server}:${detailNode.port}`}
                        size="sm"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-500">协议类型</span>
                    <div>
                      <Badge variant="info" size="sm">
                        {detailNode.node_type.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-500">
                      最新测速结果
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">
                        Web 延迟:{" "}
                        {detailNode.last_web_latency !== null &&
                        detailNode.last_web_latency !== undefined
                          ? detailNode.last_web_latency === -1
                            ? "不可达 / 超时"
                            : `${detailNode.last_web_latency} ms`
                          : "未测速"}
                      </span>
                      {detailNode.last_tcp_latency !== null &&
                        detailNode.last_tcp_latency !== undefined && (
                          <span className="text-slate-400 font-mono">
                            (TCP: {detailNode.last_tcp_latency} ms)
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-500">
                      测试点 & 时间
                    </span>
                    <div
                      className="text-slate-300 truncate"
                      title={detailNode.last_target_url || ""}
                    >
                      {detailNode.last_target_url
                        ? getTestEndpointName(detailNode.last_target_url)
                        : "暂未测试"}
                      {detailNode.last_tested_at && (
                        <span className="text-slate-500 text-[10px] ml-1.5 font-mono">
                          ({formatDate(detailNode.last_tested_at)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Formatted JSON */}
            {detailTab === "json" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">
                    sing-box Outbound 配置
                  </span>
                  <CopyButton
                    text={(() => {
                      try {
                        return JSON.stringify(
                          JSON.parse(detailNode.raw_json),
                          null,
                          2,
                        );
                      } catch {
                        return detailNode.raw_json;
                      }
                    })()}
                    label="复制 JSON"
                  />
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-[50vh] leading-relaxed shadow-inner">
                  {(() => {
                    try {
                      return JSON.stringify(
                        JSON.parse(detailNode.raw_json),
                        null,
                        2,
                      );
                    } catch {
                      return detailNode.raw_json;
                    }
                  })()}
                </pre>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
};
