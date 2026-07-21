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
        <h1>分流出站组 (Proxy Groups)</h1>
        <p>
          配置 selector (手动选择) 或 urltest (自动测速选择延迟最低) 的 sing-box
          出站分组。
        </p>
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
        添加出站组
      </button>
    </div>

    <div class="view-body">
      <div class="panel fill-height">
        <div class="panel-title">
          <span>已配置的出站组</span>
        </div>
        <div class="panel-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>出站 Tag</th>
                <th>分组类型</th>
                <th>配置详情</th>
                <th style="text-align: right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in paginatedGroups" :key="g.id">
                <td>
                  <strong>{{ g.tag }}</strong>
                </td>
                <td>
                  <span
                    class="badge"
                    :class="
                      g.group_type === 'urltest'
                        ? 'badge-info'
                        : 'badge-success'
                    "
                  >
                    {{ g.group_type }}
                  </span>
                </td>
                <td>
                  <div style="font-size: 0.9rem; color: var(--text-muted)">
                    <span
                      style="
                        display: block;
                        font-weight: 500;
                        color: var(--text-main);
                        margin-bottom: 0.25rem;
                      "
                    >
                      包含节点数目: {{ getOutboundsList(g).length }} 个
                    </span>
                    <span
                      style="
                        font-family: var(--font-mono);
                        font-size: 0.8rem;
                        word-break: break-all;
                      "
                    >
                      {{ getOutboundsList(g).slice(0, 10).join(", ")
                      }}{{ getOutboundsList(g).length > 10 ? "..." : "" }}
                    </span>
                    <span
                      v-if="g.group_type === 'urltest'"
                      style="
                        display: block;
                        margin-top: 0.25rem;
                        font-size: 0.8rem;
                        font-style: italic;
                      "
                    >
                      ⏰ 测速间隔: {{ getUrlTestDetail(g).interval }} | 容差:
                      {{ getUrlTestDetail(g).tolerance }}ms | URL:
                      {{ getUrlTestDetail(g).url }}
                    </span>
                  </div>
                </td>
                <td style="text-align: right">
                  <div class="flex gap-2" style="justify-content: flex-end">
                    <button
                      class="btn btn-secondary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="openEditModal(g)"
                    >
                      编辑
                    </button>
                    <button
                      class="btn btn-danger"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="deleteGroup(g.id)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="groups.length === 0">
                <td
                  colspan="4"
                  style="text-align: center; color: var(--text-muted)"
                >
                  暂无配置的分流出站组。
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
            {{ groups.length > 0 ? (currentPage - 1) * pageSize + 1 : 0 }} 到
            {{ Math.min(currentPage * pageSize, groups.length) }} 条，共
            {{ groups.length }} 条
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
                :disabled="currentPage * pageSize >= groups.length"
                @click="currentPage++"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Group Add/Edit Modal -->
    <div class="modal" :class="{ active: modal.show }">
      <div class="modal-card" style="max-width: 850px; width: 90%">
        <div class="modal-header">
          <span>{{ modal.isEdit ? "编辑分流出站组" : "添加分流出站组" }}</span>
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
        <form @submit.prevent="submitForm">
          <div class="modal-body">
            <div class="group-editor-container">
              <div class="group-form-left">
                <div class="input-group">
                  <label>分组 Tag 名称</label>
                  <input
                    v-model="modal.tag"
                    type="text"
                    class="input-control"
                    placeholder="例如：proxy 或 AUTO-Test"
                    required
                  />
                </div>
                <div class="input-group" style="margin-top: 1rem">
                  <label>分组类型</label>
                  <select v-model="modal.type" class="input-control">
                    <option value="selector">selector (手动选择列表)</option>
                    <option value="urltest">urltest (自动延迟测速)</option>
                  </select>
                </div>

                <div
                  v-show="modal.type === 'urltest'"
                  style="
                    margin-top: 1rem;
                    border-top: 1px dashed var(--border-color);
                    padding-top: 1rem;
                  "
                >
                  <div class="input-group">
                    <label>测速 URL</label>
                    <input
                      v-model="modal.url"
                      type="text"
                      class="input-control"
                      placeholder="http://cp.cloudflare.com/generate_204"
                    />
                  </div>
                  <div class="input-group" style="margin-top: 1rem">
                    <label>测速间隔 (Interval)</label>
                    <input
                      v-model="modal.interval"
                      type="text"
                      class="input-control"
                      placeholder="3m"
                    />
                  </div>
                  <div class="input-group" style="margin-top: 1rem">
                    <label>延迟容差 (Tolerance, ms)</label>
                    <input
                      v-model.number="modal.tolerance"
                      type="number"
                      class="input-control"
                      placeholder="50"
                    />
                  </div>
                </div>
              </div>

              <div class="group-nodes-right">
                <div
                  class="input-group"
                  style="
                    margin-bottom: 0;
                    display: flex;
                    flex-direction: column;
                  "
                >
                  <label>选择包含的节点 / 出站组</label>

                  <div class="node-selection-workspace">
                    <!-- Left Pane: Available Outbounds -->
                    <div class="pane-column">
                      <div class="pane-header">
                        <div
                          class="flex gap-2"
                          style="width: 100%; margin-bottom: 0.2rem"
                        >
                          <select
                            v-model="groupNodeSubFilter"
                            class="input-control"
                            style="
                              max-width: 90px;
                              font-size: 0.8rem;
                              padding: 0.25rem 0.5rem;
                              height: 32px;
                            "
                          >
                            <option value="all">全部订阅</option>
                            <option value="custom">自定义节点</option>
                            <option
                              v-for="sub in subList"
                              :key="sub.id"
                              :value="sub.id"
                            >
                              {{ sub.label }}
                            </option>
                          </select>
                          <input
                            v-model="groupNodeSearch"
                            type="text"
                            class="input-control"
                            style="
                              flex-grow: 1;
                              font-size: 0.8rem;
                              padding: 0.25rem 0.5rem;
                              height: 32px;
                            "
                            placeholder="搜索节点/出站组..."
                          />
                        </div>
                        <div
                          style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            font-size: 0.75rem;
                            color: var(--text-muted);
                            padding: 0 0.1rem;
                          "
                        >
                          <span>可选: {{ filteredOutbounds.length }} 个</span>
                          <a
                            href="javascript:void(0)"
                            style="
                              color: var(--primary);
                              text-decoration: none;
                              font-weight: 500;
                            "
                            @click="selectAllFiltered"
                          >
                            全选当前
                          </a>
                        </div>
                      </div>

                      <div class="pane-body">
                        <div
                          v-for="item in filteredOutbounds"
                          :key="item.tag"
                          class="multi-select-item transfer-available-item"
                          style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            gap: 0.4rem;
                            padding: 0.35rem 0.5rem;
                            border-radius: 6px;
                            cursor: pointer;
                            transition: background 0.2s;
                            user-select: none;
                          "
                          @click="selectTag(item.tag)"
                        >
                          <span
                            style="
                              font-size: 0.8rem;
                              white-space: nowrap;
                              overflow: hidden;
                              text-overflow: ellipsis;
                              width: calc(100% - 1.5rem);
                            "
                            :title="item.title"
                          >
                            <strong
                              v-if="item.isGroup"
                              style="color: var(--secondary)"
                              >[出站组] {{ item.tag }}</strong
                            >
                            <span
                              v-else-if="item.isStandard"
                              style="color: var(--text-muted)"
                              >{{ item.tag }} (系统)</span
                            >
                            <template v-else>
                              <strong>{{ item.tag }}</strong>
                              <small
                                style="
                                  color: var(--text-muted);
                                  font-family: var(--font-mono);
                                  margin-left: 0.15rem;
                                "
                                >({{ item.server }}:{{ item.port }})</small
                              >
                              <span
                                class="badge badge-info"
                                style="
                                  font-size: 0.65rem;
                                  padding: 0.05rem 0.15rem;
                                  margin-left: 0.25rem;
                                "
                                >{{ item.node_type }}</span
                              >
                            </template>
                          </span>
                          <span
                            class="add-icon"
                            style="
                              color: var(--primary);
                              font-weight: bold;
                              font-size: 1rem;
                            "
                            >+</span
                          >
                        </div>
                        <div
                          v-if="filteredOutbounds.length === 0"
                          style="
                            text-align: center;
                            padding: 2rem 0;
                            color: var(--text-muted);
                            font-size: 0.8rem;
                          "
                        >
                          无可选匹配项
                        </div>
                      </div>
                    </div>

                    <!-- Right Pane: Selected Outbounds -->
                    <div class="pane-column">
                      <div
                        class="pane-header"
                        style="
                          justify-content: space-between;
                          align-items: center;
                          flex-direction: row;
                          height: 53px;
                          box-sizing: border-box;
                        "
                      >
                        <span
                          style="
                            font-size: 0.8rem;
                            font-weight: 600;
                            color: var(--text-main);
                          "
                          >已选: {{ modal.selectedNodeTags.length }} 个</span
                        >
                        <a
                          href="javascript:void(0)"
                          style="
                            color: var(--danger);
                            text-decoration: none;
                            font-size: 0.75rem;
                            font-weight: 500;
                          "
                          @click="clearAllSelected"
                        >
                          清空
                        </a>
                      </div>

                      <div class="pane-body">
                        <div
                          v-for="tag in modal.selectedNodeTags"
                          :key="tag"
                          class="selected-node-item transfer-selected-item"
                          style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            gap: 0.4rem;
                            padding: 0.35rem 0.5rem;
                            border-radius: 6px;
                            background: rgba(255, 255, 255, 0.02);
                            border: 1px solid var(--border-color);
                            transition: background-color 0.2s;
                            cursor: pointer;
                          "
                          @click="removeSelectedTag(tag)"
                        >
                          <span
                            style="
                              font-size: 0.8rem;
                              white-space: nowrap;
                              overflow: hidden;
                              text-overflow: ellipsis;
                              color: var(--text-main);
                              max-width: calc(100% - 1.5rem);
                            "
                            :title="tag"
                          >
                            <strong
                              v-if="isTagGroup(tag)"
                              style="color: var(--secondary)"
                              >[出站组] {{ tag }}</strong
                            >
                            <span
                              v-else-if="isTagStandard(tag)"
                              style="color: var(--text-muted)"
                              >{{ tag }} (系统)</span
                            >
                            <span v-else>{{ tag }}</span>
                          </span>

                          <button
                            type="button"
                            class="remove-btn"
                            style="pointer-events: none"
                          >
                            &times;
                          </button>
                        </div>
                        <div
                          v-if="modal.selectedNodeTags.length === 0"
                          style="
                            text-align: center;
                            padding: 2rem 0;
                            color: var(--text-muted);
                            font-size: 0.8rem;
                          "
                        >
                          请从左侧选择节点
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- End of modal-body -->

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeModal">
              取消
            </button>
            <button type="submit" class="btn">确认保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue";
import { token, API_BASE, groups, showToast, confirmDialog } from "../store.js";

const allNodes = ref([]);
const subList = ref([]);
const groupNodeSubFilter = ref("all");
const groupNodeSearch = ref("");

const currentPage = ref(1);
const pageSize = ref(10);
const paginatedGroups = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return groups.value.slice(start, end);
});

watch(groups, (newVal) => {
  const maxPage = Math.max(1, Math.ceil(newVal.length / pageSize.value));
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

watch(pageSize, () => {
  currentPage.value = 1;
});

// Modal state
const modal = reactive({
  show: false,
  isEdit: false,
  editId: null,
  tag: "",
  type: "selector",
  url: "",
  interval: "",
  tolerance: 50,
  selectedNodeTags: [],
});

const getOutboundsList = (g) => {
  try {
    if (!g.static_nodes) return [];
    const nodes =
      typeof g.static_nodes === "string"
        ? JSON.parse(g.static_nodes)
        : g.static_nodes;
    return Array.isArray(nodes) ? nodes : [];
  } catch {
    return [];
  }
};

const getUrlTestDetail = (g) => {
  return {
    url: g.url || "http://cp.cloudflare.com/generate_204",
    interval: g.interval || "3m",
    tolerance: g.tolerance || 50,
  };
};

const loadGroups = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/groups`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      groups.value = await res.json();
    } else {
      showToast("加载分流组失败", "danger");
    }
  } catch {
    showToast("加载分流组失败", "danger");
  }
};

const loadSubscriptions = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/subscriptions`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      subList.value = await res.json();
    }
  } catch {}
};

const loadAllNodesForSelector = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/nodes?limit=100000`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      allNodes.value = data.nodes || [];
    }
  } catch {}
};

// Computed checkable outbounds options list
const checkableOptions = computed(() => {
  const options = [];

  // 1. Standard options
  options.push({
    tag: "direct",
    isStandard: true,
    subId: "standard",
    title: "direct (系统出站)",
  });
  options.push({
    tag: "block",
    isStandard: true,
    subId: "standard",
    title: "block (系统出站)",
  });

  // 2. Outbound groups (except self)
  groups.value.forEach((g) => {
    if (modal.isEdit && g.id === modal.editId) return;
    options.push({
      tag: g.tag,
      isGroup: true,
      subId: "group",
      title: `[出站组] ${g.tag}`,
    });
  });

  // 3. Nodes
  allNodes.value.forEach((n) => {
    options.push({
      tag: n.tag,
      isNode: true,
      subId: n.subscription_id ? n.subscription_id : "custom",
      server: n.server,
      port: n.port,
      node_type: n.node_type,
      title: `${n.tag} (${n.server}:${n.port}) [${n.node_type}]`,
    });
  });

  return options;
});

const filteredOutbounds = computed(() => {
  return checkableOptions.value.filter((item) => {
    // 1. Exclude if already selected
    if (modal.selectedNodeTags.includes(item.tag)) return false;

    // 2. Filter sub ID
    if (groupNodeSubFilter.value !== "all") {
      if (groupNodeSubFilter.value === "custom") {
        if (item.subId !== "custom") return false;
      } else {
        if (item.subId !== groupNodeSubFilter.value) return false;
      }
    }
    // 3. Filter search query
    if (groupNodeSearch.value) {
      const query = groupNodeSearch.value.toLowerCase();
      const tagMatch = item.tag && item.tag.toLowerCase().includes(query);
      const serverMatch =
        item.server && item.server.toLowerCase().includes(query);
      return tagMatch || serverMatch;
    }
    return true;
  });
});

const openAddModal = () => {
  loadAllNodesForSelector();
  modal.isEdit = false;
  modal.editId = null;
  modal.tag = "";
  modal.type = "selector";
  modal.url = "";
  modal.interval = "";
  modal.tolerance = 50;
  modal.selectedNodeTags = [];
  modal.show = true;
};

const openEditModal = (g) => {
  loadAllNodesForSelector();
  modal.isEdit = true;
  modal.editId = g.id;
  modal.tag = g.tag;
  modal.type = g.group_type;
  modal.url = g.url || "";
  modal.interval = g.interval || "";
  modal.tolerance = g.tolerance || 50;
  modal.selectedNodeTags = getOutboundsList(g);
  modal.show = true;
};

const closeModal = () => {
  modal.show = false;
};

const selectTag = (tag) => {
  if (!modal.selectedNodeTags.includes(tag)) {
    modal.selectedNodeTags.push(tag);
  }
};

const removeSelectedTag = (tag) => {
  modal.selectedNodeTags = modal.selectedNodeTags.filter((t) => t !== tag);
};

const clearAllSelected = () => {
  modal.selectedNodeTags = [];
};

const isTagGroup = (tag) => {
  return groups.value.some((g) => g.tag === tag && g.id !== modal.editId);
};

const isTagStandard = (tag) => {
  return tag === "direct" || tag === "block";
};

const selectAllFiltered = () => {
  const filteredTags = filteredOutbounds.value.map((item) => item.tag);
  const newTags = [...modal.selectedNodeTags];
  filteredTags.forEach((tag) => {
    if (!newTags.includes(tag)) {
      newTags.push(tag);
    }
  });
  modal.selectedNodeTags = newTags;
};

const submitForm = async () => {
  const payload = {
    tag: modal.tag,
    group_type: modal.type,
    static_nodes: JSON.stringify(modal.selectedNodeTags),
  };

  if (modal.type === "urltest") {
    payload.url = modal.url || "http://cp.cloudflare.com/generate_204";
    payload.interval = modal.interval || "3m";
    payload.tolerance = parseInt(modal.tolerance) || 50;
  } else {
    payload.url = null;
    payload.interval = null;
    payload.tolerance = null;
  }

  try {
    const url = modal.isEdit
      ? `${API_BASE}/api/groups/${modal.editId}`
      : `${API_BASE}/api/groups`;
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
      showToast(modal.isEdit ? "分组更新成功" : "分组添加成功");
      closeModal();
      loadGroups();
    } else {
      showToast("保存分组失败，出站 Tag 名字必须唯一", "danger");
    }
  } catch {
    showToast("保存出站组发生异常", "danger");
  }
};

const deleteGroup = async (id) => {
  if (!(await confirmDialog("确定要删除该出站分组吗？", { isDanger: true })))
    return;

  try {
    const res = await fetch(`${API_BASE}/api/groups/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.value}` },
    });

    if (res.ok) {
      showToast("分流出站组已删除");
      loadGroups();
    } else {
      showToast("删除出站组失败", "danger");
    }
  } catch {
    showToast("删除出站组出错", "danger");
  }
};

onMounted(() => {
  loadGroups();
  loadSubscriptions();
});
</script>

<style scoped>
.node-selection-workspace {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 1rem;
  height: 320px;
  margin-top: 0.5rem;
}

.pane-column {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.12);
}

.pane-header {
  padding: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.015);
  display: flex;
  gap: 0.4rem;
  flex-direction: column;
}

.pane-body {
  flex-grow: 1;
  overflow-y: auto;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.selected-node-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  transition: background-color 0.2s;
}

.selected-node-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.remove-btn {
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  transition: all 0.2s;
}

.remove-btn:hover {
  color: var(--danger);
  background-color: rgba(239, 68, 68, 0.1);
}

.transfer-available-item:hover {
  background: rgba(99, 102, 241, 0.08) !important;
  border-color: rgba(99, 102, 241, 0.15) !important;
}

.transfer-available-item .add-icon {
  opacity: 0.3;
  transition: opacity 0.2s;
}

.transfer-available-item:hover .add-icon {
  opacity: 1;
}

.transfer-selected-item:hover {
  background: rgba(239, 68, 68, 0.06) !important;
  border-color: rgba(239, 68, 68, 0.15) !important;
}

.transfer-selected-item:hover .remove-btn {
  color: var(--danger);
}
</style>
