/**
 * 按搜索词过滤分流出站组列表。
 *
 * 匹配规则：组 tag 包含搜索词（大小写不敏感）。空/空白搜索词返回全部组。
 *
 * @param {Array<{tag?: string, [k: string]: any}>} groups - DB 出站组列表
 * @param {string} query - 搜索词（会被 trim + lowercase）
 * @returns {Array} 过滤后的组列表（同引用，不做拷贝）
 */
export function filterGroupsByQuery(groups, query) {
  const normalized = (query || "").toLowerCase().trim();
  const list = groups || [];
  if (!normalized) return list;
  return list.filter((g) => (g?.tag || "").toLowerCase().includes(normalized));
}

/**
 * 判断某个 tag 是否已作为策略组存在于当前配置的出站列表中。
 *
 * @param {Array<{tag: string, type: string}>} outbounds - 配置中的出站列表
 * @param {string} tag - 待检查的组 tag
 * @returns {boolean}
 */
export function isGroupImported(outbounds, tag) {
  return (outbounds || []).some(
    (o) => o.tag === tag && ["selector", "urltest"].includes(o.type),
  );
}

/**
 * 清空搜索词。返回新的搜索状态对象（不可变更新）。
 *
 * @returns {string} 总是返回空字符串
 */
export function clearSearchQuery() {
  return "";
}
