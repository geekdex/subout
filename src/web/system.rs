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
