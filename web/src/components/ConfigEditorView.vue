<template>
  <div class="view-container">
    <div v-if="!isEditing" class="view-header">
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 1rem;
          width: 100%;
        "
      >
        <div>
          <h1>配置管理</h1>
          <p>
            管理您的分流订阅配置文件。您可以创建不同的配置模板进行编辑，并一键启用该配置。
          </p>
        </div>
        <div v-if="!isEditing" class="flex gap-2">
          <button class="btn" @click="createNewConfigItem">➕ 新建配置</button>
        </div>
      </div>
    </div>

    <div class="view-body">
      <!-- 运行配置卡片 -->
      <div
        v-if="!isEditing"
        class="panel"
        style="margin-bottom: 1.5rem; padding: 1.25rem"
      >
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
          "
        >
          <div style="display: flex; align-items: center; gap: 0.75rem">
            <div
              style="
                background: rgba(99, 102, 241, 0.1);
                color: var(--primary);
                padding: 0.5rem;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
              "
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600">
                运行配置
              </h3>
              <p
                style="
                  margin: 2px 0 0 0;
                  font-size: 0.85rem;
                  color: var(--text-muted);
                "
              >
                当前运行配置：<span
                  v-if="runningConfig.config_id"
                  style="font-weight: 600; color: var(--primary)"
                  >#{{ runningConfig.config_id }} ({{
                    getRunningConfigName(runningConfig.config_id)
                  }})</span
                ><span v-else style="color: var(--text-muted)">未设定</span> |
                配置文件：<span
                  v-if="runningConfig.config_path"
                  style="
                    font-family: var(--font-mono);
                    font-size: 0.8rem;
                    background: rgba(0, 0, 0, 0.15);
                    padding: 1px 4px;
                    border-radius: 3px;
                  "
                  >{{ runningConfig.config_path }}</span
                ><span v-else style="color: var(--text-muted)">未设定</span>
              </p>
            </div>
          </div>
          <div>
            <button
              class="btn btn-secondary"
              style="display: flex; align-items: center; gap: 0.25rem"
              @click="openRunningConfigModal"
            >
              ⚙️ 运行设置
            </button>
          </div>
        </div>
      </div>

      <!-- 1. Config List Table Page -->
      <div v-if="!isEditing" class="panel fill-height">
        <div class="panel-title">
          <span>已保存的配置版本</span>
        </div>
        <div class="panel-table-wrapper">
          <table>
            <thead>
              <tr>
                <th style="width: 80px">ID</th>
                <th>配置备注 / 名称</th>
                <th>创建时间</th>
                <th style="text-align: right; width: 240px">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in paginatedConfigs" :key="item.id">
                <td style="font-family: var(--font-mono)">#{{ item.id }}</td>
                <td>
                  <strong>{{ item.detail || "未命名配置" }}</strong>
                </td>
                <td style="color: var(--text-muted); font-size: 0.9rem">
                  {{ item.created_at }}
                </td>
                <td style="text-align: right">
                  <div class="flex gap-2" style="justify-content: flex-end">
                    <button
                      class="btn btn-secondary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="startEditConfig(item.id)"
                    >
                      编辑配置
                    </button>
                    <button
                      class="btn btn-secondary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      title="导出配置 JSON 文件"
                      @click="exportConfigById(item.id, item.detail)"
                    >
                      导出
                    </button>
                    <button
                      class="btn btn-danger"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="deleteConfigItem(item.id)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="configList.length === 0">
                <td
                  colspan="4"
                  style="text-align: center; color: var(--text-muted)"
                >
                  暂无保存的配置模板。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Pagination controls -->
        <div
          class="flex items-center justify-between"
          style="
            margin-top: 1rem;
            border-top: 1px solid var(--border-color);
            padding-top: 0.75rem;
            flex-shrink: 0;
          "
        >
          <div style="color: var(--text-muted); font-size: 0.85rem">
            显示第
            {{ configList.length > 0 ? (currentPage - 1) * pageSize + 1 : 0 }}
            到 {{ Math.min(currentPage * pageSize, configList.length) }} 条，共
            {{ configList.length }} 条
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1-5">
              <span style="color: var(--text-muted); font-size: 0.85rem"
                >每页</span
              >
              <select
                v-model="pageSize"
                class="input-control"
                style="
                  padding: 0.2rem 1.6rem 0.2rem 0.5rem;
                  font-size: 0.85rem;
                  height: 32px;
                  width: 76px;
                  margin: 0;
                  border-radius: 6px;
                "
              >
                <option :value="5">5</option>
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
              <span style="color: var(--text-muted); font-size: 0.85rem"
                >条</span
              >
            </div>
            <div class="flex gap-2">
              <button
                class="btn btn-secondary"
                style="
                  padding: 0.35rem 0.75rem;
                  font-size: 0.8rem;
                  height: 32px;
                "
                type="button"
                :disabled="currentPage === 1"
                @click="currentPage--"
              >
                上一页
              </button>
              <button
                class="btn btn-secondary"
                style="
                  padding: 0.35rem 0.75rem;
                  font-size: 0.8rem;
                  height: 32px;
                "
                type="button"
                :disabled="currentPage * pageSize >= configList.length"
                @click="currentPage++"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Config Details Edit Page -->
      <div v-else class="config-main fill-height">
        <!-- Streamlined Header Bar -->
        <div class="config-header">
          <!-- Left: Navigation, Status Badge & Editable Remark -->
          <div class="config-header-left">
            <button
              class="btn btn-secondary"
              style="
                padding: 0.35rem 0.75rem;
                font-size: 0.8rem;
                height: 32px;
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                flex-shrink: 0;
              "
              type="button"
              @click="backToList"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              返回列表
            </button>
            <div class="config-header-divider"></div>
            <span class="badge badge-info config-header-badge">
              编辑中 #{{ currentConfigId }}
            </span>
            <span
              v-if="isCurrentConfigRunning"
              class="badge"
              style="
                background: rgba(16, 185, 129, 0.15);
                color: #10b981;
                border: 1px solid rgba(16, 185, 129, 0.3);
                font-size: 0.75rem;
                padding: 0.2rem 0.5rem;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                gap: 0.3rem;
                font-weight: 500;
              "
              title="当前配置已配置为系统运行配置"
            >
              <span
                style="
                  width: 6px;
                  height: 6px;
                  border-radius: 50%;
                  background-color: #10b981;
                  display: inline-block;
                "
              ></span>
              运行设置中
            </span>
            <div class="config-remark-container">
              <span class="config-remark-label">配置备注:</span>
              <input
                v-model="currentConfigDetail"
                type="text"
                class="input-control config-remark-input"
                placeholder="修改配置备注描述..."
              />
            </div>
          </div>

          <!-- Right: Action Buttons -->
          <div class="config-header-right">
            <button
              class="btn btn-secondary"
              style="
                padding: 0.5rem 1rem;
                font-size: 0.85rem;
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
              "
              @click="openImportInEdit"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              导入完整配置
            </button>
            <button
              class="btn btn-secondary"
              style="
                padding: 0.5rem 1rem;
                font-size: 0.85rem;
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
              "
              @click="previewGeneratedConfig"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              预览完整配置
            </button>
            <button
              class="btn btn-secondary"
              style="
                padding: 0.5rem 1rem;
                font-size: 0.85rem;
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
              "
              @click="saveAsNewConfig"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                />
              </svg>
              另存为新
            </button>
            <button
              class="btn"
              style="
                padding: 0.5rem 1.25rem;
                font-size: 0.9rem;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
              "
              @click="saveConfig"
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
                />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              保存配置
            </button>
            <button
              v-if="isCurrentConfigRunning"
              class="btn"
              style="
                padding: 0.5rem 1.25rem;
                font-size: 0.9rem;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 0.4rem;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: #ffffff;
                border: none;
                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
              "
              :disabled="runningConfigModal.saving"
              title="保存当前配置并立即同步更新到运行设置"
              @click="triggerUpdateFromDetail"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {{ runningConfigModal.saving ? "更新中..." : "更新" }}
            </button>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div
          class="tabs"
          style="margin-bottom: 0.25rem; padding-bottom: 0.5rem"
        >
          <div
            class="tab"
            :class="{ active: activeSection === 'log' }"
            @click="activeSection = 'log'"
          >
            日志配置
          </div>
          <div
            class="tab"
            :class="{ active: activeSection === 'dns' }"
            @click="activeSection = 'dns'"
          >
            DNS服务
          </div>
          <div
            class="tab"
            :class="{ active: activeSection === 'inbounds' }"
            @click="activeSection = 'inbounds'"
          >
            入站连接 (Inbounds)
          </div>
          <div
            class="tab"
            :class="{ active: activeSection === 'outbounds' }"
            @click="activeSection = 'outbounds'"
          >
            出站连接 (Outbounds)
          </div>
          <div
            class="tab"
            :class="{ active: activeSection === 'route' }"
            @click="activeSection = 'route'"
          >
            路由规则 (Route)
          </div>
          <div
            class="tab"
            :class="{ active: activeSection === 'experimental' }"
            @click="activeSection = 'experimental'"
          >
            实验功能
          </div>
        </div>

        <!-- Section Content -->
        <div class="config-editor-scroll-body">
          <template v-for="section in sections" :key="section">
            <div v-if="activeSection === section" class="panel">
              <!-- Section Header with Mode Toggle -->
              <div class="flex justify-between items-center mb-4">
                <div
                  class="panel-title"
                  style="margin: 0; text-transform: uppercase"
                >
                  {{ section }} 配置
                </div>
                <div class="toggle-group">
                  <button
                    class="btn-toggle"
                    :class="{ active: sectionModes[section] === 'visual' }"
                    @click="setSectionMode(section, 'visual')"
                  >
                    可视化
                  </button>
                  <button
                    class="btn-toggle"
                    :class="{ active: sectionModes[section] === 'json' }"
                    @click="setSectionMode(section, 'json')"
                  >
                    JSON 源码
                  </button>
                </div>
              </div>

              <!-- 1. JSON Source Code Mode -->
              <div v-show="sectionModes[section] === 'json'">
                <div class="input-group">
                  <label
                    >RAW JSON 配置 (修改后保存会自动同步回可视化表单)</label
                  >
                  <textarea
                    v-model="rawJson[section]"
                    class="input-control"
                    style="
                      font-family: var(--font-mono);
                      height: 400px;
                      font-size: 0.85rem;
                      background: rgba(0, 0, 0, 0.15);
                    "
                  ></textarea>
                </div>
              </div>

              <!-- 2. Visual Mode -->
              <div v-show="sectionModes[section] === 'visual'">
                <!-- LOG VISUAL -->
                <div v-if="section === 'log'">
                  <div class="grid-2">
                    <div class="input-group">
                      <label>日志级别</label>
                      <select
                        v-model="configData.log.level"
                        class="input-control"
                      >
                        <option value="trace">Trace</option>
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                        <option value="fatal">Fatal</option>
                        <option value="panic">Panic</option>
                      </select>
                    </div>
                    <div class="input-group">
                      <label>日志输出文件路径 (留空输出到 stdout)</label>
                      <input
                        v-model="configData.log.output"
                        type="text"
                        class="input-control"
                        placeholder="/var/log/sing-box.log"
                      />
                    </div>
                  </div>
                  <div
                    class="grid-2"
                    style="margin-top: 1rem; margin-bottom: 1rem"
                  >
                    <div class="input-group">
                      <label
                        style="
                          display: flex;
                          align-items: center;
                          gap: 0.5rem;
                          cursor: pointer;
                        "
                      >
                        <input
                          v-model="configData.log.timestamp"
                          type="checkbox"
                          style="width: 1.1rem; height: 1.1rem"
                        />
                        <span>在日志中包含时间戳</span>
                      </label>
                    </div>
                    <div class="input-group">
                      <label
                        style="
                          display: flex;
                          align-items: center;
                          gap: 0.5rem;
                          cursor: pointer;
                        "
                      >
                        <input
                          v-model="configData.log.disabled"
                          type="checkbox"
                          style="width: 1.1rem; height: 1.1rem"
                        />
                        <span>禁用日志输出 (disabled)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <!-- DNS VISUAL -->
                <div v-if="section === 'dns'">
                  <div class="grid-2">
                    <div class="input-group">
                      <label>域名解析策略 (Strategy)</label>
                      <select
                        v-model="configData.dns.strategy"
                        class="input-control"
                      >
                        <option value="prefer_ipv4">
                          优先 IPv4 (prefer_ipv4)
                        </option>
                        <option value="prefer_ipv6">
                          优先 IPv6 (prefer_ipv6)
                        </option>
                        <option value="ipv4_only">仅 IPv4 (ipv4_only)</option>
                        <option value="ipv6_only">仅 IPv6 (ipv6_only)</option>
                      </select>
                    </div>
                    <div class="input-group">
                      <label>默认 DNS 服务 Tag (Final)</label>
                      <select
                        v-model="configData.dns.final"
                        class="input-control"
                      >
                        <option
                          v-if="
                            configData.dns.final &&
                            !configData.dns.servers.some(
                              (s) => s.tag === configData.dns.final,
                            )
                          "
                          :value="configData.dns.final"
                        >
                          {{ configData.dns.final }} (当前值)
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

                  <div class="grid-2" style="margin-top: 1rem">
                    <div class="input-group">
                      <label>默认 ECS 客户端子网 (client_subnet)</label>
                      <input
                        v-model="configData.dns.client_subnet"
                        type="text"
                        class="input-control"
                        placeholder="例如: 223.5.5.0/24"
                      />
                    </div>
                  </div>

                  <!-- DNS Global Toggles -->
                  <div
                    style="
                      display: grid;
                      grid-template-columns: repeat(
                        auto-fit,
                        minmax(200px, 1fr)
                      );
                      gap: 1rem;
                      margin-top: 1rem;
                      margin-bottom: 1.5rem;
                    "
                  >
                    <label
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        cursor: pointer;
                      "
                    >
                      <input
                        v-model="configData.dns.independent_cache"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <span>独立缓存 (independent_cache)</span>
                    </label>
                    <label
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        cursor: pointer;
                      "
                    >
                      <input
                        v-model="configData.dns.disable_cache"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <span>禁用缓存 (disable_cache)</span>
                    </label>
                    <label
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        cursor: pointer;
                      "
                    >
                      <input
                        v-model="configData.dns.disable_expire"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <span>禁用过期 (disable_expire)</span>
                    </label>
                    <label
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        cursor: pointer;
                      "
                    >
                      <input
                        v-model="configData.dns.reverse_mapping"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <span>反向映射 (reverse_mapping)</span>
                    </label>
                  </div>

                  <!-- FakeIP configuration block -->
                  <div
                    style="
                      border: 1px solid var(--border-color);
                      padding: 1rem;
                      border-radius: 8px;
                      margin-bottom: 1.5rem;
                      background: rgba(255, 255, 255, 0.01);
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 0.75rem;
                      "
                    >
                      <input
                        id="dns-fakeip-enabled"
                        v-model="configData.dns.fakeip.enabled"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <label
                        for="dns-fakeip-enabled"
                        style="
                          font-weight: 600;
                          cursor: pointer;
                          color: var(--secondary);
                        "
                        >FakeIP 设置</label
                      >
                    </div>
                    <div v-if="configData.dns.fakeip.enabled" class="grid-2">
                      <div class="input-group">
                        <label>IPv4 CIDR 地址段</label>
                        <input
                          v-model="configData.dns.fakeip.inet4_range"
                          type="text"
                          class="input-control"
                          placeholder="198.18.0.0/15"
                        />
                      </div>
                      <div class="input-group">
                        <label>IPv6 CIDR 地址段</label>
                        <input
                          v-model="configData.dns.fakeip.inet6_range"
                          type="text"
                          class="input-control"
                          placeholder="fc00::/18"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- DNS Servers List -->
                  <div class="visual-section-box">
                    <div class="flex justify-between items-center mb-2">
                      <span class="visual-section-title"
                        >DNS 服务器列表 (servers)</span
                      >
                      <button
                        class="btn btn-secondary"
                        style="padding: 0.3rem 0.6rem; font-size: 0.8rem"
                        @click="addDnsServer"
                      >
                        + 添加服务器
                      </button>
                    </div>
                    <div class="table-container">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Tag</th>
                            <th>Type</th>
                            <th>Address</th>
                            <th>Detour</th>
                            <th style="text-align: right; width: 140px">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(srv, idx) in configData.dns.servers"
                            :key="idx"
                          >
                            <td>
                              <input
                                v-model="srv.tag"
                                type="text"
                                class="input-control table-input"
                                style="font-weight: 600"
                                placeholder="tag"
                              />
                            </td>
                            <td>
                              <select
                                v-model="srv.type"
                                class="input-control table-input"
                                @change="onDnsServerTypeChange(srv)"
                              >
                                <option value="fakeip">fakeip</option>
                                <option value="local">local</option>
                                <option value="udp">udp</option>
                                <option value="tcp">tcp</option>
                                <option value="https">https</option>
                                <option value="tls">tls</option>
                                <option value="quic">quic</option>
                              </select>
                            </td>
                            <td>
                              <span
                                v-if="srv.type === 'fakeip'"
                                style="
                                  font-size: 0.8rem;
                                  color: var(--text-muted);
                                  line-height: 1.6;
                                  display: block;
                                  padding: 0.2rem 0;
                                "
                              >
                                <span v-if="srv.inet4_range || srv.inet6_range">
                                  <span
                                    v-if="srv.inet4_range"
                                    style="display: block"
                                    >📡 IPv4:
                                    <strong>{{ srv.inet4_range }}</strong></span
                                  >
                                  <span
                                    v-if="srv.inet6_range"
                                    style="display: block"
                                    >📡 IPv6:
                                    <strong>{{ srv.inet6_range }}</strong></span
                                  >
                                </span>
                                <span
                                  v-else
                                  style="font-style: italic; color: #f59e0b"
                                  >⚠️ 未配置 IP 段，请点击编辑</span
                                >
                              </span>
                              <span
                                v-else-if="srv.type === 'local'"
                                style="
                                  font-size: 0.8rem;
                                  color: var(--text-muted);
                                  font-style: italic;
                                  display: block;
                                "
                                >系统本地 DNS</span
                              >
                              <input
                                v-else
                                v-model="srv.server"
                                type="text"
                                class="input-control table-input"
                                :placeholder="getAddressPlaceholder(srv.type)"
                              />
                            </td>
                            <td>
                              <select
                                v-if="
                                  srv.type === 'fakeip' || srv.type === 'local'
                                "
                                class="input-control table-input"
                                disabled
                                style="
                                  opacity: 0.6;
                                  cursor: not-allowed;
                                  background: rgba(255, 255, 255, 0.03);
                                "
                              >
                                <option>无需配置 (本地解析)</option>
                              </select>
                              <select
                                v-else
                                v-model="srv.detour"
                                class="input-control table-input"
                              >
                                <option value="">-- 默认 (跟随路由) --</option>
                                <option
                                  v-if="
                                    srv.detour &&
                                    !allOutboundTags.includes(srv.detour)
                                  "
                                  :value="srv.detour"
                                >
                                  {{ srv.detour }} (当前值)
                                </option>
                                <option
                                  v-for="tag in allOutboundTags"
                                  :key="tag"
                                  :value="tag"
                                >
                                  {{ tag }}
                                </option>
                              </select>
                            </td>
                            <td style="text-align: right">
                              <div class="flex gap-1 justify-end">
                                <button
                                  class="btn btn-secondary table-btn"
                                  @click="
                                    editItem(
                                      srv,
                                      'dns_server',
                                      (parsed) =>
                                        (configData.dns.servers[idx] = parsed),
                                      idx,
                                    )
                                  "
                                >
                                  编辑
                                </button>
                                <button
                                  class="btn btn-danger table-btn"
                                  @click="configData.dns.servers.splice(idx, 1)"
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                          <tr v-if="configData.dns.servers.length === 0">
                            <td
                              colspan="5"
                              style="
                                text-align: center;
                                color: var(--text-muted);
                              "
                            >
                              暂无 DNS 服务器。
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- DNS Rules List -->
                  <div class="visual-section-box" style="margin-top: 1.5rem">
                    <div class="flex justify-between items-center mb-2">
                      <span class="visual-section-title"
                        >DNS 分流规则列表 (rules)</span
                      >
                      <button
                        class="btn btn-secondary"
                        style="padding: 0.3rem 0.6rem; font-size: 0.8rem"
                        @click="addDnsRule"
                      >
                        + 添加规则
                      </button>
                    </div>
                    <div class="table-container">
                      <table class="table">
                        <thead>
                          <tr>
                            <th style="width: 25%">DNS Server (Tag)</th>
                            <th style="width: 55%">匹配过滤条件描述</th>
                            <th style="text-align: right; width: 180px">
                              排序 / 操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(rule, idx) in configData.dns.rules"
                            :key="idx"
                          >
                            <td>
                              <select
                                v-model="rule.server"
                                class="input-control table-input"
                                style="font-weight: 600"
                              >
                                <option
                                  v-if="
                                    rule.server &&
                                    !configData.dns.servers.some(
                                      (s) => s.tag === rule.server,
                                    )
                                  "
                                  :value="rule.server"
                                >
                                  {{ rule.server }} (当前值)
                                </option>
                                <option
                                  v-for="srv in configData.dns.servers"
                                  :key="srv.tag"
                                  :value="srv.tag"
                                >
                                  {{ srv.tag }}
                                </option>
                              </select>
                            </td>
                            <td>
                              <div class="dns-rule-criteria">
                                <!-- Logical rule badge -->
                                <div
                                  v-if="rule.type === 'logical'"
                                  class="criteria-tag rule-set-tag"
                                  style="
                                    font-weight: 600;
                                    border-color: var(--primary);
                                  "
                                >
                                  逻辑模式:
                                  {{
                                    rule.mode ? rule.mode.toUpperCase() : "OR"
                                  }}
                                </div>

                                <!-- Client Subnet badge -->
                                <div
                                  v-if="rule.client_subnet"
                                  class="criteria-tag"
                                  style="
                                    font-weight: 600;
                                    border-color: #f59e0b;
                                    color: #d97706;
                                    background: rgba(245, 158, 11, 0.1);
                                  "
                                >
                                  ECS: {{ rule.client_subnet }}
                                </div>

                                <!-- Standard root criteria -->
                                <div
                                  v-if="rule.rule_set"
                                  class="criteria-tag rule-set-tag"
                                >
                                  RuleSet:
                                  {{
                                    Array.isArray(rule.rule_set)
                                      ? rule.rule_set.join(", ")
                                      : rule.rule_set
                                  }}
                                </div>
                                <div
                                  v-if="rule.geosite"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'geosite',
                                      rule.geosite,
                                    ),
                                  }"
                                >
                                  Geosite:
                                  {{
                                    Array.isArray(rule.geosite)
                                      ? rule.geosite.join(", ")
                                      : rule.geosite
                                  }}
                                </div>
                                <div
                                  v-if="rule.domain_suffix"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'domain_suffix',
                                      rule.domain_suffix,
                                    ),
                                  }"
                                >
                                  Suffix:
                                  {{
                                    Array.isArray(rule.domain_suffix)
                                      ? rule.domain_suffix.join(", ")
                                      : rule.domain_suffix
                                  }}
                                </div>
                                <div
                                  v-if="rule.domain"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'domain',
                                      rule.domain,
                                    ),
                                  }"
                                >
                                  Domain:
                                  {{
                                    Array.isArray(rule.domain)
                                      ? rule.domain.join(", ")
                                      : rule.domain
                                  }}
                                </div>
                                <div
                                  v-if="rule.geoip"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'geoip',
                                      rule.geoip,
                                    ),
                                  }"
                                >
                                  GeoIP:
                                  {{
                                    Array.isArray(rule.geoip)
                                      ? rule.geoip.join(", ")
                                      : rule.geoip
                                  }}
                                </div>
                                <div
                                  v-if="rule.ip_cidr"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'ip_cidr',
                                      rule.ip_cidr,
                                    ),
                                  }"
                                >
                                  IP CIDR:
                                  {{
                                    Array.isArray(rule.ip_cidr)
                                      ? rule.ip_cidr.join(", ")
                                      : rule.ip_cidr
                                  }}
                                </div>
                                <div v-if="rule.port" class="criteria-tag">
                                  Port:
                                  {{
                                    Array.isArray(rule.port)
                                      ? rule.port.join(", ")
                                      : rule.port
                                  }}
                                </div>
                                <div v-if="rule.inbound" class="criteria-tag">
                                  Inbound:
                                  {{
                                    Array.isArray(rule.inbound)
                                      ? rule.inbound.join(", ")
                                      : rule.inbound
                                  }}
                                </div>

                                <!-- Sub-rules criteria for logical rules -->
                                <template
                                  v-if="
                                    rule.type === 'logical' &&
                                    Array.isArray(rule.rules)
                                  "
                                >
                                  <template
                                    v-for="(sub, sidx) in rule.rules"
                                    :key="sidx"
                                  >
                                    <div
                                      v-if="sub.rule_set"
                                      class="criteria-tag rule-set-tag"
                                    >
                                      RuleSet:
                                      {{
                                        Array.isArray(sub.rule_set)
                                          ? sub.rule_set.join(", ")
                                          : sub.rule_set
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.geosite"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'geosite',
                                          sub.geosite,
                                        ),
                                      }"
                                    >
                                      Geosite:
                                      {{
                                        Array.isArray(sub.geosite)
                                          ? sub.geosite.join(", ")
                                          : sub.geosite
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.domain_suffix"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'domain_suffix',
                                          sub.domain_suffix,
                                        ),
                                      }"
                                    >
                                      Suffix:
                                      {{
                                        Array.isArray(sub.domain_suffix)
                                          ? sub.domain_suffix.join(", ")
                                          : sub.domain_suffix
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.domain"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'domain',
                                          sub.domain,
                                        ),
                                      }"
                                    >
                                      Domain:
                                      {{
                                        Array.isArray(sub.domain)
                                          ? sub.domain.join(", ")
                                          : sub.domain
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.domain_keyword"
                                      class="criteria-tag"
                                    >
                                      Keyword:
                                      {{
                                        Array.isArray(sub.domain_keyword)
                                          ? sub.domain_keyword.join(", ")
                                          : sub.domain_keyword
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.domain_regex"
                                      class="criteria-tag"
                                    >
                                      Regex:
                                      {{
                                        Array.isArray(sub.domain_regex)
                                          ? sub.domain_regex.join(", ")
                                          : sub.domain_regex
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.geoip"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'geoip',
                                          sub.geoip,
                                        ),
                                      }"
                                    >
                                      GeoIP:
                                      {{
                                        Array.isArray(sub.geoip)
                                          ? sub.geoip.join(", ")
                                          : sub.geoip
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.ip_cidr"
                                      class="criteria-tag"
                                    >
                                      IP CIDR:
                                      {{
                                        Array.isArray(sub.ip_cidr)
                                          ? sub.ip_cidr.join(", ")
                                          : sub.ip_cidr
                                      }}
                                    </div>
                                    <div v-if="sub.port" class="criteria-tag">
                                      Port:
                                      {{
                                        Array.isArray(sub.port)
                                          ? sub.port.join(", ")
                                          : sub.port
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.inbound"
                                      class="criteria-tag"
                                    >
                                      Inbound:
                                      {{
                                        Array.isArray(sub.inbound)
                                          ? sub.inbound.join(", ")
                                          : sub.inbound
                                      }}
                                    </div>
                                  </template>
                                </template>

                                <div
                                  v-if="
                                    !rule.type &&
                                    !rule.rule_set &&
                                    !rule.geosite &&
                                    !rule.domain_suffix &&
                                    !rule.domain &&
                                    !rule.geoip &&
                                    !rule.ip_cidr &&
                                    !rule.port &&
                                    !rule.inbound
                                  "
                                  style="color: var(--text-muted)"
                                >
                                  （无条件，匹配全部）
                                </div>
                              </div>
                            </td>
                            <td style="text-align: right">
                              <div class="flex gap-1 justify-end">
                                <button
                                  class="btn btn-secondary table-btn"
                                  style="padding: 0.2rem 0.35rem"
                                  :disabled="idx === 0"
                                  @click="
                                    moveItem(configData.dns.rules, idx, -1)
                                  "
                                >
                                  ▲
                                </button>
                                <button
                                  class="btn btn-secondary table-btn"
                                  style="padding: 0.2rem 0.35rem"
                                  :disabled="
                                    idx === configData.dns.rules.length - 1
                                  "
                                  @click="
                                    moveItem(configData.dns.rules, idx, 1)
                                  "
                                >
                                  ▼
                                </button>
                                <button
                                  class="btn btn-secondary table-btn"
                                  title="同步此规则至路由规则"
                                  style="color: var(--primary); border-color: rgba(99, 102, 241, 0.3)"
                                  @click="openSyncModal(rule, 'dns', idx)"
                                >
                                  ⇄ 同步
                                </button>
                                <button
                                  class="btn btn-secondary table-btn"
                                  @click="
                                    editItem(
                                      rule,
                                      'dns_rule',
                                      (parsed) =>
                                        (configData.dns.rules[idx] = parsed),
                                      idx,
                                    )
                                  "
                                >
                                  编辑
                                </button>
                                <button
                                  class="btn btn-danger table-btn"
                                  @click="configData.dns.rules.splice(idx, 1)"
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                          <tr v-if="configData.dns.rules.length === 0">
                            <td
                              colspan="3"
                              style="
                                text-align: center;
                                color: var(--text-muted);
                              "
                            >
                              暂无 DNS 规则。
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <!-- INBOUNDS VISUAL -->
                <div v-if="section === 'inbounds'">
                  <div class="visual-section-box">
                    <div class="flex justify-between items-center mb-2">
                      <span class="visual-section-title"
                        >入站连接列表 (inbounds)</span
                      >
                      <button
                        class="btn btn-secondary"
                        style="padding: 0.3rem 0.6rem; font-size: 0.8rem"
                        @click="addInbound"
                      >
                        + 添加入站
                      </button>
                    </div>
                    <div class="table-container">
                      <table class="table">
                        <thead>
                          <tr>
                            <th style="width: 25%">Tag</th>
                            <th style="width: 20%">Type</th>
                            <th style="width: 40%">配置详情</th>
                            <th style="text-align: right; width: 140px">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(inb, idx) in configData.inbounds"
                            :key="idx"
                          >
                            <td>
                              <input
                                v-model="inb.tag"
                                type="text"
                                class="input-control table-input"
                                style="font-weight: 600"
                                placeholder="tag"
                              />
                            </td>
                            <td>
                              <select
                                v-model="inb.type"
                                class="input-control table-input"
                                @change="onInboundTypeChange(inb)"
                              >
                                <option value="mixed">mixed</option>
                                <option value="tun">tun</option>
                                <option value="socks">socks</option>
                                <option value="http">http</option>
                                <option value="tproxy">tproxy</option>
                                <option value="redirect">redirect</option>
                              </select>
                            </td>
                            <td>
                              <!-- Tun fields -->
                              <div
                                v-if="inb.type === 'tun'"
                                class="flex flex-col gap-2"
                                style="font-size: 0.8rem; padding: 0.2rem 0"
                              >
                                <div
                                  style="
                                    display: flex;
                                    gap: 0.5rem;
                                    align-items: center;
                                  "
                                >
                                  <span
                                    style="
                                      width: 60px;
                                      color: var(--text-muted);
                                      flex-shrink: 0;
                                      text-align: right;
                                    "
                                    >网卡名:</span
                                  >
                                  <input
                                    v-model="inb.interface_name"
                                    type="text"
                                    class="input-control table-input"
                                    style="
                                      flex: 1;
                                      min-width: 60px;
                                      padding: 0.15rem 0.3rem;
                                    "
                                    placeholder="网卡名 (tun0)"
                                  />
                                  <select
                                    v-model="inb.stack"
                                    class="input-control table-input"
                                    style="width: 85px; padding: 0.15rem 0.3rem"
                                  >
                                    <option value="gvisor">gvisor</option>
                                    <option value="mixed">mixed</option>
                                    <option value="system">system</option>
                                  </select>
                                </div>
                                <div
                                  style="
                                    display: flex;
                                    gap: 1rem;
                                    padding-left: 65px;
                                  "
                                >
                                  <label
                                    style="
                                      display: flex;
                                      align-items: center;
                                      gap: 0.25rem;
                                      cursor: pointer;
                                    "
                                  >
                                    <input
                                      v-model="inb.auto_route"
                                      type="checkbox"
                                    />
                                    <span>自动路由</span>
                                  </label>
                                  <label
                                    style="
                                      display: flex;
                                      align-items: center;
                                      gap: 0.25rem;
                                      cursor: pointer;
                                    "
                                  >
                                    <input
                                      v-model="inb.strict_route"
                                      type="checkbox"
                                    />
                                    <span>严格路由</span>
                                  </label>
                                  <label
                                    style="
                                      display: flex;
                                      align-items: center;
                                      gap: 0.25rem;
                                      cursor: pointer;
                                    "
                                    title="仅支持 Linux 系统"
                                  >
                                    <input
                                      v-model="inb.auto_redirect"
                                      type="checkbox"
                                    />
                                    <span>自动重定向</span>
                                    <span
                                      style="
                                        font-size: 0.75rem;
                                        color: var(--text-muted);
                                        margin-left: 0.15rem;
                                      "
                                      >(仅 Linux)</span
                                    >
                                  </label>
                                </div>
                              </div>
                              <!-- Regular socket inbounds -->
                              <div
                                v-else
                                style="
                                  display: flex;
                                  gap: 0.5rem;
                                  align-items: center;
                                  padding: 0.2rem 0;
                                  font-size: 0.8rem;
                                "
                              >
                                <span
                                  style="
                                    width: 60px;
                                    color: var(--text-muted);
                                    flex-shrink: 0;
                                    text-align: right;
                                  "
                                  >监听/端口:</span
                                >
                                <input
                                  v-model="inb.listen"
                                  type="text"
                                  class="input-control table-input"
                                  style="flex: 1; min-width: 80px"
                                  placeholder="监听地址"
                                />
                                <input
                                  v-model.number="inb.listen_port"
                                  type="number"
                                  class="input-control table-input"
                                  style="width: 75px"
                                  placeholder="端口"
                                />
                              </div>
                            </td>
                            <td style="text-align: right">
                              <div class="flex gap-1 justify-end">
                                <button
                                  class="btn btn-secondary table-btn"
                                  @click="
                                    editItem(
                                      inb,
                                      'inbound',
                                      (parsed) =>
                                        (configData.inbounds[idx] = parsed),
                                      idx,
                                    )
                                  "
                                >
                                  编辑
                                </button>
                                <button
                                  class="btn btn-danger table-btn"
                                  @click="configData.inbounds.splice(idx, 1)"
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                          <tr v-if="configData.inbounds.length === 0">
                            <td
                              colspan="4"
                              style="
                                text-align: center;
                                color: var(--text-muted);
                              "
                            >
                              暂无入站连接配置。
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <!-- OUTBOUNDS VISUAL - OPTIMIZED -->
                <div v-if="section === 'outbounds'">
                  <!-- Configuration Tips -->
                  <div
                    style="
                      margin-bottom: 1.5rem;
                      padding: 1rem;
                      background: rgba(99, 102, 241, 0.08);
                      border-radius: 8px;
                      border-left: 3px solid var(--primary);
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 0.5rem;
                      "
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <strong style="color: var(--primary); font-size: 0.95rem"
                        >配置指南</strong
                      >
                    </div>
                    <ul
                      style="
                        margin: 0;
                        padding-left: 1.5rem;
                        color: var(--text-muted);
                        font-size: 0.85rem;
                        line-height: 1.6;
                      "
                    >
                      <li>
                        <strong>基础出站</strong
                        >：direct(直连)、block(阻断)、dns(DNS查询)、selector/urltest(策略组)
                      </li>
                      <li>
                        <strong>代理节点</strong
                        >：VMess、VLESS、Trojan、Shadowsocks等代理服务器
                      </li>
                      <li>
                        <strong>出站组</strong
                        >：在"分流出站组"页面创建后引入使用
                      </li>
                      <li>
                        💡 <strong>推荐流程</strong>：① 添加代理节点 → ②
                        创建/引入出站组 → ③ 在路由规则中配置分流
                      </li>
                    </ul>
                  </div>

                  <!-- 1. 基础出站卡片 -->
                  <div class="visual-section-box mb-4">
                    <div class="flex justify-between items-center mb-4">
                      <div>
                        <h3
                          style="
                            margin: 0;
                            font-size: 1.1rem;
                            font-weight: 600;
                            color: var(--text-main);
                          "
                        >
                          基础出站连接
                        </h3>
                        <p
                          style="
                            margin: 4px 0 0 0;
                            color: var(--text-muted);
                            font-size: 0.85rem;
                          "
                        >
                          系统内置的基础出站连接，用于直连、阻断和DNS查询
                        </p>
                      </div>
                      <button
                        class="btn btn-secondary"
                        style="
                          padding: 0.35rem 0.75rem;
                          font-size: 0.85rem;
                          display: flex;
                          align-items: center;
                          gap: 0.25rem;
                        "
                        @click="addBasicOutbound"
                      >
                        + 添加基础出站
                      </button>
                    </div>

                    <div class="outbound-cards-grid">
                      <div
                        v-for="outb in basicOutbounds"
                        :key="outb.tag"
                        class="outbound-card"
                      >
                        <div class="card-header">
                          <div class="flex justify-between items-start">
                            <div>
                              <h4 class="card-title">{{ outb.tag }}</h4>
                              <div class="card-subtitle">
                                {{ getOutboundTypeDisplay(outb.type) }}
                              </div>
                            </div>
                            <div class="card-badges">
                              <span
                                v-if="['direct', 'dns'].includes(outb.type)"
                                class="badge badge-success"
                              >
                                基础
                              </span>
                              <span
                                v-else-if="outb.type === 'block'"
                                class="badge badge-warning"
                              >
                                阻断
                              </span>
                              <span v-else class="badge badge-info">
                                自定义
                              </span>
                            </div>
                          </div>
                        </div>

                        <div class="card-content">
                          <div class="card-details">
                            <div class="detail-item">
                              <span class="detail-label">状态:</span>
                              <span class="detail-value"
                                >系统内置，无需额外配置</span
                              >
                            </div>
                          </div>
                        </div>

                        <div class="card-actions">
                          <button
                            class="btn btn-secondary btn-sm"
                            @click="
                              editItem(
                                outb,
                                'outbound',
                                (parsed) => {
                                  const targetIdx =
                                    configData.outbounds.findIndex(
                                      (o) => o.tag === outb.tag,
                                    );
                                  if (targetIdx !== -1) {
                                    configData.outbounds[targetIdx] = parsed;
                                  }
                                },
                                configData.outbounds.findIndex(
                                  (o) => o.tag === outb.tag,
                                ),
                              )
                            "
                          >
                            编辑
                          </button>
                          <button
                            class="btn btn-danger btn-sm"
                            @click="
                              confirmRemoveOutbound(
                                configData.outbounds.findIndex(
                                  (o) => o.tag === outb.tag,
                                ),
                              )
                            "
                          >
                            删除
                          </button>
                        </div>
                      </div>

                      <div
                        v-if="basicOutbounds.length === 0"
                        class="outbound-empty-state"
                      >
                        <div class="empty-icon">🔌</div>
                        <div class="empty-title">暂无基础出站</div>
                        <div class="empty-description">
                          点击上方按钮添加基础出站连接
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 2. 策略组卡片 -->
                  <div class="visual-section-box mb-4">
                    <div class="flex justify-between items-center mb-4">
                      <div>
                        <h3
                          style="
                            margin: 0;
                            font-size: 1.1rem;
                            font-weight: 600;
                            color: var(--text-main);
                          "
                        >
                          策略组 (Selector / URLTest)
                        </h3>
                        <p
                          style="
                            margin: 4px 0 0 0;
                            color: var(--text-muted);
                            font-size: 0.85rem;
                          "
                        >
                          手动选择或自动测速的策略组，配置中已自包含
                        </p>
                      </div>
                      <div class="flex gap-2">
                        <a
                          href="#groups"
                          class="btn btn-secondary"
                          style="
                            padding: 0.35rem 0.75rem;
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.25rem;
                            text-decoration: none;
                          "
                          title="跳转到分流出站组管理页面"
                        >
                          管理出站组
                        </a>
                        <button
                          class="btn"
                          style="
                            padding: 0.35rem 0.75rem;
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.25rem;
                          "
                          @click="openGroupImport"
                        >
                          🔌 从分流出站组引入
                        </button>
                      </div>
                    </div>

                    <div class="outbound-cards-grid">
                      <div
                        v-for="outb in groupOutbounds"
                        :key="outb.tag"
                        class="outbound-card"
                        :class="{ 'is-group': true }"
                      >
                        <div class="card-header">
                          <div class="flex justify-between items-start">
                            <div>
                              <h4 class="card-title">{{ outb.tag }}</h4>
                              <div class="card-subtitle">
                                {{ getOutboundTypeDisplay(outb.type) }}
                              </div>
                            </div>
                            <div class="card-badges">
                              <span class="badge badge-info">策略组</span>
                            </div>
                          </div>
                        </div>

                        <div class="card-content">
                          <div class="card-details">
                            <div class="detail-item">
                              <span class="detail-label">类型:</span>
                              <span class="detail-value">{{ outb.type }}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">节点数:</span>
                              <span class="detail-value">
                                {{
                                  Array.isArray(outb.outbounds)
                                    ? outb.outbounds.length
                                    : 0
                                }}
                                个
                              </span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">包含出站:</span>
                              <span class="detail-value">
                                {{
                                  Array.isArray(outb.outbounds)
                                    ? outb.outbounds.slice(0, 3).join(", ")
                                    : "未配置"
                                }}
                                {{
                                  Array.isArray(outb.outbounds) &&
                                  outb.outbounds.length > 3
                                    ? "..."
                                    : ""
                                }}
                              </span>
                            </div>
                            <div
                              v-if="outb.type === 'urltest'"
                              class="detail-item"
                            >
                              <span class="detail-label">测速URL:</span>
                              <span class="detail-value">{{
                                outb.url || "未配置"
                              }}</span>
                            </div>
                            <div
                              v-if="outb.type === 'urltest'"
                              class="detail-item"
                            >
                              <span class="detail-label">测速间隔:</span>
                              <span class="detail-value">{{
                                outb.interval || "未配置"
                              }}</span>
                            </div>
                          </div>
                        </div>

                        <div class="card-actions">
                          <button
                            class="btn btn-secondary btn-sm"
                            @click="
                              editItem(
                                outb,
                                'outbound',
                                (parsed) => {
                                  const targetIdx =
                                    configData.outbounds.findIndex(
                                      (o) => o.tag === outb.tag,
                                    );
                                  if (targetIdx !== -1) {
                                    configData.outbounds[targetIdx] = parsed;
                                  }
                                },
                                configData.outbounds.findIndex(
                                  (o) => o.tag === outb.tag,
                                ),
                              )
                            "
                          >
                            编辑
                          </button>
                          <button
                            class="btn btn-danger btn-sm"
                            @click="
                              confirmRemoveOutbound(
                                configData.outbounds.findIndex(
                                  (o) => o.tag === outb.tag,
                                ),
                              )
                            "
                          >
                            删除
                          </button>
                        </div>
                      </div>

                      <div
                        v-if="groupOutbounds.length === 0"
                        class="outbound-empty-state"
                      >
                        <div class="empty-icon">👥</div>
                        <div class="empty-title">暂无策略组</div>
                        <div class="empty-description">
                          点击「从分流出站组引入」从 DB 导入完整展开的策略组
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 3. 代理节点卡片 -->
                  <div class="visual-section-box mb-4">
                    <div class="flex justify-between items-center mb-4">
                      <div>
                        <h3
                          style="
                            margin: 0;
                            font-size: 1.1rem;
                            font-weight: 600;
                            color: var(--text-main);
                          "
                        >
                          代理节点
                        </h3>
                        <p
                          style="
                            margin: 4px 0 0 0;
                            color: var(--text-muted);
                            font-size: 0.85rem;
                          "
                        >
                          VMess、VLESS、Trojan、Shadowsocks等代理协议节点
                        </p>
                      </div>
                      <div class="flex gap-2">
                        <button
                          class="btn btn-secondary"
                          style="
                            padding: 0.35rem 0.75rem;
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.25rem;
                          "
                          @click="openNodePoolImport"
                        >
                          📥 从节点池导入
                        </button>
                        <button
                          class="btn"
                          style="
                            padding: 0.35rem 0.75rem;
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.25rem;
                          "
                          @click="addProxyOutbound"
                        >
                          + 添加代理节点
                        </button>
                      </div>
                    </div>

                    <div class="outbound-cards-grid">
                      <div
                        v-for="outb in proxyOutbounds"
                        :key="outb.tag"
                        class="outbound-card proxy-card"
                      >
                        <div class="card-header">
                          <div class="flex justify-between items-start">
                            <div>
                              <h4 class="card-title">{{ outb.tag }}</h4>
                              <div class="card-subtitle">
                                {{ getProxyTypeDisplay(outb.type) }}
                              </div>
                            </div>
                            <div class="card-badges">
                              <span
                                class="badge"
                                :class="getProtocolBadgeClass(outb.type)"
                              >
                                {{ outb.type }}
                              </span>
                              <span
                                v-if="outb.tls && outb.tls.enabled"
                                class="badge badge-success"
                              >
                                TLS
                              </span>
                              <span
                                v-if="outb.transport && outb.transport.type"
                                class="badge badge-info"
                              >
                                {{ outb.transport.type }}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div class="card-content">
                          <div class="card-details">
                            <div class="detail-item">
                              <span class="detail-label">地址:</span>
                              <span class="detail-value">{{
                                outb.server || "未配置"
                              }}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">端口:</span>
                              <span class="detail-value">{{
                                outb.port || "未配置"
                              }}</span>
                            </div>
                            <div
                              v-if="
                                ['vless', 'vmess', 'tuic'].includes(
                                  outb.type,
                                ) && outb.uuid
                              "
                              class="detail-item"
                            >
                              <span class="detail-label">UUID:</span>
                              <span class="detail-value"
                                >{{ outb.uuid.substring(0, 8) }}...</span
                              >
                            </div>
                            <div
                              v-if="
                                ['trojan', 'shadowsocks', 'hysteria2'].includes(
                                  outb.type,
                                ) && outb.password
                              "
                              class="detail-item"
                            >
                              <span class="detail-label">密码:</span>
                              <span class="detail-value"
                                >{{ outb.password.substring(0, 8) }}...</span
                              >
                            </div>
                            <div
                              v-if="outb.tls && outb.tls.enabled"
                              class="detail-item"
                            >
                              <span class="detail-label">TLS:</span>
                              <span class="detail-value">{{
                                outb.tls.server_name || outb.server
                              }}</span>
                              <span
                                v-if="outb.tls.insecure"
                                class="badge badge-warning"
                                style="margin-left: 4px"
                              >
                                跳过验证
                              </span>
                            </div>
                          </div>
                        </div>

                        <div class="card-actions">
                          <button
                            class="btn btn-secondary btn-sm"
                            @click="
                              editItem(
                                outb,
                                'outbound',
                                (parsed) => {
                                  const targetIdx =
                                    configData.outbounds.findIndex(
                                      (o) => o.tag === outb.tag,
                                    );
                                  if (targetIdx !== -1) {
                                    configData.outbounds[targetIdx] = parsed;
                                  }
                                },
                                configData.outbounds.findIndex(
                                  (o) => o.tag === outb.tag,
                                ),
                              )
                            "
                          >
                            编辑
                          </button>
                          <button
                            class="btn btn-danger btn-sm"
                            @click="
                              confirmRemoveOutbound(
                                configData.outbounds.findIndex(
                                  (o) => o.tag === outb.tag,
                                ),
                              )
                            "
                          >
                            删除
                          </button>
                        </div>
                      </div>

                      <div
                        v-if="proxyOutbounds.length === 0"
                        class="outbound-empty-state"
                      >
                        <div class="empty-icon">🌐</div>
                        <div class="empty-title">暂无代理节点</div>
                        <div class="empty-description">
                          添加代理节点或从节点池导入订阅节点
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ROUTE VISUAL -->
                <div v-if="section === 'route'">
                  <!-- Prominent Top Warning Box for Duplicate Route Rules -->
                  <div
                    v-if="duplicateRouteRulesInfo.length > 0"
                    class="duplicate-route-warning"
                    style="
                      margin-bottom: 1.25rem;
                      padding: 0.85rem 1.15rem;
                      background: rgba(239, 68, 68, 0.08);
                      border: 1px solid rgba(239, 68, 68, 0.35);
                      border-radius: 8px;
                      color: var(--danger, #ef4444);
                      font-size: 0.875rem;
                      line-height: 1.6;
                    "
                  >
                    <div
                      style="
                        font-weight: 600;
                        font-size: 0.925rem;
                        margin-bottom: 0.4rem;
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        color: var(--danger, #ef4444);
                      "
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                      >
                        <path
                          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                        />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      ⚠️
                      提示：路由配置中存在重复配置项（具体关联规则与出站如下）：
                    </div>
                    <ul
                      style="
                        margin: 0;
                        padding-left: 1.35rem;
                        list-style-type: disc;
                      "
                    >
                      <li
                        v-for="(item, dIdx) in duplicateRouteRulesInfo"
                        :key="dIdx"
                        style="margin-top: 0.25rem"
                      >
                        <span style="font-weight: 600">{{
                          item.typeLabel
                        }}</span>
                        <code
                          style="
                            margin: 0 0.35rem;
                            padding: 2px 6px;
                            background: rgba(239, 68, 68, 0.15);
                            border-radius: 4px;
                            font-weight: 600;
                            color: var(--danger, #ef4444);
                          "
                          >{{ item.value }}</code
                        >
                        存在重复，涉及规则
                        <strong>#{{ item.ruleIndices.join(", #") }}</strong>
                        <span style="opacity: 0.9">
                          (目标出站: {{ item.outbounds.join(", ") }})</span
                        >
                      </li>
                    </ul>
                  </div>

                  <div class="grid-2">
                    <div class="input-group">
                      <label>默认出站 Tag (Final)</label>
                      <select
                        v-model="configData.route.final"
                        class="input-control"
                      >
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
                        <option
                          v-for="tag in allOutboundTags"
                          :key="tag"
                          :value="tag"
                        >
                          {{ tag }}
                        </option>
                      </select>
                      <small
                        style="
                          color: var(--text-muted);
                          font-size: 0.8rem;
                          margin-top: 0.25rem;
                          display: block;
                        "
                        >所有分流规则都不匹配时的默认流量出站。</small
                      >
                    </div>
                    <div class="input-group">
                      <label>默认 DNS 服务 Tag (default_domain_resolver)</label>
                      <select
                        v-model="configData.route.default_domain_resolver"
                        class="input-control"
                      >
                        <option value="">-- 无 (未指定) --</option>
                        <option
                          v-if="
                            configData.route.default_domain_resolver &&
                            !configData.dns.servers.some(
                              (s) =>
                                s.tag ===
                                configData.route.default_domain_resolver,
                            )
                          "
                          :value="configData.route.default_domain_resolver"
                        >
                          {{ configData.route.default_domain_resolver }}
                          (当前值)
                        </option>
                        <option
                          v-for="srv in configData.dns.servers"
                          :key="srv.tag"
                          :value="srv.tag"
                        >
                          {{ srv.tag }}
                        </option>
                      </select>
                      <small
                        style="
                          color: var(--text-muted);
                          font-size: 0.8rem;
                          margin-top: 0.25rem;
                          display: block;
                        "
                        >用于解析路由分流中域名的 DNS 服务器。</small
                      >
                    </div>
                  </div>
                  <div style="margin-top: 1rem; margin-bottom: 1.5rem">
                    <label
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        cursor: pointer;
                      "
                    >
                      <input
                        v-model="configData.route.auto_detect_interface"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <span
                        >自动探测活动网络网卡接口 (auto_detect_interface)</span
                      >
                    </label>
                    <small
                      style="
                        color: var(--text-muted);
                        font-size: 0.8rem;
                        margin-left: 1.6rem;
                        display: block;
                      "
                      >强烈建议开启。自动探测物理活动网卡，防止物理连接变更引起回流与环路。</small
                    >
                  </div>

                  <!-- Route Rules List -->
                  <div class="visual-section-box" style="margin-top: 1.5rem">
                    <div class="flex justify-between items-center mb-2">
                      <span class="visual-section-title"
                        >分流路由规则列表 (rules)</span
                      >
                      <div class="flex gap-2">
                        <button
                          class="btn btn-primary"
                          style="padding: 0.3rem 0.6rem; font-size: 0.8rem"
                          @click="openDomainWizard"
                        >
                          ⚡ 快捷域名分流推荐
                        </button>
                        <button
                          class="btn btn-secondary"
                          style="padding: 0.3rem 0.6rem; font-size: 0.8rem"
                          @click="addRouteRule"
                        >
                          + 添加路由规则
                        </button>
                      </div>
                    </div>

                    <!-- Duplicate Route Rules Warning Box -->
                    <div
                      v-if="duplicateRouteRulesInfo.length > 0"
                      class="duplicate-route-warning"
                      style="
                        margin-bottom: 1rem;
                        padding: 0.85rem 1.15rem;
                        background: rgba(239, 68, 68, 0.08);
                        border: 1px solid rgba(239, 68, 68, 0.35);
                        border-radius: 8px;
                        color: var(--danger, #ef4444);
                        font-size: 0.875rem;
                        line-height: 1.6;
                      "
                    >
                      <div
                        style="
                          font-weight: 600;
                          font-size: 0.925rem;
                          margin-bottom: 0.4rem;
                          display: flex;
                          align-items: center;
                          gap: 0.5rem;
                          color: var(--danger, #ef4444);
                        "
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                        >
                          <path
                            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                          />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        提示：路由配置中存在重复配置项（具体关联规则与出站如下）：
                      </div>
                      <ul
                        style="
                          margin: 0;
                          padding-left: 1.35rem;
                          list-style-type: disc;
                        "
                      >
                        <li
                          v-for="(item, dIdx) in duplicateRouteRulesInfo"
                          :key="dIdx"
                          style="margin-top: 0.25rem"
                        >
                          <span style="font-weight: 500">{{
                            item.typeLabel
                          }}</span>
                          <code
                            style="
                              margin: 0 0.35rem;
                              padding: 2px 6px;
                              background: rgba(239, 68, 68, 0.15);
                              border-radius: 4px;
                              font-weight: 600;
                              color: var(--danger, #ef4444);
                            "
                            >{{ item.value }}</code
                          >
                          存在重复，涉及规则
                          <strong>#{{ item.ruleIndices.join(", #") }}</strong>
                          <span style="opacity: 0.9">
                            (目标出站: {{ item.outbounds.join(", ") }})</span
                          >
                        </li>
                      </ul>
                    </div>
                    <div class="table-container">
                      <table class="table">
                        <thead>
                          <tr>
                            <th style="width: 25%">目标出站 (Outbound)</th>
                            <th style="width: 55%">过滤规则描述</th>
                            <th style="text-align: right; width: 180px">
                              排序 / 操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(rule, idx) in configData.route.rules"
                            :key="idx"
                          >
                            <td>
                              <select
                                v-if="rule.action && rule.action !== 'route'"
                                class="input-control table-input"
                                disabled
                                style="
                                  opacity: 0.6;
                                  cursor: not-allowed;
                                  background: rgba(255, 255, 255, 0.03);
                                "
                              >
                                <option>无需出站 ({{ rule.action }})</option>
                              </select>
                              <select
                                v-else
                                v-model="rule.outbound"
                                class="input-control table-input"
                                style="font-weight: 600"
                              >
                                <option
                                  v-if="
                                    rule.outbound &&
                                    !allOutboundTags.includes(rule.outbound)
                                  "
                                  :value="rule.outbound"
                                >
                                  {{ rule.outbound }} (当前值)
                                </option>
                                <option
                                  v-for="tag in allOutboundTags"
                                  :key="tag"
                                  :value="tag"
                                >
                                  {{ tag }}
                                </option>
                              </select>
                            </td>
                            <td style="font-size: 0.8rem">
                              <div class="dns-rule-criteria">
                                <!-- Logical rule badge -->
                                <div
                                  v-if="rule.type === 'logical'"
                                  class="criteria-tag rule-set-tag"
                                  style="
                                    font-weight: 600;
                                    border-color: var(--primary);
                                  "
                                >
                                  逻辑模式:
                                  {{
                                    rule.mode ? rule.mode.toUpperCase() : "OR"
                                  }}
                                </div>

                                <!-- Standard root criteria -->
                                <div
                                  v-if="rule.rule_set"
                                  class="criteria-tag rule-set-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'rule_set',
                                      rule.rule_set,
                                    ),
                                  }"
                                >
                                  RuleSet:
                                  {{
                                    Array.isArray(rule.rule_set)
                                      ? rule.rule_set.join(", ")
                                      : rule.rule_set
                                  }}
                                </div>
                                <div
                                  v-if="rule.geosite"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'geosite',
                                      rule.geosite,
                                    ),
                                  }"
                                >
                                  Geosite:
                                  {{
                                    Array.isArray(rule.geosite)
                                      ? rule.geosite.join(", ")
                                      : rule.geosite
                                  }}
                                </div>
                                <div
                                  v-if="rule.domain_suffix"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'domain_suffix',
                                      rule.domain_suffix,
                                    ),
                                  }"
                                >
                                  Suffix:
                                  {{
                                    Array.isArray(rule.domain_suffix)
                                      ? rule.domain_suffix.join(", ")
                                      : rule.domain_suffix
                                  }}
                                </div>
                                <div
                                  v-if="rule.domain"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'domain',
                                      rule.domain,
                                    ),
                                  }"
                                >
                                  Domain:
                                  {{
                                    Array.isArray(rule.domain)
                                      ? rule.domain.join(", ")
                                      : rule.domain
                                  }}
                                </div>
                                <div
                                  v-if="rule.geoip"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'geoip',
                                      rule.geoip,
                                    ),
                                  }"
                                >
                                  GeoIP:
                                  {{
                                    Array.isArray(rule.geoip)
                                      ? rule.geoip.join(", ")
                                      : rule.geoip
                                  }}
                                </div>
                                <div
                                  v-if="rule.ip_cidr"
                                  class="criteria-tag"
                                  :class="{
                                    'duplicate-tag': hasDuplicateInField(
                                      'ip_cidr',
                                      rule.ip_cidr,
                                    ),
                                  }"
                                >
                                  IP CIDR:
                                  {{
                                    Array.isArray(rule.ip_cidr)
                                      ? rule.ip_cidr.join(", ")
                                      : rule.ip_cidr
                                  }}
                                </div>
                                <div v-if="rule.port" class="criteria-tag">
                                  Port:
                                  {{
                                    Array.isArray(rule.port)
                                      ? rule.port.join(", ")
                                      : rule.port
                                  }}
                                </div>
                                <div v-if="rule.protocol" class="criteria-tag">
                                  Protocol:
                                  {{
                                    Array.isArray(rule.protocol)
                                      ? rule.protocol.join(", ")
                                      : rule.protocol
                                  }}
                                </div>
                                <div
                                  v-if="rule.ip_is_private"
                                  class="criteria-tag"
                                >
                                  私有 IP (ip_is_private)
                                </div>

                                <!-- Sub-rules criteria for logical rules -->
                                <template
                                  v-if="
                                    rule.type === 'logical' &&
                                    Array.isArray(rule.rules)
                                  "
                                >
                                  <template
                                    v-for="(sub, sidx) in rule.rules"
                                    :key="sidx"
                                  >
                                    <div
                                      v-if="sub.rule_set"
                                      class="criteria-tag rule-set-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'rule_set',
                                          sub.rule_set,
                                        ),
                                      }"
                                    >
                                      RuleSet:
                                      {{
                                        Array.isArray(sub.rule_set)
                                          ? sub.rule_set.join(", ")
                                          : sub.rule_set
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.geosite"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'geosite',
                                          sub.geosite,
                                        ),
                                      }"
                                    >
                                      Geosite:
                                      {{
                                        Array.isArray(sub.geosite)
                                          ? sub.geosite.join(", ")
                                          : sub.geosite
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.domain_suffix"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'domain_suffix',
                                          sub.domain_suffix,
                                        ),
                                      }"
                                    >
                                      Suffix:
                                      {{
                                        Array.isArray(sub.domain_suffix)
                                          ? sub.domain_suffix.join(", ")
                                          : sub.domain_suffix
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.domain"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'domain',
                                          sub.domain,
                                        ),
                                      }"
                                    >
                                      Domain:
                                      {{
                                        Array.isArray(sub.domain)
                                          ? sub.domain.join(", ")
                                          : sub.domain
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.geoip"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'geoip',
                                          sub.geoip,
                                        ),
                                      }"
                                    >
                                      GeoIP:
                                      {{
                                        Array.isArray(sub.geoip)
                                          ? sub.geoip.join(", ")
                                          : sub.geoip
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.ip_cidr"
                                      class="criteria-tag"
                                      :class="{
                                        'duplicate-tag': hasDuplicateInField(
                                          'ip_cidr',
                                          sub.ip_cidr,
                                        ),
                                      }"
                                    >
                                      IP CIDR:
                                      {{
                                        Array.isArray(sub.ip_cidr)
                                          ? sub.ip_cidr.join(", ")
                                          : sub.ip_cidr
                                      }}
                                    </div>
                                    <div v-if="sub.port" class="criteria-tag">
                                      Port:
                                      {{
                                        Array.isArray(sub.port)
                                          ? sub.port.join(", ")
                                          : sub.port
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.protocol"
                                      class="criteria-tag"
                                    >
                                      Protocol:
                                      {{
                                        Array.isArray(sub.protocol)
                                          ? sub.protocol.join(", ")
                                          : sub.protocol
                                      }}
                                    </div>
                                    <div
                                      v-if="sub.ip_is_private"
                                      class="criteria-tag"
                                    >
                                      私有 IP (ip_is_private)
                                    </div>
                                  </template>
                                </template>

                                <div
                                  v-if="rule.action"
                                  class="criteria-tag action-tag"
                                >
                                  动作: {{ rule.action }}
                                </div>
                                <div
                                  v-if="
                                    !rule.type &&
                                    !rule.rule_set &&
                                    !rule.geosite &&
                                    !rule.domain_suffix &&
                                    !rule.domain &&
                                    !rule.geoip &&
                                    !rule.ip_cidr &&
                                    !rule.port &&
                                    !rule.protocol &&
                                    !rule.ip_is_private &&
                                    !rule.action
                                  "
                                  style="color: var(--text-muted)"
                                >
                                  （无条件，匹配全部）
                                </div>
                              </div>
                            </td>
                            <td style="text-align: right">
                              <div class="flex gap-1 justify-end">
                                <button
                                  class="btn btn-secondary table-btn"
                                  style="padding: 0.2rem 0.35rem"
                                  :disabled="idx === 0"
                                  @click="
                                    moveItem(configData.route.rules, idx, -1)
                                  "
                                >
                                  ▲
                                </button>
                                <button
                                  class="btn btn-secondary table-btn"
                                  style="padding: 0.2rem 0.35rem"
                                  :disabled="
                                    idx === configData.route.rules.length - 1
                                  "
                                  @click="
                                    moveItem(configData.route.rules, idx, 1)
                                  "
                                >
                                  ▼
                                </button>
                                <button
                                  class="btn btn-secondary table-btn"
                                  title="同步此规则至 DNS 分流规则"
                                  style="color: var(--primary); border-color: rgba(99, 102, 241, 0.3)"
                                  @click="openSyncModal(rule, 'route', idx)"
                                >
                                  ⇄ 同步
                                </button>
                                <button
                                  class="btn btn-secondary table-btn"
                                  @click="
                                    editItem(
                                      rule,
                                      'route_rule',
                                      (parsed) =>
                                        (configData.route.rules[idx] = parsed),
                                      idx,
                                    )
                                  "
                                >
                                  编辑
                                </button>
                                <button
                                  class="btn btn-danger table-btn"
                                  @click="configData.route.rules.splice(idx, 1)"
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                          <tr v-if="configData.route.rules.length === 0">
                            <td
                              colspan="3"
                              style="
                                text-align: center;
                                color: var(--text-muted);
                              "
                            >
                              暂无路由规则。
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Rule Sets List -->
                  <div class="visual-section-box" style="margin-top: 1.5rem">
                    <div class="flex justify-between items-center mb-2">
                      <span class="visual-section-title"
                        >分流规则集集合 (rule_set)</span
                      >
                      <button
                        class="btn btn-secondary"
                        style="padding: 0.3rem 0.6rem; font-size: 0.8rem"
                        @click="addRuleSet"
                      >
                        + 添加规则集
                      </button>
                    </div>
                    <div class="table-container">
                      <table class="table">
                        <thead>
                          <tr>
                            <th style="width: 15%">Tag</th>
                            <th style="width: 15%">Type</th>
                            <th style="width: 15%">Format</th>
                            <th style="width: 45%">配置详情 (URL/Path)</th>
                            <th style="text-align: right; width: 100px">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(rs, idx) in configData.route.rule_set"
                            :key="idx"
                          >
                            <td>
                              <input
                                v-model="rs.tag"
                                type="text"
                                class="input-control table-input"
                                style="font-weight: 600"
                                placeholder="tag"
                              />
                            </td>
                            <td>
                              <select
                                v-model="rs.type"
                                class="input-control table-input"
                                @change="onRuleSetTypeChange(rs)"
                              >
                                <option value="remote">remote</option>
                                <option value="local">local</option>
                              </select>
                            </td>
                            <td>
                              <select
                                v-model="rs.format"
                                class="input-control table-input"
                              >
                                <option value="binary">binary</option>
                                <option value="source">source</option>
                              </select>
                            </td>
                            <td>
                              <div
                                v-if="rs.type === 'remote'"
                                class="flex flex-col gap-2"
                                style="font-size: 0.8rem; padding: 0.2rem 0"
                              >
                                <div
                                  style="
                                    display: flex;
                                    gap: 0.5rem;
                                    align-items: center;
                                  "
                                >
                                  <span
                                    style="
                                      width: 75px;
                                      color: var(--text-muted);
                                      flex-shrink: 0;
                                      text-align: right;
                                    "
                                    >URL:</span
                                  >
                                  <input
                                    v-model="rs.url"
                                    type="text"
                                    class="input-control table-input"
                                    style="flex: 1"
                                    placeholder="请输入远程下载 URL"
                                  />
                                </div>
                                <div
                                  style="
                                    display: flex;
                                    gap: 0.5rem;
                                    align-items: center;
                                    font-size: 0.75rem;
                                  "
                                >
                                  <span
                                    style="
                                      width: 75px;
                                      color: var(--text-muted);
                                      flex-shrink: 0;
                                      text-align: right;
                                    "
                                    >下载代理:</span
                                  >
                                  <select
                                    v-model="rs.download_detour"
                                    class="input-control table-input"
                                    style="
                                      flex: 1;
                                      min-width: 90px;
                                      padding: 0.15rem 0.25rem;
                                      height: auto;
                                    "
                                  >
                                    <option
                                      v-if="
                                        rs.download_detour &&
                                        !allOutboundTags.includes(
                                          rs.download_detour,
                                        )
                                      "
                                      :value="rs.download_detour"
                                    >
                                      {{ rs.download_detour }} (当前值)
                                    </option>
                                    <option
                                      v-for="tag in allOutboundTags"
                                      :key="tag"
                                      :value="tag"
                                    >
                                      {{ tag }}
                                    </option>
                                  </select>
                                  <span
                                    style="
                                      color: var(--text-muted);
                                      margin-left: 0.25rem;
                                    "
                                    >更新间隔:</span
                                  >
                                  <input
                                    v-model="rs.update_interval"
                                    type="text"
                                    class="input-control table-input"
                                    style="
                                      width: 55px;
                                      padding: 0.15rem 0.25rem;
                                    "
                                    placeholder="1d"
                                  />
                                </div>
                              </div>
                              <div
                                v-else
                                style="
                                  display: flex;
                                  gap: 0.5rem;
                                  align-items: center;
                                  padding: 0.2rem 0;
                                  font-size: 0.8rem;
                                "
                              >
                                <span
                                  style="
                                    width: 75px;
                                    color: var(--text-muted);
                                    flex-shrink: 0;
                                    text-align: right;
                                  "
                                  >路径:</span
                                >
                                <input
                                  v-model="rs.path"
                                  type="text"
                                  class="input-control table-input"
                                  style="flex: 1"
                                  placeholder="rules/file.srs"
                                />
                              </div>
                            </td>
                            <td style="text-align: right">
                              <div class="flex gap-1 justify-end">
                                <button
                                  class="btn btn-secondary table-btn"
                                  @click="
                                    editItem(
                                      rs,
                                      'route_ruleset',
                                      (parsed) =>
                                        (configData.route.rule_set[idx] =
                                          parsed),
                                      idx,
                                    )
                                  "
                                >
                                  编辑
                                </button>
                                <button
                                  class="btn btn-danger table-btn"
                                  @click="
                                    configData.route.rule_set.splice(idx, 1)
                                  "
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                          <tr v-if="configData.route.rule_set.length === 0">
                            <td
                              colspan="5"
                              style="
                                text-align: center;
                                color: var(--text-muted);
                              "
                            >
                              暂无路由规则集。
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <!-- EXPERIMENTAL VISUAL -->
                <div v-if="section === 'experimental'">
                  <!-- Cache File Section -->
                  <div
                    style="
                      border: 1px solid var(--border-color);
                      padding: 1.25rem;
                      border-radius: 8px;
                      margin-bottom: 1.5rem;
                      background: rgba(255, 255, 255, 0.01);
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 1rem;
                      "
                    >
                      <input
                        id="exp-cache-enabled"
                        v-model="configData.experimental.cache_file.enabled"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <label
                        for="exp-cache-enabled"
                        style="
                          font-weight: 600;
                          cursor: pointer;
                          color: var(--secondary);
                          font-size: 1.1rem;
                        "
                        >本地缓存数据库 (cache_file)</label
                      >
                    </div>
                    <div v-if="configData.experimental.cache_file.enabled">
                      <div class="input-group">
                        <label>缓存文件路径 (如 cache.db)</label>
                        <input
                          v-model="configData.experimental.cache_file.path"
                          type="text"
                          class="input-control"
                          placeholder="cache.db"
                        />
                      </div>
                      <div
                        style="
                          display: grid;
                          grid-template-columns: repeat(
                            auto-fit,
                            minmax(200px, 1fr)
                          );
                          gap: 1rem;
                          margin-top: 1rem;
                        "
                      >
                        <label
                          style="
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                            cursor: pointer;
                          "
                        >
                          <input
                            v-model="
                              configData.experimental.cache_file.store_fakeip
                            "
                            type="checkbox"
                          />
                          <span>记录 FakeIP 映射 (store_fakeip)</span>
                        </label>
                        <label
                          style="
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                            cursor: pointer;
                          "
                        >
                          <input
                            v-model="
                              configData.experimental.cache_file.store_rdrc
                            "
                            type="checkbox"
                          />
                          <span>记录 RDRC 映射 (store_rdrc)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- Clash API Section -->
                  <div
                    style="
                      border: 1px solid var(--border-color);
                      padding: 1.25rem;
                      border-radius: 8px;
                      background: rgba(255, 255, 255, 0.01);
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 1rem;
                      "
                    >
                      <input
                        id="exp-clash-enabled"
                        v-model="configData.experimental.clash_api.enabled"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <label
                        for="exp-clash-enabled"
                        style="
                          font-weight: 600;
                          cursor: pointer;
                          color: var(--secondary);
                          font-size: 1.1rem;
                        "
                        >Clash RESTful API 接口 (clash_api)</label
                      >
                    </div>
                    <div
                      v-if="configData.experimental.clash_api.enabled"
                      class="grid-2"
                    >
                      <div class="input-group">
                        <label>REST API 监听地址与端口</label>
                        <input
                          v-model="
                            configData.experimental.clash_api
                              .external_controller
                          "
                          type="text"
                          class="input-control"
                          placeholder="127.0.0.1:9090"
                        />
                      </div>
                      <div class="input-group">
                        <label>API 访问密钥 (Secret)</label>
                        <input
                          v-model="configData.experimental.clash_api.secret"
                          type="text"
                          class="input-control"
                          placeholder="访问密码"
                        />
                      </div>
                      <div class="input-group" style="margin-top: 0.75rem">
                        <label>Clash WebUI 静态文件路径 (external_ui)</label>
                        <input
                          v-model="
                            configData.experimental.clash_api.external_ui
                          "
                          type="text"
                          class="input-control"
                          placeholder="folder/ui"
                        />
                      </div>
                      <div class="input-group" style="margin-top: 0.75rem">
                        <label>默认模式 (default_mode)</label>
                        <select
                          v-model="
                            configData.experimental.clash_api.default_mode
                          "
                          class="input-control"
                        >
                          <option value="rule">规则分流 (rule)</option>
                          <option value="global">全局代理 (global)</option>
                          <option value="direct">全局直连 (direct)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- No per-section save buttons anymore -->
              <div
                v-if="false"
                style="display: flex; gap: 1rem; margin-top: 1.5rem"
              >
                <button class="btn" @click="saveVueConfigSection(section)">
                  保存{{ section }}配置
                </button>
                <button
                  class="btn"
                  style="background: var(--secondary)"
                  @click="previewGeneratedConfig"
                >
                  预览完整配置
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
      <!-- close config-main -->
    </div>
    <!-- close view-body -->

    <!-- Nested Item JSON/Visual Editor Modal -->
    <div class="modal" :class="{ active: itemModal.show }">
      <div class="modal-card" style="max-width: 700px; width: 90%">
        <div class="modal-header">
          <span>{{ itemModal.title }}</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="itemModal.show = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <div class="modal-body">
          <div
            class="toggle-group"
            style="
              display: flex;
              justify-content: flex-end;
              gap: 0.5rem;
              margin-bottom: 1rem;
              margin-top: 0.5rem;
            "
          >
            <button
              type="button"
              class="btn-toggle"
              :class="{ active: itemModal.mode === 'visual' }"
              @click="setItemModalMode('visual')"
            >
              可视化表单
            </button>
            <button
              type="button"
              class="btn-toggle"
              :class="{ active: itemModal.mode === 'json' }"
              @click="setItemModalMode('json')"
            >
              JSON 源码
            </button>
          </div>

          <!-- A. Visual Form Mode -->
          <div
            v-if="itemModal.mode === 'visual'"
            style="max-height: 450px; overflow-y: auto; padding-right: 0.5rem"
          >
            <!-- 1. DNS Server fields -->
            <div v-if="itemModal.itemType === 'dns_server'">
              <div class="grid-2">
                <div class="input-group">
                  <label>Tag 名称 (唯一标识)</label>
                  <input
                    v-model="itemModal.itemData.tag"
                    type="text"
                    class="input-control"
                    placeholder="例如: fakeip-dns"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>类型 (Type)</label>
                  <select
                    v-model="itemModal.itemData.type"
                    class="input-control"
                    required
                    @change="onModalDnsServerTypeChange"
                  >
                    <option value="fakeip">fakeip (FakeIP 虚假 IP 映射)</option>
                    <option value="local">local (系统本地 DNS)</option>
                    <option value="udp">udp (普通 UDP)</option>
                    <option value="tcp">tcp (普通 TCP)</option>
                    <option value="https">https (DoH 加密)</option>
                    <option value="tls">tls (DoT 加密)</option>
                    <option value="quic">quic (DoQ 加密)</option>
                  </select>
                </div>
              </div>

              <!-- FakeIP specific fields -->
              <div
                v-if="itemModal.itemData.type === 'fakeip'"
                style="
                  margin-top: 1rem;
                  padding: 0.75rem;
                  background: rgba(99, 102, 241, 0.07);
                  border-radius: 8px;
                  border-left: 3px solid var(--primary);
                "
              >
                <div
                  style="
                    font-size: 0.85rem;
                    color: var(--text-muted);
                    margin-bottom: 0.75rem;
                  "
                >
                  <strong style="color: var(--primary)">FakeIP 模式：</strong
                  >为匹配 DNS 规则的域名返回虚假 IP 地址，用于劫持流量送入代理。
                </div>
                <div class="grid-2">
                  <div class="input-group">
                    <label>IPv4 地址池 (inet4_range)</label>
                    <input
                      v-model="itemModal.itemData.inet4_range"
                      type="text"
                      class="input-control"
                      placeholder="198.18.0.0/15"
                    />
                  </div>
                  <div class="input-group">
                    <label>IPv6 地址池 (inet6_range)</label>
                    <input
                      v-model="itemModal.itemData.inet6_range"
                      type="text"
                      class="input-control"
                      placeholder="fc00::/18"
                    />
                  </div>
                </div>
              </div>

              <!-- Normal DNS server fields -->
              <div
                v-if="
                  itemModal.itemData.type !== 'local' &&
                  itemModal.itemData.type !== 'fakeip'
                "
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>服务器地址 (Server)</label>
                  <input
                    v-model="itemModal.itemData.server"
                    type="text"
                    class="input-control"
                    :placeholder="
                      getAddressPlaceholder(itemModal.itemData.type)
                    "
                    required
                  />
                </div>
                <div class="input-group">
                  <label>出站连接 Tag (Detour)</label>
                  <select
                    v-model="itemModal.itemData.detour"
                    class="input-control"
                  >
                    <option value="">-- 无 (直连) --</option>
                    <option
                      v-if="
                        itemModal.itemData.detour &&
                        !allOutboundTags.includes(itemModal.itemData.detour)
                      "
                      :value="itemModal.itemData.detour"
                    >
                      {{ itemModal.itemData.detour }} (当前值)
                    </option>
                    <option
                      v-for="tag in allOutboundTags"
                      :key="tag"
                      :value="tag"
                    >
                      {{ tag }}
                    </option>
                  </select>
                </div>
              </div>
              <div
                v-if="
                  itemModal.itemData.type !== 'local' &&
                  itemModal.itemData.type !== 'fakeip'
                "
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>ECS 客户端子网 (client_subnet)</label>
                  <input
                    v-model="itemModal.itemData.client_subnet"
                    type="text"
                    class="input-control"
                    placeholder="1.1.1.1"
                  />
                </div>
              </div>
            </div>

            <!-- 2. DNS Rule fields -->
            <div v-if="itemModal.itemType === 'dns_rule'">
              <div class="grid-2" style="margin-bottom: 1rem">
                <div class="input-group">
                  <label>规则匹配逻辑 (Rule Logic)</label>
                  <select
                    v-model="itemModal.routeRuleLogic"
                    class="input-control"
                  >
                    <option value="or">
                      逻辑或 OR (满足下方任意非空条件即可 - 建议默认)
                    </option>
                    <option value="standard">
                      默认 AND 逻辑 (需同时满足下方所有非空条件)
                    </option>
                    <option value="and">逻辑与 AND (仅用于特殊嵌套逻辑)</option>
                  </select>
                </div>
                <div class="input-group">
                  <label>目标 DNS 服务器 Tag (server)</label>
                  <select
                    v-model="itemModal.itemData.server"
                    class="input-control"
                    required
                  >
                    <option
                      v-if="
                        itemModal.itemData.server &&
                        !configData.dns.servers.some(
                          (s) => s.tag === itemModal.itemData.server,
                        )
                      "
                      :value="itemModal.itemData.server"
                    >
                      {{ itemModal.itemData.server }} (当前值)
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

              <!-- Invert and client_subnet -->
              <div class="grid-2" style="margin-bottom: 1rem">
                <div class="input-group">
                  <label>ECS 客户端子网 (client_subnet)</label>
                  <input
                    v-model="itemModal.itemData.client_subnet"
                    type="text"
                    class="input-control"
                    placeholder="例如: 223.5.5.0/24"
                  />
                </div>
                <div
                  class="input-group"
                  style="display: flex; align-items: center; margin-top: 1.5rem"
                >
                  <label
                    style="
                      display: flex;
                      align-items: center;
                      gap: 0.25rem;
                      cursor: pointer;
                    "
                  >
                    <input
                      v-model="itemModal.itemData.invert"
                      type="checkbox"
                    />
                    <span>反转匹配条件 (invert)</span>
                  </label>
                </div>
              </div>

              <!-- Coexisting condition fields -->
              <div style="display: flex; flex-direction: column; gap: 1rem">
                <div class="input-group">
                  <label>规则集列表 (rule_set, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.rule_set"
                    class="input-control"
                    style="height: 80px"
                    placeholder="geosite-google&#10;geosite-cn"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>域名后缀 (domain_suffix, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.domain_suffix"
                    class="input-control"
                    style="height: 80px"
                    placeholder="google.com&#10;youtube.com"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>Geosite 规则集名称 (geosite, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.geosite"
                    class="input-control"
                    style="height: 80px"
                    placeholder="cn&#10;geolocation-!cn"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>精确域名 (domain, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.domain"
                    class="input-control"
                    style="height: 80px"
                    placeholder="www.google.com&#10;api.github.com"
                  ></textarea>
                </div>

                <div style="margin-top: 0.5rem; text-align: center">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    style="padding: 0.25rem 0.5rem; font-size: 0.78rem"
                    @click="showAdvancedDnsFields = !showAdvancedDnsFields"
                  >
                    {{
                      showAdvancedDnsFields
                        ? "收起高级匹配条件 ▴"
                        : "展开高级匹配条件 (域名关键字/正则/GeoIP/IP网段/端口等) ▾"
                    }}
                  </button>
                </div>

                <div
                  v-show="showAdvancedDnsFields"
                  style="
                    border-top: 1px dashed var(--border-color);
                    padding-top: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                  "
                >
                  <div class="input-group">
                    <label>域名关键字 (domain_keyword, 每行一例)</label>
                    <textarea
                      v-model="itemModal.tempFields.domain_keyword"
                      class="input-control"
                      style="height: 80px"
                      placeholder="google&#10;github"
                    ></textarea>
                  </div>
                  <div class="input-group">
                    <label>域名正则表达式 (domain_regex, 每行一例)</label>
                    <textarea
                      v-model="itemModal.tempFields.domain_regex"
                      class="input-control"
                      style="height: 80px"
                      placeholder="^google\..*$"
                    ></textarea>
                  </div>
                  <div class="input-group">
                    <label>GeoIP 规则集 (geoip, 每行一例)</label>
                    <textarea
                      v-model="itemModal.tempFields.geoip"
                      class="input-control"
                      style="height: 80px"
                      placeholder="cn&#10;private"
                    ></textarea>
                  </div>
                  <div class="input-group">
                    <label>IP CIDR 网段 (ip_cidr, 每行一例)</label>
                    <textarea
                      v-model="itemModal.tempFields.ip_cidr"
                      class="input-control"
                      style="height: 80px"
                      placeholder="192.168.1.0/24"
                    ></textarea>
                  </div>
                  <div class="grid-2">
                    <div class="input-group">
                      <label>端口列表 (port, 逗号分隔)</label>
                      <input
                        v-model="itemModal.tempFields.port"
                        type="text"
                        class="input-control"
                        placeholder="53, 80"
                      />
                    </div>
                    <div class="input-group">
                      <label>来源入站连接 (inbound, 逗号分隔)</label>
                      <input
                        v-model="itemModal.tempFields.inbound"
                        type="text"
                        class="input-control"
                        placeholder="mixed-in"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. Inbound fields -->
            <div v-if="itemModal.itemType === 'inbound'">
              <div class="grid-2">
                <div class="input-group">
                  <label>入站 Tag 名称</label>
                  <input
                    v-model="itemModal.itemData.tag"
                    type="text"
                    class="input-control"
                    placeholder="mixed-in"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>入站协议类型</label>
                  <select
                    v-model="itemModal.itemData.type"
                    class="input-control"
                    required
                    @change="onInboundTypeChange(itemModal.itemData)"
                  >
                    <option value="mixed">mixed (混合 Socks/HTTP)</option>
                    <option value="tun">tun (虚拟网卡 TUN)</option>
                    <option value="socks">socks</option>
                    <option value="http">http</option>
                    <option value="tproxy">tproxy</option>
                    <option value="redirect">redirect</option>
                  </select>
                </div>
              </div>
              <div
                v-if="itemModal.itemData.type !== 'tun'"
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>监听地址</label>
                  <input
                    v-model="itemModal.itemData.listen"
                    type="text"
                    class="input-control"
                    placeholder="::"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>监听端口</label>
                  <input
                    v-model.number="itemModal.itemData.listen_port"
                    type="number"
                    class="input-control"
                    placeholder="2334"
                    required
                  />
                </div>
              </div>
              <div
                v-if="itemModal.itemData.type === 'tun'"
                style="
                  margin-top: 1rem;
                  border-top: 1px dotted var(--border-color);
                  padding-top: 1rem;
                "
              >
                <div class="grid-2">
                  <div class="input-group">
                    <label>网卡接口名称 (interface_name)</label>
                    <input
                      v-model="itemModal.itemData.interface_name"
                      type="text"
                      class="input-control"
                      placeholder="tun0"
                      required
                    />
                  </div>
                  <div class="input-group">
                    <label>网络协议栈 (stack)</label>
                    <select
                      v-model="itemModal.itemData.stack"
                      class="input-control"
                      required
                    >
                      <option value="gvisor">gvisor</option>
                      <option value="mixed">mixed</option>
                      <option value="system">system</option>
                    </select>
                  </div>
                </div>
                <div class="grid-2" style="margin-top: 1rem">
                  <div class="input-group">
                    <label>最大传输单元 (MTU)</label>
                    <input
                      v-model.number="itemModal.itemData.mtu"
                      type="number"
                      class="input-control"
                      placeholder="9000"
                    />
                  </div>
                </div>
                <div
                  style="
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    margin-top: 1rem;
                  "
                >
                  <label
                    style="
                      display: flex;
                      align-items: center;
                      gap: 0.5rem;
                      cursor: pointer;
                    "
                  >
                    <input
                      v-model="itemModal.itemData.auto_route"
                      type="checkbox"
                    />
                    <span>自动路由 (auto_route)</span>
                  </label>
                  <label
                    style="
                      display: flex;
                      align-items: center;
                      gap: 0.5rem;
                      cursor: pointer;
                    "
                  >
                    <input
                      v-model="itemModal.itemData.strict_route"
                      type="checkbox"
                    />
                    <span>严格路由 (strict_route)</span>
                  </label>
                  <label
                    style="
                      display: flex;
                      align-items: center;
                      gap: 0.5rem;
                      cursor: pointer;
                    "
                    title="仅支持 Linux 系统"
                  >
                    <input
                      v-model="itemModal.itemData.auto_redirect"
                      type="checkbox"
                    />
                    <span>自动重定向 (auto_redirect)</span>
                    <span
                      style="
                        font-size: 0.8rem;
                        color: var(--text-muted);
                        margin-left: 0.2rem;
                      "
                      >(仅限 Linux)</span
                    >
                  </label>
                </div>
              </div>
            </div>

            <!-- 4. Route Rule fields -->
            <div v-if="itemModal.itemType === 'route_rule'">
              <div class="grid-2" style="margin-bottom: 1rem">
                <div class="input-group">
                  <label>规则匹配逻辑</label>
                  <select
                    v-model="itemModal.routeRuleLogic"
                    class="input-control"
                  >
                    <option value="standard">
                      默认 AND 逻辑 (需同时满足下方所有非空条件)
                    </option>
                    <option value="or">
                      逻辑或 OR (满足下方任意非空条件即可)
                    </option>
                    <option value="and">逻辑与 AND (仅用于特殊嵌套逻辑)</option>
                  </select>
                </div>
              </div>
              <div class="grid-2">
                <div class="input-group">
                  <label>动作 (Action)</label>
                  <select
                    v-model="itemModal.itemData.action"
                    class="input-control"
                    @change="onRouteRuleActionChange"
                  >
                    <option value="route">route (路由选择)</option>
                    <option value="reject">reject (拦截阻断)</option>
                    <option value="hijack-dns">hijack-dns (劫持 DNS)</option>
                    <option value="sniff">sniff (流量嗅探)</option>
                  </select>
                </div>
                <div
                  v-if="
                    itemModal.itemData.action === 'route' ||
                    !itemModal.itemData.action
                  "
                  class="input-group"
                >
                  <label>目标出站 Tag (outbound)</label>
                  <select
                    v-model="itemModal.itemData.outbound"
                    class="input-control"
                    required
                  >
                    <option
                      v-if="
                        itemModal.itemData.outbound &&
                        !allOutboundTags.includes(itemModal.itemData.outbound)
                      "
                      :value="itemModal.itemData.outbound"
                    >
                      {{ itemModal.itemData.outbound }} (当前值)
                    </option>
                    <option
                      v-for="tag in allOutboundTags"
                      :key="tag"
                      :value="tag"
                    >
                      {{ tag }}
                    </option>
                  </select>
                </div>
              </div>
              <div
                style="
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                  gap: 1rem;
                  margin-top: 1rem;
                "
              >
                <label
                  style="
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                  "
                >
                  <input
                    v-model="itemModal.itemData.ip_is_private"
                    type="checkbox"
                  />
                  <span>私有 IP 匹配 (ip_is_private)</span>
                </label>
                <label
                  style="
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                  "
                >
                  <input v-model="itemModal.itemData.invert" type="checkbox" />
                  <span>反转匹配条件 (invert)</span>
                </label>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>规则集列表 (rule_set, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.rule_set"
                  class="input-control"
                  style="height: 80px"
                  placeholder="geoip-cn&#10;geosite-cn"
                ></textarea>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>域名后缀 (domain_suffix, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.domain_suffix"
                  class="input-control"
                  style="height: 80px"
                  placeholder="google.com&#10;github.com"
                ></textarea>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>Geosite (geosite, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.geosite"
                  class="input-control"
                  style="height: 80px"
                  placeholder="cn&#10;apple"
                ></textarea>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>GeoIP (geoip, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.geoip"
                  class="input-control"
                  style="height: 80px"
                  placeholder="cn&#10;private"
                ></textarea>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>IP CIDR 网段 (ip_cidr, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.ip_cidr"
                  class="input-control"
                  style="height: 80px"
                  placeholder="192.168.1.0/24"
                ></textarea>
              </div>
              <div class="grid-2" style="margin-top: 1rem">
                <div class="input-group">
                  <label>应用层协议 (protocol)</label>
                  <input
                    v-model="itemModal.tempFields.protocol"
                    type="text"
                    class="input-control"
                    placeholder="http, tls, dns"
                  />
                </div>
                <div class="input-group">
                  <label>端口列表 (port)</label>
                  <input
                    v-model="itemModal.tempFields.port"
                    type="text"
                    class="input-control"
                    placeholder="80, 443, 8080"
                  />
                </div>
              </div>
              <div style="margin-top: 1.5rem; text-align: center">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  style="padding: 0.25rem 0.5rem; font-size: 0.78rem"
                  @click="showAdvancedRouteFields = !showAdvancedRouteFields"
                >
                  {{
                    showAdvancedRouteFields
                      ? "收起高级匹配条件 ▴"
                      : "展开高级匹配条件 ▾"
                  }}
                </button>
              </div>
              <div
                v-show="showAdvancedRouteFields"
                style="
                  margin-top: 1rem;
                  border-top: 1px dashed var(--border-color);
                  padding-top: 1rem;
                  display: flex;
                  flex-direction: column;
                  gap: 1rem;
                "
              >
                <div class="input-group">
                  <label>精确域名 (domain, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.domain"
                    class="input-control"
                    style="height: 80px"
                    placeholder="www.google.com"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>域名关键字 (domain_keyword)</label>
                  <textarea
                    v-model="itemModal.tempFields.domain_keyword"
                    class="input-control"
                    style="height: 80px"
                    placeholder="google"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>域名正则表达式 (domain_regex)</label>
                  <textarea
                    v-model="itemModal.tempFields.domain_regex"
                    class="input-control"
                    style="height: 80px"
                    placeholder="^google\..*$"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>来源入站连接 Tag (inbound)</label>
                  <textarea
                    v-model="itemModal.tempFields.inbound"
                    class="input-control"
                    style="height: 80px"
                    placeholder="mixed-in"
                  ></textarea>
                </div>
              </div>
            </div>

            <!-- 5. Route RuleSet fields -->
            <div v-if="itemModal.itemType === 'route_ruleset'">
              <div class="grid-2">
                <div class="input-group">
                  <label>Tag 标签名称</label>
                  <input
                    v-model="itemModal.itemData.tag"
                    type="text"
                    class="input-control"
                    placeholder="geosite-cn"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>类型 (Type)</label>
                  <select
                    v-model="itemModal.itemData.type"
                    class="input-control"
                    required
                    @change="onRuleSetTypeChange(itemModal.itemData)"
                  >
                    <option value="remote">remote (远程下载)</option>
                    <option value="local">local (本地文件)</option>
                  </select>
                </div>
              </div>
              <div class="grid-2" style="margin-top: 1rem">
                <div class="input-group">
                  <label>数据格式 (Format)</label>
                  <select
                    v-model="itemModal.itemData.format"
                    class="input-control"
                    required
                  >
                    <option value="binary">binary (.srs)</option>
                    <option value="source">source (.json)</option>
                  </select>
                </div>
                <div
                  v-if="itemModal.itemData.type === 'remote'"
                  class="input-group"
                >
                  <label>下载连接 (URL)</label>
                  <input
                    v-model="itemModal.itemData.url"
                    type="text"
                    class="input-control"
                    placeholder="http://..."
                    required
                  />
                </div>
                <div
                  v-if="itemModal.itemData.type === 'local'"
                  class="input-group"
                >
                  <label>本地路径 (Path)</label>
                  <input
                    v-model="itemModal.itemData.path"
                    type="text"
                    class="input-control"
                    placeholder="rules/file.srs"
                    required
                  />
                </div>
              </div>
              <div
                v-if="itemModal.itemData.type === 'remote'"
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>下载出站代理 Tag (download_detour)</label>
                  <select
                    v-model="itemModal.itemData.download_detour"
                    class="input-control"
                  >
                    <option
                      v-if="
                        itemModal.itemData.download_detour &&
                        !allOutboundTags.includes(
                          itemModal.itemData.download_detour,
                        )
                      "
                      :value="itemModal.itemData.download_detour"
                    >
                      {{ itemModal.itemData.download_detour }} (当前值)
                    </option>
                    <option
                      v-for="tag in allOutboundTags"
                      :key="tag"
                      :value="tag"
                    >
                      {{ tag }}
                    </option>
                  </select>
                </div>
                <div class="input-group">
                  <label>更新时间间隔 (update_interval)</label>
                  <input
                    v-model="itemModal.itemData.update_interval"
                    type="text"
                    class="input-control"
                    placeholder="1d"
                  />
                </div>
              </div>
            </div>

            <!-- 6. Outbound fields -->
            <div v-if="itemModal.itemType === 'outbound'">
              <div class="grid-2">
                <div class="input-group">
                  <label>出站 Tag 标签名称</label>
                  <input
                    v-model="itemModal.itemData.tag"
                    type="text"
                    class="input-control"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>出站类型 (Type)</label>
                  <select
                    v-model="itemModal.itemData.type"
                    class="input-control"
                    required
                  >
                    <option value="direct">direct</option>
                    <option value="block">block</option>
                    <option value="dns">dns</option>
                    <option value="selector">selector</option>
                    <option value="urltest">urltest</option>
                    <option value="trojan">trojan</option>
                    <option value="vless">vless</option>
                    <option value="vmess">vmess</option>
                    <option value="shadowsocks">shadowsocks</option>
                    <option value="wireguard">wireguard</option>
                    <option value="hysteria2">hysteria2</option>
                    <option value="tuic">tuic</option>
                  </select>
                </div>
              </div>

              <!-- Selector / URLTest fields -->
              <div
                v-if="['selector', 'urltest'].includes(itemModal.itemData.type)"
                class="input-group"
                style="margin-top: 1rem"
              >
                <label>子出站 Tags 列表 (用换行或逗号分隔)</label>
                <textarea
                  v-model="itemModal.tempFields.outbounds"
                  class="input-control"
                  style="height: 100px"
                  placeholder="proxy&#10;direct&#10;block"
                ></textarea>
              </div>
              <div
                v-if="itemModal.itemData.type === 'urltest'"
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>测速 URL (url)</label>
                  <input
                    v-model="itemModal.itemData.url"
                    type="text"
                    class="input-control"
                    placeholder="http://cp.cloudflare.com/generate_204"
                  />
                </div>
                <div class="input-group">
                  <label>测速间隔 (interval)</label>
                  <input
                    v-model="itemModal.itemData.interval"
                    type="text"
                    class="input-control"
                    placeholder="3m"
                  />
                </div>
              </div>

              <!-- Proxy common fields -->
              <div
                v-if="
                  !['direct', 'block', 'dns', 'selector', 'urltest'].includes(
                    itemModal.itemData.type,
                  )
                "
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>服务器地址</label>
                  <input
                    v-model="itemModal.itemData.server"
                    type="text"
                    class="input-control"
                    placeholder="example.com"
                  />
                </div>
                <div class="input-group">
                  <label>服务端口</label>
                  <input
                    v-model.number="itemModal.itemData.port"
                    type="number"
                    class="input-control"
                    placeholder="443"
                  />
                </div>
              </div>

              <!-- Credentials block -->
              <div
                v-if="
                  [
                    'vmess',
                    'vless',
                    'trojan',
                    'shadowsocks',
                    'hysteria2',
                    'tuic',
                  ].includes(itemModal.itemData.type)
                "
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div
                  v-if="
                    ['vless', 'vmess', 'tuic'].includes(itemModal.itemData.type)
                  "
                  class="input-group"
                >
                  <label>UUID / 用户 ID</label>
                  <input
                    v-model="itemModal.itemData.uuid"
                    type="text"
                    class="input-control"
                  />
                </div>
                <div
                  v-if="
                    ['shadowsocks', 'trojan', 'hysteria2', 'tuic'].includes(
                      itemModal.itemData.type,
                    )
                  "
                  class="input-group"
                >
                  <label>密码</label>
                  <input
                    v-model="itemModal.itemData.password"
                    type="text"
                    class="input-control"
                  />
                </div>
                <div
                  v-if="itemModal.itemData.type === 'shadowsocks'"
                  class="input-group"
                >
                  <label>加密方法 (method)</label>
                  <input
                    v-model="itemModal.itemData.method"
                    type="text"
                    class="input-control"
                    placeholder="aes-128-gcm"
                  />
                </div>
              </div>

              <!-- Hysteria2 Speed limits -->
              <div
                v-if="itemModal.itemData.type === 'hysteria2'"
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>上行带宽 Mbps</label>
                  <input
                    v-model.number="itemModal.itemData.up_mbps"
                    type="number"
                    class="input-control"
                    placeholder="100"
                  />
                </div>
                <div class="input-group">
                  <label>下行带宽 Mbps</label>
                  <input
                    v-model.number="itemModal.itemData.down_mbps"
                    type="number"
                    class="input-control"
                    placeholder="100"
                  />
                </div>
              </div>

              <!-- TLS Config Block -->
              <div
                v-if="
                  [
                    'vmess',
                    'vless',
                    'trojan',
                    'hysteria2',
                    'tuic',
                    'socks',
                    'http',
                  ].includes(itemModal.itemData.type)
                "
                style="
                  margin-top: 1rem;
                  border: 1px solid var(--border-color);
                  padding: 1rem;
                  border-radius: 8px;
                  background: rgba(255, 255, 255, 0.01);
                "
              >
                <div
                  style="
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                  "
                >
                  <input
                    id="outbound-tls-enabled"
                    v-model="itemModal.itemData.tls.enabled"
                    type="checkbox"
                    style="width: 1.1rem; height: 1.1rem"
                  />
                  <label
                    for="outbound-tls-enabled"
                    style="
                      font-weight: 600;
                      cursor: pointer;
                      color: var(--secondary);
                    "
                    >开启 TLS 传输加密</label
                  >
                </div>
                <div
                  v-if="itemModal.itemData.tls.enabled"
                  class="flex flex-col gap-3"
                >
                  <div class="grid-2">
                    <div class="input-group">
                      <label>服务器域名 (server_name / SNI)</label>
                      <input
                        v-model="itemModal.itemData.tls.server_name"
                        type="text"
                        class="input-control"
                        placeholder="留空默认使用服务器地址"
                      />
                    </div>
                    <div
                      class="input-group"
                      style="
                        display: flex;
                        align-items: center;
                        margin-top: 1.5rem;
                      "
                    >
                      <label
                        style="
                          display: flex;
                          align-items: center;
                          gap: 0.5rem;
                          cursor: pointer;
                        "
                      >
                        <input
                          v-model="itemModal.itemData.tls.insecure"
                          type="checkbox"
                        />
                        <span>允许不安全证书 (insecure / 跳过验证)</span>
                      </label>
                    </div>
                  </div>
                  <!-- Reality support -->
                  <div
                    v-if="['vless', 'vmess'].includes(itemModal.itemData.type)"
                    style="
                      border-top: 1px dashed var(--border-color);
                      padding-top: 0.75rem;
                      margin-top: 0.25rem;
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 0.75rem;
                      "
                    >
                      <input
                        id="outbound-reality-enabled"
                        v-model="itemModal.itemData.tls.reality.enabled"
                        type="checkbox"
                        style="width: 1rem; height: 1rem"
                      />
                      <label
                        for="outbound-reality-enabled"
                        style="
                          font-weight: 600;
                          cursor: pointer;
                          font-size: 0.9rem;
                        "
                        >启用 REALITY 伪装</label
                      >
                    </div>
                    <div
                      v-if="itemModal.itemData.tls.reality.enabled"
                      class="grid-2"
                    >
                      <div class="input-group">
                        <label>REALITY 公钥</label>
                        <input
                          v-model="itemModal.itemData.tls.reality.public_key"
                          type="text"
                          class="input-control"
                        />
                      </div>
                      <div class="input-group">
                        <label>REALITY 临时ID</label>
                        <input
                          v-model="itemModal.itemData.tls.reality.short_id"
                          type="text"
                          class="input-control"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Transport Config Block -->
              <div
                v-if="
                  ['vmess', 'vless', 'trojan', 'shadowsocks'].includes(
                    itemModal.itemData.type,
                  )
                "
                style="
                  margin-top: 1rem;
                  border: 1px solid var(--border-color);
                  padding: 1rem;
                  border-radius: 8px;
                  background: rgba(255, 255, 255, 0.01);
                "
              >
                <div class="grid-2">
                  <div class="input-group">
                    <label>传输层协议类型</label>
                    <select
                      v-model="itemModal.itemData.transport.type"
                      class="input-control"
                    >
                      <option value="">-- 默认 (TCP / 无额外传输) --</option>
                      <option value="ws">ws (WebSocket)</option>
                      <option value="grpc">grpc</option>
                      <option value="http">http</option>
                    </select>
                  </div>
                  <div
                    v-if="
                      ['ws', 'http'].includes(itemModal.itemData.transport.type)
                    "
                    class="input-group"
                  >
                    <label>Websocket/HTTP 路径</label>
                    <input
                      v-model="itemModal.itemData.transport.path"
                      type="text"
                      class="input-control"
                      placeholder="例如: /websocket"
                    />
                  </div>
                  <div
                    v-if="itemModal.itemData.transport.type === 'grpc'"
                    class="input-group"
                  >
                    <label>gRPC 服务名称</label>
                    <input
                      v-model="itemModal.itemData.transport.service_name"
                      type="text"
                      class="input-control"
                      placeholder="例如: grpc-service"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- B. JSON Code Mode -->
          <div v-if="itemModal.mode === 'json'">
            <div
              class="input-group"
              style="margin-top: 0.5rem; margin-bottom: 0.5rem"
            >
              <label>完整项目的 JSON 结构 (可添加任意非标准属性)</label>
              <textarea
                v-model="itemModal.jsonText"
                class="input-control"
                style="
                  font-family: var(--font-mono);
                  height: 280px;
                  font-size: 0.85rem;
                  background: rgba(0, 0, 0, 0.1);
                "
              ></textarea>
            </div>
          </div>

          <div
            v-if="itemModal.error"
            class="text-danger"
            style="
              margin-top: 0.5rem;
              font-size: 0.85rem;
              color: #f87171;
              background: rgba(248, 113, 113, 0.05);
              padding: 0.5rem;
              border-radius: 4px;
              border-left: 3px solid #f87171;
            "
          >
            <strong>校验错误: </strong>{{ itemModal.error }}
          </div>
        </div>
        <!-- End of modal-body -->

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            @click="itemModal.show = false"
          >
            取消
          </button>
          <button
            type="button"
            class="btn"
            :disabled="!!itemModal.error || itemModal.validating"
            @click="saveItem"
          >
            <span v-if="itemModal.validating">校验中...</span>
            <span v-else>确认保存</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Running Config Settings Modal -->
    <div
      class="modal"
      :class="{ active: runningConfigModal.show }"
      @click.self="closeRunningConfigModal"
    >
      <div
        class="modal-card"
        :style="{
          maxWidth: runningConfigModal.viewMode === 'log' ? '640px' : '540px',
          width: '90%',
          transition: 'max-width 0.25s ease',
        }"
      >
        <div class="modal-header">
          <span v-if="runningConfigModal.viewMode === 'form'">⚙️ 运行设置</span>
          <span v-else>📋 运行配置更新日志</span>
          <button
            class="close-btn"
            style="
              background: none;
              border: none;
              color: var(--text-muted);
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 4px;
            "
            :disabled="runningConfigModal.saving"
            @click="closeRunningConfigModal"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- Mode 1: Form View -->
          <div
            v-if="runningConfigModal.viewMode === 'form'"
            style="display: flex; flex-direction: column; gap: 1rem"
          >
            <div class="input-group">
              <label
                style="font-weight: 600; margin-bottom: 0.35rem; display: block"
                >选择运行配置</label
              >
              <select
                v-model="runningConfigForm.config_id"
                class="input-control"
                style="width: 100%"
              >
                <option :value="null">-- 请选择一个配置 --</option>
                <option
                  v-for="item in configList"
                  :key="item.id"
                  :value="item.id"
                >
                  #{{ item.id }} - {{ item.detail || "未命名配置" }}
                </option>
              </select>
            </div>

            <div class="input-group">
              <label
                style="font-weight: 600; margin-bottom: 0.35rem; display: block"
                >配置文件覆盖位置</label
              >
              <input
                v-model="runningConfigForm.config_path"
                type="text"
                class="input-control"
                style="width: 100%"
                placeholder="例如: /etc/sing-box/config.json"
              />
              <small
                style="
                  color: var(--text-muted);
                  font-size: 0.8rem;
                  margin-top: 0.25rem;
                  display: block;
                "
              >
                请填写绝对路径，目标位置若无写权限可配合下方 sudo 密码使用。
              </small>
            </div>

            <div class="input-group">
              <label
                style="font-weight: 600; margin-bottom: 0.35rem; display: block"
                >重启命令</label
              >
              <input
                v-model="runningConfigForm.restart_cmd"
                type="text"
                class="input-control"
                style="width: 100%"
                placeholder="例如: sudo systemctl restart sing-box"
              />
              <small
                style="
                  color: var(--text-muted);
                  font-size: 0.8rem;
                  margin-top: 0.25rem;
                  display: block;
                "
              >
                系统执行重启的 Shell 命令，留空则不执行。
              </small>
            </div>

            <div class="input-group">
              <label
                style="font-weight: 600; margin-bottom: 0.35rem; display: block"
                >Sudo 密码 (若重启命令或写入文件需要)</label
              >
              <input
                v-model="runningConfigForm.sudo_pass"
                type="password"
                class="input-control"
                style="width: 100%"
                :placeholder="
                  runningConfig.has_sudo_pass
                    ? '•••••• (已保存密码，留空不修改)'
                    : '输入 sudo 密码'
                "
              />
            </div>
          </div>

          <!-- Mode 2: Execution Log View -->
          <div v-else class="execution-log-view">
            <!-- Log Status Banner -->
            <div class="log-status-banner" :class="runningConfigModal.status">
              <div
                v-if="runningConfigModal.status === 'running'"
                class="flex items-center gap-2"
              >
                <span class="spinner"></span>
                <strong>正在执行运行配置更新，请稍候...</strong>
              </div>
              <div
                v-else-if="runningConfigModal.status === 'success'"
                class="flex items-center gap-2"
              >
                <span>🟢</span>
                <strong>{{
                  runningConfigModal.message ||
                  "配置已被覆盖更新，重启程序完成！"
                }}</strong>
              </div>
              <div
                v-else-if="runningConfigModal.status === 'failed'"
                class="flex items-center gap-2"
              >
                <span>🔴</span>
                <strong>{{
                  runningConfigModal.message ||
                  "更新步骤中断，请参考红色日志信息"
                }}</strong>
              </div>
            </div>

            <!-- Terminal Window -->
            <div class="terminal-container">
              <div class="terminal-header">
                <div class="terminal-dots">
                  <span class="dot red"></span>
                  <span class="dot yellow"></span>
                  <span class="dot green"></span>
                </div>
                <span class="terminal-title">singbox-deployment.log</span>
                <button
                  v-if="runningConfigModal.logs.length > 0"
                  class="btn-copy-log"
                  type="button"
                  title="复制日志"
                  @click="copyLogConsole"
                >
                  📋 复制日志
                </button>
              </div>

              <div ref="logConsoleRef" class="terminal-body">
                <div
                  v-for="(item, idx) in runningConfigModal.logs"
                  :key="idx"
                  class="log-entry"
                  :class="item.status"
                >
                  <span class="log-time">[{{ item.timestamp }}]</span>
                  <span class="log-tag" :class="item.status"
                    >[{{ item.step }}]</span
                  >
                  <span class="log-msg">{{ item.message }}</span>
                </div>
                <div
                  v-if="runningConfigModal.logs.length === 0"
                  class="log-empty"
                >
                  日志初始化中...
                </div>
              </div>
            </div>

            <!-- Command Output Box (stdout/stderr) -->
            <div
              v-if="runningConfigModal.commandOutput"
              class="command-output-box"
            >
              <div class="command-output-title">
                重启命令输出 (stdout/stderr):
              </div>
              <pre class="command-output-text">{{
                runningConfigModal.commandOutput
              }}</pre>
            </div>
          </div>
        </div>
        <!-- End of modal-body -->

        <!-- Modal Footer -->
        <div class="modal-footer">
          <!-- Form Mode Footers -->
          <template v-if="runningConfigModal.viewMode === 'form'">
            <button
              class="btn btn-secondary"
              :disabled="runningConfigModal.saving"
              @click="closeRunningConfigModal"
            >
              取消
            </button>
            <button
              class="btn btn-secondary"
              :disabled="runningConfigModal.saving"
              style="background: rgba(255, 255, 255, 0.05)"
              @click="saveRunningConfigSettings(false)"
            >
              💾 仅保存设置
            </button>
            <button
              class="btn btn-primary"
              :disabled="runningConfigModal.saving"
              @click="saveRunningConfigSettings(true)"
            >
              ⚡ 更新
            </button>
          </template>

          <!-- Log Mode Footers -->
          <template v-else>
            <button
              v-if="runningConfigModal.status === 'running'"
              class="btn btn-secondary"
              disabled
            >
              ⌛ 更新执行中...
            </button>
            <template v-else-if="runningConfigModal.status === 'success'">
              <button
                class="btn btn-secondary"
                @click="runningConfigModal.viewMode = 'form'"
              >
                ‹ 返回设置
              </button>
              <button class="btn btn-primary" @click="closeRunningConfigModal">
                ✔ 完成并关闭
              </button>
            </template>
            <template v-else-if="runningConfigModal.status === 'failed'">
              <button
                class="btn btn-secondary"
                @click="runningConfigModal.viewMode = 'form'"
              >
                ‹ 修改设置
              </button>
              <button
                class="btn btn-danger"
                @click="saveRunningConfigSettings(true)"
              >
                🔄 重新重试
              </button>
              <button
                class="btn btn-secondary"
                @click="closeRunningConfigModal"
              >
                关闭
              </button>
            </template>
          </template>
        </div>
      </div>
    </div>

    <!-- Config Preview Modal -->
    <div class="modal" :class="{ active: previewModal.show }">
      <div
        class="modal-card"
        style="
          max-width: 900px;
          width: 95%;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
        "
      >
        <div class="modal-header">
          <span style="display: flex; align-items: center; gap: 0.5rem">
            👁️ 预览生成完整配置 (JSON)
          </span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="previewModal.show = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <!-- Toolbar / Header inside Modal -->
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            flex-wrap: wrap;
            gap: 0.5rem;
          "
        >
          <div style="font-size: 0.85rem; color: var(--text-muted)">
            通过本地校验引擎编译后的最终输出，支持缩进、折叠与语法高亮。
          </div>
          <div style="display: flex; gap: 0.5rem">
            <button
              class="btn btn-secondary"
              style="
                padding: 0.35rem 0.75rem;
                font-size: 0.85rem;
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
              "
              @click="copyPreviewToClipboard"
            >
              📋 复制至剪贴板
            </button>
            <button
              class="btn"
              style="
                padding: 0.35rem 0.75rem;
                font-size: 0.85rem;
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
              "
              @click="exportPreviewFile"
            >
              📥 导出为文件
            </button>
          </div>
        </div>

        <!-- Modal Scrollable Content -->
        <div style="flex: 1; overflow-y: auto; padding-right: 4px">
          <div
            v-if="previewModal.loading"
            style="
              text-align: center;
              padding: 4rem 0;
              color: var(--text-muted);
            "
          >
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem">⏳</div>
            <div class="mb-2">正在编译并检测配置文件...</div>
            <small
              >系统正在通过本地检测与内置 sing-box 校验引擎完成可行性测试</small
            >
          </div>

          <div
            v-else-if="previewModal.error"
            class="text-danger"
            style="
              padding: 1rem;
              border-left: 3px solid var(--danger);
              background: rgba(239, 68, 68, 0.05);
              border-radius: 6px;
              margin-bottom: 1rem;
              font-size: 0.9rem;
            "
          >
            <strong>校验/编译失败:</strong> {{ previewModal.error }}
          </div>

          <div
            v-else-if="previewModal.jsonObject"
            style="
              padding: 1.25rem;
              background: #282c34;
              border: 1px solid rgba(255, 255, 255, 0.1);
              box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3);
              border-radius: 8px;
              min-height: 450px;
            "
          >
            <json-tree-view :data="previewModal.jsonObject" />
          </div>
        </div>

        <div
          style="
            justify-content: flex-end;
            margin-top: 1rem;
            display: flex;
            gap: 0.5rem;
            border-top: 1px solid var(--border-color);
            padding-top: 1rem;
          "
        >
          <button
            type="button"
            class="btn btn-secondary"
            @click="previewModal.show = false"
          >
            关闭
          </button>
        </div>
      </div>
    </div>

    <!-- Import Modal -->
    <div class="modal" :class="{ active: importModal.show }">
      <div class="modal-card" style="max-width: 800px; width: 95%">
        <div class="modal-header">
          <span>📥 导入完整 sing-box 配置</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="importModal.show = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <div class="modal-body">
          <div
            v-if="importModal.error"
            style="
              padding: 1rem;
              background: rgba(239, 68, 68, 0.1);
              border-radius: 6px;
              color: var(--danger);
              margin-bottom: 1rem;
              font-size: 0.85rem;
            "
          >
            <strong>导入失败:</strong> {{ importModal.error }}
          </div>

          <div>
            <div
              style="
                margin-bottom: 1rem;
                padding: 0.75rem;
                background: rgba(99, 102, 241, 0.1);
                border-radius: 6px;
                border-left: 3px solid var(--primary);
                font-size: 0.85rem;
              "
            >
              <strong>提示:</strong> 请在下方输入或粘贴完整的 sing-box JSON
              配置文件内容。导入后会填入当前编辑中的配置，需点击「保存配置」才能持久化。
              <br />
              配置与节点池/分流出站组完全解耦——保存后 DB
              变更不会影响本配置，所有出站（含节点与策略组定义）已作为快照内联保存。
            </div>
            <textarea
              v-model="importModal.content"
              placeholder="在此粘贴 JSON 配置..."
              style="
                width: 100%;
                min-height: 400px;
                font-family: var(--font-mono);
                font-size: 0.85rem;
                padding: 1rem;
                background: rgba(0, 0, 0, 0.25);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                color: var(--text-main);
                resize: vertical;
                outline: none;
              "
            ></textarea>
          </div>
        </div>
        <!-- End of modal-body -->

        <div class="modal-footer">
          <span
            v-if="importModal.validating"
            style="font-size: 0.85rem; color: var(--primary)"
            >⏳ 正在通过 sing-box 校验配置...</span
          >
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="importModal.validating"
            @click="importModal.show = false"
          >
            取消
          </button>
          <button
            type="button"
            class="btn"
            :disabled="importModal.validating"
            @click="confirmImport"
          >
            {{ importModal.validating ? "校验中..." : "确认导入" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Node Pool Import Modal -->
    <div class="modal" :class="{ active: nodePoolModal.show }">
      <div class="modal-card" style="max-width: 600px; width: 90%">
        <div class="modal-header">
          <span>📥 从节点池导入节点</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="nodePoolModal.show = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <div class="modal-body" style="display: flex; flex-direction: column">
          <div style="padding: 0.5rem 0; margin-bottom: 0.5rem">
            <input
              v-model="nodePoolModal.searchQuery"
              type="text"
              class="input-control"
              placeholder="🔍 搜索节点 Tag 或类型..."
            />
          </div>

          <div
            v-if="nodePoolModal.nodes.length > 0"
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 0.5rem;
              padding: 0 0.25rem;
              font-size: 0.85rem;
            "
          >
            <div style="display: flex; align-items: center; gap: 0.75rem">
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.35rem;
                  cursor: pointer;
                  user-select: none;
                  font-weight: 500;
                "
              >
                <input
                  type="checkbox"
                  :checked="isAllNodePoolSelected"
                  :disabled="filteredNodePoolNodes.length === 0"
                  @change="toggleSelectAllNodePool"
                />
                <span>全选当前</span>
              </label>
              <div style="display: flex; gap: 0.5rem; color: var(--primary)">
                <a
                  href="javascript:void(0)"
                  style="
                    color: var(--primary);
                    text-decoration: none;
                    font-size: 0.8rem;
                  "
                  @click="toggleSelectAllNodePool"
                >
                  {{ isAllNodePoolSelected ? "取消全选" : "全选" }}
                </a>
                <span style="color: var(--border-color)">|</span>
                <a
                  href="javascript:void(0)"
                  style="
                    color: var(--primary);
                    text-decoration: none;
                    font-size: 0.8rem;
                  "
                  @click="invertNodePoolSelection"
                >
                  反选
                </a>
                <span style="color: var(--border-color)">|</span>
                <a
                  href="javascript:void(0)"
                  style="
                    color: var(--text-muted);
                    text-decoration: none;
                    font-size: 0.8rem;
                  "
                  @click="nodePoolModal.selectedIds = []"
                >
                  清空
                </a>
              </div>
            </div>
            <div style="color: var(--text-muted); font-size: 0.8rem">
              已选择
              <span style="color: var(--primary); font-weight: 600">{{
                nodePoolModal.selectedIds.length
              }}</span>
              / 共 {{ nodePoolModal.nodes.length }} 个
              <template v-if="nodePoolModal.searchQuery">
                (匹配 {{ filteredNodePoolNodes.length }} 个)
              </template>
            </div>
          </div>

          <div
            style="
              flex: 1;
              overflow-y: auto;
              border: 1px solid var(--border-color);
              border-radius: 6px;
              padding: 0.5rem;
              background: rgba(0, 0, 0, 0.1);
              max-height: 50vh;
            "
          >
            <div
              v-for="node in filteredNodePoolNodes"
              :key="node.id"
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.5rem;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
              "
            >
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  cursor: pointer;
                  flex: 1;
                "
              >
                <input
                  v-model="nodePoolModal.selectedIds"
                  type="checkbox"
                  :value="node.id"
                />
                <div>
                  <span style="font-weight: 600; color: var(--text-main)">{{
                    node.tag
                  }}</span>
                  <span
                    class="badge"
                    style="
                      margin-left: 0.5rem;
                      font-size: 0.75rem;
                      background: rgba(99, 102, 241, 0.15);
                      color: var(--primary);
                    "
                    >{{ node.node_type }}</span
                  >
                  <span
                    v-if="isNodeTagImported(node.tag)"
                    class="badge"
                    style="
                      margin-left: 0.35rem;
                      font-size: 0.7rem;
                      background: rgba(16, 185, 129, 0.12);
                      color: var(--success, #10b981);
                    "
                    >已在配置中</span
                  >
                </div>
              </label>
              <span style="font-size: 0.8rem; color: var(--text-muted)">{{
                node.remarks || "无备注"
              }}</span>
            </div>
            <div
              v-if="nodePoolModal.nodes.length === 0"
              style="
                text-align: center;
                color: var(--text-muted);
                padding: 2rem 0;
              "
            >
              节点池中没有节点，请先在“节点池”中添加或通过订阅获取。
            </div>
          </div>
        </div>
        <!-- End of modal-body -->

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            @click="nodePoolModal.show = false"
          >
            取消
          </button>
          <button type="button" class="btn" @click="confirmNodePoolImport">
            导入所选节点 ({{ nodePoolModal.selectedIds.length }})
          </button>
        </div>
      </div>
    </div>

    <!-- 引入分流出站组 Modal -->
    <div
      class="modal"
      :class="{ active: groupImportModal.show }"
      @click.self="groupImportModal.show = false"
    >
      <div class="modal-card" style="max-width: 520px; width: 95%">
        <div class="modal-header">
          <span>🔌 引入分流出站组</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="groupImportModal.show = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <div class="modal-body" style="display: flex; flex-direction: column">
          <div
            style="
              margin-bottom: 1rem;
              padding: 0.75rem 1rem;
              background: rgba(99, 102, 241, 0.08);
              border-radius: 8px;
              border-left: 3px solid var(--primary);
              font-size: 0.85rem;
              color: var(--text-muted);
              line-height: 1.4;
            "
          >
            <strong>提示:</strong>
            引入分流出站组时，将完整展开组设置与所有引用节点的 raw_json
            作为自包含快照写入当前配置。引入后与 DB 解耦，DB
            变更不再影响本配置。
          </div>

          <div
            v-if="outboundGroups.length === 0"
            style="
              text-align: center;
              color: var(--text-muted);
              padding: 2.5rem 1rem;
              background: rgba(255, 255, 255, 0.01);
              border: 1px dashed var(--border-color);
              border-radius: 8px;
              font-size: 0.9rem;
            "
          >
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem">👥</div>
            数据库中暂无分流出站组<br />
            <span
              style="
                font-size: 0.75rem;
                color: var(--text-muted);
                margin-top: 0.25rem;
                display: inline-block;
              "
            >
              请先在「分流出站组」页面创建策略组
            </span>
            <div style="margin-top: 0.75rem">
              <a
                href="#groups"
                class="btn btn-secondary"
                style="font-size: 0.8rem; text-decoration: none"
              >
                前往创建
              </a>
            </div>
          </div>

          <template v-else>
            <div
              style="
                position: relative;
                margin-bottom: 0.5rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
              "
            >
              <div style="position: relative; flex: 1">
                <input
                  v-model="groupImportModal.searchQuery"
                  type="text"
                  class="input-control"
                  placeholder="搜索组名..."
                  style="
                    width: 100%;
                    font-size: 0.85rem;
                    height: 36px;
                    padding: 0 2rem 0 0.75rem;
                  "
                />
                <button
                  v-if="groupImportModal.searchQuery"
                  type="button"
                  title="清空搜索"
                  style="
                    position: absolute;
                    right: 6px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: var(--text-muted);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2px;
                    border-radius: 4px;
                  "
                  @click="clearGroupSearchQuery"
                >
                  <svg
                    width="14"
                    height="14"
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
              <span
                style="
                  font-size: 0.8rem;
                  color: var(--text-muted);
                  white-space: nowrap;
                "
              >
                可引入: {{ availableGroupsToImport.length }} /
                {{ outboundGroups.length }}
              </span>
            </div>

            <div
              v-if="selectableGroupsToImport.length > 0"
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 0.5rem;
                padding: 0 0.25rem;
                font-size: 0.85rem;
              "
            >
              <div style="display: flex; align-items: center; gap: 0.75rem">
                <label
                  style="
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    cursor: pointer;
                    user-select: none;
                    font-weight: 500;
                  "
                >
                  <input
                    type="checkbox"
                    :checked="isAllGroupsSelected"
                    :disabled="selectableGroupsToImport.length === 0"
                    @change="toggleSelectAllGroups"
                  />
                  <span>全选可引入组</span>
                </label>
                <div style="display: flex; gap: 0.5rem; color: var(--primary)">
                  <a
                    href="javascript:void(0)"
                    style="
                      color: var(--primary);
                      text-decoration: none;
                      font-size: 0.8rem;
                    "
                    @click="toggleSelectAllGroups"
                  >
                    {{ isAllGroupsSelected ? "取消全选" : "全选" }}
                  </a>
                  <span style="color: var(--border-color)">|</span>
                  <a
                    href="javascript:void(0)"
                    style="
                      color: var(--primary);
                      text-decoration: none;
                      font-size: 0.8rem;
                    "
                    @click="invertGroupsSelection"
                  >
                    反选
                  </a>
                  <span style="color: var(--border-color)">|</span>
                  <a
                    href="javascript:void(0)"
                    style="
                      color: var(--text-muted);
                      text-decoration: none;
                      font-size: 0.8rem;
                    "
                    @click="groupImportModal.selectedTags = []"
                  >
                    清空
                  </a>
                </div>
              </div>
              <div style="color: var(--text-muted); font-size: 0.8rem">
                已选择
                <span style="color: var(--primary); font-weight: 600">{{
                  (groupImportModal.selectedTags || []).length
                }}</span>
                / 可引入 {{ selectableGroupsToImport.length }} 个
              </div>
            </div>

            <div
              style="
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 0.6rem;
                padding-right: 4px;
                max-height: 50vh;
              "
            >
              <div
                v-for="group in filteredGroupsToImport"
                :key="group.tag"
                style="
                  display: flex;
                  flex-direction: column;
                  gap: 0.4rem;
                  padding: 0.85rem 1rem;
                  background: rgba(255, 255, 255, 0.02);
                  border: 1px solid var(--border-color);
                  border-radius: 8px;
                  transition: opacity 0.2s ease;
                "
                :style="{
                  opacity: isGroupImported(group.tag) ? 0.5 : 1,
                }"
              >
                <div
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 0.5rem;
                  "
                >
                  <div style="display: flex; align-items: center; gap: 0.6rem">
                    <input
                      v-if="!isGroupImported(group.tag)"
                      v-model="groupImportModal.selectedTags"
                      type="checkbox"
                      :value="group.tag"
                      style="cursor: pointer; width: 16px; height: 16px"
                    />
                    <div
                      style="display: flex; flex-direction: column; gap: 0.2rem"
                    >
                      <div
                        style="
                          display: flex;
                          align-items: center;
                          gap: 0.5rem;
                          flex-wrap: wrap;
                        "
                      >
                        <strong
                          style="color: var(--primary); font-size: 0.95rem"
                          >{{ group.tag }}</strong
                        >
                        <span
                          class="badge"
                          :class="
                            group.group_type === 'urltest'
                              ? 'badge-info'
                              : 'badge-success'
                          "
                          style="
                            font-size: 0.7rem;
                            padding: 0.1rem 0.4rem;
                            font-weight: 500;
                          "
                        >
                          {{ group.group_type }}
                        </span>
                        <span
                          v-if="isGroupImported(group.tag)"
                          class="badge badge-success"
                          style="font-size: 0.7rem; padding: 0.1rem 0.4rem"
                        >
                          已添加
                        </span>
                      </div>
                      <div style="font-size: 0.8rem; color: var(--text-muted)">
                        节点数:
                        <span
                          style="color: var(--text-main); font-weight: 500"
                          >{{ getGroupNodeCount(group) }}</span
                        >
                        个
                        <span
                          v-if="group.group_type === 'urltest'"
                          style="margin-left: 0.5rem"
                        >
                          | 间隔:
                          <span style="color: var(--text-main)">{{
                            group.interval || "3m"
                          }}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    v-if="!isGroupImported(group.tag)"
                    type="button"
                    class="btn"
                    style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
                    @click="importGroup(group)"
                  >
                    引入
                  </button>
                  <span
                    v-else
                    style="
                      font-size: 0.75rem;
                      color: var(--text-muted);
                      font-style: italic;
                    "
                    >已在配置中</span
                  >
                </div>
                <div
                  v-if="getGroupNodesDisplay(group) !== '无节点'"
                  style="
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    padding-left: 0.5rem;
                    border-left: 2px solid var(--border-color);
                  "
                >
                  {{ getGroupNodesDisplay(group) }}
                </div>
              </div>

              <div
                v-if="filteredGroupsToImport.length === 0"
                style="
                  text-align: center;
                  color: var(--text-muted);
                  padding: 2rem 1rem;
                  background: rgba(255, 255, 255, 0.01);
                  border: 1px dashed var(--border-color);
                  border-radius: 8px;
                  font-size: 0.9rem;
                "
              >
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem">
                  {{ groupImportModal.searchQuery ? "🔍" : "✓" }}
                </div>
                {{
                  groupImportModal.searchQuery
                    ? "没有匹配的分流出站组"
                    : "所有分流出站组都已引入当前配置"
                }}
              </div>
            </div>
          </template>
        </div>
        <!-- End of modal-body -->

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            @click="groupImportModal.show = false"
          >
            取消
          </button>
          <button
            v-if="outboundGroups.length > 0"
            type="button"
            class="btn"
            :disabled="(groupImportModal.selectedTags || []).length === 0"
            @click="confirmBatchGroupImport"
          >
            批量引入所选 ({{ (groupImportModal.selectedTags || []).length }})
          </button>
        </div>
      </div>
    </div>

        <!-- 规则快速同步 Modal -->
    <div
      class="modal"
      :class="{ active: ruleSyncModal.show }"
      @click.self="ruleSyncModal.show = false"
    >
      <div class="modal-card" style="max-width: 600px">
        <div class="modal-header">
          <span>
            ⇄ 同步规则
            <span
              style="
                font-size: 0.85rem;
                font-weight: normal;
                color: var(--text-muted);
                margin-left: 0.5rem;
              "
            >
              ({{
                ruleSyncModal.direction === 'route_to_dns'
                  ? '路由规则 ➔ DNS 规则'
                  : 'DNS 规则 ➔ 路由规则'
              }})
            </span>
          </span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="ruleSyncModal.show = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <div class="modal-body">
          <div
            v-if="ruleSyncModal.error"
            class="alert alert-danger mb-3"
            style="padding: 0.5rem 0.75rem; font-size: 0.85rem"
          >
            {{ ruleSyncModal.error }}
          </div>

          <!-- 源规则预览信息 -->
          <div
            class="panel"
            style="
              padding: 0.75rem 1rem;
              margin-bottom: 1rem;
              background: rgba(255, 255, 255, 0.03);
              border: 1px dashed var(--border-color);
            "
          >
            <div
              style="
                font-size: 0.82rem;
                color: var(--text-muted);
                margin-bottom: 0.35rem;
              "
            >
              源规则描述特征 (同步时自动保留域名/规则集/端口等共用条件,
              {{
                ruleSyncModal.direction === 'route_to_dns'
                  ? '过滤掉仅路由生效的 IP/CIDR'
                  : '同步至目标路由'
              }})：
            </div>
            <div style="font-size: 0.88rem; font-weight: 500">
              {{
                ruleSyncModal.sourceRule
                  ? getRuleSummaryText(
                      ruleSyncModal.sourceRule,
                      ruleSyncModal.sourceIndex,
                      ruleSyncModal.direction === 'route_to_dns'
                        ? 'route'
                        : 'dns',
                    )
                  : ''
              }}
            </div>
          </div>

          <!-- 同步模式选择：新建 vs 覆盖 -->
          <div class="input-group" style="margin-bottom: 1rem">
            <label>同步目标方式 (Target Action)</label>
            <div style="display: flex; gap: 1rem; margin-top: 0.35rem">
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.35rem;
                  cursor: pointer;
                "
              >
                <input
                  v-model="ruleSyncModal.mode"
                  type="radio"
                  value="new"
                />
                <span>➕ 新建全新的规则配置</span>
              </label>
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.35rem;
                  cursor: pointer;
                "
              >
                <input
                  v-model="ruleSyncModal.mode"
                  type="radio"
                  value="overwrite"
                />
                <span>✏️ 覆盖现有某条规则配置</span>
              </label>
            </div>
          </div>

          <!-- 覆盖目标选择 -->
          <div
            v-if="ruleSyncModal.mode === 'overwrite'"
            class="input-group"
            style="margin-bottom: 1rem"
          >
            <label>请选择需要覆盖的目标规则</label>
            <select
              v-model="ruleSyncModal.targetIndex"
              class="input-control"
              required
            >
              <option :value="-1" disabled>-- 请选择目标规则 --</option>
              <template v-if="ruleSyncModal.direction === 'route_to_dns'">
                <option
                  v-for="(r, i) in configData.dns.rules"
                  :key="i"
                  :value="i"
                >
                  {{ getRuleSummaryText(r, i, 'dns') }}
                </option>
              </template>
              <template v-else>
                <option
                  v-for="(r, i) in configData.route.rules"
                  :key="i"
                  :value="i"
                >
                  {{ getRuleSummaryText(r, i, 'route') }}
                </option>
              </template>
            </select>
          </div>

          <!-- 目标 DNS 配置 (方向为 route_to_dns) -->
          <div
            v-if="ruleSyncModal.direction === 'route_to_dns'"
            class="grid-2"
            style="margin-bottom: 1rem"
          >
            <div class="input-group">
              <label>目标 DNS 服务器 Tag (server)</label>
              <select
                v-model="ruleSyncModal.targetDnsServer"
                class="input-control"
                required
              >
                <option
                  v-for="srv in configData.dns.servers"
                  :key="srv.tag"
                  :value="srv.tag"
                >
                  {{ srv.tag }}
                </option>
              </select>
            </div>
            <div class="input-group">
              <label>ECS 客户端子网 (client_subnet, 可选)</label>
              <input
                v-model="ruleSyncModal.targetClientSubnet"
                type="text"
                class="input-control"
                placeholder="例如: 223.5.5.0/24"
              />
            </div>
          </div>

          <!-- 目标 Route 配置 (方向为 dns_to_route) -->
          <div
            v-if="ruleSyncModal.direction === 'dns_to_route'"
            class="grid-2"
            style="margin-bottom: 1rem"
          >
            <div class="input-group">
              <label>动作 (Action)</label>
              <select
                v-model="ruleSyncModal.targetRouteAction"
                class="input-control"
              >
                <option value="route">route (路由选择)</option>
                <option value="reject">reject (拦截阻断)</option>
                <option value="hijack-dns">hijack-dns (劫持 DNS)</option>
                <option value="sniff">sniff (流量嗅探)</option>
              </select>
            </div>
            <div
              v-if="ruleSyncModal.targetRouteAction === 'route'"
              class="input-group"
            >
              <label>目标出站 Tag (outbound)</label>
              <select
                v-model="ruleSyncModal.targetRouteOutbound"
                class="input-control"
                required
              >
                <option
                  v-for="tag in allOutboundTags"
                  :key="tag"
                  :value="tag"
                >
                  {{ tag }}
                </option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button
            class="btn btn-secondary"
            @click="ruleSyncModal.show = false"
          >
            取消
          </button>
          <button class="btn btn-primary" @click="confirmSyncRule">
            确认同步
          </button>
        </div>
      </div>
    </div>

    <!-- 域名分流推荐 (最佳实践) Modal -->
    <div
      class="modal"
      :class="{ active: domainWizardModal.show }"
      @click.self="domainWizardModal.show = false"
    >
      <div class="modal-card" style="max-width: 680px; width: 95%">
        <div class="modal-header">
          <span>⚡ 快捷域名分流推荐 (最佳实践)</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="domainWizardModal.show = false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>

        <div class="modal-body">
          <!-- Description & Tip -->
          <div
            style="
              margin-bottom: 1.25rem;
              padding: 0.75rem 1rem;
              background: rgba(99, 102, 241, 0.08);
              border-left: 4px solid var(--primary);
              border-radius: 4px;
              font-size: 0.85rem;
              color: var(--text-muted);
              line-height: 1.4;
            "
          >
            <strong>💡 最佳实践建议:</strong>
            输入一个或多个域名。系统将智能分析并测试您的可用节点延迟，然后为您推荐最合适的
            <strong>URLTest 策略组</strong> 或 <strong>特定代理节点</strong>。
          </div>

          <!-- Domains Textarea -->
          <div class="input-group" style="margin-bottom: 1rem">
            <label
              style="font-weight: 600; margin-bottom: 0.4rem; display: block"
            >
              待配置域名 (每行或以逗号/空格分隔一个域名)
            </label>
            <textarea
              v-model="domainWizardModal.inputText"
              class="input-control"
              style="
                height: 100px;
                font-family: var(--font-mono);
                font-size: 0.9rem;
                padding: 0.6rem;
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.2);
                color: var(--text-main);
              "
              placeholder="例如：&#10;www.google.com&#10;drive.google.com"
            ></textarea>
          </div>

          <!-- Analysis Results & Validation Error -->
          <div style="margin-bottom: 1.25rem">
            <div
              v-if="domainWizardModal.errorMsg"
              style="
                padding: 0.75rem 1rem;
                background: rgba(239, 68, 68, 0.1);
                border-radius: 6px;
                color: var(--danger);
                font-size: 0.85rem;
              "
            >
              ⚠️ {{ domainWizardModal.errorMsg }}
            </div>

            <div
              v-else-if="
                domainWizardModal.inputText.trim() &&
                domainWizardModal.detectedType
              "
              style="
                padding: 0.75rem 1rem;
                background: rgba(16, 185, 129, 0.08);
                border: 1px solid rgba(16, 185, 129, 0.2);
                border-radius: 6px;
                font-size: 0.85rem;
                color: var(--text-main);
              "
            >
              <div class="flex items-center gap-2 mb-1">
                <span
                  class="badge badge-success"
                  style="font-size: 0.75rem; padding: 0.1rem 0.4rem"
                >
                  {{
                    domainWizardModal.detectedType === "precise"
                      ? "精确域名"
                      : "范域名 (同后缀)"
                  }}
                </span>
                <span>分析成功</span>
              </div>
              <div
                v-if="domainWizardModal.detectedType === 'precise'"
                style="color: var(--text-muted)"
              >
                写入配置：域名
                <strong>{{ domainWizardModal.testUrl }}</strong> (匹配规则字段:
                <code>domain</code>)
              </div>
              <div
                v-else-if="domainWizardModal.detectedType === 'wildcard'"
                style="color: var(--text-muted)"
              >
                检测到公共域名后缀：<strong style="color: var(--success)">{{
                  domainWizardModal.extractedSuffix
                }}</strong>
                (匹配规则字段: <code>domain_suffix</code>)
                <div
                  style="
                    font-size: 0.8rem;
                    margin-top: 0.25rem;
                    color: var(--text-muted);
                  "
                >
                  测试测速所用域名：<code>{{ domainWizardModal.testUrl }}</code>
                </div>
              </div>
            </div>
          </div>

          <!-- Latency Testing Action and Status -->
          <div
            v-if="
              domainWizardModal.inputText.trim() && !domainWizardModal.errorMsg
            "
            style="
              margin-bottom: 1.25rem;
              padding: 1rem;
              background: rgba(255, 255, 255, 0.02);
              border: 1px solid var(--border-color);
              border-radius: 6px;
            "
          >
            <div class="flex justify-between items-center mb-3">
              <span style="font-size: 0.9rem; font-weight: 600"
                >⚡ 节点延迟智能测试</span
              >
              <button
                class="btn"
                :class="
                  domainWizardModal.isTesting ? 'btn-secondary' : 'btn-primary'
                "
                style="padding: 0.35rem 0.8rem; font-size: 0.85rem"
                :disabled="domainWizardModal.isTesting"
                @click="startLatencyTest"
              >
                {{
                  domainWizardModal.isTesting
                    ? "测试中..."
                    : "开始测试并生成推荐"
                }}
              </button>
            </div>

            <!-- Testing Progress Bar -->
            <div
              v-if="
                domainWizardModal.isTesting ||
                domainWizardModal.testProgress > 0
              "
              style="margin-bottom: 0.75rem"
            >
              <div
                class="flex justify-between"
                style="
                  font-size: 0.8rem;
                  color: var(--text-muted);
                  margin-bottom: 0.3rem;
                "
              >
                <span
                  >测速进度: {{ domainWizardModal.testProgress }} /
                  {{ domainWizardModal.testTotal }}</span
                >
                <span
                  >{{
                    Math.round(
                      (domainWizardModal.testProgress /
                        domainWizardModal.testTotal) *
                        100,
                    )
                  }}%</span
                >
              </div>
              <div
                style="
                  height: 6px;
                  background: rgba(255, 255, 255, 0.05);
                  border-radius: 3px;
                  overflow: hidden;
                "
              >
                <div
                  style="
                    height: 100%;
                    background: linear-gradient(
                      90deg,
                      var(--primary),
                      var(--secondary)
                    );
                    border-radius: 3px;
                    transition: width 0.1s ease;
                  "
                  :style="{
                    width:
                      (domainWizardModal.testProgress /
                        domainWizardModal.testTotal) *
                        100 +
                      '%',
                  }"
                ></div>
              </div>
            </div>

            <!-- Live Logs / Results console -->
            <div
              v-if="domainWizardModal.testLogs.length > 0"
              style="
                height: 110px;
                overflow-y: auto;
                background: #000;
                font-family: var(--font-mono);
                font-size: 0.75rem;
                padding: 0.5rem;
                border-radius: 4px;
                color: #a7f3d0;
                border: 1px solid rgba(255, 255, 255, 0.05);
              "
            >
              <div
                v-for="(log, lIdx) in domainWizardModal.testLogs"
                :key="lIdx"
                style="margin-bottom: 0.2rem"
              >
                {{ log }}
              </div>
            </div>
          </div>

          <!-- Configuration target dropdown and recommendations -->
          <div
            v-if="
              Object.keys(domainWizardModal.testResults).length > 0 ||
              domainWizardModal.recommendedOutbound
            "
            style="
              margin-bottom: 1rem;
              padding: 1rem;
              background: rgba(99, 102, 241, 0.03);
              border: 1px solid rgba(99, 102, 241, 0.1);
              border-radius: 6px;
            "
          >
            <div class="input-group" style="margin-bottom: 1rem">
              <label
                style="font-weight: 600; margin-bottom: 0.4rem; display: block"
                >选择目标出站 (Outbound)</label
              >
              <select
                v-model="domainWizardModal.selectedOutbound"
                class="input-control"
                style="font-weight: 600"
              >
                <option
                  v-for="opt in sortedOutboundsForSelect"
                  :key="opt.tag"
                  :value="opt.tag"
                >
                  {{ opt.isRecommended ? "🔥 [系统推荐] " : ""
                  }}{{ opt.tag }} ({{ opt.latencyText }})
                </option>
              </select>
            </div>

            <!-- Rule Action Choice (Merge/Create) -->
            <div class="input-group">
              <label
                style="font-weight: 600; margin-bottom: 0.4rem; display: block"
                >分流规则写入方式</label
              >
              <div class="flex gap-4" style="margin-top: 0.25rem">
                <label
                  class="flex items-center gap-2"
                  style="cursor: pointer; font-size: 0.85rem"
                >
                  <input
                    v-model="domainWizardModal.targetRuleAction"
                    type="radio"
                    value="append"
                    :disabled="!matchingExistingRule"
                  />
                  <span>合并到已有规则</span>
                  <span
                    v-if="matchingExistingRule"
                    style="color: var(--text-muted); font-size: 0.75rem"
                  >
                    (追加匹配列表)
                  </span>
                  <span
                    v-else
                    style="color: var(--text-muted); font-size: 0.75rem"
                  >
                    (无此出站的简单规则)
                  </span>
                </label>
                <label
                  class="flex items-center gap-2"
                  style="cursor: pointer; font-size: 0.85rem"
                >
                  <input
                    v-model="domainWizardModal.targetRuleAction"
                    type="radio"
                    value="create"
                  />
                  <span>创建新路由规则</span>
                  <span style="color: var(--text-muted); font-size: 0.75rem">
                    (插入在最前，优先级最高)
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="domainWizardModal.isTesting"
            @click="domainWizardModal.show = false"
          >
            取消
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="
              domainWizardModal.isTesting ||
              !domainWizardModal.inputText.trim() ||
              domainWizardModal.errorMsg ||
              !domainWizardModal.selectedOutbound
            "
            @click="confirmApplyDomainWizard"
          >
            确认并写入配置
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
} from "vue";
import {
  token,
  API_BASE,
  showToast,
  confirmDialog,
  promptDialog,
} from "../store.js";
import { validateData } from "../validator.js";
import { filterGroupsByQuery, clearSearchQuery } from "../utils/groupImport.js";
import JsonTreeView from "./JsonTreeView.vue";

const sections = [
  "log",
  "dns",
  "inbounds",
  "outbounds",
  "route",
  "experimental",
];

const getInitialActiveSection = () => {
  const hash = window.location.hash.substring(1);
  const [pathPart] = hash.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  if (parts[0] === "config") {
    let tabCandidate = null;
    if (parts[1] === "edit" && parts[2] && parts[3]) {
      tabCandidate = parts[3];
    } else if (parts[1] && !isNaN(parseInt(parts[1], 10)) && parts[2]) {
      tabCandidate = parts[2];
    }
    if (tabCandidate && sections.includes(tabCandidate)) {
      return tabCandidate;
    }
  }
  if (hash.includes("tab=")) {
    const match = hash.match(/tab=([^&]+)/);
    if (match && sections.includes(match[1])) {
      return match[1];
    }
  }
  return "log";
};

const activeSection = ref(getInitialActiveSection());
const currentConfigId = ref(null);
const activeConfigId = ref(null);
const currentConfigDetail = ref("");
const configList = ref([]);
const showAdvancedRouteFields = ref(false);
const showAdvancedDnsFields = ref(false);

const runningConfig = reactive({
  config_id: null,
  config_path: "",
  restart_cmd: "",
  has_sudo_pass: false,
});

const runningConfigModal = reactive({
  show: false,
  saving: false,
  viewMode: "form", // "form" | "log"
  status: "idle", // "idle" | "running" | "success" | "failed"
  logs: [],
  commandOutput: "",
  message: "",
});
const logConsoleRef = ref(null);

const runningConfigForm = reactive({
  config_id: null,
  config_path: "",
  restart_cmd: "",
  sudo_pass: "",
});

const sectionModes = reactive({
  log: "visual",
  dns: "visual",
  inbounds: "visual",
  outbounds: "visual",
  route: "visual",
  experimental: "visual",
});

const rawJson = reactive({
  log: "",
  dns: "",
  inbounds: "",
  outbounds: "",
  route: "",
  experimental: "",
});

const configData = reactive({
  log: { disabled: false, level: "warn", timestamp: true, output: "" },
  dns: {
    strategy: "ipv4_only",
    final: "local-dns",
    independent_cache: true,
    disable_cache: false,
    disable_expire: false,
    reverse_mapping: false,
    client_subnet: "",
    servers: [],
    rules: [],
    fakeip: { enabled: false, inet4_range: "", inet6_range: "" },
  },
  inbounds: [],
  outbounds: [],
  route: {
    final: "direct",
    auto_detect_interface: true,
    default_domain_resolver: "",
    rules: [],
    rule_set: [],
  },
  experimental: {
    cache_file: {
      enabled: false,
      path: "",
      store_fakeip: false,
      store_rdrc: false,
    },
    clash_api: {
      enabled: false,
      external_controller: "",
      external_ui: "",
      secret: "",
      default_mode: "",
    },
  },
});

const CATEGORY_LABELS = {
  rule_set: "规则集 (rule_set)",
  domain: "精确域名 (domain)",
  domain_suffix: "域名后缀 (domain_suffix)",
  ip_cidr: "IP/CIDR (ip_cidr)",
  domain_keyword: "域名关键字 (domain_keyword)",
  domain_regex: "域名正则 (domain_regex)",
  geosite: "Geosite",
  geoip: "GeoIP",
  port: "端口 (port)",
  source_port: "源端口 (source_port)",
  protocol: "协议 (protocol)",
  inbound: "入站 Tag (inbound)",
  network: "网络类型 (network)",
  clash_mode: "Clash模式 (clash_mode)",
};

const extractCriteriaFromObj = (obj) => {
  if (!obj || typeof obj !== "object") return [];
  const items = [];
  const keys = [
    "rule_set",
    "domain",
    "domain_suffix",
    "ip_cidr",
    "domain_keyword",
    "domain_regex",
    "geosite",
    "geoip",
    "port",
    "source_port",
    "protocol",
    "inbound",
    "network",
    "clash_mode",
  ];

  keys.forEach((key) => {
    const val = obj[key];
    if (val === undefined || val === null) return;
    const list = Array.isArray(val) ? val : [val];
    list.forEach((item) => {
      if (item !== undefined && item !== null && String(item).trim() !== "") {
        const rawStr = String(item).trim();
        let normStr = rawStr.toLowerCase();
        let normCategory = key;

        if (key === "domain_suffix" || key === "domain") {
          normStr = normStr.replace(/^\.+/, "");
        } else if (key === "ip_cidr" && !normStr.includes("/")) {
          normStr = normStr + "/32";
        } else if (key === "rule_set") {
          if (normStr.startsWith("geosite-")) {
            normCategory = "geosite";
            normStr = normStr.replace(/^geosite-/, "");
          } else if (normStr.startsWith("geoip-")) {
            normCategory = "geoip";
            normStr = normStr.replace(/^geoip-/, "");
          }
        }

        items.push({
          category: key,
          normCategory,
          typeLabel: CATEGORY_LABELS[key] || key,
          rawValue: rawStr,
          normValue: normStr,
        });
      }
    });
  });

  if (obj.type === "logical" && Array.isArray(obj.rules)) {
    obj.rules.forEach((subRule) => {
      items.push(...extractCriteriaFromObj(subRule));
    });
  }

  return items;
};

const duplicateRouteRulesInfo = computed(() => {
  const results = [];
  const map = new Map();

  const rules = configData.route?.rules;
  if (Array.isArray(rules) && rules.length > 0) {
    rules.forEach((rule, idx) => {
      const outbound = rule.outbound || rule.action || "未配置出站";
      const ruleIndex = idx + 1;
      const items = extractCriteriaFromObj(rule);

      items.forEach(
        ({ category, normCategory, typeLabel, rawValue, normValue }) => {
          const mapKey = `${normCategory}:${normValue}`;
          if (!map.has(mapKey)) {
            map.set(mapKey, {
              category,
              normCategory,
              typeLabel,
              value: rawValue,
              normValue,
              occurrences: [],
            });
          }
          map.get(mapKey).occurrences.push({
            ruleIndex,
            outbound,
          });
        },
      );
    });

    map.forEach((data) => {
      if (data.occurrences.length > 1) {
        const ruleIndices = [
          ...new Set(data.occurrences.map((o) => o.ruleIndex)),
        ];
        const outbounds = [...new Set(data.occurrences.map((o) => o.outbound))];
        results.push({
          category: data.category,
          normCategory: data.normCategory,
          typeLabel: data.typeLabel,
          value: data.value,
          normValue: data.normValue,
          ruleIndices,
          outbounds,
          totalCount: data.occurrences.length,
        });
      }
    });
  }

  const ruleSetDeclarations = configData.route?.rule_set;
  if (Array.isArray(ruleSetDeclarations)) {
    const tagCounts = new Map();
    ruleSetDeclarations.forEach((rs, idx) => {
      if (rs && rs.tag) {
        const tag = String(rs.tag).trim();
        if (!tagCounts.has(tag)) {
          tagCounts.set(tag, []);
        }
        tagCounts.get(tag).push(idx + 1);
      }
    });
    tagCounts.forEach((indices, tag) => {
      if (indices.length > 1) {
        results.push({
          category: "rule_set_decl",
          normCategory: "rule_set_decl",
          typeLabel: "规则集声明 (rule_set tag)",
          value: tag,
          normValue: tag.toLowerCase(),
          ruleIndices: indices,
          outbounds: ["规则集定义"],
          totalCount: indices.length,
        });
      }
    });
  }

  return results;
});

const isDuplicateCriteriaItem = (category, rawValue) => {
  if (!rawValue || !duplicateRouteRulesInfo.value.length) return false;
  let normStr = String(rawValue).trim().toLowerCase();
  let normCategory = category;

  if (category === "domain_suffix" || category === "domain") {
    normStr = normStr.replace(/^\.+/, "");
  } else if (category === "ip_cidr" && !normStr.includes("/")) {
    normStr = normStr + "/32";
  } else if (category === "rule_set") {
    if (normStr.startsWith("geosite-")) {
      normCategory = "geosite";
      normStr = normStr.replace(/^geosite-/, "");
    } else if (normStr.startsWith("geoip-")) {
      normCategory = "geoip";
      normStr = normStr.replace(/^geoip-/, "");
    }
  }

  return duplicateRouteRulesInfo.value.some(
    (d) =>
      (d.category === category || d.normCategory === normCategory) &&
      d.normValue === normStr,
  );
};

const hasDuplicateInField = (category, fieldValue) => {
  if (!fieldValue || !duplicateRouteRulesInfo.value.length) return false;
  const list = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
  return list.some((val) => isDuplicateCriteriaItem(category, val));
};

const outboundGroups = ref([]);
const nodePoolCache = ref([]);

const loadNodePoolCache = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/nodes?limit=100000`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      nodePoolCache.value = data.nodes || [];
    }
  } catch (e) {
    console.error("加载节点池缓存失败", e);
  }
};

const allOutboundTags = computed(() => {
  const tags = [];
  if (configData.outbounds && Array.isArray(configData.outbounds)) {
    configData.outbounds.forEach((o) => {
      if (o.tag && !tags.includes(o.tag)) {
        tags.push(o.tag);
      }
    });
  }
  return tags;
});

// 计算属性：分类出站连接（基于配置内的 outbound.type）
const basicOutbounds = computed(() => {
  return (configData.outbounds || []).filter((outb) =>
    ["direct", "block", "dns"].includes(outb.type),
  );
});

const proxyOutbounds = computed(() => {
  return (configData.outbounds || []).filter(
    (outb) =>
      !["direct", "block", "dns", "selector", "urltest"].includes(outb.type),
  );
});

const groupOutbounds = computed(() => {
  return (configData.outbounds || []).filter((outb) =>
    ["selector", "urltest"].includes(outb.type),
  );
});

// 辅助方法
const getOutboundTypeDisplay = (type) => {
  const typeMap = {
    direct: "直连 (Direct)",
    block: "阻断 (Block)",
    dns: "DNS 出站 (DNS)",
    selector: "选择器 (Selector)",
    urltest: "自动测速 (URLTest)",
  };
  return typeMap[type] || type;
};

const getProxyTypeDisplay = (type) => {
  const typeMap = {
    trojan: "Trojan 代理",
    vless: "VLESS 代理",
    vmess: "VMess 代理",
    shadowsocks: "Shadowsocks",
    wireguard: "WireGuard",
    hysteria2: "Hysteria 2",
    tuic: "TUIC",
  };
  return typeMap[type] || type;
};

const getProtocolBadgeClass = (type) => {
  const badgeClassMap = {
    trojan: "badge-success",
    vless: "badge-info",
    vmess: "badge-primary",
    shadowsocks: "badge-warning",
    wireguard: "badge-secondary",
    hysteria2: "badge-danger",
    tuic: "badge-info",
  };
  return badgeClassMap[type] || "badge";
};

const getGroupNodesDisplay = (group) => {
  try {
    const nodes =
      typeof group.static_nodes === "string"
        ? JSON.parse(group.static_nodes)
        : group.static_nodes;
    if (!Array.isArray(nodes)) return "无节点";
    const display = nodes.slice(0, 3).join(", ");
    return nodes.length > 3
      ? display + "... (+" + (nodes.length - 3) + ")"
      : display;
  } catch {
    return "解析错误";
  }
};

const groupImportModal = reactive({
  show: false,
  searchQuery: "",
  selectedTags: [],
});

// ==========================================
// 域名分流推荐 (最佳实践) Wizard Logic
// ==========================================

const getCommonSuffix = (domains) => {
  if (!domains || domains.length <= 1) return "";
  const domainParts = domains.map((d) => d.split(".").reverse());
  const minLength = Math.min(...domainParts.map((parts) => parts.length));

  const commonParts = [];
  for (let i = 0; i < minLength; i++) {
    const part = domainParts[0][i];
    const allMatch = domainParts.every((parts) => parts[i] === part);
    if (allMatch) {
      commonParts.push(part);
    } else {
      break;
    }
  }
  if (commonParts.length === 0) return "";
  return commonParts.reverse().join(".");
};

const domainWizardModal = reactive({
  show: false,
  inputText: "",
  errorMsg: "",
  detectedType: "",
  extractedSuffix: "",
  testUrl: "",
  isTesting: false,
  testProgress: 0,
  testTotal: 0,
  testLogs: [],
  testResults: {},
  recommendedOutbound: "",
  selectedOutbound: "",
  targetRuleAction: "create",
});

watch(
  () => domainWizardModal.inputText,
  (newVal) => {
    if (!newVal) {
      domainWizardModal.errorMsg = "";
      domainWizardModal.detectedType = "";
      domainWizardModal.extractedSuffix = "";
      domainWizardModal.testUrl = "";
      return;
    }
    const lines = newVal
      .split(/[\n,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (lines.length === 0) {
      domainWizardModal.errorMsg = "";
      domainWizardModal.detectedType = "";
      domainWizardModal.extractedSuffix = "";
      domainWizardModal.testUrl = "";
      return;
    }

    // Basic validation to prevent arbitrary inputs
    const domainRegex =
      /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/;
    const invalidDomains = lines.filter((d) => !domainRegex.test(d));
    if (invalidDomains.length > 0) {
      domainWizardModal.errorMsg = `存在非法的域名格式: ${invalidDomains.join(", ")}`;
      domainWizardModal.detectedType = "";
      domainWizardModal.extractedSuffix = "";
      domainWizardModal.testUrl = "";
      return;
    }

    domainWizardModal.errorMsg = "";
    if (lines.length === 1) {
      domainWizardModal.detectedType = "precise";
      domainWizardModal.extractedSuffix = "";
      domainWizardModal.testUrl = lines[0];
    } else {
      domainWizardModal.detectedType = "wildcard";
      const suffix = getCommonSuffix(lines);
      if (!suffix) {
        domainWizardModal.errorMsg =
          "这些域名没有共同的后缀（如都以 .com 或 google.com 结尾），无法作为范域名。请确保至少有 2 个且具有共同后缀的域名。";
        domainWizardModal.extractedSuffix = "";
        domainWizardModal.testUrl = "";
      } else {
        domainWizardModal.extractedSuffix = suffix;
        domainWizardModal.testUrl = lines[0];
      }
    }
  },
);

const startLatencyTest = async () => {
  if (domainWizardModal.errorMsg) {
    showToast(domainWizardModal.errorMsg, "warning");
    return;
  }
  if (!domainWizardModal.testUrl) {
    showToast("请输入待测试域名", "warning");
    return;
  }

  if (nodePoolCache.value.length === 0) {
    domainWizardModal.testLogs.push("正在从后端加载节点池缓存...");
    await loadNodePoolCache();
  }

  const targetNodeIds = [];
  const dbIdToNodeTag = {};
  const proxyTags = new Set();

  (configData.outbounds || []).forEach((o) => {
    if (!["direct", "block", "dns", "selector", "urltest"].includes(o.type)) {
      proxyTags.add(o.tag);
    } else if (
      ["selector", "urltest"].includes(o.type) &&
      Array.isArray(o.outbounds)
    ) {
      o.outbounds.forEach((memberTag) => {
        const memberOutbound = (configData.outbounds || []).find(
          (x) => x.tag === memberTag,
        );
        if (
          memberOutbound &&
          !["direct", "block", "dns", "selector", "urltest"].includes(
            memberOutbound.type,
          )
        ) {
          proxyTags.add(memberTag);
        }
      });
    }
  });

  proxyTags.forEach((tag) => {
    const dbNode = nodePoolCache.value.find((n) => n.tag === tag);
    if (dbNode && dbNode.id) {
      targetNodeIds.push(dbNode.id);
      dbIdToNodeTag[dbNode.id] = tag;
    }
  });

  if (targetNodeIds.length === 0) {
    domainWizardModal.testLogs = [
      "配置的出站或策略组中没有包含有效的代理节点。",
    ];
    showToast("未找到可测试的代理节点", "warning");
    return;
  }

  domainWizardModal.isTesting = true;
  domainWizardModal.testProgress = 0;
  domainWizardModal.testTotal = targetNodeIds.length;
  domainWizardModal.testLogs = [
    `开始测试域名: ${domainWizardModal.testUrl}`,
    `共找到 ${targetNodeIds.length} 个相关代理节点待测速...`,
  ];
  domainWizardModal.testResults = {};

  const testUrlClean =
    domainWizardModal.testUrl.startsWith("http://") ||
    domainWizardModal.testUrl.startsWith("https://")
      ? domainWizardModal.testUrl
      : `https://${domainWizardModal.testUrl}`;

  const batchSize = 3;
  const idsToProcess = [...targetNodeIds];

  const processBatch = async () => {
    if (idsToProcess.length === 0 || !domainWizardModal.isTesting) {
      domainWizardModal.isTesting = false;
      calculateRecommendations();
      return;
    }

    const batch = idsToProcess.splice(0, batchSize);
    const promises = batch.map(async (id) => {
      const tag = dbIdToNodeTag[id];
      try {
        const res = await fetch(`${API_BASE}/api/nodes/ping`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token.value}`,
          },
          body: JSON.stringify({
            ids: [id],
            test_type: "both",
            target_url: testUrlClean,
          }),
        });

        if (!domainWizardModal.isTesting) return;

        if (res.ok) {
          const results = await res.json();
          const item = results[0];
          if (item) {
            const tcp = item.tcp_latency;
            const web = item.web_latency;
            const latency = web !== null && web !== undefined ? web : tcp;

            domainWizardModal.testResults[tag] = { tcp, web, latency };
            if (latency !== null && latency !== undefined) {
              domainWizardModal.testLogs.push(
                `[${tag}] 网页延迟: ${web || "N/A"}ms, TCP 延迟: ${tcp || "N/A"}ms`,
              );
            } else {
              domainWizardModal.testLogs.push(`[${tag}] 连接失败`);
            }
          } else {
            domainWizardModal.testResults[tag] = {
              tcp: null,
              web: null,
              latency: null,
            };
            domainWizardModal.testLogs.push(`[${tag}] 接口未返回数据`);
          }
        } else {
          domainWizardModal.testResults[tag] = {
            tcp: null,
            web: null,
            latency: null,
          };
          domainWizardModal.testLogs.push(
            `[${tag}] 接口错误 (状态码: ${res.status})`,
          );
        }
      } catch (err) {
        if (!domainWizardModal.isTesting) return;
        domainWizardModal.testResults[tag] = {
          tcp: null,
          web: null,
          latency: null,
        };
        domainWizardModal.testLogs.push(
          `[${tag}] 测试异常: ${err.message || err}`,
        );
      } finally {
        domainWizardModal.testProgress++;
      }
    });

    await Promise.all(promises);
    setTimeout(processBatch, 50);
  };

  await processBatch();
};

const calculateRecommendations = () => {
  const proxyRankings = [];
  const groupRankings = [];

  (configData.outbounds || []).forEach((o) => {
    if (!["direct", "block", "dns", "selector", "urltest"].includes(o.type)) {
      const result = domainWizardModal.testResults[o.tag];
      const latency = result?.latency;
      proxyRankings.push({
        tag: o.tag,
        type: o.type,
        latency: latency !== undefined && latency !== null ? latency : 99999,
      });
    } else if (["selector", "urltest"].includes(o.type)) {
      let totalLatency = 0;
      let count = 0;
      if (Array.isArray(o.outbounds)) {
        o.outbounds.forEach((memberTag) => {
          const result = domainWizardModal.testResults[memberTag];
          if (
            result &&
            result.latency !== null &&
            result.latency !== undefined
          ) {
            totalLatency += result.latency;
            count++;
          }
        });
      }
      const avgLatency = count > 0 ? Math.round(totalLatency / count) : 99999;
      groupRankings.push({
        tag: o.tag,
        type: o.type,
        latency: avgLatency,
      });
    }
  });

  proxyRankings.sort((a, b) => a.latency - b.latency);
  groupRankings.sort((a, b) => a.latency - b.latency);

  const recommendedGroup = groupRankings.find(
    (g) => g.type === "urltest" && g.latency < 99999,
  );
  const recommendedNode = proxyRankings.find((p) => p.latency < 99999);

  let bestTag = "";
  if (recommendedGroup) {
    bestTag = recommendedGroup.tag;
    domainWizardModal.testLogs.push(
      `[系统推荐] 最佳自动测速策略组: ${bestTag} (平均延迟: ${recommendedGroup.latency}ms)`,
    );
  } else if (recommendedNode) {
    bestTag = recommendedNode.tag;
    domainWizardModal.testLogs.push(
      `[系统推荐] 最佳代理节点: ${bestTag} (延迟: ${recommendedNode.latency}ms)`,
    );
  } else {
    const urltestGroup = (configData.outbounds || []).find(
      (o) => o.type === "urltest",
    );
    bestTag = urltestGroup ? urltestGroup.tag : "direct";
    domainWizardModal.testLogs.push(
      `[系统提示] 所有代理节点测速失败，已默认推荐: ${bestTag}`,
    );
  }

  domainWizardModal.recommendedOutbound = bestTag;
  domainWizardModal.selectedOutbound = bestTag;
};

const sortedOutboundsForSelect = computed(() => {
  const list = [];
  (configData.outbounds || []).forEach((o) => {
    let latencyText = "";
    let sortKey = 999999;
    let isRecommended = o.tag === domainWizardModal.recommendedOutbound;

    if (["selector", "urltest"].includes(o.type)) {
      let totalLatency = 0;
      let count = 0;
      if (Array.isArray(o.outbounds)) {
        o.outbounds.forEach((memberTag) => {
          const result = domainWizardModal.testResults[memberTag];
          if (
            result &&
            result.latency !== null &&
            result.latency !== undefined
          ) {
            totalLatency += result.latency;
            count++;
          }
        });
      }
      if (count > 0) {
        const avg = Math.round(totalLatency / count);
        latencyText = `平均延迟: ${avg}ms`;
        sortKey = avg;
      } else {
        latencyText = "策略组 (未测速/全部失败)";
        sortKey = 888888;
      }
    } else if (!["direct", "block", "dns"].includes(o.type)) {
      const result = domainWizardModal.testResults[o.tag];
      if (result && result.latency !== null && result.latency !== undefined) {
        latencyText = `延迟: ${result.latency}ms`;
        sortKey = result.latency;
      } else {
        latencyText = "代理节点 (测速失败/未测速)";
        sortKey = 888888;
      }
    } else {
      latencyText =
        o.type === "direct" ? "直连" : o.type === "block" ? "阻断" : "DNS";
      sortKey = 900000;
    }

    list.push({
      tag: o.tag,
      type: o.type,
      latencyText,
      sortKey,
      isRecommended,
    });
  });

  list.sort((a, b) => {
    if (a.isRecommended) return -1;
    if (b.isRecommended) return 1;
    return a.sortKey - b.sortKey;
  });

  return list;
});

const matchingExistingRule = computed(() => {
  if (!domainWizardModal.selectedOutbound) return null;
  return (configData.route.rules || []).find(
    (r) =>
      r.outbound === domainWizardModal.selectedOutbound &&
      !r.ip_cidr &&
      !r.geoip &&
      !r.geosite &&
      !r.port &&
      !r.protocol &&
      !r.ip_is_private &&
      r.type !== "logical",
  );
});

const confirmApplyDomainWizard = () => {
  if (domainWizardModal.errorMsg) {
    showToast(domainWizardModal.errorMsg, "warning");
    return;
  }
  if (!domainWizardModal.selectedOutbound) {
    showToast("请选择目标出站", "warning");
    return;
  }

  const domains = domainWizardModal.inputText
    .split(/[\n,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) {
    showToast("请输入待配置的域名", "warning");
    return;
  }

  let targetValue = "";
  let fieldName = "";

  if (domainWizardModal.detectedType === "precise") {
    targetValue = domains[0];
    fieldName = "domain";
  } else {
    targetValue = domainWizardModal.extractedSuffix;
    fieldName = "domain_suffix";
    if (!targetValue) {
      showToast("范域名公共后缀为空，请重新输入", "warning");
      return;
    }
  }

  const ruleToMerge =
    domainWizardModal.targetRuleAction === "append"
      ? matchingExistingRule.value
      : null;

  if (ruleToMerge) {
    if (!Array.isArray(ruleToMerge[fieldName])) {
      ruleToMerge[fieldName] = [];
    }
    if (!ruleToMerge[fieldName].includes(targetValue)) {
      ruleToMerge[fieldName].push(targetValue);
      showToast(
        `已成功将域名/后缀 [${targetValue}] 合并到已有出站 [${domainWizardModal.selectedOutbound}] 的路由规则中！`,
      );
    } else {
      showToast(
        `域名/后缀 [${targetValue}] 已存在于该出站规则中，无需重复添加。`,
        "warning",
      );
    }
  } else {
    const newRule = {
      outbound: domainWizardModal.selectedOutbound,
      [fieldName]: [targetValue],
    };
    if (!Array.isArray(configData.route.rules)) {
      configData.route.rules = [];
    }
    configData.route.rules.unshift(newRule);
    showToast(
      `已成功创建新的分流路由规则，指向出站 [${domainWizardModal.selectedOutbound}]，匹配: ${targetValue}`,
    );
  }

  domainWizardModal.show = false;
};

const openDomainWizard = () => {
  domainWizardModal.inputText = "";
  domainWizardModal.errorMsg = "";
  domainWizardModal.detectedType = "";
  domainWizardModal.extractedSuffix = "";
  domainWizardModal.testUrl = "";

  domainWizardModal.isTesting = false;
  domainWizardModal.testProgress = 0;
  domainWizardModal.testTotal = 0;
  domainWizardModal.testLogs = [];
  domainWizardModal.testResults = {};
  domainWizardModal.recommendedOutbound = "";
  domainWizardModal.selectedOutbound = "";
  domainWizardModal.targetRuleAction = "create";

  domainWizardModal.show = true;
};

const isGroupImported = (tag) => {
  return (configData.outbounds || []).some(
    (o) => o.tag === tag && ["selector", "urltest"].includes(o.type),
  );
};

const availableGroupsToImport = computed(() => {
  const currentTags = (configData.outbounds || []).map((o) => o.tag);
  return (outboundGroups.value || []).filter(
    (g) => g.tag && !currentTags.includes(g.tag),
  );
});

// 模态框中显示的组列表：包含所有 DB 组（已导入的灰显），按搜索词过滤
const filteredGroupsToImport = computed(() =>
  filterGroupsByQuery(outboundGroups.value, groupImportModal.searchQuery),
);

// 当前按搜索过滤后可被引入的组（剔除已导入的）
const selectableGroupsToImport = computed(() => {
  return filteredGroupsToImport.value.filter((g) => !isGroupImported(g.tag));
});

// 判断当前可引入的分流出站组是否全部被勾选
const isAllGroupsSelected = computed(() => {
  const selectable = selectableGroupsToImport.value;
  if (selectable.length === 0) return false;
  return selectable.every((g) =>
    (groupImportModal.selectedTags || []).includes(g.tag),
  );
});

// 切换全选/取消全选可引入的分流出站组
const toggleSelectAllGroups = () => {
  const selectable = selectableGroupsToImport.value;
  if (selectable.length === 0) return;
  const selectableTags = selectable.map((g) => g.tag);
  if (isAllGroupsSelected.value) {
    groupImportModal.selectedTags = (
      groupImportModal.selectedTags || []
    ).filter((t) => !selectableTags.includes(t));
  } else {
    const set = new Set([
      ...(groupImportModal.selectedTags || []),
      ...selectableTags,
    ]);
    groupImportModal.selectedTags = Array.from(set);
  }
};

// 反选当前可引入的分流出站组
const invertGroupsSelection = () => {
  const selectable = selectableGroupsToImport.value;
  if (selectable.length === 0) return;
  const selectableTags = selectable.map((g) => g.tag);
  const currentSet = new Set(groupImportModal.selectedTags || []);
  selectableTags.forEach((t) => {
    if (currentSet.has(t)) {
      currentSet.delete(t);
    } else {
      currentSet.add(t);
    }
  });
  groupImportModal.selectedTags = Array.from(currentSet);
};

// 批量引入勾选的分流出站组
const confirmBatchGroupImport = () => {
  const selectedTags = [...(groupImportModal.selectedTags || [])];
  if (selectedTags.length === 0) {
    showToast("请先勾选要引入的分流出站组", "warning");
    return;
  }

  let count = 0;
  selectedTags.forEach((tag) => {
    const group = (outboundGroups.value || []).find((g) => g.tag === tag);
    if (group && !isGroupImported(group.tag)) {
      const ok = expandGroupImport(group);
      if (ok) count++;
    }
  });

  groupImportModal.selectedTags = (groupImportModal.selectedTags || []).filter(
    (t) => !isGroupImported(t),
  );

  if (count > 0) {
    showToast(`已成功批量引入 ${count} 个分流出站组`);
  }
};

const openGroupImport = () => {
  groupImportModal.searchQuery = clearSearchQuery();
  groupImportModal.selectedTags = [];
  groupImportModal.show = true;
};

const clearGroupSearchQuery = () => {
  groupImportModal.searchQuery = clearSearchQuery();
};

const getGroupNodeCount = (g) => {
  if (!g.static_nodes) return 0;
  try {
    const nodes =
      typeof g.static_nodes === "string"
        ? JSON.parse(g.static_nodes)
        : g.static_nodes;
    return Array.isArray(nodes) ? nodes.length : 0;
  } catch {
    return 0;
  }
};

const itemModal = reactive({
  show: false,
  title: "",
  jsonText: "",
  error: "",
  onSave: null,
  itemType: "", // 'dns_server', 'dns_rule', 'inbound', 'route_rule', 'route_ruleset', 'outbound'
  mode: "visual",
  itemData: {},
  idx: -1,
  validating: false,
  routeRuleLogic: "standard",
  dnsRuleType: "domain_suffix",
  tempFields: {
    domain: "",
    domain_suffix: "",
    domain_keyword: "",
    domain_regex: "",
    geosite: "",
    geoip: "",
    ip_cidr: "",
    port: "",
    inbound: "",
    rule_set: "",
    protocol: "",
    outbounds: "",
  },
});

const previewModal = reactive({
  show: false,
  loading: false,
  error: "",
  content: "",
  jsonObject: null,
});

const importModal = reactive({
  show: false,
  content: "",
  error: "",
  validating: false,
});

const nodePoolModal = reactive({
  show: false,
  nodes: [],
  searchQuery: "",
  selectedIds: [],
});

const filteredNodePoolNodes = computed(() => {
  const query = (nodePoolModal.searchQuery || "").toLowerCase().trim();
  if (!query) return nodePoolModal.nodes || [];
  return (nodePoolModal.nodes || []).filter(
    (n) =>
      (n.tag && n.tag.toLowerCase().includes(query)) ||
      (n.node_type && n.node_type.toLowerCase().includes(query)) ||
      (n.remarks && n.remarks.toLowerCase().includes(query)),
  );
});

const isAllNodePoolSelected = computed(() => {
  const list = filteredNodePoolNodes.value;
  if (list.length === 0) return false;
  return list.every((n) => nodePoolModal.selectedIds.includes(n.id));
});

const toggleSelectAllNodePool = () => {
  const filtered = filteredNodePoolNodes.value;
  if (filtered.length === 0) return;
  const filteredIds = filtered.map((n) => n.id);
  if (isAllNodePoolSelected.value) {
    nodePoolModal.selectedIds = nodePoolModal.selectedIds.filter(
      (id) => !filteredIds.includes(id),
    );
  } else {
    const set = new Set([...nodePoolModal.selectedIds, ...filteredIds]);
    nodePoolModal.selectedIds = Array.from(set);
  }
};

const invertNodePoolSelection = () => {
  const filtered = filteredNodePoolNodes.value;
  if (filtered.length === 0) return;
  const filteredIds = filtered.map((n) => n.id);
  const currentSet = new Set(nodePoolModal.selectedIds);
  filteredIds.forEach((id) => {
    if (currentSet.has(id)) {
      currentSet.delete(id);
    } else {
      currentSet.add(id);
    }
  });
  nodePoolModal.selectedIds = Array.from(currentSet);
};

const isNodeTagImported = (tag) => {
  return (configData.outbounds || []).some((o) => o.tag === tag);
};

// Parsers
const parseLog = (json) => {
  configData.log.disabled = !!json.disabled;
  configData.log.level = json.level || "warn";
  configData.log.timestamp = json.timestamp !== false;
  configData.log.output = json.output || "";
  configData.log._extra = { ...json };
  delete configData.log._extra.disabled;
  delete configData.log._extra.level;
  delete configData.log._extra.timestamp;
  delete configData.log._extra.output;
};

const parseDns = (json) => {
  configData.dns.strategy = json.strategy || "ipv4_only";
  configData.dns.final = json.final || "";
  configData.dns.independent_cache = json.independent_cache !== false;
  configData.dns.disable_cache = !!json.disable_cache;
  configData.dns.disable_expire = !!json.disable_expire;
  configData.dns.reverse_mapping = !!json.reverse_mapping;
  configData.dns.client_subnet = json.client_subnet || "";

  let rawServers = [];
  if (json) {
    if (Array.isArray(json.servers)) {
      rawServers = json.servers;
    } else if (Array.isArray(json)) {
      rawServers = json;
    } else if (json.dns && Array.isArray(json.dns.servers)) {
      rawServers = json.dns.servers;
    }
  }

  configData.dns.servers = JSON.parse(JSON.stringify(rawServers)).map((srv) => {
    if (srv && typeof srv === "object") {
      if (srv.address !== undefined && srv.server === undefined) {
        srv.server = srv.address;
        delete srv.address;
      }
      if (srv.type && typeof srv.type === "string") {
        const typeLower = srv.type.toLowerCase();
        if (typeLower === "dns") {
          srv.type = "udp";
        } else if (typeLower === "doh" || typeLower === "http3") {
          srv.type = "https";
        } else if (typeLower === "dot") {
          srv.type = "tls";
        } else if (typeLower === "doq") {
          srv.type = "quic";
        }
      }
    }
    return srv;
  });

  configData.dns.rules =
    json && Array.isArray(json.rules)
      ? JSON.parse(JSON.stringify(json.rules))
      : [];
  if (json.fakeip) {
    configData.dns.fakeip.enabled = true;
    configData.dns.fakeip.inet4_range = json.fakeip.inet4_range || "";
    configData.dns.fakeip.inet6_range = json.fakeip.inet6_range || "";
  } else {
    configData.dns.fakeip.enabled = false;
    configData.dns.fakeip.inet4_range = "";
    configData.dns.fakeip.inet6_range = "";
  }
  configData.dns._extra = { ...json };
  delete configData.dns._extra.strategy;
  delete configData.dns._extra.final;
  delete configData.dns._extra.independent_cache;
  delete configData.dns._extra.disable_cache;
  delete configData.dns._extra.disable_expire;
  delete configData.dns._extra.reverse_mapping;
  delete configData.dns._extra.servers;
  delete configData.dns._extra.rules;
  delete configData.dns._extra.fakeip;
  delete configData.dns._extra.client_subnet;
};

const parseInbounds = (json) => {
  configData.inbounds = Array.isArray(json)
    ? JSON.parse(JSON.stringify(json))
    : [];
};

const parseOutbounds = (json) => {
  const list = Array.isArray(json) ? JSON.parse(JSON.stringify(json)) : [];
  list.forEach((outb) => {
    if (outb.server_port !== undefined && outb.port === undefined) {
      outb.port = outb.server_port;
    }
  });
  configData.outbounds = list;
};

const parseRoute = (json) => {
  configData.route.final = json.final || "direct";
  configData.route.auto_detect_interface = json.auto_detect_interface !== false;
  configData.route.default_domain_resolver = json.default_domain_resolver || "";
  configData.route.rules = Array.isArray(json.rules)
    ? JSON.parse(JSON.stringify(json.rules))
    : [];
  configData.route.rule_set = Array.isArray(json.rule_set)
    ? JSON.parse(JSON.stringify(json.rule_set))
    : [];
  configData.route._extra = { ...json };
  delete configData.route._extra.final;
  delete configData.route._extra.auto_detect_interface;
  delete configData.route._extra.default_domain_resolver;
  delete configData.route._extra.rules;
  delete configData.route._extra.rule_set;
};

const parseExperimental = (json) => {
  if (json.cache_file) {
    configData.experimental.cache_file.enabled = true;
    configData.experimental.cache_file.path = json.cache_file.path || "";
    configData.experimental.cache_file.store_fakeip =
      json.cache_file.store_fakeip !== false;
    configData.experimental.cache_file.store_rdrc =
      json.cache_file.store_rdrc !== false;
  } else {
    configData.experimental.cache_file.enabled = false;
    configData.experimental.cache_file.path = "";
    configData.experimental.cache_file.store_fakeip = false;
    configData.experimental.cache_file.store_rdrc = false;
  }
  if (json.clash_api) {
    configData.experimental.clash_api.enabled = true;
    configData.experimental.clash_api.external_controller =
      json.clash_api.external_controller || "";
    configData.experimental.clash_api.external_ui =
      json.clash_api.external_ui || "";
    configData.experimental.clash_api.secret = json.clash_api.secret || "";
    configData.experimental.clash_api.default_mode =
      json.clash_api.default_mode || "";
  } else {
    configData.experimental.clash_api.enabled = false;
    configData.experimental.clash_api.external_controller = "";
    configData.experimental.clash_api.external_ui = "";
    configData.experimental.clash_api.secret = "";
    configData.experimental.clash_api.default_mode = "";
  }
  configData.experimental._extra = { ...json };
  delete configData.experimental._extra.cache_file;
  delete configData.experimental._extra.clash_api;
};

// Serializers
const serializeLog = () => {
  const obj = {
    disabled: configData.log.disabled,
    level: configData.log.level,
    timestamp: configData.log.timestamp,
    ...(configData.log._extra || {}),
  };
  if (configData.log.output) {
    obj.output = configData.log.output;
  }
  return obj;
};

const serializeDns = () => {
  const servers = JSON.parse(JSON.stringify(configData.dns.servers));
  servers.forEach((srv) => {
    if (!srv.detour) {
      delete srv.detour;
    }
  });
  const obj = {
    strategy: configData.dns.strategy,
    final: configData.dns.final,
    independent_cache: configData.dns.independent_cache,
    disable_cache: configData.dns.disable_cache,
    disable_expire: configData.dns.disable_expire,
    reverse_mapping: configData.dns.reverse_mapping,
    servers: servers,
    rules: JSON.parse(JSON.stringify(configData.dns.rules)),
    ...(configData.dns._extra || {}),
  };
  if (configData.dns.client_subnet) {
    obj.client_subnet = configData.dns.client_subnet.trim();
  }
  if (configData.dns.fakeip.enabled) {
    obj.fakeip = {
      inet4_range: configData.dns.fakeip.inet4_range,
      inet6_range: configData.dns.fakeip.inet6_range,
    };
  }
  return obj;
};

const serializeInbounds = () => {
  return JSON.parse(JSON.stringify(configData.inbounds));
};

const serializeOutbounds = () => {
  const list = JSON.parse(JSON.stringify(configData.outbounds));
  list.forEach((outb) => {
    if (outb.port !== undefined) {
      outb.server_port = parseInt(outb.port);
      delete outb.port;
    }
  });
  return list;
};

const serializeRoute = () => {
  const obj = {
    final: configData.route.final,
    auto_detect_interface: configData.route.auto_detect_interface,
    default_domain_resolver:
      configData.route.default_domain_resolver || undefined,
    rules: JSON.parse(JSON.stringify(configData.route.rules)),
    rule_set: JSON.parse(JSON.stringify(configData.route.rule_set)),
    ...(configData.route._extra || {}),
  };
  return obj;
};

const serializeExperimental = () => {
  const obj = {
    ...(configData.experimental._extra || {}),
  };
  if (configData.experimental.cache_file.enabled) {
    obj.cache_file = {
      enabled: true,
      store_fakeip: configData.experimental.cache_file.store_fakeip,
      store_rdrc: configData.experimental.cache_file.store_rdrc,
    };
    if (configData.experimental.cache_file.path) {
      obj.cache_file.path = configData.experimental.cache_file.path;
    }
  }
  if (configData.experimental.clash_api.enabled) {
    obj.clash_api = {
      external_controller:
        configData.experimental.clash_api.external_controller,
      external_ui: configData.experimental.clash_api.external_ui || undefined,
      secret: configData.experimental.clash_api.secret || undefined,
      default_mode: configData.experimental.clash_api.default_mode || undefined,
    };
  }
  return obj;
};

const openImportModal = () => {
  importModal.content = "";
  importModal.error = "";
  importModal.validating = false;
  importModal.show = true;
};

const hasConfigContent = () => {
  return (
    (configData.outbounds && configData.outbounds.length > 0) ||
    (configData.dns.servers && configData.dns.servers.length > 0) ||
    (configData.dns.rules && configData.dns.rules.length > 0) ||
    (configData.inbounds && configData.inbounds.length > 0) ||
    (configData.route.rules && configData.route.rules.length > 0) ||
    (configData.route.rule_set && configData.route.rule_set.length > 0)
  );
};

const openImportInEdit = async () => {
  if (hasConfigContent()) {
    const confirmed = await confirmDialog(
      "导入完整配置将覆盖当前编辑中的所有配置内容（未保存的改动会丢失）。是否继续？",
      {
        title: "导入覆盖确认",
        confirmText: "确认导入",
        cancelText: "取消",
        isDanger: true,
      },
    );
    if (!confirmed) return;
  }
  openImportModal();
};

const confirmImport = async () => {
  try {
    const parsed = JSON.parse(importModal.content);
    if (typeof parsed !== "object" || parsed === null) {
      importModal.error = "配置内容必须是一个 JSON 对象";
      return;
    }

    const logSec = parsed.log || {};
    let dnsSec = parsed.dns || {};
    const inboundsSec = parsed.inbounds || [];
    const outboundsSec = parsed.outbounds || [];
    const routeSec = parsed.route || {};
    const experimentalSec = parsed.experimental || {};

    // Support direct servers or array configuration at root
    if (!parsed.dns) {
      if (Array.isArray(parsed.servers)) {
        dnsSec = { servers: parsed.servers };
      } else if (Array.isArray(parsed)) {
        dnsSec = { servers: parsed };
      }
    }

    if (dnsSec && Array.isArray(dnsSec.servers)) {
      dnsSec.servers = dnsSec.servers.map((srv) => {
        if (srv && typeof srv === "object") {
          const srvCopy = { ...srv };
          if (srvCopy.address !== undefined && srvCopy.server === undefined) {
            srvCopy.server = srvCopy.address;
            delete srvCopy.address;
          }
          if (srvCopy.type && typeof srvCopy.type === "string") {
            const typeLower = srvCopy.type.toLowerCase();
            if (typeLower === "dns") {
              srvCopy.type = "udp";
            } else if (typeLower === "doh" || typeLower === "http3") {
              srvCopy.type = "https";
            } else if (typeLower === "dot") {
              srvCopy.type = "tls";
            } else if (typeLower === "doq") {
              srvCopy.type = "quic";
            }
          }
          return srvCopy;
        }
        return srv;
      });
    }

    importModal.validating = true;
    importModal.error = "";

    const res = await fetch(`${API_BASE}/api/config/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        log: logSec,
        dns: dnsSec,
        inbounds: inboundsSec,
        outbounds: outboundsSec,
        route: routeSec,
        experimental: experimentalSec,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      importModal.error = `校验服务出错: ${errText || "接口错误"}`;
      return;
    }

    const result = await res.json();
    if (result.command_missing) {
      showToast(
        "系统未检测到 sing-box 命令，已跳过完整性校验，请自行导出配置进行验证。",
        "warning",
      );
    } else if (!result.valid) {
      importModal.error = `sing-box 校验失败: ${result.error}`;
      showToast(`sing-box 校验失败: ${result.error}`, "danger");
      return;
    }

    parseLog(logSec);
    parseDns(dnsSec);
    parseInbounds(inboundsSec);
    parseOutbounds(outboundsSec);
    parseRoute(routeSec);
    parseExperimental(experimentalSec);

    rawJson.log = JSON.stringify(logSec, null, 2);
    rawJson.dns = JSON.stringify(dnsSec, null, 2);
    rawJson.inbounds = JSON.stringify(inboundsSec, null, 2);
    rawJson.outbounds = JSON.stringify(outboundsSec, null, 2);
    rawJson.route = JSON.stringify(routeSec, null, 2);
    rawJson.experimental = JSON.stringify(experimentalSec, null, 2);

    showToast(
      "成功导入并解析完整配置！请检查各配置段后点击「保存配置」持久化。",
    );
    importModal.show = false;
    if (activeSection.value === "preview") {
      previewGeneratedConfig();
    }
  } catch (e) {
    importModal.error = `JSON 语法解析错误或导入失败: ${e.message}`;
  } finally {
    importModal.validating = false;
  }
};

const getFullConfigData = () => {
  const data = {};
  const sectionsList = [
    "log",
    "dns",
    "inbounds",
    "outbounds",
    "route",
    "experimental",
  ];
  for (const sec of sectionsList) {
    if (sectionModes[sec] === "visual") {
      if (sec === "log") data[sec] = serializeLog();
      else if (sec === "dns") data[sec] = serializeDns();
      else if (sec === "inbounds") data[sec] = serializeInbounds();
      else if (sec === "outbounds") data[sec] = serializeOutbounds();
      else if (sec === "route") data[sec] = serializeRoute();
      else if (sec === "experimental") data[sec] = serializeExperimental();
    } else {
      try {
        data[sec] = JSON.parse(rawJson[sec]);
      } catch (e) {
        showToast(`[${sec}] 模块 JSON 语法错误: ${e.message}`, "danger");
        throw e;
      }
    }
  }
  return data;
};

const findDuplicateTags = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const duplicates = new Set();
  for (const item of list) {
    if (item && typeof item === "object" && item.tag) {
      if (seen.has(item.tag)) {
        duplicates.add(item.tag);
      } else {
        seen.add(item.tag);
      }
    }
  }
  return Array.from(duplicates);
};

const validateFullConfigData = (fullData) => {
  for (const sec of Object.keys(fullData)) {
    const valResult = validateData(sec, fullData[sec]);
    if (!valResult.valid) {
      showToast(`[${sec}] 配置校验失败: ${valResult.errors}`, "danger");
      return false;
    }
  }

  if (Array.isArray(fullData.outbounds)) {
    const dupes = findDuplicateTags(fullData.outbounds);
    if (dupes.length > 0) {
      showToast(
        `[outbounds] 配置校验失败: 出站连接中存在重复的 tag: "${dupes.join('", "')}"，请修改或删除重复项。`,
        "danger",
      );
      return false;
    }
  }

  if (Array.isArray(fullData.inbounds)) {
    const dupes = findDuplicateTags(fullData.inbounds);
    if (dupes.length > 0) {
      showToast(
        `[inbounds] 配置校验失败: 入站连接中存在重复的 tag: "${dupes.join('", "')}"`,
        "danger",
      );
      return false;
    }
  }

  return true;
};

const validateFullConfigWithSingbox = async (fullData) => {
  if (!validateFullConfigData(fullData)) {
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/api/config/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify(fullData),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.command_missing) {
        showToast("系统未安装 sing-box，已跳过完整性校验。", "warning");
        return true;
      }
      if (!result.valid) {
        showToast(`sing-box 校验失败: ${result.error}`, "danger");
        return false;
      }
      return true;
    } else {
      const errText = await res.text();
      showToast(
        `校验服务出错: ${errText || "接口错误"}，跳过语法检测。`,
        "warning",
      );
      return true;
    }
  } catch {
    showToast("连接校验服务发生网络错误，跳过语法检测。", "warning");
    return true;
  }
};

const loadConfigList = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/config/history`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        configList.value = data;
        activeConfigId.value = null;
      } else {
        configList.value = data.items || [];
        activeConfigId.value = data.active_id;
      }
    }
  } catch (e) {
    console.error("加载配置列表失败", e);
  }
};

const selectConfig = async (id) => {
  if (!id) return;
  currentConfigId.value = id;
  await loadHistoryConfig(id);
};

const isEditing = ref(false);
const currentPage = ref(1);
const pageSize = ref(10);

const parseConfigRoute = () => {
  const rawHash = window.location.hash.substring(1);
  const [pathPart] = rawHash.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  let isEdit = false;
  let configId = null;
  let tab = null;

  if (parts[0] === "config") {
    if (parts[1] === "edit" && parts[2]) {
      const id = parseInt(parts[2], 10);
      if (!isNaN(id)) {
        isEdit = true;
        configId = id;
        if (parts[3] && sections.includes(parts[3])) {
          tab = parts[3];
        }
      }
    } else if (parts[1] && !isNaN(parseInt(parts[1], 10))) {
      const id = parseInt(parts[1], 10);
      isEdit = true;
      configId = id;
      if (parts[2] && sections.includes(parts[2])) {
        tab = parts[2];
      }
    }
  }

  if (!tab && rawHash.includes("tab=")) {
    const match = rawHash.match(/tab=([^&]+)/);
    if (match && sections.includes(match[1])) {
      tab = match[1];
    }
  }

  return { isEditing: isEdit, configId, tab };
};

const backToList = () => {
  isEditing.value = false;
  if (window.location.hash !== "#config") {
    window.location.hash = "#config";
  }
};

const syncFromRoute = async () => {
  const routeState = parseConfigRoute();
  if (routeState.isEditing && routeState.configId) {
    if (routeState.tab && sections.includes(routeState.tab)) {
      activeSection.value = routeState.tab;
    }
    if (!isEditing.value || currentConfigId.value !== routeState.configId) {
      const exists = configList.value.some(
        (item) => item.id === routeState.configId,
      );
      if (exists) {
        currentConfigId.value = routeState.configId;
        await selectConfig(routeState.configId);
        isEditing.value = true;
      } else if (configList.value.length > 0) {
        showToast(`未找到 ID 为 #${routeState.configId} 的配置`, "warning");
        backToList();
      }
    }
  } else {
    if (isEditing.value) {
      isEditing.value = false;
    }
  }
};

watch(activeSection, (newTab) => {
  if (isEditing.value && currentConfigId.value) {
    const targetHash = `#config/edit/${currentConfigId.value}/${newTab}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }
});

const paginatedConfigs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return configList.value.slice(start, end);
});

watch(configList, (newVal) => {
  const maxPage = Math.max(1, Math.ceil(newVal.length / pageSize.value));
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

watch(pageSize, () => {
  currentPage.value = 1;
});

const startEditConfig = async (id) => {
  await selectConfig(id);
  isEditing.value = true;
  const targetHash = `#config/edit/${id}/${activeSection.value}`;
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }
};

const exportConfigById = async (id, name) => {
  try {
    const res = await fetch(`${API_BASE}/api/config/history/${id}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const detailItem = await res.json();
      const content = detailItem.content || "{}";
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subout-config-${name || id}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("配置已成功导出");
    } else {
      showToast("导出失败：获取配置内容失败", "danger");
    }
  } catch {
    showToast("导出失败：网络请求出错", "danger");
  }
};

const migrateLegacyGroupOutbounds = () => {
  // 旧格式配置的 selector/urltest 可能只存了 {tag, type} 引用而无 outbounds 字段。
  // 这里检测并从 DB 展开，把缺失节点的 raw_json 也补全进配置。
  let migrated = 0;
  configData.outbounds.forEach((o) => {
    if (
      ["selector", "urltest"].includes(o.type) &&
      (!o.outbounds || o.outbounds.length === 0)
    ) {
      const dbGroup = outboundGroups.value.find((g) => g.tag === o.tag);
      if (dbGroup) {
        let nodeTags = [];
        try {
          nodeTags = JSON.parse(dbGroup.static_nodes || "[]");
          if (!Array.isArray(nodeTags)) nodeTags = [];
        } catch {
          nodeTags = [];
        }

        // 补全缺失的节点（深拷贝 raw_json）
        for (const tag of nodeTags) {
          if (!configData.outbounds.some((x) => x.tag === tag)) {
            const node = nodePoolCache.value.find((n) => n.tag === tag);
            if (node) {
              try {
                const p = JSON.parse(node.raw_json);
                if (p && typeof p === "object") {
                  p.tag = node.tag;
                  configData.outbounds.push(p);
                }
              } catch {
                // 忽略解析失败
              }
            }
          }
        }

        o.outbounds = nodeTags;
        if (dbGroup.group_type === "urltest") {
          o.url =
            o.url || dbGroup.url || "http://cp.cloudflare.com/generate_204";
          o.interval = o.interval || dbGroup.interval || "3m";
          o.tolerance =
            o.tolerance !== undefined ? o.tolerance : (dbGroup.tolerance ?? 50);
        }
        migrated++;
      }
    }
  });

  if (migrated > 0) {
    showToast(
      `检测到旧格式配置，已自动展开 ${migrated} 个出站组引用。保存后生效。`,
      "warning",
    );
  }
};

const loadHistoryConfig = async (id) => {
  try {
    const res = await fetch(`${API_BASE}/api/config/history/${id}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const detailItem = await res.json();
      currentConfigDetail.value = detailItem.detail || "";
      const base = JSON.parse(detailItem.content || "{}");
      rawJson.log = JSON.stringify(base.log || {}, null, 2);
      rawJson.dns = JSON.stringify(base.dns || {}, null, 2);
      rawJson.inbounds = JSON.stringify(base.inbounds || [], null, 2);
      rawJson.outbounds = JSON.stringify(base.outbounds || [], null, 2);
      rawJson.route = JSON.stringify(base.route || {}, null, 2);
      rawJson.experimental = JSON.stringify(base.experimental || {}, null, 2);

      parseLog(base.log || {});
      parseDns(base.dns || {});
      parseInbounds(base.inbounds || []);
      parseOutbounds(base.outbounds || []);
      parseRoute(base.route || {});
      parseExperimental(base.experimental || {});

      // 旧配置迁移：把 selector/urltest 的引用展开为自包含快照
      migrateLegacyGroupOutbounds();
    }
  } catch {
    showToast("加载配置详情失败", "danger");
  }
};

const saveConfig = async () => {
  if (!currentConfigId.value) return;

  let fullData;
  try {
    fullData = getFullConfigData();
  } catch {
    return;
  }
  if (!(await validateFullConfigWithSingbox(fullData))) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/config/history/${currentConfigId.value}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify({
          detail: currentConfigDetail.value || "未命名配置",
          content: fullData,
        }),
      },
    );

    if (res.ok) {
      showToast("配置已成功更新保存！");
      await loadAllSections();
    } else {
      const errText = await res.text();
      showToast(`保存失败: ${errText || "接口错误"}`, "danger");
    }
  } catch {
    showToast("保存配置网络请求失败", "danger");
  }
};

const saveAsNewConfig = async () => {
  let fullData;
  try {
    fullData = getFullConfigData();
  } catch {
    return;
  }

  const desc = await promptDialog("请输入新配置的名称/备注:", "另存配置", {
    title: "另存配置",
  });
  if (desc === null) return;

  try {
    const res = await fetch(`${API_BASE}/api/config/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        detail: desc || "另存配置",
        content: fullData,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      showToast("已成功另存为新配置！");
      await loadAllSections();
      await startEditConfig(result.id);
    } else {
      const errText = await res.text();
      showToast(`另存失败: ${errText || "接口错误"}`, "danger");
    }
  } catch {
    showToast("网络请求失败", "danger");
  }
};

const createNewConfigItem = async () => {
  const desc = await promptDialog("请输入新建配置的名称/备注:", "新建配置", {
    title: "新建配置",
  });
  if (desc === null) return;

  try {
    const res = await fetch(`${API_BASE}/api/config/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        detail: desc || "未命名配置",
        content: null,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      showToast("新建配置成功！");
      await loadAllSections();
      await startEditConfig(result.id);
    } else {
      const errText = await res.text();
      showToast(`创建失败: ${errText || "接口错误"}`, "danger");
    }
  } catch {
    showToast("网络请求失败", "danger");
  }
};

const deleteConfigItem = async (id) => {
  if (!(await confirmDialog("确定要删除此配置项吗？", { isDanger: true })))
    return;

  try {
    const res = await fetch(`${API_BASE}/api/config/history/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.value}` },
    });

    if (res.ok) {
      showToast("配置项已删除");
      if (currentConfigId.value === id) {
        currentConfigId.value = null;
        backToList();
      }
      await loadAllSections();
    } else {
      showToast("删除失败", "danger");
    }
  } catch {
    showToast("网络请求失败", "danger");
  }
};

const loadAllSections = async () => {
  try {
    const resGroups = await fetch(`${API_BASE}/api/groups`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (resGroups.ok) {
      outboundGroups.value = await resGroups.json();
    }
  } catch (e) {
    console.error("加载出站组失败", e);
  }

  // 加载节点池缓存（用于出站组完整展开导入与旧配置迁移）
  await loadNodePoolCache();

  await loadRunningConfigSettings();
  await loadConfigList();

  const routeState = parseConfigRoute();
  if (routeState.isEditing && routeState.configId) {
    const exists = configList.value.some(
      (item) => item.id === routeState.configId,
    );
    if (exists) {
      currentConfigId.value = routeState.configId;
      if (routeState.tab && sections.includes(routeState.tab)) {
        activeSection.value = routeState.tab;
      }
      await selectConfig(routeState.configId);
      isEditing.value = true;
      return;
    } else if (configList.value.length > 0) {
      showToast(`未找到 ID 为 #${routeState.configId} 的配置`, "warning");
      if (window.location.hash !== "#config") {
        window.history.replaceState(null, null, "#config");
      }
    }
  }

  isEditing.value = false;

  if (configList.value.length > 0) {
    const exists = configList.value.some(
      (item) => item.id === currentConfigId.value,
    );
    if (!exists) {
      if (
        runningConfig.config_id &&
        configList.value.some((item) => item.id === runningConfig.config_id)
      ) {
        currentConfigId.value = runningConfig.config_id;
      } else {
        currentConfigId.value = configList.value[0].id;
      }
    }
    await selectConfig(currentConfigId.value);
  } else {
    currentConfigId.value = null;
    currentConfigDetail.value = "";
    rawJson.log = "";
    rawJson.dns = "";
    rawJson.inbounds = "";
    rawJson.outbounds = "";
    rawJson.route = "";
    rawJson.experimental = "";

    parseLog({});
    parseDns({});
    parseInbounds([]);
    parseOutbounds([]);
    parseRoute({});
    parseExperimental({});
  }
};

const setSectionMode = (section, mode) => {
  if (sectionModes[section] === mode) return;

  if (mode === "visual") {
    try {
      const parsed = JSON.parse(rawJson[section]);
      if (section === "log") parseLog(parsed);
      else if (section === "dns") parseDns(parsed);
      else if (section === "inbounds") parseInbounds(parsed);
      else if (section === "outbounds") parseOutbounds(parsed);
      else if (section === "route") parseRoute(parsed);
      else if (section === "experimental") parseExperimental(parsed);
      sectionModes[section] = mode;
    } catch (e) {
      showToast(
        `JSON 语法解析错误: ${e.message}。请在源码模式下修复再切换。`,
        "danger",
      );
    }
  } else {
    let obj = {};
    if (section === "log") obj = serializeLog();
    else if (section === "dns") obj = serializeDns();
    else if (section === "inbounds") obj = serializeInbounds();
    else if (section === "outbounds") obj = serializeOutbounds();
    else if (section === "route") obj = serializeRoute();
    else if (section === "experimental") obj = serializeExperimental();

    rawJson[section] = JSON.stringify(obj, null, 2);
    sectionModes[section] = mode;
  }
};

const saveVueConfigSection = async (section) => {
  let finalObj = null;

  if (sectionModes[section] === "visual") {
    if (section === "log") finalObj = serializeLog();
    else if (section === "dns") finalObj = serializeDns();
    else if (section === "inbounds") finalObj = serializeInbounds();
    else if (section === "outbounds") finalObj = serializeOutbounds();
    else if (section === "route") finalObj = serializeRoute();
    else if (section === "experimental") finalObj = serializeExperimental();
  } else {
    try {
      finalObj = JSON.parse(rawJson[section]);
    } catch (e) {
      showToast(`JSON 语法错误: ${e.message}`, "danger");
      return;
    }
  }

  const valResult = validateData(section, finalObj);
  if (!valResult.valid) {
    showToast(`配置校验失败: ${valResult.errors}`, "danger");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/config/base`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ section, content: finalObj }),
    });

    if (res.ok) {
      showToast(`模板 [${section}] 段保存成功`);
      await loadAllSections();
    } else {
      const errText = await res.text();
      showToast(`保存 [${section}] 失败: ${errText || "接口错误"}`, "danger");
    }
  } catch {
    showToast("保存配置网络请求发生错误", "danger");
  }
};

const getAddressExample = (type) => {
  switch (type) {
    case "udp":
    case "tcp":
      return "223.5.5.5";
    case "https":
      return "https://223.5.5.5/dns-query";
    case "tls":
      return "223.5.5.5";
    case "quic":
      return "quic://dns.adguard-dns.com";
    default:
      return "";
  }
};

const getAddressPlaceholder = (type) => {
  switch (type) {
    case "udp":
    case "tcp":
      return "例如: 223.5.5.5";
    case "https":
      return "例如: https://223.5.5.5/dns-query";
    case "tls":
      return "例如: 223.5.5.5 或 dns.google";
    case "quic":
      return "例如: quic://dns.adguard-dns.com";
    case "local":
      return "本地连接，无需配置地址";
    case "fakeip":
      return "FakeIP 模式，无需地址";
    default:
      return "请输入服务器地址";
  }
};

const onDnsServerTypeChange = (srv) => {
  if (srv.type === "local") {
    delete srv.server;
    delete srv.detour;
    delete srv.inet4_range;
    delete srv.inet6_range;
  } else if (srv.type === "fakeip") {
    delete srv.server;
    delete srv.detour;
    srv.inet4_range = srv.inet4_range || "198.18.0.0/15";
    srv.inet6_range = srv.inet6_range || "fc00::/18";
  } else {
    srv.server = getAddressExample(srv.type);
    delete srv.inet4_range;
    delete srv.inet6_range;
  }
};

const onModalDnsServerTypeChange = () => {
  if (itemModal.itemData.type === "local") {
    delete itemModal.itemData.server;
    delete itemModal.itemData.detour;
    delete itemModal.itemData.inet4_range;
    delete itemModal.itemData.inet6_range;
  } else if (itemModal.itemData.type === "fakeip") {
    delete itemModal.itemData.server;
    delete itemModal.itemData.detour;
    itemModal.itemData.inet4_range =
      itemModal.itemData.inet4_range || "198.18.0.0/15";
    itemModal.itemData.inet6_range =
      itemModal.itemData.inet6_range || "fc00::/18";
  } else {
    itemModal.itemData.server = getAddressExample(itemModal.itemData.type);
    delete itemModal.itemData.inet4_range;
    delete itemModal.itemData.inet6_range;
  }
};

const onInboundTypeChange = (inb) => {
  if (inb.type === "tun") {
    inb.interface_name = inb.interface_name || "tun0";
    inb.stack = inb.stack || "gvisor";
    inb.auto_route = inb.auto_route !== false;
    delete inb.listen;
    delete inb.listen_port;
  } else {
    inb.listen = inb.listen || "::";
    inb.listen_port = inb.listen_port || 2334;
    delete inb.interface_name;
    delete inb.stack;
    delete inb.auto_route;
    delete inb.strict_route;
    delete inb.mtu;
    delete inb.auto_redirect;
  }
};

const onRuleSetTypeChange = (rs) => {
  if (rs.type === "remote") {
    rs.url = rs.url || "";
    rs.format = rs.format || "binary";
    rs.download_detour =
      rs.download_detour ||
      (allOutboundTags.value.includes("proxy")
        ? "proxy"
        : allOutboundTags.value[0] || "direct");
    rs.update_interval = rs.update_interval || "1d";
    delete rs.path;
  } else {
    rs.path = rs.path || "";
    delete rs.url;
    delete rs.download_detour;
    delete rs.update_interval;
    delete rs.format;
  }
};

const onRouteRuleActionChange = () => {
  if (itemModal.itemData.action !== "route" && itemModal.itemData.action) {
    delete itemModal.itemData.outbound;
  } else {
    itemModal.itemData.outbound =
      itemModal.itemData.outbound || allOutboundTags.value[0] || "direct";
  }
};

const addDnsServer = () => {
  const newItem = {
    tag: "dns-server-" + (configData.dns.servers.length + 1),
    type: "udp",
    server: "223.5.5.5",
    detour: "",
  };
  editItem(newItem, "dns_server", (parsed) => {
    configData.dns.servers.push(parsed);
  });
};

const addDnsRule = () => {
  const defaultServer =
    configData.dns.servers.length > 0
      ? configData.dns.servers[0].tag
      : "local-dns";
  const newItem = {
    server: defaultServer,
    type: "logical",
    mode: "or",
    rules: [],
  };
  editItem(newItem, "dns_rule", (parsed) => {
    configData.dns.rules.push(parsed);
  });
};

const addInbound = () => {
  const newItem = {
    tag: "inbound-" + (configData.inbounds.length + 1),
    type: "mixed",
    listen: "::",
    listen_port: 2334,
  };
  editItem(newItem, "inbound", (parsed) => {
    configData.inbounds.push(parsed);
  });
};

const addRouteRule = () => {
  const newItem = {
    outbound: allOutboundTags.value.includes("proxy")
      ? "proxy"
      : allOutboundTags.value[0] || "",
    domain_suffix: [],
  };
  editItem(newItem, "route_rule", (parsed) => {
    configData.route.rules.push(parsed);
  });
};

const addRuleSet = () => {
  const newItem = {
    tag: "ruleset-" + (configData.route.rule_set.length + 1),
    type: "remote",
    format: "binary",
    url: "",
    download_detour: allOutboundTags.value.includes("proxy")
      ? "proxy"
      : allOutboundTags.value[0] || "",
    update_interval: "1d",
  };
  editItem(newItem, "route_ruleset", (parsed) => {
    configData.route.rule_set.push(parsed);
  });
};

const moveItem = (arr, index, dir) => {
  const target = index + dir;
  if (target >= 0 && target < arr.length) {
    const temp = arr[index];
    arr[index] = arr[target];
    arr[target] = temp;
  }
};

const editItem = (item, type, onSaveCallback, idx = -1) => {
  itemModal.itemType = type;
  itemModal.mode = "visual";
  itemModal.error = "";
  itemModal.onSave = onSaveCallback;
  itemModal.idx = idx;

  if (type === "dns_server") itemModal.title = "编辑 DNS 服务器";
  else if (type === "dns_rule") itemModal.title = "编辑 DNS 分流规则";
  else if (type === "inbound") itemModal.title = "编辑入站连接 (Inbound)";
  else if (type === "outbound") itemModal.title = "编辑出站连接 (Outbound)";
  else if (type === "route_rule") itemModal.title = "编辑分流路由规则";
  else if (type === "route_ruleset") itemModal.title = "编辑规则集 (RuleSet)";

  itemModal.itemData = JSON.parse(JSON.stringify(item));

  if (["route_rule", "dns_rule"].includes(type)) {
    if (itemModal.itemData.type === "logical") {
      itemModal.routeRuleLogic = itemModal.itemData.mode || "or";
    } else {
      itemModal.routeRuleLogic = "standard";
    }
  }

  if (type === "dns_rule") {
    if (itemModal.itemData.type === "logical") {
      itemModal.dnsRuleType = "logical";
    } else if (itemModal.itemData.rule_set || itemModal.itemData.geosite) {
      itemModal.dnsRuleType = "rule_set";
    } else if (itemModal.itemData.domain_suffix) {
      itemModal.dnsRuleType = "domain_suffix";
    } else {
      const hasOtherFields = [
        "domain",
        "domain_keyword",
        "domain_regex",
        "geoip",
        "ip_cidr",
        "port",
        "inbound",
      ].some(
        (f) =>
          itemModal.itemData[f] !== undefined && itemModal.itemData[f] !== null,
      );
      if (hasOtherFields) {
        itemModal.dnsRuleType = "advanced";
      } else {
        itemModal.dnsRuleType = "domain_suffix";
      }
    }
  }

  const arrayFields = [
    "domain",
    "domain_suffix",
    "domain_keyword",
    "domain_regex",
    "geosite",
    "geoip",
    "ip_cidr",
    "port",
    "inbound",
    "rule_set",
    "protocol",
    "outbounds",
  ];
  arrayFields.forEach((f) => {
    itemModal.tempFields[f] = "";
  });

  arrayFields.forEach((f) => {
    if (itemModal.itemData[f] !== undefined && itemModal.itemData[f] !== null) {
      const val = itemModal.itemData[f];
      itemModal.tempFields[f] = Array.isArray(val)
        ? val.join("\n")
        : String(val);
    }
  });

  if (
    ["route_rule", "dns_rule"].includes(type) &&
    itemModal.itemData.type === "logical" &&
    Array.isArray(itemModal.itemData.rules)
  ) {
    itemModal.itemData.rules.forEach((subRule) => {
      arrayFields.forEach((f) => {
        if (subRule[f] !== undefined && subRule[f] !== null) {
          const val = subRule[f];
          const existing = itemModal.tempFields[f]
            ? itemModal.tempFields[f].split("\n")
            : [];
          const added = Array.isArray(val) ? val : [String(val)];
          const combined = [...new Set([...existing, ...added])].filter(
            Boolean,
          );
          itemModal.tempFields[f] = combined.join("\n");
        }
      });
      if (subRule.port !== undefined && subRule.port !== null) {
        const val = subRule.port;
        const existing = itemModal.tempFields.port
          ? itemModal.tempFields.port.split("\n")
          : [];
        const added = Array.isArray(val) ? val : [String(val)];
        const combined = [...new Set([...existing, ...added])].filter(Boolean);
        itemModal.tempFields.port = combined.join("\n");
      }
    });
  }

  if (type === "inbound" && !itemModal.itemData.type) {
    itemModal.itemData.type = "mixed";
  }
  if (type === "dns_server" && !itemModal.itemData.type) {
    itemModal.itemData.type = "udp";
  }
  if (type === "route_ruleset" && !itemModal.itemData.type) {
    itemModal.itemData.type = "remote";
  }
  if (type === "outbound") {
    if (!itemModal.itemData.type) {
      itemModal.itemData.type = "direct";
    }
    if (
      itemModal.itemData.server_port !== undefined &&
      itemModal.itemData.port === undefined
    ) {
      itemModal.itemData.port = itemModal.itemData.server_port;
    }
    if (!itemModal.itemData.tls) {
      itemModal.itemData.tls = {
        enabled: false,
        server_name: "",
        insecure: false,
      };
    }
    if (!itemModal.itemData.tls.reality) {
      itemModal.itemData.tls.reality = {
        enabled: false,
        public_key: "",
        short_id: "",
      };
    }
    if (!itemModal.itemData.transport) {
      itemModal.itemData.transport = { type: "", path: "", service_name: "" };
    }
  }

  itemModal.jsonText = JSON.stringify(itemModal.itemData, null, 2);
  itemModal.show = true;
};

const syncVisualToItemData = () => {
  const arrayFields = [
    "domain",
    "domain_suffix",
    "domain_keyword",
    "domain_regex",
    "geosite",
    "geoip",
    "ip_cidr",
    "inbound",
    "rule_set",
    "protocol",
    "outbounds",
  ];

  if (itemModal.itemType === "dns_rule") {
    if (itemModal.itemData.client_subnet !== undefined) {
      if (typeof itemModal.itemData.client_subnet === "string") {
        itemModal.itemData.client_subnet =
          itemModal.itemData.client_subnet.trim();
      }
      if (!itemModal.itemData.client_subnet) {
        delete itemModal.itemData.client_subnet;
      }
    }
  }

  if (
    ["route_rule", "dns_rule"].includes(itemModal.itemType) &&
    itemModal.routeRuleLogic &&
    itemModal.routeRuleLogic !== "standard"
  ) {
    itemModal.itemData.type = "logical";
    itemModal.itemData.mode = itemModal.routeRuleLogic;

    const rules = [];
    arrayFields.forEach((f) => {
      delete itemModal.itemData[f];
      if (
        itemModal.tempFields[f] !== undefined &&
        itemModal.tempFields[f] !== null
      ) {
        const val = itemModal.tempFields[f].trim();
        if (val) {
          const list = val
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (list.length > 0) {
            rules.push({ [f]: list });
          }
        }
      }
    });

    delete itemModal.itemData.port;
    if (itemModal.tempFields.port) {
      const val = itemModal.tempFields.port.trim();
      if (val) {
        const list = val
          .split(/[\n,]+/)
          .map((s) => parseInt(s.trim()))
          .filter((n) => !isNaN(n));
        if (list.length > 0) {
          rules.push({ port: list });
        }
      }
    }

    itemModal.itemData.rules = rules;
  } else {
    if (["route_rule", "dns_rule"].includes(itemModal.itemType)) {
      delete itemModal.itemData.type;
      delete itemModal.itemData.mode;
      delete itemModal.itemData.rules;
    }

    arrayFields.forEach((f) => {
      if (
        itemModal.tempFields[f] !== undefined &&
        itemModal.tempFields[f] !== null
      ) {
        const val = itemModal.tempFields[f].trim();
        if (val) {
          itemModal.itemData[f] = val
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        } else {
          delete itemModal.itemData[f];
        }
      }
    });

    if (itemModal.tempFields.port) {
      const val = itemModal.tempFields.port.trim();
      if (val) {
        if (itemModal.itemType === "outbound") {
          itemModal.itemData.port = parseInt(val);
        } else {
          itemModal.itemData.port = val
            .split(/[\n,]+/)
            .map((s) => parseInt(s.trim()))
            .filter((n) => !isNaN(n));
        }
      } else {
        delete itemModal.itemData.port;
      }
    }
  }

  // Type compatibility cleanup
  if (
    itemModal.itemType === "dns_server" &&
    itemModal.itemData.type === "local"
  ) {
    delete itemModal.itemData.server;
    delete itemModal.itemData.detour;
  }
  if (itemModal.itemType === "inbound") {
    if (itemModal.itemData.type === "tun") {
      delete itemModal.itemData.listen;
      delete itemModal.itemData.listen_port;
    } else {
      delete itemModal.itemData.interface_name;
      delete itemModal.itemData.stack;
      delete itemModal.itemData.auto_route;
      delete itemModal.itemData.strict_route;
      delete itemModal.itemData.mtu;
      delete itemModal.itemData.auto_redirect;
    }
  }
  if (itemModal.itemType === "route_ruleset") {
    if (itemModal.itemData.type === "local") {
      delete itemModal.itemData.url;
      delete itemModal.itemData.download_detour;
      delete itemModal.itemData.update_interval;
      delete itemModal.itemData.format;
    } else {
      delete itemModal.itemData.path;
    }
  }
  if (itemModal.itemType === "outbound") {
    if (["direct", "block", "dns"].includes(itemModal.itemData.type)) {
      delete itemModal.itemData.server;
      delete itemModal.itemData.port;
      delete itemModal.itemData.uuid;
      delete itemModal.itemData.password;
      delete itemModal.itemData.method;
      delete itemModal.itemData.outbounds;
      delete itemModal.itemData.url;
      delete itemModal.itemData.interval;
      delete itemModal.itemData.tls;
      delete itemModal.itemData.transport;
      delete itemModal.itemData.up_mbps;
      delete itemModal.itemData.down_mbps;
    } else if (["selector", "urltest"].includes(itemModal.itemData.type)) {
      delete itemModal.itemData.server;
      delete itemModal.itemData.port;
      delete itemModal.itemData.uuid;
      delete itemModal.itemData.password;
      delete itemModal.itemData.method;
      delete itemModal.itemData.tls;
      delete itemModal.itemData.transport;
      delete itemModal.itemData.up_mbps;
      delete itemModal.itemData.down_mbps;
      if (itemModal.itemData.type !== "urltest") {
        delete itemModal.itemData.url;
        delete itemModal.itemData.interval;
      }
    } else {
      delete itemModal.itemData.outbounds;
      delete itemModal.itemData.url;
      delete itemModal.itemData.interval;

      if (itemModal.itemData.port) {
        itemModal.itemData.port = parseInt(itemModal.itemData.port);
        itemModal.itemData.server_port = itemModal.itemData.port;
      }

      if (!["vless", "vmess", "tuic"].includes(itemModal.itemData.type)) {
        delete itemModal.itemData.uuid;
      }
      if (
        !["trojan", "shadowsocks", "hysteria2", "tuic"].includes(
          itemModal.itemData.type,
        )
      ) {
        delete itemModal.itemData.password;
      }
      if (itemModal.itemData.type !== "shadowsocks") {
        delete itemModal.itemData.method;
      }

      if (itemModal.itemData.type === "hysteria2") {
        if (itemModal.itemData.up_mbps) {
          itemModal.itemData.up_mbps = parseInt(itemModal.itemData.up_mbps);
        } else {
          delete itemModal.itemData.up_mbps;
        }
        if (itemModal.itemData.down_mbps) {
          itemModal.itemData.down_mbps = parseInt(itemModal.itemData.down_mbps);
        } else {
          delete itemModal.itemData.down_mbps;
        }
      } else {
        delete itemModal.itemData.up_mbps;
        delete itemModal.itemData.down_mbps;
      }

      if (itemModal.itemData.tls && itemModal.itemData.tls.enabled) {
        if (
          itemModal.itemData.tls.reality &&
          itemModal.itemData.tls.reality.enabled
        ) {
          // keep reality
        } else {
          delete itemModal.itemData.tls.reality;
        }
      } else {
        delete itemModal.itemData.tls;
      }

      if (itemModal.itemData.transport && itemModal.itemData.transport.type) {
        if (["ws", "http"].includes(itemModal.itemData.transport.type)) {
          delete itemModal.itemData.transport.service_name;
        } else if (itemModal.itemData.transport.type === "grpc") {
          delete itemModal.itemData.transport.path;
        }
      } else {
        delete itemModal.itemData.transport;
      }
    }
  }
};

const setItemModalMode = (mode) => {
  if (itemModal.mode === mode) return;

  if (mode === "visual") {
    try {
      const parsed = JSON.parse(itemModal.jsonText);
      if (itemModal.itemType === "outbound") {
        if (parsed.server_port !== undefined && parsed.port === undefined) {
          parsed.port = parsed.server_port;
        }
        if (!parsed.tls) {
          parsed.tls = { enabled: false, server_name: "", insecure: false };
        }
        if (!parsed.tls.reality) {
          parsed.tls.reality = { enabled: false, public_key: "", short_id: "" };
        }
        if (!parsed.transport) {
          parsed.transport = { type: "", path: "", service_name: "" };
        }
      }
      if (itemModal.itemType === "dns_rule") {
        if (parsed.type === "logical") {
          itemModal.routeRuleLogic = parsed.mode || "or";
        } else {
          itemModal.routeRuleLogic = "standard";
        }
      }
      itemModal.itemData = parsed;

      const arrayFields = [
        "domain",
        "domain_suffix",
        "domain_keyword",
        "domain_regex",
        "geosite",
        "geoip",
        "ip_cidr",
        "port",
        "inbound",
        "rule_set",
        "protocol",
        "outbounds",
      ];
      arrayFields.forEach((f) => {
        itemModal.tempFields[f] = "";
        if (parsed[f] !== undefined && parsed[f] !== null) {
          itemModal.tempFields[f] = Array.isArray(parsed[f])
            ? parsed[f].join("\n")
            : String(parsed[f]);
        }
      });
      itemModal.mode = mode;
      itemModal.error = "";
    } catch (e) {
      itemModal.error = `JSON 语法解析错误: ${e.message}。请在源码模式下修复再切换。`;
    }
  } else {
    syncVisualToItemData();
    const cloned = JSON.parse(JSON.stringify(itemModal.itemData));
    if (itemModal.itemType === "outbound" && cloned.port !== undefined) {
      cloned.server_port = parseInt(cloned.port);
      delete cloned.port;
    }
    itemModal.jsonText = JSON.stringify(cloned, null, 2);
    itemModal.mode = mode;
  }
};

const getListByType = (type) => {
  if (type === "dns_server") return configData.dns.servers;
  if (type === "dns_rule") return configData.dns.rules;
  if (type === "inbound") return configData.inbounds;
  if (type === "outbound") return configData.outbounds;
  if (type === "route_rule") return configData.route.rules;
  if (type === "route_ruleset") return configData.route.rule_set;
  return null;
};

const addBasicOutbound = () => {
  const newItem = {
    tag: `outbound-${Date.now() % 10000}`,
    type: "direct",
  };
  editItem(newItem, "outbound", (parsed) => {
    configData.outbounds.push(parsed);
  });
};

const addProxyOutbound = () => {
  const newItem = {
    tag: `proxy-${Date.now() % 10000}`,
    type: "vmess",
    server: "",
    port: 443,
  };
  editItem(newItem, "outbound", (parsed) => {
    configData.outbounds.push(parsed);
  });
};

const confirmRemoveOutbound = async (idx) => {
  const outb = configData.outbounds[idx];
  if (!outb) return;

  const confirmed = await confirmDialog(
    `确定要删除出站连接 "${outb.tag}" 吗？`,
    { isDanger: true },
  );
  if (confirmed) {
    configData.outbounds.splice(idx, 1);
    showToast(`已删除出站连接: ${outb.tag}`);
  }
};

const expandGroupImport = (group) => {
  if (!configData.outbounds) {
    configData.outbounds = [];
  }

  // 检查是否已存在
  const exists = configData.outbounds.some((o) => o.tag === group.tag);
  if (exists) {
    showToast(`出站组 "${group.tag}" 已存在于配置中`, "warning");
    return false;
  }

  // 解析 static_nodes（tag 字符串数组）
  let nodeTags = [];
  try {
    nodeTags = JSON.parse(group.static_nodes || "[]");
    if (!Array.isArray(nodeTags)) nodeTags = [];
  } catch {
    nodeTags = [];
  }

  // 深拷贝所有引用的节点（且当前配置中不存在）
  let addedCount = 0;
  for (const tag of nodeTags) {
    if (configData.outbounds.some((o) => o.tag === tag)) continue;
    const node = nodePoolCache.value.find((n) => n.tag === tag);
    if (node) {
      try {
        const parsed = JSON.parse(node.raw_json);
        if (parsed && typeof parsed === "object") {
          parsed.tag = node.tag;
          configData.outbounds.push(parsed);
          addedCount++;
        }
      } catch {
        // 忽略解析失败的节点
      }
    }
    // 若 tag 是另一个出站组的 tag，保留引用但不展开（用户可单独导入）
  }

  // 添加组本身（完整设置）
  const groupOutbound = {
    type: group.group_type,
    tag: group.tag,
    outbounds: nodeTags,
  };
  if (group.group_type === "urltest") {
    groupOutbound.url = group.url || "http://cp.cloudflare.com/generate_204";
    groupOutbound.interval = group.interval || "3m";
    groupOutbound.tolerance =
      group.tolerance !== null && group.tolerance !== undefined
        ? group.tolerance
        : 50;
  }
  configData.outbounds.push(groupOutbound);

  showToast(
    `已导入出站组 "${group.tag}" 及 ${addedCount} 个节点（配置已自包含，DB 变更不再影响）`,
  );
  return true;
};

const openNodePoolImport = async () => {
  nodePoolModal.searchQuery = "";
  nodePoolModal.selectedIds = [];
  try {
    const res = await fetch(`${API_BASE}/api/nodes?limit=100000`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      nodePoolModal.nodes = data.nodes || [];
      nodePoolModal.show = true;
    } else {
      showToast("获取节点列表失败", "danger");
    }
  } catch {
    showToast("获取节点列表网络请求失败", "danger");
  }
};

const confirmNodePoolImport = () => {
  const count = nodePoolModal.selectedIds.length;
  if (count === 0) {
    showToast("未选择任何节点", "warning");
    return;
  }

  let importedCount = 0;
  let skippedCount = 0;

  nodePoolModal.selectedIds.forEach((id) => {
    const node = nodePoolModal.nodes.find((n) => n.id === id);
    if (node) {
      if (configData.outbounds.some((o) => o.tag === node.tag)) {
        skippedCount++;
        return;
      }
      try {
        const parsed = JSON.parse(node.raw_json);
        if (!parsed || typeof parsed !== "object") {
          throw new Error("invalid raw_json");
        }
        parsed.tag = node.tag;
        configData.outbounds.push(parsed);
      } catch {
        configData.outbounds.push({
          tag: node.tag,
          type: "shadowsocks",
          server: "127.0.0.1",
          port: 8388,
        });
      }
      importedCount++;
    }
  });

  if (skippedCount > 0) {
    showToast(
      `已成功导入 ${importedCount} 个节点（另有 ${skippedCount} 个同名 tag 节点已被跳过）`,
      "warning",
    );
  } else {
    showToast(`已成功导入 ${importedCount} 个节点到出站列表`);
  }
  nodePoolModal.show = false;
};

const importGroup = (group) => {
  // 保持弹窗打开，允许用户连续导入多个组
  expandGroupImport(group);
  if (groupImportModal.selectedTags) {
    groupImportModal.selectedTags = groupImportModal.selectedTags.filter(
      (t) => t !== group.tag,
    );
  }
};

const saveItem = async () => {
  itemModal.error = "";

  if (itemModal.mode === "visual") {
    syncVisualToItemData();
  } else {
    try {
      const parsed = JSON.parse(itemModal.jsonText);
      itemModal.itemData = parsed;
    } catch (e) {
      itemModal.error = `JSON 语法错误: ${e.message}`;
      return;
    }
  }

  // 1. JSON Schema Validate
  const check = validateData(itemModal.itemType, itemModal.itemData);
  if (!check.valid) {
    itemModal.error = `格式错误: ${check.errors}`;
    showToast(`格式错误: ${check.errors}`, "danger");
    return;
  }

  // 2. sing-box Validate
  const list = getListByType(itemModal.itemType);
  let originalListBackup = null;
  let tempState = null;
  if (list) {
    originalListBackup = [...list];
    if (itemModal.idx >= 0) {
      list[itemModal.idx] = JSON.parse(JSON.stringify(itemModal.itemData));
    } else {
      list.push(JSON.parse(JSON.stringify(itemModal.itemData)));
    }
  }
  try {
    tempState = getSerializedState();
  } catch (e) {
    itemModal.error = `配置序列化失败: ${e.message}`;
    return;
  } finally {
    if (list && originalListBackup) {
      list.length = 0;
      list.push(...originalListBackup);
    }
  }

  itemModal.validating = true;
  try {
    const res = await fetch(`${API_BASE}/api/config/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify(tempState),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.command_missing) {
        showToast(
          "系统未检测到 sing-box 命令，已跳过完整性校验，请自行导出配置进行验证。",
          "warning",
        );
      } else if (!result.valid) {
        itemModal.error = `sing-box 校验失败: ${result.error}`;
        showToast(`sing-box 校验失败: ${result.error}`, "danger");
        return;
      } else {
        showToast("sing-box 校验成功！", "success");
      }
    } else {
      const errText = await res.text();
      showToast(`校验服务出错: ${errText || "接口错误"}`, "danger");
      return;
    }
  } catch {
    showToast("连接校验服务发生网络错误", "danger");
    return;
  } finally {
    itemModal.validating = false;
  }

  if (itemModal.itemType === "route_rule") {
    const newItems = extractCriteriaFromObj(itemModal.itemData);
    const existingDuplicates = [];

    if (Array.isArray(configData.route?.rules)) {
      configData.route.rules.forEach((rule, idx) => {
        if (idx === itemModal.idx) return;
        const outbound = rule.outbound || rule.action || "未配置出站";
        const existingItems = extractCriteriaFromObj(rule);

        newItems.forEach((newItem) => {
          const match = existingItems.find(
            (e) =>
              e.category === newItem.category &&
              e.normValue === newItem.normValue,
          );
          if (match) {
            existingDuplicates.push({
              typeLabel: newItem.typeLabel,
              value: newItem.rawValue,
              existingRuleIndex: idx + 1,
              existingOutbound: outbound,
            });
          }
        });
      });
    }

    if (existingDuplicates.length > 0) {
      const dupDescs = existingDuplicates
        .map(
          (d) =>
            `${d.typeLabel} '${d.value}' (已存在于规则 #${d.existingRuleIndex} -> ${d.existingOutbound})`,
        )
        .join("；");
      showToast(`提示：已存在重复规则项：${dupDescs}`, "warning");
    }
  }

  if (itemModal.onSave) {
    itemModal.onSave(JSON.parse(JSON.stringify(itemModal.itemData)));
  }
  itemModal.show = false;
};

// Real-time validation watcher
watch(
  () => [
    itemModal.itemData,
    itemModal.tempFields,
    itemModal.jsonText,
    itemModal.mode,
    itemModal.routeRuleLogic,
  ],
  () => {
    if (itemModal.show) {
      validateItemModal();
    }
  },
  { deep: true },
);

const validateItemModal = () => {
  let data = {};
  if (itemModal.mode === "visual") {
    let tempObj = JSON.parse(JSON.stringify(itemModal.itemData));
    const arrayFields = [
      "domain",
      "domain_suffix",
      "domain_keyword",
      "domain_regex",
      "geosite",
      "geoip",
      "ip_cidr",
      "inbound",
      "rule_set",
      "protocol",
    ];
    arrayFields.forEach((f) => {
      if (
        itemModal.tempFields[f] !== undefined &&
        itemModal.tempFields[f] !== null
      ) {
        const val = itemModal.tempFields[f].trim();
        if (val) {
          tempObj[f] = val
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        } else {
          delete tempObj[f];
        }
      }
    });
    if (itemModal.tempFields.port) {
      const val = itemModal.tempFields.port.trim();
      if (val) {
        tempObj.port = val
          .split(/[\n,]+/)
          .map((s) => parseInt(s.trim()))
          .filter((n) => !isNaN(n));
      } else {
        delete tempObj.port;
      }
    }
    if (itemModal.itemType === "outbound" && tempObj.port !== undefined) {
      tempObj.server_port = parseInt(tempObj.port);
      delete tempObj.port;
    }
    if (
      ["route_rule", "dns_rule"].includes(itemModal.itemType) &&
      itemModal.routeRuleLogic &&
      itemModal.routeRuleLogic !== "standard"
    ) {
      tempObj.type = "logical";
      tempObj.mode = itemModal.routeRuleLogic;
      const rules = [];
      arrayFields.forEach((f) => {
        if (tempObj[f]) {
          rules.push({ [f]: tempObj[f] });
          delete tempObj[f];
        }
      });
      if (tempObj.port) {
        rules.push({ port: tempObj.port });
        delete tempObj.port;
      }
      tempObj.rules = rules;
    }
    data = tempObj;
  } else {
    try {
      data = JSON.parse(itemModal.jsonText);
    } catch (e) {
      itemModal.error = `JSON 语法错误: ${e.message}`;
      return false;
    }
  }

  const check = validateData(itemModal.itemType, data);
  if (!check.valid) {
    itemModal.error = check.errors;
    return false;
  } else {
    if (["outbound", "inbound"].includes(itemModal.itemType) && data.tag) {
      const targetSec =
        itemModal.itemType === "outbound" ? "outbounds" : "inbounds";
      const list = configData[targetSec] || [];
      const isDuplicate = list.some(
        (item, i) => i !== itemModal.idx && item.tag === data.tag,
      );
      if (isDuplicate) {
        itemModal.error = `标签 (tag) "${data.tag}" 重复，列表中已存在相同的 tag`;
        return false;
      }
    }
    itemModal.error = "";
    return true;
  }
};

const getSerializedState = () => {
  const state = {};
  sections.forEach((sec) => {
    if (sectionModes[sec] === "visual") {
      if (sec === "log") state[sec] = serializeLog();
      else if (sec === "dns") state[sec] = serializeDns();
      else if (sec === "inbounds") state[sec] = serializeInbounds();
      else if (sec === "outbounds") state[sec] = serializeOutbounds();
      else if (sec === "route") state[sec] = serializeRoute();
      else if (sec === "experimental") state[sec] = serializeExperimental();
    } else {
      try {
        state[sec] = JSON.parse(rawJson[sec]);
      } catch {
        state[sec] = null;
      }
    }
  });
  return state;
};

const previewGeneratedConfig = async () => {
  previewModal.show = true;
  previewModal.loading = true;
  previewModal.error = "";
  previewModal.content = "";
  previewModal.jsonObject = null;

  try {
    const state = getSerializedState();
    const res = await fetch(`${API_BASE}/api/config/generated`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify(state),
    });

    if (res.ok) {
      const data = await res.json();
      const ordered = {};
      const order = [
        "log",
        "dns",
        "inbounds",
        "outbounds",
        "route",
        "experimental",
      ];
      order.forEach((k) => {
        if (data[k] !== undefined) ordered[k] = data[k];
      });
      Object.keys(data).forEach((k) => {
        if (!order.includes(k)) ordered[k] = data[k];
      });
      previewModal.jsonObject = ordered;
      previewModal.content = JSON.stringify(ordered, null, 2);
    } else {
      const errText = await res.text();
      previewModal.error = errText || "生成配置失败";
    }
  } catch (err) {
    previewModal.error = "网络请求失败: " + err.message;
  } finally {
    previewModal.loading = false;
  }
};

const copyPreviewToClipboard = () => {
  if (!previewModal.content) return;
  navigator.clipboard
    .writeText(previewModal.content)
    .then(() => {
      showToast("配置已复制到剪贴板");
    })
    .catch(() => {
      showToast("复制失败，请手动选择复制", "danger");
    });
};

const exportPreviewFile = () => {
  if (!previewModal.content) return;
  const blob = new Blob([previewModal.content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `singbox-config-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("配置已导出为 JSON 文件");
};

const getRunningConfigName = (id) => {
  const cfg = configList.value.find((item) => item.id === id);
  return cfg ? cfg.detail || "未命名配置" : "未知配置";
};

const loadRunningConfigSettings = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/config/running`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      runningConfig.config_id = data.config_id;
      runningConfig.config_path = data.config_path;
      runningConfig.restart_cmd = data.restart_cmd;
      runningConfig.has_sudo_pass = data.has_sudo_pass;
    }
  } catch (e) {
    console.error("加载运行设置失败", e);
  }
};

const copyLogConsole = () => {
  if (!runningConfigModal.logs || runningConfigModal.logs.length === 0) return;
  const content = runningConfigModal.logs
    .map(
      (l) =>
        `[${l.timestamp}] [${l.step}] [${(l.status || "").toUpperCase()}] ${l.message}`,
    )
    .join("\n");
  navigator.clipboard.writeText(content);
  showToast("执行日志已复制到剪贴板");
};

const openRunningConfigModal = () => {
  runningConfigForm.config_id = runningConfig.config_id;
  runningConfigForm.config_path = runningConfig.config_path;
  runningConfigForm.restart_cmd = runningConfig.restart_cmd;
  runningConfigForm.sudo_pass = "";
  runningConfigModal.viewMode = "form";
  runningConfigModal.status = "idle";
  runningConfigModal.logs = [];
  runningConfigModal.commandOutput = "";
  runningConfigModal.message = "";
  runningConfigModal.show = true;
};

const isCurrentConfigRunning = computed(() => {
  return (
    currentConfigId.value !== null &&
    currentConfigId.value !== undefined &&
    runningConfig.config_id !== null &&
    runningConfig.config_id !== undefined &&
    String(currentConfigId.value) === String(runningConfig.config_id)
  );
});

const triggerUpdateFromDetail = async () => {
  if (!isCurrentConfigRunning.value) return;

  let fullData;
  try {
    fullData = getFullConfigData();
  } catch {
    return;
  }
  if (!(await validateFullConfigWithSingbox(fullData))) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/config/history/${currentConfigId.value}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify({
          detail: currentConfigDetail.value || "未命名配置",
          content: fullData,
        }),
      },
    );

    if (res.ok) {
      showToast("配置已保存，开始执行运行更新...");
      await loadAllSections();
    } else {
      const errText = await res.text();
      showToast(`保存失败，已中断更新: ${errText || "接口错误"}`, "danger");
      return;
    }
  } catch {
    showToast("保存配置网络请求失败，已中断更新", "danger");
    return;
  }

  openRunningConfigModal();
  await saveRunningConfigSettings(true);
};

const closeRunningConfigModal = () => {
  if (runningConfigModal.saving) return;
  runningConfigModal.show = false;
};

const scrollToLogBottom = () => {
  nextTick(() => {
    if (logConsoleRef.value) {
      logConsoleRef.value.scrollTop = logConsoleRef.value.scrollHeight;
    }
  });
};

const saveRunningConfigSettings = async (executeUpdate) => {
  if (executeUpdate) {
    if (!runningConfigForm.config_id) {
      showToast("请先选择要运行的配置", "danger");
      return;
    }
    if (!runningConfigForm.config_path.trim()) {
      showToast("配置文件覆盖位置不能为空", "danger");
      return;
    }

    runningConfigModal.viewMode = "log";
    runningConfigModal.saving = true;
    runningConfigModal.status = "running";
    runningConfigModal.logs = [
      {
        step: "初始化",
        status: "info",
        message: "正在初始化运行配置更新流程...",
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      },
    ];
    runningConfigModal.commandOutput = "";
    runningConfigModal.message = "";
    scrollToLogBottom();
  } else {
    runningConfigModal.saving = true;
  }

  try {
    const res = await fetch(`${API_BASE}/api/config/running`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        config_id: runningConfigForm.config_id,
        config_path: runningConfigForm.config_path,
        restart_cmd: runningConfigForm.restart_cmd,
        sudo_pass: runningConfigForm.sudo_pass
          ? runningConfigForm.sudo_pass
          : runningConfig.has_sudo_pass
            ? "******"
            : "",
        execute_update: executeUpdate,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (executeUpdate) {
        if (data.logs && Array.isArray(data.logs)) {
          runningConfigModal.logs = data.logs;
        }
        if (data.command_output) {
          runningConfigModal.commandOutput = data.command_output;
        }

        if (data.status === "success") {
          runningConfigModal.status = "success";
          runningConfigModal.message = data.message || "运行配置更新成功！";
          showToast("运行配置更新成功！");
          await loadRunningConfigSettings();
        } else {
          runningConfigModal.status = "failed";
          runningConfigModal.message = data.message || "运行配置更新失败";
          showToast("运行配置更新失败，请查看日志", "danger");
        }
        scrollToLogBottom();
      } else {
        showToast("设置保存成功！");
        await loadRunningConfigSettings();
        closeRunningConfigModal();
      }
    } else {
      const errText = await res.text();
      if (executeUpdate) {
        runningConfigModal.logs.push({
          step: "异常错误",
          status: "error",
          message: errText || "HTTP 请求失败",
          timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        });
        runningConfigModal.status = "failed";
        runningConfigModal.message = errText || "服务器返回异常";
        showToast("运行配置更新失败", "danger");
        scrollToLogBottom();
      } else {
        showToast(`操作失败: ${errText || "接口错误"}`, "danger");
      }
    }
  } catch (e) {
    if (executeUpdate) {
      runningConfigModal.logs.push({
        step: "网络异常",
        status: "error",
        message: `网络连接请求失败: ${e.message || e}`,
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      });
      runningConfigModal.status = "failed";
      runningConfigModal.message = "网络请求失败";
      showToast("网络请求失败", "danger");
      scrollToLogBottom();
    } else {
      showToast("网络请求失败", "danger");
    }
  } finally {
    runningConfigModal.saving = false;
  }
};

const handleHashChange = () => {
  syncFromRoute();
};

onMounted(() => {
  window.addEventListener("hashchange", handleHashChange);
  loadAllSections();
});

onUnmounted(() => {
  window.removeEventListener("hashchange", handleHashChange);
});

const ruleSyncModal = reactive({
  show: false,
  direction: "route_to_dns",
  sourceIndex: -1,
  sourceRule: null,
  mode: "new",
  targetIndex: -1,
  targetDnsServer: "",
  targetClientSubnet: "",
  targetRouteAction: "route",
  targetRouteOutbound: "",
  error: "",
});

const openSyncModal = (rule, sourceSection, index) => {
  ruleSyncModal.direction =
    sourceSection === "route" ? "route_to_dns" : "dns_to_route";
  ruleSyncModal.sourceIndex = index;
  ruleSyncModal.sourceRule = JSON.parse(JSON.stringify(rule));
  ruleSyncModal.mode = "new";
  ruleSyncModal.targetIndex = -1;
  ruleSyncModal.error = "";

  const defaultDnsServer =
    configData.dns.servers && configData.dns.servers.length > 0
      ? configData.dns.servers[0].tag
      : "local-dns";

  ruleSyncModal.targetDnsServer = defaultDnsServer;
  ruleSyncModal.targetClientSubnet = rule.client_subnet || "";

  ruleSyncModal.targetRouteAction = rule.action || "route";
  ruleSyncModal.targetRouteOutbound =
    rule.outbound ||
    (allOutboundTags.value.includes("proxy")
      ? "proxy"
      : allOutboundTags.value[0] || "");

  ruleSyncModal.show = true;
};

const getRuleSummaryText = (rule, index, type) => {
  if (!rule) return "";
  const parts = [];
  if (type === "dns") {
    parts.push(`DNS: ${rule.server || "默认"}`);
  } else {
    parts.push(`Outbound: ${rule.outbound || rule.action || "未指定"}`);
  }

  if (rule.type === "logical") {
    parts.push(`[逻辑 ${rule.mode ? rule.mode.toUpperCase() : "OR"}]`);
  }

  const criteria = [];
  const fields = [
    "rule_set",
    "domain_suffix",
    "geosite",
    "domain",
    "domain_keyword",
    "domain_regex",
    "ip_cidr",
    "geoip",
  ];
  fields.forEach((f) => {
    let val = rule[f];
    if (!val && rule.type === "logical" && Array.isArray(rule.rules)) {
      const subVals = rule.rules
        .map((sub) => sub[f])
        .filter(Boolean)
        .flat();
      if (subVals.length > 0) val = subVals;
    }
    if (val) {
      const arr = Array.isArray(val) ? val : [val];
      criteria.push(
        `${f}: ${arr.slice(0, 2).join(",")}${arr.length > 2 ? "..." : ""}`,
      );
    }
  });

  const desc = criteria.length > 0 ? criteria.join(" | ") : "全匹配规则";
  return `#${index + 1} (${parts.join(" - ")}) - ${desc}`;
};

const buildSyncedRule = () => {
  const src = JSON.parse(JSON.stringify(ruleSyncModal.sourceRule || {}));
  const isToDns = ruleSyncModal.direction === "route_to_dns";

  const syncFields = [
    "rule_set",
    "domain_suffix",
    "geosite",
    "domain",
    "domain_keyword",
    "domain_regex",
    "port",
    "inbound",
    "protocol",
  ];

  let syncedRule = {};

  if (src.type === "logical" && Array.isArray(src.rules)) {
    syncedRule.type = "logical";
    syncedRule.mode = src.mode || "or";

    syncedRule.rules = src.rules
      .map((sub) => {
        const cleanSub = {};
        syncFields.forEach((f) => {
          if (sub[f] !== undefined && sub[f] !== null) {
            cleanSub[f] = JSON.parse(JSON.stringify(sub[f]));
          }
        });
        if (!isToDns) {
          ["ip_cidr", "geoip"].forEach((f) => {
            if (sub[f] !== undefined && sub[f] !== null) {
              cleanSub[f] = JSON.parse(JSON.stringify(sub[f]));
            }
          });
        }
        return cleanSub;
      })
      .filter((sub) => Object.keys(sub).length > 0);
  } else {
    syncFields.forEach((f) => {
      if (src[f] !== undefined && src[f] !== null) {
        syncedRule[f] = JSON.parse(JSON.stringify(src[f]));
      }
    });
    if (!isToDns) {
      ["ip_cidr", "geoip", "ip_is_private"].forEach((f) => {
        if (src[f] !== undefined && src[f] !== null) {
          syncedRule[f] = JSON.parse(JSON.stringify(src[f]));
        }
      });
    }
  }

  if (src.invert !== undefined) {
    syncedRule.invert = src.invert;
  }

  if (isToDns) {
    syncedRule.server = ruleSyncModal.targetDnsServer || "local-dns";
    if (ruleSyncModal.targetClientSubnet && ruleSyncModal.targetClientSubnet.trim()) {
      syncedRule.client_subnet = ruleSyncModal.targetClientSubnet.trim();
    }
  } else {
    if (ruleSyncModal.targetRouteAction) {
      syncedRule.action = ruleSyncModal.targetRouteAction;
    }
    if (
      (!syncedRule.action || syncedRule.action === "route") &&
      ruleSyncModal.targetRouteOutbound
    ) {
      syncedRule.action = "route";
      syncedRule.outbound = ruleSyncModal.targetRouteOutbound;
    }
  }

  return syncedRule;
};

const confirmSyncRule = () => {
  ruleSyncModal.error = "";
  const isToDns = ruleSyncModal.direction === "route_to_dns";

  if (
    !isToDns &&
    ruleSyncModal.targetRouteAction === "route" &&
    !ruleSyncModal.targetRouteOutbound
  ) {
    ruleSyncModal.error = "请选择目标出站 Tag (outbound)";
    return;
  }

  if (isToDns && !ruleSyncModal.targetDnsServer) {
    ruleSyncModal.error = "请选择目标 DNS 服务器 Tag (server)";
    return;
  }

  const syncedRule = buildSyncedRule();

  if (isToDns) {
    if (!Array.isArray(configData.dns.rules)) configData.dns.rules = [];
  } else {
    if (!Array.isArray(configData.route.rules)) configData.route.rules = [];
  }

  const targetList = isToDns ? configData.dns.rules : configData.route.rules;

  if (ruleSyncModal.mode === "overwrite") {
    if (
      ruleSyncModal.targetIndex < 0 ||
      ruleSyncModal.targetIndex >= targetList.length
    ) {
      ruleSyncModal.error = "请选择需要覆盖的目标规则条目";
      return;
    }
    targetList[ruleSyncModal.targetIndex] = syncedRule;
    showToast(
      `已成功覆盖 ${isToDns ? "DNS" : "路由"} 规则 #${ruleSyncModal.targetIndex + 1}`,
      "success",
    );
  } else {
    targetList.push(syncedRule);
    showToast(
      `已成功同步并新建至 ${isToDns ? "DNS" : "路由"} 规则列表 (共 ${targetList.length} 条)`,
      "success",
    );
  }

  ruleSyncModal.show = false;
};

</script>

<style scoped>
.config-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  margin-top: 1.5rem;
  width: 100%;
}
.config-sidebar {
  width: 320px;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 1.5rem;
  z-index: 10;
}
.config-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.config-main.fill-height {
  height: 100%;
}
.config-editor-scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
@media (max-width: 768px) {
  .config-layout {
    flex-direction: column;
  }
  .config-sidebar {
    width: 100%;
    position: static;
  }
}
.config-card-item {
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  margin-bottom: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  background: rgba(255, 255, 255, 0.01);
}
.config-card-item:hover {
  background: var(--bg-card-hover);
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}
.config-card-item.active {
  border-color: var(--primary);
  background: var(--primary-glow);
  box-shadow: 0 0 12px var(--primary-glow);
}
.config-sidebar::-webkit-scrollbar {
  width: 6px;
}
.config-sidebar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
}
.config-sidebar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

.outbound-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.outbound-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  transition: all 0.2s ease;
}

.outbound-card:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.outbound-card .card-header {
  margin-bottom: 0.75rem;
}

.outbound-card .card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 0 0 0.25rem 0;
}

.outbound-card .card-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.outbound-card .card-badges {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.outbound-card .card-content {
  margin-bottom: 0.75rem;
}

.outbound-card .card-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.outbound-card .detail-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.outbound-card .detail-label {
  color: var(--text-muted);
  flex-shrink: 0;
  min-width: 60px;
}

.outbound-card .detail-value {
  color: var(--text-main);
  word-break: break-all;
}

.outbound-card .card-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
}

.outbound-empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.01);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
}

.outbound-empty-state .empty-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.outbound-empty-state .empty-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.outbound-empty-state .empty-description {
  font-size: 0.85rem;
}

.groups-manager {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.group-item {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  transition: all 0.2s ease;
}

.group-item:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

.group-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.group-tag {
  font-weight: 600;
  color: var(--primary);
  font-size: 0.95rem;
}

.group-actions {
  display: flex;
  gap: 0.5rem;
}

.group-item-content {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
}

.group-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.group-empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.01);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
}

.group-empty-state .empty-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.group-empty-state .empty-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.groups-config-preview {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
}

.preview-header {
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.preview-header h4 {
  margin: 0 0 0.25rem 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.preview-header small {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.preview-tag {
  font-weight: 600;
  color: var(--text-main);
  font-size: 0.85rem;
}

.preview-type {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0 auto 0 0.5rem;
}

.preview-empty {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 1rem;
}

@media (max-width: 1024px) {
  .groups-manager {
    grid-template-columns: 1fr;
  }

  .outbound-cards-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
}

/* Config Detail Page Header & Buttons Layout */
.config-header {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  margin-bottom: 1rem;
}

.config-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.config-header-divider {
  height: 18px;
  width: 1px;
  background: var(--border-color);
  flex-shrink: 0;
}

.config-header-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  flex-shrink: 0;
}

.config-remark-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  max-width: 320px;
  min-width: 180px;
}

.config-remark-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

.config-remark-input {
  margin: 0;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-main);
  height: 32px;
  width: 100%;
  transition: all 0.2s ease;
}

.config-remark-input:focus {
  border-color: var(--primary);
  background: rgba(0, 0, 0, 0.3);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.config-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .config-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .config-header-left {
    width: 100%;
    justify-content: flex-start;
  }

  .config-header-right {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 768px) {
  .config-header-left {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .config-header-divider {
    display: none;
  }

  .config-remark-container {
    max-width: 100%;
    width: 100%;
    flex: none;
  }

  .config-header-right {
    justify-content: space-between;
    width: 100%;
    gap: 0.5rem;
  }

  .config-header-right button {
    flex: 1;
    padding: 0.5rem 0.5rem;
    font-size: 0.8rem;
    min-width: 0;
  }
}

.criteria-tag.duplicate-tag {
  color: var(--danger, #ef4444) !important;
  border-color: rgba(239, 68, 68, 0.5) !important;
  background: rgba(239, 68, 68, 0.12) !important;
  font-weight: 600;
}

/* Execution Log Terminal Modal Styles */
.log-status-banner {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.log-status-banner.running {
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.log-status-banner.success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.log-status-banner.failed {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.terminal-container {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.4);
}

.terminal-header {
  background: #1e293b;
  padding: 0.4rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #334155;
}

.terminal-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.terminal-dots .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.terminal-dots .dot.red {
  background: #ff5f56;
}

.terminal-dots .dot.yellow {
  background: #ffbd2e;
}

.terminal-dots .dot.green {
  background: #27c93f;
}

.terminal-title {
  color: #94a3b8;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  letter-spacing: 0.5px;
}

.btn-copy-log {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-copy-log:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.terminal-body {
  padding: 0.75rem 1rem;
  max-height: 280px;
  min-height: 140px;
  overflow-y: auto;
  font-family: var(--font-mono, monospace);
  font-size: 0.82rem;
  line-height: 1.6;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
  word-break: break-all;
}

.log-time {
  color: #64748b;
  flex-shrink: 0;
}

.log-tag {
  font-weight: 600;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.log-tag.info {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.log-tag.success {
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
}

.log-tag.error {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.log-tag.warn {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.log-entry.success .log-msg {
  color: #4ade80;
}

.log-entry.error .log-msg {
  color: #f87171;
  font-weight: 600;
}

.log-entry.warn .log-msg {
  color: #fbbf24;
}

.log-entry.info .log-msg {
  color: #e2e8f0;
}

.log-empty {
  color: #64748b;
  text-align: center;
  padding: 2rem 0;
}

.command-output-box {
  margin-top: 0.75rem;
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}

.command-output-title {
  color: #94a3b8;
  font-size: 0.78rem;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.command-output-text {
  color: #e2e8f0;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  margin: 0;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}
</style>
