import { describe, it, expect } from "vitest";
import {
  filterGroupsByQuery,
  isGroupImported,
  clearSearchQuery,
} from "./groupImport.js";

// 测试数据：模拟 DB 中的分流出站组
const sampleGroups = [
  {
    tag: "cf_tunnel",
    group_type: "urltest",
    static_nodes: '["node1","node2"]',
  },
  { tag: "proxy", group_type: "selector", static_nodes: "[]" },
  { tag: "AUTO-Test", group_type: "urltest", static_nodes: "[]" },
  { tag: "CN-Direct", group_type: "selector", static_nodes: "[]" },
  { tag: "AI-Group", group_type: "selector", static_nodes: "[]" },
];

describe("filterGroupsByQuery", () => {
  describe("空搜索词边界情况", () => {
    it("空字符串返回全部组", () => {
      expect(filterGroupsByQuery(sampleGroups, "")).toEqual(sampleGroups);
    });

    it("纯空格字符串返回全部组（应被 trim）", () => {
      expect(filterGroupsByQuery(sampleGroups, "   ")).toEqual(sampleGroups);
    });

    it("tab + 换行混合空白返回全部组", () => {
      expect(filterGroupsByQuery(sampleGroups, "\t\n  \r")).toEqual(
        sampleGroups,
      );
    });

    it("null 查询返回全部组", () => {
      expect(filterGroupsByQuery(sampleGroups, null)).toEqual(sampleGroups);
    });

    it("undefined 查询返回全部组", () => {
      expect(filterGroupsByQuery(sampleGroups, undefined)).toEqual(
        sampleGroups,
      );
    });
  });

  describe("大小写不敏感匹配", () => {
    it("小写查询匹配大写 tag", () => {
      const result = filterGroupsByQuery(sampleGroups, "cn");
      expect(result.map((g) => g.tag)).toEqual(["CN-Direct"]);
    });

    it("大写查询匹配小写 tag", () => {
      const result = filterGroupsByQuery(sampleGroups, "CF");
      expect(result.map((g) => g.tag)).toEqual(["cf_tunnel"]);
    });

    it("混合大小写查询匹配", () => {
      const result = filterGroupsByQuery(sampleGroups, "Ai");
      expect(result.map((g) => g.tag)).toEqual(["AI-Group"]);
    });
  });

  describe("子串匹配", () => {
    it("匹配 tag 的前缀", () => {
      const result = filterGroupsByQuery(sampleGroups, "cf_");
      expect(result.map((g) => g.tag)).toEqual(["cf_tunnel"]);
    });

    it("匹配 tag 的中段", () => {
      const result = filterGroupsByQuery(sampleGroups, "tunnel");
      expect(result.map((g) => g.tag)).toEqual(["cf_tunnel"]);
    });

    it("匹配 tag 的后缀", () => {
      const result = filterGroupsByQuery(sampleGroups, "-direct");
      expect(result.map((g) => g.tag)).toEqual(["CN-Direct"]);
    });

    it("单个字符也能匹配", () => {
      const result = filterGroupsByQuery(sampleGroups, "-");
      expect(result.map((g) => g.tag).sort()).toEqual([
        "AI-Group",
        "AUTO-Test",
        "CN-Direct",
      ]);
    });
  });

  describe("中文/特殊字符匹配", () => {
    it("中文 tag 正常匹配", () => {
      const groups = [
        { tag: "国内直连", group_type: "selector" },
        { tag: "国外代理", group_type: "urltest" },
      ];
      expect(filterGroupsByQuery(groups, "国内").map((g) => g.tag)).toEqual([
        "国内直连",
      ]);
      expect(filterGroupsByQuery(groups, "代理").map((g) => g.tag)).toEqual([
        "国外代理",
      ]);
    });

    it("特殊字符（正则元字符）按字面匹配，不报错", () => {
      const groups = [
        { tag: "group(test)", group_type: "selector" },
        { tag: "group.test", group_type: "selector" },
        { tag: "normal", group_type: "selector" },
      ];
      // 这些字符在正则中有特殊含义，但 filterGroupsByQuery 用的是 includes，应安全
      expect(filterGroupsByQuery(groups, "(test)").map((g) => g.tag)).toEqual([
        "group(test)",
      ]);
      expect(
        filterGroupsByQuery(groups, ".")
          .map((g) => g.tag)
          .sort(),
      ).toEqual(["group.test"]);
    });
  });

  describe("无匹配结果", () => {
    it("查询不存在的组返回空数组", () => {
      const result = filterGroupsByQuery(sampleGroups, "xyz_not_exist");
      expect(result).toEqual([]);
    });

    it("查询存在但无匹配的子串返回空数组", () => {
      const result = filterGroupsByQuery(sampleGroups, "cf_xyz");
      expect(result).toEqual([]);
    });
  });

  describe("groups 输入边界", () => {
    it("null groups 返回空数组（不报错）", () => {
      expect(filterGroupsByQuery(null, "anything")).toEqual([]);
    });

    it("undefined groups 返回空数组", () => {
      expect(filterGroupsByQuery(undefined, "anything")).toEqual([]);
    });

    it("空数组返回空数组", () => {
      expect(filterGroupsByQuery([], "anything")).toEqual([]);
    });

    it("组中 tag 为 null 不报错（被空字符串兜底）", () => {
      const groups = [
        { tag: null, group_type: "selector" },
        { tag: "valid", group_type: "selector" },
      ];
      expect(filterGroupsByQuery(groups, "valid").map((g) => g.tag)).toEqual([
        "valid",
      ]);
      // null tag 不会被任何查询匹配
      expect(filterGroupsByQuery(groups, "").length).toBe(2);
    });

    it("组中 tag 为 undefined 不报错", () => {
      const groups = [
        { group_type: "selector" }, // tag 缺失
        { tag: "valid", group_type: "selector" },
      ];
      expect(filterGroupsByQuery(groups, "valid").map((g) => g.tag)).toEqual([
        "valid",
      ]);
    });
  });

  describe("返回值引用语义", () => {
    it("空查询返回的是原数组引用（不拷贝）", () => {
      // 这是设计选择：性能优先，调用方不应修改返回值
      const result = filterGroupsByQuery(sampleGroups, "");
      expect(result).toBe(sampleGroups);
    });

    it("有查询时返回的是新数组（filter 产生）", () => {
      const result = filterGroupsByQuery(sampleGroups, "cf");
      expect(result).not.toBe(sampleGroups);
      expect(result.length).toBe(1);
    });
  });
});

describe("isGroupImported", () => {
  const outbounds = [
    { tag: "proxy", type: "selector", outbounds: ["node1", "direct"] },
    { tag: "auto", type: "urltest", outbounds: [] },
    { tag: "node1", type: "vless", server: "1.1.1.1" },
    { tag: "direct", type: "direct" },
  ];

  it("已存在的 selector 组返回 true", () => {
    expect(isGroupImported(outbounds, "proxy")).toBe(true);
  });

  it("已存在的 urltest 组返回 true", () => {
    expect(isGroupImported(outbounds, "auto")).toBe(true);
  });

  it("普通代理节点（vless）返回 false（非策略组）", () => {
    // 即使 tag 存在，但 type 不是 selector/urltest
    expect(isGroupImported(outbounds, "node1")).toBe(false);
  });

  it("direct 出站返回 false（非策略组）", () => {
    expect(isGroupImported(outbounds, "direct")).toBe(false);
  });

  it("不存在的 tag 返回 false", () => {
    expect(isGroupImported(outbounds, "not_exist")).toBe(false);
  });

  it("空 outbounds 返回 false", () => {
    expect(isGroupImported([], "proxy")).toBe(false);
  });

  it("null outbounds 返回 false（不报错）", () => {
    expect(isGroupImported(null, "proxy")).toBe(false);
  });

  it("undefined outbounds 返回 false（不报错）", () => {
    expect(isGroupImported(undefined, "proxy")).toBe(false);
  });

  it("tag 大小写敏感（proxy ≠ Proxy）", () => {
    expect(isGroupImported(outbounds, "Proxy")).toBe(false);
  });
});

describe("clearSearchQuery", () => {
  it("返回空字符串", () => {
    expect(clearSearchQuery()).toBe("");
  });

  it("多次调用始终返回空字符串", () => {
    expect(clearSearchQuery()).toBe("");
    expect(clearSearchQuery()).toBe("");
    expect(clearSearchQuery()).toBe("");
  });

  it("返回值类型是 string", () => {
    expect(typeof clearSearchQuery()).toBe("string");
  });

  it("返回值长度为 0", () => {
    expect(clearSearchQuery()).toHaveLength(0);
  });
});

// 模拟"清空按钮"的完整交互流程
describe("清空按钮交互流程（模拟）", () => {
  it("模拟：输入查询 → 点清空 → 查询清空 → 列表恢复全部", () => {
    // 模拟组件状态
    const state = {
      searchQuery: "",
      groups: sampleGroups,
    };

    // 1. 用户输入查询 "cf"
    state.searchQuery = "cf";
    let filtered = filterGroupsByQuery(state.groups, state.searchQuery);
    expect(filtered.map((g) => g.tag)).toEqual(["cf_tunnel"]);

    // 2. 用户点击清空按钮
    state.searchQuery = clearSearchQuery();
    expect(state.searchQuery).toBe("");

    // 3. 清空后列表应恢复全部
    filtered = filterGroupsByQuery(state.groups, state.searchQuery);
    expect(filtered).toEqual(sampleGroups);
    expect(filtered).toHaveLength(5);
  });

  it("模拟：输入无匹配查询 → 点清空 → 列表恢复全部", () => {
    const state = {
      searchQuery: "",
      groups: sampleGroups,
    };

    // 1. 输入不存在的查询
    state.searchQuery = "xyz_not_exist";
    let filtered = filterGroupsByQuery(state.groups, state.searchQuery);
    expect(filtered).toEqual([]);

    // 2. 点清空
    state.searchQuery = clearSearchQuery();
    expect(state.searchQuery).toBe("");

    // 3. 列表恢复全部
    filtered = filterGroupsByQuery(state.groups, state.searchQuery);
    expect(filtered).toHaveLength(5);
  });

  it("模拟：输入空格 → 点清空 → 列表保持全部（空格本来也返回全部）", () => {
    const state = {
      searchQuery: "",
      groups: sampleGroups,
    };

    // 1. 输入空格（应被 trim 为空，列表本来就是全部）
    state.searchQuery = "   ";
    let filtered = filterGroupsByQuery(state.groups, state.searchQuery);
    expect(filtered).toHaveLength(5);

    // 2. 点清空
    state.searchQuery = clearSearchQuery();
    expect(state.searchQuery).toBe("");

    // 3. 列表仍是全部
    filtered = filterGroupsByQuery(state.groups, state.searchQuery);
    expect(filtered).toHaveLength(5);
  });

  it("模拟：导入组后搜索词保持不变（连续导入场景）", () => {
    // 这是设计选择：导入组后不清空搜索词，便于连续导入同类组
    const state = {
      searchQuery: "cf",
      groups: sampleGroups,
      outbounds: [],
    };

    // 1. 搜索 "cf"，匹配到 cf_tunnel
    let filtered = filterGroupsByQuery(state.groups, state.searchQuery);
    expect(filtered.map((g) => g.tag)).toEqual(["cf_tunnel"]);

    // 2. 模拟导入 cf_tunnel（添加到 outbounds）
    state.outbounds.push({ tag: "cf_tunnel", type: "urltest", outbounds: [] });

    // 3. 搜索词保持不变（设计选择，不清空）
    expect(state.searchQuery).toBe("cf");

    // 4. isGroupImported 现在对 cf_tunnel 返回 true
    expect(isGroupImported(state.outbounds, "cf_tunnel")).toBe(true);

    // 5. 列表仍显示 cf_tunnel（用于灰显"已添加"状态）
    filtered = filterGroupsByQuery(state.groups, state.searchQuery);
    expect(filtered.map((g) => g.tag)).toEqual(["cf_tunnel"]);
  });
});
