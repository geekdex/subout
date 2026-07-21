<template>
  <div class="view-container">
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
        <h1>控制中心</h1>
        <p>概览您的订阅状态，节点详情，并生成 sing-box 配置文件。</p>
      </div>
      <div>
        <button class="btn" @click="triggerFetchAll">
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
          @click="$emit('switch-view', 'groups')"
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
            <h3>出站组数</h3>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { token, API_BASE, stats, showToast } from "../store.js";
import { initAjv } from "../validator.js";

defineEmits(["switch-view"]);

const isFetching = ref(false);
const showLogsModal = ref(false);
const fetchLogs = ref([]);

const loadDashboardData = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      stats.value = await res.json();
    } else {
      showToast("加载控制台统计失败", "danger");
    }
  } catch {
    showToast("加载控制台统计失败", "danger");
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

onMounted(() => {
  loadDashboardData();
  initAjv();
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
</style>
