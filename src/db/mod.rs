use anyhow::Result;
use rusqlite::{Connection, OptionalExtension, params};
use sha2::{Digest, Sha256};

pub mod models;
pub use models::{
    ConfigHistory, ConfigProfile, FastestNodeInfo, LatencyTierCount, Node, NodeGroup, NodesPage,
    OutboundGroup, Settings, SpeedTestSummary, Subscription,
};

pub fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let result = hasher.finalize();
    format!("{result:x}")
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
    conn.execute("DROP TABLE IF EXISTS configs", [])?;
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
            static_nodes TEXT,
            node_types TEXT,
            subscriptions TEXT,
            include_keywords TEXT,
            exclude_keywords TEXT
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
        "CREATE TABLE IF NOT EXISTS configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            platform TEXT NOT NULL,
            description TEXT,
            token TEXT UNIQUE NOT NULL,
            version_code INTEGER DEFAULT 0,
            content TEXT NOT NULL,
            is_running_config INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_configs_token ON configs(token)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_configs_platform ON configs(platform)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS config_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id INTEGER,
            change_type TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT NOT NULL,
            content TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT
        )",
        [],
    )?;

    // Migration: check if config_history has config_id column
    let has_config_id_col: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('config_history') WHERE name='config_id'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_config_id_col == 0 {
        let _ = conn.execute(
            "ALTER TABLE config_history ADD COLUMN config_id INTEGER",
            [],
        );
    }

    // Migration: check if outbound_groups has updated_at column
    let has_group_updated_at: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('outbound_groups') WHERE name='updated_at'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_group_updated_at == 0 {
        let _ = conn.execute("ALTER TABLE outbound_groups ADD COLUMN updated_at TEXT", []);
    }

    // Migration: check if config_history has updated_at column
    let has_updated_at_col: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('config_history') WHERE name='updated_at'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_updated_at_col == 0 {
        let _ = conn.execute("ALTER TABLE config_history ADD COLUMN updated_at TEXT", []);
        let _ = conn.execute(
            "UPDATE config_history SET updated_at = created_at WHERE updated_at IS NULL",
            [],
        );
    }

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

    // Migration: check if subscriptions has upload column
    let has_upload_col: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('subscriptions') WHERE name='upload'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if has_upload_col == 0 {
        let _ = conn.execute("ALTER TABLE subscriptions ADD COLUMN upload INTEGER", []);
        let _ = conn.execute("ALTER TABLE subscriptions ADD COLUMN download INTEGER", []);
        let _ = conn.execute("ALTER TABLE subscriptions ADD COLUMN total INTEGER", []);
        let _ = conn.execute("ALTER TABLE subscriptions ADD COLUMN expire INTEGER", []);
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

    // Migration: check if outbound_groups has dynamic filter columns
    for col in &[
        "node_types",
        "subscriptions",
        "include_keywords",
        "exclude_keywords",
    ] {
        let has_col: i64 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM pragma_table_info('outbound_groups') WHERE name='{col}'"
                ),
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if has_col == 0 {
            let _ = conn.execute(
                &format!("ALTER TABLE outbound_groups ADD COLUMN {col} TEXT"),
                [],
            );
        }
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
            [r#"{"level":"info","timestamp":true}"#],
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
        conn.execute(
            "INSERT INTO base_config (section, content) VALUES ('http_clients', ?)",
            [r#"[{"tag":"direct"},{"tag":"proxy","detour":"proxy"}]"#],
        )?;
    }

    // Migration: fix direct http_client with empty direct detour in base_config
    if let Ok(Some(existing_hc)) = get_base_config_section(conn, "http_clients")
        && existing_hc.contains(r#""detour":"direct""#)
        && let Ok(mut parsed) = serde_json::from_str::<serde_json::Value>(&existing_hc)
        && let Some(arr) = parsed.as_array_mut()
    {
        let mut modified = false;
        for client in arr {
            if client.get("tag").and_then(|t| t.as_str()) == Some("direct")
                && client.get("detour").and_then(|d| d.as_str()) == Some("direct")
                && let Some(obj) = client.as_object_mut()
            {
                obj.remove("detour");
                modified = true;
            }
        }
        if modified && let Ok(cleaned) = serde_json::to_string(&parsed) {
            let _ = save_base_config_section(conn, "http_clients", &cleaned);
        }
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

    // Bootstrap v0.3 settings
    let now_code: i64 = chrono::Local::now()
        .format("%Y%m%d%H%M%S")
        .to_string()
        .parse()
        .unwrap_or(0);
    if get_setting(conn, "node_group_version_code")?.is_none() {
        update_setting(conn, "node_group_version_code", &now_code.to_string())?;
    }
    if get_setting(conn, "app_mode")?.is_none() {
        update_setting(conn, "app_mode", "simple")?;
    }
    if get_setting(conn, "auto_update_cron")?.is_none() {
        update_setting(conn, "auto_update_cron", "0 4 * * *")?;
    }
    if get_setting(conn, "auto_update_sync_running")?.is_none() {
        update_setting(conn, "auto_update_sync_running", "1")?;
    }
    if get_setting(conn, "auto_update_reload_service")?.is_none() {
        update_setting(conn, "auto_update_reload_service", "1")?;
    }

    // Migration / Bootstrap default config profile in configs table
    let configs_count: i64 = conn.query_row("SELECT COUNT(*) FROM configs", [], |r| r.get(0))?;
    if configs_count == 0 {
        let log_str = get_base_config_section(conn, "log")?
            .unwrap_or_else(|| r#"{"level":"info","timestamp":true}"#.to_string());
        let dns_str = get_base_config_section(conn, "dns")?.unwrap_or_else(|| "{}".to_string());
        let inbounds_str =
            get_base_config_section(conn, "inbounds")?.unwrap_or_else(|| "[]".to_string());
        let outbounds_str =
            get_base_config_section(conn, "outbounds")?.unwrap_or_else(|| "[]".to_string());
        let route_str = get_base_config_section(conn, "route")?.unwrap_or_else(|| "{}".to_string());
        let experimental_str =
            get_base_config_section(conn, "experimental")?.unwrap_or_else(|| "{}".to_string());
        let http_clients_str = get_base_config_section(conn, "http_clients")?.unwrap_or_default();

        let mut root = serde_json::Map::new();
        root.insert(
            "log".to_string(),
            serde_json::from_str(&log_str)
                .unwrap_or(serde_json::json!({"level":"info","timestamp":true})),
        );
        root.insert(
            "dns".to_string(),
            serde_json::from_str(&dns_str).unwrap_or(serde_json::json!({})),
        );
        root.insert(
            "inbounds".to_string(),
            serde_json::from_str(&inbounds_str).unwrap_or(serde_json::json!([])),
        );
        root.insert(
            "outbounds".to_string(),
            serde_json::from_str(&outbounds_str).unwrap_or(serde_json::json!([])),
        );
        root.insert(
            "route".to_string(),
            serde_json::from_str(&route_str).unwrap_or(serde_json::json!({})),
        );
        root.insert(
            "experimental".to_string(),
            serde_json::from_str(&experimental_str).unwrap_or(serde_json::json!({})),
        );
        if let Ok(hc) = serde_json::from_str::<serde_json::Value>(&http_clients_str) {
            root.insert("http_clients".to_string(), hc);
        }
        let content_json = serde_json::to_string_pretty(&serde_json::Value::Object(root))?;
        let host_os = crate::platform::current_platform().os_name().to_string();
        let default_token = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO configs (name, platform, description, token, version_code, content, is_running_config) VALUES (?, ?, ?, ?, ?, ?, 1)",
            params![
                "默认配置",
                host_os,
                "系统默认运行配置",
                default_token,
                now_code,
                content_json
            ],
        )?;
        let new_cfg_id = conn.last_insert_rowid();
        update_setting(conn, "running_config_id", &new_cfg_id.to_string())?;
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

pub fn delete_setting(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?", [key])?;
    Ok(())
}

pub fn get_subscriptions(conn: &Connection) -> Result<Vec<Subscription>> {
    let mut stmt = conn.prepare("SELECT id, url, label, enabled, last_fetched, last_error, filter_keywords, delete_on_update, upload, download, total, expire FROM subscriptions")?;
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
                upload: row.get(8)?,
                download: row.get(9)?,
                total: row.get(10)?,
                expire: row.get(11)?,
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
    let delete_val = i32::from(delete_on_update);
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
    let enabled_int = i32::from(enabled);
    let delete_val = i32::from(delete_on_update);
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
        "success" => query_parts.push(format!(" (n.{column} >= 0 AND n.{column} < 100) ")),
        "info" => query_parts.push(format!(" (n.{column} >= 100 AND n.{column} < 300) ")),
        "warn" => query_parts.push(format!(" (n.{column} >= 300) ")),
        "danger" => query_parts.push(format!(" (n.{column} = -1) ")),
        "untested" => query_parts.push(format!(" (n.{column} IS NULL) ")),
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
        params_vec.push(Box::new(format!("%{search}%")));
    }

    if let Some(sub_id) = subscription_id {
        let param_index = params_vec.len() + 1;
        if sub_id == -1 {
            query_parts.push(" n.is_custom = 1 ".to_string());
        } else {
            query_parts.push(format!(" n.subscription_id = ?{param_index} "));
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
        String::new()
    } else {
        format!("WHERE {}", query_parts.join(" AND "))
    };

    let count_query = format!("SELECT COUNT(*) FROM nodes n {filter_clause}");

    let params_slice: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(std::convert::AsRef::as_ref).collect();
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

    let params_slice: Vec<&dyn rusqlite::ToSql> =
        params_vec.iter().map(std::convert::AsRef::as_ref).collect();

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

#[allow(clippy::too_many_arguments)]
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
    let enabled_int = i32::from(enabled);
    let is_custom_int = i32::from(is_custom);
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
    let enabled_int = i32::from(enabled);
    conn.execute(
        "UPDATE nodes SET enabled = ? WHERE id = ?",
        params![enabled_int, id],
    )?;
    Ok(())
}

pub fn get_outbound_groups(conn: &Connection) -> Result<Vec<OutboundGroup>> {
    let mut stmt = conn.prepare(
        "SELECT id, tag, group_type, url, interval, tolerance, static_nodes, node_types, subscriptions, include_keywords, exclude_keywords, updated_at FROM outbound_groups",
    )?;
    let groups = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let tag: String = row
                .get::<_, Option<String>>(1)?
                .unwrap_or_else(|| format!("group-{id}"));
            let group_type: String = row
                .get::<_, Option<String>>(2)?
                .unwrap_or_else(|| "selector".to_string());
            Ok(OutboundGroup {
                id,
                tag,
                group_type,
                url: row.get(3)?,
                interval: row.get(4)?,
                tolerance: row.get(5)?,
                static_nodes: row.get(6)?,
                node_types: row.get(7)?,
                subscriptions: row.get(8)?,
                include_keywords: row.get(9)?,
                exclude_keywords: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(groups)
}

#[allow(clippy::too_many_arguments)]
pub fn save_outbound_group(
    conn: &Connection,
    tag: &str,
    group_type: &str,
    url: Option<&str>,
    interval: Option<&str>,
    tolerance: Option<i64>,
    static_nodes: Option<&str>,
    node_types: Option<&str>,
    subscriptions: Option<&str>,
    include_keywords: Option<&str>,
    exclude_keywords: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO outbound_groups (tag, group_type, url, interval, tolerance, static_nodes, node_types, subscriptions, include_keywords, exclude_keywords, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))",
        params![tag, group_type, url, interval, tolerance, static_nodes, node_types, subscriptions, include_keywords, exclude_keywords],
    )?;
    let _ = refresh_node_group_version_code(conn)?;
    Ok(())
}

pub fn resolve_group_nodes(conn: &Connection, group: &OutboundGroup) -> Result<Vec<String>> {
    // 1. Check if it is a dynamic group
    let is_dynamic = {
        let nt = group.node_types.as_deref().unwrap_or("all");
        let sub = group.subscriptions.as_deref().unwrap_or("all");
        let inc = group.include_keywords.as_deref().unwrap_or("");
        let exc = group.exclude_keywords.as_deref().unwrap_or("");
        nt != "all" || sub != "all" || !inc.trim().is_empty() || !exc.trim().is_empty()
    };

    if !is_dynamic {
        // Manual selection
        let tags: Vec<String> =
            serde_json::from_str(group.static_nodes.as_deref().unwrap_or("[]")).unwrap_or_default();
        return Ok(tags);
    }

    // 2. Parse criteria
    let node_type_filter = group.node_types.as_deref().unwrap_or("all");
    let sub_filter = group.subscriptions.as_deref().unwrap_or("all");

    let inc_kws: Vec<String> = group
        .include_keywords
        .as_ref()
        .map(|s| {
            s.split([',', '，', ' ', '\n', '\t', '\r'])
                .map(|x| x.trim().to_lowercase())
                .filter(|x| !x.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let exc_kws: Vec<String> = group
        .exclude_keywords
        .as_ref()
        .map(|s| {
            s.split([',', '，', ' ', '\n', '\t', '\r'])
                .map(|x| x.trim().to_lowercase())
                .filter(|x| !x.is_empty())
                .collect()
        })
        .unwrap_or_default();

    // 3. Query all enabled nodes from DB
    let nodes = get_nodes(conn)?;
    let mut resolved_tags = Vec::new();

    // Filter nodes
    if node_type_filter == "all" || node_type_filter == "node" {
        for node in nodes {
            if !node.enabled {
                continue;
            }

            // Check subscription filter
            if sub_filter != "all" {
                if sub_filter == "custom" {
                    if !node.is_custom {
                        continue;
                    }
                } else if let Ok(target_sub_id) = sub_filter.parse::<i64>() {
                    if node.subscription_id != Some(target_sub_id) {
                        continue;
                    }
                } else {
                    continue;
                }
            }

            let tag_lower = node.tag.to_lowercase();
            let server_lower = node.server.to_lowercase();

            // Check positive keywords
            if !inc_kws.is_empty() {
                let matches_any = inc_kws
                    .iter()
                    .any(|kw| tag_lower.contains(kw) || server_lower.contains(kw));
                if !matches_any {
                    continue;
                }
            }

            // Check negative keywords
            if !exc_kws.is_empty() {
                let matches_any = exc_kws
                    .iter()
                    .any(|kw| tag_lower.contains(kw) || server_lower.contains(kw));
                if matches_any {
                    continue;
                }
            }

            resolved_tags.push(node.tag);
        }
    }

    // Filter other groups and system outbounds
    if node_type_filter == "all" || node_type_filter == "group" {
        // Query other groups (excluding self to avoid circular reference)
        let all_g = get_outbound_groups(conn)?;
        for g in all_g {
            if g.tag == group.tag {
                continue;
            }
            let tag_lower = g.tag.to_lowercase();

            // Check positive keywords
            if !inc_kws.is_empty() {
                let matches_any = inc_kws.iter().any(|kw| tag_lower.contains(kw));
                if !matches_any {
                    continue;
                }
            }

            // Check negative keywords
            if !exc_kws.is_empty() {
                let matches_any = exc_kws.iter().any(|kw| tag_lower.contains(kw));
                if matches_any {
                    continue;
                }
            }

            resolved_tags.push(g.tag);
        }

        // Check system outbounds
        for sys_tag in &["direct", "block"] {
            let tag_lower = sys_tag.to_lowercase();

            // Check positive keywords
            if !inc_kws.is_empty() {
                let matches_any = inc_kws.iter().any(|kw| tag_lower.contains(kw));
                if !matches_any {
                    continue;
                }
            }

            // Check negative keywords
            if !exc_kws.is_empty() {
                let matches_any = exc_kws.iter().any(|kw| tag_lower.contains(kw));
                if matches_any {
                    continue;
                }
            }

            resolved_tags.push(sys_tag.to_string());
        }
    }

    Ok(resolved_tags)
}

pub fn delete_outbound_group(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM outbound_groups WHERE id = ?", [id])?;
    let _ = refresh_node_group_version_code(conn)?;
    Ok(())
}

pub fn get_node_group_version_code(conn: &Connection) -> Result<i64> {
    let val = get_setting(conn, "node_group_version_code")?.unwrap_or_default();
    Ok(val.parse::<i64>().unwrap_or(0))
}

pub fn refresh_node_group_version_code(conn: &Connection) -> Result<i64> {
    let now_code: i64 = chrono::Local::now()
        .format("%Y%m%d%H%M%S")
        .to_string()
        .parse()
        .unwrap_or(0);
    update_setting(conn, "node_group_version_code", &now_code.to_string())?;
    Ok(now_code)
}

pub fn get_config_profiles(
    conn: &Connection,
    platform: Option<&str>,
) -> Result<Vec<ConfigProfile>> {
    let (query, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = match platform {
        Some(p) if !p.is_empty() && p != "all" => (
            "SELECT id, name, platform, description, token, version_code, content, is_running_config, created_at, updated_at FROM configs WHERE platform = ? ORDER BY id ASC".to_string(),
            vec![Box::new(p.to_string())],
        ),
        _ => (
            "SELECT id, name, platform, description, token, version_code, content, is_running_config, created_at, updated_at FROM configs ORDER BY id ASC".to_string(),
            vec![],
        ),
    };

    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(AsRef::as_ref).collect();
    let mut stmt = conn.prepare(&query)?;
    let profiles = stmt
        .query_map(params_slice.as_slice(), |row| {
            let is_running_int: i32 = row.get(7)?;
            Ok(ConfigProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                platform: row.get(2)?,
                description: row.get(3)?,
                token: row.get(4)?,
                version_code: row.get(5)?,
                content: row.get(6)?,
                is_running_config: is_running_int != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(profiles)
}

pub fn get_config_profile_by_id(conn: &Connection, id: i64) -> Result<Option<ConfigProfile>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, platform, description, token, version_code, content, is_running_config, created_at, updated_at FROM configs WHERE id = ?",
    )?;
    let mut rows = stmt.query([id])?;
    if let Some(row) = rows.next()? {
        let is_running_int: i32 = row.get(7)?;
        Ok(Some(ConfigProfile {
            id: row.get(0)?,
            name: row.get(1)?,
            platform: row.get(2)?,
            description: row.get(3)?,
            token: row.get(4)?,
            version_code: row.get(5)?,
            content: row.get(6)?,
            is_running_config: is_running_int != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_config_profile_by_token(
    conn: &Connection,
    token: &str,
) -> Result<Option<ConfigProfile>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, platform, description, token, version_code, content, is_running_config, created_at, updated_at FROM configs WHERE token = ?",
    )?;
    let mut rows = stmt.query([token])?;
    if let Some(row) = rows.next()? {
        let is_running_int: i32 = row.get(7)?;
        Ok(Some(ConfigProfile {
            id: row.get(0)?,
            name: row.get(1)?,
            platform: row.get(2)?,
            description: row.get(3)?,
            token: row.get(4)?,
            version_code: row.get(5)?,
            content: row.get(6)?,
            is_running_config: is_running_int != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_running_config_profile(conn: &Connection) -> Result<Option<ConfigProfile>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, platform, description, token, version_code, content, is_running_config, created_at, updated_at FROM configs WHERE is_running_config = 1 LIMIT 1",
    )?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let is_running_int: i32 = row.get(7)?;
        Ok(Some(ConfigProfile {
            id: row.get(0)?,
            name: row.get(1)?,
            platform: row.get(2)?,
            description: row.get(3)?,
            token: row.get(4)?,
            version_code: row.get(5)?,
            content: row.get(6)?,
            is_running_config: is_running_int != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn create_config_profile(
    conn: &Connection,
    name: &str,
    platform: &str,
    description: Option<&str>,
    content: &str,
) -> Result<ConfigProfile> {
    let token = uuid::Uuid::new_v4().to_string();
    let current_version_code = get_node_group_version_code(conn)?;
    let platform_clean = platform.trim().to_lowercase();
    conn.execute(
        "INSERT INTO configs (name, platform, description, token, version_code, content, is_running_config) VALUES (?, ?, ?, ?, ?, ?, 0)",
        params![name, platform_clean, description, token, current_version_code, content],
    )?;
    let id = conn.last_insert_rowid();
    get_config_profile_by_id(conn, id)?.ok_or_else(|| anyhow::anyhow!("获取新建配置失败"))
}

pub fn update_config_profile(
    conn: &Connection,
    id: i64,
    name: &str,
    platform: &str,
    description: Option<&str>,
    content: &str,
) -> Result<()> {
    let platform_clean = platform.trim().to_lowercase();
    conn.execute(
        "UPDATE configs SET name = ?, platform = ?, description = ?, content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
        params![name, platform_clean, description, content, id],
    )?;
    Ok(())
}

pub fn delete_config_profile(conn: &Connection, id: i64) -> Result<()> {
    let target =
        get_config_profile_by_id(conn, id)?.ok_or_else(|| anyhow::anyhow!("待删除的配置不存在"))?;
    if target.is_running_config {
        return Err(anyhow::anyhow!("无法删除当前正在绑定的本机运行配置"));
    }
    conn.execute("DELETE FROM configs WHERE id = ?", [id])?;
    Ok(())
}

pub fn reset_config_profile_token(conn: &Connection, id: i64) -> Result<String> {
    let new_token = uuid::Uuid::new_v4().to_string();
    let rows = conn.execute(
        "UPDATE configs SET token = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
        params![new_token, id],
    )?;
    if rows == 0 {
        return Err(anyhow::anyhow!("目标配置不存在"));
    }
    Ok(new_token)
}

pub fn set_running_config_profile(conn: &Connection, id: i64) -> Result<ConfigProfile> {
    let profile =
        get_config_profile_by_id(conn, id)?.ok_or_else(|| anyhow::anyhow!("目标配置不存在"))?;
    let host_os = crate::platform::current_platform().os_name();
    let prof_os = profile.platform.to_lowercase();

    if prof_os != host_os {
        return Err(anyhow::anyhow!(
            "配置的目标平台 ({prof_os}) 与当前宿主机平台 ({host_os}) 不匹配，无法绑定为本机运行配置"
        ));
    }

    conn.execute("UPDATE configs SET is_running_config = 0", [])?;
    conn.execute(
        "UPDATE configs SET is_running_config = 1, updated_at = datetime('now', 'localtime') WHERE id = ?",
        [id],
    )?;
    update_setting(conn, "running_config_id", &id.to_string())?;

    get_config_profile_by_id(conn, id)?.ok_or_else(|| anyhow::anyhow!("获取已更新运行配置失败"))
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
        "INSERT INTO config_history (change_type, action, detail, content, updated_at) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))",
        params![change_type, action, detail, content],
    )?;
    Ok(())
}

pub fn log_history_with_config_id(
    conn: &Connection,
    config_id: Option<i64>,
    change_type: &str,
    action: &str,
    detail: &str,
    content: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO config_history (config_id, change_type, action, detail, content, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))",
        params![config_id, change_type, action, detail, content],
    )?;
    Ok(())
}

pub fn get_config_history(conn: &Connection) -> Result<Vec<ConfigHistory>> {
    let mut stmt = conn.prepare(
        "SELECT id, config_id, change_type, action, detail, created_at, COALESCE(updated_at, created_at) as updated_at FROM config_history WHERE change_type IN ('配置列表', '模板配置', 'auto_update', '自动更新') ORDER BY id DESC",
    )?;
    let history = stmt
        .query_map([], |row| {
            Ok(ConfigHistory {
                id: row.get(0)?,
                config_id: row.get(1)?,
                change_type: row.get(2)?,
                action: row.get(3)?,
                detail: row.get(4)?,
                content: None,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(history)
}

pub fn get_config_history_detail(conn: &Connection, id: i64) -> Result<Option<ConfigHistory>> {
    let mut stmt = conn.prepare(
        "SELECT id, config_id, change_type, action, detail, content, created_at, COALESCE(updated_at, created_at) as updated_at FROM config_history WHERE id = ?"
    )?;
    let mut rows = stmt.query([id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(ConfigHistory {
            id: row.get(0)?,
            config_id: row.get(1)?,
            change_type: row.get(2)?,
            action: row.get(3)?,
            detail: row.get(4)?,
            content: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_nodes_speed_summary(conn: &Connection) -> Result<SpeedTestSummary> {
    let mut stmt = conn.prepare(
        "SELECT id, tag, node_type, last_tcp_latency, last_web_latency, last_tested_at FROM nodes",
    )?;

    let mut total_nodes = 0i64;
    let mut tested_nodes = 0i64;
    let mut available_nodes = 0i64;
    let mut failed_nodes = 0i64;
    let mut untested_nodes = 0i64;

    let mut sum_web = 0u64;
    let mut count_web = 0u64;
    let mut sum_tcp = 0u64;
    let mut count_tcp = 0u64;

    let mut fastest: Option<FastestNodeInfo> = None;
    let mut max_tested_at: Option<String> = None;

    let mut web_tiers = LatencyTierCount {
        fast: 0,
        medium: 0,
        slow: 0,
        failed: 0,
        untested: 0,
    };
    let mut tcp_tiers = LatencyTierCount {
        fast: 0,
        medium: 0,
        slow: 0,
        failed: 0,
        untested: 0,
    };

    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let tag: String = row.get(1)?;
        let node_type: String = row.get(2)?;
        let tcp: Option<i64> = row.get(3)?;
        let web: Option<i64> = row.get(4)?;
        let tested_at: Option<String> = row.get(5)?;
        Ok((id, tag, node_type, tcp, web, tested_at))
    })?;

    for r in rows {
        let (id, tag, node_type, tcp, web, tested_at) = r?;
        total_nodes += 1;

        if let Some(t) = tested_at
            && max_tested_at.as_ref().is_none_or(|curr| t > *curr)
        {
            max_tested_at = Some(t);
        }

        let is_tested = tcp.is_some() || web.is_some();
        if !is_tested {
            untested_nodes += 1;
            web_tiers.untested += 1;
            tcp_tiers.untested += 1;
            continue;
        }

        tested_nodes += 1;

        // Process TCP
        match tcp {
            Some(v) if v > 0 => {
                let v_u64 = v as u64;
                sum_tcp += v_u64;
                count_tcp += 1;
                if v < 100 {
                    tcp_tiers.fast += 1;
                } else if v <= 300 {
                    tcp_tiers.medium += 1;
                } else {
                    tcp_tiers.slow += 1;
                }
            }
            Some(_) => {
                tcp_tiers.failed += 1;
            }
            None => {
                tcp_tiers.untested += 1;
            }
        }

        // Process Web
        match web {
            Some(v) if v > 0 => {
                let v_u64 = v as u64;
                sum_web += v_u64;
                count_web += 1;
                if v < 100 {
                    web_tiers.fast += 1;
                } else if v <= 300 {
                    web_tiers.medium += 1;
                } else {
                    web_tiers.slow += 1;
                }
            }
            Some(_) => {
                web_tiers.failed += 1;
            }
            None => {
                web_tiers.untested += 1;
            }
        }

        // Overall availability: available if either web > 0 or tcp > 0
        let web_ok = web.is_some_and(|v| v > 0);
        let tcp_ok = tcp.is_some_and(|v| v > 0);

        if web_ok || tcp_ok {
            available_nodes += 1;
            let effective_lat = if web_ok {
                web.unwrap_or(0) as u64
            } else {
                tcp.unwrap_or(0) as u64
            };
            if fastest.as_ref().is_none_or(|f| effective_lat < f.latency) {
                fastest = Some(FastestNodeInfo {
                    id,
                    tag,
                    latency: effective_lat,
                    node_type,
                });
            }
        } else {
            failed_nodes += 1;
        }
    }

    let availability_rate = if tested_nodes > 0 {
        ((available_nodes as f64 / tested_nodes as f64) * 1000.0).round() / 10.0
    } else {
        0.0
    };

    let avg_web_latency = sum_web.checked_div(count_web);
    let avg_tcp_latency = sum_tcp.checked_div(count_tcp);

    Ok(SpeedTestSummary {
        total_nodes,
        tested_nodes,
        available_nodes,
        failed_nodes,
        untested_nodes,
        availability_rate,
        avg_web_latency,
        avg_tcp_latency,
        fastest_node: fastest,
        web_tiers,
        tcp_tiers,
        last_tested_at: max_tested_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_speed_test_summary_empty() {
        let conn = Connection::open_in_memory().unwrap();
        setup_database(&conn).unwrap();

        let summary = get_nodes_speed_summary(&conn).unwrap();
        assert_eq!(summary.total_nodes, 0);
        assert_eq!(summary.tested_nodes, 0);
        assert_eq!(summary.available_nodes, 0);
        assert_eq!(summary.failed_nodes, 0);
        assert_eq!(summary.untested_nodes, 0);
        assert!((summary.availability_rate - 0.0).abs() < f64::EPSILON);
        assert_eq!(summary.avg_web_latency, None);
        assert_eq!(summary.avg_tcp_latency, None);
        assert_eq!(summary.fastest_node, None);
    }

    #[test]
    fn test_speed_test_summary_with_nodes() {
        let conn = Connection::open_in_memory().unwrap();
        setup_database(&conn).unwrap();

        // Node 1: Fast (tcp 40ms, web 60ms)
        save_node(
            &conn, None, "node1", "vless", "1.1.1.1", 443, "{}", true, true,
        )
        .unwrap();
        update_node_ping_result(
            &conn,
            1,
            Some(40),
            Some(60),
            "2026-09-08 10:00:00",
            Some("http://test.com"),
        )
        .unwrap();

        // Node 2: Medium (tcp 120ms, web 180ms)
        save_node(
            &conn, None, "node2", "vmess", "2.2.2.2", 443, "{}", true, true,
        )
        .unwrap();
        update_node_ping_result(
            &conn,
            2,
            Some(120),
            Some(180),
            "2026-09-08 10:01:00",
            Some("http://test.com"),
        )
        .unwrap();

        // Node 3: Slow (tcp 350ms, web 420ms)
        save_node(
            &conn, None, "node3", "trojan", "3.3.3.3", 443, "{}", true, true,
        )
        .unwrap();
        update_node_ping_result(
            &conn,
            3,
            Some(350),
            Some(420),
            "2026-09-08 10:02:00",
            Some("http://test.com"),
        )
        .unwrap();

        // Node 4: Timeout (-1, -1)
        save_node(&conn, None, "node4", "ss", "4.4.4.4", 443, "{}", true, true).unwrap();
        update_node_ping_result(
            &conn,
            4,
            Some(-1),
            Some(-1),
            "2026-09-08 10:03:00",
            Some("http://test.com"),
        )
        .unwrap();

        // Node 5: Untested
        save_node(
            &conn,
            None,
            "node5",
            "hysteria2",
            "5.5.5.5",
            443,
            "{}",
            true,
            true,
        )
        .unwrap();

        let summary = get_nodes_speed_summary(&conn).unwrap();
        assert_eq!(summary.total_nodes, 5);
        assert_eq!(summary.tested_nodes, 4);
        assert_eq!(summary.available_nodes, 3);
        assert_eq!(summary.failed_nodes, 1);
        assert_eq!(summary.untested_nodes, 1);
        assert!((summary.availability_rate - 75.0).abs() < f64::EPSILON); // 3 / 4 = 75.0%

        // Web avg: (60 + 180 + 420) / 3 = 660 / 3 = 220
        assert_eq!(summary.avg_web_latency, Some(220));
        // TCP avg: (40 + 120 + 350) / 3 = 510 / 3 = 170
        assert_eq!(summary.avg_tcp_latency, Some(170));

        // Fastest node should be node1 with 60ms web latency
        let fastest = summary.fastest_node.unwrap();
        assert_eq!(fastest.id, 1);
        assert_eq!(fastest.tag, "node1");
        assert_eq!(fastest.latency, 60);

        // Tiers
        assert_eq!(summary.web_tiers.fast, 1);
        assert_eq!(summary.web_tiers.medium, 1);
        assert_eq!(summary.web_tiers.slow, 1);
        assert_eq!(summary.web_tiers.failed, 1);
        assert_eq!(summary.web_tiers.untested, 1);

        assert_eq!(
            summary.last_tested_at,
            Some("2026-09-08 10:03:00".to_string())
        );
    }

    #[test]
    fn test_config_profiles_crud_and_running_config() {
        let conn = Connection::open_in_memory().unwrap();
        setup_database(&conn).unwrap();

        // Check bootstrap created 1 running config matching host platform
        let profiles = get_config_profiles(&conn, None).unwrap();
        assert_eq!(profiles.len(), 1);
        assert!(profiles[0].is_running_config);
        let host_os = crate::platform::current_platform().os_name();
        assert_eq!(profiles[0].platform, host_os);

        // Version code should be initialized
        let vcode = get_node_group_version_code(&conn).unwrap();
        assert!(vcode > 0);

        // Refresh version code
        let new_vcode = refresh_node_group_version_code(&conn).unwrap();
        assert!(new_vcode >= vcode);

        // Create an Android profile
        let android_profile = create_config_profile(
            &conn,
            "我的安卓手机",
            "android",
            Some("用于外网出差分流"),
            r#"{"log":{},"dns":{},"inbounds":[],"outbounds":[],"route":{}}"#,
        )
        .unwrap();

        assert_eq!(android_profile.name, "我的安卓手机");
        assert_eq!(android_profile.platform, "android");
        assert!(!android_profile.is_running_config);
        assert!(!android_profile.token.is_empty());

        // Attempting to set Android config as host running config must fail
        let set_res = set_running_config_profile(&conn, android_profile.id);
        assert!(set_res.is_err());
        let err_str = set_res.unwrap_err().to_string();
        assert!(err_str.contains("不匹配"));

        // Reset token
        let old_token = android_profile.token.clone();
        let new_token = reset_config_profile_token(&conn, android_profile.id).unwrap();
        assert_ne!(old_token, new_token);

        let fetched_by_token = get_config_profile_by_token(&conn, &new_token)
            .unwrap()
            .unwrap();
        assert_eq!(fetched_by_token.id, android_profile.id);

        // Cannot delete running config
        let del_running_res = delete_config_profile(&conn, profiles[0].id);
        assert!(del_running_res.is_err());

        // Can delete Android non-running config
        assert!(delete_config_profile(&conn, android_profile.id).is_ok());
        assert!(
            get_config_profile_by_id(&conn, android_profile.id)
                .unwrap()
                .is_none()
        );
    }
}
