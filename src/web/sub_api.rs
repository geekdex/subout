use axum::{
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};

use crate::db;
use crate::generator;
use crate::web::{AppState, get_db_conn};

/// Open subscription hosting endpoint (/sub/:token)
/// No auth required; verified via unique config Token.
/// Implements Lazy Sync Engine: checks system `node_group_version_code` and refreshes outbounds on-demand.
pub async fn serve_subscription(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Response, StatusCode> {
    let conn = get_db_conn(&state.db_path)?;
    let profile = db::get_config_profile_by_token(&conn, &token)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let latest_vcode = db::get_node_group_version_code(&conn).unwrap_or(0);

    let (final_content, effective_vcode) = if profile.version_code < latest_vcode {
        // Lazy Sync: Update nodes only, preserve route/dns/log/inbounds
        if let Ok(base_val) = serde_json::from_str::<serde_json::Value>(&profile.content) {
            match generator::sync_config_with_latest_resources(&conn, &base_val, &[]) {
                Ok((updated_val, _)) => {
                    let updated_str = serde_json::to_string_pretty(&updated_val)
                        .unwrap_or_else(|_| profile.content.clone());
                    let _ = conn.execute(
                        "UPDATE configs SET content = ?, version_code = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                        rusqlite::params![updated_str, latest_vcode, profile.id],
                    );
                    (updated_str, latest_vcode)
                }
                Err(e) => {
                    eprintln!("[/sub/:token] Lazy sync failed, using cached content: {e}");
                    (profile.content, profile.version_code)
                }
            }
        } else {
            (profile.content, profile.version_code)
        }
    } else {
        (profile.content, profile.version_code)
    };

    let mut response = final_content.into_response();
    let headers: &mut HeaderMap = response.headers_mut();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    if let Ok(val) = HeaderValue::from_str(&effective_vcode.to_string()) {
        headers.insert(
            axum::http::HeaderName::from_static("x-config-version-code"),
            val,
        );
    }
    if let Ok(val) = HeaderValue::from_str(&profile.platform) {
        headers.insert(
            axum::http::HeaderName::from_static("x-profile-platform"),
            val,
        );
    }

    Ok(response)
}
