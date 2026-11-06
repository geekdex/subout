import React, { useState, useEffect, useRef } from "react";
import { FileText, Trash2, ArrowDownCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { api, ApiError } from "../../api/client";

export const ServiceLogsView: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [filterLevel, setFilterLevel] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

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
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const fetchLogs = async () => {
    try {
      const res = await api.getServiceLogs(300);
      setLogs(res.logs || []);
    } catch (err: unknown) {
      if (
        err instanceof ApiError &&
        (err.status === 428 || err.status === 401)
      ) {
        // ignore background poll error
      }
    }
  };

  const filteredLogs = logs.filter((line) => {
    if (filterLevel === "all") return true;
    return (
      line.toLowerCase().includes(`[${filterLevel.toLowerCase()}]`) ||
      line.toLowerCase().includes(filterLevel.toLowerCase())
    );
  });

  const getLogLineColor = (line: string) => {
    const lower = line.toLowerCase();
    if (
      lower.includes("error") ||
      lower.includes("fatal") ||
      lower.includes("panic")
    ) {
      return "text-rose-400";
    }
    if (lower.includes("warn")) {
      return "text-amber-400";
    }
    if (lower.includes("info")) {
      return "text-sky-300";
    }
    if (lower.includes("debug") || lower.includes("trace")) {
      return "text-slate-500";
    }
    return "text-slate-300";
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 flex flex-col h-[calc(100vh-7.5rem)] sm:h-[calc(100vh-8.5rem)]">
      {/* Header bar */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-sky-400" />
          <h2 className="text-base font-bold text-slate-100">
            内核进程实时日志
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            ({filteredLogs.length} 条)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="w-32 sm:w-36">
            <Select
              value={filterLevel}
              onChange={setFilterLevel}
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
            onClick={() => setLogs([])}
            icon={<Trash2 className="w-3.5 h-3.5" />}
          >
            清屏
          </Button>
        </div>
      </div>

      {/* Terminal logs container */}
      <div
        ref={logContainerRef}
        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1 select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 text-center py-20">
            暂无内核运行日志
          </div>
        ) : (
          filteredLogs.map((line, idx) => (
            <div
              key={idx}
              className={`leading-relaxed break-all ${getLogLineColor(line)}`}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
