use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Semaphore;

use crate::db;
use crate::web::{AppState, check_auth, get_db_conn, subscriptions::BatchDeleteRequest};

#[derive(Deserialize)]
pub struct CustomNodeRequest {
    pub tag: String,
    pub node_type: String,
    pub server: String,
    pub port: u16,
    pub raw_json: String,
}

#[derive(Deserialize)]
pub struct NodesQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
    pub search: Option<String>,
    pub subscription_id: Option<i64>,
    pub tcp_filter: Option<String>,
    pub web_filter: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateNodeRequest {
    pub tag: Option<String>,
    pub node_type: Option<String>,
    pub server: Option<String>,
    pub port: Option<u16>,
    pub raw_json: Option<String>,
    pub enabled: Option<bool>,
}

pub async fn get_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<NodesQuery>,
) -> Result<Json<db::NodesPage>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(20);
    let search = query.search.unwrap_or_default();
    let sub_id = query.subscription_id;
    let tcp_filter = query.tcp_filter.as_deref();
    let web_filter = query.web_filter.as_deref();

    let nodes_page =
        db::get_nodes_paginated(&conn, page, limit, &search, sub_id, tcp_filter, web_filter)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(nodes_page))
}

pub async fn add_custom_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CustomNodeRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    if let Err(err_msg) = validate_node_json(
        &payload.tag,
        &payload.node_type,
        &payload.server,
        payload.port,
        &payload.raw_json,
    ) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("节点校验失败: {}", err_msg),
        ));
    }

    db::save_node(
        &conn,
        None,
        &payload.tag,
        &payload.node_type,
        &payload.server,
        payload.port,
        &payload.raw_json,
        true,
        true,
    )
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "保存节点失败，节点 Tag 名字必须唯一".to_string(),
        )
    })?;

    let _ = db::log_history(
        &conn,
        "节点管理",
        "添加自定义节点",
        &format!("添加自定义节点: {}", payload.tag),
        Some(&payload.raw_json),
    );

    Ok(StatusCode::CREATED)
}

pub async fn update_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateNodeRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let conn =
        get_db_conn(&state.db_path).map_err(|status| (status, "数据库连接失败".to_string()))?;

    if let Some(enabled) = payload.enabled {
        let tag: String = conn
            .query_row("SELECT tag FROM nodes WHERE id = ?", [id], |r| r.get(0))
            .unwrap_or_else(|_| id.to_string());
        db::update_node_status(&conn, id, enabled).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "更新启用状态失败".to_string(),
            )
        })?;
        let _ = db::log_history(
            &conn,
            "节点管理",
            if enabled {
                "启用节点"
            } else {
                "禁用节点"
            },
            &format!("{}节点: {}", if enabled { "启用" } else { "禁用" }, tag),
            None,
        );
    }

    if let (Some(tag), Some(node_type), Some(server), Some(port), Some(raw_json)) = (
        &payload.tag,
        &payload.node_type,
        &payload.server,
        payload.port,
        &payload.raw_json,
    ) {
        if let Err(err_msg) = validate_node_json(tag, node_type, server, port, raw_json) {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("节点校验失败: {}", err_msg),
            ));
        }

        let old_node = db::get_node_by_id(&conn, id).ok().flatten();
        let mut detail_parts = Vec::new();
        if let Some(ref old) = old_node {
            if old.tag != *tag {
                detail_parts.push(format!("标签: {} → {}", old.tag, tag));
            }
            if old.node_type != *node_type {
                detail_parts.push(format!("类型: {} → {}", old.node_type, node_type));
            }
            if old.server != *server {
                detail_parts.push(format!("地址: {} → {}", old.server, server));
            }
            if old.port != port as i64 {
                detail_parts.push(format!("端口: {} → {}", old.port, port));
            }
            let old_json: Value = serde_json::from_str(&old.raw_json).unwrap_or(Value::Null);
            let new_json: Value = serde_json::from_str(raw_json).unwrap_or(Value::Null);
            let diff_str = diff_json(&old_json, &new_json);
            if diff_str != "没有检测到实际改动" {
                detail_parts.push(format!("配置变动: {}", diff_str));
            }
        }
        let detail = if detail_parts.is_empty() {
            format!("更新节点 '{}' (无关键字段变化)", tag)
        } else {
            format!("更新节点 '{}': {}", tag, detail_parts.join(", "))
        };

        db::update_node_details(&conn, id, tag, node_type, server, port, raw_json).map_err(
            |_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "修改节点失败，名称 tag 必须唯一".to_string(),
                )
            },
        )?;
        let _ = db::log_history(&conn, "节点管理", "更新节点详情", &detail, Some(raw_json));
    }

    Ok(StatusCode::OK)
}

pub async fn delete_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let tag: Option<String> = conn
        .query_row("SELECT tag FROM nodes WHERE id = ?", [id], |r| r.get(0))
        .ok();
    let detail = format!("删除节点: {}", tag.unwrap_or_else(|| id.to_string()));

    db::delete_node(&conn, id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(&conn, "节点管理", "删除节点", &detail, None);

    Ok(StatusCode::OK)
}

pub async fn batch_delete_nodes(
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
        if let Ok(t) = tx.query_row("SELECT tag FROM nodes WHERE id = ?", [*id], |r| r.get(0)) {
            tags.push(t);
        }
        let _ = tx.execute("DELETE FROM nodes WHERE id = ?", [id]);
    }
    tx.commit().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let _ = db::log_history(
        &conn,
        "节点管理",
        "批量删除节点",
        &format!("批量删除节点: {}", tags.join(", ")),
        None,
    );

    Ok(StatusCode::OK)
}

pub fn validate_json(_section: &str, _value: &Value) -> Result<(), String> {
    Ok(())
}

pub fn validate_node_json(
    tag: &str,
    node_type: &str,
    server: &str,
    port: u16,
    raw_json: &str,
) -> Result<(), String> {
    let val: serde_json::Value =
        serde_json::from_str(raw_json).map_err(|e| format!("JSON 语法错误: {}", e))?;
    let obj = val
        .as_object()
        .ok_or_else(|| "JSON 必须是对象格式".to_string())?;

    let json_tag = obj
        .get("tag")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "JSON 配置中缺少 tag 字段".to_string())?;
    if json_tag != tag {
        return Err(format!(
            "JSON 中的 tag ('{}') 必须与节点名称 ('{}') 一致",
            json_tag, tag
        ));
    }

    let json_type = obj
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "JSON 配置中缺少 type 字段".to_string())?;
    if json_type != node_type {
        return Err(format!(
            "JSON 中的 type ('{}') 必须与协议类型 ('{}') 一致",
            json_type, node_type
        ));
    }

    let json_server = obj
        .get("server")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "JSON 配置中缺少 server 字段".to_string())?;
    if json_server != server {
        return Err(format!(
            "JSON 中的 server ('{}') 必须与服务器地址 ('{}') 一致",
            json_server, server
        ));
    }

    let json_port = obj
        .get("server_port")
        .or_else(|| obj.get("port"))
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "JSON 配置中缺少 server_port / port 字段".to_string())?;
    if json_port != port as u64 {
        return Err(format!(
            "JSON 中的端口 ('{}') 必须与输入框中的端口 ('{}') 一致",
            json_port, port
        ));
    }

    validate_json("node", &val)?;

    Ok(())
}

pub fn diff_json(old_val: &Value, new_val: &Value) -> String {
    if old_val == new_val {
        return "没有检测到实际改动".to_string();
    }
    match (old_val, new_val) {
        (Value::Object(old_obj), Value::Object(new_obj)) => {
            let mut changes = Vec::new();
            for (key, val) in new_obj {
                if !old_obj.contains_key(key) {
                    changes.push(format!("新增字段 '{}'", key));
                } else {
                    let old_field_val = &old_obj[key];
                    if old_field_val != val {
                        if (!old_field_val.is_object() && !old_field_val.is_array())
                            && (!val.is_object() && !val.is_array())
                        {
                            changes
                                .push(format!("修改字段 '{}' ({} → {})", key, old_field_val, val));
                        } else {
                            changes.push(format!("更新字段 '{}' 内容", key));
                        }
                    }
                }
            }
            for key in old_obj.keys() {
                if !new_obj.contains_key(key) {
                    changes.push(format!("删除字段 '{}'", key));
                }
            }
            if changes.is_empty() {
                "更新了配置内容".to_string()
            } else {
                changes.join(", ")
            }
        }
        (Value::Array(old_arr), Value::Array(new_arr)) => {
            format!("更新列表 (长度 {} → {})", old_arr.len(), new_arr.len())
        }
        _ => {
            format!("修改配置 ({} → {})", old_val, new_val)
        }
    }
}

#[derive(Deserialize)]
pub struct PingRequest {
    pub ids: Vec<i64>,
    pub test_type: Option<String>,
    pub target_url: Option<String>,
}

#[derive(Serialize)]
pub struct PingResponse {
    pub id: i64,
    pub latency: Option<u64>,
    pub tcp_latency: Option<u64>,
    pub web_latency: Option<u64>,
}

struct SingBoxGuard {
    child: Option<tokio::process::Child>,
    temp_file_path: std::path::PathBuf,
}

impl Drop for SingBoxGuard {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
        }
        let _ = std::fs::remove_file(&self.temp_file_path);
    }
}

fn is_udp_protocol(node_type: &str) -> bool {
    let t = node_type.to_lowercase();
    t == "hysteria2" || t == "hysteria" || t == "tuic" || t == "wireguard"
}

async fn test_transport_latency(server: &str, port: u16, node_type: &str) -> Option<u64> {
    let start = Instant::now();
    let addr = format!("{}:{}", server, port);
    let timeout_duration = Duration::from_millis(2000);

    if is_udp_protocol(node_type) {
        tokio::time::timeout(timeout_duration, async {
            let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await.ok()?;
            socket.connect(&addr).await.ok()?;

            // QUIC Long Header packet (Initial packet probe for Hysteria 2 / QUIC)
            let mut quic_probe = [0u8; 1200];
            quic_probe[0] = 0xc0; // Long Header (Initial)
            quic_probe[1] = 0x00;
            quic_probe[2] = 0x00;
            quic_probe[3] = 0x01; // Version 1
            socket.send(&quic_probe).await.ok()?;

            let mut buf = [0u8; 512];
            match socket.recv(&mut buf).await {
                Ok(_) => Some(start.elapsed().as_millis() as u64),
                Err(e) if e.kind() == std::io::ErrorKind::ConnectionRefused => None,
                _ => Some(start.elapsed().as_millis() as u64),
            }
        })
        .await
        .ok()
        .flatten()
    } else {
        match tokio::time::timeout(timeout_duration, tokio::net::TcpStream::connect(&addr)).await {
            Ok(Ok(_stream)) => Some(start.elapsed().as_millis() as u64),
            _ => None,
        }
    }
}

async fn test_node_web_latency(
    raw_json: String,
    target_url: String,
    sem: Arc<Semaphore>,
) -> Option<u64> {
    let _permit = sem.acquire().await.ok()?;

    tokio::time::timeout(Duration::from_secs(5), async {
        // 1. Get a random free port
        let port = {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").ok()?;
            let port = listener.local_addr().ok()?.port();
            drop(listener);
            port
        };

        // 2. Parse the outbound configuration
        let mut outbound_json: Value = serde_json::from_str(&raw_json).ok()?;
        if let Some(obj) = outbound_json.as_object_mut() {
            obj.insert("tag".to_string(), Value::String("proxy".to_string()));
        } else {
            return None;
        }

        // 3. Write a temporary config file
        let temp_dir = std::env::temp_dir();
        let temp_file_path =
            temp_dir.join(format!("singbox_test_{}_{}.json", port, std::process::id()));

        let config = serde_json::json!({
            "log": {
                "level": "error"
            },
            "inbounds": [
                {
                    "type": "http",
                    "tag": "http-in",
                    "listen": "127.0.0.1",
                    "listen_port": port
                }
            ],
            "outbounds": [
                outbound_json,
                {
                    "type": "direct",
                    "tag": "direct"
                }
            ]
        });

        let config_str = serde_json::to_string(&config).ok()?;
        std::fs::write(&temp_file_path, config_str).ok()?;

        // 4. Start sing-box
        let mut child = tokio::process::Command::new("sing-box")
            .args(["run", "-c", temp_file_path.to_str()?])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .ok()?;

        // 5. Wait for the proxy port to be ready (up to 2.0 seconds)
        let mut ready = false;
        for _ in 0..40 {
            if let Ok(Some(_)) = child.try_wait() {
                // Child process exited prematurely
                break;
            }
            if tokio::net::TcpStream::connect(format!("127.0.0.1:{}", port))
                .await
                .is_ok()
            {
                ready = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        let mut _guard = SingBoxGuard {
            child: Some(child),
            temp_file_path,
        };

        let mut latency = None;
        if ready {
            let start = Instant::now();
            if let Ok(proxy) = reqwest::Proxy::all(format!("http://127.0.0.1:{}", port)) {
                if let Ok(client) = reqwest::Client::builder()
                    .proxy(proxy)
                    .timeout(Duration::from_millis(3000))
                    .build()
                {
                    if client.get(&target_url).send().await.is_ok() {
                        latency = Some(start.elapsed().as_millis() as u64);
                    }
                }
            }
        }

        latency
    })
    .await
    .ok()
    .flatten()
}

pub async fn ping_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PingRequest>,
) -> Result<Json<Vec<PingResponse>>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut nodes_to_ping = Vec::new();
    for id in payload.ids {
        let res: Result<(String, i64, String, String), rusqlite::Error> = conn.query_row(
            "SELECT server, port, raw_json, node_type FROM nodes WHERE id = ?",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        );
        if let Ok((server, port, raw_json, node_type)) = res {
            nodes_to_ping.push((id, server, port as u16, raw_json, node_type));
        } else {
            nodes_to_ping.push((id, String::new(), 0, String::new(), String::new()));
        }
    }

    drop(conn);

    let test_type = payload.test_type.as_deref().unwrap_or("tcp");
    let target_url = payload
        .target_url
        .unwrap_or_else(|| "http://www.gstatic.com/generate_204".to_string());

    let mut tasks = Vec::new();
    if test_type == "web" {
        let sem = Arc::new(Semaphore::new(8)); // Limit to 8 concurrent processes to avoid high CPU/network usage
        for (id, server, _port, raw_json, _node_type) in nodes_to_ping {
            if server.is_empty() || raw_json.is_empty() {
                tasks.push(tokio::spawn(async move {
                    PingResponse {
                        id,
                        latency: None,
                        tcp_latency: None,
                        web_latency: None,
                    }
                }));
                continue;
            }
            let sem = sem.clone();
            let target_url = target_url.clone();
            tasks.push(tokio::spawn(async move {
                let latency = test_node_web_latency(raw_json, target_url, sem).await;
                PingResponse {
                    id,
                    latency,
                    tcp_latency: None,
                    web_latency: latency,
                }
            }));
        }
    } else if test_type == "both" {
        let sem = Arc::new(Semaphore::new(8));
        for (id, server, port, raw_json, node_type) in nodes_to_ping {
            if server.is_empty() || port == 0 || raw_json.is_empty() {
                tasks.push(tokio::spawn(async move {
                    PingResponse {
                        id,
                        latency: None,
                        tcp_latency: None,
                        web_latency: None,
                    }
                }));
                continue;
            }
            let sem = sem.clone();
            let target_url = target_url.clone();
            tasks.push(tokio::spawn(async move {
                // 1. Test transport connectivity (TCP stream for TCP nodes, UDP probe for UDP nodes like Hysteria2)
                let tcp_latency = test_transport_latency(&server, port, &node_type).await;

                // 2. Test Web latency regardless of transport probe result
                let web_latency = test_node_web_latency(raw_json, target_url, sem).await;
                PingResponse {
                    id,
                    latency: web_latency.or(tcp_latency),
                    tcp_latency,
                    web_latency,
                }
            }));
        }
    } else {
        // default / tcp (transport level test)
        for (id, server, port, _raw_json, node_type) in nodes_to_ping {
            if server.is_empty() || port == 0 {
                tasks.push(tokio::spawn(async move {
                    PingResponse {
                        id,
                        latency: None,
                        tcp_latency: None,
                        web_latency: None,
                    }
                }));
                continue;
            }
            tasks.push(tokio::spawn(async move {
                let latency = test_transport_latency(&server, port, &node_type).await;
                PingResponse {
                    id,
                    latency,
                    tcp_latency: latency,
                    web_latency: None,
                }
            }));
        }
    }

    let mut results = Vec::new();
    for task in tasks {
        if let Ok(res) = task.await {
            results.push(res);
        }
    }

    if let Ok(conn) = get_db_conn(&state.db_path) {
        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let target_url_opt = if test_type == "web" || test_type == "both" {
            Some(target_url.as_str())
        } else {
            None
        };
        for item in &results {
            let (tcp, web) = match test_type {
                "both" => (
                    Some(item.tcp_latency.map(|v| v as i64).unwrap_or(-1)),
                    Some(item.web_latency.map(|v| v as i64).unwrap_or(-1)),
                ),
                "web" => (None, Some(item.web_latency.map(|v| v as i64).unwrap_or(-1))),
                _ => (Some(item.tcp_latency.map(|v| v as i64).unwrap_or(-1)), None),
            };
            let _ = db::update_node_ping_result(&conn, item.id, tcp, web, &now_str, target_url_opt);
        }
    }

    Ok(Json(results))
}
