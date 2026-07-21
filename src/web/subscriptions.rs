use axum::{
    Json,
    extract::{Path, State},
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
    let conn = get_db_conn(&state.db_path)?;

    let kws = payload.filter_keywords.unwrap_or_else(|| "[]".to_string());
    let delete_on_update = payload.delete_on_update.unwrap_or(true);
    db::update_subscription(
        &conn,
        id,
        &payload.url,
        &payload.label,
        &kws,
        payload.enabled.unwrap_or(true),
        delete_on_update,
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(
        &conn,
        "订阅管理",
        "修改订阅",
        &format!("更新订阅源: {}", payload.label),
        Some(&payload.url),
    );

    Ok(StatusCode::OK)
}

pub async fn delete_subscription(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let label: Option<String> = conn
        .query_row("SELECT label FROM subscriptions WHERE id = ?", [id], |r| {
            r.get(0)
        })
        .ok();
    let detail = format!("删除订阅源: {}", label.unwrap_or_else(|| id.to_string()));

    db::delete_subscription(&conn, id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(&conn, "订阅管理", "删除订阅", &detail, None);

    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct BatchDeleteRequest {
    pub ids: Vec<i64>,
}

pub async fn batch_delete_subscriptions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BatchDeleteRequest>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let mut conn = get_db_conn(&state.db_path)?;

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
        let _ = tx.execute("DELETE FROM subscriptions WHERE id = ?", [id]);
        let _ = tx.execute("DELETE FROM nodes WHERE subscription_id = ?", [id]);
    }
    tx.commit().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(
        &conn,
        "订阅管理",
        "批量删除订阅",
        &format!("批量删除订阅源: {}", labels.join(", ")),
        None,
    );

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
            Ok(_) => vec![format!("Successfully fetched subscription ID {}.", sub_id)],
            Err(e) => vec![format!("Failed to fetch subscription ID {}: {}", sub_id, e)],
        }
    } else {
        fetcher::fetch_all_active_subscriptions(&state.db_path)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    Ok(Json(FetchResponse { results }))
}
