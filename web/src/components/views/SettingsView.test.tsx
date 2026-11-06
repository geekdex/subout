import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SettingsView } from "./SettingsView";
import { SystemInfo } from "../../types/api";
import { ToastProvider } from "../ui/Toast";

const baseInfo: SystemInfo = {
  host_os: "macos",
  host_arch: "arm64",
  app_mode: "simple",
  running_config_id: null,
  is_root: false,
  sudo_configured: false,
  has_temp_sudo: false,
  default_tun_stack: "system",
};

const renderWithToast = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe("SettingsView Component", () => {
  it("does not render client operation mode switch card", () => {
    renderWithToast(
      <SettingsView systemInfo={baseInfo} onRefreshSystemInfo={vi.fn()} />,
    );

    // Mode switch card should be removed
    expect(screen.queryByText("客户端运作模式")).toBeNull();
    expect(screen.queryByText("4 种傻瓜策略，一键切换")).toBeNull();
  });

  it("does not render sudo password card in settings view (migrated to top header)", () => {
    renderWithToast(
      <SettingsView systemInfo={baseInfo} onRefreshSystemInfo={vi.fn()} />,
    );

    // Sudo password settings moved to header, not duplicated in settings view
    expect(screen.queryByText("系统提权密码 (Sudo)")).toBeNull();
    expect(
      screen.queryByPlaceholderText("输入当前主机 Sudo 提权密码..."),
    ).toBeNull();
  });

  it("does not render theme switcher in settings view (migrated to header to avoid redundancy)", () => {
    renderWithToast(
      <SettingsView systemInfo={baseInfo} onRefreshSystemInfo={vi.fn()} />,
    );

    expect(screen.queryByText("全局界面主题 (Theme)")).toBeNull();
  });

  it("renders admin web password change card and host environment status", () => {
    renderWithToast(
      <SettingsView
        systemInfo={{ ...baseInfo, sudo_configured: true }}
        onRefreshSystemInfo={vi.fn()}
      />,
    );

    expect(screen.getByText("修改面板管理员密码")).toBeDefined();
    expect(screen.getByText("确认修改密码")).toBeDefined();
    expect(screen.getByText("主机环境状态")).toBeDefined();
    expect(screen.getByText("管理员 (永久有效)")).toBeDefined();
  });
});
