import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { NodesView } from "./NodesView";
import {
  NodeItem,
  Subscription,
  SPEED_TEST_ENDPOINTS,
  NodePingProgressEvent,
} from "../../types/api";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";

vi.mock("../../api/client", () => ({
  api: {
    testNodeLatency: vi.fn(),
    testAllNodesLatency: vi.fn(),
    pingNodesStream: vi.fn(),
    deleteNode: vi.fn(),
    batchDeleteNodes: vi.fn(),
  },
}));

const mockNodes: NodeItem[] = [
  {
    id: 1,
    subscription_id: 10,
    subscription_label: "香港主力机场",
    tag: "HK-01-Fast",
    node_type: "vless",
    server: "hk.example.com",
    port: 443,
    raw_json: "{}",
    enabled: true,
    last_tcp_latency: 35,
    last_web_latency: 120,
    last_tested_at: "2026-11-05 16:30:00",
    last_target_url: "https://www.gstatic.com/generate_204",
  },
  {
    id: 2,
    subscription_id: 10,
    subscription_label: "香港主力机场",
    tag: "US-02-Cloudflare",
    node_type: "hysteria2",
    server: "us.example.com",
    port: 8443,
    raw_json: "{}",
    enabled: true,
    last_tcp_latency: 180,
    last_web_latency: 280,
    last_tested_at: "2026-11-05 16:35:00",
    last_target_url: "https://cp.cloudflare.com/generate_204",
  },
  {
    id: 3,
    subscription_id: null,
    is_custom: true,
    tag: "Custom-VPS",
    node_type: "shadowsocks",
    server: "vps.example.com",
    port: 8388,
    raw_json: "{}",
    enabled: true,
  },
];

const mockSubscriptions: Subscription[] = [
  {
    id: 10,
    label: "香港主力机场",
    url: "https://sub.example.com",
    enabled: true,
  },
  {
    id: 20,
    label: "备用机场",
    url: "https://sub2.example.com",
    enabled: true,
  },
];

const renderWithToast = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe("NodesView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it("renders nodes and displays default test endpoint", () => {
    renderWithToast(<NodesView nodes={mockNodes} onRefresh={vi.fn()} />);

    expect(screen.getByText("HK-01-Fast")).toBeDefined();
    expect(screen.getByText("US-02-Cloudflare")).toBeDefined();
    // Default endpoint text displayed
    expect(screen.getAllByText("Google 静态资源").length).toBeGreaterThan(0);
    // Shows test results and times
    expect(screen.getByText("120 ms")).toBeDefined();
    expect(screen.getByText("280 ms")).toBeDefined();
    expect(screen.getByText("Cloudflare 连通性")).toBeDefined();
  });

  it("allows selecting other test endpoints from dropdown", async () => {
    renderWithToast(<NodesView nodes={mockNodes} onRefresh={vi.fn()} />);

    // Click the dropdown trigger button
    const selectTrigger = screen.getByRole("button", {
      name: /Google 静态资源/i,
    });
    fireEvent.click(selectTrigger);

    // Verify options are available
    for (const ep of SPEED_TEST_ENDPOINTS) {
      expect(screen.getAllByText(ep.name).length).toBeGreaterThan(0);
    }

    // Select "Apple 网络连通性"
    const appleOpt = screen.getByText("Apple 网络连通性");
    fireEvent.click(appleOpt);

    // Verify localStorage updated
    expect(window.localStorage.getItem("subout_speedtest_endpoint")).toBe(
      "https://captive.apple.com/hotspot-detect.html",
    );
  });

  it("triggers single node test and shows progress bar while testing", async () => {
    const onRefresh = vi.fn();
    let resolveTest: (val: {
      latency_ms: number;
      web_latency: number;
      tcp_latency: number;
    }) => void;
    const testPromise = new Promise<{
      latency_ms: number;
      web_latency: number;
      tcp_latency: number;
    }>((resolve) => {
      resolveTest = resolve;
    });
    vi.mocked(api.testNodeLatency).mockReturnValueOnce(testPromise);

    renderWithToast(<NodesView nodes={mockNodes} onRefresh={onRefresh} />);

    // Click test button on a node
    const testButtons = screen.getAllByTitle(/使用当前测试点/i);
    fireEvent.click(testButtons[0]);

    // Should immediately display progress bar "测速中..."
    expect(await screen.findByText(/测速中\.\.\./i)).toBeDefined();

    // Resolve test
    resolveTest!({
      latency_ms: 115,
      web_latency: 115,
      tcp_latency: 32,
    });

    await waitFor(() => {
      expect(api.testNodeLatency).toHaveBeenCalledWith(
        expect.any(Number),
        "https://www.gstatic.com/generate_204",
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("triggers batch speed test stream with progress bars and dynamic rendering", async () => {
    const onRefresh = vi.fn();
    vi.mocked(api.pingNodesStream).mockImplementation(
      async (
        _opts,
        onProgress: (event: NodePingProgressEvent) => void,
        _signal,
      ) => {
        // Step 1: Node 2 is testing
        onProgress({
          id: 2,
          status: "testing",
        });
        // Step 2: Node 2 completed with 95ms
        onProgress({
          id: 2,
          status: "completed",
          web_latency: 95,
          tcp_latency: 28,
          tested_at: "2026-11-05 17:35:00",
          target_url: "https://www.gstatic.com/generate_204",
          completed: 1,
          total: 2,
        });
        // Step 3: Node 1 completed with 105ms
        onProgress({
          id: 1,
          status: "completed",
          web_latency: 105,
          tcp_latency: 30,
          tested_at: "2026-11-05 17:35:01",
          target_url: "https://www.gstatic.com/generate_204",
          completed: 2,
          total: 2,
        });
      },
    );

    renderWithToast(<NodesView nodes={mockNodes} onRefresh={onRefresh} />);

    // Click full speed test button
    const testAllBtn = screen.getByTitle(/对全部节点执行测速/i);
    fireEvent.click(testAllBtn);

    // Dynamic result rendering: node 2 renders 95 ms and node 1 renders 105 ms
    await waitFor(() => {
      expect(screen.getByText("95 ms")).toBeDefined();
      expect(screen.getByText("105 ms")).toBeDefined();
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("supports testing selected nodes only with stream", async () => {
    const onRefresh = vi.fn();
    vi.mocked(api.pingNodesStream).mockResolvedValueOnce(undefined);

    renderWithToast(<NodesView nodes={mockNodes} onRefresh={onRefresh} />);

    // Select a node checkbox
    const selectButtons = screen.getAllByRole("button");
    const checkboxRows = selectButtons.filter(
      (btn) => !btn.getAttribute("title") && !btn.textContent,
    );
    if (checkboxRows.length > 1) {
      fireEvent.click(checkboxRows[1]);
    }

    // Now "测速所选 (1)" button should be visible
    const testSelectedBtn = await screen.findByText(/测速所选 \(1\)/i);
    fireEvent.click(testSelectedBtn);

    await waitFor(() => {
      expect(api.pingNodesStream).toHaveBeenCalledWith(
        expect.objectContaining({
          ids: expect.arrayContaining([expect.any(Number)]),
          targetUrl: "https://www.gstatic.com/generate_204",
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      );
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("renders subscription column and custom node badge", () => {
    renderWithToast(
      <NodesView
        nodes={mockNodes}
        subscriptions={mockSubscriptions}
        onRefresh={vi.fn()}
      />,
    );

    // Header exists
    expect(screen.getByText("所属订阅 / 来源")).toBeDefined();
    // Subscription label displayed
    expect(screen.getAllByText("香港主力机场").length).toBeGreaterThan(0);
    // Custom node badge displayed
    expect(screen.getByText("自定义节点")).toBeDefined();
  });

  it("filters nodes by subscription from dropdown", () => {
    renderWithToast(
      <NodesView
        nodes={mockNodes}
        subscriptions={mockSubscriptions}
        onRefresh={vi.fn()}
      />,
    );

    // Initial state: all 3 nodes present
    expect(screen.getByText("HK-01-Fast")).toBeDefined();
    expect(screen.getByText("Custom-VPS")).toBeDefined();

    // Click subscription filter dropdown
    const subFilterButton = screen.getByRole("button", {
      name: /全部来源/i,
    });
    fireEvent.click(subFilterButton);

    // Select "自定义节点"
    const customOption = screen.getByText(/自定义节点 \(1\)/i);
    fireEvent.click(customOption);

    // Now Custom-VPS should be visible, but HK-01-Fast should be filtered out
    expect(screen.getByText("Custom-VPS")).toBeDefined();
    expect(screen.queryByText("HK-01-Fast")).toBeNull();
  });

  it("supports pagination with default 20 items and switching page size to 50", async () => {
    // Generate 45 nodes (ids 1..45)
    const manyNodes: NodeItem[] = Array.from({ length: 45 }, (_, i) => ({
      id: i + 1,
      subscription_id: 10,
      subscription_label: "香港主力机场",
      tag: `Node-${String(i + 1).padStart(2, "0")}`,
      node_type: "vless",
      server: `node${i + 1}.example.com`,
      port: 443,
      raw_json: JSON.stringify({ tag: `Node-${i + 1}`, server: `node${i + 1}.example.com` }),
      enabled: true,
      last_web_latency: 50 + i,
      last_tested_at: "2026-11-05 16:30:00",
    }));

    renderWithToast(<NodesView nodes={manyNodes} onRefresh={vi.fn()} />);

    // Default sort is ID desc: page 1 displays Node-45 down to Node-26
    expect(screen.getByText("Node-45")).toBeDefined();
    expect(screen.getByText("Node-26")).toBeDefined();
    expect(screen.queryByText("Node-25")).toBeNull();
    expect(screen.getByText("1 / 3")).toBeDefined();

    // Navigate to page 2 using "下一页" button
    const nextBtn = screen.getByTitle("下一页");
    fireEvent.click(nextBtn);

    // Now page 2 displays Node-25 down to Node-06
    expect(screen.queryByText("Node-45")).toBeNull();
    expect(screen.getByText("Node-25")).toBeDefined();
    expect(screen.getByText("Node-06")).toBeDefined();
    expect(screen.queryByText("Node-05")).toBeNull();
    expect(screen.getByText("2 / 3")).toBeDefined();

    // Change page size to 50
    const pageSizeBtn = screen.getByRole("button", { name: /20 条/i });
    fireEvent.click(pageSizeBtn);

    const option50 = screen.getByText("50 条");
    fireEvent.click(option50);

    // Now all 45 nodes fit in page 1
    expect(screen.getByText("Node-45")).toBeDefined();
    expect(screen.getByText("Node-01")).toBeDefined();
    expect(screen.getByText("1 / 1")).toBeDefined();
  });

  it("opens node detail modal and toggles between structured info and JSON view", async () => {
    const nodeWithJson: NodeItem = {
      id: 99,
      subscription_id: 10,
      subscription_label: "香港主力机场",
      tag: "Special-Node-99",
      node_type: "vless",
      server: "special.example.com",
      port: 443,
      raw_json: JSON.stringify(
        {
          type: "vless",
          tag: "Special-Node-99",
          server: "special.example.com",
          server_port: 443,
          uuid: "abcdef-1234-5678",
        },
        null,
        2,
      ),
      enabled: true,
      last_web_latency: 68,
      last_tcp_latency: 22,
      last_tested_at: "2026-11-05 16:30:00",
      last_target_url: "https://www.gstatic.com/generate_204",
    };

    renderWithToast(<NodesView nodes={[nodeWithJson]} onRefresh={vi.fn()} />);

    // Click "详情" button
    const detailBtn = screen.getByRole("button", { name: /详情/i });
    fireEvent.click(detailBtn);

    // Dialog title & structured content should appear
    expect(screen.getByText("节点配置详情")).toBeDefined();
    expect(screen.getAllByText("Special-Node-99").length).toBeGreaterThan(0);
    expect(screen.getAllByText("special.example.com:443").length).toBeGreaterThan(0);

    // Switch to "原始 JSON 视图" tab
    const jsonTabBtn = screen.getByRole("button", { name: /原始 JSON 视图/i });
    fireEvent.click(jsonTabBtn);

    // Verify raw JSON content is rendered
    expect(screen.getByText(/abcdef-1234-5678/)).toBeDefined();

    // Close the modal
    const closeBtn = screen.getByRole("button", { name: /关闭/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText("节点配置详情")).toBeNull();
    });
  });
});
