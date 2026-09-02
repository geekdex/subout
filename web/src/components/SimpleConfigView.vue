<template>
  <div class="view-container" style="overflow-y: auto; padding-right: 0.5rem">
    <!-- View Header matching global style -->
    <div
      class="view-header"
      style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 1rem;
      "
    >
      <div>
        <h1>极简配置管理</h1>
        <p>可视化配置 DNS、分流规则与入站端口，无需编辑复杂 JSON 结构。</p>
      </div>
      <div class="flex gap-2" style="align-items: center">
        <button
          type="button"
          class="btn btn-secondary"
          title="弹窗预览由当前设置生成的完整 sing-box JSON 配置"
          @click="openPreviewModal"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          查看配置预览
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="saving"
          @click="saveConfig(false)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
            ></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          {{ saving ? "保存中..." : "保存设置" }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="saving"
          @click="saveConfig(true)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          {{ saving ? "应用中..." : "保存并应用" }}
        </button>
      </div>
    </div>

    <!-- Section 1: Route & Proxy Modes -->
    <div class="panel">
      <div class="panel-title">
        <div class="flex items-center gap-2">
          <span>⚡ 分流规则模式</span>
          <span
            style="
              font-size: 0.85rem;
              font-weight: normal;
              color: var(--text-muted);
            "
          >
            控制不同网络流量的走向
          </span>
        </div>
      </div>

      <div class="option-grid">
        <div
          class="option-card"
          :class="{ active: form.route.mode === 'smart' }"
          @click="form.route.mode = 'smart'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🌟</span>
              <span class="option-title">智能分流</span>
            </div>
            <span class="badge badge-success">推荐</span>
          </div>
          <p class="option-desc">
            国内网站与 IP 自动直连，国外受限网站走代理加速。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.route.mode === 'global' }"
          @click="form.route.mode = 'global'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🌐</span>
              <span class="option-title">全局代理</span>
            </div>
          </div>
          <p class="option-desc">
            除局域网外，所有出站网络流量全部强制经由代理节点。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.route.mode === 'gfw' }"
          @click="form.route.mode = 'gfw'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🛡️</span>
              <span class="option-title">仅阻断域名</span>
            </div>
          </div>
          <p class="option-desc">
            仅在 GFW 阻断列表中的域名走代理，其余网络流量均直连。
          </p>
        </div>
      </div>

      <!-- Feature Switches -->
      <div class="switches-row">
        <label class="switch-item">
          <input v-model="form.route.block_ads" type="checkbox" />
          <span>🚫 广告与恶意追踪拦截 (geosite:category-ads-all)</span>
        </label>

        <label class="switch-item">
          <input v-model="form.route.bypass_lan" type="checkbox" />
          <span>🏠 局域网私有地址直连 (geoip:private)</span>
        </label>
      </div>

      <!-- Outbound Exit Strategy & Node Selection -->
      <div class="outbound-box">
        <div
          class="flex items-center justify-between flex-wrap gap-2"
          style="margin-bottom: 0.75rem"
        >
          <div class="flex items-center gap-2">
            <span
              style="
                font-weight: 600;
                font-size: 0.9rem;
                color: var(--text-main);
              "
              >🎯 默认出口策略与节点</span
            >
            <span v-if="enabledNodes.length > 0" class="badge badge-info">
              {{ enabledNodes.length }} 个可用节点
            </span>
            <span v-else class="badge badge-warning">暂无可用节点</span>
            <button
              type="button"
              class="btn-icon"
              title="刷新节点列表"
              :disabled="loadingNodes"
              style="
                padding: 2px 6px;
                font-size: 0.8rem;
                background: transparent;
                border: none;
                cursor: pointer;
                color: var(--text-muted);
              "
              @click="loadNodes"
            >
              🔄
            </button>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              class="btn"
              :class="isAutoTest ? '' : 'btn-secondary'"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="setOutboundMode('auto')"
            >
              ⚡ 自动测速优选 (AUTO-Test)
            </button>
            <button
              type="button"
              class="btn"
              :class="isDirect ? '' : 'btn-secondary'"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="setOutboundMode('direct')"
            >
              🟢 默认直连 (Direct)
            </button>
            <button
              type="button"
              class="btn"
              :class="!isAutoTest && !isDirect ? '' : 'btn-secondary'"
              style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
              @click="setOutboundMode('manual')"
            >
              📍 手动指定节点
            </button>
          </div>
        </div>

        <div
          v-if="isAutoTest"
          style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5"
        >
          💡
          系统将定期自动对所有已启用的订阅节点进行测速（URLTest），并将流量实时路由至最低延迟节点。
          <span
            v-if="bestNodeInfo"
            style="color: var(--success); font-weight: 500; margin-left: 4px"
          >
            (当前探测最优: {{ bestNodeInfo.tag }} -
            {{ bestNodeInfo.latency }}ms)
          </span>
        </div>

        <div
          v-else-if="isDirect"
          style="
            font-size: 0.8rem;
            color: var(--text-muted);
            line-height: 1.5;
            padding: 0.5rem 0.75rem;
            background: rgba(16, 185, 129, 0.08);
            border: 1px solid rgba(16, 185, 129, 0.2);
            border-radius: 6px;
          "
        >
          🟢
          <strong>当前为默认直连模式</strong
          >：网络流量默认全部直接连接，无需代理节点，适用于未导入节点或无需代理时的安全直连环境。
        </div>

        <div v-else style="margin-top: 0.5rem">
          <div
            v-if="enabledNodes.length > 0"
            class="input-group"
            style="margin-bottom: 0"
          >
            <div
              class="flex items-center justify-between"
              style="margin-bottom: 0.35rem"
            >
              <label style="font-size: 0.85rem; margin-bottom: 0"
                >指定出口代理节点</label
              >
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="btn-text"
                  :disabled="loadingNodes || isTestingNodes"
                  title="对可用节点进行并发延迟测速并刷新显示"
                  style="
                    font-size: 0.75rem;
                    padding: 2px 7px;
                    border-radius: 4px;
                    background: rgba(99, 102, 241, 0.1);
                    color: var(--primary);
                    border: 1px solid rgba(99, 102, 241, 0.25);
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                  "
                  @click="testAllNodesLatency"
                >
                  <span
                    v-if="isTestingNodes"
                    class="spinner-small"
                    style="margin-right: 3px"
                  ></span>
                  <span v-else style="margin-right: 3px">⚡</span>
                  {{
                    isTestingNodes
                      ? `测速中 (${testedNodeCount}/${enabledNodes.length})...`
                      : "节点测速"
                  }}
                </button>
                <input
                  v-if="enabledNodes.length > 6"
                  v-model="nodeSearchKeyword"
                  type="text"
                  class="input-control"
                  style="
                    padding: 0.2rem 0.5rem;
                    font-size: 0.75rem;
                    width: 150px;
                  "
                  placeholder="🔍 快速过滤节点..."
                />
              </div>
            </div>

            <select
              v-model="form.route.default_outbound"
              class="input-control"
              style="width: 100%"
            >
              <option value="AUTO-Test">⚡ 自动测速优选 (AUTO-Test)</option>
              <option value="direct">
                🟢 默认直连 (direct - 流量直接连接)
              </option>
              <option value="proxy">🎯 全部节点选择组 (proxy 策略组)</option>
              <optgroup
                v-if="filteredNodes.length > 0"
                label="已同步的可用节点列表"
              >
                <option
                  v-for="node in filteredNodes"
                  :key="node.id"
                  :value="node.tag"
                >
                  📍 {{ node.tag }} [{{
                    (node.node_type || "").toUpperCase()
                  }}]{{ formatLatency(node) }}
                </option>
              </optgroup>
              <optgroup v-else-if="nodeSearchKeyword.trim()" label="搜索结果">
                <option disabled value="">
                  未找到匹配 "{{ nodeSearchKeyword }}" 的节点
                </option>
              </optgroup>
            </select>
          </div>

          <div
            v-else
            style="
              padding: 0.85rem 1rem;
              border-radius: 8px;
              background: rgba(245, 158, 11, 0.08);
              border: 1px solid rgba(245, 158, 11, 0.25);
              font-size: 0.85rem;
            "
          >
            <div
              class="flex items-center gap-2"
              style="color: var(--warning); font-weight: 500"
            >
              <span>⚠️ 节点池暂无可用的代理节点</span>
            </div>
            <p
              style="
                margin: 0.35rem 0 0.75rem 0;
                color: var(--text-muted);
                font-size: 0.8rem;
                line-height: 1.4;
              "
            >
              未检测到已启用的订阅节点或自定义节点。您可以点击下方按钮一键同步已有订阅，或前往添加新的订阅源。
            </p>
            <div class="flex gap-2 items-center flex-wrap">
              <button
                type="button"
                class="btn btn-primary"
                style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
                :disabled="isSyncingSubs"
                @click="syncSubscriptions"
              >
                {{ isSyncingSubs ? "正在同步订阅..." : "🔄 一键同步所有订阅" }}
              </button>
              <a
                href="#subscriptions"
                class="btn btn-secondary"
                style="
                  padding: 0.35rem 0.75rem;
                  font-size: 0.8rem;
                  text-decoration: none;
                "
              >
                ➕ 前往订阅管理
              </a>
              <a
                href="#nodes"
                class="btn btn-secondary"
                style="
                  padding: 0.35rem 0.75rem;
                  font-size: 0.8rem;
                  text-decoration: none;
                "
              >
                ✏️ 自定义节点
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: DNS Settings -->
    <div class="panel">
      <div class="panel-title">
        <div class="flex items-center gap-2">
          <span>🌐 域名解析 (DNS)</span>
          <span
            style="
              font-size: 0.85rem;
              font-weight: normal;
              color: var(--text-muted);
            "
          >
            配置国内解析与国外防污染加密 DNS
          </span>
        </div>
      </div>

      <div class="option-grid">
        <div
          class="option-card"
          :class="{ active: form.dns.mode === 'preset_fakeip' }"
          @click="selectDnsPreset('preset_fakeip')"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">⚡</span>
              <span class="option-title">LocalDNS + FakeIP</span>
            </div>
            <span class="badge badge-success">推荐</span>
          </div>
          <p class="option-desc">
            国内域名直连 LocalDNS (223.5.5.5) 高速解析，代理流量全走 FakeIP
            极速响应并防 DNS 污染与泄漏。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.dns.mode === 'preset_domestic_foreign' }"
          @click="selectDnsPreset('preset_domestic_foreign')"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🚀</span>
              <span class="option-title">阿里 + Cloudflare DoH</span>
            </div>
          </div>
          <p class="option-desc">
            国内使用 223.5.5.5，国外走 Cloudflare DoH 加密防污染解析。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.dns.mode === 'fast_public' }"
          @click="selectDnsPreset('fast_public')"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🌐</span>
              <span class="option-title">腾讯 + Google DoH</span>
            </div>
          </div>
          <p class="option-desc">
            国内使用 119.29.29.29，国外走 Google 8.8.8.8 加密解析。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.dns.mode === 'custom' }"
          @click="selectDnsPreset('custom')"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">✍️</span>
              <span class="option-title">自定义 DNS</span>
            </div>
          </div>
          <p class="option-desc">
            手动指定自定义的国内主 DNS 与国外防污染 DNS 地址。
          </p>
        </div>
      </div>

      <div
        v-if="form.dns.mode === 'custom'"
        class="grid-2"
        style="margin-top: 1.25rem"
      >
        <div class="input-group" style="margin-bottom: 0">
          <label>国内 DNS 服务器</label>
          <input
            v-model="form.dns.domestic_dns"
            type="text"
            class="input-control"
            placeholder="例如: 223.5.5.5"
          />
        </div>
        <div class="input-group" style="margin-bottom: 0">
          <label>国外防污染 DNS (DoH / IP)</label>
          <input
            v-model="form.dns.foreign_dns"
            type="text"
            class="input-control"
            placeholder="例如: https://1.1.1.1/dns-query"
          />
        </div>
      </div>
    </div>

    <!-- Section 3: Inbound Settings -->
    <div class="panel">
      <div class="panel-title">
        <div class="flex items-center gap-2">
          <span>🔌 代理入站方式</span>
          <span
            style="
              font-size: 0.85rem;
              font-weight: normal;
              color: var(--text-muted);
            "
          >
            客户端或系统接入本地代理的方式
          </span>
        </div>
      </div>

      <div
        class="option-grid"
        style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))"
      >
        <div
          class="option-card"
          :class="{ active: form.inbound.inbound_type === 'tun' }"
          @click="form.inbound.inbound_type = 'tun'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🛡️</span>
              <span class="option-title">TUN 虚拟网卡 (整机透明代理)</span>
            </div>
            <span class="badge badge-success">推荐</span>
          </div>
          <p class="option-desc">
            创建虚拟网卡接管所有系统网络流量（需要管理员 / Root 权限）。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.inbound.inbound_type === 'mixed' }"
          @click="form.inbound.inbound_type = 'mixed'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🔌</span>
              <span class="option-title">混合端口 (Mixed HTTP + SOCKS5)</span>
            </div>
            <span class="badge badge-info">免提权</span>
          </div>
          <p class="option-desc">
            在本地端口监听，只需在系统或浏览器配置代理端口即可使用。
          </p>
        </div>
      </div>

      <div
        v-if="form.inbound.inbound_type === 'tun'"
        class="inbound-config-row"
        style="flex-direction: column; gap: 0.75rem"
      >
        <div class="input-group" style="margin-bottom: 0; min-width: 240px">
          <label>TUN 堆栈类型</label>
          <select v-model="form.inbound.tun_stack" class="input-control">
            <option value="system">System (原生内核栈，推荐)</option>
            <option value="gvisor">gVisor (用户态沙盒)</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        <div
          style="
            font-size: 0.8rem;
            color: var(--text-muted);
            line-height: 1.4;
            padding: 0.5rem 0.75rem;
            background: rgba(99, 102, 241, 0.05);
            border-radius: 6px;
            border: 1px solid rgba(99, 102, 241, 0.15);
          "
        >
          💡 <strong>权限提示</strong>：Linux 与 macOS 下创建 TUN
          网卡需要系统管理员 (Root)
          权限。启动服务或应用配置时，系统将直接在弹窗中提示输入 Sudo
          密码进行即时授权运行（Windows 系统无需输入密码）。
        </div>
      </div>

      <div v-else class="inbound-config-row">
        <div class="input-group" style="margin-bottom: 0; min-width: 160px">
          <label>混合监听端口</label>
          <input
            v-model.number="form.inbound.mixed_port"
            type="number"
            class="input-control"
            placeholder="2080"
          />
        </div>

        <div
          class="input-group"
          style="margin-bottom: 0; align-self: flex-end; padding-bottom: 0.5rem"
        >
          <label class="switch-item" style="cursor: pointer">
            <input v-model="form.inbound.allow_lan" type="checkbox" />
            <span>允许局域网设备连接 (绑定 0.0.0.0)</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Section 4: Log Level Settings -->
    <div class="panel">
      <div class="panel-title">
        <div class="flex items-center gap-2">
          <span>📝 运行日志级别</span>
          <span
            style="
              font-size: 0.85rem;
              font-weight: normal;
              color: var(--text-muted);
            "
          >
            控制 sing-box 核心日志的详细程度与输出级别
          </span>
        </div>
      </div>

      <div class="option-grid">
        <div
          class="option-card"
          :class="{ active: form.log.level === 'info' }"
          @click="form.log.level = 'info'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">ℹ️</span>
              <span class="option-title">Info (标准信息)</span>
            </div>
            <span class="badge badge-success">推荐</span>
          </div>
          <p class="option-desc">
            记录基本启动、分流规则命中与连接事件，适合日常运行监控。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.log.level === 'warn' }"
          @click="form.log.level = 'warn'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">⚠️</span>
              <span class="option-title">Warn (警告与错误)</span>
            </div>
            <span class="badge badge-info">精简静音</span>
          </div>
          <p class="option-desc">
            仅记录网络波动警告与异常错误，大幅减少日常刷屏日志。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.log.level === 'error' }"
          @click="form.log.level = 'error'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🔴</span>
              <span class="option-title">Error (仅严重错误)</span>
            </div>
          </div>
          <p class="option-desc">
            极致静音模式，仅在内核遭遇连接中断或核心故障时输出日志。
          </p>
        </div>

        <div
          class="option-card"
          :class="{ active: form.log.level === 'debug' }"
          @click="form.log.level = 'debug'"
        >
          <div class="option-card-header">
            <div class="flex items-center gap-2">
              <span class="option-icon">🔍</span>
              <span class="option-title">Debug (详细调试)</span>
            </div>
          </div>
          <p class="option-desc">
            输出详尽的路由、握手与协议调度内部信息，用于排查连接异常。
          </p>
        </div>
      </div>

      <!-- Switches for timestamp and disabled -->
      <div class="log-switches-row">
        <label class="switch-item">
          <input v-model="form.log.timestamp" type="checkbox" />
          <span>⏰ 在日志中包含精确时间戳 (timestamp)</span>
        </label>

        <label class="switch-item">
          <input v-model="form.log.disabled" type="checkbox" />
          <span>🚫 禁用内核日志输出 (disabled，仅保留应用系统事件)</span>
        </label>
      </div>

      <!-- Advanced log level selector & custom log output file -->
      <div
        class="flex items-center justify-between flex-wrap gap-2"
        style="
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border-color);
          font-size: 0.85rem;
        "
      >
        <div class="flex items-center gap-2 text-muted">
          <span>更多特定日志级别:</span>
          <select
            v-model="form.log.level"
            class="input-control"
            style="width: 150px; padding: 0.25rem 0.5rem; font-size: 0.82rem"
          >
            <option value="trace">Trace (最深追踪)</option>
            <option value="debug">Debug (调试)</option>
            <option value="info">Info (标准)</option>
            <option value="warn">Warn (警告)</option>
            <option value="error">Error (错误)</option>
            <option value="fatal">Fatal (致命故障)</option>
            <option value="panic">Panic (紧急崩塌)</option>
          </select>
        </div>

        <div
          class="flex items-center gap-2"
          style="flex: 1; min-width: 280px; justify-content: flex-end"
        >
          <span style="color: var(--text-muted); font-size: 0.82rem"
            >输出文件:</span
          >
          <input
            v-model="form.log.output"
            type="text"
            class="input-control"
            placeholder="留空输出到控制台与面板 (例如: sing-box.log)"
            style="
              max-width: 280px;
              padding: 0.25rem 0.5rem;
              font-size: 0.82rem;
            "
          />
        </div>
      </div>

      <div
        style="
          margin-top: 0.5rem;
          font-size: 0.8rem;
          color: var(--text-muted);
        "
      >
        💡 提示：核心将严格根据配置级别进行日志记录；生效后可在「<a
          href="#serviceLogs"
          style="color: var(--primary); text-decoration: underline"
          >核心日志</a
        >」页面查看实时汇总。
      </div>
    </div>

    <!-- Preview Modal matching global modal standard with Foldable Tree View and Raw View -->
    <div class="modal" :class="{ active: showPreviewModal }">
      <div
        class="modal-card"
        style="
          max-width: 860px;
          width: 94%;
          max-height: 88vh;
          display: flex;
          flex-direction: column;
        "
      >
        <div
          class="modal-header"
          style="
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--border-color);
          "
        >
          <div class="flex items-center gap-2">
            <span>📜 sing-box 配置预览</span>
            <span class="badge badge-secondary" style="font-size: 0.75rem"
              >基于当前小白设置实时生成</span
            >
          </div>
          <button
            class="close-btn"
            style="
              background: none;
              border: none;
              color: var(--text-muted);
              cursor: pointer;
            "
            @click="showPreviewModal = false"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Preview Controls & Mode Toolbar -->
        <div
          class="flex items-center justify-between flex-wrap gap-2"
          style="
            padding: 0.6rem 0;
            border-bottom: 1px solid var(--border-color);
            font-size: 0.82rem;
          "
        >
          <!-- Left: View Mode Toggle -->
          <div class="flex items-center gap-2">
            <span style="color: var(--text-muted)">展示形式:</span>
            <div class="btn-group" style="display: inline-flex">
              <button
                type="button"
                class="btn"
                :class="
                  previewViewMode === 'tree' ? 'btn-primary' : 'btn-secondary'
                "
                style="
                  padding: 0.25rem 0.65rem;
                  font-size: 0.8rem;
                  border-top-right-radius: 0;
                  border-bottom-right-radius: 0;
                "
                @click="previewViewMode = 'tree'"
              >
                🌲 树状折叠
              </button>
              <button
                type="button"
                class="btn"
                :class="
                  previewViewMode === 'raw' ? 'btn-primary' : 'btn-secondary'
                "
                style="
                  padding: 0.25rem 0.65rem;
                  font-size: 0.8rem;
                  border-top-left-radius: 0;
                  border-bottom-left-radius: 0;
                "
                @click="previewViewMode = 'raw'"
              >
                📄 原始 JSON
              </button>
            </div>

            <!-- Quick Tree Folding Shortcuts (Only visible in tree mode) -->
            <template v-if="previewViewMode === 'tree'">
              <span style="color: var(--border-color); margin: 0 4px">|</span>
              <button
                type="button"
                class="btn btn-secondary"
                style="padding: 0.25rem 0.55rem; font-size: 0.78rem"
                title="展开全部 JSON 配置节点"
                @click="expandAllPreview"
              >
                ➕ 全部展开
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                style="padding: 0.25rem 0.55rem; font-size: 0.78rem"
                title="折叠为仅顶层"
                @click="collapseAllPreview"
              >
                ➖ 全部折叠
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                style="padding: 0.25rem 0.55rem; font-size: 0.78rem"
                title="展开至二级常用节点"
                @click="expandDepthPreview(2)"
              >
                🔍 展开常用 (2级)
              </button>
            </template>
          </div>

          <!-- Right: Search Filter Input in Tree Mode -->
          <div
            v-if="previewViewMode === 'tree'"
            class="flex items-center gap-2"
          >
            <div
              style="
                position: relative;
                display: inline-flex;
                align-items: center;
              "
            >
              <input
                v-model="previewSearch"
                type="text"
                class="input-control"
                style="
                  padding: 0.22rem 1.6rem 0.22rem 0.55rem;
                  font-size: 0.78rem;
                  width: 170px;
                "
                placeholder="🔍 搜索节点 / 规则..."
              />
              <button
                v-if="previewSearch"
                type="button"
                style="
                  position: absolute;
                  right: 4px;
                  background: none;
                  border: none;
                  color: var(--text-muted);
                  cursor: pointer;
                  font-size: 0.75rem;
                  padding: 2px 4px;
                "
                @click="previewSearch = ''"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <!-- Section Overview Quick Tags -->
        <div
          v-if="previewSections.length > 0"
          class="flex items-center gap-2 flex-wrap"
          style="
            padding: 0.4rem 0;
            font-size: 0.75rem;
            color: var(--text-muted);
          "
        >
          <span>包含模块:</span>
          <span
            v-for="sec in previewSections"
            :key="sec.name"
            class="badge badge-info"
            style="font-size: 0.72rem; padding: 1px 6px"
          >
            {{ sec.name }}{{ sec.count ? ` (${sec.count})` : "" }}
          </span>
        </div>

        <div style="flex: 1; min-height: 0; padding: 0.5rem 0">
          <div
            v-if="isGeneratingPreview"
            style="
              padding: 3rem;
              text-align: center;
              color: var(--text-muted);
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.5rem;
            "
          >
            <span class="spinner-small"></span>
            <span>正在基于当前设置实时生成配置预览...</span>
          </div>

          <!-- Tree View with Folding and Expansion -->
          <div
            v-else-if="previewViewMode === 'tree'"
            class="tree-view-wrapper"
            style="
              height: 100%;
              max-height: 52vh;
              overflow-y: auto;
              background: #1e1e2e;
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 6px;
              padding: 0.75rem 0.5rem;
              box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.25);
            "
          >
            <json-tree-view
              :data="generatedPreview"
              :expand-depth="previewExpandDepth"
              :expand-signal="expandSignal"
              :collapse-signal="collapseSignal"
              :search-query="previewSearch"
            />
          </div>

          <!-- Raw JSON View -->
          <pre
            v-else
            class="log-console"
            style="
              height: 100%;
              max-height: 52vh;
              overflow-y: auto;
              font-size: 0.85rem;
              margin: 0;
              border-radius: 6px;
              background: #1e1e2e;
              box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.25);
            "
            >{{ JSON.stringify(generatedPreview, null, 2) }}</pre>
        </div>

        <div
          class="modal-footer"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 0.75rem;
            border-top: 1px solid var(--border-color);
          "
        >
          <div class="flex gap-2">
            <button class="btn btn-secondary" @click="copyPreview">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                style="margin-right: 2px"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                />
              </svg>
              复制完整 JSON
            </button>
            <button class="btn btn-secondary" @click="downloadPreview">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                style="margin-right: 2px"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              导出为文件
            </button>
          </div>
          <button class="btn btn-secondary" @click="showPreviewModal = false">
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import JsonTreeView from "./JsonTreeView.vue";
import {
  API_BASE,
  token,
  showToast,
  confirmDialog,
  kernelInfo,
  serviceStatus,
  fetchServiceStatus,
  promptDialog,
  sessionSudoPassword,
  setSessionSudoPassword,
  promptSudoPassword,
  systemModeInfo,
} from "../store.js";

const saving = ref(false);
const showPreviewModal = ref(false);
const generatedPreview = ref({});
const nodesList = ref([]);
const loadingNodes = ref(false);
const isSyncingSubs = ref(false);
const nodeSearchKeyword = ref("");

// Preview modal view mode and tree controls
const previewViewMode = ref("tree"); // "tree" | "raw"
const previewExpandDepth = ref(2);
const expandSignal = ref(0);
const collapseSignal = ref(0);
const previewSearch = ref("");

const expandAllPreview = () => {
  expandSignal.value++;
};

const collapseAllPreview = () => {
  previewExpandDepth.value = 1;
  collapseSignal.value++;
};

const expandDepthPreview = (depth) => {
  previewExpandDepth.value = depth;
  collapseSignal.value++;
};

const previewSections = computed(() => {
  if (!generatedPreview.value || typeof generatedPreview.value !== "object")
    return [];
  const secs = [];
  if (generatedPreview.value.dns) {
    const srvCount = Array.isArray(generatedPreview.value.dns.servers)
      ? generatedPreview.value.dns.servers.length
      : 0;
    secs.push({ name: "dns", count: `${srvCount} 服务器` });
  }
  if (generatedPreview.value.inbounds) {
    const inCount = Array.isArray(generatedPreview.value.inbounds)
      ? generatedPreview.value.inbounds.length
      : 0;
    secs.push({ name: "inbounds", count: `${inCount} 入站` });
  }
  if (generatedPreview.value.outbounds) {
    const outCount = Array.isArray(generatedPreview.value.outbounds)
      ? generatedPreview.value.outbounds.length
      : 0;
    secs.push({ name: "outbounds", count: `${outCount} 出站/节点` });
  }
  if (generatedPreview.value.route) {
    const ruleCount = Array.isArray(generatedPreview.value.route.rules)
      ? generatedPreview.value.route.rules.length
      : 0;
    secs.push({ name: "route", count: `${ruleCount} 路由规则` });
  }
  return secs;
});

const enabledNodes = computed(() => {
  const list = Array.isArray(nodesList.value) ? nodesList.value : [];
  return list.filter((n) => n && n.enabled);
});

const filteredNodes = computed(() => {
  if (!nodeSearchKeyword.value.trim()) {
    return enabledNodes.value;
  }
  const kw = nodeSearchKeyword.value.trim().toLowerCase();
  return enabledNodes.value.filter(
    (n) =>
      (n.tag || "").toLowerCase().includes(kw) ||
      (n.node_type || "").toLowerCase().includes(kw) ||
      (n.server || "").toLowerCase().includes(kw),
  );
});

const formatLatency = (node) => {
  const lat = node.last_web_latency || node.last_tcp_latency;
  if (lat && lat > 0) {
    return ` (⚡ ${lat}ms)`;
  }
  return "";
};

const bestNodeInfo = computed(() => {
  const tested = enabledNodes.value
    .map((n) => ({
      tag: n.tag,
      latency: n.last_web_latency || n.last_tcp_latency || null,
    }))
    .filter((n) => n.latency !== null && n.latency > 0)
    .sort((a, b) => a.latency - b.latency);
  return tested.length > 0 ? tested[0] : null;
});

const isTestingNodes = ref(false);
const testedNodeCount = ref(0);

const testAllNodesLatency = async () => {
  if (enabledNodes.value.length === 0) return;
  isTestingNodes.value = true;
  testedNodeCount.value = 0;

  try {
    const nodeIds = enabledNodes.value.map((n) => n.id);
    const res = await fetch(`${API_BASE}/api/nodes/ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        ids: nodeIds,
        test_type: "both",
      }),
    });

    if (res.ok) {
      const results = await res.json();
      const resultMap = new Map(results.map((r) => [r.id, r]));
      nodesList.value.forEach((node) => {
        const item = resultMap.get(node.id);
        if (item) {
          if (item.web_latency !== undefined && item.web_latency !== null) {
            node.last_web_latency = item.web_latency;
          }
          if (item.tcp_latency !== undefined && item.tcp_latency !== null) {
            node.last_tcp_latency = item.tcp_latency;
          }
        }
      });
      testedNodeCount.value = results.length;
      showToast(`已完成 ${results.length} 个节点的延迟测速！`);
    } else {
      showToast("节点测速请求失败", "danger");
    }
  } catch (e) {
    showToast(`节点测速异常: ${e.message || e}`, "danger");
  } finally {
    isTestingNodes.value = false;
  }
};

const isDirect = computed(() => form.route.default_outbound === "direct");
const isAutoTest = computed(
  () =>
    form.route.default_outbound === "AUTO-Test" || !form.route.default_outbound,
);

const setOutboundMode = (mode) => {
  if (mode === "direct") {
    form.route.default_outbound = "direct";
  } else if (mode === "auto") {
    form.route.default_outbound = "AUTO-Test";
  } else {
    if (
      form.route.default_outbound === "AUTO-Test" ||
      form.route.default_outbound === "direct"
    ) {
      form.route.default_outbound =
        enabledNodes.value.length > 0 ? enabledNodes.value[0].tag : "proxy";
    }
  }
};

const form = reactive({
  log: {
    level: "info",
    timestamp: true,
    disabled: false,
    output: "",
  },
  dns: {
    mode: "preset_fakeip",
    domestic_dns: "223.5.5.5",
    foreign_dns: "fakeip",
  },
  inbound: {
    inbound_type: "tun",
    mixed_port: 2080,
    allow_lan: false,
    tun_stack: "system",
    tun_auto_route: true,
  },
  route: {
    mode: "smart",
    block_ads: true,
    bypass_lan: true,
    default_outbound: "AUTO-Test",
  },
});

const selectDnsPreset = (preset) => {
  form.dns.mode = preset;
  if (preset === "preset_fakeip") {
    form.dns.domestic_dns = "223.5.5.5";
    form.dns.foreign_dns = "fakeip";
  } else if (preset === "preset_domestic_foreign") {
    form.dns.domestic_dns = "223.5.5.5";
    form.dns.foreign_dns = "https://1.1.1.1/dns-query";
  } else if (preset === "fast_public") {
    form.dns.domestic_dns = "119.29.29.29";
    form.dns.foreign_dns = "https://8.8.8.8/dns-query";
  }
};

const loadNodes = async () => {
  loadingNodes.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/nodes?limit=100000`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      nodesList.value = Array.isArray(data) ? data : data.nodes || [];
    }
  } catch (e) {
    console.error("加载节点列表失败", e);
  } finally {
    loadingNodes.value = false;
  }
};

const syncSubscriptions = async () => {
  isSyncingSubs.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/subscriptions/fetch-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      showToast("所有订阅源节点已成功同步更新！");
      await loadNodes();
    } else {
      showToast("订阅同步请求失败", "danger");
    }
  } catch {
    showToast("同步订阅网络请求出错", "danger");
  } finally {
    isSyncingSubs.value = false;
  }
};

const loadSimpleConfig = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/simple-config`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.config) {
        if (data.config.log) {
          if (data.config.log.level) {
            form.log.level = data.config.log.level;
          }
          form.log.timestamp = data.config.log.timestamp !== false;
          form.log.disabled = !!data.config.log.disabled;
          form.log.output = data.config.log.output || "";
        }
        Object.assign(form.dns, data.config.dns);
        Object.assign(form.inbound, data.config.inbound);
        Object.assign(form.route, data.config.route);
        if (!form.route.default_outbound) {
          form.route.default_outbound = "AUTO-Test";
        }
      }
      generatedPreview.value = data.generated || {};
    }
  } catch {
    showToast("载入极简配置失败", "danger");
  }
};

const saveConfig = async (apply = false, customSudoPass = null) => {
  let sudoPass =
    typeof customSudoPass === "string"
      ? customSudoPass.trim()
      : sessionSudoPassword.value || null;

  let doTakeover = false;

  if (apply) {
    if (
      serviceStatus.value.conflicting_processes &&
      serviceStatus.value.conflicting_processes.length > 0
    ) {
      const pids = serviceStatus.value.conflicting_processes
        .map((p) => p.pid)
        .join(", ");
      const ok = await confirmDialog(
        `检测到系统中正在运行外部 sing-box 进程 (PID: ${pids})。\n\n是否立即一键接管外部服务并保存应用当前配置？\n\n💡 提示：Subout 将自动终止并禁用外部服务开机争抢，由 Subout 全权托管代理。`,
        {
          title: "一键接管并应用",
          confirmText: "一键接管并应用",
        },
      );
      if (!ok) return;
      doTakeover = true;
    }
    if (!kernelInfo.value.is_installed) {
      showToast(
        "sing-box 内核尚未安装，无法直接启动服务。请先前往仪表盘下载安装内核。",
        "danger",
      );
      return;
    }

    // Proactively check if TUN mode is enabled on Linux/macOS when not root and no sudo pass cached
    const isUnix =
      systemModeInfo.value.is_linux ||
      systemModeInfo.value.os === "linux" ||
      systemModeInfo.value.os === "macos" ||
      systemModeInfo.value.os === "darwin";
    const isRoot = systemModeInfo.value.is_root;
    const hasSaved =
      !!sessionSudoPassword.value || !!systemModeInfo.value?.has_saved_sudo;
    if (
      (form.inbound.inbound_type === "tun" || doTakeover) &&
      isUnix &&
      !isRoot &&
      !hasSaved &&
      !sudoPass
    ) {
      const inputPass = await promptSudoPassword(
        doTakeover
          ? "🛡️ 接管外部系统服务需要系统管理员 (root) 权限。\n\n请输入系统的 Sudo / 管理员密码以授权接管（保存后将免去重复输入）："
          : "🛡️ 开启 TUN 虚拟网卡需要系统管理员 (root) 权限以接管系统流量。\n\n请输入系统的 Sudo / 管理员密码进行提权授权（保存后将免去重复输入）：",
      );
      if (inputPass === null) {
        showToast("已取消管理员提权授权，未应用配置", "warning");
        return;
      }
      sudoPass = inputPass;
      setSessionSudoPassword(inputPass);
    }
  }

  saving.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/simple-config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        config: form,
        apply: !!apply,
        sudo_pass: sudoPass,
        takeover: doTakeover,
      }),
      signal: AbortSignal.timeout(18000),
    });

    if (res.ok) {
      const data = await res.json();
      generatedPreview.value = data.generated || {};
      showToast(data.message || "配置已保存！");
      if (sudoPass) {
        setSessionSudoPassword(sudoPass);
      }
      if (apply) {
        await fetchServiceStatus();
      }
    } else {
      const err = await res.text();
      const errLower = err.toLowerCase();
      const isWindows =
        systemModeInfo.value?.os === "windows" ||
        err.includes("Windows") ||
        err.includes("以管理员身份运行");
      const isPermissionErr =
        err.includes("Sudo 密码") ||
        err.includes("root") ||
        err.includes("权限") ||
        err.includes("TUN 模式") ||
        errLower.includes("tunsetiff") ||
        errLower.includes("operation not permitted") ||
        errLower.includes("permission denied");

      if (apply && isPermissionErr && !isWindows) {
        setSessionSudoPassword("");
        if (systemModeInfo.value) {
          systemModeInfo.value.has_saved_sudo = false;
        }
        const isWrongPass =
          err.includes("密码不正确") ||
          errLower.includes("incorrect password") ||
          errLower.includes("authentication failure");
        const promptMsg = isWrongPass
          ? "❌ 输入的 Sudo 密码不正确或已失效，请重新输入系统管理员 (root) 密码（保存后将免去重复输入）："
          : "🛡️ 应用并启动 TUN 模式需要系统管理员 (root) 权限。\n\n请输入系统的 Sudo / 管理员密码以继续（保存后将免去重复输入）：";

        const pass = await promptDialog(promptMsg, "", {
          title: "需要管理员权限",
          confirmText: "授权并应用",
          inputType: "password",
          inputPlaceholder: "输入系统 Sudo 密码",
        });
        if (pass !== null && pass.trim()) {
          setSessionSudoPassword(pass.trim());
          await saveConfig(true, pass.trim());
          return;
        } else {
          showToast("已取消管理员提权授权", "warning");
          return;
        }
      }
      showToast(`保存失败: ${err}`, "danger");
    }
  } catch (e) {
    showToast(`保存配置请求出错: ${e.message || e}`, "danger");
  } finally {
    saving.value = false;
  }
};

const isGeneratingPreview = ref(false);

const openPreviewModal = async () => {
  showPreviewModal.value = true;
  isGeneratingPreview.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/simple-config/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      generatedPreview.value = await res.json();
    }
  } catch (e) {
    console.error("生成预览失败", e);
  } finally {
    isGeneratingPreview.value = false;
  }
};

const copyPreview = () => {
  const jsonStr = JSON.stringify(generatedPreview.value, null, 2);
  navigator.clipboard.writeText(jsonStr);
  showToast("配置内容已复制到剪贴板");
};

const downloadPreview = () => {
  const jsonStr = JSON.stringify(generatedPreview.value, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sing-box-simple-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("配置已下载为 JSON 文件");
};

onMounted(() => {
  loadSimpleConfig();
  loadNodes();
});
</script>

<style scoped>
.option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.option-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.option-card:hover {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.04);
  transform: translateY(-2px);
}

.option-card.active {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.08);
  box-shadow: 0 0 0 1px var(--primary);
}

.option-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.option-icon {
  font-size: 1.2rem;
}

.option-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-main);
}

.option-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.45;
  margin: 0;
}

.switches-row,
.log-switches-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.switch-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-main);
  cursor: pointer;
}

.outbound-box {
  margin-top: 1.25rem;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
}

.inbound-config-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.spinner-small {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid rgba(99, 102, 241, 0.3);
  border-radius: 50%;
  border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
