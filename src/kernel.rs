use anyhow::{Result, anyhow};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

pub const MIN_SUPPORTED_SINGBOX_VERSION: &str = "1.12.0";
pub const SINGBOX_VERSION: &str = "1.14.4";

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
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-windows-amd64.zip",
            binary_name: "sing-box.exe",
        },
        KernelTarget {
            os: "windows",
            arch: "arm64",
            archive_type: "zip",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-windows-arm64.zip",
            binary_name: "sing-box.exe",
        },
        KernelTarget {
            os: "linux",
            arch: "amd64",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-linux-amd64.tar.gz",
            binary_name: "sing-box",
        },
        KernelTarget {
            os: "linux",
            arch: "arm64",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-linux-arm64.tar.gz",
            binary_name: "sing-box",
        },
        KernelTarget {
            os: "linux",
            arch: "armv7",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-linux-armv7.tar.gz",
            binary_name: "sing-box",
        },
        KernelTarget {
            os: "darwin",
            arch: "amd64",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-darwin-amd64.tar.gz",
            binary_name: "sing-box",
        },
        KernelTarget {
            os: "darwin",
            arch: "arm64",
            archive_type: "tar.gz",
            url: "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-darwin-arm64.tar.gz",
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
        "arm" | "armv7" | "armv7l" => "armv7",
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
    let (is_installed, binary_path, version) = if let Some(ref p) = maybe_exec {
        let ver = get_installed_kernel_version(p);
        (true, p.to_string_lossy().to_string(), ver)
    } else {
        let default_path = get_kernel_binary_path();
        (false, default_path.to_string_lossy().to_string(), None)
    };

    let min_ver = std::env::var("SUBOUT_MIN_SINGBOX_VERSION")
        .unwrap_or_else(|_| MIN_SUPPORTED_SINGBOX_VERSION.to_string());
    let is_version_satisfies = version
        .as_deref()
        .is_some_and(|v| crate::paths::is_version_ge(v, &min_ver));

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
            zip::ZipArchive::new(cursor).map_err(|e| anyhow!("解析 Zip 压缩包失败: {e}"))?;

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
            return Err(anyhow!("在 Zip 压缩包中未找到可执行文件 {binary_name}"));
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
            return Err(anyhow!("在 Tar 压缩包中未找到可执行文件 {binary_name}"));
        }
    } else {
        return Err(anyhow!("不支持的压缩格式: {archive_type}"));
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

    // 仅限制连接与读取超时，不限制总时长：大文件在慢速网络下可能超过任意总超时，
    // 而读取超时足以检测连接停滞（60 秒收不到数据即报错）
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .read_timeout(std::time::Duration::from_secs(60))
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
            let err_msg = format!("发起内核下载请求失败: {e}");
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

    // 预分配容量做上限保护（128MB），防止异常的 Content-Length 导致过度分配
    let mut downloaded_data = Vec::with_capacity(match total_size {
        0 => 16 * 1024 * 1024,
        n if n <= 128 * 1024 * 1024 => n as usize,
        _ => 128 * 1024 * 1024,
    });
    let mut downloaded_bytes: u64 = 0;

    // 滑动窗口测速：每秒结算一次，窗口内沿用上次速度，避免读锁与数值抖动
    let mut speed_window_start = std::time::Instant::now();
    let mut speed_window_bytes: u64 = 0;
    let mut speed_bytes_per_sec: u64 = 0;

    // 进度单调递增；状态写入按 200ms 节流，避免频繁锁竞争
    let mut last_reported_progress = 0.0f64;
    let mut last_update_time: Option<std::time::Instant> = None;

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
                let err_msg = format!("下载数据流中断: {e}");
                let mut st = status_lock.write().await;
                st.status = "error".to_string();
                st.error = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
        };

        downloaded_bytes += chunk.len() as u64;
        speed_window_bytes += chunk.len() as u64;
        downloaded_data.extend_from_slice(&chunk);

        let now = std::time::Instant::now();

        if now.duration_since(speed_window_start) >= std::time::Duration::from_secs(1) {
            let elapsed_secs = speed_window_start.elapsed().as_secs_f64();
            if elapsed_secs > 0.0 {
                speed_bytes_per_sec = (speed_window_bytes as f64 / elapsed_secs) as u64;
            }
            speed_window_start = now;
            speed_window_bytes = 0;
        }

        if total_size > 0 {
            let new_progress =
                ((downloaded_bytes as f64 / total_size as f64) * 100.0).min(100.0);
            if new_progress > last_reported_progress {
                last_reported_progress = new_progress;
            }
        }

        // 注意：这里绝不能使用 blocking_read()/blocking_write()——
        // 它们会经 future::block_on 在异步运行时线程上直接 panic，
        // 这正是下载任务静默崩溃、进度停在 0% 的根因。
        // 所有跟踪状态均保存在本地变量中，仅在需要写入时获取写锁。
        let should_update = last_update_time
            .is_none_or(|t| now.duration_since(t) >= std::time::Duration::from_millis(200));
        if should_update {
            let mut st = status_lock.write().await;
            st.downloaded_bytes = downloaded_bytes;
            st.progress = last_reported_progress;
            st.speed_bytes_per_sec = speed_bytes_per_sec;
            last_update_time = Some(now);
        }
    }

    if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
        let mut st = status_lock.write().await;
        st.status = "idle".to_string();
        st.error = Some("下载已取消".to_string());
        return Err(anyhow!("下载已取消"));
    }

    // Extract（进度置为 extracting 前先补写最终下载数值——节流可能跳过最后一段增量）
    {
        let mut st = status_lock.write().await;
        st.status = "extracting".to_string();
        st.progress = 100.0;
        st.downloaded_bytes = downloaded_bytes;
        if st.total_bytes == 0 {
            st.total_bytes = downloaded_bytes;
        }
        st.speed_bytes_per_sec = 0;
    }

    // 解压与版本校验是阻塞的文件/子进程操作，放入 blocking 线程池执行，
    // 避免占用异步 runtime worker 线程
    let kernel_dir = get_kernel_dir();
    let archive_type = target.archive_type;
    let binary_name = target.binary_name;
    let archive_data = downloaded_data;
    let extract_result = tokio::task::spawn_blocking(move || {
        extract_archive(&archive_data, archive_type, &kernel_dir, binary_name)
    })
    .await
    .map_err(|e| anyhow!("内核解压任务执行异常: {e}"))?;

    let binary_path = match extract_result {
        Ok(p) => p,
        Err(e) => {
            let err_msg = format!("解压内核文件失败: {e}");
            let mut st = status_lock.write().await;
            st.status = "error".to_string();
            st.error = Some(err_msg.clone());
            return Err(anyhow!(err_msg));
        }
    };

    // Verify installation
    let verify_path = binary_path.clone();
    let installed_version = tokio::task::spawn_blocking(move || {
        get_installed_kernel_version(&verify_path)
    })
    .await
    .map_err(|e| anyhow!("内核校验任务执行异常: {e}"))?;

    if installed_version.is_some() {
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
        assert_eq!(targets.len(), 7);

        let win_amd64 = targets
            .iter()
            .find(|t| t.os == "windows" && t.arch == "amd64")
            .unwrap();
        assert_eq!(
            win_amd64.url,
            "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-windows-amd64.zip"
        );
        assert_eq!(win_amd64.binary_name, "sing-box.exe");

        let linux_amd64 = targets
            .iter()
            .find(|t| t.os == "linux" && t.arch == "amd64")
            .unwrap();
        assert_eq!(
            linux_amd64.url,
            "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-linux-amd64.tar.gz"
        );
        assert_eq!(linux_amd64.binary_name, "sing-box");

        let linux_armv7 = targets
            .iter()
            .find(|t| t.os == "linux" && t.arch == "armv7")
            .unwrap();
        assert_eq!(
            linux_armv7.url,
            "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-linux-armv7.tar.gz"
        );
        assert_eq!(linux_armv7.binary_name, "sing-box");

        let darwin_arm64 = targets
            .iter()
            .find(|t| t.os == "darwin" && t.arch == "arm64")
            .unwrap();
        assert_eq!(
            darwin_arm64.url,
            "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-darwin-arm64.tar.gz"
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
