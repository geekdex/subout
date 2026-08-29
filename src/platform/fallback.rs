use std::path::{Path, PathBuf};
use anyhow::Result;
use serde_json::Value;

use crate::platform::{BoxFuture, PlatformStrategy};
use crate::service::ConflictingProcessInfo;

pub struct FallbackPlatform;

impl PlatformStrategy for FallbackPlatform {
    fn os_name(&self) -> &'static str {
        "unknown"
    }

    fn is_running_as_root(&self) -> bool {
        false
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
        format!("TUN 模式启动失败: {}", err)
    }

    fn is_pid_alive(&self, _pid: u32) -> bool {
        false
    }

    fn detect_conflicting_processes(
        &self,
        _managed_pid: Option<u32>,
        _running_config_path: &Path,
    ) -> Vec<ConflictingProcessInfo> {
        Vec::new()
    }

    fn kill_process<'a>(
        &'a self,
        _pid: u32,
        _sudo_pass: Option<&'a str>,
        _sig: i32,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {})
    }

    fn kill_all_subout_processes<'a>(
        &'a self,
        _sudo_pass: Option<&'a str>,
        _exclude_pid: Option<u32>,
        _running_config_path: &'a Path,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {})
    }

    fn stop_external_service_or_process<'a>(
        &'a self,
        _pid: u32,
        _sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move { Ok(()) })
    }

    fn external_process_stop_failed_message(&self, pid: u32, _has_sudo_pass: bool) -> String {
        format!("终止外部进程 (PID: {}) 失败：进程仍在运行", pid)
    }

    fn enable_system_proxy(&self, _port: u16, _sudo_pass: Option<&str>) {}

    fn disable_system_proxy(&self, _sudo_pass: Option<&str>) {}

    fn enable_tun_dns(&self, _dns_ip: &str, _sudo_pass: Option<&str>) {}

    fn disable_tun_dns(&self, _sudo_pass: Option<&str>) {}

    fn sanitize_inbound(&self, _inbound: &mut Value) {}

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
        dirs::data_dir()
            .map(|d| d.join("subout"))
            .unwrap_or_else(|| PathBuf::from("./runtime/data"))
    }

    fn default_config_dir(&self, _data_dir: &Path) -> PathBuf {
        dirs::config_dir()
            .map(|c| c.join("subout"))
            .unwrap_or_else(|| PathBuf::from("./runtime/config"))
    }

    fn default_log_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("logs")
    }

    fn default_runtime_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("run")
    }

    fn kernel_binary_name(&self) -> &'static str {
        "sing-box"
    }

    fn standard_singbox_candidates(&self, _binary_name: &str) -> Vec<PathBuf> {
        Vec::new()
    }

    fn legacy_db_candidates(&self, _config_dir: &Path) -> Vec<PathBuf> {
        Vec::new()
    }

    fn find_in_path(&self, cmd_name: &str) -> Option<PathBuf> {
        if let Ok(output) = std::process::Command::new(cmd_name).arg("version").output() {
            if output.status.success() {
                return Some(PathBuf::from(cmd_name));
            }
        }
        None
    }
}
