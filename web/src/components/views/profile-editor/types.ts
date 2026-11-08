import { PlatformType } from "../../../types/api";

export type RuleConditionFields = {
  inbound?: string[];
  ip_version?: 4 | 6;
  network?: string[];
  auth_user?: string[];
  protocol?: string[];
  client?: string[];
  domain?: string[];
  domain_suffix?: string[];
  domain_keyword?: string[];
  domain_regex?: string[];
  source_ip_cidr?: string[];
  source_ip_is_private?: boolean;
  ip_cidr?: string[];
  ip_is_private?: boolean;
  source_port?: number[];
  source_port_range?: string[];
  port?: number[];
  port_range?: string[];
  // Desktop-only fields (linux, macos, windows)
  process_name?: string[];
  process_path?: string[];
  process_path_regex?: string[];
  // Android-only fields (android)
  package_name?: string[];
  package_name_regex?: string[];
  clash_mode?: string;
  rule_set?: string[];
  rule_set_ip_cidr_match_source?: boolean;
  invert?: boolean;
  // DNS-specific condition fields
  query_type?: (string | number)[];
  query_dnssec?: boolean;
  match_response?: boolean;
  ip_accept_any?: boolean;
  response_rcode?: string;
};

export interface NestedRuleItem extends RuleConditionFields {
  type?: "default" | "logical";
  mode?: "and" | "or";
  rules?: NestedRuleItem[];
  [key: string]: unknown;
}

export interface RouteRuleItem extends NestedRuleItem {
  action?:
    | "route"
    | "reject"
    | "hijack-dns"
    | "sniff"
    | "resolve"
    | "bypass"
    | "route-options";
  outbound?: string;
  // reject
  method?: "" | "default" | "drop" | "reply";
  no_drop?: boolean;
  // sniff
  sniffer?: string[];
  timeout?: string;
  // resolve
  server?: string;
  strategy?: "" | "prefer_ipv4" | "prefer_ipv6" | "ipv4_only" | "ipv6_only";
  disable_cache?: boolean;
  rewrite_ttl?: number;
  client_subnet?: string;
  // route-options
  override_address?: string;
  override_port?: number;
  tls_fragment?: boolean;
  tls_record_fragment?: boolean;
}

export interface DnsRuleItem extends NestedRuleItem {
  action?:
    | "route"
    | "evaluate"
    | "respond"
    | "route-options"
    | "reject"
    | "predefined";
  server?: string;
  tag?: string;
  disable_cache?: boolean;
  disable_optimistic_cache?: boolean;
  rewrite_ttl?: number;
  client_subnet?: string;
  remove_client_subnet?: boolean;
  timeout?: string;
  race?: boolean;
  speculative?: boolean;
  // reject
  method?: "" | "default" | "drop" | "reply";
  no_drop?: boolean;
  // predefined
  rcode?:
    "NOERROR" | "FORMERR" | "SERVFAIL" | "NXDOMAIN" | "NOTIMP" | "REFUSED";
  answer?: string[];
  ns?: string[];
  extra?: string[];
}

export interface RuleSetItem {
  type: "remote" | "local" | "inline";
  tag: string;
  format?: "source" | "binary";
  url?: string;
  path?: string;
  http_client?: string;
  update_interval?: string;
  [key: string]: unknown;
}

export interface DnsServerItem {
  type:
    | "udp"
    | "tcp"
    | "tls"
    | "https"
    | "h3"
    | "quic"
    | "local"
    | "hosts"
    | "dhcp"
    | "fakeip"
    | "tailscale"
    | "resolved";
  tag?: string;
  server?: string;
  server_port?: number;
  path?: string;
  detour?: string;
  domain_resolver?: string;
  inet4_range?: string;
  inet6_range?: string;
  prefer_go?: boolean;
  interface?: string;
  [key: string]: unknown;
}

export interface InboundItem {
  type:
    | "tun"
    | "mixed"
    | "http"
    | "socks"
    | "redirect"
    | "tproxy"
    | "direct"
    | string;
  tag?: string;
  listen?: string;
  listen_port?: number;
  interface_name?: string;
  mtu?: number;
  address?: string[];
  auto_route?: boolean;
  auto_redirect?: boolean;
  strict_route?: boolean;
  dns_mode?: "" | "direct" | "fakeip" | "hosts" | string;
  set_system_proxy?: boolean;
  include_package?: string[];
  exclude_package?: string[];
  platform?: {
    http_proxy?: {
      enabled?: boolean;
      server?: string;
      server_port?: number;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OutboundItem {
  type: string;
  tag?: string;
  outbounds?: string[];
  default?: string;
  url?: string;
  interval?: string;
  tolerance?: number;
  interrupt_exist_connections?: boolean;
  server?: string;
  server_port?: number;
  [key: string]: unknown;
}

export interface HttpClientItem {
  tag?: string;
  detour?: string;
  engine?: "" | "go" | "apple" | "cronet";
  version?: 1 | 2 | 3;
  connect_timeout?: string;
  domain_resolver?: string;
  [key: string]: unknown;
}

export interface SingBoxVisualConfig {
  $schema?: string;
  log?: {
    disabled?: boolean;
    level?:
      "" | "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "panic";
    output?: string;
    timestamp?: boolean;
  };
  dns?: {
    servers?: DnsServerItem[];
    rules?: DnsRuleItem[];
    final?: string;
    strategy?: "" | "prefer_ipv4" | "prefer_ipv6" | "ipv4_only" | "ipv6_only";
    disable_cache?: boolean;
    disable_expire?: boolean;
    cache_capacity?: number;
    reverse_mapping?: boolean;
    client_subnet?: string;
    timeout?: string;
    optimistic?: boolean | Record<string, unknown>;
    [key: string]: unknown;
  };
  ntp?: {
    enabled?: boolean;
    server?: string;
    server_port?: number;
    interval?: string;
    detour?: string;
    write_to_system?: boolean;
    [key: string]: unknown;
  };
  certificate?: {
    store?: "" | "system" | "mozilla" | "chrome" | "none";
    certificate?: string[];
    certificate_path?: string[];
    certificate_directory_path?: string[];
    [key: string]: unknown;
  };
  certificate_providers?: unknown[];
  http_clients?: HttpClientItem[];
  network_namespaces?: unknown[];
  endpoints?: unknown[];
  inbounds?: InboundItem[];
  outbounds?: OutboundItem[];
  route?: {
    rules?: RouteRuleItem[];
    rule_set?: RuleSetItem[];
    final?: string;
    auto_detect_interface?: boolean;
    default_domain_resolver?: string | Record<string, unknown>;
    default_http_client?: string;
    find_process?: boolean;
    override_android_vpn?: boolean;
    default_interface?: string;
    default_mark?: number;
    default_network_strategy?: string;
    [key: string]: unknown;
  };
  services?: unknown[];
  experimental?: {
    cache_file?: {
      enabled?: boolean;
      path?: string;
      cache_id?: string;
      store_fakeip?: boolean;
      store_dns?: boolean;
    };
    clash_api?: {
      external_controller?: string;
      external_ui?: string;
      external_ui_download_url?: string;
      external_ui_download_detour?: string;
      secret?: string;
      default_mode?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const OFFICIAL_RULE_SET_PRESETS: {
  tag: string;
  label: string;
  url: string;
}[] = [
  {
    tag: "geosite-cn",
    label: "中国大陆域名 (geosite-cn)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
  },
  {
    tag: "geoip-cn",
    label: "中国大陆 IP (geoip-cn)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
  },
  {
    tag: "geosite-geolocation-!cn",
    label: "非中国大陆域名 (geosite-geolocation-!cn)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-!cn.srs",
  },
  {
    tag: "geosite-category-ads-all",
    label: "广告拦截规则集 (geosite-category-ads-all)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs",
  },
  {
    tag: "geosite-google",
    label: "Google 服务 (geosite-google)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs",
  },
  {
    tag: "geosite-youtube",
    label: "YouTube 视频 (geosite-youtube)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-youtube.srs",
  },
  {
    tag: "geosite-openai",
    label: "OpenAI / ChatGPT (geosite-openai)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-openai.srs",
  },
  {
    tag: "geosite-github",
    label: "GitHub 开发者 (geosite-github)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-github.srs",
  },
  {
    tag: "geosite-telegram",
    label: "Telegram 域名 (geosite-telegram)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-telegram.srs",
  },
  {
    tag: "geoip-telegram",
    label: "Telegram IP (geoip-telegram)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-telegram.srs",
  },
  {
    tag: "geosite-twitter",
    label: "Twitter / X (geosite-twitter)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-twitter.srs",
  },
  {
    tag: "geosite-facebook",
    label: "Facebook / Meta (geosite-facebook)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-facebook.srs",
  },
  {
    tag: "geosite-instagram",
    label: "Instagram (geosite-instagram)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-instagram.srs",
  },
  {
    tag: "geosite-netflix",
    label: "Netflix 流媒体 (geosite-netflix)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-netflix.srs",
  },
  {
    tag: "geosite-apple",
    label: "Apple 服务 (geosite-apple)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-apple.srs",
  },
  {
    tag: "geosite-jetbrains",
    label: "JetBrains 开发者 (geosite-jetbrains)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-jetbrains.srs",
  },
  {
    tag: "geosite-microsoft",
    label: "Microsoft 服务 (geosite-microsoft)",
    url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-microsoft.srs",
  },
];

export const ARRAY_STRING_RULE_KEYS = [
  "inbound",
  "network",
  "auth_user",
  "protocol",
  "client",
  "domain",
  "domain_suffix",
  "domain_keyword",
  "domain_regex",
  "source_ip_cidr",
  "ip_cidr",
  "source_port_range",
  "port_range",
  "process_name",
  "process_path",
  "process_path_regex",
  "package_name",
  "package_name_regex",
  "rule_set",
  "query_type",
] as const;

export const ARRAY_NUMBER_RULE_KEYS = ["port", "source_port"] as const;

function toStrArray(val: unknown): string[] | undefined {
  if (Array.isArray(val)) {
    const filtered = val.map((v) => String(v).trim()).filter(Boolean);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof val === "string" && val.trim().length > 0) {
    return [val.trim()];
  }
  if (typeof val === "number") {
    return [String(val)];
  }
  return undefined;
}

function toNumArray(val: unknown): number[] | undefined {
  if (Array.isArray(val)) {
    const nums = val
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 65535);
    return nums.length > 0 ? nums : undefined;
  }
  if (typeof val === "number" && Number.isInteger(val)) {
    return [val];
  }
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 65535) return [n];
  }
  return undefined;
}

function normalizeRuleNode(
  raw: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  // Nested rules inside logical.rules (depth > 0) cannot have action/outbound/server in official schema.json
  if (depth > 0) {
    delete out.action;
    delete out.outbound;
    delete out.server;
    delete out.method;
    delete out.rcode;
    delete out.sniffer;
    delete out.timeout;
    delete out.strategy;
    delete out.disable_cache;
    delete out.rewrite_ttl;
    delete out.client_subnet;
  }

  for (const k of ARRAY_STRING_RULE_KEYS) {
    if (k in out) {
      const normalized = toStrArray(out[k]);
      if (normalized) {
        out[k] = normalized;
      } else {
        delete out[k];
      }
    }
  }

  for (const k of ARRAY_NUMBER_RULE_KEYS) {
    if (k in out) {
      const normalized = toNumArray(out[k]);
      if (normalized) {
        out[k] = normalized;
      } else {
        delete out[k];
      }
    }
  }

  if (out.type === "logical") {
    out.mode = out.mode === "or" ? "or" : "and";
    const childRules = Array.isArray(out.rules) ? out.rules : [];
    out.rules = childRules
      .filter(
        (r): r is Record<string, unknown> =>
          Boolean(r) && typeof r === "object",
      )
      .map((r) => normalizeRuleNode(r, depth + 1));
  } else {
    delete out.type;
    delete out.mode;
    delete out.rules;
  }

  return out;
}

/**
 * Parses raw JSON string into SingBoxVisualConfig state without injecting unsolicited defaults.
 */
export function parseConfigToVisualState(rawJson: string): SingBoxVisualConfig {
  let parsed: Record<string, unknown> = {};
  try {
    const obj = JSON.parse(rawJson);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      parsed = obj as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const dnsRaw =
    parsed.dns && typeof parsed.dns === "object" && !Array.isArray(parsed.dns)
      ? ({ ...(parsed.dns as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : {};
  delete dnsRaw.independent_cache;

  const dnsRules = Array.isArray(dnsRaw.rules)
    ? dnsRaw.rules
        .filter(
          (r): r is Record<string, unknown> =>
            Boolean(r) && typeof r === "object",
        )
        .map((r) => normalizeRuleNode(r, 0) as DnsRuleItem)
    : undefined;

  const routeRaw =
    parsed.route &&
    typeof parsed.route === "object" &&
    !Array.isArray(parsed.route)
      ? ({ ...(parsed.route as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : {};

  const routeRules = Array.isArray(routeRaw.rules)
    ? routeRaw.rules
        .filter(
          (r): r is Record<string, unknown> =>
            Boolean(r) && typeof r === "object",
        )
        .map((r) => normalizeRuleNode(r, 0) as RouteRuleItem)
    : undefined;

  const inboundsRaw = Array.isArray(parsed.inbounds)
    ? parsed.inbounds
        .filter(
          (i): i is Record<string, unknown> =>
            Boolean(i) && typeof i === "object",
        )
        .map((inb) => {
          const copy: Record<string, unknown> = { ...inb };
          if ("address" in copy) {
            const addrArr = toStrArray(copy.address);
            if (addrArr) copy.address = addrArr;
            else delete copy.address;
          }
          if ("include_package" in copy) {
            const pkgArr = toStrArray(copy.include_package);
            if (pkgArr) copy.include_package = pkgArr;
            else delete copy.include_package;
          }
          if ("exclude_package" in copy) {
            const pkgArr = toStrArray(copy.exclude_package);
            if (pkgArr) copy.exclude_package = pkgArr;
            else delete copy.exclude_package;
          }
          return copy as InboundItem;
        })
    : [];

  const outboundsRaw = Array.isArray(parsed.outbounds)
    ? (parsed.outbounds.filter(
        (o): o is Record<string, unknown> =>
          Boolean(o) && typeof o === "object",
      ) as OutboundItem[])
    : [];

  return {
    ...parsed,
    $schema:
      typeof parsed.$schema === "string" && parsed.$schema.trim()
        ? parsed.$schema
        : "https://sing-box.sagernet.org/schema.json",
    log:
      parsed.log && typeof parsed.log === "object" && !Array.isArray(parsed.log)
        ? (parsed.log as SingBoxVisualConfig["log"])
        : {},
    dns: {
      ...dnsRaw,
      ...(Array.isArray(dnsRaw.servers)
        ? { servers: dnsRaw.servers as DnsServerItem[] }
        : {}),
      ...(dnsRules !== undefined ? { rules: dnsRules } : {}),
    },
    ntp:
      parsed.ntp && typeof parsed.ntp === "object" && !Array.isArray(parsed.ntp)
        ? (parsed.ntp as SingBoxVisualConfig["ntp"])
        : {},
    certificate:
      parsed.certificate &&
      typeof parsed.certificate === "object" &&
      !Array.isArray(parsed.certificate)
        ? (parsed.certificate as SingBoxVisualConfig["certificate"])
        : {},
    http_clients: Array.isArray(parsed.http_clients)
      ? (parsed.http_clients as HttpClientItem[])
      : [],
    inbounds: inboundsRaw,
    outbounds: outboundsRaw,
    route: {
      ...routeRaw,
      ...(Array.isArray(routeRaw.rule_set)
        ? { rule_set: routeRaw.rule_set as RuleSetItem[] }
        : {}),
      ...(routeRules !== undefined ? { rules: routeRules } : {}),
    },
    experimental:
      parsed.experimental &&
      typeof parsed.experimental === "object" &&
      !Array.isArray(parsed.experimental)
        ? (parsed.experimental as SingBoxVisualConfig["experimental"])
        : {},
  };
}

function cleanRuleNode(
  rule: Record<string, unknown>,
  platform: PlatformType,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(rule)) {
    if (v === undefined || v === null || v === "") continue;
    if (
      depth > 0 &&
      [
        "action",
        "outbound",
        "server",
        "method",
        "no_drop",
        "rcode",
        "answer",
        "ns",
        "extra",
        "sniffer",
        "timeout",
        "strategy",
        "disable_cache",
        "disable_optimistic_cache",
        "rewrite_ttl",
        "client_subnet",
        "remove_client_subnet",
        "override_address",
        "override_port",
        "tls_fragment",
        "tls_record_fragment",
        "tag",
      ].includes(k)
    ) {
      continue;
    }

    if (Array.isArray(v)) {
      if (k === "rules") {
        if (rule.type === "logical") {
          out.rules = v
            .filter(
              (child): child is Record<string, unknown> =>
                Boolean(child) && typeof child === "object",
            )
            .map((child) => cleanRuleNode(child, platform, depth + 1));
        }
      } else if (v.length > 0) {
        out[k] = v;
      }
      continue;
    }

    if (k === "invert" && v === false) continue;
    if (k === "ip_is_private" && v === false) continue;
    if (k === "source_ip_is_private" && v === false) continue;
    if (k === "rule_set_ip_cidr_match_source" && v === false) continue;
    if (k === "match_response" && v === false) continue;
    if (k === "query_dnssec" && v === false) continue;
    if (k === "ip_accept_any" && v === false) continue;
    if (k === "disable_cache" && v === false) continue;

    out[k] = v;
  }

  if (out.type === "logical") {
    out.mode = out.mode === "or" ? "or" : "and";
    if (!Array.isArray(out.rules)) {
      out.rules = [];
    }
  } else {
    delete out.type;
    delete out.mode;
    delete out.rules;
  }

  if (depth === 0) {
    const act = (out.action as string | undefined) || "route";
    if (act === "route") {
      delete out.method;
      delete out.no_drop;
      delete out.rcode;
      delete out.answer;
      delete out.ns;
      delete out.extra;
      delete out.sniffer;
      delete out.override_address;
      delete out.override_port;
      if (out.action === "route" && (out.outbound || out.server)) {
        delete out.action;
      }
    } else if (act === "reject") {
      delete out.outbound;
      delete out.server;
      delete out.rcode;
      delete out.sniffer;
      delete out.timeout;
      delete out.strategy;
      delete out.disable_cache;
      delete out.rewrite_ttl;
      delete out.client_subnet;
      delete out.override_address;
      delete out.override_port;
    } else if (act === "hijack-dns" || act === "respond") {
      delete out.outbound;
      delete out.server;
      delete out.method;
      delete out.rcode;
      delete out.sniffer;
      delete out.timeout;
      delete out.strategy;
      delete out.disable_cache;
      delete out.rewrite_ttl;
      delete out.client_subnet;
      delete out.override_address;
      delete out.override_port;
    } else if (act === "sniff") {
      delete out.outbound;
      delete out.server;
      delete out.method;
      delete out.rcode;
      delete out.strategy;
      delete out.disable_cache;
      delete out.rewrite_ttl;
      delete out.client_subnet;
      delete out.override_address;
      delete out.override_port;
    } else if (act === "resolve") {
      delete out.outbound;
      delete out.method;
      delete out.rcode;
      delete out.sniffer;
      delete out.override_address;
      delete out.override_port;
    } else if (act === "predefined") {
      delete out.outbound;
      delete out.server;
      delete out.method;
      delete out.sniffer;
      delete out.timeout;
      delete out.strategy;
      delete out.disable_cache;
      delete out.rewrite_ttl;
      delete out.client_subnet;
    } else if (act === "route-options") {
      delete out.outbound;
      delete out.server;
      delete out.method;
      delete out.rcode;
      delete out.sniffer;
    }
  }

  return out;
}

function cleanObject(obj: Record<string, unknown>): Record<string, unknown> {
  const res: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length > 0) res[k] = v;
    } else if (typeof v === "object") {
      const cleaned = cleanObject(v as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) {
        res[k] = cleaned;
      }
    } else {
      res[k] = v;
    }
  }
  return res;
}

/**
 * Collects all `rule_set` tags referenced in `route.rules` and `dns.rules` (including nested logical rules)
 * that are not yet defined in `route.rule_set`.
 */
export function collectMissingRuleSetTags(
  state: SingBoxVisualConfig,
): string[] {
  const defined = new Set(
    (state.route?.rule_set || []).map((rs) => rs.tag).filter(Boolean),
  );
  const missing = new Set<string>();

  const walkRules = (rules?: NestedRuleItem[]) => {
    if (!Array.isArray(rules)) return;
    for (const r of rules) {
      if (Array.isArray(r.rule_set)) {
        for (const tag of r.rule_set) {
          if (tag && !defined.has(tag)) {
            missing.add(tag);
          }
        }
      }
      if (r.type === "logical" && Array.isArray(r.rules)) {
        walkRules(r.rules);
      }
    }
  };

  walkRules(state.route?.rules);
  walkRules(state.dns?.rules);

  return Array.from(missing);
}

/**
 * Serializes SingBoxVisualConfig state into a clean, schema-compliant JSON object.
 * Preserves empty sections as `{}` or `[]` when the config is an empty skeleton.
 */
export function serializeVisualStateToConfig(
  state: SingBoxVisualConfig,
  platform: PlatformType,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    $schema: state.$schema || "https://sing-box.sagernet.org/schema.json",
  };

  result.log = state.log
    ? cleanObject(state.log as Record<string, unknown>)
    : {};

  if (state.dns) {
    const { servers, rules, independent_cache: _ic, ...dnsRest } = state.dns;
    const dnsOut: Record<string, unknown> = cleanObject(dnsRest);
    if (Array.isArray(servers) && servers.length > 0) {
      dnsOut.servers = servers.map((s) =>
        cleanObject(s as Record<string, unknown>),
      );
    }
    if (Array.isArray(rules) && rules.length > 0) {
      dnsOut.rules = rules.map((r) =>
        cleanRuleNode(r as Record<string, unknown>, platform, 0),
      );
    }
    result.dns = dnsOut;
  } else {
    result.dns = {};
  }

  const cleanedNtp = state.ntp
    ? cleanObject(state.ntp as Record<string, unknown>)
    : {};
  if ("ntp" in state || Object.keys(cleanedNtp).length > 0) {
    result.ntp = cleanedNtp;
  }

  const cleanedCert = state.certificate
    ? cleanObject(state.certificate as Record<string, unknown>)
    : {};
  if ("certificate" in state || Object.keys(cleanedCert).length > 0) {
    result.certificate = cleanedCert;
  }

  if ("certificate_providers" in state) {
    result.certificate_providers = Array.isArray(state.certificate_providers)
      ? state.certificate_providers
      : [];
  }

  if (
    "http_clients" in state ||
    (Array.isArray(state.http_clients) && state.http_clients.length > 0)
  ) {
    result.http_clients = (state.http_clients || []).map((c) =>
      cleanObject(c as Record<string, unknown>),
    );
  }

  if ("endpoints" in state) {
    result.endpoints = Array.isArray(state.endpoints) ? state.endpoints : [];
  }

  result.inbounds = (state.inbounds || []).map((inb) => {
    const copy = { ...(inb as Record<string, unknown>) };
    return cleanObject(copy);
  });

  result.outbounds = (state.outbounds || []).map((outb) =>
    cleanObject(outb as Record<string, unknown>),
  );

  if (state.route) {
    const { rules, rule_set, ...routeRest } = state.route;
    const routeOut: Record<string, unknown> = cleanObject(routeRest);
    if (Array.isArray(rule_set) && rule_set.length > 0) {
      routeOut.rule_set = rule_set.map((rs) =>
        cleanObject(rs as Record<string, unknown>),
      );
    }
    if (Array.isArray(rules) && rules.length > 0) {
      routeOut.rules = rules.map((r) =>
        cleanRuleNode(r as Record<string, unknown>, platform, 0),
      );
    }
    result.route = routeOut;
  } else {
    result.route = {};
  }

  if ("services" in state) {
    result.services = Array.isArray(state.services) ? state.services : [];
  }

  result.experimental = state.experimental
    ? cleanObject(state.experimental as Record<string, unknown>)
    : {};

  return result;
}

/**
 * Validates explicit platform compatibility and sing-box 1.14 semantic rules
 * without mutating any fields. Any returned error blocks saving until resolved by the user.
 */
export function validateExplicitPlatformConstraints(
  state: SingBoxVisualConfig,
  platform: PlatformType,
): string[] {
  const errors: string[] = [];
  const platUpper = platform.toUpperCase();

  for (let i = 0; i < (state.inbounds || []).length; i++) {
    const inb = state.inbounds![i];
    if (inb.type === "tun") {
      if (inb.auto_redirect === true && platform !== "linux") {
        errors.push(
          `inbounds[${i}].auto_redirect: 仅 Linux 平台支持 auto_redirect (nftables)，当前平台 (${platUpper}) 不支持，请关闭该项`,
        );
      }
      if (
        platform === "macos" &&
        typeof inb.interface_name === "string" &&
        inb.interface_name.trim() !== "" &&
        !/^utun[0-9]*$/.test(inb.interface_name.trim())
      ) {
        errors.push(
          `inbounds[${i}].interface_name: macOS 平台 TUN 网卡名称必须为 utun[0-9]*（如 utun9）或留空由系统自动分配，当前值 '${inb.interface_name}' 不合法`,
        );
      }
      if (
        platform !== "android" &&
        ((Array.isArray(inb.include_package) &&
          inb.include_package.length > 0) ||
          (Array.isArray(inb.exclude_package) &&
            inb.exclude_package.length > 0))
      ) {
        errors.push(
          `inbounds[${i}]: Android 应用分流字段 (include_package / exclude_package) 仅适用于 Android 平台，当前平台 (${platUpper}) 不支持，请清空该项`,
        );
      }
      if ("stack" in inb && inb.stack !== undefined && inb.stack !== "") {
        errors.push(
          `inbounds[${i}].stack: 官方 Schema 不允许 stack 字段，请移除该项`,
        );
      }
    }
  }

  const checkRules = (rules: NestedRuleItem[] | undefined, prefix: string) => {
    if (!Array.isArray(rules)) return;
    rules.forEach((r, idx) => {
      const path = `${prefix}[${idx}]`;
      if (platform === "android") {
        for (const key of [
          "process_name",
          "process_path",
          "process_path_regex",
        ] as const) {
          if (Array.isArray(r[key]) && r[key]!.length > 0) {
            errors.push(
              `${path}.${key}: 桌面端进程匹配字段 '${key}' 不适用于 Android 平台，请改用 package_name 或移除该项`,
            );
          }
        }
      } else {
        for (const key of ["package_name", "package_name_regex"] as const) {
          if (Array.isArray(r[key]) && r[key]!.length > 0) {
            errors.push(
              `${path}.${key}: Android 应用包名匹配字段 '${key}' 不适用于桌面平台 (${platUpper})，请改用 process_name 或移除该项`,
            );
          }
        }
      }
      if (r.type === "logical" && Array.isArray(r.rules)) {
        checkRules(r.rules, `${path}.rules`);
      }
    });
  };

  checkRules(state.route?.rules, "route.rules");
  checkRules(state.dns?.rules, "dns.rules");

  for (let i = 0; i < (state.dns?.servers || []).length; i++) {
    const srv = state.dns!.servers![i];
    if (srv.detour === "direct") {
      errors.push(
        `dns.servers[${i}].detour: 不能将 detour 设为 'direct'（sing-box 1.14 中指向空 direct 出站会导致启动失败），请设为无绕行（直连）`,
      );
    }
  }

  for (let i = 0; i < (state.http_clients || []).length; i++) {
    const hc = state.http_clients![i];
    if (hc.detour === "direct") {
      errors.push(
        `http_clients[${i}].detour: 不能将 detour 设为 'direct'（sing-box 1.14 中指向空 direct 出站会导致启动失败），请移除 detour 字段以使用默认直连`,
      );
    }
  }

  return errors;
}
