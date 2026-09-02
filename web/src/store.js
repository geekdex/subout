import { ref, reactive } from "vue";

export const API_BASE = "";
export const token = ref(
  typeof localStorage !== "undefined"
    ? localStorage.getItem("admin_token") || ""
    : "",
);

export const stats = ref({ subs: 0, nodes: 0, groups: 0 });
export const subscriptions = ref([]);
export const groups = ref([]);

// Sudo password persisted in localStorage for seamless one-time setup
export const sessionSudoPassword = ref(
  typeof localStorage !== "undefined"
    ? localStorage.getItem("subout_sudo_pass") || ""
    : "",
);

export function setSessionSudoPassword(pass) {
  const p = typeof pass === "string" ? pass.trim() : "";
  sessionSudoPassword.value = p;
  if (typeof localStorage !== "undefined") {
    if (p) {
      localStorage.setItem("subout_sudo_pass", p);
    } else {
      localStorage.removeItem("subout_sudo_pass");
    }
  }
}

// App Mode State: "simple" | "expert"
export const appMode = ref(
  typeof localStorage !== "undefined"
    ? localStorage.getItem("subout_app_mode") || "simple"
    : "simple",
);
export const modeInitialized = ref(true);
export const systemModeInfo = ref({
  app_mode: "simple",
  is_initialized: false,
  os: "",
  arch: "",
  is_linux: false,
  is_root: false,
  kernel_installed: false,
  kernel_version: null,
  service_running: false,
  has_saved_sudo: false,
});

// Kernel State
export const kernelInfo = ref({
  os: "",
  arch: "",
  supported: true,
  download_url: "",
  filename: "",
  is_installed: false,
  binary_path: "",
  version: null,
  download_status: {
    status: "idle",
    progress: 0,
    downloaded_bytes: 0,
    total_bytes: 0,
    speed_bytes_per_sec: 0,
    error: null,
  },
});

// Service State
export const serviceStatus = ref({
  running: false,
  ready: false,
  pid: null,
  started_at: null,
  uptime_secs: null,
  last_error: null,
  binary_path: null,
  config_path: "",
  inbounds_summary: null,
  is_tun: false,
  conflicting_processes: [],
  log_level: "info",
});

export const toast = reactive({
  message: "",
  type: "success",
  show: false,
});

let toastTimer = null;

export function showToast(message, type = "success") {
  toast.message = message;
  toast.type = type;
  toast.show = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.show = false;
  }, 3000);
}

export async function fetchSystemMode() {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/api/system/mode`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      systemModeInfo.value = data;
      appMode.value = data.app_mode || "simple";
      modeInitialized.value = data.is_initialized;
      localStorage.setItem("subout_app_mode", appMode.value);
    }
  } catch (e) {
    console.error("Failed to load system mode", e);
  }
}

export async function switchAppMode(mode, options = { restartService: false }) {
  if (!token.value) return false;
  try {
    const res = await fetch(`${API_BASE}/api/system/mode`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        app_mode: mode,
        restart_service: !!options.restartService,
        sudo_pass: sessionSudoPassword.value || null,
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      appMode.value = mode;
      modeInitialized.value = true;
      localStorage.setItem("subout_app_mode", mode);
      const isRestarted = data.service_restarted || options.restartService;
      showToast(
        mode === "simple"
          ? `已切换至小白简单模式${isRestarted ? "（服务已重新加载新配置）" : ""}`
          : `已切换至专业高级模式${isRestarted ? "（服务已重新加载新配置）" : ""}`,
      );
      await fetchSystemMode();
      await fetchServiceStatus();
      return true;
    } else {
      const err = await res.text();
      showToast(`切换模式失败: ${err}`, "danger");
      return false;
    }
  } catch (e) {
    showToast(`切换模式请求出错: ${e.message || e}`, "danger");
    return false;
  }
}

export async function fetchKernelInfo() {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/api/kernel/info`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      kernelInfo.value = await res.json();
    }
  } catch (e) {
    console.error("Failed to load kernel info", e);
  }
}

export async function fetchServiceStatus() {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/api/service/status`, {
      headers: { Authorization: `Bearer ${token.value}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      serviceStatus.value = await res.json();
    }
  } catch (e) {
    console.error("Failed to load service status", e);
  }
}

export async function killExternalProcess(pid, sudoPass = "") {
  if (!token.value) return false;
  const passStr =
    typeof sudoPass === "string"
      ? sudoPass.trim()
      : sessionSudoPassword.value || "";
  try {
    const res = await fetch(`${API_BASE}/api/service/kill-external`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ pid, sudo_pass: passStr || null }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      if (passStr) {
        setSessionSudoPassword(passStr);
      }
      showToast(`已成功终止外部进程 (PID: ${pid})`);
      await fetchServiceStatus();
      return true;
    } else {
      let err = await res.text();
      try {
        const json = JSON.parse(err);
        if (json.message) err = json.message;
      } catch {}
      if (
        err.includes("密码不正确") ||
        err.toLowerCase().includes("incorrect password")
      ) {
        setSessionSudoPassword("");
      }
      const errMsg = err.startsWith("终止外部进程失败:")
        ? err
        : `终止外部进程失败: ${err}`;
      showToast(errMsg, "danger");
      await fetchServiceStatus();
      return false;
    }
  } catch (e) {
    showToast(`终止外部进程请求出错: ${e.message || e}`, "danger");
    return false;
  }
}

export async function takeoverService(
  sudoPass = "",
  startAfterTakeover = true,
) {
  if (!token.value) return false;
  const passStr =
    typeof sudoPass === "string"
      ? sudoPass.trim()
      : sessionSudoPassword.value || "";
  try {
    const res = await fetch(`${API_BASE}/api/service/takeover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        sudo_pass: passStr || null,
        start_after_takeover: startAfterTakeover,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      if (passStr) {
        setSessionSudoPassword(passStr);
      }
      showToast(
        startAfterTakeover
          ? "已成功接管外部服务并启动 Subout 代理"
          : "已成功接管外部服务",
      );
      await fetchServiceStatus();
      return true;
    } else {
      let err = await res.text();
      try {
        const json = JSON.parse(err);
        if (json.message) err = json.message;
      } catch {}
      if (
        err.includes("密码不正确") ||
        err.toLowerCase().includes("incorrect password")
      ) {
        setSessionSudoPassword("");
      }
      const errMsg =
        err.startsWith("一键接管并启动服务失败:") ||
        err.startsWith("接管外部进程失败:")
          ? err
          : `一键接管失败: ${err}`;
      showToast(errMsg, "danger");
      await fetchServiceStatus();
      return false;
    }
  } catch (e) {
    showToast(`一键接管请求出错: ${e.message || e}`, "danger");
    return false;
  }
}

export async function stopService() {
  if (!token.value) return false;
  try {
    const res = await fetch(`${API_BASE}/api/service/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      await fetchServiceStatus();
      return true;
    } else {
      const err = await res.text();
      showToast(`停止服务失败: ${err}`, "danger");
      return false;
    }
  } catch (e) {
    showToast(`停止服务请求出错: ${e.message || e}`, "danger");
    return false;
  }
}

export async function saveSudoPassword(sudoPass) {
  if (!token.value) return { ok: false, message: "未登录" };
  const passStr = typeof sudoPass === "string" ? sudoPass.trim() : "";
  try {
    const res = await fetch(`${API_BASE}/api/settings/sudo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ sudo_pass: passStr }),
    });
    const text = await res.text();
    let msg = text;
    try {
      const json = JSON.parse(text);
      if (json.message) msg = json.message;
    } catch {}
    if (res.ok) {
      setSessionSudoPassword(passStr);
      if (systemModeInfo.value) {
        systemModeInfo.value.has_saved_sudo = !!passStr;
      }
      return {
        ok: true,
        message:
          msg || (passStr ? "Sudo 密码已验证并永久保存" : "已清除 Sudo 密码"),
      };
    } else {
      if (passStr) {
        setSessionSudoPassword("");
      }
      return { ok: false, message: msg || "Sudo 密码验证失败" };
    }
  } catch (e) {
    return { ok: false, message: e.message || String(e) };
  }
}

export function logout() {
  token.value = "";
  localStorage.removeItem("admin_token");
  showToast("已安全退出", "success");
  window.location.hash = "dashboard";
}

// Global Dialog State
export const dialog = reactive({
  show: false,
  type: "confirm", // "confirm" | "prompt"
  title: "",
  message: "",
  inputValue: "",
  inputType: "text", // "text" | "password"
  inputPlaceholder: "",
  confirmText: "确定",
  cancelText: "取消",
  isDanger: false,
  resolve: null,
});

/**
 * Custom Confirmation Dialog
 * @param {string} message - The question or notice message
 * @param {object} options - Options
 * @param {string} options.title - Dialog Title
 * @param {string} options.confirmText - Confirm Button Text
 * @param {string} options.cancelText - Cancel Button Text
 * @param {boolean} options.isDanger - Whether the action is destructive (e.g. Delete)
 * @returns {Promise<boolean>}
 */
export function confirmDialog(
  message,
  {
    title = "操作确认",
    confirmText = "确定",
    cancelText = "取消",
    isDanger = false,
  } = {},
) {
  return new Promise((resolve) => {
    dialog.type = "confirm";
    dialog.title = title;
    dialog.message = message;
    dialog.confirmText = confirmText;
    dialog.cancelText = cancelText;
    dialog.isDanger = isDanger;
    dialog.inputValue = "";
    dialog.inputType = "text";
    dialog.inputPlaceholder = "";
    dialog.resolve = resolve;
    dialog.show = true;
  });
}

/**
 * Custom Prompt Dialog
 * @param {string} message - Label message above prompt input
 * @param {string} defaultValue - Default value of input
 * @param {object} options - Options
 * @param {string} options.title - Dialog Title
 * @param {string} options.confirmText - Confirm Button Text
 * @param {string} options.cancelText - Cancel Button Text
 * @param {string} options.inputType - Input Type ("text" | "password")
 * @param {string} options.inputPlaceholder - Input Placeholder
 * @param {boolean} options.isDanger - Whether confirm button is danger styled
 * @returns {Promise<string|null>}
 */
export function promptDialog(
  message,
  defaultValue = "",
  {
    title = "输入内容",
    confirmText = "确定",
    cancelText = "取消",
    inputType = "text",
    inputPlaceholder = "",
    isDanger = false,
  } = {},
) {
  return new Promise((resolve) => {
    dialog.type = "prompt";
    dialog.title = title;
    dialog.message = message;
    dialog.inputValue = defaultValue;
    dialog.inputType = inputType;
    dialog.inputPlaceholder = inputPlaceholder;
    dialog.confirmText = confirmText;
    dialog.cancelText = cancelText;
    dialog.isDanger = isDanger;
    dialog.resolve = resolve;
    dialog.show = true;
  });
}

/**
 * Prompt user for system Sudo / Root password and cache in memory for the session
 * @param {string} customMessage
 * @returns {Promise<string|null>}
 */
export async function promptSudoPassword(customMessage = "") {
  if (systemModeInfo.value?.os === "windows") {
    return null;
  }
  const defaultMsg =
    "🛡️ 开启 TUN 虚拟网卡需要系统管理员 (root) 权限以接管系统流量。\n\n请输入系统的 Sudo / 管理员密码进行提权授权：";
  const pass = await promptDialog(customMessage || defaultMsg, "", {
    title: "需要管理员权限",
    confirmText: "授权并应用",
    inputType: "password",
    inputPlaceholder: "输入系统 Sudo 密码",
  });
  if (pass !== null && pass.trim()) {
    sessionSudoPassword.value = pass.trim();
    return pass.trim();
  }
  return null;
}
