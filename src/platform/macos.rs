use anyhow::Result;
#[cfg(unix)]
use anyhow::anyhow;
use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::platform::{BoxFuture, PlatformStrategy, get_config_path_variants};
use crate::service::ConflictingProcessInfo;

struct RawProc {
    pid: u32,
    comm: String,
    full_cmd: String,
}

pub struct MacOsPlatform;

impl PlatformStrategy for MacOsPlatform {
    fn os_name(&self) -> &'static str {
        "macos"
    }

    fn is_running_as_root(&self) -> bool {
        #[cfg(unix)]
        {
            unsafe extern "C" {
                fn geteuid() -> u32;
            }
            // SAFETY: geteuid is a POSIX system call that takes no parameters and has no side effects.
            unsafe { geteuid() == 0 }
        }
        #[cfg(not(unix))]
        {
            false
        }
    }

    fn run_sudo_command<'a>(
        &'a self,
        cmd_name: &'a str,
        args: &'a [&'a str],
        sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            #[cfg(unix)]
            {
                if self.is_running_as_root() {
                    let _ = tokio::process::Command::new(cmd_name)
                        .args(args)
                        .output()
                        .await;
                    return Ok(());
                }

                if let Some(pass) = sudo_pass {
                    let mut cmd = tokio::process::Command::new("sudo");
                    cmd.arg("-S")
                        .arg("-k")
                        .arg("-p")
                        .arg("")
                        .arg("--")
                        .arg(cmd_name)
                        .args(args);
                    cmd.stdin(std::process::Stdio::piped())
                        .stdout(std::process::Stdio::piped())
                        .stderr(std::process::Stdio::piped());
                    let mut child = cmd.spawn().map_err(|e| anyhow!("执行 sudo 失败: {e}"))?;
                    if let Some(mut stdin) = child.stdin.take() {
                        use tokio::io::AsyncWriteExt;
                        let _ = stdin.write_all(format!("{pass}\n").as_bytes()).await;
                        let _ = stdin.flush().await;
                        drop(stdin);
                    }
                    let output = tokio::time::timeout(
                        std::time::Duration::from_secs(5),
                        child.wait_with_output(),
                    )
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
        })
    }

    fn setup_child_process(&self, cmd: &mut tokio::process::Command) {
        #[cfg(unix)]
        cmd.process_group(0);
        #[cfg(not(unix))]
        let _ = cmd;
    }

    fn tun_permission_error_guide(&self, err: &str, _singbox_bin: &Path) -> String {
        format!(
            "TUN 模式启动失败 ({err}): 创建虚拟网卡需系统管理员 (root) 权限。请输入系统 Sudo 密码授权运行。"
        )
    }

    fn is_pid_alive(&self, pid: u32) -> bool {
        if pid <= 1 || pid > (i32::MAX as u32) {
            return false;
        }
        #[cfg(unix)]
        {
            unsafe extern "C" {
                fn kill(pid: i32, sig: i32) -> i32;
            }
            // SAFETY: kill with signal 0 checks process existence without sending a signal.
            // pid is verified to be > 1 and <= i32::MAX.
            let res = unsafe { kill(pid as i32, 0) };
            if res != 0 {
                let errno = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
                if errno != 1 {
                    // Not found (ESRCH = 3) -> process does not exist
                    return false;
                }
            }

            // kill with signal 0 returns 0 for Zombie processes (Z state), so verify with ps
            if let Ok(output) = std::process::Command::new("ps")
                .args(["-o", "state=", "-p", &pid.to_string()])
                .output()
            {
                if !output.status.success() {
                    return false;
                }
                let state = String::from_utf8_lossy(&output.stdout);
                let trimmed = state.trim();
                if trimmed.is_empty() || trimmed.starts_with('Z') || trimmed.contains("defunct") {
                    return false;
                }
            } else {
                return false;
            }

            true
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
            false
        }
    }

    fn detect_conflicting_processes(
        &self,
        managed_pid: Option<u32>,
        running_config_path: &Path,
    ) -> Vec<ConflictingProcessInfo> {
        #[cfg(unix)]
        {
            let current_pid = std::process::id();
            let config_variants = get_config_path_variants(running_config_path);
            let mut results: Vec<ConflictingProcessInfo> = Vec::new();
            let mut seen_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();

            if let Ok(output) = std::process::Command::new("ps")
                .args(["-eo", "pid,ppid,state,comm,args"])
                .output()
                && output.status.success()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut procs = Vec::new();
                let mut children_map: std::collections::HashMap<u32, Vec<u32>> =
                    std::collections::HashMap::new();

                for line in stdout.lines().skip(1) {
                    let trimmed = line.trim();
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 4
                        && let (Ok(pid), Ok(ppid)) =
                            (parts[0].parse::<u32>(), parts[1].parse::<u32>())
                    {
                        if pid <= 1 {
                            continue;
                        }
                        let state = parts[2];
                        if state.starts_with('Z') {
                            continue; // Skip zombie processes
                        }
                        let comm = parts[3];
                        let full_cmd = if parts.len() >= 5 {
                            parts[4..].join(" ")
                        } else {
                            comm.to_string()
                        };
                        if full_cmd.contains("<defunct>") {
                            continue;
                        }

                        children_map.entry(ppid).or_default().push(pid);
                        procs.push(RawProc {
                            pid,
                            comm: comm.to_string(),
                            full_cmd,
                        });
                    }
                }

                // Recursively gather all descendant PIDs of current_pid and managed_pid
                let mut excluded_pids: std::collections::HashSet<u32> =
                    std::collections::HashSet::new();
                let mut queue = Vec::new();
                queue.push(current_pid);
                if let Some(mpid) = managed_pid {
                    queue.push(mpid);
                }

                while let Some(parent) = queue.pop() {
                    excluded_pids.insert(parent);
                    if let Some(children) = children_map.get(&parent) {
                        for &child in children {
                            if excluded_pids.insert(child) {
                                queue.push(child);
                            }
                        }
                    }
                }

                for proc in procs {
                    if excluded_pids.contains(&proc.pid) {
                        continue;
                    }

                    let is_subout = proc.comm == "subout"
                        || proc.comm.contains("subout")
                        || proc.full_cmd.contains("subout web")
                        || proc.full_cmd.contains("target/debug/subout")
                        || proc.full_cmd.contains("target/release/subout")
                        || proc.full_cmd.contains("cargo")
                        || (managed_pid.is_some()
                            && config_variants.iter().any(|v| proc.full_cmd.contains(v)));

                    if is_subout {
                        continue;
                    }

                    let is_singbox = proc.comm == "sing-box"
                        || proc.comm.ends_with("/sing-box")
                        || proc.comm.contains("sing-box")
                        || proc.full_cmd.starts_with("/usr/bin/sing-box")
                        || proc.full_cmd.starts_with("/usr/local/bin/sing-box")
                        || proc.full_cmd.starts_with("/opt/homebrew/bin/sing-box")
                        || proc.full_cmd.starts_with("sing-box ")
                        || proc.full_cmd.contains("/sing-box run")
                        || proc.full_cmd.contains("sing-box run")
                        || proc.full_cmd.contains("sing-box -D")
                        || proc.full_cmd.contains("sing-box -C");

                    if is_singbox && seen_pids.insert(proc.pid) {
                        results.push(ConflictingProcessInfo {
                            pid: proc.pid,
                            name: proc.comm,
                            cmdline: Some(proc.full_cmd),
                            exe_path: None,
                        });
                    }
                }
            }

            results
        }
        #[cfg(not(unix))]
        {
            let _ = (managed_pid, running_config_path);
            Vec::new()
        }
    }

    fn kill_process<'a>(
        &'a self,
        pid: u32,
        sudo_pass: Option<&'a str>,
        sig: i32,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            if pid <= 1 || pid > (i32::MAX as u32) {
                return;
            }
            #[cfg(unix)]
            {
                unsafe extern "C" {
                    fn kill(pid: i32, sig: i32) -> i32;
                }
                let pid_i32 = pid as i32;
                // SAFETY: pid is validated to be > 1 and <= i32::MAX.
                // -pid_i32 targets the process group, and pid_i32 targets the individual process.
                unsafe {
                    let _ = kill(-pid_i32, sig);
                    let _ = kill(pid_i32, sig);
                }
                if let Some(pass) = sudo_pass {
                    let sig_arg = format!("-{sig}");
                    let pgid_arg = format!("-{pid}");
                    let pid_str = pid.to_string();
                    let _ = self
                        .run_sudo_command("/bin/kill", &[&sig_arg, &pid_str], Some(pass))
                        .await;
                    let _ = self
                        .run_sudo_command("/bin/kill", &[&sig_arg, &pgid_arg], Some(pass))
                        .await;
                }
            }
            #[cfg(not(unix))]
            {
                let _ = (pid, sudo_pass, sig);
            }
        })
    }

    fn kill_all_subout_processes<'a>(
        &'a self,
        sudo_pass: Option<&'a str>,
        exclude_pid: Option<u32>,
        running_config_path: &'a Path,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            #[cfg(unix)]
            {
                let current_pid = std::process::id();
                let config_variants = get_config_path_variants(running_config_path);
                let mut pids_to_kill: Vec<u32> = Vec::new();

                if let Ok(output) = std::process::Command::new("ps")
                    .args(["-eo", "pid,ppid,comm,args"])
                    .output()
                    && output.status.success()
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines().skip(1) {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if parts.len() >= 3
                            && let (Ok(pid), Ok(ppid)) =
                                (parts[0].parse::<u32>(), parts[1].parse::<u32>())
                        {
                            if pid == current_pid || pid <= 1 || Some(pid) == exclude_pid {
                                continue;
                            }
                            let full_cmd = parts[2..].join(" ");
                            let is_subout_instance =
                                config_variants.iter().any(|v| full_cmd.contains(v))
                                    || (exclude_pid.is_some() && Some(ppid) == exclude_pid);
                            if is_subout_instance {
                                pids_to_kill.push(pid);
                            }
                        }
                    }
                }

                if pids_to_kill.is_empty() {
                    return;
                }

                for &pid in &pids_to_kill {
                    self.kill_process(pid, sudo_pass, 15).await;
                }

                // 轮询检查最多等待 2500ms，每 50ms 检测一次，若所有进程已退出则提前返回
                let max_wait = tokio::time::Duration::from_millis(2500);
                let start_time = tokio::time::Instant::now();
                while start_time.elapsed() < max_wait {
                    let any_alive = pids_to_kill.iter().any(|&p| self.is_pid_alive(p));
                    if !any_alive {
                        break;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                }

                for &pid in &pids_to_kill {
                    if self.is_pid_alive(pid) {
                        self.kill_process(pid, sudo_pass, 9).await;
                    }
                }
            }
            #[cfg(not(unix))]
            {
                let _ = (sudo_pass, exclude_pid, running_config_path);
            }
        })
    }

    fn stop_external_service_or_process<'a>(
        &'a self,
        pid: u32,
        sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let as_root = self.is_running_as_root();

            // If a sudo password was explicitly supplied, validate it first
            if !as_root && let Some(pass) = sudo_pass {
                self.run_sudo_command("true", &[], Some(pass)).await?;
            }

            // 1. Direct SIGTERM signal to PID and process group
            self.kill_process(pid, sudo_pass, 15).await;

            // Wait briefly (up to 400ms) for graceful termination
            for _ in 0..4 {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                if !self.is_pid_alive(pid) {
                    break;
                }
            }

            // 2. Escalate immediately to SIGKILL if still alive
            if self.is_pid_alive(pid) {
                self.kill_process(pid, sudo_pass, 9).await;
            }

            // 3. Check and unload any matching launchd plists if detected/existing
            let mut candidate_plists = vec![
                "/Library/LaunchDaemons/io.github.geekdex.subout.plist".to_string(),
                "/Library/LaunchDaemons/com.geekdex.subout.plist".to_string(),
                "/Library/LaunchDaemons/com.subout.server.plist".to_string(),
                "/Library/LaunchDaemons/sing-box.plist".to_string(),
                "/Library/LaunchDaemons/homebrew.mxcl.sing-box.plist".to_string(),
                "/Library/LaunchDaemons/com.sagernet.sing-box.plist".to_string(),
                "/Library/LaunchAgents/io.github.geekdex.subout.plist".to_string(),
                "/Library/LaunchAgents/sing-box.plist".to_string(),
                "/Library/LaunchAgents/homebrew.mxcl.sing-box.plist".to_string(),
                "/Library/LaunchAgents/com.sagernet.sing-box.plist".to_string(),
            ];
            if let Some(home) = dirs::home_dir() {
                let home_agents = home.join("Library/LaunchAgents");
                candidate_plists.push(
                    home_agents
                        .join("io.github.geekdex.subout.plist")
                        .to_string_lossy()
                        .to_string(),
                );
                candidate_plists.push(
                    home_agents
                        .join("sing-box.plist")
                        .to_string_lossy()
                        .to_string(),
                );
                candidate_plists.push(
                    home_agents
                        .join("homebrew.mxcl.sing-box.plist")
                        .to_string_lossy()
                        .to_string(),
                );
                candidate_plists.push(
                    home_agents
                        .join("com.sagernet.sing-box.plist")
                        .to_string_lossy()
                        .to_string(),
                );
            }

            for plist in &candidate_plists {
                if std::path::Path::new(plist).exists() {
                    let _ = tokio::process::Command::new("launchctl")
                        .args(["unload", "-w", plist])
                        .output()
                        .await;
                    if !as_root && sudo_pass.is_some() {
                        let _ = self
                            .run_sudo_command("launchctl", &["unload", "-w", plist], sudo_pass)
                            .await;
                    }
                }
            }

            // 4. Try brew services stop in user mode if brew exists
            if !as_root {
                let _ = tokio::process::Command::new("brew")
                    .args(["services", "stop", "sing-box"])
                    .output()
                    .await;
            }

            Ok(())
        })
    }

    fn external_process_stop_failed_message(&self, pid: u32, has_sudo_pass: bool) -> String {
        if !has_sudo_pass && !self.is_running_as_root() {
            format!(
                "外部进程 (PID: {pid}) 属于系统守护进程或 Root 用户，未能直接终止。请在弹窗中输入系统的 Sudo 密码授权接管，或在终端执行 brew services stop sing-box / sudo kill -9 {pid}"
            )
        } else {
            format!(
                "终止/接管外部进程 (PID: {pid}) 失败：进程仍在运行。请检查输入的 Sudo 密码是否正确，或在系统终端执行 brew services stop sing-box / sudo kill -9 {pid}"
            )
        }
    }

    fn diagnose_takeover_conflict(
        &self,
        managed_pid: Option<u32>,
    ) -> BoxFuture<'_, Result<crate::platform::TakeoverDiagnoseResult>> {
        Box::pin(async move {
            let running_config_path =
                crate::service::SingBoxServiceManager::get_running_config_path();
            let conflicts = self.detect_conflicting_processes(managed_pid, &running_config_path);
            if conflicts.is_empty() {
                return Ok(crate::platform::TakeoverDiagnoseResult::no_conflict());
            }

            let pids: Vec<u32> = conflicts.iter().map(|c| c.pid).collect();

            // 1. Check launchd
            let mut launchd_detected = false;
            let mut plist_path = None;
            let mut service_display_name = "macOS launchd 系统守护服务".to_string();

            if let Ok(output) = tokio::process::Command::new("launchctl")
                .arg("list")
                .output()
                .await
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if line.contains("io.github.geekdex.subout")
                        || line.contains("com.geekdex.subout")
                        || line.contains("com.subout.server")
                    {
                        launchd_detected = true;
                        service_display_name = "macOS launchd (Subout 守护服务)".to_string();
                        break;
                    } else if line.contains("sing-box") || line.contains("singbox") {
                        launchd_detected = true;
                        service_display_name = "macOS launchd (sing-box 守护服务)".to_string();
                        break;
                    }
                }
            }

            if !launchd_detected {
                let mut candidate_plists = vec![
                    (
                        PathBuf::from("/Library/LaunchDaemons/io.github.geekdex.subout.plist"),
                        "Subout 系统守护服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchDaemons/com.geekdex.subout.plist"),
                        "Subout 系统守护服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchDaemons/com.subout.server.plist"),
                        "Subout 系统守护服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchDaemons/sing-box.plist"),
                        "sing-box 系统守护服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchDaemons/homebrew.mxcl.sing-box.plist"),
                        "Homebrew sing-box 服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchDaemons/com.sagernet.sing-box.plist"),
                        "sing-box 系统守护服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchAgents/io.github.geekdex.subout.plist"),
                        "Subout 用户守护服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchAgents/sing-box.plist"),
                        "sing-box 用户守护服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchAgents/homebrew.mxcl.sing-box.plist"),
                        "Homebrew sing-box 服务",
                    ),
                    (
                        PathBuf::from("/Library/LaunchAgents/com.sagernet.sing-box.plist"),
                        "sing-box 用户守护服务",
                    ),
                ];
                if let Some(home) = dirs::home_dir() {
                    candidate_plists.push((
                        home.join("Library/LaunchAgents/io.github.geekdex.subout.plist"),
                        "Subout 用户服务",
                    ));
                    candidate_plists.push((
                        home.join("Library/LaunchAgents/sing-box.plist"),
                        "sing-box 用户服务",
                    ));
                    candidate_plists.push((
                        home.join("Library/LaunchAgents/homebrew.mxcl.sing-box.plist"),
                        "Homebrew sing-box 服务",
                    ));
                    candidate_plists.push((
                        home.join("Library/LaunchAgents/com.sagernet.sing-box.plist"),
                        "sing-box 用户服务",
                    ));
                }
                for (path, label) in candidate_plists {
                    if path.is_file() {
                        launchd_detected = true;
                        plist_path = Some(path.to_string_lossy().to_string());
                        service_display_name = format!("macOS launchd ({label})");
                        break;
                    }
                }
            }

            if launchd_detected {
                let unload_cmd = plist_path.as_deref().map_or_else(
                    || "brew services stop sing-box".to_string(),
                    |p| format!("sudo launchctl unload -w \"{p}\""),
                );
                let msg = format!(
                    "检测到外部 macOS launchd 守护服务正在管理 sing-box 或 Subout{}。外部守护进程具备 KeepAlive 自动拉起机制，直接强制结束会被系统再次重启。Subout 支持通过 Sudo 授权一键卸载外部守护服务并释放端口，也可复制右侧命令在终端手动解除。",
                    plist_path
                        .as_ref()
                        .map(|p| format!(" ({p})"))
                        .unwrap_or_default()
                );
                return Ok(crate::platform::TakeoverDiagnoseResult {
                    has_conflict: true,
                    conflict_type: Some("launchd".to_string()),
                    conflict_name: Some(service_display_name),
                    suggestion_command: Some(unload_cmd.clone()),
                    suggestion: Some(format!(
                        "外部进程受 launchd 托管守护。建议点击「一键接管并终止冲突进程」授权接管，或在终端执行解除命令：{unload_cmd}"
                    )),
                    message: msg.clone(),
                    details: msg,
                    pids,
                    can_auto_takeover: true,
                });
            }

            if !pids.is_empty() {
                let kill_cmd = format!(
                    "sudo kill -9 {}",
                    pids.iter()
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                        .join(" ")
                );
                let pid_str = pids
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(", ");
                let msg = format!(
                    "检测到 {} 个正在运行的外部 sing-box 进程 (PID: {})。这些进程可能正在占用代理端口 (如 7890/2080) 或 TUN 虚拟网卡，导致 Subout 无法正常启动或网络冲突。",
                    pids.len(),
                    pid_str
                );
                return Ok(crate::platform::TakeoverDiagnoseResult {
                    has_conflict: true,
                    conflict_type: Some("running_processes".to_string()),
                    conflict_name: Some("外部独立 sing-box 进程".to_string()),
                    suggestion_command: Some(kill_cmd),
                    suggestion: Some("建议点击「一键接管并终止冲突进程」，由 Subout 自动清理冲突进程并释放端口；也可复制下方命令在终端手动终止。".to_string()),
                    message: msg.clone(),
                    details: msg,
                    pids,
                    can_auto_takeover: true,
                });
            }

            Ok(crate::platform::TakeoverDiagnoseResult::no_conflict())
        })
    }

    fn enable_system_proxy(&self, port: u16, sudo_pass: Option<&str>) {
        let services = get_macos_network_services();
        let port_str = port.to_string();
        for svc in services {
            run_macos_netsetup(&["-setwebproxy", &svc, "127.0.0.1", &port_str], sudo_pass);
            run_macos_netsetup(
                &["-setsecurewebproxy", &svc, "127.0.0.1", &port_str],
                sudo_pass,
            );
            run_macos_netsetup(
                &["-setsocksfirewallproxy", &svc, "127.0.0.1", &port_str],
                sudo_pass,
            );
            run_macos_netsetup(&["-setwebproxystate", &svc, "on"], sudo_pass);
            run_macos_netsetup(&["-setsecurewebproxystate", &svc, "on"], sudo_pass);
            run_macos_netsetup(&["-setsocksfirewallproxystate", &svc, "on"], sudo_pass);
        }
    }

    fn disable_system_proxy(&self, sudo_pass: Option<&str>) {
        let services = get_macos_network_services();
        for svc in services {
            run_macos_netsetup(&["-setwebproxystate", &svc, "off"], sudo_pass);
            run_macos_netsetup(&["-setsecurewebproxystate", &svc, "off"], sudo_pass);
            run_macos_netsetup(&["-setsocksfirewallproxystate", &svc, "off"], sudo_pass);
        }
    }

    fn enable_tun_dns(&self, dns_ip: &str, sudo_pass: Option<&str>) {
        let services = get_macos_network_services();
        for svc in services {
            run_macos_netsetup(&["-setdnsservers", &svc, dns_ip], sudo_pass);
        }
    }

    fn disable_tun_dns(&self, sudo_pass: Option<&str>) {
        let services = get_macos_network_services();
        for svc in services {
            run_macos_netsetup(&["-setdnsservers", &svc, "empty"], sudo_pass);
        }
    }

    fn sanitize_inbound(&self, inbound: &mut Value) {
        if let Some(obj) = inbound.as_object_mut() {
            obj.remove("auto_redirect");
            let is_tun = obj.get("type").and_then(|t| t.as_str()) == Some("tun");
            if is_tun {
                // Non-Linux systems (macOS) must never enable auto_route
                if let Some(ar) = obj.get_mut("auto_route") {
                    *ar = serde_json::json!(false);
                }
                if let Some(iface) = obj.get("interface_name").and_then(|i| i.as_str())
                    && (iface == "tun0" || iface.is_empty() || !iface.starts_with("utun"))
                {
                    obj.remove("interface_name");
                }
            }
        }
    }

    fn default_tun_interface_name(&self) -> &'static str {
        ""
    }

    fn default_tun_strict_route(&self) -> bool {
        true
    }

    fn effective_tun_stack<'a>(&self, configured_stack: &'a str) -> &'a str {
        if configured_stack == "system" {
            "mixed"
        } else {
            configured_stack
        }
    }

    fn default_data_dir(&self) -> PathBuf {
        PathBuf::from("/Library/Application Support/Subout")
    }

    fn default_config_dir(&self, _data_dir: &Path) -> PathBuf {
        PathBuf::from("/Library/Application Support/Subout/config")
    }

    fn default_log_dir(&self, _data_dir: &Path) -> PathBuf {
        PathBuf::from("/Library/Logs/Subout")
    }

    fn default_runtime_dir(&self, _data_dir: &Path) -> PathBuf {
        PathBuf::from("/Library/Application Support/Subout/run")
    }

    fn kernel_binary_name(&self) -> &'static str {
        "sing-box"
    }

    fn standard_singbox_candidates(&self, _binary_name: &str) -> Vec<PathBuf> {
        vec![
            PathBuf::from("/usr/local/bin/sing-box"),
            PathBuf::from("/opt/homebrew/bin/sing-box"),
            PathBuf::from("/opt/local/bin/sing-box"),
            PathBuf::from("/usr/bin/sing-box"),
            PathBuf::from("/Library/Application Support/Subout/bin/sing-box"),
        ]
    }

    fn legacy_db_candidates(&self, _config_dir: &Path) -> Vec<PathBuf> {
        vec![PathBuf::from(
            "/Library/Application Support/subout/subout.db",
        )]
    }

    fn find_in_path(&self, cmd_name: &str) -> Option<PathBuf> {
        if let Ok(output) = std::process::Command::new("which").arg(cmd_name).output()
            && output.status.success()
        {
            let out_str = String::from_utf8_lossy(&output.stdout);
            for line in out_str.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    let p = PathBuf::from(trimmed);
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
        None
    }
}

pub fn get_macos_network_services() -> Vec<String> {
    let Ok(output) = std::process::Command::new("networksetup")
        .arg("-listallnetworkservices")
        .output()
    else {
        return Vec::new();
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.starts_with('*') && !trimmed.contains("An asterisk")
        })
        .map(|s| s.trim().to_string())
        .collect()
}

pub fn run_macos_netsetup(args: &[&str], sudo_pass: Option<&str>) {
    #[cfg(unix)]
    {
        use crate::platform::PlatformStrategy;
        if MacOsPlatform.is_running_as_root() {
            let _ = std::process::Command::new("networksetup")
                .args(args)
                .output();
        } else if let Some(pass) = sudo_pass {
            use std::io::Write;
            let Ok(mut child) = std::process::Command::new("sudo")
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
            else {
                return;
            };
            if let Some(mut stdin) = child.stdin.take() {
                let _ = writeln!(stdin, "{pass}");
            }
            let _ = child.wait();
        } else {
            let _ = std::process::Command::new("networksetup")
                .args(args)
                .output();
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (args, sudo_pass);
    }
}
