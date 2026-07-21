use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Outbound {
    Socks(SocksOutbound),
    Http(HttpOutbound),
    Vmess(VmessOutbound),
    Anytls(AnytlsOutbound),
    Trojan(TrojanOutbound),
    Vless(VlessOutbound),
    Shadowsocks(ShadowsocksOutbound),
    Hysteria(HysteriaOutbound),
    Hysteria2(Hysteria2Outbound),
}

impl Outbound {
    pub fn tag(&self) -> &str {
        match self {
            Outbound::Socks(o) => &o.tag,
            Outbound::Http(o) => &o.tag,
            Outbound::Vmess(o) => &o.tag,
            Outbound::Anytls(o) => &o.tag,
            Outbound::Trojan(o) => &o.tag,
            Outbound::Vless(o) => &o.tag,
            Outbound::Shadowsocks(o) => &o.tag,
            Outbound::Hysteria(o) => &o.tag,
            Outbound::Hysteria2(o) => &o.tag,
        }
    }

    pub fn set_tag(&mut self, new_tag: String) {
        match self {
            Outbound::Socks(o) => o.tag = new_tag,
            Outbound::Http(o) => o.tag = new_tag,
            Outbound::Vmess(o) => o.tag = new_tag,
            Outbound::Anytls(o) => o.tag = new_tag,
            Outbound::Trojan(o) => o.tag = new_tag,
            Outbound::Vless(o) => o.tag = new_tag,
            Outbound::Shadowsocks(o) => o.tag = new_tag,
            Outbound::Hysteria(o) => o.tag = new_tag,
            Outbound::Hysteria2(o) => o.tag = new_tag,
        }
    }

    pub fn server(&self) -> &str {
        match self {
            Outbound::Socks(o) => &o.server,
            Outbound::Http(o) => &o.server,
            Outbound::Vmess(o) => &o.server,
            Outbound::Anytls(o) => &o.server,
            Outbound::Trojan(o) => &o.server,
            Outbound::Vless(o) => &o.server,
            Outbound::Shadowsocks(o) => &o.server,
            Outbound::Hysteria(o) => &o.server,
            Outbound::Hysteria2(o) => &o.server,
        }
    }

    pub fn is_insecure(&self) -> bool {
        let tls = match self {
            Outbound::Socks(o) => &o.tls,
            Outbound::Http(o) => &o.tls,
            Outbound::Vmess(o) => &o.tls,
            Outbound::Anytls(o) => &o.tls,
            Outbound::Trojan(o) => &o.tls,
            Outbound::Vless(o) => &o.tls,
            Outbound::Shadowsocks(_) => &None,
            Outbound::Hysteria(o) => &o.tls,
            Outbound::Hysteria2(o) => &o.tls,
        };
        if let Some(t) = tls {
            t.insecure.unwrap_or(false)
        } else {
            false
        }
    }

    pub fn is_announcement(&self) -> bool {
        let tag = self.tag().to_lowercase();
        let server = self.server().to_lowercase();

        // 1. Check server address placeholders
        if server == "127.0.0.1"
            || server == "0.0.0.0"
            || server == "localhost"
            || server == "hostloc.com"
        {
            return true;
        }

        // 2. Check tag keywords related to announcements/warnings/prompts
        let keywords = [
            "公告",
            "提示",
            "通知",
            "到期",
            "流量",
            "官网",
            "购买",
            "地址",
            "订阅",
            "更新",
            "警告",
            "说明",
            "剩余",
            "充值",
            "防失联",
            "电报",
            "群",
            "notice",
            "announcement",
            "warning",
            "info",
            "expire",
            "traffic",
        ];
        for kw in &keywords {
            if tag.contains(kw) {
                return true;
            }
        }

        false
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TlsConfig {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub insecure: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reality: Option<RealityConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub utls: Option<UtlsConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RealityConfig {
    pub enabled: bool,
    pub public_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub short_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UtlsConfig {
    pub enabled: bool,
    pub fingerprint: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SocksOutbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HttpOutbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VmessOutbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    pub uuid: String,
    pub alter_id: u32,
    pub security: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AnytlsOutbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TrojanOutbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VlessOutbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    pub uuid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flow: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub packet_encoding: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShadowsocksOutbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    pub method: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HysteriaOutbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_str: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub up_mbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub down_mbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obfs: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Hysteria2Outbound {
    pub tag: String,
    pub server: String,
    pub server_port: u16,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub up_mbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub down_mbps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub obfs: Option<Hysteria2Obfs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<TlsConfig>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Hysteria2Obfs {
    pub r#type: String,
    pub password: String,
}

// Inner helper structs for parsing Vmess JSON from base64
#[derive(Deserialize, Debug)]
#[allow(dead_code)]
pub struct VmessJsonRaw {
    pub ps: Option<String>,
    pub add: String,
    pub port: serde_json::Value, // Can be string or number
    pub id: String,
    pub aid: serde_json::Value, // Can be string or number
    pub net: Option<String>,
    #[serde(rename = "type")]
    pub type_field: Option<String>,
    pub host: Option<String>,
    pub path: Option<String>,
    pub tls: Option<String>,
    pub sni: Option<String>,
}
