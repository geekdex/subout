import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ProfileEditor, JSON_PREVIEW_STORAGE_KEY } from "./ProfileEditor";
import { ToastProvider } from "../ui/Toast";
import { api } from "../../api/client";
import { ConfigProfile } from "../../types/api";

vi.mock("../../api/client", () => ({
  api: {
    getEditorPreferences: vi.fn().mockResolvedValue({
      show_json_preview: true,
    }),
    saveEditorPreferences: vi.fn().mockResolvedValue({
      show_json_preview: true,
    }),
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
    window.localStorage.clear();
  });

  it("renders visual editor and read-only selectable JSON preview without editable textarea, and plays smooth enter/exit transitions", async () => {
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

    // Verify smooth entry animation classes are applied on open
    expect(document.querySelector(".animate-drawer-in")).not.toBeNull();
    expect(document.querySelector(".animate-backdrop-in")).not.toBeNull();

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

    // Clicking 关闭 triggers smooth exit animation first, then calls onClose
    fireEvent.click(screen.getByText("关闭"));
    expect(document.querySelector(".animate-drawer-out")).not.toBeNull();
    expect(document.querySelector(".animate-backdrop-out")).not.toBeNull();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
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

    // Switch to Route tab to verify Linux desktop process matching fields
    fireEvent.click(screen.getByText("路由与分流 (route)"));
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

    // Switch to Route tab on Android profile to verify package_name and package_name_regex
    fireEvent.click(screen.getByText("路由与分流 (route)"));
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

  it("keeps empty skeleton profiles empty until items are added, supports one-switch import and visual display of nodes & node groups in outbounds, supports rule reordering, and renders log controls directly", () => {
    const emptyProfile: ConfigProfile = {
      id: 3,
      name: "新建空配置",
      platform: "linux",
      description: "",
      token: "tok-empty-12345678",
      version_code: 2026110602,
      is_running_config: false,
      content: JSON.stringify({
        $schema: "https://sing-box.sagernet.org/schema.json",
        log: {},
        dns: {},
        ntp: {},
        certificate: {},
        certificate_providers: [],
        http_clients: [],
        endpoints: [],
        inbounds: [],
        outbounds: [],
        route: {},
        services: [],
        experimental: {},
      }),
    };

    const sampleNodes = [
      {
        id: 101,
        subscription_id: 1,
        tag: "HK-VLESS-01",
        node_type: "vless",
        server: "hk.example.com",
        port: 443,
        enabled: true,
        raw_json: JSON.stringify({
          type: "vless",
          tag: "HK-VLESS-01",
          server: "hk.example.com",
          server_port: 443,
          uuid: "00000000-0000-0000-0000-000000000000",
          tls: { enabled: true, server_name: "hk.example.com" },
        }),
      },
    ];

    const sampleGroups = [
      {
        id: 201,
        tag: "proxy",
        group_type: "selector",
        match_type: "static",
        static_nodes: JSON.stringify(["HK-VLESS-01", "direct"]),
      },
    ];

    render(
      <ToastProvider>
        <ProfileEditor
          profile={emptyProfile}
          nodes={sampleNodes}
          nodeGroups={sampleGroups}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );

    const previewEl = screen.getByTestId("json-preview-content");
    const initialJson = JSON.parse(previewEl.textContent || "{}");
    expect(initialJson.log).toEqual({});
    expect(initialJson.dns).toEqual({});
    expect(initialJson.inbounds).toEqual([]);
    expect(initialJson.outbounds).toEqual([]);
    expect(initialJson.route).toEqual({});

    // Collapsible top toolbar on Inbounds (Step 1) can be collapsed and expanded
    const collapseBtn = screen.getByText("收起工具栏");
    fireEvent.click(collapseBtn);
    expect(screen.getByText("展开工具栏")).toBeDefined();
    fireEvent.click(screen.getByText("展开工具栏"));
    expect(screen.getByText("收起工具栏")).toBeDefined();

    // Switch to Step 3: Outbounds tab, toggle the master switch to import nodes and node groups, and verify they are displayed
    fireEvent.click(screen.getByText("出站与策略组 (outbounds)"));
    const masterSwitchBox = screen.getByTestId(
      "master-import-outbounds-switch-box",
    );
    const switchBtn = masterSwitchBox.querySelector("button");
    expect(switchBtn).not.toBeNull();
    fireEvent.click(switchBtn!);

    let updatedJson = JSON.parse(previewEl.textContent || "{}");
    expect(updatedJson.outbounds).toHaveLength(3);
    expect(updatedJson.outbounds[0].tag).toBe("proxy");
    expect(updatedJson.outbounds[1].tag).toBe("direct");
    expect(updatedJson.outbounds[2].tag).toBe("HK-VLESS-01");

    // Verify imported node is visibly displayed in the UI list
    expect(
      screen.getByText("已导入代理节点明细列表 (Nodes in outbounds)"),
    ).toBeDefined();
    expect(screen.getByText("hk.example.com:443")).toBeDefined();

    // Switch to Step 4: Route tab, add two route rules from the top toolbar and reorder them in the bottom list
    fireEvent.click(screen.getByText("路由与分流 (route)"));
    fireEvent.click(screen.getByText("+ 协议嗅探 (sniff)"));
    fireEvent.click(screen.getByText("+ 局域网私有 IP 直连"));

    updatedJson = JSON.parse(previewEl.textContent || "{}");
    expect(updatedJson.route.rules).toHaveLength(2);
    expect(updatedJson.route.rules[0].action).toBe("sniff");
    expect(updatedJson.route.rules[1].ip_is_private).toBe(true);

    // Move rule #2 to top using 置顶规则 (移至第 1 位)
    const moveTopButtons = screen.getAllByTitle("置顶规则 (移至第 1 位)");
    fireEvent.click(moveTopButtons[1]);

    updatedJson = JSON.parse(previewEl.textContent || "{}");
    expect(updatedJson.route.rules[0].ip_is_private).toBe(true);
    expect(updatedJson.route.rules[1].action).toBe("sniff");

    // Switch to Step 5: Basic & Log tab and verify direct log level select updates log directly
    fireEvent.click(screen.getByText("基础与日志 (log / experimental)"));
    fireEvent.click(screen.getAllByText("未设置 (默认)")[0]);
    fireEvent.click(screen.getByText("warn (警告)"));

    updatedJson = JSON.parse(previewEl.textContent || "{}");
    expect(updatedJson.log.level).toBe("warn");
  });

  it("persists JSON preview open/hide toggle state permanently and globally across all profiles", () => {
    const { unmount } = render(
      <ToastProvider>
        <ProfileEditor
          profile={baseLinuxProfile}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ToastProvider>,
    );

    // Initially open by default
    expect(screen.getByTestId("json-preview-content")).toBeDefined();
    expect(screen.getByText("隐藏 JSON 预览")).toBeDefined();

    // Hide JSON preview
    fireEvent.click(screen.getByText("隐藏 JSON 预览"));
    expect(screen.queryByTestId("json-preview-content")).toBeNull();
    expect(screen.getByText("打开 JSON 预览")).toBeDefined();
    expect(window.localStorage.getItem(JSON_PREVIEW_STORAGE_KEY)).toBe("false");
    expect(api.saveEditorPreferences).toHaveBeenCalledWith({
      show_json_preview: false,
    });

    // Unmount and open a different profile (Android profile)
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

    // JSON preview remains hidden by default on the newly opened profile
    expect(screen.queryByTestId("json-preview-content")).toBeNull();
    expect(screen.getByText("打开 JSON 预览")).toBeDefined();

    // Open JSON preview again -> persists "true" globally
    fireEvent.click(screen.getByText("打开 JSON 预览"));
    expect(screen.getByTestId("json-preview-content")).toBeDefined();
    expect(screen.getByText("隐藏 JSON 预览")).toBeDefined();
    expect(window.localStorage.getItem(JSON_PREVIEW_STORAGE_KEY)).toBe("true");
    expect(api.saveEditorPreferences).toHaveBeenCalledWith({
      show_json_preview: true,
    });
  });
});
