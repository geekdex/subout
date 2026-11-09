use anyhow::{Result, anyhow};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

/// 支持的内核版本模式列表（支持泛版本匹配，后续可扩充）
pub const SUPPORTED_KERNEL_VERSIONS: &[&str] = &["1.14.*"];

/// 强制绑定的标准安装版本（自动下载时使用）
pub const PINNED_KERNEL_VERSION: &str = "1.14.4";
pub const MIN_SUPPORTED_SINGBOX_VERSION: &str = "1.14.0";
pub const SINGBOX_VERSION: &str = PINNED_KERNEL_VERSION;

/// Check if a version string satisfies any pattern in `SUPPORTED_KERNEL_VERSIONS`
pub fn is_supported_kernel_version(v_str: &str) -> bool {
    // If gatekeeper disabled via env var (e.g. for testing/development):
    if std::env::var("SUBOUT_DISABLE_GATEKEEPER")
        .is_ok_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
    {
        return true;
    }

    let Some((v_maj, v_min, v_pat)) = crate::paths::parse_semver(v_str) else {
        return false;
    };

    for &pattern in SUPPORTED_KERNEL_VERSIONS {
        let pattern_trimmed = pattern.trim();
        if let Some(prefix) = pattern_trimmed.strip_suffix(".*") {
            let parts: Vec<&str> = prefix.split('.').collect();
            if parts.len() == 2
                && let (Ok(p_maj), Ok(p_min)) = (parts[0].parse::<u64>(), parts[1].parse::<u64>())
                && v_maj == p_maj
                && v_min == p_min
            {
                return true;
            } else if parts.len() == 1
                && let Ok(p_maj) = parts[0].parse::<u64>()
                && v_maj == p_maj
            {
                return true;
            }
        } else if let Some((p_maj, p_min, p_pat)) = crate::paths::parse_semver(pattern_trimmed)
            && (v_maj, v_min, v_pat) == (p_maj, p_min, p_pat)
        {
            return true;
        }
    }
    false
}

/// Global check if local kernel is ready and valid
pub fn is_kernel_ready() -> bool {
    let maybe_exec = get_singbox_executable();
    if let Some(ref p) = maybe_exec
        && let Some(v_str) = get_installed_kernel_version(p)
    {
        return is_supported_kernel_version(&v_str);
    }
    false
}

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

static KERNEL_VERSION_CACHE: std::sync::RwLock<Option<(PathBuf, std::time::SystemTime, String)>> =
    std::sync::RwLock::new(None);

pub fn get_installed_kernel_version(path: &Path) -> Option<String> {
    let mtime = std::fs::metadata(path).and_then(|m| m.modified()).ok();
    if let Some(mod_time) = mtime
        && let Ok(guard) = KERNEL_VERSION_CACHE.read()
        && let Some((ref cached_path, cached_mtime, ref ver)) = *guard
        && cached_path == path
        && cached_mtime == mod_time
    {
        return Some(ver.clone());
    }

    let output = std::process::Command::new(path)
        .arg("version")
        .output()
        .ok()?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(line) = stdout.lines().next() {
            let ver_str = line.trim().to_string();
            if let Some(mod_time) = mtime
                && let Ok(mut guard) = KERNEL_VERSION_CACHE.write()
            {
                *guard = Some((path.to_path_buf(), mod_time, ver_str.clone()));
            }
            return Some(ver_str);
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

pub fn extract_semver_string(s: &str) -> Option<String> {
    crate::paths::parse_semver(s).map(|(maj, min, pat)| format!("{maj}.{min}.{pat}"))
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct KernelInfoResponse {
    pub os: String,
    pub arch: String,
    pub supported: bool,
    pub download_url: Option<String>,
    pub filename: Option<String>,
    pub is_installed: bool,
    pub installed: bool,
    pub binary_path: String,
    pub version: Option<String>,
    pub raw_version: Option<String>,
    pub min_version: String,
    pub recommended_version: String,
    pub pinned_version: String,
    pub supported_versions: Vec<String>,
    pub is_version_satisfies: bool,
    pub ready: bool,
    pub gatekeeper_blocked: bool,
    pub download_status: KernelDownloadStatus,
}

pub fn get_kernel_info(status: &KernelDownloadStatus) -> KernelInfoResponse {
    let target = detect_current_target();
    let maybe_exec = get_singbox_executable();
    let (is_installed, binary_path, raw_version) = if let Some(ref p) = maybe_exec {
        let ver = get_installed_kernel_version(p);
        (true, p.to_string_lossy().to_string(), ver)
    } else {
        let default_path = get_kernel_binary_path();
        (false, default_path.to_string_lossy().to_string(), None)
    };

    let is_version_satisfies = raw_version
        .as_deref()
        .is_some_and(is_supported_kernel_version);
    let ready = is_installed && is_version_satisfies;
    let gatekeeper_blocked = !ready;
    let clean_version = raw_version.as_deref().and_then(extract_semver_string);
    let version = clean_version.or_else(|| raw_version.clone());

    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let (supported, download_url, filename) = match &target {
        Some(t) => {
            let fname = format!(
                "sing-box-{}-{}-{}.{}",
                PINNED_KERNEL_VERSION, t.os, t.arch, t.archive_type
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
        installed: is_installed,
        binary_path,
        version,
        raw_version,
        min_version: "1.14.0".to_string(),
        recommended_version: PINNED_KERNEL_VERSION.to_string(),
        pinned_version: PINNED_KERNEL_VERSION.to_string(),
        supported_versions: SUPPORTED_KERNEL_VERSIONS
            .iter()
            .map(|s| (*s).to_string())
            .collect(),
        is_version_satisfies,
        ready,
        gatekeeper_blocked,
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
    let temp_name = format!(".{binary_name}.tmp.{}", std::process::id());
    let temp_path = dest_dir.join(temp_name);

    if archive_type == "zip" {
        let cursor = Cursor::new(archive_bytes);
        let mut zip_archive =
            zip::ZipArchive::new(cursor).map_err(|e| anyhow!("解析 Zip 压缩包失败: {e}"))?;

        let mut extracted = false;
        for i in 0..zip_archive.len() {
            let mut file = zip_archive.by_index(i)?;
            if file.is_dir() {
                continue;
            }
            let file_name = file.name().to_string();
            let matches =
                Path::new(&file_name).file_name().and_then(|n| n.to_str()) == Some(binary_name);
            if matches {
                let mut outfile = File::create(&temp_path)?;
                std::io::copy(&mut file, &mut outfile)?;
                outfile.sync_all()?;
                extracted = true;
                break;
            }
        }

        if !extracted {
            let _ = std::fs::remove_file(&temp_path);
            return Err(anyhow!("在 Zip 压缩包中未找到可执行文件 {binary_name}"));
        }
    } else if archive_type == "tar.gz" {
        let cursor = Cursor::new(archive_bytes);
        let gz_decoder = flate2::read::GzDecoder::new(cursor);
        let mut tar_archive = tar::Archive::new(gz_decoder);

        let mut extracted = false;
        for entry_res in tar_archive.entries()? {
            let mut entry = entry_res?;
            if entry.header().entry_type().is_dir() {
                continue;
            }
            let path = entry.path()?;
            let matches = path.file_name().and_then(|n| n.to_str()) == Some(binary_name);
            if matches {
                let mut outfile = File::create(&temp_path)?;
                std::io::copy(&mut entry, &mut outfile)?;
                outfile.sync_all()?;
                extracted = true;
                break;
            }
        }

        if !extracted {
            let _ = std::fs::remove_file(&temp_path);
            return Err(anyhow!("在 Tar 压缩包中未找到可执行文件 {binary_name}"));
        }
    } else {
        return Err(anyhow!("不支持的压缩格式: {archive_type}"));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&temp_path)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&temp_path, perms)?;
    }

    // Atomic rename over target to prevent partial binary execution or ETXTBSY on Linux
    #[cfg(windows)]
    {
        if target_path.exists() {
            let _ = std::fs::remove_file(&target_path);
        }
    }
    std::fs::rename(&temp_path, &target_path)?;

    if let Some(target) = detect_current_target() {
        let ext = if target.os == "windows" { ".exe" } else { "" };
        let platform_path = dest_dir.join(format!("sing-box-{}-{}{}", target.os, target.arch, ext));
        let _ = std::fs::copy(&target_path, &platform_path);
    }

    Ok(target_path)
}

/// 预置的知名 GitHub 加速镜像前缀（按测速响应稳定性与可用性排序）
pub const DEFAULT_GITHUB_MIRRORS: &[&str] = &[
    "https://gh-proxy.com/",
    "https://ghfast.top/",
    "https://mirror.ghproxy.com/",
    "https://ghproxy.net/",
];

/// 根据目标 GitHub URL 生成可尝试的加速镜像地址列表
/// 支持通过环境变量 `SUBOUT_GITHUB_MIRROR` 自定义优先镜像前缀
pub fn get_mirror_urls(target_url: &str) -> Vec<String> {
    let mut mirrors = Vec::new();
    if let Ok(custom) = std::env::var("SUBOUT_GITHUB_MIRROR") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            let prefix = if trimmed.ends_with('/') {
                trimmed.to_string()
            } else {
                format!("{trimmed}/")
            };
            mirrors.push(format!("{prefix}{target_url}"));
        }
    }
    for &prefix in DEFAULT_GITHUB_MIRRORS {
        let candidate = format!("{prefix}{target_url}");
        if !mirrors.contains(&candidate) {
            mirrors.push(candidate);
        }
    }
    mirrors
}

async fn wait_for_cancel(cancel_flag: &std::sync::atomic::AtomicBool) {
    while !cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
}

async fn try_download_mirrors(
    client: &reqwest::Client,
    cancel_flag: &std::sync::atomic::AtomicBool,
    mirror_urls: &[String],
) -> Result<reqwest::Response> {
    let mut last_err = String::from("无可用镜像");
    for url in mirror_urls {
        eprintln!("[Kernel] 正在尝试国内加速镜像: {url}...");
        let req_opt = tokio::select! {
            res = client.get(url).send() => Some(res),
            () = wait_for_cancel(cancel_flag) => None,
        };
        match req_opt {
            None => return Err(anyhow!("下载已取消")),
            Some(Ok(res)) if res.status().is_success() => {
                eprintln!("[Kernel] 加速镜像连接成功: {url}");
                return Ok(res);
            }
            Some(Ok(res)) => {
                last_err = format!("{url} 返回 HTTP {}", res.status());
                eprintln!(
                    "[Kernel] 镜像 {url} 返回 HTTP {}，尝试下一个备用镜像...",
                    res.status()
                );
            }
            Some(Err(e)) => {
                last_err = format!("{url} ({e})");
                eprintln!("[Kernel] 镜像 {url} 连接失败: {e}，尝试下一个备用镜像...");
            }
        }
    }
    Err(anyhow!(last_err))
}

pub async fn download_and_install_kernel(
    status_lock: Arc<RwLock<KernelDownloadStatus>>,
    cancel_flag: Arc<std::sync::atomic::AtomicBool>,
    use_mirror: bool,
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
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .connect_timeout(std::time::Duration::from_secs(10))
        .read_timeout(std::time::Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;

    let primary_url = target.url;
    let mirror_urls = get_mirror_urls(target.url);

    let response = if use_mirror {
        match try_download_mirrors(&client, &cancel_flag, &mirror_urls).await {
            Ok(res) => res,
            Err(e) if e.to_string() == "下载已取消" => {
                let mut st = status_lock.write().await;
                st.status = "idle".to_string();
                st.error = Some("下载已取消".to_string());
                return Err(e);
            }
            Err(e) => {
                let err_msg = format!("发起内核下载请求失败 (所有加速镜像均不可达): {e}");
                let mut st = status_lock.write().await;
                st.status = "error".to_string();
                st.error = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
        }
    } else {
        eprintln!("[Kernel] 正在尝试官方源直连下载: {primary_url}...");
        let send_res = tokio::select! {
            res = client.get(primary_url).send() => Some(res),
            () = wait_for_cancel(&cancel_flag) => None,
        };

        match send_res {
            None => {
                let mut st = status_lock.write().await;
                st.status = "idle".to_string();
                st.error = Some("下载已取消".to_string());
                return Err(anyhow!("下载已取消"));
            }
            Some(Ok(res)) if res.status().is_success() => res,
            Some(res_or_err) => {
                let official_err = match res_or_err {
                    Ok(res) => format!("HTTP {}", res.status()),
                    Err(e) => format!("{e}"),
                };
                eprintln!(
                    "[Kernel] 官方源直连失败 ({official_err})，自动切换至备用加速镜像..."
                );
                match try_download_mirrors(&client, &cancel_flag, &mirror_urls).await {
                    Ok(res) => res,
                    Err(e) if e.to_string() == "下载已取消" => {
                        let mut st = status_lock.write().await;
                        st.status = "idle".to_string();
                        st.error = Some("下载已取消".to_string());
                        return Err(e);
                    }
                    Err(mirror_err) => {
                        let err_msg = format!(
                            "发起内核下载请求失败: 官方源不可达 ({official_err})；备用加速镜像亦均不可达 ({mirror_err})。"
                        );
                        let mut st = status_lock.write().await;
                        st.status = "error".to_string();
                        st.error = Some(err_msg.clone());
                        return Err(anyhow!(err_msg));
                    }
                }
            }
        }
    };

    if !response.status().is_success() {
        let err_msg = format!("下载失败，HTTP 状态码: {}", response.status());
        let mut st = status_lock.write().await;
        st.status = "error".to_string();
        st.error = Some(err_msg.clone());
        return Err(anyhow!(err_msg));
    }

    let total_size = response.content_length().unwrap_or(0);
    {
        let mut st = status_lock.write().await;
        st.total_bytes = total_size;
    }

    let mut stream = response.bytes_stream();

    let mut downloaded_data = Vec::with_capacity(match total_size {
        0 => 16 * 1024 * 1024,
        n if n <= 128 * 1024 * 1024 => n as usize,
        _ => 128 * 1024 * 1024,
    });
    let mut downloaded_bytes: u64 = 0;

    let mut speed_window_start = std::time::Instant::now();
    let mut speed_window_bytes: u64 = 0;
    let mut speed_bytes_per_sec: u64 = 0;

    let mut last_reported_progress = 0.0f64;
    let mut last_update_time: Option<std::time::Instant> = None;

    loop {
        let chunk_opt = tokio::select! {
            res = stream.next() => res,
            () = wait_for_cancel(&cancel_flag) => {
                let mut st = status_lock.write().await;
                st.status = "idle".to_string();
                st.error = Some("下载已取消".to_string());
                return Err(anyhow!("下载已取消"));
            }
        };

        let chunk = match chunk_opt {
            Some(Ok(c)) => c,
            Some(Err(e)) => {
                let err_msg = format!("下载数据流中断: {e}");
                let mut st = status_lock.write().await;
                st.status = "error".to_string();
                st.error = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
            None => break,
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
            let new_progress = ((downloaded_bytes as f64 / total_size as f64) * 100.0).min(100.0);
            if new_progress > last_reported_progress {
                last_reported_progress = new_progress;
            }
        }

        let should_update = last_update_time
            .is_none_or(|t| now.duration_since(t) >= std::time::Duration::from_millis(150));
        if should_update {
            let mut st = status_lock.write().await;
            st.downloaded_bytes = downloaded_bytes;
            st.total_bytes = total_size;
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

    // Extract
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

    // Invalidate version cache so the new binary version is immediately detected
    if let Ok(mut guard) = KERNEL_VERSION_CACHE.write() {
        *guard = None;
    }

    // Verify installation
    let verify_path = binary_path.clone();
    let installed_version =
        tokio::task::spawn_blocking(move || get_installed_kernel_version(&verify_path))
            .await
            .map_err(|e| anyhow!("内核校验任务执行异常: {e}"))?;

    if let Some(ver) = installed_version {
        if is_supported_kernel_version(&ver) {
            let mut st = status_lock.write().await;
            st.status = "ready".to_string();
            st.progress = 100.0;
            st.error = None;
            Ok(binary_path)
        } else {
            let err_msg = format!("内核安装完成但版本不兼容: {ver}，需要 1.14.*");
            let mut st = status_lock.write().await;
            st.status = "error".to_string();
            st.error = Some(err_msg.clone());
            Err(anyhow!(err_msg))
        }
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

    #[test]
    fn test_is_supported_kernel_version() {
        assert!(is_supported_kernel_version("sing-box version 1.14.4"));
        assert!(is_supported_kernel_version("sing-box version 1.14.0"));
        assert!(is_supported_kernel_version("1.14.12"));
        assert!(is_supported_kernel_version("v1.14.4"));

        assert!(!is_supported_kernel_version("sing-box version 1.13.5"));
        assert!(!is_supported_kernel_version("sing-box version 1.12.0"));
        assert!(!is_supported_kernel_version("sing-box version 1.15.0"));
        assert!(!is_supported_kernel_version("unknown string"));
    }

    #[test]
    fn test_extract_archive_tar_gz() {
        let temp_dir = std::env::temp_dir().join(format!("subout_test_tar_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let dest = &temp_dir;

        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        {
            let mut tar = tar::Builder::new(&mut enc);
            let content = b"echo sing-box test";
            let mut header = tar::Header::new_gnu();
            header.set_size(content.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            tar.append_data(
                &mut header,
                "sing-box-1.14.4-linux-amd64/sing-box",
                &content[..],
            )
            .unwrap();
            tar.finish().unwrap();
        }
        let gz_bytes = enc.finish().unwrap();

        let extracted = extract_archive(&gz_bytes, "tar.gz", dest, "sing-box").unwrap();
        assert!(extracted.exists());
        let read = std::fs::read(&extracted).unwrap();
        assert_eq!(read, b"echo sing-box test");
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_extract_archive_zip() {
        use std::io::Write;
        let temp_dir = std::env::temp_dir().join(format!("subout_test_zip_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let dest = &temp_dir;

        let mut buf = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buf);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("sing-box-1.14.4-windows-amd64/sing-box.exe", options)
                .unwrap();
            zip.write_all(b"windows binary test").unwrap();
            zip.finish().unwrap();
        }
        let zip_bytes = buf.into_inner();

        let extracted = extract_archive(&zip_bytes, "zip", dest, "sing-box.exe").unwrap();
        assert!(extracted.exists());
        let read = std::fs::read(&extracted).unwrap();
        assert_eq!(read, b"windows binary test");
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_get_mirror_urls() {
        let dummy_url = "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/test.tar.gz";
        let mirrors = get_mirror_urls(dummy_url);
        assert!(!mirrors.is_empty());
        assert!(mirrors.iter().any(|m| m.starts_with("https://gh-proxy.com/")));
        assert!(mirrors.iter().any(|m| m.starts_with("https://ghfast.top/")));
        assert!(mirrors.iter().all(|m| m.ends_with(dummy_url)));
    }
}
