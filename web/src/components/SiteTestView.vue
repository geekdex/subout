<template>
  <div class="view-container">
    <div class="view-header">
      <div>
        <h1>网站测试</h1>
        <p>
          直接检测当前系统网络对常见国外网站的连通性、响应延迟及 HTTP 状态码
          (支持 TUN / 系统代理网络)
        </p>
      </div>

      <div>
        <button
          class="btn btn-primary"
          :disabled="testingAll"
          @click="runTestAll"
        >
          <svg
            v-if="!testingAll"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span v-else class="spinner"></span>
          {{
            testingAll
              ? `正在测试 (${testedCount}/${totalSitesCount})...`
              : "一键测试全部网站"
          }}
        </button>
      </div>
    </div>

    <div class="view-body" style="overflow-y: auto; padding-right: 0.25rem">
      <!-- Stats Summary Panel -->
      <div v-if="stats.total > 0" class="panel control-panel">
        <div class="control-left">
          <span class="control-label">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path
                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
              />
            </svg>
            <span>系统网络连通性概览</span>
          </span>
        </div>

        <div class="stats-summary">
          <span class="stat-badge success-badge">
            🟢 可达: <strong>{{ stats.success }}</strong>
          </span>
          <span v-if="stats.fail > 0" class="stat-badge danger-badge">
            🔴 不可达: <strong>{{ stats.fail }}</strong>
          </span>
          <span v-if="stats.avgLatency > 0" class="stat-badge primary-badge">
            ⚡ 平均延迟: <strong>{{ stats.avgLatency }} ms</strong>
          </span>
        </div>
      </div>

      <!-- Custom URL Input Panel -->
      <div class="panel custom-url-panel">
        <div class="custom-url-title">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path
              d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            />
          </svg>
          <span>手动测试自定义网址</span>
        </div>
        <form class="custom-url-form" @submit.prevent="testCustomUrl">
          <input
            v-model="customUrl"
            type="url"
            class="input-control"
            placeholder="请输入完整网址 (例如: https://example.com)"
            required
          />
          <button
            type="submit"
            class="btn btn-secondary"
            :disabled="customTesting || !customUrl"
          >
            <span v-if="customTesting" class="spinner"></span>
            {{ customTesting ? "测试中..." : "测试网址" }}
          </button>
        </form>

        <!-- Custom Test Result Banner -->
        <div
          v-if="customResult"
          class="custom-result-banner"
          :class="{
            success: customResult.success,
            danger: !customResult.success,
          }"
        >
          <div class="result-left">
            <span
              class="result-status-tag"
              :class="customResult.success ? 'tag-success' : 'tag-danger'"
            >
              {{ customResult.success ? "访问成功" : "访问失败" }}
            </span>
            <span class="result-url">{{ customResult.url }}</span>
          </div>
          <div class="result-right">
            <span v-if="customResult.status_code" class="result-info"
              >HTTP {{ customResult.status_code }}</span
            >
            <span v-if="customResult.latency !== null" class="result-info"
              >{{ customResult.latency }} ms</span
            >
            <span v-if="customResult.error" class="result-error">{{
              customResult.error
            }}</span>
          </div>
        </div>
      </div>

      <!-- Category Filter Tabs -->
      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat.id"
          class="tab-btn"
          :class="{ active: selectedCategory === cat.id }"
          @click="selectedCategory = cat.id"
        >
          {{ cat.name }} ({{ getCategoryCount(cat.id) }})
        </button>
      </div>

      <!-- Preset Sites Grid -->
      <div class="site-grid">
        <div
          v-for="site in filteredSites"
          :key="site.id"
          class="panel site-card"
          :class="{
            'status-success': site.result && site.result.success,
            'status-danger': site.result && site.result.success === false,
            'status-testing': site.testing,
          }"
        >
          <div class="site-card-header">
            <div
              class="site-icon-wrapper"
              :style="{ background: site.colorBg }"
            >
              <span class="site-emoji">{{ site.icon }}</span>
            </div>
            <div class="site-info">
              <h3 class="site-name">{{ site.name }}</h3>
              <span class="site-domain">{{ site.domain }}</span>
            </div>
            <span class="category-badge">{{ site.categoryName }}</span>
          </div>

          <div class="site-card-body">
            <div class="site-metrics">
              <div class="metric-item">
                <span class="metric-label">HTTP 状态</span>
                <span
                  v-if="site.result && site.result.status_code"
                  class="metric-value"
                >
                  <span
                    class="code-badge"
                    :class="
                      site.result.status_code < 400 ? 'code-200' : 'code-warn'
                    "
                  >
                    {{ site.result.status_code }}
                  </span>
                </span>
                <span v-else class="metric-value text-muted">--</span>
              </div>

              <div class="metric-item">
                <span class="metric-label">响应延迟</span>
                <span
                  v-if="site.result && site.result.latency !== null"
                  class="metric-value"
                >
                  <span
                    class="latency-badge"
                    :class="getLatencyClass(site.result.latency)"
                  >
                    {{ site.result.latency }} ms
                  </span>
                </span>
                <span v-else class="metric-value text-muted">--</span>
              </div>
            </div>

            <div
              v-if="site.result && site.result.error"
              class="site-error-msg"
              :title="site.result.error"
            >
              ⚠️ {{ site.result.error }}
            </div>
          </div>

          <div class="site-card-footer">
            <div class="test-status-indicator">
              <span v-if="site.testing" class="status-text text-testing">
                <span class="spinner-small"></span> 测试中...
              </span>
              <span
                v-else-if="site.result && site.result.success"
                class="status-text text-success"
              >
                🟢 可达
              </span>
              <span
                v-else-if="site.result && !site.result.success"
                class="status-text text-danger"
              >
                🔴 不可达
              </span>
              <span v-else class="status-text text-idle"> ⚪ 未测试 </span>
            </div>

            <button
              class="btn btn-sm btn-secondary"
              :disabled="site.testing || testingAll"
              @click="testSingleSite(site)"
            >
              {{ site.testing ? "测试中" : "单项测试" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "SiteTestView",
  props: {
    token: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      selectedCategory: "all",
      testingAll: false,
      testedCount: 0,
      customUrl: "",
      customTesting: false,
      customResult: null,

      categories: [
        { id: "all", name: "全部网站" },
        { id: "search", name: "搜索引擎与常用" },
        { id: "social", name: "社交与通讯" },
        { id: "media", name: "视频与流媒体" },
        { id: "dev", name: "开发与 AI" },
      ],

      presetSites: [
        {
          id: "google",
          name: "Google",
          domain: "www.google.com",
          url: "https://www.google.com",
          category: "search",
          categoryName: "搜索引擎",
          icon: "🔍",
          colorBg: "rgba(66, 133, 244, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "youtube",
          name: "YouTube",
          domain: "www.youtube.com",
          url: "https://www.youtube.com",
          category: "media",
          categoryName: "视频流媒体",
          icon: "▶️",
          colorBg: "rgba(255, 0, 0, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "twitter",
          name: "Twitter / X",
          domain: "twitter.com",
          url: "https://twitter.com",
          category: "social",
          categoryName: "社交媒体",
          icon: "🐦",
          colorBg: "rgba(29, 155, 240, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "github",
          name: "GitHub",
          domain: "github.com",
          url: "https://github.com",
          category: "dev",
          categoryName: "开发者服务",
          icon: "🐙",
          colorBg: "rgba(110, 84, 148, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "chatgpt",
          name: "OpenAI / ChatGPT",
          domain: "chatgpt.com",
          url: "https://chatgpt.com",
          category: "dev",
          categoryName: "AI 服务",
          icon: "🤖",
          colorBg: "rgba(16, 163, 127, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "telegram",
          name: "Telegram Web",
          domain: "web.telegram.org",
          url: "https://web.telegram.org",
          category: "social",
          categoryName: "即时通讯",
          icon: "✈️",
          colorBg: "rgba(0, 136, 204, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "wikipedia",
          name: "Wikipedia",
          domain: "www.wikipedia.org",
          url: "https://www.wikipedia.org",
          category: "search",
          categoryName: "百科知识",
          icon: "🌐",
          colorBg: "rgba(128, 128, 128, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "netflix",
          name: "Netflix",
          domain: "www.netflix.com",
          url: "https://www.netflix.com",
          category: "media",
          categoryName: "视频流媒体",
          icon: "🎬",
          colorBg: "rgba(229, 9, 20, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "reddit",
          name: "Reddit",
          domain: "www.reddit.com",
          url: "https://www.reddit.com",
          category: "social",
          categoryName: "社区论坛",
          icon: "🤖",
          colorBg: "rgba(255, 69, 0, 0.15)",
          testing: false,
          result: null,
        },
        {
          id: "discord",
          name: "Discord",
          domain: "discord.com",
          url: "https://discord.com",
          category: "social",
          categoryName: "通讯社区",
          icon: "💬",
          colorBg: "rgba(88, 101, 242, 0.15)",
          testing: false,
          result: null,
        },
      ],
    };
  },
  computed: {
    totalSitesCount() {
      return this.presetSites.length;
    },
    filteredSites() {
      if (this.selectedCategory === "all") {
        return this.presetSites;
      }
      return this.presetSites.filter(
        (s) => s.category === this.selectedCategory,
      );
    },
    stats() {
      let total = 0;
      let success = 0;
      let fail = 0;
      let latencySum = 0;
      let latencyCount = 0;

      for (const site of this.presetSites) {
        if (site.result) {
          total++;
          if (site.result.success) {
            success++;
            if (site.result.latency !== null) {
              latencySum += site.result.latency;
              latencyCount++;
            }
          } else {
            fail++;
          }
        }
      }

      const avgLatency =
        latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0;
      return { total, success, fail, avgLatency };
    },
  },
  methods: {
    getCategoryCount(catId) {
      if (catId === "all") return this.presetSites.length;
      return this.presetSites.filter((s) => s.category === catId).length;
    },

    getLatencyClass(ms) {
      if (ms <= 200) return "lat-fast";
      if (ms <= 500) return "lat-medium";
      return "lat-slow";
    },

    async requestSiteTest(url) {
      const res = await fetch("/api/nodes/site-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          url: url,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }
      return await res.json();
    },

    async testSingleSite(site) {
      site.testing = true;
      site.result = null;
      try {
        const resData = await this.requestSiteTest(site.url);
        site.result = resData;
      } catch (err) {
        site.result = {
          url: site.url,
          status_code: null,
          latency: null,
          success: false,
          error: err.message || "网络测试异常",
        };
      } finally {
        site.testing = false;
      }
    },

    async runTestAll() {
      this.testingAll = true;
      this.testedCount = 0;

      for (const site of this.presetSites) {
        site.result = null;
        site.testing = false;
      }

      const pool = [...this.presetSites];
      const concurrency = 3;

      const worker = async () => {
        while (pool.length > 0) {
          const site = pool.shift();
          if (!site) break;
          site.testing = true;
          try {
            const resData = await this.requestSiteTest(site.url);
            site.result = resData;
          } catch (err) {
            site.result = {
              url: site.url,
              status_code: null,
              latency: null,
              success: false,
              error: err.message || "请求失败",
            };
          } finally {
            site.testing = false;
            this.testedCount++;
          }
        }
      };

      const tasks = [];
      for (let i = 0; i < concurrency; i++) {
        tasks.push(worker());
      }

      await Promise.all(tasks);
      this.testingAll = false;
    },

    async testCustomUrl() {
      if (!this.customUrl) return;
      this.customTesting = true;
      this.customResult = null;
      try {
        const resData = await this.requestSiteTest(this.customUrl);
        this.customResult = resData;
      } catch (err) {
        this.customResult = {
          url: this.customUrl,
          status_code: null,
          latency: null,
          success: false,
          error: err.message || "请求失败",
        };
      } finally {
        this.customTesting = false;
      }
    },
  },
};
</script>

<style scoped>
.control-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  gap: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.control-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.control-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-main);
}

.stats-summary {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.stat-badge {
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

.success-badge {
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.danger-badge {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.primary-badge {
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary);
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.custom-url-panel {
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.custom-url-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
  color: var(--text-main);
}

.custom-url-form {
  display: flex;
  gap: 0.75rem;
}

.custom-url-form input {
  flex: 1;
}

.custom-result-banner {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: var(--text-main);
}

.custom-result-banner.success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid var(--success);
}

.custom-result-banner.danger {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid var(--danger);
}

.result-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.result-status-tag {
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
}

.tag-success {
  background: var(--success);
  color: #fff;
}

.tag-danger {
  background: var(--danger);
  color: #fff;
}

.result-url {
  font-family: var(--font-mono, monospace);
  font-weight: 500;
}

.result-right {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.result-info {
  font-weight: 600;
}

.result-error {
  color: var(--danger);
}

.category-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.tab-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--btn-secondary-border, var(--border-color));
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text, var(--text-main));
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tab-btn:hover {
  background: var(--btn-secondary-hover-bg);
  color: var(--text-main);
}

.tab-btn.active {
  background: var(--primary);
  color: #ffffff;
  border-color: var(--primary);
  box-shadow: 0 0 12px var(--primary-glow);
}

.site-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
}

.site-card {
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.site-card:hover {
  transform: translateY(-2px);
  background: var(--bg-card-hover);
  border-color: var(--primary);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
}

.site-card.status-success {
  border-left: 4px solid var(--success);
}

.site-card.status-danger {
  border-left: 4px solid var(--danger);
}

.site-card.status-testing {
  border-left: 4px solid var(--primary);
}

.site-card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.site-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.site-emoji {
  font-size: 1.5rem;
}

.site-info {
  flex: 1;
}

.site-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
}

.site-domain {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.category-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 12px;
  background: var(--btn-secondary-bg);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.site-card-body {
  margin-bottom: 1rem;
}

.site-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  background: var(--btn-secondary-bg);
  border: 1px solid var(--border-color);
  padding: 0.75rem;
  border-radius: 8px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.metric-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.metric-value {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
}

.code-badge {
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.8rem;
}

.code-200 {
  background: rgba(16, 185, 129, 0.2);
  color: var(--success);
}

.code-warn {
  background: rgba(245, 158, 11, 0.2);
  color: var(--warning);
}

.latency-badge {
  font-size: 0.88rem;
  font-weight: 600;
}

.lat-fast {
  color: var(--success);
}

.lat-medium {
  color: var(--warning);
}

.lat-slow {
  color: var(--danger);
}

.site-error-msg {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--danger);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.site-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
}

.status-text {
  font-size: 0.82rem;
  font-weight: 500;
}

.text-idle {
  color: var(--text-muted);
}

.text-testing {
  color: var(--primary);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.text-success {
  color: var(--success);
}

.text-danger {
  color: var(--danger);
}

.spinner,
.spinner-small {
  display: inline-block;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: currentColor;
  animation: spin 0.8s linear infinite;
}

.spinner {
  width: 16px;
  height: 16px;
}

.spinner-small {
  width: 12px;
  height: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
