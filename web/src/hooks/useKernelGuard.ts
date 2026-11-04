import { useState, useEffect, useCallback } from "react";
import { api, setGatekeeperBlockedHandler } from "../api/client";
import { KernelInfo, TakeoverDiagnoseResult } from "../types/api";
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

export function useKernelGuard() {
  const [kernelInfo, setKernelInfo] = useState<KernelInfo | null>(memoryKernelCache);
  const [loading, setLoading] = useState(memoryKernelCache === null);
  const [downloading, setDownloading] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [takeoverDiagnose, setTakeoverDiagnose] =
    useState<TakeoverDiagnoseResult | null>(null);
  const [isSudoModalOpen, setIsSudoModalOpen] = useState(false);
  const [sudoError, setSudoError] = useState<string | null>(null);
  const [sudoActionLoading, setSudoActionLoading] = useState(false);
  const { success, error } = useToast();

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
    } catch (err: unknown) {
      console.warn("Failed to fetch kernel info:", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKernelInfo();

    // Hook API 428 response
    setGatekeeperBlockedHandler(() => {
      fetchKernelInfo();
    });
    const interval = setInterval(fetchKernelInfo, 10000);
    return () => clearInterval(interval);
  }, [fetchKernelInfo]);

  const handleDownloadKernel = async (version?: string | unknown) => {
    const validVersion =
      typeof version === "string" && version.trim().length > 0
        ? version.trim()
        : "1.14.4";
    setDownloading(true);
    try {
      const res = await api.downloadKernel(validVersion);
      success("内核下载完成", res.message || `成功安装 sing-box ${validVersion}`);
      await fetchKernelInfo();
    } catch (err: unknown) {
      error("下载内核失败", getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const handleTakeover = async () => {
    setTakingOver(true);
    try {
      const res = await api.takeoverService({ start_after_takeover: true });
      success("服务接管成功", res.message || "已平滑接管外部服务并保持网络畅通");
      await fetchKernelInfo();
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err);
      // If error indicates that sudo/root privileges are required, pop up the interactive Sudo dialog
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
      success("服务接管成功", res.message || "已平滑接管外部服务并保持网络畅通");
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

  return {
    kernelInfo,
    loading,
    downloading,
    takingOver,
    takeoverDiagnose,
    isReady: kernelInfo?.ready ?? false,
    downloadKernel: handleDownloadKernel,
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
