use anyhow::{Result, anyhow};
use chrono::Local;
use rusqlite::Connection;
use serde_json::{Value, json};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Semaphore;

pub async fn check_and_run_auto_update(db_path: &str) -> Result<()> {
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
                "12h" => 12 * 3600,
                "24h" => 24 * 3600,
                "48h" => 48 * 3600,
                _ => 12 * 3600,
            };
            now >= last_run + interval_secs
        }
    };

    if should_run {
        println!(
            "[AutoUpdate] Triggering scheduled auto update (next_run: {}, now: {})...",
            next_run, now
        );
        drop(conn);
        if let Err(e) = run_auto_update_process(db_path).await {
            eprintln!("[AutoUpdate] Scheduled update failed: {}", e);
        }
    }

    Ok(())
}

pub async fn run_auto_update_process(db_path: &str) -> Result<String> {
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
                "12h" => 12 * 3600,
                "24h" => 24 * 3600,
                "48h" => 48 * 3600,
                _ => 12 * 3600,
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
            &format!("[{}] 自动更新任务启动...\n", now_str),
        )?;
        (url, next_run)
    };

    let log_accum = Arc::new(std::sync::Mutex::new(format!(
        "[{}] 自动更新任务启动...\n",
        now_str
    )));
    let db_path_clone = db_path.to_string();
    let update_log = {
        let log_accum = log_accum.clone();
        move |msg: &str| {
            let current_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let timestamp_prefix = format!("[{}] ", current_time);
            let mut log = log_accum.lock().unwrap();
            if !log.is_empty() && !log.ends_with('\n') {
                log.push('\n');
            }
            log.push_str(&timestamp_prefix);
            log.push_str(msg);
            println!("[AutoUpdate] {}{}", timestamp_prefix, msg);
            if let Ok(conn) = Connection::open(&db_path_clone) {
                let _ = conn.busy_timeout(std::time::Duration::from_secs(5));
                let _ = crate::db::update_setting(&conn, "auto_update_last_log", &log);
            }
        }
    };

    let run_impl = async {
        // Step 1: Select currently running configuration as the base template
        update_log("步骤 1: 正在选择当前运行的配置作为基础模板...");
        let (running_id, history_detail, full_config) = {
            let conn = Connection::open(db_path)?;
            conn.busy_timeout(std::time::Duration::from_secs(5))?;
            let running_id_str =
                crate::db::get_setting(&conn, "running_config_id")?.unwrap_or_default();
            if running_id_str.is_empty() {
                return Err(anyhow!("未开启运行配置，请先在面板配置并保存运行配置"));
            }
            let running_id: i64 = running_id_str.parse()?;
            let history = crate::db::get_config_history_detail(&conn, running_id)?
                .ok_or_else(|| anyhow!("未找到运行中的配置模板(ID: {})", running_id))?;
            let history_detail = history.detail.clone();
            let content_str = history.content.ok_or_else(|| anyhow!("配置模板内容为空"))?;
            let full_config: Value = serde_json::from_str(&content_str)?;
            (running_id, history_detail, full_config)
        };
        update_log(&format!(
            "  -> 已载入当前运行配置模板 (ID: {}, 备注: {})",
            running_id, history_detail
        ));

        // Execute pre-command if configured
        let pre_cmd = {
            let conn_pre = Connection::open(db_path)?;
            conn_pre.busy_timeout(std::time::Duration::from_secs(5))?;
            crate::db::get_setting(&conn_pre, "auto_update_pre_command")?.unwrap_or_default()
        };
        let sudo_pass = {
            let conn_sudo = Connection::open(db_path)?;
            conn_sudo.busy_timeout(std::time::Duration::from_secs(5))?;
            crate::db::get_setting(&conn_sudo, "running_sudo_pass")?.unwrap_or_default()
        };

        if !pre_cmd.trim().is_empty() {
            update_log(&format!("正在执行前置命令: {}...", pre_cmd));
            match crate::web::config::run_command_with_sudo(&pre_cmd, &sudo_pass).await {
                Ok(out) if out.status.success() => {
                    let out_msg = String::from_utf8_lossy(&out.stdout).into_owned();
                    update_log(&format!("  -> 前置命令执行成功！\n{}", out_msg));
                }
                Ok(out) => {
                    let err_str = String::from_utf8_lossy(&out.stderr).into_owned();
                    update_log(&format!("  -> 警告: 前置命令执行失败: {}", err_str));
                }
                Err(e) => {
                    update_log(&format!("  -> 警告: 前置命令执行出错: {}", e));
                }
            }
        }

        // Step 2: Update all active subscriptions in subscription management
        update_log("步骤 2: 正在挨个更新订阅源管理中的所有节点...");
        let fetch_results = crate::fetcher::fetch_all_active_subscriptions(db_path).await?;
        for res in &fetch_results {
            update_log(&format!("  -> {}", res));
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
            "  -> 需要测速的订阅节点数量: {} 个",
            nodes_to_test_count
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
                if latency.is_none() {
                    tx.execute("DELETE FROM nodes WHERE id = ?", [id])?;
                    deleted_count += 1;
                    deleted_tags.push(tag);
                } else {
                    let now_str_test = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let lat_val = latency.unwrap() as i64;
                    tx.execute(
                        "UPDATE nodes SET last_web_latency = ?, last_tested_at = ?, last_target_url = ? WHERE id = ?",
                        rusqlite::params![lat_val, now_str_test, test_url, id],
                    )?;
                }
            }
            tx.commit()?;
        }
        update_log(&format!(
            "  -> 测速完成，共删除超时节点 {} 个: {:?}",
            deleted_count, deleted_tags
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

        // Step 5: Construct updated outbounds preserving correct sing-box topology and system outbounds
        update_log(
            "步骤 5: 正在构建更新后的出站配置 (保留系统出站前置、同步最新策略组及有效代理节点)...",
        );
        let (config_path, restart_cmd, sudo_pass, outbounds_list) = {
            let conn_sync = Connection::open(db_path)?;
            conn_sync.busy_timeout(std::time::Duration::from_secs(5))?;

            let config_path =
                crate::db::get_setting(&conn_sync, "running_config_path")?.unwrap_or_default();
            if config_path.is_empty() {
                return Err(anyhow!("未配置运行配置的保存路径"));
            }
            let restart_cmd =
                crate::db::get_setting(&conn_sync, "running_restart_cmd")?.unwrap_or_default();
            let sudo_pass =
                crate::db::get_setting(&conn_sync, "running_sudo_pass")?.unwrap_or_default();

            let outbounds_list = build_updated_outbounds(&conn_sync, &full_config, &deleted_tags)?;

            update_log(&format!(
                "  -> 出站配置构建完成，总计出站数量: {} 个",
                outbounds_list.len()
            ));

            (config_path, restart_cmd, sudo_pass, outbounds_list)
        };

        // Step 6: Validate configuration using sing-box
        update_log("步骤 6: 正在使用 sing-box 校验生成后的全新配置...");
        let mut final_config = full_config.clone();
        final_config
            .as_object_mut()
            .unwrap()
            .insert("outbounds".to_string(), json!(outbounds_list));

        let log_val = final_config.get("log").cloned().unwrap_or(json!({}));
        let dns_val = final_config.get("dns").cloned().unwrap_or(json!({}));
        let inbounds_val = final_config.get("inbounds").cloned().unwrap_or(json!([]));
        let outbounds_val = final_config.get("outbounds").cloned().unwrap_or(json!([]));
        let route_val = final_config.get("route").cloned().unwrap_or(json!({}));
        let experimental_val = final_config
            .get("experimental")
            .cloned()
            .unwrap_or(json!({}));

        if let Err(err_msg) = crate::web::config::validate_config_with_singbox(
            &log_val,
            &dns_val,
            &inbounds_val,
            &outbounds_val,
            &route_val,
            &experimental_val,
        ) {
            return Err(anyhow!("配置校验失败: {}", err_msg));
        }
        update_log("  -> sing-box 校验成功！");

        // Step 7: Save to disk and execute restart
        update_log("步骤 7: 正在部署配置文件并重启服务...");
        let new_config_str = serde_json::to_string_pretty(&final_config)?;
        let temp_dir = std::env::temp_dir();
        let temp_file_path =
            temp_dir.join(format!("subout_auto_update_{}.json", std::process::id()));
        std::fs::write(&temp_file_path, &new_config_str)?;

        let mut cp_success = false;
        let mut cp_err_msg = String::new();

        if std::fs::copy(&temp_file_path, &config_path).is_ok() {
            cp_success = true;
        } else {
            let parent_dir = std::path::Path::new(&config_path)
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|| "/etc/sing-box".to_string());

            let mkdir_cmd = format!("sudo mkdir -p {:?}", parent_dir);
            let _ = crate::web::config::run_command_with_sudo(&mkdir_cmd, &sudo_pass).await;

            let cp_cmd = format!("sudo cp -f {:?} {:?}", temp_file_path, config_path);
            match crate::web::config::run_command_with_sudo(&cp_cmd, &sudo_pass).await {
                Ok(output) => {
                    if output.status.success() {
                        cp_success = true;
                    } else {
                        cp_err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
                    }
                }
                Err(e) => {
                    cp_err_msg = format!("执行 cp 命令失败: {}", e);
                }
            }
        }

        let _ = std::fs::remove_file(&temp_file_path);

        if !cp_success {
            return Err(anyhow!("覆盖配置文件失败: {}", cp_err_msg));
        }
        update_log("  -> 配置文件部署成功");

        // Run restart command
        if !restart_cmd.trim().is_empty() {
            update_log(&format!("  -> 正在执行服务重启命令: {}", restart_cmd));
            let restart_res =
                crate::web::config::run_command_with_sudo(&restart_cmd, &sudo_pass).await;
            match restart_res {
                Ok(out) if out.status.success() => {
                    let out_msg = String::from_utf8_lossy(&out.stdout).into_owned();
                    update_log(&format!("  -> 重启命令执行成功！\n{}", out_msg));
                }
                Ok(out) => {
                    let err_str = String::from_utf8_lossy(&out.stderr).into_owned();
                    return Err(anyhow!("重启命令执行失败: {}", err_str));
                }
                Err(e) => {
                    return Err(anyhow!("重启命令执行出错: {}", e));
                }
            }
        } else {
            update_log("  -> 跳过重启（未配置重启命令）");
        }

        // Save history config and update active config id
        let new_history_desc = format!(
            "自动更新配置 (包含已更新策略组和代理节点, 清理超时节点: {} 个)",
            deleted_count
        );
        let new_content_json = serde_json::to_string(&final_config)?;
        {
            let conn_hist = Connection::open(db_path)?;
            conn_hist.busy_timeout(std::time::Duration::from_secs(5))?;
            conn_hist.execute(
                "INSERT INTO config_history (change_type, action, detail, content) VALUES ('配置列表', '自动更新', ?, ?)",
                rusqlite::params![new_history_desc, new_content_json],
            )?;
            let new_history_id = conn_hist.last_insert_rowid();
            crate::db::update_setting(
                &conn_hist,
                "running_config_id",
                &new_history_id.to_string(),
            )?;
            update_log(&format!(
                "  -> 已生成全新历史配置记录 (ID: {}) 并设置为当前运行配置",
                new_history_id
            ));
        }

        let next_run_time_str = Local::now()
            .with_timezone(&Local)
            .checked_add_signed(chrono::Duration::seconds((next_run_time - now) as i64))
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();
        update_log(&format!(
            "自动更新完成！下次更新预定时间: {}",
            next_run_time_str
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
        Ok(_) => {
            crate::db::update_setting(&conn_final, "auto_update_last_status", "success")?;
            crate::db::update_setting(&conn_final, "auto_update_last_log", &final_log)?;
            Ok(final_log)
        }
        Err(e) => {
            let current_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let timestamp_prefix = format!("[{}] ", current_time);
            let err_msg = format!("{}\n{}自动更新失败: {}", final_log, timestamp_prefix, e);
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
    let proxy_types = [
        "vmess", "vless", "trojan", "shadowsocks", "socks", "http",
        "hysteria", "hysteria2", "anytls", "tuic", "wireguard", "shadowtls", "v2ray",
    ];

    let deleted_set: HashSet<&str> = deleted_tags.iter().map(|s| s.as_str()).collect();

    let mut system_outbounds = Vec::new();
    let mut template_groups = Vec::new();
    let mut template_custom_nodes = Vec::new();

    if let Some(orig_outbounds) = full_config.get("outbounds").and_then(|o| o.as_array()) {
        for o in orig_outbounds {
            let o_type = o.get("type").and_then(|t| t.as_str()).unwrap_or_default();
            let o_tag = o.get("tag").and_then(|t| t.as_str()).unwrap_or_default();

            if o_type == "selector" || o_type == "urltest" {
                template_groups.push(o.clone());
            } else if proxy_types.contains(&o_type) {
                if !deleted_set.contains(o_tag) {
                    template_custom_nodes.push(o.clone());
                }
            } else {
                system_outbounds.push(o.clone());
            }
        }
    }

    // Ensure basic direct & block exist if template didn't have them
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

    // 2. Fetch strategy groups from DB and compute resolved nodes
    let db_groups = crate::db::get_outbound_groups(conn)?;
    let mut db_group_map = std::collections::HashMap::new();
    let mut referenced_node_tags = HashSet::new();

    for group in &db_groups {
        let resolved = crate::db::resolve_group_nodes(conn, group)?;
        for tag in &resolved {
            referenced_node_tags.insert(tag.clone());
        }
        db_group_map.insert(group.tag.clone(), (group.clone(), resolved));
    }

    // 3. Collect active proxy nodes from DB
    let enabled_nodes = crate::db::get_nodes(conn)?;
    let mut nodes_map = std::collections::HashMap::new();
    for node in enabled_nodes {
        if node.enabled {
            if referenced_node_tags.contains(&node.tag) || node.is_custom {
                if let Ok(mut val) = serde_json::from_str::<Value>(&node.raw_json) {
                    if let Some(obj) = val.as_object_mut() {
                        obj.insert("tag".to_string(), Value::String(node.tag.clone()));
                        nodes_map.insert(node.tag.clone(), Value::Object(obj.clone()));
                    }
                }
            }
        }
    }

    // Preserve any custom node from template that is not in DB and not deleted
    for custom_node in template_custom_nodes {
        if let Some(tag) = custom_node.get("tag").and_then(|t| t.as_str()) {
            if !nodes_map.contains_key(tag) && !deleted_set.contains(tag) {
                nodes_map.insert(tag.to_string(), custom_node);
            }
        }
    }

    // 4. Construct strategy groups list
    let mut final_groups = Vec::new();
    let mut seen_group_tags = HashSet::new();

    for t_group in template_groups {
        if let Some(tag) = t_group.get("tag").and_then(|t| t.as_str()) {
            if seen_group_tags.contains(tag) {
                continue;
            }
            seen_group_tags.insert(tag.to_string());

            if let Some((db_g, resolved)) = db_group_map.get(tag) {
                let mut g_val = json!({
                    "type": db_g.group_type,
                    "tag": db_g.tag,
                    "outbounds": resolved,
                });
                if db_g.group_type == "urltest" {
                    if let Some(ref u) = db_g.url {
                        g_val.as_object_mut().unwrap().insert("url".to_string(), json!(u));
                    }
                    if let Some(ref iv) = db_g.interval {
                        g_val.as_object_mut().unwrap().insert("interval".to_string(), json!(iv));
                    }
                    if let Some(tol) = db_g.tolerance {
                        g_val.as_object_mut().unwrap().insert("tolerance".to_string(), json!(tol));
                    }
                }
                final_groups.push(g_val);
            } else {
                let mut g_val = t_group.clone();
                if let Some(member_arr) = g_val.get_mut("outbounds").and_then(|o| o.as_array_mut()) {
                    member_arr.retain(|m| {
                        let m_str = m.as_str().unwrap_or_default();
                        !deleted_set.contains(m_str)
                    });
                }
                final_groups.push(g_val);
            }
        }
    }

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
                    g_val.as_object_mut().unwrap().insert("url".to_string(), json!(u));
                }
                if let Some(ref iv) = group.interval {
                    g_val.as_object_mut().unwrap().insert("interval".to_string(), json!(iv));
                }
                if let Some(tol) = group.tolerance {
                    g_val.as_object_mut().unwrap().insert("tolerance".to_string(), json!(tol));
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
    for (t, _) in &nodes_map {
        all_valid_tags.insert(t.clone());
    }

    for g in &mut final_groups {
        if let Some(member_arr) = g.get_mut("outbounds").and_then(|o| o.as_array_mut()) {
            member_arr.retain(|m| {
                let m_str = m.as_str().unwrap_or_default();
                all_valid_tags.contains(m_str)
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
        crate::generator::sanitize_outbound_value(o);
    }

    Ok(outbounds_list)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_build_updated_outbounds_preserves_system_outbounds_first() {
        let conn = crate::db::init_db(":memory:").unwrap();

        // Add a subscription and node
        let sub_id = crate::db::add_subscription(&conn, "http://example.com/sub", "sub1", "[]", true).unwrap();
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
            .filter(|o| matches!(o.get("type").and_then(|t| t.as_str()), Some("selector") | Some("urltest")))
            .map(|o| o.get("tag").unwrap().as_str().unwrap())
            .collect();
        assert!(group_tags.contains(&"proxy"));
        assert!(group_tags.contains(&"HK-Group"));

        // Custom node from template is preserved
        let has_custom = outbounds.iter().any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("us_custom"));
        assert!(has_custom, "Custom node in template should be preserved");

        // Subscription node hk-01 is present
        let has_hk = outbounds.iter().any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("hk-01"));
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

        let auto_group = outbounds.iter().find(|o| o.get("tag").and_then(|t| t.as_str()) == Some("Auto-Group")).unwrap();
        let member_outbounds = auto_group.get("outbounds").unwrap().as_array().unwrap();
        assert_eq!(member_outbounds.len(), 1);
        assert_eq!(member_outbounds[0].as_str(), Some("direct"));
    }
}
