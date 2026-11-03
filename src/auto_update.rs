use anyhow::{Result, anyhow};
use chrono::Local;
use rusqlite::Connection;
use serde_json::{Value, json};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Semaphore;

pub async fn check_and_run_auto_update(
    db_path: &str,
    service_manager: Option<Arc<crate::service::SingBoxServiceManager>>,
) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    let enabled =
        crate::db::get_setting(&conn, "auto_update_enabled")?.unwrap_or_default() == "true";
    if !enabled {
        return Ok(());
    }

    let next_run_str = crate::db::get_setting(&conn, "auto_update_next_run")?.unwrap_or_default();
    let next_run: u64 = next_run_str.parse().unwrap_or(0);

    let interval_str =
        crate::db::get_setting(&conn, "auto_update_interval")?.unwrap_or_else(|| "12h".to_string());

    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let should_run = if next_run > 0 {
        now >= next_run
    } else {
        let last_run_str =
            crate::db::get_setting(&conn, "auto_update_last_run")?.unwrap_or_default();
        let last_run: u64 = last_run_str.parse().unwrap_or(0);
        if interval_str == "daily" {
            let daily_time_str = crate::db::get_setting(&conn, "auto_update_daily_time")?
                .unwrap_or_else(|| "04:00".to_string());
            let computed_next =
                calculate_next_daily_run(&daily_time_str).unwrap_or(last_run + 86400);
            now >= computed_next
        } else {
            let interval_secs = match interval_str.as_str() {
                "1h" => 3600,
                "6h" => 6 * 3600,
                "24h" => 24 * 3600,
                "48h" => 48 * 3600,
                _ => 12 * 3600, // 12h or default
            };
            now >= last_run + interval_secs
        }
    };

    if should_run {
        println!(
            "[AutoUpdate] Triggering scheduled auto update (next_run: {next_run}, now: {now})..."
        );
        drop(conn);
        if let Err(e) = run_auto_update_process(db_path, service_manager).await {
            eprintln!("[AutoUpdate] Scheduled update failed: {e}");
        }
    }

    Ok(())
}

pub async fn run_auto_update_process(
    db_path: &str,
    service_manager: Option<Arc<crate::service::SingBoxServiceManager>>,
) -> Result<String> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Check if already running (with a 10-minute timeout threshold)
    let already_running = {
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        let status = crate::db::get_setting(&conn, "auto_update_last_status")?.unwrap_or_default();
        let last_run_str =
            crate::db::get_setting(&conn, "auto_update_last_run")?.unwrap_or_default();
        let last_run: u64 = last_run_str.parse().unwrap_or(0);
        status == "running" && now < last_run + 600
    };
    if already_running {
        return Err(anyhow!("自动更新任务已在运行中，请勿重复触发"));
    }

    // Set running status, calculate next run time, and drop connection immediately
    let (test_url, next_run_time) = {
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;

        let interval_str = crate::db::get_setting(&conn, "auto_update_interval")?
            .unwrap_or_else(|| "12h".to_string());
        let next_run = if interval_str == "daily" {
            let daily_time_str = crate::db::get_setting(&conn, "auto_update_daily_time")?
                .unwrap_or_else(|| "04:00".to_string());
            calculate_next_daily_run(&daily_time_str).unwrap_or(now + 86400)
        } else {
            let interval_secs = match interval_str.as_str() {
                "1h" => 3600,
                "6h" => 6 * 3600,
                "24h" => 24 * 3600,
                "48h" => 48 * 3600,
                _ => 12 * 3600, // 12h or default
            };
            now + interval_secs
        };

        let url = crate::db::get_setting(&conn, "auto_update_test_url")?
            .unwrap_or_else(|| "http://www.gstatic.com/generate_204".to_string());

        crate::db::update_setting(&conn, "auto_update_last_status", "running")?;
        crate::db::update_setting(&conn, "auto_update_last_run", &now.to_string())?;
        crate::db::update_setting(&conn, "auto_update_next_run", &next_run.to_string())?;
        crate::db::update_setting(
            &conn,
            "auto_update_last_log",
            &format!("[{now_str}] 自动更新任务启动...\n"),
        )?;
        (url, next_run)
    };

    let log_accum = Arc::new(std::sync::Mutex::new(format!(
        "[{now_str}] 自动更新任务启动...\n"
    )));
    let db_path_clone = db_path.to_string();
    let update_log = {
        let log_accum = log_accum.clone();
        move |msg: &str| {
            let current_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let timestamp_prefix = format!("[{current_time}] ");
            let mut log = log_accum.lock().unwrap();
            if !log.is_empty() && !log.ends_with('\n') {
                log.push('\n');
            }
            log.push_str(&timestamp_prefix);
            log.push_str(msg);
            println!("[AutoUpdate] {timestamp_prefix}{msg}");
            if let Ok(conn) = Connection::open(&db_path_clone) {
                let _ = conn.busy_timeout(std::time::Duration::from_secs(5));
                let _ = crate::db::update_setting(&conn, "auto_update_last_log", &log);
            }
        }
    };

    let service_mgr_for_run = service_manager.clone();
    let run_impl = async {
        // Step 1: Select currently running configuration as the base template
        update_log("步骤 1: 正在选择当前运行的配置作为基础模板...");
        let (running_profile_opt, full_config) = {
            let conn = Connection::open(db_path)?;
            conn.busy_timeout(std::time::Duration::from_secs(5))?;
            let profile_opt = crate::db::get_running_config_profile(&conn)?;
            let cfg_val: Value = if let Some(ref p) = profile_opt {
                serde_json::from_str(&p.content).unwrap_or_else(|_| {
                    json!({
                        "log": { "level": "info", "timestamp": true },
                        "dns": {},
                        "inbounds": [],
                        "outbounds": [{ "type": "direct", "tag": "direct" }],
                        "route": {}
                    })
                })
            } else {
                json!({
                    "log": { "level": "info", "timestamp": true },
                    "dns": {},
                    "inbounds": [],
                    "outbounds": [{ "type": "direct", "tag": "direct" }],
                    "route": {}
                })
            };
            (profile_opt, cfg_val)
        };
        if let Some(ref p) = running_profile_opt {
            update_log(&format!(
                "  -> 已载入当前运行配置模板 (ID: {}, 名称: '{}', 平台: '{}')",
                p.id, p.name, p.platform
            ));
        } else {
            update_log("  -> 提示: 当前未绑定运行配置，将仅更新订阅节点池与节点组合");
        }

        // Step 2: Update all active subscriptions in subscription management
        update_log("步骤 2: 正在挨个更新订阅源管理中的所有节点...");
        let fetch_results = crate::fetcher::fetch_all_active_subscriptions(db_path).await?;
        for res in &fetch_results {
            update_log(&format!("  -> {res}"));
        }

        // Step 3: Conduct speed test on all nodes and delete timed-out nodes
        update_log("步骤 3: 订阅源更新完成，开始执行节点延迟测速并清理超时节点...");
        let nodes = {
            let conn_nodes = Connection::open(db_path)?;
            conn_nodes.busy_timeout(std::time::Duration::from_secs(5))?;
            crate::db::get_nodes(&conn_nodes)?
        };
        let mut nodes_to_test = Vec::new();
        for node in nodes {
            if node.enabled && !node.is_custom {
                nodes_to_test.push(node);
            }
        }
        let nodes_to_test_count = nodes_to_test.len();
        update_log(&format!(
            "  -> 需要测速的订阅节点数量: {nodes_to_test_count} 个"
        ));

        let sem = Arc::new(Semaphore::new(8));
        let mut tasks = Vec::new();
        for node in nodes_to_test {
            let raw_json = node.raw_json.clone();
            let target_url = test_url.clone();
            let sem_clone = sem.clone();
            let node_id = node.id;
            let node_tag = node.tag.clone();
            tasks.push(tokio::spawn(async move {
                let latency =
                    crate::web::nodes::test_node_web_latency(raw_json, target_url, sem_clone).await;
                (node_id, node_tag, latency)
            }));
        }

        let mut deleted_count = 0;
        let mut deleted_tags = Vec::new();
        let mut task_results = Vec::new();
        for task in tasks {
            if let Ok(res) = task.await {
                task_results.push(res);
            }
        }

        {
            let mut conn_write = Connection::open(db_path)?;
            conn_write.busy_timeout(std::time::Duration::from_secs(5))?;
            let tx = conn_write.transaction()?;
            for (id, tag, latency) in task_results {
                if let Some(lat) = latency {
                    let now_str_test = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let lat_val = lat as i64;
                    tx.execute(
                        "UPDATE nodes SET last_web_latency = ?, last_tested_at = ?, last_target_url = ? WHERE id = ?",
                        rusqlite::params![lat_val, now_str_test, test_url, id],
                    )?;
                } else {
                    tx.execute("DELETE FROM nodes WHERE id = ?", [id])?;
                    deleted_count += 1;
                    deleted_tags.push(tag);
                }
            }
            tx.commit()?;
        }
        update_log(&format!(
            "  -> 测速完成，共删除超时节点 {deleted_count} 个: {deleted_tags:?}"
        ));

        // Step 4: Auto-configure nodes in all groups that have "conditional auto-matching" enabled
        update_log("步骤 4: 正在将最新节点自动配置更新到已开启“启用条件自动匹配”的出站组中...");
        {
            let mut conn_groups = Connection::open(db_path)?;
            conn_groups.busy_timeout(std::time::Duration::from_secs(5))?;
            let tx = conn_groups.transaction()?;
            let groups = crate::db::get_outbound_groups(&tx)?;
            for g in groups {
                let is_dynamic = g.node_types.is_some()
                    || g.subscriptions.is_some()
                    || g.include_keywords.is_some()
                    || g.exclude_keywords.is_some();
                if is_dynamic {
                    let resolved = crate::db::resolve_group_nodes(&tx, &g)?;
                    let resolved_json = serde_json::to_string(&resolved)?;
                    tx.execute(
                        "UPDATE outbound_groups SET static_nodes = ? WHERE id = ?",
                        rusqlite::params![resolved_json, g.id],
                    )?;
                    update_log(&format!(
                        "  -> 出站组 '{}' (条件自动匹配) 已更新，匹配到 {} 个节点",
                        g.tag,
                        resolved.len()
                    ));
                }
            }
            tx.commit()?;
        }
        let new_vcode = {
            let conn_vcode = Connection::open(db_path)?;
            conn_vcode.busy_timeout(std::time::Duration::from_secs(5))?;
            crate::db::refresh_node_group_version_code(&conn_vcode)?
        };
        update_log(&format!(
            "  -> 节点组合全局 versionCode 已更新: {new_vcode}"
        ));

        // Step 5: Construct updated outbounds and repair route/dns references
        update_log(
            "步骤 5: 正在构建更新后的出站配置 (保留系统出站前置、同步最新策略组及有效代理节点，并自动修复路由出口)...",
        );
        let final_config = {
            let conn_sync = Connection::open(db_path)?;
            conn_sync.busy_timeout(std::time::Duration::from_secs(5))?;

            let (updated_cfg, repaired) = crate::generator::sync_config_with_latest_resources(
                &conn_sync,
                &full_config,
                &deleted_tags,
            )?;

            let outbounds_len = updated_cfg
                .get("outbounds")
                .and_then(|o| o.as_array())
                .map_or(0, std::vec::Vec::len);

            update_log(&format!(
                "  -> 出站配置构建完成，总计出站数量: {outbounds_len} 个"
            ));

            for rep in &repaired {
                update_log(&format!("  -> [自动修复失效路由/DNS] {rep}"));
            }

            updated_cfg
        };

        // Step 6: Validate configuration using sing-box
        update_log("步骤 6: 正在使用 sing-box 校验生成后的全新配置...");
        let log_val = final_config.get("log").cloned().unwrap_or(json!({}));
        let dns_val = final_config.get("dns").cloned().unwrap_or(json!({}));
        let inbounds_val = final_config.get("inbounds").cloned().unwrap_or(json!([]));
        let outbounds_val = final_config.get("outbounds").cloned().unwrap_or(json!([]));
        let route_val = final_config.get("route").cloned().unwrap_or(json!({}));
        let experimental_val = final_config
            .get("experimental")
            .cloned()
            .unwrap_or(json!({}));
        let http_clients_val = final_config.get("http_clients");

        if let Err(err_msg) = crate::web::config::validate_config_with_singbox(
            &log_val,
            &dns_val,
            &inbounds_val,
            &outbounds_val,
            &route_val,
            &experimental_val,
            http_clients_val,
        ) {
            return Err(anyhow!("配置校验失败: {err_msg}"));
        }
        update_log("  -> sing-box 校验成功！");

        // Step 7: Overwrite running config if sync enabled & save snapshot
        let sync_running = {
            let conn = Connection::open(db_path)?;
            conn.busy_timeout(std::time::Duration::from_secs(5))?;
            crate::db::get_setting(&conn, "auto_update_sync_running")?
                .unwrap_or_else(|| "1".to_string())
                == "1"
        };

        if sync_running && let Some(profile) = running_profile_opt {
            update_log(&format!(
                "步骤 7: 同步更新当前绑定的本机运行配置 [{}]...",
                profile.name
            ));

            let conn_update = Connection::open(db_path)?;
            conn_update.busy_timeout(std::time::Duration::from_secs(5))?;

            // 1. Snapshot old state before overwriting
            let now_str_snap = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let snap_desc = format!(
                "自动更新前快照 [{}] (时间: {}, 清理超时节点: {} 个)",
                profile.name, now_str_snap, deleted_count
            );
            crate::db::log_history_with_config_id(
                &conn_update,
                Some(profile.id),
                "auto_update",
                "覆盖运行配置",
                &snap_desc,
                Some(&profile.content),
            )?;
            update_log(&format!(
                "  -> 已创建变更前历史快照存档 (配置ID: {})",
                profile.id
            ));

            // 2. Overwrite running config in configs table directly
            let new_content_pretty = serde_json::to_string_pretty(&final_config)?;
            let latest_vcode = crate::db::get_node_group_version_code(&conn_update)?;
            conn_update.execute(
                "UPDATE configs SET content = ?, version_code = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                rusqlite::params![new_content_pretty, latest_vcode, profile.id],
            )?;
            update_log("  -> 本机运行配置已直接覆盖更新完成");

            // 3. Write to running_config_path
            let running_config_path =
                crate::service::SingBoxServiceManager::get_running_config_path();
            if let Some(parent) = running_config_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::fs::write(&running_config_path, &new_content_pretty)?;
            update_log(&format!(
                "  -> 配置文件已部署至 {}",
                running_config_path.display()
            ));

            // 4. Reload service if auto_update_reload_service is enabled and service is currently running
            let reload_enabled =
                crate::db::get_setting(&conn_update, "auto_update_reload_service")?
                    .unwrap_or_else(|| "1".to_string())
                    == "1";
            if reload_enabled && let Some(ref mgr) = service_mgr_for_run {
                if mgr.is_running().await {
                    update_log("步骤 8: sing-box 服务正在运行，正在重启服务应用最新节点配置...");
                    match mgr.restart_with_sudo(&final_config, None).await {
                        Ok(()) => {
                            update_log("  -> sing-box 核心服务已成功平滑重启并生效！");
                        }
                        Err(e) => {
                            update_log(&format!("  -> ⚠️ 警告: 重启 sing-box 服务失败: {e}"));
                        }
                    }
                } else {
                    update_log("  -> sing-box 核心服务当前未运行，最新配置已就绪。");
                }
            }
        } else {
            update_log("步骤 7: 未勾选同步更新运行配置或未绑定运行配置，跳过覆盖运行配置。");
        }

        let next_run_time_str = Local::now()
            .with_timezone(&Local)
            .checked_add_signed(chrono::Duration::seconds((next_run_time - now) as i64))
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();
        update_log(&format!(
            "自动更新完成！下次更新预定时间: {next_run_time_str}"
        ));
        Ok(())
    };

    let run_res = run_impl.await;
    let conn_final = Connection::open(db_path)?;
    conn_final.busy_timeout(std::time::Duration::from_secs(5))?;
    let final_log = {
        let log = log_accum.lock().unwrap();
        log.clone()
    };
    match run_res {
        Ok(()) => {
            crate::db::update_setting(&conn_final, "auto_update_last_status", "success")?;
            crate::db::update_setting(&conn_final, "auto_update_last_log", &final_log)?;
            Ok(final_log)
        }
        Err(e) => {
            let current_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let timestamp_prefix = format!("[{current_time}] ");
            let err_msg = format!("{final_log}\n{timestamp_prefix}自动更新失败: {e}");
            crate::db::update_setting(&conn_final, "auto_update_last_status", "failed")?;
            crate::db::update_setting(&conn_final, "auto_update_last_log", &err_msg)?;
            Err(e)
        }
    }
}

pub fn calculate_next_daily_run(daily_time_str: &str) -> Option<u64> {
    use chrono::Timelike;
    let parts: Vec<&str> = daily_time_str.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let hour: u32 = parts[0].parse().ok()?;
    let minute: u32 = parts[1].parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    let local_now = chrono::Local::now();
    let today_target = local_now
        .with_hour(hour)?
        .with_minute(minute)?
        .with_second(0)?
        .with_nanosecond(0)?;

    let next_run = if today_target > local_now {
        today_target
    } else {
        today_target.checked_add_signed(chrono::Duration::days(1))?
    };
    Some(next_run.timestamp() as u64)
}

/// Construct the updated outbounds list by synchronizing database groups and nodes with
/// the base configuration template, while preserving critical sing-box topology:
/// 1. System outbounds (direct, block, dns) ALWAYS come first so outbounds[0] remains the default route.
/// 2. Strategy groups (selector, urltest) come second with member lists updated and pruned of deleted nodes.
/// 3. Active referenced proxy nodes and custom nodes come after groups.
/// 4. All outbounds are sanitized to remove invalid TLS fields on unsupported protocols.
pub fn build_updated_outbounds(
    conn: &Connection,
    full_config: &Value,
    deleted_tags: &[String],
) -> Result<Vec<Value>> {
    let (updated_cfg, _) =
        crate::generator::sync_config_with_latest_resources(conn, full_config, deleted_tags)?;
    let outbounds = updated_cfg
        .get("outbounds")
        .and_then(|o| o.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(outbounds)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_build_updated_outbounds_preserves_system_outbounds_first() {
        let conn = crate::db::init_db(":memory:").unwrap();

        // Add a subscription and node
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
        )
        .unwrap();

        // Add a group referencing hk-01
        crate::db::save_outbound_group(
            &conn,
            "HK-Group",
            "urltest",
            Some("http://cp.cloudflare.com/generate_204"),
            Some("3m"),
            Some(50),
            Some("[\"hk-01\"]"),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        let template_config = json!({
            "outbounds": [
                { "type": "direct", "tag": "direct" },
                { "type": "block", "tag": "block" },
                { "type": "selector", "tag": "proxy", "outbounds": ["HK-Group", "direct"] },
                { "type": "vless", "tag": "us_custom", "server": "1.2.3.4", "server_port": 443 }
            ]
        });

        let deleted_tags = vec![];
        let outbounds = build_updated_outbounds(&conn, &template_config, &deleted_tags).unwrap();

        // Verify ordering: System outbounds first, then groups, then proxy nodes
        assert_eq!(outbounds[0].get("tag").unwrap().as_str(), Some("direct"));
        assert_eq!(outbounds[0].get("type").unwrap().as_str(), Some("direct"));
        assert_eq!(outbounds[1].get("tag").unwrap().as_str(), Some("block"));
        assert_eq!(outbounds[1].get("type").unwrap().as_str(), Some("block"));

        // Groups
        let group_tags: Vec<&str> = outbounds
            .iter()
            .filter(|o| {
                matches!(
                    o.get("type").and_then(|t| t.as_str()),
                    Some("selector" | "urltest")
                )
            })
            .map(|o| o.get("tag").unwrap().as_str().unwrap())
            .collect();
        assert!(group_tags.contains(&"proxy"));
        assert!(group_tags.contains(&"HK-Group"));

        // Custom node from template is preserved
        let has_custom = outbounds
            .iter()
            .any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("us_custom"));
        assert!(has_custom, "Custom node in template should be preserved");

        // Subscription node hk-01 is present
        let has_hk = outbounds
            .iter()
            .any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("hk-01"));
        assert!(has_hk, "Referenced subscription node should be present");
    }

    #[test]
    fn test_build_updated_outbounds_prunes_deleted_tags() {
        let conn = crate::db::init_db(":memory:").unwrap();

        crate::db::save_outbound_group(
            &conn,
            "Auto-Group",
            "urltest",
            None,
            None,
            None,
            Some("[\"dead-node\", \"direct\"]"),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        let template_config = json!({
            "outbounds": [
                { "type": "direct", "tag": "direct" },
                { "type": "urltest", "tag": "Auto-Group", "outbounds": ["dead-node", "direct"] }
            ]
        });

        let deleted_tags = vec!["dead-node".to_string()];
        let outbounds = build_updated_outbounds(&conn, &template_config, &deleted_tags).unwrap();

        let auto_group = outbounds
            .iter()
            .find(|o| o.get("tag").and_then(|t| t.as_str()) == Some("Auto-Group"))
            .unwrap();
        let member_outbounds = auto_group.get("outbounds").unwrap().as_array().unwrap();
        assert_eq!(member_outbounds.len(), 1);
        assert_eq!(member_outbounds[0].as_str(), Some("direct"));
    }
}
