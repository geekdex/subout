use crate::db::{self, Subscription};
use crate::parser::Outbound;
use anyhow::{Result, anyhow};
use chrono::Local;
use rusqlite::{Connection, params};
use std::collections::HashMap;

pub async fn fetch_and_update_subscription(db_path: &str, sub_id: i64) -> Result<()> {
    // 1. Open connection to read subscription details
    let sub = {
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;

        let s: Subscription = conn.query_row(
            "SELECT id, url, label, enabled, last_fetched, last_error, filter_keywords, delete_on_update FROM subscriptions WHERE id = ?",
            [sub_id],
            |row| {
                let enabled_int: i32 = row.get(3)?;
                let delete_on_update_int: Option<i32> = row.get(7)?;
                Ok(Subscription {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    label: row.get(2)?,
                    enabled: enabled_int != 0,
                    last_fetched: row.get(4)?,
                    last_error: row.get(5)?,
                    filter_keywords: row.get(6)?,
                    delete_on_update: Some(delete_on_update_int.unwrap_or(1) != 0),
                })
            },
        )?;
        s
    }; // Connection is dropped here

    if !sub.enabled {
        return Ok(());
    }

    // 2. Fetch raw content asynchronously (Connection is NOT held here)
    let fetch_result = crate::fetch_subscription(&sub.url).await;
    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 3. Open another connection to write results
    let mut conn = Connection::open(db_path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    match fetch_result {
        Ok(content) => {
            // Parse content
            let (raw_outbounds, _) = crate::parser::parse_subscription(&content, false);

            // Load filter keywords defined for this subscription
            let keyword_strings = parse_keywords(sub.filter_keywords.as_deref());

            // Filter out announcements using custom keywords
            let mut active_outbounds = Vec::new();
            for outbound in raw_outbounds {
                if is_filtered(outbound.tag(), outbound.server(), &keyword_strings) {
                    continue;
                }
                active_outbounds.push(outbound);
            }

            // Begin transaction for safety and performance
            let tx = conn.transaction()?;

            // Clean old nodes for this subscription if delete_on_update is true
            if sub.delete_on_update.unwrap_or(true) {
                tx.execute("DELETE FROM nodes WHERE subscription_id = ?", [sub_id])?;
            }

            // Load existing node tags from DB to prevent global duplicates
            let mut existing_nodes = Vec::new();
            {
                let mut stmt = tx.prepare("SELECT id, subscription_id, tag, node_type, server, port, raw_json, enabled, is_custom, last_tcp_latency, last_web_latency, last_tested_at, last_target_url FROM nodes")?;
                let rows = stmt.query_map([], |row| {
                    let enabled_int: i32 = row.get(7)?;
                    let is_custom_int: i32 = row.get(8)?;
                    Ok(db::Node {
                        id: row.get(0)?,
                        subscription_id: row.get(1)?,
                        subscription_label: None,
                        tag: row.get(2)?,
                        node_type: row.get(3)?,
                        server: row.get(4)?,
                        port: row.get(5)?,
                        raw_json: row.get(6)?,
                        enabled: enabled_int != 0,
                        is_custom: is_custom_int != 0,
                        last_tcp_latency: row.get(9)?,
                        last_web_latency: row.get(10)?,
                        last_tested_at: row.get(11)?,
                        last_target_url: row.get(12)?,
                    })
                })?;
                for r in rows {
                    existing_nodes.push(r?);
                }
            }

            let mut tag_counts = HashMap::new();
            for node in &existing_nodes {
                if node.subscription_id != Some(sub_id) {
                    *tag_counts.entry(node.tag.clone()).or_insert(0) += 1;
                }
            }

            // Deduplicate and save new nodes
            for mut outbound in active_outbounds {
                let base_tag = outbound.tag().to_string();
                let count = tag_counts.entry(base_tag.clone()).or_insert(0);
                *count += 1;

                if *count > 1 {
                    let new_tag = format!("{}-{}", base_tag, count);
                    outbound.set_tag(new_tag);
                }

                // Map to types for DB
                let node_type = match &outbound {
                    Outbound::Socks(_) => "socks",
                    Outbound::Http(_) => "http",
                    Outbound::Vmess(_) => "vmess",
                    Outbound::Anytls(_) => "anytls",
                    Outbound::Trojan(_) => "trojan",
                    Outbound::Vless(_) => "vless",
                    Outbound::Shadowsocks(_) => "shadowsocks",
                    Outbound::Hysteria(_) => "hysteria",
                    Outbound::Hysteria2(_) => "hysteria2",
                };

                let server = outbound.server().to_string();
                let port = match &outbound {
                    Outbound::Socks(o) => o.server_port,
                    Outbound::Http(o) => o.server_port,
                    Outbound::Vmess(o) => o.server_port,
                    Outbound::Anytls(o) => o.server_port,
                    Outbound::Trojan(o) => o.server_port,
                    Outbound::Vless(o) => o.server_port,
                    Outbound::Shadowsocks(o) => o.server_port,
                    Outbound::Hysteria(o) => o.server_port,
                    Outbound::Hysteria2(o) => o.server_port,
                };

                let raw_json = serde_json::to_string(&outbound)?;
                let enabled_int = 1;
                let is_custom_int = 0;

                tx.execute(
                    "INSERT OR REPLACE INTO nodes (subscription_id, tag, node_type, server, port, raw_json, enabled, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    params![Some(sub_id), outbound.tag(), node_type, server, port, raw_json, enabled_int, is_custom_int],
                )?;
            }

            // Update subscription success status
            tx.execute(
                "UPDATE subscriptions SET last_fetched = ?, last_error = NULL WHERE id = ?",
                params![now_str, sub_id],
            )?;

            tx.commit()?;
        }
        Err(e) => {
            let err_str = e.to_string();
            // Update subscription error status
            conn.execute(
                "UPDATE subscriptions SET last_fetched = ?, last_error = ? WHERE id = ?",
                params![now_str, err_str, sub_id],
            )?;
            return Err(anyhow!(
                "Failed to fetch subscription {}: {}",
                sub.label,
                err_str
            ));
        }
    }

    Ok(())
}

pub async fn fetch_all_active_subscriptions(db_path: &str) -> Result<Vec<String>> {
    let subs = {
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        db::get_subscriptions(&conn)?
    };

    let mut messages = Vec::new();

    for sub in subs {
        if sub.enabled {
            match fetch_and_update_subscription(db_path, sub.id).await {
                Ok(_) => {
                    messages.push(format!(
                        "Successfully fetched subscription '{}'.",
                        sub.label
                    ));
                }
                Err(e) => {
                    messages.push(format!(
                        "Failed to fetch subscription '{}': {}",
                        sub.label, e
                    ));
                }
            }
        }
    }

    Ok(messages)
}

fn is_filtered(tag: &str, server: &str, keywords: &[String]) -> bool {
    let tag_lower = tag.to_lowercase();
    let server_lower = server.to_lowercase();

    // 1. Check IP/Domain placeholders
    if server_lower == "127.0.0.1"
        || server_lower == "0.0.0.0"
        || server_lower == "localhost"
        || server_lower == "hostloc.com"
    {
        return true;
    }

    // 2. Check tag against custom filter keywords
    for kw in keywords {
        if tag_lower.contains(&kw.to_lowercase()) {
            return true;
        }
    }

    false
}

fn parse_keywords(filter_keywords: Option<&str>) -> Vec<String> {
    let Some(kws_str) = filter_keywords else {
        return Vec::new();
    };
    if kws_str.trim().is_empty() {
        return Vec::new();
    }

    // Try parsing as JSON array
    if let Ok(list) = serde_json::from_str::<Vec<String>>(kws_str) {
        return list.into_iter().map(|s| s.to_lowercase()).collect();
    }

    // Fallback to comma-separated
    kws_str
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}
