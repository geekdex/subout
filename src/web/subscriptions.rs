use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};

use crate::db;
use crate::fetcher;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Deserialize)]
pub struct SubRequest {
    pub url: String,
    pub label: String,
    pub filter_keywords: Option<String>,
    pub enabled: Option<bool>,
    pub delete_on_update: Option<bool>,
    pub clean_nodes: Option<bool>,
}

#[derive(Deserialize, Default)]
pub struct DeleteSubQuery {
    pub clean_nodes: Option<bool>,
}

pub async fn get_subscriptions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<db::Subscription>>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    let subs = db::get_subscriptions(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(subs))
}

pub async fn add_subscription(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SubRequest>,
) -> Result<Json<db::Subscription>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let kws = payload.filter_keywords.unwrap_or_else(|| "[]".to_string());
    let delete_on_update = payload.delete_on_update.unwrap_or(true);
    let id = db::add_subscription(&conn, &payload.url, &payload.label, &kws, delete_on_update)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(
        &conn,
        "订阅管理",
        "添加订阅",
        &format!("添加订阅源: {}", payload.label),
        Some(&payload.url),
    );

    let sub = db::Subscription {
        id,
        url: payload.url,
        label: payload.label,
        enabled: true,
        last_fetched: None,
        last_error: None,
        filter_keywords: Some(kws),
        delete_on_update: Some(delete_on_update),
        upload: None,
        download: None,
        total: None,
        expire: None,
    };
    Ok(Json(sub))
}

pub async fn update_subscription(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<SubRequest>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let mut conn = get_db_conn(&state.db_path)?;

    let kws = payload.filter_keywords.unwrap_or_else(|| "[]".to_string());
    let delete_on_update = payload.delete_on_update.unwrap_or(true);
    let enabled = payload.enabled.unwrap_or(true);
    let clean_nodes = payload.clean_nodes.unwrap_or(false);

    let label: Option<String> = conn
        .query_row("SELECT label FROM subscriptions WHERE id = ?", [id], |r| {
            r.get(0)
        })
        .ok();
    let label_str = label.unwrap_or_else(|| id.to_string());

    let tx = conn
        .transaction()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    db::update_subscription(
        &tx,
        id,
        &payload.url,
        &payload.label,
        &kws,
        enabled,
        delete_on_update,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut cleaned_nodes = 0;
    if !enabled && clean_nodes {
        cleaned_nodes =
            db::clean_subscription_nodes(&tx, id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    tx.commit().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (action, detail) = if !enabled && clean_nodes {
        (
            "停用订阅",
            format!("停用订阅源并清空节点池对应节点({cleaned_nodes}个): {label_str}"),
        )
    } else if !enabled {
        (
            "停用订阅",
            format!("停用订阅源(保留节点池现有节点): {label_str}"),
        )
    } else {
        ("修改订阅", format!("更新订阅源: {}", payload.label))
    };

    let _ = db::log_history(&conn, "订阅管理", action, &detail, Some(&payload.url));

    Ok(StatusCode::OK)
}

pub async fn delete_subscription(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Query(query): Query<DeleteSubQuery>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let label: Option<String> = conn
        .query_row("SELECT label FROM subscriptions WHERE id = ?", [id], |r| {
            r.get(0)
        })
        .ok();
    let label_str = label.unwrap_or_else(|| id.to_string());
    let clean_nodes = query.clean_nodes.unwrap_or(true);

    db::delete_subscription(&conn, id, clean_nodes)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let detail = if clean_nodes {
        format!("删除订阅源并清空节点池节点: {label_str}")
    } else {
        format!("删除订阅源(节点已转为自定义保留): {label_str}")
    };

    let _ = db::log_history(&conn, "订阅管理", "删除订阅", &detail, None);

    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct BatchDeleteRequest {
    pub ids: Vec<i64>,
    pub clean_nodes: Option<bool>,
}

pub async fn batch_delete_subscriptions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BatchDeleteRequest>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let mut conn = get_db_conn(&state.db_path)?;
    let clean_nodes = payload.clean_nodes.unwrap_or(true);

    let tx = conn
        .transaction()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut labels: Vec<String> = Vec::new();
    for id in &payload.ids {
        if let Ok(l) = tx.query_row("SELECT label FROM subscriptions WHERE id = ?", [*id], |r| {
            r.get(0)
        }) {
            labels.push(l);
        }
        if clean_nodes {
            let _ = db::clean_subscription_nodes(&tx, *id);
        } else {
            let _ = db::convert_subscription_nodes_to_custom(&tx, *id);
        }
        let _ = tx.execute("DELETE FROM subscriptions WHERE id = ?", [id]);
    }
    tx.commit().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let action_desc = if clean_nodes {
        "批量删除订阅源并清空节点池节点"
    } else {
        "批量删除订阅源(节点已转为自定义保留)"
    };
    let detail = format!("{action_desc}: {}", labels.join(", "));

    let _ = db::log_history(&conn, "订阅管理", "批量删除订阅", &detail, None);

    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct FetchRequest {
    pub subscription_id: Option<i64>,
}

#[derive(Serialize)]
pub struct FetchResponse {
    pub results: Vec<String>,
}

pub async fn fetch_subscriptions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<FetchRequest>,
) -> Result<Json<FetchResponse>, StatusCode> {
    check_auth(&state, &headers).await?;

    let results = if let Some(sub_id) = payload.subscription_id {
        match fetcher::fetch_and_update_subscription(&state.db_path, sub_id).await {
            Ok(()) => vec![format!("Successfully fetched subscription ID {}.", sub_id)],
            Err(e) => vec![format!("Failed to fetch subscription ID {}: {}", sub_id, e)],
        }
    } else {
        fetcher::fetch_all_active_subscriptions(&state.db_path)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    Ok(Json(FetchResponse { results }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sub_request_clean_nodes_deserialization() {
        let json_with_clean = r#"{
            "url": "https://example.com/sub",
            "label": "测试",
            "enabled": false,
            "clean_nodes": true
        }"#;
        let req: SubRequest = serde_json::from_str(json_with_clean).unwrap();
        assert_eq!(req.enabled, Some(false));
        assert_eq!(req.clean_nodes, Some(true));

        let json_without_clean = r#"{
            "url": "https://example.com/sub",
            "label": "测试",
            "enabled": true
        }"#;
        let req2: SubRequest = serde_json::from_str(json_without_clean).unwrap();
        assert_eq!(req2.enabled, Some(true));
        assert_eq!(req2.clean_nodes, None);
    }

    #[test]
    fn test_delete_sub_query_deserialization() {
        let json_str = r#"{"clean_nodes": false}"#;
        let q: DeleteSubQuery = serde_json::from_str(json_str).unwrap();
        assert_eq!(q.clean_nodes, Some(false));

        let empty_json = "{}";
        let q_empty: DeleteSubQuery = serde_json::from_str(empty_json).unwrap();
        assert_eq!(q_empty.clean_nodes, None);
    }

    #[test]
    fn test_batch_delete_request_clean_nodes_deserialization() {
        let json_str = r#"{"ids": [1, 2, 3], "clean_nodes": false}"#;
        let req: BatchDeleteRequest = serde_json::from_str(json_str).unwrap();
        assert_eq!(req.ids, vec![1, 2, 3]);
        assert_eq!(req.clean_nodes, Some(false));

        let json_default = r#"{"ids": [4]}"#;
        let req_default: BatchDeleteRequest = serde_json::from_str(json_default).unwrap();
        assert_eq!(req_default.clean_nodes, None);
    }
}
