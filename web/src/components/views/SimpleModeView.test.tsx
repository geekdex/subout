import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { SimpleModeView } from "./SimpleModeView";
import { ToastProvider } from "../ui/Toast";

// Mock api
vi.mock("../../api/client", () => ({
  api: {
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
  },
}));

describe("SimpleModeView Component", () => {
  it("renders 4 routing modes, outbound selector and live topology card", async () => {
    render(
      <ToastProvider>
        <SimpleModeView nodes={[]} />
      </ToastProvider>
    );

    // Initial loading or loaded content
    expect(await screen.findByText("小白极简模式 (Simple Mode)")).toBeDefined();
    expect(screen.getByText("智能分流")).toBeDefined();
    expect(screen.getByText("GFW 列表代理")).toBeDefined();
    expect(screen.getByText("全部代理")).toBeDefined();
    expect(screen.getByText("全部直连")).toBeDefined();

    // Verify right-side topology and network probe cards
    expect(screen.getByText("实时流量分流拓扑")).toBeDefined();
    expect(screen.getByText("网络连通性一键测速")).toBeDefined();
    expect(screen.getByText("大陆网站与 IP")).toBeDefined();
  });
});
