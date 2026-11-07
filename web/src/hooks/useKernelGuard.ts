import { useState, useEffect, useCallback, useRef } from "react";
import { api, setGatekeeperBlockedHandler } from "../api/client";
import {
  KernelInfo,
  KernelDownloadStatus,
  TakeoverDiagnoseResult,
} from "../types/api";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils/format";

const KERNEL_INFO_STORAGE_KEY = "subout_cached_kernel_info";

let memoryKernelCache: KernelInfo | null = null;
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem(KERNEL_INFO_STORAGE_KEY);
    if (saved) {
      memoryKernelCache = JSON.parse(saved);
    }
  } catch {
    // ignore
  }
}

export interface DownloadKernelOptions {
  version?: string;
  mirror?: boolean;
}

export function useKernelGuard(enabled = true) {
  const [kernelInfo, setKernelInfo] = useState<KernelInfo | null>(
    memoryKernelCache,
  );
  const [loading, setLoading] = useState(memoryKernelCache === null);
  const [downloadStatus, setDownloadStatus] =
    useState<KernelDownloadStatus | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [cancellingDownload, setCancellingDownload] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [takeoverDiagnose, setTakeoverDiagnose] =
    useState<TakeoverDiagnoseResult | null>(null);
  const [isSudoModalOpen, setIsSudoModalOpen] = useState(false);
  const [sudoError, setSudoError] = useState<string | null>(null);
  const [sudoActionLoading, setSudoActionLoading] = useState(false);
  const { success, error } = useToast();

  const downloadPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const stopDownloadPolling = useCallback(() => {
    if (downloadPollTimerRef.current !== null) {
      clearInterval(downloadPollTimerRef.current);
      downloadPollTimerRef.current = null;
    }
  }, []);

  const fetchKernelInfo = useCallback(async () => {
    try {
      const [info, diag] = await Promise.all([
        api.getKernelInfo(),
        api.diagnoseTakeover().catch((err) => {
          console.warn("Failed to diagnose takeover conflict:", err);
          return null;
        }),
      ]);
      setKernelInfo(info);
      setTakeoverDiagnose(diag);
      memoryKernelCache = info;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(KERNEL_INFO_STORAGE_KEY, JSON.stringify(info));
        } catch {
          // ignore
        }
      }
      return info;
    } catch (err: unknown) {
      console.warn("Failed to fetch kernel info:", getErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const pollDownloadStatus = useCallback(async () => {
    try {
      const st = await api.getKernelStatus();
      setDownloadStatus(st);

      if (st.status === "ready") {
        stopDownloadPolling();
        setIsStartingDownload(false);
        const latestInfo = await fetchKernelInfo();
        const displayVersion =
          latestInfo?.pinned_version || latestInfo?.version || "1.14.4";
        success("内核安装完成", `sing-box ${displayVersion} 已成功安装并就绪`);
      } else if (st.status === "error") {
        stopDownloadPolling();
        setIsStartingDownload(false);
        error(
          "下载内核失败",
          st.error || "下载或解压过程中发生错误，请重试或勾选加速镜像",
        );
      } else if (st.status === "idle") {
        stopDownloadPolling();
        setIsStartingDownload(false);
      }
    } catch (err: unknown) {
      console.warn("Failed to poll kernel download status:", err);
    }
  }, [fetchKernelInfo, stopDownloadPolling, success, error]);

  const startDownloadPolling = useCallback(() => {
    if (downloadPollTimerRef.current !== null) {
      clearInterval(downloadPollTimerRef.current);
    }
    downloadPollTimerRef.current = setInterval(pollDownloadStatus, 500);
  }, [pollDownloadStatus]);

  useEffect(() => {
    if (!enabled) return;

    fetchKernelInfo().then((info) => {
      if (info?.download_status) {
        setDownloadStatus(info.download_status);
        if (
          info.download_status.status === "downloading" ||
          info.download_status.status === "extracting"
        ) {
          startDownloadPolling();
        }
      }
    });

    // Hook API 428 response
    setGatekeeperBlockedHandler(() => {
      fetchKernelInfo();
    });

    const interval = setInterval(fetchKernelInfo, 10000);
    return () => {
      clearInterval(interval);
      stopDownloadPolling();
    };
  }, [fetchKernelInfo, startDownloadPolling, stopDownloadPolling, enabled]);

  const handleDownloadKernel = async (
    options?: DownloadKernelOptions | string | unknown,
  ) => {
    let validVersion = "1.14.4";
    let useMirror = false;

    if (typeof options === "string" && options.trim().length > 0) {
      validVersion = options.trim();
    } else if (options && typeof options === "object") {
      const opt = options as DownloadKernelOptions;
      if (typeof opt.version === "string" && opt.version.trim().length > 0) {
        validVersion = opt.version.trim();
      }
      if (typeof opt.mirror === "boolean") {
        useMirror = opt.mirror;
      }
    }

    setIsStartingDownload(true);
    setDownloadStatus({
      status: "downloading",
      progress: 0.0,
      downloaded_bytes: 0,
      total_bytes: 0,
      speed_bytes_per_sec: 0,
      error: null,
    });

    try {
      await api.downloadKernel({ version: validVersion, mirror: useMirror });
      // Start real-time polling immediately
      startDownloadPolling();
      // Also immediately fire one poll tick
      await pollDownloadStatus();
    } catch (err: unknown) {
      setIsStartingDownload(false);
      setDownloadStatus({
        status: "error",
        progress: 0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed_bytes_per_sec: 0,
        error: getErrorMessage(err),
      });
      error("发起内核下载失败", getErrorMessage(err));
    }
  };

  const handleCancelDownload = async () => {
    setCancellingDownload(true);
    try {
      await api.cancelKernelDownload();
      stopDownloadPolling();
      setIsStartingDownload(false);
      setDownloadStatus({
        status: "idle",
        progress: 0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed_bytes_per_sec: 0,
        error: "下载已取消",
      });
      success("已取消下载", "已成功终止 sing-box 内核下载任务");
      await fetchKernelInfo();
    } catch (err: unknown) {
      error("取消下载失败", getErrorMessage(err));
    } finally {
      setCancellingDownload(false);
    }
  };

  const handleTakeover = async () => {
    setTakingOver(true);
    try {
      const res = await api.takeoverService({ start_after_takeover: true });
      success(
        "服务接管成功",
        res.message || "已平滑接管外部服务并保持网络畅通",
      );
      await fetchKernelInfo();
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err);
      if (
        errMsg.includes("Sudo") ||
        errMsg.includes("Root") ||
        errMsg.includes("系统守护进程") ||
        errMsg.includes("权限") ||
        errMsg.includes("permission") ||
        errMsg.includes("EPERM") ||
        takeoverDiagnose?.conflict_type === "launchd" ||
        takeoverDiagnose?.conflict_type === "systemd"
      ) {
        setSudoError(null);
        setIsSudoModalOpen(true);
      } else {
        error("接管失败", errMsg);
      }
    } finally {
      setTakingOver(false);
    }
  };

  const handleTakeoverWithSudo = async (sudoPass: string) => {
    if (typeof sudoPass !== "string" || !sudoPass.trim()) {
      return;
    }
    setSudoActionLoading(true);
    setSudoError(null);
    try {
      const res = await api.takeoverService({
        start_after_takeover: true,
        sudo_pass: sudoPass.trim(),
      });
      setIsSudoModalOpen(false);
      setSudoError(null);
      success(
        "服务接管成功",
        res.message || "已平滑接管外部服务并保持网络畅通",
      );
      await fetchKernelInfo();
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err);
      setSudoError(errMsg);
      error("授权接管失败", errMsg);
    } finally {
      setSudoActionLoading(false);
    }
  };

  const openSudoModal = () => {
    setSudoError(null);
    setIsSudoModalOpen(true);
  };

  const closeSudoModal = () => {
    setIsSudoModalOpen(false);
    setSudoError(null);
  };

  const isDownloading =
    isStartingDownload ||
    downloadStatus?.status === "downloading" ||
    downloadStatus?.status === "extracting";

  return {
    kernelInfo,
    loading,
    downloading: isDownloading,
    downloadStatus,
    cancellingDownload,
    takingOver,
    takeoverDiagnose,
    isReady: kernelInfo?.ready ?? false,
    downloadKernel: handleDownloadKernel,
    cancelDownload: handleCancelDownload,
    takeoverService: handleTakeover,
    refreshKernel: fetchKernelInfo,
    isSudoModalOpen,
    sudoError,
    sudoActionLoading,
    openSudoModal,
    closeSudoModal,
    handleTakeoverWithSudo,
  };
}
