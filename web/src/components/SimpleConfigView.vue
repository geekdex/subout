<template>
  <div class="view-container" style="overflow-y: auto; padding-right: 0.5rem">
    <!-- View Header matching global style -->
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
        <h1>极简配置管理</h1>
        <p>可视化配置 DNS、分流规则与入站端口，无需编辑复杂 JSON 结构。</p>
      </div>
      <div class="flex gap-2" style="align-items: center">
        <button
          type="button"
          class="btn btn-secondary"
          title="弹窗预览由当前设置生成的完整 sing-box JSON 配置"
          @click="showPreviewModal = true"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          查看配置预览
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="saving"
          @click="saveConfig(false)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
            ></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          {{ saving ? "保存中..." : "保存设置" }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="saving"
          @click="saveConfig(true)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          {{ saving ? "应用中..." : "保存并应用" }}
        </button>
      </div>
    </div>

    <!-- Section 1: Route & Proxy Modes -->
    <div class="panel">
      <div class="panel-title">
        <div class="flex items-center gap-2">
          <span>⚡ 分流规则模式</span>
          <span
            style="
              font-size: 0.85rem;
              font-weight: normal;
              color: var(--text-muted);
            "
          >
            控制不同网络流量的走向
          </span>
        </div>
      </div>

      <div class="option-grid">
        <div
          class="option-card"
          :class="{ active: form.route.mode === 'smart' }"
          @click="form.route.mode = 'smart'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🌟</span>
              <span class="option-title">智能分流</span>
            </div>
            <span class="badge badge-success">推荐</span>
          </div>
          <p class="option-desc">
            国内网站与 IP 自动直连，国外受限网站走代理加速。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.route.mode === 'global' }"
          @click="form.route.mode = 'global'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🌐</span>
              <span class="option-title">全局代理</span>
            </div>
          </div>
          <p class="option-desc">
            除局域网外，所有出站网络流量全部强制经由代理节点。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.route.mode === 'gfw' }"
          @click="form.route.mode = 'gfw'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🛡️</span>
              <span class="option-title">仅阻断域名</span>
            </div>
          </div>
          <p class="option-desc">
            仅在 GFW 阻断列表中的域名走代理，其余网络流量均直连。
          </p>
        </div>
      </div>

      <!-- Feature Switches -->
      <div class="switches-row">
        <label class="switch-item">
          <input v-model="form.route.block_ads" type="checkbox" />
          <span>🚫 广告与恶意追踪拦截 (geosite:category-ads-all)</span>
        </label>

        <label class="switch-item">
          <input v-model="form.route.bypass_lan" type="checkbox" />
          <span>🏠 局域网私有地址直连 (geoip:private)</span>
        </label>
      </div>

      <!-- Outbound Exit Strategy & Node Selection -->
      <div class="outbound-box">
        <div
          class="flex items-center justify-between flex-wrap gap-2"
          style="margin-bottom: 0.75rem"
        >
          <div class="flex items-center gap-2">
            <span
              style="
                font-weight: 600;
                font-size: 0.9rem;
                color: var(--text-main);
              "
              >🎯 默认出口策略与节点</span
            >
            <span v-if="enabledNodes.length > 0" class="badge badge-info">
              {{ enabledNodes.length }} 个可用节点
            </span>
            <span v-else class="badge badge-warning">暂无可用节点</span>
            <button
              type="button"
              class="btn-icon"
              title="刷新节点列表"
              :disabled="loadingNodes"
              style="
                padding: 2px 6px;
                font-size: 0.8rem;
                background: transparent;
                border: none;
                cursor: pointer;
                color: var(--text-muted);
              "
              @click="loadNodes"
            >
              🔄
            </button>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              class="btn"
              :class="isAutoTest ? '' : 'btn-secondary'"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="setOutboundMode('auto')"
            >
              ⚡ 自动测速优选 (AUTO-Test)
            </button>
            <button
              type="button"
              class="btn"
              :class="isDirect ? '' : 'btn-secondary'"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="setOutboundMode('direct')"
            >
              🟢 默认直连 (Direct)
            </button>
            <button
              type="button"
              class="btn"
              :class="!isAutoTest && !isDirect ? '' : 'btn-secondary'"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="setOutboundMode('manual')"
            >
              📍 手动指定节点
            </button>
          </div>
        </div>

        <div
          v-if="isAutoTest"
          style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5"
        >
          💡
          系统将定期自动对所有已启用的订阅节点进行测速（URLTest），并将流量实时路由至最低延迟节点。
        </div>

        <div
          v-else-if="isDirect"
          style="
            font-size: 0.8rem;
            color: var(--text-muted);
            line-height: 1.5;
            padding: 0.5rem 0.75rem;
            background: rgba(16, 185, 129, 0.08);
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 6px;
          "
        >
          🟢
          <strong>当前为默认直连模式</strong
          >：网络流量默认全部直接连接，无需代理节点，适用于未导入节点或无需代理时的安全直连环境。
        </div>

        <div v-else style="margin-top: 0.5rem">
          <div
            v-if="enabledNodes.length > 0"
            class="input-group"
            style="margin-bottom: 0"
          >
            <div
              class="flex items-center justify-between"
              style="margin-bottom: 0.35rem"
            >
              <label style="font-size: 0.85rem; margin-bottom: 0"
                >指定出口代理节点</label
              >
              <input
                v-if="enabledNodes.length > 6"
                v-model="nodeSearchKeyword"
                type="text"
                class="input-control"
                style="padding: 0.2rem 0.5rem; font-size: 0.75rem; width: 160px"
                placeholder="🔍 快速过滤节点..."
              />
            </div>

            <select
              v-model="form.route.default_outbound"
              class="input-control"
              style="width: 100%"
            >
              <option value="AUTO-Test">⚡ 自动测速优选 (AUTO-Test)</option>
              <option value="direct">
                🟢 默认直连 (direct - 流量直接连接)
              </option>
              <option value="proxy">🎯 全部节点选择组 (proxy 策略组)</option>
              <optgroup
                v-if="filteredNodes.length > 0"
                label="已同步的可用节点列表"
              >
                <option
                  v-for="node in filteredNodes"
                  :key="node.id"
                  :value="node.tag"
                >
                  📍 {{ node.tag }} [{{
                    (node.node_type || "").toUpperCase()
                  }}]{{ formatLatency(node) }}
                </option>
              </optgroup>
              <optgroup v-else-if="nodeSearchKeyword.trim()" label="搜索结果">
                <option disabled value="">
                  未找到匹配 "{{ nodeSearchKeyword }}" 的节点
                </option>
              </optgroup>
            </select>
          </div>

          <div
            v-else
            style="
              padding: 0.85rem 1rem;
              border-radius: 8px;
              background: rgba(245, 158, 11, 0.08);
              border: 1px solid rgba(245, 158, 11, 0.25);
              font-size: 0.85rem;
            "
          >
            <div
              class="flex items-center gap-2"
              style="color: var(--warning); font-weight: 500"
            >
              <span>⚠️ 节点池暂无可用的代理节点</span>
            </div>
            <p
              style="
                margin: 0.35rem 0 0.75rem 0;
                color: var(--text-muted);
                font-size: 0.8rem;
                line-height: 1.4;
              "
            >
              未检测到已启用的订阅节点或自定义节点。您可以点击下方按钮一键同步已有订阅，或前往添加新的订阅源。
            </p>
            <div class="flex gap-2 items-center flex-wrap">
              <button
                type="button"
                class="btn btn-primary"
                style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
                :disabled="isSyncingSubs"
                @click="syncSubscriptions"
              >
                {{ isSyncingSubs ? "正在同步订阅..." : "🔄 一键同步所有订阅" }}
              </button>
              <a
                href="#subscriptions"
                class="btn btn-secondary"
                style="
                  padding: 0.35rem 0.75rem;
                  font-size: 0.8rem;
                  text-decoration: none;
                "
              >
                ➕ 前往订阅管理
              </a>
              <a
                href="#nodes"
                class="btn btn-secondary"
                style="
                  padding: 0.35rem 0.75rem;
                  font-size: 0.8rem;
                  text-decoration: none;
                "
              >
                ✏️ 自定义节点
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: DNS Settings -->
    <div class="panel">
      <div class="panel-title">
        <div class="flex items-center gap-2">
          <span>🌐 域名解析 (DNS)</span>
          <span
            style="
              font-size: 0.85rem;
              font-weight: normal;
              color: var(--text-muted);
            "
          >
            配置国内解析与国外防污染加密 DNS
          </span>
        </div>
      </div>

      <div class="option-grid">
        <div
          class="option-card"
          :class="{ active: form.dns.mode === 'preset_domestic_foreign' }"
          @click="selectDnsPreset('preset_domestic_foreign')"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🚀</span>
              <span class="option-title">阿里 + Cloudflare DoH</span>
            </div>
            <span class="badge badge-success">推荐</span>
          </div>
          <p class="option-desc">
            国内使用 223.5.5.5，国外走 Cloudflare DoH 加密防污染解析。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.dns.mode === 'fast_public' }"
          @click="selectDnsPreset('fast_public')"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">⚡</span>
              <span class="option-title">腾讯 + Google DoH</span>
            </div>
          </div>
          <p class="option-desc">
            国内使用 119.29.29.29，国外走 Google 8.8.8.8 加密解析。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.dns.mode === 'custom' }"
          @click="selectDnsPreset('custom')"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">✍️</span>
              <span class="option-title">自定义 DNS</span>
            </div>
          </div>
          <p class="option-desc">
            手动指定自定义的国内主 DNS 与国外防污染 DNS 地址。
          </p>
        </div>
      </div>

      <div
        v-if="form.dns.mode === 'custom'"
        class="grid-2"
        style="margin-top: 1.25rem"
      >
        <div class="input-group" style="margin-bottom: 0">
          <label>国内 DNS 服务器</label>
          <input
            v-model="form.dns.domestic_dns"
            type="text"
            class="input-control"
            placeholder="例如: 223.5.5.5"
          />
        </div>
        <div class="input-group" style="margin-bottom: 0">
          <label>国外防污染 DNS (DoH / IP)</label>
          <input
            v-model="form.dns.foreign_dns"
            type="text"
            class="input-control"
            placeholder="例如: https://1.1.1.1/dns-query"
          />
        </div>
      </div>
    </div>

    <!-- Section 3: Inbound Settings -->
    <div class="panel">
      <div class="panel-title">
        <div class="flex items-center gap-2">
          <span>🔌 代理入站方式</span>
          <span
            style="
              font-size: 0.85rem;
              font-weight: normal;
              color: var(--text-muted);
            "
          >
            客户端或系统接入本地代理的方式
          </span>
        </div>
      </div>

      <div
        class="option-grid"
        style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))"
      >
        <div
          class="option-card"
          :class="{ active: form.inbound.inbound_type === 'tun' }"
          @click="form.inbound.inbound_type = 'tun'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🛡️</span>
              <span class="option-title">TUN 虚拟网卡 (整机透明代理)</span>
            </div>
            <span class="badge badge-success">推荐</span>
          </div>
          <p class="option-desc">
            创建虚拟网卡接管所有系统网络流量（需要管理员 / Root 权限）。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.inbound.inbound_type === 'mixed' }"
          @click="form.inbound.inbound_type = 'mixed'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🔌</span>
              <span class="option-title">混合端口 (Mixed HTTP + SOCKS5)</span>
            </div>
            <span class="badge badge-info">免提权</span>
          </div>
          <p class="option-desc">
            在本地端口监听，只需在系统或浏览器配置代理端口即可使用。
          </p>
        </div>
      </div>

      <div
        v-if="form.inbound.inbound_type === 'tun'"
        class="inbound-config-row"
        style="flex-direction: column; gap: 0.75rem"
      >
        <div class="input-group" style="margin-bottom: 0; min-width: 240px">
          <label>TUN 堆栈类型</label>
          <select v-model="form.inbound.tun_stack" class="input-control">
            <option value="system">System (原生内核栈，推荐)</option>
            <option value="gvisor">gVisor (用户态沙盒)</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        <div
          style="
            font-size: 0.8rem;
            color: var(--text-muted);
            line-height: 1.4;
            padding: 0.5rem 0.75rem;
            background: rgba(99, 102, 241, 0.05);
            border-radius: 6px;
            border: 1px solid rgba(99, 102, 241, 0.15);
          "
        >
          💡 <strong>权限提示</strong>：Linux 与 macOS 下创建 TUN
          网卡需要系统管理员 (Root)
          权限。启动服务或应用配置时，系统将直接在弹窗中提示输入 Sudo
          密码进行即时授权运行（Windows 系统无需输入密码）。
        </div>
      </div>

      <div
        v-else
        class="inbound-config-row"
      >
        <div class="input-group" style="margin-bottom: 0; min-width: 160px">
          <label>混合监听端口</label>
          <input
            v-model.number="form.inbound.mixed_port"
            type="number"
            class="input-control"
            placeholder="2080"
          />
        </div>

        <div
          class="input-group"
          style="margin-bottom: 0; align-self: flex-end; padding-bottom: 0.5rem"
        >
          <label class="switch-item" style="cursor: pointer">
            <input v-model="form.inbound.allow_lan" type="checkbox" />
            <span>允许局域网设备连接 (绑定 0.0.0.0)</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Preview Modal matching global modal standard -->
    <div class="modal" :class="{ active: showPreviewModal }">
      <div
        class="modal-card"
        style="
          max-width: 780px;
          width: 92%;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
        "
      >
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span>📜 sing-box 配置预览</span>
            <span class="badge badge-secondary" style="font-size: 0.75rem"
              >基于当前小白设置实时生成</span
            >
          </div>
          <button
            class="close-btn"
            style="
              background: none;
              border: none;
              color: var(--text-muted);
              cursor: pointer;
            "
            @click="showPreviewModal = false"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style="flex: 1; min-height: 0; padding: 0.75rem 0">
          <pre
            class="log-console"
            style="
              height: 100%;
              max-height: 55vh;
              overflow-y: auto;
              font-size: 0.85rem;
              margin: 0;
              border-radius: 6px;
            "
            >{{ JSON.stringify(generatedPreview, null, 2) }}</pre>
        </div>

        <div
          class="modal-footer"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
        >
          <div class="flex gap-2">
            <button class="btn btn-secondary" @click="copyPreview">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                style="margin-right: 2px"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                />
              </svg>
              复制 JSON
            </button>
            <button class="btn btn-secondary" @click="downloadPreview">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                style="margin-right: 2px"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              导出为文件
            </button>
          </div>
          <button class="btn btn-secondary" @click="showPreviewModal = false">
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import {
  API_BASE,
  token,
  showToast,
  kernelInfo,
  serviceStatus,
  fetchServiceStatus,
  promptDialog,
  sessionSudoPassword,
  setSessionSudoPassword,
  promptSudoPassword,
  systemModeInfo,
} from "../store.js";

const saving = ref(false);
const showPreviewModal = ref(false);
const generatedPreview = ref({});
const nodesList = ref([]);
const loadingNodes = ref(false);
const isSyncingSubs = ref(false);
const nodeSearchKeyword = ref("");

const enabledNodes = computed(() => {
  const list = Array.isArray(nodesList.value) ? nodesList.value : [];
  return list.filter((n) => n && n.enabled);
});

const filteredNodes = computed(() => {
  if (!nodeSearchKeyword.value.trim()) {
    return enabledNodes.value;
  }
  const kw = nodeSearchKeyword.value.trim().toLowerCase();
  return enabledNodes.value.filter(
    (n) =>
      (n.tag || "").toLowerCase().includes(kw) ||
      (n.node_type || "").toLowerCase().includes(kw) ||
      (n.server || "").toLowerCase().includes(kw),
  );
});

const formatLatency = (node) => {
  const lat = node.last_web_latency || node.last_tcp_latency;
  if (lat && lat > 0) {
    return ` (${lat}ms)`;
  }
  return "";
};

const isDirect = computed(() => form.route.default_outbound === "direct");
const isAutoTest = computed(
  () =>
    form.route.default_outbound === "AUTO-Test" ||
    !form.route.default_outbound,
);

const setOutboundMode = (mode) => {
  if (mode === "direct") {
    form.route.default_outbound = "direct";
  } else if (mode === "auto") {
    form.route.default_outbound = "AUTO-Test";
  } else {
    if (
      form.route.default_outbound === "AUTO-Test" ||
      form.route.default_outbound === "direct"
    ) {
      form.route.default_outbound =
        enabledNodes.value.length > 0 ? enabledNodes.value[0].tag : "proxy";
    }
  }
};

const form = reactive({
  dns: {
    mode: "preset_domestic_foreign",
    domestic_dns: "223.5.5.5",
    foreign_dns: "https://1.1.1.1/dns-query",
  },
  inbound: {
    inbound_type: "tun",
    mixed_port: 2080,
    allow_lan: false,
    tun_stack: "system",
    tun_auto_route: true,
  },
  route: {
    mode: "smart",
    block_ads: true,
    bypass_lan: true,
    default_outbound: "AUTO-Test",
  },
});

const selectDnsPreset = (preset) => {
  form.dns.mode = preset;
  if (preset === "preset_domestic_foreign") {
    form.dns.domestic_dns = "223.5.5.5";
    form.dns.foreign_dns = "https://1.1.1.1/dns-query";
  } else if (preset === "fast_public") {
    form.dns.domestic_dns = "119.29.29.29";
    form.dns.foreign_dns = "https://8.8.8.8/dns-query";
  }
};

const loadNodes = async () => {
  loadingNodes.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/nodes?limit=100000`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      nodesList.value = Array.isArray(data) ? data : data.nodes || [];
    }
  } catch (e) {
    console.error("加载节点列表失败", e);
  } finally {
    loadingNodes.value = false;
  }
};

const syncSubscriptions = async () => {
  isSyncingSubs.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/subscriptions/fetch-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      showToast("所有订阅源节点已成功同步更新！");
      await loadNodes();
    } else {
      showToast("订阅同步请求失败", "danger");
    }
  } catch (e) {
    showToast("同步订阅网络请求出错", "danger");
  } finally {
    isSyncingSubs.value = false;
  }
};

const loadSimpleConfig = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/simple-config`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.config) {
        Object.assign(form.dns, data.config.dns);
        Object.assign(form.inbound, data.config.inbound);
        Object.assign(form.route, data.config.route);
        if (!form.route.default_outbound) {
          form.route.default_outbound = "AUTO-Test";
        }
      }
      generatedPreview.value = data.generated || {};
    }
  } catch (e) {
    showToast("载入极简配置失败", "danger");
  }
};

const saveConfig = async (apply = false, customSudoPass = null) => {
  let sudoPass =
    typeof customSudoPass === "string"
      ? customSudoPass.trim()
      : sessionSudoPassword.value || null;

  if (apply) {
    if (
      serviceStatus.value.conflicting_processes &&
      serviceStatus.value.conflicting_processes.length > 0
    ) {
      showToast(
        `检测到系统中已有外部 sing-box 进程 (PID: ${serviceStatus.value.conflicting_processes.map((p) => p.pid).join(", ")})，请先停止外部进程后再应用启动`,
        "danger",
      );
      return;
    }
    if (!kernelInfo.value.is_installed) {
      showToast(
        "sing-box 内核尚未安装，无法直接启动服务。请先前往仪表盘下载安装内核。",
        "danger",
      );
      return;
    }

    // Proactively check if TUN mode is enabled on Linux/macOS when not root and no sudo pass cached
    const isUnix =
      systemModeInfo.value.is_linux ||
      systemModeInfo.value.os === "linux" ||
      systemModeInfo.value.os === "macos" ||
      systemModeInfo.value.os === "darwin";
    const isRoot = systemModeInfo.value.is_root;
    const hasSaved =
      !!sessionSudoPassword.value || !!systemModeInfo.value?.has_saved_sudo;
    if (
      form.inbound.inbound_type === "tun" &&
      isUnix &&
      !isRoot &&
      !hasSaved &&
      !sudoPass
    ) {
      const inputPass = await promptSudoPassword(
        "🛡️ 开启 TUN 虚拟网卡需要系统管理员 (root) 权限以接管系统流量。\n\n请输入系统的 Sudo / 管理员密码进行提权授权（保存后将免去重复输入）：",
      );
      if (inputPass === null) {
        showToast("已取消管理员提权授权，未应用配置", "warning");
        return;
      }
      sudoPass = inputPass;
      setSessionSudoPassword(inputPass);
    }
  }

  saving.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/simple-config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        config: form,
        apply: !!apply,
        sudo_pass: sudoPass,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const data = await res.json();
      generatedPreview.value = data.generated || {};
      showToast(data.message || "配置已保存！");
      if (sudoPass) {
        setSessionSudoPassword(sudoPass);
      }
      if (apply) {
        await fetchServiceStatus();
      }
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

      if (apply && isPermissionErr && !isWindows) {
        setSessionSudoPassword("");
        if (systemModeInfo.value) {
          systemModeInfo.value.has_saved_sudo = false;
        }
        const isWrongPass =
          err.includes("密码不正确") ||
          errLower.includes("incorrect password") ||
          errLower.includes("authentication failure");
        const promptMsg = isWrongPass
          ? "❌ 输入的 Sudo 密码不正确或已失效，请重新输入系统管理员 (root) 密码（保存后将免去重复输入）："
          : "🛡️ 应用并启动 TUN 模式需要系统管理员 (root) 权限。\n\n请输入系统的 Sudo / 管理员密码以继续（保存后将免去重复输入）：";

        const pass = await promptDialog(promptMsg, "", {
          title: "需要管理员权限",
          confirmText: "授权并应用",
          inputType: "password",
          inputPlaceholder: "输入系统 Sudo 密码",
        });
        if (pass !== null && pass.trim()) {
          setSessionSudoPassword(pass.trim());
          await saveConfig(true, pass.trim());
          return;
        } else {
          showToast("已取消管理员提权授权", "warning");
          return;
        }
      }
      showToast(`保存失败: ${err}`, "danger");
    }
  } catch (e) {
    showToast(`保存配置请求出错: ${e.message || e}`, "danger");
  } finally {
    saving.value = false;
  }
};

const copyPreview = () => {
  const jsonStr = JSON.stringify(generatedPreview.value, null, 2);
  navigator.clipboard.writeText(jsonStr);
  showToast("配置内容已复制到剪贴板");
};

const downloadPreview = () => {
  const jsonStr = JSON.stringify(generatedPreview.value, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sing-box-simple-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("配置已下载为 JSON 文件");
};

onMounted(() => {
  loadSimpleConfig();
  loadNodes();
});
</script>

<style scoped>
.option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.option-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.option-card:hover {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.04);
  transform: translateY(-2px);
}

.option-card.active {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.08);
  box-shadow: 0 0 0 1px var(--primary);
}

.option-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.option-icon {
  font-size: 1.2rem;
}

.option-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-main);
}

.option-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.45;
  margin: 0;
}

.switches-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.switch-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-main);
  cursor: pointer;
}

.outbound-box {
  margin-top: 1.25rem;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
}

.inbound-config-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}
</style>
