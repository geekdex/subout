<template>
  <div class="view-container">
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
        <h1>节点池</h1>
        <p>
          管理自动从订阅中提取的所有节点，以及自定义的节点。支持修改和分页展示。
        </p>
      </div>
      <button class="btn" @click="openAddModal">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        添加自定义节点
      </button>
    </div>

    <div class="view-body">
      <div class="panel fill-height">
        <!-- Speed Test Summary Banner -->
        <div
          v-if="pingModal.isTesting"
          class="speed-test-banner is-testing"
        >
          <div class="banner-left">
            <span class="ping-dot"></span>
            <span>正在执行节点测速 ({{ pingModal.progress }} / {{ pingModal.total }})</span>
            <span class="badge" style="background: rgba(6, 182, 212, 0.2); color: #22d3ee; margin-left: 0.25rem">
              {{ Math.round((pingModal.progress / (pingModal.total || 1)) * 100) }}%
            </span>
          </div>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="pingModal.show = true"
          >
            查看实时进度
          </button>
        </div>

        <div
          v-else-if="lastSpeedTestSummary && showSummaryBanner"
          class="speed-test-banner"
        >
          <div class="banner-left">
            <span class="banner-badge">📊 测速汇总</span>
            <span class="banner-time">{{ lastSpeedTestSummary.time }}</span>
            <span class="banner-stat">
              共测 <strong>{{ lastSpeedTestSummary.total }}</strong> 个
            </span>
            <span class="banner-stat">
              可用 <strong style="color: var(--success)">{{ lastSpeedTestSummary.successCount }}</strong> 个 ({{ lastSpeedTestSummary.successRate }}%)
            </span>
            <span v-if="lastSpeedTestSummary.failedCount > 0" class="banner-stat">
              超时 <strong style="color: var(--danger)">{{ lastSpeedTestSummary.failedCount }}</strong> 个
            </span>
            <span v-if="lastSpeedTestSummary.avgLatency" class="banner-stat">
              平均延迟 <strong>{{ lastSpeedTestSummary.avgLatency }} ms</strong>
            </span>
            <span v-if="lastSpeedTestSummary.fastest" class="banner-stat">
              最优: <strong>{{ lastSpeedTestSummary.fastest.tag }}</strong> ({{ lastSpeedTestSummary.fastest.latency || lastSpeedTestSummary.fastest.effectiveLatency }} ms)
            </span>
          </div>
          <div class="banner-actions">
            <button
              v-if="lastSpeedTestSummary.failedCount > 0"
              type="button"
              class="btn btn-secondary btn-sm"
              title="勾选所有超时的节点，以便批量删除或禁用"
              @click="batchSelectFailedNodes"
            >
              勾选超时节点 ({{ lastSpeedTestSummary.failedCount }})
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="openPingModalWithSummary"
            >
              查看完整报告
            </button>
            <button
              type="button"
              class="banner-close-btn"
              title="关闭横幅"
              @click="showSummaryBanner = false"
            >
              &times;
            </button>
          </div>
        </div>

        <div
          class="panel-title"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
          "
        >
          <div class="flex items-center gap-2 flex-wrap">
            <span>节点池列表</span>
            <button
              v-show="selectedNodeIds.length > 0"
              class="btn btn-secondary"
              style="
                padding: 0.35rem 0.75rem;
                font-size: 0.8rem;
                margin-left: 0.5rem;
              "
              @click="batchCopyNodes"
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
                style="margin-right: 0.25rem"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                />
              </svg>
              批量复制 ({{ selectedNodeIds.length }})
            </button>
            <button
              v-show="selectedNodeIds.length > 0"
              class="btn btn-secondary"
              style="
                padding: 0.35rem 0.75rem;
                font-size: 0.8rem;
                margin-left: 0.5rem;
              "
              @click="batchExportNodes"
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
                style="margin-right: 0.25rem"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              批量导出 ({{ selectedNodeIds.length }})
            </button>
            <button
              v-show="totalNodes > 0"
              class="btn btn-secondary"
              style="
                padding: 0.35rem 0.75rem;
                font-size: 0.8rem;
                margin-left: 0.5rem;
                background-color: rgba(99, 102, 241, 0.1);
                color: var(--primary);
                border: 1px solid rgba(99, 102, 241, 0.3);
              "
              @click="openPingModal"
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
                style="margin-right: 0.25rem"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              节点测速
              {{
                selectedNodeIds.length > 0
                  ? "(" + selectedNodeIds.length + ")"
                  : ""
              }}
            </button>
            <button
              v-show="selectedNodeIds.length > 0"
              class="btn btn-danger"
              style="
                padding: 0.35rem 0.75rem;
                font-size: 0.8rem;
                margin-left: 0.5rem;
              "
              @click="batchDeleteNodes"
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
                style="margin-right: 0.25rem"
              >
                <polyline points="3 6 5 6 21 6" />
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              批量删除 ({{ selectedNodeIds.length }})
            </button>
          </div>
          <div
            class="flex gap-2"
            style="font-weight: normal; font-size: 0.9rem"
          >
            <select
              v-model="nodeSubFilter"
              class="input-control"
              style="width: 140px; padding: 0.4rem"
            >
              <option value="all">全部订阅</option>
              <option value="custom">自定义节点</option>
              <option v-for="sub in subList" :key="sub.id" :value="sub.id">
                {{ sub.label }}
              </option>
            </select>
            <select
              v-model="tcpFilter"
              class="input-control"
              style="width: 172px; padding: 0.4rem"
              title="按 TCP 握手连通性延迟筛选（TCP 握手探测超时阈值为 2000ms）"
            >
              <option value="all">TCP: 全部</option>
              <option value="success">🚀 高速 (&lt;100ms)</option>
              <option value="info">⚡ 中等 (100-300ms)</option>
              <option value="warn">🐢 高延迟 (300-2000ms)</option>
              <option value="danger">❌ 超时 (&gt;2000ms)</option>
              <option value="untested">⚪ 未测试</option>
            </select>
            <select
              v-model="webFilter"
              class="input-control"
              style="width: 172px; padding: 0.4rem"
              title="按网页访问延迟筛选（HTTP 代理测速超时阈值为 5000ms）"
            >
              <option value="all">网页: 全部</option>
              <option value="success">🚀 高速 (&lt;100ms)</option>
              <option value="info">⚡ 中等 (100-300ms)</option>
              <option value="warn">🐢 高延迟 (300-5000ms)</option>
              <option value="danger">❌ 超时 (&gt;5000ms)</option>
              <option value="untested">⚪ 未测试</option>
            </select>
            <input
              v-model="nodeSearchInput"
              type="text"
              class="input-control"
              style="width: 180px; padding: 0.4rem"
              placeholder="搜索节点名称/服务器..."
            />
          </div>
        </div>
        <div class="panel-table-wrapper">
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center">
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    style="width: 1.1rem; height: 1.1rem; cursor: pointer"
                    @change="toggleSelectAll"
                  />
                </th>
                <th style="width: 60px">启用</th>
                <th>节点名称 (Tag)</th>
                <th>所属订阅</th>
                <th>协议</th>
                <th>服务器地址</th>
                <th>端口</th>
                <th>类型</th>
                <th style="width: 100px">延迟</th>
                <th style="text-align: right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="node in nodes" :key="node.id">
                <td style="text-align: center">
                  <input
                    v-model="selectedNodeIds"
                    type="checkbox"
                    :value="node.id"
                    style="width: 1.1rem; height: 1.1rem; cursor: pointer"
                  />
                </td>
                <td>
                  <label class="switch">
                    <input
                      type="checkbox"
                      :checked="node.enabled !== false"
                      @change="toggleNodeEnabled(node, $event.target.checked)"
                    />
                    <span class="slider"></span>
                  </label>
                </td>
                <td>
                  <strong>{{ node.tag }}</strong>
                </td>
                <td>
                  <span
                    v-if="!node.subscription_id"
                    style="color: var(--secondary); font-weight: 500"
                    >自定义</span
                  >
                  <span v-else>{{ getSubLabel(node.subscription_id) }}</span>
                </td>
                <td>
                  <span
                    class="badge"
                    style="
                      background: rgba(99, 102, 241, 0.15);
                      color: var(--primary);
                    "
                    >{{ node.node_type }}</span
                  >
                </td>
                <td style="font-family: var(--font-mono); font-size: 0.85rem">
                  {{ node.server }}
                </td>
                <td style="font-family: var(--font-mono); font-size: 0.85rem">
                  {{ node.port }}
                </td>
                <td>{{ node.subscription_id ? "动态订阅" : "自定义" }}</td>
                <td>
                  <!-- Check if testing -->
                  <span
                    v-if="
                      latencyMap[node.id] === 'testing' ||
                      (latencyMap[node.id] &&
                        typeof latencyMap[node.id] === 'object' &&
                        (latencyMap[node.id].tcp === 'testing' ||
                          latencyMap[node.id].web === 'testing'))
                    "
                    class="badge latency-testing"
                  >
                    <span class="ping-dot"></span>
                    测试中
                  </span>

                  <!-- If it's a legacy simple number/string value -->
                  <span
                    v-else-if="
                      latencyMap[node.id] !== undefined &&
                      latencyMap[node.id] !== null &&
                      typeof latencyMap[node.id] !== 'object'
                    "
                    :class="['badge', getLatencyClass(latencyMap[node.id])]"
                  >
                    {{ latencyMap[node.id] }} ms
                  </span>
                  <span
                    v-else-if="latencyMap[node.id] === null"
                    class="badge latency-failed"
                  >
                    超时
                  </span>

                  <!-- If it's the new object structure containing both TCP and Web -->
                  <div
                    v-else-if="
                      latencyMap[node.id] &&
                      typeof latencyMap[node.id] === 'object'
                    "
                    style="
                      display: flex;
                      flex-direction: column;
                      gap: 4px;
                      align-items: flex-start;
                    "
                  >
                    <!-- TCP Latency Badge -->
                    <span
                      v-if="
                        latencyMap[node.id].tcp !== undefined &&
                        latencyMap[node.id].tcp !== null
                      "
                      :class="[
                        'badge',
                        getLatencyClass(latencyMap[node.id].tcp),
                      ]"
                      style="font-size: 0.75rem; padding: 0.15rem 0.4rem"
                    >
                      TCP: {{ latencyMap[node.id].tcp }} ms
                    </span>
                    <span
                      v-else-if="latencyMap[node.id].tcp === null"
                      class="badge latency-failed"
                      style="font-size: 0.75rem; padding: 0.15rem 0.4rem"
                      title="TCP 握手探测超时 (>2000ms)"
                    >
                      TCP: 超时 (>2s)
                    </span>

                    <!-- Web/HTTP Latency Badge -->
                    <span
                      v-if="
                        latencyMap[node.id].web !== undefined &&
                        latencyMap[node.id].web !== null
                      "
                      :class="[
                        'badge',
                        getLatencyClass(latencyMap[node.id].web),
                      ]"
                      style="font-size: 0.75rem; padding: 0.15rem 0.4rem"
                    >
                      网页: {{ latencyMap[node.id].web }} ms
                    </span>
                    <span
                      v-else-if="latencyMap[node.id].web === null"
                      class="badge latency-failed"
                      style="font-size: 0.75rem; padding: 0.15rem 0.4rem"
                      title="网页代理测速超时 (>5000ms)"
                    >
                      网页: 超时 (>5s)
                    </span>
                  </div>
                  <div
                    v-if="getNodeTestedAt(node)"
                    style="
                      font-size: 0.7rem;
                      color: var(--text-muted);
                      opacity: 0.85;
                      white-space: nowrap;
                      margin-top: 3px;
                    "
                    :title="'最后测速时间: ' + getNodeTestedAt(node)"
                  >
                    ⏱️ {{ getNodeTestedAt(node) }}
                  </div>
                  <div
                    v-if="getNodeTargetUrl(node)"
                    style="
                      font-size: 0.7rem;
                      color: var(--text-muted);
                      opacity: 0.85;
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      max-width: 140px;
                      margin-top: 2px;
                    "
                    :title="'网页测试目标: ' + getNodeTargetUrl(node)"
                  >
                    🎯 {{ getNodeTargetUrlDisplay(node) }}
                  </div>
                  <span v-else style="color: var(--text-muted)">-</span>
                </td>
                <td style="text-align: right">
                  <div class="flex gap-2" style="justify-content: flex-end">
                    <button
                      class="btn btn-secondary"
                      style="
                        padding: 0.4rem 0.8rem;
                        font-size: 0.85rem;
                        background-color: rgba(99, 102, 241, 0.1);
                        color: var(--primary);
                        border: 1px solid rgba(99, 102, 241, 0.3);
                      "
                      :disabled="pingModal.isTesting"
                      @click="pingSingleNode(node.id)"
                    >
                      测速
                    </button>
                    <button
                      class="btn btn-secondary"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="openEditModal(node)"
                    >
                      编辑
                    </button>
                    <button
                      class="btn btn-danger"
                      style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                      @click="deleteNode(node.id)"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="nodes.length === 0">
                <td
                  colspan="10"
                  style="text-align: center; color: var(--text-muted)"
                >
                  节点池为空，或者没有匹配的节点。
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination controls -->
        <div
          class="flex items-center justify-between"
          style="
            margin-top: 1.5rem;
            border-top: 1px solid var(--border-color);
            padding-top: 1rem;
          "
        >
          <div style="color: var(--text-muted); font-size: 0.9rem">
            显示第 {{ paginationInfo.start }} 到 {{ paginationInfo.end }} 条，共
            {{ totalNodes }} 条
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1-5">
              <span style="color: var(--text-muted); font-size: 0.9rem"
                >每页</span
              >
              <select
                v-model="nodeLimit"
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
              <span style="color: var(--text-muted); font-size: 0.9rem"
                >条</span
              >
            </div>
            <div class="flex gap-2">
              <button
                class="btn btn-secondary"
                style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                :disabled="nodePage === 1"
                @click="prevPage"
              >
                上一页
              </button>
              <button
                class="btn btn-secondary"
                style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                :disabled="nodePage * nodeLimit >= totalNodes"
                @click="nextPage"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Node Modal (Reused for Add & Edit) -->
    <div class="modal" :class="{ active: modal.show }">
      <div class="modal-card" style="max-width: 680px; width: 90%">
        <div class="modal-header">
          <span>{{ modal.isEdit ? "节点详情与编辑" : "添加自定义节点" }}</span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="closeModal"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <form @submit.prevent="submitForm">
          <div class="modal-body">
            <div
              class="toggle-group"
              style="
                display: flex;
                justify-content: flex-end;
                gap: 0.5rem;
                margin-bottom: 1rem;
              "
            >
              <button
                type="button"
                class="btn-toggle"
                :class="{ active: modal.mode === 'visual' }"
                @click="toggleEditMode('visual')"
              >
                可视化表单
              </button>
              <button
                type="button"
                class="btn-toggle"
                :class="{ active: modal.mode === 'json' }"
                @click="toggleEditMode('json')"
              >
                JSON 源码
              </button>
            </div>

            <!-- Basic fields (always visible in visual mode) -->
            <div v-show="modal.mode === 'visual'">
              <div class="grid-2">
                <div class="input-group">
                  <label>节点名称 (Tag)</label>
                  <input
                    v-model="modal.data.tag"
                    type="text"
                    class="input-control"
                    placeholder="例如：My-Custom-Node"
                    required
                    @input="validateForm"
                  />
                </div>
                <div class="input-group">
                  <label>协议类型</label>
                  <select
                    v-model="modal.data.type"
                    class="input-control"
                    required
                    @change="onTypeChange"
                  >
                    <option value="socks">Socks</option>
                    <option value="http">HTTP</option>
                    <option value="vmess">VMess</option>
                    <option value="vless">VLESS</option>
                    <option value="trojan">Trojan</option>
                    <option value="shadowsocks">Shadowsocks</option>
                    <option value="hysteria2">Hysteria 2</option>
                    <option value="tuic">Tuic</option>
                  </select>
                </div>
              </div>
              <div class="grid-2" style="margin-top: 1rem">
                <div class="input-group">
                  <label>服务器地址 (Server)</label>
                  <input
                    v-model="modal.data.server"
                    type="text"
                    class="input-control"
                    placeholder="1.2.3.4"
                    required
                    @input="validateForm"
                  />
                </div>
                <div class="input-group">
                  <label>端口 (Port)</label>
                  <input
                    v-model.number="modal.data.port"
                    type="number"
                    class="input-control"
                    placeholder="443"
                    required
                    @input="validateForm"
                  />
                </div>
              </div>

              <!-- Visual Mode Container for Protocol-specific fields -->
              <div style="margin-top: 1rem">
                <!-- SOCKS/HTTP Fields -->
                <div v-if="['socks', 'http'].includes(modal.data.type)">
                  <div class="grid-2">
                    <div class="input-group">
                      <label>用户名 (可选)</label>
                      <input
                        v-model="modal.data.username"
                        type="text"
                        class="input-control"
                        @input="validateForm"
                      />
                    </div>
                    <div class="input-group">
                      <label>密码 (可选)</label>
                      <input
                        v-model="modal.data.password"
                        type="password"
                        class="input-control"
                        @input="validateForm"
                      />
                    </div>
                  </div>
                </div>

                <!-- VMess Fields -->
                <div v-if="modal.data.type === 'vmess'">
                  <div class="grid-2">
                    <div class="input-group">
                      <label>UUID</label>
                      <input
                        v-model="modal.data.uuid"
                        type="text"
                        class="input-control"
                        placeholder="UUID 格式"
                        @input="validateForm"
                      />
                    </div>
                    <div class="input-group">
                      <label>加密方式 (Security)</label>
                      <select
                        v-model="modal.data.security"
                        class="input-control"
                        @change="validateForm"
                      >
                        <option value="auto">auto</option>
                        <option value="none">none</option>
                        <option value="aes-128-gcm">aes-128-gcm</option>
                        <option value="chacha20-poly1305">
                          chacha20-poly1305
                        </option>
                      </select>
                    </div>
                  </div>
                  <div class="grid-2" style="margin-top: 1rem">
                    <div class="input-group">
                      <label>AlterId</label>
                      <input
                        v-model.number="modal.data.alter_id"
                        type="number"
                        class="input-control"
                        @input="validateForm"
                      />
                    </div>
                  </div>
                </div>

                <!-- VLESS Fields -->
                <div v-if="modal.data.type === 'vless'">
                  <div class="grid-2">
                    <div class="input-group">
                      <label>UUID</label>
                      <input
                        v-model="modal.data.uuid"
                        type="text"
                        class="input-control"
                        placeholder="UUID 格式"
                        @input="validateForm"
                      />
                    </div>
                    <div class="input-group">
                      <label>流控 (Flow)</label>
                      <select
                        v-model="modal.data.flow"
                        class="input-control"
                        @change="validateForm"
                      >
                        <option value="">无 (None)</option>
                        <option value="xtls-rprx-vision">
                          xtls-rprx-vision
                        </option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Trojan Fields -->
                <div v-if="modal.data.type === 'trojan'">
                  <div class="input-group">
                    <label>密码 (Password)</label>
                    <input
                      v-model="modal.data.password"
                      type="password"
                      class="input-control"
                      @input="validateForm"
                    />
                  </div>
                </div>

                <!-- Shadowsocks Fields -->
                <div v-if="modal.data.type === 'shadowsocks'">
                  <div class="grid-2">
                    <div class="input-group">
                      <label>加密方法 (Method)</label>
                      <select
                        v-model="modal.data.method"
                        class="input-control"
                        @change="validateForm"
                      >
                        <option value="aes-256-gcm">aes-256-gcm</option>
                        <option value="aes-128-gcm">aes-128-gcm</option>
                        <option value="chacha20-ietf-poly1305">
                          chacha20-ietf-poly1305
                        </option>
                        <option value="2022-blake3-aes-256-gcm">
                          2022-blake3-aes-256-gcm
                        </option>
                        <option value="2022-blake3-aes-128-gcm">
                          2022-blake3-aes-128-gcm
                        </option>
                        <option value="2022-blake3-chacha20-poly1305">
                          2022-blake3-chacha20-poly1305
                        </option>
                      </select>
                    </div>
                    <div class="input-group">
                      <label>密码 (Password)</label>
                      <input
                        v-model="modal.data.password"
                        type="text"
                        class="input-control"
                        @input="validateForm"
                      />
                    </div>
                  </div>
                </div>

                <!-- Hysteria 2 Fields -->
                <div v-if="modal.data.type === 'hysteria2'">
                  <div class="grid-2">
                    <div class="input-group">
                      <label>连接密码 (Password)</label>
                      <input
                        v-model="modal.data.password"
                        type="password"
                        class="input-control"
                        @input="validateForm"
                      />
                    </div>
                  </div>
                  <div class="grid-2" style="margin-top: 1rem">
                    <div class="input-group">
                      <label>上行带宽 Mbps (up_mbps)</label>
                      <input
                        v-model.number="modal.data.up_mbps"
                        type="number"
                        class="input-control"
                        @input="validateForm"
                      />
                    </div>
                    <div class="input-group">
                      <label>下行带宽 Mbps (down_mbps)</label>
                      <input
                        v-model.number="modal.data.down_mbps"
                        type="number"
                        class="input-control"
                        @input="validateForm"
                      />
                    </div>
                  </div>
                </div>

                <!-- Tuic Fields -->
                <div v-if="modal.data.type === 'tuic'">
                  <div class="grid-2">
                    <div class="input-group">
                      <label>UUID</label>
                      <input
                        v-model="modal.data.uuid"
                        type="text"
                        class="input-control"
                        placeholder="UUID 格式"
                        @input="validateForm"
                      />
                    </div>
                    <div class="input-group">
                      <label>密码 (Password)</label>
                      <input
                        v-model="modal.data.password"
                        type="password"
                        class="input-control"
                        @input="validateForm"
                      />
                    </div>
                  </div>
                  <div class="grid-2" style="margin-top: 1rem">
                    <div class="input-group">
                      <label>拥塞控制 (congestion_control)</label>
                      <select
                        v-model="modal.data.congestion_control"
                        class="input-control"
                        @change="validateForm"
                      >
                        <option value="bbr">bbr</option>
                        <option value="cubic">cubic</option>
                        <option value="new_reno">new_reno</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- TLS configuration (VMess, VLESS, Trojan, Hysteria 2, Tuic) -->
                <div
                  v-if="
                    ['vmess', 'vless', 'trojan', 'hysteria2', 'tuic'].includes(
                      modal.data.type,
                    )
                  "
                  style="
                    margin-top: 1rem;
                    border-top: 1px dashed var(--border-color);
                    padding-top: 1rem;
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
                      id="modal-tls-enabled"
                      v-model="modal.data.tlsEnabled"
                      type="checkbox"
                      style="width: 1.1rem; height: 1.1rem"
                      @change="validateForm"
                    />
                    <label
                      for="modal-tls-enabled"
                      style="
                        font-weight: 600;
                        cursor: pointer;
                        color: var(--secondary);
                      "
                      >启用 TLS 配置</label
                    >
                  </div>
                  <div v-if="modal.data.tlsEnabled">
                    <div class="grid-2">
                      <div class="input-group">
                        <label>TLS Server Name</label>
                        <input
                          v-model="modal.data.tlsSni"
                          type="text"
                          class="input-control"
                          placeholder="域名"
                          @input="validateForm"
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
                            gap: 0.25rem;
                            cursor: pointer;
                          "
                        >
                          <input
                            v-model="modal.data.tlsInsecure"
                            type="checkbox"
                            @change="validateForm"
                          />
                          <span>允许不安全证书 (insecure)</span>
                        </label>
                      </div>
                    </div>
                    <!-- uTLS / Reality (VMess, VLESS, Trojan) -->
                    <div
                      v-if="
                        ['vmess', 'vless', 'trojan'].includes(modal.data.type)
                      "
                      style="margin-top: 1rem"
                    >
                      <div class="grid-2">
                        <div
                          class="input-group"
                          style="display: flex; align-items: center"
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
                              v-model="modal.data.utlsEnabled"
                              type="checkbox"
                              @change="validateForm"
                            />
                            <span>启用 uTLS 指纹</span>
                          </label>
                        </div>
                        <div v-if="modal.data.utlsEnabled" class="input-group">
                          <label>指纹类型 (fingerprint)</label>
                          <select
                            v-model="modal.data.utlsFingerprint"
                            class="input-control"
                            @change="validateForm"
                          >
                            <option value="chrome">chrome</option>
                            <option value="firefox">firefox</option>
                            <option value="edge">edge</option>
                            <option value="safari">safari</option>
                          </select>
                        </div>
                      </div>
                      <div
                        style="
                          margin-top: 1rem;
                          border-top: 1px dotted var(--border-color);
                          padding-top: 0.75rem;
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
                            id="modal-reality-enabled"
                            v-model="modal.data.realityEnabled"
                            type="checkbox"
                            style="width: 1.1rem; height: 1.1rem"
                            @change="validateForm"
                          />
                          <label
                            for="modal-reality-enabled"
                            style="
                              font-weight: 600;
                              cursor: pointer;
                              color: var(--secondary);
                            "
                            >启用 Reality 握手</label
                          >
                        </div>
                        <div v-if="modal.data.realityEnabled" class="grid-2">
                          <div class="input-group">
                            <label>Public Key</label>
                            <input
                              v-model="modal.data.realityPubkey"
                              type="text"
                              class="input-control"
                              @input="validateForm"
                            />
                          </div>
                          <div class="input-group">
                            <label>Short ID</label>
                            <input
                              v-model="modal.data.realityShortid"
                              type="text"
                              class="input-control"
                              @input="validateForm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Transport options (VMess, VLESS, Trojan, Shadowsocks) -->
                <div
                  v-if="
                    ['vmess', 'vless', 'trojan', 'shadowsocks'].includes(
                      modal.data.type,
                    )
                  "
                  style="
                    margin-top: 1rem;
                    border-top: 1px dashed var(--border-color);
                    padding-top: 1rem;
                  "
                >
                  <div class="grid-2">
                    <div class="input-group">
                      <label>传输方式 (Transport Type)</label>
                      <select
                        v-model="modal.data.transportType"
                        class="input-control"
                        @change="validateForm"
                      >
                        <option value="">无 (TCP)</option>
                        <option value="ws">WebSocket (ws)</option>
                        <option value="grpc">gRPC (grpc)</option>
                        <option value="http">HTTP Upgrade (http)</option>
                      </select>
                    </div>
                    <div v-if="modal.data.transportType" class="input-group">
                      <label>WS 路径 / gRPC 服务名</label>
                      <input
                        v-model="modal.data.transportPath"
                        type="text"
                        class="input-control"
                        placeholder="/"
                        @input="validateForm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- JSON Mode Container -->
            <div v-show="modal.mode === 'json'" style="margin-top: 1rem">
              <div class="input-group">
                <label>完整 Outbound JSON 配置 (符合 sing-box 规范)</label>
                <textarea
                  v-model="modal.jsonText"
                  class="input-control"
                  style="
                    font-family: var(--font-mono);
                    height: 250px;
                    font-size: 0.85rem;
                  "
                  @input="validateForm"
                ></textarea>
              </div>
            </div>

            <div
              v-show="modal.error"
              class="text-danger"
              style="
                margin-top: 0.5rem;
                margin-bottom: 0.5rem;
                font-size: 0.85rem;
                color: #f87171;
              "
            >
              {{ modal.error }}
            </div>
          </div>
          <!-- End of modal-body -->

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeModal">
              取消
            </button>
            <button id="modal-submit-btn" type="submit" class="btn">
              {{ modal.isEdit ? "保存修改" : "添加自定义节点" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Latency Test Modal -->
    <div class="modal" :class="{ active: pingModal.show }">
      <div class="modal-card" style="max-width: 680px; width: 92%">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 0.5rem">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>节点延迟测试</span>
          </div>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="closePingModal"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <div class="modal-body" style="max-height: 80vh; overflow-y: auto">
          <!-- Parameter Configuration (Collapsible if results exist) -->
          <details
            :open="!pingModal.isTesting && pingModal.results.length === 0"
            style="
              margin-bottom: 1.25rem;
              border: 1px solid var(--border-color);
              border-radius: 8px;
              padding: 0.75rem 1rem;
              background: rgba(255, 255, 255, 0.02);
            "
          >
            <summary
              style="
                cursor: pointer;
                font-weight: 500;
                display: flex;
                justify-content: space-between;
                align-items: center;
                user-select: none;
              "
            >
              <span>⚙️ 测速参数设置</span>
              <span style="font-size: 0.8rem; color: var(--text-muted)">
                {{ pingModal.testRange === "selected" ? ("已选 " + selectedNodeIds.length + " 个") : "全部节点" }} ·
                {{ pingModal.testType === "both" ? "TCP + 网页延迟" : pingModal.testType === "web" ? "仅网页延迟" : "仅TCP连通性" }}
              </span>
            </summary>
            <div style="margin-top: 1rem">
              <div class="form-group" style="margin-bottom: 1.25rem">
                <label
                  style="
                    display: block;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    color: var(--text-color);
                  "
                  >测试范围</label
                >
                <div style="display: flex; gap: 1.25rem; align-items: center">
                  <label
                    v-if="selectedNodeIds.length > 0"
                    style="
                      display: flex;
                      align-items: center;
                      gap: 0.35rem;
                      cursor: pointer;
                      color: var(--text-color);
                    "
                  >
                    <input
                      v-model="pingModal.testRange"
                      type="radio"
                      value="selected"
                    />
                    已选节点 ({{ selectedNodeIds.length }})
                  </label>
                  <label
                    style="
                      display: flex;
                      align-items: center;
                      gap: 0.35rem;
                      cursor: pointer;
                      color: var(--text-color);
                    "
                  >
                    <input v-model="pingModal.testRange" type="radio" value="all" />
                    所有节点 ({{ totalNodes }})
                  </label>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 1.25rem">
                <label
                  style="
                    display: block;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    color: var(--text-color);
                  "
                  >测试方式</label
                >
                <select
                  v-model="pingModal.testType"
                  class="form-control"
                  style="
                    width: 100%;
                    padding: 0.5rem;
                    border-radius: 6px;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    color: var(--text-color);
                  "
                >
                  <option value="both">全部 (先测 TCP 再测网页)</option>
                  <option value="tcp">TCP 连通性测试 (快速)</option>
                  <option value="web">网页延迟测试 (代理)</option>
                </select>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.35rem">
                  ⏱️ 默认超时判定：TCP 握手 2000ms (2s)，网页代理请求 5000ms (5s)。超过该阈值未响应即判定为超时。
                </div>
              </div>

              <div
                v-if="isTunActive()"
                style="
                  margin-bottom: 1.25rem;
                  padding: 0.75rem 1rem;
                  border-radius: 6px;
                  background: rgba(234, 179, 8, 0.12);
                  border: 1px solid rgba(234, 179, 8, 0.35);
                  color: #eab308;
                  font-size: 0.85rem;
                  line-height: 1.5;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 0.75rem;
                  flex-wrap: wrap;
                "
              >
                <div>
                  ⚠️
                  <strong>TUN 代理运行中：</strong
                  >全局流量正被接管，测速可能存在节点叠加。建议关闭代理后再测速。
                </div>
                <button
                  type="button"
                  class="btn btn-secondary"
                  style="
                    padding: 0.25rem 0.65rem;
                    font-size: 0.8rem;
                    white-space: nowrap;
                    border-color: rgba(234, 179, 8, 0.5);
                    color: #eab308;
                  "
                  @click="quickStopServiceInPingModal"
                >
                  一键关闭代理
                </button>
              </div>

              <div
                v-if="
                  !systemModeInfo.kernel_installed &&
                  ['web', 'both'].includes(pingModal.testType)
                "
                style="
                  margin-bottom: 1.25rem;
                  padding: 0.75rem 1rem;
                  border-radius: 6px;
                  background: rgba(234, 179, 8, 0.12);
                  border: 1px solid rgba(234, 179, 8, 0.35);
                  color: #eab308;
                  font-size: 0.85rem;
                  line-height: 1.5;
                "
              >
                ⚠️ <strong>提示：</strong>当前系统未检测到
                <code>sing-box</code>
                内核。无法启动本地代理测试通道（网页测速将被跳过，仅执行传输层
                TCP/UDP
                连通性测试）。如需测试真实网页访问速度，请先前往【内核管理】一键下载安装内核。
              </div>

              <div
                v-if="['web', 'both'].includes(pingModal.testType)"
                class="form-group"
                style="margin-bottom: 1.25rem"
              >
                <label
                  style="
                    display: block;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    color: var(--text-color);
                  "
                  >测试目标网址</label
                >
                <select
                  v-model="pingModal.targetUrlSelect"
                  class="form-control"
                  style="
                    width: 100%;
                    padding: 0.5rem;
                    border-radius: 6px;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    color: var(--text-color);
                  "
                >
                  <option
                    v-for="opt in TARGET_URL_OPTIONS"
                    :key="opt.url"
                    :value="opt.url"
                  >
                    {{ opt.label }} ({{ opt.url }})
                  </option>
                  <option value="custom">自定义网址...</option>
                </select>
                <input
                  v-if="pingModal.targetUrlSelect === 'custom'"
                  v-model="pingModal.customTargetUrl"
                  type="text"
                  class="form-control"
                  placeholder="请输入自定义 HTTP(S) 测试目标网址"
                  style="
                    width: 100%;
                    margin-top: 0.5rem;
                    padding: 0.5rem;
                    border-radius: 6px;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    color: var(--text-color);
                  "
                />
              </div>
            </div>
          </details>

          <!-- Progress bar -->
          <div
            v-if="pingModal.isTesting || (pingModal.total > 0 && pingModal.progress === pingModal.total)"
            style="margin-bottom: 1.25rem"
          >
            <div
              style="
                display: flex;
                justify-content: space-between;
                font-size: 0.85rem;
                margin-bottom: 0.35rem;
                color: var(--text-muted);
              "
            >
              <span>
                {{ pingModal.isTesting ? "测试进度:" : "测试已完成:" }}
                {{ pingModal.progress }} / {{ pingModal.total }}
              </span>
              <span>
                {{ Math.round((pingModal.progress / (pingModal.total || 1)) * 100) }}%
              </span>
            </div>
            <div
              style="
                height: 6px;
                background: var(--border-color);
                border-radius: 3px;
                overflow: hidden;
              "
            >
              <div
                :style="{
                  width: (pingModal.progress / (pingModal.total || 1)) * 100 + '%',
                  background: pingModal.isTesting ? 'var(--primary)' : 'var(--success)',
                }"
                style="height: 100%; transition: width 0.2s;"
              ></div>
            </div>
          </div>

          <!-- Tab Switcher: Summary vs Logs -->
          <div
            v-if="pingModal.results.length > 0 || pingModal.logs.length > 0"
            class="ping-tabs-bar"
          >
            <button
              type="button"
              class="ping-tab-btn"
              :class="{ active: pingModal.activeTab === 'summary' }"
              @click="pingModal.activeTab = 'summary'"
            >
              📊 结果汇总
              <span v-if="pingModal.results.length > 0" class="tab-badge">
                {{ pingModal.results.length }}
              </span>
            </button>
            <button
              type="button"
              class="ping-tab-btn"
              :class="{ active: pingModal.activeTab === 'logs' }"
              @click="pingModal.activeTab = 'logs'"
            >
              📜 运行日志
              <span v-if="pingModal.isTesting" class="ping-dot" style="margin-left: 0.35rem"></span>
            </button>
          </div>

          <!-- TAB 1: Summary Panel -->
          <div v-if="pingModal.activeTab === 'summary' && pingSummaryStats" class="summary-section">
            <!-- Metric Cards -->
            <div class="metric-cards-grid">
              <div class="metric-card">
                <div class="metric-label">已测总数</div>
                <div class="metric-value">{{ pingSummaryStats.total }}</div>
                <div class="metric-sub">{{ pingModal.testRange === 'selected' ? '已选节点' : '全部节点' }}</div>
              </div>
              <div class="metric-card success">
                <div class="metric-label">可用节点</div>
                <div class="metric-value text-success">{{ pingSummaryStats.successCount }}</div>
                <div class="metric-sub">连通率 {{ pingSummaryStats.successRate }}%</div>
              </div>
              <div class="metric-card danger">
                <div class="metric-label">超时 / 异常</div>
                <div class="metric-value" :class="pingSummaryStats.failedCount > 0 ? 'text-danger' : ''">
                  {{ pingSummaryStats.failedCount }}
                </div>
                <div class="metric-sub">
                  {{ pingSummaryStats.failedCount > 0 ? (pingModal.testType === 'tcp' ? '超时 (>2000ms)' : pingModal.testType === 'web' ? '超时 (>5000ms)' : '超时 (>2s/5s)') : '无异常' }}
                </div>
              </div>
              <div class="metric-card info">
                <div class="metric-label">平均延迟</div>
                <div class="metric-value text-info">
                  {{ pingSummaryStats.avgLatency ? pingSummaryStats.avgLatency + ' ms' : '--' }}
                </div>
                <div class="metric-sub">{{ pingModal.testType === 'web' ? '真实网页' : '综合探测' }}</div>
              </div>
              <div class="metric-card primary">
                <div class="metric-label">最优节点</div>
                <div
                  class="metric-value text-primary"
                  style="font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                  :title="pingSummaryStats.fastest ? pingSummaryStats.fastest.tag : ''"
                >
                  {{ pingSummaryStats.fastest ? (pingSummaryStats.fastest.latency || pingSummaryStats.fastest.effectiveLatency) + ' ms' : '--' }}
                </div>
                <div
                  class="metric-sub"
                  style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                  :title="pingSummaryStats.fastest ? pingSummaryStats.fastest.tag : ''"
                >
                  {{ pingSummaryStats.fastest ? pingSummaryStats.fastest.tag : '暂无数据' }}
                </div>
              </div>
            </div>

            <!-- Distribution Visual Bar -->
            <div class="distribution-container">
              <div class="distribution-bar">
                <div
                  v-if="pingSummaryStats.tiers.fast > 0"
                  class="dist-seg seg-fast"
                  :style="{ width: (pingSummaryStats.tiers.fast / pingSummaryStats.total) * 100 + '%' }"
                  :title="`极速: ${pingSummaryStats.tiers.fast} 个`"
                ></div>
                <div
                  v-if="pingSummaryStats.tiers.medium > 0"
                  class="dist-seg seg-medium"
                  :style="{ width: (pingSummaryStats.tiers.medium / pingSummaryStats.total) * 100 + '%' }"
                  :title="`良好: ${pingSummaryStats.tiers.medium} 个`"
                ></div>
                <div
                  v-if="pingSummaryStats.tiers.slow > 0"
                  class="dist-seg seg-slow"
                  :style="{ width: (pingSummaryStats.tiers.slow / pingSummaryStats.total) * 100 + '%' }"
                  :title="`较慢: ${pingSummaryStats.tiers.slow} 个`"
                ></div>
                <div
                  v-if="pingSummaryStats.tiers.failed > 0"
                  class="dist-seg seg-failed"
                  :style="{ width: (pingSummaryStats.tiers.failed / pingSummaryStats.total) * 100 + '%' }"
                  :title="`超时: ${pingSummaryStats.tiers.failed} 个`"
                ></div>
              </div>

              <!-- Filter chips below distribution bar -->
              <div class="tier-filter-chips">
                <button
                  type="button"
                  class="tier-chip"
                  :class="{ active: pingModal.filterTier === 'all' }"
                  @click="pingModal.filterTier = 'all'"
                >
                  全部 ({{ pingSummaryStats.total }})
                </button>
                <button
                  type="button"
                  class="tier-chip"
                  :class="{ active: pingModal.filterTier === 'success' }"
                  @click="pingModal.filterTier = 'success'"
                >
                  仅可用 ({{ pingSummaryStats.successCount }})
                </button>
                <button
                  type="button"
                  class="tier-chip chip-fast"
                  :class="{ active: pingModal.filterTier === 'fast' }"
                  @click="pingModal.filterTier = 'fast'"
                >
                  🚀 极速 &lt;100ms ({{ pingSummaryStats.tiers.fast }})
                </button>
                <button
                  type="button"
                  class="tier-chip chip-medium"
                  :class="{ active: pingModal.filterTier === 'medium' }"
                  @click="pingModal.filterTier = 'medium'"
                >
                  ⚡ 良好 100-300ms ({{ pingSummaryStats.tiers.medium }})
                </button>
                <button
                  type="button"
                  class="tier-chip chip-slow"
                  :class="{ active: pingModal.filterTier === 'slow' }"
                  :title="pingModal.testType === 'tcp' ? '延迟 300~2000ms' : '延迟 300~5000ms'"
                  @click="pingModal.filterTier = 'slow'"
                >
                  🐢 较慢 (300ms~超时) ({{ pingSummaryStats.tiers.slow }})
                </button>
                <button
                  type="button"
                  class="tier-chip chip-failed"
                  :class="{ active: pingModal.filterTier === 'failed' }"
                  :title="pingModal.testType === 'tcp' ? 'TCP 握手超时 (>2000ms)' : pingModal.testType === 'web' ? '网页测速超时 (>5000ms)' : '探测超时 (TCP>2000ms / Web>5000ms)'"
                  @click="pingModal.filterTier = 'failed'"
                >
                  ❌ 超时 ({{ pingModal.testType === 'tcp' ? '>2s' : pingModal.testType === 'web' ? '>5s' : '>2s/5s' }}) ({{ pingSummaryStats.tiers.failed }})
                </button>
              </div>
            </div>

            <!-- Action buttons bar -->
            <div class="summary-actions-bar">
              <button
                v-if="pingSummaryStats.failedCount > 0"
                type="button"
                class="btn btn-secondary btn-sm"
                title="勾选所有超时节点，关闭弹窗后可批量删除或禁用"
                @click="batchSelectFailedNodes"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                勾选超时节点 ({{ pingSummaryStats.failedCount }})
              </button>
              <button
                v-if="pingSummaryStats.failedCount > 0 && !pingModal.isTesting"
                type="button"
                class="btn btn-secondary btn-sm"
                title="仅重新测试未通过/超时的节点"
                @click="retryFailedNodes"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                仅重测超时节点 ({{ pingSummaryStats.failedCount }})
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                title="复制测速报告文本到剪贴板"
                @click="copySpeedTestReport"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                复制测速报告
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                title="导出 CSV 格式测速结果"
                @click="exportSpeedTestCsv"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                导出 CSV
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                title="在主节点列表中仅显示可用节点"
                @click="filterAvailableInTable"
              >
                在列表中仅看可用
              </button>
            </div>

            <!-- Ranked Results Table -->
            <div class="ranked-results-section">
              <div class="ranked-header">
                <span style="font-weight: 500; font-size: 0.9rem">节点排行列表 ({{ filteredPingResults.length }})</span>
                <input
                  v-model="pingModal.searchQuery"
                  type="text"
                  class="input-control"
                  style="padding: 0.25rem 0.6rem; font-size: 0.8rem; width: 170px"
                  placeholder="搜索节点名称/地址..."
                />
              </div>
              <div class="ranked-table-wrapper">
                <table class="ranked-table">
                  <thead>
                    <tr>
                      <th style="width: 44px; text-align: center">排名</th>
                      <th>节点名称 (Tag)</th>
                      <th style="width: 70px">协议</th>
                      <th style="width: 90px">TCP 延迟</th>
                      <th style="width: 90px">网页延迟</th>
                      <th style="width: 80px; text-align: center">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="filteredPingResults.length === 0">
                      <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1rem">
                        暂无符合条件的测速结果
                      </td>
                    </tr>
                    <tr v-for="(res, idx) in filteredPingResults" :key="res.id">
                      <td style="text-align: center; font-family: var(--font-mono); font-size: 0.85rem">
                        <span v-if="idx === 0 && res.effectiveLatency !== null" style="color: #f59e0b">🥇</span>
                        <span v-else-if="idx === 1 && res.effectiveLatency !== null" style="color: #94a3b8">🥈</span>
                        <span v-else-if="idx === 2 && res.effectiveLatency !== null" style="color: #b45309">🥉</span>
                        <span v-else>#{{ idx + 1 }}</span>
                      </td>
                      <td>
                        <strong>{{ res.tag }}</strong>
                      </td>
                      <td>
                        <span class="badge" style="font-size: 0.75rem; background: rgba(99, 102, 241, 0.15); color: var(--primary);">
                          {{ res.node_type }}
                        </span>
                      </td>
                      <td>
                        <span
                          v-if="res.tcp !== null && res.tcp !== undefined"
                          :class="['badge', getLatencyClass(res.tcp)]"
                          style="font-size: 0.75rem"
                        >
                          {{ res.tcp }} ms
                        </span>
                        <span
                          v-else-if="res.tcp === null"
                          class="badge latency-failed"
                          style="font-size: 0.75rem"
                          title="TCP 握手探测超时 (>2000ms)"
                        >
                          超时 (&gt;2s)
                        </span>
                        <span v-else style="color: var(--text-muted); font-size: 0.75rem">-</span>
                      </td>
                      <td>
                        <span
                          v-if="res.web !== null && res.web !== undefined"
                          :class="['badge', getLatencyClass(res.web)]"
                          style="font-size: 0.75rem"
                        >
                          {{ res.web }} ms
                        </span>
                        <span
                          v-else-if="res.web === null"
                          class="badge latency-failed"
                          style="font-size: 0.75rem"
                          title="网页代理测速超时 (>5000ms)"
                        >
                          超时 (&gt;5s)
                        </span>
                        <span v-else style="color: var(--text-muted); font-size: 0.75rem">-</span>
                      </td>
                      <td style="text-align: center">
                        <span
                          class="badge"
                          :class="res.status === 'fast' ? 'badge-success' : res.status === 'medium' ? 'badge-info' : res.status === 'slow' ? 'badge-warning' : 'badge-danger'"
                          style="font-size: 0.75rem"
                        >
                          {{ res.status === 'fast' ? '极速' : res.status === 'medium' ? '良好' : res.status === 'slow' ? '较慢' : '超时' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- TAB 2: Logs Output Console -->
          <div v-show="pingModal.activeTab === 'logs' || (!pingSummaryStats && pingModal.logs.length > 0)" style="margin-top: 1rem">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem">
              <label
                style="
                  display: block;
                  font-weight: 500;
                  color: var(--text-color);
                  margin: 0;
                "
                >测试运行日志</label
              >
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                style="padding: 0.15rem 0.5rem; font-size: 0.75rem"
                @click="pingModal.logs = []"
              >
                清空日志
              </button>
            </div>
            <div
              ref="logsConsole"
              style="
                background: #1e1e1e;
                color: #2ecc71;
                font-family: monospace;
                font-size: 0.85rem;
                padding: 0.75rem;
                border-radius: 6px;
                height: 220px;
                overflow-y: auto;
                white-space: pre-wrap;
                word-break: break-all;
                line-height: 1.4;
              "
            >
              <div
                v-for="(log, idx) in pingModal.logs"
                :key="idx"
                :style="{
                  color:
                    log.includes('失败') ||
                    log.includes('错误') ||
                    log.includes('出错')
                      ? '#e74c3c'
                      : log.includes('延迟') || log.includes('ms')
                        ? '#3498db'
                        : '#2ecc71',
                }"
              >
                {{ log }}
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            @click="closePingModal"
          >
            {{ pingModal.isTesting ? "后台运行" : "关闭" }}
          </button>
          <button
            v-if="pingModal.isTesting"
            type="button"
            class="btn btn-danger"
            @click="stopPingTests"
          >
            停止测试
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            :disabled="
              pingModal.testRange === 'single' && !pingModal.singleNodeId
            "
            @click="startPingTests"
          >
            开始测试
          </button>
        </div>
      </div>
    </div>

    <!-- TUN Mode Speed Test Prompt Modal -->
    <div class="modal" :class="{ active: tunPromptModal.show }">
      <div class="modal-card" style="max-width: 480px; width: 90%">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 0.5rem">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#eab308"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style="font-weight: 600">TUN 代理模式测速提示</span>
          </div>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="handleTunCancel"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <div class="modal-body">
          <p
            style="
              margin-bottom: 0.75rem;
              color: var(--text-color);
              font-size: 0.95rem;
              line-height: 1.6;
            "
          >
            检测到当前系统已开启 <strong>TUN 虚拟网卡代理</strong>。
          </p>
          <div
            style="
              margin-bottom: 1rem;
              padding: 0.75rem 1rem;
              border-radius: 6px;
              background: rgba(234, 179, 8, 0.1);
              border: 1px solid rgba(234, 179, 8, 0.25);
              color: var(--text-color);
              font-size: 0.875rem;
              line-height: 1.5;
            "
          >
            在此状态下测速，测试流量会被当前运行的主代理节点中转（<strong>存在节点叠加</strong>），可能导致测速延迟偏高或测试超时。
            <div style="margin-top: 0.4rem; font-weight: 500">
              💡 建议关闭代理后再测速，以获取真实物理网络延迟。
            </div>
          </div>
        </div>
        <div
          class="modal-footer"
          style="
            display: flex;
            justify-content: flex-end;
            gap: 0.5rem;
            flex-wrap: wrap;
          "
        >
          <button
            type="button"
            class="btn btn-secondary"
            @click="handleTunCancel"
          >
            取消
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            style="border-color: var(--border-color)"
            @click="handleTunContinueTest"
          >
            直接测速
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="stoppingTunForTest"
            @click="handleTunStopAndTest"
          >
            <span
              v-if="stoppingTunForTest"
              class="spinner"
              style="width: 14px; height: 14px; margin-right: 0.35rem"
            ></span>
            {{ stoppingTunForTest ? "正在关闭代理..." : "关闭代理并测速" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from "vue";
import {
  token,
  API_BASE,
  showToast,
  confirmDialog,
  systemModeInfo,
  serviceStatus,
  fetchServiceStatus,
  stopService,
} from "../store.js";
import { validateData } from "../validator.js";

const nodes = ref([]);
const subList = ref([]);
const totalNodes = ref(0);
const selectedNodeIds = ref([]);
const latencyMap = ref({});

const nodePage = ref(1);
const nodeLimit = ref(10);
const nodeSearchInput = ref("");
const nodeSubFilter = ref("all");
const tcpFilter = ref("all");
const webFilter = ref("all");

const getNodeTestedAt = (node) => {
  const mapItem = latencyMap.value[node.id];
  if (mapItem && typeof mapItem === "object" && mapItem.tested_at) {
    return mapItem.tested_at;
  }
  return node.last_tested_at || "";
};

const TARGET_URL_OPTIONS = [
  { label: "Google（通用）", url: "http://www.gstatic.com/generate_204" },
  {
    label: "Google（Android系统级）",
    url: "http://connectivitycheck.gstatic.com/generate_204",
  },
  {
    label: "Google（另一变体）",
    url: "http://connectivitycheck.android.com/generate_204",
  },
  { label: "Cloudflare", url: "http://cp.cloudflare.com/generate_204" },
  {
    label: "Microsoft（Windows NCSI）",
    url: "http://www.msftconnecttest.com/connecttest.txt",
  },
  {
    label: "Apple（iOS/macOS）",
    url: "http://captive.apple.com/hotspot-detect.html",
  },
  {
    label: "Firefox",
    url: "http://detectportal.firefox.com/success.txt",
  },
  {
    label: "Ubuntu/Canonical",
    url: "http://connectivity-check.ubuntu.com",
  },
];

const getNodeTargetUrl = (node) => {
  const mapItem = latencyMap.value[node.id];
  if (mapItem && typeof mapItem === "object" && mapItem.target_url) {
    return mapItem.target_url;
  }
  return node.last_target_url || "";
};

const getNodeTargetUrlDisplay = (node) => {
  const url = getNodeTargetUrl(node);
  if (!url) return "";
  const found = TARGET_URL_OPTIONS.find((opt) => opt.url === url);
  return found ? found.label : url;
};

const isAllSelected = computed(() => {
  return (
    nodes.value.length > 0 &&
    nodes.value.every((n) => selectedNodeIds.value.includes(n.id))
  );
});

const toggleSelectAll = (e) => {
  if (e.target.checked) {
    const currentIds = nodes.value.map((n) => n.id);
    const newSelection = new Set([...selectedNodeIds.value, ...currentIds]);
    selectedNodeIds.value = Array.from(newSelection);
  } else {
    const currentIds = nodes.value.map((n) => n.id);
    selectedNodeIds.value = selectedNodeIds.value.filter(
      (id) => !currentIds.includes(id),
    );
  }
};

const paginationInfo = computed(() => {
  if (totalNodes.value === 0) return { start: 0, end: 0 };
  const start = (nodePage.value - 1) * nodeLimit.value + 1;
  const end = Math.min(nodePage.value * nodeLimit.value, totalNodes.value);
  return { start, end };
});

const getSubLabel = (subId) => {
  const sub = subList.value.find((s) => s.id === subId);
  return sub ? sub.label : `订阅 #${subId}`;
};

const loadNodes = async () => {
  try {
    const params = new URLSearchParams({
      page: nodePage.value,
      limit: nodeLimit.value,
      search: nodeSearchInput.value,
    });
    if (nodeSubFilter.value === "custom") {
      params.append("subscription_id", "-1");
    } else if (nodeSubFilter.value !== "all") {
      params.append("subscription_id", nodeSubFilter.value);
    }
    if (tcpFilter.value !== "all") {
      params.append("tcp_filter", tcpFilter.value);
    }
    if (webFilter.value !== "all") {
      params.append("web_filter", webFilter.value);
    }
    const url = `${API_BASE}/api/nodes?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      nodes.value = data.nodes || [];
      totalNodes.value =
        data.total !== undefined ? data.total : data.total_count || 0;

      nodes.value.forEach((node) => {
        const currentLat = latencyMap.value[node.id];
        const isTesting =
          currentLat === "testing" ||
          (currentLat &&
            typeof currentLat === "object" &&
            (currentLat.tcp === "testing" || currentLat.web === "testing"));

        if (!isTesting) {
          if (
            (node.last_tcp_latency !== null &&
              node.last_tcp_latency !== undefined) ||
            (node.last_web_latency !== null &&
              node.last_web_latency !== undefined) ||
            node.last_tested_at ||
            node.last_target_url
          ) {
            latencyMap.value[node.id] = {
              tcp:
                node.last_tcp_latency === -1
                  ? null
                  : node.last_tcp_latency !== null &&
                      node.last_tcp_latency !== undefined
                    ? node.last_tcp_latency
                    : undefined,
              web:
                node.last_web_latency === -1
                  ? null
                  : node.last_web_latency !== null &&
                      node.last_web_latency !== undefined
                    ? node.last_web_latency
                    : undefined,
              tested_at: node.last_tested_at,
              target_url: node.last_target_url,
            };
          }
        }
      });
    } else {
      showToast("加载节点池失败", "danger");
    }
  } catch {
    showToast("加载节点池失败", "danger");
  }
};

const loadSubscriptions = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/subscriptions`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      subList.value = await res.json();
    }
  } catch {}
};

// Search & Filter Watchers
watch([nodeSearchInput, nodeSubFilter, tcpFilter, webFilter, nodeLimit], () => {
  nodePage.value = 1;
  selectedNodeIds.value = [];
  loadNodes();
});

const prevPage = () => {
  if (nodePage.value > 1) {
    nodePage.value--;
    selectedNodeIds.value = [];
    loadNodes();
  }
};

const nextPage = () => {
  if (nodePage.value * nodeLimit.value < totalNodes.value) {
    nodePage.value++;
    selectedNodeIds.value = [];
    loadNodes();
  }
};

// Modal State
const modal = reactive({
  show: false,
  isEdit: false,
  editId: null,
  mode: "visual",
  jsonText: "",
  error: "",
  data: {
    tag: "",
    type: "socks",
    server: "",
    port: 1080,
    username: "",
    password: "",
    uuid: "",
    security: "auto",
    alter_id: 0,
    flow: "",
    method: "aes-256-gcm",
    up_mbps: null,
    down_mbps: null,
    congestion_control: "bbr",
    tlsEnabled: false,
    tlsSni: "",
    tlsInsecure: false,
    utlsEnabled: false,
    utlsFingerprint: "chrome",
    realityEnabled: false,
    realityPubkey: "",
    realityShortid: "",
    transportType: "",
    transportPath: "",
  },
});

const onTypeChange = () => {
  if (modal.data.type === "socks") {
    modal.data.port = 1080;
    modal.data.tlsEnabled = false;
  } else if (modal.data.type === "http") {
    modal.data.port = 8080;
    modal.data.tlsEnabled = false;
  } else if (
    ["vmess", "vless", "trojan", "hysteria2", "tuic"].includes(modal.data.type)
  ) {
    modal.data.port = 443;
    if (["vless", "trojan", "hysteria2", "tuic"].includes(modal.data.type)) {
      modal.data.tlsEnabled = true;
    }
  }
  validateForm(false);
};

const openAddModal = () => {
  modal.isEdit = false;
  modal.editId = null;
  modal.mode = "visual";
  modal.jsonText = "";
  modal.error = "";
  modal.data = {
    tag: "",
    type: "socks",
    server: "",
    port: 1080,
    username: "",
    password: "",
    uuid: "",
    security: "auto",
    alter_id: 0,
    flow: "",
    method: "aes-256-gcm",
    up_mbps: null,
    down_mbps: null,
    congestion_control: "bbr",
    tlsEnabled: false,
    tlsSni: "",
    tlsInsecure: false,
    utlsEnabled: false,
    utlsFingerprint: "chrome",
    realityEnabled: false,
    realityPubkey: "",
    realityShortid: "",
    transportType: "",
    transportPath: "",
  };
  modal.show = true;
};

const openEditModal = (node) => {
  modal.isEdit = true;
  modal.editId = node.id;
  modal.mode = "visual";
  modal.jsonText = "";
  modal.error = "";

  let detail = {};
  try {
    detail =
      typeof node.raw_json === "string"
        ? JSON.parse(node.raw_json)
        : node.raw_json;
  } catch {
    detail = {};
  }

  if (!detail || typeof detail !== "object") {
    detail = {};
  }

  // Populate data
  modal.data = {
    tag: node.tag || "",
    type: node.node_type || "socks",
    server: node.server || "",
    port: node.port || 1080,
    username: detail.username || "",
    password: detail.password || "",
    uuid: detail.uuid || "",
    security: detail.security || "auto",
    alter_id: detail.alter_id || 0,
    flow: detail.flow || "",
    method: detail.method || "aes-256-gcm",
    up_mbps: detail.up_mbps || null,
    down_mbps: detail.down_mbps || null,
    congestion_control: detail.congestion_control || "bbr",
    tlsEnabled: !!detail.tls?.enabled,
    tlsSni: detail.tls?.server_name || "",
    tlsInsecure: !!detail.tls?.insecure,
    utlsEnabled: !!detail.tls?.utls?.enabled,
    utlsFingerprint: detail.tls?.utls?.fingerprint || "chrome",
    realityEnabled: !!detail.tls?.reality?.enabled,
    realityPubkey: detail.tls?.reality?.public_key || "",
    realityShortid: detail.tls?.reality?.short_id || "",
    transportType: detail.transport?.type || "",
    transportPath:
      detail.transport?.path || detail.transport?.service_name || "",
  };
  modal.show = true;
};

const closeModal = () => {
  modal.show = false;
};

const serializeForm = () => {
  const type = modal.data.type;
  let obj = {
    type,
    tag: modal.data.tag,
    server: modal.data.server,
    server_port: modal.data.port,
  };

  if (type === "socks" || type === "http") {
    if (modal.data.username) obj.username = modal.data.username;
    if (modal.data.password) obj.password = modal.data.password;
  } else if (type === "vmess") {
    obj.uuid = modal.data.uuid;
    obj.security = modal.data.security;
    obj.alter_id = modal.data.alter_id;
  } else if (type === "vless") {
    obj.uuid = modal.data.uuid;
    if (modal.data.flow) obj.flow = modal.data.flow;
  } else if (type === "trojan") {
    obj.password = modal.data.password;
  } else if (type === "shadowsocks") {
    obj.method = modal.data.method;
    obj.password = modal.data.password;
  } else if (type === "hysteria2") {
    if (modal.data.password) obj.password = modal.data.password;
    if (modal.data.up_mbps) obj.up_mbps = modal.data.up_mbps;
    if (modal.data.down_mbps) obj.down_mbps = modal.data.down_mbps;
  } else if (type === "tuic") {
    if (modal.data.uuid) obj.uuid = modal.data.uuid;
    if (modal.data.password) obj.password = modal.data.password;
    obj.congestion_control = modal.data.congestion_control;
  }

  if (
    ["vmess", "vless", "trojan", "hysteria2", "tuic"].includes(type) &&
    modal.data.tlsEnabled
  ) {
    obj.tls = { enabled: true };
    if (modal.data.tlsSni) obj.tls.server_name = modal.data.tlsSni;
    if (modal.data.tlsInsecure) obj.tls.insecure = true;

    if (["vmess", "vless", "trojan"].includes(type)) {
      if (modal.data.utlsEnabled) {
        obj.tls.utls = {
          enabled: true,
          fingerprint: modal.data.utlsFingerprint,
        };
      }
      if (modal.data.realityEnabled) {
        obj.tls.reality = {
          enabled: true,
          public_key: modal.data.realityPubkey,
          short_id: modal.data.realityShortid,
        };
      }
    }
  }

  if (
    ["vmess", "vless", "trojan", "shadowsocks"].includes(type) &&
    modal.data.transportType
  ) {
    obj.transport = { type: modal.data.transportType };
    if (modal.data.transportType === "grpc") {
      obj.transport.service_name = modal.data.transportPath;
    } else {
      obj.transport.path = modal.data.transportPath || "/";
    }
  }

  return obj;
};

const deserializeForm = (obj) => {
  if (!obj || typeof obj !== "object") obj = {};
  modal.data.tag = obj.tag || "";
  modal.data.type = obj.type || "socks";
  modal.data.server = obj.server || "";
  modal.data.port = obj.server_port || obj.port || 1080;

  modal.data.username = obj.username || "";
  modal.data.password = obj.password || "";
  modal.data.uuid = obj.uuid || "";
  modal.data.security = obj.security || "auto";
  modal.data.alter_id = obj.alter_id || 0;
  modal.data.flow = obj.flow || "";
  modal.data.method = obj.method || "aes-256-gcm";
  modal.data.up_mbps = obj.up_mbps || null;
  modal.data.down_mbps = obj.down_mbps || null;
  modal.data.congestion_control = obj.congestion_control || "bbr";

  if (obj.tls) {
    modal.data.tlsEnabled = !!obj.tls.enabled;
    modal.data.tlsSni = obj.tls.server_name || "";
    modal.data.tlsInsecure = !!obj.tls.insecure;
    modal.data.utlsEnabled = !!obj.tls.utls?.enabled;
    modal.data.utlsFingerprint = obj.tls.utls?.fingerprint || "chrome";
    modal.data.realityEnabled = !!obj.tls.reality?.enabled;
    modal.data.realityPubkey = obj.tls.reality?.public_key || "";
    modal.data.realityShortid = obj.tls.reality?.short_id || "";
  } else {
    modal.data.tlsEnabled = false;
    modal.data.tlsSni = "";
    modal.data.tlsInsecure = false;
    modal.data.utlsEnabled = false;
    modal.data.realityEnabled = false;
  }

  if (obj.transport) {
    modal.data.transportType = obj.transport.type || "";
    modal.data.transportPath =
      obj.transport.path || obj.transport.service_name || "";
  } else {
    modal.data.transportType = "";
    modal.data.transportPath = "";
  }
};

const toggleEditMode = (mode) => {
  if (modal.mode === mode) return;

  if (mode === "visual") {
    try {
      const parsed = JSON.parse(modal.jsonText);
      deserializeForm(parsed);
      modal.mode = mode;
      modal.error = "";
    } catch (e) {
      showToast(`JSON 解析错误: ${e.message}`, "danger");
    }
  } else {
    const obj = serializeForm();
    modal.jsonText = JSON.stringify(obj, null, 2);
    modal.mode = mode;
  }
};

const validateForm = (isSubmit = false) => {
  const actualSubmit = isSubmit === true;
  let obj = {};
  if (modal.mode === "visual") {
    obj = serializeForm();
  } else {
    try {
      obj = JSON.parse(modal.jsonText);
    } catch (e) {
      modal.error = `JSON 语法错误: ${e.message}`;
      return false;
    }
  }

  const check = validateData("node", obj);
  if (!check.valid) {
    if (actualSubmit || modal.error || modal.mode === "json") {
      modal.error = check.errors;
    }
    return false;
  } else {
    modal.error = "";
    return true;
  }
};

const submitForm = async () => {
  if (!validateForm(true)) return;

  const nodeObj =
    modal.mode === "visual" ? serializeForm() : JSON.parse(modal.jsonText);
  const payload = {
    tag: nodeObj.tag,
    node_type: nodeObj.type,
    server: nodeObj.server,
    port: parseInt(nodeObj.server_port || nodeObj.port) || 0,
    raw_json: JSON.stringify(nodeObj),
  };

  try {
    const url = modal.isEdit
      ? `${API_BASE}/api/nodes/${modal.editId}`
      : `${API_BASE}/api/nodes`;
    const method = modal.isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      showToast(modal.isEdit ? "节点保存成功" : "自定义节点添加成功");
      closeModal();
      loadNodes();
    } else {
      const errText = await res.text();
      showToast(`保存失败: ${errText || "Tag 必须唯一"}`, "danger");
    }
  } catch {
    showToast("保存节点出错", "danger");
  }
};

const toggleNodeEnabled = async (node, enabled) => {
  try {
    const res = await fetch(`${API_BASE}/api/nodes/${node.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        tag: node.tag,
        node_type: node.node_type,
        server: node.server,
        port: node.port,
        raw_json:
          typeof node.raw_json === "string"
            ? node.raw_json
            : JSON.stringify(node.raw_json),
        enabled,
      }),
    });
    if (res.ok) {
      showToast(enabled ? "节点已启用" : "节点已禁用");
      node.enabled = enabled;
    } else {
      showToast("修改节点状态失败", "danger");
    }
  } catch {
    showToast("修改节点状态失败", "danger");
  }
};

const deleteNode = async (id) => {
  if (!(await confirmDialog("确定要删除该节点吗？", { isDanger: true })))
    return;

  try {
    const res = await fetch(`${API_BASE}/api/nodes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.value}` },
    });

    if (res.ok) {
      showToast("节点已删除");
      selectedNodeIds.value = selectedNodeIds.value.filter((nid) => nid !== id);
      loadNodes();
    } else {
      showToast("删除节点失败", "danger");
    }
  } catch {
    showToast("删除节点出错", "danger");
  }
};

const batchDeleteNodes = async () => {
  if (selectedNodeIds.value.length === 0) return;
  if (
    !(await confirmDialog(
      `确定要批量删除这 ${selectedNodeIds.value.length} 个节点吗？`,
      { isDanger: true },
    ))
  )
    return;

  try {
    const res = await fetch(`${API_BASE}/api/nodes/batch-delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ ids: selectedNodeIds.value }),
    });

    if (res.ok) {
      showToast("所选节点已批量删除");
      selectedNodeIds.value = [];
      loadNodes();
    } else {
      showToast("批量删除失败", "danger");
    }
  } catch {
    showToast("批量删除出错", "danger");
  }
};

const copyToClipboard = (text) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    } finally {
      document.body.removeChild(textarea);
    }
  }
};

const downloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const fetchSelectedNodesConfig = async () => {
  if (selectedNodeIds.value.length === 0) return null;
  showToast("正在获取节点数据...");
  try {
    // Fetch all nodes in a single request to cover nodes across different pages.
    const url = `${API_BASE}/api/nodes?page=1&limit=999999`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      const allNodes = data.nodes || [];
      const selected = allNodes.filter((n) =>
        selectedNodeIds.value.includes(n.id),
      );
      const parsed = selected
        .map((node) => {
          try {
            return typeof node.raw_json === "string"
              ? JSON.parse(node.raw_json)
              : node.raw_json;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  showToast("获取节点数据失败", "danger");
  return null;
};

const batchCopyNodes = async () => {
  const configs = await fetchSelectedNodesConfig();
  if (!configs) return;
  if (configs.length === 0) {
    showToast("没有可复制的节点配置", "warning");
    return;
  }
  try {
    await copyToClipboard(JSON.stringify(configs, null, 2));
    showToast(`成功复制 ${configs.length} 个节点配置到剪贴板`);
  } catch {
    showToast("复制失败，请重试", "danger");
  }
};

const batchExportNodes = async () => {
  const configs = await fetchSelectedNodesConfig();
  if (!configs) return;
  if (configs.length === 0) {
    showToast("没有可导出的节点配置", "warning");
    return;
  }
  downloadJson(configs, `subout-exported-nodes-${Date.now()}.json`);
  showToast(`成功导出 ${configs.length} 个节点`);
};

const getLatencyClass = (latency) => {
  if (latency === null || latency === undefined) return "latency-failed";
  if (latency < 100) return "latency-low";
  if (latency < 300) return "latency-medium";
  return "latency-high";
};

const tunPromptModal = reactive({
  show: false,
  pendingAction: null,
});
const stoppingTunForTest = ref(false);

const isTunActive = () => {
  return (
    !!serviceStatus.value?.running &&
    (!!serviceStatus.value?.is_tun ||
      !!serviceStatus.value?.inbounds_summary?.toLowerCase().includes("tun"))
  );
};

const handleTunCancel = () => {
  tunPromptModal.show = false;
  tunPromptModal.pendingAction = null;
};

const handleTunContinueTest = async () => {
  tunPromptModal.show = false;
  if (tunPromptModal.pendingAction) {
    const action = tunPromptModal.pendingAction;
    tunPromptModal.pendingAction = null;
    await action();
  }
};

const handleTunStopAndTest = async () => {
  stoppingTunForTest.value = true;
  try {
    const stopped = await stopService();
    if (stopped) {
      showToast("已成功关闭代理服务，开始测速...");
    }
    tunPromptModal.show = false;
    if (tunPromptModal.pendingAction) {
      const action = tunPromptModal.pendingAction;
      tunPromptModal.pendingAction = null;
      await action();
    }
  } catch (e) {
    showToast(`关闭代理服务出错: ${e.message || e}`, "danger");
  } finally {
    stoppingTunForTest.value = false;
  }
};

const quickStopServiceInPingModal = async () => {
  const ok = await stopService();
  if (ok) {
    showToast("已关闭代理服务，现在测速将直连节点");
  }
};

const pingModal = reactive({
  show: false,
  testRange: "all",
  singleNodeId: "",
  testType: "both",
  targetUrlSelect: "http://www.gstatic.com/generate_204",
  customTargetUrl: "",
  isTesting: false,
  progress: 0,
  total: 0,
  logs: [],
  statusMap: {},
  results: [],
  activeTab: "summary",
  filterTier: "all",
  searchQuery: "",
  completedAt: null,
});

const lastSpeedTestSummary = ref(null);
const showSummaryBanner = ref(true);

const pingSummaryStats = computed(() => {
  const list = pingModal.results;
  const total = list.length;
  if (total === 0) return null;

  let successCount = 0;
  let failedCount = 0;
  let totalLatency = 0;
  let fastest = null;
  let slowest = null;

  const tiers = {
    fast: 0,
    medium: 0,
    slow: 0,
    failed: 0,
  };

  list.forEach((item) => {
    if (item.effectiveLatency !== null && item.effectiveLatency !== undefined) {
      successCount++;
      totalLatency += item.effectiveLatency;

      const currLat = item.effectiveLatency;
      if (
        !fastest ||
        currLat < (fastest.latency || fastest.effectiveLatency)
      ) {
        fastest = item;
      }
      if (
        !slowest ||
        currLat > (slowest.latency || slowest.effectiveLatency)
      ) {
        slowest = item;
      }

      if (currLat < 100) tiers.fast++;
      else if (currLat <= 300) tiers.medium++;
      else tiers.slow++;
    } else {
      failedCount++;
      tiers.failed++;
    }
  });

  const avgLatency =
    successCount > 0 ? Math.round(totalLatency / successCount) : 0;
  const successRate =
    total > 0 ? ((successCount / total) * 100).toFixed(1) : "0.0";

  return {
    total,
    successCount,
    failedCount,
    successRate,
    avgLatency,
    fastest,
    slowest,
    tiers,
  };
});

const filteredPingResults = computed(() => {
  let list = [...pingModal.results];

  if (pingModal.filterTier === "success") {
    list = list.filter(
      (n) => n.effectiveLatency !== null && n.effectiveLatency !== undefined,
    );
  } else if (pingModal.filterTier === "failed") {
    list = list.filter(
      (n) => n.effectiveLatency === null || n.effectiveLatency === undefined,
    );
  } else if (["fast", "medium", "slow"].includes(pingModal.filterTier)) {
    list = list.filter((n) => n.status === pingModal.filterTier);
  }

  if (pingModal.searchQuery && pingModal.searchQuery.trim()) {
    const q = pingModal.searchQuery.trim().toLowerCase();
    list = list.filter(
      (n) =>
        (n.tag && n.tag.toLowerCase().includes(q)) ||
        (n.server && n.server.toLowerCase().includes(q)) ||
        (n.node_type && n.node_type.toLowerCase().includes(q)),
    );
  }

  list.sort((a, b) => {
    if (a.effectiveLatency === null && b.effectiveLatency === null) return 0;
    if (a.effectiveLatency === null) return 1;
    if (b.effectiveLatency === null) return -1;
    return a.effectiveLatency - b.effectiveLatency;
  });

  return list;
});

const batchSelectFailedNodes = () => {
  const source =
    pingModal.results.length > 0
      ? pingModal.results
      : lastSpeedTestSummary.value?.results || [];
  const failedIds = source
    .filter(
      (n) => n.effectiveLatency === null || n.effectiveLatency === undefined,
    )
    .map((n) => n.id);

  if (failedIds.length === 0) {
    showToast("未检测到超时节点", "info");
    return;
  }

  selectedNodeIds.value = Array.from(
    new Set([...selectedNodeIds.value, ...failedIds]),
  );
  showToast(
    `已勾选 ${failedIds.length} 个超时节点，可直接执行批量删除或禁用`,
    "success",
  );
};

const retryFailedNodes = () => {
  if (pingModal.isTesting) return;
  const failedItems = pingModal.results.filter(
    (n) => n.effectiveLatency === null || n.effectiveLatency === undefined,
  );
  if (failedItems.length === 0) {
    showToast("当前没有失败或超时的节点", "info");
    return;
  }
  const failedIds = failedItems.map((n) => n.id);
  selectedNodeIds.value = [...failedIds];
  pingModal.testRange = "selected";
  startPingTests(true);
};

const copySpeedTestReport = async () => {
  const stats = pingSummaryStats.value || lastSpeedTestSummary.value;
  if (!stats) {
    showToast("暂无测速数据可生成报告", "warning");
    return;
  }

  const results =
    pingModal.results.length > 0
      ? pingModal.results
      : lastSpeedTestSummary.value?.results || [];
  const sorted = [...results].sort((a, b) => {
    if (a.effectiveLatency === null && b.effectiveLatency === null) return 0;
    if (a.effectiveLatency === null) return 1;
    if (b.effectiveLatency === null) return -1;
    return a.effectiveLatency - b.effectiveLatency;
  });

  const lines = [
    "================【Subout 节点测速报告】================",
    `测试时间: ${stats.time || new Date().toLocaleString()}`,
    `目标网址: ${getEffectiveTargetUrl()}`,
    `测试类型: ${
      pingModal.testType === "web"
        ? "网页延迟"
        : pingModal.testType === "tcp"
          ? "TCP 连通性"
          : "TCP + 网页延迟"
    }`,
    `测试总数: ${stats.total} 个`,
    `可用节点: ${stats.successCount} 个 (连通率: ${stats.successRate}%)`,
    `超时节点: ${stats.failedCount} 个`,
    `平均延迟: ${stats.avgLatency} ms`,
    stats.fastest
      ? `最优节点: ${stats.fastest.tag} (${
          stats.fastest.latency || stats.fastest.effectiveLatency
        } ms)`
      : null,
    "------------------ 延迟分布 ------------------",
    `🚀 极速 (<100ms): ${stats.tiers.fast} 个`,
    `⚡ 良好 (100-300ms): ${stats.tiers.medium} 个`,
    `🐢 较慢 (300ms~超时阈值): ${stats.tiers.slow} 个`,
    `❌ 超时 / 异常 (${
      pingModal.testType === "tcp"
        ? ">2000ms"
        : pingModal.testType === "web"
          ? ">5000ms"
          : "TCP>2s / Web>5s"
    }): ${stats.tiers.failed} 个`,
    "------------------ 节点排行明细 ------------------",
  ].filter(Boolean);

  sorted.forEach((item, idx) => {
    let latInfo = "";
    if (item.web !== null && item.web !== undefined)
      latInfo += `Web: ${item.web}ms`;
    if (item.tcp !== null && item.tcp !== undefined) {
      if (latInfo) latInfo += ", ";
      latInfo += `TCP: ${item.tcp}ms`;
    }
    if (!latInfo) latInfo = "连接超时";
    lines.push(`${idx + 1}. [${item.tag}] (${item.node_type}) - ${latInfo}`);
  });
  lines.push("=================================================");

  const reportText = lines.join("\n");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(reportText);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = reportText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    showToast("测速报告已成功复制到剪贴板", "success");
  } catch {
    showToast("复制测速报告失败，请重试", "danger");
  }
};

const exportSpeedTestCsv = () => {
  const results =
    pingModal.results.length > 0
      ? pingModal.results
      : lastSpeedTestSummary.value?.results || [];
  if (results.length === 0) {
    showToast("暂无可导出的测速结果", "warning");
    return;
  }

  const sorted = [...results].sort((a, b) => {
    if (a.effectiveLatency === null && b.effectiveLatency === null) return 0;
    if (a.effectiveLatency === null) return 1;
    if (b.effectiveLatency === null) return -1;
    return a.effectiveLatency - b.effectiveLatency;
  });

  const headers = [
    "排名",
    "节点名称",
    "协议",
    "服务器",
    "端口",
    "TCP延迟(ms)",
    "网页延迟(ms)",
    "状态",
  ];
  const csvRows = [headers.join(",")];

  sorted.forEach((item, idx) => {
    const tcpStr =
      item.tcp !== null && item.tcp !== undefined ? item.tcp : "超时(>2s)";
    const webStr =
      item.web !== null && item.web !== undefined ? item.web : "超时(>5s)";
    let statusStr = "超时";
    if (item.status === "fast") statusStr = "极速(<100ms)";
    else if (item.status === "medium") statusStr = "良好(100-300ms)";
    else if (item.status === "slow") statusStr = "较慢(300ms~超时)";
    else statusStr = item.effectiveLatency === null ? "超时" : "异常";

    const row = [
      idx + 1,
      `"${(item.tag || "").replace(/"/g, '""')}"`,
      item.node_type || "",
      `"${item.server || ""}"`,
      item.port || "",
      tcpStr,
      webStr,
      statusStr,
    ];
    csvRows.push(row.join(","));
  });

  const csvString = "\uFEFF" + csvRows.join("\r\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  a.href = url;
  a.download = `subout_speedtest_${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("测速结果已成功导出为 CSV", "success");
};

const filterAvailableInTable = () => {
  webFilter.value = "success";
  closePingModal();
  loadNodes();
  showToast("已应用筛选: 仅显示可用节点");
};

const openPingModalWithSummary = () => {
  openPingModal();
  pingModal.activeTab = "summary";
};

const loadGlobalSpeedSummary = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/nodes/speed-summary`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.tested_nodes > 0) {
        lastSpeedTestSummary.value = {
          total: data.total_nodes,
          successCount: data.available_nodes,
          failedCount: data.failed_nodes,
          successRate: data.availability_rate.toFixed(1),
          avgLatency: data.avg_web_latency || data.avg_tcp_latency || 0,
          fastest: data.fastest_node
            ? {
                tag: data.fastest_node.tag,
                effectiveLatency: data.fastest_node.latency,
                latency: data.fastest_node.latency,
                node_type: data.fastest_node.node_type,
              }
            : null,
          time: data.last_tested_at
            ? data.last_tested_at.split(" ")[1] || data.last_tested_at
            : "历史记录",
          tiers: {
            fast: data.web_tiers?.fast || data.tcp_tiers?.fast || 0,
            medium: data.web_tiers?.medium || data.tcp_tiers?.medium || 0,
            slow: data.web_tiers?.slow || data.tcp_tiers?.slow || 0,
            failed: data.failed_nodes || 0,
          },
          fromApi: true,
        };
      }
    }
  } catch {}
};

const getEffectiveTargetUrl = () => {
  if (pingModal.targetUrlSelect === "custom") {
    return (
      pingModal.customTargetUrl.trim() || "http://www.gstatic.com/generate_204"
    );
  }
  return pingModal.targetUrlSelect || "http://www.gstatic.com/generate_204";
};

const logsConsole = ref(null);
const allNodesListForSelect = ref([]);

watch(
  () => pingModal.logs.length,
  () => {
    nextTick(() => {
      if (logsConsole.value) {
        logsConsole.value.scrollTop = logsConsole.value.scrollHeight;
      }
    });
  },
);

const loadAllNodesForSelect = async () => {
  try {
    const res = await fetch(`${API_BASE}/api/nodes?page=1&limit=999999`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      allNodesListForSelect.value = data.nodes || [];
    }
  } catch {}
};

const openPingModal = async () => {
  pingModal.testRange = selectedNodeIds.value.length > 0 ? "selected" : "all";
  pingModal.singleNodeId = "";
  pingModal.testType = "both";
  pingModal.targetUrlSelect = "http://www.gstatic.com/generate_204";
  pingModal.customTargetUrl = "";
  pingModal.isTesting = false;
  if (pingModal.results.length === 0) {
    pingModal.progress = 0;
    pingModal.total = 0;
    pingModal.logs = [];
    pingModal.statusMap = {};
    pingModal.activeTab = "summary";
  }
  pingModal.show = true;
  loadAllNodesForSelect();
  fetchServiceStatus();

  try {
    const res = await fetch(`${API_BASE}/api/system/mode`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      systemModeInfo.value = { ...systemModeInfo.value, ...data };
    }
  } catch {}
};

const closePingModal = () => {
  pingModal.show = false;
};

const stopPingTests = () => {
  pingModal.isTesting = false;
  pingModal.logs.push("[系统] 测试已被管理员手动停止。");

  // Clean up any remaining "testing" status
  Object.keys(pingModal.statusMap).forEach((id) => {
    if (pingModal.statusMap[id] === "testing") {
      pingModal.statusMap[id] = "failed";
    }
  });

  Object.keys(latencyMap.value).forEach((id) => {
    const latObj = latencyMap.value[id];
    if (latObj && typeof latObj === "object") {
      const nextObj = { ...latObj };
      if (nextObj.tcp === "testing") nextObj.tcp = null;
      if (nextObj.web === "testing") nextObj.web = null;
      latencyMap.value[id] = nextObj;
    } else if (latencyMap.value[id] === "testing") {
      latencyMap.value[id] = null;
    }
  });
};

const setFailedStatus = (id) => {
  const latObj = latencyMap.value[id];
  if (latObj && typeof latObj === "object") {
    const nextObj = { ...latObj };
    if (nextObj.tcp === "testing") nextObj.tcp = null;
    if (nextObj.web === "testing") nextObj.web = null;
    latencyMap.value[id] = nextObj;
  } else {
    latencyMap.value[id] = null;
  }
};

const pingSingleNode = async (id, bypassTunCheck = false) => {
  if (pingModal.isTesting) {
    showToast("当前正在进行批量测试，请稍后再试", "warning");
    return;
  }

  if (!bypassTunCheck) {
    await fetchServiceStatus();
    if (isTunActive()) {
      tunPromptModal.pendingAction = () => pingSingleNode(id, true);
      tunPromptModal.show = true;
      return;
    }
  }

  const node = nodes.value.find((n) => n.id === id) ||
    allNodesListForSelect.value.find((n) => n.id === id) || {
      tag: `节点 #${id}`,
    };

  const targetUrl = getEffectiveTargetUrl();
  if (!systemModeInfo.value.kernel_installed) {
    showToast(`开始测试节点 [${node.tag}] (未安装内核，仅测试传输层连通性)...`);
  } else {
    showToast(`开始测试节点 [${node.tag}] ...`);
  }

  latencyMap.value[id] = {
    tcp: "testing",
    web: "testing",
  };

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
        target_url: targetUrl,
      }),
    });

    if (res.ok) {
      const results = await res.json();
      const item = results[0];
      if (item) {
        const tcp = item.tcp_latency;
        const web = item.web_latency;
        latencyMap.value[id] = {
          tcp: tcp !== undefined && tcp !== null ? tcp : null,
          web: web !== undefined && web !== null ? web : null,
          target_url: targetUrl,
        };
        if (tcp !== undefined && tcp !== null) {
          if (web !== undefined && web !== null) {
            showToast(`[${node.tag}] 传输延迟: ${tcp}ms, 网页延迟: ${web}ms`);
          } else if (!systemModeInfo.value.kernel_installed) {
            showToast(
              `[${node.tag}] 传输延迟: ${tcp}ms (未安装 sing-box 内核，已跳过网页测速)`,
            );
          } else {
            showToast(
              `[${node.tag}] 传输延迟: ${tcp}ms, 网页测试失败`,
              "warning",
            );
          }
        } else if (web !== undefined && web !== null) {
          showToast(`[${node.tag}] 传输层探测超时, 网页延迟: ${web}ms`);
        } else {
          if (!systemModeInfo.value.kernel_installed) {
            showToast(`[${node.tag}] 传输层连接超时 (未安装内核)`, "danger");
          } else {
            showToast(`[${node.tag}] 传输层与网页测试均超时`, "danger");
          }
        }
      } else {
        setFailedStatus(id);
        showToast(`[${node.tag}] 测试失败: 接口未返回数据`, "danger");
      }
    } else {
      setFailedStatus(id);
      const errMsg = await res.text();
      showToast(
        `[${node.tag}] 测试失败: ${errMsg || res.statusText}`,
        "danger",
      );
    }
  } catch (e) {
    setFailedStatus(id);
    showToast(`[${node.tag}] 测试出错: ${e.message || e}`, "danger");
  } finally {
    loadNodes();
  }
};

const startPingTests = async (bypassTunCheck = false) => {
  let targetNodeIds = [];
  if (pingModal.testRange === "selected") {
    targetNodeIds = [...selectedNodeIds.value];
  } else if (pingModal.testRange === "single") {
    if (!pingModal.singleNodeId) {
      showToast("请选择要测试的节点", "warning");
      return;
    }
    targetNodeIds = [pingModal.singleNodeId];
  } else {
    // all
    if (allNodesListForSelect.value.length === 0) {
      await loadAllNodesForSelect();
    }
    targetNodeIds = allNodesListForSelect.value.map((n) => n.id);
  }

  if (targetNodeIds.length === 0) {
    showToast("没有可测试的节点", "warning");
    return;
  }

  if (!systemModeInfo.value.kernel_installed && pingModal.testType === "web") {
    showToast(
      "当前系统未安装 sing-box 内核，无法执行网页测速。请先前往【内核管理】下载内核。",
      "warning",
    );
    pingModal.logs = [
      "[提示] 未检测到 sing-box 内核，无法建立网页测速管道。请先在管理面板中下载内核后再测试。",
    ];
    return;
  }

  if (!bypassTunCheck) {
    await fetchServiceStatus();
    if (isTunActive()) {
      tunPromptModal.pendingAction = () => startPingTests(true);
      tunPromptModal.show = true;
      return;
    }
  }

  const targetUrl = getEffectiveTargetUrl();

  pingModal.isTesting = true;
  pingModal.progress = 0;
  pingModal.total = targetNodeIds.length;
  pingModal.results = [];
  pingModal.activeTab = "summary";
  pingModal.filterTier = "all";
  pingModal.searchQuery = "";
  pingModal.completedAt = null;

  if (!systemModeInfo.value.kernel_installed) {
    pingModal.logs = [
      "开始测试 (未检测到 sing-box 内核，已跳过真实网页测速，仅测试传输层连通性)...",
    ];
  } else {
    pingModal.logs = ["开始测试..."];
  }

  targetNodeIds.forEach((id) => {
    pingModal.statusMap[id] = "testing";
    if (pingModal.testType === "tcp") {
      latencyMap.value[id] = {
        ...(latencyMap.value[id] && typeof latencyMap.value[id] === "object"
          ? latencyMap.value[id]
          : {}),
        tcp: "testing",
      };
    } else if (pingModal.testType === "web") {
      latencyMap.value[id] = {
        ...(latencyMap.value[id] && typeof latencyMap.value[id] === "object"
          ? latencyMap.value[id]
          : {}),
        web: "testing",
      };
    } else {
      // both
      latencyMap.value[id] = {
        tcp: "testing",
        web: "testing",
      };
    }
  });

  const queue = [...targetNodeIds];
  let activeCount = 0;
  const concurrency = ["web", "both"].includes(pingModal.testType) ? 3 : 10;

  const runNext = async () => {
    if (queue.length === 0 || !pingModal.isTesting) return;
    const id = queue.shift();
    activeCount++;

    const node = allNodesListForSelect.value.find((n) => n.id === id) ||
      nodes.value.find((n) => n.id === id) || { tag: `节点 #${id}` };

    const recordResult = (tcpVal, webVal) => {
      let effectiveLat = null;
      if (webVal !== null && webVal !== undefined) {
        effectiveLat = webVal;
      } else if (tcpVal !== null && tcpVal !== undefined) {
        effectiveLat = tcpVal;
      }

      let status = "failed";
      if (effectiveLat !== null) {
        if (effectiveLat < 100) status = "fast";
        else if (effectiveLat <= 300) status = "medium";
        else status = "slow";
      }

      pingModal.results.push({
        id,
        tag: node.tag,
        node_type: node.node_type || "unknown",
        server: node.server || "",
        port: node.port || 0,
        tcp: tcpVal,
        web: webVal,
        effectiveLatency: effectiveLat,
        latency: effectiveLat,
        status,
      });
    };

    pingModal.logs.push(`正在测试 [${node.tag}] ...`);

    try {
      const res = await fetch(`${API_BASE}/api/nodes/ping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.value}`,
        },
        body: JSON.stringify({
          ids: [id],
          test_type: pingModal.testType,
          target_url: ["web", "both"].includes(pingModal.testType)
            ? targetUrl
            : undefined,
        }),
      });

      if (!pingModal.isTesting) {
        activeCount--;
        return;
      }

      if (res.ok) {
        const results = await res.json();
        const item = results[0];
        if (item) {
          if (pingModal.testType === "both") {
            const tcp = item.tcp_latency;
            const web = item.web_latency;
            const tcpVal = tcp !== undefined && tcp !== null ? tcp : null;
            const webVal = web !== undefined && web !== null ? web : null;
            latencyMap.value[id] = {
              tcp: tcpVal,
              web: webVal,
              target_url: targetUrl,
            };
            recordResult(tcpVal, webVal);

            if (tcp !== undefined && tcp !== null) {
              if (web !== undefined && web !== null) {
                pingModal.statusMap[id] = web;
                pingModal.logs.push(
                  `[${node.tag}] 传输延迟: ${tcp}ms, 网页延迟: ${web}ms`,
                );
              } else if (!systemModeInfo.value.kernel_installed) {
                pingModal.statusMap[id] = tcp;
                pingModal.logs.push(
                  `[${node.tag}] 传输延迟: ${tcp}ms (未安装内核，已跳过网页测速)`,
                );
              } else {
                pingModal.statusMap[id] = "failed";
                pingModal.logs.push(
                  `[${node.tag}] 传输延迟: ${tcp}ms, 网页测试失败`,
                );
              }
            } else if (web !== undefined && web !== null) {
              pingModal.statusMap[id] = web;
              pingModal.logs.push(
                `[${node.tag}] 传输探测未响应, 网页延迟: ${web}ms`,
              );
            } else {
              pingModal.statusMap[id] = "failed";
              pingModal.logs.push(`[${node.tag}] 传输层探测超时`);
            }
          } else if (pingModal.testType === "web") {
            const latency = item.latency;
            const webVal =
              latency !== undefined && latency !== null ? latency : null;
            const latObj =
              latencyMap.value[id] && typeof latencyMap.value[id] === "object"
                ? latencyMap.value[id]
                : {};
            latencyMap.value[id] = {
              ...latObj,
              web: webVal,
              target_url: targetUrl,
            };
            recordResult(null, webVal);

            if (latency !== undefined && latency !== null) {
              pingModal.statusMap[id] = latency;
              pingModal.logs.push(`[${node.tag}] 网页延迟: ${latency}ms`);
            } else {
              pingModal.statusMap[id] = "failed";
              pingModal.logs.push(`[${node.tag}] 网页测试失败 (超时或无连接)`);
            }
          } else {
            const latency = item.latency;
            const tcpVal =
              latency !== undefined && latency !== null ? latency : null;
            const latObj =
              latencyMap.value[id] && typeof latencyMap.value[id] === "object"
                ? latencyMap.value[id]
                : {};
            latencyMap.value[id] = {
              ...latObj,
              tcp: tcpVal,
            };
            recordResult(tcpVal, null);

            if (latency !== undefined && latency !== null) {
              pingModal.statusMap[id] = latency;
              pingModal.logs.push(`[${node.tag}] TCP 延迟: ${latency}ms`);
            } else {
              pingModal.statusMap[id] = "failed";
              pingModal.logs.push(`[${node.tag}] TCP 测试失败 (超时或无连接)`);
            }
          }
        } else {
          pingModal.statusMap[id] = "failed";
          setFailedStatus(id);
          recordResult(null, null);
          pingModal.logs.push(`[${node.tag}] 接口未返回数据`);
        }
      } else {
        pingModal.statusMap[id] = "failed";
        setFailedStatus(id);
        recordResult(null, null);
        const errText = await res.text();
        pingModal.logs.push(
          `[${node.tag}] ${errText || `接口错误 (${res.status})`}`,
        );
      }
    } catch (e) {
      if (!pingModal.isTesting) {
        activeCount--;
        return;
      }
      pingModal.statusMap[id] = "failed";
      setFailedStatus(id);
      recordResult(null, null);
      pingModal.logs.push(`[${node.tag}] 网络错误: ${e.message || e}`);
    } finally {
      activeCount--;
      pingModal.progress++;
      if (queue.length > 0 && pingModal.isTesting) {
        runNext();
      } else if (activeCount === 0) {
        pingModal.isTesting = false;
        pingModal.completedAt = new Date().toLocaleTimeString();
        pingModal.logs.push("测试完成。");

        if (pingSummaryStats.value) {
          lastSpeedTestSummary.value = {
            ...pingSummaryStats.value,
            time: pingModal.completedAt,
            results: [...pingModal.results],
            testType: pingModal.testType,
            targetUrl,
          };
          showSummaryBanner.value = true;
        }

        loadNodes();
      }
    }
  };

  const initialCount = Math.min(concurrency, queue.length);
  for (let i = 0; i < initialCount; i++) {
    runNext();
  }
};

onMounted(() => {
  loadNodes();
  loadSubscriptions();
  loadGlobalSpeedSummary();
});
</script>

<style scoped>
/* Speed test banner on main page */
.speed-test-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.25);
  margin-bottom: 1rem;
  font-size: 0.85rem;
}
.speed-test-banner.is-testing {
  background: rgba(6, 182, 212, 0.08);
  border-color: rgba(6, 182, 212, 0.25);
}
.banner-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.banner-badge {
  font-weight: 600;
  color: var(--primary);
}
.banner-time {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.banner-stat {
  color: var(--text-color);
}
.banner-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.banner-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 0.3rem;
  line-height: 1;
}
.banner-close-btn:hover {
  color: var(--text-color);
}

/* Modal tabs */
.ping-tabs-bar {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.5rem;
}
.ping-tab-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  transition: all 0.15s;
}
.ping-tab-btn:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.04);
}
.ping-tab-btn.active {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.4);
  color: var(--primary);
  font-weight: 600;
}
.tab-badge {
  background: var(--primary);
  color: #fff;
  border-radius: 10px;
  font-size: 0.7rem;
  padding: 0.05rem 0.4rem;
}

/* Metric Cards */
.metric-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
}
.metric-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}
.metric-value {
  font-size: 1.25rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--text-main);
  line-height: 1.2;
}
.metric-sub {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}
.metric-card.success .metric-value {
  color: var(--success);
}
.metric-card.danger .metric-value.text-danger {
  color: var(--danger);
}
.metric-card.info .metric-value {
  color: var(--info);
}
.metric-card.primary .metric-value {
  color: var(--primary);
}

/* Distribution Bar */
.distribution-container {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 1rem;
}
.distribution-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  display: flex;
  overflow: hidden;
  margin-bottom: 0.6rem;
}
.dist-seg {
  height: 100%;
  transition: width 0.3s;
}
.seg-fast {
  background: var(--success);
}
.seg-medium {
  background: var(--info);
}
.seg-slow {
  background: var(--warning);
}
.seg-failed {
  background: var(--danger);
}

.tier-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.tier-chip {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.tier-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
}
.tier-chip.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}

/* Actions bar */
.summary-actions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

/* Ranked results table */
.ranked-results-section {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.ranked-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid var(--border-color);
}
.ranked-table-wrapper {
  max-height: 240px;
  overflow-y: auto;
}
.ranked-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.ranked-table th,
.ranked-table td {
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--border-color);
}
.ranked-table th {
  background: var(--bg-card);
  color: var(--text-muted);
  font-weight: 500;
  position: sticky;
  top: 0;
  z-index: 1;
}
.ranked-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}
.badge-success {
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
}
.badge-info {
  background: rgba(59, 130, 246, 0.15);
  color: var(--info);
}
.badge-warning {
  background: rgba(245, 158, 11, 0.15);
  color: var(--warning);
}
.badge-danger {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}
</style>

