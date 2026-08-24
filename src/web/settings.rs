use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Serialize;

use crate::web::{AppState, check_auth};

#[derive(Serialize)]
pub struct SettingsResponse {
    pub is_password_env_set: bool,
    pub has_sudo_pass: bool,
    pub os: String,
    pub is_linux: bool,
}

pub async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SettingsResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let is_password_env_set = std::env::var("ADMIN_PASSWORD").is_ok();
    let conn = crate::web::get_db_conn(&state.db_path)?;
    let sudo_pass = db::get_setting(&conn, "running_sudo_pass")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();
    let has_sudo_pass = !sudo_pass.is_empty();
    let os = std::env::consts::OS.to_string();
    let is_linux = cfg!(target_os = "linux");
    Ok(Json(SettingsResponse {
        is_password_env_set,
        has_sudo_pass,
        os,
        is_linux,
    }))
}

#[derive(Deserialize)]
pub struct SudoPasswordRequest {
    pub sudo_pass: String,
}

pub async fn save_sudo_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SudoPasswordRequest>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = crate::web::get_db_conn(&state.db_path)?;
    if payload.sudo_pass != "******" {
        db::update_setting(&conn, "running_sudo_pass", &payload.sudo_pass)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    Ok(StatusCode::OK)
}

use crate::auto_update;
use crate::db;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct AutoUpdateSettingsRequest {
    pub enabled: bool,
    pub interval: String,
    pub test_url: String,
    pub daily_time: Option<String>,
    pub pre_command: Option<String>,
}

pub async fn get_auto_update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = crate::web::get_db_conn(&state.db_path)?;

    let enabled = db::get_setting(&conn, "auto_update_enabled")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_else(|| "false".to_string())
        == "true";
    let interval = db::get_setting(&conn, "auto_update_interval")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_else(|| "12h".to_string());
    let test_url = db::get_setting(&conn, "auto_update_test_url")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_else(|| "http://www.gstatic.com/generate_204".to_string());
    let last_run = db::get_setting(&conn, "auto_update_last_run")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();
    let next_run = db::get_setting(&conn, "auto_update_next_run")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();
    let mut last_status = db::get_setting(&conn, "auto_update_last_status")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_else(|| "never".to_string());
    let mut last_log = db::get_setting(&conn, "auto_update_last_log")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();
    let daily_time = db::get_setting(&conn, "auto_update_daily_time")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_else(|| "04:00".to_string());
    let pre_command = db::get_setting(&conn, "auto_update_pre_command")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();

    if last_status == "running" {
        let last_run_secs: u64 = last_run.parse().unwrap_or(0);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .as_secs();
        if now >= last_run_secs + 600 {
            last_status = "failed".to_string();
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            last_log = format!(
                "{}\n[{}] 错误: 自动更新任务执行超时 (超过10分钟)，已自动重置状态。\n",
                last_log, timestamp
            );
            let _ = db::update_setting(&conn, "auto_update_last_status", &last_status);
            let _ = db::update_setting(&conn, "auto_update_last_log", &last_log);
        }
    }

    let running_config_id = db::get_setting(&conn, "running_config_id")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();

    Ok(Json(serde_json::json!({
        "enabled": enabled,
        "interval": interval,
        "test_url": test_url,
        "last_run": last_run,
        "next_run": next_run,
        "last_status": last_status,
        "last_log": last_log,
        "running_config_id": running_config_id,
        "daily_time": daily_time,
        "pre_command": pre_command,
    })))
}

pub async fn save_auto_update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AutoUpdateSettingsRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn = crate::web::get_db_conn(&state.db_path)
        .map_err(|status| (status, "数据库连接失败".to_string()))?;

    let daily_time_val = payload
        .daily_time
        .clone()
        .unwrap_or_else(|| "04:00".to_string());
    if payload.enabled && payload.interval == "daily" {
        let parts: Vec<&str> = daily_time_val.split(':').collect();
        if parts.len() != 2 || parts[0].parse::<u32>().is_err() || parts[1].parse::<u32>().is_err()
        {
            return Err((
                StatusCode::BAD_REQUEST,
                "时间格式必须为 HH:MM，如 04:00".to_string(),
            ));
        }
        let h = parts[0].parse::<u32>().unwrap();
        let m = parts[1].parse::<u32>().unwrap();
        if h > 23 || m > 59 {
            return Err((
                StatusCode::BAD_REQUEST,
                "小时数必须在 0-23 之间，分钟数必须在 0-59 之间".to_string(),
            ));
        }
    }

    let old_enabled = db::get_setting(&conn, "auto_update_enabled")
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "读取设置失败".to_string(),
            )
        })?
        .unwrap_or_else(|| "false".to_string())
        == "true";
    let old_interval = db::get_setting(&conn, "auto_update_interval")
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "读取设置失败".to_string(),
            )
        })?
        .unwrap_or_else(|| "12h".to_string());
    let old_daily_time = db::get_setting(&conn, "auto_update_daily_time")
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "读取设置失败".to_string(),
            )
        })?
        .unwrap_or_else(|| "04:00".to_string());
    let old_next_run = db::get_setting(&conn, "auto_update_next_run")
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "读取设置失败".to_string(),
            )
        })?
        .unwrap_or_default();

    db::update_setting(&conn, "auto_update_enabled", &payload.enabled.to_string()).map_err(
        |_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "更新设置失败".to_string(),
            )
        },
    )?;
    db::update_setting(&conn, "auto_update_interval", &payload.interval).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "更新设置失败".to_string(),
        )
    })?;
    db::update_setting(&conn, "auto_update_test_url", &payload.test_url).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "更新设置失败".to_string(),
        )
    })?;

    let pre_command_val = payload.pre_command.clone().unwrap_or_default();
    db::update_setting(&conn, "auto_update_daily_time", &daily_time_val).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "更新设置失败".to_string(),
        )
    })?;
    db::update_setting(&conn, "auto_update_pre_command", &pre_command_val).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "更新设置失败".to_string(),
        )
    })?;

    if payload.enabled {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "获取系统时间失败".to_string(),
                )
            })?
            .as_secs();

        let changed = !old_enabled
            || old_interval != payload.interval
            || (payload.interval == "daily" && old_daily_time != daily_time_val)
            || old_next_run.is_empty()
            || old_next_run.parse::<u64>().unwrap_or(0) == 0;

        if changed {
            let next_run = if payload.interval == "daily" {
                auto_update::calculate_next_daily_run(&daily_time_val).unwrap_or(now + 86400)
            } else {
                let interval_secs = match payload.interval.as_str() {
                    "1h" => 3600,
                    "6h" => 6 * 3600,
                    "12h" => 12 * 3600,
                    "24h" => 24 * 3600,
                    "48h" => 48 * 3600,
                    _ => 12 * 3600,
                };
                now + interval_secs
            };
            db::update_setting(&conn, "auto_update_next_run", &next_run.to_string()).map_err(
                |_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "更新下次运行时间失败".to_string(),
                    )
                },
            )?;
        }
    } else {
        db::update_setting(&conn, "auto_update_next_run", "").map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "清除下次运行时间失败".to_string(),
            )
        })?;
    }

    Ok(StatusCode::OK)
}

pub async fn trigger_auto_update(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    check_auth(&state, &headers).await?;

    println!("[AutoUpdate] Manually triggered update initiated (async)...");

    // Check if already running first with a timeout threshold
    let already_running = {
        let conn = crate::web::get_db_conn(&state.db_path)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let status = db::get_setting(&conn, "auto_update_last_status")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .unwrap_or_default();
        let last_run_str = db::get_setting(&conn, "auto_update_last_run")
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .unwrap_or_default();
        let last_run: u64 = last_run_str.parse().unwrap_or(0);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .as_secs();
        status == "running" && now < last_run + 600
    };
    if already_running {
        return Ok(Json(serde_json::json!({
            "status": "running",
            "message": "自动更新已经在运行中"
        })));
    }

    let db_path_clone = state.db_path.clone();
    tokio::spawn(async move {
        if let Err(e) = auto_update::run_auto_update_process(&db_path_clone).await {
            eprintln!("[AutoUpdate] Manually triggered update failed: {}", e);
        }
    });

    Ok(Json(serde_json::json!({
        "status": "triggered",
        "message": "已触发后台更新任务，请通过日志查看进度"
    })))
}
