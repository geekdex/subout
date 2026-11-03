import React from "react";
import { AlertTriangle, Download, ShieldAlert, Cpu } from "lucide-react";
import { Button } from "../ui/Button";
import { KernelInfo, TakeoverDiagnoseResult } from "../../types/api";

interface GatekeeperModalProps {
  kernelInfo: KernelInfo | null;
  takeoverDiagnose: TakeoverDiagnoseResult | null;
  downloading: boolean;
  onDownloadKernel: () => void;
  onTakeover: () => void;
}

export const GatekeeperModal: React.FC<GatekeeperModalProps> = ({
  kernelInfo,
  takeoverDiagnose,
  downloading,
  onDownloadKernel,
  onTakeover,
}) => {
  if (kernelInfo?.ready) return null;

  return (
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
            <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Subout 当前运行在强门禁保护状态。由于 sing-box 1.14
              大版本更新了配置规范并移除了 legacy 出站， 系统限制仅支持稳定版{" "}
              <span className="font-semibold text-white">1.14.4</span> 内核。
              {kernelInfo?.version ? (
                <span>
                  当前探测到的版本为{" "}
                  <code className="text-rose-400 font-mono">
                    {kernelInfo.version}
                  </code>
                  ，不满足版本约束。
                </span>
              ) : (
                <span>本机未探测到已安装的 sing-box 可执行文件。</span>
              )}
            </p>
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
            onClick={onDownloadKernel}
            icon={<Download className="w-4 h-4" />}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold border-amber-400"
          >
            一键下载 1.14.4 内核
          </Button>
        </div>
      </div>

      {takeoverDiagnose?.has_conflict && (
        <div className="mt-4 pt-4 border-t border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-semibold text-rose-300">
                检测到系统外部进程/服务冲突: {takeoverDiagnose.conflict_type}
                {takeoverDiagnose.service_name &&
                  ` (${takeoverDiagnose.service_name})`}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {takeoverDiagnose.details}
              </p>
              <p className="text-xs text-amber-300/90 mt-0.5">
                建议：{takeoverDiagnose.suggestion}
              </p>
            </div>
          </div>
          {takeoverDiagnose.can_auto_takeover && (
            <Button
              variant="danger"
              size="sm"
              onClick={onTakeover}
              className="shrink-0 whitespace-nowrap"
            >
              接管并释放冲突
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
