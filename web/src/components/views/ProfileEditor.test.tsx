import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ProfileEditor } from "./ProfileEditor";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";
import { ConfigProfile } from "../../types/api";

vi.mock("../../api/client", () => ({
  api: {
    validateConfigSchema: vi.fn().mockResolvedValue({
      valid: true,
      errors: [],
    }),
    updateConfig: vi.fn().mockResolvedValue({
      status: "success",
    }),
    previewSyncConfigNodes: vi.fn().mockResolvedValue({
      status: "success",
      content: JSON.stringify({
        $schema: "https://sing-box.sagernet.org/schema.json",
        log: { level: "info", timestamp: true },
        dns: {},
        inbounds: [],
        outbounds: [
          { type: "selector", tag: "proxy", outbounds: ["hk-01", "direct"] },
          { type: "direct", tag: "direct" },
          {
            type: "vless",
            tag: "hk-01",
            server: "1.1.1.1",
            server_port: 443,
            uuid: "00000000-0000-0000-0000-000000000000",
          },
        ],
        route: { rules: [] },
      }),
    }),
  },
}));

const baseLinuxProfile: ConfigProfile = {
  id: 1,
  name: "Linux 主力配置",
  platform: "linux",
  description: "桌面分流配置",
  token: "tok-linux-12345678",
  version_code: 2026110601,
  is_running_config: true,
  content: JSON.stringify({
    $schema: "https://sing-box.sagernet.org/schema.json",
    log: { level: "info", timestamp: true },
    dns: {
      servers: [
        { tag: "remote-dns", type: "https", server: "1.1.1.1", detour: "proxy" },
      ],
      rules: [],
      final: "remote-dns",
    },
    inbounds: [
      {
        type: "tun",
        tag: "tun-in",
        address: ["172.19.0.1/30"],
        auto_route: true,
      },
    ],
    outbounds: [
      { type: "selector", tag: "proxy", outbounds: ["direct"] },
      { type: "direct", tag: "direct" },
    ],
    route: {
      rules: [{ ip_is_private: true, outbound: "direct" }],
      final: "proxy",
    },
  }),
};

const baseAndroidProfile: ConfigProfile = {
  ...baseLinuxProfile,
  id: 2,
  name: "Android 移动配置",
  platform: "android",
  is_running_config: false,
};

describe("ProfileEditor Visual Configuration Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders visual editor and read-only selectable JSON preview without editable textarea", () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <ToastProvider>
        <ProfileEditor
          profile={baseLinuxProfile}
          onClose={onClose}
          onSaved={onSaved}
        />
      </ToastProvider>,
    );

    // Header & visual tabs exist
    expect(
      screen.getByText(/可视化配置编辑器: Linux 主力配置/),
    ).toBeDefined();
    expect(screen.getByText("路由与分流 (route)")).toBeDefined();
    expect(screen.getByText("DNS 与解析规则 (dns)")).toBeDefined();
    expect(screen.getByText("入站配置 (inbounds)")).toBeDefined();
    expect(screen.getByText("出站与策略组 (outbounds)")).toBeDefined();

    // Read-only JSON preview exists and has select-text class + CopyButton
    const previewEl = screen.getByTestId("json-preview-content");
    expect(previewEl).toBeDefined();
    expect(previewEl.className).toContain("select-text");
    expect(previewEl.textContent).toContain(
      "https://sing-box.sagernet.org/schema.json",
    );
    expect(screen.getByText("一键复制 JSON")).toBeDefined();
    expect(screen.getByText("只读预览")).toBeDefined();

    // No raw JSON textarea is rendered
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("shows desktop process matching fields on Linux and Android package matching fields on Android", () => {
    const { unmount } = render(
      <ToastProvider>
        <ProfileEditor
          profile={baseLinuxProfile}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );

    // Linux profile shows process_name, process_path, process_path_regex
    expect(screen.getByText("进程名称 (process_name)")).toBeDefined();
    expect(screen.getByText("进程完整路径 (process_path)")).toBeDefined();
    expect(screen.getByText("进程路径正则 (process_path_regex)")).toBeDefined();
    expect(screen.queryByText("Android 应用包名 (package_name)")).toBeNull();

    unmount();

    render(
      <ToastProvider>
        <ProfileEditor
          profile={baseAndroidProfile}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );

    // Android profile shows package_name and package_name_regex
    expect(screen.getByText("Android 应用包名 (package_name)")).toBeDefined();
    expect(
      screen.getByText("Android 包名正则 (package_name_regex)"),
    ).toBeDefined();
    expect(screen.queryByText("进程名称 (process_name)")).toBeNull();
  });

  it("supports 2-level nested logical DNS rules, updates JSON preview in real time, and only persists on explicit save", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <ToastProvider>
        <ProfileEditor
          profile={baseLinuxProfile}
          onClose={onClose}
          onSaved={onSaved}
        />
      </ToastProvider>,
    );

    // Switch to DNS tab
    fireEvent.click(screen.getByText("DNS 与解析规则 (dns)"));

    // Click the 2-level nested logical DNS rule button
    fireEvent.click(screen.getByText("新增双层嵌套逻辑规则"));

    // Live JSON preview immediately updates with the 2-level nested logical rule
    const previewEl = screen.getByTestId("json-preview-content");
    const previewJson = JSON.parse(previewEl.textContent || "{}");

    expect(previewJson.dns.rules).toHaveLength(1);
    const topLogicalRule = previewJson.dns.rules[0];
    expect(topLogicalRule.type).toBe("logical");
    expect(topLogicalRule.mode).toBe("and");
    expect(topLogicalRule.server).toBe("remote-dns");
    expect(topLogicalRule.rules[0]).toEqual({
      query_type: ["A", "AAAA", "CNAME"],
    });
    expect(topLogicalRule.rules[1].type).toBe("logical");
    expect(topLogicalRule.rules[1].mode).toBe("or");
    expect(topLogicalRule.rules[1].rules[0].rule_set).toContain(
      "geosite-google",
    );
    expect(topLogicalRule.rules[1].rules[1].domain_suffix).toContain(".ai");
    expect(topLogicalRule.rules[1].rules[2].domain).toEqual(["claude.ai"]);

    // Verify unsaved badge is shown and api.updateConfig has NOT been called yet
    expect(
      screen.getByText("有未保存的更改 (点击保存后生效)"),
    ).toBeDefined();
    expect(api.updateConfig).not.toHaveBeenCalled();

    // Now click Save
    fireEvent.click(screen.getByText("保存配置"));

    await waitFor(() => {
      expect(api.validateConfigSchema).toHaveBeenCalledTimes(1);
      expect(api.updateConfig).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });
});
