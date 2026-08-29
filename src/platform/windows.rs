use std::path::{Path, PathBuf};
use anyhow::Result;
use serde_json::{Value, json};

use crate::platform::{BoxFuture, PlatformStrategy};
use crate::service::ConflictingProcessInfo;

pub struct WindowsPlatform;

impl PlatformStrategy for WindowsPlatform {
    fn os_name(&self) -> &'static str {
        "windows"
    }

    fn is_running_as_root(&self) -> bool {
        #[cfg(windows)]
        {
            unsafe extern "system" {
                fn IsUserAnAdmin() -> i32;
            }
            unsafe { IsUserAnAdmin() != 0 }
        }
        #[cfg(not(windows))]
        {
            false
        }
    }

    fn run_sudo_command<'a>(
        &'a self,
        _cmd_name: &'a str,
        _args: &'a [&'a str],
        _sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move { Ok(()) })
    }

    fn setup_child_process(&self, _cmd: &mut tokio::process::Command) {}

    fn tun_permission_error_guide(&self, err: &str, _singbox_bin: &Path) -> String {
        format!(
            "TUN 模式启动失败 ({}): 创建 Wintun 虚拟网卡需要 Windows 系统管理员权限。请关闭 Subout，右键选择【以管理员身份运行】后重试。",
            err
        )
    }

    fn is_pid_alive(&self, pid: u32) -> bool {
        if pid == 0 {
            return false;
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
        #[cfg(not(windows))]
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
        let current_pid = std::process::id();
        let config_path_str = running_config_path.to_string_lossy().to_string();
        let mut results: Vec<ConflictingProcessInfo> = Vec::new();
        let mut seen_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();

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

                            if !is_subout && seen_pids.insert(pid) {
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

        results
    }

    fn kill_process<'a>(
        &'a self,
        pid: u32,
        _sudo_pass: Option<&'a str>,
        _sig: i32,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output();
        })
    }

    fn kill_all_subout_processes<'a>(
        &'a self,
        _sudo_pass: Option<&'a str>,
        exclude_pid: Option<u32>,
        running_config_path: &'a Path,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            let current_pid = std::process::id();
            let config_path_str = running_config_path.to_string_lossy().to_string();
            let mut pids_to_kill: Vec<u32> = Vec::new();

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

            for pid in pids_to_kill {
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }
        })
    }

    fn stop_external_service_or_process<'a>(
        &'a self,
        pid: u32,
        _sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let pid_str = pid.to_string();
            let _ = tokio::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", "Stop-Service sing-box -ErrorAction SilentlyContinue; Stop-Service singbox -ErrorAction SilentlyContinue"])
                .output()
                .await;
            let _ = tokio::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid_str])
                .output()
                .await;
            Ok(())
        })
    }

    fn external_process_stop_failed_message(&self, pid: u32, _has_sudo_pass: bool) -> String {
        format!(
            "终止外部进程 (PID: {}) 失败：进程仍在运行。请以管理员身份运行 Subout，或在任务管理器 / 终端中执行 taskkill /F /PID {} 终止该进程",
            pid, pid
        )
    }

    fn enable_system_proxy(&self, port: u16, _sudo_pass: Option<&str>) {
        let proxy_addr = format!("127.0.0.1:{}", port);
        let override_hosts = "<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*";

        let _ = std::process::Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"])
            .output();

        let _ = std::process::Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer", "/t", "REG_SZ", "/d", &proxy_addr, "/f"])
            .output();

        let _ = std::process::Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyOverride", "/t", "REG_SZ", "/d", override_hosts, "/f"])
            .output();

        refresh_wininet_proxy();
    }

    fn disable_system_proxy(&self, _sudo_pass: Option<&str>) {
        let _ = std::process::Command::new("reg")
            .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"])
            .output();

        refresh_wininet_proxy();
    }

    fn enable_tun_dns(&self, _dns_ip: &str, _sudo_pass: Option<&str>) {}

    fn disable_tun_dns(&self, _sudo_pass: Option<&str>) {}

    fn sanitize_inbound(&self, inbound: &mut Value) {
        if let Some(obj) = inbound.as_object_mut() {
            let is_tun = obj.get("type").and_then(|t| t.as_str()) == Some("tun");
            obj.remove("auto_redirect");
            if is_tun {
                if let Some(iface) = obj.get("interface_name").and_then(|i| i.as_str()) {
                    if iface == "tun0" {
                        obj.insert("interface_name".to_string(), json!(""));
                    }
                }

                // Ensure IPv6 dual-stack address is present on Windows to prevent leakage
                if let Some(addr_arr) = obj.get_mut("address").and_then(|v| v.as_array_mut()) {
                    let has_ipv6 = addr_arr.iter().any(|a| a.as_str().map_or(false, |s| s.contains(':')));
                    if !has_ipv6 {
                        addr_arr.push(json!("fd00::1/126"));
                    }
                } else {
                    obj.insert("address".to_string(), json!(["172.19.0.1/30", "fd00::1/126"]));
                }

                // Windows strict_route MUST be true
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
        configured_stack
    }

    fn default_data_dir(&self) -> PathBuf {
        std::env::var("ProgramData")
            .or_else(|_| std::env::var("ALLUSERSPROFILE"))
            .map(|p| PathBuf::from(p).join("Subout"))
            .unwrap_or_else(|_| PathBuf::from(r"C:\ProgramData\Subout"))
    }

    fn default_config_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("config")
    }

    fn default_log_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("logs")
    }

    fn default_runtime_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("run")
    }

    fn kernel_binary_name(&self) -> &'static str {
        "sing-box.exe"
    }

    fn standard_singbox_candidates(&self, binary_name: &str) -> Vec<PathBuf> {
        vec![
            PathBuf::from(format!(r"C:\Program Files\Subout\{}", binary_name)),
            PathBuf::from(format!(r"C:\Program Files\sing-box\{}", binary_name)),
            PathBuf::from(format!(r"C:\ProgramData\Subout\bin\{}", binary_name)),
            PathBuf::from(format!(r"C:\ProgramData\subout\bin\{}", binary_name)),
        ]
    }

    fn legacy_db_candidates(&self, _config_dir: &Path) -> Vec<PathBuf> {
        vec![PathBuf::from(r"C:\ProgramData\subout\subout.db")]
    }

    fn find_in_path(&self, cmd_name: &str) -> Option<PathBuf> {
        if let Ok(output) = std::process::Command::new("where")
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

pub fn refresh_wininet_proxy() {
    let script = r#"
        $sig = @'
        [DllImport("wininet.dll", SetLastError = true, CharSet=CharSet.Auto)]
        public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
'@
        $type = Add-Type -MemberDefinition $sig -Name WinINetProxy -Namespace WinINet -PassThru
        [WinINet.WinINetProxy]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
        [WinINet.WinINetProxy]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
    "#;

    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
        .output();
}
