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

        #[cfg(unix)]
        {
            if !is_running_as_root() {
                run_sudo_command("true", &[], Some(trimmed)).await
                    .map_err(|e| anyhow!("Sudo 密码验证失败: {}", e))?;
            }
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
                    _ => {
                        *child_guard = None;
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
                up >= 2 && self.last_error.read().await.is_none()
            } else {
                false
            }
        } else {
            false
        };

        let last_error = self.last_error.read().await.clone();
        let binary_path = kernel::get_singbox_executable().map(|p| p.to_string_lossy().to_string());
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

    pub async fn start_with_sudo(&self, config_json: &Value, sudo_pass: Option<&str>) -> Result<()> {
        let singbox_bin = kernel::get_singbox_executable()
            .ok_or_else(|| anyhow!("未找到 sing-box 可执行文件，请先在面板下载集成内核"))?;

        let explicit_pass = sudo_pass.and_then(|p| {
            let trimmed = p.trim();
            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
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
            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
        });

        if let Some(ref p) = explicit_pass {
            self.save_sudo_pass(p).await;
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        let effective_sudo_pass = explicit_pass.or(cached_pass);
        let has_sudo_pass = effective_sudo_pass.is_some();

        let use_sudo = cfg!(unix) && !as_root && has_sudo_pass;

        if use_sudo {
            self.append_log(&format!(
                "正在使用 Sudo 提权启动 sing-box 服务 (TUN 模式: {}, 内核: {})...",
                tun_mode, singbox_bin.display()
            )).await;
        } else {
            self.append_log(&format!(
                "正在启动 sing-box 服务 (TUN 模式: {}, root: {}, 内核: {})...",
                tun_mode, as_root, singbox_bin.display()
            )).await;
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

        #[cfg(unix)]
        cmd.process_group(0);

        #[cfg(target_os = "linux")]
        unsafe {
            cmd.pre_exec(|| {
                unsafe extern "C" {
                    fn prctl(option: i32, arg2: u64, arg3: u64, arg4: u64, arg5: u64) -> i32;
                }
                // PR_SET_PDEATHSIG = 1. Signal = SIGTERM (15).
                // Tells the Linux kernel: if parent (subout) exits for ANY reason,
                // automatically kill this child process so it never becomes an orphan.
                let _ = prctl(1, 15, 0, 0, 0);
                Ok(())
            });
        }

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
                    let lower = clean.to_lowercase();
                    if lower.contains("sing-box started")
                        || lower.contains("server started at")
                        || lower.contains("started inbound")
                        || lower.contains("inbound/")
                        || lower.contains("router: started")
                    {
                        *ready_clone.write().await = true;
                    }
                    if is_actual_singbox_error(&clean) {
                        *last_error_clone.write().await = Some(clean.clone());
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
                    let lower = clean.to_lowercase();
                    if lower.contains("sing-box started")
                        || lower.contains("server started at")
                        || lower.contains("started inbound")
                        || lower.contains("inbound/")
                        || lower.contains("router: started")
                    {
                        *ready_clone.write().await = true;
                    }
                    if is_actual_singbox_error(&clean) {
                        *last_error_clone.write().await = Some(clean.clone());
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

        if self.is_running().await && self.last_error.read().await.is_none() {
            *self.ready.write().await = true;
            started_ready = true;
        }

        if !self.is_running().await {
            let err = self.last_error.read().await.clone()
                .unwrap_or_else(|| "sing-box 启动后立即退出，请检查配置或核心日志".to_string());
            let err_upper = err.to_uppercase();
            if err_upper.contains("INCORRECT PASSWORD")
                || err_upper.contains("AUTHENTICATION FAILURE")
                || err_upper.contains("SORRY, TRY AGAIN")
                || err_upper.contains("1 INCORRECT PASSWORD ATTEMPT")
                || err_upper.contains("A PASSWORD IS REQUIRED")
            {
                self.clear_saved_sudo_pass().await;
                let guide = "Sudo 密码不正确或已失效，请重新输入系统管理员密码进行授权。".to_string();
                self.append_log(&format!("❌ {}", guide)).await;
                *self.last_error.write().await = Some(guide.clone());
                return Err(anyhow!(guide));
            }

            if (tun_mode || err_upper.contains("TUNSETIFF") || err_upper.contains("OPERATION NOT PERMITTED") || err_upper.contains("PERMISSION DENIED") || err_upper.contains("WINTUN") || err_upper.contains("ACCESS IS DENIED")) && !as_root && !has_sudo_pass {
                #[cfg(windows)]
                let guide = format!(
                    "TUN 模式启动失败 ({}): 创建 Wintun 虚拟网卡需要 Windows 系统管理员权限。请关闭 Subout，右键选择【以管理员身份运行】后重试。",
                    err
                );
                #[cfg(not(windows))]
                let guide = format!(
                    "TUN 模式启动失败 ({}): 创建虚拟网卡需系统管理员 (root) 权限。请输入系统 Sudo 密码授权运行，或在终端执行 sudo setcap cap_net_admin=+ep {:?} (Linux) 授权免密运行。",
                    err, singbox_bin
                );
                self.append_log(&format!("❌ {}", guide)).await;
                *self.last_error.write().await = Some(guide.clone());
                return Err(anyhow!(guide));
            }
            self.append_log(&format!("❌ sing-box 启动失败: {}", err)).await;
            *self.last_error.write().await = Some(err.clone());
            return Err(anyhow!("sing-box 启动异常: {}", err));
        }

        if let Some(ref p) = effective_sudo_pass {
            self.save_sudo_pass(p).await;
        }

        #[cfg(target_os = "macos")]
        {
            let cached_pass = self.cached_sudo_pass.read().await.clone();
            if let Some(port) = get_mixed_port_from_config(config_json) {
                macos_proxy::enable_system_proxy(port, cached_pass.as_deref());
                self.append_log(&format!("🌐 已自动设置 macOS 系统网络代理 (127.0.0.1:{})", port)).await;
            }
            if tun_mode {
                let tun_ip = get_tun_ip_from_config(config_json).unwrap_or_else(|| "172.19.0.1".to_string());
                macos_proxy::enable_tun_dns(&tun_ip, cached_pass.as_deref());
                self.append_log(&format!("🌐 已自动设置 macOS 系统 DNS 指向 TUN 虚拟网卡 ({})", tun_ip)).await;
            }
        }

        #[cfg(target_os = "windows")]
        {
            if let Some(port) = get_mixed_port_from_config(config_json) {
                windows_proxy::enable_system_proxy(port);
                self.append_log(&format!("🌐 已自动设置 Windows 系统网络代理 (127.0.0.1:{})", port)).await;
            }
        }

        let summary = get_inbounds_summary_from_config(&config_path);
        if let Some(s) = summary {
            self.append_log(&format!("🟢 sing-box 服务已就绪并开始运行 (PID: {:?}, 入站: {})", pid, s)).await;
        } else if started_ready {
            self.append_log(&format!("🟢 sing-box 服务已就绪并开始运行 (PID: {:?})", pid)).await;
        } else {
            self.append_log(&format!("🟢 sing-box 进程已拉起 (PID: {:?})", pid)).await;
        }

        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        let mut child_guard = self.child.write().await;
        let mut had_child = false;
        let mut pid_opt = None;

        if let Some(mut child) = child_guard.take() {
            had_child = true;
            pid_opt = child.id();
            self.append_log("正在停止 sing-box 服务...").await;

            let _ = child.start_kill();

            #[cfg(unix)]
            let cached_pass = self.cached_sudo_pass.read().await.clone();

            #[cfg(unix)]
            if let Some(pid) = pid_opt {
                unsafe extern "C" {
                    fn kill(pid: i32, sig: i32) -> i32;
                }
                unsafe {
                    // Send SIGTERM to both process group and direct pid
                    let _ = kill(-(pid as i32), 15);
                    let _ = kill(pid as i32, 15);
                }
                if let Some(ref pass) = cached_pass {
                    let _ = run_sudo_command("kill", &["-15", &pid.to_string()], Some(pass)).await;
                }
            }

            #[cfg(windows)]
            if let Some(pid) = pid_opt {
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }

            // Wait up to 500ms for graceful stop, otherwise force SIGKILL
            if (tokio::time::timeout(std::time::Duration::from_millis(500), child.wait()).await).is_err() {
                #[cfg(unix)]
                if let Some(pid) = pid_opt {
                    unsafe extern "C" {
                        fn kill(pid: i32, sig: i32) -> i32;
                    }
                    unsafe {
                        let _ = kill(-(pid as i32), 9);
                        let _ = kill(pid as i32, 9);
                    }
                    if let Some(ref pass) = cached_pass {
                        let _ = run_sudo_command("kill", &["-9", &pid.to_string()], Some(pass)).await;
                    }
                }
                let _ = tokio::time::timeout(std::time::Duration::from_millis(200), child.wait()).await;
            }
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        // Clean up any lingering Subout sing-box / sudo child processes
        kill_all_subout_singbox_processes(cached_pass.as_deref(), pid_opt).await;

        #[cfg(target_os = "macos")]
        {
            macos_proxy::disable_system_proxy_and_dns(cached_pass.as_deref());
            self.append_log("🌐 已恢复 macOS 原始系统代理与 DNS 设置").await;
        }

        #[cfg(target_os = "windows")]
        {
            windows_proxy::disable_system_proxy();
            self.append_log("🌐 已恢复 Windows 原始系统代理设置").await;
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

        if !is_pid_alive(pid) {
            self.append_log(&format!("外部进程 (PID: {}) 已不再运行", pid)).await;
            return Ok(());
        }

        self.append_log(&format!("正在请求终止外部 sing-box 进程 (PID: {})...", pid)).await;

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        let pass_clean = sudo_pass
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .map(|p| p.to_string())
            .or(cached_pass);

        #[cfg(unix)]
        {
            let as_root = is_running_as_root();

            // 1. Try systemctl stop sing-box if on Linux systemd
            #[cfg(target_os = "linux")]
            {
                if as_root {
                    let _ = tokio::process::Command::new("systemctl").args(["stop", "sing-box"]).output().await;
                    let _ = tokio::process::Command::new("systemctl").args(["stop", "sing-box.service"]).output().await;
                    let _ = tokio::process::Command::new("systemctl").args(["stop", "singbox"]).output().await;
                    let _ = tokio::process::Command::new("systemctl").args(["stop", "singbox.service"]).output().await;
                } else if let Some(ref pass) = pass_clean {
                    if let Err(e) = run_sudo_command("systemctl", &["stop", "sing-box"], Some(pass)).await {
                        if e.to_string().contains("Sudo 密码不正确") {
                            self.clear_saved_sudo_pass().await;
                            self.append_log(&format!("❌ 终止外部进程失败: {}", e)).await;
                            return Err(e);
                        }
                    }
                    let _ = run_sudo_command("systemctl", &["stop", "sing-box.service"], Some(pass)).await;
                    let _ = run_sudo_command("systemctl", &["stop", "singbox"], Some(pass)).await;
                    let _ = run_sudo_command("systemctl", &["stop", "singbox.service"], Some(pass)).await;
                } else {
                    let _ = run_sudo_command("systemctl", &["stop", "sing-box"], None).await;
                    let _ = run_sudo_command("systemctl", &["stop", "sing-box.service"], None).await;
                }
            }

            #[cfg(target_os = "macos")]
            {
                let _ = tokio::process::Command::new("brew").args(["services", "stop", "sing-box"]).output().await;
                let _ = tokio::process::Command::new("brew").args(["services", "stop", "singbox"]).output().await;
                if !as_root {
                    let _ = run_sudo_command("brew", &["services", "stop", "sing-box"], pass_clean.as_deref()).await;
                }
            }

            // 2. Direct SIGTERM signal
            unsafe extern "C" {
                fn kill(pid: i32, sig: i32) -> i32;
            }
            unsafe {
                let _ = kill(pid as i32, 15);
            }

            if let Some(ref pass) = pass_clean {
                let pid_str = pid.to_string();
                if let Err(e) = run_sudo_command("kill", &["-15", &pid_str], Some(pass)).await {
                    if e.to_string().contains("Sudo 密码不正确") {
                        self.clear_saved_sudo_pass().await;
                        self.append_log(&format!("❌ 终止外部进程失败: {}", e)).await;
                        return Err(e);
                    }
                }
            }

            // 3. If still alive after 400ms, escalate to SIGKILL
            tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;
            if is_pid_alive(pid) {
                unsafe {
                    let _ = kill(pid as i32, 9);
                }
                if let Some(ref pass) = pass_clean {
                    let pid_str = pid.to_string();
                    let _ = run_sudo_command("kill", &["-9", &pid_str], Some(pass)).await;
                }
            }
        }

        #[cfg(windows)]
        {
            let pid_str = pid.to_string();
            let _ = tokio::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", "Stop-Service sing-box -ErrorAction SilentlyContinue; Stop-Service singbox -ErrorAction SilentlyContinue"])
                .output()
                .await;
            let _ = tokio::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid_str])
                .output()
                .await;
        }

        // 4. Verify whether the process has terminated
        let mut is_dead = false;
        for _ in 0..15 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if !is_pid_alive(pid) {
                is_dead = true;
                break;
            }
        }

        if !is_dead {
            #[cfg(unix)]
            let msg = if pass_clean.is_none() && !is_running_as_root() {
                format!(
                    "外部进程 (PID: {}) 属于系统守护进程或 Root 用户，未能直接终止。请在弹窗中输入系统的 Sudo 密码进行授权终止，或在终端执行 sudo systemctl stop sing-box",
                    pid
                )
            } else {
                format!(
                    "终止外部进程 (PID: {}) 失败：进程仍在运行。请检查输入的 Sudo 密码是否正确，或在系统终端执行 sudo systemctl stop sing-box / sudo kill -9 {}",
                    pid, pid
                )
            };

            #[cfg(windows)]
            let msg = format!(
                "终止外部进程 (PID: {}) 失败：进程仍在运行。请以管理员身份运行 Subout，或在任务管理器 / 终端中执行 taskkill /F /PID {} 终止该进程",
                pid, pid
            );

            #[cfg(not(any(unix, windows)))]
            let msg = format!("终止外部进程 (PID: {}) 失败：进程仍在运行", pid);

            self.append_log(&format!("❌ {}", msg)).await;
            return Err(anyhow!(msg));
        }

        if let Some(ref pass) = pass_clean {
            self.save_sudo_pass(pass).await;
        }

        self.append_log(&format!("🟢 已成功终止外部 sing-box 进程 (PID: {})", pid)).await;
        Ok(())
    }

    pub async fn restart(&self, config_json: &Value) -> Result<()> {
        self.restart_with_sudo(config_json, None).await
    }

    pub async fn restart_with_sudo(&self, config_json: &Value, sudo_pass: Option<&str>) -> Result<()> {
        self.stop().await?;
        self.start_with_sudo(config_json, sudo_pass).await
    }
}

#[cfg(unix)]
pub fn is_running_as_root() -> bool {
    unsafe extern "C" {
        fn geteuid() -> u32;
    }
    unsafe { geteuid() == 0 }
}

#[cfg(windows)]
pub fn is_running_as_root() -> bool {
    unsafe extern "system" {
        fn IsUserAnAdmin() -> i32;
    }
    unsafe { IsUserAnAdmin() != 0 }
}

#[cfg(not(any(unix, windows)))]
pub fn is_running_as_root() -> bool {
    false
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

pub async fn kill_all_subout_singbox_processes(cached_sudo_pass: Option<&str>, exclude_pid: Option<u32>) {
    let current_pid = std::process::id();
    let config_path_str = SingBoxServiceManager::get_running_config_path().to_string_lossy().to_string();
    let mut pids_to_kill: Vec<u32> = Vec::new();

    #[cfg(unix)]
    {
        if let Ok(output) = std::process::Command::new("ps").args(["-eo", "pid,ppid,comm,args"]).output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines().skip(1) {
                    let parts: Vec<&str> = line.trim().split_whitespace().collect();
                    if parts.len() >= 3 {
                        if let (Ok(pid), Ok(ppid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                            if pid == current_pid || pid <= 1 || Some(pid) == exclude_pid {
                                continue;
                            }
                            let full_cmd = parts[2..].join(" ");
                            let is_subout_instance = full_cmd.contains(&config_path_str)
                                || full_cmd.contains("sing-box.json")
                                || full_cmd.contains("sing-box-running.json")
                                || (exclude_pid.is_some() && Some(ppid) == exclude_pid);
                            if is_subout_instance {
                                pids_to_kill.push(pid);
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = std::fs::read_dir("/proc") {
            for entry in entries.flatten() {
                if let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() {
                    if pid == current_pid || pid <= 1 || Some(pid) == exclude_pid || pids_to_kill.contains(&pid) {
                        continue;
                    }
                    let cmdline_path = entry.path().join("cmdline");
                    if let Ok(bytes) = std::fs::read(&cmdline_path) {
                        let cmdline = bytes
                            .split(|&b| b == 0)
                            .filter(|s| !s.is_empty())
                            .map(|s| String::from_utf8_lossy(s).to_string())
                            .collect::<Vec<_>>()
                            .join(" ");
                        if cmdline.contains(&config_path_str) || cmdline.contains("sing-box-running.json") {
                            pids_to_kill.push(pid);
                        }
                    }
                }
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe' or CommandLine like '%sing-box%'\" | ForEach-Object { \"$($_.ProcessId)|||$($_.ParentProcessId)|||$($_.CommandLine)\" }",
            ])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let parts: Vec<&str> = trimmed.split("|||").collect();
                    if parts.len() >= 2 {
                        if let (Ok(pid), Ok(ppid)) = (parts[0].trim().parse::<u32>(), parts[1].trim().parse::<u32>()) {
                            if pid == current_pid || pid <= 4 || Some(pid) == exclude_pid {
                                continue;
                            }
                            let cmdline = if parts.len() >= 3 { parts[2].trim() } else { "" };
                            let is_subout_instance = cmdline.contains(&config_path_str)
                                || cmdline.contains("sing-box-running.json")
                                || ppid == current_pid
                                || (exclude_pid.is_some() && Some(ppid) == exclude_pid);
                            if is_subout_instance {
                                pids_to_kill.push(pid);
                            }
                        }
                    }
                }
            }
        }
    }

    if pids_to_kill.is_empty() {
        return;
    }

    #[cfg(unix)]
    {
        unsafe extern "C" {
            fn kill(pid: i32, sig: i32) -> i32;
        }
        for &pid in &pids_to_kill {
            unsafe {
                let _ = kill(-(pid as i32), 15);
                let _ = kill(pid as i32, 15);
            }
        }

        if let Some(pass) = cached_sudo_pass {
            let pid_strs: Vec<String> = pids_to_kill.iter().map(|p| p.to_string()).collect();
            let mut args = vec!["-15"];
            for s in &pid_strs {
                args.push(s.as_str());
            }
            let _ = run_sudo_command("kill", &args, Some(pass)).await;
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        let mut remaining = Vec::new();
        for &pid in &pids_to_kill {
            if is_pid_alive(pid) {
                remaining.push(pid);
                unsafe {
                    let _ = kill(-(pid as i32), 9);
                    let _ = kill(pid as i32, 9);
                }
            }
        }
        if !remaining.is_empty() {
            if let Some(pass) = cached_sudo_pass {
                let pid_strs: Vec<String> = remaining.iter().map(|p| p.to_string()).collect();
                let mut args = vec!["-9"];
                for s in &pid_strs {
                    args.push(s.as_str());
                }
                let _ = run_sudo_command("kill", &args, Some(pass)).await;
            }
        }
    }

    #[cfg(windows)]
    {
        let _ = cached_sudo_pass;
        for pid in pids_to_kill {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output();
        }
    }
}

pub fn detect_conflicting_singbox_processes(managed_pid: Option<u32>) -> Vec<ConflictingProcessInfo> {
    let current_pid = std::process::id();
    let config_path_str = SingBoxServiceManager::get_running_config_path().to_string_lossy().to_string();
    let mut results: Vec<ConflictingProcessInfo> = Vec::new();
    let mut seen_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();

    #[cfg(unix)]
    {
        // 1. Primary for Linux & macOS: query ps with pid,ppid,comm,args
        if let Ok(output) = std::process::Command::new("ps").args(["-eo", "pid,ppid,comm,args"]).output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines().skip(1) {
                    let trimmed = line.trim();
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 3 {
                        if let (Ok(pid), Ok(ppid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                            if pid == current_pid || Some(pid) == managed_pid || pid == 0 || pid == 1 {
                                continue;
                            }
                            if ppid == current_pid || (managed_pid.is_some() && Some(ppid) == managed_pid) {
                                continue;
                            }
                            let comm = parts[2];
                            let full_cmd = if parts.len() >= 4 {
                                parts[3..].join(" ")
                            } else {
                                comm.to_string()
                            };

                            let is_subout = comm == "subout"
                                || comm.contains("subout")
                                || full_cmd.contains("subout web")
                                || full_cmd.contains("target/debug/subout")
                                || full_cmd.contains("target/release/subout")
                                || full_cmd.contains("cargo")
                                || full_cmd.contains(&config_path_str)
                                || full_cmd.contains("sing-box.json")
                                || full_cmd.contains("sing-box-running.json");

                            if is_subout {
                                continue;
                            }

                            let is_singbox = comm == "sing-box"
                                || comm.ends_with("/sing-box")
                                || comm.contains("sing-box")
                                || full_cmd.starts_with("/usr/bin/sing-box")
                                || full_cmd.starts_with("/usr/local/bin/sing-box")
                                || full_cmd.starts_with("/opt/homebrew/bin/sing-box")
                                || full_cmd.starts_with("sing-box ")
                                || full_cmd.contains("/sing-box run")
                                || full_cmd.contains("sing-box run")
                                || full_cmd.contains("sing-box -D")
                                || full_cmd.contains("sing-box -C");

                            if is_singbox {
                                if seen_pids.insert(pid) {
                                    results.push(ConflictingProcessInfo {
                                        pid,
                                        name: comm.to_string(),
                                        cmdline: Some(full_cmd),
                                        exe_path: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Linux fallback & systemd inspection: direct /proc scanning
        #[cfg(target_os = "linux")]
        {
            if let Ok(entries) = std::fs::read_dir("/proc") {
                for entry in entries.flatten() {
                    let file_name = entry.file_name();
                    let pid_str = file_name.to_string_lossy();
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if pid == current_pid || Some(pid) == managed_pid || pid == 0 || pid == 1 || seen_pids.contains(&pid) {
                            continue;
                        }

                        let proc_path = entry.path();
                        let stat_path = proc_path.join("stat");
                        if let Ok(stat_str) = std::fs::read_to_string(&stat_path) {
                            // stat fields: pid (comm) state ppid ...
                            if let Some(rparen) = stat_str.rfind(')') {
                                let after = stat_str[rparen + 1..].trim_start();
                                let stat_parts: Vec<&str> = after.split_whitespace().collect();
                                if stat_parts.len() >= 2 {
                                    if let Ok(ppid) = stat_parts[1].parse::<u32>() {
                                        if ppid == current_pid || (managed_pid.is_some() && Some(ppid) == managed_pid) {
                                            continue;
                                        }
                                    }
                                }
                            }
                        }

                        let comm_path = proc_path.join("comm");
                        let cmdline_path = proc_path.join("cmdline");
                        let exe_path = std::fs::read_link(proc_path.join("exe"))
                            .ok()
                            .map(|p| p.to_string_lossy().to_string());

                        let comm = std::fs::read_to_string(&comm_path)
                            .unwrap_or_default()
                            .trim()
                            .to_string();

                        let cmdline = std::fs::read(&cmdline_path)
                            .ok()
                            .map(|bytes| {
                                bytes
                                    .split(|&b| b == 0)
                                    .filter(|slice| !slice.is_empty())
                                    .map(|slice| String::from_utf8_lossy(slice).to_string())
                                    .collect::<Vec<_>>()
                                    .join(" ")
                            });

                        let is_subout = comm == "subout"
                            || comm.contains("subout")
                            || cmdline.as_deref().map(|c| c.contains("subout") || c.contains(&config_path_str) || c.contains("sing-box-running.json")).unwrap_or(false);

                        if is_subout {
                            continue;
                        }

                        let is_singbox = comm == "sing-box"
                            || exe_path
                                .as_deref()
                                .map(|p| p.ends_with("/sing-box"))
                                .unwrap_or(false)
                            || cmdline
                                .as_deref()
                                .map(|c| c.starts_with("sing-box ") || c.contains("/sing-box ") || c.contains("sing-box run") || c == "sing-box")
                                .unwrap_or(false);

                        if is_singbox {
                            if seen_pids.insert(pid) {
                                results.push(ConflictingProcessInfo {
                                    pid,
                                    name: comm,
                                    cmdline,
                                    exe_path,
                                });
                            }
                        }
                    }
                }
            }

            // 3. Systemd service query
            if let Ok(output) = std::process::Command::new("systemctl").args(["show", "sing-box", "-p", "MainPID", "-p", "ActiveState"]).output() {
                if output.status.success() {
                    let out_str = String::from_utf8_lossy(&output.stdout);
                    let mut is_active = false;
                    let mut s_pid = 0u32;
                    for line in out_str.lines() {
                        if line.starts_with("ActiveState=active") {
                            is_active = true;
                        } else if line.starts_with("MainPID=") {
                            if let Ok(p) = line.trim_start_matches("MainPID=").trim().parse::<u32>() {
                                s_pid = p;
                            }
                        }
                    }
                    if is_active && s_pid > 1 && s_pid != current_pid && Some(s_pid) != managed_pid {
                        if seen_pids.insert(s_pid) {
                            results.push(ConflictingProcessInfo {
                                pid: s_pid,
                                name: "sing-box (systemd)".to_string(),
                                cmdline: Some("systemctl: sing-box.service (Active)".to_string()),
                                exe_path: Some("/usr/bin/sing-box".to_string()),
                            });
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // 1. Primary: Use PowerShell to get full ProcessId, Name, CommandLine, and ExecutablePath
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe' or CommandLine like '%sing-box%'\" | ForEach-Object { \"$($_.ProcessId)|||$($_.Name)|||$($_.CommandLine)|||$($_.ExecutablePath)\" }",
            ])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let parts: Vec<&str> = trimmed.split("|||").collect();
                    if parts.len() >= 2 {
                        if let Ok(pid) = parts[0].trim().parse::<u32>() {
                            if pid == current_pid || Some(pid) == managed_pid {
                                continue;
                            }
                            let name = parts[1].trim().to_string();
                            let cmdline = if parts.len() >= 3 && !parts[2].trim().is_empty() {
                                Some(parts[2].trim().to_string())
                            } else {
                                None
                            };
                            let exe_path = if parts.len() >= 4 && !parts[3].trim().is_empty() {
                                Some(parts[3].trim().to_string())
                            } else {
                                None
                            };

                            let is_subout = name.to_lowercase().contains("subout")
                                || cmdline.as_deref().map(|c| {
                                    let c_lower = c.to_lowercase();
                                    c_lower.contains("subout") || c.contains(&config_path_str) || c.contains("sing-box-running.json")
                                }).unwrap_or(false);

                            if !is_subout {
                                if seen_pids.insert(pid) {
                                    results.push(ConflictingProcessInfo {
                                        pid,
                                        name,
                                        cmdline,
                                        exe_path,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Secondary fallback: tasklist
        if results.is_empty() {
            if let Ok(output) = std::process::Command::new("tasklist")
                .args(["/FI", "IMAGENAME eq sing-box.exe", "/FO", "CSV", "/NH"])
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        let fields: Vec<String> = line
                            .split(',')
                            .map(|s| s.trim_matches('"').trim().to_string())
                            .collect();
                        if fields.len() >= 2 {
                            if let Ok(pid) = fields[1].parse::<u32>() {
                                if pid == current_pid || Some(pid) == managed_pid {
                                    continue;
                                }
                                if seen_pids.insert(pid) {
                                    results.push(ConflictingProcessInfo {
                                        pid,
                                        name: fields[0].clone(),
                                        cmdline: None,
                                        exe_path: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    results
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
                            let iface = inb.get("interface_name").and_then(|i| i.as_str()).unwrap_or("");
                            if iface.is_empty() {
                                summaries.push("TUN".to_string());
                            } else {
                                summaries.push(format!("TUN ({})", iface));
                            }
                        }
                        "mixed" => {
                            let listen = inb.get("listen").and_then(|l| l.as_str()).unwrap_or("127.0.0.1");
                            let port = inb.get("listen_port").and_then(|p| p.as_u64()).unwrap_or(2080);
                            summaries.push(format!("{}:{} (混合代理)", listen, port));
                        }
                        "http" => {
                            let port = inb.get("listen_port").and_then(|p| p.as_u64()).unwrap_or(8080);
                            summaries.push(format!("HTTP :{}", port));
                        }
                        "socks" => {
                            let port = inb.get("listen_port").and_then(|p| p.as_u64()).unwrap_or(1080);
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
    if pid == 0 {
        return false;
    }
    #[cfg(unix)]
    {
        unsafe extern "C" {
            fn kill(pid: i32, sig: i32) -> i32;
        }
        let res = unsafe { kill(pid as i32, 0) };
        if res == 0 {
            true
        } else {
            let errno = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
            errno == 1 // EPERM = 1 (process exists, insufficient permissions)
        }
    }
    #[cfg(windows)]
    {
        type HANDLE = *mut std::ffi::c_void;
        type BOOL = i32;
        type DWORD = u32;

        const PROCESS_QUERY_LIMITED_INFORMATION: DWORD = 0x1000;
        const SYNCHRONIZE: DWORD = 0x00100000;
        const WAIT_TIMEOUT: DWORD = 0x00000102;
        const STILL_ACTIVE: DWORD = 259;
        const ERROR_ACCESS_DENIED: DWORD = 5;

        unsafe extern "system" {
            fn OpenProcess(dwDesiredAccess: DWORD, bInheritHandle: BOOL, dwProcessId: DWORD) -> HANDLE;
            fn WaitForSingleObject(hHandle: HANDLE, dwMilliseconds: DWORD) -> DWORD;
            fn GetExitCodeProcess(hProcess: HANDLE, lpExitCode: *mut DWORD) -> BOOL;
            fn CloseHandle(hObject: HANDLE) -> BOOL;
        }

        if pid == 0 {
            return false;
        }

        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid) };
        if !handle.is_null() {
            let wait_res = unsafe { WaitForSingleObject(handle, 0) };
            let mut exit_code: DWORD = 0;
            let get_code_res = unsafe { GetExitCodeProcess(handle, &mut exit_code) };
            unsafe { CloseHandle(handle) };

            wait_res == WAIT_TIMEOUT || (get_code_res != 0 && exit_code == STILL_ACTIVE)
        } else {
            let err = std::io::Error::last_os_error().raw_os_error().unwrap_or(0) as DWORD;
            err == ERROR_ACCESS_DENIED
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        false
    }
}

pub async fn run_sudo_command(cmd_name: &str, args: &[&str], sudo_pass: Option<&str>) -> Result<()> {
    #[cfg(unix)]
    {
        if is_running_as_root() {
            let _ = tokio::process::Command::new(cmd_name)
                .args(args)
                .output()
                .await;
            return Ok(());
        }

        if let Some(pass) = sudo_pass {
            let mut cmd = tokio::process::Command::new("sudo");
            cmd.arg("-S").arg("-k").arg("-p").arg("").arg("--").arg(cmd_name).args(args);
            cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
            let mut child = cmd.spawn().map_err(|e| anyhow!("执行 sudo 失败: {}", e))?;
            if let Some(mut stdin) = child.stdin.take() {
                use tokio::io::AsyncWriteExt;
                let _ = stdin.write_all(format!("{}\n", pass).as_bytes()).await;
                let _ = stdin.flush().await;
                drop(stdin);
            }
            let output = tokio::time::timeout(std::time::Duration::from_secs(5), child.wait_with_output())
                .await
                .map_err(|_| anyhow!("执行 sudo 命令超时"))??;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if stderr.contains("incorrect password")
                    || stderr.contains("authentication failure")
                    || stderr.contains("Sorry, try again")
                    || stderr.contains("1 incorrect password attempt")
                    || stderr.contains("a password is required")
                {
                    return Err(anyhow!("Sudo 密码不正确，请重新输入"));
                }
            }
        } else {
            let mut cmd = tokio::process::Command::new("sudo");
            cmd.arg("-n").arg("--").arg(cmd_name).args(args);
            let _ = cmd.output().await;
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = (cmd_name, args, sudo_pass);
        Ok(())
    }
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

#[cfg(target_os = "macos")]
pub mod macos_proxy {
    use std::process::Command;

    fn run_netsetup(args: &[&str], sudo_pass: Option<&str>) {
        if super::is_running_as_root() {
            let _ = Command::new("networksetup").args(args).output();
        } else if let Some(pass) = sudo_pass {
            use std::io::Write;
            let mut child = match Command::new("sudo")
                .arg("-S")
                .arg("-k")
                .arg("-p")
                .arg("")
                .arg("--")
                .arg("networksetup")
                .args(args)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
            {
                Ok(c) => c,
                Err(_) => return,
            };
            if let Some(mut stdin) = child.stdin.take() {
                let _ = writeln!(stdin, "{}", pass);
            }
            let _ = child.wait();
        } else {
            let _ = Command::new("networksetup").args(args).output();
        }
    }

    pub fn get_network_services() -> Vec<String> {
        let output = match Command::new("networksetup").arg("-listallnetworkservices").output() {
            Ok(o) => o,
            Err(_) => return Vec::new(),
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout
            .lines()
            .filter(|line| {
                let trimmed = line.trim();
                !trimmed.is_empty()
                    && !trimmed.starts_with('*') // Disabled services marked with *
                    && !trimmed.contains("An asterisk")
            })
            .map(|s| s.trim().to_string())
            .collect()
    }

    pub fn enable_system_proxy(port: u16, sudo_pass: Option<&str>) {
        let services = get_network_services();
        let port_str = port.to_string();
        for svc in services {
            run_netsetup(&["-setwebproxy", &svc, "127.0.0.1", &port_str], sudo_pass);
            run_netsetup(&["-setsecurewebproxy", &svc, "127.0.0.1", &port_str], sudo_pass);
            run_netsetup(&["-setsocksfirewallproxy", &svc, "127.0.0.1", &port_str], sudo_pass);
            run_netsetup(&["-setwebproxystate", &svc, "on"], sudo_pass);
            run_netsetup(&["-setsecurewebproxystate", &svc, "on"], sudo_pass);
            run_netsetup(&["-setsocksfirewallproxystate", &svc, "on"], sudo_pass);
        }
    }

    pub fn enable_tun_dns(dns_ip: &str, sudo_pass: Option<&str>) {
        let services = get_network_services();
        for svc in services {
            run_netsetup(&["-setdnsservers", &svc, dns_ip], sudo_pass);
        }
    }

    pub fn disable_system_proxy_and_dns(sudo_pass: Option<&str>) {
        let services = get_network_services();
        for svc in services {
            run_netsetup(&["-setwebproxystate", &svc, "off"], sudo_pass);
            run_netsetup(&["-setsecurewebproxystate", &svc, "off"], sudo_pass);
            run_netsetup(&["-setsocksfirewallproxystate", &svc, "off"], sudo_pass);
            run_netsetup(&["-setdnsservers", &svc, "empty"], sudo_pass);
        }
    }
}

#[cfg(target_os = "windows")]
pub mod windows_proxy {
    use std::process::Command;

    pub fn enable_system_proxy(port: u16) {
        let proxy_addr = format!("127.0.0.1:{}", port);
        let override_hosts = "<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*";

        let _ = Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"])
            .output();

        let _ = Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer", "/t", "REG_SZ", "/d", &proxy_addr, "/f"])
            .output();

        let _ = Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyOverride", "/t", "REG_SZ", "/d", override_hosts, "/f"])
            .output();

        refresh_wininet_proxy();
    }

    pub fn disable_system_proxy() {
        let _ = Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"])
            .output();

        refresh_wininet_proxy();
    }

    fn refresh_wininet_proxy() {
        let script = r#"
            $sig = @'
            [DllImport("wininet.dll", SetLastError = true, CharSet=CharSet.Auto)]
            public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
'@
            $type = Add-Type -MemberDefinition $sig -Name WinINetProxy -Namespace WinINet -PassThru
            [WinINet.WinINetProxy]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
            [WinINet.WinINetProxy]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
        "#;

        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
            .output();
    }
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
    if upper.contains("FATAL")
        || upper.contains("PANIC")
        || upper.contains("ADDRESS ALREADY IN USE")
        || upper.contains("OPERATION NOT PERMITTED")
        || upper.contains("PERMISSION DENIED")
        || upper.contains("TUNSETIFF")
        || upper.contains("WINTUN")
        || upper.contains("ACCESS IS DENIED")
        || upper.contains("BAD TUN NAME")
        || upper.contains("INCORRECT PASSWORD")
        || upper.contains("AUTHENTICATION FAILURE")
        || upper.contains("A PASSWORD IS REQUIRED")
        || upper.contains("SORRY, TRY AGAIN")
    {
        return true;
    }
    if upper.contains("ERROR") {
        if upper.contains("NOERROR") && !upper.contains(" ERROR") && !upper.contains("ERROR:") && !upper.contains("[ERROR]") {
            return false;
        }
        if upper.contains(" ERROR ") || upper.contains("ERROR:") || upper.contains("[ERROR]") || upper.contains("LEVEL=ERROR") {
            return true;
        }
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
        assert_eq!(clean, "INFO network: updated default interface wlo1, index 3");

        let colored_warn = "\x1b[33mWARN\x1b[0m outbound/direct[direct]: failed";
        assert_eq!(strip_ansi_codes(colored_warn), "WARN outbound/direct[direct]: failed");
    }

    #[test]
    fn test_is_actual_singbox_error() {
        // Normal INFO lines should NOT be treated as error
        assert!(!is_actual_singbox_error("INFO network: updated default interface"));
        assert!(!is_actual_singbox_error("INFO router: dns rule action predefined rcode NOERROR"));
        assert!(!is_actual_singbox_error("INFO sing-box started (1.10s)"));

        // Genuine fatal or errors
        assert!(is_actual_singbox_error("FATAL[0000] create service: rule-set error"));
        assert!(is_actual_singbox_error("ERROR inbound/mixed[mixed-in]: tcp server failed to bind: address already in use"));
        assert!(is_actual_singbox_error("panic: runtime error"));
        assert!(is_actual_singbox_error("operation not permitted"));
        assert!(is_actual_singbox_error("FATAL[0000] start service: start inbound/tun[tun-in]: configure tun interface: open tun: TUNSETIFF: operation not permitted"));
        assert!(is_actual_singbox_error("sudo: 1 incorrect password attempt"));
        assert!(is_actual_singbox_error("sudo: pam_authenticate: Authentication failure"));
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
        let unique_id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
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
}
