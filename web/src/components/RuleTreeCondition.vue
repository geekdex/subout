<template>
  <div class="rule-tree-condition">
    <div class="condition-header">
      <div class="condition-title-group">
        <span class="condition-badge">条件 #{{ index + 1 }}</span>
        <select
          v-if="activeFields.length <= 1"
          :value="primaryField"
          class="input-control select-field-type"
          @change="onPrimaryFieldChange($event.target.value)"
        >
          <option
            v-for="opt in availableOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="condition-header-actions">
        <label class="invert-checkbox" title="反转此条件的匹配结果">
          <input
            type="checkbox"
            :checked="!!modelValue.invert"
            @change="toggleInvert($event.target.checked)"
          />
          <span>反转 (invert)</span>
        </label>
        <button
          type="button"
          class="btn btn-xs btn-icon btn-danger-subtle"
          title="删除此条件"
          @click="$emit('remove')"
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
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Active Field Editors -->
    <div class="condition-body">
      <div
        v-for="field in activeFields"
        :key="field"
        class="condition-field-row"
      >
        <div v-if="activeFields.length > 1" class="multi-field-header">
          <span class="field-label-tag">{{ getFieldLabel(field) }}</span>
          <button
            type="button"
            class="btn btn-xs btn-secondary remove-field-btn"
            @click="removeField(field)"
          >
            移除此项
          </button>
        </div>

        <!-- 1. query_type special pill buttons + input -->
        <div v-if="field === 'query_type'" class="query-type-editor">
          <div class="query-type-pills">
            <span class="pills-title">快捷点选:</span>
            <button
              v-for="qt in quickQueryTypes"
              :key="qt"
              type="button"
              class="pill-btn"
              :class="{ active: isQueryTypeSelected(qt) }"
              @click="toggleQueryType(qt)"
            >
              {{ qt }}
            </button>
          </div>
          <div class="input-with-counter">
            <textarea
              class="input-control field-textarea"
              rows="2"
              placeholder="每行或逗号分隔，例如: A, AAAA, HTTPS, CNAME"
              :value="formatArrayValue(modelValue.query_type)"
              @input="onArrayInput(field, $event.target.value)"
            ></textarea>
            <span class="count-badge">
              {{ getItemCount(modelValue.query_type) }} 项
            </span>
          </div>
        </div>

        <!-- 2. Port numbers input -->
        <div v-else-if="field === 'port'" class="port-editor">
          <input
            type="text"
            class="input-control"
            placeholder="例如: 53, 853, 443"
            :value="formatPortValue(modelValue.port)"
            @input="onPortInput($event.target.value)"
          />
        </div>

        <!-- 3. General list textarea (domain, domain_suffix, rule_set, geosite, etc.) -->
        <div v-else class="general-list-editor">
          <div class="input-with-counter">
            <textarea
              class="input-control field-textarea"
              :rows="getTextareaRows(modelValue[field])"
              :placeholder="getFieldPlaceholder(field)"
              :value="formatArrayValue(modelValue[field])"
              @input="onArrayInput(field, $event.target.value)"
            ></textarea>
            <span class="count-badge">
              {{ getItemCount(modelValue[field]) }} 项
            </span>
          </div>
        </div>
      </div>

      <!-- Option to add more fields to this condition if needed -->
      <div v-if="unselectedOptions.length > 0" class="add-field-row">
        <select
          class="input-control select-add-field"
          @change="onAddFieldSelect($event.target.value); $event.target.value = ''"
        >
          <option value="">+ 添加同条件附加匹配字段...</option>
          <option
            v-for="opt in unselectedOptions"
            :key="opt.value"
            :value="opt.value"
          >
            + {{ opt.label }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { QUERY_TYPES, DNS_CRITERIA_OPTIONS } from "../utils/ruleTree.js";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    default: 0,
  },
  ruleType: {
    type: String,
    default: "dns",
  },
});

const emit = defineEmits(["update:modelValue", "remove"]);

const quickQueryTypes = QUERY_TYPES;
const availableOptions = DNS_CRITERIA_OPTIONS;

const activeFields = computed(() => {
  const keys = Object.keys(props.modelValue || {}).filter(
    (k) => !["invert", "type", "mode", "rules", "_key"].includes(k),
  );
  if (keys.length === 0) {
    return [props.ruleType === "dns" ? "query_type" : "domain_suffix"];
  }
  return keys;
});

const primaryField = computed(() => {
  return activeFields.value[0] || (props.ruleType === "dns" ? "query_type" : "domain_suffix");
});

const unselectedOptions = computed(() => {
  return availableOptions.filter((opt) => !activeFields.value.includes(opt.value));
});

function getFieldLabel(field) {
  const found = availableOptions.find((o) => o.value === field);
  return found ? found.label : field;
}

function getFieldPlaceholder(field) {
  switch (field) {
    case "domain":
      return "精确域名，每行一个或逗号分隔，例如:\nclaude.ai\napi.github.com";
    case "domain_suffix":
      return "域名后缀，每行一个或逗号分隔，例如:\n.io\n.google\nfeiniaoyun.xyz";
    case "rule_set":
      return "规则集 Tag，每行一个或逗号分隔，例如:\ngeosite-google\ngeosite-youtube";
    case "geosite":
      return "Geosite 名称，每行一个或逗号分隔，例如:\ngoogle\ncn";
    case "domain_keyword":
      return "域名关键字，每行一个或逗号分隔，例如:\ngoogle\nopenai";
    case "domain_regex":
      return "正则表达式，每行一个或逗号分隔，例如:\n^google\\..*$";
    case "geoip":
      return "GeoIP 代码，例如: cn, private";
    case "ip_cidr":
      return "IP CIDR 网段，例如: 192.168.1.0/24, 10.0.0.0/8";
    case "inbound":
      return "入站 Tag，例如: mixed-in";
    case "process_name":
      return "进程名称，例如: chrome, msedge.exe";
    default:
      return "每行一个或逗号分隔输入内容...";
  }
}

function formatArrayValue(val) {
  if (!val) return "";
  if (Array.isArray(val)) return val.join("\n");
  return String(val);
}

function formatPortValue(val) {
  if (!val) return "";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
}

function getItemCount(val) {
  if (!val) return 0;
  if (Array.isArray(val)) return val.length;
  return String(val)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function getTextareaRows(val) {
  const count = getItemCount(val);
  if (count <= 2) return 2;
  if (count <= 6) return 4;
  return 6;
}

function onPrimaryFieldChange(newField) {
  const oldField = primaryField.value;
  if (oldField === newField) return;

  const copy = { ...props.modelValue };
  const currentVal = copy[oldField] || [];
  delete copy[oldField];
  copy[newField] = currentVal;
  emit("update:modelValue", copy);
}

function onAddFieldSelect(newField) {
  if (!newField) return;
  const copy = { ...props.modelValue };
  if (!copy[newField]) {
    copy[newField] = [];
  }
  emit("update:modelValue", copy);
}

function removeField(field) {
  const copy = { ...props.modelValue };
  delete copy[field];
  emit("update:modelValue", copy);
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

function onArrayInput(field, text) {
  const list = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const copy = { ...props.modelValue };
  copy[field] = list;
  emit("update:modelValue", copy);
}

function onPortInput(text) {
  const ports = text
    .split(/[\n,]+/)
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n));
  const copy = { ...props.modelValue };
  copy.port = ports;
  emit("update:modelValue", copy);
}

function isQueryTypeSelected(qt) {
  const current = props.modelValue.query_type;
  if (!Array.isArray(current)) return false;
  return current.includes(qt);
}

function toggleQueryType(qt) {
  const current = Array.isArray(props.modelValue.query_type)
    ? [...props.modelValue.query_type]
    : [];
  const idx = current.indexOf(qt);
  if (idx > -1) {
    current.splice(idx, 1);
  } else {
    current.push(qt);
  }
  const copy = { ...props.modelValue, query_type: current };
  emit("update:modelValue", copy);
}
</script>

<style scoped>
.rule-tree-condition {
  background: var(--bg-card, #111827);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  padding: 0.65rem 0.85rem;
  margin-bottom: 0.5rem;
  transition: border-color 0.15s ease;
}

.rule-tree-condition:hover {
  border-color: rgba(99, 102, 241, 0.3);
}

.condition-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.condition-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.condition-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary, #6366f1);
  white-space: nowrap;
}

.select-field-type {
  font-size: 0.825rem;
  padding: 0.2rem 0.5rem;
  max-width: 280px;
  height: 28px;
}

.condition-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.invert-checkbox {
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
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-danger-subtle:hover {
  background: rgba(239, 68, 68, 0.2);
}

.condition-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.multi-field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.field-label-tag {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--secondary, #06b6d4);
}

.remove-field-btn {
  font-size: 0.7rem;
  padding: 0.1rem 0.35rem;
}

.query-type-pills {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.4rem;
}

.pills-title {
  font-size: 0.75rem;
  color: var(--text-muted, #94a3b8);
}

.pill-btn {
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-main, #f8fafc);
  cursor: pointer;
  transition: all 0.15s ease;
}

.pill-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: var(--primary, #6366f1);
}

.pill-btn.active {
  background: var(--primary, #6366f1);
  border-color: var(--primary, #6366f1);
  color: #ffffff;
  font-weight: 600;
}

.input-with-counter {
  position: relative;
}

.field-textarea {
  width: 100%;
  font-family: var(--font-mono, monospace);
  font-size: 0.8rem;
  line-height: 1.4;
  padding: 0.4rem 0.6rem;
  resize: vertical;
}

.count-badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 0.7rem;
  color: var(--text-muted, #94a3b8);
  background: rgba(0, 0, 0, 0.4);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  pointer-events: none;
}

.select-add-field {
  font-size: 0.75rem;
  padding: 0.15rem 0.4rem;
  max-width: 240px;
  color: var(--text-muted, #94a3b8);
}
</style>
