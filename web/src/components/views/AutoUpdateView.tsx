import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  Play,
  RotateCcw,
  Clock,
  CheckCircle,
  AlertCircle,
  History,
  FileText,
  Terminal,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Layers,
  Search,
  X,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { Table, Column } from "../ui/Table";
import { Dialog } from "../ui/Dialog";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import {
  AutoUpdateSettings,
  AutoUpdateSnapshot,
  AutoUpdateProgressEvent,
} from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { formatDate, getErrorMessage } from "../../utils/format";

export const AutoUpdateView: React.FC = () => {
  const [settings, setSettings] = useState<AutoUpdateSettings>({
    cron_expression: "0 0 4 * * *",
    cron: "0 0 4 * * *",
    interval: "12h",
    daily_time: "04:00",
    sync_running_config: true,
    reload_service: true,
    enabled: true,
  });

  // Settings extra stats
  const [lastStatus, setLastStatus] = useState<string>("idle");
  const [nextRunTime, setNextRunTime] = useState<number | null>(null);
  const [lastRunTime, setLastRunTime] = useState<number | null>(null);
  const [currentVersionCode, setCurrentVersionCode] = useState<number | null>(
    null,
  );

  // History & Pagination states (default 20 per page)
  const [snapshots, setSnapshots] = useState<AutoUpdateSnapshot[]>([]);
  const [totalSnapshots, setTotalSnapshots] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const pageSize = 20;

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Rollback modal states
  const [rollbackId, setRollbackId] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  // View Log Detail modal states
  const [viewingLogSnapshot, setViewingLogSnapshot] =
    useState<AutoUpdateSnapshot | null>(null);
  const [fetchingLogDetail, setFetchingLogDetail] = useState(false);
  const [logSearchTerm, setLogSearchTerm] = useState("");

  // Manual Update Modal states
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualStatus, setManualStatus] = useState<
    "running" | "success" | "failed" | "idle"
  >("idle");
  const [manualLogs, setManualLogs] = useState<string[]>([]);
  const [manualVersionCode, setManualVersionCode] = useState<number | null>(
    null,
  );
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { success, error, warning } = useToast();

  // Load Settings
  const loadSettings = useCallback(async () => {
    try {
      const s = await api.getAutoUpdateSettings();
      setSettings(s);
      setLastStatus(s.last_status || "idle");
      setNextRunTime(s.next_run || null);
      setLastRunTime(s.last_run || null);
      if (s.current_version_code) {
        setCurrentVersionCode(s.current_version_code);
      }
    } catch (err: unknown) {
      error("加载自动更新设置失败", getErrorMessage(err));
    }
  }, [error]);

  // Load History snapshots with pagination
  const loadHistory = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const res = await api.listAutoUpdateSnapshots({
          page,
          page_size: pageSize,
        });
        setSnapshots(res.items);
        setTotalSnapshots(res.total);
        setCurrentPage(res.page);
        setTotalPages(res.total_pages);
      } catch (err: unknown) {
        error("加载历史快照失败", getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [error],
  );

  useEffect(() => {
    loadSettings();
    loadHistory(1);
  }, [loadSettings, loadHistory]);

  // Auto-scroll terminal log to bottom
  useEffect(() => {
    if (manualModalOpen && terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [manualLogs, manualModalOpen]);

  // Save Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.saveAutoUpdateSettings(settings);
      success("自动更新配置已保存");
      await loadSettings();
    } catch (err: unknown) {
      error("保存失败", getErrorMessage(err));
    } finally {
      setSavingSettings(false);
    }
  };

  // Trigger Manual Update
  const handleTriggerManualUpdate = async () => {
    setManualModalOpen(true);
    setManualStatus("running");
    setManualLogs(["[系统提示] 正在建立与后端的实时更新通信..."]);
    setManualVersionCode(null);

    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      // 1. Trigger the background process
      await api.triggerAutoUpdate();

      // 2. Connect to the SSE stream to receive live log lines
      let streamFinished = false;
      api
        .streamAutoUpdate((event: AutoUpdateProgressEvent) => {
          if (event.event_type === "status") {
            if (event.message) {
              const lines = event.message
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
              if (lines.length > 0) {
                setManualLogs(lines);
              }
            }
            if (event.status === "success" || event.status === "failed") {
              setManualStatus(event.status);
              streamFinished = true;
            }
          } else if (event.event_type === "log" && event.message) {
            setManualLogs((prev) => [...prev, event.message!]);
          } else if (event.event_type === "done") {
            setManualStatus("success");
            if (event.version_code) {
              setManualVersionCode(event.version_code);
              setCurrentVersionCode(event.version_code);
            }
            streamFinished = true;
            success(
              "自动更新流程已成功完成！",
              event.version_code
                ? `全局 versionCode 已刷新至 ${event.version_code}`
                : undefined,
            );
            loadHistory(1);
            loadSettings();
          } else if (event.event_type === "error") {
            setManualStatus("failed");
            streamFinished = true;
            error(
              "更新失败",
              event.message || "自动更新流水线执行过程中发生错误",
            );
            loadHistory(1);
            loadSettings();
          }
        }, abortCtrl.signal)
        .catch(() => {
          // SSE dropped or aborted
        });

      // 3. Fallback polling: poll status every 1.5s in case SSE is interrupted or behind proxies
      const intervalTimer = setInterval(async () => {
        if (streamFinished || abortCtrl.signal.aborted) {
          clearInterval(intervalTimer);
          return;
        }
        try {
          const st = await api.getAutoUpdateStatus();
          if (st.current_log) {
            const lines = st.current_log
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.length > 0) {
              setManualLogs(lines);
            }
          }
          if (!st.is_running) {
            clearInterval(intervalTimer);
            if (st.last_status === "success") {
              setManualStatus("success");
              if (st.version_code) {
                setManualVersionCode(st.version_code);
                setCurrentVersionCode(st.version_code);
              }
              loadHistory(1);
              loadSettings();
            } else if (st.last_status === "failed") {
              setManualStatus("failed");
              loadHistory(1);
              loadSettings();
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 1500);
    } catch (err: unknown) {
      setManualStatus("failed");
      const errMsg = getErrorMessage(err);
      setManualLogs((prev) => [...prev, `[错误] 触发更新失败: ${errMsg}`]);
      error("触发手动更新失败", errMsg);
    }
  };

  // Close Manual Modal
  const handleCloseManualModal = () => {
    if (manualStatus === "running") {
      warning("任务正在后台执行中，关闭窗口不会中断后台更新进程");
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setManualModalOpen(false);
  };

  // View Log of specific history item
  const handleViewLog = async (snapshot: AutoUpdateSnapshot) => {
    setViewingLogSnapshot(snapshot);
    setLogSearchTerm("");
    setFetchingLogDetail(true);
    try {
      const detail = await api.getAutoUpdateSnapshotDetail(snapshot.id);
      setViewingLogSnapshot(detail);
    } catch {
      // If fetching detail fails, show snapshot as is
      setViewingLogSnapshot(snapshot);
    } finally {
      setFetchingLogDetail(false);
    }
  };

  // Rollback Snapshot
  const handleRollback = async () => {
    if (!rollbackId) return;
    setRollingBack(true);
    try {
      const res = await api.rollbackAutoUpdateSnapshot(rollbackId);
      success("快照回滚成功", res.message);
      setRollbackId(null);
      await loadHistory(currentPage);
      await loadSettings();
    } catch (err: unknown) {
      error("回滚失败", getErrorMessage(err));
    } finally {
      setRollingBack(false);
    }
  };

  // History table column definitions
  const columns: Column<AutoUpdateSnapshot>[] = [
    {
      key: "id",
      header: "快照 ID",
      render: (s) => (
        <span className="font-mono text-slate-400 font-semibold">#{s.id}</span>
      ),
      className: "w-20",
    },
    {
      key: "type",
      header: "触发类型",
      render: (s) => {
        const isManual =
          s.change_type === "manual_update" ||
          s.action?.includes("手动") ||
          false;
        const isAuto =
          s.change_type === "auto_update" ||
          s.action?.includes("自动") ||
          false;
        if (isManual) {
          return (
            <Badge variant="info" size="sm">
              手动更新
            </Badge>
          );
        }
        if (isAuto) {
          return (
            <Badge
              variant="neutral"
              size="sm"
              className="text-purple-400 border-purple-500/30 bg-purple-500/10"
            >
              自动更新
            </Badge>
          );
        }
        return (
          <Badge variant="warning" size="sm">
            回滚前备份
          </Badge>
        );
      },
      className: "w-28",
    },
    {
      key: "status",
      header: "执行状态",
      render: (s) => {
        if (s.status === "success") {
          return (
            <Badge variant="success" size="sm" dot>
              成功
            </Badge>
          );
        }
        if (s.status === "failed") {
          return (
            <Badge variant="danger" size="sm" dot>
              失败
            </Badge>
          );
        }
        return (
          <Badge variant="neutral" size="sm">
            已记录
          </Badge>
        );
      },
      className: "w-24",
    },
    {
      key: "version_code",
      header: "versionCode",
      render: (s) => (
        <span className="font-mono text-xs text-sky-400">
          {s.version_code ? String(s.version_code) : "-"}
        </span>
      ),
      className: "w-36",
    },
    {
      key: "created_at",
      header: "生成时间",
      render: (s) => (
        <span className="font-mono text-xs text-slate-300">
          {formatDate(s.created_at)}
        </span>
      ),
      className: "w-44",
    },
    {
      key: "description",
      header: "快照说明 / 更新详情",
      render: (s) => (
        <div className="max-w-md truncate text-slate-200" title={s.detail}>
          {s.detail || s.description || "无详细描述"}
        </div>
      ),
    },
    {
      key: "actions",
      header: "操作",
      className: "text-right w-48",
      render: (s) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleViewLog(s)}
            loading={fetchingLogDetail && viewingLogSnapshot?.id === s.id}
            icon={<FileText className="w-3.5 h-3.5 text-sky-400" />}
            title="查看本次更新的完整执行日志"
          >
            查看日志
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={!s.has_content}
            onClick={() => setRollbackId(s.id)}
            icon={<RotateCcw className="w-3.5 h-3.5 text-amber-400" />}
            title={
              s.has_content ? "一键回滚至该历史快照" : "此记录未包含配置快照"
            }
          >
            回滚至此
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="glass-panel p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-sky-400" />
            <span>自动更新中心 (Auto Update Center)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            全链路闭环流水线：拉取所有订阅源 ➔ 刷新节点池 ➔ 重新计算节点组合与
            versionCode ➔ 同步当前运行配置
            outbounds（清空旧节点重构，失效节点与空组合回退 direct）➔ 平滑重启
            sing-box ➔ 备份历史快照与日志。
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          loading={manualStatus === "running"}
          onClick={handleTriggerManualUpdate}
          icon={<Play className="w-4 h-4" />}
          className="w-full sm:w-auto whitespace-nowrap shadow-lg shadow-sky-500/20"
        >
          立即手动更新
        </Button>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Cron Schedule Settings */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                定时自动更新调度策略
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {settings.enabled ? "已启用" : "已停用"}
              </span>
              <Switch
                checked={settings.enabled ?? true}
                onChange={(checked) =>
                  setSettings({ ...settings, enabled: checked })
                }
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  更新频率模式
                </label>
                <Select
                  value={settings.interval || "12h"}
                  onChange={(val) =>
                    setSettings({ ...settings, interval: val })
                  }
                  options={[
                    { value: "1h", label: "每隔 1 小时" },
                    { value: "6h", label: "每隔 6 小时" },
                    { value: "12h", label: "每隔 12 小时 (推荐)" },
                    { value: "24h", label: "每隔 24 小时" },
                    { value: "48h", label: "每隔 48 小时" },
                    { value: "daily", label: "每天固定时间" },
                    { value: "cron", label: "自定义 Cron 表达式" },
                  ]}
                />
              </div>

              {settings.interval === "daily" ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    每日触发时间 (HH:MM)
                  </label>
                  <Input
                    value={settings.daily_time || "04:00"}
                    onChange={(e) =>
                      setSettings({ ...settings, daily_time: e.target.value })
                    }
                    placeholder="04:00"
                  />
                </div>
              ) : settings.interval === "cron" ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Cron 表达式
                  </label>
                  <Input
                    value={settings.cron_expression || settings.cron || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        cron_expression: e.target.value,
                        cron: e.target.value,
                      })
                    }
                    placeholder="0 0 4 * * *"
                  />
                </div>
              ) : (
                <div className="flex flex-col justify-end">
                  <span className="text-[11px] text-slate-500 mb-2">
                    系统将在每次执行完成后自动顺延设定间隔。
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">
                下次计划执行：
                <span className="text-slate-200 font-mono ml-1">
                  {nextRunTime ? formatDate(nextRunTime) : "未排程"}
                </span>
              </span>
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
        </div>

        {/* Card 2: Pipeline options & status board */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                更新联动选项
              </h3>
            </div>
            {currentVersionCode && (
              <Badge variant="platform" size="sm" platform="linux">
                节点组合 vCode: {currentVersionCode}
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <div className="pr-4">
                <span className="text-xs font-medium text-slate-200">
                  自动同步至当前运行配置
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  将更新后的最新节点与节点组合重写注入本机活跃配置（清空旧出站，失效节点与变空组合自动回退
                  direct）。
                </p>
              </div>
              <Switch
                checked={!!settings.sync_running_config}
                onChange={(checked) =>
                  setSettings({ ...settings, sync_running_config: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <div className="pr-4">
                <span className="text-xs font-medium text-slate-200">
                  平滑热重载 sing-box 服务
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  更新完成之后，若 sing-box
                  属于运行状态，使用最新配置重启服务使其无缝生效。
                </p>
              </div>
              <Switch
                checked={!!settings.reload_service}
                onChange={(checked) =>
                  setSettings({ ...settings, reload_service: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-1 px-1">
              <span>
                上次更新：
                <span className="text-slate-300 font-mono ml-1">
                  {lastRunTime ? formatDate(lastRunTime) : "未曾执行"}
                </span>
              </span>
              <span>
                状态：
                <Badge
                  variant={
                    lastStatus === "success"
                      ? "success"
                      : lastStatus === "failed"
                        ? "danger"
                        : "neutral"
                  }
                  size="sm"
                  className="ml-1"
                >
                  {lastStatus === "success"
                    ? "成功"
                    : lastStatus === "failed"
                      ? "失败"
                      : "待触发"}
                </Badge>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshots Table & History List (Paged with 20 items per page) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              历史备份快照与一键回滚列表
            </h3>
            <span className="text-xs text-slate-500">
              (每页 20 条，记录每次手动更新与定时自动更新)
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadHistory(currentPage)}
            icon={
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
            }
          >
            刷新列表
          </Button>
        </div>

        <Table
          columns={columns}
          data={snapshots}
          keyField="id"
          loading={loading}
          emptyText="暂无历史更新快照记录"
        />

        {/* Paging Footer */}
        {totalSnapshots > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 pt-2 text-xs text-slate-400">
            <div>
              显示第{" "}
              <span className="text-slate-200 font-medium">
                {(currentPage - 1) * pageSize + 1}
              </span>{" "}
              至{" "}
              <span className="text-slate-200 font-medium">
                {Math.min(currentPage * pageSize, totalSnapshots)}
              </span>{" "}
              条，共{" "}
              <span className="text-slate-200 font-medium">
                {totalSnapshots}
              </span>{" "}
              条历史记录
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage <= 1 || loading}
                onClick={() => loadHistory(1)}
                icon={<ChevronsLeft className="w-3.5 h-3.5" />}
                title="首页"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage <= 1 || loading}
                onClick={() => loadHistory(currentPage - 1)}
                icon={<ChevronLeft className="w-3.5 h-3.5" />}
                title="上一页"
              />
              <span className="px-2.5 py-1 rounded bg-slate-800/60 font-mono text-slate-200 border border-slate-800">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages || loading}
                onClick={() => loadHistory(currentPage + 1)}
                icon={<ChevronRight className="w-3.5 h-3.5" />}
                title="下一页"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages || loading}
                onClick={() => loadHistory(totalPages)}
                icon={<ChevronsRight className="w-3.5 h-3.5" />}
                title="末页"
              />
            </div>
          </div>
        )}
      </div>

      {/* Manual Update Progress Modal with Real-time Logs Terminal */}
      <Dialog
        open={manualModalOpen}
        onClose={handleCloseManualModal}
        size="2xl"
        title={
          <div className="flex items-center justify-between w-full pr-6">
            <span className="flex items-center gap-2">
              <RefreshCw
                className={`w-5 h-5 text-sky-400 ${
                  manualStatus === "running" ? "animate-spin" : ""
                }`}
              />
              <span>执行全流程更新</span>
            </span>
            <Badge
              variant={
                manualStatus === "success"
                  ? "success"
                  : manualStatus === "failed"
                    ? "danger"
                    : "info"
              }
              size="sm"
              dot={manualStatus === "running"}
            >
              {manualStatus === "running"
                ? "更新流水线执行中..."
                : manualStatus === "success"
                  ? "更新已完成"
                  : manualStatus === "failed"
                    ? "更新失败"
                    : "就绪"}
            </Badge>
          </div>
        }
        description="系统正在执行订阅拉取、节点池更新、节点组合重新计算、运行配置同步与服务热重载。"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-400">
              {manualStatus === "running"
                ? "更新流水线正在执行，窗口关闭后仍会在后台运行"
                : manualStatus === "success"
                  ? `成功更新，节点组合 versionCode: ${manualVersionCode || currentVersionCode}`
                  : "更新未能完全成功，请查看日志排查"}
            </span>
            <Button
              variant={manualStatus === "running" ? "ghost" : "primary"}
              size="sm"
              onClick={handleCloseManualModal}
            >
              {manualStatus === "running" ? "后台运行并关闭" : "完成"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {/* Status summary banner */}
          {manualStatus === "success" ? (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                全流程更新完成！最新节点已同步至节点组合与运行配置，sing-box
                服务已平滑重载。
              </span>
            </div>
          ) : manualStatus === "failed" ? (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                更新过程中发生错误，具体失败步骤请参阅下方控制台输出。
              </span>
            </div>
          ) : null}

          {/* Real-time Console Log Terminal */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-inner">
            <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                <span>实时更新控制台日志</span>
              </div>
              <CopyButton
                text={manualLogs.join("\n")}
                label="复制日志"
                size="sm"
              />
            </div>
            <div className="p-3 font-mono text-[11px] leading-relaxed text-slate-300 max-h-72 overflow-y-auto space-y-1">
              {manualLogs.map((log, index) => (
                <div
                  key={index}
                  className={
                    log.includes("失败") ||
                    log.includes("Error") ||
                    log.includes("错误")
                      ? "text-rose-400 font-medium"
                      : log.includes("成功") || log.includes("已更新")
                        ? "text-emerald-300"
                        : log.startsWith("步骤")
                          ? "text-sky-300 font-semibold pt-1 border-t border-slate-850 first:pt-0 first:border-0"
                          : "text-slate-300"
                  }
                >
                  {log}
                </div>
              ))}
              <div ref={terminalBottomRef} />
            </div>
          </div>
        </div>
      </Dialog>

      {/* Snapshot Log Detail Modal */}
      <Dialog
        open={viewingLogSnapshot !== null}
        onClose={() => {
          setViewingLogSnapshot(null);
          setLogSearchTerm("");
        }}
        size="2xl"
        title={
          <div className="flex items-center justify-between w-full pr-6">
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>更新历史日志详情 (快照 #{viewingLogSnapshot?.id})</span>
              {fetchingLogDetail && (
                <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              )}
            </span>
            {viewingLogSnapshot?.status && (
              <Badge
                variant={
                  viewingLogSnapshot.status === "success" ? "success" : "danger"
                }
                size="sm"
              >
                {viewingLogSnapshot.status === "success"
                  ? "更新成功"
                  : "更新失败"}
              </Badge>
            )}
          </div>
        }
        description={
          viewingLogSnapshot
            ? `${formatDate(viewingLogSnapshot.created_at)} | ${
                viewingLogSnapshot.action || "更新记录"
              } | versionCode: ${viewingLogSnapshot.version_code ?? "未提供"}`
            : ""
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <CopyButton
              text={
                viewingLogSnapshot?.log ||
                viewingLogSnapshot?.detail ||
                "无日志"
              }
              label="复制完整日志"
              size="sm"
              variant="secondary"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setViewingLogSnapshot(null);
                setLogSearchTerm("");
              }}
            >
              关闭
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {viewingLogSnapshot?.detail && (
            <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <span>{viewingLogSnapshot.detail}</span>
            </div>
          )}

          {/* Search bar inside log modal */}
          <div className="flex items-center gap-2 px-1">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索日志行（如：步骤、修复、sing-box、失败）..."
                value={logSearchTerm}
                onChange={(e) => setLogSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              {logSearchTerm && (
                <button
                  type="button"
                  onClick={() => setLogSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">执行阶段记录</span>
              <span className="text-[11px] text-slate-500">
                {(() => {
                  const raw =
                    viewingLogSnapshot?.log || viewingLogSnapshot?.detail || "";
                  const totalCount = raw
                    .split("\n")
                    .filter((l) => l.trim().length > 0).length;
                  if (!logSearchTerm.trim()) {
                    return `${totalCount} 行`;
                  }
                  const matched = raw
                    .split("\n")
                    .filter(
                      (l) =>
                        l.trim().length > 0 &&
                        l.toLowerCase().includes(logSearchTerm.toLowerCase()),
                    ).length;
                  return `匹配 ${matched} / ${totalCount} 行`;
                })()}
              </span>
            </div>
            <div className="p-3 font-mono text-[11px] leading-relaxed text-slate-300 max-h-96 overflow-y-auto space-y-1">
              {(() => {
                const raw =
                  viewingLogSnapshot?.log || viewingLogSnapshot?.detail || "";
                const lines = raw
                  .split("\n")
                  .map((l) => l.trim())
                  .filter((l) => l.length > 0);
                if (lines.length === 0) {
                  return (
                    <div className="text-slate-500 italic py-2 text-center">
                      该快照未记录详细日志文本
                    </div>
                  );
                }
                const filtered = logSearchTerm.trim()
                  ? lines.filter((l) =>
                      l.toLowerCase().includes(logSearchTerm.toLowerCase()),
                    )
                  : lines;
                if (filtered.length === 0) {
                  return (
                    <div className="text-slate-500 italic py-2 text-center">
                      未找到包含 “{logSearchTerm}” 的日志行
                    </div>
                  );
                }
                return filtered.map((line, idx) => (
                  <div
                    key={idx}
                    className={
                      line.includes("失败") ||
                      line.includes("Error") ||
                      line.includes("错误")
                        ? "text-rose-400 font-medium"
                        : line.includes("警告") || line.includes("Warning")
                          ? "text-amber-400"
                          : line.includes("成功") ||
                              line.includes("已更新") ||
                              line.includes("✅")
                            ? "text-emerald-300"
                            : line.startsWith("步骤")
                              ? "text-sky-300 font-semibold pt-1 border-t border-slate-850 first:pt-0 first:border-0"
                              : "text-slate-300"
                    }
                  >
                    {line}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </Dialog>

      {/* Rollback confirmation modal */}
      <Dialog
        open={rollbackId !== null}
        onClose={() => setRollbackId(null)}
        title="确认回滚配置快照？"
        description="系统将恢复至该快照保存时的完整出站与分流配置，并自动向当前运行服务写入生效。"
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
        <div className="text-xs text-amber-300 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          回滚操作会覆盖当前运行配置中的所有 outbounds 策略组与 route
          路由分流规则。系统在执行前会自动先为当前状态备份一份新快照，确保可再次恢复。
        </div>
      </Dialog>
    </div>
  );
};
