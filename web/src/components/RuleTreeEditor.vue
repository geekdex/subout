<template>
  <div class="rule-tree-editor">
    <!-- Presets Toolbar -->
    <div class="tree-presets-toolbar">
      <div class="presets-label">
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
        <span>快捷模版:</span>
      </div>

      <div class="presets-buttons">
        <button
          type="button"
          class="btn btn-xs btn-secondary preset-btn"
          title="生成 sing-box 推荐的最佳实践 DNS 分流规则 (满足 A/AAAA 且满足域名/规则集之一)"
          @click="applyBestPracticeTemplate"
        >
          ✨ A/AAAA + 域名/规则集分流 (AND 嵌套 OR)
        </button>
        <button
          type="button"
          class="btn btn-xs btn-secondary preset-btn"
          title="生成多域名与规则集 OR 组合规则"
          @click="applySimpleOrTemplate"
        >
          📑 纯域名 / 规则集组合 (OR 模式)
        </button>
        <button
          type="button"
          class="btn btn-xs btn-secondary-subtle preset-btn"
          title="清空当前所有规则"
          @click="clearRules"
        >
          清空
        </button>
      </div>
    </div>

    <!-- Root Logical Group -->
    <RuleTreeGroup
      :model-value="modelValue"
      :is-root="true"
      :depth="0"
      :rule-type="ruleType"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup>
import RuleTreeGroup from "./RuleTreeGroup.vue";
import { createDnsNestedTemplate } from "../utils/ruleTree.js";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  ruleType: {
    type: String,
    default: "dns",
  },
});

const emit = defineEmits(["update:modelValue"]);

function applyBestPracticeTemplate() {
  const updated = {
    ...props.modelValue,
    type: "logical",
    mode: "and",
    rules: createDnsNestedTemplate(),
  };
  emit("update:modelValue", updated);
}

function applySimpleOrTemplate() {
  const updated = {
    ...props.modelValue,
    type: "logical",
    mode: "or",
    rules: [
      { domain: [] },
      { domain_suffix: [] },
      { rule_set: [] },
    ],
  };
  emit("update:modelValue", updated);
}

function clearRules() {
  const updated = {
    ...props.modelValue,
    type: "logical",
    rules: [],
  };
  emit("update:modelValue", updated);
}
</script>

<style scoped>
.rule-tree-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tree-presets-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.65rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  flex-wrap: wrap;
}

.presets-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-muted, #94a3b8);
}

.presets-buttons {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.preset-btn {
  font-size: 0.73rem;
  padding: 0.2rem 0.5rem;
}

.btn-secondary-subtle {
  background: transparent;
  color: var(--text-muted, #94a3b8);
  border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.15));
}

.btn-secondary-subtle:hover {
  color: var(--danger, #ef4444);
  border-color: var(--danger, #ef4444);
}
</style>
