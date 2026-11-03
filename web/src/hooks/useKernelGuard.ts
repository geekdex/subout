import { useState, useEffect, useCallback } from "react";
import { api, setGatekeeperBlockedHandler } from "../api/client";
import { KernelInfo, TakeoverDiagnoseResult } from "../types/api";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils/format";

export function useKernelGuard() {
  const [kernelInfo, setKernelInfo] = useState<KernelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [takeoverDiagnose, setTakeoverDiagnose] =
    useState<TakeoverDiagnoseResult | null>(null);
  const { success, error } = useToast();

  const fetchKernelInfo = useCallback(async () => {
    try {
      const info = await api.getKernelInfo();
      setKernelInfo(info);
      if (!info.ready) {
        // Also run takeover diagnose
        const diag = await api.diagnoseTakeover();
        setTakeoverDiagnose(diag);
      } else {
        setTakeoverDiagnose(null);
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

  const handleDownloadKernel = async (version = "1.14.4") => {
    setDownloading(true);
    try {
      const res = await api.downloadKernel(version);
      success("内核下载完成", res.message || `成功安装 sing-box ${version}`);
      await fetchKernelInfo();
    } catch (err: unknown) {
      error("下载内核失败", getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const handleTakeover = async () => {
    try {
      const res = await api.takeoverService();
      if (res.success) {
        success("服务接管成功", res.message);
        await fetchKernelInfo();
      } else {
        error("接管失败", res.message);
      }
    } catch (err: unknown) {
      error("接管失败", getErrorMessage(err));
    }
  };

  return {
    kernelInfo,
    loading,
    downloading,
    takeoverDiagnose,
    isReady: kernelInfo?.ready ?? false,
    downloadKernel: handleDownloadKernel,
    takeoverService: handleTakeover,
    refreshKernel: fetchKernelInfo,
  };
}
