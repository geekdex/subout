<template>
  <div class="json-tree-node" :class="{ 'is-root': depth === 0 }">
    <!-- If it's an object or array -->
    <div v-if="isObjectOrArray" class="json-tree-expandable">
      <span class="json-tree-toggle" @click="toggleExpand">
        <span class="toggle-icon" :class="{ 'is-expanded': expanded }">▶</span>
      </span>

      <span v-if="name" class="json-key" @click="toggleExpand"
        >"{{ name }}":
      </span>

      <span class="json-bracket" @click="toggleExpand">
        {{ isArray ? "[" : "{" }}
        <span v-if="!expanded" class="json-summary-dots">...</span>
      </span>

      <span v-if="!expanded" class="json-bracket-close" @click="toggleExpand">
        {{ isArray ? "]" : "}" }}{{ isLast ? "" : "," }}
      </span>

      <!-- Children nodes -->
      <div v-show="expanded" class="json-tree-children">
        <div v-for="(val, key, index) in data" :key="key">
          <json-tree-view
            :data="val"
            :name="isArray ? '' : String(key)"
            :depth="depth + 1"
            :is-last="index === childKeysLength - 1"
          />
        </div>
      </div>

      <div v-show="expanded" class="json-bracket-close">
        {{ isArray ? "]" : "}" }}{{ isLast ? "" : "," }}
      </div>
    </div>

    <!-- If it's a primitive value (string, number, boolean, null) -->
    <div v-else class="json-tree-primitive">
      <span class="json-tree-indent"></span>
      <span v-if="name" class="json-key">"{{ name }}": </span>
      <span :class="primitiveClass">{{ primitiveValueString }}</span>
      <span class="json-comma">{{ isLast ? "" : "," }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

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
});

const expanded = ref(props.depth < 2); // Auto-expand first 2 levels (root and top-level fields)

const isArray = computed(() => Array.isArray(props.data));
const isObjectOrArray = computed(
  () => props.data !== null && typeof props.data === "object",
);

const childKeysLength = computed(() => {
  if (!isObjectOrArray.value) return 0;
  return Object.keys(props.data).length;
});

const toggleExpand = () => {
  expanded.value = !expanded.value;
};

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
</script>

<script>
// Expose component name for recursive template resolution in Vue
export default {
  name: "JsonTreeView",
};
</script>

<style scoped>
.json-tree-node {
  font-family: var(--font-mono, monospace);
  font-size: 0.85rem;
  line-height: 1.5;
  text-align: left;
}

.json-tree-node.is-root {
  padding-left: 0.5rem;
}

.json-tree-expandable {
  display: block;
}

.json-tree-toggle {
  display: inline-block;
  width: 1.25rem;
  text-align: center;
  cursor: pointer;
  user-select: none;
  color: var(--text-muted, #6c757d);
}

.toggle-icon {
  display: inline-block;
  font-size: 0.65rem;
  transition: transform 0.2s ease;
}

.toggle-icon.is-expanded {
  transform: rotate(90deg);
}

.json-key {
  color: #e06c75; /* Soft red/pink for JSON keys */
  font-weight: 500;
  cursor: pointer;
}

.json-bracket,
.json-bracket-close {
  color: #abb2bf; /* Soft light gray for brackets */
  cursor: pointer;
}

.json-summary-dots {
  background: rgba(255, 255, 255, 0.1);
  padding: 0 4px;
  border-radius: 3px;
  color: #61afef; /* Cyan/blue for collapsed dots */
  margin: 0 2px;
  font-size: 0.8rem;
  cursor: pointer;
}

.json-tree-children {
  padding-left: 1.25rem;
  border-left: 1px dashed rgba(255, 255, 255, 0.1);
  margin-left: 0.6rem;
}

.json-tree-primitive {
  display: block;
  padding-left: 1.25rem;
}

.json-tree-indent {
  display: inline-block;
  width: 0.6rem;
}

.json-string {
  color: #98c379; /* Vibrant green for strings */
  word-break: break-all;
}

.json-number {
  color: #d19a66; /* Gold/orange for numbers */
}

.json-boolean {
  color: #56b6c2; /* Teal/blue-green for booleans */
}

.json-null {
  color: #c678dd; /* Purple for null values */
  font-style: italic;
}

.json-comma {
  color: #abb2bf;
}
</style>
