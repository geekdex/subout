use crate::db;
use anyhow::Result;
use rusqlite::Connection;
use serde_json::{Value, json};

/// Generate the running config from the currently active `base_config` sections
/// stored in the database. Each saved config is self-contained — the outbounds
/// list already includes the full node definitions and group definitions, so
/// this function is a thin passthrough that merges the 6 sections.
pub fn generate_config(conn: &Connection) -> Result<Value> {
    let log_str = db::get_base_config_section(conn, "log")?.unwrap_or_else(|| "{}".to_string());
    let dns_str = db::get_base_config_section(conn, "dns")?.unwrap_or_else(|| "{}".to_string());
    let inbounds_str =
        db::get_base_config_section(conn, "inbounds")?.unwrap_or_else(|| "[]".to_string());
    let outbounds_str =
        db::get_base_config_section(conn, "outbounds")?.unwrap_or_else(|| "[]".to_string());
    let route_str = db::get_base_config_section(conn, "route")?.unwrap_or_else(|| "{}".to_string());
    let experimental_str =
        db::get_base_config_section(conn, "experimental")?.unwrap_or_else(|| "{}".to_string());

    let log: Value = serde_json::from_str(&log_str).unwrap_or_else(|_| serde_json::json!({}));
    let dns: Value = serde_json::from_str(&dns_str).unwrap_or_else(|_| serde_json::json!({}));
    let inbounds: Value =
        serde_json::from_str(&inbounds_str).unwrap_or_else(|_| serde_json::json!([]));
    let outbounds: Value =
        serde_json::from_str(&outbounds_str).unwrap_or_else(|_| serde_json::json!([]));
    let route: Value = serde_json::from_str(&route_str).unwrap_or_else(|_| serde_json::json!({}));
    let experimental: Value =
        serde_json::from_str(&experimental_str).unwrap_or_else(|_| serde_json::json!({}));

    generate_config_with_base(conn, log, dns, inbounds, outbounds, route, experimental)
}

/// Merge the 6 sections into a complete sing-box config.
///
/// The configuration is treated as a self-contained snapshot: the `outbounds`
/// array already contains all node definitions and group definitions inlined
/// (deep-copied at import time). This function does NOT query the database for
/// nodes or outbound groups — it simply returns the sections as-is, preserving
/// the WYSIWYG contract between the editor and the generated running config.
///
/// The `conn` parameter is retained for signature stability but unused.
pub fn sanitize_outbound_value(outbound: &mut Value) {
    if let Some(obj) = outbound.as_object_mut() {
        if let Some(outbound_type) = obj.get("type").and_then(|t| t.as_str()) {
            let tls_supported = matches!(
                outbound_type,
                "http"
                    | "vmess"
                    | "vless"
                    | "trojan"
                    | "anytls"
                    | "hysteria"
                    | "hysteria2"
                    | "shadowtls"
                    | "tuic"
                    | "v2ray"
            );
            if !tls_supported {
                obj.remove("tls");
            }
        }
    }
}

pub fn sanitize_inbound_value(inbound: &mut Value) {
    if let Some(obj) = inbound.as_object_mut() {
        let is_tun = obj.get("type").and_then(|t| t.as_str()) == Some("tun");

        if !cfg!(target_os = "linux") {
            obj.remove("auto_redirect");
            if is_tun {
                if let Some(iface) = obj.get("interface_name").and_then(|i| i.as_str()) {
                    if iface == "tun0" || (cfg!(target_os = "macos") && !iface.starts_with("utun")) {
                        obj.insert("interface_name".to_string(), json!(""));
                    }
                }

                // On macOS, FakeIP and TUN transparent proxy require stack: "mixed" or "gvisor".
                // system stack on Darwin does not handle FakeIP reverse mapping or TCP interception.
                if cfg!(target_os = "macos") {
                    let current_stack = obj.get("stack").and_then(|s| s.as_str());
                    if current_stack.is_none() || current_stack == Some("system") {
                        obj.insert("stack".to_string(), json!("mixed"));
                    }
                }

                // Ensure IPv6 dual-stack address is present on macOS/Windows to prevent IPv6 leakage / SSL_ERROR_SYSCALL
                if let Some(addr_arr) = obj.get_mut("address").and_then(|v| v.as_array_mut()) {
                    let has_ipv6 = addr_arr.iter().any(|a| a.as_str().map_or(false, |s| s.contains(':')));
                    if !has_ipv6 {
                        addr_arr.push(json!("fd00::1/126"));
                    }
                } else {
                    obj.insert("address".to_string(), json!(["172.19.0.1/30", "fd00::1/126"]));
                }

                // On macOS/Windows the routing stack is weaker than Linux nftables.
                // strict_route MUST be true to prevent traffic from bypassing the TUN
                // interface via the real network adapter. Unconditionally enforce this —
                // even if the user explicitly set it to false in their config.
                if cfg!(target_os = "macos") || cfg!(target_os = "windows") {
                    obj.insert("strict_route".to_string(), json!(true));
                } else if !obj.contains_key("strict_route") {
                    obj.insert("strict_route".to_string(), json!(true));
                }
            }
        }
    }
}

pub fn sanitize_inbounds_value(inbounds: &mut Value) {
    if let Some(arr) = inbounds.as_array_mut() {
        for inbound in arr {
            sanitize_inbound_value(inbound);
        }
    }
}

pub fn sanitize_outbounds_value(outbounds: &mut Value) {
    if let Some(arr) = outbounds.as_array_mut() {
        for outbound in arr {
            sanitize_outbound_value(outbound);
        }
    }
}

pub fn sanitize_dns_value(dns: &mut Value) {
    if let Some(obj) = dns.as_object_mut() {
        if let Some(servers) = obj.get_mut("servers").and_then(|s| s.as_array_mut()) {
            for server in servers {
                if let Some(srv_obj) = server.as_object_mut() {
                    if srv_obj.get("type").and_then(|t| t.as_str()) == Some("fakeip") {
                        if !srv_obj.contains_key("inet4_range") {
                            srv_obj.insert("inet4_range".to_string(), json!("198.18.0.0/15"));
                        }
                        if !srv_obj.contains_key("inet6_range") {
                            srv_obj.insert("inet6_range".to_string(), json!("fc00::/18"));
                        }
                    }
                }
            }
        }
    }
}

pub fn sanitize_route_value(route: &mut Value) {
    if let Some(obj) = route.as_object_mut() {
        // Ensure auto_detect_interface is true to prevent routing loops
        if !obj.contains_key("auto_detect_interface") {
            obj.insert("auto_detect_interface".to_string(), json!(true));
        }

        // Reorder route rules so that DNS hijacking rules and sniff rules always precede
        // any IP CIDR / private IP direct rules. Otherwise, DNS queries to router IPs (e.g. 192.168.0.1:53)
        // match the private CIDR rule and bypass DNS hijacking entirely.
        if let Some(rules_arr) = obj.get_mut("rules").and_then(|r| r.as_array_mut()) {
            let mut sniff_rules = Vec::new();
            let mut dns_hijack_rules = Vec::new();
            let mut other_rules = Vec::new();

            for rule in rules_arr.drain(..) {
                let action = rule.get("action").and_then(|a| a.as_str()).unwrap_or("");
                let is_dns_hijack = action == "hijack-dns"
                    || rule.get("protocol").and_then(|p| p.as_str()) == Some("dns")
                    || (rule.get("port").map_or(false, |p| {
                        p.as_u64() == Some(53)
                            || p.as_array().map_or(false, |arr| arr.iter().any(|v| v.as_u64() == Some(53)))
                    }) && action == "hijack-dns");

                if action == "sniff" {
                    sniff_rules.push(rule);
                } else if is_dns_hijack {
                    dns_hijack_rules.push(rule);
                } else {
                    other_rules.push(rule);
                }
            }

            rules_arr.extend(sniff_rules);
            rules_arr.extend(dns_hijack_rules);
            rules_arr.extend(other_rules);
        }
    }
}

pub fn generate_config_with_base(
    _conn: &Connection,
    log: Value,
    mut dns: Value,
    mut inbounds: Value,
    mut outbounds: Value,
    mut route: Value,
    experimental: Value,
) -> Result<Value> {
    sanitize_dns_value(&mut dns);
    sanitize_inbounds_value(&mut inbounds);
    sanitize_outbounds_value(&mut outbounds);
    sanitize_route_value(&mut route);
    Ok(json!({
        "log": log,
        "dns": dns,
        "inbounds": inbounds,
        "outbounds": outbounds,
        "route": route,
        "experimental": experimental
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_passthrough_merges_sections_as_is() {
        let conn = db::init_db(":memory:").unwrap();

        let log = json!({ "level": "warn" });
        let dns = json!({ "final": "local-dns" });
        let inbounds = json!([{ "type": "mixed", "tag": "mixed-in" }]);
        let outbounds = json!([
            {
                "type": "vless",
                "tag": "proxy",
                "server": "127.0.0.1",
                "server_port": 443
            },
            {
                "type": "selector",
                "tag": "my-selector",
                "outbounds": ["proxy", "direct"]
            },
            {
                "type": "direct",
                "tag": "direct"
            }
        ]);
        let route = json!({ "final": "direct", "auto_detect_interface": true });
        let experimental = json!({});

        let result = generate_config_with_base(
            &conn,
            log.clone(),
            dns.clone(),
            inbounds.clone(),
            outbounds.clone(),
            route.clone(),
            experimental.clone(),
        )
        .unwrap();

        // The generated config should be the sanitized merge of the 6 sections
        assert_eq!(result.get("log"), Some(&log));
        assert_eq!(result.get("dns"), Some(&dns));
        assert_eq!(result.get("inbounds"), Some(&inbounds));
        assert_eq!(result.get("outbounds"), Some(&outbounds));
        assert_eq!(result.get("route"), Some(&route));
        assert_eq!(result.get("experimental"), Some(&experimental));

        let outbounds_arr = result.get("outbounds").unwrap().as_array().unwrap();
        assert_eq!(outbounds_arr.len(), 3);
        // Selector is preserved verbatim (no expansion from DB).
        let selector = outbounds_arr
            .iter()
            .find(|o| o.get("tag").unwrap().as_str() == Some("my-selector"))
            .unwrap();
        assert_eq!(selector.get("type").unwrap().as_str(), Some("selector"));
        assert_eq!(
            selector.get("outbounds").unwrap().as_array().unwrap().len(),
            2
        );
    }

    #[test]
    fn test_sanitize_inbounds_non_linux() {
        let mut inbounds = json!([
            {
                "type": "tun",
                "tag": "tun-in",
                "interface_name": "tun0",
                "auto_redirect": true
            }
        ]);
        sanitize_inbounds_value(&mut inbounds);
        if cfg!(target_os = "linux") {
            assert_eq!(inbounds[0].get("auto_redirect"), Some(&json!(true)));
            assert_eq!(inbounds[0].get("interface_name"), Some(&json!("tun0")));
        } else {
            assert_eq!(inbounds[0].get("auto_redirect"), None);
            assert_eq!(inbounds[0].get("interface_name"), Some(&json!("")));
            assert_eq!(inbounds[0].get("address"), Some(&json!(["172.19.0.1/30", "fd00::1/126"])));
            assert_eq!(inbounds[0].get("strict_route"), Some(&json!(true)));
            if cfg!(target_os = "macos") {
                assert_eq!(inbounds[0].get("stack"), Some(&json!("mixed")));
            }
        }
    }

    #[test]
    fn test_sanitize_route_reorders_hijack_dns() {
        let mut route = json!({
            "rules": [
                { "outbound": "direct", "ip_cidr": ["192.168.0.0/24"] },
                { "action": "sniff" },
                { "action": "hijack-dns", "protocol": "dns" }
            ]
        });
        sanitize_route_value(&mut route);
        let rules = route.get("rules").unwrap().as_array().unwrap();
        assert_eq!(rules[0].get("action").unwrap().as_str(), Some("sniff"));
        assert_eq!(rules[1].get("action").unwrap().as_str(), Some("hijack-dns"));
        assert_eq!(rules[2].get("ip_cidr").is_some(), true);
        assert_eq!(route.get("auto_detect_interface"), Some(&json!(true)));
    }
}
