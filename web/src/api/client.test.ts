import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

describe("api.setWebPassword", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("posts old/new password to the backend-registered change-password endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", message: "管理员密码已更新" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.setWebPassword("old-pass", "new-pass");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/change-password");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      old_password: "old-pass",
      new_password: "new-pass",
    });
    expect(result.success).toBe(true);
  });

  it("surfaces a descriptive backend error instead of a generic 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("当前密码不正确", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.setWebPassword("wrong", "new-pass")).rejects.toMatchObject(
      { status: 400, message: "当前密码不正确" },
    );
  });
});

describe("api.setRunMode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("posts the selected run mode to the system endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "success", run_mode: "hosting" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await api.setRunMode("hosting");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/system/run-mode");
    expect(JSON.parse(init.body as string)).toEqual({ run_mode: "hosting" });
    expect(res.run_mode).toBe("hosting");
  });
});

describe("api.getPasswordState", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("reads the public password state used by the login page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ is_default: false, is_env_set: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const state = await api.getPasswordState();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/api/auth/password-state");
    expect(state).toEqual({ is_default: false, is_env_set: true });
  });
});
