import React, { useState } from "react";
import { FolderKanban, Plus, Hash, Layers, Trash2, Edit } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { NodeGroup, NodeItem } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

interface NodeGroupsViewProps {
  groups: NodeGroup[];
  versionCode: string;
  nodes: NodeItem[];
  onRefresh: () => void;
}

export const NodeGroupsView: React.FC<NodeGroupsViewProps> = ({
  groups,
  versionCode,
  nodes,
  onRefresh,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<NodeGroup | null>(null);
  const [tag, setTag] = useState("");
  const [groupType, setGroupType] = useState("selector");
  const [filterRules, setFilterRules] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { success, error } = useToast();

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setTag("");
    setGroupType("selector");
    setFilterRules("");
    setModalOpen(true);
  };

  const handleOpenEdit = (g: NodeGroup) => {
    setEditingGroup(g);
    setTag(g.tag);
    setGroupType(g.group_type);
    setFilterRules(g.filter_rules || "");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!tag.trim()) {
      error("请输入组合标识 (Tag)");
      return;
    }

    setSaving(true);
    try {
      if (editingGroup) {
        await api.updateNodeGroup(editingGroup.id, {
          tag,
          group_type: groupType,
          filter_rules: filterRules,
          static_nodes: editingGroup.static_nodes,
        });
        success("节点组合已更新");
      } else {
        await api.createNodeGroup({
          tag,
          group_type: groupType,
          filter_rules: filterRules,
          static_nodes: "[]",
        });
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

  const getMatchedNodeCount = (filter: string) => {
    if (!filter) return 0;
    try {
      const reg = new RegExp(filter, "i");
      return nodes.filter((n) => reg.test(n.tag)).length;
    } catch {
      return 0;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action & VersionCode banner */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-sky-400" />
              <span>节点组合 (Node Groups)</span>
            </h2>
            <Badge variant="info" size="md">
              <Hash className="w-3 h-3 mr-0.5" />
              全局版本号: {versionCode || "未初始化"}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            将节点池中的节点动态按正则过滤规则或静态聚合为 Selector / URLTest
            策略组。变动将自动递增版本号触发客户端懒同步。
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreate}
          icon={<Plus className="w-4 h-4" />}
        >
          新建组合
        </Button>
      </div>

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {groups.map((g) => {
          const matchedCount = getMatchedNodeCount(g.filter_rules);
          let staticList: string[] = [];
          try {
            staticList = JSON.parse(g.static_nodes || "[]");
          } catch {
            // ignore
          }

          return (
            <div
              key={g.id}
              className="glass-panel p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-bold text-white">{g.tag}</h3>
                  </div>
                  <Badge
                    variant={g.group_type === "urltest" ? "warning" : "info"}
                    size="sm"
                  >
                    {g.group_type === "urltest"
                      ? "⚡ 自动测速 (urltest)"
                      : "🔀 手动选择 (selector)"}
                  </Badge>
                </div>

                {g.filter_rules ? (
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 text-[10px] uppercase font-mono">
                        动态过滤规则
                      </span>
                      <span className="text-sky-400 font-mono text-[11px]">
                        匹配 {matchedCount} 个节点
                      </span>
                    </div>
                    <code className="text-xs text-amber-300 font-mono block truncate">
                      {g.filter_rules}
                    </code>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-500">
                    静态固定节点列表 ({staticList.length} 个)
                  </div>
                )}
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
                    onClick={() => handleOpenEdit(g)}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(g.id)}
                    className="text-rose-400 hover:text-rose-300"
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
        title={editingGroup ? "编辑节点组合" : "新建节点组合"}
        description="定义策略组出站类型与动态节点聚合正则匹配式。"
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
        <div className="space-y-4">
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
              ]}
            />
          </div>

          <Input
            label="动态过滤规则 (正则表达式)"
            placeholder="例如: 香港|HK|Hong Kong"
            value={filterRules}
            onChange={(e) => setFilterRules(e.target.value)}
            helperText={`当前规则可匹配节点池中的 ${getMatchedNodeCount(filterRules)} 个节点`}
          />
        </div>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="确认删除该节点组合？"
        description="删除策略组后将同步触发全局 versionCode 更新。"
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
