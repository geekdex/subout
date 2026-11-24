pub mod fallback;
pub mod linux;
pub mod macos;
pub mod windows;

use anyhow::Result;
use serde_json::Value;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;

use crate::service::ConflictingProcessInfo;
use serde::{Deserialize, Serialize};

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// 被占用资源的类别：端口 / TUN 网卡 / DNS / 策略路由。
/// 用于通用地描述"谁占了 sing-box 需要的资源"，不硬编码任何具体工具名。
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResourceConflictKind {
    Port,
    TunInterface,
    Dns,
    PolicyRoute,
}

/// 一个资源占用项：sing-box 需要的某个资源被系统中的其他程序占用。
/// holder_* 为 None 表示反查失败（此时以 evidence 中的自查命令为准）。
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ResourceHolderInfo {
    pub kind: ResourceConflictKind,
    /// 被占用的资源标识，如 "127.0.0.1:2080" / "tun0" / "~." DNS / "table 2022"
    pub resource: String,
    pub holder_pid: Option<u32>,
    /// 从 /proc/<pid>/comm 或等价手段读到的真实进程名
    pub holder_name: Option<String>,
    pub holder_cmdline: Option<String>,
    /// 证据来源，如 "ss -tlnp" / "/proc/net/tcp inode" / "ip link" / "resolvectl status"
    pub evidence: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct TakeoverDiagnoseResult {
    pub has_conflict: bool,
    /// "systemd" | "launchd" | "respawn_script" | "running_processes"
    /// | "port_occupied_by_external" | "tun_interface_occupied" | "dns_takeover" | "policy_route_conflict"
    pub conflict_type: Option<String>,
    pub conflict_name: Option<String>,
    pub suggestion_command: Option<String>,
    pub suggestion: Option<String>,
    pub message: String,
    pub details: String,
    pub pids: Vec<u32>,
    pub can_auto_takeover: bool,
    /// 通用资源占用（端口/TUN/DNS/路由）列表，与具体的 sing-box 进程冲突分开表达。
    #[serde(default)]
    pub resource_conflicts: Vec<ResourceHolderInfo>,
    /// 是否允许显示"一键接管"按钮。组网工具冲突恒为 false，防止误杀用户正常使用的网络工具。
    #[serde(default = "default_auto_takeover_allowed")]
    pub auto_takeover_allowed: bool,
}

fn default_auto_takeover_allowed() -> bool {
    // 老序列化数据（没有该字段）默认保持可接管，以兼容旧的外部 sing-box 冲突结果；
    // 构造新结果时必须按冲突类型显式赋值。
    true
}

impl TakeoverDiagnoseResult {
    pub fn no_conflict() -> Self {
        Self {
            has_conflict: false,
            conflict_type: None,
            conflict_name: None,
            suggestion_command: None,
            suggestion: None,
            message: "未检测到外部服务或进程冲突。".to_string(),
            details: "系统环境正常，未发现外部 sing-box 进程或服务争抢端口。".to_string(),
            pids: Vec::new(),
            can_auto_takeover: false,
            resource_conflicts: Vec::new(),
            auto_takeover_allowed: true,
        }
    }
}

/// 从 sing-box 配置中提取所有需要绑定的 TCP 监听地址 (listen, port)。
/// 供端口预检与各平台资源占用反查共用。
pub fn collect_inbound_listeners(config: &Value) -> Vec<(String, u16)> {
    let mut out = Vec::new();
    let Some(inbounds) = config.get("inbounds").and_then(|i| i.as_array()) else {
        return out;
    };
    for inbound in inbounds {
        let Some(port) = inbound
            .get("listen_port")
            .and_then(serde_json::Value::as_u64)
        else {
            continue; // tun 等无 TCP 端口的入站
        };
        if port == 0 || port > u16::MAX as u64 {
            continue;
        }
        // skip_inbound 的入站实际不监听，避免误报
        if inbound
            .get("type")
            .and_then(|t| t.as_str())
            .map(|t| t == "tun")
            .unwrap_or(false)
        {
            // tun 入站的 listen_port 语义不同，单独在 TUN 检测里处理
            continue;
        }
        let listen = inbound
            .get("listen")
            .and_then(|l| l.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("0.0.0.0")
            .to_string();
        if !out.iter().any(|(l, p)| l == &listen && *p == port as u16) {
            out.push((listen, port as u16));
        }
    }
    out
}

pub fn get_config_path_variants(running_config_path: &Path) -> Vec<String> {
    let mut vars = Vec::new();
    let s = running_config_path.to_string_lossy().to_string();
    if !s.is_empty() {
        vars.push(s);
    }
    if let Ok(canon) = std::fs::canonicalize(running_config_path) {
        let c_str = canon.to_string_lossy().to_string();
        if !vars.contains(&c_str) {
            vars.push(c_str);
        }
    }
    if running_config_path.is_relative()
        && let Ok(cwd) = std::env::current_dir()
    {
        let abs = cwd.join(running_config_path);
        let abs_str = abs.to_string_lossy().to_string();
        if !vars.contains(&abs_str) {
            vars.push(abs_str);
        }
        if let Ok(abs_canon) = std::fs::canonicalize(&abs) {
            let abs_canon_str = abs_canon.to_string_lossy().to_string();
            if !vars.contains(&abs_canon_str) {
                vars.push(abs_canon_str);
            }
        }
    }
    vars
}

/// Parse `ps -eo pid,ppid,%cpu,rss` output and calculate total CPU % and memory in bytes
/// for `target_pid` and all its descendant processes (e.g., sudo -> sing-box tree).
pub fn parse_ps_resource_output(stdout: &str, target_pid: u32) -> (f64, u64) {
    if target_pid == 0 {
        return (0.0, 0);
    }
    let mut procs = std::collections::HashMap::new();
    let mut children_map: std::collections::HashMap<u32, Vec<u32>> =
        std::collections::HashMap::new();

    for line in stdout.lines().skip(1) {
        let trimmed = line.trim();
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 4
            && let (Ok(pid), Ok(ppid)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>())
        {
            let cpu = parts[2]
                .replace(',', ".")
                .parse::<f64>()
                .unwrap_or(0.0)
                .max(0.0);
            let rss_kb = parts[3].parse::<u64>().unwrap_or(0);
            procs.insert(pid, (cpu, rss_kb));
            children_map.entry(ppid).or_default().push(pid);
        }
    }

    if !procs.contains_key(&target_pid) {
        return (0.0, 0);
    }

    let mut total_cpu = 0.0;
    let mut total_rss_kb = 0u64;
    let mut visited = std::collections::HashSet::new();
    let mut queue = vec![target_pid];

    while let Some(current) = queue.pop() {
        if visited.insert(current) {
            if let Some(&(cpu, rss)) = procs.get(&current) {
                total_cpu += cpu;
                total_rss_kb = total_rss_kb.saturating_add(rss);
            }
            if let Some(kids) = children_map.get(&current) {
                queue.extend(kids);
            }
        }
    }

    (total_cpu, total_rss_kb.saturating_mul(1024))
}

/// Strategy pattern interface for platform-specific capabilities.
///
/// Encapsulates all OS-dependent operations (privilege escalation, process lifecycle,
/// system proxy/DNS settings, path discovery, and config sanitization) behind a unified
/// interface to guarantee isolation across Linux, macOS, and Windows.
pub trait PlatformStrategy: Send + Sync {
    // ------------------------------------------------------------------------
    // 1. Identity
    // ------------------------------------------------------------------------
    fn os_name(&self) -> &'static str;
    fn is_linux(&self) -> bool {
        self.os_name() == "linux"
    }
    fn is_macos(&self) -> bool {
        self.os_name() == "macos"
    }
    fn is_windows(&self) -> bool {
        self.os_name() == "windows"
    }

    // ------------------------------------------------------------------------
    // 2. Privileges & Elevation
    // ------------------------------------------------------------------------
    fn is_running_as_root(&self) -> bool;
    fn run_sudo_command<'a>(
        &'a self,
        cmd_name: &'a str,
        args: &'a [&'a str],
        sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>>;
    fn setup_child_process(&self, cmd: &mut tokio::process::Command);
    fn tun_permission_error_guide(&self, err: &str, singbox_bin: &Path) -> String;

    // ------------------------------------------------------------------------
    // 3. Process Management
    // ------------------------------------------------------------------------
    fn is_pid_alive(&self, pid: u32) -> bool;
    fn detect_conflicting_processes(
        &self,
        managed_pid: Option<u32>,
        running_config_path: &Path,
    ) -> Vec<ConflictingProcessInfo>;
    /// 通用资源占用诊断：sing-box 需要的端口/TUN 网卡/DNS/路由是否被外部程序占用。
    /// 按实际占用判定，不硬编码具体工具名；exclude_pid 用于排除 Subout 自己管理的进程。
    fn detect_resource_conflicts<'a>(
        &'a self,
        running_config_path: &'a Path,
        exclude_pid: Option<u32>,
    ) -> BoxFuture<'a, Vec<ResourceHolderInfo>>;
    /// 同步反查占用指定 TCP 端口的进程，返回用于错误提示的中文描述（含真实进程名/PID/命令）。
    /// 各平台用各自最可靠的方式实现：Linux 读 /proc，macOS 用 lsof，Windows 用 netstat。
    /// 返回 None 表示无法反查，调用方降级为自查命令提示。不硬编码任何工具名。
    fn describe_port_holder(&self, port: u16) -> Option<String>;
    /// 返回当前平台用于自查端口占用的一键复制命令（port=0 表示通用命令）。
    fn port_probe_command(&self, port: u16) -> String;
    fn kill_process<'a>(
        &'a self,
        pid: u32,
        sudo_pass: Option<&'a str>,
        sig: i32,
    ) -> BoxFuture<'a, ()>;
    fn kill_all_subout_processes<'a>(
        &'a self,
        sudo_pass: Option<&'a str>,
        exclude_pid: Option<u32>,
        running_config_path: &'a Path,
    ) -> BoxFuture<'a, ()>;
    fn stop_external_service_or_process<'a>(
        &'a self,
        pid: u32,
        sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>>;
    fn external_process_stop_failed_message(&self, pid: u32, has_sudo_pass: bool) -> String;
    fn diagnose_takeover_conflict(
        &self,
        managed_pid: Option<u32>,
    ) -> BoxFuture<'_, Result<TakeoverDiagnoseResult>>;
    /// Collect CPU utilization percentage (0.0 - 100.0+) and resident memory in bytes for the given PID and any of its child processes.
    fn get_process_resource_usage(&self, pid: u32) -> (f64, u64);

    // ------------------------------------------------------------------------
    // 4. System Proxy Integration
    // ------------------------------------------------------------------------
    fn is_system_proxy_supported(&self) -> bool {
        true
    }
    fn system_proxy_unsupported_reason(&self) -> Option<String> {
        None
    }
    fn enable_system_proxy(&self, port: u16, sudo_pass: Option<&str>);
    fn disable_system_proxy(&self, sudo_pass: Option<&str>);
    /// Remove leftover TUN routes/interfaces after sing-box stops. DNS is not
    /// touched here: sing-box owns system DNS integration via its TUN + dns/route
    /// configuration, so the application must never rewrite host resolver settings.
    fn cleanup_tun_network(&self, sudo_pass: Option<&str>);

    // ------------------------------------------------------------------------
    // 5. Config Sanitization & Generation
    // ------------------------------------------------------------------------
    fn sanitize_inbound(&self, inbound: &mut Value);
    fn default_tun_interface_name(&self) -> &'static str;
    fn default_tun_strict_route(&self) -> bool;
    fn effective_tun_stack<'a>(&self, configured_stack: &'a str) -> &'a str;

    // ------------------------------------------------------------------------
    // 6. Paths & File Discovery
    // ------------------------------------------------------------------------
    fn default_data_dir(&self) -> PathBuf;
    fn default_config_dir(&self, data_dir: &Path) -> PathBuf;
    fn default_log_dir(&self, data_dir: &Path) -> PathBuf;
    fn default_runtime_dir(&self, data_dir: &Path) -> PathBuf;
    fn kernel_binary_name(&self) -> &'static str;
    fn standard_singbox_candidates(&self, binary_name: &str) -> Vec<PathBuf>;
    fn legacy_db_candidates(&self, config_dir: &Path) -> Vec<PathBuf>;
    fn find_in_path(&self, cmd_name: &str) -> Option<PathBuf>;
}

static LINUX_STRATEGY: linux::LinuxPlatform = linux::LinuxPlatform;
static MACOS_STRATEGY: macos::MacOsPlatform = macos::MacOsPlatform;
static WINDOWS_STRATEGY: windows::WindowsPlatform = windows::WindowsPlatform;
#[allow(dead_code)]
static FALLBACK_STRATEGY: fallback::FallbackPlatform = fallback::FallbackPlatform;

/// Get the active platform strategy for current host target OS.
pub fn current_platform() -> &'static dyn PlatformStrategy {
    #[cfg(target_os = "linux")]
    {
        &LINUX_STRATEGY
    }
    #[cfg(target_os = "macos")]
    {
        &MACOS_STRATEGY
    }
    #[cfg(target_os = "windows")]
    {
        &WINDOWS_STRATEGY
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        &FALLBACK_STRATEGY
    }
}

/// Convenience getter for Linux platform strategy (e.g. for unit testing cross-platform rules)
pub fn linux_platform() -> &'static linux::LinuxPlatform {
    &LINUX_STRATEGY
}

/// Convenience getter for macOS platform strategy (e.g. for unit testing cross-platform rules)
pub fn macos_platform() -> &'static macos::MacOsPlatform {
    &MACOS_STRATEGY
}

/// Convenience getter for Windows platform strategy (e.g. for unit testing cross-platform rules)
pub fn windows_platform() -> &'static windows::WindowsPlatform {
    &WINDOWS_STRATEGY
}

/// Convenience getter for Fallback platform strategy (e.g. for unit testing)
#[allow(dead_code)]
pub fn fallback_platform() -> &'static fallback::FallbackPlatform {
    &FALLBACK_STRATEGY
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_linux_strategy() {
        let linux = linux_platform();
        assert_eq!(linux.os_name(), "linux");
        assert!(linux.is_linux());
        assert!(!linux.is_macos());
        assert!(!linux.is_windows());
        assert_eq!(linux.default_tun_interface_name(), "tun0");
        assert!(!linux.default_tun_strict_route());
        assert_eq!(linux.effective_tun_stack("system"), "system");
        assert_eq!(linux.kernel_binary_name(), "sing-box");
        assert_eq!(linux.default_data_dir(), PathBuf::from("/var/lib/subout"));
        assert_eq!(
            linux.default_config_dir(&PathBuf::from("/var/lib/subout")),
            PathBuf::from("/etc/subout")
        );
        assert_eq!(
            linux.default_log_dir(&PathBuf::from("/var/lib/subout")),
            PathBuf::from("/var/log/subout")
        );
        assert_eq!(
            linux.default_runtime_dir(&PathBuf::from("/var/lib/subout")),
            PathBuf::from("/run/subout")
        );

        let mut inbound = json!({
            "type": "tun",
            "interface_name": "tun0",
            "auto_redirect": true,
            "auto_route": true
        });
        linux.sanitize_inbound(&mut inbound);
        assert_eq!(inbound.get("interface_name"), Some(&json!("tun0")));
        assert_eq!(inbound.get("auto_redirect"), Some(&json!(true)));
        assert_eq!(inbound.get("auto_route"), Some(&json!(true)));
    }

    #[test]
    fn test_macos_strategy() {
        let macos = macos_platform();
        assert_eq!(macos.os_name(), "macos");
        assert!(!macos.is_linux());
        assert!(macos.is_macos());
        assert!(!macos.is_windows());
        assert_eq!(macos.default_tun_interface_name(), "");
        assert!(macos.default_tun_strict_route());
        assert_eq!(macos.effective_tun_stack("system"), "system");
        assert_eq!(macos.effective_tun_stack("mixed"), "mixed");
        assert_eq!(macos.effective_tun_stack("gvisor"), "gvisor");
        assert_eq!(macos.kernel_binary_name(), "sing-box");
        assert_eq!(
            macos.default_data_dir(),
            PathBuf::from("/Library/Application Support/Subout")
        );
        assert_eq!(
            macos.default_log_dir(&PathBuf::from("/Library/Application Support/Subout")),
            PathBuf::from("/Library/Logs/Subout")
        );

        let mut inbound = json!({
            "type": "tun",
            "interface_name": "tun0",
            "auto_redirect": true,
            "auto_route": true
        });
        macos.sanitize_inbound(&mut inbound);
        assert_eq!(inbound.get("interface_name"), Some(&json!("tun0")));
        assert_eq!(inbound.get("auto_redirect"), None);
        assert_eq!(inbound.get("auto_route"), Some(&json!(true)));
        assert_eq!(inbound.get("strict_route"), None);
        assert_eq!(inbound.get("stack"), None);
        assert_eq!(inbound.get("address"), None);
    }

    #[test]
    fn test_windows_strategy() {
        let windows = windows_platform();
        assert_eq!(windows.os_name(), "windows");
        assert!(!windows.is_linux());
        assert!(!windows.is_macos());
        assert!(windows.is_windows());
        assert_eq!(windows.default_tun_interface_name(), "subout-tun");
        assert!(windows.default_tun_strict_route());
        assert_eq!(windows.effective_tun_stack("system"), "system");
        assert_eq!(windows.kernel_binary_name(), "sing-box.exe");

        let mut inbound = json!({
            "type": "tun",
            "interface_name": "tun0",
            "auto_redirect": true,
            "auto_route": true
        });
        windows.sanitize_inbound(&mut inbound);
        assert_eq!(inbound.get("interface_name"), Some(&json!("tun0")));
        assert_eq!(inbound.get("auto_redirect"), None);
        assert_eq!(inbound.get("auto_route"), Some(&json!(true)));
        assert_eq!(inbound.get("strict_route"), None);
        assert_eq!(inbound.get("stack"), None);
        assert_eq!(inbound.get("address"), None);
    }

    #[test]
    fn test_fallback_strategy() {
        let fallback = fallback_platform();
        assert_eq!(fallback.os_name(), "unknown");
        assert!(!fallback.is_linux());
        assert!(!fallback.is_macos());
        assert!(!fallback.is_windows());
        assert_eq!(fallback.default_tun_interface_name(), "");
        assert!(fallback.default_tun_strict_route());
        assert_eq!(fallback.kernel_binary_name(), "sing-box");
    }

    #[test]
    fn test_current_platform_matches_host() {
        let platform = current_platform();
        let os = std::env::consts::OS;
        assert_eq!(platform.os_name(), os);
        if os == "linux" {
            assert!(platform.is_linux());
        } else if os == "macos" {
            assert!(platform.is_macos());
        } else if os == "windows" {
            assert!(platform.is_windows());
        }
    }

    #[test]
    fn test_parse_ps_resource_output() {
        let sample_ps = "  PID  PPID %CPU   RSS\n    1     0  0.0 15000\n  100     1  0.2  2048\n  101   100  1.5 30720\n  200     1  0.5  4096\n";

        // Non-existent target
        assert_eq!(parse_ps_resource_output(sample_ps, 999), (0.0, 0));
        assert_eq!(parse_ps_resource_output(sample_ps, 0), (0.0, 0));

        // Leaf process
        let (cpu_leaf, mem_leaf) = parse_ps_resource_output(sample_ps, 101);
        assert!((cpu_leaf - 1.5).abs() < 0.001);
        assert_eq!(mem_leaf, 30720 * 1024);

        // Process with child (PID 100 has child 101) -> sums both
        let (cpu_tree, mem_tree) = parse_ps_resource_output(sample_ps, 100);
        assert!((cpu_tree - 1.7).abs() < 0.001);
        assert_eq!(mem_tree, (2048 + 30720) * 1024);

        // Comma decimal handling
        let sample_comma = "  PID  PPID %CPU   RSS\n  300     1  2,8  5120\n";
        let (cpu_comma, mem_comma) = parse_ps_resource_output(sample_comma, 300);
        assert!((cpu_comma - 2.8).abs() < 0.001);
        assert_eq!(mem_comma, 5120 * 1024);
    }
}
