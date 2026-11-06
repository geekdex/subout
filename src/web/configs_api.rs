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

#[derive(Deserialize)]
pub struct ValidateConfigSchemaRequest {
    #[serde(alias = "config_json")]
    pub content: String,
}

#[derive(Serialize)]
pub struct ValidateConfigSchemaResponse {
    pub valid: bool,
    pub errors: Vec<String>,
}

#[derive(Deserialize)]
pub struct SyncConfigNodesRequest {
    #[serde(alias = "config_json")]
    pub content: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct EditorPreferencesPayload {
    pub show_json_preview: bool,
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
            "$schema": "https://sing-box.sagernet.org/schema.json",
            "log": {},
            "dns": {},
            "ntp": {},
            "certificate": {},
            "certificate_providers": [],
            "http_clients": [],
            "endpoints": [],
            "inbounds": [],
            "outbounds": [],
            "route": {},
            "services": [],
            "experimental": {}
        })
        .to_string()
    });

    let validated_val =
        crate::schema_validator::validate_singbox_schema_str(&content).map_err(|errs| {
            (
                StatusCode::BAD_REQUEST,
                format!("配置未通过官方 JSON Schema 校验: {}", errs.join("；")),
            )
        })?;
    let normalized_content = serde_json::to_string_pretty(&validated_val).unwrap_or(content);

    let profile = db::create_config_profile(
        &conn,
        name,
        &platform,
        payload.description.as_deref(),
        &normalized_content,
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

    let validated_val = crate::schema_validator::validate_singbox_schema_str(&payload.content)
        .map_err(|errs| {
            (
                StatusCode::BAD_REQUEST,
                format!("配置未通过官方 JSON Schema 校验: {}", errs.join("；")),
            )
        })?;
    let normalized_content =
        serde_json::to_string_pretty(&validated_val).unwrap_or_else(|_| payload.content.clone());

    db::update_config_profile(
        &conn,
        id,
        name,
        &platform,
        payload.description.as_deref(),
        &normalized_content,
    )
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("更新配置失败: {e}"),
        )
    })?;

    if existing.is_running_config {
        for section in [
            "log",
            "dns",
            "inbounds",
            "outbounds",
            "route",
            "experimental",
            "http_clients",
        ] {
            if let Some(sec_val) = validated_val.get(section)
                && let Ok(sec_str) = serde_json::to_string(sec_val)
            {
                let _ = db::save_base_config_section(&conn, section, &sec_str);
            }
        }
    }

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

pub async fn validate_config_schema(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ValidateConfigSchemaRequest>,
) -> Result<Json<ValidateConfigSchemaResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    match crate::schema_validator::validate_singbox_schema_str(&payload.content) {
        Ok(_) => Ok(Json(ValidateConfigSchemaResponse {
            valid: true,
            errors: Vec::new(),
        })),
        Err(errors) => Ok(Json(ValidateConfigSchemaResponse {
            valid: false,
            errors,
        })),
    }
}

pub async fn preview_sync_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<Option<SyncConfigNodesRequest>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let raw_content = if let Some(req) = payload
        && let Some(c) = req.content
        && !c.trim().is_empty()
    {
        c
    } else {
        let profile = db::get_config_profile_by_id(&conn, id)
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("查询配置失败: {e}"),
                )
            })?
            .ok_or_else(|| (StatusCode::NOT_FOUND, "配置不存在".to_string()))?;
        profile.content
    };

    let base_val: serde_json::Value = serde_json::from_str(&raw_content)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("配置 JSON 解析失败: {e}")))?;

    let (synced_val, report) =
        crate::generator::sync_config_with_latest_resources(&conn, &base_val, &[]).map_err(
            |e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("同步节点与节点组合失败: {e}"),
                )
            },
        )?;

    let synced_str = serde_json::to_string_pretty(&synced_val).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("序列化配置失败: {e}"),
        )
    })?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "content": synced_str,
        "outbounds": synced_val.get("outbounds").cloned().unwrap_or(serde_json::json!([])),
        "report": report
    })))
}

const EDITOR_JSON_PREVIEW_SETTING_KEY: &str = "profile_editor_json_preview";

pub async fn get_editor_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<EditorPreferencesPayload>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let setting_val = db::get_setting(&conn, EDITOR_JSON_PREVIEW_SETTING_KEY).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("读取偏好失败: {e}"),
        )
    })?;
    let show_json_preview = !matches!(setting_val.as_deref(), Some("false"));

    Ok(Json(EditorPreferencesPayload { show_json_preview }))
}

pub async fn save_editor_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EditorPreferencesPayload>,
) -> Result<Json<EditorPreferencesPayload>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let val_str = if payload.show_json_preview {
        "true"
    } else {
        "false"
    };
    db::update_setting(&conn, EDITOR_JSON_PREVIEW_SETTING_KEY, val_str).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("保存偏好失败: {e}"),
        )
    })?;

    Ok(Json(EditorPreferencesPayload {
        show_json_preview: payload.show_json_preview,
    }))
}
