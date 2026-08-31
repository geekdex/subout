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
    pub node_types: Option<String>,
    pub subscriptions: Option<String>,
    pub include_keywords: Option<String>,
    pub exclude_keywords: Option<String>,
}

fn resolve_static_nodes_if_dynamic(
    conn: &rusqlite::Connection,
    payload: &OutboundGroupRequest,
) -> Option<String> {
    let is_dynamic = payload.node_types.is_some()
        || payload.subscriptions.is_some()
        || payload.include_keywords.is_some()
        || payload.exclude_keywords.is_some();

    if is_dynamic {
        let dummy_group = db::OutboundGroup {
            id: 0,
            tag: payload.tag.clone(),
            group_type: payload.group_type.clone(),
            url: payload.url.clone(),
            interval: payload.interval.clone(),
            tolerance: payload.tolerance,
            static_nodes: payload.static_nodes.clone(),
            node_types: payload.node_types.clone(),
            subscriptions: payload.subscriptions.clone(),
            include_keywords: payload.include_keywords.clone(),
            exclude_keywords: payload.exclude_keywords.clone(),
        };
        if let Ok(resolved) = db::resolve_group_nodes(conn, &dummy_group) {
            return Some(serde_json::to_string(&resolved).unwrap_or_else(|_| "[]".to_string()));
        }
    }
    payload.static_nodes.clone()
}

pub async fn get_groups(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<db::OutboundGroup>>, (StatusCode, Json<serde_json::Value>)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, Json(serde_json::json!({ "error": "未授权" }))))?;
    let conn = get_db_conn(&state.db_path).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "数据库连接失败" })),
        )
    })?;
    let groups = db::get_outbound_groups(&conn).map_err(|e| {
        eprintln!(
            "[groups::get_groups] Failed to query outbound_groups: {:?}",
            e
        );
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("获取出站分组列表失败: {}", e) })),
        )
    })?;

    Ok(Json(groups))
}

pub async fn add_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<OutboundGroupRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, Json(serde_json::json!({ "error": "未授权" }))))?;
    let conn = get_db_conn(&state.db_path).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "数据库连接失败" })),
        )
    })?;

    let tag = payload.tag.trim();
    if tag.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "保存分组失败，出站 Tag 名字不能为空" })),
        ));
    }

    if tag.eq_ignore_ascii_case("direct")
        || tag.eq_ignore_ascii_case("block")
        || tag.eq_ignore_ascii_case("dns-out")
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                serde_json::json!({ "error": format!("保存分组失败，出站 Tag 不能使用系统保留名称 '{}'", tag) }),
            ),
        ));
    }

    let exists_in_groups: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM outbound_groups WHERE LOWER(tag) = LOWER(?1))",
            [tag],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if exists_in_groups {
        return Err((
            StatusCode::CONFLICT,
            Json(
                serde_json::json!({ "error": format!("保存分组失败，出站 Tag 名字必须唯一 ('{}' 已存在于分流出站组)", tag) }),
            ),
        ));
    }

    let exists_in_nodes: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM nodes WHERE LOWER(tag) = LOWER(?1))",
            [tag],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if exists_in_nodes {
        return Err((
            StatusCode::CONFLICT,
            Json(
                serde_json::json!({ "error": format!("保存分组失败，出站 Tag 不能与节点重名 ('{}' 已存在于节点池中)", tag) }),
            ),
        ));
    }

    let final_static_nodes = resolve_static_nodes_if_dynamic(&conn, &payload);

    db::save_outbound_group(
        &conn,
        tag,
        &payload.group_type,
        payload.url.as_deref(),
        payload.interval.as_deref(),
        payload.tolerance,
        final_static_nodes.as_deref(),
        payload.node_types.as_deref(),
        payload.subscriptions.as_deref(),
        payload.include_keywords.as_deref(),
        payload.exclude_keywords.as_deref(),
    )
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "保存出站组失败" })),
        )
    })?;

    let _ = db::log_history(
        &conn,
        "出站组管理",
        "添加出站组",
        &format!("添加出站组: {}", tag),
        final_static_nodes.as_deref(),
    );

    Ok(StatusCode::CREATED)
}

pub async fn update_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<OutboundGroupRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, Json(serde_json::json!({ "error": "未授权" }))))?;
    let conn = get_db_conn(&state.db_path).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "数据库连接失败" })),
        )
    })?;

    let tag = payload.tag.trim();
    if tag.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "保存分组失败，出站 Tag 名字不能为空" })),
        ));
    }

    if tag.eq_ignore_ascii_case("direct")
        || tag.eq_ignore_ascii_case("block")
        || tag.eq_ignore_ascii_case("dns-out")
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(
                serde_json::json!({ "error": format!("保存分组失败，出站 Tag 不能使用系统保留名称 '{}'", tag) }),
            ),
        ));
    }

    let exists_in_groups: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM outbound_groups WHERE LOWER(tag) = LOWER(?1) AND id != ?2)",
            rusqlite::params![tag, id],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if exists_in_groups {
        return Err((
            StatusCode::CONFLICT,
            Json(
                serde_json::json!({ "error": format!("保存分组失败，出站 Tag 名字必须唯一 ('{}' 已存在于分流出站组)", tag) }),
            ),
        ));
    }

    let exists_in_nodes: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM nodes WHERE LOWER(tag) = LOWER(?1))",
            [tag],
            |r| r.get(0),
        )
        .unwrap_or(false);

    if exists_in_nodes {
        return Err((
            StatusCode::CONFLICT,
            Json(
                serde_json::json!({ "error": format!("保存分组失败，出站 Tag 不能与节点重名 ('{}' 已存在于节点池中)", tag) }),
            ),
        ));
    }

    let final_static_nodes = resolve_static_nodes_if_dynamic(&conn, &payload);

    conn.execute(
        "UPDATE outbound_groups SET tag = ?, group_type = ?, url = ?, interval = ?, tolerance = ?, static_nodes = ?, node_types = ?, subscriptions = ?, include_keywords = ?, exclude_keywords = ? WHERE id = ?",
        rusqlite::params![
            tag,
            payload.group_type,
            payload.url,
            payload.interval,
            payload.tolerance,
            final_static_nodes,
            payload.node_types,
            payload.subscriptions,
            payload.include_keywords,
            payload.exclude_keywords,
            id
        ],
    ).map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "更新出站组失败" }))))?;

    let _ = db::log_history(
        &conn,
        "出站组管理",
        "修改出站组",
        &format!("修改出站组: {}", tag),
        final_static_nodes.as_deref(),
    );

    Ok(StatusCode::OK)
}

pub async fn sync_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<db::OutboundGroup>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let groups = db::get_outbound_groups(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut group = groups
        .into_iter()
        .find(|g| g.id == id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let resolved =
        db::resolve_group_nodes(&conn, &group).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let resolved_json = serde_json::to_string(&resolved).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "UPDATE outbound_groups SET static_nodes = ? WHERE id = ?",
        rusqlite::params![resolved_json, id],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    group.static_nodes = Some(resolved_json.clone());

    let _ = db::log_history(
        &conn,
        "出站组管理",
        "同步出站组节点",
        &format!(
            "同步出站组 '{}' 的节点，匹配到 {} 个节点",
            group.tag,
            resolved.len()
        ),
        Some(&resolved_json),
    );

    Ok(Json(group))
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
        if let Ok(t) = tx.query_row("SELECT tag FROM outbound_groups WHERE id = ?", [*id], |r| {
            r.get(0)
        }) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_static_nodes_if_dynamic() {
        let conn = db::init_db(":memory:").unwrap();
        let sub_id = db::add_subscription(&conn, "http://example.com", "sub1", "[]", true).unwrap();
        db::save_node(
            &conn,
            Some(sub_id),
            "HK-Node-01",
            "vless",
            "hk.example.com",
            443,
            "{}",
            true,
            false,
        )
        .unwrap();
        db::save_node(
            &conn,
            Some(sub_id),
            "JP-Node-01",
            "vless",
            "jp.example.com",
            443,
            "{}",
            true,
            false,
        )
        .unwrap();

        let req = OutboundGroupRequest {
            tag: "hk_group".to_string(),
            group_type: "selector".to_string(),
            url: None,
            interval: None,
            tolerance: None,
            static_nodes: Some("[]".to_string()),
            node_types: Some("all".to_string()),
            subscriptions: Some("all".to_string()),
            include_keywords: Some("hk".to_string()),
            exclude_keywords: None,
        };

        let static_nodes_json = resolve_static_nodes_if_dynamic(&conn, &req).unwrap();
        let parsed: Vec<String> = serde_json::from_str(&static_nodes_json).unwrap();
        assert_eq!(parsed, vec!["HK-Node-01"]);
    }
}
