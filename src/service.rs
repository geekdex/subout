use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::VecDeque;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncSeekExt, BufReader};
use tokio::sync::RwLock;

use crate::kernel;

const MAX_LOG_LINES: usize = 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SingboxLogLevel {
    Trace = 10,
    Debug = 20,
    Info = 30,
    Warn = 40,
    Error = 50,
    Fatal = 60,
    Panic = 70,
}

impl std::str::FromStr for SingboxLogLevel {
    type Err = ();

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "trace" => Ok(Self::Trace),
            "debug" => Ok(Self::Debug),
            "info" => Ok(Self::Info),
            "warn" | "warning" => Ok(Self::Warn),
            "error" => Ok(Self::Error),
            "fatal" => Ok(Self::Fatal),
            "panic" => Ok(Self::Panic),
            _ => Err(()),
        }
    }
}

impl SingboxLogLevel {
    pub fn parse(s: &str) -> Option<Self> {
        s.parse().ok()
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Trace => "trace",
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
            Self::Fatal => "fatal",
            Self::Panic => "panic",
        }
    }
}

/// A log entry's origin: the sing-box kernel itself, or subout's own runtime.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogSource {
    Singbox,
    Subout,
}

/// Structured log line shared by the in-memory buffer and the web API.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub source: LogSource,
    pub level: SingboxLogLevel,
    pub message: String,
}

pub fn parse_singbox_log_level(line: &str) -> Option<SingboxLogLevel> {
    if line.is_empty() {
        return None;
    }
    let upper = line.to_ascii_uppercase();
    if upper.contains("PANIC[")
        || upper
            .split_whitespace()
            .any(|w| w == "PANIC" || w == "PANIC:")
    {
        return Some(SingboxLogLevel::Panic);
    }
    if upper.contains("FATAL[")
        || upper
            .split_whitespace()
            .any(|w| w == "FATAL" || w == "FATAL:")
    {
        return Some(SingboxLogLevel::Fatal);
    }
    if upper.contains("ERROR[")
        || upper
            .split_whitespace()
            .any(|w| w == "ERROR" || w == "ERROR:")
        || upper.contains("❌")
    {
        return Some(SingboxLogLevel::Error);
    }
    if upper.contains("WARN[")
        || upper.contains("WARNING[")
        || upper
            .split_whitespace()
            .any(|w| w == "WARN" || w == "WARN:" || w == "WARNING" || w == "WARNING:")
        || upper.contains("⚠️")
    {
        return Some(SingboxLogLevel::Warn);
    }
    if upper.contains("INFO[")
        || upper
            .split_whitespace()
            .any(|w| w == "INFO" || w == "INFO:")
    {
        return Some(SingboxLogLevel::Info);
    }
    if upper.contains("DEBUG[")
        || upper
            .split_whitespace()
            .any(|w| w == "DEBUG" || w == "DEBUG:")
    {
        return Some(SingboxLogLevel::Debug);
    }
    if upper.contains("TRACE[")
        || upper
            .split_whitespace()
            .any(|w| w == "TRACE" || w == "TRACE:")
    {
        return Some(SingboxLogLevel::Trace);
    }
    None
}

/// Level stored on a log entry. Lines without a recognizable level are info.
fn log_level_for(line: &str) -> SingboxLogLevel {
    parse_singbox_log_level(line).unwrap_or(SingboxLogLevel::Info)
}

pub fn should_record_singbox_line(
    line: &str,
    configured_level: SingboxLogLevel,
    disabled: bool,
) -> bool {
    if disabled {
        return false;
    }
    if let Some(lvl) = parse_singbox_log_level(line) {
        lvl >= configured_level
    } else if is_actual_singbox_error(line) {
        true
    } else {
        configured_level <= SingboxLogLevel::Info
    }
}

pub async fn append_to_file(path: &Path, line: &str) {
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    if let Ok(metadata) = tokio::fs::metadata(path).await
        && metadata.len() > 5 * 1024 * 1024
    {
        let rotated = path.with_extension("log.1");
        let _ = tokio::fs::rename(path, rotated).await;
    }
    if let Ok(mut file) = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
    {
        use tokio::io::AsyncWriteExt;
        let _ = file.write_all(format!("{line}\n").as_bytes()).await;
    }
}

/// Wait for sing-box to create its configured log file, then seek to EOF.
/// Anything already in the file belongs to a previous run and is not replayed.
async fn open_log_file_for_tailing(path: &Path) -> Option<tokio::fs::File> {
    for _ in 0..100 {
        if let Ok(mut file) = tokio::fs::File::open(path).await {
            let _ = file.seek(SeekFrom::End(0)).await;
            return Some(file);
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    }
    None
}

/// Shared state and configuration for the sing-box log-file tailer.
struct LogTailerContext {
    logs: Arc<RwLock<VecDeque<LogEntry>>>,
    last_error: Arc<RwLock<Option<String>>>,
    ready: Arc<RwLock<bool>>,
    is_running_child: Arc<RwLock<Option<tokio::process::Child>>>,
    subout_log_file: PathBuf,
    min_level: SingboxLogLevel,
    is_disabled: bool,
}

/// Read newly appended lines from an already-positioned file into the shared
/// log buffer. Shared with tests so they can drive a deterministic file fixture.
async fn tail_log_file(file: tokio::fs::File, ctx: LogTailerContext) {
    let mut reader = BufReader::new(file);
    let mut line_buf = String::new();
    loop {
        let still_running = {
            let mut c = ctx.is_running_child.write().await;
            if let Some(ref mut child) = *c {
                matches!(child.try_wait(), Ok(None))
            } else {
                false
            }
        };

        let mut read_any = false;
        loop {
            line_buf.clear();
            match reader.read_line(&mut line_buf).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    read_any = true;
                    let trimmed = line_buf.trim_end_matches(&['\r', '\n'][..]);
                    if !trimmed.is_empty() {
                        let clean = strip_ansi_codes(trimmed);
                        if is_actual_singbox_error(&clean) {
                            *ctx.last_error.write().await = Some(clean.clone());
                        } else {
                            let lower = clean.to_lowercase();
                            if lower.contains("sing-box started")
                                || lower.contains("server started at")
                                || lower.contains("started inbound")
                                || lower.contains(": started")
                                || lower.contains("router: started")
                                || lower.contains("dns: started")
                            {
                                *ctx.ready.write().await = true;
                            }
                        }

                        if should_record_singbox_line(&clean, ctx.min_level, ctx.is_disabled) {
                            let timestamp =
                                chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                            let formatted = format!("[{timestamp}] [sing-box] {clean}");
                            {
                                let mut l = ctx.logs.write().await;
                                if l.len() >= MAX_LOG_LINES {
                                    l.pop_front();
                                }
                                l.push_back(LogEntry {
                                    timestamp,
                                    source: LogSource::Singbox,
                                    level: log_level_for(&clean),
                                    message: clean.clone(),
                                });
                            }
                            append_to_file(&ctx.subout_log_file, &formatted).await;
                        }
                    }
                }
            }
        }

        if !still_running && !read_any {
            break;
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct ConflictingProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cmdline: Option<String>,
    pub exe_path: Option<String>,
}

const fn default_true() -> bool {
    true
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ServiceStatusInfo {
    pub running: bool,
    pub ready: bool,
    pub pid: Option<u32>,
    pub started_at: Option<u64>,
    pub uptime_secs: Option<u64>,
    pub last_error: Option<String>,
    pub binary_path: Option<String>,
    pub config_path: String,
    pub inbounds_summary: Option<String>,
    pub is_tun: bool,
    pub conflicting_processes: Vec<ConflictingProcessInfo>,
    pub log_level: Option<String>,
    #[serde(default)]
    pub log_disabled: bool,
    #[serde(default)]
    pub log_output: Option<String>,
    #[serde(default)]
    pub system_proxy_enabled: bool,
    #[serde(default)]
    pub system_proxy_active: bool,
    #[serde(default)]
    pub mixed_port: Option<u16>,
    #[serde(default = "default_true")]
    pub system_proxy_supported: bool,
    #[serde(default)]
    pub system_proxy_unsupported_reason: Option<String>,
    #[serde(default)]
    pub cpu_usage: f64,
    #[serde(default)]
    pub memory_bytes: u64,
    #[serde(default)]
    pub tun_interface: Option<String>,
    #[serde(default)]
    pub active_mode: Option<String>,
    #[serde(default)]
    pub running_config_id: Option<i64>,
}

type CachedResourceUsage = (std::time::Instant, u32, f64, u64);

pub struct SingBoxServiceManager {
    child: Arc<RwLock<Option<tokio::process::Child>>>,
    started_at: Arc<RwLock<Option<u64>>>,
    ready: Arc<RwLock<bool>>,
    last_error: Arc<RwLock<Option<String>>>,
    logs: Arc<RwLock<VecDeque<LogEntry>>>,
    saved_sudo_pass: Arc<RwLock<Option<String>>>,
    temp_sudo_pass: Arc<RwLock<Option<String>>>,
    cached_sudo_pass: Arc<RwLock<Option<String>>>,
    db_path: Arc<RwLock<Option<String>>>,
    current_log_level: Arc<RwLock<String>>,
    current_log_disabled: Arc<RwLock<bool>>,
    current_log_output: Arc<RwLock<Option<String>>>,
    system_proxy_active: Arc<RwLock<bool>>,
    cached_resource_usage: Arc<RwLock<Option<CachedResourceUsage>>>,
}

impl Default for SingBoxServiceManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SingBoxServiceManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(RwLock::new(None)),
            started_at: Arc::new(RwLock::new(None)),
            ready: Arc::new(RwLock::new(false)),
            last_error: Arc::new(RwLock::new(None)),
            logs: Arc::new(RwLock::new(VecDeque::<LogEntry>::with_capacity(
                MAX_LOG_LINES,
            ))),
            saved_sudo_pass: Arc::new(RwLock::new(None)),
            temp_sudo_pass: Arc::new(RwLock::new(None)),
            cached_sudo_pass: Arc::new(RwLock::new(None)),
            db_path: Arc::new(RwLock::new(None)),
            current_log_level: Arc::new(RwLock::new("info".to_string())),
            current_log_disabled: Arc::new(RwLock::new(false)),
            current_log_output: Arc::new(RwLock::new(None)),
            system_proxy_active: Arc::new(RwLock::new(false)),
            cached_resource_usage: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_db_path(&self, db_path: &str) {
        *self.db_path.write().await = Some(db_path.to_string());
    }

    pub async fn load_saved_sudo_pass(&self) {
        // Load permanent sudo password from database if configured
        if let Some(ref path) = *self.db_path.read().await
            && let Ok(conn) = rusqlite::Connection::open(path)
            && let Ok(Some(pass)) = crate::db::get_setting(&conn, "sudo_password")
        {
            let trimmed = pass.trim();
            if !trimmed.is_empty() {
                *self.saved_sudo_pass.write().await = Some(trimmed.to_string());
                *self.cached_sudo_pass.write().await = Some(trimmed.to_string());
            }
        }
    }

    pub async fn save_sudo_pass(&self, pass: &str) {
        let trimmed = pass.trim();
        if trimmed.is_empty() {
            self.clear_saved_sudo_pass().await;
            return;
        }
        *self.saved_sudo_pass.write().await = Some(trimmed.to_string());
        *self.cached_sudo_pass.write().await = Some(trimmed.to_string());
        if let Some(ref path) = *self.db_path.read().await
            && let Ok(conn) = rusqlite::Connection::open(path)
        {
            let _ = crate::db::update_setting(&conn, "sudo_password", trimmed);
        }
    }

    pub async fn clear_saved_sudo_pass(&self) {
        *self.saved_sudo_pass.write().await = None;
        *self.temp_sudo_pass.write().await = None;
        *self.cached_sudo_pass.write().await = None;
        if let Some(ref path) = *self.db_path.read().await
            && let Ok(conn) = rusqlite::Connection::open(path)
        {
            let _ = crate::db::delete_setting(&conn, "sudo_password");
        }
    }

    pub async fn has_saved_sudo_pass(&self) -> bool {
        self.saved_sudo_pass.read().await.is_some()
    }

    pub async fn has_temp_sudo_pass(&self) -> bool {
        self.temp_sudo_pass.read().await.is_some()
    }

    pub async fn set_temp_sudo_pass(&self, pass: &str) {
        let trimmed = pass.trim();
        if trimmed.is_empty() {
            *self.temp_sudo_pass.write().await = None;
        } else {
            *self.temp_sudo_pass.write().await = Some(trimmed.to_string());
            if self.saved_sudo_pass.read().await.is_none() {
                *self.cached_sudo_pass.write().await = Some(trimmed.to_string());
            }
        }
    }

    pub async fn get_effective_sudo_pass(&self) -> Option<String> {
        if let Some(ref p) = *self.saved_sudo_pass.read().await {
            return Some(p.clone());
        }
        if let Some(ref p) = *self.temp_sudo_pass.read().await {
            return Some(p.clone());
        }
        self.cached_sudo_pass.read().await.clone()
    }

    pub async fn validate_and_save_sudo_pass(&self, pass: &str) -> Result<()> {
        let trimmed = pass.trim();
        if trimmed.is_empty() {
            self.clear_saved_sudo_pass().await;
            return Ok(());
        }

        let platform = crate::platform::current_platform();
        if !platform.is_windows() && !platform.is_running_as_root() {
            platform
                .run_sudo_command("true", &[], Some(trimmed))
                .await
                .map_err(|e| anyhow!("Sudo 密码验证失败: {e}"))?;
        }

        self.save_sudo_pass(trimmed).await;
        Ok(())
    }

    pub fn get_running_config_path() -> PathBuf {
        crate::paths::AppPaths::get().running_config_path()
    }

    /// Append a subout runtime line to the bounded buffer and `subout.log`.
    /// The on-disk text format is kept identical to the previous plain-string version.
    async fn push_log(&self, level: SingboxLogLevel, message: &str) {
        let message = message.trim_end();
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        {
            let mut logs = self.logs.write().await;
            if logs.len() >= MAX_LOG_LINES {
                logs.pop_front();
            }
            logs.push_back(LogEntry {
                timestamp: timestamp.clone(),
                source: LogSource::Subout,
                level,
                message: message.to_string(),
            });
        }
        let formatted = format!("[{timestamp}] {message}");
        let log_file = crate::paths::AppPaths::get().log_dir.join("subout.log");
        append_to_file(&log_file, &formatted).await;
    }

    pub async fn append_log(&self, line: &str) {
        self.push_log(log_level_for(line), line).await;
    }

    /// Return the most recent `limit` entries, oldest of those first.
    pub async fn get_logs(&self, limit: usize) -> Vec<LogEntry> {
        let limit = limit.clamp(1, MAX_LOG_LINES);
        let logs = self.logs.read().await;
        logs.iter()
            .skip(logs.len().saturating_sub(limit))
            .cloned()
            .collect()
    }

    pub async fn clear_logs(&self) {
        {
            let mut logs = self.logs.write().await;
            logs.clear();
        }
        let log_dir = crate::paths::AppPaths::get().log_dir.clone();
        let _ = tokio::fs::remove_file(log_dir.join("subout.log")).await;
        let _ = tokio::fs::remove_file(log_dir.join("subout.log.1")).await;
    }

    pub async fn is_running(&self) -> bool {
        let mut child_guard = self.child.write().await;
        if let Some(ref mut child) = *child_guard {
            if let Ok(None) = child.try_wait() {
                true
            } else {
                *child_guard = None;
                false
            }
        } else {
            false
        }
    }

    pub async fn get_managed_pid(&self) -> Option<u32> {
        let mut child_guard = self.child.write().await;
        if let Some(ref mut child) = *child_guard {
            if let Ok(None) = child.try_wait() {
                child.id()
            } else {
                *child_guard = None;
                None
            }
        } else {
            None
        }
    }

    pub async fn find_external_singbox_processes(&self) -> Vec<ConflictingProcessInfo> {
        let managed_pid = self.get_managed_pid().await;
        detect_conflicting_singbox_processes(managed_pid)
    }

    /// 诊断接管冲突。`config_override` 传数据库的当前配置时，资源占用检测基于它
    /// 而不是磁盘上的运行配置文件——后者可能已过期（用户改了配置但未重启服务），
    /// 据此检测会一直报告已不存在的端口冲突。传 None 时回退读文件。
    pub async fn diagnose_takeover_conflict(
        &self,
        config_override: Option<&Value>,
    ) -> Result<crate::platform::TakeoverDiagnoseResult> {
        let managed_pid = self.get_managed_pid().await;
        let platform = crate::platform::current_platform();
        // 进程归属过滤与资源占用检测共用同一个配置路径来源。
        let config_path = Self::get_running_config_path();
        let mut result = platform
            .diagnose_takeover_conflict(managed_pid, &config_path)
            .await?;

        // 合并通用资源占用诊断（端口/TUN/DNS/路由）。
        // 按实际占用判定、不硬编码工具名；这些冲突一律不可一键接管，防止误杀组网工具。
        let resource_conflicts = platform
            .detect_resource_conflicts(&config_path, managed_pid, config_override)
            .await;
        if !resource_conflicts.is_empty() {
            let summary = format_resource_conflicts_summary(&resource_conflicts);
            if result.has_conflict {
                // 已有外部 sing-box 冲突：保留可接管语义，附加资源占用信息
                result.details = format!("{}\n\n{summary}", result.details);
                result.resource_conflicts = resource_conflicts;
            } else {
                // 无 sing-box 冲突、仅有资源占用：标记为冲突但禁止一键接管
                let first_type = resource_conflict_type_label(&resource_conflicts[0].kind);
                result.has_conflict = true;
                result.conflict_type = Some(first_type.to_string());
                result.conflict_name = Some("外部程序占用 sing-box 所需资源".to_string());
                result.message =
                    "检测到系统中的其他程序占用了 sing-box 运行所需的网络资源。".to_string();
                result.details = summary;
                result.pids = resource_conflicts
                    .iter()
                    .filter_map(|c| c.holder_pid)
                    .collect();
                result.can_auto_takeover = false;
                result.auto_takeover_allowed = false;
                result.suggestion = Some(
                    "Subout 不会自动修改配置或关闭这些程序。请按占用者信息自行关闭相关程序，或在配置中改用其他端口/网卡。".to_string(),
                );
                result.suggestion_command =
                    Some(resource_conflict_hint_command(&resource_conflicts));
                result.resource_conflicts = resource_conflicts;
            }
        }
        Ok(result)
    }

    pub async fn get_status(&self) -> ServiceStatusInfo {
        let (is_run, pid) = {
            let mut child_guard = self.child.write().await;
            if let Some(ref mut child) = *child_guard {
                match child.try_wait() {
                    Ok(None) => (true, child.id()),
                    Ok(Some(status)) => {
                        *child_guard = None;
                        *self.ready.write().await = false;
                        *self.started_at.write().await = None;
                        if self.last_error.read().await.is_none() && !status.success() {
                            *self.last_error.write().await =
                                Some(format!("sing-box 核心进程已退出 ({status})"));
                        }
                        (false, None)
                    }
                    Err(e) => {
                        *child_guard = None;
                        *self.ready.write().await = false;
                        *self.started_at.write().await = None;
                        if self.last_error.read().await.is_none() {
                            *self.last_error.write().await =
                                Some(format!("检测 sing-box 进程状态异常: {e}"));
                        }
                        (false, None)
                    }
                }
            } else {
                (false, None)
            }
        };

        let started_at = if is_run {
            *self.started_at.read().await
        } else {
            None
        };

        let uptime_secs = if let Some(start) = started_at {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            Some(now.saturating_sub(start))
        } else {
            None
        };

        let is_ready = if is_run {
            let r = *self.ready.read().await;
            if r {
                true
            } else if let Some(up) = uptime_secs {
                if up >= 1 {
                    *self.ready.write().await = true;
                    true
                } else {
                    false
                }
            } else {
                true
            }
        } else {
            false
        };

        let last_error = if is_run {
            None
        } else {
            self.last_error.read().await.clone()
        };

        let binary_path = kernel::get_singbox_executable().map(|p| p.to_string_lossy().to_string());
        let running_config_path_buf = Self::get_running_config_path();
        let config_path = running_config_path_buf.to_string_lossy().to_string();
        let inbounds_summary = get_inbounds_summary_from_config(&running_config_path_buf);
        let running_config_content = std::fs::read_to_string(&running_config_path_buf).ok();
        let config_json = running_config_content
            .as_deref()
            .and_then(|s| serde_json::from_str::<Value>(s).ok());
        let is_tun = if is_run {
            config_json.as_ref().is_some_and(is_tun_mode)
        } else if let Some(db_path) = self.db_path.read().await.as_deref()
            && let Ok(conn) = rusqlite::Connection::open(db_path)
        {
            is_tun_for_active_mode(&conn)
        } else {
            config_json.as_ref().is_some_and(is_tun_mode)
        };
        let conflicting_processes = detect_conflicting_singbox_processes(pid);

        let (log_level, log_disabled, log_output) = if is_run {
            (
                Some(self.current_log_level.read().await.clone()),
                *self.current_log_disabled.read().await,
                self.current_log_output.read().await.clone(),
            )
        } else if let Some(ref c) = config_json {
            let level = c
                .get("log")
                .and_then(|l| l.get("level"))
                .and_then(|lv| lv.as_str())
                .map(str::to_lowercase);
            let disabled = c
                .get("log")
                .and_then(|l| l.get("disabled"))
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);
            let output = c
                .get("log")
                .and_then(|l| l.get("output"))
                .and_then(|o| o.as_str())
                .map(std::string::ToString::to_string);
            (level.or(Some("info".to_string())), disabled, output)
        } else if let Some(db_path) = self.db_path.read().await.as_deref()
            && let Ok(conn) = rusqlite::Connection::open(db_path)
        {
            let mode = crate::db::get_setting(&conn, "app_mode")
                .unwrap_or(None)
                .unwrap_or_else(|| "simple".to_string());
            if mode == "simple" {
                let simple_cfg = crate::simple_config::get_saved_simple_config(&conn);
                (
                    Some(simple_cfg.log.level),
                    simple_cfg.log.disabled,
                    if simple_cfg.log.output.trim().is_empty() {
                        None
                    } else {
                        Some(simple_cfg.log.output)
                    },
                )
            } else {
                let running_id_str = crate::db::get_setting(&conn, "running_config_id")
                    .unwrap_or(None)
                    .unwrap_or_default();
                if let Ok(id) = running_id_str.parse::<i64>() {
                    let parsed_content =
                        if let Ok(Some(prof)) = crate::db::get_config_profile_by_id(&conn, id) {
                            serde_json::from_str::<Value>(&prof.content).ok()
                        } else if let Ok(Some(history)) =
                            crate::db::get_config_history_detail(&conn, id)
                            && let Some(content_str) = history.content
                        {
                            serde_json::from_str::<Value>(&content_str).ok()
                        } else {
                            None
                        };

                    if let Some(c) = parsed_content {
                        let level = c
                            .get("log")
                            .and_then(|l| l.get("level"))
                            .and_then(|lv| lv.as_str())
                            .map(str::to_lowercase);
                        let disabled = c
                            .get("log")
                            .and_then(|l| l.get("disabled"))
                            .and_then(serde_json::Value::as_bool)
                            .unwrap_or(false);
                        let output = c
                            .get("log")
                            .and_then(|l| l.get("output"))
                            .and_then(|o| o.as_str())
                            .map(std::string::ToString::to_string);
                        (level.or(Some("info".to_string())), disabled, output)
                    } else if let Ok(Some(log_str)) =
                        crate::db::get_base_config_section(&conn, "log")
                        && let Ok(c) = serde_json::from_str::<Value>(&log_str)
                    {
                        let level = c
                            .get("level")
                            .and_then(|lv| lv.as_str())
                            .map(str::to_lowercase);
                        let disabled = c
                            .get("disabled")
                            .and_then(serde_json::Value::as_bool)
                            .unwrap_or(false);
                        let output = c
                            .get("output")
                            .and_then(|o| o.as_str())
                            .map(std::string::ToString::to_string);
                        (level.or(Some("info".to_string())), disabled, output)
                    } else {
                        (Some("info".to_string()), false, None)
                    }
                } else if let Ok(Some(log_str)) = crate::db::get_base_config_section(&conn, "log")
                    && let Ok(c) = serde_json::from_str::<Value>(&log_str)
                {
                    let level = c
                        .get("level")
                        .and_then(|lv| lv.as_str())
                        .map(str::to_lowercase);
                    let disabled = c
                        .get("disabled")
                        .and_then(serde_json::Value::as_bool)
                        .unwrap_or(false);
                    let output = c
                        .get("output")
                        .and_then(|o| o.as_str())
                        .map(std::string::ToString::to_string);
                    (level.or(Some("info".to_string())), disabled, output)
                } else {
                    (Some("info".to_string()), false, None)
                }
            }
        } else {
            (Some("info".to_string()), false, None)
        };

        let db_path_opt = self.db_path.read().await.clone();
        let system_proxy_active = *self.system_proxy_active.read().await;
        let system_proxy_enabled = if let Some(ref path) = db_path_opt
            && let Ok(conn) = rusqlite::Connection::open(path)
            && let Ok(Some(val)) = crate::db::get_setting(&conn, "system_proxy_enabled")
        {
            val == "true"
        } else {
            false
        };

        let mixed_port = config_json
            .as_ref()
            .and_then(get_mixed_port_from_config)
            .or_else(|| {
                if let Some(ref path) = db_path_opt
                    && let Ok(conn) = rusqlite::Connection::open(path)
                {
                    get_mixed_port_for_active_mode(&conn)
                } else {
                    None
                }
            });

        let platform = crate::platform::current_platform();
        let system_proxy_supported = platform.is_system_proxy_supported();
        let system_proxy_unsupported_reason = platform.system_proxy_unsupported_reason();

        let (cpu_usage, memory_bytes) = if is_run && let Some(p) = pid {
            let mut cache_guard = self.cached_resource_usage.write().await;
            if let Some((instant, cached_pid, cpu, mem)) = *cache_guard
                && cached_pid == p
                && instant.elapsed() < std::time::Duration::from_millis(2000)
            {
                (cpu, mem)
            } else {
                let usage = platform.get_process_resource_usage(p);
                *cache_guard = Some((std::time::Instant::now(), p, usage.0, usage.1));
                usage
            }
        } else {
            (0.0, 0)
        };

        let tun_interface = if is_tun {
            config_json
                .as_ref()
                .and_then(|c| {
                    c.get("inbounds")
                        .and_then(|i| i.as_array())
                        .and_then(|arr| {
                            arr.iter()
                                .find(|inb| inb.get("type").and_then(|t| t.as_str()) == Some("tun"))
                        })
                        .and_then(|tun| tun.get("interface_name"))
                        .and_then(|n| n.as_str())
                        .filter(|s| !s.is_empty())
                        .map(ToString::to_string)
                })
                .or_else(|| {
                    let name = platform.default_tun_interface_name();
                    if name.is_empty() {
                        None
                    } else {
                        Some(name.to_string())
                    }
                })
        } else {
            None
        };

        let (active_mode, running_config_id) = if let Some(ref path) = db_path_opt
            && let Ok(conn) = rusqlite::Connection::open(path)
        {
            let mode = crate::db::get_setting(&conn, "app_mode")
                .unwrap_or(None)
                .unwrap_or_else(|| "simple".to_string());
            let rc_id = crate::db::get_setting(&conn, "running_config_id")
                .unwrap_or(None)
                .and_then(|s| s.parse::<i64>().ok());
            (Some(mode), rc_id)
        } else {
            (Some("simple".to_string()), None)
        };

        ServiceStatusInfo {
            running: is_run,
            ready: is_ready,
            pid,
            started_at,
            uptime_secs,
            last_error,
            binary_path,
            config_path,
            inbounds_summary,
            is_tun,
            conflicting_processes,
            log_level,
            log_disabled,
            log_output,
            system_proxy_enabled,
            system_proxy_active,
            mixed_port,
            system_proxy_supported,
            system_proxy_unsupported_reason,
            cpu_usage,
            memory_bytes,
            tun_interface,
            active_mode,
            running_config_id,
        }
    }

    pub async fn is_system_proxy_active(&self) -> bool {
        *self.system_proxy_active.read().await
    }

    pub async fn set_system_proxy(&self, enable: bool) -> Result<()> {
        let platform = crate::platform::current_platform();
        let cached_pass = self.cached_sudo_pass.read().await.clone();
        let is_running = self.is_running().await;
        let db_path_opt = self.db_path.read().await.clone();

        if enable {
            let running_config_path_buf = Self::get_running_config_path();
            let config_json = std::fs::read_to_string(&running_config_path_buf)
                .ok()
                .and_then(|s| serde_json::from_str::<Value>(&s).ok());
            let port = config_json
                .as_ref()
                .and_then(get_mixed_port_from_config)
                .or_else(|| {
                    if let Some(ref path) = db_path_opt
                        && let Ok(conn) = rusqlite::Connection::open(path)
                    {
                        get_mixed_port_for_active_mode(&conn)
                    } else {
                        None
                    }
                });

            let Some(port) = port else {
                return Err(anyhow!(
                    "当前配置未包含混合/HTTP/SOCKS入站端口 (mixed/http/socks)，无法设置为系统代理"
                ));
            };

            if is_running {
                if platform.is_system_proxy_supported() {
                    platform.enable_system_proxy(port, cached_pass.as_deref());
                    *self.system_proxy_active.write().await = true;
                    self.append_log(&format!("🌐 已设置系统网络代理 (127.0.0.1:{port})"))
                        .await;
                } else {
                    *self.system_proxy_active.write().await = false;
                    let reason = platform
                        .system_proxy_unsupported_reason()
                        .unwrap_or_else(|| "当前操作系统环境不支持自动设置系统代理".to_string());
                    self.append_log(&format!("⚠️ {reason}")).await;
                    return Err(anyhow!("{reason}"));
                }
            } else {
                *self.system_proxy_active.write().await = false;
            }
        } else {
            platform.disable_system_proxy(cached_pass.as_deref());
            *self.system_proxy_active.write().await = false;
            if is_running {
                self.append_log("🌐 已关闭系统网络代理").await;
            }
        }

        // 只在所有校验与实际操作都成功后才持久化开关，避免失败调用
        // （如无可用端口、平台不支持）污染 get_status() 显示的状态。
        if let Some(ref path) = db_path_opt
            && let Ok(conn) = rusqlite::Connection::open(path)
        {
            let _ = crate::db::update_setting(
                &conn,
                "system_proxy_enabled",
                if enable { "true" } else { "false" },
            );
        }

        Ok(())
    }

    pub async fn start(&self, config_json: &Value) -> Result<()> {
        self.start_with_options(config_json, None, false, None)
            .await
    }

    pub async fn start_with_sudo(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
    ) -> Result<()> {
        self.start_with_options(config_json, sudo_pass, false, None)
            .await
    }

    pub async fn takeover_and_start(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
    ) -> Result<()> {
        self.start_with_options(config_json, sudo_pass, true, None)
            .await
    }

    pub async fn takeover_external_processes(&self, sudo_pass: Option<&str>) -> Result<()> {
        let platform = crate::platform::current_platform();
        let conflicts = self.find_external_singbox_processes().await;
        if conflicts.is_empty() {
            if !self.is_running().await {
                platform.disable_system_proxy(sudo_pass);
                platform.cleanup_tun_network(sudo_pass);
                *self.system_proxy_active.write().await = false;
            }
            return Ok(());
        }

        self.append_log(&format!(
            "正在执行一键接管，正在终止/禁用外部 sing-box 进程 (共 {} 个)...",
            conflicts.len()
        ))
        .await;

        for proc in conflicts {
            self.kill_external_process(proc.pid, sudo_pass).await?;
        }

        let remaining = self.find_external_singbox_processes().await;
        if !remaining.is_empty() {
            let pids: Vec<String> = remaining.iter().map(|c| c.pid.to_string()).collect();
            let msg = format!(
                "接管未完全成功：仍有外部 sing-box 进程在运行 (PID: {})",
                pids.join(", ")
            );
            self.append_log(&format!("❌ {msg}")).await;
            return Err(anyhow!(msg));
        }

        // Network Safety Guard: if Subout is not running a proxy service, clear
        // leftover system proxy / TUN routes so orphaned settings cannot break
        // connectivity. Host DNS is never touched by the application.
        let is_running = self.is_running().await;
        if !is_running {
            platform.disable_system_proxy(sudo_pass);
            platform.cleanup_tun_network(sudo_pass);
            *self.system_proxy_active.write().await = false;
            self.append_log("🌐 已恢复系统直连网络与 TUN 路由，保障网络连接不中断")
                .await;
        }

        self.append_log("🟢 已成功平滑接管外部服务并释放端口").await;
        Ok(())
    }

    pub async fn start_with_sudo_and_takeover(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
        takeover: bool,
    ) -> Result<()> {
        self.start_with_options(config_json, sudo_pass, takeover, None)
            .await
    }

    pub async fn start_with_options(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
        takeover: bool,
        enable_system_proxy: Option<bool>,
    ) -> Result<()> {
        let singbox_bin = kernel::get_singbox_executable()
            .ok_or_else(|| anyhow!("未找到 sing-box 可执行文件，请先在面板下载集成内核"))?;

        let explicit_pass = sudo_pass.and_then(|p| {
            let trimmed = p.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        if let Some(ref p) = explicit_pass {
            self.set_temp_sudo_pass(p).await;
        }

        // 1. Stop any existing Subout-managed processes and lingering instances first
        self.stop().await?;

        // 2. Handle conflicting external sing-box processes
        //    安全约束：takeover 仅针对"外部 sing-box 进程"（见 detect_conflicting_processes），
        //    绝不把端口/TUN 反查到的组网工具（节点小宝/ZeroTier 等）加入杀进程列表——
        //    那是用户正常使用的网络工具，只能提示，不能终止。
        if takeover {
            self.takeover_external_processes(sudo_pass).await?;
        } else {
            let conflicts = self.find_external_singbox_processes().await;
            if !conflicts.is_empty() {
                let pids: Vec<String> = conflicts.iter().map(|c| c.pid.to_string()).collect();
                let details = conflicts
                    .iter()
                    .map(|c| {
                        format!(
                            "PID: {} ({})",
                            c.pid,
                            c.cmdline.as_deref().unwrap_or(&c.name)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("; ");
                let err_msg = format!(
                    "检测到系统中已有外部独立的 sing-box 服务正在运行 [{}]。请先在系统终端中关闭现有外部服务（如 sudo systemctl stop sing-box && sudo systemctl disable sing-box 或 kill {}），或点击【一键接管】由 Subout 托管启动服务。",
                    details,
                    pids.join(" ")
                );
                self.append_log(&format!("❌ {err_msg}")).await;
                *self.last_error.write().await = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
        }

        // 2.5 提前探测入站端口，避免 sing-box 加载完规则集后才因端口占用 FATAL
        //     （此时 API 早已返回成功，前端无从感知崩溃）。
        if let Err(e) = check_inbound_ports_available(config_json) {
            self.append_log(&format!("❌ {e}")).await;
            *self.last_error.write().await = Some(e.to_string());
            return Err(e);
        }

        // Reject dangling http_client references before spawning sing-box. Otherwise
        // rule-set initialization fails asynchronously and the user is told the
        // service started successfully until a later status poll notices the crash.
        let hc_errs = crate::schema_validator::validate_http_client_references(config_json);
        if !hc_errs.is_empty() {
            let e = anyhow!("配置校验失败: {}", hc_errs.join("；"));
            self.append_log(&format!("❌ {e}")).await;
            *self.last_error.write().await = Some(e.to_string());
            return Err(e);
        }

        let paths = crate::paths::AppPaths::get();
        paths
            .ensure_dirs()
            .map_err(|e| anyhow!("启动服务前目录校验失败: {e}"))?;

        let log_disabled = config_json
            .get("log")
            .and_then(|l| l.get("disabled"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);

        let configured_level_str = config_json
            .get("log")
            .and_then(|l| l.get("level"))
            .and_then(|lv| lv.as_str())
            .unwrap_or("info");
        let configured_level =
            SingboxLogLevel::parse(configured_level_str).unwrap_or(SingboxLogLevel::Info);

        let log_output_file: Option<PathBuf> = config_json
            .get("log")
            .and_then(|l| l.get("output"))
            .and_then(|o| o.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| {
                let path = PathBuf::from(s);
                if path.is_absolute() {
                    path
                } else {
                    paths.log_dir.join(path)
                }
            });

        if let Some(ref out_path) = log_output_file
            && let Some(parent) = out_path.parent()
        {
            let _ = std::fs::create_dir_all(parent);
        }

        let mut final_config_json = config_json.clone();
        if let Some(ref out_path) = log_output_file
            && let Some(log_obj) = final_config_json
                .get_mut("log")
                .and_then(|l| l.as_object_mut())
        {
            log_obj.insert(
                "output".to_string(),
                serde_json::json!(out_path.to_string_lossy()),
            );
        }

        let config_path = Self::get_running_config_path();
        if let Some(parent) = config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let config_str = serde_json::to_string_pretty(&final_config_json)?;

        // 3. Write config file
        std::fs::write(&config_path, &config_str)
            .map_err(|e| anyhow!("写入 sing-box 运行配置文件失败: {e}"))?;

        let tun_mode = is_tun_mode(&final_config_json);
        let as_root = is_running_as_root();

        let explicit_pass = sudo_pass.and_then(|p| {
            let trimmed = p.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        if let Some(ref p) = explicit_pass {
            self.save_sudo_pass(p).await;
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        let effective_sudo_pass = explicit_pass.or(cached_pass);
        let has_sudo_pass = effective_sudo_pass.is_some();
        let platform = crate::platform::current_platform();

        let use_sudo = !platform.is_windows() && !as_root && has_sudo_pass && tun_mode;

        if use_sudo {
            self.append_log(&format!(
                "正在使用 Sudo 提权启动 sing-box 服务 (TUN 模式: {}, 内核: {})...",
                tun_mode,
                singbox_bin.display()
            ))
            .await;
        } else {
            self.append_log(&format!(
                "正在启动 sing-box 服务 (TUN 模式: {}, root: {}, 内核: {})...",
                tun_mode,
                as_root,
                singbox_bin.display()
            ))
            .await;
        }

        let data_dir = paths.data_dir.clone();
        let abs_data_dir = std::fs::canonicalize(&data_dir).unwrap_or_else(|_| {
            if data_dir.is_absolute() {
                data_dir.clone()
            } else if let Ok(cwd) = std::env::current_dir() {
                cwd.join(&data_dir)
            } else {
                data_dir.clone()
            }
        });

        let abs_config_path = std::fs::canonicalize(&config_path).unwrap_or_else(|_| {
            if config_path.is_absolute() {
                config_path.clone()
            } else if let Ok(cwd) = std::env::current_dir() {
                cwd.join(&config_path)
            } else {
                config_path.clone()
            }
        });

        let mut cmd = if use_sudo {
            let mut c = tokio::process::Command::new("sudo");
            c.arg("-S")
                .arg("-k")
                .arg("-p")
                .arg("")
                .arg("--")
                .arg(&singbox_bin)
                .arg("-D")
                .arg(&abs_data_dir)
                .arg("run")
                .arg("-c")
                .arg(&abs_config_path);
            c.stdin(Stdio::piped());
            c
        } else {
            let mut c = tokio::process::Command::new(&singbox_bin);
            c.arg("-D")
                .arg(&abs_data_dir)
                .arg("run")
                .arg("-c")
                .arg(&abs_config_path);
            c
        };

        cmd.env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
            .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true")
            .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        cmd.kill_on_drop(true);

        platform.setup_child_process(&mut cmd);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("启动 sing-box 进程失败: {e}");
                self.append_log(&format!("❌ {err_msg}")).await;
                *self.last_error.write().await = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
        };

        if use_sudo
            && let Some(ref pass) = effective_sudo_pass
            && let Some(mut stdin) = child.stdin.take()
        {
            use tokio::io::AsyncWriteExt;
            let pass_bytes = format!("{pass}\n");
            let _ = stdin.write_all(pass_bytes.as_bytes()).await;
            let _ = stdin.flush().await;
            drop(stdin); // Explicitly close stdin to prevent sudo from waiting for more input
        }

        let pid = child.id();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        *self.started_at.write().await = Some(now);
        *self.ready.write().await = false;
        *self.last_error.write().await = None;
        *self.current_log_level.write().await = configured_level.as_str().to_string();
        *self.current_log_disabled.write().await = log_disabled;
        *self.current_log_output.write().await = log_output_file
            .as_ref()
            .map(|p| p.to_string_lossy().to_string());

        let min_level = configured_level;
        let is_disabled = log_disabled;
        let subout_log_path = paths.log_dir.join("subout.log");

        // Pipe stdout
        if let Some(stdout) = child.stdout.take() {
            let logs_clone = self.logs.clone();
            let last_error_clone = self.last_error.clone();
            let ready_clone = self.ready.clone();
            let subout_log_file = subout_log_path.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let clean = strip_ansi_codes(&line);
                    if is_actual_singbox_error(&clean) {
                        *last_error_clone.write().await = Some(clean.clone());
                    } else {
                        let lower = clean.to_lowercase();
                        if lower.contains("sing-box started")
                            || lower.contains("server started at")
                            || lower.contains("started inbound")
                            || lower.contains(": started")
                            || lower.contains("router: started")
                            || lower.contains("dns: started")
                        {
                            *ready_clone.write().await = true;
                        }
                    }

                    if should_record_singbox_line(&clean, min_level, is_disabled) {
                        let timestamp =
                            chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                        let formatted = format!("[{timestamp}] [sing-box] {clean}");
                        {
                            let mut l = logs_clone.write().await;
                            if l.len() >= MAX_LOG_LINES {
                                l.pop_front();
                            }
                            l.push_back(LogEntry {
                                timestamp,
                                source: LogSource::Singbox,
                                level: log_level_for(&clean),
                                message: clean.clone(),
                            });
                        }
                        append_to_file(&subout_log_file, &formatted).await;
                    }
                }
            });
        }

        // Pipe stderr (sing-box sends its standard formatted console logs to stderr)
        if let Some(stderr) = child.stderr.take() {
            let logs_clone = self.logs.clone();
            let last_error_clone = self.last_error.clone();
            let ready_clone = self.ready.clone();
            let subout_log_file = subout_log_path.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let clean = strip_ansi_codes(&line);
                    if is_actual_singbox_error(&clean) {
                        *last_error_clone.write().await = Some(clean.clone());
                    } else {
                        let lower = clean.to_lowercase();
                        if lower.contains("sing-box started")
                            || lower.contains("server started at")
                            || lower.contains("started inbound")
                            || lower.contains(": started")
                            || lower.contains("router: started")
                            || lower.contains("dns: started")
                        {
                            *ready_clone.write().await = true;
                        }
                    }

                    if should_record_singbox_line(&clean, min_level, is_disabled) {
                        let timestamp =
                            chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                        let formatted = format!("[{timestamp}] [sing-box] {clean}");
                        {
                            let mut l = logs_clone.write().await;
                            if l.len() >= MAX_LOG_LINES {
                                l.pop_front();
                            }
                            l.push_back(LogEntry {
                                timestamp,
                                source: LogSource::Singbox,
                                level: log_level_for(&clean),
                                message: clean.clone(),
                            });
                        }
                        append_to_file(&subout_log_file, &formatted).await;
                    }
                }
            });
        }

        // Pipe log file if configured in sing-box config
        if let Some(output_path) = log_output_file {
            let logs_clone = self.logs.clone();
            let last_error_clone = self.last_error.clone();
            let ready_clone = self.ready.clone();
            let is_running_child = self.child.clone();
            let subout_log_file = subout_log_path.clone();
            tokio::spawn(async move {
                if let Some(file) = open_log_file_for_tailing(&output_path).await {
                    tail_log_file(
                        file,
                        LogTailerContext {
                            logs: logs_clone,
                            last_error: last_error_clone,
                            ready: ready_clone,
                            is_running_child,
                            subout_log_file,
                            min_level,
                            is_disabled,
                        },
                    )
                    .await;
                }
            });
        }

        *self.child.write().await = Some(child);

        // Wait up to 3000ms for sing-box to initialize and report ready or exit
        let mut started_ready = false;
        for _ in 0..60 {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            if !self.is_running().await {
                break;
            }
            if *self.ready.read().await {
                started_ready = true;
                break;
            }
        }

        if self.is_running().await {
            *self.ready.write().await = true;
            started_ready = true;
        }

        if !self.is_running().await {
            let err = self
                .last_error
                .read()
                .await
                .clone()
                .unwrap_or_else(|| "sing-box 启动后立即退出，请检查配置或核心日志".to_string());
            let err_upper = err.to_uppercase();
            if err_upper.contains("INCORRECT PASSWORD")
                || err_upper.contains("AUTHENTICATION FAILURE")
                || err_upper.contains("SORRY, TRY AGAIN")
                || err_upper.contains("1 INCORRECT PASSWORD ATTEMPT")
                || err_upper.contains("A PASSWORD IS REQUIRED")
            {
                self.clear_saved_sudo_pass().await;
                let guide =
                    "Sudo 密码不正确或已失效，请重新输入系统管理员密码进行授权。".to_string();
                self.append_log(&format!("❌ {guide}")).await;
                *self.last_error.write().await = Some(guide.clone());
                return Err(anyhow!(guide));
            }

            let is_permission_err = err_upper.contains("TUNSETIFF")
                || err_upper.contains("OPERATION NOT PERMITTED")
                || err_upper.contains("PERMISSION DENIED")
                || err_upper.contains("WINTUN")
                || err_upper.contains("ACCESS IS DENIED")
                || err_upper.contains("REQUIRES ROOT")
                || err_upper.contains("REQUIRE ROOT")
                || err_upper.contains("MUST BE ROOT");

            if is_permission_err && !as_root && !has_sudo_pass {
                let guide = platform.tun_permission_error_guide(&err, &singbox_bin);
                self.append_log(&format!("❌ {guide}")).await;
                *self.last_error.write().await = Some(guide.clone());
                return Err(anyhow!(guide));
            }
            self.append_log(&format!("❌ sing-box 启动失败: {err}"))
                .await;
            *self.last_error.write().await = Some(err.clone());
            return Err(anyhow!("sing-box 启动异常: {err}"));
        }

        if let Some(ref p) = effective_sudo_pass {
            self.save_sudo_pass(p).await;
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();

        // 显式系统代理控制：必须由用户显式开启，绝不在启动时隐式强制设置
        let system_proxy_enabled = if let Some(val) = enable_system_proxy {
            if let Some(ref path) = *self.db_path.read().await
                && let Ok(conn) = rusqlite::Connection::open(path)
            {
                let _ = crate::db::update_setting(
                    &conn,
                    "system_proxy_enabled",
                    if val { "true" } else { "false" },
                );
            }
            val
        } else if let Some(ref path) = *self.db_path.read().await
            && let Ok(conn) = rusqlite::Connection::open(path)
            && let Ok(Some(val)) = crate::db::get_setting(&conn, "system_proxy_enabled")
        {
            val == "true"
        } else {
            false
        };

        if system_proxy_enabled {
            if let Some(port) = get_mixed_port_from_config(config_json) {
                if platform.is_system_proxy_supported() {
                    platform.enable_system_proxy(port, cached_pass.as_deref());
                    *self.system_proxy_active.write().await = true;
                    self.append_log(&format!("🌐 已设置系统网络代理 (127.0.0.1:{port})"))
                        .await;
                } else if let Some(reason) = platform.system_proxy_unsupported_reason() {
                    *self.system_proxy_active.write().await = false;
                    self.append_log(&format!("⚠️ {reason}")).await;
                }
            } else {
                *self.system_proxy_active.write().await = false;
                self.append_log(
                    "⚠️ 已勾选系统代理，但当前配置未包含混合/HTTP/SOCKS入站端口，未设置系统代理",
                )
                .await;
            }
        } else {
            *self.system_proxy_active.write().await = false;
        }
        if tun_mode {
            // System DNS integration is sing-box's responsibility (TUN inbound
            // plus dns/route rules in the user's config). The application never
            // rewrites host resolver settings, so there is nothing to restore.
            self.append_log("🌐 TUN 模式已启动，系统 DNS 分流由 sing-box 配置负责")
                .await;
        }

        let summary = get_inbounds_summary_from_config(&config_path);
        if let Some(s) = summary {
            self.append_log(&format!(
                "🟢 sing-box 服务已就绪并开始运行 (PID: {pid:?}, 入站: {s})"
            ))
            .await;
        } else if started_ready {
            self.append_log(&format!("🟢 sing-box 服务已就绪并开始运行 (PID: {pid:?})"))
                .await;
        } else {
            self.append_log(&format!("🟢 sing-box 进程已拉起 (PID: {pid:?})"))
                .await;
        }

        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        let mut child_guard = self.child.write().await;
        let mut had_child = false;
        let mut pid_opt = None;
        let platform = crate::platform::current_platform();

        if let Some(mut child) = child_guard.take() {
            had_child = true;
            pid_opt = child.id();
            self.append_log("正在停止 sing-box 服务...").await;

            let cached_pass = self.cached_sudo_pass.read().await.clone();

            // 1. 发送优雅终止信号 SIGTERM (15)，给 sing-box 充足时间清理 TUN 网卡、系统路由表与 DNS
            if let Some(pid) = pid_opt {
                platform.kill_process(pid, cached_pass.as_deref(), 15).await;
            }

            // 2. 轮询检查子进程退出状态（最多等待 4000ms，每 50ms 检查一次）
            // 进程一旦正常退出立即返回，不浪费任何时间
            let mut exited = false;
            let wait_timeout = std::time::Duration::from_millis(4000);
            let start_time = std::time::Instant::now();

            while start_time.elapsed() < wait_timeout {
                match child.try_wait() {
                    Ok(Some(_status)) => {
                        exited = true;
                        break;
                    }
                    Ok(None) => {
                        if let Some(pid) = pid_opt
                            && !platform.is_pid_alive(pid)
                        {
                            exited = true;
                            break;
                        }
                    }
                    Err(_) => {
                        exited = true;
                        break;
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            }

            // 3. 超时兜底：若 4 秒后仍未退出，升级为 SIGKILL 强行终止
            if !exited {
                self.append_log("⚠️ sing-box 未能在超时时间内正常退出，正在强制终止进程...")
                    .await;
                if let Some(pid) = pid_opt {
                    platform.kill_process(pid, cached_pass.as_deref(), 9).await;
                }
                let _ = child.start_kill();
                let _ =
                    tokio::time::timeout(std::time::Duration::from_millis(300), child.wait()).await;
            }
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        // Clean up any lingering Subout sing-box / sudo child processes
        platform
            .kill_all_subout_processes(
                cached_pass.as_deref(),
                pid_opt,
                &Self::get_running_config_path(),
            )
            .await;

        platform.disable_system_proxy(cached_pass.as_deref());
        platform.cleanup_tun_network(cached_pass.as_deref());
        *self.system_proxy_active.write().await = false;
        self.append_log("🌐 已恢复系统原始网络代理与 TUN 路由设置")
            .await;

        if had_child {
            self.append_log("⏹️ sing-box 服务已停止").await;
        }

        *self.started_at.write().await = None;
        *self.ready.write().await = false;
        *self.last_error.write().await = None;
        *self.cached_resource_usage.write().await = None;
        Ok(())
    }

    pub async fn kill_external_process(&self, pid: u32, sudo_pass: Option<&str>) -> Result<()> {
        let current_pid = std::process::id();
        if pid == current_pid || pid <= 1 {
            return Err(anyhow!("无法终止受保护的系统进程 (PID: {pid})"));
        }

        let platform = crate::platform::current_platform();

        if !platform.is_pid_alive(pid) {
            self.append_log(&format!("外部进程 (PID: {pid}) 已不再运行"))
                .await;
            return Ok(());
        }

        self.append_log(&format!("正在请求终止外部 sing-box 进程 (PID: {pid})..."))
            .await;

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        let pass_clean = sudo_pass
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(std::string::ToString::to_string)
            .or(cached_pass);

        if let Err(e) = platform
            .stop_external_service_or_process(pid, pass_clean.as_deref())
            .await
        {
            if e.to_string().contains("Sudo 密码不正确") {
                self.clear_saved_sudo_pass().await;
            }
            self.append_log(&format!("❌ 终止外部进程失败: {e}")).await;
            return Err(e);
        }

        // Cache the verified sudo password in memory immediately
        if let Some(ref pass) = pass_clean {
            self.save_sudo_pass(pass).await;
        }

        // Verify whether the process has terminated (allow up to 2.5s for graceful teardown)
        let mut is_dead = false;
        let running_config_path = Self::get_running_config_path();
        let managed_pid = self.get_managed_pid().await;
        for _ in 0..25 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if !platform.is_pid_alive(pid) {
                is_dead = true;
                break;
            }
            let conflicts =
                platform.detect_conflicting_processes(managed_pid, &running_config_path);
            if !conflicts.iter().any(|c| c.pid == pid) {
                is_dead = true;
                break;
            }
        }

        if !is_dead {
            let msg = platform.external_process_stop_failed_message(pid, pass_clean.is_some());
            self.append_log(&format!("❌ {msg}")).await;
            return Err(anyhow!(msg));
        }

        self.append_log(&format!("🟢 已成功终止外部 sing-box 进程 (PID: {pid})"))
            .await;
        Ok(())
    }

    pub async fn restart(&self, config_json: &Value) -> Result<()> {
        self.restart_with_sudo(config_json, None).await
    }

    pub async fn restart_with_sudo(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
    ) -> Result<()> {
        self.restart_with_sudo_and_takeover(config_json, sudo_pass, false)
            .await
    }

    pub async fn restart_with_sudo_and_takeover(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
        takeover: bool,
    ) -> Result<()> {
        self.restart_with_options(config_json, sudo_pass, takeover, None)
            .await
    }

    pub async fn restart_with_options(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
        takeover: bool,
        enable_system_proxy: Option<bool>,
    ) -> Result<()> {
        self.stop().await?;
        self.start_with_options(config_json, sudo_pass, takeover, enable_system_proxy)
            .await
    }
}

pub fn is_running_as_root() -> bool {
    crate::platform::current_platform().is_running_as_root()
}

pub fn is_tun_mode(config_json: &Value) -> bool {
    if let Some(inbounds) = config_json.get("inbounds").and_then(|v| v.as_array()) {
        for inb in inbounds {
            if inb.get("type").and_then(|t| t.as_str()) == Some("tun") {
                return true;
            }
        }
    }
    false
}

pub async fn kill_all_subout_singbox_processes(
    cached_sudo_pass: Option<&str>,
    exclude_pid: Option<u32>,
) {
    crate::platform::current_platform()
        .kill_all_subout_processes(
            cached_sudo_pass,
            exclude_pid,
            &SingBoxServiceManager::get_running_config_path(),
        )
        .await;
}

pub fn detect_conflicting_singbox_processes(
    managed_pid: Option<u32>,
) -> Vec<ConflictingProcessInfo> {
    crate::platform::current_platform().detect_conflicting_processes(
        managed_pid,
        &SingBoxServiceManager::get_running_config_path(),
    )
}

pub fn get_inbounds_summary_from_config(config_path: &std::path::Path) -> Option<String> {
    if let Ok(content) = std::fs::read_to_string(config_path)
        && let Ok(json_val) = serde_json::from_str::<Value>(&content)
        && let Some(inbounds) = json_val.get("inbounds").and_then(|v| v.as_array())
    {
        let mut summaries = Vec::new();
        for inb in inbounds {
            let inb_type = inb.get("type").and_then(|t| t.as_str()).unwrap_or("mixed");
            match inb_type {
                "tun" => {
                    let iface = inb
                        .get("interface_name")
                        .and_then(|i| i.as_str())
                        .unwrap_or("");
                    if iface.is_empty() {
                        summaries.push("TUN".to_string());
                    } else {
                        summaries.push(format!("TUN ({iface})"));
                    }
                }
                "mixed" => {
                    let listen = inb
                        .get("listen")
                        .and_then(|l| l.as_str())
                        .unwrap_or("127.0.0.1");
                    let port = inb
                        .get("listen_port")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(2080);
                    summaries.push(format!("{listen}:{port} (混合代理)"));
                }
                "http" => {
                    let port = inb
                        .get("listen_port")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(8080);
                    summaries.push(format!("HTTP :{port}"));
                }
                "socks" => {
                    let port = inb
                        .get("listen_port")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or(1080);
                    summaries.push(format!("SOCKS5 :{port}"));
                }
                other => {
                    summaries.push(format!("入站 ({other})"));
                }
            }
        }
        if !summaries.is_empty() {
            return Some(summaries.join(", "));
        }
    }
    None
}

pub fn is_pid_alive(pid: u32) -> bool {
    crate::platform::current_platform().is_pid_alive(pid)
}

pub async fn run_sudo_command(
    cmd_name: &str,
    args: &[&str],
    sudo_pass: Option<&str>,
) -> Result<()> {
    crate::platform::current_platform()
        .run_sudo_command(cmd_name, args, sudo_pass)
        .await
}

pub fn is_tun_for_active_mode(conn: &rusqlite::Connection) -> bool {
    let mode = crate::db::get_setting(conn, "app_mode")
        .unwrap_or(None)
        .unwrap_or_else(|| "simple".to_string());
    if mode == "simple" {
        let simple_cfg = crate::simple_config::get_saved_simple_config(conn);
        simple_cfg.inbound.inbound_type == "tun"
    } else {
        let running_id_str = crate::db::get_setting(conn, "running_config_id")
            .unwrap_or(None)
            .unwrap_or_default();
        if let Ok(id) = running_id_str.parse::<i64>() {
            let parsed_content =
                if let Ok(Some(prof)) = crate::db::get_config_profile_by_id(conn, id) {
                    serde_json::from_str::<Value>(&prof.content).ok()
                } else if let Ok(Some(history)) = crate::db::get_config_history_detail(conn, id)
                    && let Some(content_str) = history.content
                {
                    serde_json::from_str::<Value>(&content_str).ok()
                } else {
                    None
                };
            if let Some(c) = parsed_content {
                return is_tun_mode(&c);
            }
        }
        if let Ok(Some(inbounds_str)) = crate::db::get_base_config_section(conn, "inbounds")
            && let Ok(inbounds_val) = serde_json::from_str::<Value>(&inbounds_str)
        {
            let dummy = serde_json::json!({ "inbounds": inbounds_val });
            is_tun_mode(&dummy)
        } else {
            false
        }
    }
}

pub fn get_mixed_port_for_active_mode(conn: &rusqlite::Connection) -> Option<u16> {
    let mode = crate::db::get_setting(conn, "app_mode")
        .unwrap_or(None)
        .unwrap_or_else(|| "simple".to_string());
    if mode == "simple" {
        let simple_cfg = crate::simple_config::get_saved_simple_config(conn);
        // 小白模式始终提供混合代理端口供系统代理使用
        Some(simple_cfg.inbound.mixed_port)
    } else {
        let running_id_str = crate::db::get_setting(conn, "running_config_id")
            .unwrap_or(None)
            .unwrap_or_default();
        if let Ok(id) = running_id_str.parse::<i64>() {
            let parsed_content =
                if let Ok(Some(prof)) = crate::db::get_config_profile_by_id(conn, id) {
                    serde_json::from_str::<Value>(&prof.content).ok()
                } else if let Ok(Some(history)) = crate::db::get_config_history_detail(conn, id)
                    && let Some(content_str) = history.content
                {
                    serde_json::from_str::<Value>(&content_str).ok()
                } else {
                    None
                };
            if let Some(c) = parsed_content {
                return get_mixed_port_from_config(&c);
            }
        }
        if let Ok(Some(inbounds_str)) = crate::db::get_base_config_section(conn, "inbounds")
            && let Ok(inbounds_val) = serde_json::from_str::<Value>(&inbounds_str)
        {
            let dummy = serde_json::json!({ "inbounds": inbounds_val });
            get_mixed_port_from_config(&dummy)
        } else {
            None
        }
    }
}

pub fn get_mixed_port_from_config(config: &Value) -> Option<u16> {
    if let Some(inbounds) = config.get("inbounds").and_then(|i| i.as_array()) {
        for inbound in inbounds {
            let inbound_type = inbound.get("type").and_then(|t| t.as_str());
            if matches!(inbound_type, Some("mixed" | "http" | "socks"))
                && let Some(port) = inbound
                    .get("listen_port")
                    .and_then(serde_json::Value::as_u64)
            {
                return Some(port as u16);
            }
        }
    }
    None
}

/// 在 spawn sing-box 之前探测配置里所有 TCP 入站端口是否可用。
/// 端口被占用时立即报错：API 会返回错误从而触发前端 toast，
/// 而不是等 sing-box 加载完规则集后才 FATAL 崩溃、前端却毫不知情。
pub fn check_inbound_ports_available(config: &Value) -> Result<()> {
    let Some(inbounds) = config.get("inbounds").and_then(|i| i.as_array()) else {
        return Ok(());
    };
    for inbound in inbounds {
        let Some(port) = inbound
            .get("listen_port")
            .and_then(serde_json::Value::as_u64)
        else {
            continue; // tun 等无明显 TCP 端口的入站
        };
        let port = port as u16;
        let listen = inbound
            .get("listen")
            .and_then(|l| l.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("0.0.0.0");

        match std::net::TcpListener::bind((listen, port)) {
            Ok(listener) => drop(listener),
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
                // 尝试反查真实占用者并点名（best-effort，失败则给出自查命令）
                let holder_desc = describe_port_holder(port);
                return Err(anyhow!(
                    "入站端口 {listen}:{port} 已被占用，sing-box 无法启动。{holder_desc}请自行关闭占用程序或修改配置中的监听端口（Subout 不会自动更改你的配置）。"
                ));
            }
            Err(e) => {
                return Err(anyhow!("入站地址 {listen}:{port} 不可用: {e}"));
            }
        }
    }
    Ok(())
}

/// 将资源占用类别映射为冲突类型标识（与前端约定）。
pub fn resource_conflict_type_label(kind: &crate::platform::ResourceConflictKind) -> &'static str {
    use crate::platform::ResourceConflictKind;
    match kind {
        ResourceConflictKind::Port => "port_occupied_by_external",
        ResourceConflictKind::TunInterface => "tun_interface_occupied",
        ResourceConflictKind::Dns => "dns_takeover",
        ResourceConflictKind::PolicyRoute => "policy_route_conflict",
    }
}

/// 数据模型里的展示名称。
fn resource_kind_display(kind: &crate::platform::ResourceConflictKind) -> &'static str {
    use crate::platform::ResourceConflictKind;
    match kind {
        ResourceConflictKind::Port => "端口",
        ResourceConflictKind::TunInterface => "TUN 网卡",
        ResourceConflictKind::Dns => "DNS",
        ResourceConflictKind::PolicyRoute => "策略路由",
    }
}

/// 生成占用列表的可读摘要，用于诊断横幅的 details。
pub fn format_resource_conflicts_summary(
    conflicts: &[crate::platform::ResourceHolderInfo],
) -> String {
    let mut lines = Vec::new();
    for c in conflicts {
        let holder = match (&c.holder_name, c.holder_pid) {
            (Some(n), Some(pid)) => match &c.holder_cmdline {
                Some(cmd) => format!("{n} (PID {pid})，命令：{cmd}"),
                None => format!("{n} (PID {pid})"),
            },
            (Some(n), None) => n.clone(),
            (None, Some(pid)) => format!("PID {pid}"),
            (None, None) => "占用者未知（请用下方命令自查）".to_string(),
        };
        lines.push(format!(
            "· {} {} 被占用：{}（依据：{}）",
            resource_kind_display(&c.kind),
            c.resource,
            holder,
            c.evidence
        ));
    }
    format!("检测到以下网络资源被其他程序占用：\n{}", lines.join("\n"))
}

/// 生成一键复制的排障命令（汇总去重）。命令按当前平台给出，避免把 Linux 命令显示给 Windows/macOS 用户。
pub fn resource_conflict_hint_command(conflicts: &[crate::platform::ResourceHolderInfo]) -> String {
    use std::collections::BTreeSet;
    // 排障命令随平台而异：统一通过平台策略生成，避免硬编码 ss/ip 命令
    let mut cmds = BTreeSet::new();
    for c in conflicts {
        if c.kind == crate::platform::ResourceConflictKind::Port
            && let Some(port) = c
                .resource
                .rsplit(':')
                .next()
                .and_then(|p| p.parse::<u16>().ok())
        {
            cmds.insert(crate::platform::current_platform().port_probe_command(port));
        }
    }
    if cmds.is_empty() {
        crate::platform::current_platform().port_probe_command(0)
    } else {
        cmds.into_iter().collect::<Vec<_>>().join("\n")
    }
}

/// 反查占用指定端口的进程，生成用于错误提示的中文描述。
/// 统一委托给平台策略：Linux 读 /proc、macOS 用 lsof、Windows 用 netstat。
/// 不硬编码任何工具名——谁占用就报谁的真实进程名/PID/命令行。
pub fn describe_port_holder(port: u16) -> String {
    let platform = crate::platform::current_platform();
    if let Some(desc) = platform.describe_port_holder(port) {
        return desc;
    }
    // 平台无法反查时降级为自查命令
    format!("可用 `{}` 查看占用者；", platform.port_probe_command(port))
}

pub fn get_tun_dns_ip_from_config(config: &Value) -> Option<String> {
    if let Some(inbounds) = config.get("inbounds").and_then(|i| i.as_array()) {
        for inbound in inbounds {
            if inbound.get("type").and_then(|t| t.as_str()) == Some("tun") {
                // 1. Explicit dns_address takes highest priority
                if let Some(dns_addrs) = inbound.get("dns_address").and_then(|a| a.as_array()) {
                    for addr in dns_addrs {
                        if let Some(s) = addr.as_str()
                            && !s.contains(':')
                        {
                            let ip = s.split('/').next().unwrap_or(s);
                            return Some(ip.to_string());
                        }
                    }
                }
                // 2. According to sing-box tun inbound specification:
                // When dns_address is unset, the next address after the first IPv4 entry in address is used
                if let Some(addrs) = inbound.get("address").and_then(|a| a.as_array()) {
                    for addr in addrs {
                        if let Some(s) = addr.as_str()
                            && !s.contains(':')
                        {
                            let ip_str = s.split('/').next().unwrap_or(s);
                            if let Ok(ip) = ip_str.parse::<std::net::Ipv4Addr>() {
                                let next_ip =
                                    std::net::Ipv4Addr::from(u32::from(ip).saturating_add(1));
                                return Some(next_ip.to_string());
                            }
                            return Some(ip_str.to_string());
                        }
                    }
                }
                return Some("172.19.0.2".to_string());
            }
        }
    }
    None
}

pub fn get_tun_ip_from_config(config: &Value) -> Option<String> {
    get_tun_dns_ip_from_config(config)
}

pub fn strip_ansi_codes(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b'
            && let Some(&'[') = chars.peek()
        {
            chars.next(); // consume '['
            while let Some(&next_c) = chars.peek() {
                chars.next();
                if next_c.is_ascii_alphabetic() || next_c == '@' {
                    break;
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

pub fn is_actual_singbox_error(line: &str) -> bool {
    let upper = line.to_uppercase();

    // 1. Exclude all runtime proxy traffic / connection level error logs
    // These are normal network events during proxy operation, NOT core service crashes/failures.
    if upper.contains("CONNECTION:")
        || upper.contains("CONNECT: CONNECTION REFUSED")
        || upper.contains("CONNECT: NETWORK IS UNREACHABLE")
        || upper.contains("CONNECT: HOST IS DOWN")
        || upper.contains("CONNECT: NO ROUTE TO HOST")
        || upper.contains("DIAL TCP")
        || upper.contains("DIAL UDP")
        || upper.contains("I/O TIMEOUT")
        || upper.contains("IO TIMEOUT")
        || upper.contains("DEADLINE EXCEEDED")
        || upper.contains("CONNECTION RESET")
        || upper.contains("BROKEN PIPE")
        || upper.contains("HANDSHAKE FAILED")
        || upper.contains("EXCHANGE FAILED")
        || upper.contains("ROUTER: MATCH")
        || upper.contains("OUTBOUND/")
        || upper.contains("DID NOT CLOSED PROPERLY")
    {
        return false;
    }

    // 2. Fatal engine crashes, panics, configuration decode errors, and permission failures
    if upper.contains("FATAL")
        || upper.contains("PANIC")
        || upper.contains("ADDRESS ALREADY IN USE")
        || upper.contains("FAILED TO BIND")
        || upper.contains("OPERATION NOT PERMITTED")
        || upper.contains("PERMISSION DENIED")
        || upper.contains("TUNSETIFF")
        || upper.contains("ACCESS IS DENIED")
        || upper.contains("BAD TUN NAME")
        || upper.contains("INCORRECT PASSWORD")
        || upper.contains("AUTHENTICATION FAILURE")
        || upper.contains("A PASSWORD IS REQUIRED")
        || upper.contains("SORRY, TRY AGAIN")
        || upper.contains("CREATE SERVICE:")
        || upper.contains("START SERVICE:")
        || upper.contains("INVALID CONFIGURATION")
        || upper.contains("DECODE CONFIG")
    {
        return true;
    }

    // 3. Inbound server failure to listen / bind
    if upper.contains("INBOUND/")
        && (upper.contains("FAILED TO BIND")
            || upper.contains("BIND:")
            || upper.contains("LISTEN TCP")
            || upper.contains("LISTEN UDP"))
    {
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_inbound_ports_available_detects_occupied_port() {
        // 临时占用一个端口，验证预检能识别出"已被占用"
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        let occupied = serde_json::json!({
            "inbounds": [
                { "type": "mixed", "listen": "127.0.0.1", "listen_port": port }
            ]
        });
        let err = check_inbound_ports_available(&occupied).unwrap_err();
        assert!(
            err.to_string().contains(&format!("{port}")),
            "错误应包含被占用端口: {err}"
        );

        drop(listener);

        // 用一个新分配的空闲端口验证"未被占用时可通过"。
        // 重试数次规避并行测试竞争：分配后立即释放再检查，任一成功即可。
        let mut passed = false;
        for _ in 0..8 {
            let free = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let free_port = free.local_addr().unwrap().port();
            drop(free);
            let free_config = serde_json::json!({
                "inbounds": [
                    { "type": "mixed", "listen": "127.0.0.1", "listen_port": free_port }
                ]
            });
            if check_inbound_ports_available(&free_config).is_ok() {
                passed = true;
                break;
            }
        }
        assert!(passed, "释放后的端口应能通过预检");
    }

    #[test]
    fn test_check_inbound_ports_available_ignores_tun_and_empty_config() {
        // tun 入站没有 listen_port，不应被预检误判
        let tun = serde_json::json!({
            "inbounds": [ { "type": "tun", "address": ["10.0.0.1/30"] } ]
        });
        assert!(check_inbound_ports_available(&tun).is_ok());
        assert!(check_inbound_ports_available(&serde_json::json!({})).is_ok());
    }

    #[test]
    fn test_resource_conflict_summary_and_hint() {
        use crate::platform::{ResourceConflictKind, ResourceHolderInfo};
        let conflicts = vec![
            ResourceHolderInfo {
                kind: ResourceConflictKind::Port,
                resource: "127.0.0.1:2080".to_string(),
                holder_pid: Some(1234),
                holder_name: Some("NodeBabyLinkService".to_string()),
                holder_cmdline: Some("./NodeBabyLinkService --peerid abc".to_string()),
                evidence: "/proc/net/tcp inode:11111".to_string(),
            },
            ResourceHolderInfo {
                kind: ResourceConflictKind::TunInterface,
                resource: "tun0".to_string(),
                holder_pid: None,
                holder_name: None,
                holder_cmdline: None,
                evidence: "ip -d link show".to_string(),
            },
        ];
        let summary = format_resource_conflicts_summary(&conflicts);
        assert!(
            summary.contains("NodeBabyLinkService"),
            "应点名真实占用进程: {summary}"
        );
        assert!(
            summary.contains("127.0.0.1:2080"),
            "应含资源标识: {summary}"
        );
        assert!(summary.contains("PID 1234"), "应含 PID: {summary}");
        assert_eq!(
            resource_conflict_type_label(&ResourceConflictKind::Port),
            "port_occupied_by_external"
        );
        let cmd = resource_conflict_hint_command(&conflicts);
        assert!(cmd.contains("2080"), "应给出端口自查命令: {cmd}");
        assert!(
            cmd.contains("ss -tlnp") || cmd.contains("lsof") || cmd.contains("netstat"),
            "应给出当前平台的端口自查命令: {cmd}"
        );
    }

    #[test]
    fn test_strip_ansi_codes() {
        let raw = "\x1b[36mINFO\x1b[0m network: updated default interface wlo1, index 3";
        let clean = strip_ansi_codes(raw);
        assert_eq!(
            clean,
            "INFO network: updated default interface wlo1, index 3"
        );

        let colored_warn = "\x1b[33mWARN\x1b[0m outbound/direct[direct]: failed";
        assert_eq!(
            strip_ansi_codes(colored_warn),
            "WARN outbound/direct[direct]: failed"
        );
    }

    #[test]
    fn test_is_actual_singbox_error() {
        // Normal INFO lines should NOT be treated as error
        assert!(!is_actual_singbox_error(
            "INFO network: updated default interface"
        ));
        assert!(!is_actual_singbox_error(
            "INFO router: dns rule action predefined rcode NOERROR"
        ));
        assert!(!is_actual_singbox_error("INFO sing-box started (1.10s)"));
        assert!(!is_actual_singbox_error(
            "INFO[0000] inbound/tun[tun-in]: started"
        ));

        // Runtime proxy connection errors must NOT be treated as core service errors
        assert!(!is_actual_singbox_error(
            "+0800 2026-08-31 18:15:48 ERROR [2133602452 1.14s] connection: open connection to 192.168.3.80:39459 using outbound/direct[direct]: dial tcp 192.168.3.80:39459: connect: connection refused"
        ));
        assert!(!is_actual_singbox_error(
            "ERROR [760202674 10ms] connection: open connection to 192.168.3.80:39459 using outbound/direct[direct]: dial tcp 192.168.3.80:39459: connect: connection refused"
        ));
        assert!(!is_actual_singbox_error(
            "ERROR outbound/proxy[hk-01]: dial tcp 1.2.3.4:443: i/o timeout"
        ));
        assert!(!is_actual_singbox_error(
            "ERROR inbound/mixed[mixed-in]: connection: read: connection reset by peer"
        ));
        assert!(!is_actual_singbox_error(
            "ERROR dns: exchange failed for google.com: i/o timeout"
        ));

        // Genuine fatal or errors
        assert!(is_actual_singbox_error(
            "FATAL[0000] create service: rule-set error"
        ));
        assert!(is_actual_singbox_error(
            "FATAL[0002] start service: start logger: open /var/log/sing-box.log: The network path was not found."
        ));
        assert!(is_actual_singbox_error(
            "FATAL[0001] start service: start inbound/tun[tun-in]: configure tun interface: Access is denied."
        ));
        assert!(is_actual_singbox_error(
            "ERROR inbound/mixed[mixed-in]: tcp server failed to bind: address already in use"
        ));
        assert!(is_actual_singbox_error("panic: runtime error"));
        assert!(is_actual_singbox_error("operation not permitted"));
        assert!(is_actual_singbox_error(
            "FATAL[0000] start service: start inbound/tun[tun-in]: configure tun interface: open tun: TUNSETIFF: operation not permitted"
        ));
        assert!(is_actual_singbox_error(
            "sudo: 1 incorrect password attempt"
        ));
        assert!(is_actual_singbox_error(
            "sudo: pam_authenticate: Authentication failure"
        ));
    }

    #[test]
    fn test_is_tun_mode_detection() {
        let tun_cfg = serde_json::json!({
            "inbounds": [
                { "type": "mixed", "listen_port": 2080 },
                { "type": "tun", "interface_name": "tun0" }
            ]
        });
        assert!(is_tun_mode(&tun_cfg));

        let mixed_cfg = serde_json::json!({
            "inbounds": [
                { "type": "mixed", "listen_port": 2080 }
            ]
        });
        assert!(!is_tun_mode(&mixed_cfg));
    }

    #[test]
    fn test_detect_conflicting_singbox_processes_excludes_self_and_managed() {
        let current_pid = std::process::id();
        let conflicts = detect_conflicting_singbox_processes(Some(current_pid));
        // Current test process must never be identified as an external conflict
        assert!(!conflicts.iter().any(|c| c.pid == current_pid));
        println!("Live detected conflicts in test: {conflicts:?}");
    }

    #[tokio::test]
    async fn test_detect_conflicts_excludes_child_and_grandchild_descendants() {
        #[cfg(unix)]
        {
            let mut child = std::process::Command::new("sh")
                .arg("-c")
                .arg("sh -c 'sleep 5'")
                .spawn()
                .expect("failed to spawn wrapper");
            let child_pid = child.id();

            // Give the subshell time to spawn the grandchild
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

            let conflicts = detect_conflicting_singbox_processes(Some(child_pid));
            assert!(
                !conflicts.iter().any(|c| c.pid == child_pid),
                "child must not be in conflicts"
            );

            let _ = child.kill();
            let _ = child.wait();
        }
    }

    #[tokio::test]
    async fn test_diagnose_takeover_conflict_with_managed_pid() {
        let mgr = SingBoxServiceManager::new();
        let diag = mgr
            .diagnose_takeover_conflict(None)
            .await
            .expect("diagnose should succeed");
        println!("Diagnose result without managed PID: {diag:?}");

        let p = crate::platform::current_platform();
        let running_config_path = SingBoxServiceManager::get_running_config_path();
        if let Some(&first_pid) = diag.pids.first() {
            let filtered = p.detect_conflicting_processes(Some(first_pid), &running_config_path);
            assert!(
                !filtered.iter().any(|c| c.pid == first_pid),
                "managed pid must be excluded"
            );
            let diag_managed = p
                .diagnose_takeover_conflict(Some(first_pid), &running_config_path)
                .await
                .unwrap();
            assert!(!diag_managed.pids.contains(&first_pid));
        }
    }

    #[test]
    fn test_service_status_info_serialization() {
        let status = ServiceStatusInfo {
            running: false,
            ready: false,
            pid: None,
            started_at: None,
            uptime_secs: None,
            last_error: None,
            binary_path: Some("/usr/bin/sing-box".to_string()),
            config_path: "/root/.config/subout/sing-box-running.json".to_string(),
            inbounds_summary: Some("127.0.0.1:2080 (混合代理)".to_string()),
            is_tun: false,
            conflicting_processes: vec![ConflictingProcessInfo {
                pid: 12345,
                name: "sing-box".to_string(),
                cmdline: Some("sing-box run -c /etc/sing-box/config.json".to_string()),
                exe_path: Some("/usr/bin/sing-box".to_string()),
            }],
            log_level: Some("warn".to_string()),
            log_disabled: false,
            log_output: Some("sing-box.log".to_string()),
            system_proxy_enabled: false,
            system_proxy_active: false,
            mixed_port: Some(2080),
            system_proxy_supported: true,
            system_proxy_unsupported_reason: None,
            cpu_usage: 1.5,
            memory_bytes: 31_457_280,
            tun_interface: Some("tun0".to_string()),
            active_mode: Some("simple".to_string()),
            running_config_id: None,
        };

        let json_val = serde_json::to_value(&status).unwrap();
        assert_eq!(json_val["cpu_usage"], 1.5);
        assert_eq!(json_val["memory_bytes"], 31_457_280);
        assert_eq!(json_val["tun_interface"], "tun0");
        assert_eq!(json_val["active_mode"], "simple");
        assert_eq!(json_val["conflicting_processes"][0]["pid"], 12345);
        assert_eq!(json_val["conflicting_processes"][0]["name"], "sing-box");
        assert_eq!(json_val["inbounds_summary"], "127.0.0.1:2080 (混合代理)");
        assert_eq!(json_val["log_level"], "warn");
        assert_eq!(json_val["log_disabled"], false);
        assert_eq!(json_val["log_output"], "sing-box.log");
        assert_eq!(json_val["system_proxy_enabled"], false);
        assert_eq!(json_val["system_proxy_active"], false);
        assert_eq!(json_val["mixed_port"], 2080);
        assert_eq!(json_val["system_proxy_supported"], true);
        assert!(json_val["system_proxy_unsupported_reason"].is_null());
    }

    #[test]
    fn test_parse_singbox_log_level() {
        assert_eq!(
            parse_singbox_log_level(
                "+0800 2026-09-02 23:55:23 INFO network: updated default interface"
            ),
            Some(SingboxLogLevel::Info)
        );
        assert_eq!(
            parse_singbox_log_level("2026-09-02 23:55:23 WARN dns: response latency 1500ms"),
            Some(SingboxLogLevel::Warn)
        );
        assert_eq!(
            parse_singbox_log_level("ERROR connection: handshake timeout"),
            Some(SingboxLogLevel::Error)
        );
        assert_eq!(
            parse_singbox_log_level("FATAL[0000] read config at nonexistent.json"),
            Some(SingboxLogLevel::Fatal)
        );
        assert_eq!(
            parse_singbox_log_level("PANIC: runtime memory error"),
            Some(SingboxLogLevel::Panic)
        );
        assert_eq!(
            parse_singbox_log_level("DEBUG inbound/mixed: accept connection"),
            Some(SingboxLogLevel::Debug)
        );
        assert_eq!(
            parse_singbox_log_level("TRACE router: evaluate rule"),
            Some(SingboxLogLevel::Trace)
        );
        assert_eq!(
            parse_singbox_log_level("🟢 sing-box 进程已拉起 (PID: 1234)"),
            None
        );
    }

    #[test]
    fn test_should_record_singbox_line() {
        let info_line = "+0800 2026-09-02 23:55:23 INFO inbound/mixed: server started";
        let warn_line = "+0800 2026-09-02 23:55:23 WARN dns: slow query";
        let error_line = "+0800 2026-09-02 23:55:23 ERROR dial tcp: connection refused";

        // When level is warn: info must not be recorded, warn and error must be recorded
        assert!(!should_record_singbox_line(
            info_line,
            SingboxLogLevel::Warn,
            false
        ));
        assert!(should_record_singbox_line(
            warn_line,
            SingboxLogLevel::Warn,
            false
        ));
        assert!(should_record_singbox_line(
            error_line,
            SingboxLogLevel::Warn,
            false
        ));

        // When level is error: info and warn must not be recorded, error must be recorded
        assert!(!should_record_singbox_line(
            info_line,
            SingboxLogLevel::Error,
            false
        ));
        assert!(!should_record_singbox_line(
            warn_line,
            SingboxLogLevel::Error,
            false
        ));
        assert!(should_record_singbox_line(
            error_line,
            SingboxLogLevel::Error,
            false
        ));

        // When level is info: all are recorded
        assert!(should_record_singbox_line(
            info_line,
            SingboxLogLevel::Info,
            false
        ));
        assert!(should_record_singbox_line(
            warn_line,
            SingboxLogLevel::Info,
            false
        ));
        assert!(should_record_singbox_line(
            error_line,
            SingboxLogLevel::Info,
            false
        ));

        // When disabled: none are recorded
        assert!(!should_record_singbox_line(
            info_line,
            SingboxLogLevel::Info,
            true
        ));
        assert!(!should_record_singbox_line(
            warn_line,
            SingboxLogLevel::Info,
            true
        ));
        assert!(!should_record_singbox_line(
            error_line,
            SingboxLogLevel::Info,
            true
        ));
    }

    #[tokio::test]
    async fn test_service_manager_get_status_does_not_deadlock() {
        let mgr = SingBoxServiceManager::new();
        let status = mgr.get_status().await;
        assert!(!status.running);
        assert!(!status.ready);
    }

    #[tokio::test]
    async fn test_sudo_password_permanent_and_temporary_lifecycle() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_file = std::env::temp_dir().join(format!("test_sudo_{unique_id}.db"));
        let db_path = db_file.to_string_lossy().to_string();

        let conn = crate::db::init_db(&db_path).unwrap();

        let mgr = SingBoxServiceManager::new();
        mgr.set_db_path(&db_path).await;

        assert!(!mgr.has_saved_sudo_pass().await);
        assert!(!mgr.has_temp_sudo_pass().await);

        // 1. Temporary authorization does NOT persist to DB
        mgr.set_temp_sudo_pass("temp_pass").await;
        assert!(mgr.has_temp_sudo_pass().await);
        assert!(!mgr.has_saved_sudo_pass().await);
        assert_eq!(
            mgr.get_effective_sudo_pass().await,
            Some("temp_pass".to_string())
        );
        assert_eq!(
            crate::db::get_setting(&conn, "sudo_password").unwrap(),
            None
        );

        // 2. Permanent authorization DOES persist to DB
        mgr.save_sudo_pass("permanent_secret").await;
        assert!(mgr.has_saved_sudo_pass().await);
        let saved_in_db = crate::db::get_setting(&conn, "sudo_password").unwrap();
        assert_eq!(saved_in_db, Some("permanent_secret".to_string()));
        assert_eq!(
            mgr.get_effective_sudo_pass().await,
            Some("permanent_secret".to_string())
        );

        // 3. New manager instance loads permanent sudo password from DB on startup
        let mgr2 = SingBoxServiceManager::new();
        mgr2.set_db_path(&db_path).await;
        mgr2.load_saved_sudo_pass().await;
        assert!(mgr2.has_saved_sudo_pass().await);
        assert_eq!(
            mgr2.get_effective_sudo_pass().await,
            Some("permanent_secret".to_string())
        );

        // 4. Clear permanent password purges from memory and DB
        mgr2.clear_saved_sudo_pass().await;
        assert!(!mgr2.has_saved_sudo_pass().await);
        assert_eq!(
            crate::db::get_setting(&conn, "sudo_password").unwrap(),
            None
        );

        let _ = std::fs::remove_file(&db_file);
    }

    #[test]
    fn test_is_pid_alive() {
        let current_pid = std::process::id();
        assert!(is_pid_alive(current_pid));
        assert!(!is_pid_alive(0));
        assert!(!is_pid_alive(1));
        assert!(!is_pid_alive(4_000_000_000));
        assert!(!is_pid_alive(u32::MAX));
    }

    #[tokio::test]
    async fn test_service_status_running_and_ready_logic() {
        let mgr = SingBoxServiceManager::new();
        // Initially stopped
        let st = mgr.get_status().await;
        assert!(!st.running);
        assert!(!st.ready);
        assert!(st.last_error.is_none());

        // Simulate log appending with connection refused error
        mgr.append_log("+0800 2026-08-31 18:15:48 ERROR [2133602452 1.14s] connection: open connection to 192.168.3.80:39459 using outbound/direct[direct]: dial tcp 192.168.3.80:39459: connect: connection refused").await;
        let logs = mgr.get_logs(300).await;
        assert_eq!(logs.len(), 1);
        assert!(logs[0].message.contains("connection refused"));
        assert_eq!(logs[0].source, LogSource::Subout);
        assert_eq!(logs[0].level, SingboxLogLevel::Error);

        // Status is still stopped and last_error is None (since runtime log isn't a fatal service crash)
        let st2 = mgr.get_status().await;
        assert!(!st2.running);
        assert!(st2.last_error.is_none());
    }

    #[tokio::test]
    async fn test_log_entries_source_level_clear_and_limit() {
        let mgr = SingBoxServiceManager::new();

        mgr.append_log("Service started").await;
        mgr.append_log("❌ failed to bind port").await;
        mgr.append_log("⚠️ slow upstream").await;

        let all = mgr.get_logs(300).await;
        assert_eq!(all.len(), 3);
        assert!(all.iter().all(|e| e.source == LogSource::Subout));
        assert_eq!(all[0].level, SingboxLogLevel::Info);
        assert_eq!(all[1].level, SingboxLogLevel::Error);
        assert_eq!(all[2].level, SingboxLogLevel::Warn);

        // A limit returns only the newest N entries, still oldest-of-those first.
        let last_two = mgr.get_logs(2).await;
        assert_eq!(last_two.len(), 2);
        assert_eq!(last_two[0].message, all[1].message);
        assert_eq!(last_two[1].message, all[2].message);
        // The limit is clamped to at least one entry.
        assert_eq!(mgr.get_logs(0).await.len(), 1);

        mgr.clear_logs().await;
        assert!(mgr.get_logs(300).await.is_empty());
    }

    #[tokio::test]
    async fn test_file_tailer_captures_logs_and_ready_signal() {
        use std::io::Write as _;

        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let log_file = std::env::temp_dir().join(format!("singbox_test_{unique_id}.log"));

        // A file left over from a previous run must not be replayed.
        std::fs::write(&log_file, "INFO[9999] stale line from previous run\n").unwrap();

        // Position the file exactly as production does, then append the fresh
        // lines before tailing. No sleep/scheduling dependency in the test.
        let file = open_log_file_for_tailing(&log_file).await.unwrap();
        std::fs::OpenOptions::new()
            .append(true)
            .open(&log_file)
            .unwrap()
            .write_all(b"INFO[0000] router: started\nINFO[0001] inbound/mixed: started\n")
            .unwrap();

        let logs = Arc::new(RwLock::new(VecDeque::<LogEntry>::with_capacity(
            MAX_LOG_LINES,
        )));
        let last_error = Arc::new(RwLock::new(None));
        let ready = Arc::new(RwLock::new(false));
        let child_lock: Arc<RwLock<Option<tokio::process::Child>>> = Arc::new(RwLock::new(None));

        tail_log_file(
            file,
            LogTailerContext {
                logs: logs.clone(),
                last_error: last_error.clone(),
                ready: ready.clone(),
                is_running_child: child_lock,
                subout_log_file: crate::paths::AppPaths::get().log_dir.join("subout.log"),
                min_level: SingboxLogLevel::Info,
                is_disabled: false,
            },
        )
        .await;

        let captured = logs.read().await;
        assert_eq!(
            captured.len(),
            2,
            "pre-existing file content must be skipped"
        );
        assert!(captured.iter().all(|e| !e.message.contains("stale line")));
        assert!(captured[0].message.contains("router: started"));
        assert!(captured[1].message.contains("inbound/mixed: started"));
        assert_eq!(captured[0].source, LogSource::Singbox);
        assert_eq!(captured[0].level, SingboxLogLevel::Info);
        assert!(*ready.read().await);
    }

    #[tokio::test]
    async fn test_takeover_external_processes_when_none_running() {
        let mgr = SingBoxServiceManager::new();
        let conflicts = mgr.find_external_singbox_processes().await;
        if conflicts.is_empty() {
            // Should succeed immediately without errors when no conflicting external processes exist
            let res = mgr.takeover_external_processes(None).await;
            assert!(res.is_ok());
        } else {
            // In a live environment with root-owned sing-box, unprivileged test won't kill it without sudo pass
            println!(
                "Live external sing-box detected in test environment ({} processes): {:?}",
                conflicts.len(),
                conflicts
            );
        }
    }

    #[tokio::test]
    async fn test_service_manager_stop_gracefully_when_not_started() {
        let mgr = SingBoxServiceManager::new();
        assert!(!mgr.is_running().await);
        let res = mgr.stop().await;
        assert!(res.is_ok());
        let st = mgr.get_status().await;
        assert!(!st.running);
        assert!(!st.ready);
        assert!(st.pid.is_none());
    }

    #[tokio::test]
    async fn test_system_proxy_setting_persistence_and_toggle() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_file = std::env::temp_dir().join(format!("test_proxy_{unique_id}.db"));
        let db_path = db_file.to_string_lossy().to_string();

        let _ = crate::db::init_db(&db_path).unwrap();

        let mgr = SingBoxServiceManager::new();
        mgr.set_db_path(&db_path).await;

        // Initially disabled
        let status = mgr.get_status().await;
        assert!(!status.system_proxy_enabled);
        assert!(!status.system_proxy_active);

        // 专业模式下无运行配置、base_config.inbounds 为空 -> 没有混合端口。
        // 注意：不能再用"磁盘上没有运行配置文件"来构造无端口场景——小白模式
        // 默认始终提供 mixed_port=2080（见 get_mixed_port_for_active_mode）。
        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            crate::db::update_setting(&conn, "app_mode", "expert").unwrap();
        }
        let err_res = mgr.set_system_proxy(true).await;
        assert!(err_res.is_err());
        // 失败调用不得污染持久化状态
        let status_after_err = mgr.get_status().await;
        assert!(!status_after_err.system_proxy_enabled);
        assert!(!status_after_err.system_proxy_active);

        // 切回小白模式并配置混合端口
        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            crate::db::update_setting(&conn, "app_mode", "simple").unwrap();
            let mut simple_cfg = crate::simple_config::get_saved_simple_config(&conn);
            simple_cfg.inbound.inbound_type = "mixed".to_string();
            simple_cfg.inbound.mixed_port = 7890;
            crate::simple_config::save_simple_config(&conn, &simple_cfg).unwrap();
        }

        // Now mixed port should be detected even while stopped
        let status = mgr.get_status().await;
        assert!(status.mixed_port.is_some());

        // Enable system proxy
        let res = mgr.set_system_proxy(true).await;
        assert!(res.is_ok());

        let status2 = mgr.get_status().await;
        assert!(status2.system_proxy_enabled);
        // Not running, so active is false (to prevent internet blackout)
        assert!(!status2.system_proxy_active);

        // Disable system proxy
        let res2 = mgr.set_system_proxy(false).await;
        assert!(res2.is_ok());
        let status3 = mgr.get_status().await;
        assert!(!status3.system_proxy_enabled);
        assert!(!status3.system_proxy_active);

        let _ = std::fs::remove_file(&db_file);
    }

    #[test]
    fn test_get_mixed_port_for_active_mode_in_tun_mode() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_file = std::env::temp_dir().join(format!("test_tun_port_{unique_id}.db"));
        let db_path = db_file.to_string_lossy().to_string();

        let _ = crate::db::init_db(&db_path).unwrap();
        let conn = rusqlite::Connection::open(&db_path).unwrap();

        // Default simple config is TUN mode -> mixed port is also provided for seamless system proxy compatibility
        let port = get_mixed_port_for_active_mode(&conn);
        assert_eq!(port, Some(2080));

        let _ = std::fs::remove_file(&db_file);
    }

    #[test]
    fn test_get_tun_dns_ip_from_config() {
        // 1. Explicit dns_address
        let explicit_dns = serde_json::json!({
            "inbounds": [
                {
                    "type": "tun",
                    "address": ["172.19.0.1/30"],
                    "dns_address": ["172.19.0.2"]
                }
            ]
        });
        assert_eq!(
            get_tun_dns_ip_from_config(&explicit_dns),
            Some("172.19.0.2".to_string())
        );

        // 2. Computed next IP from address
        let computed_dns = serde_json::json!({
            "inbounds": [
                {
                    "type": "tun",
                    "address": ["172.19.0.1/30"]
                }
            ]
        });
        assert_eq!(
            get_tun_dns_ip_from_config(&computed_dns),
            Some("172.19.0.2".to_string())
        );

        // 3. Custom subnet address
        let custom_subnet = serde_json::json!({
            "inbounds": [
                {
                    "type": "tun",
                    "address": ["10.0.0.1/24"]
                }
            ]
        });
        assert_eq!(
            get_tun_dns_ip_from_config(&custom_subnet),
            Some("10.0.0.2".to_string())
        );

        // 4. Inbound without tun
        let mixed_only = serde_json::json!({
            "inbounds": [
                {
                    "type": "mixed",
                    "listen_port": 2080
                }
            ]
        });
        assert_eq!(get_tun_dns_ip_from_config(&mixed_only), None);
    }
}
