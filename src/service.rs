use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::RwLock;

use crate::kernel;

const MAX_LOG_LINES: usize = 1000;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct ConflictingProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cmdline: Option<String>,
    pub exe_path: Option<String>,
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
    pub conflicting_processes: Vec<ConflictingProcessInfo>,
}

pub struct SingBoxServiceManager {
    child: Arc<RwLock<Option<tokio::process::Child>>>,
    started_at: Arc<RwLock<Option<u64>>>,
    ready: Arc<RwLock<bool>>,
    last_error: Arc<RwLock<Option<String>>>,
    logs: Arc<RwLock<VecDeque<String>>>,
    cached_sudo_pass: Arc<RwLock<Option<String>>>,
    db_path: Arc<RwLock<Option<String>>>,
}

impl SingBoxServiceManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(RwLock::new(None)),
            started_at: Arc::new(RwLock::new(None)),
            ready: Arc::new(RwLock::new(false)),
            last_error: Arc::new(RwLock::new(None)),
            logs: Arc::new(RwLock::new(VecDeque::with_capacity(MAX_LOG_LINES))),
            cached_sudo_pass: Arc::new(RwLock::new(None)),
            db_path: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_db_path(&self, db_path: &str) {
        *self.db_path.write().await = Some(db_path.to_string());
    }

    pub async fn load_saved_sudo_pass(&self) {
        if let Some(ref path) = *self.db_path.read().await {
            if let Ok(conn) = rusqlite::Connection::open(path) {
                if let Ok(Some(pass)) = crate::db::get_setting(&conn, "sudo_password") {
                    let trimmed = pass.trim();
                    if !trimmed.is_empty() {
                        *self.cached_sudo_pass.write().await = Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    pub async fn save_sudo_pass(&self, pass: &str) {
        let trimmed = pass.trim();
        if trimmed.is_empty() {
            self.clear_saved_sudo_pass().await;
            return;
        }
        *self.cached_sudo_pass.write().await = Some(trimmed.to_string());
        if let Some(ref path) = *self.db_path.read().await {
            if let Ok(conn) = rusqlite::Connection::open(path) {
                let _ = crate::db::update_setting(&conn, "sudo_password", trimmed);
            }
        }
    }

    pub async fn clear_saved_sudo_pass(&self) {
        *self.cached_sudo_pass.write().await = None;
        if let Some(ref path) = *self.db_path.read().await {
            if let Ok(conn) = rusqlite::Connection::open(path) {
                let _ = crate::db::delete_setting(&conn, "sudo_password");
            }
        }
    }

    pub async fn has_saved_sudo_pass(&self) -> bool {
        self.cached_sudo_pass.read().await.is_some()
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
                .map_err(|e| anyhow!("Sudo 密码验证失败: {}", e))?;
        }

        self.save_sudo_pass(trimmed).await;
        Ok(())
    }

    pub fn get_running_config_path() -> PathBuf {
        crate::paths::AppPaths::get().running_config_path()
    }

    pub async fn append_log(&self, line: &str) {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let formatted = format!("[{}] {}", timestamp, line.trim_end());
        let mut logs = self.logs.write().await;
        if logs.len() >= MAX_LOG_LINES {
            logs.pop_front();
        }
        logs.push_back(formatted);
    }

    pub async fn get_logs(&self) -> Vec<String> {
        let logs = self.logs.read().await;
        logs.iter().cloned().collect()
    }

    pub async fn clear_logs(&self) {
        let mut logs = self.logs.write().await;
        logs.clear();
    }

    pub async fn is_running(&self) -> bool {
        let mut child_guard = self.child.write().await;
        if let Some(ref mut child) = *child_guard {
            match child.try_wait() {
                Ok(None) => true,
                _ => {
                    *child_guard = None;
                    false
                }
            }
        } else {
            false
        }
    }

    pub async fn get_managed_pid(&self) -> Option<u32> {
        let mut child_guard = self.child.write().await;
        if let Some(ref mut child) = *child_guard {
            match child.try_wait() {
                Ok(None) => child.id(),
                _ => {
                    *child_guard = None;
                    None
                }
            }
        } else {
            None
        }
    }

    pub async fn find_external_singbox_processes(&self) -> Vec<ConflictingProcessInfo> {
        let managed_pid = self.get_managed_pid().await;
        detect_conflicting_singbox_processes(managed_pid)
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
                                Some(format!("sing-box 核心进程已退出 ({})", status));
                        }
                        (false, None)
                    }
                    Err(e) => {
                        *child_guard = None;
                        *self.ready.write().await = false;
                        *self.started_at.write().await = None;
                        if self.last_error.read().await.is_none() {
                            *self.last_error.write().await =
                                Some(format!("检测 sing-box 进程状态异常: {}", e));
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

        let binary_path =
            kernel::get_singbox_executable().map(|p| p.to_string_lossy().to_string());
        let running_config_path_buf = Self::get_running_config_path();
        let config_path = running_config_path_buf.to_string_lossy().to_string();
        let inbounds_summary = get_inbounds_summary_from_config(&running_config_path_buf);
        let conflicting_processes = detect_conflicting_singbox_processes(pid);

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
            conflicting_processes,
        }
    }

    pub async fn start(&self, config_json: &Value) -> Result<()> {
        self.start_with_sudo(config_json, None).await
    }

    pub async fn start_with_sudo(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
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
            *self.cached_sudo_pass.write().await = Some(p.clone());
        }

        // 1. Stop any existing Subout-managed processes and lingering instances first
        self.stop().await?;

        // 2. Check for conflicting external sing-box processes
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
                "检测到系统中已有外部独立的 sing-box 服务正在运行 [{}]。请先在系统终端中关闭现有外部服务（如 sudo systemctl stop sing-box 或 kill {}）后再使用 Subout 启动服务，以避免网络与端口冲突。",
                details,
                pids.join(" ")
            );
            self.append_log(&format!("❌ {}", err_msg)).await;
            *self.last_error.write().await = Some(err_msg.clone());
            return Err(anyhow!(err_msg));
        }

        let config_path = Self::get_running_config_path();
        if let Some(parent) = config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let config_str = serde_json::to_string_pretty(config_json)?;

        // 3. Write config file
        std::fs::write(&config_path, &config_str)
            .map_err(|e| anyhow!("写入 sing-box 运行配置文件失败: {}", e))?;

        let tun_mode = is_tun_mode(config_json);
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

        let use_sudo = !platform.is_windows() && !as_root && has_sudo_pass;

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

        let paths = crate::paths::AppPaths::get();
        let _ = paths.ensure_dirs();

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
                let err_msg = format!("启动 sing-box 进程失败: {}", e);
                self.append_log(&format!("❌ {}", err_msg)).await;
                *self.last_error.write().await = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
        };

        if use_sudo {
            if let Some(ref pass) = effective_sudo_pass {
                if let Some(mut stdin) = child.stdin.take() {
                    use tokio::io::AsyncWriteExt;
                    let pass_bytes = format!("{}\n", pass);
                    let _ = stdin.write_all(pass_bytes.as_bytes()).await;
                    let _ = stdin.flush().await;
                    drop(stdin); // Explicitly close stdin to prevent sudo from waiting for more input
                }
            }
        }

        let pid = child.id();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        *self.started_at.write().await = Some(now);
        *self.ready.write().await = false;
        *self.last_error.write().await = None;

        // Pipe stdout
        if let Some(stdout) = child.stdout.take() {
            let logs_clone = self.logs.clone();
            let last_error_clone = self.last_error.clone();
            let ready_clone = self.ready.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let clean = strip_ansi_codes(&line);
                    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let formatted = format!("[{}] [sing-box] {}", timestamp, clean);
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
                    let mut l = logs_clone.write().await;
                    if l.len() >= MAX_LOG_LINES {
                        l.pop_front();
                    }
                    l.push_back(formatted);
                }
            });
        }

        // Pipe stderr (sing-box sends its standard formatted console logs to stderr)
        if let Some(stderr) = child.stderr.take() {
            let logs_clone = self.logs.clone();
            let last_error_clone = self.last_error.clone();
            let ready_clone = self.ready.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let clean = strip_ansi_codes(&line);
                    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let formatted = format!("[{}] [sing-box] {}", timestamp, clean);
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
                    let mut l = logs_clone.write().await;
                    if l.len() >= MAX_LOG_LINES {
                        l.pop_front();
                    }
                    l.push_back(formatted);
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
                self.append_log(&format!("❌ {}", guide)).await;
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
                self.append_log(&format!("❌ {}", guide)).await;
                *self.last_error.write().await = Some(guide.clone());
                return Err(anyhow!(guide));
            }
            self.append_log(&format!("❌ sing-box 启动失败: {}", err))
                .await;
            *self.last_error.write().await = Some(err.clone());
            return Err(anyhow!("sing-box 启动异常: {}", err));
        }

        if let Some(ref p) = effective_sudo_pass {
            self.save_sudo_pass(p).await;
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        if let Some(port) = get_mixed_port_from_config(config_json) {
            platform.enable_system_proxy(port, cached_pass.as_deref());
            if platform.is_macos() || platform.is_windows() {
                self.append_log(&format!("🌐 已自动设置系统网络代理 (127.0.0.1:{})", port))
                    .await;
            }
        }
        if tun_mode {
            let tun_ip =
                get_tun_ip_from_config(config_json).unwrap_or_else(|| "172.19.0.1".to_string());
            platform.enable_tun_dns(&tun_ip, cached_pass.as_deref());
            if platform.is_macos() {
                self.append_log(&format!(
                    "🌐 已自动设置 macOS 系统 DNS 指向 TUN 虚拟网卡 ({})",
                    tun_ip
                ))
                .await;
            }
        }

        let summary = get_inbounds_summary_from_config(&config_path);
        if let Some(s) = summary {
            self.append_log(&format!(
                "🟢 sing-box 服务已就绪并开始运行 (PID: {:?}, 入站: {})",
                pid, s
            ))
            .await;
        } else if started_ready {
            self.append_log(&format!(
                "🟢 sing-box 服务已就绪并开始运行 (PID: {:?})",
                pid
            ))
            .await;
        } else {
            self.append_log(&format!("🟢 sing-box 进程已拉起 (PID: {:?})", pid))
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

            let _ = child.start_kill();

            let cached_pass = self.cached_sudo_pass.read().await.clone();

            if let Some(pid) = pid_opt {
                platform.kill_process(pid, cached_pass.as_deref(), 15).await;
            }

            // Wait up to 500ms for graceful stop, otherwise force SIGKILL
            if (tokio::time::timeout(std::time::Duration::from_millis(500), child.wait()).await)
                .is_err()
            {
                if let Some(pid) = pid_opt {
                    platform.kill_process(pid, cached_pass.as_deref(), 9).await;
                }
                let _ =
                    tokio::time::timeout(std::time::Duration::from_millis(200), child.wait()).await;
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
        platform.disable_tun_dns(cached_pass.as_deref());
        if platform.is_macos() || platform.is_windows() {
            self.append_log("🌐 已恢复系统原始网络代理设置").await;
        }

        if had_child {
            self.append_log("⏹️ sing-box 服务已停止").await;
        }

        *self.started_at.write().await = None;
        *self.ready.write().await = false;
        *self.last_error.write().await = None;
        Ok(())
    }

    pub async fn kill_external_process(&self, pid: u32, sudo_pass: Option<&str>) -> Result<()> {
        let current_pid = std::process::id();
        if pid == current_pid || pid <= 1 {
            return Err(anyhow!("无法终止受保护的系统进程 (PID: {})", pid));
        }

        let platform = crate::platform::current_platform();

        if !platform.is_pid_alive(pid) {
            self.append_log(&format!("外部进程 (PID: {}) 已不再运行", pid))
                .await;
            return Ok(());
        }

        self.append_log(&format!("正在请求终止外部 sing-box 进程 (PID: {})...", pid))
            .await;

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        let pass_clean = sudo_pass
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .map(|p| p.to_string())
            .or(cached_pass);

        if let Err(e) = platform
            .stop_external_service_or_process(pid, pass_clean.as_deref())
            .await
        {
            if e.to_string().contains("Sudo 密码不正确") {
                self.clear_saved_sudo_pass().await;
                self.append_log(&format!("❌ 终止外部进程失败: {}", e))
                    .await;
                return Err(e);
            }
        }

        // Verify whether the process has terminated
        let mut is_dead = false;
        for _ in 0..15 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if !platform.is_pid_alive(pid) {
                is_dead = true;
                break;
            }
        }

        if !is_dead {
            let msg = platform.external_process_stop_failed_message(pid, pass_clean.is_some());
            self.append_log(&format!("❌ {}", msg)).await;
            return Err(anyhow!(msg));
        }

        if let Some(ref pass) = pass_clean {
            self.save_sudo_pass(pass).await;
        }

        self.append_log(&format!("🟢 已成功终止外部 sing-box 进程 (PID: {})", pid))
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
        self.stop().await?;
        self.start_with_sudo(config_json, sudo_pass).await
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
    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(json_val) = serde_json::from_str::<Value>(&content) {
            if let Some(inbounds) = json_val.get("inbounds").and_then(|v| v.as_array()) {
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
                                summaries.push(format!("TUN ({})", iface));
                            }
                        }
                        "mixed" => {
                            let listen = inb
                                .get("listen")
                                .and_then(|l| l.as_str())
                                .unwrap_or("127.0.0.1");
                            let port = inb
                                .get("listen_port")
                                .and_then(|p| p.as_u64())
                                .unwrap_or(2080);
                            summaries.push(format!("{}:{} (混合代理)", listen, port));
                        }
                        "http" => {
                            let port = inb
                                .get("listen_port")
                                .and_then(|p| p.as_u64())
                                .unwrap_or(8080);
                            summaries.push(format!("HTTP :{}", port));
                        }
                        "socks" => {
                            let port = inb
                                .get("listen_port")
                                .and_then(|p| p.as_u64())
                                .unwrap_or(1080);
                            summaries.push(format!("SOCKS5 :{}", port));
                        }
                        other => {
                            summaries.push(format!("入站 ({})", other));
                        }
                    }
                }
                if !summaries.is_empty() {
                    return Some(summaries.join(", "));
                }
            }
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

pub fn get_mixed_port_from_config(config: &Value) -> Option<u16> {
    if let Some(inbounds) = config.get("inbounds").and_then(|i| i.as_array()) {
        for inbound in inbounds {
            let inbound_type = inbound.get("type").and_then(|t| t.as_str());
            if matches!(inbound_type, Some("mixed") | Some("http") | Some("socks")) {
                if let Some(port) = inbound.get("listen_port").and_then(|p| p.as_u64()) {
                    return Some(port as u16);
                }
            }
        }
    }
    None
}

pub fn get_tun_ip_from_config(config: &Value) -> Option<String> {
    if let Some(inbounds) = config.get("inbounds").and_then(|i| i.as_array()) {
        for inbound in inbounds {
            if inbound.get("type").and_then(|t| t.as_str()) == Some("tun") {
                if let Some(addrs) = inbound.get("address").and_then(|a| a.as_array()) {
                    for addr in addrs {
                        if let Some(s) = addr.as_str() {
                            if !s.contains(':') {
                                let ip = s.split('/').next().unwrap_or(s);
                                return Some(ip.to_string());
                            }
                        }
                    }
                }
                return Some("172.19.0.1".to_string());
            }
        }
    }
    None
}

pub fn strip_ansi_codes(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if let Some(&'[') = chars.peek() {
                chars.next(); // consume '['
                while let Some(&next_c) = chars.peek() {
                    chars.next();
                    if next_c.is_ascii_alphabetic() || next_c == '@' {
                        break;
                    }
                }
                continue;
            }
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
        println!("Live detected conflicts in test: {:?}", conflicts);
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
            conflicting_processes: vec![ConflictingProcessInfo {
                pid: 12345,
                name: "sing-box".to_string(),
                cmdline: Some("sing-box run -c /etc/sing-box/config.json".to_string()),
                exe_path: Some("/usr/bin/sing-box".to_string()),
            }],
        };

        let json_val = serde_json::to_value(&status).unwrap();
        assert_eq!(json_val["conflicting_processes"][0]["pid"], 12345);
        assert_eq!(json_val["conflicting_processes"][0]["name"], "sing-box");
        assert_eq!(json_val["inbounds_summary"], "127.0.0.1:2080 (混合代理)");
    }

    #[tokio::test]
    async fn test_service_manager_get_status_does_not_deadlock() {
        let mgr = SingBoxServiceManager::new();
        let status = mgr.get_status().await;
        assert!(!status.running);
        assert!(!status.ready);
    }

    #[tokio::test]
    async fn test_sudo_password_persistence_lifecycle() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_file = std::env::temp_dir().join(format!("test_sudo_{}.db", unique_id));
        let db_path = db_file.to_string_lossy().to_string();

        let _ = crate::db::init_db(&db_path).unwrap();

        let mgr = SingBoxServiceManager::new();
        mgr.set_db_path(&db_path).await;

        assert!(!mgr.has_saved_sudo_pass().await);

        // Save password
        mgr.save_sudo_pass("my_secret_pass").await;
        assert!(mgr.has_saved_sudo_pass().await);

        // Create new manager instance to verify persistent loading from DB
        let mgr2 = SingBoxServiceManager::new();
        mgr2.set_db_path(&db_path).await;
        mgr2.load_saved_sudo_pass().await;
        assert!(mgr2.has_saved_sudo_pass().await);

        // Clear password
        mgr2.clear_saved_sudo_pass().await;
        assert!(!mgr2.has_saved_sudo_pass().await);

        // Reload to verify DB was also cleaned
        let mgr3 = SingBoxServiceManager::new();
        mgr3.set_db_path(&db_path).await;
        mgr3.load_saved_sudo_pass().await;
        assert!(!mgr3.has_saved_sudo_pass().await);

        let _ = std::fs::remove_file(&db_file);
    }

    #[test]
    fn test_is_pid_alive() {
        let current_pid = std::process::id();
        assert!(is_pid_alive(current_pid));
        assert!(!is_pid_alive(0));
        assert!(!is_pid_alive(4_000_000_000));
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
        let logs = mgr.get_logs().await;
        assert_eq!(logs.len(), 1);
        assert!(logs[0].contains("connection refused"));

        // Status is still stopped and last_error is None (since runtime log isn't a fatal service crash)
        let st2 = mgr.get_status().await;
        assert!(!st2.running);
        assert!(st2.last_error.is_none());
    }
}

