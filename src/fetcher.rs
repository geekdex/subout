use crate::db::{self, Subscription};
use crate::parser::Outbound;
use anyhow::{Result, anyhow};
use chrono::Local;
use rusqlite::{Connection, params};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct SubFetchDetail {
    pub id: i64,
    pub label: String,
    pub url: String,
    pub success: bool,
    pub raw_count: usize,
    pub filtered_count: usize,
    pub saved_count: usize,
    pub upload: Option<i64>,
    pub download: Option<i64>,
    pub total: Option<i64>,
    pub expire: Option<i64>,
    pub error: Option<String>,
}

pub fn format_bytes(bytes: i64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    const TB: f64 = GB * 1024.0;

    let b = bytes as f64;
    if b >= TB {
        format!("{:.2} TB", b / TB)
    } else if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.2} MB", b / MB)
    } else if b >= KB {
        format!("{:.2} KB", b / KB)
    } else {
        format!("{bytes} B")
    }
}

pub fn format_userinfo_summary(
    upload: Option<i64>,
    download: Option<i64>,
    total: Option<i64>,
    expire: Option<i64>,
) -> Option<String> {
    let mut parts = Vec::new();
    let up = upload.unwrap_or(0);
    let down = download.unwrap_or(0);
    let used = up + down;

    if let Some(tot) = total {
        if tot > 0 {
            let used_str = format_bytes(used);
            let tot_str = format_bytes(tot);
            let rem_str = format_bytes(tot.saturating_sub(used));
            parts.push(format!("已用: {used_str} / {tot_str} (剩余: {rem_str})"));
        } else if used > 0 {
            parts.push(format!("已用: {}", format_bytes(used)));
        }
    } else if used > 0 {
        parts.push(format!("已用: {}", format_bytes(used)));
    }

    if let Some(exp) = expire
        && exp > 0
    {
        let dt = chrono::DateTime::from_timestamp(exp, 0).map_or_else(
            || exp.to_string(),
            |t| {
                t.with_timezone(&Local)
                    .format("%Y-%m-%d %H:%M:%S")
                    .to_string()
            },
        );
        parts.push(format!("到期时间: {dt}"));
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("，"))
    }
}

pub async fn fetch_and_update_subscription(db_path: &str, sub_id: i64) -> Result<()> {
    let detail = fetch_and_update_subscription_detailed(db_path, sub_id).await?;
    if !detail.success {
        return Err(anyhow!(
            "Failed to fetch subscription {}: {}",
            detail.label,
            detail.error.as_deref().unwrap_or("unknown error")
        ));
    }
    Ok(())
}

pub async fn fetch_and_update_subscription_detailed(
    db_path: &str,
    sub_id: i64,
) -> Result<SubFetchDetail> {
    // 1. Open connection to read subscription details
    let sub = {
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;

        let s: Subscription = conn.query_row(
            "SELECT id, url, label, enabled, last_fetched, last_error, filter_keywords, delete_on_update, upload, download, total, expire FROM subscriptions WHERE id = ?",
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
                    upload: row.get(8)?,
                    download: row.get(9)?,
                    total: row.get(10)?,
                    expire: row.get(11)?,
                    node_count: None,
                })
            },
        )?;
        s
    }; // Connection is dropped here

    if !sub.enabled {
        return Ok(SubFetchDetail {
            id: sub_id,
            label: sub.label,
            url: sub.url,
            success: true,
            raw_count: 0,
            filtered_count: 0,
            saved_count: 0,
            upload: None,
            download: None,
            total: None,
            expire: None,
            error: None,
        });
    }

    // 2. Fetch raw content asynchronously (Connection is NOT held here)
    let fetch_result = crate::fetch_subscription_with_info(&sub.url).await;
    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 3. Open another connection to write results
    let mut conn = Connection::open(db_path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    match fetch_result {
        Ok((content, userinfo)) => {
            // Parse content
            let (raw_outbounds, _) = crate::parser::parse_subscription(&content, false);
            let raw_count = raw_outbounds.len();

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
            let active_count = active_outbounds.len();
            let filtered_count = raw_count.saturating_sub(active_count);

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
            let mut existing_test_info = HashMap::new();
            for node in &existing_nodes {
                if node.subscription_id != Some(sub_id) {
                    *tag_counts.entry(node.tag.clone()).or_insert(0) += 1;
                }
                existing_test_info.insert(
                    node.tag.clone(),
                    (
                        node.last_tcp_latency,
                        node.last_web_latency,
                        node.last_tested_at.clone(),
                        node.last_target_url.clone(),
                    ),
                );
            }

            // Deduplicate and save new nodes
            for mut outbound in active_outbounds {
                let base_tag = outbound.tag().to_string();
                let count = tag_counts.entry(base_tag.clone()).or_insert(0);
                *count += 1;

                if *count > 1 {
                    let new_tag = format!("{base_tag}-{count}");
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

                let (prev_tcp, prev_web, prev_tested, prev_target) = existing_test_info
                    .remove(outbound.tag())
                    .unwrap_or((None, None, None, None));

                tx.execute(
                    "INSERT OR REPLACE INTO nodes (subscription_id, tag, node_type, server, port, raw_json, enabled, is_custom, last_tcp_latency, last_web_latency, last_tested_at, last_target_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    params![Some(sub_id), outbound.tag(), node_type, server, port, raw_json, enabled_int, is_custom_int, prev_tcp, prev_web, prev_tested, prev_target],
                )?;
            }

            // Update subscription success status & userinfo
            tx.execute(
                "UPDATE subscriptions SET last_fetched = ?, last_error = NULL, upload = ?, download = ?, total = ?, expire = ? WHERE id = ?",
                params![now_str, userinfo.upload, userinfo.download, userinfo.total, userinfo.expire, sub_id],
            )?;

            tx.commit()?;

            // Automatically refresh all node groups (dynamic re-matching and static dead node pruning)
            let _ = db::refresh_all_groups(&conn);

            Ok(SubFetchDetail {
                id: sub_id,
                label: sub.label,
                url: sub.url,
                success: true,
                raw_count,
                filtered_count,
                saved_count: active_count,
                upload: userinfo.upload,
                download: userinfo.download,
                total: userinfo.total,
                expire: userinfo.expire,
                error: None,
            })
        }
        Err(e) => {
            let err_str = e.to_string();
            // Update subscription error status
            conn.execute(
                "UPDATE subscriptions SET last_fetched = ?, last_error = ? WHERE id = ?",
                params![now_str, err_str, sub_id],
            )?;
            Ok(SubFetchDetail {
                id: sub_id,
                label: sub.label,
                url: sub.url,
                success: false,
                raw_count: 0,
                filtered_count: 0,
                saved_count: 0,
                upload: None,
                download: None,
                total: None,
                expire: None,
                error: Some(err_str),
            })
        }
    }
}

pub async fn fetch_all_active_subscriptions_detailed(db_path: &str) -> Result<Vec<SubFetchDetail>> {
    let subs = {
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        db::get_subscriptions(&conn)?
    };

    let mut details = Vec::new();

    for sub in subs {
        if sub.enabled {
            let det = fetch_and_update_subscription_detailed(db_path, sub.id).await?;
            details.push(det);
        }
    }

    Ok(details)
}

pub async fn fetch_all_active_subscriptions(db_path: &str) -> Result<Vec<String>> {
    let details = fetch_all_active_subscriptions_detailed(db_path).await?;
    let mut messages = Vec::new();

    for det in details {
        if det.success {
            messages.push(format!(
                "Successfully fetched subscription '{}': {} nodes parsed, {} filtered, {} saved.",
                det.label, det.raw_count, det.filtered_count, det.saved_count
            ));
        } else {
            messages.push(format!(
                "Failed to fetch subscription '{}': {}",
                det.label,
                det.error.as_deref().unwrap_or("unknown error")
            ));
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
