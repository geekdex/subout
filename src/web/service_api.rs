use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::Value;

use crate::db;
use crate::generator;
use crate::service::ServiceStatusInfo;
use crate::simple_config;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Deserialize)]
pub struct StartServiceRequest {
    pub config: Option<Value>,
    pub sudo_pass: Option<String>,
}

#[derive(Deserialize)]
pub struct KillExternalProcessRequest {
    pub pid: u32,
    pub sudo_pass: Option<String>,
}

pub async fn get_service_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ServiceStatusInfo>, StatusCode> {
    check_auth(&state, &headers).await?;
    let status = state.service_manager.get_status().await;
    Ok(Json(status))
}

pub async fn kill_external_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<KillExternalProcessRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let sudo_pass = payload.sudo_pass.filter(|p| !p.trim().is_empty());

    state
        .service_manager
        .kill_external_process(payload.pid, sudo_pass.as_deref())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("终止外部进程失败: {}", e),
            )
        })?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": format!("已成功终止外部进程 (PID: {})", payload.pid)
    })))
}

pub async fn start_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Option<StartServiceRequest>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let (config_val, custom_sudo_pass) = if let Some(req) = payload {
        let conf = if let Some(c) = req.config {
            c
        } else {
            get_active_config_for_mode(&conn)?
        };
        (conf, req.sudo_pass)
    } else {
        (get_active_config_for_mode(&conn)?, None)
    };

    let sudo_pass = custom_sudo_pass.filter(|p| !p.trim().is_empty());

    state
        .service_manager
        .start_with_sudo(&config_val, sudo_pass.as_deref())
        .await
        .map_err(|e| {
            let err_str = e.to_string();
            if err_str.contains("外部 sing-box 进程正在运行") {
                (StatusCode::CONFLICT, format!("启动服务失败: {}", err_str))
            } else {
                (
                    StatusCode::BAD_REQUEST,
                    format!("启动服务失败: {}", err_str),
                )
            }
        })?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "sing-box 服务已成功启动"
    })))
}

pub async fn stop_service(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    state.service_manager.stop().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("停止服务失败: {}", e),
        )
    })?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "sing-box 服务已停止"
    })))
}

pub async fn restart_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Option<StartServiceRequest>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let (config_val, custom_sudo_pass) = if let Some(req) = payload {
        let conf = if let Some(c) = req.config {
            c
        } else {
            get_active_config_for_mode(&conn)?
        };
        (conf, req.sudo_pass)
    } else {
        (get_active_config_for_mode(&conn)?, None)
    };

    let sudo_pass = custom_sudo_pass.filter(|p| !p.trim().is_empty());

    state
        .service_manager
        .restart_with_sudo(&config_val, sudo_pass.as_deref())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("重启服务失败: {}", e),
            )
        })?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "sing-box 服务已重启"
    })))
}

pub async fn get_service_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<String>>, StatusCode> {
    check_auth(&state, &headers).await?;
    let logs = state.service_manager.get_logs().await;
    Ok(Json(logs))
}

pub async fn clear_service_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    state.service_manager.clear_logs().await;
    Ok(StatusCode::OK)
}

pub fn get_config_for_mode(
    conn: &rusqlite::Connection,
    mode: &str,
) -> Result<Value, (StatusCode, String)> {
    if mode == "simple" {
        let simple_cfg = simple_config::get_saved_simple_config(conn);
        simple_config::generate_simple_singbox_config(conn, &simple_cfg).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("生成简单配置失败: {}", e),
            )
        })
    } else {
        // In expert mode, check if running_config_id is set
        let running_id_str = db::get_setting(conn, "running_config_id")
            .unwrap_or(None)
            .unwrap_or_default();

        if let Ok(id) = running_id_str.parse::<i64>() {
            if let Ok(Some(history)) = db::get_config_history_detail(conn, id) {
                if let Some(content_str) = history.content {
                    if let Ok(c) = serde_json::from_str::<Value>(&content_str) {
                        let log = c.get("log").cloned().unwrap_or(serde_json::json!({}));
                        let dns = c.get("dns").cloned().unwrap_or(serde_json::json!({}));
                        let inbounds = c.get("inbounds").cloned().unwrap_or(serde_json::json!([]));
                        let outbounds =
                            c.get("outbounds").cloned().unwrap_or(serde_json::json!([]));
                        let route = c.get("route").cloned().unwrap_or(serde_json::json!({}));
                        let experimental = c
                            .get("experimental")
                            .cloned()
                            .unwrap_or(serde_json::json!({}));
                        return generator::generate_config_with_base(
                            conn,
                            log,
                            dns,
                            inbounds,
                            outbounds,
                            route,
                            experimental,
                        )
                        .map_err(|e| {
                            (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                format!("生成配置失败: {}", e),
                            )
                        });
                    }
                }
            }
        }

        generator::generate_config(conn).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("生成配置失败: {}", e),
            )
        })
    }
}

pub fn get_active_config_for_mode(
    conn: &rusqlite::Connection,
) -> Result<Value, (StatusCode, String)> {
    let mode = db::get_setting(conn, "app_mode")
        .unwrap_or(None)
        .unwrap_or_else(|| "simple".to_string());
    get_config_for_mode(conn, &mode)
}
