import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Header } from "./Header";
import { ServiceStatus, SystemInfo } from "../../types/api";

const baseInfo: SystemInfo = {
  host_os: "linux",
  host_arch: "x86_64",
  app_mode: "simple",
  running_config_id: null,
};

const baseStatus: ServiceStatus = {
  running: false,
  ready: false,
  pid: null,
  uptime_secs: 0,
  mixed_port: 2080,
  is_tun: false,
  tun_interface: null,
  cpu_usage: 0,
  memory_bytes: 0,
  last_error: null,
  active_mode: "simple",
  running_config_id: null,
  system_proxy_enabled: false,
  system_proxy_supported: true,
};

type RunMode = "local" | "hosting" | "hybrid";

const renderHeader = (
  runMode: RunMode,
  overrides: Partial<ServiceStatus> = {},
) => {
  return render(
    <Header
      systemInfo={baseInfo}
      serviceStatus={{ ...baseStatus, ...overrides }}
      runningProfile={null}
      actionLoading={false}
      runMode={runMode}
      onStartService={vi.fn()}
      onStopService={vi.fn()}
      onRestartService={vi.fn()}
      onToggleSystemProxy={vi.fn()}
      onSwitchMode={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
};

describe("Header run mode interactions", () => {
  it("hides service start button and disables the system proxy switch in hosting mode", () => {
    renderHeader("hosting");

    expect(screen.queryByRole("button", { name: /启动/ })).toBeNull();
    expect(screen.getAllByText(/本机代理未启用/).length).toBeGreaterThan(0);

    const proxySwitch = screen.getByRole("switch");
    expect(proxySwitch.hasAttribute("disabled")).toBe(true);

    // 托管是正常生效状态，不能显示误导性的「已停止」
    expect(screen.queryByText(/已停止/)).toBeNull();
    expect(screen.getByText("托管中")).toBeDefined();
  });

  it("shows a composite hosting + proxy status in hybrid mode", () => {
    renderHeader("hybrid", { running: true, ready: true });

    expect(screen.getByText(/托管中 · 代理中/)).toBeDefined();
  });

  it("shows hosting active but proxy not started in hybrid mode at rest", () => {
    renderHeader("hybrid");

    expect(screen.getByText(/托管中 · 代理未启动/)).toBeDefined();
  });

  it("keeps the original service status wording in local mode", () => {
    renderHeader("local", { running: true, ready: true });

    expect(screen.getByText(/运行就绪/)).toBeDefined();
    expect(screen.queryByText(/托管中/)).toBeNull();
  });
});
