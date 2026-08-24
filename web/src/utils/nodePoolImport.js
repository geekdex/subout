/**
 * 规范化 JSON 对象为键名升序排列的 JSON 字符串，用于精准深层比对。
 *
 * @param {any} obj
 * @returns {string}
 */
export function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizeJson).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (key) => JSON.stringify(key) + ":" + canonicalizeJson(obj[key]),
  );
  return "{" + pairs.join(",") + "}";
}

/**
 * 解析节点池节点的 raw_json，返回标准出站对象。
 *
 * @param {{tag: string, raw_json?: string}} node
 * @param {(item: any) => any} [sanitizeFn]
 * @returns {object}
 */
export function getParsedNodePoolOutbound(node, sanitizeFn) {
  if (!node) return null;
  let result = null;
  if (node.raw_json) {
    try {
      const parsed = JSON.parse(node.raw_json);
      if (parsed && typeof parsed === "object") {
        parsed.tag = node.tag;
        if (parsed.server_port !== undefined && parsed.port === undefined) {
          parsed.port = parsed.server_port;
        }
        result = parsed;
      }
    } catch {
      // 解析失败时降级
    }
  }
  if (!result) {
    result = {
      tag: node.tag,
      type: "shadowsocks",
      server: "127.0.0.1",
      port: 8388,
    };
  }
  return typeof sanitizeFn === "function" ? sanitizeFn(result) : result;
}

/**
 * 判断节点池节点相对于当前配置出站列表的状态。
 *
 * @param {{tag: string, raw_json?: string}} node
 * @param {Array<{tag: string}>} outbounds - 当前配置中的出站列表
 * @param {(item: any) => any} [sanitizeFn]
 * @returns {{ imported: boolean, updated: boolean, status: 'new' | 'unchanged' | 'updated', label: string }}
 */
export function getNodePoolStatus(node, outbounds, sanitizeFn) {
  if (!node || !node.tag) {
    return { imported: false, updated: false, status: "new", label: "" };
  }
  const existing = (outbounds || []).find((o) => o.tag === node.tag);
  if (!existing) {
    return { imported: false, updated: false, status: "new", label: "" };
  }
  const nodeOutbound = getParsedNodePoolOutbound(node, sanitizeFn);
  const isEqual = canonicalizeJson(existing) === canonicalizeJson(nodeOutbound);
  if (isEqual) {
    return {
      imported: true,
      updated: false,
      status: "unchanged",
      label: "已在配置中",
    };
  }
  return {
    imported: true,
    updated: true,
    status: "updated",
    label: "内容有更新",
  };
}

/**
 * 过滤节点池节点列表。
 *
 * @param {Array<any>} nodes
 * @param {string} query
 * @param {Array<any>} outbounds
 * @param {(item: any) => any} [sanitizeFn]
 * @returns {Array<any>}
 */
export function filterNodePoolByQuery(nodes, query, outbounds, sanitizeFn) {
  const normalized = (query || "").toLowerCase().trim();
  const list = nodes || [];
  if (!normalized) return list;
  return list.filter((n) => {
    const statusObj = getNodePoolStatus(n, outbounds, sanitizeFn);
    return (
      (n.tag && n.tag.toLowerCase().includes(normalized)) ||
      (n.node_type && n.node_type.toLowerCase().includes(normalized)) ||
      (n.remarks && n.remarks.toLowerCase().includes(normalized)) ||
      (statusObj.label && statusObj.label.toLowerCase().includes(normalized))
    );
  });
}

/**
 * 获取处于可导入或可更新状态的节点列表（排除未变更的已在配置中的节点）。
 *
 * @param {Array<any>} nodes
 * @param {Array<any>} outbounds
 * @param {(item: any) => any} [sanitizeFn]
 * @returns {Array<any>}
 */
export function getSelectableNodePoolNodes(nodes, outbounds, sanitizeFn) {
  return (nodes || []).filter(
    (n) => getNodePoolStatus(n, outbounds, sanitizeFn).status !== "unchanged",
  );
}
