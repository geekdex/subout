pub mod auto_update;
pub mod db;
pub mod fetcher;
pub mod generator;
pub mod kernel;
pub mod parser;
pub mod paths;
pub mod platform;
pub mod service;
pub mod simple_config;
pub mod web;

use parser::Outbound;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct SubscriptionUserInfo {
    pub upload: Option<i64>,
    pub download: Option<i64>,
    pub total: Option<i64>,
    pub expire: Option<i64>,
}

impl SubscriptionUserInfo {
    pub fn merge(mut self, other: SubscriptionUserInfo) -> Self {
        if self.upload.is_none() {
            self.upload = other.upload;
        }
        if self.download.is_none() {
            self.download = other.download;
        }
        if self.total.is_none() {
            self.total = other.total;
        }
        if self.expire.is_none() {
            self.expire = other.expire;
        }
        self
    }
}

pub fn parse_userinfo_str(s: &str) -> SubscriptionUserInfo {
    let mut info = SubscriptionUserInfo::default();
    for part in s.split(|c| c == ';' || c == '&' || c == '\n') {
        let part = part.trim();
        if let Some((k, v)) = part.split_once('=') {
            let key = k.trim().to_lowercase();
            let val = v.trim().parse::<i64>().ok();
            match key.as_str() {
                "upload" => info.upload = val,
                "download" => info.download = val,
                "total" => info.total = val,
                "expire" => info.expire = val,
                _ => {}
            }
        }
    }
    info
}

pub fn parse_userinfo_from_body(body: &str) -> SubscriptionUserInfo {
    for line in body.lines().take(30) {
        let line_trimmed = line.trim();
        let line_lower = line_trimmed.to_lowercase();
        if line_lower.contains("subscription-userinfo")
            || line_lower.contains("upload=")
            || line_lower.contains("expire=")
        {
            if let Some(pos) = line_lower.find("subscription-userinfo:") {
                let info_part = &line_trimmed[pos + "subscription-userinfo:".len()..];
                let info = parse_userinfo_str(info_part);
                if info.upload.is_some()
                    || info.download.is_some()
                    || info.total.is_some()
                    || info.expire.is_some()
                {
                    return info;
                }
            } else if let Some(pos) = line_lower.find("subscription-userinfo=") {
                let info_part = &line_trimmed[pos + "subscription-userinfo=".len()..];
                let info = parse_userinfo_str(info_part);
                if info.upload.is_some()
                    || info.download.is_some()
                    || info.total.is_some()
                    || info.expire.is_some()
                {
                    return info;
                }
            } else if line_lower.contains("upload=") || line_lower.contains("expire=") {
                let clean_line = line_trimmed
                    .trim_start_matches('#')
                    .trim_start_matches("//")
                    .trim();
                let info = parse_userinfo_str(clean_line);
                if info.upload.is_some()
                    || info.download.is_some()
                    || info.total.is_some()
                    || info.expire.is_some()
                {
                    return info;
                }
            }
        }
    }
    SubscriptionUserInfo::default()
}

/// Fetches raw subscription content from the given URL.
pub async fn fetch_subscription(url: &str) -> Result<String, reqwest::Error> {
    let (content, _) = fetch_subscription_with_info(url).await?;
    Ok(content)
}

/// Fetches subscription content and metadata (traffic, expire).
pub async fn fetch_subscription_with_info(
    url: &str,
) -> Result<(String, SubscriptionUserInfo), reqwest::Error> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let response = client.get(url).send().await?.error_for_status()?;

    let mut header_info = SubscriptionUserInfo::default();
    if let Some(userinfo_val) = response
        .headers()
        .get("subscription-userinfo")
        .or_else(|| response.headers().get("Subscription-Userinfo"))
    {
        if let Ok(userinfo_str) = userinfo_val.to_str() {
            header_info = parse_userinfo_str(userinfo_str);
        }
    }

    let text = response.text().await?;
    let body_info = parse_userinfo_from_body(&text);
    let final_info = header_info.merge(body_info);

    Ok((text, final_info))
}

pub async fn parse_subscription_url(url: &str) -> Result<Vec<Outbound>, reqwest::Error> {
    let content = fetch_subscription(url).await?;
    let (outbounds, _) = parser::parse_subscription(&content, false);
    Ok(outbounds)
}

/// Loads subscription content from a source string (URL, file path, or raw content).
pub async fn load_subscription_content(
    source: &str,
) -> Result<(String, String), Box<dyn std::error::Error>> {
    if source.starts_with("http://") || source.starts_with("https://") {
        let content = fetch_subscription(source).await?;
        Ok((content, format!("URL: {}", source)))
    } else if std::path::Path::new(source).exists() {
        let content = std::fs::read_to_string(source)?;
        Ok((content, format!("File: {}", source)))
    } else {
        Ok((source.to_string(), "Inline Raw Content".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_userinfo_str() {
        let s = "upload=123456; download=987654; total=107374182400; expire=1780000000";
        let info = parse_userinfo_str(s);
        assert_eq!(info.upload, Some(123456));
        assert_eq!(info.download, Some(987654));
        assert_eq!(info.total, Some(107374182400));
        assert_eq!(info.expire, Some(1780000000));
    }

    #[test]
    fn test_parse_userinfo_from_body_comments() {
        let body = "# subscription-userinfo: upload=100; download=200; total=1000; expire=1780000000\nvless://test";
        let info = parse_userinfo_from_body(body);
        assert_eq!(info.upload, Some(100));
        assert_eq!(info.download, Some(200));
        assert_eq!(info.total, Some(1000));
        assert_eq!(info.expire, Some(1780000000));
    }
}
