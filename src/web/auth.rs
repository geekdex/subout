use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use sha2::Digest;

use crate::db;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: Option<String>,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, StatusCode> {
    let input_password = payload.password.unwrap_or_default();

    let authenticated = match std::env::var("ADMIN_PASSWORD") {
        Ok(env_pw) => env_pw == input_password,
        Err(_) => {
            let conn = get_db_conn(&state.db_path)?;
            if let Ok(Some(stored_hash)) = db::get_setting(&conn, "password_hash") {
                let input_hash = db::hash_password(&input_password);
                stored_hash == input_hash
            } else {
                false
            }
        }
    };

    if authenticated {
        // Generate random session token
        let token = format!(
            "{:x}",
            sha2::Sha256::digest(format!("session-{}", rand_string()).as_bytes())
        );
        let mut guard = state.session_token.write().await;
        *guard = Some(token.clone());
        Ok(Json(LoginResponse { token }))
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

fn rand_string() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}", now)
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let mut guard = state.session_token.write().await;
    *guard = None;
    Ok(StatusCode::OK)
}

pub async fn auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: Option<String>,
    pub new_password: Option<String>,
}

pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;

    if std::env::var("ADMIN_PASSWORD").is_ok() {
        return Err(StatusCode::FORBIDDEN);
    }

    let conn = get_db_conn(&state.db_path)?;
    let stored_hash = db::get_setting(&conn, "password_hash")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let old_pw = payload.old_password.unwrap_or_default();
    let old_hash = db::hash_password(&old_pw);

    if stored_hash != old_hash {
        return Err(StatusCode::BAD_REQUEST);
    }

    let new_pw = payload.new_password.unwrap_or_default();
    if new_pw.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let new_hash = db::hash_password(&new_pw);
    db::update_setting(&conn, "password_hash", &new_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}
