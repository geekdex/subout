import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SimpleModeView } from "./SimpleModeView";
import { ToastProvider } from "../ui/Toast";

// Mock api
vi.mock("../../api/client", () => ({
  api: {
    getSystemInfo: vi.fn().mockResolvedValue({
      host_os: "linux",
      host_arch: "x86_64",
      app_mode: "simple",
      running_config_id: null,
      is_linux: true,
    }),
    getSimpleConfig: vi.fn().mockResolvedValue({
      log: { level: "info" },
      dns: { mode: "preset_fakeip", domestic_dns: "223.5.5.5" },
      inbound: { inbound_type: "tun", mixed_port: 2080 },
      route: {
        mode: "smart",
        block_ads: true,
        bypass_lan: true,
        default_outbound: "AUTO-Test",
      },
    }),
    saveSimpleConfig: vi.fn().mockResolvedValue({ success: true }),
    previewSimpleConfig: vi.fn().mockResolvedValue({
      log: { level: "info" },
      inbounds: [{ type: "tun", interface_name: "tun0" }],
      outbounds: [{ type: "urltest", tag: "AUTO-Test" }],
      route: { rules: [] },
    }),
  },
}));

describe("SimpleModeView Component", () => {
  it("renders 4 routing modes, inbound selector, DNS selector and live topology card without browser speed test", async () => {
    render(
      <ToastProvider>
        <SimpleModeView nodes={[]} />
      </ToastProvider>,
    );

    // Initial loading or loaded content
    expect(await screen.findByText("小白极简模式 (Simple Mode)")).toBeDefined();
    expect(screen.getByText("智能分流")).toBeDefined();
    expect(screen.getByText("GFW 列表代理")).toBeDefined();
    expect(screen.getByText("全部代理")).toBeDefined();
    expect(screen.getByText("全部直连")).toBeDefined();

    // Verify inbound mode selection & TUN stack
    expect(screen.getByText("代理入站接入方式")).toBeDefined();
    expect(screen.getByText("TUN 虚拟网卡 (默认)")).toBeDefined();
    expect(screen.getByText("混合代理端口 (备选)")).toBeDefined();

    // Verify DNS mode selection
    expect(screen.getAllByText("DNS 解析策略").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/LocalDNS \+ FakeIP/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/自定义 DNS/).length).toBeGreaterThanOrEqual(1);

    // Verify right-side topology card
    expect(screen.getByText("实时流量分流拓扑")).toBeDefined();
    expect(screen.getByText("大陆网站与 IP")).toBeDefined();

    // Verify browser-side "网络连通性一键测速" is removed
    expect(screen.queryByText("网络连通性一键测速")).toBeNull();
  });

  it("disables auto_route on non-linux systems and marks it as unavailable", async () => {
    const nonLinuxSystemInfo = {
      host_os: "macos" as const,
      host_arch: "arm64",
      app_mode: "simple" as const,
      running_config_id: null,
      is_linux: false,
    };

    render(
      <ToastProvider>
        <SimpleModeView nodes={[]} systemInfo={nonLinuxSystemInfo} />
      </ToastProvider>,
    );

    expect(await screen.findByText("小白极简模式 (Simple Mode)")).toBeDefined();

    // Verify "仅限 Linux" badge appears
    expect(screen.getByText("仅限 Linux")).toBeDefined();
    expect(
      screen.getByText(/Auto Route 仅在 Linux 平台受支持；当前系统（MACOS）已禁用，不可开启/),
    ).toBeDefined();

    // Verify switch is disabled
    const switches = screen.getAllByRole("switch");
    // The auto_route switch is the first switch under TUN inbounds
    const autoRouteSwitch = switches.find((s) => s.getAttribute("disabled") !== null);
    expect(autoRouteSwitch).toBeDefined();
    expect(autoRouteSwitch?.getAttribute("aria-checked")).toBe("false");
  });

  it("renders preview config button, opens modal dialog and displays formatted JSON configuration", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <ToastProvider>
        <SimpleModeView nodes={[]} />
      </ToastProvider>,
    );

    const previewBtn = await screen.findByRole("button", { name: "预览配置" });
    expect(previewBtn).toBeDefined();

    fireEvent.click(previewBtn);

    expect(await screen.findByText("sing-box JSON 配置预览")).toBeDefined();
    const previewEl = screen.getByTestId("simple-mode-json-preview");
    expect(previewEl).toBeDefined();
    expect(previewEl.textContent).toContain('"type": "tun"');
    expect(previewEl.textContent).toContain('"tag": "AUTO-Test"');

    const closeBtn = screen.getByRole("button", { name: "关闭" });
    fireEvent.click(closeBtn);
  });
});
