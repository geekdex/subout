pub mod db;
pub mod fetcher;
pub mod generator;
pub mod parser;
pub mod web;

use parser::Outbound;

/// Fetches raw subscription content from the given URL.
pub async fn fetch_subscription(url: &str) -> Result<String, reqwest::Error> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()?;

    let response = client.get(url).send().await?.text().await?;
    Ok(response)
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
