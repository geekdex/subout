use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

static GLOBAL_PATHS: OnceLock<AppPaths> = OnceLock::new();
static TEMP_COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub log_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub custom_singbox_path: Option<PathBuf>,
    pub is_portable: bool,
    pub is_dev: bool,
}

/// 校验应用自身目录的路径形状：拒绝空路径、`..` 穿越与系统根目录本身。
/// 注意：这里不禁止绝对路径——安装脚本会使用 /var/lib/subout 等绝对目录；
/// 真正需要"相对路径"约束的是配置文件里的 `log.output` / `cache_file.path`（见
/// `validate_config_relative_path`）。
fn validate_app_dir(dir: &Path, label: &str) -> io::Result<()> {
    const FORBIDDEN_ROOTS: &[&str] = &[
        "",
        "/",
        "/etc",
        "/usr",
        "/bin",
        "/sbin",
        "/boot",
        "/proc",
        "/sys",
        "/dev",
        "/root",
        "c:",
        "c:\\windows",
        "c:\\program files",
        "c:\\program files (x86)",
    ];

    if dir.as_os_str().is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("{label} 不能为空"),
        ));
    }
    if dir.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("{label} 不能包含 '..' 目录穿越: {}", dir.display()),
        ));
    }
    let lowered = dir.to_string_lossy().to_lowercase();
    let root = lowered.trim_end_matches(['/', '\\']);
    if FORBIDDEN_ROOTS.contains(&root) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!(
                "{label} 不能直接使用系统目录 '{}'，请指定应用专属子目录（如 '{}/subout'）",
                dir.display(),
                dir.display()
            ),
        ));
    }
    Ok(())
}

/// 校验 sing-box 配置文件中的路径字段（`log.output` / `experimental.cache_file.path`）。
/// 只允许相对路径，拒绝绝对路径、`..` 穿越、Windows 盘符/UNC 与空字节。
/// 错误消息可直接展示给用户。
pub fn validate_config_relative_path(value: &str, field: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(()); // 未配置，使用默认值
    }
    if trimmed.contains('\0') {
        return Err(format!("{field} 包含非法空字符"));
    }
    let path = Path::new(trimmed);
    let bytes = trimmed.as_bytes();
    let has_windows_drive = bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic();
    if path.is_absolute()
        || has_windows_drive
        || trimmed.starts_with('/')
        || trimmed.starts_with('\\')
    {
        return Err(format!(
            "{field} 必须是相对路径（如 'cache.db' 或 'logs/subout.log'），当前为 '{trimmed}'。绝对路径可能指向系统目录，导致无权限或数据泄露"
        ));
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(format!("{field} 不能包含 '..' 目录穿越: '{trimmed}'"));
    }
    Ok(())
}

impl AppPaths {
    /// Initialize global `AppPaths` with optional explicit CLI overrides.
    pub fn init(
        cli_config_dir: Option<PathBuf>,
        cli_data_dir: Option<PathBuf>,
        cli_log_dir: Option<PathBuf>,
        cli_runtime_dir: Option<PathBuf>,
        cli_singbox_path: Option<PathBuf>,
        cli_portable: bool,
    ) -> io::Result<&'static AppPaths> {
        let paths = Self::resolve(
            cli_config_dir,
            cli_data_dir,
            cli_log_dir,
            cli_runtime_dir,
            cli_singbox_path,
            cli_portable,
        );
        paths.ensure_dirs()?;
        let _ = GLOBAL_PATHS.set(paths);
        Ok(GLOBAL_PATHS
            .get()
            .expect("Global paths must be initialized"))
    }

    /// Get the global `AppPaths` instance (or initialize with defaults if not already initialized).
    pub fn get() -> &'static AppPaths {
        GLOBAL_PATHS.get_or_init(|| {
            let paths = Self::resolve(None, None, None, None, None, false);
            if let Err(e) = paths.ensure_dirs() {
                // get_or_init 无法返回错误；此处必须显式失败并给出可操作提示，
                // 绝不能让目录无权限的问题演变成后续难以定位的连环错误。
                panic!("subout 目录初始化失败: {e}");
            }
            paths
        })
    }

    /// Resolve directories based on clear priority:
    /// 1. CLI Arguments (`--data-dir`, `--config-dir`, `--log-dir`, `--runtime-dir`, `--portable`)
    /// 2. Environment Variables:
    ///    - `SUBOUT_DATA_DIR`
    ///    - `SUBOUT_CONFIG_DIR`
    ///    - `SUBOUT_LOG_DIR`
    ///    - `SUBOUT_RUNTIME_DIR`
    ///    - `SUBOUT_PORTABLE`
    ///    - `SUBOUT_SINGBOX_PATH` / `SUBOUT_KERNEL_PATH`
    /// 3. Portable mode (`./data`, `./config`, `./logs`, `./run`)
    /// 4. Development environment (when running `cargo run`, in source tree, or debug: `./runtime/data`, `./runtime/config`, `./runtime/logs`, `./runtime/run`)
    /// 5. Production Operating System Defaults:
    ///    - Linux: `/var/lib/subout`, `/etc/subout`, `/var/log/subout`, `/run/subout`
    ///    - macOS: `/Library/Application Support/Subout`, `/Library/Application Support/Subout/config`, `/Library/Logs/Subout`, `/Library/Application Support/Subout/run`
    ///    - Windows: `C:\ProgramData\Subout`, `C:\ProgramData\Subout\config`, `C:\ProgramData\Subout\logs`, `C:\ProgramData\Subout\run`
    pub fn resolve(
        cli_config_dir: Option<PathBuf>,
        cli_data_dir: Option<PathBuf>,
        cli_log_dir: Option<PathBuf>,
        cli_runtime_dir: Option<PathBuf>,
        cli_singbox_path: Option<PathBuf>,
        cli_portable: bool,
    ) -> Self {
        let custom_singbox_path = cli_singbox_path
            .or_else(|| std::env::var("SUBOUT_SINGBOX_PATH").ok().map(PathBuf::from))
            .or_else(|| std::env::var("SUBOUT_KERNEL_PATH").ok().map(PathBuf::from));

        let is_portable = cli_portable
            || std::env::var("SUBOUT_PORTABLE")
                .is_ok_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));

        let is_dev = !is_portable && Self::detect_dev_environment();

        let platform = crate::platform::current_platform();

        // 1. Data Dir resolution
        let data_dir = if let Some(dir) = cli_data_dir {
            dir
        } else if let Ok(env_dir) = std::env::var("SUBOUT_DATA_DIR") {
            PathBuf::from(env_dir)
        } else if is_portable {
            PathBuf::from("./data")
        } else if is_dev {
            PathBuf::from("./runtime/data")
        } else {
            platform.default_data_dir()
        };

        // 2. Config Dir resolution
        let config_dir = if let Some(dir) = cli_config_dir {
            dir
        } else if let Ok(env_dir) = std::env::var("SUBOUT_CONFIG_DIR") {
            PathBuf::from(env_dir)
        } else if is_portable {
            PathBuf::from("./config")
        } else if is_dev {
            PathBuf::from("./runtime/config")
        } else {
            platform.default_config_dir(&data_dir)
        };

        // 3. Log Dir resolution
        let log_dir = if let Some(dir) = cli_log_dir {
            dir
        } else if let Ok(env_dir) = std::env::var("SUBOUT_LOG_DIR") {
            PathBuf::from(env_dir)
        } else if is_portable {
            PathBuf::from("./logs")
        } else if is_dev {
            PathBuf::from("./runtime/logs")
        } else {
            platform.default_log_dir(&data_dir)
        };

        // 4. Runtime Dir resolution (for PID, sockets, transient sing-box temporary files)
        let runtime_dir = if let Some(dir) = cli_runtime_dir {
            dir
        } else if let Ok(env_dir) = std::env::var("SUBOUT_RUNTIME_DIR") {
            PathBuf::from(env_dir)
        } else if is_portable {
            PathBuf::from("./run")
        } else if is_dev {
            PathBuf::from("./runtime/run")
        } else {
            platform.default_runtime_dir(&data_dir)
        };

        Self {
            config_dir,
            data_dir,
            log_dir,
            runtime_dir,
            custom_singbox_path,
            is_portable,
            is_dev,
        }
    }

    /// Detect if running in development environment (e.g. `cargo run`, test runner, or workspace root)
    fn detect_dev_environment() -> bool {
        if let Ok(val) = std::env::var("SUBOUT_DEV") {
            return val == "1" || val.eq_ignore_ascii_case("true");
        }

        // Running through cargo toolchain
        if std::env::var("CARGO").is_ok() || std::env::var("CARGO_PKG_NAME").is_ok() {
            return true;
        }

        // Debug assertions are enabled during debug builds (e.g. cargo run / cargo test)
        if cfg!(debug_assertions) {
            return true;
        }

        // Running within source workspace directory containing Cargo.toml and src/main.rs
        let in_workspace =
            Path::new("./Cargo.toml").is_file() && Path::new("./src/main.rs").is_file();
        if in_workspace {
            return true;
        }

        false
    }

    /// Ensure required directories exist AND are writable.
    ///
    /// 之前的实现吞掉了所有 `create_dir_all` 错误并永远返回 Ok，导致目录无权限时
    /// 服务照常启动、随后在数据库/日志/生成配置处产生难以定位的连环错误。
    /// 现在逐个创建并写入探针文件验证可写，失败即返回带路径与修复建议的错误。
    pub fn ensure_dirs(&self) -> io::Result<()> {
        Self::ensure_writable_dir(&self.data_dir, "数据目录")?;
        Self::ensure_writable_dir(&self.log_dir, "日志目录")?;
        Self::ensure_writable_dir(&self.runtime_dir, "运行时目录")?;
        Self::ensure_writable_dir(&self.config_dir, "配置目录")?;
        Self::ensure_writable_dir(&self.kernel_dir(), "内核目录")?;
        Self::ensure_writable_dir(&self.generated_dir(), "生成配置目录")?;
        Self::ensure_writable_dir(&self.subscriptions_dir(), "订阅缓存目录")?;
        Self::ensure_writable_dir(&self.nodes_dir(), "节点目录")?;
        Ok(())
    }

    fn ensure_writable_dir(dir: &Path, label: &str) -> io::Result<()> {
        validate_app_dir(dir, label)?;
        std::fs::create_dir_all(dir).map_err(|e| {
            io::Error::new(
                e.kind(),
                format!(
                    "无法创建{label} '{}': {e}。请检查父目录权限，或通过 --data-dir/--config-dir/--log-dir/--runtime-dir 指定可写目录",
                    dir.display()
                ),
            )
        })?;

        let probe = dir.join(format!(
            ".subout-write-probe-{}-{}",
            std::process::id(),
            TEMP_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        ));
        std::fs::write(&probe, b"ok")
            .and_then(|()| std::fs::remove_file(&probe))
            .map_err(|e| {
                io::Error::new(
                    e.kind(),
                    format!(
                        "{label} '{}' 不可写: {e}。请以有权限的用户运行，或调整目录权限",
                        dir.display()
                    ),
                )
            })?;
        Ok(())
    }

    /// Path to SQLite database file
    pub fn database_path(&self) -> PathBuf {
        self.data_dir.join("subout.db")
    }

    /// Alias for `database_path()` for backward compatibility
    pub fn db_path(&self) -> PathBuf {
        self.database_path()
    }

    /// Directory for generated runtime configs and artifacts
    pub fn generated_dir(&self) -> PathBuf {
        self.data_dir.join("generated")
    }

    /// Path to sing-box runtime configuration file (`<data_dir>/generated/sing-box.json`)
    pub fn generated_config_path(&self) -> PathBuf {
        self.generated_dir().join("sing-box.json")
    }

    /// Alias for `generated_config_path()` for backward compatibility
    pub fn running_config_path(&self) -> PathBuf {
        self.generated_config_path()
    }

    /// Directory for stored subscription cache
    pub fn subscriptions_dir(&self) -> PathBuf {
        self.data_dir.join("subscriptions")
    }

    /// Directory for customized nodes
    pub fn nodes_dir(&self) -> PathBuf {
        self.data_dir.join("nodes")
    }

    /// Directory for downloaded kernel binaries (`<data_dir>/bin`)
    pub fn kernel_dir(&self) -> PathBuf {
        self.data_dir.join("bin")
    }

    /// Default target binary path for downloading kernel
    pub fn kernel_binary_path(&self) -> PathBuf {
        let binary_name = crate::platform::current_platform().kernel_binary_name();
        self.kernel_dir().join(binary_name)
    }

    /// Helper to generate a unique temporary file path inside `runtime_dir` (fallback to `data_dir`)
    pub fn temp_file_path(&self, prefix: &str, suffix: &str) -> PathBuf {
        let count = TEMP_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let pid = std::process::id();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_millis());
        let filename = format!("{prefix}_{pid}_{timestamp}_{count}{suffix}");

        let target_dir =
            if self.runtime_dir.is_dir() || std::fs::create_dir_all(&self.runtime_dir).is_ok() {
                &self.runtime_dir
            } else {
                &self.data_dir
            };
        target_dir.join(filename)
    }

    /// Initialize and migrate database and configs if necessary.
    /// Handles migration from:
    /// - `./data/subout.db` or `./data/singbox_auto.db` (legacy local data location)
    /// - `config_dir/subout.db` or `config_dir/singbox_auto.db` (legacy config directory location)
    /// - `./subout.db` or `./singbox_auto.db` (legacy workspace root location)
    /// - system XDG user dirs (~/.local/share/subout, ~/.config/subout)
    pub fn initialize_db_path(&self) -> std::io::Result<PathBuf> {
        self.ensure_dirs()?;
        let target_db = self.database_path();

        if !target_db.exists() {
            let mut candidates = vec![
                PathBuf::from("./data/subout.db"),
                PathBuf::from("./data/singbox_auto.db"),
                self.config_dir.join("subout.db"),
                self.config_dir.join("singbox_auto.db"),
                PathBuf::from("subout.db"),
                PathBuf::from("singbox_auto.db"),
            ];

            if let Some(cfg_d) = dirs::config_dir() {
                candidates.push(cfg_d.join("subout").join("subout.db"));
                candidates.push(cfg_d.join("subout").join("singbox_auto.db"));
            }
            if let Some(dat_d) = dirs::data_dir() {
                candidates.push(dat_d.join("subout").join("subout.db"));
                candidates.push(dat_d.join("subout").join("singbox_auto.db"));
            }

            // Legacy system locations per platform
            candidates
                .extend(crate::platform::current_platform().legacy_db_candidates(&self.config_dir));

            for src in candidates {
                if src.exists() && src != target_db {
                    if std::fs::rename(&src, &target_db).is_ok() {
                        println!(
                            "[Info] Migrated database file from {} to {}",
                            src.display(),
                            target_db.display()
                        );
                        break;
                    } else if std::fs::copy(&src, &target_db).is_ok() {
                        let _ = std::fs::remove_file(&src);
                        println!(
                            "[Info] Migrated database file from {} to {}",
                            src.display(),
                            target_db.display()
                        );
                        break;
                    }
                    eprintln!(
                        "[Warning] Failed to migrate database from {} to {}",
                        src.display(),
                        target_db.display()
                    );
                }
            }
        }

        // Also check if legacy sing-box-running.json can be migrated to generated/sing-box.json
        let target_config = self.generated_config_path();
        if !target_config.exists() {
            let legacy_configs = [
                self.data_dir.join("sing-box-running.json"),
                PathBuf::from("./data/sing-box-running.json"),
                PathBuf::from("sing-box-running.json"),
            ];
            for src in legacy_configs {
                if src.exists()
                    && src != target_config
                    && std::fs::copy(&src, &target_config).is_ok()
                {
                    let _ = std::fs::remove_file(&src);
                    break;
                }
            }
        }

        Ok(target_db)
    }

    /// Find an available sing-box executable according to best practices:
    /// 1. Custom specified path (CLI or `SUBOUT_SINGBOX_PATH` / `SUBOUT_KERNEL_PATH`)
    /// 2. System PATH (via `which` / `where` or direct execution test)
    /// 3. Bundled binary in application data directory (`<data_dir>/bin/sing-box` or `<data_dir>/sing-box/sing-box`)
    /// 4. Platform installation directories (`/usr/local/bin`, `C:\Program Files\Subout`, `/opt/homebrew/bin`, etc.)
    /// 5. Standard system directories (`/usr/bin/sing-box`, `/bin/sing-box`, `/usr/sbin/sing-box`)
    /// 6. Local / Dev candidate directory (`./runtime/data/bin/sing-box`, `./bin/sing-box`, `./sing-box`)
    ///
    /// Prioritizes candidates whose version is >= `min_version` (default 1.14.0).
    pub fn find_singbox_executable(&self) -> Option<PathBuf> {
        let min_version =
            std::env::var("SUBOUT_MIN_SINGBOX_VERSION").unwrap_or_else(|_| "1.14.0".to_string());

        let binary_name = crate::platform::current_platform().kernel_binary_name();

        let mut candidates = Vec::new();

        // 1. Explicitly configured path
        if let Some(ref custom) = self.custom_singbox_path {
            candidates.push(custom.clone());
        }

        // 2. Application data kernel path (<data_dir>/bin/sing-box-<os>-<arch> or <data_dir>/bin/sing-box)
        if let Some(target) = crate::kernel::detect_current_target() {
            let ext = if target.os == "windows" { ".exe" } else { "" };
            let platform_bin = format!("sing-box-{}-{}{}", target.os, target.arch, ext);
            candidates.push(self.kernel_dir().join(&platform_bin));
            candidates.push(PathBuf::from(format!("./runtime/data/bin/{platform_bin}")));
        }
        candidates.push(self.kernel_binary_path());
        candidates.push(self.data_dir.join("sing-box").join(binary_name));

        // 3. System PATH check
        if let Some(path) = find_in_path(binary_name) {
            candidates.push(path);
        }

        // 4. Common standard system paths from platform strategy
        candidates
            .extend(crate::platform::current_platform().standard_singbox_candidates(binary_name));

        // 5. Dev / local directories
        candidates.push(PathBuf::from(format!("./runtime/data/bin/{binary_name}")));
        candidates.push(PathBuf::from(format!("./data/bin/{binary_name}")));
        candidates.push(PathBuf::from(format!("./bin/{binary_name}")));
        candidates.push(PathBuf::from(format!("./{binary_name}")));

        // Pass 1: Deduplicate and look for candidates meeting version >= min_version
        let mut seen = std::collections::HashSet::new();
        let mut fallback_valid = None;

        for candidate in candidates {
            let key = candidate.to_string_lossy().to_string();
            if !seen.insert(key) {
                continue;
            }

            if let Some(ver_output) = get_singbox_version_raw(&candidate) {
                if is_version_ge(&ver_output, &min_version) {
                    return Some(candidate);
                } else if fallback_valid.is_none() {
                    fallback_valid = Some(candidate);
                }
            }
        }

        // Pass 2: If no candidate satisfies min_version, return any working candidate as fallback
        fallback_valid
    }
}

/// Parse semver major.minor.patch from strings like:
/// - "sing-box version 1.13.19"
/// - "sing-box version 1.13.19-beta.1"
/// - "v1.14.0"
/// - "1.12.0"
pub fn parse_semver(s: &str) -> Option<(u64, u64, u64)> {
    for token in s.split_whitespace() {
        let clean_token =
            token.trim_start_matches(|c: char| c.is_alphabetic() || c == 'v' || c == 'V');
        let semver_part = clean_token.split('-').next().unwrap_or(clean_token);
        let parts: Vec<&str> = semver_part.split('.').collect();
        if parts.len() >= 2
            && let (Ok(major), Ok(minor)) = (parts[0].parse::<u64>(), parts[1].parse::<u64>())
        {
            let patch = parts
                .get(2)
                .and_then(|p| p.parse::<u64>().ok())
                .unwrap_or(0);
            return Some((major, minor, patch));
        }
    }
    None
}

/// Check if version string `v` satisfies >= `min_v`
pub fn is_version_ge(v: &str, min_v: &str) -> bool {
    match (parse_semver(v), parse_semver(min_v)) {
        (Some((v_maj, v_min, v_pat)), Some((m_maj, m_min, m_pat))) => {
            (v_maj, v_min, v_pat) >= (m_maj, m_min, m_pat)
        }
        // Fail closed: an unrecognised version must not be treated as a valid
        // candidate and then rejected later by the kernel gatekeeper with a
        // confusing error. Surface it as "not ready" instead.
        _ => false,
    }
}

/// Helper to get raw version string from sing-box executable
pub fn get_singbox_version_raw(path: &Path) -> Option<String> {
    if !path.is_absolute() && path.components().count() == 1 {
        if let Ok(output) = std::process::Command::new(path).arg("version").output()
            && output.status.success()
        {
            let out_str = String::from_utf8_lossy(&output.stdout);
            return out_str.lines().next().map(|s| s.trim().to_string());
        }
        return None;
    }

    if !path.exists() || !path.is_file() {
        return None;
    }

    if let Ok(output) = std::process::Command::new(path).arg("version").output()
        && output.status.success()
    {
        let out_str = String::from_utf8_lossy(&output.stdout);
        return out_str.lines().next().map(|s| s.trim().to_string());
    }

    None
}

/// Helper to test if a given path is an executable sing-box binary
pub fn is_valid_singbox(path: &Path) -> bool {
    get_singbox_version_raw(path).is_some()
}

/// Helper to find executable in PATH
fn find_in_path(cmd_name: &str) -> Option<PathBuf> {
    if let Some(p) = crate::platform::current_platform().find_in_path(cmd_name) {
        return Some(p);
    }
    // Try running directly
    if let Ok(output) = std::process::Command::new(cmd_name).arg("version").output()
        && output.status.success()
    {
        return Some(PathBuf::from(cmd_name));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_paths_resolution_explicit_cli() {
        let paths = AppPaths::resolve(
            Some(PathBuf::from("/tmp/custom_config")),
            Some(PathBuf::from("/tmp/custom_data")),
            Some(PathBuf::from("/tmp/custom_logs")),
            Some(PathBuf::from("/tmp/custom_run")),
            Some(PathBuf::from("/usr/bin/custom-singbox")),
            false,
        );

        assert_eq!(paths.config_dir, PathBuf::from("/tmp/custom_config"));
        assert_eq!(paths.data_dir, PathBuf::from("/tmp/custom_data"));
        assert_eq!(paths.log_dir, PathBuf::from("/tmp/custom_logs"));
        assert_eq!(paths.runtime_dir, PathBuf::from("/tmp/custom_run"));
        assert_eq!(
            paths.database_path(),
            PathBuf::from("/tmp/custom_data/subout.db")
        );
        assert_eq!(
            paths.generated_config_path(),
            PathBuf::from("/tmp/custom_data/generated/sing-box.json")
        );
        assert_eq!(paths.kernel_dir(), PathBuf::from("/tmp/custom_data/bin"));
        assert_eq!(
            paths.subscriptions_dir(),
            PathBuf::from("/tmp/custom_data/subscriptions")
        );
        assert_eq!(paths.nodes_dir(), PathBuf::from("/tmp/custom_data/nodes"));
    }

    #[test]
    fn test_app_paths_portable_mode() {
        let paths = AppPaths::resolve(None, None, None, None, None, true);

        assert!(paths.is_portable);
        assert_eq!(paths.data_dir, PathBuf::from("./data"));
        assert_eq!(paths.config_dir, PathBuf::from("./config"));
        assert_eq!(paths.log_dir, PathBuf::from("./logs"));
        assert_eq!(paths.runtime_dir, PathBuf::from("./run"));
        assert_eq!(paths.database_path(), PathBuf::from("./data/subout.db"));
        assert_eq!(
            paths.generated_config_path(),
            PathBuf::from("./data/generated/sing-box.json")
        );
    }

    #[test]
    fn test_app_paths_dev_mode() {
        // In test mode, detect_dev_environment() is true because of debug_assertions / CARGO
        let paths = AppPaths::resolve(None, None, None, None, None, false);

        assert!(paths.is_dev);
        assert_eq!(paths.data_dir, PathBuf::from("./runtime/data"));
        assert_eq!(paths.config_dir, PathBuf::from("./runtime/config"));
        assert_eq!(paths.log_dir, PathBuf::from("./runtime/logs"));
        assert_eq!(paths.runtime_dir, PathBuf::from("./runtime/run"));
        assert_eq!(
            paths.database_path(),
            PathBuf::from("./runtime/data/subout.db")
        );
        assert_eq!(
            paths.generated_config_path(),
            PathBuf::from("./runtime/data/generated/sing-box.json")
        );
    }

    #[test]
    fn test_initialize_db_path_migration() {
        let temp_dir = std::env::temp_dir().join(format!("subout_test_{}", std::process::id()));
        let legacy_config_dir = temp_dir.join("legacy_config");
        let target_data_dir = temp_dir.join("target_data");
        let _ = std::fs::create_dir_all(&legacy_config_dir);

        let legacy_db = legacy_config_dir.join("subout.db");
        std::fs::write(&legacy_db, b"sqlite-mock-data").unwrap();

        let paths = AppPaths {
            config_dir: legacy_config_dir,
            data_dir: target_data_dir.clone(),
            log_dir: temp_dir.join("logs"),
            runtime_dir: temp_dir.join("run"),
            custom_singbox_path: None,
            is_portable: false,
            is_dev: true,
        };

        let resolved_db = paths.initialize_db_path().unwrap();
        assert_eq!(resolved_db, target_data_dir.join("subout.db"));
        assert!(resolved_db.exists());
        assert_eq!(std::fs::read(&resolved_db).unwrap(), b"sqlite-mock-data");

        // Clean up
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_temp_file_path_generation() {
        let temp_dir =
            std::env::temp_dir().join(format!("subout_test_temp_{}", std::process::id()));
        let paths = AppPaths {
            config_dir: temp_dir.join("config"),
            data_dir: temp_dir.join("data"),
            log_dir: temp_dir.join("logs"),
            runtime_dir: temp_dir.join("run"),
            custom_singbox_path: None,
            is_portable: false,
            is_dev: true,
        };
        paths.ensure_dirs().unwrap();

        let t1 = paths.temp_file_path("test_val", ".json");
        let t2 = paths.temp_file_path("test_val", ".json");

        assert_ne!(t1, t2);
        assert!(t1.to_string_lossy().contains("test_val"));
        assert!(t1.to_string_lossy().ends_with(".json"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_semver_parsing_and_comparison() {
        assert_eq!(parse_semver("sing-box version 1.13.19"), Some((1, 13, 19)));
        assert_eq!(
            parse_semver("sing-box version 1.14.0-beta.2"),
            Some((1, 14, 0))
        );
        assert_eq!(parse_semver("v1.12.5"), Some((1, 12, 5)));
        assert_eq!(parse_semver("1.12.0"), Some((1, 12, 0)));

        assert!(is_version_ge("sing-box version 1.13.19", "1.12.0"));
        assert!(is_version_ge("sing-box version 1.14.0", "1.13.0"));
        assert!(is_version_ge("sing-box version 1.12.0", "1.12.0"));
        assert!(!is_version_ge("sing-box version 1.11.8", "1.12.0"));

        // Unrecognised versions fail closed instead of being accepted as a
        // candidate and rejected later by the gatekeeper.
        assert!(!is_version_ge("sing-box version unknown", "1.12.0"));
        assert!(!is_version_ge("not a version", "1.12.0"));
    }

    #[test]
    fn test_validate_config_relative_path() {
        // 允许：相对路径、空值（未配置走默认）
        assert!(validate_config_relative_path("cache.db", "cache_file.path").is_ok());
        assert!(validate_config_relative_path("logs/subout.log", "log.output").is_ok());
        assert!(validate_config_relative_path("  ", "log.output").is_ok());

        // 拒绝：Unix 绝对路径、Windows 盘符、UNC、`..` 穿越、空字节
        for bad in [
            "/etc/passwd",
            "/var/log/subout.log",
            "C:\\Windows\\Temp\\x.db",
            "C:/x.db",
            "\\\\server\\share\\x.db",
            "../cache.db",
            "logs/../../etc/x.log",
            "cache\0.db",
        ] {
            assert!(
                validate_config_relative_path(bad, "cache_file.path").is_err(),
                "应拒绝非法路径: {bad}"
            );
        }
    }

    #[test]
    fn test_ensure_dirs_rejects_parent_traversal() {
        let paths = AppPaths {
            config_dir: PathBuf::from("../etc/subout"),
            data_dir: PathBuf::from("/tmp/subout-test-traversal/data"),
            log_dir: PathBuf::from("/tmp/subout-test-traversal/logs"),
            runtime_dir: PathBuf::from("/tmp/subout-test-traversal/run"),
            custom_singbox_path: None,
            is_portable: false,
            is_dev: true,
        };
        let err = paths.ensure_dirs().unwrap_err();
        assert!(err.to_string().contains(".."), "错误信息应指出 '..': {err}");
    }

    #[test]
    fn test_ensure_dirs_reports_unwritable_dir() {
        let temp_dir =
            std::env::temp_dir().join(format!("subout_test_probe_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        // 用一个普通文件充当数据目录，create_dir_all 必然失败
        let blocker = temp_dir.join("not-a-directory");
        std::fs::write(&blocker, b"occupied").unwrap();

        let paths = AppPaths {
            config_dir: temp_dir.join("config"),
            data_dir: blocker.clone(),
            log_dir: temp_dir.join("logs"),
            runtime_dir: temp_dir.join("run"),
            custom_singbox_path: None,
            is_portable: false,
            is_dev: true,
        };
        let err = paths.ensure_dirs().unwrap_err();
        assert!(
            err.to_string().contains("数据目录") && err.to_string().contains("无法创建"),
            "错误信息应含中文标签与修复建议: {err}"
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
