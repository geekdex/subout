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
            ? "mb-6 border border-rose-500/40 bg-rose-500/10 rounded-2xl p-6 backdrop-blur-md shadow-2xl"
            : "mt-5 pt-5 border-t border-amber-500/20 bg-slate-900/60 p-4 rounded-xl border border-slate-800"
        }
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            <div className="p-2.5 bg-rose-500/20 rounded-xl text-rose-400 shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-100">
                  检测到系统外部进程/服务冲突
                </h3>
                <Badge variant="danger" size="sm">
                  {conflictName}
                </Badge>
                {takeoverDiagnose.pids && takeoverDiagnose.pids.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono">
                    PID: {takeoverDiagnose.pids.join(", ")}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {takeoverDiagnose.details ||
                  takeoverDiagnose.message ||
                  "系统中正有其他外部 sing-box 进程在运行，可能占用网络端口或 TUN 虚拟网卡。"}
              </p>

              {takeoverDiagnose.suggestion && (
                <p className="text-xs text-amber-300/90 leading-relaxed font-medium">
                  {takeoverDiagnose.suggestion}
                </p>
              )}

              {takeoverDiagnose.suggestion_command && (
                <div className="mt-2.5 flex items-center justify-between bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 max-w-xl">
                  <div className="flex items-center gap-2 truncate mr-3">
                    <Terminal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate text-rose-300 select-all">
                      {takeoverDiagnose.suggestion_command}
                    </span>
                  </div>
                  <CopyButton
                    text={takeoverDiagnose.suggestion_command}
                    label="复制命令"
                    size="sm"
                    variant="secondary"
                  />
                </div>
              )}
            </div>
          </div>

          {takeoverDiagnose.can_auto_takeover && (
            <div className="shrink-0 self-end md:self-center">
              <Button
                variant="danger"
                size="md"
                loading={takingOver}
                onClick={() => onTakeover()}
                icon={<Zap className="w-4 h-4" />}
                className="whitespace-nowrap shadow-lg shadow-rose-500/20"
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
      <div className="mb-6 border border-amber-500/40 bg-amber-500/10 rounded-2xl p-6 backdrop-blur-md shadow-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400 shrink-0">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>内核门禁警告：sing-box 内核未就绪</span>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                  严格要求 1.14.*
                </span>
              </h2>
              <div className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Subout 当前运行在强门禁保护状态。由于 sing-box 1.14
                大版本更新了配置规范并移除了 legacy 出站， 系统限制仅支持稳定版{" "}
                <span className="font-semibold text-white">
                  {kernelInfo?.pinned_version || "1.14.4"}
                </span>{" "}
                内核。
                {kernelInfo?.version ? (
                  <div className="mt-1">
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
                  <div className="mt-1 text-slate-400">
                    本机未探测到已安装的合规 sing-box 可执行文件。
                  </div>
                )}
              </div>
              {kernelInfo?.binary_path && (
                <div className="mt-2 text-xs text-slate-400 font-mono flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>路径: {kernelInfo.binary_path}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
            <Button
              variant="primary"
              size="md"
              loading={downloading}
              onClick={() => onDownloadKernel()}
              icon={<Download className="w-4 h-4" />}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border-amber-400"
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
