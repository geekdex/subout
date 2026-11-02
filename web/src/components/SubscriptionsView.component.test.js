// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ============================================================
// Mock 依赖
// ============================================================

const {
  mockToken,
  mockShowToast,
  mockConfirmDialog,
  mockChoiceDialog,
  sharedSubscriptions,
} = vi.hoisted(() => {
  const { ref } = require("vue");
  return {
    mockToken: ref("test-token"),
    mockShowToast: vi.fn(),
    mockConfirmDialog: vi.fn(() => Promise.resolve(true)),
    mockChoiceDialog: vi.fn(() => Promise.resolve("confirm")),
    sharedSubscriptions: ref([]),
  };
});

vi.mock("../store.js", () => ({
  API_BASE: "",
  token: mockToken,
  subscriptions: sharedSubscriptions,
  showToast: mockShowToast,
  confirmDialog: mockConfirmDialog,
  choiceDialog: mockChoiceDialog,
}));

import SubscriptionsView from "./SubscriptionsView.vue";

// ============================================================
// 测试数据
// ============================================================

const mockSubs = [
  {
    id: 1,
    label: "订阅A",
    url: "https://example.com/subA",
    enabled: true,
    filter_keywords: JSON.stringify(["公告", "到期"]),
    delete_on_update: true,
    last_fetched: "2026-01-01 00:00:00",
    last_error: null,
  },
  {
    id: 2,
    label: "订阅B",
    url: "https://example.com/subB",
    enabled: false,
    filter_keywords: "[]",
    delete_on_update: false,
    last_fetched: null,
    last_error: "fetch error",
  },
];

// ============================================================
// Fetch mock 工厂
// ============================================================

function createMockFetch(opts = {}) {
  const { subs = JSON.parse(JSON.stringify(mockSubs)) } = opts;
  return vi.fn((url, options = {}) => {
    const urlStr = String(url);
    const path = urlStr.split("?")[0];
    const method = options.method || "GET";
    let body;
    if (path === "/api/subscriptions") {
      if (method === "GET") body = subs;
      else body = { ok: true }; // POST
    } else if (path === "/api/subscriptions/fetch") {
      body = { success: true, fetched: 5, results: [] };
    } else if (path.match(/^\/api\/subscriptions\/\d+$/)) {
      body = { ok: true }; // PUT/DELETE
    } else if (path === "/api/subscriptions/batch-delete") {
      body = { ok: true };
    } else if (path === "/api/nodes") {
      body = { nodes: [], total: 0 };
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

async function mountSubsView(fetchMock = createMockFetch()) {
  vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  const wrapper = mount(SubscriptionsView);
  await flushPromises();
  await flushPromises();
  return wrapper;
}

// ============================================================
// 测试用例
// ============================================================

describe("SubscriptionsView - 订阅管理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChoiceDialog.mockReset();
    mockChoiceDialog.mockResolvedValue("confirm");
    mockConfirmDialog.mockReset();
    mockConfirmDialog.mockResolvedValue(true);
    mockToken.value = "test-token";
  });

  describe("onMounted 加载", () => {
    it("加载并显示订阅列表", async () => {
      const wrapper = await mountSubsView();
      const rows = wrapper.findAll("tbody tr");
      expect(rows.length).toBe(2);
      expect(wrapper.text()).toContain("订阅A");
      expect(wrapper.text()).toContain("订阅B");
    });

    it("空订阅列表时显示空状态", async () => {
      const wrapper = await mountSubsView(createMockFetch({ subs: [] }));
      expect(wrapper.text()).toContain("暂无");
    });

    it("订阅有错误时显示错误标记（错误内容在 title 属性）", async () => {
      const wrapper = await mountSubsView();
      // 显示"错误 (悬停查看)"标记
      expect(wrapper.text()).toContain("错误");
      // title 属性含具体错误信息
      const errorSpan = wrapper.find(".badge.badge-danger[title]");
      expect(errorSpan.exists()).toBe(true);
      expect(errorSpan.attributes("title")).toBe("fetch error");
    });

    it("正确渲染订阅流量用量与到期时间信息", async () => {
      const mockSubsWithUserinfo = [
        {
          id: 1,
          label: "流量测试订阅",
          url: "https://example.com/subC",
          enabled: true,
          filter_keywords: "[]",
          delete_on_update: true,
          last_fetched: "2026-01-01 00:00:00",
          upload: 1073741824, // 1 GB
          download: 4294967296, // 4 GB
          total: 107374182400, // 100 GB
          expire: Math.floor(Date.now() / 1000) + 86400 * 30,
        },
      ];
      const wrapper = await mountSubsView(
        createMockFetch({ subs: mockSubsWithUserinfo }),
      );
      expect(wrapper.text()).toContain("5.00 GB / 100.00 GB");
      expect(wrapper.text()).toMatch(/剩 (29|30) 天/);
    });
  });

  describe("添加订阅 modal", () => {
    it("点击'添加订阅'按钮打开 modal", async () => {
      const wrapper = await mountSubsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加订阅"));
      await addBtn.trigger("click");
      await flushPromises();

      const modal = wrapper.find(".modal");
      expect(modal.classes()).toContain("active");
    });

    it("填写表单 + 提交 → POST /api/subscriptions + showToast", async () => {
      const wrapper = await mountSubsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加订阅"));
      await addBtn.trigger("click");
      await flushPromises();

      global.fetch.mockClear();

      // 填写 label 和 url
      const labelInput = wrapper.find('input[placeholder="例如：代理服务"]');
      await labelInput.setValue("新订阅");
      const urlInput = wrapper.find(
        'input[placeholder="https://example.com/link..."]',
      );
      await urlInput.setValue("https://example.com/new");

      // 提交
      const form = wrapper.find("form");
      await form.trigger("submit.prevent");
      await flushPromises();
      await flushPromises();

      const postCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/subscriptions" && o?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const [, opts] = postCall;
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.label).toBe("新订阅");
      expect(body.url).toBe("https://example.com/new");
      expect(mockShowToast).toHaveBeenCalledWith("订阅源添加成功");
    });

    it("keywords 文本框默认填充常见关键词", async () => {
      const wrapper = await mountSubsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加订阅"));
      await addBtn.trigger("click");
      await flushPromises();

      const kwTextarea = wrapper.find("textarea");
      expect(kwTextarea.exists()).toBe(true);
      // 默认填充应包含"公告"等关键词
      expect(kwTextarea.element.value).toContain("公告");
      expect(kwTextarea.element.value).toContain("到期");
    });
  });

  describe("启停订阅与同步选择", () => {
    it("停用订阅并选择同步清空节点池触发 PUT 请求 clean_nodes: true", async () => {
      mockChoiceDialog.mockResolvedValueOnce("confirm");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const switchInput = wrapper.find('label.switch input[type="checkbox"]');
      await switchInput.setValue(false);

      expect(mockChoiceDialog).toHaveBeenCalledWith(
        expect.stringContaining("您正在停用订阅【订阅A】"),
        expect.objectContaining({
          confirmText: "同步清空节点池",
          secondaryText: "仅停用订阅",
          isDanger: true,
        }),
      );

      const putCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) && o?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      const [url, opts] = putCall;
      expect(url).toBe("/api/subscriptions/1");
      const body = JSON.parse(opts.body);
      expect(body.enabled).toBe(false);
      expect(body.clean_nodes).toBe(true);
      expect(mockShowToast).toHaveBeenCalledWith(
        "订阅已停用，并已同步清空节点池对应节点",
      );
    });

    it("停用订阅并选择仅停用保留节点触发 PUT 请求 clean_nodes: false", async () => {
      mockChoiceDialog.mockResolvedValueOnce("secondary");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const switchInput = wrapper.find('label.switch input[type="checkbox"]');
      await switchInput.setValue(false);

      const putCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) && o?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      const [, opts] = putCall;
      const body = JSON.parse(opts.body);
      expect(body.enabled).toBe(false);
      expect(body.clean_nodes).toBe(false);
      expect(mockShowToast).toHaveBeenCalledWith(
        "订阅已停用（保留节点池现有节点）",
      );
    });

    it("停用订阅选择取消时不触发 PUT 请求并恢复开关状态", async () => {
      mockChoiceDialog.mockResolvedValueOnce("cancel");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const switchInput = wrapper.find('label.switch input[type="checkbox"]');
      await switchInput.setValue(false);

      const putCalls = global.fetch.mock.calls.filter(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) && o?.method === "PUT",
      );
      expect(putCalls.length).toBe(0);
    });

    it("启用已停用订阅并选择立即抓取同步触发 PUT 并抓取", async () => {
      mockChoiceDialog.mockResolvedValueOnce("confirm");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const switchInputs = wrapper.findAll(
        'label.switch input[type="checkbox"]',
      );
      // 订阅B enabled=false，切换为 true
      await switchInputs[1].setValue(true);
      await flushPromises();
      await flushPromises();

      expect(mockChoiceDialog).toHaveBeenCalledWith(
        expect.stringContaining("订阅【订阅B】已启用"),
        expect.objectContaining({
          confirmText: "立即抓取同步",
          secondaryText: "仅启用订阅",
          isDanger: false,
        }),
      );

      const putCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) && o?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      const [url, opts] = putCall;
      expect(url).toBe("/api/subscriptions/2");
      const body = JSON.parse(opts.body);
      expect(body.enabled).toBe(true);

      const fetchCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/subscriptions/fetch" && o?.method === "POST",
      );
      expect(fetchCall).toBeDefined();
      expect(JSON.parse(fetchCall[1].body)).toEqual({ subscription_id: 2 });
    });

    it("启用已停用订阅并选择仅启用触发 PUT 但不抓取", async () => {
      mockChoiceDialog.mockResolvedValueOnce("secondary");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const switchInputs = wrapper.findAll(
        'label.switch input[type="checkbox"]',
      );
      await switchInputs[1].setValue(true);
      await flushPromises();
      await flushPromises();

      const putCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) && o?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall[1].body);
      expect(body.enabled).toBe(true);
      expect(mockShowToast).toHaveBeenCalledWith("订阅已启用");

      await flushPromises();
      const fetchCalls = global.fetch.mock.calls.filter(
        ([u, o]) => u === "/api/subscriptions/fetch" && o?.method === "POST",
      );
      expect(fetchCalls.length).toBe(0);
    });

    it("启用已停用订阅选择取消时不触发 PUT 请求", async () => {
      mockChoiceDialog.mockResolvedValueOnce("cancel");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const switchInputs = wrapper.findAll(
        'label.switch input[type="checkbox"]',
      );
      await switchInputs[1].setValue(true);

      const putCalls = global.fetch.mock.calls.filter(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) && o?.method === "PUT",
      );
      expect(putCalls.length).toBe(0);
    });
  });

  describe("触发抓取", () => {
    it("点击抓取按钮触发 POST /api/subscriptions/fetch", async () => {
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const fetchBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "抓取" || b.text().includes("抓取"));
      await fetchBtn.trigger("click");
      await flushPromises();
      await flushPromises();

      const fetchCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/subscriptions/fetch" && o?.method === "POST",
      );
      expect(fetchCall).toBeDefined();
      expect(mockShowToast).toHaveBeenCalledWith("正在抓取节点...");
    });
  });

  describe("删除订阅与节点池同步选择", () => {
    it("点击删除并选择同步清空节点池 → DELETE 请求带 clean_nodes=true", async () => {
      mockChoiceDialog.mockResolvedValueOnce("confirm");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      expect(mockChoiceDialog).toHaveBeenCalledWith(
        expect.stringContaining("确定要删除订阅源【订阅A】吗？"),
        expect.objectContaining({
          confirmText: "同步清空节点池",
          secondaryText: "保留节点池节点",
          isDanger: true,
        }),
      );

      const deleteCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).includes("/api/subscriptions/1") && o?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      const [url, opts] = deleteCall;
      expect(url).toContain("clean_nodes=true");
      expect(opts.method).toBe("DELETE");
      expect(mockShowToast).toHaveBeenCalledWith(
        "订阅源已删除，节点池对应节点已清空",
      );
    });

    it("点击删除并选择保留节点池节点 → DELETE 请求带 clean_nodes=false", async () => {
      mockChoiceDialog.mockResolvedValueOnce("secondary");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      const deleteCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).includes("/api/subscriptions/1") && o?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      const [url] = deleteCall;
      expect(url).toContain("clean_nodes=false");
      expect(mockShowToast).toHaveBeenCalledWith(
        "订阅源已删除，节点已转为自定义节点保留",
      );
    });

    it("点击删除并选择取消 → 不触发 DELETE 请求", async () => {
      mockChoiceDialog.mockResolvedValueOnce("cancel");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      const deleteCalls = global.fetch.mock.calls.filter(
        ([u, o]) =>
          String(u).includes("/api/subscriptions/1") && o?.method === "DELETE",
      );
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe("批量删除与节点池同步选择", () => {
    it("批量删除选择同步清空节点池 → POST batch-delete clean_nodes: true", async () => {
      mockChoiceDialog.mockResolvedValueOnce("confirm");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const checkboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await checkboxes[0].setValue(true);

      const batchBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("批量删除"));
      if (batchBtn) {
        await batchBtn.trigger("click");
        await flushPromises();

        expect(mockChoiceDialog).toHaveBeenCalledWith(
          expect.stringContaining("确定要批量删除选中的这 1 个订阅源吗？"),
          expect.objectContaining({
            confirmText: "同步清空节点池",
            secondaryText: "保留节点池节点",
            isDanger: true,
          }),
        );

        const batchCall = global.fetch.mock.calls.find(
          ([u, o]) =>
            u === "/api/subscriptions/batch-delete" && o?.method === "POST",
        );
        expect(batchCall).toBeDefined();
        const body = JSON.parse(batchCall[1].body);
        expect(body.ids).toContain(1);
        expect(body.clean_nodes).toBe(true);
        expect(mockShowToast).toHaveBeenCalledWith(
          "所选订阅源已批量删除，节点池对应节点已清空",
        );
      }
    });

    it("批量删除选择保留节点池节点 → POST batch-delete clean_nodes: false", async () => {
      mockChoiceDialog.mockResolvedValueOnce("secondary");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const checkboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await checkboxes[0].setValue(true);

      const batchBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("批量删除"));
      if (batchBtn) {
        await batchBtn.trigger("click");
        await flushPromises();

        const batchCall = global.fetch.mock.calls.find(
          ([u, o]) =>
            u === "/api/subscriptions/batch-delete" && o?.method === "POST",
        );
        expect(batchCall).toBeDefined();
        const body = JSON.parse(batchCall[1].body);
        expect(body.clean_nodes).toBe(false);
        expect(mockShowToast).toHaveBeenCalledWith(
          "所选订阅源已批量删除，节点已转为自定义节点保留",
        );
      }
    });

    it("批量删除选择取消 → 不触发 POST 请求", async () => {
      mockChoiceDialog.mockResolvedValueOnce("cancel");
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const checkboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await checkboxes[0].setValue(true);

      const batchBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("批量删除"));
      if (batchBtn) {
        await batchBtn.trigger("click");
        await flushPromises();

        const batchCalls = global.fetch.mock.calls.filter(
          ([u, o]) =>
            u === "/api/subscriptions/batch-delete" && o?.method === "POST",
        );
        expect(batchCalls.length).toBe(0);
      }
    });
  });

  describe("编辑订阅保留停用状态", () => {
    it("编辑停用的订阅时保留 enabled: false", async () => {
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      // 订阅B 是第二个订阅 (id: 2, enabled: false)
      const editBtns = wrapper
        .findAll("button")
        .filter((b) => b.text().trim() === "编辑");
      await editBtns[1].trigger("click");
      await flushPromises();

      const form = wrapper.find("form");
      await form.trigger("submit.prevent");
      await flushPromises();

      const putCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/subscriptions/2" && o?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall[1].body);
      expect(body.enabled).toBe(false);
    });
  });

  describe("多选逻辑优化", () => {
    it("当每页条数或页码发生变化时，已选中的订阅应该重置为空", async () => {
      const wrapper = await mountSubsView();

      // 设置 pageSize 为 1, 这样有 2 个订阅会有 2 页
      wrapper.vm.pageSize = 1;
      await flushPromises();

      // 1. 勾选第一个订阅
      let checkboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await checkboxes[0].setValue(true);
      expect(wrapper.vm.selectedSubIds.length).toBe(1);

      // 2. 测试翻页变化 (currentPage)
      wrapper.vm.currentPage = 2;
      await flushPromises();

      // 已勾选应该清空
      expect(wrapper.vm.selectedSubIds).toEqual([]);

      // 3. 再次勾选
      checkboxes = wrapper.findAll('tbody input[type="checkbox"]');
      await checkboxes[0].setValue(true);
      expect(wrapper.vm.selectedSubIds.length).toBe(1);

      // 4. 测试每页条数 (pageSize) 变化
      wrapper.vm.pageSize = 2;
      await flushPromises();

      expect(wrapper.vm.selectedSubIds).toEqual([]);
    });
  });
});
