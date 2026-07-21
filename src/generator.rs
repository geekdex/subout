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
pub fn generate_config_with_base(
    _conn: &Connection,
    log: Value,
    dns: Value,
    inbounds: Value,
    outbounds: Value,
    route: Value,
    experimental: Value,
) -> Result<Value> {
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
        let route = json!({ "final": "direct" });
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

        // The generated config should be exactly the merge of the 6 sections,
        // with no expansion, deduplication, or DB lookup.
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
}
