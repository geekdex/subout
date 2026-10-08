/**
 * DNS & Routing Rule Tree Utilities
 * Supports arbitrary nested logical sing-box rules (type: "logical", mode: "and" | "or", rules: [...])
 */

export const QUERY_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "HTTPS",
  "TXT",
  "PTR",
  "MX",
  "SRV",
  "ANY",
  "NS",
  "SOA",
];

export const DNS_CRITERIA_OPTIONS = [
  { value: "query_type", label: "DNS 查询类型 (query_type)", type: "pills_or_text" },
  { value: "domain_suffix", label: "域名后缀 (domain_suffix)", type: "list" },
  { value: "domain", label: "精确域名 (domain)", type: "list" },
  { value: "rule_set", label: "规则集 (rule_set)", type: "list" },
  { value: "geosite", label: "Geosite (geosite)", type: "list" },
  { value: "domain_keyword", label: "域名关键字 (domain_keyword)", type: "list" },
  { value: "domain_regex", label: "域名正则表达式 (domain_regex)", type: "list" },
  { value: "geoip", label: "GeoIP (geoip)", type: "list" },
  { value: "ip_cidr", label: "IP CIDR 网段 (ip_cidr)", type: "list" },
  { value: "port", label: "端口列表 (port)", type: "ports" },
  { value: "inbound", label: "来源入站 (inbound)", type: "list" },
  { value: "process_name", label: "进程名称 (process_name)", type: "list" },
  { value: "process_path", label: "进程路径 (process_path)", type: "list" },
  { value: "process_path_regex", label: "进程路径正则 (process_path_regex)", type: "list" },
  { value: "package_name", label: "应用包名 (package_name)", type: "list" },
  { value: "user", label: "运行用户 (user)", type: "list" },
  { value: "clash_mode", label: "Clash 模式 (clash_mode)", type: "text" },
];

/**
 * Creates default nested DNS template:
 * AND:
 *   - query_type: ["A", "AAAA"]
 *   - OR:
 *       - domain: []
 *       - domain_suffix: []
 *       - rule_set: []
 */
export function createDnsNestedTemplate() {
  return [
    {
      query_type: ["A", "AAAA"],
    },
    {
      type: "logical",
      mode: "or",
      rules: [
        { domain: [] },
        { domain_suffix: [] },
        { rule_set: [] },
      ],
    },
  ];
}

/**
 * Recursively cleans and sanitizes a rule tree before saving.
 * - Removes empty criteria arrays / empty strings
 * - Removes condition rules that have no criteria
 * - Preserves nested logical groups and non-empty criteria
 */
export function cleanRuleTree(rules) {
  if (!Array.isArray(rules)) return [];
  const cleaned = [];

  const arrayFields = [
    "query_type",
    "domain",
    "domain_suffix",
    "domain_keyword",
    "domain_regex",
    "geosite",
    "rule_set",
    "geoip",
    "ip_cidr",
    "inbound",
    "protocol",
    "process_name",
    "process_path",
    "process_path_regex",
    "package_name",
    "user",
  ];

  for (const r of rules) {
    if (!r || typeof r !== "object") continue;

    if (r.type === "logical") {
      const childRules = cleanRuleTree(r.rules || []);
      const group = {
        type: "logical",
        mode: r.mode === "and" ? "and" : "or",
        rules: childRules,
      };
      if (r.invert) {
        group.invert = true;
      }
      cleaned.push(group);
    } else {
      const condition = {};
      let hasCriteria = false;

      for (const f of arrayFields) {
        if (r[f] !== undefined && r[f] !== null) {
          const arr = Array.isArray(r[f])
            ? r[f].map((s) => String(s).trim()).filter(Boolean)
            : String(r[f])
                .split(/[\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean);
          if (arr.length > 0) {
            condition[f] = arr;
            hasCriteria = true;
          }
        }
      }

      if (r.port !== undefined && r.port !== null) {
        const ports = Array.isArray(r.port)
          ? r.port.map((p) => parseInt(p)).filter((n) => !isNaN(n))
          : String(r.port)
              .split(/[\n,]+/)
              .map((p) => parseInt(p.trim()))
              .filter((n) => !isNaN(n));
        if (ports.length > 0) {
          condition.port = ports;
          hasCriteria = true;
        }
      }

      if (r.clash_mode && String(r.clash_mode).trim()) {
        condition.clash_mode = String(r.clash_mode).trim();
        hasCriteria = true;
      }

      if (r.invert) {
        condition.invert = true;
      }

      if (hasCriteria) {
        cleaned.push(condition);
      }
    }
  }

  return cleaned;
}

/**
 * Recursively checks if a query string matches any criterion or attribute in a rule.
 */
export function ruleMatchesQuery(rule, query) {
  if (!rule || !query) return false;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;

  if (rule.server && rule.server.toLowerCase().includes(q)) return true;
  if (rule.client_subnet && rule.client_subnet.toLowerCase().includes(q)) return true;

  const checkVal = (val) => {
    if (val === undefined || val === null) return false;
    if (Array.isArray(val)) {
      return val.some((item) => String(item).toLowerCase().includes(q));
    }
    return String(val).toLowerCase().includes(q);
  };

  const fields = [
    "query_type",
    "domain",
    "domain_suffix",
    "domain_keyword",
    "domain_regex",
    "geosite",
    "rule_set",
    "geoip",
    "ip_cidr",
    "port",
    "inbound",
    "protocol",
    "process_name",
    "process_path",
    "process_path_regex",
    "package_name",
    "user",
    "clash_mode",
    "network",
  ];

  for (const f of fields) {
    if (checkVal(rule[f])) return true;
  }

  if (rule.type === "logical" && Array.isArray(rule.rules)) {
    return rule.rules.some((sub) => ruleMatchesQuery(sub, query));
  }

  return false;
}
