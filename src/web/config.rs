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

    let mut content_to_save = payload.content.clone();
    if payload.section == "outbounds" {
        generator::sanitize_outbounds_value(&mut content_to_save);
    } else if payload.section == "inbounds" {
        generator::sanitize_inbounds_value(&mut content_to_save);
    } else if payload.section == "dns" {
        generator::sanitize_dns_value(&mut content_to_save);
    } else if payload.section == "route" {
        generator::sanitize_route_value(&mut content_to_save);
    }
    let content_str = serde_json::to_string(&content_to_save)
        .map_err(|_| (StatusCode::BAD_REQUEST, "序列化失败".to_string()))?;

    db::save_base_config_section(&conn, &payload.section, &content_str)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "保存失败".to_string()))?;

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

    let mut sanitized_dns = payload.dns.clone();
    generator::sanitize_dns_value(&mut sanitized_dns);
    let mut sanitized_inbounds = payload.inbounds.clone();
    generator::sanitize_inbounds_value(&mut sanitized_inbounds);
    let mut sanitized_outbounds = payload.outbounds.clone();
    generator::sanitize_outbounds_value(&mut sanitized_outbounds);
    let mut sanitized_route = payload.route.clone();
    generator::sanitize_route_value(&mut sanitized_route);

    if let Err(err_msg) = validate_config_with_singbox(
        &payload.log,
        &sanitized_dns,
        &sanitized_inbounds,
        &sanitized_outbounds,
        &sanitized_route,
        &payload.experimental,
    ) {
        return Err((StatusCode::BAD_REQUEST, err_msg));
    }

    let log_str = serde_json::to_string(&payload.log)
        .map_err(|_| (StatusCode::BAD_REQUEST, "log序列化失败".to_string()))?;
    let dns_str = serde_json::to_string(&sanitized_dns)
        .map_err(|_| (StatusCode::BAD_REQUEST, "dns序列化失败".to_string()))?;
    let inbounds_str = serde_json::to_string(&sanitized_inbounds)
        .map_err(|_| (StatusCode::BAD_REQUEST, "inbounds序列化失败".to_string()))?;
    let outbounds_str = serde_json::to_string(&sanitized_outbounds)
        .map_err(|_| (StatusCode::BAD_REQUEST, "outbounds序列化失败".to_string()))?;
    let route_str = serde_json::to_string(&sanitized_route)
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
            "dns": sanitized_dns,
            "inbounds": sanitized_inbounds,
            "outbounds": sanitized_outbounds,
            "route": sanitized_route,
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

    let mut sanitized_outbounds = payload.outbounds.clone();
    generator::sanitize_outbounds_value(&mut sanitized_outbounds);

    // Configs are self-contained snapshots — no DB lookup needed.
    let config = json!({
        "log": payload.log,
        "dns": payload.dns,
        "inbounds": payload.inbounds,
        "outbounds": sanitized_outbounds,
        "route": payload.route,
        "experimental": payload.experimental
    });

    let temp_file_path = crate::paths::AppPaths::get().temp_file_path("singbox_val", ".json");

    let config_str =
        serde_json::to_string_pretty(&config).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if let Err(e) = std::fs::write(&temp_file_path, config_str) {
        return Ok(Json(ValidationResponse {
            valid: false,
            error: Some(format!("写入临时配置文件失败: {}", e)),
            command_missing: false,
        }));
    }

    let singbox_bin = crate::kernel::get_singbox_executable()
        .unwrap_or_else(|| std::path::PathBuf::from("sing-box"));

    let output_res = std::process::Command::new(&singbox_bin)
        .args(["check", "-c", &temp_file_path.to_string_lossy()])
        .env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
        .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true")
        .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
        .output();

    let _ = std::fs::remove_file(&temp_file_path);

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
                    error: if is_env {
                        None
                    } else {
                        Some(format_singbox_error(&err_msg, Some(&config)))
                    },
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
    let mut sanitized_log = log.clone();
    generator::sanitize_log_value(&mut sanitized_log);
    let mut sanitized_outbounds = outbounds.clone();
    generator::sanitize_outbounds_value(&mut sanitized_outbounds);

    // Configs are self-contained snapshots — merge the 6 sections directly
    // without any database lookup.
    let config = json!({
        "log": sanitized_log,
        "dns": dns,
        "inbounds": inbounds,
        "outbounds": sanitized_outbounds,
        "route": route,
        "experimental": experimental
    });

    let temp_file_path = crate::paths::AppPaths::get().temp_file_path("singbox_val", ".json");

    let config_str =
        serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {}", e))?;
    if let Err(e) = std::fs::write(&temp_file_path, config_str) {
        return Err(format!("写入临时文件失败: {}", e));
    }

    let singbox_bin = crate::kernel::get_singbox_executable()
        .unwrap_or_else(|| std::path::PathBuf::from("sing-box"));

    let output_res = std::process::Command::new(&singbox_bin)
        .args(["check", "-c", &temp_file_path.to_string_lossy()])
        .env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
        .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true")
        .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
        .output();

    let _ = std::fs::remove_file(&temp_file_path);

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
                        format_singbox_error(&err_msg, Some(&config))
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

fn format_singbox_error(raw: &str, config: Option<&Value>) -> String {
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

    if let Some(pos) = msg.find("initialize outbound[") {
        let rest = &msg[pos + 20..];
        if let Some(end_bracket) = rest.find(']') {
            if let Ok(idx) = rest[..end_bracket].parse::<usize>() {
                let detail_err = rest[end_bracket + 1..].trim_start_matches(':').trim();

                let outbound_item = config
                    .and_then(|c| c.get("outbounds"))
                    .and_then(|o| o.as_array())
                    .and_then(|arr| arr.get(idx));

                let tag_desc = if let Some(ob) = outbound_item {
                    let tag = ob.get("tag").and_then(|t| t.as_str()).unwrap_or("未命名");
                    let ob_type = ob.get("type").and_then(|t| t.as_str()).unwrap_or("unknown");
                    format!("第 {} 个出站 \"{}\" ({})", idx + 1, tag, ob_type)
                } else {
                    format!("第 {} 个出站 (索引 #{})", idx + 1, idx)
                };

                let detail_cn = match detail_err {
                    "missing tags" => {
                        "未指定任何目标节点/出站 (outbounds 列表为空)，请编辑此出站组并为其添加至少一个目标节点"
                    }
                    "missing server" => "未配置服务器地址 (missing server)",
                    "missing server_port" => "未配置服务器端口 (missing server_port)",
                    _ => detail_err,
                };

                return format!("{} 校验失败: {}", tag_desc, detail_cn);
            }
        }
    }

    if let Some(unknown_pos) = msg.find("json: unknown field \"") {
        let field_info = &msg[unknown_pos + 20..];
        if let Some(end_quote) = field_info.find('"') {
            let field_name = &field_info[..end_quote];
            return format!(
                "配置校验失败：存在未知或不支持的属性 \"{}\" ({})",
                field_name, msg
            );
        }
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
    pub execute_update: bool,
    pub sudo_pass: Option<String>,
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

    let is_service_running = state.service_manager.is_running().await;
    let kernel_installed = crate::kernel::get_singbox_executable().is_some();
    let kernel_version = if kernel_installed {
        crate::kernel::get_singbox_executable()
            .and_then(|p| crate::kernel::get_installed_kernel_version(&p))
    } else {
        None
    };

    Ok(Json(serde_json::json!({
        "config_id": config_id,
        "is_service_running": is_service_running,
        "kernel_installed": kernel_installed,
        "kernel_version": kernel_version,
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
        message: format!("正在保存运行配置参数 (配置ID: {:?})...", payload.config_id),
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

    logs.push(ExecutionStepLog {
        step: "保存参数".to_string(),
        status: "success".to_string(),
        message: "运行设置已成功保存至系统数据库".to_string(),
        timestamp: get_execution_timestamp(),
    });

    // 2. If execute_update is true, we perform the update step by step
    if payload.execute_update {
        // STEP 1: 检查 sing-box 内核是否已安装
        logs.push(ExecutionStepLog {
            step: "内核检查".to_string(),
            status: "info".to_string(),
            message: "正在检查 sing-box 核心内核安装状态...".to_string(),
            timestamp: get_execution_timestamp(),
        });

        let singbox_bin = match crate::kernel::get_singbox_executable() {
            Some(bin) => {
                logs.push(ExecutionStepLog {
                    step: "内核检查".to_string(),
                    status: "success".to_string(),
                    message: format!("检测到可用内核: {}", bin.display()),
                    timestamp: get_execution_timestamp(),
                });
                bin
            }
            None => {
                let err_msg = "未检测到已安装的 sing-box 内核，无法启动服务。请先前往控制中心下载并安装 sing-box 内核。".to_string();
                logs.push(ExecutionStepLog {
                    step: "内核检查".to_string(),
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
                "正在读取配置模板 #{} 内容并构建 sing-box 配置...",
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

        logs.push(ExecutionStepLog {
            step: "生成配置".to_string(),
            status: "success".to_string(),
            message: format!(
                "配置模板 #{} 读取并整合生成 sing-box 核心配置成功",
                config_id
            ),
            timestamp: get_execution_timestamp(),
        });

        // STEP 4: 使用 sing-box 核心内核启动/重启服务
        logs.push(ExecutionStepLog {
            step: "核心运行".to_string(),
            status: "info".to_string(),
            message: format!(
                "正在使用 sing-box 核心内核 ({}) 启动服务...",
                singbox_bin.display()
            ),
            timestamp: get_execution_timestamp(),
        });

        let sudo_pass = payload.sudo_pass.filter(|p| !p.trim().is_empty());

        match state
            .service_manager
            .restart_with_sudo(&generated, sudo_pass.as_deref())
            .await
        {
            Ok(_) => {
                logs.push(ExecutionStepLog {
                    step: "核心运行".to_string(),
                    status: "success".to_string(),
                    message: "sing-box 核心服务已成功启动并加载最新配置".to_string(),
                    timestamp: get_execution_timestamp(),
                });
                return Ok(Json(serde_json::json!({
                    "status": "success",
                    "message": "sing-box 核心服务已成功启动并加载最新配置",
                    "logs": logs
                })));
            }
            Err(e) => {
                let err_msg = format!("启动 sing-box 服务失败: {}", e);
                logs.push(ExecutionStepLog {
                    step: "核心运行".to_string(),
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

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "配置设置已保存",
        "logs": logs
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_format_singbox_error_missing_tags_with_outbound_info() {
        let raw_err = "FATAL[0000] initialize outbound[72]: missing tags";
        let mut outbounds = Vec::new();
        for i in 0..72 {
            outbounds.push(json!({"tag": format!("node-{}", i), "type": "direct"}));
        }
        outbounds.push(json!({"tag": "HK-Group", "type": "selector", "outbounds": []}));

        let config = json!({ "outbounds": outbounds });
        let formatted = format_singbox_error(raw_err, Some(&config));

        assert!(formatted.contains("第 73 个出站 \"HK-Group\" (selector) 校验失败"));
        assert!(formatted.contains("未指定任何目标节点/出站 (outbounds 列表为空)"));
    }

    #[test]
    fn test_format_singbox_error_missing_tags_without_config() {
        let raw_err = "FATAL[0000] initialize outbound[72]: missing tags";
        let formatted = format_singbox_error(raw_err, None);

        assert!(formatted.contains("第 73 个出站 (索引 #72) 校验失败"));
        assert!(formatted.contains("未指定任何目标节点/出站 (outbounds 列表为空)"));
    }
}
