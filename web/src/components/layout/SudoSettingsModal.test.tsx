import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SudoSettingsModal } from "./SudoSettingsModal";
import { ToastProvider } from "../ui/Toast";
import { SystemInfo } from "../../types/api";

const renderModal = (props: React.ComponentProps<typeof SudoSettingsModal>) => {
  return render(
    <ToastProvider>
      <SudoSettingsModal {...props} />
    </ToastProvider>,
  );
};

const baseInfo: SystemInfo = {
  host_os: "linux",
  host_arch: "x86_64",
  app_mode: "simple",
  running_config_id: null,
  is_root: false,
  sudo_configured: false,
  has_temp_sudo: false,
};

describe("SudoSettingsModal Component", () => {
  it("does not render when open is false", () => {
    renderModal({
      open: false,
      onClose: vi.fn(),
      systemInfo: baseInfo,
      onRefresh: vi.fn(),
    });

    expect(screen.queryByText("系统提权与管理访问权限 (Sudo)")).toBeNull();
  });

  it("renders limited access mode and input when sudo not configured", () => {
    renderModal({
      open: true,
      onClose: vi.fn(),
      systemInfo: baseInfo,
      onRefresh: vi.fn(),
    });

    expect(screen.getByText("系统提权与管理访问权限 (Sudo)")).toBeDefined();
    expect(screen.getByText("功能受限")).toBeDefined();
    expect(screen.getByText("验证并开启管理员权限")).toBeDefined();
    expect(
      screen.getByPlaceholderText("输入当前操作系统的 Sudo 密码..."),
    ).toBeDefined();
  });

  it("renders permanent admin mode when sudo is configured", () => {
    renderModal({
      open: true,
      onClose: vi.fn(),
      systemInfo: { ...baseInfo, sudo_configured: true },
      onRefresh: vi.fn(),
    });

    expect(screen.getByText("管理员权限 (永久有效)")).toBeDefined();
    expect(screen.getByText("更新提权密码")).toBeDefined();
    expect(screen.getByText("清除提权密码")).toBeDefined();
  });

  it("renders root mode and hides password input when running as root", () => {
    renderModal({
      open: true,
      onClose: vi.fn(),
      systemInfo: { ...baseInfo, is_root: true },
      onRefresh: vi.fn(),
    });

    expect(screen.getByText("管理员权限 (Root 运行)")).toBeDefined();
    expect(
      screen.getByText("程序直接以系统最高管理员 (Root) 用户运行"),
    ).toBeDefined();
    expect(
      screen.queryByPlaceholderText("输入当前操作系统的 Sudo 密码..."),
    ).toBeNull();
  });
});
