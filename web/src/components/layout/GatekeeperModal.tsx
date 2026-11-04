import React from "react";
import {
  AlertTriangle,
  Download,
  ShieldAlert,
  Cpu,
  Terminal,
  Zap,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { KernelInfo, TakeoverDiagnoseResult } from "../../types/api";
import { SudoModal } from "./SudoModal";

export interface GatekeeperModalProps {
  kernelInfo: KernelInfo | null;
  takeoverDiagnose: TakeoverDiagnoseResult | null;
  loading?: boolean;
  downloading: boolean;
  takingOver?: boolean;
  onDownloadKernel: () => void;
  onTakeover: () => void;
  isSudoModalOpen?: boolean;
  sudoError?: string | null;
  sudoActionLoading?: boolean;
  onCloseSudoModal?: () => void;
  onSubmitSudo?: (password: string) => Promise<void> | void;
}

export const GatekeeperModal: React.FC<GatekeeperModalProps> = ({
  kernelInfo,
  takeoverDiagnose,
  loading = false,
  downloading,
  takingOver = false,
  onDownloadKernel,
  onTakeover,
  isSudoModalOpen = false,
  sudoError = null,
  sudoActionLoading = false,
  onCloseSudoModal,
  onSubmitSudo,
}) => {
  const isKernelReady = kernelInfo?.ready ?? false;
  const hasConflict = takeoverDiagnose?.has_conflict ?? false;

  // Conflict render block (reusable)
  const renderConflictBlock = (isStandaloneBanner = false) => {
    if (!hasConflict || !takeoverDiagnose) return null;

    const conflictName =
      takeoverDiagnose.conflict_name ||
      (takeoverDiagnose.conflict_type === "launchd"
        ? "macOS launchd 系统服务"
        : takeoverDiagnose.conflict_type === "systemd"
          ? "Linux systemd 服务"
          : takeoverDiagnose.conflict_type === "running_processes"
            ? "外部独立 sing-box 进程"
            : takeoverDiagnose.conflict_type);

    return (
      <div
        className={
          isStandaloneBanner
            ? "w-full max-w-7xl mx-auto mb-6 border border-rose-500/40 bg-rose-500/10 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 backdrop-blur-md shadow-2xl overflow-hidden"
            : "mt-5 pt-4 sm:pt-5 border-t border-amber-500/20 bg-slate-900/60 p-3.5 sm:p-4 rounded-xl border border-slate-800 overflow-hidden"
        }
      >
        <div className="flex flex-col gap-3.5 w-full min-w-0">
          {/* Top Row: Icon + Title + Conflict Badges */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <div className="p-1.5 sm:p-2 bg-rose-500/20 rounded-lg sm:rounded-xl text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
            </div>
            <h3 className="text-sm font-bold text-slate-100 break-words">
              检测到系统外部进程/服务冲突
            </h3>
            <Badge variant="danger" size="sm">
              {conflictName}
            </Badge>
            {takeoverDiagnose.pids && takeoverDiagnose.pids.length > 0 && (
              <span className="text-[11px] sm:text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono shrink-0">
                PID: {takeoverDiagnose.pids.join(", ")}
              </span>
            )}
          </div>

          {/* Details & Suggestion Texts (Full Width underneath) */}
          <div className="space-y-2 w-full text-xs text-slate-300 leading-relaxed">
            <p className="break-words break-all">
              {takeoverDiagnose.details ||
                takeoverDiagnose.message ||
                "系统中正有其他外部 sing-box 进程在运行，可能占用网络端口或 TUN 虚拟网卡。"}
            </p>

            {takeoverDiagnose.suggestion && (
              <p className="text-amber-300/90 font-medium break-words break-all">
                {takeoverDiagnose.suggestion}
              </p>
            )}

            {/* Command Codeblock - Completely visible without truncation */}
            {takeoverDiagnose.suggestion_command && (
              <div className="mt-3 bg-slate-950/90 rounded-xl border border-slate-800/90 p-3 space-y-2 w-full overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                    <Terminal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>建议排障/终止命令</span>
                  </div>
                  <CopyButton
                    text={takeoverDiagnose.suggestion_command}
                    label="复制命令"
                    size="sm"
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap text-xs"
                  />
                </div>
                <div className="font-mono text-xs text-rose-300 bg-slate-900/80 px-3 py-2.5 rounded-lg border border-slate-800/80 break-all select-all leading-relaxed whitespace-pre-wrap">
                  {takeoverDiagnose.suggestion_command}
                </div>
              </div>
            )}
          </div>

          {/* Action Button: Full width on mobile, auto width on desktop */}
          {takeoverDiagnose.can_auto_takeover && (
            <div className="pt-1 flex flex-col sm:flex-row justify-end">
              <Button
                variant="danger"
                size="md"
                loading={takingOver}
                onClick={() => onTakeover()}
                icon={<Zap className="w-4 h-4" />}
                className="w-full sm:w-auto shadow-lg shadow-rose-500/20 justify-center text-xs sm:text-sm font-semibold"
              >
                一键接管并终止冲突进程
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const sudoModalElement = onCloseSudoModal && onSubmitSudo ? (
    <SudoModal
      open={isSudoModalOpen}
      onClose={onCloseSudoModal}
      onSubmit={onSubmitSudo}
      loading={sudoActionLoading}
      error={sudoError}
      conflictPids={takeoverDiagnose?.pids}
      conflictName={takeoverDiagnose?.conflict_name}
    />
  ) : null;

  // When initial data is still loading or kernelInfo is not yet resolved,
  // do NOT flash the scary "kernel not found / blocked" warning!
  if (loading || kernelInfo === null) {
    return sudoModalElement;
  }

  // Case 1: Kernel is ready, but conflict exists: show only the conflict banner
  if (isKernelReady && hasConflict) {
    return (
      <>
        {renderConflictBlock(true)}
        {sudoModalElement}
      </>
    );
  }

  // If kernel is ready and no conflict, only render SudoModal if open
  if (isKernelReady && !hasConflict) {
    return sudoModalElement;
  }

  // Case 2: Kernel is not ready (Gatekeeper blocked)
  const isVersionSatisfies =
    kernelInfo?.version &&
    (kernelInfo.version.startsWith("1.14.") ||
      kernelInfo.version === "1.14.4" ||
      kernelInfo.raw_version?.includes("1.14."));

  return (
    <>
      <div className="w-full max-w-7xl mx-auto mb-6 border border-amber-500/40 bg-amber-500/10 rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 backdrop-blur-md shadow-2xl overflow-hidden">
        <div className="flex flex-col gap-4 w-full min-w-0">
          {/* Top Row: Icon + Title + Version Badge */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <div className="p-2 sm:p-2.5 bg-amber-500/20 rounded-lg sm:rounded-xl text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 break-words flex items-center gap-2 flex-wrap">
              <span>内核门禁警告：sing-box 内核未就绪</span>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono shrink-0">
                严格要求 1.14.*
              </span>
            </h2>
          </div>

          {/* Details & Specs (Full width) */}
          <div className="space-y-2 w-full text-xs sm:text-sm text-slate-300 leading-relaxed">
            <p className="max-w-3xl break-words break-all">
              Subout 当前运行在强门禁保护状态。由于 sing-box 1.14
              大版本更新了配置规范并移除了 legacy 出站， 系统限制仅支持稳定版{" "}
              <span className="font-semibold text-white">
                {kernelInfo?.pinned_version || "1.14.4"}
              </span>{" "}
              内核。
            </p>

            {kernelInfo?.version ? (
              <div className="break-words break-all">
                当前探测到的版本为{" "}
                <code className="text-amber-300 font-mono font-semibold">
                  {kernelInfo.version}
                </code>
                {isVersionSatisfies ? (
                  <span className="text-amber-200 ml-1">
                    （版本号已满足 1.14.* 规范，但内核进程未就绪，请重新下载或排查冲突）。
                  </span>
                ) : (
                  <span className="text-rose-400 ml-1">
                    （不满足 1.14.* 版本约束，请一键安装 1.14.4 内核）。
                  </span>
                )}
              </div>
            ) : (
              <div className="text-slate-400">
                本机未探测到已安装的合规 sing-box 可执行文件。
              </div>
            )}

            {kernelInfo?.binary_path && (
              <div className="mt-2 text-xs text-slate-400 font-mono flex items-center gap-1.5 break-all">
                <Cpu className="w-3.5 h-3.5 shrink-0" />
                <span className="break-all">路径: {kernelInfo.binary_path}</span>
              </div>
            )}
          </div>

          {/* Action Button: Full width on mobile */}
          <div className="pt-2 flex flex-col sm:flex-row justify-end">
            <Button
              variant="primary"
              size="md"
              loading={downloading}
              onClick={() => onDownloadKernel()}
              icon={<Download className="w-4 h-4" />}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border-amber-400 w-full sm:w-auto justify-center text-xs sm:text-sm"
            >
              一键下载 {kernelInfo?.pinned_version || "1.14.4"} 内核
            </Button>
          </div>
        </div>

        {/* If there is also a process conflict, show sub-card */}
        {renderConflictBlock(false)}
      </div>
      {sudoModalElement}
    </>
  );
};
