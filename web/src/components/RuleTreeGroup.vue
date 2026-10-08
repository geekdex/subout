<template>
  <div
    class="rule-tree-group"
    :class="[`depth-${Math.min(depth, 3)}`, { 'is-root': isRoot }]"
  >
    <!-- Group Header -->
    <div class="group-header">
      <div class="group-title-section">
        <div class="group-indicator">
          <span
            class="mode-badge"
            :class="groupMode === 'and' ? 'mode-and' : 'mode-or'"
          >
            {{ groupMode.toUpperCase() }}
          </span>
          <span class="group-title-text">
            {{ isRoot ? "根逻辑匹配组" : `子逻辑组 (层级 ${depth})` }}
          </span>
        </div>

        <!-- Mode Toggle -->
        <div class="mode-toggle-group">
          <button
            type="button"
            class="mode-btn mode-btn-and"
            :class="{ active: groupMode === 'and' }"
            @click="setMode('and')"
          >
            逻辑与 AND (需同时满足)
          </button>
          <button
            type="button"
            class="mode-btn mode-btn-or"
            :class="{ active: groupMode === 'or' }"
            @click="setMode('or')"
          >
            逻辑或 OR (任一满足即可)
          </button>
        </div>
      </div>

      <div class="group-header-actions">
        <span class="rule-count-tag">{{ childRules.length }} 项子规则</span>
        <label v-if="!isRoot" class="group-invert-label">
          <input
            type="checkbox"
            :checked="!!modelValue.invert"
            @change="toggleInvert($event.target.checked)"
          />
          <span>反转此组</span>
        </label>
        <button
          v-if="!isRoot"
          type="button"
          class="btn btn-xs btn-danger-subtle"
          title="删除此逻辑组及其全部子项"
          @click="$emit('remove')"
        >
          ✕ 删除组
        </button>
      </div>
    </div>

    <!-- Group Children List -->
    <div class="group-children-list">
      <div v-if="childRules.length === 0" class="group-empty-state">
        <span class="empty-icon">📂</span>
        <span>当前逻辑组暂无规则项。请点击下方按钮添加匹配条件或子逻辑组。</span>
      </div>

      <template v-for="(child, idx) in childRules" :key="getChildKey(child, idx)">
        <!-- If child is a logical group itself: recursive render -->
        <RuleTreeGroup
          v-if="child.type === 'logical'"
          :model-value="child"
          :depth="depth + 1"
          :is-root="false"
          :rule-type="ruleType"
          @update:model-value="updateChild(idx, $event)"
          @remove="removeChild(idx)"
        />

        <!-- If child is a condition rule -->
        <RuleTreeCondition
          v-else
          :model-value="child"
          :index="idx"
          :rule-type="ruleType"
          @update:model-value="updateChild(idx, $event)"
          @remove="removeChild(idx)"
        />
      </template>
    </div>

    <!-- Group Action Footer -->
    <div class="group-footer">
      <button
        type="button"
        class="btn btn-xs btn-secondary add-action-btn"
        @click="addCondition"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          style="margin-right: 3px"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        添加匹配条件
      </button>

      <button
        type="button"
        class="btn btn-xs btn-secondary add-action-btn"
        @click="addSubGroup"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          style="margin-right: 3px"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        添加子逻辑组 (嵌套)
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import RuleTreeCondition from "./RuleTreeCondition.vue";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  depth: {
    type: Number,
    default: 0,
  },
  isRoot: {
    type: Boolean,
    default: false,
  },
  ruleType: {
    type: String,
    default: "dns",
  },
});

const emit = defineEmits(["update:modelValue", "remove"]);

const groupMode = computed(() => {
  return props.modelValue.mode === "or" ? "or" : "and";
});

const childRules = computed(() => {
  return Array.isArray(props.modelValue.rules) ? props.modelValue.rules : [];
});

function getChildKey(child, idx) {
  if (child._key) return child._key;
  if (child.type === "logical") {
    return `grp_${props.depth}_${idx}_${child.mode}`;
  }
  return `cond_${props.depth}_${idx}_${Object.keys(child).join("_")}`;
}

function setMode(newMode) {
  emit("update:modelValue", {
    ...props.modelValue,
    type: "logical",
    mode: newMode,
  });
}

function toggleInvert(checked) {
  const copy = { ...props.modelValue };
  if (checked) {
    copy.invert = true;
  } else {
    delete copy.invert;
  }
  emit("update:modelValue", copy);
}

function updateChild(index, newChild) {
  const nextRules = [...childRules.value];
  nextRules[index] = newChild;
  emit("update:modelValue", {
    ...props.modelValue,
    type: "logical",
    rules: nextRules,
  });
}

function removeChild(index) {
  const nextRules = [...childRules.value];
  nextRules.splice(index, 1);
  emit("update:modelValue", {
    ...props.modelValue,
    type: "logical",
    rules: nextRules,
  });
}

function addCondition() {
  const nextRules = [...childRules.value];
  const newCondition =
    props.ruleType === "dns"
      ? { query_type: ["A", "AAAA"] }
      : { domain_suffix: [] };
  nextRules.push(newCondition);
  emit("update:modelValue", {
    ...props.modelValue,
    type: "logical",
    rules: nextRules,
  });
}

function addSubGroup() {
  const nextRules = [...childRules.value];
  const oppositeMode = groupMode.value === "and" ? "or" : "and";
  const newSubGroup = {
    type: "logical",
    mode: oppositeMode,
    rules: [
      { domain: [] },
      { domain_suffix: [] },
    ],
  };
  nextRules.push(newSubGroup);
  emit("update:modelValue", {
    ...props.modelValue,
    type: "logical",
    rules: nextRules,
  });
}
</script>

<style scoped>
.rule-tree-group {
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  position: relative;
  background: rgba(255, 255, 255, 0.015);
  transition: all 0.2s ease;
}

.rule-tree-group.depth-0 {
  border-left: 4px solid var(--primary, #6366f1);
  background: rgba(99, 102, 241, 0.02);
}

.rule-tree-group.depth-1 {
  border-left: 4px solid var(--secondary, #06b6d4);
  background: rgba(6, 182, 212, 0.025);
  margin-top: 0.5rem;
}

.rule-tree-group.depth-2,
.rule-tree-group.depth-3 {
  border-left: 4px solid var(--warning, #f59e0b);
  background: rgba(245, 158, 11, 0.025);
  margin-top: 0.5rem;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed var(--border-color, rgba(255, 255, 255, 0.08));
  flex-wrap: wrap;
}

.group-title-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.group-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.mode-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.mode-badge.mode-and {
  background: rgba(99, 102, 241, 0.2);
  color: var(--primary, #6366f1);
  border: 1px solid rgba(99, 102, 241, 0.4);
}

.mode-badge.mode-or {
  background: rgba(6, 182, 212, 0.2);
  color: var(--secondary, #06b6d4);
  border: 1px solid rgba(6, 182, 212, 0.4);
}

.group-title-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-main, #f8fafc);
}

.mode-toggle-group {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 2px;
  gap: 2px;
}

.mode-btn {
  font-size: 0.75rem;
  padding: 0.2rem 0.55rem;
  border: none;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-btn:hover {
  color: var(--text-main, #f8fafc);
}

.mode-btn-and.active {
  background: var(--primary, #6366f1);
  color: #ffffff;
  font-weight: 600;
}

.mode-btn-or.active {
  background: var(--secondary, #06b6d4);
  color: #ffffff;
  font-weight: 600;
}

.group-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.rule-count-tag {
  font-size: 0.75rem;
  color: var(--text-muted, #94a3b8);
}

.group-invert-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
}

.btn-danger-subtle {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger, #ef4444);
  border: 1px solid rgba(239, 68, 68, 0.2);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
}

.btn-danger-subtle:hover {
  background: rgba(239, 68, 68, 0.2);
}

.group-children-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.group-empty-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem;
  border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  color: var(--text-muted, #94a3b8);
  font-size: 0.8rem;
}

.empty-icon {
  font-size: 1.1rem;
}

.group-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.65rem;
  padding-top: 0.4rem;
}

.add-action-btn {
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  padding: 0.25rem 0.6rem;
}
</style>
