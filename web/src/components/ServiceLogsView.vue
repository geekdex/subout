<template>
  <div
    class="view-container"
    style="display: flex; flex-direction: column; height: 100%"
  >
    <div
      class="view-header"
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
      "
    >
      <div>
        <h1>sing-box 运行日志</h1>
        <p>查看集成 sing-box 内核的实时标准输出及错误日志。</p>
      </div>

      <div class="flex gap-2 items-center">
        <span
          v-if="serviceStatus.running && serviceStatus.ready"
          class="badge badge-success"
          >🟢 核心运行中 (PID: {{ serviceStatus.pid || "N/A" }})</span
        >
        <span v-else-if="serviceStatus.running" class="badge badge-warning"
          >🟡 正在启动中 (PID: {{ serviceStatus.pid || "N/A" }})</span
        >
        <span v-else class="badge badge-secondary">⚪️ 核心已停止</span>

        <button class="btn btn-secondary btn-sm" @click="fetchLogs">
          <svg
            width="14"
            height="14"
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
          刷新
        </button>

        <button class="btn btn-secondary btn-sm" @click="clearLogs">
          清空日志
        </button>

        <button class="btn btn-secondary btn-sm" @click="copyLogs">
          复制日志
        </button>
      </div>
    </div>

    <!-- Search / Filter bar -->
    <div class="flex gap-2 items-center" style="margin-bottom: 1rem">
      <input
        v-model="filterKeyword"
        type="text"
        class="input-control"
        placeholder="搜索日志关键字 (如 error, info, tcp)..."
        style="max-width: 320px"
      />
      <label
        class="flex items-center gap-1"
        style="font-size: 0.85rem; color: var(--text-muted); cursor: pointer"
      >
        <input v-model="autoScroll" type="checkbox" />
        自动滚动到底部
      </label>
      <label
        class="flex items-center gap-1"
        style="
          font-size: 0.85rem;
          color: var(--text-muted);
          cursor: pointer;
          margin-left: 1rem;
        "
      >
        <input v-model="autoRefresh" type="checkbox" />
        实时轮询更新
      </label>
    </div>

    <!-- Log Console Box -->
    <div
      style="
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        background: #0f172a;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        overflow: hidden;
      "
    >
      <div
        style="
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0.5rem 0.75rem;
          background: #1e293b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        "
      >
        <span
          style="
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #ef4444;
            display: inline-block;
          "
        ></span>
        <span
          style="
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #f59e0b;
            display: inline-block;
          "
        ></span>
        <span
          style="
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #10b981;
            display: inline-block;
          "
        ></span>
        <span
          style="
            margin-left: 6px;
            font-size: 0.75rem;
            color: #94a3b8;
            font-family: var(--font-mono);
          "
          >sing-box-service.log</span
        >
      </div>

      <pre
        ref="logBox"
        style="
          flex: 1;
          min-height: 0;
          padding: 0.75rem;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: #e2e8f0;
          background: transparent;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 0;
        "
        >{{
          filteredLogs || "暂无日志输出。请先在控制中心启动 sing-box 服务..."
        }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import {
  API_BASE,
  token,
  showToast,
  serviceStatus,
  fetchServiceStatus,
} from "../store.js";

const logs = ref([]);
const filterKeyword = ref("");
const autoScroll = ref(true);
const autoRefresh = ref(true);
const logBox = ref(null);
let pollTimer = null;

const filteredLogs = computed(() => {
  if (!Array.isArray(logs.value) || logs.value.length === 0) return "";
  if (!filterKeyword.value.trim()) {
    return logs.value.join("\n");
  }
  const kw = filterKeyword.value.toLowerCase();
  return logs.value
    .filter((l) => typeof l === "string" && l.toLowerCase().includes(kw))
    .join("\n");
});

const scrollToBottom = () => {
  if (!autoScroll.value) return;
  nextTick(() => {
    if (logBox.value) {
      logBox.value.scrollTop = logBox.value.scrollHeight;
    }
  });
};

const fetchLogs = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/service/logs`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      logs.value = Array.isArray(data) ? data : [];
      scrollToBottom();
    }
    await fetchServiceStatus();
  } catch (e) {
    console.error("Failed to fetch logs", e);
  }
};

const clearLogs = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/service/logs/clear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      logs.value = [];
      showToast("日志已清空");
    }
  } catch {
    showToast("清空日志失败", "danger");
  }
};

const copyLogs = () => {
  if (!logs.value || logs.value.length === 0) {
    showToast("暂无可复制日志", "warning");
    return;
  }
  navigator.clipboard.writeText(logs.value.join("\n"));
  showToast("日志已复制到剪贴板");
};

watch(autoRefresh, (val) => {
  if (val) {
    startPolling();
  } else {
    stopPolling();
  }
});

const startPolling = () => {
  if (pollTimer) return;
  pollTimer = setInterval(fetchLogs, 1500);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

onMounted(() => {
  fetchLogs();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>
