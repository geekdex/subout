<template>
  <div v-if="!token" id="login-overlay">
    <LoginBackground :is-dark="isDarkTheme" />
    <div class="login-card">
      <h2>Subout Panel</h2>
      <p>输入管理员密码以继续</p>
      <form @submit.prevent="handleLogin">
        <div class="input-group">
          <label for="login-password">密码</label>
          <input
            id="login-password"
            v-model="loginPassword"
            type="password"
            class="input-control"
            placeholder="••••••••"
            required
          />
        </div>
        <button type="submit" class="btn w-full" :disabled="loggingIn">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
            />
          </svg>
          {{ loggingIn ? "登录中..." : "登录" }}
        </button>
      </form>
      <div
        v-if="loginError"
        style="color: var(--danger); margin-top: 1rem; font-size: 0.9rem"
      >
        密码不正确，请重试
      </div>
    </div>
  </div>

  <div v-else style="display: flex; min-height: 100vh; width: 100%">
    <!-- Sidebar Navigation -->
    <aside :class="{ collapsed: isSidebarCollapsed }">
      <!-- Collapse toggle button outside the menu at the top -->
      <button
        class="sidebar-toggle-btn"
        :title="isSidebarCollapsed ? '展开菜单' : '收起菜单'"
        @click="toggleSidebar"
      >
        <svg
          v-if="!isSidebarCollapsed"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          width="16"
          height="16"
          stroke-width="2.5"
        >
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          width="16"
          height="16"
          stroke-width="2.5"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      <div class="logo">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <span class="sidebar-text">Subout Panel</span>
      </div>

      <div class="menu">
        <a
          class="menu-item"
          :class="{ active: currentView === 'dashboard' }"
          href="#dashboard"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </svg>
          <span class="sidebar-text">控制台</span>
        </a>
        <a
          class="menu-item"
          :class="{ active: currentView === 'subscriptions' }"
          href="#subscriptions"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M6 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"
            />
          </svg>
          <span class="sidebar-text">订阅管理</span>
        </a>
        <a
          class="menu-item"
          :class="{ active: currentView === 'nodes' }"
          href="#nodes"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
          </svg>
          <span class="sidebar-text">节点池</span>
        </a>
        <a
          class="menu-item"
          :class="{ active: currentView === 'groups' }"
          href="#groups"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span class="sidebar-text">分流出站组</span>
        </a>
        <a
          class="menu-item"
          :class="{ active: currentView === 'config' }"
          href="#config"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="21" y1="4" x2="14" y2="4" />
            <line x1="10" y1="4" x2="3" y2="4" />
            <line x1="21" y1="12" x2="12" y2="12" />
            <line x1="8" y1="12" x2="3" y2="12" />
            <line x1="21" y1="20" x2="16" y2="20" />
            <line x1="12" y1="20" x2="3" y2="20" />
            <line x1="14" y1="2" x2="14" y2="6" />
            <line x1="8" y1="10" x2="8" y2="14" />
            <line x1="16" y1="18" x2="16" y2="22" />
          </svg>
          <span class="sidebar-text">配置管理</span>
        </a>
        <a
          class="menu-item"
          :class="{ active: currentView === 'settings' }"
          href="#settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
          <span class="sidebar-text">系统设置</span>
        </a>
      </div>

      <div class="sidebar-bottom-section">
        <!-- Horizontal Theme Switcher -->
        <div class="theme-switcher">
          <button
            :class="{ active: activeTheme === 'system' }"
            :style="getThemeButtonStyle('system')"
            @click="changeTheme('system')"
          >
            系统
          </button>
          <button
            :class="{ active: activeTheme === 'light' }"
            :style="getThemeButtonStyle('light')"
            @click="changeTheme('light')"
          >
            亮色
          </button>
          <button
            :class="{ active: activeTheme === 'dark' }"
            :style="getThemeButtonStyle('dark')"
            @click="changeTheme('dark')"
          >
            暗色
          </button>
        </div>

        <!-- Collapsed Theme Cycler -->
        <button
          class="theme-cycler-btn"
          :title="
            '切换主题: ' +
            (activeTheme === 'system'
              ? '系统'
              : activeTheme === 'light'
                ? '亮色'
                : '暗色')
          "
          @click="cycleTheme"
        >
          <svg
            v-if="activeTheme === 'system'"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <svg
            v-else-if="activeTheme === 'light'"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <svg
            v-else-if="activeTheme === 'dark'"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>

        <div class="sidebar-footer">
          <div class="sidebar-status">
            <span class="status-dot" title="在线"></span>
            <span class="sidebar-text">在线</span>
          </div>

          <a class="logout-btn" title="退出" @click="handleLogout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
              />
            </svg>
            <span class="sidebar-text">退出</span>
          </a>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main
      style="
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100vh;
        padding: 2rem;
        overflow: hidden;
      "
    >
      <DashboardView v-if="currentView === 'dashboard'" />
      <SubscriptionsView v-else-if="currentView === 'subscriptions'" />
      <NodesView v-else-if="currentView === 'nodes'" />
      <GroupsView v-else-if="currentView === 'groups'" />
      <ConfigEditorView v-else-if="currentView === 'config'" />

      <SettingsView v-else-if="currentView === 'settings'" />
    </main>
  </div>

  <!-- Global Modal Dialogs (confirm/prompt) -->
  <div
    class="modal"
    :class="{ active: dialog.show }"
    @click.self="handleDialogCancel"
  >
    <div class="modal-card" style="max-width: 480px; width: 90%">
      <div class="modal-header">
        <span>{{ dialog.title }}</span>
        <button
          class="close-btn"
          style="
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            border-radius: 4px;
            transition: background-color 0.2s;
          "
          @click="handleDialogCancel"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <p
          style="
            color: var(--text-muted);
            font-size: 0.95rem;
            line-height: 1.6;
            white-space: pre-line;
            word-break: break-all;
          "
        >
          {{ dialog.message }}
        </p>
        <div v-if="dialog.type === 'prompt'" style="margin-top: 1rem">
          <input
            v-model="dialog.inputValue"
            v-focus-select
            type="text"
            class="input-control"
            style="width: 100%"
            @keyup.enter="handleDialogConfirm"
            @keyup.esc="handleDialogCancel"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleDialogCancel">
          {{ dialog.cancelText }}
        </button>
        <button
          class="btn"
          :class="dialog.isDanger ? 'btn-danger' : 'btn-primary'"
          @click="handleDialogConfirm"
        >
          {{ dialog.confirmText }}
        </button>
      </div>
    </div>
  </div>

  <!-- Global Toast Alerts -->
  <div v-if="toast.show" class="toast" :class="'toast-' + toast.type">
    {{ toast.message }}
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { token, toast, showToast, API_BASE, logout, dialog } from "./store.js";
import { initAjv } from "./validator.js";

import DashboardView from "./components/DashboardView.vue";
import SubscriptionsView from "./components/SubscriptionsView.vue";
import NodesView from "./components/NodesView.vue";
import GroupsView from "./components/GroupsView.vue";
import ConfigEditorView from "./components/ConfigEditorView.vue";

import SettingsView from "./components/SettingsView.vue";
import LoginBackground from "./components/LoginBackground.vue";

const handleDialogConfirm = () => {
  if (dialog.type === "confirm") {
    dialog.show = false;
    if (dialog.resolve) dialog.resolve(true);
  } else if (dialog.type === "prompt") {
    dialog.show = false;
    if (dialog.resolve) dialog.resolve(dialog.inputValue);
  }
};

const handleDialogCancel = () => {
  dialog.show = false;
  if (dialog.resolve) {
    if (dialog.type === "confirm") {
      dialog.resolve(false);
    } else {
      dialog.resolve(null);
    }
  }
};

const vFocusSelect = {
  mounted: (el) => {
    el.focus();
    el.select();
  },
};

const currentView = ref("dashboard");
const activeTheme = ref("system");
const loginPassword = ref("");
const loggingIn = ref(false);
const loginError = ref(false);

const isDarkTheme = ref(true);

const updateThemeState = () => {
  if (activeTheme.value === "system") {
    isDarkTheme.value = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
  } else {
    isDarkTheme.value = activeTheme.value === "dark";
  }
};

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const handleSystemThemeChange = () => {
  if (activeTheme.value === "system") {
    updateThemeState();
  }
};

watch(activeTheme, () => {
  updateThemeState();
});

const isSidebarCollapsed = ref(
  localStorage.getItem("sidebar-collapsed") === "true",
);

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
  localStorage.setItem(
    "sidebar-collapsed",
    isSidebarCollapsed.value.toString(),
  );
};

const cycleTheme = () => {
  if (activeTheme.value === "system") {
    changeTheme("light");
  } else if (activeTheme.value === "light") {
    changeTheme("dark");
  } else {
    changeTheme("system");
  }
};

const changeTheme = (mode) => {
  activeTheme.value = mode;
  localStorage.setItem("theme-preference", mode);
  applyTheme(mode);
};

const applyTheme = (mode) => {
  const htmlEl = document.documentElement;
  if (mode === "system") {
    htmlEl.removeAttribute("data-theme");
  } else {
    htmlEl.setAttribute("data-theme", mode);
  }
};

const getThemeButtonStyle = (mode) => {
  if (activeTheme.value === mode) {
    return {
      background: "var(--primary)",
      color: "#ffffff",
    };
  }
  return {
    background: "none",
    color: "var(--text-muted)",
  };
};

const handleLogin = async () => {
  loggingIn.value = true;
  loginError.value = false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: loginPassword.value }),
    });
    if (res.ok) {
      const data = await res.json();
      token.value = data.token;
      localStorage.setItem("admin_token", data.token);
      showToast("登录成功");
      await initAjv();
      handleRouting();
    } else {
      loginError.value = true;
    }
  } catch {
    showToast("登录网络请求失败", "danger");
  } finally {
    loggingIn.value = false;
  }
};

const handleLogout = () => {
  logout();
  showToast("已安全退出");
};

const handleRouting = () => {
  if (!token.value) return;

  const hash = window.location.hash.substring(1);
  const parts = hash.split("/");
  let viewName = parts[0];

  if (viewName === "history") {
    viewName = "config";
    window.history.replaceState(null, null, "#config");
  }

  const validViews = [
    "dashboard",
    "subscriptions",
    "nodes",
    "groups",
    "config",
    "settings",
  ];

  if (!viewName || !validViews.includes(viewName)) {
    viewName = "dashboard";
    window.history.replaceState(null, null, `#${viewName}`);
  }
  currentView.value = viewName;
};

const verifyToken = async () => {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/api/auth/status`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      await initAjv();
      handleRouting();
    } else {
      logout();
    }
  } catch {
    // If offline or network error, don't force logout immediately, but try routing
    await initAjv();
    handleRouting();
  }
};

watch(token, (newToken) => {
  if (newToken) {
    verifyToken();
  }
});

onMounted(() => {
  const savedTheme = localStorage.getItem("theme-preference") || "system";
  changeTheme(savedTheme);

  updateThemeState();
  mediaQuery.addEventListener("change", handleSystemThemeChange);

  if (token.value) {
    verifyToken();
  }

  window.addEventListener("hashchange", handleRouting);
});

onUnmounted(() => {
  mediaQuery.removeEventListener("change", handleSystemThemeChange);
  window.removeEventListener("hashchange", handleRouting);
});
</script>

<style scoped>
/* App-specific local styles (if any) */
.theme-switcher button {
  outline: none;
}
.theme-switcher button.active {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
</style>
