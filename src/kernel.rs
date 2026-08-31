use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

pub const MIN_SUPPORTED_SINGBOX_VERSION: &str = "1.12.0";
pub const SINGBOX_VERSION: &str = "1.13.19";

#[derive(Clone, Debug)]
pub struct KernelTarget {
    pub os: &'static str,           // "windows", "linux", "darwin"
    pub arch: &'static str,         // "amd64", "arm64"
    pub archive_type: &'static str, // "zip", "tar.gz"
    pub url: &'static str,
    pub binary_name: &'static str, // "sing-box.exe" or "sing-box"
}

pub fn get_supported_targets() -> Vec<KernelTarget> {
    vec![
        KernelTarget {
            os: "windows",
            arch: "amd64",
            archive_type: "zip",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-windows-amd64.zip",
            binary_name: "sing-box.exe",
        },
        KernelTarget {
            os: "windows",
            arch: "arm64",
            archive_type: "zip",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-windows-arm64.zip",
            binary_name: "sing-box.exe",
        },
        KernelTarget {
            os: "linux",
            arch: "amd64",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-linux-amd64.tar.gz",
            binary_name: "sing-box",
        },
        KernelTarget {
            os: "linux",
            arch: "arm64",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-linux-arm64.tar.gz",
            binary_name: "sing-box",
        },
        KernelTarget {
            os: "darwin",
            arch: "amd64",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-darwin-amd64.tar.gz",
            binary_name: "sing-box",
        },
        KernelTarget {
            os: "darwin",
            arch: "arm64",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-darwin-arm64.tar.gz",
            binary_name: "sing-box",
        },
    ]
}

pub fn detect_current_target() -> Option<KernelTarget> {
    let raw_os = std::env::consts::OS;
    let raw_arch = std::env::consts::ARCH;

    let os = match raw_os {
        "windows" => "windows",
        "linux" => "linux",
        "macos" | "darwin" => "darwin",
        _ => return None,
    };

    let arch = match raw_arch {
        "x86_64" | "amd64" => "amd64",
        "aarch64" | "arm64" => "arm64",
        _ => return None,
    };

    get_supported_targets()
        .into_iter()
        .find(|t| t.os == os && t.arch == arch)
}

pub fn get_kernel_dir() -> PathBuf {
    crate::paths::AppPaths::get().kernel_dir()
}

pub fn get_kernel_binary_path() -> PathBuf {
    crate::paths::AppPaths::get().kernel_binary_path()
}

pub fn get_singbox_executable() -> Option<PathBuf> {
    crate::paths::AppPaths::get().find_singbox_executable()
}

pub fn get_installed_kernel_version(path: &Path) -> Option<String> {
    let output = std::process::Command::new(path)
        .arg("version")
        .output()
        .ok()?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = stdout.lines().next() {
            return Some(line.trim().to_string());
        }
    }
    None
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct KernelDownloadStatus {
    pub status: String, // "idle" | "downloading" | "extracting" | "ready" | "error"
    pub progress: f64,  // 0.0 to 100.0
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub error: Option<String>,
}

impl Default for KernelDownloadStatus {
    fn default() -> Self {
        Self {
            status: "idle".to_string(),
            progress: 0.0,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_bytes_per_sec: 0,
            error: None,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct KernelInfoResponse {
    pub os: String,
    pub arch: String,
    pub supported: bool,
    pub download_url: Option<String>,
    pub filename: Option<String>,
    pub is_installed: bool,
    pub binary_path: String,
    pub version: Option<String>,
    pub min_version: String,
    pub recommended_version: String,
    pub is_version_satisfies: bool,
    pub download_status: KernelDownloadStatus,
}

pub fn get_kernel_info(status: &KernelDownloadStatus) -> KernelInfoResponse {
    let target = detect_current_target();
    let maybe_exec = get_singbox_executable();
    let (is_installed, binary_path, version) = match maybe_exec {
        Some(ref p) => {
            let ver = get_installed_kernel_version(p);
            (true, p.to_string_lossy().to_string(), ver)
        }
        None => {
            let default_path = get_kernel_binary_path();
            (false, default_path.to_string_lossy().to_string(), None)
        }
    };

    let min_ver = std::env::var("SUBOUT_MIN_SINGBOX_VERSION")
        .unwrap_or_else(|_| MIN_SUPPORTED_SINGBOX_VERSION.to_string());
    let is_version_satisfies = version
        .as_deref()
        .map(|v| crate::paths::is_version_ge(v, &min_ver))
        .unwrap_or(false);

    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let (supported, download_url, filename) = match &target {
        Some(t) => {
            let fname = format!(
                "sing-box-{}-{}-{}.{}",
                SINGBOX_VERSION, t.os, t.arch, t.archive_type
            );
            (true, Some(t.url.to_string()), Some(fname))
        }
        None => (false, None, None),
    };

    KernelInfoResponse {
        os,
        arch,
        supported,
        download_url,
        filename,
        is_installed,
        binary_path,
        version,
        min_version: min_ver,
        recommended_version: SINGBOX_VERSION.to_string(),
        is_version_satisfies,
        download_status: status.clone(),
    }
}

pub fn extract_archive(
    archive_bytes: &[u8],
    archive_type: &str,
    dest_dir: &Path,
    binary_name: &str,
) -> Result<PathBuf> {
    std::fs::create_dir_all(dest_dir)?;
    let target_path = dest_dir.join(binary_name);

    if archive_type == "zip" {
        let cursor = Cursor::new(archive_bytes);
        let mut zip_archive =
            zip::ZipArchive::new(cursor).map_err(|e| anyhow!("解析 Zip 压缩包失败: {}", e))?;

        let mut extracted = false;
        for i in 0..zip_archive.len() {
            let mut file = zip_archive.by_index(i)?;
            let file_name = file.name().to_string();
            if file_name.ends_with(binary_name) || file_name == binary_name {
                let mut outfile = File::create(&target_path)?;
                std::io::copy(&mut file, &mut outfile)?;
                extracted = true;
                break;
            }
        }

        if !extracted {
            return Err(anyhow!("在 Zip 压缩包中未找到可执行文件 {}", binary_name));
        }
    } else if archive_type == "tar.gz" {
        let cursor = Cursor::new(archive_bytes);
        let gz_decoder = flate2::read::GzDecoder::new(cursor);
        let mut tar_archive = tar::Archive::new(gz_decoder);

        let mut extracted = false;
        for entry_res in tar_archive.entries()? {
            let mut entry = entry_res?;
            let path = entry.path()?;
            let file_name = path.to_string_lossy().to_string();

            if file_name.ends_with(binary_name) || file_name == binary_name {
                let mut outfile = File::create(&target_path)?;
                std::io::copy(&mut entry, &mut outfile)?;
                extracted = true;
                break;
            }
        }

        if !extracted {
            return Err(anyhow!("在 Tar 压缩包中未找到可执行文件 {}", binary_name));
        }
    } else {
        return Err(anyhow!("不支持的压缩格式: {}", archive_type));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&target_path)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&target_path, perms)?;
    }

    Ok(target_path)
}

pub async fn download_and_install_kernel(
    status_lock: Arc<RwLock<KernelDownloadStatus>>,
    cancel_flag: Arc<std::sync::atomic::AtomicBool>,
) -> Result<PathBuf> {
    let target = detect_current_target()
        .ok_or_else(|| anyhow!("当前系统架构不支持自动下载 sing-box 内核"))?;

    {
        let mut st = status_lock.write().await;
        st.status = "downloading".to_string();
        st.progress = 0.0;
        st.downloaded_bytes = 0;
        st.total_bytes = 0;
        st.speed_bytes_per_sec = 0;
        st.error = None;
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()?;

    let response = match client.get(target.url).send().await {
        Ok(res) => {
            if !res.status().is_success() {
                let err_msg = format!("下载失败，HTTP 状态码: {}", res.status());
                let mut st = status_lock.write().await;
                st.status = "error".to_string();
                st.error = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
            res
        }
        Err(e) => {
            let err_msg = format!("发起内核下载请求失败: {}", e);
            let mut st = status_lock.write().await;
            st.status = "error".to_string();
            st.error = Some(err_msg.clone());
            return Err(anyhow!(err_msg));
        }
    };

    let total_size = response.content_length().unwrap_or(0);
    {
        let mut st = status_lock.write().await;
        st.total_bytes = total_size;
    }

    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    let mut downloaded_data = Vec::with_capacity(if total_size > 0 {
        total_size as usize
    } else {
        15 * 1024 * 1024
    });
    let mut downloaded_bytes: u64 = 0;
    let mut last_speed_time = std::time::Instant::now();
    let mut last_speed_bytes: u64 = 0;

    while let Some(chunk_res) = stream.next().await {
        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
            let mut st = status_lock.write().await;
            st.status = "idle".to_string();
            st.error = Some("下载已取消".to_string());
            return Err(anyhow!("下载已取消"));
        }

        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("下载数据流中断: {}", e);
                let mut st = status_lock.write().await;
                st.status = "error".to_string();
                st.error = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
        };

        downloaded_bytes += chunk.len() as u64;
        downloaded_data.extend_from_slice(&chunk);

        let now = std::time::Instant::now();
        let elapsed = now.duration_since(last_speed_time).as_secs_f64();
        let speed = if elapsed >= 0.5 {
            let diff = downloaded_bytes.saturating_sub(last_speed_bytes);
            let s = (diff as f64 / elapsed) as u64;
            last_speed_time = now;
            last_speed_bytes = downloaded_bytes;
            s
        } else {
            0
        };

        let progress = if total_size > 0 {
            ((downloaded_bytes as f64 / total_size as f64) * 100.0).min(100.0)
        } else {
            0.0
        };

        {
            let mut st = status_lock.write().await;
            st.downloaded_bytes = downloaded_bytes;
            st.progress = progress;
            if speed > 0 {
                st.speed_bytes_per_sec = speed;
            }
        }
    }

    if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
        let mut st = status_lock.write().await;
        st.status = "idle".to_string();
        st.error = Some("下载已取消".to_string());
        return Err(anyhow!("下载已取消"));
    }

    // Extract
    {
        let mut st = status_lock.write().await;
        st.status = "extracting".to_string();
        st.progress = 100.0;
    }

    let kernel_dir = get_kernel_dir();
    let binary_path = match extract_archive(
        &downloaded_data,
        target.archive_type,
        &kernel_dir,
        target.binary_name,
    ) {
        Ok(p) => p,
        Err(e) => {
            let err_msg = format!("解压内核文件失败: {}", e);
            let mut st = status_lock.write().await;
            st.status = "error".to_string();
            st.error = Some(err_msg.clone());
            return Err(anyhow!(err_msg));
        }
    };

    // Verify installation
    if let Some(_ver) = get_installed_kernel_version(&binary_path) {
        let mut st = status_lock.write().await;
        st.status = "ready".to_string();
        st.progress = 100.0;
        st.error = None;
        Ok(binary_path)
    } else {
        let err_msg = "内核解压完成，但运行校验失败，请检查系统兼容性".to_string();
        let mut st = status_lock.write().await;
        st.status = "error".to_string();
        st.error = Some(err_msg.clone());
        Err(anyhow!(err_msg))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_supported_targets_count_and_urls() {
        let targets = get_supported_targets();
        assert_eq!(targets.len(), 6);

        let win_amd64 = targets
            .iter()
            .find(|t| t.os == "windows" && t.arch == "amd64")
            .unwrap();
        assert_eq!(
            win_amd64.url,
            "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-windows-amd64.zip"
        );
        assert_eq!(win_amd64.binary_name, "sing-box.exe");

        let linux_amd64 = targets
            .iter()
            .find(|t| t.os == "linux" && t.arch == "amd64")
            .unwrap();
        assert_eq!(
            linux_amd64.url,
            "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-linux-amd64.tar.gz"
        );
        assert_eq!(linux_amd64.binary_name, "sing-box");

        let darwin_arm64 = targets
            .iter()
            .find(|t| t.os == "darwin" && t.arch == "arm64")
            .unwrap();
        assert_eq!(
            darwin_arm64.url,
            "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-darwin-arm64.tar.gz"
        );
        assert_eq!(darwin_arm64.binary_name, "sing-box");
    }

    #[test]
    fn test_detect_current_target() {
        let target = detect_current_target();
        // Should detect on supported host
        if cfg!(any(
            target_os = "linux",
            target_os = "macos",
            target_os = "windows"
        )) && cfg!(any(target_arch = "x86_64", target_arch = "aarch64"))
        {
            assert!(target.is_some());
        }
    }
}
