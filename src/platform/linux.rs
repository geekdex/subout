use anyhow::Result;
#[cfg(unix)]
use anyhow::anyhow;
use serde_json::Value;
use std::path::{Path, PathBuf};

use crate::platform::{BoxFuture, PlatformStrategy};
use crate::service::ConflictingProcessInfo;

pub struct LinuxPlatform;

impl PlatformStrategy for LinuxPlatform {
    fn os_name(&self) -> &'static str {
        "linux"
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
                    let mut child = cmd.spawn().map_err(|e| anyhow!("执行 sudo 失败: {}", e))?;
                    if let Some(mut stdin) = child.stdin.take() {
                        use tokio::io::AsyncWriteExt;
                        let _ = stdin.write_all(format!("{}\n", pass).as_bytes()).await;
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

    fn setup_child_process(&self, _cmd: &mut tokio::process::Command) {
        #[cfg(unix)]
        _cmd.process_group(0);

        #[cfg(target_os = "linux")]
        // SAFETY: pre_exec is invoked in the child process right before exec.
        // prctl(PR_SET_PDEATHSIG, ...) is an async-signal-safe system call.
        unsafe {
            _cmd.pre_exec(|| {
                unsafe extern "C" {
                    fn prctl(option: i32, arg2: u64, arg3: u64, arg4: u64, arg5: u64) -> i32;
                }
                // PR_SET_PDEATHSIG = 1. Signal = SIGTERM (15).
                // Automatically kills child process if parent exits.
                let _ = prctl(1, 15, 0, 0, 0);
                Ok(())
            });
        }
    }

    fn tun_permission_error_guide(&self, err: &str, singbox_bin: &Path) -> String {
        format!(
            "TUN 模式启动失败 ({}): 创建虚拟网卡需系统管理员 (root) 权限。请输入系统 Sudo 密码授权运行，或在终端执行 sudo setcap cap_net_admin=+ep {:?} (Linux) 授权免密运行。",
            err, singbox_bin
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
            if res == 0 {
                true
            } else {
                let errno = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
                errno == 1 // EPERM = 1
            }
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
            let config_path_str = running_config_path.to_string_lossy().to_string();
            let mut results: Vec<ConflictingProcessInfo> = Vec::new();
            let mut seen_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();

            // 1. Query ps
            if let Ok(output) = std::process::Command::new("ps")
                .args(["-eo", "pid,ppid,comm,args"])
                .output()
                && output.status.success()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines().skip(1) {
                    let trimmed = line.trim();
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 3
                        && let (Ok(pid), Ok(ppid)) =
                            (parts[0].parse::<u32>(), parts[1].parse::<u32>())
                    {
                        if pid == current_pid || Some(pid) == managed_pid || pid == 0 || pid == 1 {
                            continue;
                        }
                        if ppid == current_pid
                            || (managed_pid.is_some() && Some(ppid) == managed_pid)
                        {
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

                        if is_singbox && seen_pids.insert(pid) {
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

            // 2. Linux /proc inspection
            if let Ok(entries) = std::fs::read_dir("/proc") {
                for entry in entries.flatten() {
                    let file_name = entry.file_name();
                    let pid_str = file_name.to_string_lossy();
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if pid == current_pid
                            || Some(pid) == managed_pid
                            || pid == 0
                            || pid == 1
                            || seen_pids.contains(&pid)
                        {
                            continue;
                        }

                        let proc_path = entry.path();
                        let stat_path = proc_path.join("stat");
                        if let Ok(stat_str) = std::fs::read_to_string(&stat_path)
                            && let Some(rparen) = stat_str.rfind(')')
                        {
                            let after = stat_str[rparen + 1..].trim_start();
                            let stat_parts: Vec<&str> = after.split_whitespace().collect();
                            if stat_parts.len() >= 2
                                && let Ok(ppid) = stat_parts[1].parse::<u32>()
                                && (ppid == current_pid
                                    || (managed_pid.is_some() && Some(ppid) == managed_pid))
                            {
                                continue;
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

                        let cmdline = std::fs::read(&cmdline_path).ok().map(|bytes| {
                            bytes
                                .split(|&b| b == 0)
                                .filter(|slice| !slice.is_empty())
                                .map(|slice| String::from_utf8_lossy(slice).to_string())
                                .collect::<Vec<_>>()
                                .join(" ")
                        });

                        let is_subout = comm == "subout"
                            || comm.contains("subout")
                            || cmdline
                                .as_deref()
                                .map(|c| {
                                    c.contains("subout")
                                        || c.contains(&config_path_str)
                                        || c.contains("sing-box-running.json")
                                })
                                .unwrap_or(false);

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
                                .map(|c| {
                                    c.starts_with("sing-box ")
                                        || c.contains("/sing-box ")
                                        || c.contains("sing-box run")
                                        || c == "sing-box"
                                })
                                .unwrap_or(false);

                        if is_singbox && seen_pids.insert(pid) {
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

            // 3. Systemd inspection
            if let Ok(output) = std::process::Command::new("systemctl")
                .args(["show", "sing-box", "-p", "MainPID", "-p", "ActiveState"])
                .output()
                && output.status.success()
            {
                let out_str = String::from_utf8_lossy(&output.stdout);
                let mut is_active = false;
                let mut s_pid = 0u32;
                for line in out_str.lines() {
                    if line.starts_with("ActiveState=active") {
                        is_active = true;
                    } else if line.starts_with("MainPID=")
                        && let Ok(p) = line.trim_start_matches("MainPID=").trim().parse::<u32>()
                    {
                        s_pid = p;
                    }
                }
                if is_active
                    && s_pid > 1
                    && s_pid != current_pid
                    && Some(s_pid) != managed_pid
                    && seen_pids.insert(s_pid)
                {
                    results.push(ConflictingProcessInfo {
                        pid: s_pid,
                        name: "sing-box (systemd)".to_string(),
                        cmdline: Some("systemctl: sing-box.service (Active)".to_string()),
                        exe_path: Some("/usr/bin/sing-box".to_string()),
                    });
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
                    let sig_arg = format!("-{}", sig);
                    let _ = self
                        .run_sudo_command("kill", &[&sig_arg, &pid.to_string()], Some(pass))
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
                let config_path_str = running_config_path.to_string_lossy().to_string();
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

                if let Ok(entries) = std::fs::read_dir("/proc") {
                    for entry in entries.flatten() {
                        if let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() {
                            if pid == current_pid
                                || pid <= 1
                                || Some(pid) == exclude_pid
                                || pids_to_kill.contains(&pid)
                            {
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
                                if cmdline.contains(&config_path_str)
                                    || cmdline.contains("sing-box-running.json")
                                {
                                    pids_to_kill.push(pid);
                                }
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

                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

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

            // 1. Try systemctl disable & stop to prevent competing auto-start on next boot
            if as_root {
                let _ = tokio::process::Command::new("systemctl")
                    .args(["disable", "sing-box"])
                    .output()
                    .await;
                let _ = tokio::process::Command::new("systemctl")
                    .args(["disable", "sing-box.service"])
                    .output()
                    .await;
                let _ = tokio::process::Command::new("systemctl")
                    .args(["disable", "singbox"])
                    .output()
                    .await;
                let _ = tokio::process::Command::new("systemctl")
                    .args(["disable", "singbox.service"])
                    .output()
                    .await;

                let _ = tokio::process::Command::new("systemctl")
                    .args(["stop", "sing-box"])
                    .output()
                    .await;
                let _ = tokio::process::Command::new("systemctl")
                    .args(["stop", "sing-box.service"])
                    .output()
                    .await;
                let _ = tokio::process::Command::new("systemctl")
                    .args(["stop", "singbox"])
                    .output()
                    .await;
                let _ = tokio::process::Command::new("systemctl")
                    .args(["stop", "singbox.service"])
                    .output()
                    .await;
            } else if let Some(pass) = sudo_pass {
                let _ = self
                    .run_sudo_command("systemctl", &["disable", "sing-box"], Some(pass))
                    .await;
                let _ = self
                    .run_sudo_command("systemctl", &["disable", "sing-box.service"], Some(pass))
                    .await;
                let _ = self
                    .run_sudo_command("systemctl", &["disable", "singbox"], Some(pass))
                    .await;
                let _ = self
                    .run_sudo_command("systemctl", &["disable", "singbox.service"], Some(pass))
                    .await;

                if let Err(e) = self
                    .run_sudo_command("systemctl", &["stop", "sing-box"], Some(pass))
                    .await
                    && e.to_string().contains("Sudo 密码不正确")
                {
                    return Err(e);
                }
                let _ = self
                    .run_sudo_command("systemctl", &["stop", "sing-box.service"], Some(pass))
                    .await;
                let _ = self
                    .run_sudo_command("systemctl", &["stop", "singbox"], Some(pass))
                    .await;
                let _ = self
                    .run_sudo_command("systemctl", &["stop", "singbox.service"], Some(pass))
                    .await;
            } else {
                let _ = self
                    .run_sudo_command("systemctl", &["disable", "sing-box"], None)
                    .await;
                let _ = self
                    .run_sudo_command("systemctl", &["disable", "sing-box.service"], None)
                    .await;
                let _ = self
                    .run_sudo_command("systemctl", &["stop", "sing-box"], None)
                    .await;
                let _ = self
                    .run_sudo_command("systemctl", &["stop", "sing-box.service"], None)
                    .await;
            }

            // 2. Direct SIGTERM signal
            self.kill_process(pid, sudo_pass, 15).await;

            // 3. If still alive after 400ms, escalate to SIGKILL
            tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;
            if self.is_pid_alive(pid) {
                self.kill_process(pid, sudo_pass, 9).await;
            }

            Ok(())
        })
    }

    fn external_process_stop_failed_message(&self, pid: u32, has_sudo_pass: bool) -> String {
        if !has_sudo_pass && !self.is_running_as_root() {
            format!(
                "外部进程 (PID: {}) 属于系统守护进程或 Root 用户，未获权限终止。请在弹窗中输入系统的 Sudo 密码授权接管，或在系统终端中执行 sudo systemctl stop sing-box && sudo systemctl disable sing-box",
                pid
            )
        } else {
            format!(
                "终止/接管外部进程 (PID: {}) 失败：进程仍在运行。请检查输入的 Sudo 密码是否正确，或在系统终端执行 sudo systemctl stop sing-box && sudo systemctl disable sing-box / sudo kill -9 {}",
                pid, pid
            )
        }
    }

    fn enable_system_proxy(&self, _port: u16, _sudo_pass: Option<&str>) {}

    fn disable_system_proxy(&self, _sudo_pass: Option<&str>) {}

    fn enable_tun_dns(&self, _dns_ip: &str, _sudo_pass: Option<&str>) {}

    fn disable_tun_dns(&self, _sudo_pass: Option<&str>) {}

    fn sanitize_inbound(&self, inbound: &mut Value) {
        if let Some(obj) = inbound.as_object_mut() {
            let is_tun = obj.get("type").and_then(|t| t.as_str()) == Some("tun");
            if is_tun {
                if !obj.contains_key("strict_route") {
                    obj.insert("strict_route".to_string(), serde_json::json!(false));
                }
                if let Some(addr_arr) = obj.get_mut("address").and_then(|v| v.as_array_mut()) {
                    let has_ipv6 = addr_arr
                        .iter()
                        .any(|a| a.as_str().is_some_and(|s| s.contains(':')));
                    if !has_ipv6 {
                        addr_arr.push(serde_json::json!("fd00::1/126"));
                    }
                } else if !obj.contains_key("address") {
                    obj.insert(
                        "address".to_string(),
                        serde_json::json!(["172.19.0.1/30", "fd00::1/126"]),
                    );
                }
            }
        }
    }

    fn default_tun_interface_name(&self) -> &'static str {
        "tun0"
    }

    fn default_tun_strict_route(&self) -> bool {
        false
    }

    fn effective_tun_stack<'a>(&self, configured_stack: &'a str) -> &'a str {
        configured_stack
    }

    fn default_data_dir(&self) -> PathBuf {
        PathBuf::from("/var/lib/subout")
    }

    fn default_config_dir(&self, _data_dir: &Path) -> PathBuf {
        PathBuf::from("/etc/subout")
    }

    fn default_log_dir(&self, _data_dir: &Path) -> PathBuf {
        PathBuf::from("/var/log/subout")
    }

    fn default_runtime_dir(&self, _data_dir: &Path) -> PathBuf {
        PathBuf::from("/run/subout")
    }

    fn kernel_binary_name(&self) -> &'static str {
        "sing-box"
    }

    fn standard_singbox_candidates(&self, _binary_name: &str) -> Vec<PathBuf> {
        vec![
            PathBuf::from("/usr/local/bin/sing-box"),
            PathBuf::from("/usr/bin/sing-box"),
            PathBuf::from("/bin/sing-box"),
            PathBuf::from("/usr/sbin/sing-box"),
            PathBuf::from("/var/lib/subout/sing-box/sing-box"),
            PathBuf::from("/var/lib/subout/bin/sing-box"),
        ]
    }

    fn legacy_db_candidates(&self, _config_dir: &Path) -> Vec<PathBuf> {
        vec![PathBuf::from("/var/lib/subout/subout.db")]
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
