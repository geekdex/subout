use anyhow::Result;
use rusqlite::{Connection, OptionalExtension, params};
use sha2::{Digest, Sha256};

pub mod models;
pub use models::{ConfigHistory, Node, NodesPage, OutboundGroup, Settings, Subscription};

pub fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

pub fn init_db(db_path: &str) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    setup_database(&conn)?;
    Ok(conn)
}

pub fn reset_db(conn: &Connection) -> Result<()> {
    conn.execute("DROP TABLE IF EXISTS settings", [])?;
    conn.execute("DROP TABLE IF EXISTS subscriptions", [])?;
    conn.execute("DROP TABLE IF EXISTS nodes", [])?;
    conn.execute("DROP TABLE IF EXISTS outbound_groups", [])?;
    conn.execute("DROP TABLE IF EXISTS base_config", [])?;
    conn.execute("DROP TABLE IF EXISTS config_history", [])?;
    setup_database(conn)?;
    Ok(())
}

pub fn setup_database(conn: &Connection) -> Result<()> {
    // Create tables
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            label TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            last_fetched TEXT,
            last_error TEXT,
            filter_keywords TEXT,
            delete_on_update INTEGER DEFAULT 1
        )",
        [],
    )?;

    // Drop filter_keywords table if it exists to clean up
    let _ = conn.execute("DROP TABLE IF EXISTS filter_keywords", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
            tag TEXT NOT NULL UNIQUE,
            node_type TEXT NOT NULL,
            server TEXT NOT NULL,
            port INTEGER NOT NULL,
            raw_json TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            is_custom INTEGER DEFAULT 0
        )",
        [],
    )?;

    // Recreate outbound_groups if they contain old columns, or drop and recreate.
    let old_cols: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('outbound_groups') WHERE name='filter_use_keywords'",
        [],
        |r| r.get(0),
    ).unwrap_or(0);
    if old_cols > 0 {
        let _ = conn.execute("DROP TABLE IF EXISTS outbound_groups", []);
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS outbound_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag TEXT NOT NULL UNIQUE,
            group_type TEXT NOT NULL,
            url TEXT,
            interval TEXT,
            tolerance INTEGER,
            static_nodes TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS base_config (
            section TEXT PRIMARY KEY,
            content TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS config_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            change_type TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT NOT NULL,
            content TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )",
        [],
    )?;

    // Migration: check if subscriptions has filter_keywords column
    let has_col: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('subscriptions') WHERE name='filter_keywords'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_col == 0 {
        let _ = conn.execute(
            "ALTER TABLE subscriptions ADD COLUMN filter_keywords TEXT",
            [],
        );
    }

    // Migration: check if subscriptions has delete_on_update column
    let has_delete_col: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('subscriptions') WHERE name='delete_on_update'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_delete_col == 0 {
        let _ = conn.execute(
            "ALTER TABLE subscriptions ADD COLUMN delete_on_update INTEGER DEFAULT 1",
            [],
        );
    }

    // Migration: check if nodes has last_tcp_latency column
    let has_latency_col: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('nodes') WHERE name='last_tcp_latency'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_latency_col == 0 {
        let _ = conn.execute("ALTER TABLE nodes ADD COLUMN last_tcp_latency INTEGER", []);
        let _ = conn.execute("ALTER TABLE nodes ADD COLUMN last_web_latency INTEGER", []);
        let _ = conn.execute("ALTER TABLE nodes ADD COLUMN last_tested_at TEXT", []);
    }

    // Migration: check if nodes has last_target_url column
    let has_target_url_col: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('nodes') WHERE name='last_target_url'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_target_url_col == 0 {
        let _ = conn.execute("ALTER TABLE nodes ADD COLUMN last_target_url TEXT", []);
    }

    // Bootstrap default settings if empty
    let has_settings: i64 = conn.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get(0))?;
    if has_settings == 0 {
        let admin_hash = hash_password("admin");
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('password_hash', ?)",
            [&admin_hash],
        )?;
    }

    // Bootstrap default base_config to be empty
    let has_config: i64 = conn.query_row("SELECT COUNT(*) FROM base_config", [], |r| r.get(0))?;
    if has_config == 0 {
        conn.execute(
            "INSERT INTO base_config (section, content) VALUES ('log', ?)",
            ["{}"],
        )?;
        conn.execute(
            "INSERT INTO base_config (section, content) VALUES ('dns', ?)",
            ["{}"],
        )?;
        conn.execute(
            "INSERT INTO base_config (section, content) VALUES ('inbounds', ?)",
            ["[]"],
        )?;
        conn.execute(
            "INSERT INTO base_config (section, content) VALUES ('outbounds', ?)",
            ["[]"],
        )?;
        conn.execute(
            "INSERT INTO base_config (section, content) VALUES ('route', ?)",
            ["{}"],
        )?;
        conn.execute(
            "INSERT INTO base_config (section, content) VALUES ('experimental', ?)",
            ["{}"],
        )?;
    }

    // Bootstrap default outbound groups
    let has_groups: i64 =
        conn.query_row("SELECT COUNT(*) FROM outbound_groups", [], |r| r.get(0))?;
    if has_groups == 0 {
        conn.execute(
            "INSERT INTO outbound_groups (tag, group_type, static_nodes) VALUES ('proxy', 'selector', '[\"AUTO-Test\", \"direct\"]')",
            [],
        )?;
        conn.execute(
            "INSERT INTO outbound_groups (tag, group_type, url, interval, tolerance, static_nodes) VALUES ('AUTO-Test', 'urltest', 'http://cp.cloudflare.com/generate_204', '3m', 50, '[]')",
            [],
        )?;
    }

    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let val: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?", [key], |r| {
            r.get(0)
        })
        .optional()?;
    Ok(val)
}

pub fn update_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [key, value],
    )?;
    Ok(())
}

pub fn get_subscriptions(conn: &Connection) -> Result<Vec<Subscription>> {
    let mut stmt = conn.prepare("SELECT id, url, label, enabled, last_fetched, last_error, filter_keywords, delete_on_update FROM subscriptions")?;
    let subs = stmt
        .query_map([], |row| {
            let enabled_int: i32 = row.get(3)?;
            let delete_on_update_int: Option<i32> = row.get(7)?;
            Ok(Subscription {
                id: row.get(0)?,
                url: row.get(1)?,
                label: row.get(2)?,
                enabled: enabled_int != 0,
                last_fetched: row.get(4)?,
                last_error: row.get(5)?,
                filter_keywords: row.get(6)?,
                delete_on_update: Some(delete_on_update_int.unwrap_or(1) != 0),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(subs)
}

pub fn add_subscription(
    conn: &Connection,
    url: &str,
    label: &str,
    filter_keywords: &str,
    delete_on_update: bool,
) -> Result<i64> {
    let delete_val = if delete_on_update { 1 } else { 0 };
    conn.execute(
        "INSERT INTO subscriptions (url, label, enabled, filter_keywords, delete_on_update) VALUES (?, ?, 1, ?, ?)",
        params![url, label, filter_keywords, delete_val],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_subscription(
    conn: &Connection,
    id: i64,
    url: &str,
    label: &str,
    filter_keywords: &str,
    enabled: bool,
    delete_on_update: bool,
) -> Result<()> {
    let enabled_int = if enabled { 1 } else { 0 };
    let delete_val = if delete_on_update { 1 } else { 0 };
    conn.execute(
        "UPDATE subscriptions SET url = ?, label = ?, filter_keywords = ?, enabled = ?, delete_on_update = ? WHERE id = ?",
        params![url, label, filter_keywords, enabled_int, delete_val, id],
    )?;
    Ok(())
}

pub fn delete_subscription(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM subscriptions WHERE id = ?", [id])?;
    conn.execute("DELETE FROM nodes WHERE subscription_id = ?", [id])?;
    Ok(())
}

fn apply_latency_filter(column: &str, filter: &str, query_parts: &mut Vec<String>) {
    match filter {
        "success" => query_parts.push(format!(" (n.{} >= 0 AND n.{} < 100) ", column, column)),
        "info" => query_parts.push(format!(" (n.{} >= 100 AND n.{} < 300) ", column, column)),
        "warn" => query_parts.push(format!(" (n.{} >= 300) ", column)),
        "danger" => query_parts.push(format!(" (n.{} = -1) ", column)),
        "untested" => query_parts.push(format!(" (n.{} IS NULL) ", column)),
        _ => {}
    }
}

pub fn get_nodes_paginated(
    conn: &Connection,
    page: i64,
    limit: i64,
    search: &str,
    subscription_id: Option<i64>,
    tcp_filter: Option<&str>,
    web_filter: Option<&str>,
) -> Result<NodesPage> {
    let offset = (page - 1) * limit;

    let mut query_parts: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if !search.is_empty() {
        query_parts.push(" (n.tag LIKE ?1 OR n.server LIKE ?1) ".to_string());
        params_vec.push(Box::new(format!("%{}%", search)));
    }

    if let Some(sub_id) = subscription_id {
        let param_index = params_vec.len() + 1;
        if sub_id == -1 {
            query_parts.push(" n.is_custom = 1 ".to_string());
        } else {
            query_parts.push(format!(" n.subscription_id = ?{} ", param_index));
            params_vec.push(Box::new(sub_id));
        }
    }

    if let Some(tf) = tcp_filter {
        apply_latency_filter("last_tcp_latency", tf, &mut query_parts);
    }
    if let Some(wf) = web_filter {
        apply_latency_filter("last_web_latency", wf, &mut query_parts);
    }

    let filter_clause = if query_parts.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", query_parts.join(" AND "))
    };

    let count_query = format!("SELECT COUNT(*) FROM nodes n {}", filter_clause);

    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
    let total_count: i64 = conn.query_row(&count_query, params_slice.as_slice(), |r| r.get(0))?;

    let query_str = format!(
        "SELECT n.id, n.subscription_id, s.label, n.tag, n.node_type, n.server, n.port, n.raw_json, n.enabled, n.is_custom, n.last_tcp_latency, n.last_web_latency, n.last_tested_at, n.last_target_url 
         FROM nodes n
         LEFT JOIN subscriptions s ON n.subscription_id = s.id
         {} 
         ORDER BY n.id DESC 
         LIMIT ?{} OFFSET ?{}",
        filter_clause,
        params_vec.len() + 1,
        params_vec.len() + 2
    );

    params_vec.push(Box::new(limit));
    params_vec.push(Box::new(offset));

    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let mut stmt = conn.prepare(&query_str)?;
    let nodes = stmt
        .query_map(params_slice.as_slice(), |row| {
            let sub_id: Option<i64> = row.get(1)?;
            let sub_label: Option<String> = row.get(2)?;
            let enabled_int: i32 = row.get(8)?;
            let is_custom_int: i32 = row.get(9)?;

            let label = if is_custom_int != 0 {
                Some("自定义节点".to_string())
            } else {
                sub_label.or_else(|| Some("未知订阅".to_string()))
            };

            Ok(Node {
                id: row.get(0)?,
                subscription_id: sub_id,
                subscription_label: label,
                tag: row.get(3)?,
                node_type: row.get(4)?,
                server: row.get(5)?,
                port: row.get(6)?,
                raw_json: row.get(7)?,
                enabled: enabled_int != 0,
                is_custom: is_custom_int != 0,
                last_tcp_latency: row.get(10)?,
                last_web_latency: row.get(11)?,
                last_tested_at: row.get(12)?,
                last_target_url: row.get(13)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(NodesPage { nodes, total_count })
}

pub fn get_nodes(conn: &Connection) -> Result<Vec<Node>> {
    let mut stmt = conn.prepare(
        "SELECT n.id, n.subscription_id, s.label, n.tag, n.node_type, n.server, n.port, n.raw_json, n.enabled, n.is_custom, n.last_tcp_latency, n.last_web_latency, n.last_tested_at, n.last_target_url 
         FROM nodes n
         LEFT JOIN subscriptions s ON n.subscription_id = s.id"
    )?;
    let nodes = stmt
        .query_map([], |row| {
            let sub_id: Option<i64> = row.get(1)?;
            let sub_label: Option<String> = row.get(2)?;
            let enabled_int: i32 = row.get(8)?;
            let is_custom_int: i32 = row.get(9)?;

            let label = if is_custom_int != 0 {
                Some("自定义节点".to_string())
            } else {
                sub_label.or_else(|| Some("未知订阅".to_string()))
            };

            Ok(Node {
                id: row.get(0)?,
                subscription_id: sub_id,
                subscription_label: label,
                tag: row.get(3)?,
                node_type: row.get(4)?,
                server: row.get(5)?,
                port: row.get(6)?,
                raw_json: row.get(7)?,
                enabled: enabled_int != 0,
                is_custom: is_custom_int != 0,
                last_tcp_latency: row.get(10)?,
                last_web_latency: row.get(11)?,
                last_tested_at: row.get(12)?,
                last_target_url: row.get(13)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(nodes)
}

pub fn get_node_by_id(conn: &Connection, id: i64) -> Result<Option<Node>> {
    let mut stmt = conn.prepare(
        "SELECT n.id, n.subscription_id, s.label, n.tag, n.node_type, n.server, n.port, n.raw_json, n.enabled, n.is_custom, n.last_tcp_latency, n.last_web_latency, n.last_tested_at, n.last_target_url 
         FROM nodes n
         LEFT JOIN subscriptions s ON n.subscription_id = s.id
         WHERE n.id = ?"
    )?;
    let mut rows = stmt.query([id])?;
    if let Some(row) = rows.next()? {
        let sub_id: Option<i64> = row.get(1)?;
        let sub_label: Option<String> = row.get(2)?;
        let enabled_int: i32 = row.get(8)?;
        let is_custom_int: i32 = row.get(9)?;

        let label = if is_custom_int != 0 {
            Some("自定义节点".to_string())
        } else {
            sub_label.or_else(|| Some("未知订阅".to_string()))
        };

        Ok(Some(Node {
            id: row.get(0)?,
            subscription_id: sub_id,
            subscription_label: label,
            tag: row.get(3)?,
            node_type: row.get(4)?,
            server: row.get(5)?,
            port: row.get(6)?,
            raw_json: row.get(7)?,
            enabled: enabled_int != 0,
            is_custom: is_custom_int != 0,
            last_tcp_latency: row.get(10)?,
            last_web_latency: row.get(11)?,
            last_tested_at: row.get(12)?,
            last_target_url: row.get(13)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn update_node_ping_result(
    conn: &Connection,
    id: i64,
    tcp_latency: Option<i64>,
    web_latency: Option<i64>,
    tested_at: &str,
    target_url: Option<&str>,
) -> Result<()> {
    match (tcp_latency, web_latency) {
        (Some(tcp), Some(web)) => {
            conn.execute(
                "UPDATE nodes SET last_tcp_latency = ?, last_web_latency = ?, last_tested_at = ?, last_target_url = COALESCE(?, last_target_url) WHERE id = ?",
                params![tcp, web, tested_at, target_url, id],
            )?;
        }
        (Some(tcp), None) => {
            conn.execute(
                "UPDATE nodes SET last_tcp_latency = ?, last_tested_at = ?, last_target_url = COALESCE(?, last_target_url) WHERE id = ?",
                params![tcp, tested_at, target_url, id],
            )?;
        }
        (None, Some(web)) => {
            conn.execute(
                "UPDATE nodes SET last_web_latency = ?, last_tested_at = ?, last_target_url = COALESCE(?, last_target_url) WHERE id = ?",
                params![web, tested_at, target_url, id],
            )?;
        }
        (None, None) => {}
    }
    Ok(())
}

pub fn save_node(
    conn: &Connection,
    subscription_id: Option<i64>,
    tag: &str,
    node_type: &str,
    server: &str,
    port: u16,
    raw_json: &str,
    enabled: bool,
    is_custom: bool,
) -> Result<()> {
    let enabled_int = if enabled { 1 } else { 0 };
    let is_custom_int = if is_custom { 1 } else { 0 };
    conn.execute(
        "INSERT OR REPLACE INTO nodes (subscription_id, tag, node_type, server, port, raw_json, enabled, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![subscription_id, tag, node_type, server, port, raw_json, enabled_int, is_custom_int],
    )?;
    Ok(())
}

pub fn update_node_details(
    conn: &Connection,
    id: i64,
    tag: &str,
    node_type: &str,
    server: &str,
    port: u16,
    raw_json: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE nodes SET tag = ?, node_type = ?, server = ?, port = ?, raw_json = ? WHERE id = ?",
        params![tag, node_type, server, port, raw_json, id],
    )?;
    Ok(())
}

pub fn delete_node(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM nodes WHERE id = ?", [id])?;
    Ok(())
}

pub fn update_node_status(conn: &Connection, id: i64, enabled: bool) -> Result<()> {
    let enabled_int = if enabled { 1 } else { 0 };
    conn.execute(
        "UPDATE nodes SET enabled = ? WHERE id = ?",
        params![enabled_int, id],
    )?;
    Ok(())
}

pub fn get_outbound_groups(conn: &Connection) -> Result<Vec<OutboundGroup>> {
    let mut stmt = conn.prepare(
        "SELECT id, tag, group_type, url, interval, tolerance, static_nodes FROM outbound_groups",
    )?;
    let groups = stmt
        .query_map([], |row| {
            Ok(OutboundGroup {
                id: row.get(0)?,
                tag: row.get(1)?,
                group_type: row.get(2)?,
                url: row.get(3)?,
                interval: row.get(4)?,
                tolerance: row.get(5)?,
                static_nodes: row.get(6)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(groups)
}

pub fn save_outbound_group(
    conn: &Connection,
    tag: &str,
    group_type: &str,
    url: Option<&str>,
    interval: Option<&str>,
    tolerance: Option<i64>,
    static_nodes: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO outbound_groups (tag, group_type, url, interval, tolerance, static_nodes) VALUES (?, ?, ?, ?, ?, ?)",
        params![tag, group_type, url, interval, tolerance, static_nodes],
    )?;
    Ok(())
}

pub fn delete_outbound_group(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM outbound_groups WHERE id = ?", [id])?;
    Ok(())
}

pub fn get_base_config_section(conn: &Connection, section: &str) -> Result<Option<String>> {
    let content: Option<String> = conn
        .query_row(
            "SELECT content FROM base_config WHERE section = ?",
            [section],
            |r| r.get(0),
        )
        .optional()?;
    Ok(content)
}

pub fn save_base_config_section(conn: &Connection, section: &str, content: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO base_config (section, content) VALUES (?, ?)",
        [section, content],
    )?;
    Ok(())
}

pub fn log_history(
    conn: &Connection,
    change_type: &str,
    action: &str,
    detail: &str,
    content: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO config_history (change_type, action, detail, content) VALUES (?, ?, ?, ?)",
        params![change_type, action, detail, content],
    )?;
    Ok(())
}

pub fn get_config_history(conn: &Connection) -> Result<Vec<ConfigHistory>> {
    let mut stmt = conn.prepare(
        "SELECT id, change_type, action, detail, created_at FROM config_history WHERE change_type IN ('配置列表', '模板配置') ORDER BY id DESC",
    )?;
    let history = stmt
        .query_map([], |row| {
            Ok(ConfigHistory {
                id: row.get(0)?,
                change_type: row.get(1)?,
                action: row.get(2)?,
                detail: row.get(3)?,
                content: None,
                created_at: row.get(4)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(history)
}

pub fn get_config_history_detail(conn: &Connection, id: i64) -> Result<Option<ConfigHistory>> {
    let mut stmt = conn.prepare(
        "SELECT id, change_type, action, detail, content, created_at FROM config_history WHERE id = ?"
    )?;
    let mut rows = stmt.query([id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(ConfigHistory {
            id: row.get(0)?,
            change_type: row.get(1)?,
            action: row.get(2)?,
            detail: row.get(3)?,
            content: row.get(4)?,
            created_at: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}
