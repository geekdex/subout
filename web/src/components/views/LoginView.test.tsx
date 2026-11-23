import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { LoginView } from "./LoginView";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";

vi.mock("../../api/client", () => ({
  api: { login: vi.fn() },
}));

const renderView = (onLoginSuccess = vi.fn()) =>
  render(
    <ToastProvider>
      <LoginView onLoginSuccess={onLoginSuccess} />
    </ToastProvider>,
  );

describe("LoginView", () => {
  beforeEach(() => vi.clearAllMocks());

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
