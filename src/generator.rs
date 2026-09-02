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
    if let Some(obj) = outbound.as_object_mut()
        && let Some(outbound_type) = obj.get("type").and_then(|t| t.as_str())
    {
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

pub fn sanitize_inbound_value(inbound: &mut Value) {
    crate::platform::current_platform().sanitize_inbound(inbound);
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
        if !obj.contains_key("strategy")
            || obj
                .get("strategy")
                .and_then(|s| s.as_str())
                .is_none_or(|s| s.trim().is_empty())
        {
            obj.insert("strategy".to_string(), json!("prefer_ipv4"));
        }
        if let Some(servers) = obj.get_mut("servers").and_then(|s| s.as_array_mut()) {
            for server in servers {
                if let Some(srv_obj) = server.as_object_mut()
                    && srv_obj.get("type").and_then(|t| t.as_str()) == Some("fakeip")
                {
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

pub fn sanitize_route_value(route: &mut Value) {
    if let Some(obj) = route.as_object_mut() {
        // Ensure auto_detect_interface is true to prevent routing loops if not specified
        if !obj.contains_key("auto_detect_interface") {
            obj.insert("auto_detect_interface".to_string(), json!(true));
        }
    }
}

use std::collections::HashSet;

pub fn sanitize_log_value(log: &mut Value) {
    if let Some(obj) = log.as_object_mut() {
        if !obj.contains_key("level")
            || obj
                .get("level")
                .and_then(|s| s.as_str())
                .is_none_or(|s| s.trim().is_empty())
        {
            obj.insert("level".to_string(), json!("info"));
        }
        if !obj.contains_key("timestamp") {
            obj.insert("timestamp".to_string(), json!(true));
        }
    }
}

pub fn generate_config_with_base(
    _conn: &Connection,
    mut log: Value,
    mut dns: Value,
    mut inbounds: Value,
    mut outbounds: Value,
    mut route: Value,
    experimental: Value,
) -> Result<Value> {
    sanitize_log_value(&mut log);
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

/// Synchronize the given configuration with the latest resources in the database (enabled nodes and outbound groups),
/// ensuring:
/// 1. `direct` and `block` system outbounds are ALWAYS present and placed first.
/// 2. Outbound groups from DB are updated with resolved valid node members.
/// 3. All enabled nodes from the database are imported as single node outbounds.
/// 4. Any route / dns items pointing to outbounds that no longer exist are automatically repaired to "direct".
pub fn sync_config_with_latest_resources(
    conn: &Connection,
    base_config: &Value,
    deleted_tags: &[String],
) -> Result<(Value, Vec<String>)> {
    let proxy_types = [
        "vmess",
        "vless",
        "trojan",
        "shadowsocks",
        "socks",
        "http",
        "hysteria",
        "hysteria2",
        "anytls",
        "tuic",
        "wireguard",
        "shadowtls",
        "v2ray",
    ];

    let deleted_set: HashSet<&str> = deleted_tags.iter().map(|s| s.as_str()).collect();

    // 1. Collect non-group non-proxy system outbounds and custom nodes
    let mut system_outbounds = Vec::new();
    let mut template_custom_nodes = Vec::new();

    if let Some(orig_outbounds) = base_config.get("outbounds").and_then(|o| o.as_array()) {
        for o in orig_outbounds {
            let o_type = o.get("type").and_then(|t| t.as_str()).unwrap_or_default();
            let o_tag = o.get("tag").and_then(|t| t.as_str()).unwrap_or_default();

            if matches!(
                o_type,
                "selector" | "urltest" | "url-test" | "fallback" | "loadbalance"
            ) {
                // Outbound groups will be refreshed from database
                continue;
            } else if proxy_types.contains(&o_type) {
                if !deleted_set.contains(o_tag) {
                    template_custom_nodes.push(o.clone());
                }
            } else {
                system_outbounds.push(o.clone());
            }
        }
    }

    // Ensure direct & block exist if base_config didn't have them
    if !system_outbounds
        .iter()
        .any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("direct"))
    {
        system_outbounds.push(json!({"type": "direct", "tag": "direct"}));
    }
    if !system_outbounds
        .iter()
        .any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("block"))
    {
        system_outbounds.push(json!({"type": "block", "tag": "block"}));
    }

    // 2. Fetch outbound groups from DB and compute resolved nodes
    let db_groups = db::get_outbound_groups(conn)?;
    let mut db_group_map = std::collections::HashMap::new();
    for group in &db_groups {
        let resolved = db::resolve_group_nodes(conn, group)?;
        db_group_map.insert(group.tag.clone(), (group.clone(), resolved));
    }

    // 3. Collect active enabled proxy nodes from DB
    let enabled_nodes = db::get_nodes(conn)?;
    let mut nodes_map = std::collections::HashMap::new();
    for node in enabled_nodes {
        if node.enabled
            && !deleted_set.contains(node.tag.as_str())
            && let Ok(mut val) = serde_json::from_str::<Value>(&node.raw_json)
            && let Some(obj) = val.as_object_mut()
        {
            obj.insert("tag".to_string(), Value::String(node.tag.clone()));
            nodes_map.insert(node.tag.clone(), Value::Object(obj.clone()));
        }
    }

    // Preserve any custom node from template that is not in DB and not deleted
    for custom_node in template_custom_nodes {
        if let Some(tag) = custom_node.get("tag").and_then(|t| t.as_str())
            && !nodes_map.contains_key(tag)
            && !deleted_set.contains(tag)
        {
            nodes_map.insert(tag.to_string(), custom_node);
        }
    }

    // 4. Construct strategy groups list
    let mut final_groups = Vec::new();
    let mut seen_group_tags = HashSet::new();

    for group in &db_groups {
        if !seen_group_tags.contains(&group.tag) {
            seen_group_tags.insert(group.tag.clone());
            let resolved = db_group_map
                .get(&group.tag)
                .map(|(_, r)| r.clone())
                .unwrap_or_default();
            let mut g_val = json!({
                "type": group.group_type,
                "tag": group.tag,
                "outbounds": resolved,
            });
            if group.group_type == "urltest" {
                if let Some(ref u) = group.url {
                    g_val
                        .as_object_mut()
                        .unwrap()
                        .insert("url".to_string(), json!(u));
                }
                if let Some(ref iv) = group.interval {
                    g_val
                        .as_object_mut()
                        .unwrap()
                        .insert("interval".to_string(), json!(iv));
                }
                if let Some(tol) = group.tolerance {
                    g_val
                        .as_object_mut()
                        .unwrap()
                        .insert("tolerance".to_string(), json!(tol));
                }
            }
            final_groups.push(g_val);
        }
    }

    // 5. Filter group member lists to ensure every referenced tag exists
    let mut all_valid_tags = HashSet::new();
    for s in &system_outbounds {
        if let Some(t) = s.get("tag").and_then(|t| t.as_str()) {
            all_valid_tags.insert(t.to_string());
        }
    }
    for g in &final_groups {
        if let Some(t) = g.get("tag").and_then(|t| t.as_str()) {
            all_valid_tags.insert(t.to_string());
        }
    }
    for t in nodes_map.keys() {
        all_valid_tags.insert(t.clone());
    }

    for g in &mut final_groups {
        if let Some(member_arr) = g.get_mut("outbounds").and_then(|o| o.as_array_mut()) {
            member_arr.retain(|m| {
                let m_str = m.as_str().unwrap_or_default();
                all_valid_tags.contains(m_str) && !deleted_set.contains(m_str)
            });
            if member_arr.is_empty() && all_valid_tags.contains("direct") {
                member_arr.push(json!("direct"));
            }
        }
    }

    // 6. Assemble complete outbounds list in order: System Outbounds -> Strategy Groups -> Proxy Nodes
    let mut outbounds_list = Vec::new();
    outbounds_list.extend(system_outbounds);
    outbounds_list.extend(final_groups);

    for (_, node_val) in nodes_map {
        outbounds_list.push(node_val);
    }

    for o in &mut outbounds_list {
        sanitize_outbound_value(o);
    }

    // Rebuild all_valid_tags
    all_valid_tags.clear();
    for o in &outbounds_list {
        if let Some(t) = o.get("tag").and_then(|t| t.as_str()) {
            all_valid_tags.insert(t.to_string());
        }
    }

    // 7. Repair route and DNS rules referencing missing tags
    let mut updated_config = base_config.clone();
    let mut repaired_tags = Vec::new();

    if let Some(obj) = updated_config.as_object_mut() {
        obj.insert("outbounds".to_string(), json!(outbounds_list));

        // Repair route
        if let Some(route_obj) = obj.get_mut("route").and_then(|r| r.as_object_mut()) {
            if let Some(final_tag) = route_obj.get("final").and_then(|f| f.as_str())
                && !all_valid_tags.contains(final_tag)
            {
                repaired_tags.push(format!("route.final ({} -> direct)", final_tag));
                route_obj.insert("final".to_string(), json!("direct"));
            }
            if let Some(rules) = route_obj.get_mut("rules").and_then(|r| r.as_array_mut()) {
                for (idx, rule) in rules.iter_mut().enumerate() {
                    if let Some(rule_obj) = rule.as_object_mut()
                        && let Some(ob) = rule_obj.get("outbound").and_then(|o| o.as_str())
                        && !all_valid_tags.contains(ob)
                    {
                        repaired_tags.push(format!(
                            "route.rules[{}].outbound ({} -> direct)",
                            idx + 1,
                            ob
                        ));
                        rule_obj.insert("outbound".to_string(), json!("direct"));
                    }
                }
            }
        }

        // Repair DNS
        if let Some(dns_obj) = obj.get_mut("dns").and_then(|d| d.as_object_mut())
            && let Some(servers) = dns_obj.get_mut("servers").and_then(|s| s.as_array_mut())
        {
            for (idx, server) in servers.iter_mut().enumerate() {
                if let Some(srv_obj) = server.as_object_mut()
                    && let Some(detour) = srv_obj.get("detour").and_then(|d| d.as_str())
                    && !all_valid_tags.contains(detour)
                {
                    repaired_tags.push(format!(
                        "dns.servers[{}].detour ({} -> direct)",
                        idx + 1,
                        detour
                    ));
                    srv_obj.insert("detour".to_string(), json!("direct"));
                }
            }
        }
    }

    Ok((updated_config, repaired_tags))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_sanitize_log_defaults() {
        let mut log = json!({});
        sanitize_log_value(&mut log);
        assert_eq!(log.get("level").and_then(|v| v.as_str()), Some("info"));
        assert_eq!(log.get("timestamp").and_then(|v| v.as_bool()), Some(true));

        let mut custom_log =
            json!({ "level": "warn", "output": "sing-box.log", "timestamp": false });
        sanitize_log_value(&mut custom_log);
        assert_eq!(
            custom_log.get("level").and_then(|v| v.as_str()),
            Some("warn")
        );
        assert_eq!(
            custom_log.get("output").and_then(|v| v.as_str()),
            Some("sing-box.log")
        );
        assert_eq!(
            custom_log.get("timestamp").and_then(|v| v.as_bool()),
            Some(false)
        );
    }

    #[test]
    fn test_passthrough_merges_sections_as_is() {
        let conn = db::init_db(":memory:").unwrap();

        let log = json!({ "level": "warn", "timestamp": true });
        let dns = json!({ "final": "local-dns", "strategy": "prefer_ipv4" });
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
    fn test_sanitize_inbounds_strategies() {
        use crate::platform::PlatformStrategy;

        // Test Linux strategy
        let mut linux_inbound = json!({
            "type": "tun",
            "tag": "tun-in",
            "interface_name": "tun0",
            "auto_redirect": true
        });
        crate::platform::linux_platform().sanitize_inbound(&mut linux_inbound);
        assert_eq!(linux_inbound.get("auto_redirect"), Some(&json!(true)));
        assert_eq!(linux_inbound.get("interface_name"), Some(&json!("tun0")));

        // Test macOS strategy
        let mut macos_inbound = json!({
            "type": "tun",
            "tag": "tun-in",
            "interface_name": "tun0",
            "auto_redirect": true
        });
        crate::platform::macos_platform().sanitize_inbound(&mut macos_inbound);
        assert_eq!(macos_inbound.get("auto_redirect"), None);
        assert_eq!(macos_inbound.get("interface_name"), None);
        assert_eq!(
            macos_inbound.get("address"),
            Some(&json!(["172.19.0.1/30", "fd00::1/126"]))
        );
        assert_eq!(macos_inbound.get("strict_route"), Some(&json!(true)));
        assert_eq!(macos_inbound.get("stack"), Some(&json!("mixed")));

        // Test Windows strategy
        let mut win_inbound = json!({
            "type": "tun",
            "tag": "tun-in",
            "interface_name": "tun0",
            "auto_redirect": true
        });
        crate::platform::windows_platform().sanitize_inbound(&mut win_inbound);
        assert_eq!(win_inbound.get("auto_redirect"), None);
        assert_eq!(
            win_inbound.get("interface_name"),
            Some(&json!("subout-tun"))
        );
        assert_eq!(win_inbound.get("stack"), Some(&json!("mixed")));
        assert_eq!(
            win_inbound.get("address"),
            Some(&json!(["172.19.0.1/30", "fd00::1/126"]))
        );
        assert_eq!(win_inbound.get("strict_route"), Some(&json!(true)));
    }

    #[test]
    fn test_sanitize_route_preserves_rule_order() {
        let mut route = json!({
            "rules": [
                { "outbound": "direct", "ip_cidr": ["10.0.0.0/8"] },
                { "action": "sniff" },
                { "action": "hijack-dns", "protocol": "dns" }
            ]
        });
        sanitize_route_value(&mut route);
        let rules = route.get("rules").unwrap().as_array().unwrap();
        assert!(rules[0].get("ip_cidr").is_some());
        assert_eq!(rules[0].get("outbound").unwrap().as_str(), Some("direct"));
        assert_eq!(rules[1].get("action").unwrap().as_str(), Some("sniff"));
        assert_eq!(rules[2].get("action").unwrap().as_str(), Some("hijack-dns"));
        assert_eq!(route.get("auto_detect_interface"), Some(&json!(true)));
    }

    #[test]
    fn test_sync_config_with_latest_resources_repairs_missing_routes_and_preserves_direct_block() {
        let conn = crate::db::init_db(":memory:").unwrap();

        // Add subscription and node
        let sub_id =
            crate::db::add_subscription(&conn, "http://example.com/sub", "sub1", "[]", true)
                .unwrap();
        crate::db::save_node(
            &conn,
            Some(sub_id),
            "hk-01",
            "vless",
            "hk.example.com",
            443,
            "{\"server\":\"hk.example.com\",\"server_port\":443,\"type\":\"vless\",\"uuid\":\"abc\"}",
            true,
            false,
        ).unwrap();

        // Add group
        crate::db::save_outbound_group(
            &conn,
            "Proxy-Group",
            "selector",
            None,
            None,
            None,
            Some("[\"hk-01\"]"),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        // Config has references to non-existent node "dead-node" in route and dns
        let base_config = json!({
            "outbounds": [],
            "route": {
                "final": "dead-node",
                "rules": [
                    { "domain": ["google.com"], "outbound": "hk-01" },
                    { "domain": ["facebook.com"], "outbound": "dead-node" }
                ]
            },
            "dns": {
                "servers": [
                    { "tag": "remote-dns", "address": "8.8.8.8", "detour": "dead-node" },
                    { "tag": "local-dns", "address": "local", "detour": "direct" }
                ]
            }
        });

        let (updated, repaired) =
            sync_config_with_latest_resources(&conn, &base_config, &[]).unwrap();

        // Check outbounds: direct and block must exist
        let outbounds = updated.get("outbounds").unwrap().as_array().unwrap();
        assert_eq!(outbounds[0].get("tag").unwrap().as_str(), Some("direct"));
        assert_eq!(outbounds[1].get("tag").unwrap().as_str(), Some("block"));
        assert!(
            outbounds
                .iter()
                .any(|o| o.get("tag").unwrap().as_str() == Some("Proxy-Group"))
        );
        assert!(
            outbounds
                .iter()
                .any(|o| o.get("tag").unwrap().as_str() == Some("hk-01"))
        );

        // Check repaired routes
        assert!(!repaired.is_empty());
        let route_obj = updated.get("route").unwrap();
        assert_eq!(route_obj.get("final").unwrap().as_str(), Some("direct"));
        let rules = route_obj.get("rules").unwrap().as_array().unwrap();
        assert_eq!(rules[0].get("outbound").unwrap().as_str(), Some("hk-01"));
        assert_eq!(rules[1].get("outbound").unwrap().as_str(), Some("direct"));

        // Check repaired DNS detour
        let servers = updated
            .get("dns")
            .unwrap()
            .get("servers")
            .unwrap()
            .as_array()
            .unwrap();
        assert_eq!(servers[0].get("detour").unwrap().as_str(), Some("direct"));
    }
}
