use serde_json::Value;
use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::OnceLock;

static OFFICIAL_SCHEMA: OnceLock<Value> = OnceLock::new();

/// Returns a reference to the parsed official sing-box JSON Schema (`schema.json`).
pub fn get_official_schema() -> &'static Value {
    OFFICIAL_SCHEMA.get_or_init(|| {
        serde_json::from_str(include_str!("../schema.json"))
            .expect("Failed to parse embedded official schema.json")
    })
}

/// Validates a sing-box configuration JSON value against the official `schema.json`.
///
/// Returns `Ok(())` if the configuration conforms to the schema, or `Err(errors)`
/// containing human-readable validation error messages with JSON paths.
pub fn validate_singbox_schema(config: &Value) -> Result<(), Vec<String>> {
    let root_schema = get_official_schema();
    match validate_node(config, root_schema, root_schema, "$") {
        Ok(_) => Ok(()),
        Err(errs) => Err(errs),
    }
}

/// Validates a JSON string against the official `schema.json`.
pub fn validate_singbox_schema_str(config_str: &str) -> Result<Value, Vec<String>> {
    validate_singbox_config_str_for_platform(config_str, None)
}

/// Validates a sing-box configuration JSON value against both the official `schema.json`
/// and explicit target-platform / `sing-box 1.14` semantic constraints.
pub fn validate_singbox_config_for_platform(
    config: &Value,
    platform: Option<&str>,
) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    if let Err(schema_errs) = validate_singbox_schema(config) {
        errors.extend(schema_errs);
    }
    if let Err(semantic_errs) = validate_platform_and_semantic_rules(config, platform) {
        errors.extend(semantic_errs);
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

/// Validates a JSON string against both the official `schema.json` and target-platform rules.
pub fn validate_singbox_config_str_for_platform(
    config_str: &str,
    platform: Option<&str>,
) -> Result<Value, Vec<String>> {
    let parsed: Value =
        serde_json::from_str(config_str).map_err(|e| vec![format!("JSON 语法解析失败: {e}")])?;
    validate_singbox_config_for_platform(&parsed, platform)?;
    Ok(parsed)
}

fn has_non_empty_field(obj: &serde_json::Map<String, Value>, key: &str) -> bool {
    match obj.get(key) {
        Some(Value::String(s)) => !s.trim().is_empty(),
        Some(Value::Array(arr)) => !arr.is_empty(),
        Some(Value::Number(_) | Value::Object(_)) => true,
        Some(Value::Bool(b)) => *b,
        _ => false,
    }
}

fn validate_rule_platform_fields(rule: &Value, plat: &str, path: &str, errors: &mut Vec<String>) {
    let Some(obj) = rule.as_object() else {
        return;
    };

    if plat == "android" {
        for key in ["process_name", "process_path", "process_path_regex"] {
            if has_non_empty_field(obj, key) {
                errors.push(format!(
                    "{path}.{key}: 桌面端进程匹配字段 '{key}' 不适用于 Android 平台，请改用 package_name / package_name_regex 或移除该项"
                ));
            }
        }
    } else {
        for key in ["package_name", "package_name_regex"] {
            if has_non_empty_field(obj, key) {
                errors.push(format!(
                    "{path}.{key}: Android 应用包名匹配字段 '{key}' 不适用于桌面平台 ({})，请改用 process_name / process_path 或移除该项",
                    plat.to_uppercase()
                ));
            }
        }
    }

    if let Some(children) = obj.get("rules").and_then(Value::as_array) {
        for (idx, child) in children.iter().enumerate() {
            let child_path = format!("{path}.rules[{idx}]");
            validate_rule_platform_fields(child, plat, &child_path, errors);
        }
    }
}

fn validate_platform_and_semantic_rules(
    config: &Value,
    platform: Option<&str>,
) -> Result<(), Vec<String>> {
    let Some(root) = config.as_object() else {
        return Ok(());
    };
    let mut errors = Vec::new();
    let plat_norm = platform
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty());

    // 1. Platform-specific explicit validation
    if let Some(ref plat) = plat_norm {
        if let Some(inbounds) = root.get("inbounds").and_then(Value::as_array) {
            for (idx, inb) in inbounds.iter().enumerate() {
                let Some(inb_obj) = inb.as_object() else {
                    continue;
                };
                if inb_obj.get("type").and_then(Value::as_str) == Some("tun") {
                    if inb_obj.get("auto_redirect").and_then(Value::as_bool) == Some(true)
                        && plat != "linux"
                    {
                        errors.push(format!(
                            "inbounds[{idx}].auto_redirect: 仅 Linux 平台支持 auto_redirect (nftables)，当前平台 ({}) 不支持，请关闭或移除该项",
                            plat.to_uppercase()
                        ));
                    }

                    if has_non_empty_field(inb_obj, "netns") && plat != "linux" {
                        errors.push(format!(
                            "inbounds[{idx}].netns: 仅 Linux 平台支持 netns 网络命名空间，当前平台 ({}) 不支持，请移除该项",
                            plat.to_uppercase()
                        ));
                    }

                    if plat == "macos"
                        && let Some(iface) = inb_obj
                            .get("interface_name")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                    {
                        let valid_utun = iface
                            .strip_prefix("utun")
                            .is_some_and(|rest| rest.chars().all(|c| c.is_ascii_digit()));
                        if !valid_utun {
                            errors.push(format!(
                                "inbounds[{idx}].interface_name: macOS 平台 TUN 网卡名称必须为 utun[0-9]*（如 utun9）或留空由系统自动分配，当前值 '{iface}' 不合法"
                            ));
                        }
                    }

                    if plat != "android" {
                        for key in ["include_package", "exclude_package", "include_android_user"] {
                            if has_non_empty_field(inb_obj, key) {
                                errors.push(format!(
                                    "inbounds[{idx}].{key}: Android 应用分流字段 '{key}' 仅适用于 Android 平台，当前平台 ({}) 不支持，请移除该项",
                                    plat.to_uppercase()
                                ));
                            }
                        }
                    }

                    if plat != "linux" {
                        for key in [
                            "include_uid",
                            "include_uid_range",
                            "exclude_uid",
                            "exclude_uid_range",
                            "include_interface",
                            "exclude_interface",
                            "include_mac_address",
                            "exclude_mac_address",
                        ] {
                            if has_non_empty_field(inb_obj, key) {
                                errors.push(format!(
                                    "inbounds[{idx}].{key}: Linux 专属 TUN 路由过滤字段 '{key}' 仅适用于 Linux 平台，当前平台 ({}) 不支持，请移除该项",
                                    plat.to_uppercase()
                                ));
                            }
                        }
                    }
                }
            }
        }

        if let Some(route_rules) = root
            .get("route")
            .and_then(|r| r.get("rules"))
            .and_then(Value::as_array)
        {
            for (idx, rule) in route_rules.iter().enumerate() {
                let path = format!("route.rules[{idx}]");
                validate_rule_platform_fields(rule, plat, &path, &mut errors);
            }
        }

        if let Some(dns_rules) = root
            .get("dns")
            .and_then(|d| d.get("rules"))
            .and_then(Value::as_array)
        {
            for (idx, rule) in dns_rules.iter().enumerate() {
                let path = format!("dns.rules[{idx}]");
                validate_rule_platform_fields(rule, plat, &path, &mut errors);
            }
        }
    }

    // 2. Explicit sing-box 1.14 semantic checks
    if let Some(servers) = root
        .get("dns")
        .and_then(|d| d.get("servers"))
        .and_then(Value::as_array)
    {
        for (idx, srv) in servers.iter().enumerate() {
            if srv.get("detour").and_then(Value::as_str) == Some("direct") {
                errors.push(format!(
                    "dns.servers[{idx}].detour: 不能将 detour 设为 'direct'（sing-box 1.14 中指向空 direct 出站会导致启动失败），请设为无绕行（直连）"
                ));
            }
        }
    }

    if let Some(clients) = root.get("http_clients").and_then(Value::as_array) {
        for (idx, client) in clients.iter().enumerate() {
            if client.get("detour").and_then(Value::as_str) == Some("direct") {
                errors.push(format!(
                    "http_clients[{idx}].detour: 不能将 detour 设为 'direct'（sing-box 1.14 中指向空 direct 出站会导致启动失败），请移除 detour 字段以使用默认直连"
                ));
            }
        }
    }

    if let Some(rule_sets) = root
        .get("route")
        .and_then(|r| r.get("rule_set"))
        .and_then(Value::as_array)
    {
        for (idx, rs) in rule_sets.iter().enumerate() {
            if rs.get("download_detour").and_then(Value::as_str) == Some("direct") {
                errors.push(format!(
                    "route.rule_set[{idx}].download_detour: 不能将 download_detour 设为 'direct'（sing-box 1.14 中指向空 direct 出站会导致启动失败），请移除该字段"
                ));
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn resolve_ref<'a>(root_schema: &'a Value, reference: &str) -> Option<&'a Value> {
    let pointer = reference.strip_prefix('#')?;
    root_schema.pointer(pointer)
}

fn validate_duration_pattern(s: &str) -> bool {
    if s == "0" || s == "+0" || s == "-0" {
        return true;
    }
    let mut rest = s.strip_prefix(['+', '-']).unwrap_or(s);
    if rest.is_empty() {
        return false;
    }

    let units = ["ns", "us", "µs", "μs", "ms", "s", "m", "h", "d"];
    let mut matched_any = false;

    while !rest.is_empty() {
        let mut num_len = 0;
        let mut has_digits_before = false;
        let mut has_dot = false;
        let mut has_digits_after = false;

        for (idx, ch) in rest.char_indices() {
            if ch.is_ascii_digit() {
                if has_dot {
                    has_digits_after = true;
                } else {
                    has_digits_before = true;
                }
                num_len = idx + ch.len_utf8();
            } else if ch == '.' && !has_dot {
                has_dot = true;
                num_len = idx + ch.len_utf8();
            } else {
                break;
            }
        }

        if num_len == 0 || (!has_digits_before && !has_digits_after) {
            return false;
        }

        rest = &rest[num_len..];
        let mut unit_matched = false;
        for u in &units {
            if let Some(after_unit) = rest.strip_prefix(u) {
                rest = after_unit;
                unit_matched = true;
                break;
            }
        }
        if !unit_matched {
            return false;
        }
        matched_any = true;
    }

    matched_any
}

fn validate_ip_address(s: &str) -> bool {
    if s.parse::<Ipv4Addr>().is_ok() {
        return true;
    }
    let ip_part = s.split_once('%').map_or(s, |(ip, _zone)| ip);
    if s.contains('%') && s.ends_with('%') {
        return false;
    }
    ip_part.parse::<Ipv6Addr>().is_ok()
}

fn validate_ip_prefix(s: &str) -> bool {
    let Some((ip_str, prefix_str)) = s.split_once('/') else {
        return false;
    };
    if prefix_str.is_empty() || (prefix_str.len() > 1 && prefix_str.starts_with('0')) {
        return false;
    }
    let Ok(prefix_len) = prefix_str.parse::<u8>() else {
        return false;
    };
    match ip_str.parse::<IpAddr>() {
        Ok(IpAddr::V4(_)) => prefix_len <= 32,
        Ok(IpAddr::V6(_)) => prefix_len <= 128,
        Err(_) => false,
    }
}

fn validate_ip_address_or_prefix(s: &str) -> bool {
    if s.contains('/') {
        validate_ip_prefix(s)
    } else {
        validate_ip_address(s)
    }
}

fn check_pattern(pattern: &str, value: &str) -> bool {
    if pattern.contains("ns|us|") {
        validate_duration_pattern(value)
    } else if pattern.contains("(?:/(?:3[0-2]|[12]?[0-9]))?") {
        validate_ip_address_or_prefix(value)
    } else if pattern.contains("/(?:3[0-2]|[12]?[0-9])|") {
        validate_ip_prefix(value)
    } else if pattern.contains("(?:%.+)?)$") {
        validate_ip_address(value)
    } else {
        true
    }
}

fn branch_matches_discriminator(branch: &Value, root_schema: &Value, instance: &Value) -> bool {
    let Some(obj) = instance.as_object() else {
        return false;
    };

    if let Some(ref_str) = branch.get("$ref").and_then(Value::as_str)
        && let Some(resolved) = resolve_ref(root_schema, ref_str)
    {
        return branch_matches_discriminator(resolved, root_schema, instance);
    }

    if let Some(all_of) = branch.get("allOf").and_then(Value::as_array)
        && let Some(first) = all_of.first()
    {
        return branch_matches_discriminator(first, root_schema, instance);
    }

    let Some(props) = branch.get("properties").and_then(Value::as_object) else {
        return false;
    };
    let required: Vec<&str> = branch
        .get("required")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();

    for disc_key in ["type", "action", "provider"] {
        if let Some(disc_schema) = props.get(disc_key)
            && let Some(const_val) = disc_schema.get("const").and_then(Value::as_str)
        {
            if let Some(inst_val) = obj.get(disc_key).and_then(Value::as_str) {
                return inst_val == const_val;
            }
            // If discriminator is omitted on the instance and not required by the branch
            // (e.g., default Rule `type: "default"` or default RuleAction `action: "route"`):
            if !required.contains(&disc_key) && matches!(const_val, "default" | "route") {
                return true;
            }
            return false;
        }
    }

    false
}

#[allow(clippy::too_many_lines)]
fn validate_node(
    instance: &Value,
    schema: &Value,
    root_schema: &Value,
    path: &str,
) -> Result<HashSet<String>, Vec<String>> {
    let mut evaluated_props = HashSet::new();
    let mut errors = Vec::new();

    // 1. Resolve $ref if present
    if let Some(ref_str) = schema.get("$ref").and_then(Value::as_str) {
        if let Some(target_schema) = resolve_ref(root_schema, ref_str) {
            match validate_node(instance, target_schema, root_schema, path) {
                Ok(props) => evaluated_props.extend(props),
                Err(errs) => errors.extend(errs),
            }
        } else {
            errors.push(format!("{path}: 无法解析 Schema 引用 '{ref_str}'"));
        }
    }

    // 2. Check `type`
    if let Some(expected_type) = schema.get("type").and_then(Value::as_str) {
        let type_ok = match expected_type {
            "object" => instance.is_object(),
            "array" => instance.is_array(),
            "string" => instance.is_string(),
            "integer" => instance.is_i64() || instance.is_u64(),
            "number" => instance.is_number(),
            "boolean" => instance.is_boolean(),
            "null" => instance.is_null(),
            _ => true,
        };
        if !type_ok {
            errors.push(format!(
                "{path}: 类型错误，期望 '{expected_type}'，实际为 {}",
                describe_value_type(instance)
            ));
            return Err(errors);
        }
    }

    // 3. Check `const`
    if let Some(const_val) = schema.get("const")
        && instance != const_val
    {
        errors.push(format!(
            "{path}: 值必须为 {const_val}，实际为 {}",
            summarize_value(instance)
        ));
    }

    // 4. Check `enum`
    if let Some(enum_arr) = schema.get("enum").and_then(Value::as_array)
        && !enum_arr.contains(instance)
    {
        let allowed: Vec<String> = enum_arr.iter().map(ToString::to_string).collect();
        errors.push(format!(
            "{path}: 值 {} 不在允许的枚举范围内 [{}]",
            summarize_value(instance),
            allowed.join(", ")
        ));
    }

    // 5. Check integer `minimum` / `maximum`
    if instance.is_i64() || instance.is_u64() {
        let val_i128 = instance
            .as_i64()
            .map(i128::from)
            .or_else(|| instance.as_u64().map(i128::from));
        if let Some(v) = val_i128 {
            if let Some(min_val) = schema.get("minimum").and_then(|m| {
                m.as_i64()
                    .map(i128::from)
                    .or_else(|| m.as_u64().map(i128::from))
            }) && v < min_val
            {
                errors.push(format!("{path}: 数值 {v} 小于最小值 {min_val}"));
            }
            if let Some(max_val) = schema.get("maximum").and_then(|m| {
                m.as_i64()
                    .map(i128::from)
                    .or_else(|| m.as_u64().map(i128::from))
            }) && v > max_val
            {
                errors.push(format!("{path}: 数值 {v} 大于最大值 {max_val}"));
            }
        }
    }

    // 6. Check string `pattern`
    if let Some(s) = instance.as_str()
        && let Some(pattern) = schema.get("pattern").and_then(Value::as_str)
        && !check_pattern(pattern, s)
    {
        errors.push(format!("{path}: 字符串 '{s}' 格式不合法"));
    }

    // 7. Check array `items`
    if let Some(arr) = instance.as_array()
        && let Some(items_schema) = schema.get("items")
    {
        for (idx, item) in arr.iter().enumerate() {
            let item_path = format!("{path}[{idx}]");
            if let Err(item_errs) = validate_node(item, items_schema, root_schema, &item_path) {
                errors.extend(item_errs);
            }
        }
    }

    // 8. Check `allOf`
    if let Some(all_of) = schema.get("allOf").and_then(Value::as_array) {
        for sub_schema in all_of {
            match validate_node(instance, sub_schema, root_schema, path) {
                Ok(props) => evaluated_props.extend(props),
                Err(sub_errs) => errors.extend(sub_errs),
            }
        }
    }

    // 9. Check `anyOf`
    if let Some(any_of) = schema.get("anyOf").and_then(Value::as_array) {
        let mut any_matched = false;
        let mut branch_errors = Vec::new();
        for sub_schema in any_of {
            match validate_node(instance, sub_schema, root_schema, path) {
                Ok(props) => {
                    any_matched = true;
                    evaluated_props.extend(props);
                }
                Err(errs) => {
                    branch_errors.push((sub_schema, errs));
                }
            }
        }
        if !any_matched {
            if let Some((_, disc_errs)) = branch_errors
                .iter()
                .find(|(b, _)| branch_matches_discriminator(b, root_schema, instance))
            {
                errors.extend(disc_errs.clone());
            } else if let Some((_, first_errs)) = branch_errors.first() {
                errors.extend(first_errs.clone());
            } else {
                errors.push(format!("{path}: 不符合 anyOf 任一规范分支"));
            }
        }
    }

    // 10. Check `oneOf`
    if let Some(one_of) = schema.get("oneOf").and_then(Value::as_array) {
        let mut matched_props = Vec::new();
        let mut branch_errors = Vec::new();
        for sub_schema in one_of {
            match validate_node(instance, sub_schema, root_schema, path) {
                Ok(props) => matched_props.push(props),
                Err(errs) => branch_errors.push((sub_schema, errs)),
            }
        }
        if matched_props.len() == 1 {
            evaluated_props.extend(matched_props.into_iter().next().unwrap_or_default());
        } else if matched_props.is_empty() {
            if let Some((_, disc_errs)) = branch_errors
                .iter()
                .find(|(b, _)| branch_matches_discriminator(b, root_schema, instance))
            {
                errors.extend(disc_errs.clone());
            } else if let Some((_, first_errs)) = branch_errors.first() {
                errors.extend(first_errs.clone());
            } else {
                errors.push(format!("{path}: 不符合 oneOf 规范定义"));
            }
        } else {
            for props in matched_props {
                evaluated_props.extend(props);
            }
        }
    }

    // 11. Object-level checks: `required`, `properties`, `propertyNames`, `additionalProperties`, `unevaluatedProperties`
    if let Some(obj) = instance.as_object() {
        if let Some(req_arr) = schema.get("required").and_then(Value::as_array) {
            for req in req_arr.iter().filter_map(Value::as_str) {
                if !obj.contains_key(req) {
                    errors.push(format!("{path}: 缺少必填字段 '{req}'"));
                }
            }
        }

        let props_map = schema.get("properties").and_then(Value::as_object);
        if let Some(props) = props_map {
            for (k, prop_schema) in props {
                if let Some(val) = obj.get(k) {
                    evaluated_props.insert(k.clone());
                    let child_path = if path == "$" {
                        k.clone()
                    } else {
                        format!("{path}.{k}")
                    };
                    if let Err(child_errs) =
                        validate_node(val, prop_schema, root_schema, &child_path)
                    {
                        errors.extend(child_errs);
                    }
                }
            }
        }

        if let Some(prop_names_schema) = schema.get("propertyNames") {
            for k in obj.keys() {
                let key_val = Value::String(k.clone());
                let key_path = format!("{path}.{k}(key)");
                if let Err(k_errs) =
                    validate_node(&key_val, prop_names_schema, root_schema, &key_path)
                {
                    errors.extend(k_errs);
                }
            }
        }

        if let Some(add_props) = schema.get("additionalProperties") {
            if add_props == &Value::Bool(false) {
                for k in obj.keys() {
                    let in_props = props_map.is_some_and(|p| p.contains_key(k));
                    if !in_props {
                        errors.push(format!("{path}: 不允许的未知字段 '{k}'"));
                    }
                }
            } else if add_props.is_object() {
                for (k, v) in obj {
                    let in_props = props_map.is_some_and(|p| p.contains_key(k));
                    if !in_props {
                        evaluated_props.insert(k.clone());
                        let child_path = format!("{path}.{k}");
                        if let Err(child_errs) =
                            validate_node(v, add_props, root_schema, &child_path)
                        {
                            errors.extend(child_errs);
                        }
                    }
                }
            }
        }

        if schema.get("unevaluatedProperties") == Some(&Value::Bool(false)) && errors.is_empty() {
            for k in obj.keys() {
                if !evaluated_props.contains(k) {
                    errors.push(format!(
                        "{path}: 不允许的未知或与当前动作不兼容的字段 '{k}'"
                    ));
                }
            }
        }
    }

    if errors.is_empty() {
        Ok(evaluated_props)
    } else {
        Err(errors)
    }
}

fn describe_value_type(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(n) => {
            if n.is_i64() || n.is_u64() {
                "integer"
            } else {
                "number"
            }
        }
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn summarize_value(v: &Value) -> String {
    match v {
        Value::String(s) => format!("'{s}'"),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_valid_full_singbox_config() {
        let cfg = json!({
            "$schema": "https://sing-box.sagernet.org/schema.json",
            "log": {
                "disabled": false,
                "level": "info",
                "timestamp": true
            },
            "dns": {
                "servers": [
                    {
                        "type": "https",
                        "tag": "remote-dns",
                        "server": "1.1.1.1",
                        "detour": "proxy"
                    },
                    {
                        "type": "udp",
                        "tag": "local-dns",
                        "server": "223.5.5.5"
                    }
                ],
                "rules": [
                    {
                        "rule_set": ["geosite-cn"],
                        "server": "local-dns"
                    }
                ],
                "final": "remote-dns",
                "strategy": "prefer_ipv4"
            },
            "inbounds": [
                {
                    "type": "mixed",
                    "tag": "mixed-in",
                    "listen": "127.0.0.1",
                    "listen_port": 2080
                },
                {
                    "type": "tun",
                    "tag": "tun-in",
                    "address": ["172.19.0.1/30"],
                    "auto_route": true,
                    "strict_route": true
                }
            ],
            "outbounds": [
                {
                    "type": "selector",
                    "tag": "proxy",
                    "outbounds": ["direct"]
                },
                {
                    "type": "direct",
                    "tag": "direct"
                }
            ],
            "route": {
                "rules": [
                    {
                        "action": "sniff"
                    },
                    {
                        "protocol": "dns",
                        "action": "hijack-dns"
                    },
                    {
                        "ip_is_private": true,
                        "outbound": "direct"
                    }
                ],
                "rule_set": [
                    {
                        "type": "remote",
                        "tag": "geosite-cn",
                        "format": "binary",
                        "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs"
                    }
                ],
                "final": "proxy",
                "auto_detect_interface": true,
                "default_domain_resolver": "local-dns"
            },
            "http_clients": [
                {
                    "tag": "direct"
                },
                {
                    "tag": "proxy",
                    "detour": "proxy"
                }
            ],
            "experimental": {
                "cache_file": {
                    "enabled": true
                }
            }
        });

        assert_eq!(validate_singbox_schema(&cfg), Ok(()));
    }

    #[test]
    fn test_valid_two_level_nested_logical_dns_and_route_rules() {
        let cfg = json!({
            "$schema": "https://sing-box.sagernet.org/schema.json",
            "dns": {
                "servers": [
                    {
                        "type": "https",
                        "tag": "remote-dns",
                        "server": "8.8.8.8"
                    }
                ],
                "rules": [
                    {
                        "server": "remote-dns",
                        "type": "logical",
                        "mode": "and",
                        "rules": [
                            {
                                "query_type": [
                                    "A",
                                    "AAAA",
                                    "CNAME"
                                ]
                            },
                            {
                                "type": "logical",
                                "mode": "or",
                                "rules": [
                                    {
                                        "rule_set": [
                                            "geosite-google",
                                            "geosite-youtube",
                                            "geosite-twitter",
                                            "geosite-facebook",
                                            "geosite-instagram",
                                            "geosite-telegram",
                                            "geosite-netflix",
                                            "geosite-github",
                                            "geosite-openai",
                                            "geosite-apple",
                                            "geosite-jetbrains"
                                        ]
                                    },
                                    {
                                        "domain_suffix": [
                                            ".io",
                                            ".google",
                                            ".org",
                                            ".dev",
                                            ".ai",
                                            ".app"
                                        ]
                                    },
                                    {
                                        "domain": [
                                            "claude.ai"
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            "route": {
                "rules": [
                    {
                        "type": "logical",
                        "mode": "and",
                        "outbound": "proxy",
                        "rules": [
                            {
                                "network": ["tcp", "udp"]
                            },
                            {
                                "type": "logical",
                                "mode": "or",
                                "rules": [
                                    {
                                        "process_name": ["curl", "git"]
                                    },
                                    {
                                        "domain_keyword": ["github"]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        });

        assert_eq!(validate_singbox_schema(&cfg), Ok(()));
    }

    #[test]
    fn test_invalid_unknown_root_and_rule_fields_rejected() {
        let bad_root = json!({
            "log": { "level": "info" },
            "not_a_singbox_field": 123
        });
        let err = validate_singbox_schema(&bad_root).unwrap_err();
        assert!(err.iter().any(|e| e.contains("not_a_singbox_field")));

        let bad_log_level = json!({
            "log": { "level": "invalid_level" }
        });
        let err2 = validate_singbox_schema(&bad_log_level).unwrap_err();
        assert!(err2.iter().any(|e| e.contains("log.level")));

        let bad_rule = json!({
            "route": {
                "rules": [
                    {
                        "domain": ["example.com"],
                        "unknown_rule_key": true
                    }
                ]
            }
        });
        let err3 = validate_singbox_schema(&bad_rule).unwrap_err();
        assert!(err3.iter().any(|e| e.contains("unknown_rule_key")));

        let bad_nested_rule_with_action = json!({
            "dns": {
                "rules": [
                    {
                        "type": "logical",
                        "mode": "and",
                        "server": "remote-dns",
                        "rules": [
                            {
                                "domain": ["example.com"],
                                "server": "should-not-be-on-nested-rule"
                            }
                        ]
                    }
                ]
            }
        });
        let err4 = validate_singbox_schema(&bad_nested_rule_with_action).unwrap_err();
        assert!(err4.iter().any(|e| e.contains("server")));
    }

    #[test]
    fn test_platform_specific_explicit_validation_rejects_incompatible_fields() {
        let non_linux_auto_redirect = json!({
            "inbounds": [
                {
                    "type": "tun",
                    "tag": "tun-in",
                    "address": ["172.19.0.1/30"],
                    "auto_route": true,
                    "auto_redirect": true
                }
            ]
        });
        assert!(
            validate_singbox_config_for_platform(&non_linux_auto_redirect, Some("linux")).is_ok()
        );
        let macos_err =
            validate_singbox_config_for_platform(&non_linux_auto_redirect, Some("macos"))
                .unwrap_err();
        assert!(macos_err.iter().any(|e| e.contains("auto_redirect")));

        let macos_bad_iface = json!({
            "inbounds": [
                {
                    "type": "tun",
                    "tag": "tun-in",
                    "interface_name": "tun0",
                    "address": ["172.19.0.1/30"]
                }
            ]
        });
        let iface_err =
            validate_singbox_config_for_platform(&macos_bad_iface, Some("macos")).unwrap_err();
        assert!(iface_err.iter().any(|e| e.contains("interface_name")));

        let android_with_process_name = json!({
            "route": {
                "rules": [
                    {
                        "process_name": ["curl"],
                        "outbound": "direct"
                    }
                ]
            }
        });
        let android_err =
            validate_singbox_config_for_platform(&android_with_process_name, Some("android"))
                .unwrap_err();
        assert!(android_err.iter().any(|e| e.contains("process_name")));

        let desktop_with_package_name = json!({
            "route": {
                "rules": [
                    {
                        "package_name": ["com.android.chrome"],
                        "outbound": "direct"
                    }
                ]
            }
        });
        let desktop_err =
            validate_singbox_config_for_platform(&desktop_with_package_name, Some("linux"))
                .unwrap_err();
        assert!(desktop_err.iter().any(|e| e.contains("package_name")));

        let direct_detour_cfg = json!({
            "http_clients": [
                {
                    "tag": "direct",
                    "detour": "direct"
                }
            ]
        });
        let detour_err =
            validate_singbox_config_for_platform(&direct_detour_cfg, Some("linux")).unwrap_err();
        assert!(
            detour_err
                .iter()
                .any(|e| e.contains("http_clients[0].detour"))
        );
    }
}
