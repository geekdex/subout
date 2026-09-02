<template>
  <div class="view-container" style="overflow-y: auto; padding-right: 0.5rem">
    <div class="view-header">
      <h1>系统设置</h1>
      <p>更新管理员密码并进行系统初始化操作。</p>
    </div>

    <div class="grid-2">
      <!-- Change PW -->
      <div class="panel">
        <div class="panel-title">修改管理员密码</div>

        <div
          v-if="isPasswordEnvSet"
          style="
            background: rgba(99, 102, 241, 0.08);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 8px;
            padding: 1rem;
            color: var(--text-main);
            font-size: 0.9rem;
            margin-top: 1rem;
            line-height: 1.5;
          "
        >
          <span
            style="
              color: var(--warning);
              font-weight: bold;
              margin-right: 0.5rem;
            "
            >⚠️ 提示</span
          >
          管理员密码已通过环境变量
          <code>ADMIN_PASSWORD</code>
          进行配置。如需更改，请在部署环境中修改该环境变量，此后台修改入口已被禁用。
        </div>

        <form v-else @submit.prevent="changePassword">
          <div class="input-group">
            <label for="old-pw">当前密码</label>
            <input
              id="old-pw"
              v-model="passwords.old"
              type="password"
              class="input-control"
              required
            />
          </div>
          <div class="input-group">
            <label for="new-pw">新密码</label>
            <input
              id="new-pw"
              v-model="passwords.new"
              type="password"
              class="input-control"
              required
            />
          </div>
          <button type="submit" class="btn">更新密码</button>
        </form>
      </div>

      <!-- System Initialization -->
      <div class="panel">
        <div class="panel-title" style="color: var(--danger)">
          危险操作 - 系统初始化
        </div>
        <p
          style="
            margin-bottom: 1.5rem;
            color: var(--text-muted);
            font-size: 0.95rem;
            line-height: 1.5;
          "
        >
          此操作将清空所有配置、订阅数据、节点池及配置历史记录，并将管理员密码还原至默认状态。
          <br />
          <strong>警告：此操作不可逆！</strong> 初始化完成后，您需要使用默认密码
          <code>admin</code> 重新登录。
        </p>
        <button
          class="btn btn-danger"
          :disabled="initializing"
          @click="confirmInitialize"
        >
          {{ initializing ? "正在初始化..." : "初始化系统" }}
        </button>
      </div>
    </div>

    <!-- Automatic Configuration Update Panel (Expert Mode Only) -->
    <div v-if="appMode === 'expert'" class="panel" style="margin-top: 1.5rem">
      <div
        class="panel-title"
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
        "
      >
        <span>自动化配置更新</span>
        <span class="flex gap-2" style="align-items: center">
          <span style="font-size: 0.85rem; color: var(--text-muted)"
            >状态:</span
          >
          <span
            v-if="autoUpdateStatus.last_status === 'running'"
            class="badge badge-info animate-pulse"
            >🔄 正在更新...</span
          >
          <span
            v-else-if="autoUpdateStatus.last_status === 'success'"
            class="badge badge-success"
            >🟢 正常运行</span
          >
          <span
            v-else-if="autoUpdateStatus.last_status === 'failed'"
            class="badge badge-danger"
            >🔴 上次执行失败</span
          >
          <span v-else class="badge badge-secondary">⚪️ 未启用</span>
        </span>
      </div>

      <!-- Configuration Info/Guide Banner -->
      <div
        v-if="autoUpdateStatus.running_config_id"
        style="
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          color: var(--text-main);
          font-size: 0.9rem;
          margin-top: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        "
      >
        <span>
          🟢 当前运行配置对应的配置文件 ID 为:
          <strong>{{ autoUpdateStatus.running_config_id }}</strong>
        </span>
        <a
          href="#configs"
          style="
            color: var(--primary);
            text-decoration: none;
            font-size: 0.85rem;
            font-weight: 500;
          "
        >
          管理配置模板 &rarr;
        </a>
      </div>
      <div
        v-else
        style="
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 8px;
          padding: 0.75rem 1rem;
          color: var(--text-main);
          font-size: 0.9rem;
          margin-top: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        "
      >
        <span style="display: flex; align-items: center; gap: 0.5rem">
          ⚠️
          <span style="color: var(--danger); font-weight: 600"
            >未检测到有效的运行配置！</span
          >
          自动化更新需要依赖运行配置，请先配置并启用运行配置。
        </span>
        <a
          href="#configs"
          style="
            color: var(--primary);
            font-weight: 600;
            text-decoration: underline;
          "
        >
          去配置 &rarr;
        </a>
      </div>

      <div
        style="
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-top: 1rem;
        "
      >
        <!-- Settings Form -->
        <div>
          <div
            style="
              font-weight: 500;
              font-size: 0.95rem;
              margin-bottom: 0.75rem;
              color: var(--text-main);
            "
          >
            ⚙️ 自动更新策略
          </div>

          <div
            class="input-group"
            style="
              display: flex;
              align-items: center;
              gap: 0.5rem;
              margin-bottom: 1rem;
            "
          >
            <input
              id="auto-enabled"
              v-model="autoUpdateForm.enabled"
              type="checkbox"
              style="width: 18px; height: 18px; cursor: pointer"
            />
            <label
              for="auto-enabled"
              style="margin: 0; cursor: pointer; font-weight: 500"
              >启用自动更新任务</label
            >
          </div>

          <div
            v-if="autoUpdateForm.enabled && autoUpdateStatus.next_run"
            style="
              font-size: 0.85rem;
              color: var(--text-muted);
              margin-top: -0.5rem;
              margin-bottom: 1.25rem;
            "
          >
            ⏰ 下次执行时间:
            <span style="color: var(--primary); font-weight: 600">{{
              formatTimestamp(autoUpdateStatus.next_run)
            }}</span>
          </div>

          <div class="input-group">
            <label>执行检测间隔</label>
            <select
              v-model="autoUpdateForm.interval"
              class="input-control"
              :disabled="!autoUpdateForm.enabled"
            >
              <option value="1h">每 1 小时检测并更新一次</option>
              <option value="6h">每 6 小时检测并更新一次</option>
              <option value="12h">每 12 小时检测并更新一次</option>
              <option value="24h">每 24 小时检测并更新一次</option>
              <option value="48h">每 48 小时检测并更新一次</option>
              <option value="daily">每天固定时间执行</option>
            </select>
          </div>

          <div
            v-show="autoUpdateForm.interval === 'daily'"
            class="input-group"
            style="margin-top: 1rem"
          >
            <label>每天固定执行时间 (24小时制 HH:MM)</label>
            <input
              v-model="autoUpdateForm.daily_time"
              type="text"
              class="input-control"
              placeholder="例如: 04:00"
              :disabled="!autoUpdateForm.enabled"
            />
          </div>

          <div class="input-group" style="margin-top: 1rem">
            <label>选择测速目的地址 (URL)</label>
            <select
              v-model="presetUrlSelectSettings"
              class="input-control"
              :disabled="!autoUpdateForm.enabled"
              @change="onPresetUrlChangeSettings"
            >
              <option value="http://cp.cloudflare.com/generate_204">
                Cloudflare (http://cp.cloudflare.com/generate_204)
              </option>
              <option value="http://www.gstatic.com/generate_204">
                Google Gstatic (http://www.gstatic.com/generate_204)
              </option>
              <option value="http://connectivitycheck.gstatic.com/generate_204">
                Google Connectivity
                (http://connectivitycheck.gstatic.com/generate_204)
              </option>
              <option value="http://captive.apple.com/hotspot-detect.html">
                Captive Apple (http://captive.apple.com/hotspot-detect.html)
              </option>
              <option value="http://www.msftconnecttest.com/connecttest.txt">
                Microsoft Connect
                (http://www.msftconnecttest.com/connecttest.txt)
              </option>
              <option value="custom">✍️ 自定义手动输入...</option>
            </select>
          </div>
          <div
            v-show="presetUrlSelectSettings === 'custom'"
            class="input-group"
            style="margin-top: 0.5rem"
          >
            <label>自定义测速 URL</label>
            <input
              v-model="autoUpdateForm.test_url"
              type="text"
              class="input-control"
              placeholder="输入自定义 HTTP 测速 URL"
              :disabled="!autoUpdateForm.enabled"
            />
          </div>

          <div class="flex gap-2" style="margin-top: 1.5rem">
            <button
              class="btn"
              :disabled="savingSettings"
              @click="saveAutoUpdateSettings"
            >
              {{ savingSettings ? "正在保存..." : "保存更新配置" }}
            </button>
            <button
              class="btn btn-secondary"
              :disabled="triggering"
              @click="triggerAutoUpdate"
            >
              {{ triggering ? "正在执行更新..." : "立即触发更新" }}
            </button>
          </div>
        </div>

        <!-- Last Run Info & Logs -->
        <div style="display: flex; flex-direction: column">
          <div
            style="
              font-weight: 500;
              font-size: 0.95rem;
              margin-bottom: 0.75rem;
              color: var(--text-main);
              display: flex;
              justify-content: space-between;
              align-items: center;
            "
          >
            <span
              >📋
              {{
                autoUpdateStatus.last_status === "running"
                  ? "实时执行日志"
                  : "上次执行日志"
              }}</span
            >
            <span
              v-if="autoUpdateStatus.last_run"
              style="
                font-size: 0.8rem;
                font-weight: normal;
                color: var(--text-muted);
              "
            >
              更新时间: {{ formatTimestamp(autoUpdateStatus.last_run) }}
            </span>
          </div>

          <div
            style="
              flex: 1;
              min-height: 220px;
              display: flex;
              flex-direction: column;
              background: #0f172a;
              border: 1px solid var(--border-color);
              border-radius: 8px;
              overflow: hidden;
            "
          >
            <!-- Console Header -->
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
                >auto-update.log</span
              >
            </div>
            <pre
              ref="logContainer"
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
                autoUpdateStatus.last_log ||
                "暂无自动更新日志。请开启设置或点击「立即触发更新」..."
              }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from "vue";
import {
  token,
  API_BASE,
  showToast,
  logout,
  confirmDialog,
  appMode,
} from "../store.js";

const passwords = reactive({
  old: "",
  new: "",
});

const isPasswordEnvSet = ref(false);
const initializing = ref(false);

const loadSettings = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      isPasswordEnvSet.value = data.is_password_env_set;
    }
  } catch {
    showToast("载入系统设置失败", "danger");
  }
};

const changePassword = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        old_password: passwords.old,
        new_password: passwords.new,
      }),
    });

    if (res.ok) {
      showToast("密码更新成功");
      passwords.old = "";
      passwords.new = "";
    } else {
      showToast("当前密码不正确，更新失败", "danger");
    }
  } catch {
    showToast("密码更新请求出错", "danger");
  }
};

const confirmInitialize = async () => {
  if (
    !(await confirmDialog(
      "确定要初始化系统吗？所有数据都将被清空，且不可恢复！",
      { isDanger: true },
    ))
  ) {
    return;
  }

  initializing.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/system/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
    });

    if (res.ok) {
      showToast("系统初始化成功，即将返回登录页面...");
      setTimeout(() => {
        logout();
      }, 1500);
    } else {
      showToast("初始化失败，请重试", "danger");
    }
  } catch {
    showToast("初始化请求出错", "danger");
  } finally {
    initializing.value = false;
  }
};

const autoUpdateForm = reactive({
  enabled: false,
  interval: "12h",
  test_url: "http://www.gstatic.com/generate_204",
  daily_time: "04:00",
});

const autoUpdateStatus = reactive({
  last_run: "",
  next_run: "",
  last_status: "never",
  last_log: "",
  running_config_id: "",
});

const presetUrlSelectSettings = ref("http://www.gstatic.com/generate_204");
const onPresetUrlChangeSettings = () => {
  if (presetUrlSelectSettings.value !== "custom") {
    autoUpdateForm.test_url = presetUrlSelectSettings.value;
  } else {
    autoUpdateForm.test_url = "";
  }
};

const savingSettings = ref(false);
const triggering = ref(false);
const logContainer = ref(null);
let pollInterval = null;

const scrollToBottom = () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
};

const startPolling = () => {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    await loadAutoUpdateSettings(true); // pass true to indicate background polling
  }, 1500);
};

const stopPolling = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
};

const loadAutoUpdateSettings = async (isPoll = false) => {
  try {
    const res = await fetch(`${API_BASE}/api/settings/auto-update`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();

      // Only update form inputs on initial load or manual refresh, never during polling
      if (!isPoll) {
        autoUpdateForm.enabled = data.enabled;
        autoUpdateForm.interval = data.interval;
        autoUpdateForm.test_url = data.test_url;
        autoUpdateForm.daily_time = data.daily_time || "04:00";

        const presets = [
          "http://cp.cloudflare.com/generate_204",
          "http://www.gstatic.com/generate_204",
          "http://connectivitycheck.gstatic.com/generate_204",
          "http://captive.apple.com/hotspot-detect.html",
          "http://www.msftconnecttest.com/connecttest.txt",
        ];
        if (presets.includes(data.test_url)) {
          presetUrlSelectSettings.value = data.test_url;
        } else {
          presetUrlSelectSettings.value = "custom";
        }
      }

      // Always update runtime status and logs
      autoUpdateStatus.last_run = data.last_run;
      autoUpdateStatus.next_run = data.next_run;
      autoUpdateStatus.last_status = data.last_status;
      autoUpdateStatus.last_log = data.last_log;
      autoUpdateStatus.running_config_id = data.running_config_id;

      if (autoUpdateStatus.last_status === "running") {
        startPolling();
      } else {
        stopPolling();
      }

      scrollToBottom();
    }
  } catch {
    if (!isPoll) {
      showToast("载入自动更新设置失败", "danger");
    }
  }
};

const saveAutoUpdateSettings = async () => {
  savingSettings.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/settings/auto-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        enabled: autoUpdateForm.enabled,
        interval: autoUpdateForm.interval,
        test_url: autoUpdateForm.test_url,
        daily_time: autoUpdateForm.daily_time,
      }),
    });
    if (res.ok) {
      showToast("自动更新配置已保存");
      loadAutoUpdateSettings(false);
    } else {
      const text = await res.text().catch(() => "");
      showToast(text || "保存失败，服务器响应异常", "danger");
    }
  } catch {
    showToast("保存请求出错", "danger");
  } finally {
    savingSettings.value = false;
  }
};

const triggerAutoUpdate = async () => {
  if (triggering.value || autoUpdateStatus.last_status === "running") {
    showToast("更新任务已经在运行中", "warning");
    return;
  }
  triggering.value = true;
  autoUpdateStatus.last_status = "running";
  showToast("已触发后台更新任务，请查看右侧实时日志...", "info");
  try {
    const res = await fetch(`${API_BASE}/api/settings/auto-update/trigger`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === "running") {
        showToast("自动更新任务已在运行中", "warning");
      } else {
        showToast("后台更新任务已启动！");
      }
      startPolling();
    } else {
      showToast("手动触发自动更新失败", "danger");
      autoUpdateStatus.last_status = "failed";
    }
  } catch {
    showToast("自动更新请求出错", "danger");
    autoUpdateStatus.last_status = "failed";
  } finally {
    triggering.value = false;
    loadAutoUpdateSettings(true);
  }
};

const formatTimestamp = (ts) => {
  if (!ts) return "";
  const sec = parseInt(ts);
  if (isNaN(sec) || sec === 0) return "无记录";
  return new Date(sec * 1000).toLocaleString();
};

onMounted(() => {
  loadSettings();
  loadAutoUpdateSettings(false);
});

onUnmounted(() => {
  stopPolling();
});
</script>
