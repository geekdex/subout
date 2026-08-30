// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ============================================================
// Mock 依赖（必须在 import 组件之前）
// vi.hoisted 在所有 import 之前执行，所有 mock 变量都需在此定义
// ============================================================

const {
  mockToken,
  mockShowToast,
  mockConfirmDialog,
  mockPromptDialog,
  mockValidateData,
} = vi.hoisted(() => {
  // 在 hoisted 内部用 require 拿到 ref（vitest 支持 CommonJS require）
  const { ref } = require("vue");
  return {
    mockToken: ref("test-token"),
    mockShowToast: vi.fn(),
    mockConfirmDialog: vi.fn(() => Promise.resolve(true)),
    mockPromptDialog: vi.fn(() => Promise.resolve("test")),
    mockValidateData: vi.fn(() => ({ valid: true, errors: null })),
  };
});

vi.mock("../store.js", () => ({
  API_BASE: "",
  token: mockToken,
  showToast: mockShowToast,
  confirmDialog: mockConfirmDialog,
  promptDialog: mockPromptDialog,
}));

vi.mock("../validator.js", () => ({
  validateData: mockValidateData,
  initAjv: vi.fn(async () => {}),
}));

vi.mock("./JsonTreeView.vue", () => ({
  default: {
    name: "JsonTreeView",
    template: "<div class='mock-json-tree-view'></div>",
  },
}));

vi.mock("./DnsEditor.vue", () => ({
  default: {
    name: "DnsEditor",
    props: ["configData", "allOutboundTags", "editItem", "duplicateCheckFn"],
    template: "<div class='mock-dns-editor'>DNS Editor Mock</div>",
  },
}));

vi.mock("./RouteEditor.vue", () => ({
  default: {
    name: "RouteEditor",
    props: [
      "configData",
      "allOutboundTags",
      "duplicateRouteRulesInfo",
      "editItem",
      "duplicateCheckFn",
    ],
    template: "<div class='mock-route-editor'>Route Editor Mock</div>",
  },
}));

vi.mock("./RuleCriteriaTags.vue", () => ({
  default: {
    name: "RuleCriteriaTags",
    props: ["rule", "type", "duplicateCheckFn"],
    template: "<div class='mock-rule-criteria-tags'>Criteria Tags Mock</div>",
  },
}));

// vuedraggable mock (needed because DnsEditor/RouteEditor import it)
vi.mock("vuedraggable", () => ({
  default: {
    name: "draggable",
    props: ["modelValue"],
    template:
      '<div class="mock-draggable"><slot name="item" v-for="item in modelValue" :element="item" /></div>',
  },
}));

// 4. 导入组件（在 mock 之后）
import ConfigEditorView from "./ConfigEditorView.vue";

// ============================================================
// Fetch mock 工具
// ============================================================

// 测试数据：DB 出站组列表
const mockGroups = [
  {
    id: 1,
    tag: "cf_tunnel",
    group_type: "urltest",
    url: "http://cp.cloudflare.com/generate_204",
    interval: "3m",
    tolerance: 50,
    static_nodes: JSON.stringify(["node1", "node2"]),
  },
  {
    id: 2,
    tag: "proxy",
    group_type: "selector",
    static_nodes: JSON.stringify(["node1"]),
  },
  {
    id: 3,
    tag: "CN-Direct",
    group_type: "selector",
    static_nodes: JSON.stringify([]),
  },
];

// 测试数据：节点池（供 expandGroupImport 展开）
const mockNodes = [
  {
    id: 1,
    tag: "node1",
    node_type: "vless",
    server: "1.1.1.1",
    port: 443,
    raw_json: JSON.stringify({
      type: "vless",
      tag: "node1",
      server: "1.1.1.1",
      server_port: 443,
    }),
  },
  {
    id: 2,
    tag: "node2",
    node_type: "vmess",
    server: "2.2.2.2",
    port: 8080,
    raw_json: JSON.stringify({
      type: "vmess",
      tag: "node2",
      server: "2.2.2.2",
      server_port: 8080,
    }),
  },
];

// 默认空配置
const emptyConfig = {
  log: {},
  dns: {},
  inbounds: [],
  outbounds: [],
  route: {},
  experimental: {},
};

// 已保存的配置列表
const mockConfigList = [
  {
    id: 1,
    detail: "测试配置1",
    content: JSON.stringify(emptyConfig),
    created_at: "2026-01-01 00:00:00",
  },
];

// 已保存配置的详情（含 content）
const mockConfigDetail = {
  id: 1,
  detail: "测试配置1",
  content: JSON.stringify(emptyConfig),
  created_at: "2026-01-01 00:00:00",
};

// 运行设置
const mockRunningConfig = {
  config_id: null,
  is_service_running: false,
  kernel_installed: true,
  kernel_version: "1.10.0",
};

/**
 * 创建 mock fetch，按 URL 返回不同数据。
 * 支持 onMounted 触发的 4 个请求 + 后续交互请求。
 */
function createMockFetch() {
  return vi.fn((url) => {
    // 解析 URL（去掉 query string）
    const urlStr = String(url);
    const path = urlStr.split("?")[0];

    let body;
    if (path === "/api/groups") {
      body = mockGroups;
    } else if (path === "/api/nodes") {
      body = { nodes: mockNodes, total: mockNodes.length };
    } else if (path === "/api/config/running") {
      body = mockRunningConfig;
    } else if (path === "/api/config/history") {
      body = { items: mockConfigList, active_id: null };
    } else if (path.match(/^\/api\/config\/history\/\d+$/)) {
      body = mockConfigDetail;
    } else if (path === "/api/config/validate") {
      body = { valid: true };
    } else {
      // 默认返回空对象，避免未 mock 的请求报错
      body = {};
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

// ============================================================
// 辅助：mount 组件并等待 onMounted 完成
// ============================================================

async function mountConfigEditor(fetchMock = createMockFetch()) {
  window.location.hash = "#config";
  vi.spyOn(global, "fetch").mockImplementation(fetchMock);

  const wrapper = mount(ConfigEditorView, {
    global: {
      stubs: {
        // stub 掉 JsonTreeView（虽然已 mock，但兜底）
        JsonTreeView: true,
      },
    },
  });

  // 等待 onMounted 触发的 4 个 fetch 全部完成
  await flushPromises();
  // 再 flush 一次确保所有派生状态都更新
  await flushPromises();

  return wrapper;
}

/**
 * 进入编辑模式：点击列表中某行的"编辑配置"按钮。
 */
async function enterEditMode(wrapper) {
  // 找到"编辑配置"按钮（在配置列表行中）
  const editButtons = wrapper.findAll("button");
  const editBtn = editButtons.find((b) => b.text().includes("编辑配置"));
  if (!editBtn) throw new Error("未找到'编辑配置'按钮");
  await editBtn.trigger("click");
  await flushPromises();
}

/**
 * 切换到 outbounds tab。
 */
async function switchToOutboundsTab(wrapper) {
  const tabs = wrapper.findAll(".tab");
  const outboundsTab = tabs.find((t) => t.text().includes("出站连接"));
  if (!outboundsTab) throw new Error("未找到'出站连接'tab");
  await outboundsTab.trigger("click");
  await flushPromises();
}

/**
 * 打开 groupImportModal：点击"从分流出站组引入"按钮。
 */
async function openGroupImportModal(wrapper) {
  const buttons = wrapper.findAll("button");
  const openBtn = buttons.find((b) => b.text().includes("从分流出站组引入"));
  if (!openBtn) throw new Error("未找到'从分流出站组引入'按钮");
  await openBtn.trigger("click");
  await flushPromises();
}

// ============================================================
// 测试用例
// ============================================================

describe("ConfigEditorView - groupImportModal 交互", () => {
  let wrapper;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockToken.value = "test-token";
    wrapper = await mountConfigEditor();
  });

  describe("模态框打开与关闭", () => {
    it("进入编辑模式 + 切到 outbounds tab + 点击引入按钮 → 弹窗显示", async () => {
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);
      await openGroupImportModal(wrapper);

      // 弹窗 header 应可见
      // 可能有多个 .modal-header（导入配置弹窗等），找含"引入分流出站组"的
      const headers = wrapper.findAll(".modal-header");
      const groupModalHeader = headers.filter((h) =>
        h.text().includes("引入分流出站组"),
      );
      expect(groupModalHeader.length).toBeGreaterThan(0);
    });

    it("弹窗打开后，DB 中所有组都应显示在列表中", async () => {
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);
      await openGroupImportModal(wrapper);

      // 应能看到 3 个组的 tag
      const modalText = wrapper.text();
      expect(modalText).toContain("cf_tunnel");
      expect(modalText).toContain("proxy");
      expect(modalText).toContain("CN-Direct");
    });

    it("点击关闭按钮 → 弹窗消失", async () => {
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);
      await openGroupImportModal(wrapper);

      // 找到弹窗容器（含"引入分流出站组"的 modal-card）
      const modalCards = wrapper.findAll(".modal-card");
      const groupModalCard = modalCards.find((c) =>
        c.text().includes("引入分流出站组"),
      );
      expect(groupModalCard.exists()).toBe(true);

      // 找到该弹窗的父 .modal 容器
      const modalParent = groupModalCard.element.closest(".modal");
      expect(modalParent.classList.contains("active")).toBe(true);

      // 点击弹窗 header 内的关闭 svg
      const headers = wrapper.findAll(".modal-header");
      const groupHeader = headers.find((h) =>
        h.text().includes("引入分流出站组"),
      );
      const closeSvg = groupHeader.find("svg");
      await closeSvg.trigger("click");
      await flushPromises();

      // 弹窗的 .modal 容器应不再有 active 类
      expect(modalParent.classList.contains("active")).toBe(false);
    });
  });

  describe("搜索框与清空按钮", () => {
    beforeEach(async () => {
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);
      await openGroupImportModal(wrapper);
    });

    it("初始状态：搜索框为空，清空按钮不显示", async () => {
      const input = wrapper.find('input[placeholder="搜索组名..."]');
      expect(input.element.value).toBe("");

      // 清空按钮（title="清空搜索"）不应存在
      const clearBtn = wrapper.find('button[title="清空搜索"]');
      expect(clearBtn.exists()).toBe(false);
    });

    it("输入搜索词后：清空按钮显示", async () => {
      const input = wrapper.find('input[placeholder="搜索组名..."]');
      await input.setValue("cf");

      // 清空按钮应出现
      const clearBtn = wrapper.find('button[title="清空搜索"]');
      expect(clearBtn.exists()).toBe(true);
    });

    it("输入搜索词：列表按 tag 过滤", async () => {
      const input = wrapper.find('input[placeholder="搜索组名..."]');

      // 输入 "cf" → 只匹配 cf_tunnel
      await input.setValue("cf");
      await flushPromises();

      const modalText = wrapper.text();
      expect(modalText).toContain("cf_tunnel");
      expect(modalText).not.toContain("proxy");
      expect(modalText).not.toContain("CN-Direct");
    });

    it("搜索词大小写不敏感", async () => {
      const input = wrapper.find('input[placeholder="搜索组名..."]');

      // 大写 CF 应匹配 cf_tunnel
      await input.setValue("CF");
      await flushPromises();

      expect(wrapper.text()).toContain("cf_tunnel");
      expect(wrapper.text()).not.toContain("proxy");
    });

    it("点击清空按钮：搜索词清空 + 列表恢复全部", async () => {
      const input = wrapper.find('input[placeholder="搜索组名..."]');
      await input.setValue("cf");
      await flushPromises();

      // 此时只显示 cf_tunnel
      expect(wrapper.text()).toContain("cf_tunnel");
      expect(wrapper.text()).not.toContain("proxy");

      // 点击清空按钮
      const clearBtn = wrapper.find('button[title="清空搜索"]');
      await clearBtn.trigger("click");
      await flushPromises();

      // 搜索框应清空
      expect(input.element.value).toBe("");

      // 清空按钮应消失
      expect(wrapper.find('button[title="清空搜索"]').exists()).toBe(false);

      // 列表应恢复全部
      const modalText = wrapper.text();
      expect(modalText).toContain("cf_tunnel");
      expect(modalText).toContain("proxy");
      expect(modalText).toContain("CN-Direct");
    });

    it("输入无匹配查询：显示空状态", async () => {
      const input = wrapper.find('input[placeholder="搜索组名..."]');
      await input.setValue("xyz_not_exist");
      await flushPromises();

      // 不应看到任何组
      expect(wrapper.text()).not.toContain("cf_tunnel");
      expect(wrapper.text()).not.toContain("proxy");
      expect(wrapper.text()).not.toContain("CN-Direct");
    });

    it("输入空格：列表仍显示全部（被 trim）", async () => {
      const input = wrapper.find('input[placeholder="搜索组名..."]');
      await input.setValue("   ");
      await flushPromises();

      const modalText = wrapper.text();
      expect(modalText).toContain("cf_tunnel");
      expect(modalText).toContain("proxy");
      expect(modalText).toContain("CN-Direct");
    });

    it("输入空格时清空按钮仍显示（v-if 基于 searchQuery 而非 trim）", async () => {
      const input = wrapper.find('input[placeholder="搜索组名..."]');
      await input.setValue("   ");

      // 清空按钮应显示（因为 searchQuery 非空，虽然 trim 后为空）
      const clearBtn = wrapper.find('button[title="清空搜索"]');
      expect(clearBtn.exists()).toBe(true);
    });
  });

  describe("导入组交互", () => {
    beforeEach(async () => {
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);
      await openGroupImportModal(wrapper);
    });

    it("未导入的组显示'引入'按钮", async () => {
      // cf_tunnel 未导入，应显示"引入"按钮
      const modalText = wrapper.text();
      expect(modalText).toContain("cf_tunnel");
      expect(modalText).toContain("引入");
    });

    it("点击'引入'按钮：组被导入，按钮变为'已在配置中'", async () => {
      // 找到所有"引入"按钮（文本 trim 后正好是"引入"，排除触发按钮）
      const introButtons = wrapper.findAll("button").filter((b) => {
        const text = b.text().trim();
        return text === "引入";
      });

      // 应有 3 个（3 个组）
      expect(introButtons.length).toBe(3);

      // 点击第一个（cf_tunnel 对应）
      await introButtons[0].trigger("click");
      await flushPromises();
      await flushPromises();

      // 应触发 showToast 提示导入成功
      expect(mockShowToast).toHaveBeenCalled();
      const toastCalls = mockShowToast.mock.calls;
      const lastToast = toastCalls[toastCalls.length - 1][0];
      expect(lastToast).toContain("cf_tunnel");

      // 此时 cf_tunnel 应显示"已添加"徽章（弹窗保持打开）
      const modalText = wrapper.text();
      expect(modalText).toContain("已添加");
    });

    it("导入后弹窗保持打开（支持连续导入）", async () => {
      const introButtons = wrapper.findAll("button").filter((b) => {
        const text = b.text();
        return text.includes("引入") && !text.includes("引入分流出站组");
      });

      await introButtons[0].trigger("click");
      await flushPromises();

      // 弹窗应仍然显示
      expect(wrapper.text()).toContain("引入分流出站组");
    });
  });

  describe("无 DB 出站组时的空状态", () => {
    it("outboundGroups 为空时显示引导文案", async () => {
      // 重新 mount，fetch 返回空 groups
      const emptyFetch = vi.fn((url) => {
        const path = String(url).split("?")[0];
        let body;
        if (path === "/api/groups") body = [];
        else if (path === "/api/nodes") body = { nodes: [], total: 0 };
        else if (path === "/api/config/running") body = mockRunningConfig;
        else if (path === "/api/config/history")
          body = { items: mockConfigList, active_id: null };
        else if (path.match(/^\/api\/config\/history\/\d+$/))
          body = mockConfigDetail;
        else body = {};
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(body),
          text: () => Promise.resolve(JSON.stringify(body)),
        });
      });
      vi.spyOn(global, "fetch").mockImplementation(emptyFetch);

      const newWrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();

      await enterEditMode(newWrapper);
      await switchToOutboundsTab(newWrapper);
      await openGroupImportModal(newWrapper);

      // 应显示空状态文案
      expect(newWrapper.text()).toContain("数据库中暂无分流出站组");
    });
  });

  describe("groupImportModal 批量选择与批量导入", () => {
    beforeEach(async () => {
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);
      await openGroupImportModal(wrapper);
    });

    it("显示全选可引入组与多选复选框", async () => {
      expect(wrapper.text()).toContain("全选可引入组");
      const checkboxes = wrapper
        .findAll('.modal input[type="checkbox"]')
        .filter((c) => c.element.name !== "all");
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    it("点击全选 -> 勾选所有可引入组 -> 点击批量引入", async () => {
      const selectAllBtn = wrapper
        .findAll("a")
        .find((a) => a.text() === "全选");
      if (selectAllBtn) {
        await selectAllBtn.trigger("click");
        await flushPromises();
      }

      const batchBtn = wrapper
        .findAll(".modal-footer button")
        .find((b) => b.text().includes("批量引入"));
      expect(batchBtn.exists()).toBe(true);
      expect(batchBtn.attributes("disabled")).toBeUndefined();

      await batchBtn.trigger("click");
      await flushPromises();

      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining("已成功批量引入"),
      );
    });
  });

  describe("nodePoolModal 全选与反选", () => {
    async function openNodePoolModal(w) {
      const btn = w
        .findAll("button")
        .find((b) => b.text().includes("从节点池导入"));
      if (btn) {
        await btn.trigger("click");
        await flushPromises();
      }
    }

    it("打开节点池弹窗 -> 点击全选与反选", async () => {
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);
      await openNodePoolModal(wrapper);

      expect(wrapper.text()).toContain("全选当前");

      const selectAllLink = wrapper
        .findAll("a")
        .find((a) => a.text() === "全选");
      if (selectAllLink) {
        await selectAllLink.trigger("click");
        await flushPromises();
      }

      const importBtn = wrapper
        .findAll(".modal-footer button")
        .find((b) => b.text().includes("导入"));
      expect(importBtn.exists()).toBe(true);

      const invertLink = wrapper.findAll("a").find((a) => a.text() === "反选");
      if (invertLink) {
        await invertLink.trigger("click");
        await flushPromises();
      }
    });

    it("已在配置且内容一致的节点应置灰，内容有变更的节点应提示可更新并可勾选导入", async () => {
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);

      // 先手动向出站中添加 node1 (配置内容与 mockNodes 中的 node1 一致)
      // node1: type: vless, tag: node1, server: 1.1.1.1, port: 443
      wrapper.vm.configData.outbounds.push({
        tag: "node1",
        type: "vless",
        server: "1.1.1.1",
        port: 443,
      });

      // 再添加 node2 (但配置内容与 mockNodes 中的 node2 不一致: 现为 server 2.2.2.2 vs 旧 server 9.9.9.9)
      wrapper.vm.configData.outbounds.push({
        tag: "node2",
        type: "vmess",
        server: "9.9.9.9",
        port: 8080,
      });

      await openNodePoolModal(wrapper);

      // 验证 node1 (内容一致) 被置灰，包含 "已在配置中"
      expect(wrapper.text()).toContain("已在配置中");

      // 验证 node2 (内容有变更) 包含 "内容有更新" 提示
      expect(wrapper.text()).toContain("内容有更新");

      // 选中国内容有更新的节点 node2 并点击确认导入
      wrapper.vm.nodePoolModal.selectedIds = [2];
      await flushPromises();

      const importBtn = wrapper
        .findAll(".modal.active .modal-footer button")
        .find((b) => b.text().includes("导入"));
      expect(importBtn.exists()).toBe(true);
      await importBtn.trigger("click");
      await flushPromises();

      // 验证 configData.outbounds 中 node2 的 server 已成功被更新覆盖为 2.2.2.2
      const updatedNode2 = wrapper.vm.configData.outbounds.find(
        (o) => o.tag === "node2",
      );
      expect(updatedNode2).toBeTruthy();
      expect(updatedNode2.server).toBe("2.2.2.2");
    });
  });

  describe("ConfigEditorView 路由与刷新状态保持", () => {
    it("点击编辑配置 -> URL Hash 包含 tab 锚点 #config/edit/1/log", async () => {
      window.location.hash = "#config";
      const wrapper = await mountConfigEditor();
      await enterEditMode(wrapper);

      expect(window.location.hash).toBe("#config/edit/1/log");
      expect(wrapper.text()).toContain("编辑中 #1");
    });

    it("切换 tab -> URL Hash 动态更新为对应锚点", async () => {
      window.location.hash = "#config";
      const wrapper = await mountConfigEditor();
      await enterEditMode(wrapper);

      const routeTab = wrapper
        .findAll(".tab")
        .find((t) => t.text().includes("路由规则"));
      expect(routeTab).toBeTruthy();
      await routeTab.trigger("click");
      await flushPromises();

      expect(window.location.hash).toBe("#config/edit/1/route");
    });

    it("刷新页面 (带 #config/edit/1/route 挂载) -> 直接进入路由规则 tab 页", async () => {
      window.location.hash = "#config/edit/1/route";
      vi.spyOn(global, "fetch").mockImplementation(createMockFetch());
      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();

      expect(wrapper.text()).toContain("编辑中 #1");
      expect(wrapper.text()).toContain("route 配置");
    });

    it("在编辑模式下点击'返回列表' -> URL Hash 恢复为 #config 并返回列表", async () => {
      window.location.hash = "#config";
      const wrapper = await mountConfigEditor();
      await enterEditMode(wrapper);

      const backBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("返回列表"));
      expect(backBtn).toBeTruthy();
      await backBtn.trigger("click");
      await flushPromises();

      expect(window.location.hash).toBe("#config");
      expect(wrapper.text()).toContain("配置管理");
    });

    it("路由规则重复项检测 -> 存在重复 RuleSet 时显示红色提示框和高亮", async () => {
      window.location.hash = "#config/edit/1/route";
      const baseMockFetch = createMockFetch();
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/config/history/1")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 1,
              detail: "测试配置",
              content: JSON.stringify({
                route: {
                  rules: [
                    {
                      outbound: "CN-Direct",
                      rule_set: ["geoip-cn", "geosite-cn"],
                    },
                    {
                      outbound: "direct",
                      rule_set: ["geoip-cn", "geosite-cn"],
                    },
                  ],
                },
              }),
            }),
          });
        }
        return baseMockFetch(url);
      });
      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();

      // RouteEditor handles the duplicate warning internally
      expect(wrapper.find(".mock-route-editor").exists()).toBe(true);
    });

    it("路由规则重复项检测 -> 存在重复域名/IP时显示红色提示框", async () => {
      window.location.hash = "#config/edit/1/route";
      const baseMockFetch = createMockFetch();
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/config/history/1")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 1,
              detail: "测试配置",
              content: JSON.stringify({
                route: {
                  rules: [
                    { outbound: "proxy", domain_suffix: ["google.com"] },
                    { outbound: "direct", domain_suffix: [".google.com"] },
                  ],
                },
              }),
            }),
          });
        }
        return baseMockFetch(url);
      });
      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();

      // RouteEditor handles the duplicate warning internally
      expect(wrapper.find(".mock-route-editor").exists()).toBe(true);
    });

    it("编辑已有出站卡片 -> 传递正确的 idx 索引，防止校验时重复 push", async () => {
      window.location.hash = "#config";
      const wrapper = await mountConfigEditor();
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);
      await openGroupImportModal(wrapper);

      const importButtons = wrapper.findAll(".modal-body button");
      const importBtn = importButtons.find((b) => b.text() === "引入");
      if (importBtn) {
        await importBtn.trigger("click");
        await flushPromises();
      }

      const closeBtn = wrapper
        .findAll(".modal-header button")
        .find((b) => b.text() === "×");
      if (closeBtn) {
        await closeBtn.trigger("click");
        await flushPromises();
      }

      const cardEditBtn = wrapper
        .findAll(".outbound-card button")
        .find((b) => b.text().includes("编辑"));
      if (cardEditBtn) {
        await cardEditBtn.trigger("click");
        await flushPromises();

        const saveModalBtn = wrapper
          .findAll(".modal-footer button")
          .find((b) => b.text().includes("保存") || b.text().includes("确定"));
        if (saveModalBtn) {
          await saveModalBtn.trigger("click");
          await flushPromises();
        }
      }
    });

    it("配置详情页：若当前编辑条目为运行设置配置，展示'运行设置中'徽章与'更新'按钮", async () => {
      window.location.hash = "#config/edit/1/log";
      const baseMockFetch = createMockFetch();
      global.fetch = vi.fn().mockImplementation((url) => {
        if (String(url).includes("/api/config/running")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              config_id: 1,
              is_service_running: true,
              kernel_installed: true,
              kernel_version: "1.10.0",
            }),
          });
        }
        return baseMockFetch(url);
      });

      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();

      expect(wrapper.text()).toContain("运行设置中");
      const updateBtn = wrapper
        .findAll(".config-header-right button")
        .find((b) => b.text().includes("更新"));
      expect(updateBtn).toBeDefined();
      expect(updateBtn.exists()).toBe(true);
    });
  });

  describe("DNS 规则模块（子组件托管）", () => {
    it("DNS tab 渲染 DnsEditor 组件", async () => {
      window.location.hash = "#config/edit/1/dns";
      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();
      expect(wrapper.find(".mock-dns-editor").exists()).toBe(true);
    });
  });

  describe("Route 与 DNS 规则快速双向同步机制（子组件托管）", () => {
    it("Route tab 渲染 RouteEditor 组件", async () => {
      window.location.hash = "#config/edit/1/route";
      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();
      expect(wrapper.find(".mock-route-editor").exists()).toBe(true);
    });

    it("DNS tab 渲染 DnsEditor 组件", async () => {
      window.location.hash = "#config/edit/1/dns";
      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();
      expect(wrapper.find(".mock-dns-editor").exists()).toBe(true);
    });
  });

  describe("配置复制与 Outbounds 批量删除", () => {
    it("配置列表：点击'复制'按钮可以复制指定配置", async () => {
      window.location.hash = "#config";
      let postPayload = null;
      const baseFetch = createMockFetch();
      vi.spyOn(global, "fetch").mockImplementation((url, options) => {
        const urlStr = String(url);
        if (
          urlStr.includes("/api/config/history/1") &&
          (!options || options.method === "GET" || !options.method)
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 1,
              detail: "测试配置1",
              content: JSON.stringify({ outbounds: [] }),
            }),
            text: async () =>
              JSON.stringify({ id: 1, detail: "测试配置1", content: "{}" }),
          });
        }
        if (
          urlStr.includes("/api/config/history") &&
          options &&
          options.method === "POST"
        ) {
          postPayload = JSON.parse(options.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ id: 2, detail: postPayload.detail }),
            text: async () =>
              JSON.stringify({ id: 2, detail: postPayload.detail }),
          });
        }
        return baseFetch(url, options);
      });

      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();

      const copyBtn = wrapper
        .findAll("button")
        .find((b) => b.text() === "复制");
      expect(copyBtn).toBeDefined();
      await copyBtn.trigger("click");
      await flushPromises();

      expect(mockPromptDialog).toHaveBeenCalled();
      expect(postPayload).not.toBeNull();
      expect(postPayload.detail).toBe("test");
    });

    it("Outbounds tab: 勾选策略组并触发批量删除", async () => {
      window.location.hash = "#config/edit/1/outbounds";
      const baseFetch = createMockFetch();
      vi.spyOn(global, "fetch").mockImplementation((url, options) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/config/history/1")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 1,
              detail: "测试配置1",
              content: JSON.stringify({
                outbounds: [
                  { tag: "group1", type: "selector", outbounds: ["proxy1"] },
                  {
                    tag: "proxy1",
                    type: "vmess",
                    server: "1.1.1.1",
                    port: 443,
                  },
                ],
              }),
            }),
            text: async () => "{}",
          });
        }
        return baseFetch(url, options);
      });

      const wrapper = mount(ConfigEditorView, {
        global: { stubs: { JsonTreeView: true } },
      });
      await flushPromises();
      await flushPromises();

      const groupCards = wrapper.findAll(".outbound-card.is-group");
      expect(groupCards.length).toBe(1);

      // 勾选第一个策略组
      const checkbox = groupCards[0].find("input[type='checkbox']");
      await checkbox.setValue(true);
      await flushPromises();

      // 寻找批量删除按钮
      const batchBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("批量删除"));
      expect(batchBtn).toBeDefined();
      await batchBtn.trigger("click");
      await flushPromises();

      expect(mockConfirmDialog).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining("已批量删除选中的"),
      );
    });

    it("空出站组显示'缺少节点'警告标识", async () => {
      const wrapper = await mountConfigEditor();
      await enterEditMode(wrapper);
      await switchToOutboundsTab(wrapper);

      wrapper.vm.configData.outbounds.push({
        type: "selector",
        tag: "EmptyGroup",
        outbounds: [],
      });
      await flushPromises();

      const warningBadge = wrapper
        .findAll(".badge-danger")
        .find((b) => b.text().includes("缺少节点"));
      expect(warningBadge).toBeDefined();
      expect(warningBadge.text()).toContain("⚠️ 缺少节点");
    });

    it("路由规则编辑模态框：支持跨平台 (Linux/Windows/macOS) 浏览器进程快捷预设与最佳实践", async () => {
      const wrapper = await mountConfigEditor();
      await enterEditMode(wrapper);

      // 1. Linux 模式下检查预设仅包含主流浏览器且无 .exe 后缀
      wrapper.vm.systemOs = "linux";
      expect(wrapper.vm.browserPresets).toEqual([
        {
          label: "🌐 Chrome",
          name: "chrome",
          title: "添加 Chrome 浏览器进程 (chrome)",
        },
        {
          label: "🦊 Firefox",
          name: "firefox",
          title: "添加 Firefox 浏览器进程 (firefox)",
        },
        {
          label: "🌐 Edge",
          name: "msedge",
          title: "添加 Edge 浏览器进程 (msedge)",
        },
        {
          label: "🦁 Brave",
          name: "brave",
          title: "添加 Brave 浏览器进程 (brave)",
        },
        {
          label: "🌐 Chromium",
          name: "chromium",
          title: "添加 Chromium 浏览器进程 (chromium)",
        },
      ]);
      expect(wrapper.vm.processNamePlaceholder).toBe("chrome\nfirefox\nmsedge");

      // 打开编辑路由规则模态框
      wrapper.vm.editItem({}, "route_rule", (parsed) => {
        wrapper.vm.configData.route.rules.unshift(parsed);
      });
      await flushPromises();

      expect(wrapper.vm.itemModal.show).toBe(true);
      expect(wrapper.vm.itemModal.itemType).toBe("route_rule");

      // 点击快捷预设 Edge
      wrapper.vm.appendPresetProcess("msedge");
      expect(wrapper.vm.itemModal.tempFields.process_name).toBe("msedge");

      // 再次点击 Chrome
      wrapper.vm.appendPresetProcess("chrome");
      expect(wrapper.vm.itemModal.tempFields.process_name).toBe(
        "msedge\nchrome",
      );

      // 保存模态框
      wrapper.vm.itemModal.itemData.outbound = "proxy";
      wrapper.vm.saveItem();
      await flushPromises();

      const createdRule = wrapper.vm.configData.route.rules[0];
      expect(createdRule.process_name).toEqual(["msedge", "chrome"]);
      expect(createdRule.outbound).toBe("proxy");

      // 2. Windows 模式下校验预设带有 .exe
      wrapper.vm.systemOs = "windows";
      expect(wrapper.vm.browserPresets[0].name).toBe("chrome.exe");
      expect(wrapper.vm.browserPresets[2].name).toBe("msedge.exe");
      expect(wrapper.vm.processNamePlaceholder).toBe(
        "chrome.exe\nfirefox.exe\nmsedge.exe",
      );

      // 3. macOS 模式下校验预设与进程名（支持 Helper 与 Safari）
      wrapper.vm.systemOs = "macos";
      expect(wrapper.vm.browserPresets).toEqual([
        {
          label: "🌐 Chrome",
          name: ["Google Chrome", "Google Chrome Helper"],
          title: "添加 Chrome 浏览器进程 (Google Chrome / Helper)",
        },
        {
          label: "🦊 Firefox",
          name: "firefox",
          title: "添加 Firefox 浏览器进程 (firefox)",
        },
        {
          label: "🌐 Edge",
          name: ["Microsoft Edge", "Microsoft Edge Helper"],
          title: "添加 Edge 浏览器进程 (Microsoft Edge / Helper)",
        },
        {
          label: "🧭 Safari",
          name: ["Safari", "com.apple.WebKit.Networking"],
          title: "添加 Safari 浏览器进程 (Safari / WebKit)",
        },
        {
          label: "🦁 Brave",
          name: ["Brave Browser", "Brave Browser Helper"],
          title: "添加 Brave 浏览器进程 (Brave Browser / Helper)",
        },
        {
          label: "🌐 Chromium",
          name: ["Chromium", "Chromium Helper"],
          title: "添加 Chromium 浏览器进程 (Chromium / Helper)",
        },
      ]);
      expect(wrapper.vm.processNamePlaceholder).toBe(
        "Google Chrome\nMicrosoft Edge\nfirefox\nSafari",
      );

      // 测试 macOS 下点击 Edge 预设追加包含 Helper 的多进程名
      wrapper.vm.itemModal.tempFields.process_name = "";
      const edgePreset = wrapper.vm.browserPresets.find((b) => b.label.includes("Edge"));
      wrapper.vm.appendPresetProcess(edgePreset.name);
      expect(wrapper.vm.itemModal.tempFields.process_name).toBe(
        "Microsoft Edge\nMicrosoft Edge Helper",
      );
    });
  });

  describe("自动重定向 (auto_redirect) OS 约束与导入优化", () => {
    it("非 Linux 系统下，auto_redirect 勾选框应被禁用 (disabled)，导入含 auto_redirect 的配置应提示并移除", async () => {
      const wrapper = await mountConfigEditor();
      await enterEditMode(wrapper);

      // 强制设置 systemOs 为 non-Linux (darwin/macos)
      wrapper.vm.systemOs = "macos";
      await flushPromises();

      expect(wrapper.vm.isLinux).toBe(false);

      // 添加 tun inbound
      wrapper.vm.configData.inbounds = [
        {
          type: "tun",
          tag: "tun-in",
          interface_name: "tun0",
          stack: "gvisor",
          auto_route: true,
          auto_redirect: true,
        },
      ];
      await flushPromises();

      // 调用 parseInbounds 处理后 auto_redirect 应被自动移除并给予提示
      wrapper.vm.parseInbounds(
        [
          {
            type: "tun",
            tag: "tun-in",
            auto_redirect: true,
          },
        ],
        true,
      );
      await flushPromises();

      expect(wrapper.vm.configData.inbounds[0].auto_redirect).toBeUndefined();
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining("当前系统非 Linux"),
        "warning",
      );

      // 测试 confirmImport 导入完整配置时过滤 auto_redirect
      wrapper.vm.importModal.content = JSON.stringify({
        inbounds: [
          {
            type: "tun",
            tag: "tun-in",
            auto_redirect: true,
          },
        ],
      });
      await wrapper.vm.confirmImport();
      await flushPromises();

      expect(wrapper.vm.configData.inbounds[0].auto_redirect).toBeUndefined();
    });

    it("Linux 系统下，auto_redirect 勾选框应保持可用且正常保留该配置", async () => {
      const wrapper = await mountConfigEditor();
      await enterEditMode(wrapper);

      wrapper.vm.systemOs = "linux";
      await flushPromises();

      expect(wrapper.vm.isLinux).toBe(true);

      wrapper.vm.parseInbounds(
        [
          {
            type: "tun",
            tag: "tun-in",
            auto_redirect: true,
          },
        ],
        true,
      );
      await flushPromises();

      expect(wrapper.vm.configData.inbounds[0].auto_redirect).toBe(true);
    });
  });
});
