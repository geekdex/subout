<template>
  <div class="view-container" style="overflow-y: auto; padding-right: 0.5rem">
    <div
      class="view-header"
      style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 1rem;
      "
    >
      <div>
        <div class="flex items-center gap-3">
          <h1 style="margin: 0">控制中心</h1>
          <div
            class="mode-switch-pill"
            :title="
              '点击切换为 ' + (appMode === 'simple' ? '专业模式' : '小白模式')
            "
            @click="toggleMode"
          >
            <span v-if="appMode === 'simple'" class="pill-badge simple"
              >🎈 小白简单模式</span
            >
            <span v-else class="pill-badge expert">🛠️ 专业模式</span>
            <span class="pill-switch-btn">
              切换为 {{ appMode === "simple" ? "专业模式 ⚡" : "小白模式 🎈" }}
            </span>
          </div>
        </div>
        <p style="margin-top: 0.35rem">
          {{
            appMode === "simple"
              ? "极简配置，一键下载集成 sing-box 内核并启停代理服务。"
              : "概览您的订阅状态，节点详情，并生成管理 sing-box 配置文件。"
          }}
        </p>
      </div>

      <div class="flex gap-2">
        <button class="btn" :disabled="isFetching" @click="triggerFetchAll">
          <svg
            id="btn-fetch-icon"
            :class="{ spin: isFetching }"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            style="margin-right: 0.25rem"
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          一键同步所有订阅
        </button>
      </div>
    </div>

    <div class="view-body">
      <!-- Kernel Download & Status Card -->
      <KernelDownloadCard />

      <!-- External sing-box Conflict Alert Banner -->
      <div
        v-if="conflictingProcesses.length > 0"
        class="panel"
        style="
          margin-bottom: 1.5rem;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-left: 4px solid var(--danger);
        "
      >
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 0.75rem;
          "
        >
          <div class="flex items-center gap-2">
            <span style="font-size: 1.25rem">🚨</span>
            <div>
              <h4
                style="
                  margin: 0;
                  color: var(--danger);
                  font-size: 1rem;
                  font-weight: 600;
                "
              >
                检测到系统中已运行外部 sing-box 进程
              </h4>
              <p
                style="
                  margin: 0.25rem 0 0 0;
                  font-size: 0.85rem;
                  color: var(--text-main);
                  line-height: 1.5;
                "
              >
                系统检测到独立于 Subout 之外的 sing-box 进程（例如通过 apt/brew
                安装或系统 systemd 服务已启动）。
                <br />
                为避免端口冲突和路由争抢，<strong
                  >请先关闭现有外部进程，然后方可使用 Subout
                  启动代理服务</strong
                >。
              </p>
            </div>
          </div>

          <div
            class="flex items-center gap-2"
            style="flex-shrink: 0; flex-wrap: wrap"
          >
            <button
              class="btn btn-secondary"
              style="font-size: 0.8rem; padding: 0.35rem 0.75rem"
              @click="fetchServiceStatus"
            >
              🔄 重新检测
            </button>
            <button
              class="btn btn-secondary"
              style="font-size: 0.8rem; padding: 0.35rem 0.75rem"
              @click="copyStopCommand"
            >
              📋 复制关闭命令
            </button>
            <button
              v-if="conflictingProcesses.length > 1"
              class="btn btn-danger"
              style="font-size: 0.8rem; padding: 0.35rem 0.75rem"
              :disabled="killingPid !== null"
              @click="handleKillExternalAll"
            >
              🛑 一键终止全部
            </button>
          </div>
        </div>

        <div
          style="
            margin-top: 0.75rem;
            background: var(--bg-card);
            border-radius: 6px;
            padding: 0.75rem;
            font-size: 0.8rem;
          "
        >
          <div
            style="
              font-weight: 600;
              color: var(--text-main);
              margin-bottom: 0.35rem;
            "
          >
            冲突进程列表：
          </div>
          <div
            v-for="proc in conflictingProcesses"
            :key="proc.pid"
            style="
              margin-bottom: 0.5rem;
              padding-bottom: 0.5rem;
              border-bottom: 1px dashed var(--border-color);
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 1rem;
            "
          >
            <div>
              <div>
                PID:
                <strong style="color: var(--danger)">{{ proc.pid }}</strong> •
                进程名: <code>{{ proc.name }}</code>
              </div>
              <div
                v-if="proc.exe_path"
                style="color: var(--text-muted); margin-top: 2px"
              >
                路径: {{ proc.exe_path }}
              </div>
              <div
                v-if="proc.cmdline"
                style="
                  color: var(--text-muted);
                  margin-top: 2px;
                  word-break: break-all;
                "
              >
                命令: <code>{{ proc.cmdline }}</code>
              </div>
            </div>
            <button
              class="btn btn-danger btn-sm"
              style="
                font-size: 0.75rem;
                padding: 0.25rem 0.5rem;
                flex-shrink: 0;
              "
              :disabled="killingPid === proc.pid || killingPid === 'all'"
              @click="handleKillExternal(proc)"
            >
              {{
                killingPid === proc.pid || killingPid === "all"
                  ? "⏳ 正在终止..."
                  : "🛑 终止进程"
              }}
            </button>
          </div>

          <div
            style="
              margin-top: 0.5rem;
              font-size: 0.8rem;
              color: var(--text-muted);
            "
          >
            💡 <strong>如何关闭外部进程？</strong>
            <ul
              style="margin: 0.25rem 0 0 1.25rem; padding: 0; line-height: 1.6"
            >
              <li>
                <strong>Linux</strong>：点击上方“🛑 终止进程”输入 Sudo
                密码自动终止，或终端执行
                <code>sudo systemctl stop sing-box</code> /
                <code
                  >sudo kill
                  {{ conflictingProcesses.map((p) => p.pid).join(" ") }}</code
                >
              </li>
              <li>
                <strong>macOS</strong>：点击上方“🛑
                终止进程”自动终止，或终端执行
                <code>brew services stop sing-box</code> /
                <code
                  >kill
                  {{ conflictingProcesses.map((p) => p.pid).join(" ") }}</code
                >
              </li>
              <li>
                <strong>Windows</strong>：点击上方“🛑 终止进程”自动终止，或在
                PowerShell/CMD 中执行 <code>Stop-Service sing-box</code> /
                <code
                  >taskkill /F /PID
                  {{
                    conflictingProcesses.map((p) => p.pid).join(" /PID ")
                  }}</code
                >
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Proxy Service Power Card -->
      <div class="panel service-power-card" style="margin-bottom: 1.5rem">
        <div class="service-power-left">
          <div
            class="service-status-indicator"
            :class="{
              running: serviceStatus.running,
              initializing: serviceStatus.running && !serviceStatus.ready,
            }"
          >
            <div class="indicator-pulse"></div>
            <div class="indicator-dot"></div>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3
                style="
                  margin: 0;
                  font-size: 1.15rem;
                  font-weight: 600;
                  color: var(--text-main);
                "
              >
                sing-box 服务状态:
                <span
                  v-if="serviceStatus.running && serviceStatus.ready"
                  style="color: var(--success)"
                  >🟢 运行中 (已就绪)</span
                >
                <span
                  v-else-if="serviceStatus.running"
                  style="color: var(--warning)"
                  >🟡 正在初始化 (PID: {{ serviceStatus.pid }})</span
                >
                <span
                  v-else-if="
                    serviceStatus.last_error &&
                    (!serviceStatus.conflicting_processes ||
                      serviceStatus.conflicting_processes.length === 0)
                  "
                  style="color: var(--danger)"
                  >🔴 异常停止</span
                >
                <span v-else style="color: var(--text-muted)">⚪️ 已停止</span>
              </h3>
            </div>
            <p
              style="
                margin: 0.25rem 0 0 0;
                font-size: 0.85rem;
                color: var(--text-muted);
                line-height: 1.5;
              "
            >
              <span v-if="serviceStatus.running">
                进程 PID: <strong>{{ serviceStatus.pid || "N/A" }}</strong> •
                运行时间:
                <strong>{{ formatUptime(serviceStatus.uptime_secs) }}</strong>
                <span
                  v-if="serviceStatus.inbounds_summary"
                  style="margin-left: 6px"
                  >• 入站:
                  <code
                    style="
                      padding: 2px 6px;
                      background: rgba(99, 102, 241, 0.1);
                      border-radius: 4px;
                      color: var(--primary);
                    "
                    >{{ serviceStatus.inbounds_summary }}</code
                  ></span
                >
              </span>
              <span
                v-else-if="
                  serviceStatus.last_error &&
                  (!serviceStatus.conflicting_processes ||
                    serviceStatus.conflicting_processes.length === 0)
                "
              >
                <span style="color: var(--danger)"
                  >服务启动或运行异常：{{ serviceStatus.last_error }}</span
                >
              </span>
              <span v-else>
                服务当前处于停止状态。点击右侧按钮即可一键启动代理服务。
              </span>
            </p>
          </div>
        </div>

        <div class="service-power-actions">
          <button
            v-if="!serviceStatus.running"
            class="btn btn-primary btn-lg"
            :disabled="
              startingService ||
              !isKernelReady ||
              conflictingProcesses.length > 0
            "
            :title="
              conflictingProcesses.length > 0
                ? '检测到外部 sing-box 进程冲突，请先关闭'
                : !isKernelReady
                  ? 'sing-box 内核尚未安装，请先点击上方卡片下载安装内核'
                  : ''
            "
            @click="handleStartService()"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              style="margin-right: 6px"
            >
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            {{ startingService ? "正在启动..." : "启动代理服务" }}
          </button>

          <template v-else>
            <button
              class="btn btn-danger"
              :disabled="stoppingService"
              @click="handleStopService"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                style="margin-right: 4px"
              >
                <rect x="6" y="6" width="12" height="12"></rect>
              </svg>
              {{ stoppingService ? "正在停止..." : "停止服务" }}
            </button>

            <button
              class="btn btn-secondary"
              :disabled="restartingService"
              @click="handleRestartService()"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                style="margin-right: 4px"
              >
                <path
                  d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"
                ></path>
              </svg>
              {{ restartingService ? "正在重启..." : "重启服务" }}
            </button>
          </template>

          <button
            class="btn btn-secondary"
            title="查看实时运行日志"
            @click="showLogsDrawer = true"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              style="margin-right: 4px"
            >
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              ></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            实时日志
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div
          class="stat-card"
          style="cursor: pointer"
          @click="$emit('switch-view', 'subscriptions')"
        >
          <div class="stat-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M6 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"
              />
            </svg>
          </div>
          <div class="stat-info">
            <h3>订阅数量</h3>
            <p>{{ stats.subs }}</p>
          </div>
        </div>
        <div
          class="stat-card"
          style="cursor: pointer"
          @click="$emit('switch-view', 'nodes')"
        >
          <div class="stat-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
            </svg>
          </div>
          <div class="stat-info">
            <h3>可用节点数</h3>
            <p>{{ stats.nodes }}</p>
          </div>
        </div>
        <div
          class="stat-card"
          style="cursor: pointer"
          @click="
            $emit(
              'switch-view',
              appMode === 'simple' ? 'simpleConfig' : 'groups',
            )
          "
        >
          <div class="stat-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </div>
          <div class="stat-info">
            <h3>出站策略组</h3>
            <p>{{ stats.groups }}</p>
          </div>
        </div>
      </div>

      <!-- Subscription Warning Banner -->
      <div
        v-if="stats.subs === 0"
        class="panel"
        style="
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid var(--warning);
          padding: 1.2rem;
          border-radius: 12px;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        "
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--warning)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"
          />
        </svg>
        <div>
          <h4
            style="
              color: var(--warning);
              font-weight: 600;
              margin-bottom: 0.25rem;
            "
          >
            尚未配置代理订阅源
          </h4>
          <p style="color: var(--text-muted); font-size: 0.9rem">
            检测到您还没有配置任何代理订阅源。节点抓取与刷新功能当前不可用。请前往
            <a
              href="#subscriptions"
              style="
                color: var(--secondary);
                cursor: pointer;
                text-decoration: underline;
              "
              >订阅管理</a
            >
            页面添加订阅连接。
          </p>
        </div>
      </div>
    </div>

    <!-- Fetch Log Modal -->
    <div class="modal" :class="{ active: showLogsModal }">
      <div class="modal-card" style="max-width: 600px; width: 90%">
        <div class="modal-header">
          <span>同步节点日志</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="showLogsModal = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <div
          class="log-console"
          style="margin-top: 0; max-height: 350px; overflow-y: auto"
        >
          <div
            v-for="(line, idx) in fetchLogs"
            :key="idx"
            class="log-line"
            :style="
              line.includes('失败') ||
              line.includes('错误') ||
              line.includes('出错')
                ? 'color: var(--danger)'
                : ''
            "
          >
            {{ line }}
          </div>
        </div>
        <div
          class="flex gap-2"
          style="justify-content: flex-end; margin-top: 1.5rem"
        >
          <button
            type="button"
            class="btn btn-secondary"
            @click="showLogsModal = false"
          >
            关闭
          </button>
        </div>
      </div>
    </div>

    <!-- Real-time Service Logs Modal / Drawer -->
    <div class="modal" :class="{ active: showLogsDrawer }">
      <div
        class="modal-card"
        style="
          max-width: 800px;
          width: 95%;
          height: 80vh;
          display: flex;
          flex-direction: column;
        "
      >
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span>📜 sing-box 实时运行日志</span>
            <span v-if="serviceStatus.running" class="badge badge-success"
              >运行中</span
            >
            <span v-else class="badge badge-secondary">已停止</span>
          </div>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="showLogsDrawer = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <div style="flex: 1; min-height: 0; padding: 0.5rem 0">
          <ServiceLogsView />
        </div>

        <div class="modal-footer" style="margin-top: 0.5rem">
          <button class="btn btn-secondary" @click="showLogsDrawer = false">
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  token,
  API_BASE,
  stats,
  showToast,
  appMode,
  switchAppMode,
  kernelInfo,
  fetchKernelInfo,
  serviceStatus,
  systemModeInfo,
  fetchServiceStatus,
  confirmDialog,
  promptDialog,
  sessionSudoPassword,
  setSessionSudoPassword,
  killExternalProcess,
} from "../store.js";
import { initAjv } from "../validator.js";
import KernelDownloadCard from "./KernelDownloadCard.vue";
import ServiceLogsView from "./ServiceLogsView.vue";

defineEmits(["switch-view"]);

const isFetching = ref(false);
const showLogsModal = ref(false);
const showLogsDrawer = ref(false);
const fetchLogs = ref([]);
const startingService = ref(false);
const stoppingService = ref(false);
const restartingService = ref(false);
const killingPid = ref(null);

const conflictingProcesses = computed(
  () => serviceStatus.value.conflicting_processes || [],
);

const isDownloading = computed(() => {
  const s = kernelInfo.value?.download_status?.status;
  return s === "downloading" || s === "extracting";
});

const isKernelReady = computed(() => {
  return !!kernelInfo.value?.is_installed && !isDownloading.value;
});

let statusTimer = null;

const formatUptime = (secs) => {
  if (!secs && secs !== 0) return "0秒";
  if (secs < 60) return `${secs}秒`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}分${s}秒`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}小时${remM}分`;
};

const toggleMode = async () => {
  const currentMode = appMode.value;
  const targetMode = currentMode === "simple" ? "expert" : "simple";
  const targetModeName =
    targetMode === "simple" ? "小白简单模式" : "专业模式 (专家模式)";
  const isRunning = !!serviceStatus.value.running;

  // 1. 构建提示文案
  let warningMessage = "";
  if (isRunning) {
    warningMessage =
      `⚠️ 检测到当前 sing-box 代理服务正在运行中。\n\n` +
      `切换至【${targetModeName}】将会短暂停止服务（约 1~2 秒），并自动重新加载【${targetModeName}】的专属配置后重新启动。\n\n` +
      `📌 提示：小白简单模式与专业模式各自独立保留一份配置，相互不干扰。\n\n` +
      `确定要立即切换并重新加载服务吗？`;
  } else {
    warningMessage =
      `您即将切换为【${targetModeName}】。\n\n` +
      `📌 提示：小白简单模式与专业模式各自独立保留一份配置，相互不干扰。后续可在控制中心随时无缝切换。\n\n` +
      `确定要切换吗？`;
  }

  // 2. 弹出手动确认对话框
  const confirmed = await confirmDialog(warningMessage, {
    title: `切换为 ${targetModeName}`,
    confirmText: isRunning ? "确认中断并切换" : "确认切换",
    cancelText: "取消",
    isDanger: isRunning,
  });

  if (!confirmed) return;

  // 3. 执行切换并自动重载运行中的服务
  const success = await switchAppMode(targetMode, {
    restartService: isRunning,
  });
  if (success) {
    // 4. 路由自适应检查（避免停留在当前模式不存在的页面）
    const currentHash = window.location.hash.replace("#", "");
    const simpleOnlyViews = ["simpleConfig", "serviceLogs"];
    const expertOnlyViews = ["groups", "config", "siteTest"];

    if (targetMode === "simple" && expertOnlyViews.includes(currentHash)) {
      window.location.hash = "dashboard";
    } else if (
      targetMode === "expert" &&
      simpleOnlyViews.includes(currentHash)
    ) {
      window.location.hash = "dashboard";
    }
  }
};

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

const handleKillExternal = async (proc) => {
  const isWindows = systemModeInfo.value?.os === "windows";
  const isRoot = systemModeInfo.value?.is_root;
  const hasSaved =
    !!sessionSudoPassword.value || !!systemModeInfo.value?.has_saved_sudo;

  if (isWindows || isRoot || hasSaved) {
    const ok = await confirmDialog(
      `确定要终止外部 sing-box 进程 (PID: ${proc.pid}${proc.cmdline ? `, 命令: ${proc.cmdline}` : ""}) 吗？`,
      {
        title: "终止外部进程",
        confirmText: "终止进程",
        isDanger: true,
      },
    );
    if (!ok) return;
  } else {
    const entered = await promptDialog(
      `终止外部 sing-box 进程 (PID: ${proc.pid})\n\n💡 该外部进程通常由系统守护服务 (sing-box.service / root) 托管。请输入系统 Sudo / 管理员密码以授权终止（密码将被永久保存以实现免密运行）：`,
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

  killingPid.value = proc.pid;
  try {
    await killExternalProcess(proc.pid, sessionSudoPassword.value);
  } finally {
    killingPid.value = null;
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
        title: "终止全部外部进程",
        confirmText: "终止全部",
        isDanger: true,
      },
    );
    if (!ok) return;
  } else {
    const entered = await promptDialog(
      `终止全部外部 sing-box 进程 (PID: ${pids})\n\n💡 外部进程通常由系统服务托管。请输入系统 Sudo / 管理员密码以授权终止（密码将被永久保存以实现免密运行）：`,
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

  killingPid.value = "all";
  try {
    for (const proc of procs) {
      await killExternalProcess(proc.pid, sessionSudoPassword.value);
    }
  } finally {
    killingPid.value = null;
  }
};

const handleStartService = async (customSudoPass = null) => {
  let sudoPass =
    typeof customSudoPass === "string"
      ? customSudoPass.trim()
      : sessionSudoPassword.value || null;
  if (conflictingProcesses.value.length > 0) {
    showToast(
      `系统中检测到正在运行的外部 sing-box 进程 (PID: ${conflictingProcesses.value.map((p) => p.pid).join(", ")})，请先关闭外部进程后再启动`,
      "danger",
    );
    return;
  }
  if (!isKernelReady.value) {
    showToast(
      isDownloading.value
        ? "sing-box 内核正在下载配置中，请稍候..."
        : "sing-box 内核尚未安装，请先点击上方卡片下载安装内核",
      "danger",
    );
    return;
  }
  startingService.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/service/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ sudo_pass: sudoPass }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      showToast("sing-box 服务已成功启动！");
      if (sudoPass) {
        setSessionSudoPassword(sudoPass);
      }
      await fetchServiceStatus();
    } else {
      const err = await res.text();
      const errLower = err.toLowerCase();
      const isWindows =
        systemModeInfo.value?.os === "windows" ||
        err.includes("Windows") ||
        err.includes("以管理员身份运行");
      const isPermissionErr =
        err.includes("Sudo 密码") ||
        err.includes("root") ||
        err.includes("权限") ||
        err.includes("TUN 模式") ||
        errLower.includes("tunsetiff") ||
        errLower.includes("operation not permitted") ||
        errLower.includes("permission denied");
      if (isPermissionErr && !isWindows) {
        setSessionSudoPassword("");
        if (systemModeInfo.value) {
          systemModeInfo.value.has_saved_sudo = false;
        }
        const isWrongPass =
          err.includes("密码不正确") ||
          errLower.includes("incorrect password") ||
          errLower.includes("authentication failure");
        const promptMsg = isWrongPass
          ? "❌ 输入的 Sudo 密码不正确或已失效，请重新输入系统管理员密码（保存后将免去重复输入）："
          : "🛡️ 启动代理服务（TUN 虚拟网卡）需要系统管理员权限。\n\n请输入系统 Sudo / 管理员密码（输入后将自动保存以实现一劳永逸）：";
        const pass = await promptDialog(promptMsg, "", {
          title: "需要管理员权限",
          confirmText: "授权并保存启动",
          inputType: "password",
          inputPlaceholder: "输入系统 Sudo 密码",
        });
        if (pass !== null && pass.trim()) {
          setSessionSudoPassword(pass.trim());
          await handleStartService(pass.trim());
          return;
        } else {
          showToast("已取消管理员提权授权", "warning");
        }
      } else {
        showToast(`启动失败: ${err}`, "danger");
      }
      await fetchServiceStatus();
    }
  } catch (e) {
    showToast(`启动服务请求失败: ${e.message || e}`, "danger");
  } finally {
    startingService.value = false;
  }
};

const handleStopService = async () => {
  stoppingService.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/service/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      showToast("sing-box 服务已停止");
      await fetchServiceStatus();
    } else {
      const err = await res.text();
      showToast(`停止服务失败: ${err}`, "danger");
    }
  } catch (e) {
    showToast(`停止服务请求出错: ${e.message || e}`, "danger");
  } finally {
    stoppingService.value = false;
  }
};

const handleRestartService = async (customSudoPass = null) => {
  let sudoPass =
    typeof customSudoPass === "string"
      ? customSudoPass.trim()
      : sessionSudoPassword.value || null;
  if (conflictingProcesses.value.length > 0) {
    showToast(
      `系统中检测到正在运行的外部 sing-box 进程 (PID: ${conflictingProcesses.value.map((p) => p.pid).join(", ")})，请先关闭外部进程后再启动`,
      "danger",
    );
    return;
  }
  if (!kernelInfo.value.is_installed) {
    showToast("sing-box 内核尚未安装，请先点击上方卡片下载安装内核", "danger");
    return;
  }
  restartingService.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/service/restart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ sudo_pass: sudoPass }),
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      showToast("sing-box 服务已成功重启！");
      if (sudoPass) {
        setSessionSudoPassword(sudoPass);
      }
      await fetchServiceStatus();
    } else {
      const err = await res.text();
      const errLower = err.toLowerCase();
      const isWindows =
        systemModeInfo.value?.os === "windows" ||
        err.includes("Windows") ||
        err.includes("以管理员身份运行");
      const isPermissionErr =
        err.includes("Sudo 密码") ||
        err.includes("root") ||
        err.includes("权限") ||
        err.includes("TUN 模式") ||
        errLower.includes("tunsetiff") ||
        errLower.includes("operation not permitted") ||
        errLower.includes("permission denied");
      if (isPermissionErr && !isWindows) {
        setSessionSudoPassword("");
        if (systemModeInfo.value) {
          systemModeInfo.value.has_saved_sudo = false;
        }
        const isWrongPass =
          err.includes("密码不正确") ||
          errLower.includes("incorrect password") ||
          errLower.includes("authentication failure");
        const promptMsg = isWrongPass
          ? "❌ 输入的 Sudo 密码不正确或已失效，请重新输入系统管理员密码（保存后将免去重复输入）："
          : "🛡️ 重启代理服务（TUN 虚拟网卡）需要系统管理员权限。\n\n请输入系统 Sudo / 管理员密码（输入后将自动保存以实现一劳永逸）：";
        const pass = await promptDialog(promptMsg, "", {
          title: "需要管理员权限",
          confirmText: "授权并保存重启",
          inputType: "password",
          inputPlaceholder: "输入系统 Sudo 密码",
        });
        if (pass !== null && pass.trim()) {
          setSessionSudoPassword(pass.trim());
          await handleRestartService(pass.trim());
          return;
        } else {
          showToast("已取消管理员提权授权", "warning");
        }
      } else {
        showToast(`重启失败: ${err}`, "danger");
      }
      await fetchServiceStatus();
    }
  } catch (e) {
    showToast(`重启服务请求出错: ${e.message || e}`, "danger");
  } finally {
    restartingService.value = false;
  }
};

const loadDashboardData = async () => {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_BASE}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      stats.value = await res.json();
    }
  } catch (e) {
    console.error("Failed to load dashboard stats", e);
  }
};

const triggerFetchAll = async () => {
  if (stats.value.subs === 0) {
    showToast("尚未配置任何订阅，请先前往订阅管理页面添加！", "warning");
    return;
  }
  isFetching.value = true;
  showLogsModal.value = true;
  fetchLogs.value = ["开始抓取订阅节点信息..."];

  try {
    const res = await fetch(`${API_BASE}/api/subscriptions/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ subscription_id: null }),
    });

    if (res.ok) {
      const data = await res.json();
      fetchLogs.value = data.results || [];
      showToast("节点抓取完成");
      await loadDashboardData();
    } else {
      fetchLogs.value.push("抓取失败：服务器返回异常。");
      showToast("抓取失败", "danger");
    }
  } catch (err) {
    fetchLogs.value.push(`网络请求出错: ${err.message}`);
    showToast("网络请求出错", "danger");
  } finally {
    isFetching.value = false;
  }
};

onMounted(async () => {
  await fetchKernelInfo();
  await loadDashboardData();
  initAjv();
  statusTimer = setInterval(fetchServiceStatus, 2000);
});

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer);
});
</script>

<style scoped>
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
.spin {
  animation: spin 1.5s linear infinite;
}

.mode-switch-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 0.25rem 0.5rem;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.8rem;
}

.mode-switch-pill:hover {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.05);
}

.pill-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-weight: 600;
}

.pill-badge.simple {
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
}

.pill-badge.expert {
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary);
}

.pill-switch-btn {
  color: var(--text-muted);
  font-size: 0.75rem;
  text-decoration: underline;
}

.service-power-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.service-power-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.service-status-indicator {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.indicator-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #94a3b8;
  z-index: 1;
}

.service-status-indicator.running .indicator-dot {
  background: #10b981;
}

.service-status-indicator.initializing .indicator-dot {
  background: #f59e0b;
}

.indicator-pulse {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.3);
  display: none;
}

.service-status-indicator.running .indicator-pulse {
  display: block;
  animation: pulse-ring 2s infinite ease-out;
}

.service-status-indicator.initializing .indicator-pulse {
  display: block;
  background: rgba(245, 158, 11, 0.3);
  animation: pulse-ring 1s infinite ease-out;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.6);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

.service-power-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.btn-lg {
  padding: 0.65rem 1.4rem;
  font-size: 0.95rem;
  font-weight: 600;
}
</style>
