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
pub mod nodes;
pub mod settings;
pub mod subscriptions;
pub mod system;

#[derive(Clone)]
pub struct AppState {
    pub db_path: String,
    pub session_token: Arc<RwLock<Option<String>>>,
}

pub async fn run_server(port_opt: Option<u16>) -> Result<(), Box<dyn std::error::Error>> {
    // Determine database path and port
    let mut db_path = "subout.db".to_string();
    if let Some(mut config_dir) = dirs::config_dir() {
        config_dir.push("subout");
        if let Err(e) = std::fs::create_dir_all(&config_dir) {
            eprintln!(
                "[Warning] Failed to create config directory {:?}: {}",
                config_dir, e
            );
        } else {
            let target_path = config_dir.join("subout.db");
            if !target_path.exists() {
                if std::path::Path::new("subout.db").exists() {
                    if let Err(e) = std::fs::rename("subout.db", &target_path) {
                        eprintln!(
                            "[Warning] Failed to migrate local database to {:?}: {}",
                            target_path, e
                        );
                    } else {
                        println!(
                            "[Info] Migrated local subout.db to user config directory: {:?}",
                            target_path
                        );
                    }
                } else if std::path::Path::new("singbox_auto.db").exists() {
                    if let Err(e) = std::fs::rename("singbox_auto.db", &target_path) {
                        eprintln!(
                            "[Warning] Failed to migrate old singbox_auto.db to {:?}: {}",
                            target_path, e
                        );
                    } else {
                        println!(
                            "[Info] Migrated old singbox_auto.db to user config directory: {:?}",
                            target_path
                        );
                    }
                }
            }
            db_path = target_path.to_string_lossy().to_string();
        }
    } else {
        // Fallback to local program directory if dirs::config_dir() is None
        if !std::path::Path::new(&db_path).exists()
            && std::path::Path::new("singbox_auto.db").exists()
        {
            if let Err(e) = std::fs::rename("singbox_auto.db", &db_path) {
                eprintln!(
                    "[Warning] Failed to rename old database from singbox_auto.db to subout.db: {}",
                    e
                );
            } else {
                println!("[Info] Migrated database file from singbox_auto.db to subout.db");
            }
        }
    }

    // Initialize database
    let _conn = db::init_db(&db_path)?;
    println!("[Init] Database initialized at: {}", db_path);

    // Port will be determined during server binding

    let state = AppState {
        db_path,
        session_token: Arc::new(RwLock::new(None)),
    };

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
        // System path autocomplete
        .route("/api/system/dirs", get(system::get_system_dirs))
        .route("/api/system/initialize", post(system::initialize_db))
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
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::AddrInUse {
                        println!("[Warning] Port {} is in use, trying next port...", try_port);
                    } else {
                        println!(
                            "[Warning] Failed to bind to port {}: {}, trying next port...",
                            try_port, e
                        );
                    }
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

    axum::serve(listener, app).await?;
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
