<template>
  <div
    class="json-tree-node"
    :class="{
      'is-root': depth === 0,
      'is-matched': hasSearchMatch,
    }"
  >
    <!-- If it's an object or array -->
    <div v-if="isObjectOrArray" class="json-tree-expandable">
      <div class="json-line-row">
        <span
          class="json-tree-toggle"
          title="点击折叠/展开"
          @click.stop="toggleExpand"
        >
          <span class="toggle-icon" :class="{ 'is-expanded': expanded }"
            >▶</span
          >
        </span>

        <span
          v-if="name"
          class="json-key"
          :class="{ 'highlight-text': isKeyMatched }"
          @click.stop="toggleExpand"
        >
          "{{ name }}":
        </span>

        <span class="json-bracket" @click.stop="toggleExpand">
          {{ isArray ? "[" : "{" }}
        </span>

        <!-- Collapsed Summary Badge -->
        <span
          v-if="!expanded"
          class="json-summary-badge"
          title="点击展开节点"
          @click.stop="toggleExpand"
        >
          {{ collapsedSummary }}
        </span>

        <span
          v-if="!expanded"
          class="json-bracket-close"
          @click.stop="toggleExpand"
        >
          {{ isArray ? "]" : "}" }}{{ isLast ? "" : "," }}
        </span>

        <!-- Quick Copy Action on Hover -->
        <button
          type="button"
          class="copy-node-btn"
          title="复制该节点 JSON"
          @click.stop="copyNodeJson"
        >
          <span v-if="copied">✓ 已复制</span>
          <span v-else>📋</span>
        </button>
      </div>

      <!-- Children nodes -->
      <div v-show="expanded" class="json-tree-children">
        <div v-for="(val, key, index) in data" :key="key">
          <json-tree-view
            :data="val"
            :name="isArray ? '' : String(key)"
            :depth="depth + 1"
            :is-last="index === childKeysLength - 1"
            :expand-depth="expandDepth"
            :expand-signal="expandSignal"
            :collapse-signal="collapseSignal"
            :search-query="searchQuery"
          />
        </div>
      </div>

      <div v-show="expanded" class="json-bracket-close json-line-row">
        <span class="json-tree-indent"></span>
        <span>{{ isArray ? "]" : "}" }}{{ isLast ? "" : "," }}</span>
      </div>
    </div>

    <!-- If it's a primitive value (string, number, boolean, null) -->
    <div
      v-else
      class="json-tree-primitive json-line-row"
      :class="{ 'highlight-row': isValueMatched }"
    >
      <span class="json-tree-indent"></span>
      <span
        v-if="name"
        class="json-key"
        :class="{ 'highlight-text': isKeyMatched }"
      >
        "{{ name }}":
      </span>
      <span :class="[primitiveClass, { 'highlight-text': isValueMatched }]">
        {{ primitiveValueString }}
      </span>
      <span class="json-comma">{{ isLast ? "" : "," }}</span>

      <!-- Quick Copy Action on Hover -->
      <button
        type="button"
        class="copy-node-btn"
        title="复制该值"
        @click.stop="copyPrimitiveValue"
      >
        <span v-if="copied">✓ 已复制</span>
        <span v-else>📋</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";

const props = defineProps({
  data: {
    type: [Object, Array, String, Number, Boolean, null],
    required: true,
  },
  name: {
    type: String,
    default: "",
  },
  depth: {
    type: Number,
    default: 0,
  },
  isLast: {
    type: Boolean,
    default: true,
  },
  expandDepth: {
    type: Number,
    default: 2,
  },
  expandSignal: {
    type: Number,
    default: 0,
  },
  collapseSignal: {
    type: Number,
    default: 0,
  },
  searchQuery: {
    type: String,
    default: "",
  },
});

const isArray = computed(() => Array.isArray(props.data));
const isObjectOrArray = computed(
  () => props.data !== null && typeof props.data === "object",
);

const childKeysLength = computed(() => {
  if (!isObjectOrArray.value) return 0;
  return Object.keys(props.data).length;
});

const expanded = ref(props.depth < props.expandDepth);
const copied = ref(false);

const toggleExpand = () => {
  expanded.value = !expanded.value;
};

// React to global expand signal from parent controls
watch(
  () => props.expandSignal,
  () => {
    expanded.value = true;
  },
);

// React to global collapse signal from parent controls
watch(
  () => props.collapseSignal,
  () => {
    expanded.value = props.depth < props.expandDepth;
  },
);

// React to expandDepth prop changes
watch(
  () => props.expandDepth,
  (newDepth) => {
    expanded.value = props.depth < newDepth;
  },
);

// Search matching
const isKeyMatched = computed(() => {
  if (!props.searchQuery || !props.name) return false;
  return props.name.toLowerCase().includes(props.searchQuery.toLowerCase());
});

const isValueMatched = computed(() => {
  if (!props.searchQuery || isObjectOrArray.value) return false;
  const str = String(props.data || "").toLowerCase();
  return str.includes(props.searchQuery.toLowerCase());
});

const hasSearchMatch = computed(() => {
  if (!props.searchQuery) return false;
  if (isKeyMatched.value || isValueMatched.value) return true;
  if (isObjectOrArray.value) {
    try {
      const jsonStr = JSON.stringify(props.data).toLowerCase();
      return jsonStr.includes(props.searchQuery.toLowerCase());
    } catch {
      return false;
    }
  }
  return false;
});

// Auto expand when search matches within this node
watch(
  () => props.searchQuery,
  (query) => {
    if (query && hasSearchMatch.value && props.depth < 5) {
      expanded.value = true;
    }
  },
  { immediate: true },
);

// Collapsed node descriptive summary for sing-box config objects
const collapsedSummary = computed(() => {
  if (!isObjectOrArray.value) return "...";
  if (isArray.value) {
    return `... ${props.data.length} 项 ...`;
  }
  const obj = props.data;
  if (!obj || typeof obj !== "object") return "...";

  // Specialized friendly tags for sing-box objects
  if (obj.tag) {
    const extra = obj.type ? ` (${obj.type})` : "";
    return `... tag: "${obj.tag}"${extra} · ${childKeysLength.value} 属性 ...`;
  }
  if (obj.type && !obj.tag) {
    return `... type: "${obj.type}" · ${childKeysLength.value} 属性 ...`;
  }
  if (obj.action) {
    return `... action: "${obj.action}" ...`;
  }
  if (obj.outbound) {
    const rs = obj.rule_set
      ? ` · rule_set: "${Array.isArray(obj.rule_set) ? obj.rule_set.join(",") : obj.rule_set}"`
      : "";
    return `... → outbound: "${obj.outbound}"${rs} ...`;
  }
  if (obj.server) {
    return `... server: "${obj.server}" ...`;
  }
  return `... ${childKeysLength.value} 属性 ...`;
});

const primitiveClass = computed(() => {
  if (props.data === null) return "json-null";
  const type = typeof props.data;
  if (type === "string") return "json-string";
  if (type === "number") return "json-number";
  if (type === "boolean") return "json-boolean";
  return "";
});

const primitiveValueString = computed(() => {
  if (props.data === null) return "null";
  if (typeof props.data === "string") return `"${props.data}"`;
  return String(props.data);
});

const copyNodeJson = async () => {
  try {
    const jsonStr = JSON.stringify(props.data, null, 2);
    await navigator.clipboard.writeText(jsonStr);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch (e) {
    console.error("复制失败", e);
  }
};

const copyPrimitiveValue = async () => {
  try {
    const val =
      typeof props.data === "string" ? props.data : String(props.data);
    await navigator.clipboard.writeText(val);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch (e) {
    console.error("复制失败", e);
  }
};
</script>

<script>
export default {
  name: "JsonTreeView",
};
</script>

<style scoped>
.json-tree-node {
  font-family: var(
    --font-mono,
    "SFMono-Regular",
    Consolas,
    "Liberation Mono",
    Menlo,
    monospace
  );
  font-size: 0.85rem;
  line-height: 1.6;
  text-align: left;
  user-select: text;
}

.json-tree-node.is-root {
  padding: 0.25rem 0.5rem;
}

.json-line-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  border-radius: 4px;
  padding: 1px 4px;
  position: relative;
  transition: background-color 0.15s ease;
}

.json-line-row:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.json-line-row:hover .copy-node-btn {
  opacity: 1;
}

.json-tree-expandable {
  display: block;
}

.json-tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  text-align: center;
  cursor: pointer;
  user-select: none;
  color: var(--text-muted, #9ca3af);
  border-radius: 3px;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  margin-right: 2px;
}

.json-tree-toggle:hover {
  color: var(--primary, #6366f1);
  background-color: rgba(99, 102, 241, 0.12);
}

.toggle-icon {
  display: inline-block;
  font-size: 0.62rem;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-icon.is-expanded {
  transform: rotate(90deg);
}

.json-key {
  color: #f87171; /* Soft coral / red */
  font-weight: 500;
  cursor: pointer;
  margin-right: 4px;
}

.json-key:hover {
  text-decoration: underline;
}

.json-bracket,
.json-bracket-close {
  color: #94a3b8; /* Slate gray */
  cursor: pointer;
}

.json-summary-badge {
  display: inline-flex;
  align-items: center;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
  color: #818cf8; /* Indigo accent */
  padding: 0 6px;
  border-radius: 4px;
  margin: 0 4px;
  font-size: 0.76rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.json-summary-badge:hover {
  background: rgba(99, 102, 241, 0.22);
  border-color: rgba(99, 102, 241, 0.45);
  color: #a5b4fc;
}

.json-tree-children {
  padding-left: 1.25rem;
  border-left: 1px dashed rgba(255, 255, 255, 0.12);
  margin-left: 0.65rem;
}

.json-tree-primitive {
  display: flex;
}

.json-tree-indent {
  display: inline-block;
  width: 1.35rem;
}

.json-string {
  color: #4ade80; /* Vibrant emerald green */
  word-break: break-all;
}

.json-number {
  color: #fb923c; /* Warm orange */
}

.json-boolean {
  color: #38bdf8; /* Sky blue */
  font-weight: 600;
}

.json-null {
  color: #c084fc; /* Purple */
  font-style: italic;
}

.json-comma {
  color: #94a3b8;
}

.copy-node-btn {
  opacity: 0;
  margin-left: 8px;
  padding: 1px 6px;
  font-size: 0.72rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  transition: all 0.15s ease;
}

.copy-node-btn:hover {
  background: var(--primary, #6366f1);
  color: #fff;
  border-color: var(--primary, #6366f1);
}

.highlight-text {
  background: rgba(234, 179, 8, 0.3);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(234, 179, 8, 0.5);
}

.highlight-row {
  background: rgba(234, 179, 8, 0.08);
}
</style>
