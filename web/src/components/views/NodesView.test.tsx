import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { NodesView } from "./NodesView";
import {
  NodeItem,
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
});
