// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ============================================================
// Mock 依赖
// ============================================================

const { mockToken, mockShowToast, mockConfirmDialog, sharedSubscriptions } =
  vi.hoisted(() => {
    const { ref } = require("vue");
    return {
      mockToken: ref("test-token"),
      mockShowToast: vi.fn(),
      mockConfirmDialog: vi.fn(() => Promise.resolve(true)),
      sharedSubscriptions: ref([]),
    };
  });

vi.mock("../store.js", () => ({
  API_BASE: "",
  token: mockToken,
  subscriptions: sharedSubscriptions,
  showToast: mockShowToast,
  confirmDialog: mockConfirmDialog,
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
  const { subs = mockSubs } = opts;
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

  describe("启停订阅", () => {
    it("切换 enabled 触发 PUT 请求", async () => {
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      // 找到首行的 switch（label.switch 内 checkbox）
      const switchInput = wrapper.find('label.switch input[type="checkbox"]');
      // 订阅A enabled=true，切换为 false
      await switchInput.setValue(false);

      const putCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) && o?.method === "PUT",
      );
      expect(putCall).toBeDefined();
      const [url, opts] = putCall;
      expect(url).toBe("/api/subscriptions/1");
      const body = JSON.parse(opts.body);
      expect(body.enabled).toBe(false);
      expect(mockShowToast).toHaveBeenCalledWith("订阅已禁用");
    });
  });

  describe("触发抓取", () => {
    it("点击抓取按钮触发 POST /api/subscriptions/fetch", async () => {
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      // 找到首行的"抓取"按钮
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

  describe("删除订阅", () => {
    it("点击删除 → confirmDialog → DELETE 请求", async () => {
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      expect(mockConfirmDialog).toHaveBeenCalled();
      const deleteCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) &&
          o?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      const [url, opts] = deleteCall;
      expect(url).toBe("/api/subscriptions/1");
      expect(opts.method).toBe("DELETE");
      expect(mockShowToast).toHaveBeenCalledWith("订阅源已删除");
    });

    it("confirmDialog 返回 false 时不删除", async () => {
      mockConfirmDialog.mockResolvedValueOnce(false);
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      const deleteCalls = global.fetch.mock.calls.filter(
        ([u, o]) =>
          String(u).match(/^\/api\/subscriptions\/\d+$/) &&
          o?.method === "DELETE",
      );
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe("批量删除", () => {
    it("勾选订阅后点击批量删除触发 batch-delete", async () => {
      const wrapper = await mountSubsView();
      global.fetch.mockClear();

      // 行内 checkbox（v-model="selectedSubIds"）
      const checkboxes = wrapper.findAll('tbody input[type="checkbox"]');
      // 假设首行 checkbox 是 selectedSubIds（排除 switch checkbox，但订阅列表里可能只有 selectedSubIds 的 checkbox）
      // 检查首行 checkbox
      await checkboxes[0].setValue(true);

      // 找批量删除按钮
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
        expect(body.ids).toContain(1);
        expect(mockShowToast).toHaveBeenCalledWith("所选订阅源已批量删除");
      }
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
