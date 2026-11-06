import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { NodeGroupsView } from "./NodeGroupsView";
import { NodeGroup, NodeItem, Subscription } from "../../types/api";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";

vi.mock("../../api/client", () => ({
  api: {
    createNodeGroup: vi.fn(),
    updateNodeGroup: vi.fn(),
    deleteNodeGroup: vi.fn(),
    syncNodeGroup: vi.fn(),
  },
}));

const mockSubscriptions: Subscription[] = [
  {
    id: 1,
    label: "香港主力机场",
    url: "https://sub1.example.com",
    enabled: true,
  },
  {
    id: 2,
    label: "备用机场",
    url: "https://sub2.example.com",
    enabled: true,
  },
];

const mockNodes: NodeItem[] = [
  {
    id: 101,
    subscription_id: 1,
    subscription_label: "香港主力机场",
    tag: "HK-01-Fast",
    node_type: "vless",
    server: "hk1.example.com",
    port: 443,
    raw_json: "{}",
    enabled: true,
  },
  {
    id: 102,
    subscription_id: 1,
    subscription_label: "香港主力机场",
    tag: "SG-02-BGP",
    node_type: "vless",
    server: "sg1.example.com",
    port: 443,
    raw_json: "{}",
    enabled: true,
  },
  {
    id: 201,
    subscription_id: 2,
    subscription_label: "备用机场",
    tag: "JP-03-Direct",
    node_type: "hysteria2",
    server: "jp1.example.com",
    port: 8443,
    raw_json: "{}",
    enabled: true,
  },
];

const mockGroups: NodeGroup[] = [
  {
    id: 1,
    tag: "HK-Auto",
    group_type: "urltest",
    match_type: "auto",
    subscriptions: "1",
    include_keywords: "HK",
    static_nodes: JSON.stringify(["HK-01-Fast"]),
  },
  {
    id: 2,
    tag: "My-Static",
    group_type: "selector",
    match_type: "static",
    static_nodes: JSON.stringify(["HK-01-Fast", "JP-03-Direct"]),
  },
];

const renderWithToast = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe("NodeGroupsView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders node groups list with match type badges and tags", () => {
    renderWithToast(
      <NodeGroupsView
        groups={mockGroups}
        versionCode="20261105220000"
        nodes={mockNodes}
        subscriptions={mockSubscriptions}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("HK-Auto")).toBeDefined();
    expect(screen.getByText("My-Static")).toBeDefined();
    expect(screen.getByText("⚡ 自动匹配")).toBeDefined();
    expect(screen.getByText("📌 静态节点")).toBeDefined();
    expect(screen.getByText(/全局版本号: 20261105220000/)).toBeDefined();
  });

  it("opens create modal and shows live matching node preview in auto-match mode", async () => {
    (api.createNodeGroup as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      id: 3,
    });

    renderWithToast(
      <NodeGroupsView
        groups={mockGroups}
        versionCode="20261105220000"
        nodes={mockNodes}
        subscriptions={mockSubscriptions}
        onRefresh={vi.fn()}
      />,
    );

    // Click "新建节点组合" button
    const createBtn = screen.getByRole("button", { name: /新建节点组合/i });
    fireEvent.click(createBtn);

    // Modal opens
    expect(screen.getByRole("heading", { name: "新建节点组合" })).toBeDefined();

    // Default match type is auto, shows live preview
    expect(screen.getByText("符合条件的节点列表 (弹框实时预览)")).toBeDefined();

    // Enter keyword "HK, JP" in keywords input
    const keywordInput = screen.getByPlaceholderText(/例如: 香港, HK/i);
    fireEvent.change(keywordInput, { target: { value: "HK, JP" } });

    // Live preview should now match HK-01-Fast and JP-03-Direct, but not SG-02-BGP
    expect(screen.getByText("已匹配 2 个节点")).toBeDefined();

    // Type group tag
    const tagInput = screen.getByPlaceholderText(/例如: HK-Auto 或 常用专线/i);
    fireEvent.change(tagInput, { target: { value: "Asia-Group" } });

    // Click save
    const saveBtn = screen.getByRole("button", { name: /保存组合/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.createNodeGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: "Asia-Group",
          match_type: "auto",
          include_keywords: "HK, JP",
        }),
      );
    });
  });

  it("supports switching to static mode, filtering and selecting nodes", async () => {
    (api.createNodeGroup as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      id: 4,
    });

    renderWithToast(
      <NodeGroupsView
        groups={mockGroups}
        versionCode="20261105220000"
        nodes={mockNodes}
        subscriptions={mockSubscriptions}
        onRefresh={vi.fn()}
      />,
    );

    // Click "新建节点组合"
    const createBtn = screen.getByRole("button", { name: /新建节点组合/i });
    fireEvent.click(createBtn);

    // Switch to static mode
    const staticTabBtn = screen.getByRole("button", { name: /静态节点组合/i });
    fireEvent.click(staticTabBtn);

    expect(screen.getByText("筛选待选节点池")).toBeDefined();
    expect(screen.getByText("点击勾选需要加入组合的节点")).toBeDefined();

    // Click on HK-01-Fast candidate to select it (pick the one inside the selection list)
    const hkCandidates = screen.getAllByText("HK-01-Fast");
    fireEvent.click(hkCandidates[hkCandidates.length - 1]);

    // Now selected nodes counter shows 1
    expect(screen.getByText("总计已选 1 个节点")).toBeDefined();

    // Tag name
    const tagInput = screen.getByPlaceholderText(/例如: HK-Auto 或 常用专线/i);
    fireEvent.change(tagInput, { target: { value: "Manual-HK" } });

    // Save
    const saveBtn = screen.getByRole("button", { name: /保存组合/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.createNodeGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          tag: "Manual-HK",
          match_type: "static",
          static_nodes: JSON.stringify(["HK-01-Fast"]),
        }),
      );
    });
  });
});
