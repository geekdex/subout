<template>
  <!-- eslint-disable vue/no-mutating-props -->
  <div>
    <!-- 统计概览条 -->
    <div class="stats-bar">
      <div class="stats-bar-item">
        <span class="stat-icon">📋</span>
        路由规则:
        <span class="stat-num">{{ configData.route.rules?.length || 0 }}</span>
      </div>
      <div class="stats-bar-item">
        <span class="stat-icon">📦</span>
        规则集:
        <span class="stat-num">{{
          configData.route.rule_set?.length || 0
        }}</span>
      </div>
      <div class="stats-bar-item">
        <span class="stat-icon">🏁</span>
        默认出站:
        <span class="stat-num">{{ configData.route.final || "未设置" }}</span>
      </div>
      <div class="stats-bar-item">
        <span class="stat-icon">🔄</span>
        自动探测:
        <span class="stat-num">{{
          configData.route.auto_detect_interface ? "已启用" : "已关闭"
        }}</span>
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
            默认出站 Tag (Final)
            <span
              title="所有分流规则都不匹配时的默认流量出站"
              style="margin-left: 4px; cursor: help; color: var(--text-muted)"
              >⚠️</span
            >
          </label>
          <select v-model="configData.route.final" class="input-control w-full">
            <option value="">-- 无 (不设置) --</option>
            <option
              v-if="
                configData.route.final &&
                !allOutboundTags.includes(configData.route.final)
              "
              :value="configData.route.final"
            >
              {{ configData.route.final }} (当前值)
            </option>
            <option v-for="tag in allOutboundTags" :key="tag" :value="tag">
              {{ tag }}
            </option>
          </select>
        </div>
        <div class="input-group">
          <label>
            默认 DNS 服务 Tag (default_domain_resolver)
            <span
              title="用于解析路由分流中域名的 DNS 服务器"
              style="margin-left: 4px; cursor: help; color: var(--text-muted)"
              >⚠️</span
            >
          </label>
          <select
            v-model="configData.route.default_domain_resolver"
            class="input-control w-full"
          >
            <option value="">-- 无 (未指定) --</option>
            <option
              v-if="
                configData.route.default_domain_resolver &&
                !dnsServerTags.includes(
                  configData.route.default_domain_resolver,
                )
              "
              :value="configData.route.default_domain_resolver"
            >
              {{ configData.route.default_domain_resolver }} (当前值)
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
      <div style="margin-top: 0.75rem">
        <div class="toggle-item">
          <label class="switch">
            <input
              v-model="configData.route.auto_detect_interface"
              type="checkbox"
            />
            <span class="slider"></span>
          </label>
          <span class="toggle-label"
            >自动探测活动网络网卡接口 (auto_detect_interface)</span
          >
          <span
            title="强烈建议开启。自动探测物理活动网卡，防止物理连接变更引起回流与环路。"
            style="cursor: help; color: var(--text-muted); font-size: 0.85rem"
            >⚠️</span
          >
        </div>
      </div>
    </div>

    <!-- 重复规则警告 -->
    <div
      v-if="duplicateRouteRulesInfo.length > 0"
      class="alert alert-warning el-alert"
      style="
        margin-bottom: 1.25rem;
        margin-top: 1rem;
        padding: 1rem;
        background: rgba(245, 158, 11, 0.12);
        border: 1px solid rgba(245, 158, 11, 0.3);
        border-radius: 8px;
        color: var(--warning);
      "
    >
      <div style="font-weight: 600">
        路由配置中存在重复配置项（具体关联规则与出站如下）：
      </div>
      <ul
        style="
          margin: 0.5rem 0 0 0;
          padding-left: 1.35rem;
          list-style-type: disc;
        "
      >
        <li
          v-for="(item, dIdx) in duplicateRouteRulesInfo"
          :key="dIdx"
          style="margin-top: 0.25rem; font-size: 0.875rem"
        >
          <span style="font-weight: 600">{{ item.typeLabel }}</span>
          <span class="badge badge-danger el-tag" style="margin: 0 0.35rem">{{
            item.value
          }}</span>
          存在重复，涉及规则
          <strong>#{{ item.ruleIndices.join(", #") }}</strong>
          <span style="opacity: 0.9"
            >(目标出站: {{ item.outbounds.join(", ") }})</span
          >
        </li>
      </ul>
    </div>

    <!-- 路由规则列表 — 可折叠 + 拖拽排序 -->
    <div
      class="section-collapse el-collapse"
      style="margin-bottom: 1.25rem; margin-top: 1rem"
    >
      <div class="el-collapse-item">
        <div
          class="el-collapse-item__header"
          style="
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
          @click="toggleSection('rules')"
        >
          <span>📋 分流路由规则列表 (rules)</span>
          <span class="collapse-header-actions" @click.stop>
            <span class="badge badge-info el-tag">{{
              configData.route.rules?.length || 0
            }}</span>
            <button
              class="btn btn-sm btn-primary"
              @click.stop="$emit('openDomainWizard')"
            >
              ⚡ 快捷分流
            </button>
            <button class="btn btn-sm btn-secondary" @click.stop="addRouteRule">
              + 添加
            </button>
          </span>
        </div>

        <div
          v-show="openSections.includes('rules')"
          class="el-collapse-item__wrap"
        >
          <div class="el-collapse-item__content">
            <div
              v-if="configData.route.rules?.length > 0"
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
              v-model="configData.route.rules"
              handle=".drag-handle"
              :animation="250"
              ghost-class="ghost-card"
              :item-key="ruleKey"
              tag="div"
              class="route-cards-grid"
            >
              <template #item="{ element: rule, index: idx }">
                <div class="rule-card">
                  <div class="card-header-with-drag">
                    <span class="drag-handle" title="拖拽排序">⠿</span>
                    <div class="rule-card-header">
                      <span class="rule-card-title">
                        目标出站:
                        <strong>
                          <template
                            v-if="rule.action && rule.action !== 'route'"
                            >{{ rule.action }}</template
                          >
                          <template v-else>{{
                            rule.outbound || "未指定"
                          }}</template>
                        </strong>
                      </span>
                      <div class="rule-card-badges">
                        <span
                          v-if="rule.action && rule.action !== 'route'"
                          class="badge badge-danger el-tag"
                          >{{ rule.action }}</span
                        >
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
                      type="route"
                      :duplicate-check-fn="duplicateCheckFn"
                    />
                  </div>
                  <div class="rule-card-actions">
                    <button
                      class="btn btn-sm btn-secondary"
                      title="同步此规则至 DNS 分流规则"
                      @click="$emit('syncRule', rule, 'route', idx)"
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
                      @click="editRouteRule(rule, idx)"
                    >
                      编辑
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      @click="configData.route.rules.splice(idx, 1)"
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
              class="route-cards-grid"
            >
              <div
                v-for="(rule, idx) in filteredRules"
                :key="'route-rule-' + idx"
                class="rule-card"
              >
                <div class="rule-card-header">
                  <span class="rule-card-title">
                    目标出站:
                    <strong>
                      <template v-if="rule.action && rule.action !== 'route'">{{
                        rule.action
                      }}</template>
                      <template v-else>{{
                        rule.outbound || "未指定"
                      }}</template>
                    </strong>
                  </span>
                  <div class="rule-card-badges">
                    <span
                      v-if="rule.action && rule.action !== 'route'"
                      class="badge badge-danger el-tag"
                      >{{ rule.action }}</span
                    >
                    <span v-if="rule.invert" class="badge badge-warning el-tag"
                      >反向</span
                    >
                  </div>
                </div>
                <div class="rule-card-body">
                  <RuleCriteriaTags
                    :rule="rule"
                    type="route"
                    :duplicate-check-fn="duplicateCheckFn"
                  />
                </div>
                <div class="rule-card-actions">
                  <button
                    class="btn btn-sm btn-secondary"
                    :disabled="idx === 0"
                    title="上移"
                    @click="moveItemByFilter(configData.route.rules, rule, -1)"
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
                    @click="moveItemByFilter(configData.route.rules, rule, 1)"
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
                    title="同步此规则至 DNS 分流规则"
                    @click="
                      $emit('syncRule', rule, 'route', getRealIndex(rule))
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
                      <path d="M3.51 9a9 9 0 0 0 20.49 15" />
                    </svg>
                    同步
                  </button>
                  <button
                    class="btn btn-sm btn-secondary"
                    @click="editRouteRule(rule, getRealIndex(rule))"
                  >
                    编辑
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    @click="
                      configData.route.rules.splice(getRealIndex(rule), 1)
                    "
                  >
                    删除
                  </button>
                </div>
              </div>
            </TransitionGroup>

            <div
              v-if="
                filteredRules.length === 0 && configData.route.rules?.length > 0
              "
              class="rule-empty-state"
              style="margin-top: 0.75rem"
            >
              <div class="empty-title">没有匹配的规则</div>
              <div class="empty-description">尝试修改搜索条件</div>
            </div>
            <div
              v-if="(configData.route.rules || []).length === 0"
              class="rule-empty-state"
              style="margin-top: 0.5rem"
            >
              <div class="empty-title">暂无路由规则</div>
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
              共 {{ configData.route.rules.length }} 条规则
              <template
                v-if="
                  searchQuery &&
                  filteredRules.length < configData.route.rules.length
                "
                >(筛选显示 {{ filteredRules.length }} 条)</template
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 规则集列表 — 可折叠 + 拖拽排序 -->
    <div class="section-collapse el-collapse">
      <div class="el-collapse-item">
        <div
          class="el-collapse-item__header"
          style="
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
          "
          @click="toggleSection('rulesets')"
        >
          <span>📦 分流规则集集合 (rule_set)</span>
          <span class="collapse-header-actions" @click.stop>
            <span class="badge badge-info el-tag">{{
              configData.route.rule_set?.length || 0
            }}</span>
            <button class="btn btn-sm btn-secondary" @click.stop="addRuleSet">
              + 添加
            </button>
          </span>
        </div>

        <div
          v-show="openSections.includes('rulesets')"
          class="el-collapse-item__wrap"
        >
          <div class="el-collapse-item__content">
            <draggable
              v-model="configData.route.rule_set"
              handle=".drag-handle"
              :animation="250"
              ghost-class="ghost-card"
              :item-key="ruleSetKey"
              tag="div"
              class="route-cards-grid"
            >
              <template #item="{ element: rs, index: idx }">
                <div class="rule-card">
                  <div class="card-header-with-drag">
                    <span class="drag-handle" title="拖拽排序">⠿</span>
                    <div class="rule-card-header">
                      <span class="rule-card-title">{{
                        rs.tag || "未命名"
                      }}</span>
                      <div class="rule-card-badges">
                        <span class="badge badge-info el-tag">{{
                          rs.type
                        }}</span>
                        <span class="badge badge-secondary el-tag">{{
                          rs.format
                        }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="rule-card-body">
                    <div v-if="rs.type === 'remote'" class="rule-card-detail">
                      <span>URL:</span>
                      <span class="detail-value">{{ rs.url || "-" }}</span>
                    </div>
                    <div v-else class="rule-card-detail">
                      <span>路径:</span>
                      <span class="detail-value">{{ rs.path || "-" }}</span>
                    </div>
                    <div class="rule-card-detail">
                      <span>下载代理:</span>
                      <span class="detail-value">{{
                        rs.download_detour || "默认"
                      }}</span>
                    </div>
                    <div class="rule-card-detail">
                      <span>更新间隔:</span>
                      <span class="detail-value">{{
                        rs.update_interval || "未设置"
                      }}</span>
                    </div>
                  </div>
                  <div class="rule-card-actions">
                    <button
                      class="btn btn-sm btn-secondary"
                      @click="editRuleSetItem(rs, idx)"
                    >
                      编辑
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      @click="configData.route.rule_set.splice(idx, 1)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </template>
            </draggable>

            <div
              v-if="(configData.route.rule_set || []).length === 0"
              class="rule-empty-state"
              style="margin-top: 1rem"
            >
              <div class="empty-title">暂无规则集</div>
              <div class="empty-description">点击上方「添加」按钮创建</div>
            </div>
          </div>
        </div>
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
  duplicateRouteRulesInfo: { type: Array, default: () => [] },
  duplicateCheckFn: { type: Function, default: null },
  editItem: { type: Function, default: null },
});

defineEmits(["syncRule", "openDomainWizard"]);

const searchQuery = ref("");
const openSections = ref(["rules", "rulesets"]);

const toggleSection = (name) => {
  const idx = openSections.value.indexOf(name);
  if (idx > -1) {
    openSections.value.splice(idx, 1);
  } else {
    openSections.value.push(name);
  }
};

// WeakMap 提供稳定的拖拽 key
const itemKeyMap = new WeakMap();
let keyCounter = 0;
function stableKey(item) {
  if (!itemKeyMap.has(item)) itemKeyMap.set(item, ++keyCounter);
  return itemKeyMap.get(item);
}
const ruleKey = (rule) => stableKey(rule);
const ruleSetKey = (rs) => stableKey(rs);

const dnsServerTags = computed(() => {
  return (props.configData.dns?.servers || []).map((s) => s.tag);
});

const filteredRules = computed(() => {
  const rules = props.configData.route.rules || [];
  if (!searchQuery.value) return rules;
  const q = searchQuery.value.toLowerCase();
  return rules.filter((rule) => {
    const searchable = [
      rule.outbound,
      rule.action,
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
      rule.protocol &&
        (Array.isArray(rule.protocol)
          ? rule.protocol.join(" ")
          : rule.protocol),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });
});

function getRealIndex(rule) {
  return (props.configData.route.rules || []).indexOf(rule);
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

function addRouteRule() {
  const newItem = {
    outbound: props.allOutboundTags.includes("proxy")
      ? "proxy"
      : props.allOutboundTags[0] || "",
    domain_suffix: [],
  };
  if (props.editItem) {
    props.editItem(newItem, "route_rule", (parsed) => {
      if (!props.configData.route.rules) props.configData.route.rules = [];
      props.configData.route.rules.push(parsed);
    });
  }
}

function editRouteRule(rule, idx) {
  if (props.editItem)
    props.editItem(
      rule,
      "route_rule",
      (parsed) => {
        props.configData.route.rules[idx] = parsed;
      },
      idx,
    );
}

function addRuleSet() {
  const newItem = {
    tag: "ruleset-" + ((props.configData.route.rule_set || []).length + 1),
    type: "remote",
    format: "binary",
    url: "",
    download_detour: props.allOutboundTags.includes("proxy")
      ? "proxy"
      : props.allOutboundTags[0] || "",
    update_interval: "1d",
  };
  if (props.editItem) {
    props.editItem(newItem, "route_ruleset", (parsed) => {
      if (!props.configData.route.rule_set)
        props.configData.route.rule_set = [];
      props.configData.route.rule_set.push(parsed);
    });
  }
}

function editRuleSetItem(rs, idx) {
  if (props.editItem)
    props.editItem(
      rs,
      "route_ruleset",
      (parsed) => {
        props.configData.route.rule_set[idx] = parsed;
      },
      idx,
    );
}
</script>
