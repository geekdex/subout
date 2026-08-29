use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Deserialize)]
pub struct DirQuery {
    pub path: Option<String>,
}

#[derive(Serialize)]
pub struct SystemInfoResponse {
    pub os: String,
    pub is_linux: bool,
}

pub async fn get_system_info(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SystemInfoResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let os = std::env::consts::OS.to_string();
    let is_linux = cfg!(target_os = "linux");
    Ok(Json(SystemInfoResponse { os, is_linux }))
}

#[derive(Serialize)]
pub struct DirResponse {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub subdirs: Vec<String>,
}

pub async fn get_system_dirs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<DirQuery>,
) -> Result<Json<DirResponse>, StatusCode> {
    check_auth(&state, &headers).await?;

    let path_str = query.path.unwrap_or_default();

    let current_dir = if path_str.trim().is_empty() {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")))
    } else {
        PathBuf::from(path_str)
    };

    let canonical_path = current_dir.to_string_lossy().into_owned();
    let parent_path = current_dir
        .parent()
        .map(|p| p.to_string_lossy().into_owned());

    let mut subdirs = Vec::new();
    if current_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&current_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        if let Some(name) = entry.file_name().to_str() {
                            if !name.starts_with('.') || name == ".config" {
                                subdirs.push(entry.path().to_string_lossy().into_owned());
                            }
                        }
                    }
                }
            }
        }
    }

    subdirs.sort();

    Ok(Json(DirResponse {
        current_path: canonical_path,
        parent_path,
        subdirs,
    }))
}

pub async fn initialize_db(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    crate::db::reset_db(&conn).map_err(|e| {
        eprintln!("[Error] Database reset failed: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Clear session token to log out the user, requiring them to log in with "admin"
    let mut guard = state.session_token.write().await;
    *guard = None;

    Ok(StatusCode::OK)
}

#[derive(Serialize)]
pub struct SystemModeResponse {
    pub app_mode: String,
    pub is_initialized: bool,
    pub os: String,
    pub arch: String,
    pub is_linux: bool,
    pub is_root: bool,
    pub kernel_installed: bool,
    pub kernel_version: Option<String>,
    pub service_running: bool,
    pub has_saved_sudo: bool,
}

#[derive(Deserialize)]
pub struct SetModeRequest {
    pub app_mode: String,
    pub restart_service: Option<bool>,
    pub sudo_pass: Option<String>,
}

pub async fn get_system_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SystemModeResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let app_mode = crate::db::get_setting(&conn, "app_mode")
        .unwrap_or(None)
        .unwrap_or_else(|| "simple".to_string());

    let is_initialized = crate::db::get_setting(&conn, "app_mode_initialized")
        .unwrap_or(None)
        .unwrap_or_default() == "true";

    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let is_linux = cfg!(target_os = "linux");
    let is_root = crate::service::is_running_as_root();

    let kernel_exec = crate::kernel::get_singbox_executable();
    let kernel_installed = kernel_exec.is_some();
    let kernel_version = kernel_exec
        .as_ref()
        .and_then(|p| crate::kernel::get_installed_kernel_version(p));

    let service_running = state.service_manager.is_running().await;
    let has_saved_sudo = state.service_manager.has_saved_sudo_pass().await;

    Ok(Json(SystemModeResponse {
        app_mode,
        is_initialized,
        os,
        arch,
        is_linux,
        is_root,
        kernel_installed,
        kernel_version,
        service_running,
        has_saved_sudo,
    }))
}

pub async fn set_system_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SetModeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path)
        .map_err(|s| (s, "数据库连接失败".to_string()))?;

    let target_mode = if payload.app_mode == "expert" {
        "expert"
    } else {
        "simple"
    };

    let current_mode = crate::db::get_setting(&conn, "app_mode")
        .unwrap_or(None)
        .unwrap_or_else(|| "simple".to_string());

    // 1. Generate target mode config to validate
    let target_config = crate::web::service_api::get_config_for_mode(&conn, target_mode)
        .map_err(|(code, msg)| (code, format!("目标模式配置生成失败: {}", msg)))?;

    // 2. Validate configuration with sing-box logic
    let log = target_config.get("log").cloned().unwrap_or_default();
    let dns = target_config.get("dns").cloned().unwrap_or_default();
    let inbounds = target_config.get("inbounds").cloned().unwrap_or_default();
    let outbounds = target_config.get("outbounds").cloned().unwrap_or_default();
    let route = target_config.get("route").cloned().unwrap_or_default();
    let experimental = target_config.get("experimental").cloned().unwrap_or_default();

    if let Err(err_msg) = crate::web::config::validate_config_with_singbox(
        &log,
        &dns,
        &inbounds,
        &outbounds,
        &route,
        &experimental,
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("目标模式配置校验未通过: {}", err_msg),
        ));
    }

    // 3. Update database settings
    crate::db::update_setting(&conn, "app_mode", target_mode)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("更新模式失败: {}", e)))?;
    crate::db::update_setting(&conn, "app_mode_initialized", "true")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("更新初始化状态失败: {}", e)))?;

    // 4. Handle service restart if requested or if service is currently running
    let is_running = state.service_manager.is_running().await;
    let should_restart = payload.restart_service.unwrap_or(false) || is_running;

    if should_restart && is_running {
        let sudo_pass = payload.sudo_pass.filter(|p| !p.trim().is_empty());
        if let Err(e) = state
            .service_manager
            .restart_with_sudo(&target_config, sudo_pass.as_deref())
            .await
        {
            // Rollback mode in database
            let _ = crate::db::update_setting(&conn, "app_mode", &current_mode);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("服务重载失败，已自动回滚为原模式: {}", e),
            ));
        }
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "app_mode": target_mode,
        "service_restarted": should_restart && is_running
    })))
}
