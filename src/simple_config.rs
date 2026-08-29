use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::db;
use crate::generator;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SimpleDnsConfig {
    pub mode: String, // "preset_domestic_foreign" | "fast_public" | "custom"
    pub domestic_dns: String, // "223.5.5.5"
    pub foreign_dns: String, // "https://1.1.1.1/dns-query"
}

impl Default for SimpleDnsConfig {
    fn default() -> Self {
        Self {
            mode: "preset_domestic_foreign".to_string(),
            domestic_dns: "223.5.5.5".to_string(),
            foreign_dns: "https://1.1.1.1/dns-query".to_string(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SimpleInboundConfig {
    pub inbound_type: String, // "mixed" | "tun"
    pub mixed_port: u16,      // 2080
    pub allow_lan: bool,      // false
    pub tun_stack: String,    // "system"
    pub tun_auto_route: bool, // true
}

impl Default for SimpleInboundConfig {
    fn default() -> Self {
        Self {
            inbound_type: "mixed".to_string(),
            mixed_port: 2080,
            allow_lan: false,
            tun_stack: "system".to_string(),
            tun_auto_route: true,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SimpleRouteConfig {
    pub mode: String, // "smart" (白名单/绕过大陆) | "global" (全局代理) | "gfw" (仅代理被阻断)
    pub block_ads: bool,
    pub bypass_lan: bool,
    pub default_outbound: String, // "AUTO-Test" | "proxy"
}

impl Default for SimpleRouteConfig {
    fn default() -> Self {
        Self {
            mode: "smart".to_string(),
            block_ads: true,
            bypass_lan: true,
            default_outbound: "direct".to_string(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SimpleConfig {
    pub dns: SimpleDnsConfig,
    pub inbound: SimpleInboundConfig,
    pub route: SimpleRouteConfig,
}

impl Default for SimpleConfig {
    fn default() -> Self {
        Self {
            dns: SimpleDnsConfig::default(),
            inbound: SimpleInboundConfig::default(),
            route: SimpleRouteConfig::default(),
        }
    }
}

pub fn get_saved_simple_config(conn: &Connection) -> SimpleConfig {
    if let Ok(Some(json_str)) = db::get_setting(conn, "simple_config") {
        if let Ok(cfg) = serde_json::from_str::<SimpleConfig>(&json_str) {
            return cfg;
        }
    }
    SimpleConfig::default()
}

pub fn save_simple_config(conn: &Connection, cfg: &SimpleConfig) -> Result<()> {
    let json_str = serde_json::to_string(cfg)?;
    db::update_setting(conn, "simple_config", &json_str)?;
    Ok(())
}

fn apply_dns_detour(obj: &mut Value, detour: Option<&str>) {
    if let Some(d) = detour {
        let trimmed = d.trim();
        if !trimmed.is_empty() && trimmed != "direct" {
            obj["detour"] = json!(trimmed);
        }
    }
}

pub fn build_dns_server(tag: &str, address_str: &str, detour: Option<&str>) -> Value {
    let s = address_str.trim();
    if s == "local" {
        let mut obj = json!({
            "tag": tag,
            "type": "local"
        });
        apply_dns_detour(&mut obj, detour);
        return obj;
    }

    if let Ok(parsed_url) = url::Url::parse(s) {
        let scheme = parsed_url.scheme();
        let host = parsed_url.host_str().unwrap_or(s);
        let port = parsed_url.port();
        let path = parsed_url.path();

        match scheme {
            "https" | "http" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "https",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                if !path.is_empty() && path != "/" {
                    obj["path"] = json!(path);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "h3" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "h3",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                if !path.is_empty() && path != "/" {
                    obj["path"] = json!(path);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "tls" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "tls",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "tcp" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "tcp",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "quic" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "quic",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "udp" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "udp",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            _ => {}
        }
    }

    let (host, port) = if let Some((h, p_str)) = s.split_once(':') {
        if !h.contains(':') {
            (h, p_str.parse::<u16>().ok())
        } else {
            (s, None)
        }
    } else {
        (s, None)
    };

    let mut obj = json!({
        "tag": tag,
        "type": "udp",
        "server": host
    });
    if let Some(p) = port {
        obj["server_port"] = json!(p);
    }
    apply_dns_detour(&mut obj, detour);
    obj
}

pub fn generate_simple_singbox_config(conn: &Connection, cfg: &SimpleConfig) -> Result<Value> {
    // 1. Log section
    let log_val = json!({
        "level": "info",
        "timestamp": true
    });

    // 2. DNS section
    let domestic_dns = if cfg.dns.domestic_dns.trim().is_empty() {
        "223.5.5.5".to_string()
    } else {
        cfg.dns.domestic_dns.trim().to_string()
    };

    let foreign_dns = if cfg.dns.foreign_dns.trim().is_empty() {
        "https://1.1.1.1/dns-query".to_string()
    } else {
        cfg.dns.foreign_dns.trim().to_string()
    };

    // 3. Outbounds resolution (needed early to decide DNS detour and fallback)
    let nodes = db::get_nodes(conn)?;
    let mut proxy_node_tags = Vec::new();
    let mut node_outbounds = Vec::new();

    for node in nodes {
        if node.enabled {
            proxy_node_tags.push(node.tag.clone());
            if let Ok(mut val) = serde_json::from_str::<Value>(&node.raw_json) {
                if let Some(obj) = val.as_object_mut() {
                    obj.insert("tag".to_string(), Value::String(node.tag.clone()));
                    generator::sanitize_outbound_value(&mut val);
                    node_outbounds.push(val);
                }
            }
        }
    }

    let has_nodes = !proxy_node_tags.is_empty();

    // Determine target proxy outbound
    let target_proxy = if cfg.route.default_outbound == "direct" {
        "direct".to_string()
    } else if !has_nodes {
        "direct".to_string()
    } else if cfg.route.default_outbound == "proxy" {
        "proxy".to_string()
    } else if cfg.route.default_outbound == "AUTO-Test" {
        "AUTO-Test".to_string()
    } else if proxy_node_tags.contains(&cfg.route.default_outbound) {
        cfg.route.default_outbound.clone()
    } else {
        "AUTO-Test".to_string()
    };

    // If proxy nodes exist and target_proxy is not direct, route foreign DNS through proxy.
    // Otherwise route foreign DNS directly without proxy detour.
    let remote_dns_detour = if has_nodes && target_proxy != "direct" {
        Some("proxy")
    } else {
        None
    };

    let dns_servers = vec![
        build_dns_server("dns_local", &domestic_dns, None),
        build_dns_server("dns_remote", &foreign_dns, remote_dns_detour),
    ];

    let mut dns_rules = Vec::new();

    if cfg.route.block_ads {
        dns_rules.push(json!({
            "rule_set": "geosite-category-ads-all",
            "action": "predefined",
            "rcode": "NOERROR"
        }));
    }

    let remote_dns_tag = if has_nodes && target_proxy != "direct" {
        "dns_remote"
    } else {
        "dns_local"
    };

    match cfg.route.mode.as_str() {
        "smart" => {
            dns_rules.push(json!({
                "rule_set": "geosite-cn",
                "server": "dns_local"
            }));
            dns_rules.push(json!({
                "rule_set": "geosite-geolocation-!cn",
                "server": remote_dns_tag
            }));
        }
        "gfw" => {
            dns_rules.push(json!({
                "rule_set": "geosite-geolocation-!cn",
                "server": remote_dns_tag
            }));
        }
        "global" => {
            dns_rules.push(json!({
                "server": remote_dns_tag
            }));
        }
        _ => {}
    }

    let dns_val = json!({
        "servers": dns_servers,
        "rules": dns_rules,
        "final": "dns_local",
        "strategy": "prefer_ipv4",
        "independent_cache": true
    });

    // 4. Inbounds section
    let inbounds_val = match cfg.inbound.inbound_type.as_str() {
        "tun" => {
            let platform = crate::platform::current_platform();
            let effective_stack = platform.effective_tun_stack(cfg.inbound.tun_stack.as_str());
            let iface_name = platform.default_tun_interface_name();
            let strict_route = platform.default_tun_strict_route();
            json!([
                {
                    "type": "tun",
                    "tag": "tun-in",
                    "interface_name": iface_name,
                    "address": ["172.19.0.1/30", "fd00::1/126"],
                    "auto_route": cfg.inbound.tun_auto_route,
                    "strict_route": strict_route,
                    "stack": effective_stack
                }
            ])
        }
        _ => {
            // Mixed port HTTP / SOCKS5
            let listen_addr = if cfg.inbound.allow_lan {
                "0.0.0.0"
            } else {
                "127.0.0.1"
            };
            json!([
                {
                    "type": "mixed",
                    "tag": "mixed-in",
                    "listen": listen_addr,
                    "listen_port": cfg.inbound.mixed_port
                }
            ])
        }
    };

    // 5. Outbounds section
    let mut selector_outbounds = vec!["direct".to_string()];
    if has_nodes {
        selector_outbounds.insert(0, "AUTO-Test".to_string());
        selector_outbounds.extend(proxy_node_tags.clone());
    }

    let mut selector_val = json!({
        "type": "selector",
        "tag": "proxy",
        "outbounds": selector_outbounds
    });
    if cfg.route.default_outbound == "direct" {
        selector_val["default"] = json!("direct");
    } else if proxy_node_tags.contains(&cfg.route.default_outbound) {
        selector_val["default"] = json!(cfg.route.default_outbound);
    } else if has_nodes && cfg.route.default_outbound == "AUTO-Test" {
        selector_val["default"] = json!("AUTO-Test");
    }

    let mut outbounds_val = vec![
        json!({
            "type": "direct",
            "tag": "direct"
        }),
        json!({
            "type": "block",
            "tag": "block"
        }),
        selector_val,
    ];

    if has_nodes {
        outbounds_val.push(json!({
            "type": "urltest",
            "tag": "AUTO-Test",
            "url": "http://cp.cloudflare.com/generate_204",
            "interval": "3m",
            "tolerance": 50,
            "outbounds": proxy_node_tags.clone()
        }));
    }

    outbounds_val.extend(node_outbounds);

    // 6. Route section
    let mut route_rules = vec![
        json!({
            "action": "sniff"
        }),
        json!({
            "protocol": "dns",
            "action": "hijack-dns"
        }),
        json!({
            "port": 53,
            "action": "hijack-dns"
        }),
    ];

    if cfg.route.block_ads {
        route_rules.push(json!({
            "rule_set": "geosite-category-ads-all",
            "outbound": "block"
        }));
    }

    if cfg.route.bypass_lan {
        route_rules.push(json!({
            "ip_is_private": true,
            "outbound": "direct"
        }));
    }

    match cfg.route.mode.as_str() {
        "smart" => {
            route_rules.push(json!({
                "rule_set": "geosite-cn",
                "outbound": "direct"
            }));
            route_rules.push(json!({
                "rule_set": "geoip-cn",
                "outbound": "direct"
            }));
            route_rules.push(json!({
                "rule_set": "geosite-geolocation-!cn",
                "outbound": &target_proxy
            }));
            route_rules.push(json!({
                "outbound": &target_proxy
            }));
        }
        "gfw" => {
            route_rules.push(json!({
                "rule_set": "geosite-geolocation-!cn",
                "outbound": &target_proxy
            }));
            route_rules.push(json!({
                "outbound": "direct"
            }));
        }
        "global" => {
            route_rules.push(json!({
                "outbound": &target_proxy
            }));
        }
        _ => {
            route_rules.push(json!({
                "outbound": &target_proxy
            }));
        }
    }

    let mut rule_sets = vec![
        json!({
            "tag": "geosite-cn",
            "type": "remote",
            "format": "binary",
            "url": "https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs",
            "download_detour": "direct",
            "update_interval": "1d"
        }),
        json!({
            "tag": "geosite-geolocation-!cn",
            "type": "remote",
            "format": "binary",
            "url": "https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-geolocation-!cn.srs",
            "download_detour": "direct",
            "update_interval": "1d"
        }),
        json!({
            "tag": "geoip-cn",
            "type": "remote",
            "format": "binary",
            "url": "https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-cn.srs",
            "download_detour": "direct",
            "update_interval": "1d"
        }),
    ];

    if cfg.route.block_ads {
        rule_sets.push(json!({
            "tag": "geosite-category-ads-all",
            "type": "remote",
            "format": "binary",
            "url": "https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-category-ads-all.srs",
            "download_detour": "direct",
            "update_interval": "1d"
        }));
    }

    let route_val = json!({
        "auto_detect_interface": true,
        "default_domain_resolver": "dns_local",
        "rules": route_rules,
        "rule_set": rule_sets,
        "final": target_proxy
    });

    let experimental_val = json!({});

    Ok(json!({
        "log": log_val,
        "dns": dns_val,
        "inbounds": inbounds_val,
        "outbounds": outbounds_val,
        "route": route_val,
        "experimental": experimental_val
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_dns_server_types() {
        let local_udp = build_dns_server("dns_local", "223.5.5.5", Some("direct"));
        assert_eq!(local_udp["type"], "udp");
        assert_eq!(local_udp["server"], "223.5.5.5");
        // "direct" detour should be omitted to avoid sing-box "detour to empty direct outbound" error
        assert!(local_udp.get("detour").is_none());

        let remote_doh = build_dns_server("dns_remote", "https://1.1.1.1/dns-query", Some("proxy"));
        assert_eq!(remote_doh["type"], "https");
        assert_eq!(remote_doh["server"], "1.1.1.1");
        assert_eq!(remote_doh["path"], "/dns-query");
        assert_eq!(remote_doh["detour"], "proxy");

        let remote_dot = build_dns_server("dns_remote", "tls://8.8.8.8:853", Some("proxy"));
        assert_eq!(remote_dot["type"], "tls");
        assert_eq!(remote_dot["server"], "8.8.8.8");
        assert_eq!(remote_dot["server_port"], 853);

        let system_local = build_dns_server("dns_local", "local", Some("direct"));
        assert_eq!(system_local["type"], "local");
        assert!(system_local.get("detour").is_none());
    }

    #[test]
    fn test_generate_simple_singbox_config_structure() {
        let conn = crate::db::init_db(":memory:").unwrap();
        let cfg = SimpleConfig::default();
        let generated_cfg = generate_simple_singbox_config(&conn, &cfg).unwrap();

        assert!(generated_cfg.get("log").is_some());
        assert!(generated_cfg.get("dns").is_some());
        assert!(generated_cfg.get("inbounds").is_some());
        assert!(generated_cfg.get("outbounds").is_some());
        assert!(generated_cfg.get("route").is_some());

        // Check DNS servers
        let dns_servers = generated_cfg.get("dns").unwrap().get("servers").unwrap().as_array().unwrap();
        assert!(dns_servers.iter().any(|s| s.get("tag").unwrap().as_str() == Some("dns_local")));
        assert!(dns_servers.iter().any(|s| s.get("tag").unwrap().as_str() == Some("dns_remote")));

        // Check Outbounds when no nodes are in DB (clean direct mode, no AUTO-Test probing)
        let outbounds = generated_cfg.get("outbounds").unwrap().as_array().unwrap();
        assert!(outbounds.iter().any(|o| o.get("tag").unwrap().as_str() == Some("proxy")));
        assert!(outbounds.iter().any(|o| o.get("tag").unwrap().as_str() == Some("direct")));
        assert!(!outbounds.iter().any(|o| o.get("tag").unwrap().as_str() == Some("AUTO-Test")));

        // Now add a proxy node to DB and verify AUTO-Test is properly created
        crate::db::save_node(
            &conn,
            None,
            "HK-Node-01",
            "vless",
            "1.2.3.4",
            443,
            &serde_json::json!({
                "type": "vless",
                "tag": "HK-Node-01",
                "server": "1.2.3.4",
                "server_port": 443,
                "uuid": "00000000-0000-0000-0000-000000000000"
            }).to_string(),
            true,
            true,
        ).unwrap();

        let generated_with_nodes = generate_simple_singbox_config(&conn, &cfg).unwrap();
        let outbounds_with_nodes = generated_with_nodes.get("outbounds").unwrap().as_array().unwrap();
        assert!(outbounds_with_nodes.iter().any(|o| o.get("tag").unwrap().as_str() == Some("AUTO-Test")));
        assert!(outbounds_with_nodes.iter().any(|o| o.get("tag").unwrap().as_str() == Some("HK-Node-01")));
    }

    #[test]
    fn test_simple_config_tun_mode() {
        let conn = crate::db::init_db(":memory:").unwrap();
        let mut cfg = SimpleConfig::default();
        cfg.inbound.inbound_type = "tun".to_string();
        let generated_cfg = generate_simple_singbox_config(&conn, &cfg).unwrap();

        let inbounds = generated_cfg.get("inbounds").unwrap().as_array().unwrap();
        assert_eq!(inbounds[0].get("type").unwrap().as_str(), Some("tun"));
    }

    #[test]
    fn test_generated_config_passes_singbox_check() {
        let conn = crate::db::init_db(":memory:").unwrap();
        let cfg = SimpleConfig::default();
        let generated_cfg = generate_simple_singbox_config(&conn, &cfg).unwrap();

        let log = generated_cfg.get("log").cloned().unwrap_or(json!({}));
        let dns = generated_cfg.get("dns").cloned().unwrap_or(json!({}));
        let inbounds = generated_cfg.get("inbounds").cloned().unwrap_or(json!([]));
        let outbounds = generated_cfg.get("outbounds").cloned().unwrap_or(json!([]));
        let route = generated_cfg.get("route").cloned().unwrap_or(json!({}));
        let experimental = generated_cfg.get("experimental").cloned().unwrap_or(json!({}));

        let res = crate::web::config::validate_config_with_singbox(
            &log,
            &dns,
            &inbounds,
            &outbounds,
            &route,
            &experimental,
        );
        assert!(res.is_ok(), "Validation failed: {:?}", res.err());
    }
}
