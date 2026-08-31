use std::path::{Path, PathBuf};
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

impl AppPaths {
    /// Initialize global AppPaths with optional explicit CLI overrides.
    pub fn init(
        cli_config_dir: Option<PathBuf>,
        cli_data_dir: Option<PathBuf>,
        cli_log_dir: Option<PathBuf>,
        cli_runtime_dir: Option<PathBuf>,
        cli_singbox_path: Option<PathBuf>,
        cli_portable: bool,
    ) -> &'static AppPaths {
        let paths = Self::resolve(
            cli_config_dir,
            cli_data_dir,
            cli_log_dir,
            cli_runtime_dir,
            cli_singbox_path,
            cli_portable,
        );
        let _ = paths.ensure_dirs();
        let _ = GLOBAL_PATHS.set(paths);
        GLOBAL_PATHS
            .get()
            .expect("Global paths must be initialized")
    }

    /// Get the global AppPaths instance (or initialize with defaults if not already initialized).
    pub fn get() -> &'static AppPaths {
        GLOBAL_PATHS.get_or_init(|| {
            let paths = Self::resolve(None, None, None, None, None, false);
            let _ = paths.ensure_dirs();
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
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false);

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

    /// Ensure required directories exist.
    pub fn ensure_dirs(&self) -> std::io::Result<()> {
        let _ = std::fs::create_dir_all(&self.data_dir);
        let _ = std::fs::create_dir_all(&self.log_dir);
        let _ = std::fs::create_dir_all(&self.runtime_dir);
        let _ = std::fs::create_dir_all(&self.kernel_dir());
        let _ = std::fs::create_dir_all(self.generated_dir());
        let _ = std::fs::create_dir_all(self.subscriptions_dir());
        let _ = std::fs::create_dir_all(self.nodes_dir());

        // Attempt creating config_dir if writable
        let _ = std::fs::create_dir_all(&self.config_dir);
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

    /// Helper to generate a unique temporary file path inside `runtime_dir` (fallback to data_dir)
    pub fn temp_file_path(&self, prefix: &str, suffix: &str) -> PathBuf {
        let count = TEMP_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let pid = std::process::id();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let filename = format!("{}_{}_{}_{}{}", prefix, pid, timestamp, count, suffix);

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
                            "[Info] Migrated database file from {:?} to {:?}",
                            src, target_db
                        );
                        break;
                    } else if std::fs::copy(&src, &target_db).is_ok() {
                        let _ = std::fs::remove_file(&src);
                        println!(
                            "[Info] Migrated database file from {:?} to {:?}",
                            src, target_db
                        );
                        break;
                    } else {
                        eprintln!(
                            "[Warning] Failed to migrate database from {:?} to {:?}",
                            src, target_db
                        );
                    }
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
                if src.exists() && src != target_config {
                    if let Ok(_) = std::fs::copy(&src, &target_config) {
                        let _ = std::fs::remove_file(&src);
                        break;
                    }
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
    /// Prioritizes candidates whose version is >= `min_version` (default 1.12.0).
    pub fn find_singbox_executable(&self) -> Option<PathBuf> {
        let min_version =
            std::env::var("SUBOUT_MIN_SINGBOX_VERSION").unwrap_or_else(|_| "1.12.0".to_string());

        let binary_name = crate::platform::current_platform().kernel_binary_name();

        let mut candidates = Vec::new();

        // 1. Explicitly configured path
        if let Some(ref custom) = self.custom_singbox_path {
            candidates.push(custom.clone());
        }

        // 2. System PATH check
        if let Some(path) = find_in_path(binary_name) {
            candidates.push(path);
        }

        // 3. Application data kernel path (<data_dir>/bin/sing-box or <data_dir>/sing-box/sing-box)
        candidates.push(self.kernel_binary_path());
        candidates.push(self.data_dir.join("sing-box").join(binary_name));

        // 4. Common standard system paths from platform strategy
        candidates
            .extend(crate::platform::current_platform().standard_singbox_candidates(binary_name));

        // 5. Dev / local directories
        candidates.push(PathBuf::from(format!("./runtime/data/bin/{}", binary_name)));
        candidates.push(PathBuf::from(format!("./data/bin/{}", binary_name)));
        candidates.push(PathBuf::from(format!("./bin/{}", binary_name)));
        candidates.push(PathBuf::from(format!("./{}", binary_name)));

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
        if parts.len() >= 2 {
            if let (Ok(major), Ok(minor)) = (parts[0].parse::<u64>(), parts[1].parse::<u64>()) {
                let patch = parts
                    .get(2)
                    .and_then(|p| p.parse::<u64>().ok())
                    .unwrap_or(0);
                return Some((major, minor, patch));
            }
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
        // If parsing fails for custom nightly builds, accept it
        _ => true,
    }
}

/// Helper to get raw version string from sing-box executable
pub fn get_singbox_version_raw(path: &Path) -> Option<String> {
    if !path.is_absolute() && path.components().count() == 1 {
        if let Ok(output) = std::process::Command::new(path).arg("version").output() {
            if output.status.success() {
                let out_str = String::from_utf8_lossy(&output.stdout);
                return out_str.lines().next().map(|s| s.trim().to_string());
            }
        }
        return None;
    }

    if !path.exists() || !path.is_file() {
        return None;
    }

    if let Ok(output) = std::process::Command::new(path).arg("version").output() {
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            return out_str.lines().next().map(|s| s.trim().to_string());
        }
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
    if let Ok(output) = std::process::Command::new(cmd_name).arg("version").output() {
        if output.status.success() {
            return Some(PathBuf::from(cmd_name));
        }
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
            config_dir: legacy_config_dir.clone(),
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
    }
}
