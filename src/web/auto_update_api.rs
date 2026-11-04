use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};

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
    pub change_type: String,
    pub action: String,
    pub detail: String,
    pub created_at: String,
    pub updated_at: Option<String>,
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

pub async fn trigger_auto_update(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let db_path = state.db_path.clone();
    let service_mgr = state.service_manager.clone();

    tokio::spawn(async move {
        if let Err(e) =
            crate::auto_update::run_auto_update_process(&db_path, Some(service_mgr)).await
        {
            eprintln!("[AutoUpdate] Manual trigger failed: {e}");
        }
    });

    Ok(Json(serde_json::json!({
        "status": "started",
        "message": "已成功触发全链式自动更新流水线"
    })))
}

pub async fn get_history_snapshots(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<SnapshotItem>>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, config_id, change_type, action, detail, created_at, COALESCE(updated_at, created_at) as updated_at 
             FROM config_history 
             WHERE change_type IN ('auto_update', '自动更新', 'manual_rollback', '配置列表', '模板配置') 
             ORDER BY id DESC",
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("查询历史快照失败: {e}")))?;

    let list = stmt
        .query_map([], |row| {
            Ok(SnapshotItem {
                id: row.get(0)?,
                config_id: row.get(1)?,
                change_type: row.get(2)?,
                action: row.get(3)?,
                detail: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("遍历历史快照失败: {e}"),
            )
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("读取历史快照失败: {e}"),
            )
        })?;

    Ok(Json(list))
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
            "选定的快照未存储配置内容，无法回滚".to_string(),
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
        "回滚前自动备份 [{}] (回滚至快照 #{}: {})",
        target_profile.name, snapshot.id, snapshot.detail
    );
    let _ = db::log_history_with_config_id(
        &conn,
        Some(target_profile.id),
        "manual_rollback",
        "快照回滚前备份",
        &snap_desc,
        Some(&target_profile.content),
    );

    // 4. Overwrite config in configs table
    let latest_vcode = db::get_node_group_version_code(&conn).unwrap_or(0);
    conn.execute(
        "UPDATE configs SET content = ?, version_code = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
        rusqlite::params![snapshot_content, latest_vcode, target_profile.id],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("回滚配置数据库写入失败: {e}")))?;

    // 5. If this is the active running config, deploy to disk and reload if running
    if target_profile.is_running_config {
        let running_config_path = crate::service::SingBoxServiceManager::get_running_config_path();
        if let Some(parent) = running_config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&running_config_path, &snapshot_content);

        if state.service_manager.is_running().await
            && let Ok(parsed_val) = serde_json::from_str::<serde_json::Value>(&snapshot_content)
        {
            let _ = state
                .service_manager
                .restart_with_sudo(&parsed_val, None)
                .await;
        }
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": format!("已成功将配置 [{}] 回滚至快照 #{} ({})", target_profile.name, snapshot.id, now_str)
    })))
}
