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
  AlertTriangle,
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
  subscriptions?: Subscription[];
  onRefresh: () => void;
}

export const SubscriptionsView: React.FC<SubscriptionsViewProps> = ({
  subscriptions = [],
  onRefresh,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [userAgent, setUserAgent] = useState("clashmeta");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [editSyncNodes, setEditSyncNodes] = useState(true);

  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Quick toggle and disable confirmation modal
  const [disableTargetSub, setDisableTargetSub] = useState<Subscription | null>(
    null,
  );
  const [syncToNodesAndGroups, setSyncToNodesAndGroups] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const { success, error } = useToast();
  const safeSubs = Array.isArray(subscriptions) ? subscriptions : [];

  const handleOpenCreate = () => {
    setEditingSub(null);
    setName("");
    setUrl("");
    setUserAgent("clashmeta");
    setAutoUpdate(true);
    setEnabled(true);
    setEditSyncNodes(true);
    setModalOpen(true);
  };

  const handleOpenEdit = (sub: Subscription) => {
    setEditingSub(sub);
    setName(sub.label || sub.name || "");
    setUrl(sub.url);
    setUserAgent(sub.user_agent || "clashmeta");
    setAutoUpdate(sub.auto_update ?? true);
    setEnabled(sub.enabled ?? true);
    setEditSyncNodes(true);
    setModalOpen(true);
  };

  const handleToggleClick = (sub: Subscription, nextChecked: boolean) => {
    if (nextChecked) {
      handleEnable(sub);
    } else {
      setDisableTargetSub(sub);
      setSyncToNodesAndGroups(true);
    }
  };

  const handleEnable = async (sub: Subscription) => {
    setTogglingId(sub.id);
    try {
      const res = await api.toggleSubscription(sub.id, { enabled: true });
      success(
        "订阅已开启",
        res.message || `订阅 "${sub.label || sub.name}" 已成功开启`,
      );
      onRefresh();
    } catch (err: unknown) {
      error("开启订阅失败", getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDisable = async () => {
    if (!disableTargetSub) return;
    setTogglingId(disableTargetSub.id);
    try {
      const res = await api.toggleSubscription(disableTargetSub.id, {
        enabled: false,
        clear_nodes_and_groups: syncToNodesAndGroups,
      });
      success(
        "订阅已关闭",
        res.message ||
          (syncToNodesAndGroups
            ? "已清空关联节点并同步更新节点组合数据"
            : undefined),
      );
      setDisableTargetSub(null);
      onRefresh();
    } catch (err: unknown) {
      error("关闭订阅失败", getErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
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
          enabled,
          clear_nodes_and_groups: !enabled && editSyncNodes,
        });
        success(
          "订阅已更新",
          !enabled && editSyncNodes
            ? "已关闭订阅并清空关联节点与节点组合数据"
            : undefined,
        );
      } else {
        await api.createSubscription({
          name,
          url,
          user_agent: userAgent,
          auto_update: autoUpdate,
          enabled,
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
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top action header */}
      <div className="glass-panel p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
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
          className="w-full sm:w-auto"
        >
          添加订阅
        </Button>
      </div>

      {/* Subscription Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {safeSubs.map((sub) => {
          const uploadVal = sub.upload_bytes ?? sub.upload ?? 0;
          const downloadVal = sub.download_bytes ?? sub.download ?? 0;
          const totalBytes = sub.total_bytes ?? sub.total ?? 0;
          const usedBytes = uploadVal + downloadVal;
          const usagePercent =
            totalBytes > 0
              ? Math.min(100, Math.round((usedBytes / totalBytes) * 100))
              : 0;
          const isSyncing = syncingId === sub.id;
          const isToggling = togglingId === sub.id;
          const subTitle = sub.label || sub.name || `订阅 #${sub.id}`;
          const expireVal = sub.expire_timestamp ?? sub.expire;
          const lastFetchVal = sub.last_fetched || sub.last_updated_at;

          return (
            <div
              key={sub.id}
              className={`glass-panel p-5 flex flex-col justify-between space-y-4 transition-opacity ${
                !sub.enabled ? "border-slate-800/60 bg-slate-900/40" : ""
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                      <span className="truncate max-w-[200px] sm:max-w-xs">
                        {subTitle}
                      </span>
                      {sub.node_count !== undefined && (
                        <Badge
                          variant={sub.enabled ? "info" : "neutral"}
                          size="sm"
                        >
                          {sub.node_count} 节点
                        </Badge>
                      )}
                    </h3>
                    <p
                      className="text-xs text-slate-400 font-mono truncate max-w-sm"
                      title={sub.url}
                    >
                      {sub.url}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={sub.enabled ? "success" : "neutral"}
                      dot
                      size="sm"
                    >
                      {sub.enabled ? "已开启" : "已关闭"}
                    </Badge>
                    <Switch
                      checked={sub.enabled}
                      disabled={isToggling}
                      onChange={(checked) => handleToggleClick(sub, checked)}
                      aria-label={sub.enabled ? "关闭此订阅" : "开启此订阅"}
                    />
                  </div>
                </div>

                {/* Userinfo traffic bar */}
                {totalBytes > 0 && (
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <ArrowUp className="w-3 h-3 text-sky-400" />
                          {formatBytes(uploadVal)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <ArrowDown className="w-3 h-3 text-emerald-400" />
                          {formatBytes(downloadVal)}
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

                    {expireVal && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        <span>
                          到期:{" "}
                          {new Date(expireVal * 1000).toLocaleDateString(
                            "zh-CN",
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>最近拉取: {formatDate(lastFetchVal)}</span>
                  <span>UA: {sub.user_agent || "clashmeta"}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!sub.enabled}
                  loading={isSyncing}
                  onClick={() => handleSync(sub.id)}
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  title={
                    !sub.enabled
                      ? "订阅已关闭，请先开启后再进行同步"
                      : "立即拉取订阅并更新节点"
                  }
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
                启用状态
              </span>
              <p className="text-[11px] text-slate-400">是否开启该订阅源</p>
            </div>
            <Switch checked={enabled} onChange={setEnabled} />
          </div>

          {!enabled && editingSub?.enabled && (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-amber-200">
                    同步清空节点和节点组合数据
                  </span>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    关闭时清空此订阅已存在的节点数据，并从各节点组合中清理相关数据（注意：不会影响已有配置，配置需手动点击同步）。
                  </p>
                </div>
                <Switch checked={editSyncNodes} onChange={setEditSyncNodes} />
              </div>
            </div>
          )}

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

      {/* Disable Subscription Confirmation Dialog */}
      <Dialog
        open={disableTargetSub !== null}
        onClose={() => setDisableTargetSub(null)}
        title="确认关闭订阅源？"
        description={`正在关闭订阅源 "${disableTargetSub?.label || disableTargetSub?.name || ""}"。关闭后该订阅将不再参与自动更新与同步。`}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisableTargetSub(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={togglingId === disableTargetSub?.id}
              onClick={handleConfirmDisable}
            >
              确认关闭
            </Button>
          </>
        }
      >
        <div className="space-y-4 pt-1">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-200">
                  同步到节点和节点组合
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  如果勾选，那么已经存在的节点和节点组合将清空数据。
                </p>
              </div>
              <Switch
                checked={syncToNodesAndGroups}
                onChange={setSyncToNodesAndGroups}
              />
            </div>
          </div>

          <div className="text-[11px] text-amber-400/90 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              注意：不要影响到配置，配置需要再手动点击同步才同步到配置。
            </span>
          </div>
        </div>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="确认删除该订阅源？"
        description="删除订阅源将同时清理归属于此订阅的所有节点与节点组合引用。"
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
