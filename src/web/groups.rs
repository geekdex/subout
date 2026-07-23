use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;

use crate::db;
use crate::web::{AppState, check_auth, get_db_conn, subscriptions::BatchDeleteRequest};

#[derive(Deserialize)]
pub struct OutboundGroupRequest {
    pub tag: String,
    pub group_type: String,
    pub url: Option<String>,
    pub interval: Option<String>,
    pub tolerance: Option<i64>,
    pub static_nodes: Option<String>,
}

pub async fn get_groups(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<db::OutboundGroup>>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    let groups = db::get_outbound_groups(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(groups))
}

pub async fn add_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<OutboundGroupRequest>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    db::save_outbound_group(
        &conn,
        &payload.tag,
        &payload.group_type,
        payload.url.as_deref(),
        payload.interval.as_deref(),
        payload.tolerance,
        payload.static_nodes.as_deref(),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(
        &conn,
        "出站组管理",
        "添加出站组",
        &format!("添加出站组: {}", payload.tag),
        payload.static_nodes.as_deref(),
    );

    Ok(StatusCode::CREATED)
}

pub async fn update_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<OutboundGroupRequest>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    conn.execute(
        "UPDATE outbound_groups SET tag = ?, group_type = ?, url = ?, interval = ?, tolerance = ?, static_nodes = ? WHERE id = ?",
        rusqlite::params![
            payload.tag,
            payload.group_type,
            payload.url,
            payload.interval,
            payload.tolerance,
            payload.static_nodes,
            id
        ],
    ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(
        &conn,
        "出站组管理",
        "修改出站组",
        &format!("修改出站组: {}", payload.tag),
        payload.static_nodes.as_deref(),
    );

    Ok(StatusCode::OK)
}

pub async fn delete_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let tag: Option<String> = conn
        .query_row("SELECT tag FROM outbound_groups WHERE id = ?", [id], |r| {
            r.get(0)
        })
        .ok();
    let detail = format!("删除出站组: {}", tag.unwrap_or_else(|| id.to_string()));

    db::delete_outbound_group(&conn, id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(&conn, "出站组管理", "删除出站组", &detail, None);

    Ok(StatusCode::OK)
}

pub async fn batch_delete_groups(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BatchDeleteRequest>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let mut conn = get_db_conn(&state.db_path)?;

    let tx = conn
        .transaction()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut tags: Vec<String> = Vec::new();
    for id in &payload.ids {
        if let Ok(t) = tx.query_row("SELECT tag FROM outbound_groups WHERE id = ?", [*id], |r| r.get(0)) {
            tags.push(t);
        }
        let _ = tx.execute("DELETE FROM outbound_groups WHERE id = ?", [id]);
    }
    tx.commit().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(
        &conn,
        "出站组管理",
        "批量删除出站组",
        &format!("批量删除出站组: {}", tags.join(", ")),
        None,
    );

    Ok(StatusCode::OK)
}
