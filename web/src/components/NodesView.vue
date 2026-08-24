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
              style="width: 145px; padding: 0.4rem"
            >
              <option value="all">TCP: 全部</option>
              <option value="success">🚀 高速 (&lt;100ms)</option>
              <option value="info">⚡ 中等 (100-300ms)</option>
              <option value="warn">🐢 高延迟 (&gt;300ms)</option>
              <option value="danger">❌ 异常 (超时)</option>
              <option value="untested">⚪ 未测试</option>
            </select>
            <select
              v-model="webFilter"
              class="input-control"
              style="width: 145px; padding: 0.4rem"
            >
              <option value="all">网页: 全部</option>
              <option value="success">🚀 高速 (&lt;100ms)</option>
              <option value="info">⚡ 中等 (100-300ms)</option>
              <option value="warn">🐢 高延迟 (&gt;300ms)</option>
              <option value="danger">❌ 异常 (超时)</option>
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
                    >
                      TCP: 超时
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
                    >
                      网页: 超时
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
      <div class="modal-card" style="max-width: 550px; width: 90%">
        <div class="modal-header">
          <span>节点延迟测试</span>
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
        <div class="modal-body">
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

          <!-- Progress bar -->
          <div v-if="pingModal.isTesting" style="margin-bottom: 1.25rem">
            <div
              style="
                display: flex;
                justify-content: space-between;
                font-size: 0.85rem;
                margin-bottom: 0.35rem;
                color: var(--text-muted);
              "
            >
              <span
                >测试进度: {{ pingModal.progress }} /
                {{ pingModal.total }}</span
              >
              <span
                >{{
                  Math.round((pingModal.progress / pingModal.total) * 100)
                }}%</span
              >
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
                  width: (pingModal.progress / pingModal.total) * 100 + '%',
                }"
                style="
                  height: 100%;
                  background: var(--primary);
                  transition: width 0.2s;
                "
              ></div>
            </div>
          </div>

          <!-- Logs Output Console -->
          <div v-if="pingModal.logs.length > 0" style="margin-top: 1.25rem">
            <label
              style="
                display: block;
                font-weight: 500;
                margin-bottom: 0.5rem;
                color: var(--text-color);
              "
              >测试日志</label
            >
            <div
              ref="logsConsole"
              style="
                background: #1e1e1e;
                color: #2ecc71;
                font-family: monospace;
                font-size: 0.85rem;
                padding: 0.75rem;
                border-radius: 6px;
                height: 180px;
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from "vue";
import { token, API_BASE, showToast, confirmDialog } from "../store.js";
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
});

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

const openPingModal = () => {
  pingModal.testRange = selectedNodeIds.value.length > 0 ? "selected" : "all";
  pingModal.singleNodeId = "";
  pingModal.testType = "both";
  pingModal.targetUrlSelect = "http://www.gstatic.com/generate_204";
  pingModal.customTargetUrl = "";
  pingModal.isTesting = false;
  pingModal.progress = 0;
  pingModal.total = 0;
  pingModal.logs = [];
  pingModal.statusMap = {};
  pingModal.show = true;
  loadAllNodesForSelect();
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

const pingSingleNode = async (id) => {
  if (pingModal.isTesting) {
    showToast("当前正在进行批量测试，请稍后再试", "warning");
    return;
  }

  const node = nodes.value.find((n) => n.id === id) ||
    allNodesListForSelect.value.find((n) => n.id === id) || {
      tag: `节点 #${id}`,
    };

  const targetUrl = getEffectiveTargetUrl();
  showToast(`开始测试节点 [${node.tag}] ...`);

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
          } else {
            showToast(
              `[${node.tag}] 传输延迟: ${tcp}ms, 网页测试失败`,
              "warning",
            );
          }
        } else if (web !== undefined && web !== null) {
          showToast(`[${node.tag}] 传输层探测超时, 网页延迟: ${web}ms`);
        } else {
          showToast(`[${node.tag}] 传输层与网页测试均超时`, "danger");
        }
      } else {
        setFailedStatus(id);
        showToast(`[${node.tag}] 测试失败: 接口未返回数据`, "danger");
      }
    } else {
      setFailedStatus(id);
      showToast(`[${node.tag}] 接口错误 (状态码: ${res.status})`, "danger");
    }
  } catch (e) {
    setFailedStatus(id);
    showToast(`[${node.tag}] 测试出错: ${e.message || e}`, "danger");
  } finally {
    loadNodes();
  }
};

const startPingTests = async () => {
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

  const targetUrl = getEffectiveTargetUrl();

  pingModal.isTesting = true;
  pingModal.progress = 0;
  pingModal.total = targetNodeIds.length;
  pingModal.logs = ["开始测试..."];

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
            latencyMap.value[id] = {
              tcp: tcp !== undefined && tcp !== null ? tcp : null,
              web: web !== undefined && web !== null ? web : null,
              target_url: targetUrl,
            };
            if (tcp !== undefined && tcp !== null) {
              if (web !== undefined && web !== null) {
                pingModal.statusMap[id] = web;
                pingModal.logs.push(
                  `[${node.tag}] 传输延迟: ${tcp}ms, 网页延迟: ${web}ms`,
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
              pingModal.logs.push(
                `[${node.tag}] 传输层探测与网页测试均失败/超时`,
              );
            }
          } else if (pingModal.testType === "web") {
            const latency = item.latency;
            const latObj =
              latencyMap.value[id] && typeof latencyMap.value[id] === "object"
                ? latencyMap.value[id]
                : {};
            latencyMap.value[id] = {
              ...latObj,
              web: latency !== undefined && latency !== null ? latency : null,
              target_url: targetUrl,
            };
            if (latency !== undefined && latency !== null) {
              pingModal.statusMap[id] = latency;
              pingModal.logs.push(`[${node.tag}] 网页延迟: ${latency}ms`);
            } else {
              pingModal.statusMap[id] = "failed";
              pingModal.logs.push(`[${node.tag}] 网页测试失败 (超时或无连接)`);
            }
          } else {
            const latency = item.latency;
            const latObj =
              latencyMap.value[id] && typeof latencyMap.value[id] === "object"
                ? latencyMap.value[id]
                : {};
            latencyMap.value[id] = {
              ...latObj,
              tcp: latency !== undefined && latency !== null ? latency : null,
            };
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
          pingModal.logs.push(`[${node.tag}] 接口未返回数据`);
        }
      } else {
        pingModal.statusMap[id] = "failed";
        setFailedStatus(id);
        pingModal.logs.push(`[${node.tag}] 接口错误 (状态码: ${res.status})`);
      }
    } catch (e) {
      if (!pingModal.isTesting) {
        activeCount--;
        return;
      }
      pingModal.statusMap[id] = "failed";
      setFailedStatus(id);
      pingModal.logs.push(`[${node.tag}] 请求出错: ${e.message || e}`);
    } finally {
      pingModal.progress++;
      activeCount--;
      if (pingModal.isTesting) {
        await runNext();
      }
    }
  };

  const promises = [];
  const initialCount = Math.min(concurrency, queue.length);
  for (let i = 0; i < initialCount; i++) {
    promises.push(runNext());
  }

  while (pingModal.isTesting && (queue.length > 0 || activeCount > 0)) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (pingModal.isTesting) {
    pingModal.isTesting = false;
    pingModal.logs.push("测试完成。");
    showToast("节点测速完成");
    loadNodes();
  }
};

onMounted(() => {
  loadNodes();
  loadSubscriptions();
});
</script>
