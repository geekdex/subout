use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD, URL_SAFE},
};

pub fn decode_base64(mut input: String) -> Option<String> {
    input.retain(|c| !c.is_whitespace() && c != '\r' && c != '\n');
    let rem = input.len() % 4;
    if rem > 0 {
        input.push_str(&"===="[rem..]);
    }

    if let Ok(bytes) = STANDARD.decode(&input) {
        if let Ok(s) = String::from_utf8(bytes) {
            return Some(s);
        }
    }
    if let Ok(bytes) = URL_SAFE.decode(&input) {
        if let Ok(s) = String::from_utf8(bytes) {
            return Some(s);
        }
    }
    None
}

pub fn parse_transport_params(
    params: &std::collections::HashMap<String, String>,
) -> Option<serde_json::Value> {
    let t_type = params.get("type")?.as_str();
    match t_type {
        "ws" => {
            let path = params
                .get("path")
                .cloned()
                .unwrap_or_else(|| "/".to_string());
            let host = params.get("host").cloned().unwrap_or_default();
            Some(serde_json::json!({
                "type": "ws",
                "path": path,
                "headers": {
                    "Host": host
                }
            }))
        }
        "grpc" => {
            let service_name = params.get("serviceName").cloned().unwrap_or_default();
            Some(serde_json::json!({
                "type": "grpc",
                "service_name": service_name
            }))
        }
        "http" | "h2" => {
            let path = params
                .get("path")
                .cloned()
                .unwrap_or_else(|| "/".to_string());
            let host = params.get("host").cloned().unwrap_or_default();
            Some(serde_json::json!({
                "type": "http",
                "host": vec![host],
                "path": path
            }))
        }
        _ => None,
    }
}

pub fn parse_mbps(val: &str) -> Option<u32> {
    let mut num_str = String::new();
    for c in val.chars() {
        if c.is_ascii_digit() {
            num_str.push(c);
        } else if !num_str.is_empty() && (c == ' ' || c == 'M' || c == 'm' || c == 'k' || c == 'K')
        {
            break;
        }
    }
    num_str.parse::<u32>().ok()
}

pub fn maybe_decode_base64(input: String) -> String {
    decode_base64(input.clone())
        .filter(|decoded| {
            decoded
                .chars()
                .all(|c| c.is_ascii_graphic() || c.is_ascii_whitespace())
        })
        .unwrap_or(input)
}
