<template>
  <!-- eslint-disable vue/no-mutating-props -->
  <div>
    <!-- 统计概览条 -->
    <div class="stats-bar">
      <div class="stats-bar-item">
        <span class="stat-icon">📡</span>
        DNS 服务器:
        <span class="stat-num">{{ configData.dns.servers?.length || 0 }}</span>
      </div>
      <div class="stats-bar-item">
        <span class="stat-icon">📋</span>
        分流规则:
        <span class="stat-num">{{ configData.dns.rules?.length || 0 }}</span>
      </div>
      <div class="stats-bar-item">
        <span class="stat-icon">🔀</span>
        FakeIP:
        <span class="stat-num">{{
          configData.dns.fakeip?.enabled ? "已启用" : "已关闭"
        }}</span>
      </div>
      <div class="stats-bar-item">
        <span class="stat-icon">⚙️</span>
        策略:
        <span class="stat-num">{{ configData.dns.strategy || "未设置" }}</span>
      </div>
    </div>

    <!-- 基本参数 -->
    <el-card class="form-section-card" shadow="never">
      <template #header>
        <span>🔧 基本参数</span>
      </template>
      <div class="grid-2">
        <div class="input-group">
          <label>域名解析策略 (Strategy)</label>
          <el-select v-model="configData.dns.strategy" class="w-full">
            <el-option value="prefer_ipv4" label="优先 IPv4 (prefer_ipv4)" />
            <el-option value="prefer_ipv6" label="优先 IPv6 (prefer_ipv6)" />
            <el-option value="ipv4_only" label="仅 IPv4 (ipv4_only)" />
            <el-option value="ipv6_only" label="仅 IPv6 (ipv6_only)" />
          </el-select>
        </div>
        <div class="input-group">
          <label>
            默认 DNS 服务 Tag (Final)
            <el-tooltip
              content="未匹配任何 DNS 规则时的默认 DNS 服务器"
              placement="top"
            >
              <el-icon
                style="
                  margin-left: 4px;
                  cursor: help;
                  color: var(--text-muted);
                  vertical-align: middle;
                "
                ><WarningFilled
              /></el-icon>
            </el-tooltip>
          </label>
          <el-select
            v-model="configData.dns.final"
            class="w-full"
            placeholder="选择 DNS 服务器"
            clearable
          >
            <el-option
              v-if="
                configData.dns.final &&
                !dnsServerTags.includes(configData.dns.final)
              "
              :value="configData.dns.final"
              :label="configData.dns.final + ' (当前值)'"
            />
            <el-option
              v-for="srv in configData.dns.servers"
              :key="srv.tag"
              :value="srv.tag"
              :label="srv.tag"
            />
          </el-select>
        </div>
      </div>
      <div class="grid-2" style="margin-top: 0.75rem">
        <div class="input-group">
          <label>
            默认 ECS 客户端子网 (client_subnet)
            <el-tooltip
              content="指定 EDNS Client Subnet，用于 DNS 就近解析。例如: 223.5.5.0/24"
              placement="top"
            >
              <el-icon
                style="
                  margin-left: 4px;
                  cursor: help;
                  color: var(--text-muted);
                  vertical-align: middle;
                "
                ><WarningFilled
              /></el-icon>
            </el-tooltip>
          </label>
          <el-input
            v-model="configData.dns.client_subnet"
            placeholder="例如: 223.5.5.0/24"
            clearable
          />
        </div>
      </div>
    </el-card>

    <!-- 缓存与映射 -->
    <el-card class="form-section-card" shadow="never">
      <template #header><span>💾 缓存与映射</span></template>
      <div class="dns-toggle-grid">
        <div class="toggle-item">
          <el-switch v-model="configData.dns.independent_cache" size="small" />
          <span class="toggle-label">独立缓存 (independent_cache)</span>
          <el-tooltip content="启用后 DNS 缓存与系统缓存独立" placement="top">
            <el-icon
              style="cursor: help; color: var(--text-muted); font-size: 0.85rem"
              ><WarningFilled
            /></el-icon>
          </el-tooltip>
        </div>
        <div class="toggle-item">
          <el-switch v-model="configData.dns.disable_cache" size="small" />
          <span class="toggle-label">禁用缓存 (disable_cache)</span>
        </div>
        <div class="toggle-item">
          <el-switch v-model="configData.dns.disable_expire" size="small" />
          <span class="toggle-label">禁用过期 (disable_expire)</span>
        </div>
        <div class="toggle-item">
          <el-switch v-model="configData.dns.reverse_mapping" size="small" />
          <span class="toggle-label">反向映射 (reverse_mapping)</span>
          <el-tooltip content="启用后将 IP 反向解析为域名" placement="top">
            <el-icon
              style="cursor: help; color: var(--text-muted); font-size: 0.85rem"
              ><WarningFilled
            /></el-icon>
          </el-tooltip>
        </div>
      </div>
      <el-divider style="margin: 0.75rem 0" />
      <div
        style="
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        "
      >
        <el-switch v-model="configData.dns.fakeip.enabled" size="small" />
        <span
          style="
            font-weight: 600;
            font-size: 0.9rem;
            color: var(--secondary);
            cursor: pointer;
          "
          @click="
            configData.dns.fakeip.enabled = !configData.dns.fakeip.enabled
          "
        >
          FakeIP 设置
        </span>
        <el-tooltip
          content="FakeIP 为 DNS 请求返回虚拟 IP，减少 DNS 泄漏"
          placement="top"
        >
          <el-icon
            style="cursor: help; color: var(--text-muted); font-size: 0.85rem"
            ><WarningFilled
          /></el-icon>
        </el-tooltip>
      </div>
      <Transition name="el-zoom-in-top">
        <div
          v-if="configData.dns.fakeip.enabled"
          class="grid-2"
          style="margin-top: 0.5rem"
        >
          <div class="input-group">
            <label>IPv4 CIDR 地址段</label>
            <el-input
              v-model="configData.dns.fakeip.inet4_range"
              placeholder="198.18.0.0/15"
            />
          </div>
          <div class="input-group">
            <label>IPv6 CIDR 地址段</label>
            <el-input
              v-model="configData.dns.fakeip.inet6_range"
              placeholder="fc00::/18"
            />
          </div>
        </div>
      </Transition>
    </el-card>

    <!-- DNS 服务器列表 — 可折叠 + 拖拽排序 -->
    <el-collapse
      v-model="openSections"
      class="section-collapse"
      style="margin-bottom: 1.25rem"
    >
      <el-collapse-item name="servers">
        <template #title>
          <span>📡 DNS 服务器列表 (servers)</span>
          <span class="collapse-header-actions" @click.stop>
            <el-tag size="small" type="info" effect="plain">{{
              configData.dns.servers?.length || 0
            }}</el-tag>
            <el-button size="small" @click.stop="addDnsServer"
              >+ 添加</el-button
            >
          </span>
        </template>

        <draggable
          v-model="configData.dns.servers"
          handle=".drag-handle"
          :animation="250"
          ghost-class="ghost-card"
          :item-key="serverKey"
          tag="div"
          class="dns-cards-grid"
        >
          <template #item="{ element: srv, index: idx }">
            <div class="rule-card">
              <div class="card-header-with-drag">
                <span class="drag-handle" title="拖拽排序">⠿</span>
                <div class="rule-card-header">
                  <span class="rule-card-title">{{ srv.tag || "未命名" }}</span>
                  <div class="rule-card-badges">
                    <el-tag
                      :type="getServerTypeTag(srv.type)"
                      size="small"
                      effect="dark"
                      >{{ srv.type }}</el-tag
                    >
                  </div>
                </div>
              </div>
              <div class="rule-card-body">
                <div class="rule-card-detail">
                  <span>地址:</span>
                  <template v-if="srv.type === 'fakeip'">
                    <span v-if="srv.inet4_range || srv.inet6_range">
                      <span v-if="srv.inet4_range" class="detail-value"
                        >IPv4: {{ srv.inet4_range }}</span
                      >
                      <span
                        v-if="srv.inet6_range"
                        class="detail-value"
                        style="margin-left: 8px"
                        >IPv6: {{ srv.inet6_range }}</span
                      >
                    </span>
                    <span v-else style="color: #f59e0b; font-style: italic"
                      >未配置 IP 段</span
                    >
                  </template>
                  <span
                    v-else-if="srv.type === 'local'"
                    style="font-style: italic; color: var(--text-muted)"
                    >系统本地 DNS</span
                  >
                  <span v-else class="detail-value">{{
                    srv.server || "-"
                  }}</span>
                </div>
                <div class="rule-card-detail">
                  <span>Detour:</span>
                  <span class="detail-value">{{
                    srv.detour || "默认 (跟随路由)"
                  }}</span>
                </div>
              </div>
              <div class="rule-card-actions">
                <el-button size="small" text @click="editServer(srv, idx)"
                  >编辑</el-button
                >
                <el-popconfirm
                  title="确定删除此 DNS 服务器？"
                  confirm-button-text="删除"
                  cancel-button-text="取消"
                  @confirm="configData.dns.servers.splice(idx, 1)"
                >
                  <template #reference
                    ><el-button size="small" text type="danger"
                      >删除</el-button
                    ></template
                  >
                </el-popconfirm>
              </div>
            </div>
          </template>
        </draggable>

        <div
          v-if="(configData.dns.servers || []).length === 0"
          class="rule-empty-state"
          style="margin-top: 1rem"
        >
          <div class="empty-title">暂无 DNS 服务器</div>
          <div class="empty-description">点击上方「添加」按钮创建</div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- DNS 分流规则列表 — 可折叠 + 拖拽排序 -->
    <el-collapse v-model="openSections" class="section-collapse">
      <el-collapse-item name="rules">
        <template #title>
          <span>📋 DNS 分流规则列表 (rules)</span>
          <span class="collapse-header-actions" @click.stop>
            <el-tag size="small" type="info" effect="plain">{{
              configData.dns.rules?.length || 0
            }}</el-tag>
            <el-button size="small" @click.stop="addDnsRule">+ 添加</el-button>
          </span>
        </template>

        <!-- 搜索过滤 -->
        <div v-if="configData.dns.rules?.length > 0" class="search-filter-bar">
          <el-input
            v-model="searchQuery"
            placeholder="搜索规则条件..."
            clearable
            size="small"
            :prefix-icon="Search"
            style="max-width: 300px"
          />
        </div>

        <!-- 拖拽排序模式（无搜索时） -->
        <draggable
          v-if="!searchQuery"
          v-model="configData.dns.rules"
          handle=".drag-handle"
          :animation="250"
          ghost-class="ghost-card"
          :item-key="ruleKey"
          tag="div"
          class="dns-cards-grid"
        >
          <template #item="{ element: rule, index: idx }">
            <div class="rule-card">
              <div class="card-header-with-drag">
                <span class="drag-handle" title="拖拽排序">⠿</span>
                <div class="rule-card-header">
                  <span class="rule-card-title"
                    >目标 Server:
                    <strong>{{ rule.server || "未指定" }}</strong></span
                  >
                  <div class="rule-card-badges">
                    <el-tag
                      v-if="rule.invert"
                      type="warning"
                      size="small"
                      effect="dark"
                      >反向</el-tag
                    >
                  </div>
                </div>
              </div>
              <div class="rule-card-body">
                <RuleCriteriaTags
                  :rule="rule"
                  type="dns"
                  :duplicate-check-fn="duplicateCheckFn"
                />
              </div>
              <div class="rule-card-actions">
                <el-tooltip content="同步此规则至路由规则" placement="top">
                  <el-button
                    size="small"
                    text
                    style="color: var(--primary)"
                    @click="$emit('syncRule', rule, 'dns', idx)"
                  >
                    <el-icon><Refresh /></el-icon> 同步
                  </el-button>
                </el-tooltip>
                <el-button size="small" text @click="editDnsRule(rule, idx)"
                  >编辑</el-button
                >
                <el-popconfirm
                  title="确定删除此规则？"
                  confirm-button-text="删除"
                  cancel-button-text="取消"
                  @confirm="configData.dns.rules.splice(idx, 1)"
                >
                  <template #reference
                    ><el-button size="small" text type="danger"
                      >删除</el-button
                    ></template
                  >
                </el-popconfirm>
              </div>
            </div>
          </template>
        </draggable>

        <!-- 搜索模式（不带拖拽，显示过滤结果） -->
        <TransitionGroup
          v-else
          name="card-list"
          tag="div"
          class="dns-cards-grid"
        >
          <div
            v-for="(rule, idx) in filteredRules"
            :key="'rule-' + idx"
            class="rule-card"
          >
            <div class="rule-card-header">
              <span class="rule-card-title"
                >目标 Server:
                <strong>{{ rule.server || "未指定" }}</strong></span
              >
              <div class="rule-card-badges">
                <el-tag
                  v-if="rule.invert"
                  type="warning"
                  size="small"
                  effect="dark"
                  >反向</el-tag
                >
              </div>
            </div>
            <div class="rule-card-body">
              <RuleCriteriaTags
                :rule="rule"
                type="dns"
                :duplicate-check-fn="duplicateCheckFn"
              />
            </div>
            <div class="rule-card-actions">
              <el-button
                size="small"
                text
                :disabled="idx === 0"
                title="上移"
                @click="moveItemByFilter(configData.dns.rules, rule, -1)"
              >
                <el-icon><ArrowUp /></el-icon>
              </el-button>
              <el-button
                size="small"
                text
                :disabled="idx === filteredRules.length - 1"
                title="下移"
                @click="moveItemByFilter(configData.dns.rules, rule, 1)"
              >
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <el-tooltip content="同步此规则至路由规则" placement="top">
                <el-button
                  size="small"
                  text
                  style="color: var(--primary)"
                  @click="$emit('syncRule', rule, 'dns', getRealIndex(rule))"
                >
                  <el-icon><Refresh /></el-icon> 同步
                </el-button>
              </el-tooltip>
              <el-button
                size="small"
                text
                @click="editDnsRule(rule, getRealIndex(rule))"
                >编辑</el-button
              >
              <el-popconfirm
                title="确定删除此规则？"
                confirm-button-text="删除"
                cancel-button-text="取消"
                @confirm="configData.dns.rules.splice(getRealIndex(rule), 1)"
              >
                <template #reference
                  ><el-button size="small" text type="danger"
                    >删除</el-button
                  ></template
                >
              </el-popconfirm>
            </div>
          </div>
        </TransitionGroup>

        <div
          v-if="filteredRules.length === 0 && configData.dns.rules?.length > 0"
          class="rule-empty-state"
          style="margin-top: 0.75rem"
        >
          <div class="empty-title">没有匹配的规则</div>
          <div class="empty-description">尝试修改搜索条件</div>
        </div>
        <div
          v-if="(configData.dns.rules || []).length === 0"
          class="rule-empty-state"
          style="margin-top: 0.5rem"
        >
          <div class="empty-title">暂无 DNS 规则</div>
          <div class="empty-description">点击上方「添加」按钮创建</div>
        </div>
        <div
          v-if="filteredRules.length > 0"
          style="
            margin-top: 0.65rem;
            font-size: 0.8rem;
            color: var(--text-muted);
          "
        >
          共 {{ configData.dns.rules.length }} 条规则
          <template
            v-if="
              searchQuery && filteredRules.length < configData.dns.rules.length
            "
          >
            (筛选显示 {{ filteredRules.length }} 条)
          </template>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup>
/* eslint-disable vue/no-mutating-props */
import { computed, ref } from "vue";
import draggable from "vuedraggable";
import RuleCriteriaTags from "./RuleCriteriaTags.vue";
import {
  Search,
  Refresh,
  ArrowUp,
  ArrowDown,
  WarningFilled,
} from "@element-plus/icons-vue";

const props = defineProps({
  configData: { type: Object, required: true },
  allOutboundTags: { type: Array, default: () => [] },
  duplicateCheckFn: { type: Function, default: null },
  editItem: { type: Function, default: null },
});

defineEmits(["syncRule"]);

const searchQuery = ref("");
const openSections = ref(["servers", "rules"]);

// WeakMap 提供稳定的拖拽 key，不污染数据模型
const itemKeyMap = new WeakMap();
let keyCounter = 0;
function stableKey(item) {
  if (!itemKeyMap.has(item)) itemKeyMap.set(item, ++keyCounter);
  return itemKeyMap.get(item);
}
const serverKey = (srv) => stableKey(srv);
const ruleKey = (rule) => stableKey(rule);

const dnsServerTags = computed(() => {
  return (props.configData.dns.servers || []).map((s) => s.tag);
});

const filteredRules = computed(() => {
  const rules = props.configData.dns.rules || [];
  if (!searchQuery.value) return rules;
  const q = searchQuery.value.toLowerCase();
  return rules.filter((rule) => {
    const searchable = [
      rule.server,
      rule.client_subnet,
      rule.type,
      rule.mode,
      rule.rule_set &&
        (Array.isArray(rule.rule_set)
          ? rule.rule_set.join(" ")
          : rule.rule_set),
      rule.geosite &&
        (Array.isArray(rule.geosite) ? rule.geosite.join(" ") : rule.geosite),
      rule.domain_suffix &&
        (Array.isArray(rule.domain_suffix)
          ? rule.domain_suffix.join(" ")
          : rule.domain_suffix),
      rule.domain &&
        (Array.isArray(rule.domain) ? rule.domain.join(" ") : rule.domain),
      rule.geoip &&
        (Array.isArray(rule.geoip) ? rule.geoip.join(" ") : rule.geoip),
      rule.ip_cidr &&
        (Array.isArray(rule.ip_cidr) ? rule.ip_cidr.join(" ") : rule.ip_cidr),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });
});

function getRealIndex(rule) {
  return (props.configData.dns.rules || []).indexOf(rule);
}

function moveItemByFilter(arr, item, dir) {
  const idx = arr.indexOf(item);
  if (idx === -1) return;
  const target = idx + dir;
  if (target >= 0 && target < arr.length) {
    const temp = arr[idx];
    arr[idx] = arr[target];
    arr[target] = temp;
  }
}

function getServerTypeTag(type) {
  switch (type) {
    case "fakeip":
      return "warning";
    case "local":
      return "info";
    case "https":
    case "tls":
    case "quic":
      return "success";
    case "udp":
    case "tcp":
      return "primary";
    default:
      return "default";
  }
}

function addDnsServer() {
  const newItem = {
    tag: "dns-" + ((props.configData.dns.servers?.length || 0) + 1),
    type: "https",
    server: "",
    detour: props.allOutboundTags.includes("proxy")
      ? "proxy"
      : props.allOutboundTags[0] || "",
  };
  if (props.editItem) {
    props.editItem(newItem, "dns_server", (parsed) => {
      if (!props.configData.dns.servers) props.configData.dns.servers = [];
      props.configData.dns.servers.push(parsed);
    });
  }
}

function editServer(srv, idx) {
  if (props.editItem)
    props.editItem(
      srv,
      "dns_server",
      (parsed) => {
        props.configData.dns.servers[idx] = parsed;
      },
      idx,
    );
}

function addDnsRule() {
  const newItem = { server: dnsServerTags.value[0] || "", domain_suffix: [] };
  if (props.editItem) {
    props.editItem(newItem, "dns_rule", (parsed) => {
      if (!props.configData.dns.rules) props.configData.dns.rules = [];
      props.configData.dns.rules.push(parsed);
    });
  }
}

function editDnsRule(rule, idx) {
  if (props.editItem)
    props.editItem(
      rule,
      "dns_rule",
      (parsed) => {
        props.configData.dns.rules[idx] = parsed;
      },
      idx,
    );
}
</script>
