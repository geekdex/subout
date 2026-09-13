use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Subscription {
    pub id: i64,
    pub url: String,
    pub label: String,
    pub enabled: bool,
    pub last_fetched: Option<String>,
    pub last_error: Option<String>,
    pub filter_keywords: Option<String>,
    pub delete_on_update: Option<bool>,
    pub upload: Option<i64>,
    pub download: Option<i64>,
    pub total: Option<i64>,
    pub expire: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Node {
    pub id: i64,
    pub subscription_id: Option<i64>,
    pub subscription_label: Option<String>, // Dynamic field from JOIN
    pub tag: String,
    pub node_type: String,
    pub server: String,
    pub port: i64,
    pub raw_json: String,
    pub enabled: bool,
    pub is_custom: bool,
    pub last_tcp_latency: Option<i64>,
    pub last_web_latency: Option<i64>,
    pub last_tested_at: Option<String>,
    pub last_target_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OutboundGroup {
    pub id: i64,
    pub tag: String,
    pub group_type: String, // "selector" or "urltest"
    pub url: Option<String>,
    pub interval: Option<String>,
    pub tolerance: Option<i64>,
    pub static_nodes: Option<String>, // JSON list of node tags
    pub node_types: Option<String>,
    pub subscriptions: Option<String>,
    pub include_keywords: Option<String>,
    pub exclude_keywords: Option<String>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    pub port: String,
    pub last_generated_config: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NodesPage {
    pub nodes: Vec<Node>,
    #[serde(rename = "total")]
    pub total_count: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ConfigHistory {
    pub id: i64,
    pub change_type: String,
    pub action: String,
    pub detail: String,
    pub content: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct LatencyTierCount {
    pub fast: i64,
    pub medium: i64,
    pub slow: i64,
    pub failed: i64,
    pub untested: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct FastestNodeInfo {
    pub id: i64,
    pub tag: String,
    pub latency: u64,
    pub node_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct SpeedTestSummary {
    pub total_nodes: i64,
    pub tested_nodes: i64,
    pub available_nodes: i64,
    pub failed_nodes: i64,
    pub untested_nodes: i64,
    pub availability_rate: f64,
    pub avg_web_latency: Option<u64>,
    pub avg_tcp_latency: Option<u64>,
    pub fastest_node: Option<FastestNodeInfo>,
    pub web_tiers: LatencyTierCount,
    pub tcp_tiers: LatencyTierCount,
    pub last_tested_at: Option<String>,
}

