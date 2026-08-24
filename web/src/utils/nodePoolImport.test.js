import { describe, it, expect } from "vitest";
import {
  canonicalizeJson,
  getParsedNodePoolOutbound,
  getNodePoolStatus,
  filterNodePoolByQuery,
  getSelectableNodePoolNodes,
} from "./nodePoolImport.js";

describe("nodePoolImport utils", () => {
  describe("canonicalizeJson", () => {
    it("正确对 Object Key 进行排序并规范化 JSON 字符串", () => {
      const objA = { b: 2, a: 1, c: { y: 20, x: 10 } };
      const objB = { a: 1, c: { x: 10, y: 20 }, b: 2 };
      expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB));
      expect(canonicalizeJson(objA)).toBe('{"a":1,"b":2,"c":{"x":10,"y":20}}');
    });

    it("正确处理 null 与 基础数据类型", () => {
      expect(canonicalizeJson(null)).toBe("null");
      expect(canonicalizeJson(123)).toBe("123");
      expect(canonicalizeJson("test")).toBe('"test"');
      expect(canonicalizeJson([3, 2, 1])).toBe("[3,2,1]");
    });
  });

  describe("getParsedNodePoolOutbound", () => {
    it("解析合法 raw_json 并赋予 node.tag", () => {
      const node = {
        tag: "Node-1",
        raw_json: '{"type":"vless","server":"1.1.1.1","port":443}',
      };
      const result = getParsedNodePoolOutbound(node);
      expect(result).toEqual({
        tag: "Node-1",
        type: "vless",
        server: "1.1.1.1",
        port: 443,
      });
    });

    it("解析非法 raw_json 时使用默认 shadowsocks 降级配置", () => {
      const node = { tag: "Node-Bad", raw_json: "invalid json" };
      const result = getParsedNodePoolOutbound(node);
      expect(result).toEqual({
        tag: "Node-Bad",
        type: "shadowsocks",
        server: "127.0.0.1",
        port: 8388,
      });
    });

    it("支持传入 sanitizeFn 转换结果", () => {
      const node = {
        tag: "Node-2",
        raw_json: '{"type":"vless","server":"1.1.1.1","tls":"bad"}',
      };
      const mockSanitize = (item) => {
        const copy = { ...item };
        delete copy.tls;
        return copy;
      };
      const result = getParsedNodePoolOutbound(node, mockSanitize);
      expect(result).toEqual({
        tag: "Node-2",
        type: "vless",
        server: "1.1.1.1",
      });
    });
  });

  describe("getNodePoolStatus", () => {
    const outbounds = [
      { tag: "Node-1", type: "vless", server: "1.1.1.1", port: 443 },
    ];

    it("节点不在配置中 -> status 为 new", () => {
      const node = {
        tag: "Node-2",
        raw_json: '{"type":"vless","server":"2.2.2.2","port":443}',
      };
      const status = getNodePoolStatus(node, outbounds);
      expect(status).toEqual({
        imported: false,
        updated: false,
        status: "new",
        label: "",
      });
    });

    it("节点已在配置中且内容完全一致 -> status 为 unchanged", () => {
      const node = {
        tag: "Node-1",
        raw_json: '{"type":"vless","server":"1.1.1.1","port":443}',
      };
      const status = getNodePoolStatus(node, outbounds);
      expect(status).toEqual({
        imported: true,
        updated: false,
        status: "unchanged",
        label: "已在配置中",
      });
    });

    it("节点在配置中但内容有变更 -> status 为 updated", () => {
      const node = {
        tag: "Node-1",
        raw_json: '{"type":"vless","server":"1.1.1.2","port":443}',
      };
      const status = getNodePoolStatus(node, outbounds);
      expect(status).toEqual({
        imported: true,
        updated: true,
        status: "updated",
        label: "内容有更新",
      });
    });
  });

  describe("filterNodePoolByQuery 与 getSelectableNodePoolNodes", () => {
    const outbounds = [
      { tag: "Node-1", type: "vless", server: "1.1.1.1", port: 443 },
    ];
    const nodes = [
      {
        id: 1,
        tag: "Node-1",
        node_type: "vless",
        remarks: "主节点",
        raw_json: '{"type":"vless","server":"1.1.1.1","port":443}', // unchanged
      },
      {
        id: 2,
        tag: "Node-1",
        node_type: "vless",
        remarks: "更新节点",
        raw_json: '{"type":"vless","server":"1.1.1.2","port":443}', // updated
      },
      {
        id: 3,
        tag: "Node-3",
        node_type: "shadowsocks",
        remarks: "新节点",
        raw_json: '{"type":"shadowsocks","server":"3.3.3.3","port":8388}', // new
      },
    ];

    it("filterNodePoolByQuery 搜索词可按 tag, node_type, remarks 或 状态 label 匹配", () => {
      expect(filterNodePoolByQuery(nodes, "", outbounds).length).toBe(3);
      expect(filterNodePoolByQuery(nodes, "Node-3", outbounds).length).toBe(1);
      expect(filterNodePoolByQuery(nodes, "更新", outbounds).length).toBe(1); // 匹配 id:2 节点的 状态 label "内容有更新"
    });

    it("getSelectableNodePoolNodes 过滤掉已在配置中且未变更的节点", () => {
      const selectable = getSelectableNodePoolNodes(nodes, outbounds);
      expect(selectable.map((n) => n.id)).toEqual([2, 3]);
    });
  });
});
