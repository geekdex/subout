<template>
  <div>
    <div class="view-header">
      <h1>配置列表</h1>
      <p>
        保存和管理各版本的完整模板配置。您可以查看其详细的 JSON
        内容，或一键恢复任意版本到当前系统。
      </p>
    </div>

    <div class="panel">
      <div
        class="panel-title flex justify-between items-center"
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        "
      >
        <span style="font-weight: 600; color: var(--secondary)"
          >配置版本列表</span
        >
        <button
          class="btn btn-danger"
          style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
          @click="clearHistory"
        >
          清空配置历史
        </button>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 15%">分类</th>
              <th style="width: 15%">动作</th>
              <th style="width: 35%">版本描述/备注</th>
              <th style="width: 18%">保存时间</th>
              <th style="width: 17%; text-align: right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in historyItems" :key="item.id">
              <td>
                <strong>{{ item.change_type }}</strong>
              </td>
              <td>
                <span class="badge" :class="getBadgeClass(item.action)">{{
                  item.action
                }}</span>
              </td>
              <td>{{ item.detail }}</td>
              <td>{{ item.created_at }}</td>
              <td style="text-align: right">
                <div
                  style="
                    display: flex;
                    gap: 0.25rem;
                    justify-content: flex-end;
                    flex-wrap: wrap;
                  "
                >
                  <button
                    class="btn btn-secondary"
                    style="padding: 0.35rem 0.7rem; font-size: 0.8rem"
                    @click="viewDetail(item)"
                  >
                    预览
                  </button>
                  <button
                    class="btn btn-secondary"
                    style="padding: 0.35rem 0.7rem; font-size: 0.8rem"
                    @click="copyItem(item.id)"
                  >
                    复制
                  </button>
                  <button
                    class="btn btn-secondary"
                    style="padding: 0.35rem 0.7rem; font-size: 0.8rem"
                    @click="exportItem(item.id)"
                  >
                    导出
                  </button>
                  <button
                    class="btn btn-success"
                    style="padding: 0.35rem 0.7rem; font-size: 0.8rem"
                    @click="restoreItem(item.id)"
                  >
                    恢复并编辑
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="historyItems.length === 0">
              <td
                colspan="5"
                style="text-align: center; color: var(--text-muted)"
              >
                暂无配置变更记录。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- History Detail Modal -->
    <div class="modal" :class="{ active: modal.show }">
      <div
        class="modal-card"
        style="
          max-width: 800px;
          width: 90%;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
        "
      >
        <div class="modal-header">
          <span>配置版本详情</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="modal.show = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <div style="flex: 1; overflow-y: auto; padding-right: 0.5rem">
          <div class="input-group" style="margin-top: 1rem">
            <label style="font-weight: 600">基本信息</label>
            <div
              style="
                background: rgba(255, 255, 255, 0.04);
                padding: 0.75rem;
                border-radius: 6px;
                font-size: 0.9rem;
              "
            >
              <strong>分类:</strong>
              {{ modal.meta.change_type }} &nbsp;&nbsp;|&nbsp;&nbsp;
              <strong>动作:</strong>
              {{ modal.meta.action }} &nbsp;&nbsp;|&nbsp;&nbsp;
              <strong>时间:</strong> {{ modal.meta.created_at }}<br />
              <strong>描述:</strong> {{ modal.meta.detail }}
            </div>
          </div>
          <div
            class="input-group"
            style="margin-top: 1rem; margin-bottom: 1rem"
          >
            <label style="font-weight: 600">变更数据内容</label>
            <textarea
              v-model="modal.content"
              class="input-control"
              readonly
              style="
                font-family: var(--font-mono);
                height: 350px;
                font-size: 0.85rem;
                background: rgba(0, 0, 0, 0.15);
                resize: vertical;
              "
            ></textarea>
          </div>
        </div>
        <div
          class="flex gap-2"
          style="
            justify-content: flex-end;
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-top: 1rem;
          "
        >
          <button
            type="button"
            class="btn btn-secondary"
            @click="copyModalContent"
          >
            📋 复制至剪贴板
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="exportModalContent"
          >
            📥 导出为文件
          </button>
          <button type="button" class="btn btn-success" @click="restoreAndEdit">
            ✨ 恢复并编辑
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="modal.show = false"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { token, API_BASE, showToast, confirmDialog } from "../store.js";

const emit = defineEmits(["switch-view"]);

const historyItems = ref([]);

const modal = reactive({
  show: false,
  meta: {},
  content: "",
});

const getBadgeClass = (action) => {
  if (action.includes("添加") || action.includes("新增"))
    return "badge-success";
  if (action.includes("删除")) return "badge-danger";
  return "badge-info";
};

const loadHistory = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/config/history`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      historyItems.value = await res.json();
    } else {
      showToast("加载配置列表失败", "danger");
    }
  } catch {
    showToast("加载配置列表失败", "danger");
  }
};

const orderJson = (contentStr) => {
  try {
    const parsed = JSON.parse(contentStr);
    const ordered = {};
    const order = [
      "log",
      "dns",
      "inbounds",
      "outbounds",
      "route",
      "experimental",
    ];
    order.forEach((k) => {
      if (parsed[k] !== undefined) ordered[k] = parsed[k];
    });
    Object.keys(parsed).forEach((k) => {
      if (!order.includes(k)) ordered[k] = parsed[k];
    });
    return JSON.stringify(ordered, null, 2);
  } catch {
    return contentStr;
  }
};

const viewDetail = async (item) => {
  modal.meta = item;
  modal.content = "正在加载配置内容...";
  modal.show = true;

  try {
    const res = await fetch(`${API_BASE}/api/config/history/${item.id}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const detailItem = await res.json();
      modal.content = orderJson(detailItem.content || "（无详细配置内容数据）");
    } else {
      modal.content = "加载详情失败";
    }
  } catch {
    modal.content = "网络请求发生错误";
  }
};

const copyItem = async (id) => {
  try {
    const res = await fetch(`${API_BASE}/api/config/history/${id}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const detailItem = await res.json();
      const content = orderJson(detailItem.content || "");
      if (content) {
        await navigator.clipboard.writeText(content);
        showToast("配置已成功复制到剪贴板");
      } else {
        showToast("配置内容为空", "warning");
      }
    } else {
      showToast("获取配置详情失败", "danger");
    }
  } catch {
    showToast("网络请求错误", "danger");
  }
};

const exportItem = async (id) => {
  try {
    const res = await fetch(`${API_BASE}/api/config/history/${id}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const detailItem = await res.json();
      const content = orderJson(detailItem.content || "");
      if (content) {
        const blob = new Blob([content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `singbox-config-history-${id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("配置文件已成功导出为 JSON 文件");
      } else {
        showToast("配置内容为空", "warning");
      }
    } else {
      showToast("获取配置详情失败", "danger");
    }
  } catch {
    showToast("网络请求错误", "danger");
  }
};

const restoreItem = async (id) => {
  if (
    !(await confirmDialog(
      "确定要恢复此版本的配置为当前系统的模板配置吗？\n警告：此操作将覆盖您当前的日志、DNS、入站、路由和实验性功能等模板配置！",
      { isDanger: true },
    ))
  ) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/config/history/${id}/restore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      showToast("配置已成功恢复！已自动加载到编辑器");
      emit("switch-view", "config");
    } else {
      const errText = await res.text();
      showToast(`恢复失败: ${errText || "接口错误"}`, "danger");
    }
  } catch {
    showToast("网络请求发生错误", "danger");
  }
};

const copyModalContent = () => {
  if (
    modal.content === "正在加载配置内容..." ||
    modal.content === "加载详情失败"
  )
    return;
  navigator.clipboard
    .writeText(modal.content)
    .then(() => {
      showToast("已成功复制历史配置 JSON 到剪贴板");
    })
    .catch(() => {
      showToast("复制失败，请手动选择复制", "danger");
    });
};

const exportModalContent = () => {
  if (
    modal.content === "正在加载配置内容..." ||
    modal.content === "加载详情失败"
  )
    return;
  const blob = new Blob([modal.content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `singbox-config-history-${modal.meta.id || Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("历史配置已成功导出为 JSON 文件");
};

const restoreAndEdit = async () => {
  if (!modal.meta.id) return;
  modal.show = false;
  await restoreItem(modal.meta.id);
};

const clearHistory = async () => {
  if (
    !(await confirmDialog("确定要清空所有配置变更历史吗？此操作不可恢复。", {
      isDanger: true,
    }))
  )
    return;

  try {
    const res = await fetch(`${API_BASE}/api/config/history/clear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      showToast("历史记录已清空");
      loadHistory();
    } else {
      showToast("清空历史记录失败", "danger");
    }
  } catch {
    showToast("操作失败", "danger");
  }
};

onMounted(() => {
  loadHistory();
});
</script>
