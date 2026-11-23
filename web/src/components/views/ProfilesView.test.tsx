import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ProfilesView } from "./ProfilesView";
import { ToastProvider } from "../ui/Toast";
import { ConfigProfile, SystemInfo } from "../../types/api";
import { api } from "../../api/client";

vi.mock("../../api/client", () => ({
  api: {
    deleteConfig: vi.fn(),
    resetConfigToken: vi.fn(),
    setRunningConfig: vi.fn(),
    saveConfig: vi.fn(),
    getConfigProfiles: vi.fn(),
  },
}));

const profile: ConfigProfile = {
  id: 1,
  name: "测试配置",
  platform: "linux",
  token: "token-12345678",
  version_code: 1,
  content: "{}",
};

const systemInfo: SystemInfo = {
  host_os: "linux",
  host_arch: "x86_64",
  app_mode: "expert",
  running_config_id: null,
};

const renderView = () =>
  render(
    <ToastProvider>
      <ProfilesView
        configs={[profile]}
        runningProfile={null}
        systemInfo={systemInfo}
        onRefresh={vi.fn()}
      />
    </ToastProvider>,
  );

describe("ProfilesView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the profile and its subscription URL", () => {
    renderView();
    expect(screen.getByText("测试配置")).toBeDefined();
    expect(screen.getAllByText(/sub\//).length).toBeGreaterThan(0);
  });

  it("guards the delete confirmation against double clicks", async () => {
    let resolveDelete: () => void = () => {};
    vi.mocked(api.deleteConfig).mockImplementationOnce(
      () =>
        new Promise<{ success: boolean }>(
          (r) => (resolveDelete = () => r({ success: true })),
        ),
    );
    renderView();

    // Open delete confirmation for the profile
    fireEvent.click(screen.getByTitle("删除配置"));
    const confirm = screen
      .getByText("确认删除")
      .closest("button") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(confirm.disabled).toBe(true); // in-flight guard
    fireEvent.click(confirm);
    resolveDelete();
    await waitFor(() => expect(api.deleteConfig).toHaveBeenCalledTimes(1));
  });
});
