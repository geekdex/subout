import {
  ConfigProfile,
  ServiceStatus,
  KernelInfo,
  TakeoverDiagnoseResult,
  NodeItem,
  NodeGroup,
  NodeGroupsListResponse,
  Subscription,
  SimpleConfig,
  AutoUpdateSettings,
  AutoUpdateSnapshot,
  SystemInfo,
} from "../types/api";

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

let onGatekeeperBlockedCallback: (() => void) | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setGatekeeperBlockedHandler(cb: () => void) {
  onGatekeeperBlockedCallback = cb;
}

export function setUnauthorizedHandler(cb: () => void) {
  onUnauthorizedCallback = cb;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("subout_token");
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (
    !headers.has("Content-Type") &&
    options.body &&
    typeof options.body === "string"
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 428) {
    if (onGatekeeperBlockedCallback) {
      onGatekeeperBlockedCallback();
    }
    const errText = await response.text();
    throw new ApiError(
      `Kernel Gatekeeper Blocked: ${errText || "内核未满足 1.14.* 要求"}`,
      428,
    );
  }

  if (response.status === 401) {
    localStorage.removeItem("subout_token");
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
    throw new ApiError("未登录或登录已过期", 401);
  }

  const contentType = response.headers.get("content-type") || "";
  let data: unknown;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      typeof data === "object" &&
      data !== null &&
      ("error" in data || "message" in data)
        ? String(
            (data as { error?: unknown; message?: unknown }).error ||
              (data as { message?: unknown }).message,
          )
        : typeof data === "string"
          ? data
          : `Request failed: ${response.status}`;
    throw new ApiError(errorMsg, response.status, data);
  }

  return data as T;
}

export const api = {
  // Auth
  async login(password: string): Promise<{ token: string }> {
    const res = await request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (res.token) {
      localStorage.setItem("subout_token", res.token);
    }
    return res;
  },
  async checkAuth(): Promise<boolean> {
    try {
      await request("/api/system/info");
      return true;
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) return false;
      // 428 is still authenticated
      if (e instanceof ApiError && e.status === 428) return true;
      return false;
    }
  },
  logout() {
    localStorage.removeItem("subout_token");
    if (onUnauthorizedCallback) onUnauthorizedCallback();
  },

  // Kernel
  async getKernelInfo(): Promise<KernelInfo> {
    const raw = await request<Record<string, unknown>>("/api/kernel/info");
    const isReady = Boolean(raw.ready ?? raw.is_version_satisfies);
    return {
      ...(raw as unknown as KernelInfo),
      installed: Boolean(raw.installed ?? raw.is_installed),
      pinned_version: (raw.pinned_version as string) || (raw.recommended_version as string) || "1.14.4",
      ready: isReady,
      gatekeeper_blocked: !isReady,
      version: (raw.version as string) || null,
      raw_version: (raw.raw_version as string) || (raw.version as string) || null,
      binary_path: (raw.binary_path as string) || "",
      supported_versions: (raw.supported_versions as string[]) || ["1.14.*"],
    };
  },
  async downloadKernel(
    version = "1.14.4",
  ): Promise<{ message: string; version: string }> {
    return request("/api/kernel/download", {
      method: "POST",
      body: JSON.stringify({ version }),
    });
  },
  async diagnoseTakeover(): Promise<TakeoverDiagnoseResult> {
    const raw = await request<Record<string, unknown>>(
      "/api/kernel/takeover-diagnose",
      {
        method: "POST",
      },
    );
    const hasConflict = Boolean(raw.has_conflict);
    const conflictType = (raw.conflict_type as string) || "running_processes";
    const canAuto = Boolean(
      raw.can_auto_takeover ?? (conflictType === "running_processes"),
    );
    return {
      has_conflict: hasConflict,
      conflict_type: conflictType,
      conflict_name: (raw.conflict_name as string) || undefined,
      service_name: (raw.service_name as string) || undefined,
      details: (raw.details as string) || (raw.message as string) || "",
      message: (raw.message as string) || (raw.details as string) || "",
      suggestion:
        (raw.suggestion as string) || (raw.suggestion_command as string) || "",
      suggestion_command: (raw.suggestion_command as string) || undefined,
      pids: (raw.pids as number[]) || [],
      can_auto_takeover: canAuto,
    };
  },
  async takeoverService(payload?: {
    start_after_takeover?: boolean;
    sudo_pass?: string;
  }): Promise<{ success: boolean; message: string }> {
    const cleanPayload = {
      start_after_takeover: payload?.start_after_takeover ?? false,
      sudo_pass:
        typeof payload?.sudo_pass === "string" && payload.sudo_pass.trim().length > 0
          ? payload.sudo_pass.trim()
          : undefined,
    };
    return request("/api/service/takeover", {
      method: "POST",
      body: JSON.stringify(cleanPayload),
    });
  },

  // Service Management
  async getServiceStatus(): Promise<ServiceStatus> {
    return request<ServiceStatus>("/api/service/status");
  },
  async startService(): Promise<{ success: boolean; message: string }> {
    return request("/api/service/start", { method: "POST" });
  },
  async stopService(): Promise<{ success: boolean; message: string }> {
    return request("/api/service/stop", { method: "POST" });
  },
  async restartService(): Promise<{ success: boolean; message: string }> {
    return request("/api/service/restart", { method: "POST" });
  },
  async setSystemProxy(
    enabled: boolean,
  ): Promise<{ success: boolean; message: string }> {
    return request("/api/service/system-proxy", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
  },

  // System
  async getSystemInfo(): Promise<SystemInfo> {
    return request<SystemInfo>("/api/system/info");
  },
  async setAppMode(
    mode: "simple" | "logical",
    restart = false,
  ): Promise<{ success: boolean; mode: string }> {
    return request("/api/system/mode", {
      method: "POST",
      body: JSON.stringify({ mode, restart }),
    });
  },
  async setSudoPassword(password: string): Promise<{ success: boolean; message?: string }> {
    return request("/api/settings/sudo", {
      method: "POST",
      body: JSON.stringify({ sudo_pass: password }),
    });
  },
  async setWebPassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    return request("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });
  },

  // Profiles (Multi-Platform Configs)
  async listConfigs(): Promise<ConfigProfile[]> {
    return request<ConfigProfile[]>("/api/configs");
  },
  async createConfig(payload: {
    name: string;
    platform: string;
    description?: string;
    content?: string;
    config_json?: string;
  }): Promise<ConfigProfile> {
    const body = {
      name: payload.name,
      platform: payload.platform,
      description: payload.description,
      content: payload.content || payload.config_json,
      config_json: payload.config_json || payload.content,
    };
    return request<ConfigProfile>("/api/configs", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getConfig(id: number): Promise<ConfigProfile> {
    return request<ConfigProfile>(`/api/configs/${id}`);
  },
  async updateConfig(
    id: number,
    payload: {
      name?: string;
      platform?: string;
      description?: string;
      content?: string;
      config_json?: string;
    },
  ): Promise<ConfigProfile> {
    const body = {
      ...payload,
      content: payload.content || payload.config_json,
    };
    return request<ConfigProfile>(`/api/configs/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  async deleteConfig(id: number): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/api/configs/${id}`, {
      method: "DELETE",
    });
  },
  async resetConfigToken(id: number): Promise<{ token: string }> {
    return request<{ token: string }>(`/api/configs/${id}/reset-token`, {
      method: "POST",
    });
  },
  async setRunningConfig(
    id: number,
  ): Promise<{ success: boolean; running_config_id: number }> {
    return request("/api/configs/set-running", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
  },

  // Simple Config
  async getSimpleConfig(): Promise<SimpleConfig> {
    return request<SimpleConfig>("/api/simple-config");
  },
  async saveSimpleConfig(cfg: SimpleConfig): Promise<{ success: boolean }> {
    return request("/api/simple-config", {
      method: "POST",
      body: JSON.stringify(cfg),
    });
  },

  // Node Groups
  async listNodeGroups(): Promise<NodeGroupsListResponse> {
    return request<NodeGroupsListResponse>("/api/node-groups");
  },
  async createNodeGroup(
    payload: Partial<NodeGroupsListResponse["groups"][0]>,
  ): Promise<{ success: boolean; id: number }> {
    return request("/api/node-groups", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async updateNodeGroup(
    id: number,
    payload: Partial<NodeGroup>,
  ): Promise<{ success: boolean }> {
    return request(`/api/node-groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  async deleteNodeGroup(id: number): Promise<{ success: boolean }> {
    return request(`/api/node-groups/${id}`, {
      method: "DELETE",
    });
  },

  // Nodes
  async listNodes(): Promise<NodeItem[]> {
    return request<NodeItem[]>("/api/nodes");
  },
  async saveNode(payload: Partial<NodeItem>): Promise<NodeItem> {
    return request<NodeItem>("/api/nodes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async deleteNode(id: number): Promise<{ success: boolean }> {
    return request(`/api/nodes/${id}`, { method: "DELETE" });
  },
  async batchDeleteNodes(
    ids: number[],
  ): Promise<{ success: boolean; count: number }> {
    return request("/api/nodes/batch-delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
  },
  async testNodeLatency(
    nodeId: number,
  ): Promise<{ latency_ms: number | null }> {
    return request(`/api/nodes/${nodeId}/test`, { method: "POST" });
  },
  async testAllNodesLatency(): Promise<{ success: boolean }> {
    return request("/api/nodes/test-all", { method: "POST" });
  },

  // Subscriptions
  async listSubscriptions(): Promise<Subscription[]> {
    return request<Subscription[]>("/api/subscriptions");
  },
  async createSubscription(
    payload: Partial<Subscription>,
  ): Promise<Subscription> {
    return request<Subscription>("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async updateSubscription(
    id: number,
    payload: Partial<Subscription>,
  ): Promise<Subscription> {
    return request<Subscription>(`/api/subscriptions/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  async deleteSubscription(id: number): Promise<{ success: boolean }> {
    return request(`/api/subscriptions/${id}`, { method: "DELETE" });
  },
  async syncSubscription(
    id: number,
  ): Promise<{ success: boolean; node_count: number }> {
    return request(`/api/subscriptions/${id}/fetch`, { method: "POST" });
  },

  // Auto-Update
  async getAutoUpdateSettings(): Promise<AutoUpdateSettings> {
    return request<AutoUpdateSettings>("/api/auto-update/settings");
  },
  async saveAutoUpdateSettings(
    settings: AutoUpdateSettings,
  ): Promise<{ success: boolean }> {
    return request("/api/auto-update/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  },
  async triggerAutoUpdate(): Promise<{
    success: boolean;
    message: string;
    version_code: string;
  }> {
    return request("/api/auto-update/trigger", { method: "POST" });
  },
  async listAutoUpdateSnapshots(): Promise<AutoUpdateSnapshot[]> {
    return request<AutoUpdateSnapshot[]>("/api/auto-update/history");
  },
  async rollbackAutoUpdateSnapshot(
    id: number,
  ): Promise<{ success: boolean; message: string }> {
    return request(`/api/auto-update/history/${id}/rollback`, { method: "POST" });
  },

  // Logs
  async getServiceLogs(lines = 200): Promise<{ logs: string[] }> {
    return request(`/api/service/logs?lines=${lines}`);
  },
};
