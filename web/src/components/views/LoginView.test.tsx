import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { LoginView } from "./LoginView";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";

vi.mock("../../api/client", () => ({
  api: {
    login: vi.fn(),
    getPasswordState: vi.fn().mockResolvedValue({
      is_default: true,
      is_env_set: false,
    }),
  },
}));

const renderView = (onLoginSuccess = vi.fn()) =>
  render(
    <ToastProvider>
      <LoginView onLoginSuccess={onLoginSuccess} />
    </ToastProvider>,
  );

describe("LoginView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPasswordState).mockResolvedValue({
      is_default: true,
      is_env_set: false,
    });
  });

  it("logs in with a password", async () => {
    const onSuccess = vi.fn();
    vi.mocked(api.login).mockResolvedValueOnce(undefined as never);
    renderView(onSuccess);

    const input = document.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /登录|进入/i }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("secret"));
    expect(onSuccess).toHaveBeenCalled();
  });

  it("does not call login with an empty password", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /登录|进入/i }));
    expect(api.login).not.toHaveBeenCalled();
  });
});

describe("LoginView password hints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPasswordState).mockResolvedValue({
      is_default: true,
      is_env_set: false,
    });
  });

  const renderView = () =>
    render(
      <ToastProvider>
        <LoginView onLoginSuccess={vi.fn()} />
      </ToastProvider>,
    );

  it("shows the default-password hint while the password is still admin", async () => {
    renderView();
    expect(await screen.findByText(/当前仍在使用默认密码/)).toBeDefined();
  });

  it("hides the hint once the password has been changed", async () => {
    vi.mocked(api.getPasswordState).mockResolvedValueOnce({
      is_default: false,
      is_env_set: false,
    });
    renderView();

    await waitFor(() => expect(api.getPasswordState).toHaveBeenCalled());
    expect(screen.queryByText(/当前仍在使用默认密码/)).toBeNull();
  });

  it("opens a dialog explaining the host-side reset command", async () => {
    renderView();
    fireEvent.click(screen.getByText("忘记密码？"));

    expect(await screen.findByText("重置管理密码")).toBeDefined();
    expect(screen.getByText("subout reset-password")).toBeDefined();
    expect(screen.getByText(/不要删除数据库文件/)).toBeDefined();
  });

  it("explains that ADMIN_PASSWORD must be changed when it is set", async () => {
    vi.mocked(api.getPasswordState).mockResolvedValueOnce({
      is_default: false,
      is_env_set: true,
    });
    renderView();

    await waitFor(() => expect(api.getPasswordState).toHaveBeenCalled());
    fireEvent.click(screen.getByText("忘记密码？"));

    expect(await screen.findByText(/命令行重置无效/)).toBeDefined();
    expect(screen.queryByText("subout reset-password")).toBeNull();
  });
  it("flips the hint across mounts as the password is changed and reset", async () => {
    vi.mocked(api.getPasswordState)
      .mockResolvedValueOnce({ is_default: true, is_env_set: false })
      .mockResolvedValueOnce({ is_default: false, is_env_set: false })
      .mockResolvedValueOnce({ is_default: true, is_env_set: false });

    const first = renderView();
    expect(await screen.findByText(/当前仍在使用默认密码/)).toBeDefined();
    first.unmount();

    const second = renderView();
    await waitFor(() =>
      expect(screen.queryByText(/当前仍在使用默认密码/)).toBeNull(),
    );
    second.unmount();

    renderView();
    expect(await screen.findByText(/当前仍在使用默认密码/)).toBeDefined();
  });

});
