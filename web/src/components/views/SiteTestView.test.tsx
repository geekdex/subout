import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { SiteTestView } from "./SiteTestView";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";
import { SiteProbeResponse } from "../../types/api";

vi.mock("../../api/client", () => ({
  api: {
    probeSite: vi.fn(),
  },
}));

const renderWithToast = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>);

const successResult = (url: string): SiteProbeResponse => ({
  url,
  latency_ms: 88,
  status_code: 200,
  success: true,
  error: null,
  dns_rule: "规则集 (geosite-geolocation-!cn)",
  dns_server: "dns_fakeip (FakeIP)",
  route_rule: "规则集 (geosite-geolocation-!cn)",
  outbound: "proxy ➔ AUTO (选择组)",
});

describe("SiteTestView Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.probeSite).mockResolvedValue(successResult("https://example.com"));
  });

  it("renders preset sites and category tabs", () => {
    renderWithToast(<SiteTestView />);

    expect(screen.getByText("网络检测")).toBeDefined();
    expect(screen.getByText("Google")).toBeDefined();
    expect(screen.getByText("全部网站")).toBeDefined();
    expect(screen.getByText("开发与 AI")).toBeDefined();
    expect(screen.getByLabelText("自定义检测网址")).toBeDefined();
  });

  it("tests a single site and shows status, latency and trace info", async () => {
    vi.mocked(api.probeSite).mockResolvedValue(
      successResult("https://www.google.com"),
    );
    renderWithToast(<SiteTestView />);

    fireEvent.click(screen.getByLabelText("测试 Google"));

    await waitFor(() =>
      expect(api.probeSite).toHaveBeenCalledWith("https://www.google.com", 4500),
    );
    const card = screen.getByTestId("site-card-google");
    await waitFor(() => expect(within(card).getByText("88 ms")).toBeDefined());
    expect(within(card).getByText("dns_fakeip (FakeIP)")).toBeDefined();
    expect(within(card).getByText("proxy ➔ AUTO (选择组)")).toBeDefined();
  });

  it("shows the failure state when a probe rejects", async () => {
    vi.mocked(api.probeSite).mockRejectedValueOnce(new Error("网络不可达"));
    renderWithToast(<SiteTestView />);

    fireEvent.click(screen.getByLabelText("测试 GitHub"));

    const card = screen.getByTestId("site-card-github");
    await waitFor(() => expect(within(card).getByText("网络不可达")).toBeDefined());
    expect(within(card).getByText("不可达")).toBeDefined();
  });

  it("tests a custom URL and renders the result banner", async () => {
    vi.mocked(api.probeSite).mockResolvedValue(successResult("https://example.com"));
    renderWithToast(<SiteTestView />);

    fireEvent.change(screen.getByLabelText("自定义检测网址"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "检测网址" }));

    await waitFor(() =>
      expect(api.probeSite).toHaveBeenCalledWith("https://example.com", 4500),
    );
    await waitFor(() => expect(screen.getByText("访问成功")).toBeDefined());
    expect(screen.getByText("dns_fakeip (FakeIP)")).toBeDefined();
  });

  it("limits the one-click test to three concurrent probes", async () => {
    const pending: Array<() => void> = [];
    vi.mocked(api.probeSite).mockImplementation(
      (url: string) =>
        new Promise<SiteProbeResponse>((resolve) => {
          pending.push(() => resolve(successResult(url)));
        }),
    );

    renderWithToast(<SiteTestView />);
    const testAllButton = screen.getByRole("button", {
      name: /一键检测全部网站/,
    });
    fireEvent.click(testAllButton);

    // Only three probes may be in flight at once: the next batch is not
    // started until the previous three have been resolved.
    await waitFor(() => expect(pending.length).toBe(3));

    await act(async () => {
      pending.slice(0, 3).forEach((resolve) => resolve());
    });
    await waitFor(() => expect(pending.length).toBe(6));

    await act(async () => {
      pending.slice(3, 6).forEach((resolve) => resolve());
    });
    await waitFor(() => expect(pending.length).toBe(9));

    await act(async () => {
      pending.slice(6, 9).forEach((resolve) => resolve());
    });
    await waitFor(() => expect(pending.length).toBe(10));

    await act(async () => {
      pending.slice(9, 10).forEach((resolve) => resolve());
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /一键检测全部网站/ }),
      ).toBeDefined(),
    );

    expect(api.probeSite).toHaveBeenCalledTimes(10);
    expect(
      within(screen.getByTestId("site-card-google")).getByText("可达"),
    ).toBeDefined();
  });

  it("does not update state after unmount", async () => {
    let resolveProbe!: (result: SiteProbeResponse) => void;
    vi.mocked(api.probeSite).mockImplementation(
      () =>
        new Promise<SiteProbeResponse>((resolve) => {
          resolveProbe = resolve;
        }),
    );

    const { unmount } = renderWithToast(<SiteTestView />);
    fireEvent.click(screen.getByLabelText("测试 Google"));
    unmount();

    await act(async () => {
      resolveProbe(successResult("https://www.google.com"));
    });
    expect(api.probeSite).toHaveBeenCalledTimes(1);
  });
});
