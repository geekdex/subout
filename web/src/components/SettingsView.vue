<template>
  <div>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { token, API_BASE, showToast, logout, confirmDialog } from "../store.js";

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

onMounted(() => {
  loadSettings();
});
</script>
