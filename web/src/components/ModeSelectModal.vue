<template>
  <div class="modal" :class="{ active: show }">
    <div class="modal-card" style="max-width: 680px; width: 95%; padding: 2rem">
      <div style="text-align: center; margin-bottom: 2rem">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem">🚀</div>
        <h2
          style="
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-main);
            margin-bottom: 0.5rem;
          "
        >
          欢迎使用 Subout Panel
        </h2>
        <p style="color: var(--text-muted); font-size: 0.95rem">
          请选择最适合您的使用模式。后续可在「控制中心」随时无缝切换。
        </p>
      </div>

      <div class="mode-cards-grid">
        <!-- Simple Mode Card -->
        <div
          class="mode-select-card"
          :class="{ selected: selectedMode === 'simple' }"
          @click="selectedMode = 'simple'"
        >
          <div class="mode-badge simple-badge">🎈 推荐新手</div>
          <div class="mode-icon">⚡</div>
          <div class="mode-title">小白简单模式</div>
          <p class="mode-desc">
            极简配置，开箱即用。自动识别系统并一键下载集成 sing-box
            内核，可视化设置 DNS 与分流规则，免去繁琐的命令与复杂配置。
          </p>
          <ul class="mode-features">
            <li>✓ 自动匹配系统并一键下载 sing-box 内核</li>
            <li>✓ 极简可视化 DNS 与分流模式切换</li>
            <li>✓ 免写复杂 Shell 命令，一键启停代理</li>
          </ul>
        </div>

        <!-- Expert Mode Card -->
        <div
          class="mode-select-card"
          :class="{ selected: selectedMode === 'expert' }"
          @click="selectedMode = 'expert'"
        >
          <div class="mode-badge expert-badge">🛠️ 高级专业</div>
          <div class="mode-icon">🎛️</div>
          <div class="mode-title">专业模式 (专家模式)</div>
          <p class="mode-desc">
            完整掌控 sing-box 核心配置。自由编辑 6 大核心模块
            JSON，精细化出站组条件匹配、历史版本管理及系统服务集成。
          </p>
          <ul class="mode-features">
            <li>✓ 完整 sing-box JSON 结构与模式树编辑</li>
            <li>✓ 复杂出站策略组条件规则与历史回滚</li>
            <li>✓ 支持集成内核与传统系统内部命令双运行模式</li>
          </ul>
        </div>
      </div>

      <div
        style="
          margin-top: 2rem;
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
        "
      >
        <button
          class="btn btn-primary"
          style="padding: 0.75rem 2rem; font-size: 1rem; width: 100%"
          :disabled="submitting"
          @click="handleConfirm"
        >
          {{ submitting ? "正在设置..." : "确定并进入系统" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { switchAppMode } from "../store.js";

defineProps({
  show: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["confirmed"]);

const selectedMode = ref("simple");
const submitting = ref(false);

const handleConfirm = async () => {
  submitting.value = true;
  try {
    await switchAppMode(selectedMode.value);
    emit("confirmed", selectedMode.value);
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.mode-cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

@media (max-width: 640px) {
  .mode-cards-grid {
    grid-template-columns: 1fr;
  }
}

.mode-select-card {
  position: relative;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  cursor: pointer;
  background: var(--bg-card);
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.mode-select-card:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.mode-select-card.selected {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.04);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.mode-badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
  font-weight: 600;
}

.simple-badge {
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
}

.expert-badge {
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary);
}

.mode-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
}

.mode-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 0.5rem;
}

.mode-desc {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 1rem;
  flex-grow: 1;
}

.mode-features {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border-color);
  padding-top: 0.75rem;
}

.mode-features li {
  margin-bottom: 0.35rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
</style>
