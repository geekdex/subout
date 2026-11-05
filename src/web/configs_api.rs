use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};

use crate::db;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Deserialize)]
pub struct ConfigsQuery {
    pub platform: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateConfigRequest {
    pub name: String,
    pub platform: String,
    pub description: Option<String>,
    #[serde(alias = "config_json")]
    pub content: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateConfigRequest {
    pub name: String,
    pub platform: Option<String>,
    pub description: Option<String>,
    #[serde(alias = "config_json")]
    pub content: String,
}

#[derive(Deserialize)]
pub struct SetRunningConfigRequest {
    pub id: i64,
}

#[derive(Serialize)]
pub struct ConfigProfileResponse {
    pub id: i64,
    pub name: String,
    pub platform: String,
    pub description: Option<String>,
    pub token: String,
    pub version_code: i64,
    pub content: String,
    pub config_json: String,
    pub is_running_config: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl From<db::ConfigProfile> for ConfigProfileResponse {
    fn from(p: db::ConfigProfile) -> Self {
        Self {
            id: p.id,
            name: p.name,
            platform: p.platform,
            description: p.description,
            token: p.token,
            version_code: p.version_code,
            config_json: p.content.clone(),
            content: p.content,
            is_running_config: p.is_running_config,
            created_at: p.created_at,
            updated_at: p.updated_at,
        }
    }
}

pub async fn list_configs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ConfigsQuery>,
) -> Result<Json<Vec<ConfigProfileResponse>>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let profiles = db::get_config_profiles(&conn, query.platform.as_deref()).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("获取配置列表失败: {e}"),
        )
    })?;

    Ok(Json(profiles.into_iter().map(Into::into).collect()))
}

pub async fn create_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateConfigRequest>,
) -> Result<Json<ConfigProfileResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let name = payload.name.trim();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "配置名称不能为空".to_string()));
    }

    let platform = payload.platform.trim().to_lowercase();
    if !matches!(platform.as_str(), "linux" | "macos" | "windows" | "android") {
        return Err((
            StatusCode::BAD_REQUEST,
            "平台必须为 'linux', 'macos', 'windows' 或 'android'".to_string(),
        ));
    }

    let content = payload.content.unwrap_or_else(|| {
        serde_json::json!({
            "log": { "level": "info", "timestamp": true },
            "dns": {},
            "inbounds": [],
            "outbounds": [
                { "type": "direct", "tag": "direct" }
            ],
            "route": { "rules": [] }
        })
        .to_string()
    });

    let profile = db::create_config_profile(
        &conn,
        name,
        &platform,
        payload.description.as_deref(),
        &content,
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("创建配置失败: {e}"),
        )
    })?;

    Ok(Json(profile.into()))
}

pub async fn get_config_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<ConfigProfileResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let profile = db::get_config_profile_by_id(&conn, id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("查询配置失败: {e}"),
            )
        })?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "配置不存在".to_string()))?;

    Ok(Json(profile.into()))
}

pub async fn update_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateConfigRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let name = payload.name.trim();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "配置名称不能为空".to_string()));
    }

    let existing = db::get_config_profile_by_id(&conn, id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("查询配置失败: {e}"),
            )
        })?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "配置不存在".to_string()))?;

    let platform = match payload.platform.as_deref() {
        Some(p) => {
            let p_clean = p.trim().to_lowercase();
            if !matches!(p_clean.as_str(), "linux" | "macos" | "windows" | "android") {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "平台必须为 'linux', 'macos', 'windows' 或 'android'".to_string(),
                ));
            }
            p_clean
        }
        None => existing.platform,
    };

    db::update_config_profile(
        &conn,
        id,
        name,
        &platform,
        payload.description.as_deref(),
        &payload.content,
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("更新配置失败: {e}"),
        )
    })?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "配置已保存"
    })))
}

pub async fn delete_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    db::delete_config_profile(&conn, id)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("删除配置失败: {e}")))?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "配置已删除"
    })))
}

pub async fn reset_token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let new_token = db::reset_config_profile_token(&conn, id).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("重置 Token 失败: {e}"),
        )
    })?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "token": new_token,
        "message": "订阅 Token 已重置"
    })))
}

pub async fn set_running_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SetRunningConfigRequest>,
) -> Result<Json<ConfigProfileResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let updated = db::set_running_config_profile(&conn, payload.id).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("绑定本机运行配置失败: {e}"),
        )
    })?;

    Ok(Json(updated.into()))
}

pub async fn set_running_config_by_id(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<ConfigProfileResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let updated = db::set_running_config_profile(&conn, id).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("绑定本机运行配置失败: {e}"),
        )
    })?;

    Ok(Json(updated.into()))
}
