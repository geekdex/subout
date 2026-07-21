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
        <h1>订阅源管理</h1>
        <p>管理您的远程 VMess、VLESS、Trojan 等代理节点订阅地址。</p>
      </div>
      <button class="btn" @click="openAddModal">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        添加订阅源
      </button>
    </div>

    <div class="view-body">
      <div class="panel fill-height">
        <div
          class="panel-title"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
        >
          <span>已保存的订阅</span>
          <div v-show="selectedSubIds.length > 0" class="flex gap-2">
            <button
              class="btn btn-secondary"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="batchCopySubNodes"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="margin-right: 0.25rem"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                />
              </svg>
              批量复制节点 ({{ selectedSubIds.length }})
            </button>
            <button
              class="btn btn-secondary"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="batchExportSubNodes"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="margin-right: 0.25rem"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              批量导出节点 ({{ selectedSubIds.length }})
            </button>
            <button
              class="btn btn-danger"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="batchDeleteSubs"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="margin-right: 0.25rem"
              >
                <polyline points="3 6 5 6 21 6" />
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              批量删除 ({{ selectedSubIds.length }})
            </button>
          </div>
        </div>
        <div class="panel-table-wrapper">
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center">
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    style="width: 1.1rem; height: 1.1rem; cursor: pointer"
                    @change="toggleSelectAll"
                  />
                </th>
                <th>状态</th>
                <th>标签</th>
                <th>地址 (URL)</th>
                <th>上次获取</th>
                <th>上次错误</th>
                <th style="text-align: right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sub in paginatedSubscriptions" :key="sub.id">
                <td style="text-align: center">
                  <input
                    v-model="selectedSubIds"
                    type="checkbox"
                    :value="sub.id"
                    style="width: 1.1rem; height: 1.1rem; cursor: pointer"
                  />
                </td>
                <td>
                  <label class="switch">
                    <input
                      type="checkbox"
                      :checked="sub.enabled !== false"
                      @change="toggleEnabled(sub, $event.target.checked)"
                    />
                    <span class="slider"></span>
                  </label>
                </td>
                <td>
                  <strong>{{ sub.label }}</strong
                  ><br />
                  <small
                    style="color: var(--text-muted)"
                    :title="'过滤词: ' + formatKeywords(sub.filter_keywords)"
                  >
                    过滤词:
                    {{
                      formatKeywordsTruncated(sub.filter_keywords) || "(无)"
                    }} </small
                  ><br />
                  <small style="color: var(--text-muted)"
                    >策略:
                    {{
                      sub.delete_on_update !== false &&
                      sub.delete_on_update !== 0 &&
                      sub.delete_on_update !== "0" &&
                      sub.delete_on_update !== "false"
                        ? "更新时删除历史"
                        : "更新时保留历史"
                    }}</small
                  >
                </td>
                <td
                  style="
                    font-family: var(--font-mono);
                    font-size: 0.85rem;
                    max-width: 250px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                  "
                >
                  <a
                    :href="sub.url"
                    target="_blank"
                    style="color: var(--secondary); text-decoration: none"
                    >{{ sub.url }}</a
                  >
                </td>
                <td>{{ sub.last_fetched || "从未使用" }}</td>
                <td>
                  <span
                    v-if="sub.last_error"
                    class="badge badge-danger"
                    :title="sub.last_error"
                    >错误 (悬停查看)</span
                  >
                  <span v-else class="badge badge-success">无</span>
                </td>
                <td style="text-align: right">
                  <div
                    class="flex gap-2 flex-wrap"
                    style="justify-content: flex-end"
                  >
                    <button
                      class="btn btn-secondary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="openEditModal(sub)"
                    >
                      编辑
                    </button>
                    <button
                      class="btn btn-secondary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="triggerFetch(sub.id)"
                    >
                      抓取
                    </button>
                    <button
                      class="btn btn-secondary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      title="复制节点为 JSON 数组"
                      @click="copySubNodes(sub)"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        />
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        />
                      </svg>
                      复制
                    </button>
                    <button
                      class="btn btn-secondary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      title="导出节点为 JSON 数组文件"
                      @click="exportSubNodes(sub)"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      导出
                    </button>
                    <button
                      class="btn btn-danger"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="deleteSub(sub.id)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="subscriptions.length === 0">
                <td
                  colspan="7"
                  style="text-align: center; color: var(--text-muted)"
                >
                  暂无订阅源，请添加。
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination controls -->
        <div
          class="flex items-center justify-between"
          style="
            margin-top: 1rem;
            border-top: 1px solid var(--border-color);
            padding-top: 0.75rem;
            flex-shrink: 0;
          "
        >
          <div style="color: var(--text-muted); font-size: 0.85rem">
            显示第
            {{
              subscriptions.length > 0 ? (currentPage - 1) * pageSize + 1 : 0
            }}
            到
            {{ Math.min(currentPage * pageSize, subscriptions.length) }} 条，共
            {{ subscriptions.length }} 条
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1-5">
              <span style="color: var(--text-muted); font-size: 0.85rem"
                >每页</span
              >
              <select
                v-model="pageSize"
                class="input-control"
                style="
                  padding: 0.2rem 1.6rem 0.2rem 0.5rem;
                  font-size: 0.85rem;
                  height: 32px;
                  width: 76px;
                  margin: 0;
                  border-radius: 6px;
                "
              >
                <option :value="5">5</option>
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
              <span style="color: var(--text-muted); font-size: 0.85rem"
                >条</span
              >
            </div>
            <div class="flex gap-2">
              <button
                class="btn btn-secondary"
                style="
                  padding: 0.35rem 0.75rem;
                  font-size: 0.8rem;
                  height: 32px;
                "
                type="button"
                :disabled="currentPage === 1"
                @click="currentPage--"
              >
                上一页
              </button>
              <button
                class="btn btn-secondary"
                style="
                  padding: 0.35rem 0.75rem;
                  font-size: 0.8rem;
                  height: 32px;
                "
                type="button"
                :disabled="currentPage * pageSize >= subscriptions.length"
                @click="currentPage++"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Subscription Modal -->
    <div class="modal" :class="{ active: modal.show }">
      <div class="modal-card" style="max-width: 650px; width: 90%">
        <div class="modal-header">
          <span>{{ modal.isEdit ? "编辑订阅源" : "添加新订阅源" }}</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="closeModal"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <form @submit.prevent="saveSub">
          <div class="modal-body">
            <div class="grid-2">
              <div class="input-group">
                <label>标签名称</label>
                <input
                  v-model="modal.data.label"
                  type="text"
                  class="input-control"
                  placeholder="例如：代理服务"
                  required
                />
              </div>
              <div class="input-group">
                <label>订阅连接 URL</label>
                <input
                  v-model="modal.data.url"
                  type="url"
                  class="input-control"
                  placeholder="https://example.com/link..."
                  required
                />
              </div>
            </div>
            <div class="input-group" style="margin-top: 1rem">
              <label
                >公告过滤关键词
                (每行一个，抓取时包含此关键词的节点将被自动丢弃)</label
              >
              <textarea
                v-model="modal.data.keywordsText"
                class="input-control"
                style="height: 120px; resize: vertical"
                placeholder="例如：&#10;官网&#10;提示&#10;公告&#10;剩余&#10;到期"
              ></textarea>
            </div>
            <div
              style="
                margin-top: 1.5rem;
                margin-bottom: 1.5rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                text-align: left;
              "
            >
              <div style="display: flex; flex-direction: column; gap: 0.25rem">
                <span
                  style="
                    color: var(--text-main);
                    font-size: 0.9rem;
                    font-weight: 500;
                  "
                  >自动删除历史节点</span
                >
                <span
                  style="
                    color: var(--text-muted);
                    font-size: 0.8rem;
                    line-height: 1.4;
                  "
                >
                  更新此订阅时，自动删除该订阅下的所有历史节点（不勾选则保留历史节点，进行增量更新）
                </span>
              </div>
              <label class="switch" style="flex-shrink: 0">
                <input v-model="deleteOnUpdate" type="checkbox" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          <!-- End of modal-body -->
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeModal">
              取消
            </button>
            <button type="submit" class="btn">
              {{ modal.isEdit ? "保存修改" : "添加订阅" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue";
import {
  token,
  API_BASE,
  subscriptions,
  showToast,
  confirmDialog,
} from "../store.js";

const selectedSubIds = ref([]);
const deleteOnUpdate = ref(true);

const currentPage = ref(1);
const pageSize = ref(10);
const paginatedSubscriptions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return subscriptions.value.slice(start, end);
});

watch(subscriptions, (newVal) => {
  const maxPage = Math.max(1, Math.ceil(newVal.length / pageSize.value));
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

watch(pageSize, () => {
  currentPage.value = 1;
  selectedSubIds.value = [];
});

watch(currentPage, () => {
  selectedSubIds.value = [];
});

const isAllSelected = computed(() => {
  return (
    subscriptions.value.length > 0 &&
    selectedSubIds.value.length === subscriptions.value.length
  );
});

const toggleSelectAll = (e) => {
  if (e.target.checked) {
    selectedSubIds.value = subscriptions.value.map((s) => s.id);
  } else {
    selectedSubIds.value = [];
  }
};

const formatKeywords = (kwStr) => {
  try {
    const parsed = JSON.parse(kwStr);
    return Array.isArray(parsed) ? parsed.join(", ") : kwStr;
  } catch {
    return kwStr || "";
  }
};

const formatKeywordsTruncated = (kwStr) => {
  const full = formatKeywords(kwStr);
  return full.length > 25 ? full.substring(0, 22) + "..." : full;
};

// Modal State
const modal = reactive({
  show: false,
  isEdit: false,
  editId: null,
  data: {
    label: "",
    url: "",
    keywordsText: `公告\n提示\n通知\n到期\n流量\n官网\n购买\n地址\n订阅\n更新\n警告\n说明\n剩余\n充值\n防失联\n电报\n群\nnotice\nannouncement\nwarning\ninfo\nexpire\ntraffic`,
  },
});

const loadSubscriptions = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/subscriptions`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      subscriptions.value = await res.json();
    } else {
      showToast("加载订阅失败", "danger");
    }
  } catch {
    showToast("加载订阅失败", "danger");
  }
};

const openAddModal = () => {
  modal.isEdit = false;
  modal.editId = null;
  modal.data.label = "";
  modal.data.url = "";
  modal.data.keywordsText = `公告\n提示\n通知\n到期\n流量\n官网\n购买\n地址\n订阅\n更新\n警告\n说明\n剩余\n充值\n防失联\n电报\n群\nnotice\nannouncement\nwarning\ninfo\nexpire\ntraffic`;
  deleteOnUpdate.value = true;
  modal.show = true;
};

const openEditModal = (sub) => {
  modal.isEdit = true;
  modal.editId = sub.id;
  modal.data.label = sub.label;
  modal.data.url = sub.url;

  // Format keywords back to newline separated list
  try {
    const parsed = JSON.parse(sub.filter_keywords);
    modal.data.keywordsText = Array.isArray(parsed)
      ? parsed.join("\n")
      : sub.filter_keywords;
  } catch {
    modal.data.keywordsText = sub.filter_keywords || "";
  }

  deleteOnUpdate.value =
    sub.delete_on_update !== false &&
    sub.delete_on_update !== 0 &&
    sub.delete_on_update !== "0" &&
    sub.delete_on_update !== "false";
  modal.show = true;
};

const closeModal = () => {
  modal.show = false;
};

const saveSub = async () => {
  // Parse keywords text area into JSON string array
  const kws = modal.data.keywordsText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const filter_keywords = JSON.stringify(kws);

  const payload = {
    label: modal.data.label,
    url: modal.data.url,
    filter_keywords,
    enabled: true,
    delete_on_update: deleteOnUpdate.value,
  };

  try {
    const url = modal.isEdit
      ? `${API_BASE}/api/subscriptions/${modal.editId}`
      : `${API_BASE}/api/subscriptions`;
    const method = modal.isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      showToast(modal.isEdit ? "订阅源更新成功" : "订阅源添加成功");
      closeModal();
      loadSubscriptions();
    } else {
      showToast("保存订阅源失败", "danger");
    }
  } catch {
    showToast("保存订阅源出错", "danger");
  }
};

const toggleEnabled = async (sub, enabled) => {
  try {
    const res = await fetch(`${API_BASE}/api/subscriptions/${sub.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        label: sub.label,
        url: sub.url,
        filter_keywords: sub.filter_keywords,
        enabled,
        delete_on_update:
          sub.delete_on_update !== false &&
          sub.delete_on_update !== 0 &&
          sub.delete_on_update !== "0" &&
          sub.delete_on_update !== "false",
      }),
    });
    if (res.ok) {
      showToast(enabled ? "订阅已启用" : "订阅已禁用");
      sub.enabled = enabled;
    } else {
      showToast("修改状态失败", "danger");
    }
  } catch {
    showToast("修改状态失败", "danger");
  }
};

const triggerFetch = async (id) => {
  showToast("正在抓取节点...");
  try {
    const res = await fetch(`${API_BASE}/api/subscriptions/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ subscription_id: id }),
    });

    if (res.ok) {
      const data = await res.json();
      showToast(data.results[0] || "抓取成功");
      loadSubscriptions();
    } else {
      showToast("抓取订阅节点失败", "danger");
    }
  } catch {
    showToast("抓取请求出错", "danger");
  }
};

const deleteSub = async (id) => {
  if (
    !(await confirmDialog("确定要删除该订阅源以及其包含的所有节点吗？", {
      isDanger: true,
    }))
  )
    return;

  try {
    const res = await fetch(`${API_BASE}/api/subscriptions/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.value}` },
    });

    if (res.ok) {
      showToast("订阅源已删除");
      // Remove from selected list if checked
      selectedSubIds.value = selectedSubIds.value.filter((sid) => sid !== id);
      loadSubscriptions();
    } else {
      showToast("删除订阅源失败", "danger");
    }
  } catch {
    showToast("删除订阅源出错", "danger");
  }
};

const batchDeleteSubs = async () => {
  if (selectedSubIds.value.length === 0) return;
  if (
    !(await confirmDialog(
      `确定要批量删除这 ${selectedSubIds.value.length} 个订阅源，及其下的所有节点吗？`,
      { isDanger: true },
    ))
  )
    return;

  try {
    const res = await fetch(`${API_BASE}/api/subscriptions/batch-delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ ids: selectedSubIds.value }),
    });

    if (res.ok) {
      showToast("所选订阅源已批量删除");
      selectedSubIds.value = [];
      loadSubscriptions();
    } else {
      showToast("批量删除失败", "danger");
    }
  } catch {
    showToast("批量删除出错", "danger");
  }
};

const copyToClipboard = (text) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    } finally {
      document.body.removeChild(textarea);
    }
  }
};

const downloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const fetchNodesForSubscriptions = async (subIds) => {
  showToast("正在获取节点数据...");
  let allParsed = [];
  try {
    for (const subId of subIds) {
      const url = `${API_BASE}/api/nodes?page=1&limit=999999&subscription_id=${subId}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token.value}` },
      });
      if (res.ok) {
        const data = await res.json();
        const nodesList = data.nodes || [];
        const parsed = nodesList
          .map((node) => {
            try {
              return typeof node.raw_json === "string"
                ? JSON.parse(node.raw_json)
                : node.raw_json;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        allParsed.push(...parsed);
      }
    }
    return allParsed;
  } catch {
    showToast("获取节点数据失败", "danger");
    return null;
  }
};

const copySubNodes = async (sub) => {
  const nodes = await fetchNodesForSubscriptions([sub.id]);
  if (!nodes) return;
  if (nodes.length === 0) {
    showToast("该订阅下暂无节点", "warning");
    return;
  }
  try {
    await copyToClipboard(JSON.stringify(nodes, null, 2));
    showToast(`成功复制 ${nodes.length} 个节点配置到剪贴板`);
  } catch {
    showToast("复制失败，请重试", "danger");
  }
};

const exportSubNodes = async (sub) => {
  const nodes = await fetchNodesForSubscriptions([sub.id]);
  if (!nodes) return;
  if (nodes.length === 0) {
    showToast("该订阅下暂无节点", "warning");
    return;
  }
  downloadJson(nodes, `subout-nodes-${sub.label}-${Date.now()}.json`);
  showToast(`成功导出 ${nodes.length} 个节点`);
};

const batchCopySubNodes = async () => {
  if (selectedSubIds.value.length === 0) return;
  const nodes = await fetchNodesForSubscriptions(selectedSubIds.value);
  if (!nodes) return;
  if (nodes.length === 0) {
    showToast("所选订阅下暂无节点", "warning");
    return;
  }
  try {
    await copyToClipboard(JSON.stringify(nodes, null, 2));
    showToast(`成功复制 ${nodes.length} 个节点配置到剪贴板`);
  } catch {
    showToast("复制失败，请重试", "danger");
  }
};

const batchExportSubNodes = async () => {
  if (selectedSubIds.value.length === 0) return;
  const nodes = await fetchNodesForSubscriptions(selectedSubIds.value);
  if (!nodes) return;
  if (nodes.length === 0) {
    showToast("所选订阅下暂无节点", "warning");
    return;
  }
  downloadJson(nodes, `subout-batch-nodes-${Date.now()}.json`);
  showToast(`成功导出 ${nodes.length} 个节点`);
};

onMounted(() => {
  loadSubscriptions();
});
</script>
