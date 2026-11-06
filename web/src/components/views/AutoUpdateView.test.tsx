import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AutoUpdateView } from "./AutoUpdateView";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";
import {
  AutoUpdateSettings,
  AutoUpdateHistoryResponse,
  AutoUpdateSnapshot,
} from "../../types/api";

vi.mock("../../api/client", () => ({
  api: {
    getAutoUpdateSettings: vi.fn(),
    saveAutoUpdateSettings: vi.fn(),
    listAutoUpdateSnapshots: vi.fn(),
    triggerAutoUpdate: vi.fn(),
    streamAutoUpdate: vi.fn(),
    getAutoUpdateStatus: vi.fn(),
    getAutoUpdateSnapshotDetail: vi.fn(),
    rollbackAutoUpdateSnapshot: vi.fn(),
  },
}));

const mockSettings: AutoUpdateSettings = {
  enabled: true,
  interval: "12h",
  cron: "0 0 4 * * *",
  cron_expression: "0 0 4 * * *",
  sync_running_config: true,
  reload_service: true,
  last_status: "success",
  last_run: 1730870400,
  next_run: 1730913600,
  current_version_code: 20261106090000,
};

const mockSnapshots: AutoUpdateSnapshot[] = [
  {
    id: 1,
    config_id: 10,
    config_name: "默认Linux配置",
    change_type: "manual_update",
    action: "手动更新",
    status: "success",
    detail: "手动更新完成 (节点组合 versionCode: 20261106090000)",
    has_content: true,
    log: "[2026-11-06 09:00:00] 自动更新任务启动...\n[2026-11-06 09:00:01] sing-box 校验成功！\n",
    version_code: 20261106090000,
    created_at: "2026-11-06 09:00:00",
  },
  {
    id: 2,
    config_id: 10,
    config_name: "默认Linux配置",
    change_type: "auto_update",
    action: "自动更新",
    status: "success",
    detail: "自动更新覆盖运行配置 [默认Linux配置]",
    has_content: true,
    log: "[2026-11-05 21:00:00] 自动更新任务启动...\n",
    version_code: 20261105210000,
    created_at: "2026-11-05 21:00:00",
  },
];

const mockHistoryResponse: AutoUpdateHistoryResponse = {
  items: mockSnapshots,
  total: 42,
  page: 1,
  page_size: 20,
  total_pages: 3,
};

const renderWithToast = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe("AutoUpdateView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.mocked(api.getAutoUpdateSettings).mockResolvedValue(mockSettings);
    vi.mocked(api.listAutoUpdateSnapshots).mockResolvedValue(
      mockHistoryResponse,
    );
  });

  it("renders settings and history snapshots with pagination", async () => {
    renderWithToast(<AutoUpdateView />);

    await waitFor(() => {
      expect(
        screen.getByText("自动更新中心 (Auto Update Center)"),
      ).toBeDefined();
    });

    // Check settings rendered
    expect(screen.getByText("定时自动更新调度策略")).toBeDefined();
    expect(screen.getByText("自动同步至当前运行配置")).toBeDefined();
    expect(screen.getByText("平滑热重载 sing-box 服务")).toBeDefined();

    // Check history items rendered
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();
    expect(screen.getByText("手动更新")).toBeDefined();
    expect(screen.getByText("自动更新")).toBeDefined();

    // Check pagination count rendered (42 items total, 20 per page)
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("1 / 3")).toBeDefined();
  });

  it("supports pagination controls and calls listAutoUpdateSnapshots with new page", async () => {
    renderWithToast(<AutoUpdateView />);

    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeDefined();
    });

    vi.mocked(api.listAutoUpdateSnapshots).mockResolvedValueOnce({
      ...mockHistoryResponse,
      page: 2,
    });

    const nextBtn = screen.getByTitle("下一页");
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(api.listAutoUpdateSnapshots).toHaveBeenCalledWith({
        page: 2,
        page_size: 20,
      });
    });
  });

  it("opens manual update modal with real-time logs terminal and triggers update", async () => {
    vi.mocked(api.triggerAutoUpdate).mockResolvedValueOnce({
      status: "started",
      message: "已成功触发全流程更新流水线",
    });
    vi.mocked(api.streamAutoUpdate).mockImplementation(async (onEvent) => {
      onEvent({
        event_type: "log",
        message: "步骤 1: 正在选择当前运行的配置...",
        status: "running",
      });
      onEvent({
        event_type: "done",
        message: "更新完成",
        status: "success",
        version_code: 20261106093000,
      });
    });

    renderWithToast(<AutoUpdateView />);

    await waitFor(() => {
      expect(screen.getByText("立即手动更新")).toBeDefined();
    });

    const triggerBtn = screen.getByText("立即手动更新");
    fireEvent.click(triggerBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText("执行全流程更新")).toBeDefined();
      expect(screen.getByText("实时更新控制台日志")).toBeDefined();
    });

    expect(api.triggerAutoUpdate).toHaveBeenCalled();
  });

  it("opens log detail modal when clicking 查看日志", async () => {
    renderWithToast(<AutoUpdateView />);

    await waitFor(() => {
      expect(screen.getAllByText("查看日志").length).toBeGreaterThan(0);
    });

    const viewLogBtns = screen.getAllByText("查看日志");
    fireEvent.click(viewLogBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/更新历史日志详情/)).toBeDefined();
      expect(screen.getByText(/sing-box 校验成功！/)).toBeDefined();
    });
  });

  it("opens rollback modal and performs rollback", async () => {
    vi.mocked(api.rollbackAutoUpdateSnapshot).mockResolvedValueOnce({
      success: true,
      message: "回滚成功",
    });

    renderWithToast(<AutoUpdateView />);

    await waitFor(() => {
      expect(screen.getAllByText("回滚至此").length).toBeGreaterThan(0);
    });

    const rollbackBtns = screen.getAllByText("回滚至此");
    fireEvent.click(rollbackBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("确认回滚配置快照？")).toBeDefined();
    });

    const confirmBtn = screen.getByText("确认回滚");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.rollbackAutoUpdateSnapshot).toHaveBeenCalledWith(1);
    });
  });
});
