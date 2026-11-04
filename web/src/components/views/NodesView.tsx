import React, { useState } from "react";
import {
  Server,
  Activity,
  Trash2,
  Search,
  Zap,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { Table, Column } from "../ui/Table";
import { Dialog } from "../ui/Dialog";
import { NodeItem } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { formatLatency, getErrorMessage } from "../../utils/format";

interface NodesViewProps {
  nodes?: NodeItem[];
  onRefresh: () => void;
}

export const NodesView: React.FC<NodesViewProps> = ({ nodes = [], onRefresh }) => {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [testingAll, setTestingAll] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);

  const { success, error } = useToast();

  const safeNodes = Array.isArray(nodes) ? nodes : [];

  const filteredNodes = safeNodes.filter(
    (n) =>
      (n.tag || "").toLowerCase().includes(search.toLowerCase()) ||
      (n.server || "").toLowerCase().includes(search.toLowerCase()) ||
      (n.node_type || "").toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelectAll = () => {
    if (selectedIds.length === filteredNodes.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredNodes.map((n) => n.id));
    }
  };

  const handleToggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleTestLatency = async (node: NodeItem) => {
    setTestingId(node.id);
    try {
      const res = await api.testNodeLatency(node.id);
      const l = res.latency_ms;
      success("测速完成", `${node.tag}: ${l !== null && l !== undefined ? `${l} ms` : "超时"}`);
      onRefresh();
    } catch (err: unknown) {
      error("测速失败", getErrorMessage(err));
    } finally {
      setTestingId(null);
    }
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      await api.testAllNodesLatency();
      success("全部节点测速完成");
      onRefresh();
    } catch (err: unknown) {
      error("测速失败", getErrorMessage(err));
    } finally {
      setTestingAll(false);
    }
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

  const columns: Column<NodeItem>[] = [
    {
      key: "select",
      header: (
        <button
          type="button"
          onClick={handleSelectAll}
          className="p-1 text-slate-400 hover:text-slate-200"
        >
          {selectedIds.length > 0 &&
          selectedIds.length === filteredNodes.length ? (
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
      render: (node) => (
        <span className="font-mono text-slate-300">
          {node.server}:{node.port}
        </span>
      ),
    },
    {
      key: "latency_ms",
      header: "延迟",
      sortable: true,
      render: (node) => {
        const rawLatency = node.last_tcp_latency ?? node.last_web_latency ?? node.latency_ms;
        const { text, color } = formatLatency(rawLatency);
        return (
          <span className={`font-mono text-xs font-medium ${color}`}>
            {text}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      render: (node) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            loading={testingId === node.id}
            onClick={() => handleTestLatency(node)}
            icon={<Zap className="w-3.5 h-3.5" />}
            title="测速"
          >
            测速
          </Button>
          <Button
            variant="ghost"
            size="sm"
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
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-sky-400" />
            <span>节点池管理 (Node Pool)</span>
            <Badge variant="info" size="sm">
              共 {safeNodes.length} 个
            </Badge>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            订阅拉取的所有出站节点统一汇集在此，可单点测速、批量筛选、或供节点组合动态聚合。
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {selectedIds.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setBatchDeleteModalOpen(true)}
              icon={<Trash2 className="w-4 h-4" />}
            >
              删除所选 ({selectedIds.length})
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={testingAll}
            onClick={handleTestAll}
            icon={<Activity className="w-4 h-4 text-emerald-400" />}
          >
            全量测速
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-4">
        <div className="w-72">
          <Input
            placeholder="搜索节点名称、IP 或协议..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
            clearable
            onClear={() => setSearch("")}
          />
        </div>
      </div>

      {/* Nodes Table */}
      <Table columns={columns} data={filteredNodes} keyField="id" />

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
    </div>
  );
};
