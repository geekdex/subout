pub mod fallback;
pub mod linux;
pub mod macos;
pub mod windows;

use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use anyhow::Result;
use serde_json::Value;

use crate::service::ConflictingProcessInfo;

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

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

    // ------------------------------------------------------------------------
    // 4. System Proxy & DNS Integration
    // ------------------------------------------------------------------------
    fn enable_system_proxy(&self, port: u16, sudo_pass: Option<&str>);
    fn disable_system_proxy(&self, sudo_pass: Option<&str>);
    fn enable_tun_dns(&self, dns_ip: &str, sudo_pass: Option<&str>);
    fn disable_tun_dns(&self, sudo_pass: Option<&str>);

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
        assert_eq!(linux.default_config_dir(&PathBuf::from("/var/lib/subout")), PathBuf::from("/etc/subout"));
        assert_eq!(linux.default_log_dir(&PathBuf::from("/var/lib/subout")), PathBuf::from("/var/log/subout"));
        assert_eq!(linux.default_runtime_dir(&PathBuf::from("/var/lib/subout")), PathBuf::from("/run/subout"));

        let mut inbound = json!({
            "type": "tun",
            "interface_name": "tun0",
            "auto_redirect": true
        });
        linux.sanitize_inbound(&mut inbound);
        assert_eq!(inbound.get("interface_name"), Some(&json!("tun0")));
        assert_eq!(inbound.get("auto_redirect"), Some(&json!(true)));
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
        assert_eq!(macos.effective_tun_stack("system"), "mixed");
        assert_eq!(macos.effective_tun_stack("gvisor"), "gvisor");
        assert_eq!(macos.kernel_binary_name(), "sing-box");
        assert_eq!(macos.default_data_dir(), PathBuf::from("/Library/Application Support/Subout"));
        assert_eq!(macos.default_log_dir(&PathBuf::from("/Library/Application Support/Subout")), PathBuf::from("/Library/Logs/Subout"));

        let mut inbound = json!({
            "type": "tun",
            "interface_name": "tun0",
            "auto_redirect": true
        });
        macos.sanitize_inbound(&mut inbound);
        assert_eq!(inbound.get("interface_name"), None);
        assert_eq!(inbound.get("auto_redirect"), None);
        assert_eq!(inbound.get("strict_route"), Some(&json!(true)));
        assert_eq!(inbound.get("stack"), Some(&json!("mixed")));
    }

    #[test]
    fn test_windows_strategy() {
        let windows = windows_platform();
        assert_eq!(windows.os_name(), "windows");
        assert!(!windows.is_linux());
        assert!(!windows.is_macos());
        assert!(windows.is_windows());
        assert_eq!(windows.default_tun_interface_name(), "");
        assert!(windows.default_tun_strict_route());
        assert_eq!(windows.effective_tun_stack("system"), "system");
        assert_eq!(windows.kernel_binary_name(), "sing-box.exe");

        let mut inbound = json!({
            "type": "tun",
            "interface_name": "tun0",
            "auto_redirect": true
        });
        windows.sanitize_inbound(&mut inbound);
        assert_eq!(inbound.get("interface_name"), None);
        assert_eq!(inbound.get("auto_redirect"), None);
        assert_eq!(inbound.get("strict_route"), Some(&json!(true)));
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
}
