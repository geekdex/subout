<template>
  <div class="panel kernel-card">
    <div class="kernel-header">
      <div class="flex items-center gap-3">
        <div class="kernel-icon-box">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="kernel-title">sing-box 核心内核</h3>
            <span v-if="isDownloading" class="badge badge-info animate-pulse"
              >正在下载配置中</span
            >
            <span v-else-if="hasKernelError" class="badge badge-danger">
              {{
                hasDownloadError
                  ? "下载失败"
                  : isCorrupted
                    ? "内核异常"
                    : "运行异常"
              }}
            </span>
            <span
              v-else-if="kernelInfo.is_installed"
              class="badge badge-success"
              >已安装就绪</span
            >
            <span v-else class="badge badge-warning">未安装内核</span>
          </div>
          <p class="kernel-subtitle">
            系统环境:
            <strong
              >{{ kernelInfo.os || "检测中" }} ({{
                kernelInfo.arch || "unknown"
              }})</strong
            >
            <span
              v-if="kernelInfo.version"
              style="margin-left: 0.5rem; color: var(--text-muted)"
            >
              • {{ kernelInfo.version }}
            </span>
          </p>
        </div>
      </div>

      <div class="kernel-actions">
        <!-- Error state: show re-download / repair button -->
        <button
          v-if="hasKernelError && !isDownloading"
          class="btn btn-danger btn-sm"
          title="检测到内核或服务异常，点击重新下载并覆盖当前内核"
          @click="startDownload"
        >
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
          重新下载内核
        </button>

        <!-- Not installed: show primary download button -->
        <button
          v-else-if="!kernelInfo.is_installed && !isDownloading"
          class="btn btn-primary"
          @click="startDownload"
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          一键下载并集成内核
        </button>
      </div>
    </div>

    <!-- Download Progress View -->
    <div
      v-if="isDownloading || hasDownloadError"
      class="download-progress-container"
    >
      <div
        class="flex justify-between items-center"
        style="margin-bottom: 0.5rem; font-size: 0.85rem"
      >
        <span style="font-weight: 500; color: var(--text-main)">
          <span v-if="downloadStatus.status === 'downloading'"
            >📥 正在从官方源下载内核文件...</span
          >
          <span v-else-if="downloadStatus.status === 'extracting'"
            >📦 正在解压并配置可执行权限...</span
          >
          <span v-else-if="hasDownloadError" style="color: var(--danger)"
            >❌ 下载或解压出错</span
          >
        </span>
        <div class="flex items-center gap-2">
          <span
            v-if="isDownloading"
            style="font-family: var(--font-mono); color: var(--text-muted)"
          >
            {{ formatBytes(downloadStatus.downloaded_bytes) }} /
            {{ formatBytes(downloadStatus.total_bytes) }} ({{
              (downloadStatus.progress || 0).toFixed(1)
            }}%)
            <span
              v-if="downloadStatus.speed_bytes_per_sec > 0"
              style="color: var(--primary); margin-left: 6px"
            >
              • {{ formatBytes(downloadStatus.speed_bytes_per_sec) }}/s
            </span>
          </span>
          <button
            v-if="isDownloading"
            class="btn btn-sm btn-secondary"
            style="
              padding: 0.2rem 0.6rem;
              font-size: 0.75rem;
              color: var(--danger);
            "
            :disabled="cancelling"
            @click="cancelDownload"
          >
            {{ cancelling ? "正在取消..." : "取消下载" }}
          </button>
        </div>
      </div>

      <div class="progress-bar-bg">
        <div
          class="progress-bar-fill"
          :class="{
            error: hasDownloadError,
            indeterminate: downloadStatus.status === 'extracting',
          }"
          :style="{ width: `${downloadStatus.progress || 0}%` }"
        ></div>
      </div>

      <div v-if="downloadStatus.error" class="error-text">
        {{ downloadStatus.error }}
        <button
          class="btn btn-sm btn-secondary"
          style="margin-left: 0.5rem"
          @click="startDownload"
        >
          重试
        </button>
      </div>

      <div v-if="kernelInfo.download_url" class="source-hint">
        下载源: <code>{{ kernelInfo.download_url }}</code>
      </div>
    </div>

    <!-- Corrupted Binary Error Banner when Installed -->
    <div
      v-else-if="kernelInfo.is_installed && isCorrupted"
      class="kernel-error-container"
    >
      <div class="error-text" style="margin-top: 0">
        ⚠️
        内核可执行文件异常，未能检测到有效版本信息。如运行失败，可点击右上角「重新下载内核」进行修复。
      </div>
      <div
        class="installed-info"
        style="margin-top: 0.5rem; padding-top: 0.5rem"
      >
        <div class="info-row">
          <span class="info-label">可执行文件路径:</span>
          <code class="info-val">{{ kernelInfo.binary_path }}</code>
        </div>
      </div>
    </div>

    <div v-else-if="kernelInfo.is_installed" class="installed-info">
      <div class="info-row">
        <span class="info-label">可执行文件路径:</span>
        <code class="info-val">{{ kernelInfo.binary_path }}</code>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  kernelInfo,
  fetchKernelInfo,
  API_BASE,
  token,
  showToast,
} from "../store.js";

const downloadStatus = computed(() => kernelInfo.value.download_status || {});

const isDownloading = computed(() => {
  const s = downloadStatus.value.status;
  return s === "downloading" || s === "extracting";
});

const hasDownloadError = computed(() => {
  return (
    downloadStatus.value.status === "error" || !!downloadStatus.value.error
  );
});

const isCorrupted = computed(() => {
  return !!kernelInfo.value.is_installed && !kernelInfo.value.version;
});

const hasKernelError = computed(() => {
  return hasDownloadError.value || isCorrupted.value;
});

let pollTimer = null;

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const pollStatus = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/kernel/status`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const statusData = await res.json();
      kernelInfo.value.download_status = statusData;
      if (statusData.status === "ready") {
        stopPolling();
        await fetchKernelInfo();
        showToast("sing-box 内核下载并配置成功！");
      } else if (statusData.status === "error") {
        stopPolling();
      }
    }
  } catch (e) {
    console.error("Poll status error", e);
  }
};

const startPolling = () => {
  if (pollTimer) return;
  pollTimer = setInterval(pollStatus, 800);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

const cancelling = ref(false);

const startDownload = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/kernel/download`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
    });
    if (res.ok) {
      showToast("已启动内核下载任务...");
      kernelInfo.value.download_status = {
        status: "downloading",
        progress: 0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed_bytes_per_sec: 0,
        error: null,
      };
      startPolling();
    } else {
      showToast("触发下载失败", "danger");
    }
  } catch {
    showToast("请求下载网络错误", "danger");
  }
};

const cancelDownload = async () => {
  cancelling.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/kernel/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      stopPolling();
      kernelInfo.value.download_status = {
        status: "idle",
        progress: 0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed_bytes_per_sec: 0,
        error: null,
      };
      showToast("已取消内核下载");
    } else {
      showToast("取消下载失败", "danger");
    }
  } catch {
    showToast("取消下载请求出错", "danger");
  } finally {
    cancelling.value = false;
  }
};

onMounted(() => {
  fetchKernelInfo();
  if (isDownloading.value) {
    startPolling();
  }
});

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
.kernel-card {
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  margin-bottom: 1.5rem;
}

.kernel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.kernel-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.1);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kernel-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0;
}

.kernel-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0.2rem 0 0 0;
}

.download-progress-container {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--border-color);
}

.progress-bar-bg {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-bar-fill.error {
  background: var(--danger);
}

.progress-bar-fill.indeterminate {
  width: 100% !important;
  background: linear-gradient(
    90deg,
    var(--primary),
    var(--secondary),
    var(--primary)
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.error-text {
  color: var(--danger);
  font-size: 0.85rem;
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
}

.kernel-error-container {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.service-error-content {
  margin-bottom: 0.5rem;
}

.service-error-detail {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--danger);
  background: rgba(0, 0, 0, 0.05);
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  margin-top: 0.35rem;
  word-break: break-all;
  max-height: 80px;
  overflow-y: auto;
}

.service-error-tip {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.4rem;
  line-height: 1.4;
}

.source-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
  word-break: break-all;
}

.source-hint code {
  font-size: 0.75rem;
}

.installed-info {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--border-color);
}

.info-row {
  font-size: 0.8rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-val {
  font-size: 0.8rem;
  color: var(--text-main);
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
