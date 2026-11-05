import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { SubscriptionsView } from "./SubscriptionsView";
import { Subscription } from "../../types/api";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";

vi.mock("../../api/client", () => ({
  api: {
    toggleSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    createSubscription: vi.fn(),
    deleteSubscription: vi.fn(),
    syncSubscription: vi.fn(),
  },
}));

const mockSubs: Subscription[] = [
  {
    id: 1,
    label: "主力机场A",
    url: "https://sub1.com/link",
    enabled: true,
    node_count: 15,
  },
  {
    id: 2,
    label: "备用机场B",
    url: "https://sub2.com/link",
    enabled: false,
    node_count: 0,
  },
];

const renderWithToast = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe("SubscriptionsView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders subscriptions with enabled status and node count", () => {
    renderWithToast(
      <SubscriptionsView subscriptions={mockSubs} onRefresh={vi.fn()} />,
    );

    expect(screen.getByText("主力机场A")).toBeDefined();
    expect(screen.getByText("15 节点")).toBeDefined();
    expect(screen.getByText("已开启")).toBeDefined();

    expect(screen.getByText("备用机场B")).toBeDefined();
    expect(screen.getByText("已关闭")).toBeDefined();
  });

  it("calls toggleSubscription directly when enabling a disabled subscription", async () => {
    const onRefresh = vi.fn();
    vi.mocked(api.toggleSubscription).mockResolvedValueOnce({
      success: true,
      enabled: true,
      nodes_cleared: 0,
      groups_updated: 0,
      message: "订阅已开启",
    });

    renderWithToast(
      <SubscriptionsView subscriptions={mockSubs} onRefresh={onRefresh} />,
    );

    // The switch for 备用机场B has aria-label="开启此订阅"
    const enableSwitch = screen.getByLabelText("开启此订阅");
    fireEvent.click(enableSwitch);

    await waitFor(() => {
      expect(api.toggleSubscription).toHaveBeenCalledWith(2, { enabled: true });
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("opens confirmation dialog when turning off an enabled subscription, and supports sync to nodes and groups", async () => {
    const onRefresh = vi.fn();
    vi.mocked(api.toggleSubscription).mockResolvedValueOnce({
      success: true,
      enabled: false,
      nodes_cleared: 15,
      groups_updated: 2,
      message: "订阅已关闭，已清空 15 个关联节点并更新 2 个节点组合",
    });

    renderWithToast(
      <SubscriptionsView subscriptions={mockSubs} onRefresh={onRefresh} />,
    );

    // Click switch for 主力机场A (aria-label="关闭此订阅")
    const disableSwitch = screen.getByLabelText("关闭此订阅");
    fireEvent.click(disableSwitch);

    // Confirm dialog should appear
    expect(screen.getByText("确认关闭订阅源？")).toBeDefined();
    expect(screen.getByText("同步到节点和节点组合")).toBeDefined();
    expect(
      screen.getByText(
        "注意：不要影响到配置，配置需要再手动点击同步才同步到配置。",
      ),
    ).toBeDefined();

    // Click "确认关闭" button
    const confirmBtn = screen.getByText("确认关闭");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.toggleSubscription).toHaveBeenCalledWith(1, {
        enabled: false,
        clear_nodes_and_groups: true,
      });
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
