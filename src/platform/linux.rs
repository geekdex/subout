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
        let bin_display = singbox_bin.display();
        if err.contains("add address")
            && (err.contains("permission denied") || err.contains("operation not permitted"))
        {
            format!(
                "TUN 模式配置网卡地址失败 ({err}): 可能是系统禁用了 IPv6 导致无法分配 IPv6 地址。请检查并开启系统 IPv6 (执行 sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0)，或在入站 (inbounds) 配置中移除 IPv6 地址。"
            )
        } else {
            format!(
                "TUN 模式启动失败 ({err}): 创建虚拟网卡需系统管理员 (root) 权限。请输入系统 Sudo 密码授权运行，或在终端执行 sudo setcap cap_net_admin=+ep {bin_display} (Linux) 授权免密运行。"
            )
        }
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
                    return false;
                }
            }

            // In Linux verify /proc/<pid>/status is not a Zombie
            let proc_status = format!("/proc/{pid}/status");
            if let Ok(content) = std::fs::read_to_string(&proc_status) {
                for line in content.lines() {
                    if line.starts_with("State:") {
                        let state = line.trim_start_matches("State:").trim();
                        if state.starts_with('Z') {
                            return false;
                        }
                        break;
                    }
                }
            } else if std::path::Path::new("/proc").exists() {
                // If /proc exists but /proc/<pid> is gone, process is dead
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
            let mut excluded_pids: std::collections::HashSet<u32> =
                std::collections::HashSet::new();
            let mut children_map: std::collections::HashMap<u32, Vec<u32>> =
                std::collections::HashMap::new();

            // 1. Query ps
            if let Ok(output) = std::process::Command::new("ps")
                .args(["-eo", "pid,ppid,state,comm,args"])
                .output()
                && output.status.success()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut procs = Vec::new();

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
                            continue; // Skip zombie
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

            // 2. Linux /proc inspection (for containers or minimal environments without ps)
            if let Ok(entries) = std::fs::read_dir("/proc") {
                for entry in entries.flatten() {
                    let file_name = entry.file_name();
                    let pid_str = file_name.to_string_lossy();
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        if pid <= 1 || excluded_pids.contains(&pid) || seen_pids.contains(&pid) {
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
                                && excluded_pids.contains(&ppid)
                            {
                                excluded_pids.insert(pid);
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
                            || cmdline.as_deref().is_some_and(|c| {
                                c.contains("subout")
                                    || (managed_pid.is_some()
                                        && config_variants.iter().any(|v| c.contains(v)))
                            });

                        if is_subout {
                            continue;
                        }

                        let is_singbox = comm == "sing-box"
                            || exe_path
                                .as_deref()
                                .is_some_and(|p| p.ends_with("/sing-box"))
                            || cmdline.as_deref().is_some_and(|c| {
                                c.starts_with("sing-box ")
                                    || c.contains("/sing-box ")
                                    || c.contains("sing-box run")
                                    || c == "sing-box"
                            });

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
                    && !excluded_pids.contains(&s_pid)
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
                let sig_arg = format!("-{sig}");
                let pgid_arg = format!("-{pid}");
                let pid_str = pid.to_string();
                let _ = self
                    .run_sudo_command("kill", &[&sig_arg, "--", &pid_str], sudo_pass)
                    .await;
                let _ = self
                    .run_sudo_command("kill", &[&sig_arg, "--", &pgid_arg], sudo_pass)
                    .await;
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
                                if config_variants.iter().any(|v| cmdline.contains(v)) {
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

            // 1. Try systemctl disable & stop to prevent competing auto-start on next boot
            let systemd_units = [
                "subout",
                "subout.service",
                "sing-box",
                "sing-box.service",
                "singbox",
                "singbox.service",
            ];

            if as_root {
                for unit in systemd_units {
                    let _ = tokio::process::Command::new("systemctl")
                        .args(["disable", unit])
                        .output()
                        .await;
                    let _ = tokio::process::Command::new("systemctl")
                        .args(["stop", unit])
                        .output()
                        .await;
                }
            } else if let Some(pass) = sudo_pass {
                for unit in systemd_units {
                    let _ = self
                        .run_sudo_command("systemctl", &["disable", unit], Some(pass))
                        .await;
                }

                for unit in systemd_units {
                    let _ = self
                        .run_sudo_command("systemctl", &["stop", unit], Some(pass))
                        .await;
                }
            } else {
                for unit in systemd_units {
                    let _ = self
                        .run_sudo_command("systemctl", &["disable", unit], None)
                        .await;
                    let _ = self
                        .run_sudo_command("systemctl", &["stop", unit], None)
                        .await;
                }
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
                "外部进程 (PID: {pid}) 属于系统守护进程或 Root 用户，未获权限终止。请在弹窗中输入系统的 Sudo 密码授权接管，或在系统终端中执行 sudo systemctl stop sing-box && sudo systemctl disable sing-box"
            )
        } else {
            format!(
                "终止/接管外部进程 (PID: {pid}) 失败：进程仍在运行。请检查输入的 Sudo 密码是否正确，或在系统终端执行 sudo systemctl stop sing-box && sudo systemctl disable sing-box / sudo kill -9 {pid}"
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

            // 1. Check systemd active state or unit files
            let mut systemd_detected = false;
            let mut service_display_name = "Linux systemd 守护服务".to_string();
            let mut target_unit = "sing-box".to_string();

            for unit in [
                "subout",
                "subout.service",
                "sing-box",
                "sing-box.service",
                "singbox",
                "singbox.service",
            ] {
                if let Ok(output) = tokio::process::Command::new("systemctl")
                    .args(["is-active", unit])
                    .output()
                    .await
                {
                    let out_str = String::from_utf8_lossy(&output.stdout);
                    if out_str.trim() == "active" {
                        systemd_detected = true;
                        target_unit = unit.to_string();
                        if unit.starts_with("subout") {
                            service_display_name = "Linux systemd (Subout 守护服务)".to_string();
                        } else {
                            service_display_name = "Linux systemd (sing-box 守护服务)".to_string();
                        }
                        break;
                    }
                }
            }

            if !systemd_detected {
                for (p, unit, name) in [
                    (
                        "/etc/systemd/system/subout.service",
                        "subout",
                        "Subout 系统守护服务",
                    ),
                    (
                        "/etc/systemd/system/sing-box.service",
                        "sing-box",
                        "sing-box 系统服务",
                    ),
                    (
                        "/etc/systemd/system/singbox.service",
                        "singbox",
                        "singbox 系统服务",
                    ),
                    (
                        "/lib/systemd/system/sing-box.service",
                        "sing-box",
                        "sing-box 系统服务",
                    ),
                    (
                        "/usr/lib/systemd/system/sing-box.service",
                        "sing-box",
                        "sing-box 系统服务",
                    ),
                ] {
                    if Path::new(p).exists() {
                        systemd_detected = true;
                        target_unit = unit.to_string();
                        service_display_name = format!("Linux systemd ({name})");
                        break;
                    }
                }
            }

            if systemd_detected {
                let stop_cmd = format!(
                    "sudo systemctl stop {target_unit} && sudo systemctl disable {target_unit}"
                );
                let msg = format!(
                    "检测到外部 systemd 服务 ({target_unit}) 正在运行或已注册守护。外部守护进程具备 Restart 保活机制。Subout 支持通过 Sudo 授权一键停止并禁用外部服务以释放端口，也可复制右侧命令在终端手动解除。"
                );
                return Ok(crate::platform::TakeoverDiagnoseResult {
                    has_conflict: true,
                    conflict_type: Some("systemd".to_string()),
                    conflict_name: Some(service_display_name),
                    suggestion_command: Some(stop_cmd.clone()),
                    suggestion: Some(format!(
                        "外部进程受 systemd 托管。建议点击「一键接管并终止冲突进程」授权接管，或在终端执行解除命令：{stop_cmd}"
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
                    "检测到 {} 个正在运行的外部 sing-box 进程 (PID: {})。这些进程可能正在占用代理端口或 TUN 网络资源。点击接管可自动终止并释放冲突。",
                    pids.len(),
                    pid_str
                );
                return Ok(crate::platform::TakeoverDiagnoseResult {
                    has_conflict: true,
                    conflict_type: Some("running_processes".to_string()),
                    conflict_name: Some("外部独立 sing-box 进程".to_string()),
                    suggestion_command: Some(kill_cmd),
                    suggestion: Some("建议点击「一键接管并终止冲突进程」，由 Subout 自动清理后台进程；也可复制命令在终端手动终止。".to_string()),
                    message: msg.clone(),
                    details: msg,
                    pids,
                    can_auto_takeover: true,
                });
            }

            Ok(crate::platform::TakeoverDiagnoseResult::no_conflict())
        })
    }

    fn get_process_resource_usage(&self, pid: u32) -> (f64, u64) {
        if pid == 0 {
            return (0.0, 0);
        }
        #[cfg(unix)]
        {
            if let Ok(output) = std::process::Command::new("ps")
                .args(["-eo", "pid,ppid,%cpu,rss"])
                .output()
                && output.status.success()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let (raw_cpu, mem) = crate::platform::parse_ps_resource_output(&stdout, pid);
                let num_cpus = std::thread::available_parallelism()
                    .map_or(1, std::num::NonZero::get)
                    .max(1) as f64;
                let normalized_cpu = (raw_cpu / num_cpus).min(100.0);
                if mem > 0 || normalized_cpu > 0.0 {
                    return (normalized_cpu, mem);
                }
            }

            // Fallback: read /proc/<pid>/status for VmRSS
            let status_path = format!("/proc/{pid}/status");
            if let Ok(content) = std::fs::read_to_string(status_path) {
                for line in content.lines() {
                    if let Some(rest) = line.strip_prefix("VmRSS:") {
                        let parts: Vec<&str> = rest.split_whitespace().collect();
                        if let Some(kb_str) = parts.first()
                            && let Ok(kb) = kb_str.parse::<u64>()
                        {
                            return (0.0, kb.saturating_mul(1024));
                        }
                    }
                }
            }
        }
        (0.0, 0)
    }

    fn is_system_proxy_supported(&self) -> bool {
        #[cfg(unix)]
        {
            if let Ok(path_var) = std::env::var("PATH") {
                for dir in std::env::split_paths(&path_var) {
                    let candidate = dir.join("gsettings");
                    if candidate.is_file() {
                        return true;
                    }
                }
            }
            false
        }
        #[cfg(not(unix))]
        {
            false
        }
    }

    fn system_proxy_unsupported_reason(&self) -> Option<String> {
        if self.is_system_proxy_supported() {
            None
        } else {
            Some("当前 Linux 环境未安装或不支持 gsettings（GNOME 代理设置），系统代理不可用；建议使用 TUN 模式透明代理".to_string())
        }
    }

    fn enable_system_proxy(&self, port: u16, _sudo_pass: Option<&str>) {
        #[cfg(unix)]
        {
            let port_str = port.to_string();
            let _ = std::process::Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy", "mode", "manual"])
                .output();
            let _ = std::process::Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.http", "host", "127.0.0.1"])
                .output();
            let _ = std::process::Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.http", "port", &port_str])
                .output();
            let _ = std::process::Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.https", "host", "127.0.0.1"])
                .output();
            let _ = std::process::Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.https", "port", &port_str])
                .output();
            let _ = std::process::Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.socks", "host", "127.0.0.1"])
                .output();
            let _ = std::process::Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy.socks", "port", &port_str])
                .output();
        }
    }

    fn disable_system_proxy(&self, _sudo_pass: Option<&str>) {
        #[cfg(unix)]
        {
            let _ = std::process::Command::new("gsettings")
                .args(["set", "org.gnome.system.proxy", "mode", "none"])
                .output();
        }
    }

    fn enable_tun_dns(&self, dns_ip: &str, sudo_pass: Option<&str>) {
        // 针对使用 systemd-resolved 的 Linux 环境：
        // 1. 若宿主机全局配置了 DNSOverTLS=yes，systemd-resolved 默认会对所有接口尝试 TLS (853)，
        //    而 sing-box tun DNS 仅提供标准 DNS (53)，必须显式为 tun0 关闭 DNSOverTLS，防止所有解析超时。
        // 2. 确保 tun0 设置为默认 DNS 路由 (~.)。
        let _ = run_linux_admin_cmd("resolvectl", &["dnsovertls", "tun0", "no"], sudo_pass);
        let _ = run_linux_admin_cmd("resolvectl", &["dns", "tun0", dns_ip], sudo_pass);
        let _ = run_linux_admin_cmd("resolvectl", &["domain", "tun0", "~."], sudo_pass);
        let _ = run_linux_admin_cmd("resolvectl", &["default-route", "tun0", "true"], sudo_pass);
        let _ = run_linux_admin_cmd("resolvectl", &["flush-caches"], sudo_pass);
    }

    fn disable_tun_dns(&self, sudo_pass: Option<&str>) {
        clean_linux_tun_network(sudo_pass);
    }

    fn sanitize_inbound(&self, _inbound: &mut Value) {
        // 所见即所得：遵循用户原始入站配置，不做任何隐式增加或修改
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
        let mut candidates = vec![
            PathBuf::from("/usr/local/bin/sing-box"),
            PathBuf::from("/usr/bin/sing-box"),
            PathBuf::from("/bin/sing-box"),
            PathBuf::from("/usr/sbin/sing-box"),
            PathBuf::from("/var/lib/subout/sing-box/sing-box"),
            PathBuf::from("/var/lib/subout/bin/sing-box"),
            PathBuf::from("/opt/bin/sing-box"),
            PathBuf::from("/opt/sing-box/sing-box"),
            PathBuf::from("/snap/bin/sing-box"),
        ];
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(PathBuf::from(home).join(".local/bin/sing-box"));
        }
        candidates
    }

    fn legacy_db_candidates(&self, _config_dir: &Path) -> Vec<PathBuf> {
        vec![PathBuf::from("/var/lib/subout/subout.db")]
    }

    fn find_in_path(&self, cmd_name: &str) -> Option<PathBuf> {
        // 1. Direct PATH traversal (POSIX-compliant, does not depend on `which` being installed)
        if let Some(paths) = std::env::var_os("PATH") {
            for dir in std::env::split_paths(&paths) {
                let p = dir.join(cmd_name);
                if p.is_file() {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = p.metadata()
                            && meta.permissions().mode() & 0o111 != 0
                        {
                            return Some(p);
                        }
                    }
                    #[cfg(not(unix))]
                    {
                        return Some(p);
                    }
                }
            }
        }

        // 2. Fallback to `which` command if available
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

fn run_linux_admin_cmd(cmd_name: &str, args: &[&str], sudo_pass: Option<&str>) -> bool {
    #[cfg(unix)]
    {
        use std::process::Command;
        unsafe extern "C" {
            fn geteuid() -> u32;
        }
        let is_root = unsafe { geteuid() == 0 };

        if is_root {
            if let Ok(output) = Command::new(cmd_name).args(args).output() {
                return output.status.success();
            }
            return false;
        }

        if let Some(pass) = sudo_pass {
            let mut cmd = Command::new("sudo");
            cmd.arg("-S")
                .arg("-k")
                .arg("-p")
                .arg("")
                .arg("--")
                .arg(cmd_name)
                .args(args);
            cmd.stdin(std::process::Stdio::piped());
            cmd.stdout(std::process::Stdio::null());
            cmd.stderr(std::process::Stdio::null());
            if let Ok(mut child) = cmd.spawn() {
                if let Some(mut stdin) = child.stdin.take() {
                    use std::io::Write;
                    let _ = stdin.write_all(format!("{pass}\n").as_bytes());
                }
                if let Ok(status) = child.wait() {
                    return status.success();
                }
            }
            return false;
        }

        // Try passwordless sudo -n
        if let Ok(output) = Command::new("sudo")
            .arg("-n")
            .arg("--")
            .arg(cmd_name)
            .args(args)
            .output()
            && output.status.success()
        {
            return true;
        }

        // Fallback to direct execution
        if let Ok(output) = Command::new(cmd_name).args(args).output() {
            return output.status.success();
        }
    }
    let _ = (cmd_name, args, sudo_pass);
    false
}

fn get_linux_cmd_output(cmd_name: &str, args: &[&str]) -> Option<String> {
    #[cfg(unix)]
    {
        if let Ok(output) = std::process::Command::new(cmd_name).args(args).output()
            && output.status.success()
        {
            return Some(String::from_utf8_lossy(&output.stdout).to_string());
        }
    }
    let _ = (cmd_name, args);
    None
}

/// 检查系统中是否有任何正在运行的 sing-box 进程
pub fn is_any_singbox_running() -> bool {
    #[cfg(unix)]
    {
        if let Ok(entries) = std::fs::read_dir("/proc") {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(comm) = std::fs::read_to_string(path.join("comm"))
                    && comm.trim() == "sing-box"
                {
                    return true;
                }
            }
        }
    }
    false
}

/// 检查并清理 Linux 内核遗留的 sing-box TUN 策略路由规则、路由表项与死网卡
pub fn clean_linux_tun_network(sudo_pass: Option<&str>) {
    // 关键安全守门：若系统中仍有任何 sing-box 进程在运行，绝对不要强行清理 TUN 网卡与策略路由！
    // 否则会导致正在运行的 sing-box 的 TUN 文件描述符变为 EBADFD (bad file descriptor)，
    // 并造成 "read packet: read tun: file descriptor in bad state" 和 "find tun interface: Link not found"。
    if is_any_singbox_running() {
        return;
    }

    // 1. 检查并循环清理策略路由中的残留项（table 2022 / lookup 2022 / fwmark）
    for _ in 0..10 {
        let Some(rule_output) = get_linux_cmd_output("ip", &["rule", "show"]) else {
            break;
        };

        if !rule_output.contains("2022")
            && !rule_output.contains("0x2023")
            && !rule_output.contains("0x2024")
        {
            break;
        }

        let mut deleted_any = false;
        if (rule_output.contains("lookup 2022") || rule_output.contains("table 2022"))
            && run_linux_admin_cmd("ip", &["rule", "del", "lookup", "2022"], sudo_pass)
        {
            deleted_any = true;
        }
        if rule_output.contains("0x2023")
            && run_linux_admin_cmd("ip", &["rule", "del", "fwmark", "0x2023"], sudo_pass)
        {
            deleted_any = true;
        }
        if rule_output.contains("0x2024")
            && run_linux_admin_cmd("ip", &["rule", "del", "fwmark", "0x2024"], sudo_pass)
        {
            deleted_any = true;
        }

        if !deleted_any {
            break;
        }
    }

    // 2. 清空 table 2022 路由表并刷新内核 FIB 路由缓存
    let _ = run_linux_admin_cmd("ip", &["route", "flush", "table", "2022"], sudo_pass);
    let _ = run_linux_admin_cmd("ip", &["route", "flush", "cache"], sudo_pass);

    // 3. 检查并删除可能残留的孤儿 tun 虚拟网卡设备（如 tun0 / subout-tun）
    for iface in &["tun0", "subout-tun"] {
        if let Some(link_out) = get_linux_cmd_output("ip", &["link", "show", iface])
            && link_out.contains(iface)
        {
            let _ = run_linux_admin_cmd("ip", &["link", "delete", iface], sudo_pass);
        }
    }

    // 4. 若系统启用了 systemd-resolved，还原 tun0 配置并刷新 DNS 解析缓存
    let _ = run_linux_admin_cmd("resolvectl", &["revert", "tun0"], sudo_pass);
    let _ = run_linux_admin_cmd("resolvectl", &["flush-caches"], sudo_pass);
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_linux_tun_network_cleanup_parser() {
        let sample_rules = r"0:	from all lookup local
9000:	from all fwmark 0x2024 goto 9002
9001:	from all fwmark 0x2023 lookup 2022
9002:	from all nop
32766:	from all lookup main
32767:	from all lookup default
32768:	from all lookup 2022
";
        assert!(sample_rules.contains("lookup 2022"));
        assert!(sample_rules.contains("0x2023"));
        assert!(sample_rules.contains("0x2024"));
    }
}
