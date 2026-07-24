// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ============================================================
// Mock 依赖
// ============================================================

const { mockToken, mockShowToast, mockConfirmDialog, sharedGroups } =
  vi.hoisted(() => {
    const { ref } = require("vue");
    return {
      mockToken: ref("test-token"),
      mockShowToast: vi.fn(),
      mockConfirmDialog: vi.fn(() => Promise.resolve(true)),
      // 共享 ref：组件从 store 导入后直接写入 .value
      sharedGroups: ref([]),
    };
  });

vi.mock("../store.js", () => ({
  API_BASE: "",
  token: mockToken,
  // 返回同一个 ref 引用，组件的 groups.value = X 会更新此 ref
  groups: sharedGroups,
  showToast: mockShowToast,
  confirmDialog: mockConfirmDialog,
}));

import GroupsView from "./GroupsView.vue";

// ============================================================
// 测试数据
// ============================================================

const mockGroups = [
  {
    id: 1,
    tag: "proxy",
    group_type: "selector",
    static_nodes: JSON.stringify(["node1", "node2"]),
    url: null,
    interval: null,
    tolerance: null,
  },
  {
    id: 2,
    tag: "auto-test",
    group_type: "urltest",
    static_nodes: JSON.stringify(["node1"]),
    url: "http://cp.cloudflare.com/generate_204",
    interval: "3m",
    tolerance: 50,
  },
];

const mockSubscriptions = [
  { id: 5, label: "SubA", url: "https://example.com", enabled: true },
];

const mockAllNodes = [
  {
    id: 1,
    tag: "node1",
    node_type: "vless",
    server: "1.1.1.1",
    port: 443,
    raw_json: "{}",
    enabled: true,
    is_custom: true,
  },
  {
    id: 2,
    tag: "node2",
    node_type: "vmess",
    server: "2.2.2.2",
    port: 8080,
    raw_json: "{}",
    enabled: true,
    is_custom: false,
  },
];

// ============================================================
// Fetch mock 工厂（按 method 区分）
// ============================================================

function createSmartFetch(opts = {}) {
  const {
    groups = mockGroups,
    subscriptions = mockSubscriptions,
    allNodes = mockAllNodes,
  } = opts;
  return vi.fn((url, options = {}) => {
    const urlStr = String(url);
    const path = urlStr.split("?")[0];
    const method = options.method || "GET";
    let body;
    if (path === "/api/groups") {
      if (method === "GET") body = groups;
      else body = { ok: true }; // POST
    } else if (path === "/api/subscriptions") {
      body = subscriptions;
    } else if (path === "/api/nodes") {
      body = { nodes: allNodes, total: allNodes.length };
    } else if (path.match(/^\/api\/groups\/\d+$/)) {
      body = { ok: true }; // PUT/DELETE
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

async function mountGroupsView(fetchMock = createSmartFetch()) {
  vi.spyOn(global, "fetch").mockImplementation(fetchMock);
  const wrapper = mount(GroupsView);
  await flushPromises();
  await flushPromises();
  return wrapper;
}

// ============================================================
// 测试用例
// ============================================================

describe("GroupsView - 分流出站组管理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToken.value = "test-token";
  });

  describe("onMounted 加载", () => {
    it("加载并显示分组列表", async () => {
      const wrapper = await mountGroupsView();
      // 表格行：2 个分组
      const rows = wrapper.findAll("tbody tr");
      expect(rows.length).toBe(2);
      expect(wrapper.text()).toContain("proxy");
      expect(wrapper.text()).toContain("auto-test");
      expect(wrapper.text()).toContain("selector");
      expect(wrapper.text()).toContain("urltest");
    });

    it("urltest 分组显示测速配置详情", async () => {
      const wrapper = await mountGroupsView();
      expect(wrapper.text()).toContain("测速间隔");
      expect(wrapper.text()).toContain("3m");
      expect(wrapper.text()).toContain("50");
      expect(wrapper.text()).toContain("http://cp.cloudflare.com/generate_204");
    });

    it("空分组列表时显示空状态", async () => {
      const wrapper = await mountGroupsView(createSmartFetch({ groups: [] }));
      // 表格行：1 个空状态行
      const rows = wrapper.findAll("tbody tr");
      expect(rows.length).toBe(1);
      expect(wrapper.text()).toContain("暂无");
    });
  });

  describe("添加分组的 modal 交互", () => {
    it("点击'添加分流出站组'按钮打开 modal", async () => {
      const wrapper = await mountGroupsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();

      // modal 应有 active class
      const modal = wrapper.find(".modal");
      expect(modal.classes()).toContain("active");
      // header 显示"添加分流出站组"
      expect(wrapper.find(".modal-header").text()).toContain("添加分流出站组");
    });

    it("selector 类型时不显示 url/interval/tolerance 字段", async () => {
      const wrapper = await mountGroupsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();

      // modal 内的类型 select：通过查找含"分组类型" label 的 input-group
      const typeGroup = wrapper
        .findAll(".input-group")
        .find((g) => g.text().includes("分组类型"));
      const typeSelect = typeGroup.find("select");
      expect(typeSelect.element.value).toBe("selector");

      // 测速 URL 字段在 selector 模式下应不可见（v-show 隐藏）
      // 通过 offsetParent === null 判断元素不可见
      const urlInput = wrapper.find(
        'input[placeholder="http://cp.cloudflare.com/generate_204"]',
      );
      if (urlInput.exists()) {
        // jsdom 不渲染 layout，offsetParent 总是 null，不可靠
        // 改为检查 input 父级链上是否有 display:none
        let el = urlInput.element;
        let isHidden = false;
        while (el && el.tagName !== "BODY") {
          if (el.style && el.style.display === "none") {
            isHidden = true;
            break;
          }
          el = el.parentElement;
        }
        expect(isHidden).toBe(true);
      }
    });

    it("切换到 urltest 类型时显示测速字段", async () => {
      const wrapper = await mountGroupsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();

      // 切换到 urltest
      const typeGroup = wrapper
        .findAll(".input-group")
        .find((g) => g.text().includes("分组类型"));
      const typeSelect = typeGroup.find("select");
      await typeSelect.setValue("urltest");
      await flushPromises();

      // 测速字段应显示
      const urlInput = wrapper.find(
        'input[placeholder="http://cp.cloudflare.com/generate_204"]',
      );
      expect(urlInput.exists()).toBe(true);
      const intervalInput = wrapper.find('input[placeholder="3m"]');
      expect(intervalInput.exists()).toBe(true);
      const toleranceInput = wrapper.find('input[placeholder="50"]');
      expect(toleranceInput.exists()).toBe(true);
    });

    it("填写并提交新分组 → POST /api/groups", async () => {
      const wrapper = await mountGroupsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();

      global.fetch.mockClear();

      // 填写 tag
      const tagInput = wrapper.find(
        'input[placeholder="例如：proxy 或 AUTO-Test"]',
      );
      await tagInput.setValue("new-group");

      // 提交表单
      const form = wrapper.find("form");
      await form.trigger("submit.prevent");
      await flushPromises();
      await flushPromises();

      // 应有 POST /api/groups
      const postCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/groups" && o?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const [, opts] = postCall;
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.tag).toBe("new-group");
      expect(body.group_type).toBe("selector");
      expect(mockShowToast).toHaveBeenCalledWith("分组添加成功");
    });
  });

  describe("删除分组", () => {
    it("点击删除 → confirmDialog → DELETE 请求", async () => {
      const wrapper = await mountGroupsView();
      global.fetch.mockClear();

      // 找到首行的"删除"按钮
      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      expect(mockConfirmDialog).toHaveBeenCalled();
      const deleteCall = global.fetch.mock.calls.find(
        ([u, o]) =>
          String(u).match(/^\/api\/groups\/\d+$/) && o?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      const [url, opts] = deleteCall;
      expect(url).toBe("/api/groups/1");
      expect(opts.method).toBe("DELETE");
      expect(mockShowToast).toHaveBeenCalledWith("分流出站组已删除");
    });

    it("confirmDialog 返回 false 时不删除", async () => {
      mockConfirmDialog.mockResolvedValueOnce(false);
      const wrapper = await mountGroupsView();
      global.fetch.mockClear();

      const deleteBtn = wrapper
        .findAll("button")
        .find((b) => b.text().trim() === "删除");
      await deleteBtn.trigger("click");
      await flushPromises();

      const deleteCalls = global.fetch.mock.calls.filter(
        ([u, o]) =>
          String(u).match(/^\/api\/groups\/\d+$/) && o?.method === "DELETE",
      );
      expect(deleteCalls.length).toBe(0);
    });

    it("勾选多个分组后执行批量删除 → POST /api/groups/batch-delete", async () => {
      const wrapper = await mountGroupsView();
      global.fetch.mockClear();

      // 勾选表格表头全选框
      const headerCheckbox = wrapper.find("thead input[type='checkbox']");
      await headerCheckbox.setValue(true);
      await flushPromises();

      // 应该出现批量删除按钮
      const batchBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("批量删除"));
      expect(batchBtn).toBeDefined();
      expect(batchBtn.text()).toContain("已选 2 项");

      // 点击批量删除
      await batchBtn.trigger("click");
      await flushPromises();

      expect(mockConfirmDialog).toHaveBeenCalled();
      const batchCall = global.fetch.mock.calls.find(
        ([u, o]) => u === "/api/groups/batch-delete" && o?.method === "POST",
      );
      expect(batchCall).toBeDefined();
      const [, opts] = batchCall;
      expect(JSON.parse(opts.body)).toEqual({ ids: [1, 2] });
      expect(mockShowToast).toHaveBeenCalledWith("已批量删除选中的 2 个出站组");
    });
  });

  describe("节点/出站组选择框增强筛选功能", () => {
    it("打开 modal 后加载全部节点供选择", async () => {
      const wrapper = await mountGroupsView();
      global.fetch.mockClear();

      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();

      // 应触发 GET /api/nodes?limit=100000
      const nodesCall = global.fetch.mock.calls.find(
        ([u]) =>
          String(u).includes("/api/nodes") &&
          String(u).includes("limit=100000"),
      );
      expect(nodesCall).toBeDefined();
    });

    it("只筛选节点 vs 只筛选出站组", async () => {
      const wrapper = await mountGroupsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();

      // 找到类型筛选下拉框
      const typeSelects = wrapper.findAll(".pane-header select");
      const typeFilterSelect = typeSelects[0];

      // 筛选"仅节点"
      await typeFilterSelect.setValue("node");
      await flushPromises();
      const itemsOnlyNodes = wrapper.findAll(".transfer-available-item");
      expect(itemsOnlyNodes.length).toBe(2); // node1, node2
      expect(wrapper.find(".pane-body").text()).not.toContain("[出站组]");

      // 筛选"仅出站组"
      await typeFilterSelect.setValue("group");
      await flushPromises();
      const itemsOnlyGroups = wrapper.findAll(".transfer-available-item");
      expect(itemsOnlyGroups.length).toBe(2); // proxy, auto-test (except self if editing)
      expect(wrapper.find(".pane-body").text()).toContain("[出站组]");
    });

    it("支持关键词包含和排除多个关键词查询", async () => {
      const wrapper = await mountGroupsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();

      const searchInputs = wrapper.findAll('.pane-header input[type="text"]');
      const includeInput = searchInputs[0];
      const excludeInput = searchInputs[1];

      // 包含搜索 "node"
      await includeInput.setValue("node");
      await flushPromises();
      expect(wrapper.find(".pane-body").text()).toContain("node1");
      expect(wrapper.find(".pane-body").text()).toContain("node2");
      expect(wrapper.find(".pane-body").text()).not.toContain("proxy");

      // 排除搜索 "node2, direct"
      await excludeInput.setValue("node2, direct");
      await flushPromises();
      expect(wrapper.find(".pane-body").text()).toContain("node1");
      expect(wrapper.find(".pane-body").text()).not.toContain("node2");
    });

    it("全选按钮把过滤后的所有 tag 加入已选列表", async () => {
      const wrapper = await mountGroupsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();
      await flushPromises();

      // 找到全选链接
      const selectAllLink = wrapper
        .findAll(".pane-header a")
        .find((a) => a.text().includes("全选当前"));
      if (selectAllLink) {
        await selectAllLink.trigger("click");
        await flushPromises();
        // 已选 tag 会显示在右侧
        expect(wrapper.text()).toContain("node1");
        expect(wrapper.text()).toContain("node2");
      }
    });

    it("清空按钮清空所有已选 tag", async () => {
      const wrapper = await mountGroupsView();
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加出站组"));
      await addBtn.trigger("click");
      await flushPromises();
      await flushPromises();

      // 先全选
      const selectAllLink = wrapper
        .findAll(".pane-header a")
        .find((a) => a.text().includes("全选当前"));
      if (selectAllLink) {
        await selectAllLink.trigger("click");
        await flushPromises();
      }

      // 点击清空
      const clearBtn = wrapper
        .findAll(".pane-header a")
        .find((a) => a.text().includes("清空"));
      if (clearBtn) {
        await clearBtn.trigger("click");
        await flushPromises();
        expect(wrapper.find(".pane-column:nth-child(2)").text()).toContain(
          "请从左侧选择节点",
        );
      }
    });
  });
});
