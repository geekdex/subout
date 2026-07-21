use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::OnceLock;

use crate::db;
use crate::generator;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Serialize)]
pub struct BaseConfigResponse {
    pub log: Value,
    pub dns: Value,
    pub inbounds: Value,
    pub outbounds: Value,
    pub route: Value,
    pub experimental: Value,
}

#[derive(Deserialize)]
pub struct BaseConfigSaveRequest {
    pub section: String,
    pub content: Value,
}

#[derive(Deserialize)]
pub struct FullConfigSaveRequest {
    pub log: Value,
    pub dns: Value,
    pub inbounds: Value,
    pub outbounds: Value,
    pub route: Value,
    pub experimental: Value,
    pub save_history: Option<bool>,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct GeneratedConfigPreviewRequest {
    pub log: Value,
    pub dns: Value,
    pub inbounds: Value,
    pub outbounds: Value,
    pub route: Value,
    pub experimental: Value,
}

#[derive(Serialize)]
pub struct ValidationResponse {
    pub valid: bool,
    pub error: Option<String>,
    pub command_missing: bool,
}

pub async fn get_base_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BaseConfigResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let log_str = db::get_base_config_section(&conn, "log")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();
    let dns_str = db::get_base_config_section(&conn, "dns")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();
    let inbounds_str = db::get_base_config_section(&conn, "inbounds")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();
    let outbounds_str = db::get_base_config_section(&conn, "outbounds")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_else(|| {
            "[{\"type\":\"direct\",\"tag\":\"direct\"},{\"type\":\"block\",\"tag\":\"block\"}]"
                .to_string()
        });
    let route_str = db::get_base_config_section(&conn, "route")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();
    let experimental_str = db::get_base_config_section(&conn, "experimental")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or_default();

    Ok(Json(BaseConfigResponse {
        log: serde_json::from_str(&log_str).unwrap_or(json!({})),
        dns: serde_json::from_str(&dns_str).unwrap_or(json!({})),
        inbounds: serde_json::from_str(&inbounds_str).unwrap_or(json!([])),
        outbounds: serde_json::from_str(&outbounds_str).unwrap_or(json!([])),
        route: serde_json::from_str(&route_str).unwrap_or(json!({})),
        experimental: serde_json::from_str(&experimental_str).unwrap_or(json!({})),
    }))
}

pub async fn save_base_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BaseConfigSaveRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    let log_str = db::get_base_config_section(&conn, "log")
        .unwrap_or(None)
        .unwrap_or_else(|| "{}".to_string());
    let dns_str = db::get_base_config_section(&conn, "dns")
        .unwrap_or(None)
        .unwrap_or_else(|| "{}".to_string());
    let inbounds_str = db::get_base_config_section(&conn, "inbounds")
        .unwrap_or(None)
        .unwrap_or_else(|| "[]".to_string());
    let outbounds_str = db::get_base_config_section(&conn, "outbounds")
        .unwrap_or(None)
        .unwrap_or_else(|| "[]".to_string());
    let route_str = db::get_base_config_section(&conn, "route")
        .unwrap_or(None)
        .unwrap_or_else(|| "{}".to_string());
    let experimental_str = db::get_base_config_section(&conn, "experimental")
        .unwrap_or(None)
        .unwrap_or_else(|| "{}".to_string());

    let mut log_val: Value = serde_json::from_str(&log_str).unwrap_or(json!({}));
    let mut dns_val: Value = serde_json::from_str(&dns_str).unwrap_or(json!({}));
    let mut inbounds_val: Value = serde_json::from_str(&inbounds_str).unwrap_or(json!([]));
    let mut outbounds_val: Value = serde_json::from_str(&outbounds_str).unwrap_or(json!([]));
    let mut route_val: Value = serde_json::from_str(&route_str).unwrap_or(json!({}));
    let mut experimental_val: Value = serde_json::from_str(&experimental_str).unwrap_or(json!({}));

    match payload.section.as_str() {
        "log" => log_val = payload.content.clone(),
        "dns" => dns_val = payload.content.clone(),
        "inbounds" => inbounds_val = payload.content.clone(),
        "outbounds" => outbounds_val = payload.content.clone(),
        "route" => route_val = payload.content.clone(),
        "experimental" => experimental_val = payload.content.clone(),
        _ => {}
    }

    if let Err(err_msg) = validate_config_with_singbox(
        &log_val,
        &dns_val,
        &inbounds_val,
        &outbounds_val,
        &route_val,
        &experimental_val,
    ) {
        return Err((StatusCode::BAD_REQUEST, err_msg));
    }

    let content_str = serde_json::to_string(&payload.content)
        .map_err(|_| (StatusCode::BAD_REQUEST, "序列化失败".to_string()))?;

    db::save_base_config_section(&conn, &payload.section, &content_str).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "保存到数据库失败".to_string(),
        )
    })?;

    Ok(StatusCode::OK)
}

pub async fn save_full_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<FullConfigSaveRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    if let Err(err_msg) = validate_config_with_singbox(
        &payload.log,
        &payload.dns,
        &payload.inbounds,
        &payload.outbounds,
        &payload.route,
        &payload.experimental,
    ) {
        return Err((StatusCode::BAD_REQUEST, err_msg));
    }

    let log_str = serde_json::to_string(&payload.log)
        .map_err(|_| (StatusCode::BAD_REQUEST, "log序列化失败".to_string()))?;
    let dns_str = serde_json::to_string(&payload.dns)
        .map_err(|_| (StatusCode::BAD_REQUEST, "dns序列化失败".to_string()))?;
    let inbounds_str = serde_json::to_string(&payload.inbounds)
        .map_err(|_| (StatusCode::BAD_REQUEST, "inbounds序列化失败".to_string()))?;
    let outbounds_str = serde_json::to_string(&payload.outbounds)
        .map_err(|_| (StatusCode::BAD_REQUEST, "outbounds序列化失败".to_string()))?;
    let route_str = serde_json::to_string(&payload.route)
        .map_err(|_| (StatusCode::BAD_REQUEST, "route序列化失败".to_string()))?;
    let experimental_str = serde_json::to_string(&payload.experimental).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "experimental序列化失败".to_string(),
        )
    })?;

    db::save_base_config_section(&conn, "log", &log_str)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "保存log失败".to_string()))?;
    db::save_base_config_section(&conn, "dns", &dns_str)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "保存dns失败".to_string()))?;
    db::save_base_config_section(&conn, "inbounds", &inbounds_str).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "保存inbounds失败".to_string(),
        )
    })?;
    db::save_base_config_section(&conn, "outbounds", &outbounds_str).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "保存outbounds失败".to_string(),
        )
    })?;
    db::save_base_config_section(&conn, "route", &route_str).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "保存route失败".to_string(),
        )
    })?;
    db::save_base_config_section(&conn, "experimental", &experimental_str).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "保存experimental失败".to_string(),
        )
    })?;

    if payload.save_history.unwrap_or(false) {
        let full_config = json!({
            "log": payload.log,
            "dns": payload.dns,
            "inbounds": payload.inbounds,
            "outbounds": payload.outbounds,
            "route": payload.route,
            "experimental": payload.experimental,
        });
        let full_config_str = serde_json::to_string(&full_config).unwrap_or_default();
        let desc = payload
            .description
            .unwrap_or_else(|| "保存完整配置版本".to_string());

        let _ = db::log_history(&conn, "配置列表", "保存配置", &desc, Some(&full_config_str));
    }

    Ok(StatusCode::OK)
}

pub async fn restore_history_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    let history = db::get_config_history_detail(&conn, id)
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "获取历史详情失败".to_string(),
            )
        })?
        .ok_or((StatusCode::NOT_FOUND, "历史记录不存在".to_string()))?;

    let content_str = history.content.ok_or((
        StatusCode::BAD_REQUEST,
        "历史记录中没有配置内容".to_string(),
    ))?;
    let config_val: Value = serde_json::from_str(&content_str)
        .map_err(|_| (StatusCode::BAD_REQUEST, "解析配置JSON失败".to_string()))?;

    if config_val.get("log").is_some()
        || config_val.get("dns").is_some()
        || config_val.get("inbounds").is_some()
    {
        let sections = [
            "log",
            "dns",
            "inbounds",
            "outbounds",
            "route",
            "experimental",
        ];
        for sec in &sections {
            if let Some(sec_val) = config_val.get(*sec) {
                let sec_str = serde_json::to_string(sec_val).map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("序列化{}失败", sec),
                    )
                })?;
                db::save_base_config_section(&conn, sec, &sec_str).map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("恢复{}配置失败", sec),
                    )
                })?;
            }
        }
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            "此历史记录为旧格式，不包含完整配置内容，无法直接恢复".to_string(),
        ));
    }

    db::update_setting(&conn, "active_config_id", &id.to_string()).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "保存激活配置ID失败".to_string(),
        )
    })?;

    Ok(StatusCode::OK)
}

pub async fn get_generated_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let config =
        generator::generate_config(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(config))
}

#[derive(Serialize)]
pub struct ConfigListResponse {
    pub items: Vec<db::ConfigHistory>,
    pub active_id: Option<i64>,
}

pub async fn get_history(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ConfigListResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    let history = db::get_config_history(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let active_id_str = db::get_setting(&conn, "active_config_id")
        .unwrap_or(None)
        .unwrap_or_default();
    let active_id = active_id_str.parse::<i64>().ok();

    Ok(Json(ConfigListResponse {
        items: history,
        active_id,
    }))
}

pub async fn get_history_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<db::ConfigHistory>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    let item = db::get_config_history_detail(&conn, id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(item))
}

pub async fn clear_history(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    conn.execute("DELETE FROM config_history", [])
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

static SCHEMAS: OnceLock<Value> = OnceLock::new();

pub async fn get_config_schemas(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&state, &headers).await?;
    let schemas = SCHEMAS.get_or_init(|| {
        serde_json::from_str(include_str!("../../resources/schemas.json"))
            .expect("Failed to parse schemas.json")
    });
    Ok(Json(schemas.clone()))
}

static SCHEMA_UI_META: OnceLock<Value> = OnceLock::new();

pub async fn get_schema_ui_meta(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&state, &headers).await?;
    let ui_meta = SCHEMA_UI_META.get_or_init(|| {
        serde_json::from_str(include_str!("../../resources/schema_ui_meta.json"))
            .expect("Failed to parse schema_ui_meta.json")
    });
    Ok(Json(ui_meta.clone()))
}

pub async fn post_generated_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<GeneratedConfigPreviewRequest>,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    let config = generator::generate_config_with_base(
        &conn,
        payload.log,
        payload.dns,
        payload.inbounds,
        payload.outbounds,
        payload.route,
        payload.experimental,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(config))
}

fn is_environment_error(err_msg: &str) -> bool {
    let lower = err_msg.to_lowercase();
    lower.contains("auto-redirect")
        || lower.contains("tun")
        || lower.contains("permission denied")
        || lower.contains("operation not permitted")
        || lower.contains("tproxy")
        || lower.contains("privilege")
}

pub async fn validate_full_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<GeneratedConfigPreviewRequest>,
) -> Result<Json<ValidationResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let _conn = get_db_conn(&state.db_path)?;

    // Configs are self-contained snapshots — no DB lookup needed.
    let config = json!({
        "log": payload.log,
        "dns": payload.dns,
        "inbounds": payload.inbounds,
        "outbounds": payload.outbounds,
        "route": payload.route,
        "experimental": payload.experimental
    });

    static FILE_COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let temp_filename = format!(
        ".temp_singbox_val_{}_{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        FILE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    );

    let config_str =
        serde_json::to_string_pretty(&config).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Err(e) = std::fs::write(&temp_filename, config_str) {
        return Ok(Json(ValidationResponse {
            valid: false,
            error: Some(format!("写入临时配置文件失败: {}", e)),
            command_missing: false,
        }));
    }

    let output_res = std::process::Command::new("sing-box")
        .args(["check", "-c", &temp_filename])
        .output();

    let _ = std::fs::remove_file(&temp_filename);

    match output_res {
        Ok(output) => {
            if output.status.success() {
                Ok(Json(ValidationResponse {
                    valid: true,
                    error: None,
                    command_missing: false,
                }))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let err_msg = if stderr.trim().is_empty() {
                    stdout
                } else {
                    stderr
                };
                let is_env = is_environment_error(&err_msg);
                Ok(Json(ValidationResponse {
                    valid: is_env,
                    error: if is_env { None } else { Some(err_msg) },
                    command_missing: false,
                }))
            }
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                Ok(Json(ValidationResponse {
                    valid: true,
                    error: None,
                    command_missing: true,
                }))
            } else {
                Ok(Json(ValidationResponse {
                    valid: false,
                    error: Some(format!("执行 sing-box 校验命令失败: {}", e)),
                    command_missing: false,
                }))
            }
        }
    }
}

pub fn validate_config_with_singbox(
    log: &Value,
    dns: &Value,
    inbounds: &Value,
    outbounds: &Value,
    route: &Value,
    experimental: &Value,
) -> Result<(), String> {
    // Configs are self-contained snapshots — merge the 6 sections directly
    // without any database lookup.
    let config = json!({
        "log": log,
        "dns": dns,
        "inbounds": inbounds,
        "outbounds": outbounds,
        "route": route,
        "experimental": experimental
    });

    static FILE_COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let temp_filename = format!(
        ".temp_singbox_val_{}_{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        FILE_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    );

    let config_str =
        serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {}", e))?;
    if let Err(e) = std::fs::write(&temp_filename, config_str) {
        return Err(format!("写入临时文件失败: {}", e));
    }

    let output_res = std::process::Command::new("sing-box")
        .args(["check", "-c", &temp_filename])
        .output();

    let _ = std::fs::remove_file(&temp_filename);

    match output_res {
        Ok(output) => {
            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let err_msg = if stderr.trim().is_empty() {
                    stdout
                } else {
                    stderr
                };
                if is_environment_error(&err_msg) {
                    Ok(())
                } else {
                    Err(format!(
                        "sing-box 校验失败: {}",
                        format_singbox_error(&err_msg)
                    ))
                }
            }
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                Ok(())
            } else {
                Err(format!("执行 sing-box 校验失败: {}", e))
            }
        }
    }
}

fn format_singbox_error(raw: &str) -> String {
    let mut clean = String::new();
    let mut in_escape = false;
    for c in raw.chars() {
        if c == '\x1B' {
            in_escape = true;
        } else if in_escape {
            if c.is_ascii_alphabetic() {
                in_escape = false;
            }
        } else {
            clean.push(c);
        }
    }

    let mut msg = clean.trim().to_string();
    if let Some(pos) = msg.find("decode config at .temp_singbox_val_") {
        if let Some(end_pos) = msg[pos..].find(".json: ") {
            msg = format!("{}{}", &msg[..pos], &msg[pos + end_pos + 7..]);
        }
    }

    let msg = msg.trim();
    if let Some(tag_pos) = msg.find("duplicate outbound/endpoint tag: ") {
        let tag_name = &msg[tag_pos + 33..];
        return format!(
            "出站连接 (outbounds) 中存在重复的 tag: \"{}\"，请修改重复的 tag 名称。",
            tag_name.trim()
        );
    }

    if msg.is_empty() {
        "未知 sing-box 校验错误".to_string()
    } else {
        msg.to_string()
    }
}

#[derive(Deserialize)]
pub struct CreateHistoryConfigRequest {
    pub detail: String,
    pub content: Option<Value>,
}

pub async fn create_history_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateHistoryConfigRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    let content_str = match payload.content {
        Some(c) => serde_json::to_string(&c).unwrap_or_else(|_| "{}".to_string()),
        None => {
            let default_cfg = json!({
                "log": {},
                "dns": {},
                "inbounds": [],
                "outbounds": [],
                "route": {},
                "experimental": {}
            });
            serde_json::to_string(&default_cfg).unwrap_or_else(|_| "{}".to_string())
        }
    };

    conn.execute(
        "INSERT INTO config_history (change_type, action, detail, content) VALUES ('配置列表', '创建配置', ?, ?)",
        rusqlite::params![payload.detail, content_str],
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("写入数据库失败: {}", e)))?;

    let id = conn.last_insert_rowid();

    let active_id_str = db::get_setting(&conn, "active_config_id")
        .unwrap_or(None)
        .unwrap_or_default();
    if active_id_str.is_empty() {
        let _ = db::update_setting(&conn, "active_config_id", &id.to_string());
        if let Ok(c) = serde_json::from_str::<Value>(&content_str) {
            let sections = [
                "log",
                "dns",
                "inbounds",
                "outbounds",
                "route",
                "experimental",
            ];
            for sec in &sections {
                if let Some(sec_val) = c.get(*sec) {
                    if let Ok(sec_str) = serde_json::to_string(sec_val) {
                        let _ = db::save_base_config_section(&conn, sec, &sec_str);
                    }
                }
            }
        }
    }

    Ok(Json(json!({ "id": id })))
}

#[derive(Deserialize)]
pub struct UpdateHistoryConfigRequest {
    pub detail: Option<String>,
    pub content: Value,
}

pub async fn update_history_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateHistoryConfigRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM config_history WHERE id = ?",
            [id],
            |r| r.get(0),
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("查询数据库失败: {}", e),
            )
        })?;

    if exists == 0 {
        return Err((StatusCode::NOT_FOUND, "配置项不存在".to_string()));
    }

    let log_val = payload.content.get("log").cloned().unwrap_or(json!({}));
    let dns_val = payload.content.get("dns").cloned().unwrap_or(json!({}));
    let inbounds_val = payload
        .content
        .get("inbounds")
        .cloned()
        .unwrap_or(json!([]));
    let outbounds_val = payload
        .content
        .get("outbounds")
        .cloned()
        .unwrap_or(json!([]));
    let route_val = payload.content.get("route").cloned().unwrap_or(json!({}));
    let experimental_val = payload
        .content
        .get("experimental")
        .cloned()
        .unwrap_or(json!({}));

    if let Err(err_msg) = validate_config_with_singbox(
        &log_val,
        &dns_val,
        &inbounds_val,
        &outbounds_val,
        &route_val,
        &experimental_val,
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("配置语法错误: {}", err_msg),
        ));
    }

    let content_str = serde_json::to_string(&payload.content)
        .map_err(|_| (StatusCode::BAD_REQUEST, "序列化配置失败".to_string()))?;

    if let Some(detail) = payload.detail {
        conn.execute(
            "UPDATE config_history SET content = ?, detail = ? WHERE id = ?",
            rusqlite::params![content_str, detail, id],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("更新失败: {}", e),
            )
        })?;
    } else {
        conn.execute(
            "UPDATE config_history SET content = ? WHERE id = ?",
            rusqlite::params![content_str, id],
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("更新失败: {}", e),
            )
        })?;
    }

    let running_id_str = db::get_setting(&conn, "running_config_id")
        .unwrap_or(None)
        .unwrap_or_default();
    let is_running = running_id_str.parse::<i64>().ok() == Some(id);

    if is_running {
        let sections = [
            "log",
            "dns",
            "inbounds",
            "outbounds",
            "route",
            "experimental",
        ];
        for sec in &sections {
            if let Some(sec_val) = payload.content.get(*sec) {
                if let Ok(sec_str) = serde_json::to_string(sec_val) {
                    let _ = db::save_base_config_section(&conn, sec, &sec_str);
                }
            }
        }
    }

    Ok(StatusCode::OK)
}

pub async fn delete_history_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    conn.execute("DELETE FROM config_history WHERE id = ?", [id])
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("删除失败: {}", e),
            )
        })?;

    Ok(StatusCode::OK)
}

#[derive(Deserialize, Debug)]
pub struct SaveRunningConfigRequest {
    pub config_id: Option<i64>,
    pub config_path: String,
    pub restart_cmd: String,
    pub sudo_pass: Option<String>,
    pub execute_update: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct ExecutionStepLog {
    pub step: String,
    pub status: String,
    pub message: String,
    pub timestamp: String,
}

fn get_execution_timestamp() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

fn run_command_with_sudo(cmd: &str, sudo_pass: &str) -> std::io::Result<std::process::Output> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let cmd_to_run = if !sudo_pass.is_empty() && cmd.starts_with("sudo ") {
        cmd.replacen("sudo ", "sudo -S ", 1)
    } else {
        cmd.to_string()
    };

    let mut child = Command::new("sh")
        .args(&["-c", &cmd_to_run])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    if !sudo_pass.is_empty() && cmd.starts_with("sudo") {
        if let Some(mut stdin) = child.stdin.take() {
            let _ = writeln!(stdin, "{}", sudo_pass);
        }
    }

    child.wait_with_output()
}

pub async fn get_running_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    let config_id_str = db::get_setting(&conn, "running_config_id")
        .unwrap_or(None)
        .unwrap_or_default();
    let config_id = config_id_str.parse::<i64>().ok();

    let config_path = db::get_setting(&conn, "running_config_path")
        .unwrap_or(None)
        .unwrap_or_default();

    let restart_cmd = db::get_setting(&conn, "running_restart_cmd")
        .unwrap_or(None)
        .unwrap_or_default();

    let sudo_pass = db::get_setting(&conn, "running_sudo_pass")
        .unwrap_or(None)
        .unwrap_or_default();
    let has_sudo_pass = !sudo_pass.is_empty();

    Ok(Json(serde_json::json!({
        "config_id": config_id,
        "config_path": config_path,
        "restart_cmd": restart_cmd,
        "has_sudo_pass": has_sudo_pass,
    })))
}

pub async fn save_running_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SaveRunningConfigRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    let mut logs: Vec<ExecutionStepLog> = Vec::new();

    // 1. Save settings
    logs.push(ExecutionStepLog {
        step: "保存参数".to_string(),
        status: "info".to_string(),
        message: format!(
            "正在保存运行配置参数 (配置ID: {:?}, 覆盖路径: {})...",
            payload.config_id, payload.config_path
        ),
        timestamp: get_execution_timestamp(),
    });

    if let Some(id) = payload.config_id {
        if let Err(e) = db::update_setting(&conn, "running_config_id", &id.to_string()) {
            let err_msg = format!("保存配置ID失败: {}", e);
            logs.push(ExecutionStepLog {
                step: "保存参数".to_string(),
                status: "error".to_string(),
                message: err_msg.clone(),
                timestamp: get_execution_timestamp(),
            });
            return Ok(Json(serde_json::json!({
                "status": "failed",
                "message": err_msg,
                "logs": logs
            })));
        }

        // Sync sections to base_config for panel generation compatibility
        if let Ok(Some(history)) = db::get_config_history_detail(&conn, id) {
            if let Some(content_str) = history.content {
                if let Ok(c) = serde_json::from_str::<Value>(&content_str) {
                    let sections = [
                        "log",
                        "dns",
                        "inbounds",
                        "outbounds",
                        "route",
                        "experimental",
                    ];
                    for sec in &sections {
                        if let Some(sec_val) = c.get(*sec) {
                            if let Ok(sec_str) = serde_json::to_string(sec_val) {
                                let _ = db::save_base_config_section(&conn, sec, &sec_str);
                            }
                        }
                    }
                }
            }
        }
    } else {
        if let Err(e) = db::update_setting(&conn, "running_config_id", "") {
            let err_msg = format!("清除配置ID失败: {}", e);
            logs.push(ExecutionStepLog {
                step: "保存参数".to_string(),
                status: "error".to_string(),
                message: err_msg.clone(),
                timestamp: get_execution_timestamp(),
            });
            return Ok(Json(serde_json::json!({
                "status": "failed",
                "message": err_msg,
                "logs": logs
            })));
        }
    }

    if let Err(e) = db::update_setting(&conn, "running_config_path", &payload.config_path) {
        let err_msg = format!("保存覆盖路径失败: {}", e);
        logs.push(ExecutionStepLog {
            step: "保存参数".to_string(),
            status: "error".to_string(),
            message: err_msg.clone(),
            timestamp: get_execution_timestamp(),
        });
        return Ok(Json(serde_json::json!({
            "status": "failed",
            "message": err_msg,
            "logs": logs
        })));
    }

    if let Err(e) = db::update_setting(&conn, "running_restart_cmd", &payload.restart_cmd) {
        let err_msg = format!("保存重启命令失败: {}", e);
        logs.push(ExecutionStepLog {
            step: "保存参数".to_string(),
            status: "error".to_string(),
            message: err_msg.clone(),
            timestamp: get_execution_timestamp(),
        });
        return Ok(Json(serde_json::json!({
            "status": "failed",
            "message": err_msg,
            "logs": logs
        })));
    }

    // Check password logic
    let final_sudo_pass = if let Some(pass) = payload.sudo_pass {
        if pass == "******" {
            // Keep existing password
            db::get_setting(&conn, "running_sudo_pass")
                .unwrap_or(None)
                .unwrap_or_default()
        } else {
            if let Err(e) = db::update_setting(&conn, "running_sudo_pass", &pass) {
                let err_msg = format!("保存sudo密码失败: {}", e);
                logs.push(ExecutionStepLog {
                    step: "保存参数".to_string(),
                    status: "error".to_string(),
                    message: err_msg.clone(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "failed",
                    "message": err_msg,
                    "logs": logs
                })));
            }
            pass
        }
    } else {
        // Keep existing password or empty if not provided
        db::get_setting(&conn, "running_sudo_pass")
            .unwrap_or(None)
            .unwrap_or_default()
    };

    logs.push(ExecutionStepLog {
        step: "保存参数".to_string(),
        status: "success".to_string(),
        message: "运行设置已成功保存至系统数据库".to_string(),
        timestamp: get_execution_timestamp(),
    });

    // 2. If execute_update is true, we perform the update step by step
    if payload.execute_update {
        // STEP 2: 读取配置模板与生成配置
        let config_id = match payload.config_id {
            Some(id) => id,
            None => {
                let err_msg = "未选择要运行的配置模板".to_string();
                logs.push(ExecutionStepLog {
                    step: "生成配置".to_string(),
                    status: "error".to_string(),
                    message: err_msg.clone(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "failed",
                    "message": err_msg,
                    "logs": logs
                })));
            }
        };

        logs.push(ExecutionStepLog {
            step: "生成配置".to_string(),
            status: "info".to_string(),
            message: format!(
                "正在读取配置模板 #{} 内容并构建 Sing-Box 配置...",
                config_id
            ),
            timestamp: get_execution_timestamp(),
        });

        let history = match db::get_config_history_detail(&conn, config_id) {
            Ok(Some(h)) => h,
            Ok(None) => {
                let err_msg = format!("所选配置 #{} 在历史库中不存在", config_id);
                logs.push(ExecutionStepLog {
                    step: "生成配置".to_string(),
                    status: "error".to_string(),
                    message: err_msg.clone(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "failed",
                    "message": err_msg,
                    "logs": logs
                })));
            }
            Err(e) => {
                let err_msg = format!("查询配置失败: {}", e);
                logs.push(ExecutionStepLog {
                    step: "生成配置".to_string(),
                    status: "error".to_string(),
                    message: err_msg.clone(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "failed",
                    "message": err_msg,
                    "logs": logs
                })));
            }
        };

        let content_str = match history.content {
            Some(c) => c,
            None => {
                let err_msg = "所选配置模板内容为空".to_string();
                logs.push(ExecutionStepLog {
                    step: "生成配置".to_string(),
                    status: "error".to_string(),
                    message: err_msg.clone(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "failed",
                    "message": err_msg,
                    "logs": logs
                })));
            }
        };

        let config_val: Value = match serde_json::from_str(&content_str) {
            Ok(v) => v,
            Err(e) => {
                let err_msg = format!("解析配置模板 JSON 失败: {}", e);
                logs.push(ExecutionStepLog {
                    step: "生成配置".to_string(),
                    status: "error".to_string(),
                    message: err_msg.clone(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "failed",
                    "message": err_msg,
                    "logs": logs
                })));
            }
        };

        let log = config_val.get("log").cloned().unwrap_or(json!({}));
        let dns = config_val.get("dns").cloned().unwrap_or(json!({}));
        let inbounds = config_val.get("inbounds").cloned().unwrap_or(json!([]));
        let outbounds = config_val.get("outbounds").cloned().unwrap_or(json!([]));
        let route = config_val.get("route").cloned().unwrap_or(json!({}));
        let experimental = config_val.get("experimental").cloned().unwrap_or(json!({}));

        // STEP 3: Sing-Box 语法校验
        logs.push(ExecutionStepLog {
            step: "语法校验".to_string(),
            status: "info".to_string(),
            message: "正在调用 sing-box check 进行语法与校验检查...".to_string(),
            timestamp: get_execution_timestamp(),
        });

        if let Err(err_msg) =
            validate_config_with_singbox(&log, &dns, &inbounds, &outbounds, &route, &experimental)
        {
            logs.push(ExecutionStepLog {
                step: "语法校验".to_string(),
                status: "error".to_string(),
                message: format!("Sing-Box 语法校验未通过: {}", err_msg),
                timestamp: get_execution_timestamp(),
            });
            return Ok(Json(serde_json::json!({
                "status": "failed",
                "message": format!("Sing-Box 语法校验失败: {}", err_msg),
                "logs": logs
            })));
        }

        logs.push(ExecutionStepLog {
            step: "语法校验".to_string(),
            status: "success".to_string(),
            message: "Sing-Box 配置文件语法校验通过 (sing-box check ok)".to_string(),
            timestamp: get_execution_timestamp(),
        });

        let generated = match generator::generate_config_with_base(
            &conn,
            log,
            dns,
            inbounds,
            outbounds,
            route,
            experimental,
        ) {
            Ok(g) => g,
            Err(e) => {
                let err_msg = format!("生成完整配置失败: {}", e);
                logs.push(ExecutionStepLog {
                    step: "生成配置".to_string(),
                    status: "error".to_string(),
                    message: err_msg.clone(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "failed",
                    "message": err_msg,
                    "logs": logs
                })));
            }
        };

        let generated_pretty = match serde_json::to_string_pretty(&generated) {
            Ok(p) => p,
            Err(e) => {
                let err_msg = format!("格式化 JSON 失败: {}", e);
                logs.push(ExecutionStepLog {
                    step: "生成配置".to_string(),
                    status: "error".to_string(),
                    message: err_msg.clone(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "failed",
                    "message": err_msg,
                    "logs": logs
                })));
            }
        };

        logs.push(ExecutionStepLog {
            step: "生成配置".to_string(),
            status: "success".to_string(),
            message: format!(
                "配置模板 #{} 读取并整合生成 Sing-Box 核心配置成功",
                config_id
            ),
            timestamp: get_execution_timestamp(),
        });

        // STEP 4: 写入/替换目标配置文件
        if payload.config_path.trim().is_empty() {
            let err_msg = "配置文件覆盖路径不能为空".to_string();
            logs.push(ExecutionStepLog {
                step: "替换文件".to_string(),
                status: "error".to_string(),
                message: err_msg.clone(),
                timestamp: get_execution_timestamp(),
            });
            return Ok(Json(serde_json::json!({
                "status": "failed",
                "message": err_msg,
                "logs": logs
            })));
        }

        let target_path = payload.config_path.clone();
        logs.push(ExecutionStepLog {
            step: "替换文件".to_string(),
            status: "info".to_string(),
            message: format!("准备覆盖目标配置文件: {}...", target_path),
            timestamp: get_execution_timestamp(),
        });

        let temp_dir = std::env::temp_dir();
        let temp_file_path = temp_dir.join(format!(
            "sing-box-config-{}.json",
            chrono::Utc::now().timestamp_millis()
        ));

        if let Err(e) = std::fs::write(&temp_file_path, &generated_pretty) {
            let err_msg = format!("写入临时文件失败: {}", e);
            logs.push(ExecutionStepLog {
                step: "替换文件".to_string(),
                status: "error".to_string(),
                message: err_msg.clone(),
                timestamp: get_execution_timestamp(),
            });
            return Ok(Json(serde_json::json!({
                "status": "failed",
                "message": err_msg,
                "logs": logs
            })));
        }

        let mut write_success = false;
        let mut write_err_msg = String::new();

        if std::fs::copy(&temp_file_path, &target_path).is_ok() {
            write_success = true;
        } else {
            let parent_dir = std::path::Path::new(&target_path)
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_else(|| "/etc/sing-box".to_string());

            let mkdir_cmd = format!("sudo mkdir -p {:?}", parent_dir);
            let _ = run_command_with_sudo(&mkdir_cmd, &final_sudo_pass);

            let cp_cmd = format!("sudo cp {:?} {:?}", temp_file_path, target_path);
            match run_command_with_sudo(&cp_cmd, &final_sudo_pass) {
                Ok(output) => {
                    if output.status.success() {
                        write_success = true;
                    } else {
                        write_err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
                    }
                }
                Err(e) => {
                    write_err_msg = format!("执行 cp 命令失败: {}", e);
                }
            }
        }

        let _ = std::fs::remove_file(&temp_file_path);

        if !write_success {
            let err_msg = format!("写入配置文件到 {} 失败: {}", target_path, write_err_msg);
            logs.push(ExecutionStepLog {
                step: "替换文件".to_string(),
                status: "error".to_string(),
                message: err_msg.clone(),
                timestamp: get_execution_timestamp(),
            });
            return Ok(Json(serde_json::json!({
                "status": "failed",
                "message": err_msg,
                "logs": logs
            })));
        }

        logs.push(ExecutionStepLog {
            step: "替换文件".to_string(),
            status: "success".to_string(),
            message: format!("目标配置文件已成功覆盖至 {}", target_path),
            timestamp: get_execution_timestamp(),
        });

        // STEP 5: 执行重启命令
        let cmd = payload.restart_cmd.trim().to_string();
        let mut restart_out_msg = String::new();

        if cmd.is_empty() {
            logs.push(ExecutionStepLog {
                step: "重启服务".to_string(),
                status: "warn".to_string(),
                message: "未配置重启命令，已跳过系统服务重启步骤".to_string(),
                timestamp: get_execution_timestamp(),
            });
        } else {
            logs.push(ExecutionStepLog {
                step: "重启服务".to_string(),
                status: "info".to_string(),
                message: format!("正在执行重启命令: {}...", cmd),
                timestamp: get_execution_timestamp(),
            });

            match run_command_with_sudo(&cmd, &final_sudo_pass) {
                Ok(output) => {
                    if output.status.success() {
                        restart_out_msg = String::from_utf8_lossy(&output.stdout).into_owned();
                        logs.push(ExecutionStepLog {
                            step: "重启服务".to_string(),
                            status: "success".to_string(),
                            message: format!("重启命令 '{}' 执行成功", cmd),
                            timestamp: get_execution_timestamp(),
                        });
                    } else {
                        let err_str = String::from_utf8_lossy(&output.stderr).into_owned();
                        let err_msg = format!("重启命令 '{}' 执行失败: {}", cmd, err_str);
                        logs.push(ExecutionStepLog {
                            step: "重启服务".to_string(),
                            status: "error".to_string(),
                            message: err_msg.clone(),
                            timestamp: get_execution_timestamp(),
                        });
                        return Ok(Json(serde_json::json!({
                            "status": "failed",
                            "message": err_msg,
                            "command_output": err_str,
                            "logs": logs
                        })));
                    }
                }
                Err(e) => {
                    let err_msg = format!("重启命令执行失败: {}", e);
                    logs.push(ExecutionStepLog {
                        step: "重启服务".to_string(),
                        status: "error".to_string(),
                        message: err_msg.clone(),
                        timestamp: get_execution_timestamp(),
                    });
                    return Ok(Json(serde_json::json!({
                        "status": "failed",
                        "message": err_msg,
                        "logs": logs
                    })));
                }
            }
        }

        return Ok(Json(serde_json::json!({
            "status": "success",
            "message": "配置文件已成功更新且重启服务完成",
            "command_output": restart_out_msg,
            "logs": logs
        })));
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "配置设置已保存",
        "logs": logs
    })))
}
