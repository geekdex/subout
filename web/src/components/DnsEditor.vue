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
    <div class="card form-section-card el-card">
      <div class="card-header" style="margin-bottom: 1rem; font-weight: 600">
        <span>🔧 基本参数</span>
      </div>
      <div class="grid-2">
        <div class="input-group">
          <label>
            域名解析策略 (Strategy)
            <span
              title="在纯 IPv4（如办公室）或代理节点为 IPv4 环境下强烈建议设为 prefer_ipv4，避免 IPv6 超时；在双栈网络下也能防止 IPv6 泄露"
              style="margin-left: 4px; cursor: help; color: var(--text-muted)"
              >ℹ️</span
            >
          </label>
          <select
            v-model="configData.dns.strategy"
            class="input-control w-full"
          >
            <option value="prefer_ipv4">优先 IPv4 (prefer_ipv4 - 推荐)</option>
            <option value="prefer_ipv6">优先 IPv6 (prefer_ipv6)</option>
            <option value="ipv4_only">仅 IPv4 (ipv4_only)</option>
            <option value="ipv6_only">仅 IPv6 (ipv6_only)</option>
          </select>
        </div>
        <div class="input-group">
          <label>
            默认 DNS 服务 Tag (Final)
            <span
              title="未匹配任何 DNS 规则时的默认 DNS 服务器"
              style="margin-left: 4px; cursor: help; color: var(--text-muted)"
              >⚠️</span
            >
          </label>
          <select v-model="configData.dns.final" class="input-control w-full">
            <option value="">-- 选择 DNS 服务器 --</option>
            <option
              v-if="
                configData.dns.final &&
                !dnsServerTags.includes(configData.dns.final)
              "
              :value="configData.dns.final"
            >
              {{ configData.dns.final }} (当前值)
            </option>
            <option
              v-for="srv in configData.dns.servers"
              :key="srv.tag"
              :value="srv.tag"
            >
              {{ srv.tag }}
            </option>
          </select>
        </div>
      </div>
      <div class="grid-2" style="margin-top: 0.75rem">
        <div class="input-group">
          <label>
            默认 ECS 客户端子网 (client_subnet)
            <span
              title="指定 EDNS Client Subnet，用于 DNS 就近解析。例如: 223.5.5.0/24"
              style="margin-left: 4px; cursor: help; color: var(--text-muted)"
              >⚠️</span
            >
          </label>
          <input
            v-model="configData.dns.client_subnet"
            class="input-control el-input"
            placeholder="例如: 223.5.5.0/24"
          />
        </div>
      </div>
    </div>

    <!-- 缓存与映射 -->
    <div class="card form-section-card el-card" style="margin-top: 1rem">
      <div class="card-header" style="margin-bottom: 1rem; font-weight: 600">
        <span>💾 缓存与映射</span>
      </div>
      <div class="dns-toggle-grid">
        <div class="toggle-item">
          <label class="switch">
            <input v-model="configData.dns.independent_cache" type="checkbox" />
            <span class="slider"></span>
          </label>
          <span class="toggle-label">独立缓存 (independent_cache)</span>
          <span
            title="启用后 DNS 缓存与系统缓存独立"
            style="cursor: help; color: var(--text-muted); font-size: 0.85rem"
            >⚠️</span
          >
        </div>
        <div class="toggle-item">
          <label class="switch">
            <input v-model="configData.dns.disable_cache" type="checkbox" />
            <span class="slider"></span>
          </label>
          <span class="toggle-label">禁用缓存 (disable_cache)</span>
        </div>
        <div class="toggle-item">
          <label class="switch">
            <input v-model="configData.dns.disable_expire" type="checkbox" />
            <span class="slider"></span>
          </label>
          <span class="toggle-label">禁用过期 (disable_expire)</span>
        </div>
        <div class="toggle-item">
          <label class="switch">
            <input v-model="configData.dns.reverse_mapping" type="checkbox" />
            <span class="slider"></span>
          </label>
          <span class="toggle-label">反向映射 (reverse_mapping)</span>
          <span
            title="启用后将 IP 反向解析为域名"
            style="cursor: help; color: var(--text-muted); font-size: 0.85rem"
            >⚠️</span
          >
        </div>
      </div>
      <hr
        style="
          margin: 0.75rem 0;
          border: none;
          border-top: 1px solid var(--border-color);
        "
      />
      <div
        style="
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        "
      >
        <label class="switch">
          <input v-model="configData.dns.fakeip.enabled" type="checkbox" />
          <span class="slider"></span>
        </label>
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
        <span
          title="FakeIP 为 DNS 请求返回虚拟 IP，减少 DNS 泄漏"
          style="cursor: help; color: var(--text-muted); font-size: 0.85rem"
          >⚠️</span
        >
      </div>
      <Transition name="el-zoom-in-top">
        <div
          v-if="configData.dns.fakeip.enabled"
          class="grid-2"
          style="margin-top: 0.5rem"
        >
          <div class="input-group">
            <label>IPv4 CIDR 地址段</label>
            <input
              v-model="configData.dns.fakeip.inet4_range"
              class="input-control el-input"
              placeholder="198.18.0.0/15"
            />
          </div>
          <div class="input-group">
            <label>IPv6 CIDR 地址段</label>
            <input
              v-model="configData.dns.fakeip.inet6_range"
              class="input-control el-input"
              placeholder="fc00::/18"
            />
          </div>
        </div>
      </Transition>
    </div>

    <!-- DNS 服务器列表 — 可折叠 + 拖拽排序 -->
    <div
      class="section-collapse el-collapse"
      style="margin-bottom: 1.25rem; margin-top: 1rem"
    >
      <div class="el-collapse-item">
        <div
          class="el-collapse-item__header"
          :class="{ 'is-active': openSections.includes('servers') }"
          style="
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
          @click="toggleSection('servers')"
        >
          <span style="display: flex; align-items: center; gap: 0.5rem">
            <svg
              class="collapse-arrow-icon"
              :class="{ rotated: openSections.includes('servers') }"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span>📡 DNS 服务器列表 (servers)</span>
          </span>
          <span class="collapse-header-actions" @click.stop>
            <span class="badge badge-info el-tag">{{
              configData.dns.servers?.length || 0
            }}</span>
            <button class="btn btn-sm btn-secondary" @click.stop="addDnsServer">
              + 添加
            </button>
          </span>
        </div>

        <Transition name="collapse">
          <div
            v-show="openSections.includes('servers')"
            class="el-collapse-item__wrap"
          >
            <div class="el-collapse-item__content">
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
                        <span class="rule-card-title">{{
                          srv.tag || "未命名"
                        }}</span>
                        <div class="rule-card-badges">
                          <span
                            class="badge el-tag"
                            :class="getServerTypeTag(srv.type)"
                            >{{ srv.type }}</span
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
                          <span
                            v-else
                            style="color: #f59e0b; font-style: italic"
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
                      <button
                        class="btn btn-sm btn-secondary"
                        @click="editServer(srv, idx)"
                      >
                        编辑
                      </button>
                      <button
                        class="btn btn-sm btn-danger"
                        @click="configData.dns.servers.splice(idx, 1)"
                      >
                        删除
                      </button>
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
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- DNS 分流规则列表 — 可折叠 + 拖拽排序 -->
    <div class="section-collapse el-collapse">
      <div class="el-collapse-item">
        <div
          class="el-collapse-item__header"
          :class="{ 'is-active': openSections.includes('rules') }"
          style="
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
          @click="toggleSection('rules')"
        >
          <span style="display: flex; align-items: center; gap: 0.5rem">
            <svg
              class="collapse-arrow-icon"
              :class="{ rotated: openSections.includes('rules') }"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span>📋 DNS 分流规则列表 (rules)</span>
          </span>
          <span class="collapse-header-actions" @click.stop>
            <span class="badge badge-info el-tag">{{
              configData.dns.rules?.length || 0
            }}</span>
            <button
              v-if="configData.dns.rules?.length > 1"
              class="btn btn-sm btn-secondary"
              style="margin-right: 8px"
              title="合并具有相同 DNS 服务器的规则匹配条件"
              @click.stop="mergeDnsRules"
            >
              合并配置
            </button>
            <button class="btn btn-sm btn-secondary" @click.stop="addDnsRule">
              + 添加
            </button>
          </span>
        </div>

        <Transition name="collapse">
          <div
            v-show="openSections.includes('rules')"
            class="el-collapse-item__wrap"
          >
            <div class="el-collapse-item__content">
              <!-- 搜索过滤 -->
              <div
                v-if="configData.dns.rules?.length > 0"
                class="search-filter-bar"
                style="margin-bottom: 1rem"
              >
                <input
                  v-model="searchQuery"
                  class="input-control el-input"
                  placeholder="搜索规则条件..."
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
                          <span
                            v-if="rule.invert"
                            class="badge badge-warning el-tag"
                            >反向</span
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
                      <button
                        class="btn btn-sm btn-secondary"
                        title="同步此规则至路由规则"
                        @click="$emit('syncRule', rule, 'dns', idx)"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          style="margin-right: 4px"
                        >
                          <path d="M23 4v6h-6M1 20v-6h6" />
                          <path
                            d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                          />
                        </svg>
                        同步
                      </button>
                      <button
                        class="btn btn-sm btn-secondary"
                        @click="editDnsRule(rule, idx)"
                      >
                        编辑
                      </button>
                      <button
                        class="btn btn-sm btn-danger"
                        @click="configData.dns.rules.splice(idx, 1)"
                      >
                        删除
                      </button>
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
                      <span
                        v-if="rule.invert"
                        class="badge badge-warning el-tag"
                        >反向</span
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
                    <button
                      class="btn btn-sm btn-secondary"
                      :disabled="idx === 0"
                      title="上移"
                      @click="moveItemByFilter(configData.dns.rules, rule, -1)"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      class="btn btn-sm btn-secondary"
                      :disabled="idx === filteredRules.length - 1"
                      title="下移"
                      @click="moveItemByFilter(configData.dns.rules, rule, 1)"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <path d="M12 5v14M5 12l7 7 7-7" />
                      </svg>
                    </button>
                    <button
                      class="btn btn-sm btn-secondary"
                      title="同步此规则至路由规则"
                      @click="
                        $emit('syncRule', rule, 'dns', getRealIndex(rule))
                      "
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        style="margin-right: 4px"
                      >
                        <path d="M23 4v6h-6M1 20v-6h6" />
                        <path
                          d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                        />
                      </svg>
                      同步
                    </button>
                    <button
                      class="btn btn-sm btn-secondary"
                      @click="editDnsRule(rule, getRealIndex(rule))"
                    >
                      编辑
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      @click="
                        configData.dns.rules.splice(getRealIndex(rule), 1)
                      "
                    >
                      删除
                    </button>
                  </div>
                </div>
              </TransitionGroup>

              <div
                v-if="
                  filteredRules.length === 0 && configData.dns.rules?.length > 0
                "
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
                    searchQuery &&
                    filteredRules.length < configData.dns.rules.length
                  "
                >
                  (筛选显示 {{ filteredRules.length }} 条)
                </template>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup>
/* eslint-disable vue/no-mutating-props */
import { computed, ref } from "vue";
import draggable from "vuedraggable";
import RuleCriteriaTags from "./RuleCriteriaTags.vue";

const props = defineProps({
  configData: { type: Object, required: true },
  allOutboundTags: { type: Array, default: () => [] },
  duplicateCheckFn: { type: Function, default: null },
  editItem: { type: Function, default: null },
});

defineEmits(["syncRule"]);

const searchQuery = ref("");
const openSections = ref(["servers", "rules"]);

const toggleSection = (name) => {
  const idx = openSections.value.indexOf(name);
  if (idx > -1) {
    openSections.value.splice(idx, 1);
  } else {
    openSections.value.push(name);
  }
};

const dnsServerTags = computed(() => {
  return (props.configData.dns.servers || []).map((s) => s.tag).filter(Boolean);
});

const getServerTypeTag = (type) => {
  switch (type) {
    case "https":
      return "badge-success";
    case "tls":
      return "badge-warning";
    case "udp":
    case "tcp":
      return "badge-info";
    default:
      return "badge-info";
  }
};

const serverKey = (item) => item.tag || Math.random();
const ruleKey = (item) =>
  item.server +
  "_" +
  (item.geosite?.join(",") || "") +
  "_" +
  (item.domain_suffix?.join(",") || "") +
  "_" +
  (item.ip_cidr?.join(",") || "");

const addDnsServer = () => {
  if (!props.configData.dns.servers) props.configData.dns.servers = [];
  const newItem = {
    tag: "",
    type: "https",
    server: "",
    server_port: 443,
    detour: "",
  };
  if (props.editItem) {
    props.editItem(newItem, "dns_server", (parsed) => {
      props.configData.dns.servers.push(parsed);
    });
  } else {
    props.configData.dns.servers.push(newItem);
  }
};

const editServer = (srv, idx) => {
  if (props.editItem) {
    props.editItem(
      srv,
      "dns_server",
      (parsed) => {
        props.configData.dns.servers[idx] = parsed;
      },
      idx,
    );
  }
};

const addDnsRule = () => {
  if (!props.configData.dns.rules) props.configData.dns.rules = [];
  const newItem = { server: "" };
  if (props.editItem) {
    props.editItem(newItem, "dns_rule", (parsed) => {
      props.configData.dns.rules.push(parsed);
    });
  } else {
    props.configData.dns.rules.push(newItem);
  }
};

const editDnsRule = (rule, idx) => {
  if (props.editItem) {
    props.editItem(
      rule,
      "dns_rule",
      (parsed) => {
        props.configData.dns.rules[idx] = parsed;
      },
      idx,
    );
  }
};

const mergeDnsRules = () => {
  const rules = props.configData.dns.rules || [];
  if (rules.length <= 1) return;

  const mergedList = [];
  const groups = {};

  rules.forEach((rule) => {
    if (rule.type === "logical") {
      mergedList.push(JSON.parse(JSON.stringify(rule)));
      return;
    }

    const server = rule.server || "";
    const invert = !!rule.invert;
    const key = `${server}_${invert}`;

    if (groups[key] !== undefined) {
      const targetRule = mergedList[groups[key]];
      const arrayFields = [
        "geosite",
        "domain_suffix",
        "domain",
        "domain_keyword",
        "domain_regex",
        "geoip",
        "ip_cidr",
        "port",
        "source_port",
        "inbound",
        "protocol",
        "rule_set",
        "clash_mode",
        "process_name",
        "process_path",
        "process_path_regex",
        "package_name",
        "user",
      ];
      arrayFields.forEach((field) => {
        const targetVals = Array.isArray(targetRule[field])
          ? targetRule[field]
          : targetRule[field]
            ? [targetRule[field]]
            : [];
        const sourceVals = Array.isArray(rule[field])
          ? rule[field]
          : rule[field]
            ? [rule[field]]
            : [];
        if (sourceVals.length > 0) {
          const combined = [...new Set([...targetVals, ...sourceVals])].filter(
            Boolean,
          );
          if (combined.length > 0) {
            targetRule[field] = combined;
          }
        }
      });
      if (rule.client_subnet && !targetRule.client_subnet) {
        targetRule.client_subnet = rule.client_subnet;
      }
    } else {
      const copy = JSON.parse(JSON.stringify(rule));
      mergedList.push(copy);
      groups[key] = mergedList.length - 1;
    }
  });

  props.configData.dns.rules = mergedList;
};

const filteredRules = computed(() => {
  const rules = props.configData.dns.rules || [];
  if (!searchQuery.value.trim()) return rules;
  const q = searchQuery.value.trim().toLowerCase();
  return rules.filter((rule) => {
    if (rule.server && rule.server.toLowerCase().includes(q)) return true;
    if (rule.geosite && rule.geosite.some((s) => s.toLowerCase().includes(q)))
      return true;
    if (
      rule.domain_suffix &&
      rule.domain_suffix.some((s) => s.toLowerCase().includes(q))
    )
      return true;
    if (rule.domain && rule.domain.some((s) => s.toLowerCase().includes(q)))
      return true;
    if (
      rule.domain_keyword &&
      rule.domain_keyword.some((s) => s.toLowerCase().includes(q))
    )
      return true;
    if (
      rule.domain_regex &&
      rule.domain_regex.some((s) => s.toLowerCase().includes(q))
    )
      return true;
    if (rule.geoip && rule.geoip.some((s) => s.toLowerCase().includes(q)))
      return true;
    if (rule.ip_cidr && rule.ip_cidr.some((s) => s.toLowerCase().includes(q)))
      return true;
    if (rule.rule_set && rule.rule_set.some((s) => s.toLowerCase().includes(q)))
      return true;
    if (rule.outbound && rule.outbound.some((s) => s.toLowerCase().includes(q)))
      return true;
    if (rule.clash_mode && rule.clash_mode.toLowerCase().includes(q))
      return true;
    if (
      rule.process_name &&
      rule.process_name.some((s) => s.toLowerCase().includes(q))
    )
      return true;
    if (
      rule.process_path &&
      rule.process_path.some((s) => s.toLowerCase().includes(q))
    )
      return true;
    if (
      rule.process_path_regex &&
      rule.process_path_regex.some((s) => s.toLowerCase().includes(q))
    )
      return true;
    if (
      rule.package_name &&
      rule.package_name.some((s) => s.toLowerCase().includes(q))
    )
      return true;
    if (rule.user && rule.user.some((s) => s.toLowerCase().includes(q)))
      return true;
    return false;
  });
});

const getRealIndex = (rule) => {
  return (props.configData.dns.rules || []).indexOf(rule);
};

const moveItemByFilter = (list, item, delta) => {
  const realIdx = list.indexOf(item);
  if (realIdx < 0) return;
  const newIdx = realIdx + delta;
  if (newIdx < 0 || newIdx >= list.length) return;
  const temp = list[realIdx];
  list[realIdx] = list[newIdx];
  list[newIdx] = temp;
};
</script>
