use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
};
use futures_util::stream::Stream;
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
        return Err((StatusCode::BAD_REQUEST, format!("节点校验失败: {err_msg}")));
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
            return Err((StatusCode::BAD_REQUEST, format!("节点校验失败: {err_msg}")));
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
            if old.port != i64::from(port) {
                detail_parts.push(format!("端口: {} → {}", old.port, port));
            }
            let old_json: Value = serde_json::from_str(&old.raw_json).unwrap_or(Value::Null);
            let new_json: Value = serde_json::from_str(raw_json).unwrap_or(Value::Null);
            let diff_str = diff_json(&old_json, &new_json);
            if diff_str != "没有检测到实际改动" {
                detail_parts.push(format!("配置变动: {diff_str}"));
            }
        }
        let detail = if detail_parts.is_empty() {
            format!("更新节点 '{tag}' (无关键字段变化)")
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
        serde_json::from_str(raw_json).map_err(|e| format!("JSON 语法错误: {e}"))?;
    let obj = val
        .as_object()
        .ok_or_else(|| "JSON 必须是对象格式".to_string())?;

    let json_tag = obj
        .get("tag")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "JSON 配置中缺少 tag 字段".to_string())?;
    if json_tag != tag {
        return Err(format!(
            "JSON 中的 tag ('{json_tag}') 必须与节点名称 ('{tag}') 一致"
        ));
    }

    let json_type = obj
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "JSON 配置中缺少 type 字段".to_string())?;
    if json_type != node_type {
        return Err(format!(
            "JSON 中的 type ('{json_type}') 必须与协议类型 ('{node_type}') 一致"
        ));
    }

    let json_server = obj
        .get("server")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "JSON 配置中缺少 server 字段".to_string())?;
    if json_server != server {
        return Err(format!(
            "JSON 中的 server ('{json_server}') 必须与服务器地址 ('{server}') 一致"
        ));
    }

    let json_port = obj
        .get("server_port")
        .or_else(|| obj.get("port"))
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| "JSON 配置中缺少 server_port / port 字段".to_string())?;
    if json_port != u64::from(port) {
        return Err(format!(
            "JSON 中的端口 ('{json_port}') 必须与输入框中的端口 ('{port}') 一致"
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
                if old_obj.contains_key(key) {
                    let old_field_val = &old_obj[key];
                    if old_field_val != val {
                        if (!old_field_val.is_object() && !old_field_val.is_array())
                            && (!val.is_object() && !val.is_array())
                        {
                            changes.push(format!("修改字段 '{key}' ({old_field_val} → {val})"));
                        } else {
                            changes.push(format!("更新字段 '{key}' 内容"));
                        }
                    }
                } else {
                    changes.push(format!("新增字段 '{key}'"));
                }
            }
            for key in old_obj.keys() {
                if !new_obj.contains_key(key) {
                    changes.push(format!("删除字段 '{key}'"));
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
            format!("修改配置 ({old_val} → {new_val})")
        }
    }
}

#[derive(Deserialize)]
pub struct PingRequest {
    pub ids: Vec<i64>,
    pub test_type: Option<String>,
    pub target_url: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct SinglePingPayload {
    pub target_url: Option<String>,
    pub test_type: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TestEndpointDto {
    pub name: &'static str,
    pub url: &'static str,
}

pub const TEST_ENDPOINTS: &[TestEndpointDto] = &[
    TestEndpointDto {
        name: "Google 静态资源",
        url: "https://www.gstatic.com/generate_204",
    },
    TestEndpointDto {
        name: "Google 主站连通性",
        url: "https://www.google.com/generate_204",
    },
    TestEndpointDto {
        name: "Cloudflare 连通性",
        url: "https://cp.cloudflare.com/generate_204",
    },
    TestEndpointDto {
        name: "Apple 网络连通性",
        url: "https://captive.apple.com/hotspot-detect.html",
    },
    TestEndpointDto {
        name: "Mozilla 网络连通性",
        url: "https://detectportal.firefox.com/success.txt",
    },
    TestEndpointDto {
        name: "Cloudflare 网络诊断",
        url: "https://1.1.1.1/cdn-cgi/trace",
    },
];

pub const DEFAULT_SPEED_TEST_URL: &str = "https://www.gstatic.com/generate_204";

pub fn get_test_endpoint_name(url: &str) -> &'static str {
    for ep in TEST_ENDPOINTS {
        if ep.url == url {
            return ep.name;
        }
    }
    "自定义测试点"
}

#[derive(Serialize)]
pub struct PingResponse {
    pub id: i64,
    pub latency: Option<i64>,
    pub tcp_latency: Option<i64>,
    pub web_latency: Option<i64>,
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
    let addr = format!("{server}:{port}");
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
            if socket.recv(&mut buf).await.is_ok() {
                Some(start.elapsed().as_millis() as u64)
            } else {
                None
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

pub async fn test_node_web_latency_internal(raw_json: String, target_url: String) -> Option<u64> {
    let singbox_bin = crate::kernel::get_singbox_executable()?;

    tokio::time::timeout(Duration::from_secs(7), async {
        // 1. Get a random free port
        let port = {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").ok()?;
            let port = listener.local_addr().ok()?.port();
            drop(listener);
            port
        };

        // 2. Parse the outbound configuration
        let mut outbound_json: Value = serde_json::from_str(&raw_json).ok()?;
        {
            let obj = outbound_json.as_object_mut()?;
            obj.insert("tag".to_string(), Value::String("proxy".to_string()));
        }

        // 3. Write a temporary config file with explicit route.final = "proxy"
        let temp_file_path = crate::paths::AppPaths::get().temp_file_path(&format!("singbox_test_{port}"), ".json");

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
            ],
            "route": {
                "final": "proxy"
            }
        });

        let config_str = serde_json::to_string(&config).ok()?;
        std::fs::write(&temp_file_path, config_str).ok()?;

        // 4. Start sing-box process for local node testing
        let mut child = tokio::process::Command::new(&singbox_bin)
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
            if tokio::net::TcpStream::connect(format!("127.0.0.1:{port}"))
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
            if let Ok(proxy) = reqwest::Proxy::all(format!("http://127.0.0.1:{port}"))
                && let Ok(client) = reqwest::Client::builder()
                    .proxy(proxy)
                    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .redirect(reqwest::redirect::Policy::limited(10))
                    .timeout(Duration::from_millis(5000))
                    .build()
                && let Ok(_resp) = client.get(&target_url).send().await
            {
                // As long as the HTTP request reaches the target site and gets an HTTP response,
                // record the round-trip time directly ("返回时什么就是什么，正常网络请求")
                latency = Some(start.elapsed().as_millis() as u64);
            }
        }

        latency
    })
    .await
    .ok()
    .flatten()
}

pub async fn test_node_web_latency(
    raw_json: String,
    target_url: String,
    sem: Arc<Semaphore>,
) -> Option<u64> {
    let _permit = sem.acquire().await.ok()?;
    test_node_web_latency_internal(raw_json, target_url).await
}

pub async fn ping_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PingRequest>,
) -> Result<Json<Vec<PingResponse>>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let test_type = payload.test_type.as_deref().unwrap_or("both");
    let singbox_available = crate::kernel::get_singbox_executable().is_some();
    if test_type == "web" && !singbox_available {
        return Err((
            StatusCode::BAD_REQUEST,
            "当前系统尚未安装 sing-box 内核，无法执行节点网页延迟测试。请先在【内核管理】中一键下载安装内核。".to_string(),
        ));
    }

    let conn = get_db_conn(&state.db_path).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "数据库连接失败".to_string(),
        )
    })?;

    let ids = if payload.ids.is_empty() {
        let mut stmt = conn.prepare("SELECT id FROM nodes").map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "查询节点失败".to_string(),
            )
        })?;
        let node_ids: Vec<i64> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "查询节点失败".to_string(),
                )
            })?
            .filter_map(Result::ok)
            .collect();
        node_ids
    } else {
        payload.ids
    };

    let mut nodes_to_ping = Vec::new();
    for id in ids {
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

    let target_url = payload
        .target_url
        .unwrap_or_else(|| DEFAULT_SPEED_TEST_URL.to_string());

    let mut tasks = Vec::new();
    if test_type == "web" {
        let sem = Arc::new(Semaphore::new(8)); // Limit to 8 concurrent processes to avoid high CPU/network usage
        for (id, server, _port, raw_json, _node_type) in nodes_to_ping {
            if server.is_empty() || raw_json.is_empty() {
                tasks.push(tokio::spawn(async move {
                    PingResponse {
                        id,
                        latency: Some(-1),
                        tcp_latency: None,
                        web_latency: Some(-1),
                    }
                }));
                continue;
            }
            let sem = sem.clone();
            let target_url = target_url.clone();
            tasks.push(tokio::spawn(async move {
                let latency = test_node_web_latency(raw_json, target_url, sem).await;
                let lat_val = Some(latency.map_or(-1, |v| v as i64));
                PingResponse {
                    id,
                    latency: lat_val,
                    tcp_latency: None,
                    web_latency: lat_val,
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
                        latency: Some(-1),
                        tcp_latency: Some(-1),
                        web_latency: Some(-1),
                    }
                }));
                continue;
            }
            let sem = sem.clone();
            let target_url = target_url.clone();
            tasks.push(tokio::spawn(async move {
                // 1. Run transport probe and singbox web latency test concurrently
                let tcp_task = test_transport_latency(&server, port, &node_type);
                let web_task = test_node_web_latency(raw_json, target_url, sem);
                let (tcp_latency, web_latency) = tokio::join!(tcp_task, web_task);

                let web_val = if singbox_available {
                    Some(web_latency.map_or(-1, |v| v as i64))
                } else {
                    None
                };
                let tcp_val = Some(tcp_latency.map_or(-1, |v| v as i64));
                let primary = if let Some(w) = web_val
                    && w > 0
                {
                    Some(w)
                } else if let Some(t) = tcp_val
                    && t > 0
                {
                    Some(t)
                } else {
                    Some(-1)
                };

                PingResponse {
                    id,
                    latency: primary,
                    tcp_latency: tcp_val,
                    web_latency: web_val,
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
                        latency: Some(-1),
                        tcp_latency: Some(-1),
                        web_latency: None,
                    }
                }));
                continue;
            }
            tasks.push(tokio::spawn(async move {
                let latency = test_transport_latency(&server, port, &node_type).await;
                let tcp_val = Some(latency.map_or(-1, |v| v as i64));
                PingResponse {
                    id,
                    latency: tcp_val,
                    tcp_latency: tcp_val,
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
                "both" => (item.tcp_latency, item.web_latency),
                "web" => (None, item.web_latency),
                _ => (item.tcp_latency, None),
            };
            let _ = db::update_node_ping_result(&conn, item.id, tcp, web, &now_str, target_url_opt);
        }
    }

    Ok(Json(results))
}

pub async fn ping_single_node(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<i64>,
    body_bytes: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let payload: SinglePingPayload = if body_bytes.is_empty() {
        SinglePingPayload::default()
    } else {
        serde_json::from_slice(&body_bytes).unwrap_or_default()
    };

    let target_url = payload
        .target_url
        .unwrap_or_else(|| DEFAULT_SPEED_TEST_URL.to_string());
    let test_type = payload.test_type.unwrap_or_else(|| "both".to_string());

    let req = PingRequest {
        ids: vec![id],
        test_type: Some(test_type),
        target_url: Some(target_url),
    };
    let res = ping_nodes(State(state), headers, Json(req)).await?;
    let first = res.first();
    let lat = first.and_then(|r| r.web_latency.or(r.latency).or(r.tcp_latency));
    let tcp_lat = first.and_then(|r| r.tcp_latency);
    let web_lat = first.and_then(|r| r.web_latency);
    Ok(Json(serde_json::json!({
        "success": true,
        "latency_ms": lat,
        "tcp_latency": tcp_lat,
        "web_latency": web_lat,
    })))
}

pub async fn ping_all_nodes(
    State(state): State<AppState>,
    headers: HeaderMap,
    body_bytes: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let payload: SinglePingPayload = if body_bytes.is_empty() {
        SinglePingPayload::default()
    } else {
        serde_json::from_slice(&body_bytes).unwrap_or_default()
    };

    let target_url = payload
        .target_url
        .unwrap_or_else(|| DEFAULT_SPEED_TEST_URL.to_string());
    let test_type = payload.test_type.unwrap_or_else(|| "both".to_string());

    let req = PingRequest {
        ids: vec![],
        test_type: Some(test_type),
        target_url: Some(target_url),
    };
    let res = ping_nodes(State(state), headers, Json(req)).await?;
    Ok(Json(serde_json::json!({
        "success": true,
        "count": res.len(),
    })))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NodePingProgressEvent {
    pub id: i64,
    pub status: String, // "testing" | "completed" | "all_done"
    pub latency: Option<i64>,
    pub tcp_latency: Option<i64>,
    pub web_latency: Option<i64>,
    pub tested_at: Option<String>,
    pub target_url: Option<String>,
    pub total: Option<usize>,
    pub completed: Option<usize>,
}

pub async fn ping_nodes_stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PingRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, (StatusCode, String)>
{
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let test_type = payload.test_type.unwrap_or_else(|| "both".to_string());
    let target_url = payload
        .target_url
        .unwrap_or_else(|| DEFAULT_SPEED_TEST_URL.to_string());

    let conn = get_db_conn(&state.db_path).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "数据库连接失败".to_string(),
        )
    })?;

    let ids = if payload.ids.is_empty() {
        let mut stmt = conn.prepare("SELECT id FROM nodes").map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "查询节点失败".to_string(),
            )
        })?;
        let node_ids: Vec<i64> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "查询节点失败".to_string(),
                )
            })?
            .filter_map(Result::ok)
            .collect();
        node_ids
    } else {
        payload.ids
    };

    let mut nodes_to_ping = Vec::new();
    for id in &ids {
        let res: Result<(String, i64, String, String), rusqlite::Error> = conn.query_row(
            "SELECT server, port, raw_json, node_type FROM nodes WHERE id = ?",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        );
        if let Ok((server, port, raw_json, node_type)) = res {
            nodes_to_ping.push((*id, server, port as u16, raw_json, node_type));
        }
    }
    drop(conn);

    let total_nodes = nodes_to_ping.len();
    let (tx, rx) = tokio::sync::mpsc::channel::<NodePingProgressEvent>(64);
    let db_path = state.db_path.clone();

    tokio::spawn(async move {
        let sem = Arc::new(Semaphore::new(6));
        let completed_counter = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut tasks = Vec::new();

        for (id, server, port, raw_json, node_type) in nodes_to_ping {
            let tx = tx.clone();
            let sem = sem.clone();
            let target_url = target_url.clone();
            let test_type = test_type.clone();
            let db_path = db_path.clone();
            let completed_counter = completed_counter.clone();

            tasks.push(tokio::spawn(async move {
                // 1. Wait for semaphore permit BEFORE marking node as testing
                let Ok(_permit) = sem.acquire().await else {
                    return;
                };

                // 2. Notify frontend that this node is actively testing
                let _ = tx
                    .send(NodePingProgressEvent {
                        id,
                        status: "testing".to_string(),
                        latency: None,
                        tcp_latency: None,
                        web_latency: None,
                        tested_at: None,
                        target_url: Some(target_url.clone()),
                        total: Some(total_nodes),
                        completed: Some(
                            completed_counter.load(std::sync::atomic::Ordering::Relaxed),
                        ),
                    })
                    .await;

                // 3. Perform the test under the acquired permit
                let singbox_available = crate::kernel::get_singbox_executable().is_some();
                let (tcp_latency, web_latency) = if test_type == "web" {
                    if singbox_available && !server.is_empty() && !raw_json.is_empty() {
                        let web =
                            test_node_web_latency_internal(raw_json, target_url.clone()).await;
                        (None, Some(web.map_or(-1, |v| v as i64)))
                    } else if !singbox_available {
                        (None, None)
                    } else {
                        (None, Some(-1))
                    }
                } else if test_type == "both" {
                    if server.is_empty() || port == 0 || raw_json.is_empty() {
                        (Some(-1), Some(-1))
                    } else {
                        let tcp_task = test_transport_latency(&server, port, &node_type);
                        let web_task = async {
                            if singbox_available {
                                let w =
                                    test_node_web_latency_internal(raw_json, target_url.clone())
                                        .await;
                                Some(w.map_or(-1, |v| v as i64))
                            } else {
                                None
                            }
                        };
                        let (tcp, web) = tokio::join!(tcp_task, web_task);
                        (Some(tcp.map_or(-1, |v| v as i64)), web)
                    }
                } else {
                    // tcp only
                    let tcp = if server.is_empty() || port == 0 {
                        Some(-1)
                    } else {
                        let t = test_transport_latency(&server, port, &node_type).await;
                        Some(t.map_or(-1, |v| v as i64))
                    };
                    (tcp, None)
                };

                let primary_latency = if let Some(w) = web_latency
                    && w > 0
                {
                    Some(w)
                } else if let Some(t) = tcp_latency
                    && t > 0
                {
                    Some(t)
                } else {
                    Some(-1)
                };

                let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

                // 4. Update database for this node
                if let Ok(conn) = get_db_conn(&db_path) {
                    let (tcp_db, web_db) = match test_type.as_str() {
                        "both" => (tcp_latency, web_latency),
                        "web" => (None, web_latency),
                        _ => (tcp_latency, None),
                    };
                    let _ = db::update_node_ping_result(
                        &conn,
                        id,
                        tcp_db,
                        web_db,
                        &now_str,
                        Some(target_url.as_str()),
                    );
                }

                // Drop permit immediately so the next queued node can proceed without waiting
                drop(_permit);

                let completed =
                    completed_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;

                // 5. Send completed event for this node
                let _ = tx
                    .send(NodePingProgressEvent {
                        id,
                        status: "completed".to_string(),
                        latency: primary_latency,
                        tcp_latency,
                        web_latency,
                        tested_at: Some(now_str),
                        target_url: Some(target_url),
                        total: Some(total_nodes),
                        completed: Some(completed),
                    })
                    .await;
            }));
        }

        for task in tasks {
            let _ = task.await;
        }

        // 6. Send all_done event
        let _ = tx
            .send(NodePingProgressEvent {
                id: 0,
                status: "all_done".to_string(),
                latency: None,
                tcp_latency: None,
                web_latency: None,
                tested_at: None,
                target_url: None,
                total: Some(total_nodes),
                completed: Some(completed_counter.load(std::sync::atomic::Ordering::Relaxed)),
            })
            .await;
    });

    let stream = futures_util::stream::unfold(rx, |mut receiver| async move {
        let msg = receiver.recv().await?;
        let json_str = serde_json::to_string(&msg).ok()?;
        let event = Event::default().data(json_str);
        Some((Ok::<_, std::convert::Infallible>(event), receiver))
    });

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

pub async fn get_test_endpoints() -> Json<Vec<TestEndpointDto>> {
    Json(TEST_ENDPOINTS.to_vec())
}

pub async fn get_speed_test_summary(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<db::SpeedTestSummary>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    let summary =
        db::get_nodes_speed_summary(&conn).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(summary))
}

#[derive(Deserialize)]
pub struct SiteTestRequest {
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SiteTestResponse {
    pub url: String,
    pub status_code: Option<u16>,
    pub latency: Option<u64>,
    pub success: bool,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dns_rule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dns_server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_rule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outbound: Option<String>,
}

async fn try_fetch_url(client: &reqwest::Client, url: &str) -> Option<(u16, u64)> {
    let start = Instant::now();
    if let Ok(resp) = client.get(url).send().await {
        let status = resp.status().as_u16();
        let elapsed = start.elapsed().as_millis() as u64;
        Some((status, elapsed))
    } else {
        None
    }
}

pub async fn test_site_reachability(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SiteTestRequest>,
) -> Result<Json<SiteTestResponse>, StatusCode> {
    check_auth(&state, &headers).await?;

    let url = payload.url.trim().to_string();
    if url.is_empty() {
        return Ok(Json(SiteTestResponse {
            url,
            status_code: None,
            latency: None,
            success: false,
            error: Some("网址不能为空".to_string()),
            dns_rule: None,
            dns_server: None,
            route_rule: None,
            outbound: None,
        }));
    }

    // Evaluate DNS and Route rule matching against active sing-box configuration
    let trace_info = crate::rule_matcher::evaluate_site_trace(&state, &url);
    let (dns_rule, dns_server, route_rule, outbound) = match trace_info {
        Some(t) => (
            Some(t.dns_rule),
            Some(t.dns_server),
            Some(t.route_rule),
            Some(t.outbound),
        ),
        None => (None, None, None, None),
    };

    let user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // 1. Try standard client (uses environment proxy / TUN mode / direct sockets)
    if let Ok(client) = reqwest::Client::builder()
        .user_agent(user_agent)
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(Duration::from_secs(8))
        .build()
        && let Some((status, elapsed)) = try_fetch_url(&client, &url).await
    {
        let success = status < 400 || status == 403 || status == 405 || status == 429;
        return Ok(Json(SiteTestResponse {
            url,
            status_code: Some(status),
            latency: Some(elapsed),
            success,
            error: None,
            dns_rule,
            dns_server,
            route_rule,
            outbound,
        }));
    }

    // 2. Fallback: If system env proxy was missing or failed, probe common local proxy ports
    let candidate_proxy_urls = [
        "http://127.0.0.1:12334",
        "socks5://127.0.0.1:12334",
        "http://127.0.0.1:7890",
        "socks5://127.0.0.1:7890",
        "http://127.0.0.1:2334",
        "socks5://127.0.0.1:2334",
        "http://127.0.0.1:10809",
        "socks5://127.0.0.1:10808",
        "http://127.0.0.1:2080",
    ];

    for proxy_str in &candidate_proxy_urls {
        if let Ok(proxy) = reqwest::Proxy::all(*proxy_str)
            && let Ok(client) = reqwest::Client::builder()
                .proxy(proxy)
                .user_agent(user_agent)
                .redirect(reqwest::redirect::Policy::limited(10))
                .timeout(Duration::from_secs(6))
                .build()
            && let Some((status, elapsed)) = try_fetch_url(&client, &url).await
        {
            let success = status < 400 || status == 403 || status == 405 || status == 429;
            return Ok(Json(SiteTestResponse {
                url,
                status_code: Some(status),
                latency: Some(elapsed),
                success,
                error: None,
                dns_rule,
                dns_server,
                route_rule,
                outbound,
            }));
        }
    }

    Ok(Json(SiteTestResponse {
        url,
        status_code: None,
        latency: None,
        success: false,
        error: Some("网络无法在 10 秒内连通目标网站，请确认外部代理软件已正常连接".to_string()),
        dns_rule,
        dns_server,
        route_rule,
        outbound,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_udp_protocol() {
        assert!(is_udp_protocol("hysteria2"));
        assert!(is_udp_protocol("HYSTERIA2"));
        assert!(is_udp_protocol("hysteria"));
        assert!(is_udp_protocol("tuic"));
        assert!(is_udp_protocol("wireguard"));

        assert!(!is_udp_protocol("vless"));
        assert!(!is_udp_protocol("vmess"));
        assert!(!is_udp_protocol("trojan"));
        assert!(!is_udp_protocol("shadowsocks"));
        assert!(!is_udp_protocol("direct"));
    }

    #[test]
    fn test_validate_node_json_valid() {
        let valid_json = serde_json::json!({
            "type": "vless",
            "tag": "node-1",
            "server": "1.2.3.4",
            "server_port": 443
        })
        .to_string();

        let res = validate_node_json("node-1", "vless", "1.2.3.4", 443, &valid_json);
        assert!(res.is_ok());
    }

    #[test]
    fn test_validate_node_json_mismatched_server() {
        let json = serde_json::json!({
            "type": "vless",
            "tag": "node-1",
            "server": "5.6.7.8",
            "server_port": 443
        })
        .to_string();

        let res = validate_node_json("node-1", "vless", "1.2.3.4", 443, &json);
        assert!(res.is_err());
    }

    #[test]
    fn test_speed_test_endpoints_and_defaults() {
        assert_eq!(TEST_ENDPOINTS.len(), 6);
        assert_eq!(
            DEFAULT_SPEED_TEST_URL,
            "https://www.gstatic.com/generate_204"
        );
        assert_eq!(
            get_test_endpoint_name("https://www.gstatic.com/generate_204"),
            "Google 静态资源"
        );
        assert_eq!(
            get_test_endpoint_name("https://www.google.com/generate_204"),
            "Google 主站连通性"
        );
        assert_eq!(
            get_test_endpoint_name("https://cp.cloudflare.com/generate_204"),
            "Cloudflare 连通性"
        );
        assert_eq!(
            get_test_endpoint_name("https://captive.apple.com/hotspot-detect.html"),
            "Apple 网络连通性"
        );
        assert_eq!(
            get_test_endpoint_name("https://detectportal.firefox.com/success.txt"),
            "Mozilla 网络连通性"
        );
        assert_eq!(
            get_test_endpoint_name("https://1.1.1.1/cdn-cgi/trace"),
            "Cloudflare 网络诊断"
        );
        assert_eq!(
            get_test_endpoint_name("https://unknown.com/test"),
            "自定义测试点"
        );
    }
}
