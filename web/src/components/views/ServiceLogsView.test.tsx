import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import React from "react";
import { ServiceLogsView } from "./ServiceLogsView";
import { api, ApiError } from "../../api/client";
import type { ServiceLogEntry } from "../../types/api";

vi.mock("../../api/client", () => ({
  api: { getServiceLogs: vi.fn(), clearServiceLogs: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const makeEntry = (
  message: string,
  source: ServiceLogEntry["source"] = "singbox",
  level: ServiceLogEntry["level"] = "info",
): ServiceLogEntry => ({
  timestamp: "2026-11-24 12:00:00",
  source,
  level,
  message,
});

describe("ServiceLogsView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getServiceLogs).mockResolvedValue({ logs: [] });
    vi.mocked(api.clearServiceLogs).mockResolvedValue({ success: true });
  });

  it("renders fetched structured logs", async () => {
    vi.mocked(api.getServiceLogs).mockResolvedValueOnce({
      logs: [
        makeEntry("started", "singbox", "info"),
        makeEntry("⚠️ slow", "subout", "warn"),
      ],
    });
    render(<ServiceLogsView />);
    await waitFor(() => expect(screen.getByText("started")).toBeDefined());
    expect(screen.getByText("⚠️ slow")).toBeDefined();
    expect(screen.getByText("sing-box")).toBeDefined();
    expect(screen.getByText("subout")).toBeDefined();
  });

  it("surfaces genuine fetch errors", async () => {
    vi.mocked(api.getServiceLogs).mockRejectedValueOnce(
      new ApiError("查询失败", 500),
    );
    render(<ServiceLogsView />);
    await waitFor(() => expect(screen.getByText(/日志拉取失败/)).toBeDefined());
  });

  it("ignores 401 background guards without an error banner", async () => {
    vi.mocked(api.getServiceLogs).mockRejectedValueOnce(
      new ApiError("未登录", 401),
    );
    render(<ServiceLogsView />);
    await waitFor(() => expect(api.getServiceLogs).toHaveBeenCalled());
    expect(screen.queryByText(/日志拉取失败/)).toBeNull();
  });

  it("clears the backend buffer and empties the visible list", async () => {
    vi.mocked(api.getServiceLogs).mockResolvedValueOnce({
      logs: [makeEntry("visible line")],
    });
    render(<ServiceLogsView />);
    await waitFor(() => expect(screen.getByText("visible line")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /清空日志/ }));

    await waitFor(() => expect(screen.queryByText("visible line")).toBeNull());
    expect(api.clearServiceLogs).toHaveBeenCalledTimes(1);
    expect(screen.getByText("暂无日志")).toBeDefined();
  });

  it("discards a poll that resolves after clear", async () => {
    let resolveFetch!: (value: { logs: ServiceLogEntry[] }) => void;
    const pending = new Promise<{ logs: ServiceLogEntry[] }>((resolve) => {
      resolveFetch = resolve;
    });
    vi.mocked(api.getServiceLogs).mockReturnValueOnce(pending as never);

    render(<ServiceLogsView />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /清空日志/ }));
    });
    expect(api.clearServiceLogs).toHaveBeenCalledTimes(1);

    // A stale response from before the clear must not repaint the buffer.
    await act(async () => {
      resolveFetch({ logs: [makeEntry("stale line")] });
    });
    expect(screen.queryByText("stale line")).toBeNull();
    expect(screen.getByText("暂无日志")).toBeDefined();
  });

  it("filters by source and by real level threshold", async () => {
    vi.mocked(api.getServiceLogs).mockResolvedValueOnce({
      logs: [
        makeEntry("kernel info", "singbox", "info"),
        makeEntry("kernel error", "singbox", "error"),
        makeEntry("subout warn", "subout", "warn"),
      ],
    });
    render(<ServiceLogsView />);
    await waitFor(() => expect(screen.getByText("kernel info")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "所有来源" }));
    fireEvent.click(screen.getByRole("option", { name: /sing-box 内核/ }));
    expect(screen.queryByText("subout warn")).toBeNull();
    expect(screen.getByText("kernel error")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "所有日志级别" }));
    fireEvent.click(screen.getByRole("option", { name: /ERROR 错误/ }));
    expect(screen.queryByText("kernel info")).toBeNull();
    expect(screen.getByText("kernel error")).toBeDefined();
  });
});
