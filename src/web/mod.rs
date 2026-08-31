use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Html,
    routing::{get, post, put},
};
use rusqlite::Connection;
use serde::Serialize;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

use crate::db;

pub mod auth;
pub mod config;
pub mod groups;
pub mod kernel_api;
pub mod nodes;
pub mod service_api;
pub mod settings;
pub mod simple_api;
pub mod subscriptions;
pub mod system;

#[derive(Clone)]
pub struct AppState {
    pub db_path: String,
    pub session_token: Arc<RwLock<Option<String>>>,
    pub kernel_download_status: Arc<RwLock<crate::kernel::KernelDownloadStatus>>,
    pub kernel_download_cancel: Arc<std::sync::atomic::AtomicBool>,
    pub service_manager: Arc<crate::service::SingBoxServiceManager>,
}

pub async fn run_server(port_opt: Option<u16>) -> Result<(), Box<dyn std::error::Error>> {
    // Determine database path and ensure directories
    let db_path_buf = crate::paths::AppPaths::get().initialize_db_path()?;
    let db_path = db_path_buf.to_string_lossy().to_string();

    // Initialize database
    let _conn = db::init_db(&db_path)?;
    println!("[Init] Database initialized at: {}", db_path);

    // Reset auto_update_last_status to failed if it was left as running due to a crash/restart
    if let Ok(Some(status)) = db::get_setting(&_conn, "auto_update_last_status") {
        if status == "running" {
            let _ = db::update_setting(&_conn, "auto_update_last_status", "failed");
            let existing_log = db::get_setting(&_conn, "auto_update_last_log")
                .unwrap_or_default()
                .unwrap_or_default();
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let new_log = format!(
                "{}\n[{}] 提示: 系统重启，终止了上次运行中可能被中断的自动更新任务。\n",
                existing_log, timestamp
            );
            let _ = db::update_setting(&_conn, "auto_update_last_log", &new_log);
        }
    }

    let service_manager = Arc::new(crate::service::SingBoxServiceManager::new());
    service_manager.set_db_path(&db_path).await;
    service_manager.load_saved_sudo_pass().await;

    let state = AppState {
        db_path: db_path.clone(),
        session_token: Arc::new(RwLock::new(None)),
        kernel_download_status: Arc::new(RwLock::new(crate::kernel::KernelDownloadStatus::default())),
        kernel_download_cancel: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        service_manager,
    };

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    let db_path_clone = db_path.clone();
    let service_mgr_clone = state.service_manager.clone();
    let service_mgr_for_shutdown = state.service_manager.clone();
    let mut auto_update_rx = shutdown_rx.clone();
    tokio::spawn(async move {
        println!("[AutoUpdate] Background checker task started.");
        // Check immediately on startup to catch up any missed tasks (e.g. due to system crash/shutdown)
        if let Err(e) = crate::auto_update::check_and_run_auto_update(&db_path_clone, Some(service_mgr_clone.clone())).await {
            eprintln!("[AutoUpdate] Background check error on startup: {}", e);
        }
        loop {
            tokio::select! {
                _ = auto_update_rx.changed() => {
                    break;
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(60)) => {
                    if let Err(e) = crate::auto_update::check_and_run_auto_update(&db_path_clone, Some(service_mgr_clone.clone())).await {
                        eprintln!("[AutoUpdate] Background check error: {}", e);
                    }
                }
            }
        }
    });

    let app = Router::new()
        // Front-end UI
        .route("/", get(serve_ui))
        // Dashboard Stats
        .route("/api/dashboard/stats", get(get_dashboard_stats))
        // Auth APIs
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/status", get(auth::auth_status))
        .route("/api/auth/change-password", post(auth::change_password))
        // Settings APIs
        .route("/api/settings", get(settings::get_settings))
        .route("/api/settings/sudo", post(settings::save_sudo_password))
        .route(
            "/api/settings/auto-update",
            get(settings::get_auto_update_settings).post(settings::save_auto_update_settings),
        )
        .route(
            "/api/settings/auto-update/trigger",
            post(settings::trigger_auto_update),
        )
        // Subscriptions
        .route(
            "/api/subscriptions",
            get(subscriptions::get_subscriptions).post(subscriptions::add_subscription),
        )
        .route(
            "/api/subscriptions/:id",
            put(subscriptions::update_subscription).delete(subscriptions::delete_subscription),
        )
        .route(
            "/api/subscriptions/batch-delete",
            post(subscriptions::batch_delete_subscriptions),
        )
        .route(
            "/api/subscriptions/fetch",
            post(subscriptions::fetch_subscriptions),
        )
        // Node Pool
        .route(
            "/api/nodes",
            get(nodes::get_nodes).post(nodes::add_custom_node),
        )
        .route(
            "/api/nodes/:id",
            put(nodes::update_node).delete(nodes::delete_node),
        )
        .route("/api/nodes/batch-delete", post(nodes::batch_delete_nodes))
        .route("/api/nodes/ping", post(nodes::ping_nodes))
        .route("/api/nodes/site-test", post(nodes::test_site_reachability))
        // Outbound Groups
        .route(
            "/api/groups",
            get(groups::get_groups).post(groups::add_group),
        )
        .route(
            "/api/groups/batch-delete",
            post(groups::batch_delete_groups),
        )
        .route(
            "/api/groups/:id",
            put(groups::update_group).delete(groups::delete_group),
        )
        .route("/api/groups/:id/sync", post(groups::sync_group))
        // Configuration
        .route(
            "/api/config/base",
            get(config::get_base_config).post(config::save_base_config),
        )
        .route("/api/config/base/full", post(config::save_full_config))
        .route(
            "/api/config/running",
            get(config::get_running_config).post(config::save_running_config),
        )
        .route(
            "/api/config/generated",
            get(config::get_generated_config).post(config::post_generated_config),
        )
        .route("/api/config/validate", post(config::validate_full_config))
        .route(
            "/api/config/history",
            get(config::get_history).post(config::create_history_config),
        )
        .route(
            "/api/config/history/:id",
            get(config::get_history_detail)
                .put(config::update_history_config)
                .delete(config::delete_history_config),
        )
        .route(
            "/api/config/history/:id/restore",
            post(config::restore_history_config),
        )
        .route("/api/config/history/clear", post(config::clear_history))
        .route("/api/config/schemas", get(config::get_config_schemas))
        .route("/api/config/schemas/ui", get(config::get_schema_ui_meta))
        // System path & mode
        .route("/api/system/info", get(system::get_system_info))
        .route(
            "/api/system/mode",
            get(system::get_system_mode).post(system::set_system_mode),
        )
        .route("/api/system/dirs", get(system::get_system_dirs))
        .route("/api/system/initialize", post(system::initialize_db))
        // Kernel Management APIs
        .route("/api/kernel/info", get(kernel_api::get_kernel_info))
        .route("/api/kernel/status", get(kernel_api::get_kernel_status))
        .route("/api/kernel/download", post(kernel_api::download_kernel))
        .route("/api/kernel/cancel", post(kernel_api::cancel_download))
        // Integrated Service Management APIs
        .route("/api/service/status", get(service_api::get_service_status))
        .route("/api/service/start", post(service_api::start_service))
        .route("/api/service/stop", post(service_api::stop_service))
        .route("/api/service/restart", post(service_api::restart_service))
        .route("/api/service/kill-external", post(service_api::kill_external_service))
        .route(
            "/api/service/logs",
            get(service_api::get_service_logs).delete(service_api::clear_service_logs),
        )
        .route(
            "/api/service/logs/clear",
            post(service_api::clear_service_logs),
        )
        // Simple Mode Configuration APIs
        .route(
            "/api/simple-config",
            get(simple_api::get_simple_config).post(simple_api::save_simple_config),
        )
        .route(
            "/api/simple-config/preview",
            post(simple_api::preview_simple_config),
        )
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Determine if port is explicitly configured
    let mut configured_port = None;
    if let Some(p) = port_opt {
        configured_port = Some(p);
    } else if let Ok(port_env) = std::env::var("PORT") {
        if let Ok(p) = port_env.parse::<u16>() {
            configured_port = Some(p);
        } else {
            return Err(format!(
                "Error: Invalid port number '{}' in PORT environment variable.",
                port_env
            )
            .into());
        }
    }

    let listener = if let Some(p) = configured_port {
        let addr = SocketAddr::from(([0, 0, 0, 0], p));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => {
                println!("[Server] Subout Panel running on http://localhost:{}", p);
                l
            }
            Err(e) => {
                return Err(format!("Failed to bind to configured port {}: {}", p, e).into());
            }
        }
    } else {
        let mut bind_result = None;
        for i in 0..=10 {
            let try_port = 1234 + i;
            let addr = SocketAddr::from(([0, 0, 0, 0], try_port));
            match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => {
                    println!(
                        "[Server] Subout Panel running on http://localhost:{}",
                        try_port
                    );
                    bind_result = Some(l);
                    break;
                }
                Err(_) => {
                    // Port is occupied, continue probing next port
                }
            }
        }
        if let Some(l) = bind_result {
            l
        } else {
            return Err(
                "错误: 默认端口 1234 到 1244 均已被占用。请手动使用 PORT 环境变量设置可用端口。"
                    .into(),
            );
        }
    };

    let shutdown_signal_rx = shutdown_rx.clone();
    let shutdown_signal = async move {
        let ctrl_c = async {
            tokio::signal::ctrl_c()
                .await
                .expect("failed to install Ctrl+C handler");
        };

        #[cfg(unix)]
        let terminate = async {
            if let Ok(mut sig) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
                sig.recv().await;
            } else {
                std::future::pending::<()>().await;
            }
        };

        #[cfg(not(unix))]
        let terminate = std::future::pending::<()>();

        tokio::select! {
            _ = ctrl_c => {},
            _ = terminate => {},
        }

        println!("\n[Server] 正在停止服务并安全退出... (再次按 Ctrl+C 强制退出)");
        let _ = shutdown_tx.send(true);

        // Spawn listener for secondary Ctrl+C to force immediate quit
        tokio::spawn(async {
            tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
            if tokio::signal::ctrl_c().await.is_ok() {
                eprintln!("\n[Server] 收到强制中断信号，立即终止进程。");
                std::process::exit(130);
            }
        });

        let _ = service_mgr_for_shutdown.stop().await;
    };

    let mut shutdown_exit_rx = shutdown_signal_rx.clone();
    let serve_future = axum::serve(listener, app).with_graceful_shutdown(shutdown_signal);

    tokio::select! {
        res = serve_future => {
            if let Err(e) = res {
                eprintln!("[Server] Web server error: {}", e);
            }
        }
        _ = async {
            let _ = shutdown_exit_rx.changed().await;
            // Allow up to 300ms for active HTTP connections to flush before exiting
            tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        } => {}
    }

    println!("[Server] 服务已安全关闭。");
    Ok(())
}

// Database Connection Helper
pub fn get_db_conn(db_path: &str) -> Result<Connection, StatusCode> {
    let conn = Connection::open(db_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(conn)
}

// Auth Helper
pub async fn check_auth(state: &AppState, headers: &HeaderMap) -> Result<(), StatusCode> {
    let Some(auth_header) = headers.get("Authorization") else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let Ok(auth_str) = auth_header.to_str() else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    if !auth_str.starts_with("Bearer ") {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let token = &auth_str[7..];
    let guard = state.session_token.read().await;
    if let Some(ref active_token) = *guard {
        if active_token == token {
            return Ok(());
        }
    }
    Err(StatusCode::UNAUTHORIZED)
}

// UI Handler
async fn serve_ui() -> Html<&'static str> {
    Html(include_str!("../../web/dist/index.html"))
}

// Dashboard Handlers
#[derive(Serialize)]
pub struct DashboardStats {
    pub subs: i64,
    pub nodes: i64,
    pub groups: i64,
}

async fn get_dashboard_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DashboardStats>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let subs: i64 = conn
        .query_row("SELECT COUNT(*) FROM subscriptions", [], |r| r.get(0))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let nodes: i64 = conn
        .query_row("SELECT COUNT(*) FROM nodes", [], |r| r.get(0))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let groups: i64 = conn
        .query_row("SELECT COUNT(*) FROM outbound_groups", [], |r| r.get(0))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(DashboardStats {
        subs,
        nodes,
        groups,
    }))
}
