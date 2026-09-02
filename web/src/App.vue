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

      <!-- Menu Items -->
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
          <span class="sidebar-text">控制中心</span>
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
          <span class="sidebar-text">{{
            appMode === "simple" ? "节点列表" : "节点池"
          }}</span>
        </a>

        <!-- Simple Mode exclusive views -->
        <template v-if="appMode === 'simple'">
          <a
            class="menu-item"
            :class="{ active: currentView === 'simpleConfig' }"
            href="#simpleConfig"
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
            <span class="sidebar-text">极简配置</span>
          </a>

          <a
            class="menu-item"
            :class="{ active: currentView === 'siteTest' }"
            href="#siteTest"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path
                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
              />
            </svg>
            <span class="sidebar-text">网站测试</span>
          </a>

          <a
            class="menu-item"
            :class="{ active: currentView === 'serviceLogs' }"
            href="#serviceLogs"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              ></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span class="sidebar-text">核心日志</span>
          </a>
        </template>

        <!-- Expert Mode exclusive views -->
        <template v-else>
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
            :class="{ active: currentView === 'siteTest' }"
            href="#siteTest"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path
                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
              />
            </svg>
            <span class="sidebar-text">网站测试</span>
          </a>

          <a
            class="menu-item"
            :class="{ active: currentView === 'serviceLogs' }"
            href="#serviceLogs"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              ></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span class="sidebar-text">核心日志</span>
          </a>
        </template>

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
      <!-- Global External Conflict Alert Banner -->
      <div
        v-if="conflictingProcesses.length > 0"
        class="global-conflict-banner"
      >
        <div class="flex items-center gap-3">
          <span style="font-size: 1.35rem">🚨</span>
          <div>
            <div class="flex items-center gap-2">
              <strong style="color: var(--danger); font-size: 0.95rem">
                检测到系统中已有外部 sing-box 进程正在运行 (PID:
                {{ conflictingProcesses.map((p) => p.pid).join(", ") }})
              </strong>
              <span class="badge badge-danger">端口保护锁定</span>
            </div>
            <p
              style="
                margin: 0.2rem 0 0 0;
                font-size: 0.8rem;
                color: var(--text-muted);
                line-height: 1.4;
              "
            >
              系统检测到外部独立运行的 sing-box
              进程。为避免端口抢占和网络路由冲突，请先在系统终端关闭外部服务。
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="btn btn-secondary"
            style="font-size: 0.75rem; padding: 0.3rem 0.65rem"
            @click="fetchServiceStatus"
          >
            🔄 重新检测
          </button>
          <button
            class="btn btn-secondary"
            style="font-size: 0.75rem; padding: 0.3rem 0.65rem"
            @click="copyStopCommand"
          >
            📋 复制关闭命令
          </button>
          <button
            class="btn btn-secondary"
            style="
              font-size: 0.75rem;
              padding: 0.3rem 0.65rem;
              color: var(--danger);
            "
            :disabled="isKillingAll || isTakingOver"
            @click="handleKillExternalAll"
          >
            {{ isKillingAll ? "⏳ 正在终止..." : "🛑 仅终止进程" }}
          </button>
          <button
            class="btn btn-primary"
            style="
              font-size: 0.75rem;
              padding: 0.3rem 0.75rem;
              font-weight: 600;
            "
            :disabled="isKillingAll || isTakingOver"
            @click="handleTakeoverExternalAll"
          >
            {{ isTakingOver ? "⏳ 正在接管..." : "🚀 一键接管并启动" }}
          </button>
        </div>
      </div>

      <DashboardView
        v-if="currentView === 'dashboard'"
        @switch-view="handleSwitchView"
      />
      <SubscriptionsView v-else-if="currentView === 'subscriptions'" />
      <NodesView v-else-if="currentView === 'nodes'" />
      <SimpleConfigView v-else-if="currentView === 'simpleConfig'" />
      <ServiceLogsView v-else-if="currentView === 'serviceLogs'" />
      <GroupsView v-else-if="currentView === 'groups'" />
      <ConfigEditorView v-else-if="currentView === 'config'" />
      <SiteTestView v-else-if="currentView === 'siteTest'" :token="token" />
      <SettingsView v-else-if="currentView === 'settings'" />
    </main>
  </div>

  <!-- First-time Mode Selection Modal -->
  <ModeSelectModal
    :show="!modeInitialized && !!token"
    @confirmed="onModeConfirmed"
  />

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
            :type="dialog.inputType || 'text'"
            :placeholder="dialog.inputPlaceholder || ''"
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
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import {
  token,
  toast,
  showToast,
  API_BASE,
  logout,
  dialog,
  appMode,
  modeInitialized,
  systemModeInfo,
  fetchSystemMode,
  fetchKernelInfo,
  serviceStatus,
  fetchServiceStatus,
  confirmDialog,
  promptDialog,
  sessionSudoPassword,
  setSessionSudoPassword,
  killExternalProcess,
  takeoverService,
} from "./store.js";
import { initAjv } from "./validator.js";

import DashboardView from "./components/DashboardView.vue";
import SubscriptionsView from "./components/SubscriptionsView.vue";
import NodesView from "./components/NodesView.vue";
import GroupsView from "./components/GroupsView.vue";
import ConfigEditorView from "./components/ConfigEditorView.vue";
import SiteTestView from "./components/SiteTestView.vue";
import SimpleConfigView from "./components/SimpleConfigView.vue";
import ServiceLogsView from "./components/ServiceLogsView.vue";
import ModeSelectModal from "./components/ModeSelectModal.vue";

import SettingsView from "./components/SettingsView.vue";
import LoginBackground from "./components/LoginBackground.vue";

const isKillingAll = ref(false);
const isTakingOver = ref(false);
const conflictingProcesses = computed(
  () => serviceStatus.value.conflicting_processes || [],
);

const copyStopCommand = () => {
  const procs = conflictingProcesses.value;
  if (!procs.length) return;
  const pids = procs.map((p) => p.pid).join(" ");
  const isWindows = systemModeInfo.value?.os === "windows";
  const isMac =
    systemModeInfo.value?.os === "macos" ||
    systemModeInfo.value?.os === "darwin";
  const isLinux =
    systemModeInfo.value?.os === "linux" || systemModeInfo.value?.is_linux;

  let cmd = `sudo kill ${pids}`;
  if (isWindows) {
    cmd = `Stop-Service sing-box -ErrorAction SilentlyContinue; taskkill /F /PID ${procs.map((p) => p.pid).join(" /PID ")}`;
  } else if (isMac) {
    cmd = `brew services stop sing-box 2>/dev/null; sudo kill ${pids}`;
  } else if (isLinux) {
    cmd = `sudo systemctl stop sing-box 2>/dev/null; sudo kill ${pids}`;
  }
  navigator.clipboard.writeText(cmd);
  showToast(`已复制关闭命令: ${cmd}`);
};

const handleTakeoverExternalAll = async () => {
  const procs = conflictingProcesses.value;
  if (!procs.length) return;
  const pids = procs.map((p) => p.pid).join(", ");
  const isWindows = systemModeInfo.value?.os === "windows";
  const isRoot = systemModeInfo.value?.is_root;
  const hasSaved =
    !!sessionSudoPassword.value || !!systemModeInfo.value?.has_saved_sudo;

  let sudoPass = sessionSudoPassword.value || "";

  if (isWindows || isRoot || hasSaved) {
    const ok = await confirmDialog(
      `确定要一键接管外部 sing-box 进程 (PID: ${pids}) 并由 Subout 启动代理服务吗？\n\n💡 提示：Subout 将自动终止并禁用外部系统服务（防止系统重启再次冲突），并加载当前配置启动代理。`,
      {
        title: "一键接管并启动",
        confirmText: "一键接管并启动",
      },
    );
    if (!ok) return;
  } else {
    const entered = await promptDialog(
      `一键接管外部 sing-box 进程 (PID: ${pids})\n\n💡 外部进程通常由系统服务 (sing-box.service / root) 托管。请输入系统管理员 Sudo 密码以授权接管（密码将被保存以实现免密管理）：`,
      "",
      {
        title: "一键接管并启动",
        confirmText: "授权并接管",
        inputType: "password",
        inputPlaceholder: "输入系统 Sudo 密码",
      },
    );
    if (entered === null) return;
    sudoPass = entered.trim();
    setSessionSudoPassword(sudoPass);
  }

  isTakingOver.value = true;
  try {
    await takeoverService(sudoPass, true);
  } finally {
    isTakingOver.value = false;
  }
};

const handleKillExternalAll = async () => {
  const procs = conflictingProcesses.value;
  if (!procs.length) return;
  const pids = procs.map((p) => p.pid).join(", ");
  const isWindows = systemModeInfo.value?.os === "windows";
  const isRoot = systemModeInfo.value?.is_root;
  const hasSaved =
    !!sessionSudoPassword.value || !!systemModeInfo.value?.has_saved_sudo;

  if (isWindows || isRoot || hasSaved) {
    const ok = await confirmDialog(
      `确定要终止全部外部 sing-box 进程 (PID: ${pids}) 吗？`,
      {
        title: "终止外部 sing-box 进程",
        confirmText: "终止全部",
        isDanger: true,
      },
    );
    if (!ok) return;
  } else {
    const entered = await promptDialog(
      `终止全部外部 sing-box 进程 (PID: ${pids})\n\n💡 外部进程通常由系统守护服务 (sing-box.service / root) 托管。请输入系统 Sudo / 管理员密码以授权终止（密码将被永久保存以实现免密运行）：`,
      "",
      {
        title: "终止外部系统服务",
        confirmText: "确认并终止",
        inputType: "password",
        inputPlaceholder: "输入系统 Sudo 密码",
        isDanger: true,
      },
    );
    if (entered === null) return;
    setSessionSudoPassword(entered.trim());
  }

  isKillingAll.value = true;
  try {
    for (const proc of procs) {
      await killExternalProcess(proc.pid, sessionSudoPassword.value);
    }
  } finally {
    isKillingAll.value = false;
  }
};

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
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      token.value = data.token;
      localStorage.setItem("admin_token", data.token);
      showToast("登录成功");
      await initAjv();
      await fetchSystemMode();
      await fetchKernelInfo();
      await fetchServiceStatus();
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

const handleSwitchView = (viewName) => {
  currentView.value = viewName;
  window.location.hash = viewName;
};

const onModeConfirmed = () => {
  modeInitialized.value = true;
  handleRouting();
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
    "simpleConfig",
    "serviceLogs",
    "siteTest",
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
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      await initAjv();
      await fetchSystemMode();
      await fetchKernelInfo();
      await fetchServiceStatus();
      handleRouting();
    } else {
      logout();
    }
  } catch {
    // If offline or network error, don't force logout immediately, but try routing
    await initAjv();
    await fetchSystemMode();
    await fetchKernelInfo();
    await fetchServiceStatus();
    handleRouting();
  }
};

watch(token, (newToken) => {
  if (newToken) {
    verifyToken();
  }
});

let globalStatusTimer = null;

onMounted(() => {
  const savedTheme = localStorage.getItem("theme-preference") || "system";
  changeTheme(savedTheme);

  updateThemeState();
  mediaQuery.addEventListener("change", handleSystemThemeChange);

  if (token.value) {
    verifyToken();
  }

  window.addEventListener("hashchange", handleRouting);

  globalStatusTimer = setInterval(() => {
    if (token.value) {
      fetchServiceStatus();
    }
  }, 3500);
});

onUnmounted(() => {
  mediaQuery.removeEventListener("change", handleSystemThemeChange);
  window.removeEventListener("hashchange", handleRouting);
  if (globalStatusTimer) clearInterval(globalStatusTimer);
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

.global-conflict-banner {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-left: 4px solid var(--danger);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  flex-shrink: 0;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
