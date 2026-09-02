use anyhow::Result;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

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

    fn setup_child_process(&self, _cmd: &mut tokio::process::Command) {
        #[cfg(windows)]
        {
            _cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
    }

    fn tun_permission_error_guide(&self, err: &str, _singbox_bin: &Path) -> String {
        if err.contains("Cannot create a file when that file already exists")
            || err.contains("open existing adapter")
        {
            "TUN 虚拟网卡设备冲突：检测到系统中存在残留的 Wintun 虚拟网卡（通常是上次异常关闭或其它代理软件残留）。已自动执行清理，请点击重新启动。若仍报错，请在设备管理器中卸载残存的 Wintun 网卡或重启电脑。".to_string()
        } else {
            format!(
                "TUN 模式启动失败 ({}): 创建 Wintun 虚拟网卡需要 Windows 系统管理员权限。请以管理员身份运行 Subout 后重试。",
                err
            )
        }
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
                fn OpenProcess(
                    dwDesiredAccess: DWORD,
                    bInheritHandle: BOOL,
                    dwProcessId: DWORD,
                ) -> HANDLE;
                fn WaitForSingleObject(hHandle: HANDLE, dwMilliseconds: DWORD) -> DWORD;
                fn GetExitCodeProcess(hProcess: HANDLE, lpExitCode: *mut DWORD) -> BOOL;
                fn CloseHandle(hObject: HANDLE) -> BOOL;
            }

            let handle =
                unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid) };
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
        let mut results: Vec<ConflictingProcessInfo> = Vec::new();
        let mut seen_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();

        // 1. Primary: Use PowerShell + CIM with JSON serialization to safely inspect sing-box processes
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe' or Name = 'singbox.exe' or Name = 'sing-box'\" | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath | ConvertTo-Json -Compress",
            ])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let items = parse_cim_process_json(&stdout);
                let filtered = filter_conflicting_processes(items, current_pid, managed_pid, running_config_path);
                for proc in filtered {
                    if seen_pids.insert(proc.pid) {
                        results.push(proc);
                    }
                }
            }
        }

        // 2. Secondary fallback: tasklist if PowerShell returned nothing or failed
        if results.is_empty() {
            for img_name in &["sing-box.exe", "singbox.exe"] {
                if let Ok(output) = std::process::Command::new("tasklist")
                    .args([
                        "/FI",
                        &format!("IMAGENAME eq {}", img_name),
                        "/FO",
                        "CSV",
                        "/NH",
                    ])
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
                                    if pid == current_pid || Some(pid) == managed_pid || pid <= 4 {
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

    fn kill_process<'a>(
        &'a self,
        pid: u32,
        _sudo_pass: Option<&'a str>,
        _sig: i32,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            // First attempt graceful termination without /F so sing-box can close Wintun adapter cleanly
            let _ = tokio::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string()])
                .output()
                .await;

            // Wait briefly for process to exit
            for _ in 0..6 {
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                if !self.is_pid_alive(pid) {
                    return;
                }
            }

            // Force kill if process hasn't exited
            let _ = tokio::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .await;
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
            let config_path_norm = config_path_str.replace('/', "\\");
            let mut pids_to_kill: Vec<u32> = Vec::new();

            if let Ok(output) = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe' or Name = 'singbox.exe' or Name = 'sing-box'\" | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress",
                ])
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let items = parse_cim_process_json(&stdout);

                    for item in items {
                        let pid = item.process_id.unwrap_or(0);
                        let ppid = item.parent_process_id.unwrap_or(0);
                        if pid == 0 || pid <= 4 || pid == current_pid || Some(pid) == exclude_pid {
                            continue;
                        }
                        let name = item.name.unwrap_or_default().to_lowercase();
                        if name.contains("powershell") || name.contains("pwsh") || name.contains("cmd") || name.contains("cargo") {
                            continue;
                        }
                        let cmdline = item.command_line.unwrap_or_default();
                        let cmdline_lower = cmdline.to_lowercase();
                        let is_subout_instance = cmdline.contains(&config_path_str)
                            || cmdline.contains(&config_path_norm)
                            || cmdline_lower.contains("sing-box.json")
                            || cmdline_lower.contains("sing-box-running.json")
                            || cmdline_lower.contains("subout")
                            || ppid == current_pid
                            || (exclude_pid.is_some() && Some(ppid) == exclude_pid);

                        if is_subout_instance {
                            pids_to_kill.push(pid);
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
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "Stop-Service sing-box -ErrorAction SilentlyContinue; Stop-Service singbox -ErrorAction SilentlyContinue; Set-Service sing-box -StartupType Disabled -ErrorAction SilentlyContinue; Set-Service singbox -StartupType Disabled -ErrorAction SilentlyContinue",
                ])
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
            "终止/接管外部进程 (PID: {}) 失败：进程仍在运行。请以管理员身份运行 Subout，或在 PowerShell (管理员) 中执行 Stop-Service sing-box; Set-Service sing-box -StartupType Disabled / taskkill /F /PID {} 终止该进程",
            pid, pid
        )
    }

    fn enable_system_proxy(&self, port: u16, _sudo_pass: Option<&str>) {
        let proxy_addr = format!("127.0.0.1:{}", port);
        let override_hosts = "<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*";

        let _ = std::process::Command::new("reg")
            .args([
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                "/v",
                "ProxyEnable",
                "/t",
                "REG_DWORD",
                "/d",
                "1",
                "/f",
            ])
            .output();

        let _ = std::process::Command::new("reg")
            .args([
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                "/v",
                "ProxyServer",
                "/t",
                "REG_SZ",
                "/d",
                &proxy_addr,
                "/f",
            ])
            .output();

        let _ = std::process::Command::new("reg")
            .args([
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                "/v",
                "ProxyOverride",
                "/t",
                "REG_SZ",
                "/d",
                override_hosts,
                "/f",
            ])
            .output();

        refresh_wininet_proxy();
    }

    fn disable_system_proxy(&self, _sudo_pass: Option<&str>) {
        let _ = std::process::Command::new("reg")
            .args([
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                "/v",
                "ProxyEnable",
                "/t",
                "REG_DWORD",
                "/d",
                "0",
                "/f",
            ])
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
                    if iface == "tun0" || iface.is_empty() {
                        obj.insert("interface_name".to_string(), json!("subout-tun"));
                    }
                } else {
                    obj.insert("interface_name".to_string(), json!("subout-tun"));
                }

                // If stack is system on Windows, switch to mixed (wintun standard)
                if let Some(stack) = obj.get("stack").and_then(|s| s.as_str()) {
                    if stack == "system" {
                        obj.insert("stack".to_string(), json!("mixed"));
                    }
                } else {
                    obj.insert("stack".to_string(), json!("mixed"));
                }

                // Ensure IPv6 dual-stack address is present on Windows to prevent leakage
                if let Some(addr_arr) = obj.get_mut("address").and_then(|v| v.as_array_mut()) {
                    let has_ipv6 = addr_arr
                        .iter()
                        .any(|a| a.as_str().map_or(false, |s| s.contains(':')));
                    if !has_ipv6 {
                        addr_arr.push(json!("fd00::1/126"));
                    }
                } else {
                    obj.insert(
                        "address".to_string(),
                        json!(["172.19.0.1/30", "fd00::1/126"]),
                    );
                }

                // Windows strict_route MUST be true
                obj.insert("strict_route".to_string(), json!(true));
            }
        }
    }

    fn default_tun_interface_name(&self) -> &'static str {
        "subout-tun"
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
        let mut candidates = vec![
            PathBuf::from(format!(r"C:\Program Files\Subout\{}", binary_name)),
            PathBuf::from(format!(r"C:\Program Files\sing-box\{}", binary_name)),
            PathBuf::from(format!(r"C:\ProgramData\Subout\bin\{}", binary_name)),
            PathBuf::from(format!(r"C:\ProgramData\subout\bin\{}", binary_name)),
        ];

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("sing-box")
                    .join(binary_name),
            );
        }
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            candidates.push(
                PathBuf::from(user_profile)
                    .join("scoop")
                    .join("apps")
                    .join("sing-box")
                    .join("current")
                    .join(binary_name),
            );
        }
        if let Ok(program_data) = std::env::var("ProgramData") {
            candidates.push(
                PathBuf::from(program_data)
                    .join("chocolatey")
                    .join("bin")
                    .join(binary_name),
            );
        }

        candidates
    }

    fn legacy_db_candidates(&self, _config_dir: &Path) -> Vec<PathBuf> {
        vec![PathBuf::from(r"C:\ProgramData\subout\subout.db")]
    }

    fn find_in_path(&self, cmd_name: &str) -> Option<PathBuf> {
        if let Ok(output) = std::process::Command::new("where").arg(cmd_name).output() {
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

#[derive(serde::Deserialize, Debug, Clone, PartialEq)]
pub struct CimProcessItem {
    #[serde(rename = "ProcessId")]
    pub process_id: Option<u32>,
    #[serde(rename = "ParentProcessId")]
    pub parent_process_id: Option<u32>,
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "CommandLine")]
    pub command_line: Option<String>,
    #[serde(rename = "ExecutablePath")]
    pub executable_path: Option<String>,
}

pub fn parse_cim_process_json(stdout: &str) -> Vec<CimProcessItem> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if let Ok(list) = serde_json::from_str::<Vec<CimProcessItem>>(trimmed) {
        list
    } else if let Ok(single) = serde_json::from_str::<CimProcessItem>(trimmed) {
        vec![single]
    } else {
        Vec::new()
    }
}

pub fn filter_conflicting_processes(
    items: Vec<CimProcessItem>,
    current_pid: u32,
    managed_pid: Option<u32>,
    running_config_path: &Path,
) -> Vec<ConflictingProcessInfo> {
    let config_path_str = running_config_path.to_string_lossy().to_string();
    let config_path_norm = config_path_str.replace('/', "\\");
    let mut results = Vec::new();
    let mut seen_pids = std::collections::HashSet::new();

    for item in items {
        let pid = item.process_id.unwrap_or(0);
        if pid == 0 || pid <= 4 || pid == current_pid || Some(pid) == managed_pid {
            continue;
        }

        if let Some(ppid) = item.parent_process_id {
            if ppid == current_pid || (managed_pid.is_some() && Some(ppid) == managed_pid) {
                continue;
            }
        }

        let name = item.name.unwrap_or_default();
        let name_lower = name.to_lowercase();
        // Exclude Subout itself, parent build runners (cargo/rustc), and shells/system wrappers
        if name_lower.contains("subout")
            || name_lower.contains("powershell")
            || name_lower.contains("pwsh")
            || name_lower.contains("cmd")
            || name_lower.contains("cargo")
            || name_lower.contains("rustc")
            || name_lower.contains("conhost")
        {
            continue;
        }

        let cmdline = item.command_line.clone();
        let exe_path = item.executable_path.clone();

        let is_subout_instance = cmdline
            .as_deref()
            .map(|c| {
                let c_lower = c.to_lowercase();
                c_lower.contains("subout")
                    || c.contains(&config_path_str)
                    || c.contains(&config_path_norm)
                    || c_lower.contains("sing-box.json")
                    || c_lower.contains("sing-box-running.json")
            })
            .unwrap_or(false);

        if is_subout_instance {
            continue;
        }

        if seen_pids.insert(pid) {
            results.push(ConflictingProcessInfo {
                pid,
                name,
                cmdline,
                exe_path,
            });
        }
    }

    results
}

pub fn refresh_wininet_proxy() {
    #[cfg(windows)]
    {
        unsafe extern "system" {
            fn InternetSetOptionW(
                h_internet: *mut std::ffi::c_void,
                dw_option: u32,
                lp_buffer: *mut std::ffi::c_void,
                dw_buffer_length: u32,
            ) -> i32;
        }
        const INTERNET_OPTION_SETTINGS_CHANGED: u32 = 39;
        const INTERNET_OPTION_REFRESH: u32 = 37;
        unsafe {
            InternetSetOptionW(
                std::ptr::null_mut(),
                INTERNET_OPTION_SETTINGS_CHANGED,
                std::ptr::null_mut(),
                0,
            );
            InternetSetOptionW(
                std::ptr::null_mut(),
                INTERNET_OPTION_REFRESH,
                std::ptr::null_mut(),
                0,
            );
        }
    }
    #[cfg(not(windows))]
    {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cim_process_json_empty_and_invalid() {
        assert!(parse_cim_process_json("").is_empty());
        assert!(parse_cim_process_json("   \n\t  ").is_empty());
        assert!(parse_cim_process_json("invalid json").is_empty());
    }

    #[test]
    fn test_parse_cim_process_json_single_object() {
        let single_json = r#"{
            "ProcessId": 2096,
            "ParentProcessId": 1000,
            "Name": "sing-box.exe",
            "CommandLine": "sing-box.exe run -c C:\\conf.json",
            "ExecutablePath": "C:\\Program Files\\sing-box\\sing-box.exe"
        }"#;

        let parsed = parse_cim_process_json(single_json);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].process_id, Some(2096));
        assert_eq!(parsed[0].parent_process_id, Some(1000));
        assert_eq!(parsed[0].name.as_deref(), Some("sing-box.exe"));
        assert_eq!(
            parsed[0].command_line.as_deref(),
            Some("sing-box.exe run -c C:\\conf.json")
        );
        assert_eq!(
            parsed[0].executable_path.as_deref(),
            Some("C:\\Program Files\\sing-box\\sing-box.exe")
        );
    }

    #[test]
    fn test_parse_cim_process_json_array() {
        let array_json = r#"[
            {
                "ProcessId": 1234,
                "ParentProcessId": 500,
                "Name": "sing-box.exe",
                "CommandLine": "sing-box.exe run",
                "ExecutablePath": "C:\\bin\\sing-box.exe"
            },
            {
                "ProcessId": 5678,
                "ParentProcessId": 500,
                "Name": "singbox.exe",
                "CommandLine": null,
                "ExecutablePath": null
            }
        ]"#;

        let parsed = parse_cim_process_json(array_json);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].process_id, Some(1234));
        assert_eq!(parsed[1].process_id, Some(5678));
        assert_eq!(parsed[1].name.as_deref(), Some("singbox.exe"));
    }

    #[test]
    fn test_filter_conflicting_processes_ignores_powershell_and_tools() {
        let items = vec![
            CimProcessItem {
                process_id: Some(2096),
                parent_process_id: Some(100),
                name: Some("powershell.exe".to_string()),
                command_line: Some(r#""powershell" -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe'\"""#.to_string()),
                executable_path: Some(r#"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"#.to_string()),
            },
            CimProcessItem {
                process_id: Some(3000),
                parent_process_id: Some(100),
                name: Some("cargo.exe".to_string()),
                command_line: Some("cargo run".to_string()),
                executable_path: Some(r#"C:\Users\pan\.cargo\bin\cargo.exe"#.to_string()),
            },
            CimProcessItem {
                process_id: Some(4000),
                parent_process_id: Some(100),
                name: Some("subout.exe".to_string()),
                command_line: Some("subout.exe web".to_string()),
                executable_path: Some(r#"C:\Subout\subout.exe"#.to_string()),
            },
        ];

        let filtered = filter_conflicting_processes(
            items,
            100,
            None,
            Path::new(r"C:\ProgramData\Subout\generated\sing-box.json"),
        );
        assert!(
            filtered.is_empty(),
            "All wrappers, powershell, cargo and subout processes must be filtered out"
        );
    }

    #[test]
    fn test_filter_conflicting_processes_ignores_managed_and_child_processes() {
        let current_pid = 5000;
        let managed_pid = 6000;
        let config_path = Path::new(r"C:\Subout\generated\sing-box.json");

        let items = vec![
            // Subout's current process
            CimProcessItem {
                process_id: Some(current_pid),
                parent_process_id: Some(100),
                name: Some("subout.exe".to_string()),
                command_line: Some("subout.exe".to_string()),
                executable_path: None,
            },
            // Subout's managed child sing-box instance
            CimProcessItem {
                process_id: Some(managed_pid),
                parent_process_id: Some(current_pid),
                name: Some("sing-box.exe".to_string()),
                command_line: Some(
                    r#"sing-box.exe -D C:\Subout run -c C:\Subout\generated\sing-box.json"#
                        .to_string(),
                ),
                executable_path: Some(r#"C:\Subout\bin\sing-box.exe"#.to_string()),
            },
            // Another child of current_pid
            CimProcessItem {
                process_id: Some(7000),
                parent_process_id: Some(current_pid),
                name: Some("sing-box.exe".to_string()),
                command_line: Some("sing-box.exe run".to_string()),
                executable_path: None,
            },
            // Real external conflict (e.g. system service or user manual terminal launch)
            CimProcessItem {
                process_id: Some(8888),
                parent_process_id: Some(1),
                name: Some("sing-box.exe".to_string()),
                command_line: Some(
                    r#"sing-box.exe run -c C:\etc\sing-box\config.json"#.to_string(),
                ),
                executable_path: Some(r#"C:\Program Files\sing-box\sing-box.exe"#.to_string()),
            },
        ];

        let filtered =
            filter_conflicting_processes(items, current_pid, Some(managed_pid), config_path);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].pid, 8888);
        assert_eq!(filtered[0].name, "sing-box.exe");
        assert_eq!(
            filtered[0].cmdline.as_deref(),
            Some(r#"sing-box.exe run -c C:\etc\sing-box\config.json"#)
        );
        assert_eq!(
            filtered[0].exe_path.as_deref(),
            Some(r#"C:\Program Files\sing-box\sing-box.exe"#)
        );
    }
}
