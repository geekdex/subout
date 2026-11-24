import React, { useState, useEffect, useRef } from "react";
import { FileText, Trash2, ArrowDownCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { api, ApiError } from "../../api/client";
import { getErrorMessage } from "../../utils/format";
import type { LogLevel, LogSource, ServiceLogEntry } from "../../types/api";

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  panic: 70,
};

type SourceFilter = "all" | LogSource;
type LevelFilter = "all" | "info" | "warn" | "error";

const levelColorClass = (level: LogLevel) => {
  switch (level) {
    case "error":
    case "fatal":
    case "panic":
      return "text-rose-400";
    case "warn":
      return "text-amber-400";
    case "info":
      return "text-sky-300";
    case "debug":
    case "trace":
      return "text-slate-500";
    default:
      return "text-slate-300";
  }
};

const sourceBadgeClass = (source: LogSource) =>
  source === "singbox"
    ? "border-sky-500/30 bg-sky-500/15 text-sky-300"
    : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";

export const ServiceLogsView: React.FC = () => {
  const [logs, setLogs] = useState<ServiceLogEntry[]>([]);
  const [filterSource, setFilterSource] = useState<SourceFilter>("all");
  const [filterLevel, setFilterLevel] = useState<LevelFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  // Bumped on every clear so in-flight polls can be discarded and can never
  // repaint the buffer we just deleted.
  const clearSeqRef = useRef(0);

  useEffect(() => {
    fetchLogs();
    let intervalMs = 3000;
    try {
      const saved = Number(window.localStorage.getItem("subout_log_interval"));
      if (saved >= 500 && saved <= 60000) {
        intervalMs = saved;
      }
    } catch {
      // ignore
    }
    const timer = setInterval(fetchLogs, intervalMs);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      const el = logContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [logs, autoScroll]);

  const fetchLogs = async () => {
    const seq = clearSeqRef.current;
    try {
      const res = await api.getServiceLogs(300);
      if (seq !== clearSeqRef.current) return;
      setLogs(res.logs || []);
      setFetchError(null);
    } catch (err: unknown) {
      if (seq !== clearSeqRef.current) return;
      if (
        err instanceof ApiError &&
        (err.status === 428 || err.status === 401)
      ) {
        // expected background-poll guards, no user-facing error
        return;
      }
      setFetchError(getErrorMessage(err));
    }
  };

  const handleClear = async () => {
    clearSeqRef.current += 1;
    setClearing(true);
    try {
      await api.clearServiceLogs();
      // Invalidate polls that started while the clear request was in flight.
      clearSeqRef.current += 1;
      setLogs([]);
      setFetchError(null);
    } catch (err: unknown) {
      setFetchError(getErrorMessage(err));
    } finally {
      setClearing(false);
    }
  };

  const handleScroll = () => {
    const el = logContainerRef.current;
    if (!el || !autoScroll) return;
    // User scrolled away from the bottom: stop fighting them on each poll.
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 24) {
      setAutoScroll(false);
    }
  };

  const filteredLogs = logs.filter((entry) => {
    if (filterSource !== "all" && entry.source !== filterSource) return false;
    if (filterLevel === "all") return true;
    return (LEVEL_RANK[entry.level] ?? 0) >= LEVEL_RANK[filterLevel];
  });

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 flex flex-col h-[calc(100vh-7.5rem)] sm:h-[calc(100vh-8.5rem)]">
      {/* Header bar */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-sky-400" />
          <h2 className="text-base font-bold text-slate-100">服务运行日志</h2>
          <span className="text-xs text-slate-500 font-mono">
            ({filteredLogs.length} 条)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="w-28 sm:w-32">
            <Select
              value={filterSource}
              onChange={(value) => setFilterSource(value as SourceFilter)}
              options={[
                { value: "all", label: "所有来源" },
                { value: "singbox", label: "sing-box 内核" },
                { value: "subout", label: "subout 运行" },
              ]}
            />
          </div>

          <div className="w-28 sm:w-32">
            <Select
              value={filterLevel}
              onChange={(value) => setFilterLevel(value as LevelFilter)}
              options={[
                { value: "all", label: "所有日志级别" },
                { value: "info", label: "INFO 及以上" },
                { value: "warn", label: "WARN 警告" },
                { value: "error", label: "ERROR 错误" },
              ]}
            />
          </div>

          <Button
            variant={autoScroll ? "primary" : "secondary"}
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            icon={<ArrowDownCircle className="w-3.5 h-3.5" />}
          >
            <span className="hidden sm:inline">
              {autoScroll ? "滚动锁定: 开" : "滚动锁定: 关"}
            </span>
            <span className="sm:hidden">
              {autoScroll ? "锁定:开" : "锁定:关"}
            </span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            loading={clearing}
            onClick={handleClear}
            icon={<Trash2 className="w-3.5 h-3.5" />}
          >
            清空日志
          </Button>
        </div>
      </div>

      {fetchError && (
        <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          日志拉取失败：{fetchError}
        </div>
      )}

      {/* Terminal logs container */}
      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1 select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 text-center py-20">暂无日志</div>
        ) : (
          filteredLogs.map((entry, idx) => (
            <div
              key={`${entry.timestamp}-${idx}`}
              className="flex gap-2 leading-relaxed break-all"
            >
              <span className="text-slate-600 shrink-0">{entry.timestamp}</span>
              <span
                className={`shrink-0 px-1.5 rounded border text-[10px] leading-5 ${sourceBadgeClass(entry.source)}`}
              >
                {entry.source === "singbox" ? "sing-box" : "subout"}
              </span>
              <span className={levelColorClass(entry.level)}>
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
