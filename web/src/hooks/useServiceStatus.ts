import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../api/client";
import { ServiceStatus } from "../types/api";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils/format";

export function useServiceStatus(pollInterval = 3000, enabled = true) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { success, error } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getServiceStatus();
      setStatus(data);
    } catch (err: unknown) {
      if (!(
        err instanceof ApiError &&
        (err.status === 428 || err.status === 401)
      )) {
        console.warn("Failed to fetch service status:", getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchStatus();
    const timer = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(timer);
  }, [fetchStatus, pollInterval, enabled]);

  const startService = async () => {
    setActionLoading(true);
    try {
      const res = await api.startService();
      const isSuccess = Boolean(
        res.success ||
        (res as unknown as { status?: string }).status === "success",
      );
      if (isSuccess) {
        success("服务已启动", res.message);
      } else {
        error("启动失败", res.message);
      }
      await fetchStatus();
    } catch (err: unknown) {
      error("启动失败", getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const stopService = async () => {
    setActionLoading(true);
    try {
      const res = await api.stopService();
      const isSuccess = Boolean(
        res.success ||
        (res as unknown as { status?: string }).status === "success",
      );
      if (isSuccess) {
        success("服务已停止", res.message);
      } else {
        error("停止失败", res.message);
      }
      await fetchStatus();
    } catch (err: unknown) {
      error("停止失败", getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const restartService = async () => {
    setActionLoading(true);
    try {
      const res = await api.restartService();
      const isSuccess = Boolean(
        res.success ||
        (res as unknown as { status?: string }).status === "success",
      );
      if (isSuccess) {
        success("服务已重启", res.message);
      } else {
        error("重启失败", res.message);
      }
      await fetchStatus();
    } catch (err: unknown) {
      error("重启失败", getErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSystemProxy = async (enabled: boolean, sudoPass?: string) => {
    setActionLoading(true);
    try {
      const res = await api.setSystemProxy(enabled, sudoPass);
      const isSuccess = Boolean(
        res.success ||
        (res as unknown as { status?: string }).status === "success",
      );
      if (isSuccess) {
        success(enabled ? "系统代理已设置" : "系统代理已关闭", res.message);
      } else {
        error("切换系统代理失败", res.message);
      }
      await fetchStatus();
      return res;
    } catch (err: unknown) {
      error("设置系统代理失败", getErrorMessage(err));
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  return {
    status,
    loading,
    actionLoading,
    refreshStatus: fetchStatus,
    startService,
    stopService,
    restartService,
    toggleSystemProxy,
  };
}
