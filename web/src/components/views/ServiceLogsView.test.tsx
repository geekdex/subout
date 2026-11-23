import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { ServiceLogsView } from "./ServiceLogsView";
import { api, ApiError } from "../../api/client";

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

describe("ServiceLogsView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders fetched logs", async () => {
    vi.mocked(api.getServiceLogs).mockResolvedValueOnce({
      logs: ["[INFO] started", "[WARN] slow"],
    } as never);
    render(<ServiceLogsView />);
    await waitFor(() =>
      expect(screen.getByText("[INFO] started")).toBeDefined(),
    );
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
});
