import React, { useState } from "react";
import {
  Rss,
  Plus,
  RefreshCw,
  Trash2,
  Edit,
  Calendar,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Switch } from "../ui/Switch";
import { Subscription } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { formatBytes, formatDate, getErrorMessage } from "../../utils/format";

interface SubscriptionsViewProps {
  subscriptions: Subscription[];
  onRefresh: () => void;
}

export const SubscriptionsView: React.FC<SubscriptionsViewProps> = ({
  subscriptions,
  onRefresh,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [userAgent, setUserAgent] = useState("clashmeta");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { success, error } = useToast();

  const handleOpenCreate = () => {
    setEditingSub(null);
    setName("");
    setUrl("");
    setUserAgent("clashmeta");
    setAutoUpdate(true);
    setModalOpen(true);
  };

  const handleOpenEdit = (sub: Subscription) => {
    setEditingSub(sub);
    setName(sub.name);
    setUrl(sub.url);
    setUserAgent(sub.user_agent || "clashmeta");
    setAutoUpdate(sub.auto_update);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      error("请填写订阅名称和订阅链接");
      return;
    }

    setSaving(true);
    try {
      if (editingSub) {
        await api.updateSubscription(editingSub.id, {
          name,
          url,
          user_agent: userAgent,
          auto_update: autoUpdate,
        });
        success("订阅已更新");
      } else {
        await api.createSubscription({
          name,
          url,
          user_agent: userAgent,
          auto_update: autoUpdate,
          enabled: true,
          update_interval_mins: 1440,
        });
        success("订阅已添加");
      }
      setModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      error("保存失败", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await api.syncSubscription(id);
      success("拉取订阅成功", `同步更新了 ${res.node_count} 个节点`);
      onRefresh();
    } catch (err: unknown) {
      error("拉取订阅失败", getErrorMessage(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await api.deleteSubscription(deleteConfirmId);
      success("订阅已删除");
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err: unknown) {
      error("删除失败", getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Rss className="w-5 h-5 text-indigo-400" />
            <span>订阅管理 (Subscription Sources)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            添加机场或远程订阅链接，系统自动解析协议并将可用节点同步到中央节点池。
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreate}
          icon={<Plus className="w-4 h-4" />}
        >
          添加订阅
        </Button>
      </div>

      {/* Subscription Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {subscriptions.map((sub) => {
          const usedBytes = (sub.upload_bytes ?? 0) + (sub.download_bytes ?? 0);
          const totalBytes = sub.total_bytes ?? 0;
          const usagePercent =
            totalBytes > 0
              ? Math.min(100, Math.round((usedBytes / totalBytes) * 100))
              : 0;
          const isSyncing = syncingId === sub.id;

          return (
            <div
              key={sub.id}
              className="glass-panel p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{sub.name}</span>
                      <Badge variant="info" size="sm">
                        {sub.node_count} 节点
                      </Badge>
                    </h3>
                    <p
                      className="text-xs text-slate-400 font-mono truncate max-w-sm"
                      title={sub.url}
                    >
                      {sub.url}
                    </p>
                  </div>
                  <Badge
                    variant={sub.enabled ? "success" : "neutral"}
                    dot
                    size="sm"
                  >
                    {sub.enabled ? "启用中" : "已禁用"}
                  </Badge>
                </div>

                {/* Userinfo traffic bar */}
                {totalBytes > 0 && (
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <ArrowUp className="w-3 h-3 text-sky-400" />
                          {formatBytes(sub.upload_bytes)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <ArrowDown className="w-3 h-3 text-emerald-400" />
                          {formatBytes(sub.download_bytes)}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-medium text-slate-200">
                        {formatBytes(usedBytes)} / {formatBytes(totalBytes)} (
                        {usagePercent}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          usagePercent > 85
                            ? "bg-rose-500"
                            : usagePercent > 60
                              ? "bg-amber-500"
                              : "bg-sky-500"
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>

                    {sub.expire_timestamp && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>
                          到期:{" "}
                          {new Date(
                            sub.expire_timestamp * 1000,
                          ).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>最近拉取: {formatDate(sub.last_updated_at)}</span>
                  <span>UA: {sub.user_agent || "clashmeta"}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isSyncing}
                  onClick={() => handleSync(sub.id)}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  立即同步
                </Button>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(sub)}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(sub.id)}
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
        title={editingSub ? "编辑订阅源" : "添加订阅源"}
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
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="订阅名称"
            placeholder="例如: 主力机场 A"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="订阅 URL 链接"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Input
            label="User-Agent 伪装"
            placeholder="clashmeta"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
          />
          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="text-xs font-medium text-slate-200">
                自动更新调度
              </span>
              <p className="text-[11px] text-slate-400">
                是否纳入全局自动更新中心的定时轮询
              </p>
            </div>
            <Switch checked={autoUpdate} onChange={setAutoUpdate} />
          </div>
        </div>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="确认删除该订阅源？"
        description="删除订阅源将同时清理归属于此订阅的所有节点。"
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
        <div className="text-xs text-rose-300">
          此操作会清除与该订阅关联的所有节点数据，请谨慎操作。
        </div>
      </Dialog>
    </div>
  );
};
