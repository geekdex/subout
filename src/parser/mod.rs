pub mod types;
pub mod utils;

pub use types::Outbound;
pub use utils::decode_base64;

use percent_encoding::percent_decode_str;
use types::*;
use url::Url;
use utils::*;

pub fn parse_line(line: &str) -> Option<Outbound> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    // Try VMESS first because VMESS starts with vmess:// and has a base64 payload
    if line.starts_with("vmess://") {
        let payload = &line[8..];
        if let Some(decoded_str) = decode_base64(payload.to_string()) {
            if let Ok(vj) = serde_json::from_str::<VmessJsonRaw>(&decoded_str) {
                let port = match vj.port {
                    serde_json::Value::Number(num) => num.as_u64().unwrap_or(443) as u16,
                    serde_json::Value::String(s) => s.parse::<u16>().unwrap_or(443),
                    _ => 443,
                };
                let alter_id = match vj.aid {
                    serde_json::Value::Number(num) => num.as_u64().unwrap_or(0) as u32,
                    serde_json::Value::String(s) => s.parse::<u32>().unwrap_or(0),
                    _ => 0,
                };
                let tag = vj
                    .ps
                    .clone()
                    .unwrap_or_else(|| format!("{}:{}", vj.add, port));

                let has_tls = vj.tls.as_deref() == Some("tls") || port == 443;
                let tls_config = if has_tls {
                    Some(TlsConfig {
                        enabled: true,
                        server_name: vj.sni.clone().or_else(|| vj.host.clone()),
                        insecure: None,
                        reality: None,
                        utls: None,
                    })
                } else {
                    None
                };

                let transport = if let Some(net) = vj.net.as_deref() {
                    match net {
                        "ws" => Some(serde_json::json!({
                            "type": "ws",
                            "path": vj.path.clone().unwrap_or_else(|| "/".to_string()),
                            "headers": {
                                "Host": vj.host.clone().unwrap_or_default()
                            }
                        })),
                        "grpc" => Some(serde_json::json!({
                            "type": "grpc",
                            "service_name": vj.path.clone().unwrap_or_default()
                        })),
                        "h2" | "http" => Some(serde_json::json!({
                            "type": "http",
                            "host": vec![vj.host.clone().unwrap_or_default()],
                            "path": vj.path.clone().unwrap_or_else(|| "/".to_string())
                        })),
                        _ => None,
                    }
                } else {
                    None
                };

                return Some(Outbound::Vmess(VmessOutbound {
                    tag,
                    server: vj.add,
                    server_port: port,
                    uuid: vj.id,
                    alter_id,
                    security: "auto".to_string(),
                    tls: tls_config,
                    transport,
                }));
            }
        }
        return None;
    }

    // Check if the whole line starts with https://, and see if the rest of it is a base64 string
    if line.starts_with("https://") {
        let rest = &line[8..];
        if !rest.contains('@') && !rest.contains(':') {
            // It might be base64 encoded rest
            if let Some(decoded_rest) = decode_base64(rest.to_string()) {
                // If it decodes to something containing @ or :, parse it
                if decoded_rest.contains('@') {
                    // Prepend http:// to make it a valid URL parseable string
                    let mock_url = format!("http://{}", decoded_rest);
                    if let Ok(parsed_url) = Url::parse(&mock_url) {
                        return parse_url_to_outbound(&parsed_url, true); // true since it was wrapped in https://
                    }
                }
            }
        }
    }

    // Try standard URL parsing
    if let Ok(url) = Url::parse(line) {
        return parse_url_to_outbound(&url, false);
    }

    None
}

fn parse_url_to_outbound(url: &Url, force_https: bool) -> Option<Outbound> {
    let scheme = url.scheme();
    let host = url.host_str()?.to_string();
    let port = url.port().unwrap_or(match scheme {
        "https" => 443,
        "http" => 80,
        "socks" | "socks5" => 1080,
        "trojan" | "vless" | "anytls" | "hysteria" | "hysteria2" => 443,
        _ => 443,
    });

    let tag = url
        .fragment()
        .map(|f| percent_decode_str(f).decode_utf8_lossy().into_owned())
        .unwrap_or_else(|| format!("{}:{}", host, port));

    let username = if url.username().is_empty() {
        None
    } else {
        Some(
            percent_decode_str(url.username())
                .decode_utf8_lossy()
                .into_owned(),
        )
    };
    let password = url
        .password()
        .map(|p| percent_decode_str(p).decode_utf8_lossy().into_owned());

    // Parse query params
    let mut params = std::collections::HashMap::new();
    for (k, v) in url.query_pairs() {
        params.insert(k.into_owned(), v.into_owned());
    }

    match scheme {
        "socks" | "socks5" => {
            let has_tls = params
                .get("tls")
                .map(|v| v == "1" || v == "true")
                .unwrap_or(false);
            let tls_config = if has_tls {
                Some(TlsConfig {
                    enabled: true,
                    server_name: params.get("sni").cloned(),
                    insecure: params.get("allowInsecure").map(|v| v == "1" || v == "true"),
                    reality: None,
                    utls: None,
                })
            } else {
                None
            };

            Some(Outbound::Socks(SocksOutbound {
                tag,
                server: host,
                server_port: port,
                username,
                password,
                tls: tls_config,
            }))
        }
        "http" | "https" | _ if scheme == "http" || scheme == "https" || force_https => {
            let is_secure = scheme == "https" || force_https;
            let tls_config = if is_secure {
                Some(TlsConfig {
                    enabled: true,
                    server_name: params.get("sni").cloned(),
                    insecure: params.get("allowInsecure").map(|v| v == "1" || v == "true"),
                    reality: None,
                    utls: None,
                })
            } else {
                None
            };

            Some(Outbound::Http(HttpOutbound {
                tag,
                server: host,
                server_port: port,
                username,
                password,
                tls: tls_config,
            }))
        }
        "anytls" => {
            // anytls://password@host:port
            // The password is in the username field if there's no colon
            let pass = password.clone().or(username.clone()).unwrap_or_default();
            let allow_insecure = params
                .get("allowInsecure")
                .map(|v| v == "1" || v == "true")
                .unwrap_or(false);
            let sni = params.get("sni").cloned();

            Some(Outbound::Anytls(AnytlsOutbound {
                tag,
                server: host,
                server_port: port,
                password: pass,
                tls: Some(TlsConfig {
                    enabled: true,
                    server_name: sni,
                    insecure: Some(allow_insecure),
                    reality: None,
                    utls: None,
                }),
            }))
        }
        "trojan" => {
            let pass = password.clone().or(username.clone()).unwrap_or_default();
            let has_tls = params.get("security").map(|v| v == "tls").unwrap_or(true);
            let tls_config = if has_tls {
                Some(TlsConfig {
                    enabled: true,
                    server_name: params.get("sni").cloned(),
                    insecure: params.get("allowInsecure").map(|v| v == "1" || v == "true"),
                    reality: None,
                    utls: None,
                })
            } else {
                None
            };

            let transport = parse_transport_params(&params);

            Some(Outbound::Trojan(TrojanOutbound {
                tag,
                server: host,
                server_port: port,
                password: pass,
                tls: tls_config,
                transport,
            }))
        }
        "vless" => {
            let uuid = username.clone().unwrap_or_default();
            let flow = params.get("flow").cloned();

            // Reality or Standard TLS
            let security = params.get("security").cloned().unwrap_or_default();
            let has_tls = security == "tls" || security == "reality" || !security.is_empty();

            let tls_config = if has_tls {
                let reality_config = if security == "reality" {
                    Some(RealityConfig {
                        enabled: true,
                        public_key: params.get("pbk").cloned().unwrap_or_default(),
                        short_id: params.get("sid").cloned(),
                    })
                } else {
                    None
                };

                let utls_config = params.get("fp").map(|fp| UtlsConfig {
                    enabled: true,
                    fingerprint: fp.clone(),
                });

                Some(TlsConfig {
                    enabled: true,
                    server_name: params.get("sni").cloned(),
                    insecure: params.get("allowInsecure").map(|v| v == "1" || v == "true"),
                    reality: reality_config,
                    utls: utls_config,
                })
            } else {
                None
            };

            let transport = parse_transport_params(&params);
            let packet_encoding = params
                .get("packetEncoding")
                .cloned()
                .or_else(|| Some("xudp".to_string()));

            Some(Outbound::Vless(VlessOutbound {
                tag,
                server: host,
                server_port: port,
                uuid,
                flow,
                tls: tls_config,
                packet_encoding,
                transport,
            }))
        }
        "ss" => {
            // ss://base64(method:password)@host:port
            // Or ss://method:password@host:port
            let mut method = String::new();
            let mut pass = String::new();

            if let Some(user_part) = username {
                // Check if user_part contains method:password directly
                if user_part.contains(':') {
                    let parts: Vec<&str> = user_part.splitn(2, ':').collect();
                    method = parts[0].to_string();
                    pass = parts[1].to_string();
                } else {
                    // Try decoding as base64
                    if let Some(decoded) = decode_base64(user_part.clone()) {
                        if decoded.contains(':') {
                            let parts: Vec<&str> = decoded.splitn(2, ':').collect();
                            method = parts[0].to_string();
                            pass = parts[1].to_string();
                        }
                    }
                }
            }

            if method.is_empty() {
                return None;
            }

            Some(Outbound::Shadowsocks(ShadowsocksOutbound {
                tag,
                server: host,
                server_port: port,
                method,
                password: pass,
            }))
        }
        "hysteria" => {
            let auth = password
                .clone()
                .map(|p| format!("{}:{}", username.clone().unwrap_or_default(), p))
                .or(username.clone());
            let auth_str = auth.map(maybe_decode_base64);

            let allow_insecure = params
                .get("insecure")
                .map(|v| v == "1" || v == "true")
                .unwrap_or(false);
            let sni = params.get("sni").cloned();

            let up_mbps = params
                .get("up")
                .or_else(|| params.get("up_mbps"))
                .and_then(|v| parse_mbps(v));
            let down_mbps = params
                .get("down")
                .or_else(|| params.get("down_mbps"))
                .and_then(|v| parse_mbps(v));

            let obfs = params
                .get("obfs")
                .or_else(|| params.get("obfs-password"))
                .or_else(|| params.get("obfs_password"))
                .cloned()
                .map(maybe_decode_base64);

            Some(Outbound::Hysteria(HysteriaOutbound {
                tag,
                server: host,
                server_port: port,
                auth: None,
                auth_str,
                up_mbps,
                down_mbps,
                obfs,
                tls: Some(TlsConfig {
                    enabled: true,
                    server_name: sni,
                    insecure: Some(allow_insecure),
                    reality: None,
                    utls: None,
                }),
            }))
        }
        "hysteria2" => {
            let pass = password.clone().or(username.clone()).unwrap_or_default();
            let pass = maybe_decode_base64(pass);

            let allow_insecure = params
                .get("insecure")
                .map(|v| v == "1" || v == "true")
                .unwrap_or(false);
            let sni = params.get("sni").cloned();

            let up_mbps = params
                .get("up")
                .or_else(|| params.get("up_mbps"))
                .and_then(|v| parse_mbps(v));
            let down_mbps = params
                .get("down")
                .or_else(|| params.get("down_mbps"))
                .and_then(|v| parse_mbps(v));

            let obfs = if let Some(obfs_type) = params.get("obfs").cloned() {
                if let Some(obfs_pass) = params
                    .get("obfs-password")
                    .or_else(|| params.get("obfs_password"))
                    .cloned()
                {
                    let decoded_obfs_pass = maybe_decode_base64(obfs_pass);
                    Some(Hysteria2Obfs {
                        r#type: obfs_type,
                        password: decoded_obfs_pass,
                    })
                } else {
                    None
                }
            } else {
                None
            };

            Some(Outbound::Hysteria2(Hysteria2Outbound {
                tag,
                server: host,
                server_port: port,
                password: pass,
                up_mbps,
                down_mbps,
                obfs,
                tls: Some(TlsConfig {
                    enabled: true,
                    server_name: sni,
                    insecure: Some(allow_insecure),
                    reality: None,
                    utls: None,
                }),
            }))
        }
        _ => None,
    }
}

pub fn parse_subscription(content: &str, verbose: bool) -> (Vec<Outbound>, Vec<String>) {
    let mut outbounds = Vec::new();
    let mut skipped = Vec::new();

    // First, check if the entire content is base64 encoded
    let processed_content = if let Some(decoded) = decode_base64(content.to_string()) {
        if verbose {
            eprintln!("[Info] Successfully decoded base64 subscription content.");
        }
        decoded
    } else {
        if verbose {
            eprintln!("[Info] Subscription content is parsed as plain text.");
        }
        content.to_string()
    };

    for line in processed_content.lines() {
        if let Some(outbound) = parse_line(line) {
            if outbound.is_announcement() {
                skipped.push(outbound.tag().to_string());
                continue;
            }
            outbounds.push(outbound);
        }
    }

    (outbounds, skipped)
}
