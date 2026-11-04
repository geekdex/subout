import React, { useState, useEffect, useRef } from "react";
import { ShieldAlert, KeyRound, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";

export interface SudoModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  conflictPids?: number[];
  conflictName?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  submitText?: string;
}

export const SudoModal: React.FC<SudoModalProps> = ({
  open,
  onClose,
  onSubmit,
  loading = false,
  error = null,
  conflictPids = [],
  conflictName,
  title,
  description,
  submitText = "授权并接管",
}) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setShowPassword(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim() || loading) return;
    onSubmit(password.trim());
  };

  const pidStr = conflictPids.length > 0 ? `PID: ${conflictPids.join(", ")}` : "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={
        title || (
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span className="text-base font-bold text-slate-100">
              需要系统管理员 (Sudo) 授权
            </span>
          </div>
        )
      }
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={loading}
            disabled={!password.trim() || loading}
            onClick={() => handleSubmit()}
          >
            {submitText}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {description ? (
          <div className="text-xs text-slate-300 leading-relaxed">{description}</div>
        ) : (
          <p className="text-xs text-slate-300 leading-relaxed">
            检测到外部冲突服务{" "}
            {pidStr && (
              <span className="font-mono text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                {pidStr}
              </span>
            )}{" "}
            {conflictName ? `(${conflictName})` : ""}
            属于系统守护进程或以 Root 权限运行，普通用户无权终止。请输入您的系统 Sudo 密码以执行临时授权接管并释放网络端口。
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-slate-400" />
            系统管理员密码 (Sudo Password)
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入 Sudo 密码..."
              disabled={loading}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all pr-10 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-0.5"
              tabIndex={-1}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 font-medium text-amber-400">
            <span>🔒 安全保障 (内存会话模式)</span>
          </div>
          <p className="leading-relaxed">
            密码仅在内存中用于本次会话执行特权指令，绝不会保存到数据库或磁盘配置文件中。应用退出或重启后自动释放。
          </p>
        </div>
      </form>
    </Dialog>
  );
};
