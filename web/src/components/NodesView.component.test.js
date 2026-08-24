// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ============================================================
// Mock 依赖（vi.hoisted 保证 vi.mock 工厂可访问）
// ============================================================

const { mockToken, mockShowToast, mockConfirmDialog, mockValidateData } =
  vi.hoisted(() => {
    const { ref } = require("vue");
    return {
      mockToken: ref("test-token"),
      mockShowToast: vi.fn(),
      mockConfirmDialog: vi.fn(() => Promise.resolve(true)),
      mockValidateData: vi.fn(() => ({ valid: true, errors: null })),
    };
  });

vi.mock("../store.js", () => ({
  API_BASE: "",
  token: mockToken,
  showToast: mockShowToast,
  confirmDialog: mockConfirmDialog,
}));

vi.mock("../validator.js", () => ({
  validateData: mockValidateData,
}));

import NodesView from "./NodesView.vue";

// ============================================================
// 测试数据
// ============================================================

const mockNodes = [
  {
    id: 1,
    tag: "节点A",
    node_type: "vless",
    server: "1.1.1.1",
    port: 443,
    raw_json: JSON.stringify({
      type: "vless",
      tag: "节点A",
      server: "1.1.1.1",
      server_port: 443,
    }),
    enabled: true,
    subscription_id: null,
    is_custom: true,
  },
  {
    id: 2,
    tag: "节点B",
    node_type: "vmess",
    server: "2.2.2.2",
    port: 8080,
    raw_json: JSON.stringify({
      type: "vmess",
      tag: "节点B",
      server: "2.2.2.2",
      server_port: 8080,
    }),
    enabled: false,
    subscription_id: 5,
    is_custom: false,
  },
];

const mockSubscriptions = [
  { id: 5, label: "订阅A", url: "https://example.com/sub", enabled: true },
];

// ============================================================
// Fetch mock 工厂
// ============================================================

function createMockFetch(opts = {}) {
  const {
    nodes = mockNodes,
    total = mockNodes.length,
    subscriptions = mockSubscriptions,
  } = opts;
  return vi.fn((url) => {
    const urlStr = String(url);
    const path = urlStr.split("?")[0];
    let body;
    if (path === "/api/nodes" && urlStr.includes("page=")) {
      // GET /api/nodes?page=1&limit=10&search=
      body = { nodes, total };
    } else if (path === "/api/subscriptions") {
      body = subscriptions;
    } else if (path === "/api/nodes" && !urlStr.includes("page=")) {
      // POST /api/nodes (新增)
      body = { ok: true };
    } else if (path.match(/^\/api\/nodes\/\d+$/)) {
      // PUT/DELETE /api/nodes/:id
      body = { ok: true };
    } else if (path === "/api/nodes/batch-delete") {
      body = { ok: true };
    } else {
      body = { ok: true };
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
// 辅助：mount 组件
// ============================================================

async function mountNodesView(fetchMock = createMockFetch()) {
  vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  const wrapper = mount(NodesView);
  // onMounted 触发 loadNodes + loadSubscriptions
  await flushPromises();
  await flushPromises();
  return wrapper;
}

// ============================================================
// 测试用例
// ============================================================

describe("NodesView - 节点池管理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToken.value = "test-token";
  });

  describe("onMounted 加载", () => {
    it("加载节点列表与订阅列表", async () => {
      const wrapper = await mountNodesView();
      // 表格应渲染 2 个节点行
      const rows = wrapper.findAll("tbody tr");
      expect(rows.length).toBe(2);
      // 节点 tag 显示
      expect(wrapper.text()).toContain("节点A");
      expect(wrapper.text()).toContain("节点B");
      // 订阅下拉应含订阅A
      expect(wrapper.text()).toContain("订阅A");
    });

    it("节点池为空时显示空状态文案", async () => {
      const wrapper = await mountNodesView(
        createMockFetch({ nodes: [], total: 0 }),
      );
      expect(wrapper.text()).toContain("节点池为空");
    });

    it("加载失败时 showToast 提示", async () => {
      const failFetch = vi.fn(() =>
        Promise.resolve({ ok: false, status: 500 }),
      );
      vi.spyOn(global, "fetch").mockImplementation(failFetch);
      mount(NodesView);
      await flushPromises();
      await flushPromises();
      expect(mockShowToast).toHaveBeenCalledWith("加载节点池失败", "danger");
    });
  });

  describe("搜索过滤", () => {
    it("输入搜索词触发 loadNodes 并带 search 参数", async () => {
      const wrapper = await mountNodesView();
      // 清空初始调用记录
      global.fetch.mockClear();

      const input = wrapper.find('input[placeholder="搜索节点名称/服务器..."]');
      await input.setValue("vmess");
      await flushPromises();
      // 等 watch 触发
      await flushPromises();

      // fetch 应被调用，且 URL 含 search=vmess
      expect(global.fetch).toHaveBeenCalled();
      const lastCallUrl = String(global.fetch.mock.calls.at(-1)[0]);
      expect(lastCallUrl).toContain("search=vmess");
    });
  });

  describe("启停开关", () => {
    it("切换开关触发 PUT 请求 + showToast 提示", async () => {
      const wrapper = await mountNodesView();
      global.fetch.mockClear();

      // 首行节点的 switch（label.switch 内 input[type=checkbox]）
      const switchInput = wrapper.find('label.switch input[type="checkbox"]');
      // 节点A enabled=true，切换为 false
      await switchInput.setValue(false);

      expect(global.fetch).toHaveBeenCalled();
      const [url, opts] = global.fetch.mock.calls.at(-1);
      expect(url).toBe("/api/nodes/1");
      expect(opts.method).toBe("PUT");
      const body = JSON.parse(opts.body);
      expect(body.enabled).toBe(false);
      expect(mockShowToast).toHaveBeenCalledWith("节点已禁用");
    });
  });

  describe("新增节点", () => {
    it("点击'添加自定义节点'打开 modal", async () => {
      const wrapper = await mountNodesView();
      const btn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加自定义节点"));
      await btn.trigger("click");
      await flushPromises();

      // modal 应有 active class
      const modal = wrapper.find(".modal");
      expect(modal.classes()).toContain("active");
      // modal header 应显示"添加自定义节点"
      expect(wrapper.find(".modal-header").text()).toContain("添加自定义节点");
    });

    it("填写表单 + 提交 → POST /api/nodes + showToast", async () => {
      const wrapper = await mountNodesView();
      // 打开 modal
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加自定义节点"));
      await addBtn.trigger("click");
      await flushPromises();

      global.fetch.mockClear();

      // 填写 tag
      const tagInput = wrapper.find(
        'input[placeholder="例如：My-Custom-Node"]',
      );
      await tagInput.setValue("TestNode");

      // 提交（直接触发 form submit）
      const form = wrapper.find("form");
      await form.trigger("submit.prevent");
      await flushPromises();
      await flushPromises();

      // validateData 应被调用
      expect(mockValidateData).toHaveBeenCalled();

      // 应 POST
      expect(global.fetch).toHaveBeenCalled();
      const postCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/nodes" && o?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const [, opts] = postCall;
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.tag).toBe("TestNode");
      expect(mockShowToast).toHaveBeenCalledWith("自定义节点添加成功");
    });
  });

  describe("删除节点", () => {
    it("点击删除 → confirmDialog → DELETE 请求", async () => {
      const wrapper = await mountNodesView();
      global.fetch.mockClear();

      // 首行的"删除"按钮
      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      // confirmDialog 应被调用
      expect(mockConfirmDialog).toHaveBeenCalled();
      // 找到 DELETE 请求（不是后续的 loadNodes GET）
      const deleteCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).match(/^\/api\/nodes\/\d+$/) && o?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      const [url, opts] = deleteCall;
      expect(url).toBe("/api/nodes/1");
      expect(opts.method).toBe("DELETE");
      expect(mockShowToast).toHaveBeenCalledWith("节点已删除");
    });

    it("confirmDialog 返回 false 时不删除", async () => {
      mockConfirmDialog.mockResolvedValueOnce(false);
      const wrapper = await mountNodesView();
      global.fetch.mockClear();

      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      // 不应触发 DELETE
      const deleteCalls = global.fetch.mock.calls.filter(
        ([u, o]) =>
          String(u).match(/^\/api\/nodes\/\d+$/) && o?.method === "DELETE",
      );
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe("批量删除", () => {
    it("勾选节点后显示批量删除按钮，点击触发 batch-delete", async () => {
      const wrapper = await mountNodesView();
      global.fetch.mockClear();

      // 勾选两个节点的 checkbox（行内 v-model="selectedNodeIds" 的）
      // 每行有 2 个 checkbox（selectedNodeIds + switch），共 4 个
      // selectedNodeIds 的 checkbox 有 :value="node.id" 绑定
      const allCheckboxes = wrapper.findAll('tbody input[type="checkbox"]');
      // 第 0、2 个是 selectedNodeIds（行 1、2），第 1、3 是 switch
      await allCheckboxes[0].setValue(true);
      await allCheckboxes[2].setValue(true);

      // 批量删除按钮应可见
      const batchBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("批量删除"));
      expect(batchBtn).toBeDefined();
      expect(batchBtn.text()).toContain("2");

      // 点击
      await batchBtn.trigger("click");
      await flushPromises();

      // confirmDialog 调用
      expect(mockConfirmDialog).toHaveBeenCalled();
      // 找到 batch-delete POST 请求
      const batchCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/nodes/batch-delete" && o?.method === "POST",
      );
      expect(batchCall).toBeDefined();
      const [, opts] = batchCall;
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.ids).toEqual([1, 2]);
      expect(mockShowToast).toHaveBeenCalledWith("所选节点已批量删除");
    });
  });

  describe("modal 双模式切换", () => {
    it("点击 'JSON 源码' 切换到 JSON 模式", async () => {
      const wrapper = await mountNodesView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加自定义节点"));
      await addBtn.trigger("click");
      await flushPromises();

      // 切换到 JSON
      const jsonBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "JSON 源码");
      await jsonBtn.trigger("click");
      await flushPromises();

      // 应该有 textarea 出现（JSON 编辑器）
      const textarea = wrapper.find("textarea");
      expect(textarea.exists()).toBe(true);
    });
  });

  describe("多选逻辑优化", () => {
    it("当搜索关键字、订阅过滤、每页条数或翻页发生变化时，已选中的节点应该重置为空", async () => {
      // 提供 total: 20 以确保下一页可用
      const fetchMock = createMockFetch({ total: 20 });
      const wrapper = await mountNodesView(fetchMock);

      // 1. 勾选第一个节点
      let allCheckboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await allCheckboxes[0].setValue(true);

      // 确认有已勾选的 id
      expect(wrapper.vm.selectedNodeIds.length).toBe(1);

      // 2. 测试搜索框变化
      const searchInput = wrapper.find(
        'input[placeholder="搜索节点名称/服务器..."]',
      );
      await searchInput.setValue("test-search");
      await flushPromises();

      // 已勾选应该清空
      expect(wrapper.vm.selectedNodeIds).toEqual([]);

      // 3. 再次勾选
      allCheckboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await allCheckboxes[0].setValue(true);
      expect(wrapper.vm.selectedNodeIds.length).toBe(1);

      // 4. 测试订阅下拉框变化
      const subSelect = wrapper.findAll("select")[0];
      await subSelect.setValue("custom");
      await flushPromises();

      expect(wrapper.vm.selectedNodeIds).toEqual([]);

      // 5. 再次勾选
      allCheckboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await allCheckboxes[0].setValue(true);
      expect(wrapper.vm.selectedNodeIds.length).toBe(1);

      // 6. 测试每页条数(nodeLimit)变化
      const limitSelect = wrapper.findAll("select")[1]; // 第二个 select 是每页条数限制
      await limitSelect.setValue(5);
      await flushPromises();

      expect(wrapper.vm.selectedNodeIds).toEqual([]);

      // 7. 再次勾选
      allCheckboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await allCheckboxes[0].setValue(true);
      expect(wrapper.vm.selectedNodeIds.length).toBe(1);

      // 8. 测试翻页变化 (下一页)
      const nextBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("下一页"));
      expect(nextBtn.element.disabled).toBe(false);
      await nextBtn.trigger("click");
      await flushPromises();

      expect(wrapper.vm.selectedNodeIds).toEqual([]);
    });
  });

  describe("节点测速功能与测试目标网址下拉选择", () => {
    it("打开节点测速 Modal，显示 8 个预设目标网址和自定义选项，默认选中 Google（通用）", async () => {
      const wrapper = await mountNodesView();
      const pingBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("节点测速"));
      expect(pingBtn).toBeDefined();

      await pingBtn.trigger("click");
      await flushPromises();

      expect(wrapper.vm.pingModal.show).toBe(true);

      // 下拉选框
      const targetSelect = wrapper
        .findAll("select")
        .find((s) => s.html().includes("http://www.gstatic.com/generate_204"));
      expect(targetSelect).toBeDefined();

      // 验证包含预设的目标网址选项
      const options = targetSelect.findAll("option");
      const optionValues = options.map((o) => o.element.value);
      expect(optionValues).toContain("http://www.gstatic.com/generate_204");
      expect(optionValues).toContain(
        "http://connectivitycheck.gstatic.com/generate_204",
      );
      expect(optionValues).toContain(
        "http://connectivitycheck.android.com/generate_204",
      );
      expect(optionValues).toContain("http://cp.cloudflare.com/generate_204");
      expect(optionValues).toContain(
        "http://www.msftconnecttest.com/connecttest.txt",
      );
      expect(optionValues).toContain(
        "http://captive.apple.com/hotspot-detect.html",
      );
      expect(optionValues).toContain(
        "http://detectportal.firefox.com/success.txt",
      );
      expect(optionValues).toContain("http://connectivity-check.ubuntu.com");
      expect(optionValues).toContain("custom");

      // 默认选中为 http://www.gstatic.com/generate_204
      expect(wrapper.vm.pingModal.targetUrlSelect).toBe(
        "http://www.gstatic.com/generate_204",
      );
    });

    it("切换选择预设或自定义网址，开始测速时发送正确的 target_url", async () => {
      const wrapper = await mountNodesView();
      const pingBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("节点测速"));
      await pingBtn.trigger("click");
      await flushPromises();

      // 切换选择 Cloudflare 预设
      const targetSelect = wrapper
        .findAll("select")
        .find((s) => s.html().includes("http://www.gstatic.com/generate_204"));
      await targetSelect.setValue("http://cp.cloudflare.com/generate_204");
      await flushPromises();

      // 点击开始测试
      const startBtn = wrapper
        .findAll(".modal button")
        .find((b) => b.text().includes("开始测试"));
      await startBtn.trigger("click");
      await flushPromises();

      // 检查 /api/nodes/ping 请求体
      const pingCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/nodes/ping" && o?.method === "POST",
      );
      expect(pingCall).toBeDefined();
      const body = JSON.parse(pingCall[1].body);
      expect(body.target_url).toBe("http://cp.cloudflare.com/generate_204");
    });

    it("选择自定义网址模式，能输入自定义 URL 并发送", async () => {
      const wrapper = await mountNodesView();
      const pingBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("节点测速"));
      await pingBtn.trigger("click");
      await flushPromises();

      // 切换到 custom
      const targetSelect = wrapper
        .findAll("select")
        .find((s) => s.html().includes("http://www.gstatic.com/generate_204"));
      await targetSelect.setValue("custom");
      await flushPromises();

      // 输入框出现
      const customInput = wrapper.find(
        'input[placeholder="请输入自定义 HTTP(S) 测试目标网址"]',
      );
      expect(customInput.exists()).toBe(true);

      await customInput.setValue("http://my-custom-server.org/ping");
      await flushPromises();

      // 点击开始测试
      global.fetch.mockClear();
      const startBtn = wrapper
        .findAll(".modal button")
        .find((b) => b.text().includes("开始测试"));
      await startBtn.trigger("click");
      await flushPromises();

      const pingCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/nodes/ping" && o?.method === "POST",
      );
      expect(pingCall).toBeDefined();
      const body = JSON.parse(pingCall[1].body);
      expect(body.target_url).toBe("http://my-custom-server.org/ping");
    });
  });
});
