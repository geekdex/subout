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
    pub host_os: String,
    pub host_arch: String,
    pub is_linux: bool,
    pub is_root: bool,
    pub sudo_configured: bool,
    pub has_temp_sudo: bool,
    pub permission_level: String,
    pub default_tun_stack: String,
    pub app_mode: String,
    pub running_config_id: Option<i64>,
    pub primary_lan_ip: Option<String>,
    pub lan_ips: Vec<String>,
}

/// Discovers LAN IPv4 addresses of the current host machine:
/// 1. Primary egress LAN IP via UDP route lookup to public DNS (no actual network packets transmitted).
/// 2. Additional local network interface IPv4 addresses on Unix/Linux (excluding loopback, link-local, broadcast).
pub fn discover_host_lan_ips() -> Vec<String> {
    let mut ips = Vec::new();

    // 1. Primary active route lookup via UDP connect
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        let targets = ["223.5.5.5:80", "1.1.1.1:80", "114.114.114.114:80"];
        for target in targets {
            if socket.connect(target).is_ok()
                && let Ok(local_addr) = socket.local_addr()
            {
                let ip = local_addr.ip();
                if !ip.is_loopback() && !ip.is_unspecified() {
                    let s = ip.to_string();
                    if !ips.contains(&s) {
                        ips.push(s);
                    }
                    break;
                }
            }
        }
    }

    // 2. Discover additional network interfaces on Unix/Linux via `ip -4 -o addr show`
    #[cfg(unix)]
    {
        if let Ok(output) = std::process::Command::new("ip")
            .args(["-4", "-o", "addr", "show"])
            .output()
            && output.status.success()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(pos) = parts.iter().position(|&p| p == "inet")
                    && let Some(cidr) = parts.get(pos + 1)
                    && let Some((ip_str, _)) = cidr.split_once('/')
                    && let Ok(ip) = ip_str.parse::<std::net::Ipv4Addr>()
                    && !ip.is_loopback()
                    && !ip.is_link_local()
                    && !ip.is_broadcast()
                    && !ip.is_documentation()
                {
                    let s = ip.to_string();
                    if !ips.contains(&s) {
                        ips.push(s);
                    }
                }
            }
        }
    }

    ips
}

pub async fn get_system_info(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SystemInfoResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let platform = crate::platform::current_platform();
    let os = platform.os_name().to_string();
    let host_os = os.clone();
    let host_arch = std::env::consts::ARCH.to_string();
    let is_linux = platform.is_linux();
    let lan_ips = discover_host_lan_ips();
    let primary_lan_ip = lan_ips.first().cloned();

    let is_root = platform.is_running_as_root();
    let sudo_configured = state.service_manager.has_saved_sudo_pass().await;
    let has_temp_sudo = state.service_manager.has_temp_sudo_pass().await;
    let permission_level = if is_root {
        "root".to_string()
    } else if sudo_configured {
        "admin".to_string()
    } else {
        "limited".to_string()
    };
    let default_tun_stack = "system".to_string();

    let (app_mode, running_config_id) = if let Ok(conn) = get_db_conn(&state.db_path) {
        let mode = crate::db::get_setting(&conn, "app_mode")
            .unwrap_or(None)
            .unwrap_or_else(|| "simple".to_string());
        let rc_id = crate::db::get_setting(&conn, "running_config_id")
            .unwrap_or(None)
            .and_then(|s| s.parse::<i64>().ok());
        (mode, rc_id)
    } else {
        ("simple".to_string(), None)
    };

    Ok(Json(SystemInfoResponse {
        os,
        host_os,
        host_arch,
        is_linux,
        is_root,
        sudo_configured,
        has_temp_sudo,
        permission_level,
        default_tun_stack,
        app_mode,
        running_config_id,
        primary_lan_ip,
        lan_ips,
    }))
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
        std::env::var("HOME").map_or_else(
            |_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")),
            PathBuf::from,
        )
    } else {
        PathBuf::from(path_str)
    };

    let canonical_path = current_dir.to_string_lossy().into_owned();
    let parent_path = current_dir
        .parent()
        .map(|p| p.to_string_lossy().into_owned());

    let mut subdirs = Vec::new();
    if current_dir.is_dir()
        && let Ok(entries) = std::fs::read_dir(&current_dir)
    {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type()
                && file_type.is_dir()
                && let Some(name) = entry.file_name().to_str()
                && (!name.starts_with('.') || name == ".config")
            {
                subdirs.push(entry.path().to_string_lossy().into_owned());
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
        eprintln!("[Error] Database reset failed: {e}");
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
    #[serde(alias = "mode")]
    pub app_mode: String,
    #[serde(alias = "restart")]
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
        .unwrap_or_default()
        == "true";

    let platform = crate::platform::current_platform();
    let os = platform.os_name().to_string();
    let arch = std::env::consts::ARCH.to_string();
    let is_linux = platform.is_linux();
    let is_root = platform.is_running_as_root();

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

/// Maps a config validation outcome to an advisory warning. A failed validation must
/// never abort a mode switch.
fn mode_config_warning(validation: Result<(), String>) -> Option<String> {
    validation
        .err()
        .map(|err_msg| format!("目标模式配置校验未通过: {err_msg}"))
}

/// Generates and validates the target mode's configuration.
///
/// Config problems are returned as a warning, never as an error: switching modes is a
/// preference change. Blocking it on an invalid config locks the user out of the target
/// mode, leaving no way to enter it and repair the broken config.
fn check_mode_config(
    conn: &rusqlite::Connection,
    target_mode: &str,
) -> (Option<serde_json::Value>, Option<String>) {
    let target_config = match crate::web::service_api::get_config_for_mode(conn, target_mode) {
        Ok(config) => config,
        Err((_, msg)) => {
            return (None, Some(format!("目标模式配置生成失败: {msg}")));
        }
    };

    let log = target_config.get("log").cloned().unwrap_or_default();
    let dns = target_config.get("dns").cloned().unwrap_or_default();
    let inbounds = target_config.get("inbounds").cloned().unwrap_or_default();
    let outbounds = target_config.get("outbounds").cloned().unwrap_or_default();
    let route = target_config.get("route").cloned().unwrap_or_default();
    let experimental = target_config
        .get("experimental")
        .cloned()
        .unwrap_or_default();
    let http_clients = target_config.get("http_clients");

    let warning = mode_config_warning(crate::web::config::validate_config_with_singbox(
        &log,
        &dns,
        &inbounds,
        &outbounds,
        &route,
        &experimental,
        http_clients,
    ));

    (Some(target_config), warning)
}

pub async fn set_system_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SetModeRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let mode_lower = payload.app_mode.trim().to_lowercase();
    let target_mode = if mode_lower == "expert" || mode_lower == "logical" {
        "expert"
    } else {
        "simple"
    };

    // 1. Generate & validate the target config (advisory only, never blocks the switch)
    let (target_config, mut config_warning) = check_mode_config(&conn, target_mode);
    let config_valid = config_warning.is_none();

    // 2. Lifecycle control: if service is currently running, gracefully stop it first to release TUN/proxy
    let was_running = state.service_manager.is_running().await;
    if was_running {
        state.service_manager.stop().await.map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("模式切换前优雅停止旧服务失败: {e}"),
            )
        })?;
    }

    // 3. Always persist the mode, even when the target config is invalid, so the user
    //    can enter that mode and fix the config from the UI.
    crate::db::update_setting(&conn, "app_mode", target_mode).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("更新模式失败: {e}"),
        )
    })?;
    crate::db::update_setting(&conn, "app_mode_initialized", "true").map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("更新初始化状态失败: {e}"),
        )
    })?;

    // 4. Restart only when requested and when the config is usable. Never restart with
    //    an invalid config, and never roll back the mode (that would recreate the lockout).
    let should_restart = payload.restart_service.unwrap_or(false);
    let mut service_restarted = false;
    if should_restart {
        if let Some(config) = target_config.as_ref().filter(|_| config_valid) {
            let sudo_pass = payload.sudo_pass.filter(|p| !p.trim().is_empty());
            match state
                .service_manager
                .start_with_options(config, sudo_pass.as_deref(), false, None)
                .await
            {
                Ok(()) => service_restarted = true,
                Err(e) => {
                    let reason = format!("模式切换后启动新服务失败: {e}");
                    config_warning = Some(match config_warning.take() {
                        Some(prev) => format!("{prev}；{reason}"),
                        None => reason,
                    });
                }
            }
        } else {
            let reason = config_warning
                .clone()
                .unwrap_or_else(|| "目标模式配置不可用".to_string());
            config_warning = Some(format!("{reason}；已跳过自动启动服务，请先修正配置"));
        }
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "app_mode": target_mode,
        "config_valid": config_valid,
        "config_warning": config_warning,
        "service_restarted": service_restarted,
        "service_previously_running": was_running
    })))
}

#[derive(Serialize, Deserialize)]
pub struct SiteProbeRequest {
    pub url: String,
    pub timeout_ms: Option<u64>,
}

#[derive(Serialize)]
pub struct SiteProbeResponse {
    pub url: String,
    pub latency_ms: Option<u64>,
    pub status_code: Option<u16>,
    pub success: bool,
    pub error: Option<String>,
}

/// Directly tests site reachability from the host server.
/// Works reliably whether proxy is running (TUN or mixed) or completely stopped.
pub async fn probe_site_connectivity(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SiteProbeRequest>,
) -> Result<Json<SiteProbeResponse>, StatusCode> {
    check_auth(&state, &headers).await?;

    let mut url = payload.url.trim().to_string();
    if url.is_empty() {
        return Ok(Json(SiteProbeResponse {
            url,
            latency_ms: None,
            status_code: None,
            success: false,
            error: Some("网址不能为空".to_string()),
        }));
    }

    if !url.starts_with("http://") && !url.starts_with("https://") {
        url = format!("https://{url}");
    }

    let timeout_duration =
        std::time::Duration::from_millis(payload.timeout_ms.unwrap_or(5000).clamp(1000, 10000));
    let direct_timeout = std::time::Duration::from_millis(2500);
    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    let service_status = state.service_manager.get_status().await;
    let mixed_port = service_status.mixed_port.unwrap_or(2080);

    // Detect if the local mixed port is actually listening
    let is_local_mixed_port_open = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], mixed_port)),
        std::time::Duration::from_millis(100),
    )
    .is_ok();

    // 1. Direct / system routing attempt
    let try_direct_client = reqwest::Client::builder()
        .no_proxy()
        .user_agent(user_agent)
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(direct_timeout)
        .build();

    let start = std::time::Instant::now();
    let mut last_err = None;
    if let Ok(client) = try_direct_client {
        match client.get(&url).send().await {
            Ok(resp) => {
                let elapsed = start.elapsed().as_millis() as u64;
                let status = resp.status().as_u16();
                let success = status < 400 || status == 403 || status == 405 || status == 429;
                return Ok(Json(SiteProbeResponse {
                    url,
                    latency_ms: Some(elapsed),
                    status_code: Some(status),
                    success,
                    error: None,
                }));
            }
            Err(e) => {
                last_err = Some(e.to_string());
            }
        }
    }

    // 2. If direct attempt failed and local mixed proxy is open,
    // probe via the active local mixed proxy
    if is_local_mixed_port_open {
        let proxy_url = format!("http://127.0.0.1:{mixed_port}");
        if let Ok(proxy) = reqwest::Proxy::all(&proxy_url)
            && let Ok(client) = reqwest::Client::builder()
                .no_proxy()
                .proxy(proxy)
                .user_agent(user_agent)
                .redirect(reqwest::redirect::Policy::limited(10))
                .timeout(timeout_duration)
                .build()
        {
            let proxy_start = std::time::Instant::now();
            match client.get(&url).send().await {
                Ok(resp) => {
                    let elapsed = proxy_start.elapsed().as_millis() as u64;
                    let status = resp.status().as_u16();
                    let success = status < 400 || status == 403 || status == 405 || status == 429;
                    return Ok(Json(SiteProbeResponse {
                        url,
                        latency_ms: Some(elapsed),
                        status_code: Some(status),
                        success,
                        error: None,
                    }));
                }
                Err(e) => {
                    last_err = Some(e.to_string());
                }
            }
        }
    }

    Ok(Json(SiteProbeResponse {
        url,
        latency_ms: None,
        status_code: None,
        success: false,
        error: Some(last_err.unwrap_or_else(|| "网络请求超时或连接失败".to_string())),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discover_host_lan_ips_format() {
        let ips = discover_host_lan_ips();
        for ip in &ips {
            assert!(ip.parse::<std::net::Ipv4Addr>().is_ok());
            assert!(!ip.starts_with("127."));
        }
    }

    #[test]
    fn test_site_probe_request_response_serde() {
        let req = SiteProbeRequest {
            url: "https://www.baidu.com".to_string(),
            timeout_ms: Some(3000),
        };
        let json_val = serde_json::to_value(&req).unwrap();
        assert_eq!(json_val["url"], "https://www.baidu.com");
        assert_eq!(json_val["timeout_ms"], 3000);

        let resp = SiteProbeResponse {
            url: "https://www.baidu.com".to_string(),
            latency_ms: Some(25),
            status_code: Some(200),
            success: true,
            error: None,
        };
        let resp_json = serde_json::to_value(&resp).unwrap();
        assert_eq!(resp_json["latency_ms"], 25);
        assert_eq!(resp_json["success"], true);
    }

    #[test]
    fn test_mode_config_warning_never_blocks_switch() {
        assert_eq!(mode_config_warning(Ok(())), None);
        assert_eq!(
            mode_config_warning(Err("存在未知字段 query_type".to_string())),
            Some("目标模式配置校验未通过: 存在未知字段 query_type".to_string())
        );
    }

    #[test]
    fn test_probe_client_builder() {
        let proxy_url = "http://127.0.0.1:2080";
        let proxy = reqwest::Proxy::all(proxy_url).unwrap();
        let client = reqwest::Client::builder()
            .no_proxy()
            .proxy(proxy)
            .timeout(std::time::Duration::from_millis(5000))
            .build();
        assert!(client.is_ok());
    }
}
