use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::simple_config::{self, SimpleConfig};
use crate::web::config::validate_config_with_singbox;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Serialize)]
pub struct SimpleConfigResponse {
    pub config: SimpleConfig,
    pub generated: Value,
}

#[derive(Deserialize)]
pub struct SaveSimpleConfigRequest {
    pub config: SimpleConfig,
    pub apply: Option<bool>,
    pub sudo_pass: Option<String>,
}

pub async fn get_simple_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SimpleConfigResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let cfg = simple_config::get_saved_simple_config(&conn);
    let generated =
        simple_config::generate_simple_singbox_config(&conn, &cfg).unwrap_or(serde_json::json!({}));

    Ok(Json(SimpleConfigResponse {
        config: cfg,
        generated,
    }))
}

pub async fn save_simple_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SaveSimpleConfigRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let generated = simple_config::generate_simple_singbox_config(&conn, &payload.config)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("生成简单配置失败: {}", e)))?;

    let log = generated
        .get("log")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let dns = generated
        .get("dns")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let inbounds = generated
        .get("inbounds")
        .cloned()
        .unwrap_or(serde_json::json!([]));
    let outbounds = generated
        .get("outbounds")
        .cloned()
        .unwrap_or(serde_json::json!([]));
    let route = generated
        .get("route")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let experimental = generated
        .get("experimental")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    if let Err(err_msg) =
        validate_config_with_singbox(&log, &dns, &inbounds, &outbounds, &route, &experimental)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("配置校验未通过: {}", err_msg),
        ));
    }

    simple_config::save_simple_config(&conn, &payload.config).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("保存配置失败: {}", e),
        )
    })?;

    if payload.apply.unwrap_or(false) {
        let sudo_pass = payload.sudo_pass.filter(|p| !p.trim().is_empty());
        if let Err(e) = state
            .service_manager
            .restart_with_sudo(&generated, sudo_pass.as_deref())
            .await
        {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("配置已保存，但重启服务失败: {}", e),
            ));
        }
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": if payload.apply.unwrap_or(false) { "简单配置已保存并成功启动/重启 sing-box 服务" } else { "简单配置已保存" },
        "generated": generated
    })))
}

pub async fn preview_simple_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SimpleConfig>,
) -> Result<Json<Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let generated = simple_config::generate_simple_singbox_config(&conn, &payload)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("生成预览失败: {}", e)))?;

    Ok(Json(generated))
}
