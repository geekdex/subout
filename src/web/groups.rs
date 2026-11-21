use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

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

/// Parse the group tags referenced inside a `static_nodes` JSON array.
fn referenced_group_tags(static_nodes: Option<&str>) -> Vec<String> {
    let tags: Vec<String> = static_nodes
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    tags
}

/// Build a directed graph of outbound groups: group tag -> tags of other groups
/// that appear in its member list. Only references that point to an existing
/// group are edges (system outbounds and node tags are ignored).
fn build_group_graph(conn: &rusqlite::Connection) -> HashMap<String, Vec<String>> {
    let groups = db::get_outbound_groups(conn).unwrap_or_default();
    let group_tags: HashSet<String> = groups.iter().map(|g| g.tag.clone()).collect();
    let mut graph = HashMap::new();
    for group in groups {
        let refs: Vec<String> = referenced_group_tags(group.static_nodes.as_deref())
            .into_iter()
            .filter(|tag| group_tags.contains(tag))
            .collect();
        graph.insert(group.tag, refs);
    }
    graph
}

/// Return the cycle path (starting and ending at `start_tag`) if following
/// group-member references from `start_tag` leads back to itself.
/// `candidate_refs` are the members of the group being saved, which may not be
/// persisted yet, so they override whatever is in the graph for `start_tag`.
fn find_cycle_from(
    start_tag: &str,
    graph: &HashMap<String, Vec<String>>,
    candidate_refs: &[String],
) -> Option<Vec<String>> {
    // The group being saved may not be persisted yet (add) or may have changed
    // members (update), so override its edges with the candidate member list.
    let mut effective = graph.clone();
    effective.insert(start_tag.to_string(), candidate_refs.to_vec());

    // A cycle through `start_tag` exists iff some node reachable from it has an
    // edge back to `start_tag`. A single global `visited` makes this O(V+E)
    // rather than enumerating every simple path (which the backtracking DFS
    // would do, exponentially in dense graphs). `parent` reconstructs the path
    // for a human-readable error message.
    let mut parent: HashMap<String, String> = HashMap::new();
    let mut visited: HashSet<String> = HashSet::new();
    let mut stack = vec![start_tag.to_string()];
    visited.insert(start_tag.to_string());

    while let Some(current) = stack.pop()
        && let Some(refs) = effective.get(&current)
    {
        for next in refs {
            if next == start_tag {
                // Rebuild: start_tag -> ... -> current -> start_tag.
                let mut chain = vec![current.clone()];
                let mut node = current.clone();
                while node != start_tag {
                    let Some(p) = parent.get(&node).cloned() else {
                        break;
                    };
                    chain.push(p.clone());
                    node = p;
                }
                chain.reverse();
                chain.push(start_tag.to_string());
                return Some(chain);
            }
            if visited.insert(next.clone()) {
                parent.insert(next.clone(), current.clone());
                stack.push(next.clone());
            }
        }
    }
    None
}

/// Validate that saving a group (with the given final member list) would not
/// introduce a circular outbound dependency. Returns an error response if so.
fn check_no_cycle(
    conn: &rusqlite::Connection,
    tag: &str,
    final_static_nodes: Option<&str>,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let graph = build_group_graph(conn);
    let candidate_refs = referenced_group_tags(final_static_nodes);
    if let Some(cycle) = find_cycle_from(tag, &graph, &candidate_refs) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": format!(
                    "保存分组失败：出站组之间存在循环依赖（{}），sing-box 将无法启动，请移除相关成员引用。",
                    cycle.join(" -> ")
                )
            })),
        ));
    }
    Ok(())
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
        eprintln!("[groups::get_groups] Failed to query outbound_groups: {e:?}");
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

    check_no_cycle(&conn, tag, final_static_nodes.as_deref())?;

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
        &format!("添加出站组: {tag}"),
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

    check_no_cycle(&conn, tag, final_static_nodes.as_deref())?;

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
        &format!("修改出站组: {tag}"),
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

    #[test]
    fn test_find_cycle_from_direct_and_indirect() {
        // A -> B, B -> A (direct two-node cycle)
        let graph = HashMap::from([
            ("A".to_string(), vec!["B".to_string()]),
            ("B".to_string(), vec!["A".to_string()]),
        ]);
        let cycle = find_cycle_from("A", &graph, &["B".to_string()]);
        assert_eq!(
            cycle,
            Some(vec!["A".to_string(), "B".to_string(), "A".to_string()])
        );

        // A -> B -> C -> A (indirect cycle)
        let graph = HashMap::from([
            ("A".to_string(), vec!["B".to_string()]),
            ("B".to_string(), vec!["C".to_string()]),
            ("C".to_string(), vec!["A".to_string()]),
        ]);
        let cycle = find_cycle_from("A", &graph, &["B".to_string()]);
        assert_eq!(
            cycle,
            Some(vec![
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "A".to_string()
            ])
        );
    }

    #[test]
    fn test_find_cycle_from_no_cycle() {
        // A -> B, B -> (nothing): candidate B introduces no cycle
        let graph = HashMap::from([("A".to_string(), vec![]), ("B".to_string(), vec![])]);
        let cycle = find_cycle_from("A", &graph, &["B".to_string()]);
        assert!(cycle.is_none());

        // Self reference is a cycle
        let graph = HashMap::from([("A".to_string(), vec![])]);
        let cycle = find_cycle_from("A", &graph, &["A".to_string()]);
        assert_eq!(cycle, Some(vec!["A".to_string(), "A".to_string()]));

        // Referencing only a node tag (not a group) never cycles
        let graph = HashMap::from([("A".to_string(), vec![])]);
        let cycle = find_cycle_from("A", &graph, &["some-node".to_string()]);
        assert!(cycle.is_none());

        // A diamond DAG (A -> B, A -> C, B -> D, C -> D) has no cycle.
        let graph = HashMap::from([
            ("A".to_string(), vec![]),
            ("B".to_string(), vec!["D".to_string()]),
            ("C".to_string(), vec!["D".to_string()]),
            ("D".to_string(), vec![]),
        ]);
        let cycle = find_cycle_from("A", &graph, &["B".to_string(), "C".to_string()]);
        assert!(cycle.is_none());

        // A cycle elsewhere (B -> C -> B) that does not involve the saved group
        // A must not be reported: saving A did not introduce it.
        let graph = HashMap::from([
            ("A".to_string(), vec![]),
            ("B".to_string(), vec!["C".to_string()]),
            ("C".to_string(), vec!["B".to_string()]),
        ]);
        let cycle = find_cycle_from("A", &graph, &["B".to_string()]);
        assert!(cycle.is_none());
    }

    #[test]
    fn test_find_cycle_from_reports_actual_cycle_path() {
        // Saving D with members [A], where A -> B -> C -> D, closes
        // D -> A -> B -> C -> D. Verify the reported path is exact.
        let graph = HashMap::from([
            ("A".to_string(), vec!["B".to_string()]),
            ("B".to_string(), vec!["C".to_string()]),
            ("C".to_string(), vec!["D".to_string()]),
            ("D".to_string(), vec![]),
        ]);
        let cycle = find_cycle_from("D", &graph, &["A".to_string()]);
        assert_eq!(
            cycle,
            Some(vec![
                "D".to_string(),
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "D".to_string()
            ])
        );
    }

    #[test]
    fn test_check_no_cycle_rejects_mutual_group_references() {
        let conn = db::init_db(":memory:").unwrap();
        db::save_outbound_group(
            &conn,
            "group-cf",
            "urltest",
            None,
            None,
            None,
            Some("[\"group-gh\"]"),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        db::save_outbound_group(
            &conn,
            "group-gh",
            "urltest",
            None,
            None,
            None,
            Some("[\"node-1\"]"),
            None,
            None,
            None,
            None,
        )
        .unwrap();

        // Saving group-gh with a member that references group-cf would close
        // the cycle group-cf -> group-gh -> group-cf.
        let err = check_no_cycle(
            &conn,
            "group-gh",
            Some("[\"node-1\", \"group-cf\"]".to_string()).as_deref(),
        )
        .unwrap_err();
        let (status, body) = err;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let msg = body.0;
        assert!(msg.to_string().contains("循环依赖"));

        // Saving group-gh with only plain node members is fine.
        assert!(
            check_no_cycle(
                &conn,
                "group-gh",
                Some("[\"node-1\"]".to_string()).as_deref()
            )
            .is_ok()
        );
    }
}
