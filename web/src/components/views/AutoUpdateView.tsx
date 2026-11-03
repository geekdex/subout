import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Play,
  RotateCcw,
  Clock,
  CheckCircle,
  History,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Switch } from "../ui/Switch";
import { Table, Column } from "../ui/Table";
import { Dialog } from "../ui/Dialog";
import { AutoUpdateSettings, AutoUpdateSnapshot } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { formatDate, getErrorMessage } from "../../utils/format";

export const AutoUpdateView: React.FC = () => {
  const [settings, setSettings] = useState<AutoUpdateSettings>({
    cron_expression: "0 0 4 * * *",
    sync_running_config: true,
    reload_service: true,
  });
  const [snapshots, setSnapshots] = useState<AutoUpdateSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rollbackId, setRollbackId] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const { success, error } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [s, snaps] = await Promise.all([
        api.getAutoUpdateSettings(),
        api.listAutoUpdateSnapshots(),
      ]);
      setSettings(s);
      setSnapshots(snaps);
    } catch (err: unknown) {
      error("加载自动更新数据失败", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.saveAutoUpdateSettings(settings);
      success("自动更新配置已保存");
    } catch (err: unknown) {
      error("保存失败", getErrorMessage(err));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await api.triggerAutoUpdate();
      success("自动更新流程完成", `全局版本号更新至 ${res.version_code}`);
      await loadData();
    } catch (err: unknown) {
      error("执行更新失败", getErrorMessage(err));
    } finally {
      setTriggering(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackId) return;
    setRollingBack(true);
    try {
      const res = await api.rollbackAutoUpdateSnapshot(rollbackId);
      success("快照回滚成功", res.message);
      setRollbackId(null);
      await loadData();
    } catch (err: unknown) {
      error("回滚失败", getErrorMessage(err));
    } finally {
      setRollingBack(false);
    }
  };

  const columns: Column<AutoUpdateSnapshot>[] = [
    {
      key: "id",
      header: "快照 ID",
      render: (s) => <span className="font-mono text-slate-400">#{s.id}</span>,
      className: "w-20",
    },
    {
      key: "created_at",
      header: "生成时间",
      render: (s) => (
        <span className="font-mono text-xs text-slate-300">
          {formatDate(s.created_at)}
        </span>
      ),
    },
    {
      key: "description",
      header: "快照描述 / 备份原因",
      render: (s) => (
        <span className="text-slate-200">
          {s.description || "自动备份快照"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right",
      render: (s) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRollbackId(s.id)}
          icon={<RotateCcw className="w-3.5 h-3.5 text-amber-400" />}
        >
          回滚至此
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-sky-400" />
            <span>自动更新中心 (Auto Update Center)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            流水线调度：拉取所有订阅源 ➔ 刷新节点池 ➔ 重新计算节点组合与
            versionCode ➔ 同步本机运行配置 ➔ 自动备份历史快照。
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          loading={triggering}
          onClick={handleTrigger}
          icon={<Play className="w-4 h-4" />}
        >
          立即触发全流程更新
        </Button>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cron Schedule Settings */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Clock className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">
              定时调度策略 (Cron)
            </h3>
          </div>

          <div className="space-y-3">
            <Input
              label="Cron 表达式"
              value={settings.cron_expression}
              onChange={(e) =>
                setSettings({ ...settings, cron_expression: e.target.value })
              }
              placeholder="0 0 4 * * *"
              helperText="默认为每天凌晨 04:00 自动触发更新"
            />

            <Button
              variant="secondary"
              size="sm"
              loading={savingSettings}
              onClick={handleSaveSettings}
            >
              保存调度设置
            </Button>
          </div>
        </div>

        {/* Pipeline options */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">更新后联动选项</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200">
                  自动同步至当前运行配置
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  将更新后的最新节点出站合并注入本机活跃配置
                </p>
              </div>
              <Switch
                checked={settings.sync_running_config}
                onChange={(checked) =>
                  setSettings({ ...settings, sync_running_config: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <div>
                <span className="text-xs font-medium text-slate-200">
                  平滑热重载 sing-box 服务
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  配置合并完成后，向运行中的内核发送热重载信号无缝生效
                </p>
              </div>
              <Switch
                checked={settings.reload_service}
                onChange={(checked) =>
                  setSettings({ ...settings, reload_service: checked })
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Snapshots Table */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">
            历史备份快照与一键回滚
          </h3>
        </div>
        <Table
          columns={columns}
          data={snapshots}
          keyField="id"
          loading={loading}
        />
      </div>

      {/* Rollback confirmation modal */}
      <Dialog
        open={rollbackId !== null}
        onClose={() => setRollbackId(null)}
        title="确认回滚配置快照？"
        description="系统将恢复至该快照保存时的完整出站与分流配置，并自动向当前运行服务写入。"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRollbackId(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={rollingBack}
              onClick={handleRollback}
            >
              确认回滚
            </Button>
          </>
        }
      >
        <div className="text-xs text-amber-300">
          回滚操作会覆盖当前运行配置中的 outbounds 与 route
          设置。请确保没有未保存的自定义规则。
        </div>
      </Dialog>
    </div>
  );
};
