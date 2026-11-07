import {
  ConfigProfile,
  ServiceStatus,
  KernelInfo,
  KernelDownloadStatus,
  TakeoverDiagnoseResult,
  NodeItem,
  NodeGroup,
  NodeGroupsListResponse,
  Subscription,
  SimpleConfig,
  AutoUpdateSettings,
  AutoUpdateSnapshot,
  AutoUpdateHistoryResponse,
  AutoUpdateStatusResponse,
  AutoUpdateProgressEvent,
  SystemInfo,
  SpeedTestEndpoint,
  NodePingProgressEvent,
  SiteProbeResponse,
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

  const method = (options.method || "GET").toUpperCase();
  const isPostLike = ["POST", "PUT", "PATCH"].includes(method);
  let body = options.body;

  if (isPostLike) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (body === undefined || body === null) {
      body = "{}";
    }
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    body,
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

  // Normalize success status for unified frontend consumption
  if (
    typeof data === "object" &&
    data !== null &&
    !("success" in data) &&
    "status" in data &&
    (data as { status?: unknown }).status === "success"
  ) {
    (data as Record<string, unknown>).success = true;
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
      pinned_version:
        (raw.pinned_version as string) ||
        (raw.recommended_version as string) ||
        "1.14.4",
      ready: isReady,
      gatekeeper_blocked: !isReady,
      version: (raw.version as string) || null,
      raw_version:
        (raw.raw_version as string) || (raw.version as string) || null,
      binary_path: (raw.binary_path as string) || "",
      supported_versions: (raw.supported_versions as string[]) || ["1.14.*"],
      download_status: raw.download_status as KernelDownloadStatus | undefined,
    };
  },
  async getKernelStatus(): Promise<KernelDownloadStatus> {
    return request<KernelDownloadStatus>("/api/kernel/status");
  },
  async downloadKernel(
    options?: { version?: string; mirror?: boolean } | string,
  ): Promise<{ message: string; version?: string; status: string }> {
    let version = "1.14.4";
    let mirror = false;
    if (typeof options === "string" && options.trim()) {
      version = options.trim();
    } else if (options && typeof options === "object") {
      if (options.version) version = options.version;
      if (options.mirror !== undefined) mirror = options.mirror;
    }
    return request("/api/kernel/download", {
      method: "POST",
      body: JSON.stringify({ version, mirror }),
    });
  },
  async cancelKernelDownload(): Promise<{ status: string; message: string }> {
    return request("/api/kernel/cancel", {
      method: "POST",
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
      raw.can_auto_takeover ?? conflictType === "running_processes",
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
        typeof payload?.sudo_pass === "string" &&
        payload.sudo_pass.trim().length > 0
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
  async startService(payload?: {
    sudo_pass?: string;
    takeover?: boolean;
    enable_system_proxy?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    return request("/api/service/start", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
  },
  async stopService(): Promise<{ success: boolean; message: string }> {
    return request("/api/service/stop", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async restartService(payload?: {
    sudo_pass?: string;
    takeover?: boolean;
    enable_system_proxy?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    return request("/api/service/restart", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
  },
  async setSystemProxy(
    enabled: boolean,
    sudoPass?: string,
  ): Promise<{ success: boolean; message: string }> {
    return request("/api/service/system-proxy", {
      method: "POST",
      body: JSON.stringify({
        enabled,
        sudo_pass: sudoPass ? sudoPass.trim() : undefined,
      }),
    });
  },

  // System
  async getSystemInfo(): Promise<SystemInfo> {
    return request<SystemInfo>("/api/system/info");
  },
  async probeSite(
    url: string,
    timeoutMs?: number,
  ): Promise<SiteProbeResponse> {
    return request<SiteProbeResponse>("/api/system/site-probe", {
      method: "POST",
      body: JSON.stringify({ url, timeout_ms: timeoutMs }),
    });
  },
  async setAppMode(
    mode: "simple" | "expert",
    restart = false,
  ): Promise<{ success: boolean; app_mode: string }> {
    return request("/api/system/mode", {
      method: "POST",
      body: JSON.stringify({
        app_mode: mode,
        restart_service: restart,
      }),
    });
  },
  async setSudoPassword(
    password: string,
  ): Promise<{ success: boolean; message?: string }> {
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
    const { config_json, ...rest } = payload;
    const body = {
      ...rest,
      content: payload.content || config_json,
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
  async validateConfigSchema(
    content: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    return request<{ valid: boolean; errors: string[] }>(
      "/api/configs/validate",
      {
        method: "POST",
        body: JSON.stringify({ content }),
      },
    );
  },
  async previewSyncConfigNodes(
    id: number,
    content?: string,
  ): Promise<{
    status: string;
    content: string;
    outbounds: Record<string, unknown>[];
    report?: unknown;
  }> {
    return request(`/api/configs/${id}/sync-nodes`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
  async getEditorPreferences(): Promise<{ show_json_preview: boolean }> {
    return request<{ show_json_preview: boolean }>("/api/configs/preferences");
  },
  async saveEditorPreferences(payload: {
    show_json_preview: boolean;
  }): Promise<{ show_json_preview: boolean }> {
    return request<{ show_json_preview: boolean }>("/api/configs/preferences", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Simple Config
  async getSimpleConfig(): Promise<SimpleConfig> {
    const res = await request<Record<string, unknown>>("/api/simple-config");
    return (res?.config ? res.config : res) as SimpleConfig;
  },
  async saveSimpleConfig(
    cfg: SimpleConfig,
    apply = true,
  ): Promise<{ success: boolean; generated?: unknown }> {
    return request("/api/simple-config", {
      method: "POST",
      body: JSON.stringify({ config: cfg, apply }),
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
  async syncNodeGroup(id: number): Promise<NodeGroup> {
    return request<NodeGroup>(`/api/node-groups/${id}/sync`, {
      method: "POST",
    });
  },

  // Nodes
  async listNodes(): Promise<NodeItem[]> {
    const res = await request<Record<string, unknown> | NodeItem[]>(
      "/api/nodes?limit=10000",
    );
    if (Array.isArray(res)) return res;
    if (
      res &&
      typeof res === "object" &&
      "nodes" in res &&
      Array.isArray(res.nodes)
    ) {
      return res.nodes as NodeItem[];
    }
    return [];
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
    targetUrl?: string,
  ): Promise<{
    latency_ms: number | null;
    tcp_latency?: number | null;
    web_latency?: number | null;
  }> {
    try {
      return await request(`/api/nodes/${nodeId}/test`, {
        method: "POST",
        body: JSON.stringify({ target_url: targetUrl, test_type: "both" }),
      });
    } catch {
      const res = await request<
        Array<{
          id: number;
          tcp_latency?: number | null;
          web_latency?: number | null;
          latency?: number | null;
        }>
      >("/api/nodes/ping", {
        method: "POST",
        body: JSON.stringify({
          ids: [nodeId],
          test_type: "both",
          target_url: targetUrl,
        }),
      });
      const first = res?.[0];
      return {
        latency_ms:
          first?.web_latency ?? first?.latency ?? first?.tcp_latency ?? null,
        tcp_latency: first?.tcp_latency ?? null,
        web_latency: first?.web_latency ?? null,
      };
    }
  },
  async testAllNodesLatency(
    targetUrl?: string,
    ids?: number[],
  ): Promise<{ success: boolean; count?: number }> {
    try {
      if (ids && ids.length > 0) {
        await request("/api/nodes/ping", {
          method: "POST",
          body: JSON.stringify({
            ids,
            test_type: "both",
            target_url: targetUrl,
          }),
        });
        return { success: true, count: ids.length };
      }
      return await request("/api/nodes/test-all", {
        method: "POST",
        body: JSON.stringify({ target_url: targetUrl, test_type: "both" }),
      });
    } catch {
      await request("/api/nodes/ping", {
        method: "POST",
        body: JSON.stringify({
          ids: ids || [],
          test_type: "both",
          target_url: targetUrl,
        }),
      });
      return { success: true };
    }
  },
  async getTestEndpoints(): Promise<SpeedTestEndpoint[]> {
    return request<SpeedTestEndpoint[]>("/api/nodes/test-endpoints");
  },
  async pingNodesStream(
    options: {
      ids?: number[];
      targetUrl?: string;
      testType?: string;
    },
    onProgress: (event: NodePingProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = localStorage.getItem("subout_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch("/api/nodes/ping-stream", {
      method: "POST",
      headers,
      body: JSON.stringify({
        ids: options.ids || [],
        target_url: options.targetUrl,
        test_type: options.testType || "both",
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`测速请求失败: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法读取服务器流式响应");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr) {
            try {
              const eventData: NodePingProgressEvent = JSON.parse(jsonStr);
              onProgress(eventData);
            } catch {
              // ignore malformed line
            }
          }
        }
      }
    }
  },

  // Subscriptions
  async listSubscriptions(): Promise<Subscription[]> {
    return request<Subscription[]>("/api/subscriptions");
  },
  async createSubscription(
    payload: Partial<Subscription>,
  ): Promise<Subscription> {
    const label = payload.label || payload.name || "未命名订阅";
    const body: Record<string, unknown> = {
      label,
      url: payload.url,
      enabled: payload.enabled ?? true,
      filter_keywords: payload.filter_keywords || "[]",
      delete_on_update: payload.delete_on_update ?? true,
    };
    return request<Subscription>("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateSubscription(
    id: number,
    payload: Partial<Subscription> & { clear_nodes_and_groups?: boolean },
  ): Promise<Subscription> {
    const label = payload.label || payload.name;
    const body: Record<string, unknown> = {
      label,
      url: payload.url,
    };
    if (payload.enabled !== undefined) body.enabled = payload.enabled;
    if (payload.filter_keywords !== undefined)
      body.filter_keywords = payload.filter_keywords;
    if (payload.delete_on_update !== undefined)
      body.delete_on_update = payload.delete_on_update;
    if (payload.clear_nodes_and_groups !== undefined) {
      body.clear_nodes_and_groups = payload.clear_nodes_and_groups;
    }
    return request<Subscription>(`/api/subscriptions/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  async toggleSubscription(
    id: number,
    payload: { enabled: boolean; clear_nodes_and_groups?: boolean },
  ): Promise<{
    success: boolean;
    enabled: boolean;
    nodes_cleared: number;
    groups_updated: number;
    message: string;
  }> {
    return request(`/api/subscriptions/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async deleteSubscription(id: number): Promise<{ success: boolean }> {
    return request(`/api/subscriptions/${id}`, { method: "DELETE" });
  },
  async syncSubscription(
    id: number,
  ): Promise<{ success: boolean; node_count: number }> {
    try {
      return await request(`/api/subscriptions/${id}/fetch`, {
        method: "POST",
      });
    } catch {
      await request("/api/subscriptions/fetch", {
        method: "POST",
        body: JSON.stringify({ subscription_id: id }),
      });
      return { success: true, node_count: 0 };
    }
  },

  // Auto-Update
  async getAutoUpdateSettings(): Promise<AutoUpdateSettings> {
    return request<AutoUpdateSettings>("/api/auto-update/settings");
  },
  async saveAutoUpdateSettings(
    settings: AutoUpdateSettings,
  ): Promise<{ success: boolean }> {
    const body: Record<string, unknown> = {
      enabled: settings.enabled,
      cron: settings.cron || settings.cron_expression,
      sync_running: settings.sync_running ?? settings.sync_running_config,
      reload_service: settings.reload_service,
      interval: settings.interval,
      daily_time: settings.daily_time,
    };
    return request("/api/auto-update/settings", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async triggerAutoUpdate(): Promise<{
    status: string;
    message: string;
  }> {
    return request("/api/auto-update/trigger", { method: "POST" });
  },
  async getAutoUpdateStatus(): Promise<AutoUpdateStatusResponse> {
    return request<AutoUpdateStatusResponse>("/api/auto-update/status");
  },
  async streamAutoUpdate(
    onEvent: (event: AutoUpdateProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = localStorage.getItem("subout_token");
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch("/api/auto-update/stream", {
      method: "GET",
      headers,
      signal,
    });

    if (!response.ok) {
      throw new Error(`连接自动更新流失败: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法读取服务器流式响应");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr) {
            try {
              const eventData: AutoUpdateProgressEvent = JSON.parse(jsonStr);
              onEvent(eventData);
            } catch {
              // Ignore invalid line
            }
          }
        }
      }
    }
  },
  async listAutoUpdateSnapshots(params?: {
    page?: number;
    page_size?: number;
  }): Promise<AutoUpdateHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.page_size)
      searchParams.set("page_size", String(params.page_size));
    const qs = searchParams.toString();
    return request<AutoUpdateHistoryResponse>(
      `/api/auto-update/history${qs ? `?${qs}` : ""}`,
    );
  },
  async getAutoUpdateSnapshotDetail(id: number): Promise<AutoUpdateSnapshot> {
    return request<AutoUpdateSnapshot>(`/api/auto-update/history/${id}`);
  },
  async rollbackAutoUpdateSnapshot(
    id: number,
  ): Promise<{ success: boolean; message: string }> {
    return request(`/api/auto-update/history/${id}/rollback`, {
      method: "POST",
    });
  },

  // Logs
  async getServiceLogs(lines = 200): Promise<{ logs: string[] }> {
    const res = await request<Record<string, unknown> | string[]>(
      `/api/service/logs?lines=${lines}`,
    );
    if (Array.isArray(res)) return { logs: res };
    if (
      res &&
      typeof res === "object" &&
      "logs" in res &&
      Array.isArray(res.logs)
    ) {
      return { logs: res.logs as string[] };
    }
    return { logs: [] };
  },
  async clearServiceLogs(): Promise<{ success: boolean }> {
    return request("/api/service/logs/clear", { method: "POST" });
  },
};
