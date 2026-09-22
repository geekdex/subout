use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::IpAddr;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RouteTraceResult {
    pub dns_rule: String,
    pub dns_server: String,
    pub route_rule: String,
    pub outbound: String,
}

/// Matches domain suffix in sing-box style.
/// e.g. "google.com" matches "google.com" and "www.google.com".
/// ".google.com" matches "www.google.com".
pub fn match_domain_suffix(domain: &str, suffix: &str) -> bool {
    let d = domain.trim().trim_end_matches('.').to_ascii_lowercase();
    let s = suffix
        .trim()
        .trim_start_matches('.')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if s.is_empty() || d.is_empty() {
        return false;
    }
    d == s || d.ends_with(&format!(".{}", s))
}

/// Matches domain keyword case-insensitively.
pub fn match_domain_keyword(domain: &str, keyword: &str) -> bool {
    let k = keyword.trim().to_ascii_lowercase();
    !k.is_empty() && domain.to_ascii_lowercase().contains(&k)
}

/// Checks if an IP address is within a CIDR string (e.g. "192.168.0.0/16" or "10.0.0.0/8").
pub fn ip_in_cidr(ip: IpAddr, cidr: &str) -> bool {
    let (net_str, prefix_len_str) = match cidr.split_once('/') {
        Some((n, p)) => (n.trim(), p.trim()),
        None => (cidr.trim(), ""),
    };
    match (ip, net_str.parse::<IpAddr>()) {
        (IpAddr::V4(target_v4), Ok(IpAddr::V4(net_v4))) => {
            let prefix_len = prefix_len_str.parse::<u32>().unwrap_or(32).min(32);
            if prefix_len == 0 {
                return true;
            }
            let mask = if prefix_len == 32 {
                u32::MAX
            } else {
                !((1u32 << (32 - prefix_len)) - 1)
            };
            (u32::from(target_v4) & mask) == (u32::from(net_v4) & mask)
        }
        (IpAddr::V6(target_v6), Ok(IpAddr::V6(net_v6))) => {
            let prefix_len = prefix_len_str.parse::<u32>().unwrap_or(128).min(128);
            if prefix_len == 0 {
                return true;
            }
            let mask = if prefix_len == 128 {
                u128::MAX
            } else {
                !((1u128 << (128 - prefix_len)) - 1)
            };
            (u128::from(target_v6) & mask) == (u128::from(net_v6) & mask)
        }
        _ => false,
    }
}

/// Checks if a domain belongs to mainland China domains / geosite-cn.
pub fn is_cn_domain(domain: &str) -> bool {
    let d = domain.trim().trim_end_matches('.').to_ascii_lowercase();
    if d.ends_with(".cn") {
        return true;
    }

    const KNOWN_CN_SUFFIXES: &[&str] = &[
        "qq.com",
        "tencent.com",
        "baidu.com",
        "bilibili.com",
        "zhihu.com",
        "taobao.com",
        "alipay.com",
        "aliyun.com",
        "aliyuncs.com",
        "alibaba.com",
        "jd.com",
        "163.com",
        "126.com",
        "sina.com",
        "sina.com.cn",
        "weibo.com",
        "bytedance.com",
        "douyin.com",
        "toutiao.com",
        "xiaohongshu.com",
        "meituan.com",
        "kuaishou.com",
        "csdn.net",
        "oschina.net",
        "gitee.com",
        "deepseek.com",
        "moonshot.cn",
        "zhipuai.cn",
        "baichuan-ai.com",
        "huawei.com",
        "honor.com",
        "xiaomi.com",
        "oppo.com",
        "vivo.com",
        "10010.com",
        "189.cn",
        "12306.cn",
        "gov.cn",
        "cn.bing.com",
        "npmmirror.com",
        "packages.microsoft.com",
        "bbs.deepin.org",
        "mama.cn",
        "soyobao.com",
        "xiaoshuxiong.com",
        "xscat.net",
        "qcloud.com",
        "byteimg.com",
        "spendleaf.com",
        "i-m.dev",
        "aiapp.pro",
        "webtech.wiki",
        "zed.dev",
    ];

    KNOWN_CN_SUFFIXES
        .iter()
        .any(|suffix| d == *suffix || d.ends_with(&format!(".{}", suffix)))
}

/// Matches geosite tag for domain.
pub fn domain_matches_geosite(domain: &str, tag: &str) -> bool {
    let d = domain.trim().trim_end_matches('.').to_ascii_lowercase();
    let norm = tag
        .trim()
        .to_ascii_lowercase()
        .trim_start_matches("geosite:")
        .trim_start_matches("geosite-")
        .to_string();

    match norm.as_str() {
        "cn" => is_cn_domain(&d),
        "geolocation-!cn" | "!cn" => !is_cn_domain(&d),
        "google" => {
            d == "google.com"
                || d.ends_with(".google.com")
                || d.ends_with(".google")
                || d == "gstatic.com"
                || d.ends_with(".gstatic.com")
                || d == "googleapis.com"
                || d.ends_with(".googleapis.com")
                || d == "googlevideo.com"
                || d.ends_with(".googlevideo.com")
                || d == "googleusercontent.com"
                || d.ends_with(".googleusercontent.com")
        }
        "youtube" => {
            d == "youtube.com"
                || d.ends_with(".youtube.com")
                || d == "youtu.be"
                || d.ends_with(".youtu.be")
                || d == "ytimg.com"
                || d.ends_with(".ytimg.com")
        }
        "twitter" => {
            d == "twitter.com"
                || d.ends_with(".twitter.com")
                || d == "x.com"
                || d.ends_with(".x.com")
                || d == "t.co"
                || d == "twimg.com"
                || d.ends_with(".twimg.com")
        }
        "github" => {
            d == "github.com"
                || d.ends_with(".github.com")
                || d == "githubassets.com"
                || d.ends_with(".githubassets.com")
                || d == "githubusercontent.com"
                || d.ends_with(".githubusercontent.com")
                || d == "github.io"
                || d.ends_with(".github.io")
                || d == "githubcopilot.com"
                || d.ends_with(".githubcopilot.com")
        }
        "openai" => {
            d == "openai.com"
                || d.ends_with(".openai.com")
                || d == "chatgpt.com"
                || d.ends_with(".chatgpt.com")
                || d == "oaistatic.com"
                || d.ends_with(".oaistatic.com")
                || d == "oaiusercontent.com"
                || d.ends_with(".oaiusercontent.com")
        }
        "telegram" => {
            d == "telegram.org"
                || d.ends_with(".telegram.org")
                || d == "t.me"
                || d.ends_with(".t.me")
                || d == "telegra.ph"
                || d.ends_with(".telegra.ph")
        }
        "netflix" => {
            d == "netflix.com"
                || d.ends_with(".netflix.com")
                || d == "netflix.net"
                || d.ends_with(".netflix.net")
                || d == "nflxvideo.net"
                || d.ends_with(".nflxvideo.net")
        }
        "apple" => {
            d == "apple.com"
                || d.ends_with(".apple.com")
                || d == "icloud.com"
                || d.ends_with(".icloud.com")
                || d == "mzstatic.com"
                || d.ends_with(".mzstatic.com")
        }
        "microsoft" => {
            d == "microsoft.com"
                || d.ends_with(".microsoft.com")
                || d == "windows.com"
                || d.ends_with(".windows.com")
                || d == "live.com"
                || d.ends_with(".live.com")
                || d == "bing.com"
                || d.ends_with(".bing.com")
        }
        "facebook" => {
            d == "facebook.com"
                || d.ends_with(".facebook.com")
                || d == "fbcdn.net"
                || d.ends_with(".fbcdn.net")
        }
        "instagram" => d == "instagram.com" || d.ends_with(".instagram.com"),
        "reddit" => {
            d == "reddit.com"
                || d.ends_with(".reddit.com")
                || d == "redd.it"
                || d.ends_with(".redd.it")
                || d == "redditstatic.com"
                || d.ends_with(".redditstatic.com")
        }
        "discord" => {
            d == "discord.com"
                || d.ends_with(".discord.com")
                || d == "discord.gg"
                || d.ends_with(".discord.gg")
                || d == "discordapp.com"
                || d.ends_with(".discordapp.com")
        }
        "jetbrains" => d == "jetbrains.com" || d.ends_with(".jetbrains.com"),
        "category-ads-all" | "category-ads" | "ads" => {
            d.contains("adservice")
                || d.contains("doubleclick")
                || d.contains("pagead")
                || d.contains("analytics")
                || d.contains("telemetry")
        }
        other => {
            d == other
                || d.ends_with(&format!(".{}", other))
                || d == format!("{}.com", other)
                || d.ends_with(&format!(".{}.com", other))
        }
    }
}

/// Helper to get a string slice or vector of string slices from a JSON Value.
fn get_str_list(val: Option<&Value>) -> Vec<&str> {
    match val {
        Some(Value::String(s)) => vec![s.as_str()],
        Some(Value::Array(arr)) => arr.iter().filter_map(|v| v.as_str()).collect(),
        _ => Vec::new(),
    }
}

/// Helper to get a list of ports from a JSON Value (number, array of numbers, or strings).
fn get_port_list(val: Option<&Value>) -> Vec<u16> {
    match val {
        Some(Value::Number(n)) => n.as_u64().and_then(|p| u16::try_from(p).ok()).into_iter().collect(),
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| match v {
                Value::Number(n) => n.as_u64().and_then(|p| u16::try_from(p).ok()),
                Value::String(s) => s.parse::<u16>().ok(),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Helper for simple regex / pattern matching without pulling external regex crate.
fn match_simple_pattern(pattern: &str, text: &str) -> bool {
    let p = pattern
        .trim()
        .trim_start_matches('^')
        .trim_end_matches('$')
        .to_ascii_lowercase();
    if p.contains('*') {
        let parts: Vec<&str> = p.split('*').collect();
        let mut idx = 0;
        for part in parts {
            if part.is_empty() {
                continue;
            }
            if let Some(pos) = text[idx..].find(part) {
                idx += pos + part.len();
            } else {
                return false;
            }
        }
        true
    } else {
        text.contains(&p)
    }
}

/// Tests a single leaf rule criteria (non-logical or child inside logical).
/// Returns a human-friendly description of what matched if successful.
fn test_rule_criteria(
    rule: &Value,
    domain: &str,
    ip: Option<IpAddr>,
    port: u16,
    protocol: &str,
    is_private_ip: bool,
) -> Option<String> {
    let d_lower = domain.to_ascii_lowercase();

    // 1. Exact domain matching
    for d in get_str_list(rule.get("domain")) {
        if d.trim().eq_ignore_ascii_case(&d_lower) {
            return Some(format!("域名 ({})", d.trim()));
        }
    }

    // 2. Domain suffix matching
    for suffix in get_str_list(rule.get("domain_suffix")) {
        if match_domain_suffix(&d_lower, suffix) {
            return Some(format!("域名后缀 ({})", suffix.trim()));
        }
    }

    // 3. Domain keyword matching
    for kw in get_str_list(rule.get("domain_keyword")) {
        if match_domain_keyword(&d_lower, kw) {
            return Some(format!("关键字 ({})", kw.trim()));
        }
    }

    // 4. Domain regex matching
    for reg in get_str_list(rule.get("domain_regex")) {
        if match_simple_pattern(reg, &d_lower) {
            return Some(format!("正则 ({})", reg.trim()));
        }
    }

    // 5. RuleSet & Geosite matching
    let mut rule_sets = get_str_list(rule.get("rule_set"));
    rule_sets.extend(get_str_list(rule.get("geosite")));
    for rs in rule_sets {
        let rs_trimmed = rs.trim();
        if domain_matches_geosite(&d_lower, rs_trimmed) {
            return Some(format!("规则集 ({})", rs_trimmed));
        }
    }

    // 6. Private IP matching
    if rule
        .get("ip_is_private")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        && is_private_ip
    {
        return Some("私有内网IP (ip_is_private)".to_string());
    }

    // 7. IP CIDR matching
    if let Some(target_ip) = ip {
        for cidr in get_str_list(rule.get("ip_cidr")) {
            if ip_in_cidr(target_ip, cidr) {
                return Some(format!("IP CIDR ({})", cidr.trim()));
            }
        }
    }

    // 8. Port matching
    let ports = get_port_list(rule.get("port"));
    if !ports.is_empty() && ports.contains(&port) {
        return Some(format!("目标端口 ({})", port));
    }

    // 9. Protocol matching
    let protocols = get_str_list(rule.get("protocol"));
    if !protocols.is_empty() && protocols.iter().any(|p| p.eq_ignore_ascii_case(protocol)) {
        return Some(format!("协议 ({})", protocol));
    }

    None
}

/// Evaluates a rule (which could be leaf or logical `type: "logical"`).
/// Returns `Some((match_description, target_tag))` if matched.
fn evaluate_rule(
    rule: &Value,
    domain: &str,
    ip: Option<IpAddr>,
    port: u16,
    protocol: &str,
    is_private_ip: bool,
    target_field: &str, // "server" for dns, "outbound" for route
) -> Option<(String, String)> {
    let rule_type = rule.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let target_opt = rule.get(target_field).and_then(|v| v.as_str());

    if rule_type == "logical" {
        let mode = rule.get("mode").and_then(|m| m.as_str()).unwrap_or("or");
        let sub_rules = rule.get("rules").and_then(|r| r.as_array())?;
        if sub_rules.is_empty() {
            return None;
        }

        if mode.eq_ignore_ascii_case("and") {
            let mut matched_reasons = Vec::new();
            for sub in sub_rules {
                let desc = test_rule_criteria(sub, domain, ip, port, protocol, is_private_ip)?;
                matched_reasons.push(desc);
            }
            let target = target_opt
                .or_else(|| sub_rules.first()?.get(target_field).and_then(|v| v.as_str()))?
                .to_string();
            return Some((matched_reasons.join(" + "), target));
        } else {
            // "or" mode (default)
            for sub in sub_rules {
                if let Some(desc) = test_rule_criteria(sub, domain, ip, port, protocol, is_private_ip) {
                    let target = target_opt
                        .or_else(|| sub.get(target_field).and_then(|v| v.as_str()))?
                        .to_string();
                    return Some((desc, target));
                }
            }
        }
    } else if let Some(desc) = test_rule_criteria(rule, domain, ip, port, protocol, is_private_ip) {
        let target = target_opt?.to_string();
        return Some((desc, target));
    }

    None
}

/// Resolves descriptive details for a DNS server tag.
pub fn format_dns_server(server_tag: &str, dns_val: &Value) -> String {
    let servers = dns_val.get("servers").and_then(|s| s.as_array());
    if let Some(srv_arr) = servers {
        for s in srv_arr {
            if s.get("tag").and_then(|t| t.as_str()) == Some(server_tag) {
                let srv_type = s.get("type").and_then(|t| t.as_str()).unwrap_or("udp");
                return match srv_type {
                    "fakeip" => format!("{} (FakeIP)", server_tag),
                    "local" => format!("{} (本地解析)", server_tag),
                    "https" | "tls" | "h3" | "quic" | "tcp" | "udp" => {
                        let host = s.get("server").and_then(|h| h.as_str()).unwrap_or("");
                        let detour = s.get("detour").and_then(|d| d.as_str());
                        if let Some(d) = detour {
                            format!("{} ({} {} ➔ {})", server_tag, srv_type.to_uppercase(), host, d)
                        } else if !host.is_empty() {
                            format!("{} ({} {})", server_tag, srv_type.to_uppercase(), host)
                        } else {
                            format!("{} ({})", server_tag, srv_type)
                        }
                    }
                    other => format!("{} ({})", server_tag, other),
                };
            }
        }
    }

    server_tag.to_string()
}

/// Resolves descriptive details for a route outbound tag.
pub fn format_outbound(outbound_tag: &str, config_val: &Value) -> String {
    if outbound_tag == "direct" {
        return "direct (直连出站)".to_string();
    }
    if outbound_tag == "block" {
        return "block (拦截丢弃)".to_string();
    }

    let outbounds = config_val.get("outbounds").and_then(|o| o.as_array());
    if let Some(arr) = outbounds {
        for o in arr {
            if o.get("tag").and_then(|t| t.as_str()) == Some(outbound_tag) {
                let o_type = o.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match o_type {
                    "direct" => return "direct (直连出站)".to_string(),
                    "block" => return "block (拦截丢弃)".to_string(),
                    "selector" => {
                        let default_target = o
                            .get("default")
                            .and_then(|d| d.as_str())
                            .or_else(|| {
                                o.get("outbounds")
                                    .and_then(|obs| obs.as_array())
                                    .and_then(|obs| obs.first())
                                    .and_then(|f| f.as_str())
                            });
                        if let Some(dt) = default_target
                            && dt != outbound_tag
                        {
                            return format!("{} ➔ {} (选择组)", outbound_tag, dt);
                        }
                        return format!("{} (选择组)", outbound_tag);
                    }
                    "urltest" => {
                        return format!("{} (自动优选)", outbound_tag);
                    }
                    "vless" | "vmess" | "trojan" | "hysteria2" | "hysteria" | "shadowsocks"
                    | "socks" | "http" | "tuic" | "wireguard" | "anytls" => {
                        return format!("{} ({} 节点)", outbound_tag, o_type);
                    }
                    other if !other.is_empty() => {
                        return format!("{} ({})", outbound_tag, other);
                    }
                    _ => return outbound_tag.to_string(),
                }
            }
        }
    }

    outbound_tag.to_string()
}

/// Extracts domain/host, IP, port, and protocol from a URL string.
pub fn parse_target_url(url_str: &str) -> (String, Option<IpAddr>, u16, String, bool) {
    let raw = url_str.trim();
    let has_scheme = raw.contains("://");
    let full_url = if has_scheme {
        raw.to_string()
    } else {
        format!("http://{}", raw)
    };

    if let Ok(parsed) = url::Url::parse(&full_url) {
        let domain = parsed.host_str().unwrap_or("").trim().to_string();
        let port = parsed.port().unwrap_or(if parsed.scheme() == "https" {
            443
        } else {
            80
        });
        let protocol = "tcp".to_string();
        let ip = domain.parse::<IpAddr>().ok();
        let is_private = if let Some(ip_val) = ip {
            match ip_val {
                IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
                IpAddr::V6(v6) => v6.is_loopback(),
            }
        } else {
            domain.eq_ignore_ascii_case("localhost")
        };
        (domain, ip, port, protocol, is_private)
    } else {
        let clean_host = raw
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .split('/')
            .next()
            .unwrap_or("")
            .split(':')
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        let ip = clean_host.parse::<IpAddr>().ok();
        let is_private = if let Some(ip_val) = ip {
            match ip_val {
                IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
                IpAddr::V6(v6) => v6.is_loopback(),
            }
        } else {
            clean_host.eq_ignore_ascii_case("localhost")
        };
        (clean_host, ip, 80, "tcp".to_string(), is_private)
    }
}

/// Traces the DNS rule and Routing rule matching for a given URL against a sing-box config.
pub fn trace_rules_for_url(config_val: &Value, url_str: &str) -> RouteTraceResult {
    let (domain, ip, port, protocol, is_private) = parse_target_url(url_str);

    // 1. DNS evaluation
    let dns_val = config_val.get("dns").unwrap_or(&Value::Null);
    let (dns_rule, dns_server) = if ip.is_some() {
        (
            "直接IP请求 (无需解析)".to_string(),
            "直接连接".to_string(),
        )
    } else {
        let mut matched_rule = None;
        if let Some(rules_arr) = dns_val.get("rules").and_then(|r| r.as_array()) {
            for r in rules_arr {
                if let Some((desc, server_tag)) = evaluate_rule(
                    r,
                    &domain,
                    ip,
                    port,
                    &protocol,
                    is_private,
                    "server",
                ) {
                    matched_rule = Some((desc, server_tag));
                    break;
                }
            }
        }

        let (r_desc, s_tag) = matched_rule.unwrap_or_else(|| {
            let final_tag = dns_val
                .get("final")
                .and_then(|f| f.as_str())
                .unwrap_or("dns_local");
            ("默认解析 (final)".to_string(), final_tag.to_string())
        });

        let formatted_server = format_dns_server(&s_tag, dns_val);
        (r_desc, formatted_server)
    };

    // 2. Route evaluation
    let route_val = config_val.get("route").unwrap_or(&Value::Null);
    let mut matched_route = None;

    if let Some(rules_arr) = route_val.get("rules").and_then(|r| r.as_array()) {
        for r in rules_arr {
            // Ignore non-routing actions like sniff / hijack-dns
            let action = r.get("action").and_then(|a| a.as_str()).unwrap_or("route");
            if action == "sniff" || action == "hijack-dns" {
                continue;
            }

            if let Some((desc, outbound_tag)) = evaluate_rule(
                r,
                &domain,
                ip,
                port,
                &protocol,
                is_private,
                "outbound",
            ) {
                matched_route = Some((desc, outbound_tag));
                break;
            }
        }
    }

    let (route_rule, outbound_tag) = matched_route.unwrap_or_else(|| {
        let final_outbound = route_val
            .get("final")
            .and_then(|f| f.as_str())
            .unwrap_or("direct");
        ("默认分流 (final)".to_string(), final_outbound.to_string())
    });

    let formatted_outbound = format_outbound(&outbound_tag, config_val);

    RouteTraceResult {
        dns_rule,
        dns_server,
        route_rule,
        outbound: formatted_outbound,
    }
}

/// Loads active configuration from disk running config or active mode in database.
pub fn load_active_config(db_path: &str) -> Option<Value> {
    let running_path = crate::service::SingBoxServiceManager::get_running_config_path();
    if Path::new(&running_path).is_file()
        && let Ok(content) = std::fs::read_to_string(&running_path)
        && let Ok(val) = serde_json::from_str::<Value>(&content)
    {
        return Some(val);
    }

    if let Ok(conn) = rusqlite::Connection::open(db_path)
        && let Ok(val) = crate::web::service_api::get_active_config_for_mode(&conn)
    {
        return Some(val);
    }

    None
}

/// Convenient helper for `test_site_reachability` to evaluate trace given AppState and URL.
pub fn evaluate_site_trace(state: &crate::web::AppState, url_str: &str) -> Option<RouteTraceResult> {
    let config_val = load_active_config(&state.db_path)?;
    Some(trace_rules_for_url(&config_val, url_str))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_domain_suffix_matching() {
        assert!(match_domain_suffix("www.google.com", "google.com"));
        assert!(match_domain_suffix("google.com", "google.com"));
        assert!(match_domain_suffix("sub.mail.google.com", ".google.com"));
        assert!(match_domain_suffix("google.com", ".google.com"));
        assert!(!match_domain_suffix("notgoogle.com", "google.com"));
        assert!(!match_domain_suffix("google.cn", "google.com"));
    }

    #[test]
    fn test_ip_in_cidr() {
        let ip: IpAddr = "192.168.1.100".parse().unwrap();
        assert!(ip_in_cidr(ip, "192.168.0.0/16"));
        assert!(ip_in_cidr(ip, "192.168.1.0/24"));
        assert!(!ip_in_cidr(ip, "10.0.0.0/8"));
        assert!(!ip_in_cidr(ip, "172.16.0.0/12"));
    }

    #[test]
    fn test_is_cn_domain() {
        assert!(is_cn_domain("www.baidu.com"));
        assert!(is_cn_domain("api.bilibili.com"));
        assert!(is_cn_domain("test.edu.cn"));
        assert!(!is_cn_domain("www.google.com"));
        assert!(!is_cn_domain("twitter.com"));
    }

    #[test]
    fn test_trace_rules_simple_mode() {
        let config = json!({
            "dns": {
                "servers": [
                    { "tag": "dns_local", "type": "udp", "server": "223.5.5.5" },
                    { "tag": "dns_fakeip", "type": "fakeip" }
                ],
                "rules": [
                    { "rule_set": "geosite-category-ads-all", "server": "dns_local" },
                    { "rule_set": "geosite-cn", "server": "dns_local" },
                    { "rule_set": "geosite-geolocation-!cn", "server": "dns_fakeip" }
                ],
                "final": "dns_local"
            },
            "outbounds": [
                { "tag": "direct", "type": "direct" },
                { "tag": "block", "type": "block" },
                { "tag": "proxy", "type": "selector", "default": "AUTO-Test" },
                { "tag": "AUTO-Test", "type": "urltest" }
            ],
            "route": {
                "rules": [
                    { "action": "sniff" },
                    { "protocol": "dns", "action": "hijack-dns" },
                    { "rule_set": "geosite-category-ads-all", "outbound": "block" },
                    { "ip_is_private": true, "outbound": "direct" },
                    { "rule_set": "geosite-cn", "outbound": "direct" },
                    { "rule_set": "geosite-geolocation-!cn", "outbound": "proxy" }
                ],
                "final": "proxy"
            }
        });

        // 1. Foreign site (Google)
        let google_trace = trace_rules_for_url(&config, "https://www.google.com");
        assert_eq!(google_trace.dns_rule, "规则集 (geosite-geolocation-!cn)");
        assert_eq!(google_trace.dns_server, "dns_fakeip (FakeIP)");
        assert_eq!(google_trace.route_rule, "规则集 (geosite-geolocation-!cn)");
        assert_eq!(google_trace.outbound, "proxy ➔ AUTO-Test (选择组)");

        // 2. Domestic site (Bilibili)
        let bili_trace = trace_rules_for_url(&config, "https://www.bilibili.com");
        assert_eq!(bili_trace.dns_rule, "规则集 (geosite-cn)");
        assert_eq!(bili_trace.dns_server, "dns_local (UDP 223.5.5.5)");
        assert_eq!(bili_trace.route_rule, "规则集 (geosite-cn)");
        assert_eq!(bili_trace.outbound, "direct (直连出站)");

        // 3. Local private IP
        let ip_trace = trace_rules_for_url(&config, "http://192.168.1.1:8080");
        assert_eq!(ip_trace.dns_rule, "直接IP请求 (无需解析)");
        assert_eq!(ip_trace.dns_server, "直接连接");
        assert_eq!(ip_trace.route_rule, "私有内网IP (ip_is_private)");
        assert_eq!(ip_trace.outbound, "direct (直连出站)");
    }

    #[test]
    fn test_trace_rules_logical_mode() {
        let config = json!({
            "dns": {
                "servers": [
                    { "tag": "local-dns", "type": "local" },
                    { "tag": "remote-dns", "type": "fakeip" }
                ],
                "rules": [
                    {
                        "type": "logical",
                        "mode": "or",
                        "rules": [
                            { "domain_suffix": ["baidu.com", "qq.com"] }
                        ],
                        "server": "local-dns"
                    },
                    {
                        "type": "logical",
                        "mode": "or",
                        "rules": [
                            { "domain_suffix": ["chatgpt.com", "openai.com"] }
                        ],
                        "server": "remote-dns"
                    }
                ],
                "final": "local-dns"
            },
            "outbounds": [
                { "tag": "direct", "type": "direct" },
                { "tag": "us_self", "type": "vless" }
            ],
            "route": {
                "rules": [
                    {
                        "type": "logical",
                        "mode": "or",
                        "rules": [
                            { "domain_suffix": ["chatgpt.com", "openai.com"] }
                        ],
                        "outbound": "us_self"
                    }
                ],
                "final": "direct"
            }
        });

        let gpt_trace = trace_rules_for_url(&config, "https://chatgpt.com/explore");
        assert_eq!(gpt_trace.dns_rule, "域名后缀 (chatgpt.com)");
        assert_eq!(gpt_trace.dns_server, "remote-dns (FakeIP)");
        assert_eq!(gpt_trace.route_rule, "域名后缀 (chatgpt.com)");
        assert_eq!(gpt_trace.outbound, "us_self (vless 节点)");
    }
}
