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
}

pub async fn get_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SettingsResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let is_password_env_set = std::env::var("ADMIN_PASSWORD").is_ok();
    Ok(Json(SettingsResponse {
        is_password_env_set,
    }))
}
