use std::path::{Path, PathBuf};
use anyhow::Result;
#[cfg(unix)]
use anyhow::anyhow;
use serde_json::{Value, json};

use crate::platform::{BoxFuture, PlatformStrategy};
use crate::service::ConflictingProcessInfo;

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

    fn setup_child_process(&self, cmd: &mut tokio::process::Command) {
        #[cfg(unix)]
        cmd.process_group(0);
        #[cfg(not(unix))]
        let _ = cmd;
    }

    fn tun_permission_error_guide(&self, err: &str, _singbox_bin: &Path) -> String {
        format!(
            "TUN 模式启动失败 ({}): 创建虚拟网卡需系统管理员 (root) 权限。请输入系统 Sudo 密码授权运行。",
            err
        )
    }

    fn is_pid_alive(&self, pid: u32) -> bool {
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

            if let Ok(output) = std::process::Command::new("ps")
                .args(["-eo", "pid,ppid,comm,args"])
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines().skip(1) {
                        let trimmed = line.trim();
                        let parts: Vec<&str> = trimmed.split_whitespace().collect();
                        if parts.len() >= 3 {
                            if let (Ok(pid), Ok(ppid)) =
                                (parts[0].parse::<u32>(), parts[1].parse::<u32>())
                            {
                                if pid == current_pid
                                    || Some(pid) == managed_pid
                                    || pid == 0
                                    || pid == 1
                                {
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
            #[cfg(unix)]
            {
                unsafe extern "C" {
                    fn kill(pid: i32, sig: i32) -> i32;
                }
                unsafe {
                    let _ = kill(-(pid as i32), sig);
                    let _ = kill(pid as i32, sig);
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
                {
                    if output.status.success() {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        for line in stdout.lines().skip(1) {
                            let parts: Vec<&str> = line.trim().split_whitespace().collect();
                            if parts.len() >= 3 {
                                if let (Ok(pid), Ok(ppid)) =
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

            // 1. Try brew services stop sing-box
            let _ = tokio::process::Command::new("brew")
                .args(["services", "stop", "sing-box"])
                .output()
                .await;
            let _ = tokio::process::Command::new("brew")
                .args(["services", "stop", "singbox"])
                .output()
                .await;
            if !as_root {
                let _ = self
                    .run_sudo_command("brew", &["services", "stop", "sing-box"], sudo_pass)
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
                "外部进程 (PID: {}) 属于系统守护进程或 Root 用户，未能直接终止。请在弹窗中输入系统的 Sudo 密码进行授权终止，或在终端执行 sudo kill -9 {}",
                pid, pid
            )
        } else {
            format!(
                "终止外部进程 (PID: {}) 失败：进程仍在运行。请检查输入的 Sudo 密码是否正确，或在系统终端执行 sudo kill -9 {}",
                pid, pid
            )
        }
    }

    fn enable_system_proxy(&self, port: u16, sudo_pass: Option<&str>) {
        let services = get_macos_network_services();
        let port_str = port.to_string();
        for svc in services {
            run_macos_netsetup(&["-setwebproxy", &svc, "127.0.0.1", &port_str], sudo_pass);
            run_macos_netsetup(&["-setsecurewebproxy", &svc, "127.0.0.1", &port_str], sudo_pass);
            run_macos_netsetup(&["-setsocksfirewallproxy", &svc, "127.0.0.1", &port_str], sudo_pass);
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
            let is_tun = obj.get("type").and_then(|t| t.as_str()) == Some("tun");
            obj.remove("auto_redirect");
            if is_tun {
                if let Some(iface) = obj.get("interface_name").and_then(|i| i.as_str()) {
                    if iface == "tun0" || iface.is_empty() || !iface.starts_with("utun") {
                        obj.remove("interface_name");
                    }
                }

                // On macOS, FakeIP and TUN transparent proxy require stack: "mixed" or "gvisor".
                let current_stack = obj.get("stack").and_then(|s| s.as_str());
                if current_stack.is_none() || current_stack == Some("system") {
                    obj.insert("stack".to_string(), json!("mixed"));
                }

                // Ensure IPv6 dual-stack address is present on macOS to prevent leakage
                if let Some(addr_arr) = obj.get_mut("address").and_then(|v| v.as_array_mut()) {
                    let has_ipv6 = addr_arr.iter().any(|a| a.as_str().map_or(false, |s| s.contains(':')));
                    if !has_ipv6 {
                        addr_arr.push(json!("fd00::1/126"));
                    }
                } else {
                    obj.insert("address".to_string(), json!(["172.19.0.1/30", "fd00::1/126"]));
                }

                // macOS strict_route MUST be true
                obj.insert("strict_route".to_string(), json!(true));
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
        vec![PathBuf::from("/Library/Application Support/subout/subout.db")]
    }

    fn find_in_path(&self, cmd_name: &str) -> Option<PathBuf> {
        if let Ok(output) = std::process::Command::new("which")
            .arg(cmd_name)
            .output()
        {
            if output.status.success() {
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
        }
        None
    }
}

pub fn get_macos_network_services() -> Vec<String> {
    let output = match std::process::Command::new("networksetup")
        .arg("-listallnetworkservices")
        .output()
    {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
                && !trimmed.starts_with('*')
                && !trimmed.contains("An asterisk")
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
            let mut child = match std::process::Command::new("sudo")
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
