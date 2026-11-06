use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
};
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use std::fmt::Write;

use crate::db;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Serialize)]
pub struct AutoUpdateSettingsResponse {
    pub enabled: bool,
    pub cron: String,
    pub cron_expression: String,
    pub interval: String,
    pub daily_time: String,
    pub sync_running: bool,
    pub sync_running_config: bool,
    pub reload_service: bool,
    pub last_run: Option<u64>,
    pub next_run: Option<u64>,
    pub last_status: Option<String>,
    pub last_log: Option<String>,
    pub current_version_code: i64,
}

#[derive(Deserialize)]
pub struct SaveAutoUpdateSettingsRequest {
    pub enabled: Option<bool>,
    #[serde(alias = "cron_expression")]
    pub cron: Option<String>,
    pub interval: Option<String>,
    pub daily_time: Option<String>,
    #[serde(alias = "sync_running_config")]
    pub sync_running: Option<bool>,
    pub reload_service: Option<bool>,
}

#[derive(Serialize)]
pub struct SnapshotItem {
    pub id: i64,
    pub config_id: Option<i64>,
    pub config_name: Option<String>,
    pub change_type: String,
    pub action: String,
    pub status: Option<String>,
    pub detail: String,
    pub has_content: bool,
    pub log: Option<String>,
    pub version_code: Option<i64>,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Serialize)]
pub struct HistoryPageResponse {
    pub items: Vec<SnapshotItem>,
    pub total: i64,
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub page: Option<usize>,
    pub page_size: Option<usize>,
}

#[derive(Serialize)]
pub struct AutoUpdateStatusResponse {
    pub is_running: bool,
    pub current_log: String,
    pub last_status: String,
    pub start_time: Option<u64>,
    pub version_code: Option<i64>,
}

struct StreamState {
    initial_sent: bool,
    initial_msg: crate::auto_update::AutoUpdateProgressEvent,
    receiver: tokio::sync::broadcast::Receiver<crate::auto_update::AutoUpdateProgressEvent>,
}

pub async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AutoUpdateSettingsResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let enabled = db::get_setting(&conn, "auto_update_enabled")
        .unwrap_or_default()
        .unwrap_or_default()
        == "true";
    let cron = db::get_setting(&conn, "auto_update_cron")
        .unwrap_or_default()
        .unwrap_or_else(|| "0 4 * * *".to_string());
    let interval = db::get_setting(&conn, "auto_update_interval")
        .unwrap_or_default()
        .unwrap_or_else(|| "12h".to_string());
    let daily_time = db::get_setting(&conn, "auto_update_daily_time")
        .unwrap_or_default()
        .unwrap_or_else(|| "04:00".to_string());
    let sync_running = db::get_setting(&conn, "auto_update_sync_running")
        .unwrap_or_default()
        .unwrap_or_else(|| "1".to_string())
        == "1";
    let reload_service = db::get_setting(&conn, "auto_update_reload_service")
        .unwrap_or_default()
        .unwrap_or_else(|| "1".to_string())
        == "1";
    let last_run = db::get_setting(&conn, "auto_update_last_run")
        .unwrap_or_default()
        .and_then(|v| v.parse::<u64>().ok());
    let next_run = db::get_setting(&conn, "auto_update_next_run")
        .unwrap_or_default()
        .and_then(|v| v.parse::<u64>().ok());
    let last_status = db::get_setting(&conn, "auto_update_last_status").unwrap_or_default();
    let last_log = db::get_setting(&conn, "auto_update_last_log").unwrap_or_default();
    let current_version_code = db::get_node_group_version_code(&conn).unwrap_or(0);

    Ok(Json(AutoUpdateSettingsResponse {
        enabled,
        cron: cron.clone(),
        cron_expression: cron,
        interval,
        daily_time,
        sync_running,
        sync_running_config: sync_running,
        reload_service,
        last_run,
        next_run,
        last_status,
        last_log,
        current_version_code,
    }))
}

pub async fn save_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SaveAutoUpdateSettingsRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    if let Some(enabled) = payload.enabled {
        let _ = db::update_setting(&conn, "auto_update_enabled", &enabled.to_string());
    }
    if let Some(cron) = payload.cron {
        let _ = db::update_setting(&conn, "auto_update_cron", &cron);
    }
    if let Some(interval) = payload.interval {
        let _ = db::update_setting(&conn, "auto_update_interval", &interval);
    }
    if let Some(daily_time) = payload.daily_time {
        let _ = db::update_setting(&conn, "auto_update_daily_time", &daily_time);
    }
    if let Some(sync_running) = payload.sync_running {
        let val = if sync_running { "1" } else { "0" };
        let _ = db::update_setting(&conn, "auto_update_sync_running", val);
    }
    if let Some(reload_service) = payload.reload_service {
        let val = if reload_service { "1" } else { "0" };
        let _ = db::update_setting(&conn, "auto_update_reload_service", val);
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "自动更新设置已保存"
    })))
}

pub async fn get_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AutoUpdateStatusResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let live = state.auto_update_status.read().await;
    Ok(Json(AutoUpdateStatusResponse {
        is_running: live.is_running,
        current_log: live.current_log.clone(),
        last_status: live.last_status.clone(),
        start_time: live.start_time,
        version_code: live.version_code,
    }))
}

pub async fn stream_auto_update(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, (StatusCode, String)>
{
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let rx = state.auto_update_tx.subscribe();
    let initial_state = state.auto_update_status.read().await.clone();

    // Stream unfolds from rx channel
    // First message is an initial status message with current log buffer
    let initial_msg = crate::auto_update::AutoUpdateProgressEvent {
        event_type: "status".to_string(),
        message: initial_state.current_log.clone(),
        status: initial_state.last_status.clone(),
        version_code: initial_state.version_code,
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    let initial_stream_state = StreamState {
        initial_sent: false,
        initial_msg,
        receiver: rx,
    };

    let stream = futures_util::stream::unfold(initial_stream_state, |mut s| async move {
        if !s.initial_sent {
            s.initial_sent = true;
            let json_str = serde_json::to_string(&s.initial_msg).unwrap_or_default();
            let event = Event::default().event("status").data(json_str);
            return Some((Ok::<_, std::convert::Infallible>(event), s));
        }

        match s.receiver.recv().await {
            Ok(msg) => {
                let json_str = serde_json::to_string(&msg).unwrap_or_default();
                let event = Event::default()
                    .event(msg.event_type.clone())
                    .data(json_str);
                Some((Ok::<_, std::convert::Infallible>(event), s))
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                let event = Event::default()
                    .event("log")
                    .data("{\"message\":\"[系统提示: 日志流较多，已自动追赶最新进度]\"}");
                Some((Ok::<_, std::convert::Infallible>(event), s))
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => None,
        }
    });

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

pub async fn trigger_auto_update(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    // Check if already running in memory
    {
        let live = state.auto_update_status.read().await;
        if live.is_running {
            return Err((
                StatusCode::CONFLICT,
                "自动更新任务已在运行中，请勿重复触发".to_string(),
            ));
        }
    }

    let db_path = state.db_path.clone();
    let service_mgr = state.service_manager.clone();
    let event_tx = state.auto_update_tx.clone();
    let live_state = state.auto_update_status.clone();

    tokio::spawn(async move {
        if let Err(e) = crate::auto_update::run_auto_update_process_with_options(
            &db_path,
            Some(service_mgr),
            true, // is_manual = true
            Some(event_tx),
            Some(live_state),
        )
        .await
        {
            eprintln!("[AutoUpdate] Manual trigger failed: {e}");
        }
    });

    Ok(Json(serde_json::json!({
        "status": "started",
        "message": "已成功触发全流程更新流水线"
    })))
}

pub async fn get_history_snapshots(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<HistoryPageResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).max(1);

    let (list, total) = db::get_config_history_paged(&conn, page, page_size).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("查询历史快照失败: {e}"),
        )
    })?;

    let total_pages = (total as usize).div_ceil(page_size).max(1);

    let items = list
        .into_iter()
        .map(|h| SnapshotItem {
            id: h.id,
            config_id: h.config_id,
            config_name: h.config_name,
            change_type: h.change_type,
            action: h.action,
            status: h.status,
            detail: h.detail,
            has_content: h.content.is_some(),
            log: h.log,
            version_code: h.version_code,
            created_at: h.created_at,
            updated_at: h.updated_at,
        })
        .collect();

    Ok(Json(HistoryPageResponse {
        items,
        total,
        page,
        page_size,
        total_pages,
    }))
}

pub async fn get_history_snapshot_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<db::ConfigHistory>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let item = db::get_config_history_detail(&conn, id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("查询历史快照详情失败: {e}"),
            )
        })?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "指定的快照不存在".to_string()))?;

    Ok(Json(item))
}

pub async fn rollback_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    // 1. Fetch snapshot from config_history
    let snapshot = db::get_config_history_detail(&conn, id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("查询快照失败: {e}"),
            )
        })?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "指定的历史快照不存在".to_string()))?;

    let snapshot_content = snapshot.content.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "选定的快照未存储配置内容，无法执行一键回滚".to_string(),
        )
    })?;

    // 2. Identify target profile
    let target_profile = if let Some(cfg_id) = snapshot.config_id {
        db::get_config_profile_by_id(&conn, cfg_id).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("查询配置失败: {e}"),
            )
        })?
    } else {
        db::get_running_config_profile(&conn).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("查询运行配置失败: {e}"),
            )
        })?
    }
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            "快照关联的配置已被删除或不存在".to_string(),
        )
    })?;

    // 3. Save safety snapshot of current state before rollback
    let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let snap_desc = format!(
        "回滚前自动备份 [{}] (准备回滚至快照 #{}: {})",
        target_profile.name, snapshot.id, snapshot.detail
    );
    let mut rollback_log = format!("[{now_str}] 开始执行历史快照回滚操作...\n");
    let _ = writeln!(
        rollback_log,
        "  -> 目标配置: ID {}, 名称: '{}'",
        target_profile.id, target_profile.name
    );
    let _ = writeln!(
        rollback_log,
        "  -> 恢复源快照: ID #{}, 描述: '{}', versionCode: {:?}",
        snapshot.id, snapshot.detail, snapshot.version_code
    );

    let hist_id = db::log_history_full(
        &conn,
        Some(target_profile.id),
        "manual_rollback",
        "快照回滚",
        &snap_desc,
        Some(&target_profile.content),
        Some("running"),
        Some(&rollback_log),
        snapshot.version_code,
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("创建回滚前备份快照失败: {e}"),
        )
    })?;

    // 4. Overwrite config in configs table
    let latest_vcode = snapshot
        .version_code
        .unwrap_or_else(|| db::get_node_group_version_code(&conn).unwrap_or(0));
    conn.execute(
        "UPDATE configs SET content = ?, version_code = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
        rusqlite::params![snapshot_content, latest_vcode, target_profile.id],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("回滚配置数据库写入失败: {e}")))?;
    rollback_log.push_str("  -> 目标配置内容与版本号在数据库中已成功恢复\n");

    // 5. If this is the active running config, deploy to disk and reload if running
    if target_profile.is_running_config {
        let running_config_path = crate::service::SingBoxServiceManager::get_running_config_path();
        if let Some(parent) = running_config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&running_config_path, &snapshot_content);
        let _ = writeln!(
            rollback_log,
            "  -> 配置文件已成功重新部署至磁盘: {}",
            running_config_path.display()
        );

        if state.service_manager.is_running().await
            && let Ok(parsed_val) = serde_json::from_str::<serde_json::Value>(&snapshot_content)
        {
            rollback_log.push_str("  -> sing-box 服务正在运行，正在使用回滚配置重启服务...\n");
            match state
                .service_manager
                .restart_with_sudo(&parsed_val, None)
                .await
            {
                Ok(()) => {
                    rollback_log
                        .push_str("  -> ✅ sing-box 核心服务已成功平滑重启并以恢复配置生效！\n");
                }
                Err(e) => {
                    let _ = writeln!(rollback_log, "  -> ⚠️ 警告: 重启 sing-box 服务失败: {e}");
                }
            }
        } else {
            rollback_log.push_str("  -> sing-box 核心服务当前未在运行，回滚配置已就绪落盘。\n");
        }
    }

    let finish_time = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let _ = writeln!(
        rollback_log,
        "[{finish_time}] 快照回滚操作全部执行完成！配置已生效。"
    );

    let _ = db::update_config_history_final(
        &conn,
        hist_id,
        "success",
        &rollback_log,
        Some(&format!(
            "已成功恢复配置 [{}] 至快照 #{}",
            target_profile.name, snapshot.id
        )),
        snapshot.version_code,
    );

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": format!("已成功将配置 [{}] 回滚至快照 #{} ({})", target_profile.name, snapshot.id, now_str)
    })))
}
