use anyhow::{Result, anyhow};
use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AutoUpdateProgressEvent {
    pub event_type: String, // "status", "start", "log", "done", "error"
    pub message: String,
    pub status: String, // "running", "success", "failed", "idle"
    pub version_code: Option<i64>,
    pub timestamp: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AutoUpdateLiveState {
    pub is_running: bool,
    pub current_log: String,
    pub last_status: String,
    pub start_time: Option<u64>,
    pub version_code: Option<i64>,
}

impl Default for AutoUpdateLiveState {
    fn default() -> Self {
        Self {
            is_running: false,
            current_log: String::new(),
            last_status: "idle".to_string(),
            start_time: None,
            version_code: None,
        }
    }
}

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
    run_auto_update_process_with_options(db_path, service_manager, false, None, None).await
}

pub async fn run_auto_update_process_with_options(
    db_path: &str,
    service_manager: Option<Arc<crate::service::SingBoxServiceManager>>,
    is_manual: bool,
    event_tx: Option<tokio::sync::broadcast::Sender<AutoUpdateProgressEvent>>,
    live_state: Option<Arc<tokio::sync::RwLock<AutoUpdateLiveState>>>,
) -> Result<String> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Check if already running (with a 10-minute timeout threshold)
    let already_running = {
        if let Some(ref ls) = live_state {
            let state = ls.read().await;
            if state.is_running {
                true
            } else {
                check_db_is_running(db_path, now)?
            }
        } else {
            check_db_is_running(db_path, now)?
        }
    };
    if already_running {
        return Err(anyhow!("自动更新任务已在运行中，请勿重复触发"));
    }

    // Set running status, calculate next run time, and drop connection immediately
    let (next_run_time, interval_str) = {
        let conn = Connection::open(db_path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;

        let interval = crate::db::get_setting(&conn, "auto_update_interval")?
            .unwrap_or_else(|| "12h".to_string());
        let next_run = if interval == "daily" {
            let daily_time_str = crate::db::get_setting(&conn, "auto_update_daily_time")?
                .unwrap_or_else(|| "04:00".to_string());
            calculate_next_daily_run(&daily_time_str).unwrap_or(now + 86400)
        } else {
            let interval_secs = match interval.as_str() {
                "1h" => 3600,
                "6h" => 6 * 3600,
                "24h" => 24 * 3600,
                "48h" => 48 * 3600,
                _ => 12 * 3600, // 12h or default
            };
            now + interval_secs
        };

        let initial_log = format!("[{now_str}] 自动更新任务启动...\n");
        crate::db::update_setting(&conn, "auto_update_last_status", "running")?;
        crate::db::update_setting(&conn, "auto_update_last_run", &now.to_string())?;
        crate::db::update_setting(&conn, "auto_update_next_run", &next_run.to_string())?;
        crate::db::update_setting(&conn, "auto_update_last_log", &initial_log)?;
        (next_run, interval)
    };

    let start_msg = format!("[{now_str}] 自动更新任务启动...\n");
    if let Some(ref ls) = live_state {
        let mut st = ls.write().await;
        st.is_running = true;
        st.current_log.clone_from(&start_msg);
        st.last_status = "running".to_string();
        st.start_time = Some(now);
        st.version_code = None;
    }

    if let Some(ref tx) = event_tx {
        let _ = tx.send(AutoUpdateProgressEvent {
            event_type: "start".to_string(),
            message: format!("[{now_str}] 自动更新任务启动..."),
            status: "running".to_string(),
            version_code: None,
            timestamp: now_str.clone(),
        });
    }

    let log_accum = Arc::new(std::sync::Mutex::new(start_msg));
    let db_path_clone = db_path.to_string();
    let event_tx_clone = event_tx.clone();
    let live_state_clone = live_state.clone();

    let update_log = {
        let log_accum = log_accum.clone();
        let db_path_clone = db_path_clone.clone();
        let event_tx_clone = event_tx_clone.clone();
        let live_state_clone = live_state_clone.clone();

        move |msg: &str| {
            let current_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let timestamp_prefix = format!("[{current_time}] ");
            let full_line = format!("{timestamp_prefix}{msg}");

            {
                let mut log = log_accum.lock().unwrap();
                if !log.is_empty() && !log.ends_with('\n') {
                    log.push('\n');
                }
                log.push_str(&full_line);
                log.push('\n');
            }

            println!("[AutoUpdate] {full_line}");

            // Persist intermediate log into DB
            if let Ok(conn) = Connection::open(&db_path_clone) {
                let _ = conn.busy_timeout(std::time::Duration::from_secs(5));
                let current_full_log = log_accum.lock().unwrap().clone();
                let _ = crate::db::update_setting(&conn, "auto_update_last_log", &current_full_log);
            }

            // Update live state in memory
            if let Some(ref ls) = live_state_clone {
                let current_full_log = log_accum.lock().unwrap().clone();
                let ls = ls.clone();
                tokio::spawn(async move {
                    let mut st = ls.write().await;
                    st.current_log = current_full_log;
                });
            }

            // Broadcast SSE event
            if let Some(ref tx) = event_tx_clone {
                let _ = tx.send(AutoUpdateProgressEvent {
                    event_type: "log".to_string(),
                    message: full_line,
                    status: "running".to_string(),
                    version_code: None,
                    timestamp: current_time,
                });
            }
        }
    };

    let start_time_instant = std::time::Instant::now();
    let snapshot_history_id: Arc<std::sync::Mutex<Option<i64>>> =
        Arc::new(std::sync::Mutex::new(None));
    let snapshot_profile_id: Arc<std::sync::Mutex<Option<i64>>> =
        Arc::new(std::sync::Mutex::new(None));
    let snapshot_profile_content: Arc<std::sync::Mutex<Option<String>>> =
        Arc::new(std::sync::Mutex::new(None));

    let service_mgr_for_run = service_manager.clone();
    let snapshot_history_id_clone = snapshot_history_id.clone();
    let snapshot_profile_id_clone = snapshot_profile_id.clone();
    let snapshot_profile_content_clone = snapshot_profile_content.clone();

    let run_impl = async {
        // Step 1: Select currently running configuration as the base template
        let (running_profile_opt, full_config) = {
            let conn = Connection::open(db_path)?;
            conn.busy_timeout(std::time::Duration::from_secs(5))?;
            let profile_opt = crate::db::get_running_config_profile(&conn)?;
            let cfg_val: Value = if let Some(ref p) = profile_opt {
                *snapshot_profile_id_clone.lock().unwrap() = Some(p.id);
                *snapshot_profile_content_clone.lock().unwrap() = Some(p.content.clone());
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
                "步骤 1: 正在选择当前运行配置作为基础模板 (ID: {}, 名称: '{}', 平台: '{}')",
                p.id, p.name, p.platform
            ));
        } else {
            update_log(
                "步骤 1: 提示: 当前未绑定运行配置，本次仅执行订阅节点拉取与节点组合重新计算",
            );
        }

        // Step 2: Fetch and update all active subscriptions
        update_log("步骤 2: 正在更新订阅源管理中的所有启用节点...");
        let fetch_details =
            crate::fetcher::fetch_all_active_subscriptions_detailed(db_path).await?;
        if fetch_details.is_empty() {
            update_log("  -> 提示: 当前无启用的订阅源，跳过拉取。");
        } else {
            let mut total_saved = 0;
            let mut total_filtered = 0;
            let mut sub_success_count = 0;
            let mut sub_fail_count = 0;

            for det in &fetch_details {
                if det.success {
                    sub_success_count += 1;
                    total_saved += det.saved_count;
                    total_filtered += det.filtered_count;
                    update_log(&format!(
                        "  -> [订阅 '{}' (ID: {})] 请求成功: 解析到 {} 个节点，过滤 {} 个，写入 {} 个有效节点",
                        det.label, det.id, det.raw_count, det.filtered_count, det.saved_count
                    ));
                    if let Some(info_str) = crate::fetcher::format_userinfo_summary(
                        det.upload,
                        det.download,
                        det.total,
                        det.expire,
                    ) {
                        update_log(&format!("     流量配额: {info_str}"));
                    }
                } else {
                    sub_fail_count += 1;
                    update_log(&format!(
                        "  -> ⚠️ [订阅 '{}' (ID: {})] 请求失败: {}",
                        det.label,
                        det.id,
                        det.error.as_deref().unwrap_or("网络连接异常")
                    ));
                }
            }
            update_log(&format!(
                "  -> 订阅更新汇总: 成功 {sub_success_count} 个，失败 {sub_fail_count} 个，本次共过滤 {total_filtered} 个广告/失效节点，入库保存 {total_saved} 个有效节点"
            ));
        }

        // Step 3: Update all node groups based on the refreshed node pool
        update_log("步骤 3: 正在根据最新节点池更新所有节点组合 (自动匹配与静态节点)...");
        {
            let mut conn_groups = Connection::open(db_path)?;
            conn_groups.busy_timeout(std::time::Duration::from_secs(5))?;
            let tx = conn_groups.transaction()?;
            let groups = crate::db::get_outbound_groups(&tx)?;
            let all_nodes = crate::db::get_nodes(&tx)?;
            let existing_tags: std::collections::HashSet<String> = all_nodes
                .into_iter()
                .filter(|n| n.enabled)
                .map(|n| n.tag)
                .collect();

            if groups.is_empty() {
                update_log("  -> 提示: 数据库中未配置任何节点组合。");
            } else {
                for g in groups {
                    let is_static = g.match_type.as_deref() == Some("static");
                    if is_static {
                        let static_list: Vec<String> =
                            serde_json::from_str(g.static_nodes.as_deref().unwrap_or("[]"))
                                .unwrap_or_default();
                        let orig_count = static_list.len();
                        let valid_list: Vec<String> = static_list
                            .into_iter()
                            .filter(|t| existing_tags.contains(t) || t == "direct" || t == "block")
                            .collect();
                        let valid_count = valid_list.len();
                        let new_json = serde_json::to_string(&valid_list)?;
                        if Some(&new_json) == g.static_nodes.as_ref() {
                            update_log(&format!(
                                "  -> 静态节点组合 '{}' (类型: {}) 校验完成，有效节点 {} 个",
                                g.tag, g.group_type, valid_count
                            ));
                        } else {
                            tx.execute(
                                "UPDATE outbound_groups SET static_nodes = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                                rusqlite::params![new_json, g.id],
                            )?;
                            let pruned = orig_count.saturating_sub(valid_count);
                            update_log(&format!(
                                "  -> 静态节点组合 '{}' (类型: {}) 已更新，有效节点 {} 个 (自动剔除 {} 个失效节点)",
                                g.tag, g.group_type, valid_count, pruned
                            ));
                        }
                    } else {
                        let resolved = crate::db::resolve_group_nodes(&tx, &g)?;
                        let resolved_count = resolved.len();
                        let resolved_json = serde_json::to_string(&resolved)?;
                        tx.execute(
                            "UPDATE outbound_groups SET static_nodes = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                            rusqlite::params![resolved_json, g.id],
                        )?;
                        if resolved_count == 0 {
                            update_log(&format!(
                                "  -> ⚠️ 自动匹配节点组合 '{}' (类型: {}) 匹配结果为 0 个有效节点 (已变为空组合)",
                                g.tag, g.group_type
                            ));
                        } else {
                            update_log(&format!(
                                "  -> 自动匹配节点组合 '{}' (类型: {}) 已更新，匹配到 {} 个节点",
                                g.tag, g.group_type, resolved_count
                            ));
                        }
                    }
                }
            }
            tx.commit()?;
        }

        // Increment and refresh global versionCode
        let new_vcode = {
            let conn_vcode = Connection::open(db_path)?;
            conn_vcode.busy_timeout(std::time::Duration::from_secs(5))?;
            crate::db::refresh_node_group_version_code(&conn_vcode)?
        };
        update_log(&format!(
            "  -> 节点组合全局 versionCode 已递增更新为: {new_vcode}"
        ));

        if let Some(ref ls) = live_state {
            let mut st = ls.write().await;
            st.version_code = Some(new_vcode);
        }

        // Step 4: Check if auto sync to running config is enabled
        let sync_running = {
            let conn = Connection::open(db_path)?;
            conn.busy_timeout(std::time::Duration::from_secs(5))?;
            crate::db::get_setting(&conn, "auto_update_sync_running")?
                .unwrap_or_else(|| "1".to_string())
                == "1"
        };

        if sync_running && let Some(profile) = running_profile_opt.as_ref() {
            update_log(&format!(
                "步骤 4: 开启了“自动同步至当前运行配置”，正在重构配置 outbounds 并修复失效路由/DNS [{}]...",
                profile.name
            ));

            let conn_sync = Connection::open(db_path)?;
            conn_sync.busy_timeout(std::time::Duration::from_secs(5))?;

            // Rebuild outbounds from scratch: clear old proxy nodes and groups, repair invalid routes & empty groups
            let (final_config, repaired) =
                crate::generator::sync_config_with_latest_resources(&conn_sync, &full_config, &[])?;

            let outbounds_len = final_config
                .get("outbounds")
                .and_then(|o| o.as_array())
                .map_or(0, std::vec::Vec::len);

            update_log(&format!(
                "  -> 出站配置已按最新节点与策略组重构完成 (旧代理节点与旧策略组已清空)，出站条目总计: {outbounds_len} 个"
            ));

            if repaired.is_empty() {
                update_log("  -> 路由与 DNS 规则引用校验正常，所有出站条目均有效，无需重置。");
            } else {
                for rep in &repaired {
                    update_log(&format!("  -> [自动修复失效路由/DNS] {rep}"));
                }
            }

            // Step 5: Validate configuration with sing-box
            update_log("步骤 5: 正在使用 sing-box 校验生成后的全新配置...");
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
            update_log("  -> sing-box 静态校验成功通过！全新配置语法与结构有效。");

            // Step 6: Save historical snapshot before overwriting
            update_log("步骤 6: 正在创建更新前历史备份快照并覆盖运行配置...");
            let now_str_snap = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let snap_desc = format!(
                "{}覆盖运行配置 [{}] (时间: {}, versionCode: {})",
                if is_manual {
                    "手动更新"
                } else {
                    "自动更新"
                },
                profile.name,
                now_str_snap,
                new_vcode
            );

            let snapshot_log = log_accum.lock().unwrap().clone();
            let history_id = crate::db::log_history_full(
                &conn_sync,
                Some(profile.id),
                if is_manual {
                    "manual_update"
                } else {
                    "auto_update"
                },
                if is_manual {
                    "手动更新"
                } else {
                    "自动更新"
                },
                &snap_desc,
                Some(&profile.content),
                Some("running"),
                Some(&snapshot_log),
                Some(new_vcode),
            )?;
            *snapshot_history_id_clone.lock().unwrap() = Some(history_id);

            update_log(&format!(
                "  -> 已成功创建变更前历史备份快照存档 (快照 ID: #{}, 配置 ID: {})",
                history_id, profile.id
            ));

            // Overwrite configs in database
            let new_content_pretty = serde_json::to_string_pretty(&final_config)?;
            conn_sync.execute(
                "UPDATE configs SET content = ?, version_code = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                rusqlite::params![new_content_pretty, new_vcode, profile.id],
            )?;
            update_log("  -> 本机运行配置数据库记录已更新完成");

            // Deploy to disk
            let running_config_path =
                crate::service::SingBoxServiceManager::get_running_config_path();
            if let Some(parent) = running_config_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::fs::write(&running_config_path, &new_content_pretty)?;
            update_log(&format!(
                "  -> 配置文件已部署至 {} (大小: {} 字节)",
                running_config_path.display(),
                new_content_pretty.len()
            ));

            // Step 7: Reload service if auto_update_reload_service is enabled and sing-box is currently running
            let reload_enabled = crate::db::get_setting(&conn_sync, "auto_update_reload_service")?
                .unwrap_or_else(|| "1".to_string())
                == "1";
            if reload_enabled && let Some(ref mgr) = service_mgr_for_run {
                update_log("步骤 7: 检查 sing-box 服务状态并准备平滑热重载...");
                if mgr.is_running().await {
                    update_log(
                        "  -> sing-box 服务正在运行中，正在使用最新配置平滑重启 sing-box...",
                    );
                    match mgr.restart_with_sudo(&final_config, None).await {
                        Ok(()) => {
                            update_log("  -> ✅ sing-box 核心服务已成功平滑重启并以新配置运行！");
                        }
                        Err(e) => {
                            update_log(&format!("  -> ⚠️ 警告: 重启 sing-box 服务失败: {e}"));
                        }
                    }
                } else {
                    update_log(
                        "  -> sing-box 核心服务当前未在运行，最新配置已就绪落盘，启动服务时将直接生效。",
                    );
                }
            } else if !reload_enabled {
                update_log("步骤 7: “平滑热重载 sing-box 服务”设置未启用，跳过重启服务。");
            }
        } else {
            update_log(
                "步骤 4: 未开启“自动同步至当前运行配置”或未绑定运行配置，跳过覆盖运行配置。",
            );
        }

        let elapsed = start_time_instant.elapsed();
        let next_run_time_str = Local::now()
            .with_timezone(&Local)
            .checked_add_signed(chrono::Duration::seconds((next_run_time - now) as i64))
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();
        update_log(&format!(
            "全流程更新流水线已顺利完成！全局 versionCode: {new_vcode}，耗时: {:.2}秒，下次更新预定时间: {next_run_time_str} (调度策略: {interval_str})",
            elapsed.as_secs_f64()
        ));

        Ok(new_vcode)
    };

    let run_res = run_impl.await;
    let conn_final = Connection::open(db_path)?;
    conn_final.busy_timeout(std::time::Duration::from_secs(5))?;
    let final_log = {
        let log = log_accum.lock().unwrap();
        log.clone()
    };

    match run_res {
        Ok(vcode) => {
            crate::db::update_setting(&conn_final, "auto_update_last_status", "success")?;
            crate::db::update_setting(&conn_final, "auto_update_last_log", &final_log)?;

            // If a snapshot history row was created at Step 6, update it with the 100% complete final log!
            let opt_hid = *snapshot_history_id.lock().unwrap();
            if let Some(hid) = opt_hid {
                let _ = crate::db::update_config_history_final(
                    &conn_final,
                    hid,
                    "success",
                    &final_log,
                    None,
                    Some(vcode),
                );
            } else {
                // If not created yet (e.g., sync_running was disabled), insert a history record with full log
                let desc = format!(
                    "{} (未绑定/未覆盖运行配置, versionCode: {})",
                    if is_manual {
                        "手动更新"
                    } else {
                        "自动更新"
                    },
                    vcode
                );
                let _ = crate::db::log_history_full(
                    &conn_final,
                    None,
                    if is_manual {
                        "manual_update"
                    } else {
                        "auto_update"
                    },
                    if is_manual {
                        "手动更新"
                    } else {
                        "自动更新"
                    },
                    &desc,
                    None,
                    Some("success"),
                    Some(&final_log),
                    Some(vcode),
                );
            }

            if let Some(ref ls) = live_state {
                let mut st = ls.write().await;
                st.is_running = false;
                st.last_status = "success".to_string();
                st.current_log.clone_from(&final_log);
                st.version_code = Some(vcode);
            }

            if let Some(ref tx) = event_tx {
                let _ = tx.send(AutoUpdateProgressEvent {
                    event_type: "done".to_string(),
                    message: "更新完成".to_string(),
                    status: "success".to_string(),
                    version_code: Some(vcode),
                    timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                });
            }

            Ok(final_log)
        }
        Err(e) => {
            let current_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let timestamp_prefix = format!("[{current_time}] ");
            let err_msg = format!("{final_log}\n{timestamp_prefix}自动更新流水线执行失败: {e}");

            crate::db::update_setting(&conn_final, "auto_update_last_status", "failed")?;
            crate::db::update_setting(&conn_final, "auto_update_last_log", &err_msg)?;

            let opt_hid = *snapshot_history_id.lock().unwrap();
            if let Some(hid) = opt_hid {
                // Update the already created snapshot record with failed status and full error log
                let _ = crate::db::update_config_history_final(
                    &conn_final,
                    hid,
                    "failed",
                    &err_msg,
                    Some(&format!("更新失败: {e}")),
                    None,
                );
            } else {
                let fallback_pid = *snapshot_profile_id.lock().unwrap();
                let fallback_content = snapshot_profile_content.lock().unwrap().clone();
                let _ = crate::db::log_history_full(
                    &conn_final,
                    fallback_pid,
                    if is_manual {
                        "manual_update"
                    } else {
                        "auto_update"
                    },
                    if is_manual {
                        "手动更新"
                    } else {
                        "自动更新"
                    },
                    &format!("更新失败: {e}"),
                    fallback_content.as_deref(),
                    Some("failed"),
                    Some(&err_msg),
                    None,
                );
            }

            if let Some(ref ls) = live_state {
                let mut st = ls.write().await;
                st.is_running = false;
                st.last_status = "failed".to_string();
                st.current_log.clone_from(&err_msg);
            }

            if let Some(ref tx) = event_tx {
                let _ = tx.send(AutoUpdateProgressEvent {
                    event_type: "error".to_string(),
                    message: format!("自动更新失败: {e}"),
                    status: "failed".to_string(),
                    version_code: None,
                    timestamp: current_time,
                });
            }

            Err(e)
        }
    }
}

fn check_db_is_running(db_path: &str, now: u64) -> Result<bool> {
    let conn = Connection::open(db_path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    let status = crate::db::get_setting(&conn, "auto_update_last_status")?.unwrap_or_default();
    let last_run_str = crate::db::get_setting(&conn, "auto_update_last_run")?.unwrap_or_default();
    let last_run: u64 = last_run_str.parse().unwrap_or(0);
    Ok(status == "running" && now < last_run + 600)
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
            Some("auto"),
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

        // Add a custom node in DB
        crate::db::save_node(
            &conn,
            None,
            "us_custom",
            "vless",
            "1.2.3.4",
            443,
            "{\"server\":\"1.2.3.4\",\"server_port\":443,\"type\":\"vless\",\"uuid\":\"xyz\"}",
            true,
            true,
        )
        .unwrap();

        let template_config = json!({
            "outbounds": [
                { "type": "direct", "tag": "direct" },
                { "type": "block", "tag": "block" },
                { "type": "selector", "tag": "proxy", "outbounds": ["HK-Group", "direct"] },
                { "type": "vless", "tag": "stale_node", "server": "9.9.9.9", "server_port": 443 }
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
        assert!(group_tags.contains(&"HK-Group"));

        // Custom node from DB is preserved
        let has_custom = outbounds
            .iter()
            .any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("us_custom"));
        assert!(has_custom, "Custom node in DB should be preserved");

        // Stale node from template is cleared out
        let has_stale = outbounds
            .iter()
            .any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("stale_node"));
        assert!(!has_stale, "Stale proxy node in template should be cleared");

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
            Some("auto"),
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
