// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import App from "./App.vue";

vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})));

const mockFetch = vi.fn().mockImplementation((url) => {
  const urlStr = String(url);
  if (urlStr.includes("/api/auth/status")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "ok" }) });
  }
  if (urlStr.includes("/api/system/mode")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ app_mode: "expert", is_initialized: true }),
    });
  }
  if (urlStr.includes("/api/kernel/info")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ is_installed: true, version: "1.13.19" }),
    });
  }
  if (urlStr.includes("/api/service/status")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ running: false }),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
});

import { token } from "./store.js";

describe("App.vue 路由与刷新容错测试", () => {
  beforeEach(() => {
    token.value = "test-token";
    localStorage.setItem("admin_token", "test-token");
    localStorage.setItem("subout_app_mode", "expert");
    vi.stubGlobal("fetch", mockFetch);
  });

  const stubs = {
    DashboardView: { template: "<div data-testid='dashboard-view'>Dashboard</div>" },
    SubscriptionsView: { template: "<div>Subscriptions</div>" },
    NodesView: { template: "<div>Nodes</div>" },
    SimpleConfigView: { template: "<div>SimpleConfig</div>" },
    ServiceLogsView: { template: "<div>ServiceLogs</div>" },
    GroupsView: { template: "<div>Groups</div>" },
    ConfigEditorView: { template: "<div data-testid='config-editor-view'>ConfigEditor</div>" },
    SiteTestView: { template: "<div>SiteTest</div>" },
    SettingsView: { template: "<div>Settings</div>" },
    ModeSelectModal: { template: "<div>ModeSelect</div>" },
  };

  it("标准配置编辑锚点 #configs/edit/1/log 刷新后保持在配置编辑视图", async () => {
    window.location.hash = "#configs/edit/1/log";
    const wrapper = mount(App, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find("[data-testid='config-editor-view']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='dashboard-view']").exists()).toBe(false);
  });

  it("带前导斜杠的路由 #/configs/edit/1/log 刷新后正常解析为 configs 并不回跳控制面板", async () => {
    window.location.hash = "#/configs/edit/1/log";
    const wrapper = mount(App, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find("[data-testid='config-editor-view']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='dashboard-view']").exists()).toBe(false);
    expect(window.location.hash).toBe("#configs/edit/1/log");
  });

  it("带前导斜杠的列表路由 #/configs 刷新后正常解析为 configs", async () => {
    window.location.hash = "#/configs";
    const wrapper = mount(App, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find("[data-testid='config-editor-view']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='dashboard-view']").exists()).toBe(false);
    expect(window.location.hash).toBe("#configs");
  });

  it("未知路由 #unknown 自动回退至 dashboard 控制中心", async () => {
    window.location.hash = "#unknown";
    const wrapper = mount(App, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find("[data-testid='dashboard-view']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='config-editor-view']").exists()).toBe(false);
    expect(window.location.hash).toBe("#dashboard");
  });
});
