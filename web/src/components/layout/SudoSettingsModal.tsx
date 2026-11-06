import React, { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { SystemInfo } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

export interface SudoSettingsModalProps {
  open: boolean;
  onClose: () => void;
  systemInfo: SystemInfo | null;
  onRefresh: () => void;
}

export const SudoSettingsModal: React.FC<SudoSettingsModalProps> = ({
  open,
  onClose,
  systemInfo,
  onRefresh,
}) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const { success, error } = useToast();

  const isRoot = systemInfo?.is_root ?? false;
  const sudoConfigured = systemInfo?.sudo_configured ?? false;
  const hasTempSudo = systemInfo?.has_temp_sudo ?? false;

  useEffect(() => {
    if (open) {
      setPassword("");
      setShowPassword(false);
      setInlineError(null);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSaveSudo = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setInlineError(null);
    try {
      await api.setSudoPassword(password.trim());
      success(
        "管理员权限已启用",
        "提权密码验证通过并已持久化保存，管理员权限永久有效",
      );
      setPassword("");
      onRefresh();
      onClose();
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setInlineError(msg);
      error("提权验证失败", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSudo = async () => {
    setLoading(true);
    setInlineError(null);
    try {
      await api.setSudoPassword("");
      success("已清除提权密码", "提权密码已清除，系统权限已恢复为功能受限状态");
      setPassword("");
      onRefresh();
      onClose();
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setInlineError(msg);
      error("清除提权密码失败", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-lg ${
              isRoot || sudoConfigured
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {isRoot || sudoConfigured ? (
              <ShieldCheck className="w-5 h-5" />
            ) : (
              <Shield className="w-5 h-5" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-100">
              系统提权与管理访问权限 (Sudo)
            </span>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {!isRoot && sudoConfigured && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={loading}
                onClick={handleClearSudo}
                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                清除提权密码
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              {isRoot ? "关闭" : "取消"}
            </Button>
            {!isRoot && (
              <Button
                type="button"
                variant="primary"
                loading={loading}
                disabled={!password.trim() || loading}
                onClick={() => handleSaveSudo()}
              >
                {sudoConfigured ? "更新提权密码" : "验证并开启管理员权限"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Status Header Bar */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
          <span className="text-xs text-slate-400">当前权限状态</span>
          {isRoot ? (
            <Badge variant="success" dot size="sm">
              管理员权限 (Root 运行)
            </Badge>
          ) : sudoConfigured ? (
            <Badge variant="success" dot size="sm">
              管理员权限 (永久有效)
            </Badge>
          ) : (
            <Badge variant="warning" dot size="sm">
              功能受限
            </Badge>
          )}
        </div>

        {/* Explain Box */}
        {isRoot ? (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-200">
                程序直接以系统最高管理员 (Root) 用户运行
              </p>
              <p className="mt-1 text-emerald-300/80">
                Subout 已拥有完整的系统级特权，创建 TUN
                虚拟网卡、接管冲突守护进程和配置全局网络代理均可免密直接执行，无需配置任何
                Sudo 提权密码。
              </p>
            </div>
          </div>
        ) : sudoConfigured ? (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs leading-relaxed">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-200">
                系统提权密码已配置，管理员权限永久有效
              </p>
              <p className="mt-1 text-emerald-300/80">
                密码已加密持久化保存。程序在执行接管外部 sing-box 进程、切换 TUN
                虚拟网卡、修改系统网络代理或重启服务时，将自动提权，永久免除反复弹窗授权。
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-200">
                尚未配置系统提权密码（功能受限）
              </p>
              <p className="text-amber-300/80">
                当前以非特权用户运行。当进行接管外部 sing-box
                服务、开启系统代理或配置 TUN 网卡时，系统仅能通过弹窗索取
                <strong>临时授权</strong>
                （单次操作临时有效，不写入持久化存储）。
              </p>
              <p className="text-amber-200 font-medium">
                输入当前主机的 Sudo
                密码并验证保存后，将升级为“管理员权限（永久有效）”，永久免除操作弹窗提示。
              </p>
              {hasTempSudo && (
                <p className="text-[11px] text-sky-400 pt-0.5">
                  （提示：当前会话持有临时授权，可在下方输入保存为永久有效）
                </p>
              )}
            </div>
          </div>
        )}

        {/* Inline Error */}
        {inlineError && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{inlineError}</span>
          </div>
        )}

        {/* Input Form (Only for non-root) */}
        {!isRoot && (
          <form onSubmit={handleSaveSudo} className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                {sudoConfigured
                  ? "更新系统管理员密码 (Sudo)"
                  : "输入系统管理员密码 (Sudo)"}
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    sudoConfigured
                      ? "输入新的 Sudo 密码以更新..."
                      : "输入当前操作系统的 Sudo 密码..."
                  }
                  disabled={loading}
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all pr-10 font-mono"
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

            <p className="text-[11px] text-slate-400 leading-relaxed">
              💡
              提权密码经本地系统验证通过后，将持久化保存于本地配置中，用于后台自动化特权维护。
            </p>
          </form>
        )}
      </div>
    </Dialog>
  );
};
