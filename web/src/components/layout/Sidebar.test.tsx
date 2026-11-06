import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

describe("Sidebar & Header with numeric version_code", () => {
  it("Sidebar renders without crashing when versionCode is a number or numeric string", () => {
    render(
      <Sidebar
        currentTab="dashboard"
        onSelectTab={vi.fn()}
        isKernelReady={true}
        appMode="expert"
        versionCode={20261103212000 as unknown as string}
        nodeCount={5}
      />,
    );

    // Should display slice of versionCode
    expect(screen.getByText("节点组合")).toBeDefined();
    expect(screen.getByText("v2000")).toBeDefined();
  });

  it("Header renders without crashing when runningProfile.version_code is a number", () => {
    render(
      <Header
        systemInfo={{
          host_os: "macos",
          host_arch: "arm64",
          default_tun_stack: "system",
          sudo_configured: true,
          portable_mode: false,
          app_mode: "expert",
          running_config_id: 1,
        }}
        serviceStatus={{
          running: true,
          ready: true,
          pid: 1234,
          uptime_secs: 100,
          mixed_port: 7890,
          is_tun: true,
          tun_interface: "utun3",
          cpu_usage: 1.2,
          memory_bytes: 10485760,
          last_error: null,
          active_mode: "expert",
          running_config_id: 1,
        }}
        runningProfile={{
          id: 1,
          name: "默认配置",
          platform: "macos",
          token: "550e8400-e29b-41d4-a716-446655440000",
          version_code: 20261103212000 as unknown as string,
          content: "{}",
        }}
        actionLoading={false}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onToggleSystemProxy={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getByText("默认配置")).toBeDefined();
    expect(screen.getByText("(212000)")).toBeDefined();
  });

  it("Header renders Cockpit-style sudo administrative access button and triggers onOpenSudoSettings", () => {
    const onOpenSudo = vi.fn();
    const { rerender } = render(
      <Header
        systemInfo={{
          host_os: "linux",
          host_arch: "x86_64",
          default_tun_stack: "system",
          sudo_configured: false,
          is_root: false,
          app_mode: "simple",
          running_config_id: null,
        }}
        serviceStatus={null}
        runningProfile={null}
        actionLoading={false}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onToggleSystemProxy={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogout={vi.fn()}
        onOpenSudoSettings={onOpenSudo}
      />,
    );

    // When not root and not configured -> Limited access
    const limitedBtn = screen.getByText("功能受限");
    expect(limitedBtn).toBeDefined();
    expect(screen.getByText("点击提权")).toBeDefined();

    limitedBtn.click();
    expect(onOpenSudo).toHaveBeenCalledTimes(1);

    // When configured -> Admin access (Permanent)
    rerender(
      <Header
        systemInfo={{
          host_os: "linux",
          host_arch: "x86_64",
          default_tun_stack: "system",
          sudo_configured: true,
          is_root: false,
          app_mode: "simple",
          running_config_id: null,
        }}
        serviceStatus={null}
        runningProfile={null}
        actionLoading={false}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onToggleSystemProxy={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogout={vi.fn()}
        onOpenSudoSettings={onOpenSudo}
      />,
    );
    expect(screen.getByText("管理员权限")).toBeDefined();
    expect(screen.getByText("永久有效")).toBeDefined();
  });

  it("Sidebar renders mobile drawer when mobileOpen is true and handles onCloseMobile", () => {
    const onCloseMobile = vi.fn();
    const onSelectTab = vi.fn();

    const { rerender } = render(
      <Sidebar
        currentTab="dashboard"
        onSelectTab={onSelectTab}
        isKernelReady={true}
        appMode="simple"
        mobileOpen={false}
        onCloseMobile={onCloseMobile}
      />,
    );

    // When false, close button is not in DOM
    expect(screen.queryByLabelText("关闭导航菜单")).toBeNull();

    // When true, close button is in DOM
    rerender(
      <Sidebar
        currentTab="dashboard"
        onSelectTab={onSelectTab}
        isKernelReady={true}
        appMode="simple"
        mobileOpen={true}
        onCloseMobile={onCloseMobile}
      />,
    );

    const closeBtn = screen.getByLabelText("关闭导航菜单");
    expect(closeBtn).toBeDefined();
    closeBtn.click();
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it("Header triggers onToggleMobileMenu when mobile menu button is clicked", () => {
    const onToggle = vi.fn();
    render(
      <Header
        systemInfo={null}
        serviceStatus={null}
        runningProfile={null}
        actionLoading={false}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onToggleSystemProxy={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogout={vi.fn()}
        onToggleMobileMenu={onToggle}
      />,
    );

    const menuBtn = screen.getByLabelText("打开菜单");
    expect(menuBtn).toBeDefined();
    expect(menuBtn.getAttribute("aria-expanded")).toBe("false");
    menuBtn.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("Header reflects isMobileMenuOpen with aria-expanded and active styling", () => {
    render(
      <Header
        systemInfo={null}
        serviceStatus={null}
        runningProfile={null}
        actionLoading={false}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onToggleSystemProxy={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogout={vi.fn()}
        onToggleMobileMenu={vi.fn()}
        isMobileMenuOpen={true}
      />,
    );

    const menuBtn = screen.getByLabelText("打开菜单");
    expect(menuBtn.getAttribute("aria-expanded")).toBe("true");
    expect(menuBtn.getAttribute("title")).toBe("关闭菜单");
  });

  it("Sidebar locks body scroll when open and handles Escape key to close", () => {
    const onCloseMobile = vi.fn();
    const { unmount } = render(
      <Sidebar
        currentTab="dashboard"
        onSelectTab={vi.fn()}
        isKernelReady={true}
        appMode="simple"
        mobileOpen={true}
        onCloseMobile={onCloseMobile}
      />,
    );

    expect(document.body.style.overflow).toBe("hidden");

    // Trigger Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCloseMobile).toHaveBeenCalledTimes(1);

    // Body overflow restored on unmount
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("Sidebar triggers onCloseMobile on swipe-left touch gesture", () => {
    const onCloseMobile = vi.fn();
    render(
      <Sidebar
        currentTab="dashboard"
        onSelectTab={vi.fn()}
        isKernelReady={true}
        appMode="simple"
        mobileOpen={true}
        onCloseMobile={onCloseMobile}
      />,
    );

    const drawerDialog = screen.getByRole("dialog", { name: "导航菜单" });
    expect(drawerDialog).toBeDefined();

    // The drawer panel is the second child inside the dialog
    const panel = drawerDialog.children[1];
    expect(panel).toBeDefined();

    // Simulate swipe left (startX: 200, endX: 100 -> deltaX = -100)
    fireEvent.touchStart(panel, {
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchMove(panel, {
      touches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchEnd(panel, {
      changedTouches: [{ clientX: 100, clientY: 100 }],
    });

    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });
});
