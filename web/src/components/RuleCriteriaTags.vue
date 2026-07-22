<template>
  <div class="rule-criteria-tags">
    <!-- Logical rule mode badge -->
    <span
      v-if="rule.type === 'logical'"
      class="criteria-tag rule-set-tag"
      style="font-weight: 600; border-color: var(--primary)"
    >
      逻辑模式: {{ (rule.mode || "or").toUpperCase() }}
    </span>

    <!-- ECS client subnet (DNS only) -->
    <span
      v-if="type === 'dns' && rule.client_subnet"
      class="criteria-tag"
      style="
        font-weight: 600;
        border-color: #f59e0b;
        color: #d97706;
        background: rgba(245, 158, 11, 0.1);
      "
    >
      ECS: {{ rule.client_subnet }}
    </span>

    <!-- Standard root criteria -->
    <span v-if="rule.rule_set" class="criteria-tag rule-set-tag">
      RuleSet: {{ formatArray(rule.rule_set) }}
    </span>
    <span
      v-if="rule.geosite"
      class="criteria-tag"
      :class="{ 'duplicate-tag': isDuplicate('geosite', rule.geosite) }"
    >
      Geosite: {{ formatArray(rule.geosite) }}
    </span>
    <span
      v-if="rule.domain_suffix"
      class="criteria-tag"
      :class="{
        'duplicate-tag': isDuplicate('domain_suffix', rule.domain_suffix),
      }"
    >
      Suffix: {{ formatArray(rule.domain_suffix) }}
    </span>
    <span
      v-if="rule.domain"
      class="criteria-tag"
      :class="{ 'duplicate-tag': isDuplicate('domain', rule.domain) }"
    >
      Domain: {{ formatArray(rule.domain) }}
    </span>
    <span v-if="rule.domain_keyword" class="criteria-tag">
      Keyword: {{ formatArray(rule.domain_keyword) }}
    </span>
    <span v-if="rule.domain_regex" class="criteria-tag">
      Regex: {{ formatArray(rule.domain_regex) }}
    </span>
    <span
      v-if="rule.geoip"
      class="criteria-tag"
      :class="{ 'duplicate-tag': isDuplicate('geoip', rule.geoip) }"
    >
      GeoIP: {{ formatArray(rule.geoip) }}
    </span>
    <span
      v-if="rule.ip_cidr"
      class="criteria-tag"
      :class="{ 'duplicate-tag': isDuplicate('ip_cidr', rule.ip_cidr) }"
    >
      IP CIDR: {{ formatArray(rule.ip_cidr) }}
    </span>
    <span v-if="rule.port" class="criteria-tag">
      Port: {{ formatArray(rule.port) }}
    </span>
    <span v-if="rule.inbound" class="criteria-tag">
      Inbound: {{ formatArray(rule.inbound) }}
    </span>
    <span v-if="rule.protocol" class="criteria-tag">
      Protocol: {{ formatArray(rule.protocol) }}
    </span>
    <span v-if="rule.network" class="criteria-tag">
      Network: {{ formatArray(rule.network) }}
    </span>
    <span
      v-if="rule.ip_is_private"
      class="criteria-tag"
      style="
        border-color: rgba(16, 185, 129, 0.3);
        color: #34d399;
        background: rgba(16, 185, 129, 0.1);
      "
    >
      私有 IP
    </span>
    <span v-if="rule.action" class="criteria-tag action-tag">
      动作: {{ rule.action }}
    </span>

    <!-- Sub-rules for logical mode -->
    <template v-if="rule.type === 'logical' && Array.isArray(rule.rules)">
      <template v-for="(sub, sidx) in rule.rules" :key="sidx">
        <span v-if="sub.rule_set" class="criteria-tag rule-set-tag">
          RuleSet: {{ formatArray(sub.rule_set) }}
        </span>
        <span
          v-if="sub.geosite"
          class="criteria-tag"
          :class="{ 'duplicate-tag': isDuplicate('geosite', sub.geosite) }"
        >
          Geosite: {{ formatArray(sub.geosite) }}
        </span>
        <span
          v-if="sub.domain_suffix"
          class="criteria-tag"
          :class="{
            'duplicate-tag': isDuplicate('domain_suffix', sub.domain_suffix),
          }"
        >
          Suffix: {{ formatArray(sub.domain_suffix) }}
        </span>
        <span
          v-if="sub.domain"
          class="criteria-tag"
          :class="{ 'duplicate-tag': isDuplicate('domain', sub.domain) }"
        >
          Domain: {{ formatArray(sub.domain) }}
        </span>
        <span v-if="sub.domain_keyword" class="criteria-tag">
          Keyword: {{ formatArray(sub.domain_keyword) }}
        </span>
        <span v-if="sub.domain_regex" class="criteria-tag">
          Regex: {{ formatArray(sub.domain_regex) }}
        </span>
        <span
          v-if="sub.geoip"
          class="criteria-tag"
          :class="{ 'duplicate-tag': isDuplicate('geoip', sub.geoip) }"
        >
          GeoIP: {{ formatArray(sub.geoip) }}
        </span>
        <span v-if="sub.ip_cidr" class="criteria-tag">
          IP CIDR: {{ formatArray(sub.ip_cidr) }}
        </span>
        <span v-if="sub.port" class="criteria-tag">
          Port: {{ formatArray(sub.port) }}
        </span>
        <span v-if="sub.protocol" class="criteria-tag">
          Protocol: {{ formatArray(sub.protocol) }}
        </span>
        <span
          v-if="sub.ip_is_private"
          class="criteria-tag"
          style="
            border-color: rgba(16, 185, 129, 0.3);
            color: #34d399;
            background: rgba(16, 185, 129, 0.1);
          "
        >
          私有 IP
        </span>
      </template>
    </template>

    <!-- Empty/no criteria -->
    <span
      v-if="hasNoCriteria"
      style="color: var(--text-muted); font-size: 0.8rem"
    >
      （无条件，匹配全部）
    </span>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  rule: { type: Object, required: true },
  type: { type: String, default: "route" }, // 'dns' or 'route'
  duplicateCheckFn: { type: Function, default: null },
});

const hasNoCriteria = computed(() => {
  const r = props.rule;
  return (
    !r.type &&
    !r.rule_set &&
    !r.geosite &&
    !r.domain_suffix &&
    !r.domain &&
    !r.geoip &&
    !r.ip_cidr &&
    !r.port &&
    !r.inbound &&
    !r.protocol &&
    !r.network &&
    !r.ip_is_private &&
    !r.action
  );
});

function formatArray(val) {
  if (val === undefined || val === null) return "";
  return Array.isArray(val) ? val.join(", ") : String(val);
}

function isDuplicate(field, value) {
  if (!props.duplicateCheckFn) return false;
  return props.duplicateCheckFn(field, value);
}
</script>
