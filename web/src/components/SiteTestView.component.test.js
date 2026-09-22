// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SiteTestView from "./SiteTestView.vue";

describe("SiteTestView.vue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders preset sites and custom URL form correctly", () => {
    const wrapper = mount(SiteTestView, {
      props: {
        token: "test-token",
      },
    });

    expect(wrapper.find("h1").text()).toBe("网站测试");
    expect(wrapper.find(".custom-url-form").exists()).toBe(true);
    const siteCards = wrapper.findAll(".site-card");
    expect(siteCards.length).toBeGreaterThan(0);
  });

  it("displays DNS rule and Outbound when single preset site test succeeds", async () => {
    const mockResponse = {
      url: "https://www.google.com",
      status_code: 200,
      latency: 120,
      success: true,
      error: null,
      dns_rule: "规则集 (geosite-google)",
      dns_server: "remote-dns (FakeIP)",
      route_rule: "域名后缀 (google.com)",
      outbound: "Ghelper (选择组)",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const wrapper = mount(SiteTestView, {
      props: {
        token: "test-token",
      },
    });

    // Find the first site card (Google) and click test
    const firstCard = wrapper.findAll(".site-card")[0];
    const testBtn = firstCard.find("button");
    await testBtn.trigger("click");
    await flushPromises();

    // Verify trace box appears in the site card
    const traceBox = firstCard.find(".site-trace-box");
    expect(traceBox.exists()).toBe(true);
    expect(traceBox.text()).toContain("DNS");
    expect(traceBox.text()).toContain("规则集 (geosite-google)");
    expect(traceBox.text()).toContain("remote-dns (FakeIP)");
    expect(traceBox.text()).toContain("出口");
    expect(traceBox.text()).toContain("域名后缀 (google.com)");
    expect(traceBox.text()).toContain("Ghelper (选择组)");
  });

  it("displays DNS rule and Outbound in custom URL test result banner", async () => {
    const mockResponse = {
      url: "https://chatgpt.com",
      status_code: 200,
      latency: 180,
      success: true,
      error: null,
      dns_rule: "域名后缀 (chatgpt.com)",
      dns_server: "remote-dns (FakeIP)",
      route_rule: "域名后缀 (chatgpt.com)",
      outbound: "us_self (vless 节点)",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const wrapper = mount(SiteTestView, {
      props: {
        token: "test-token",
      },
    });

    const input = wrapper.find(".custom-url-form input");
    await input.setValue("https://chatgpt.com");
    await wrapper.find(".custom-url-form").trigger("submit.prevent");
    await flushPromises();

    // Verify custom result banner and trace details
    const banner = wrapper.find(".custom-result-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("HTTP 200");
    expect(banner.text()).toContain("180 ms");

    const traceDetails = wrapper.find(".custom-trace-details");
    expect(traceDetails.exists()).toBe(true);
    expect(traceDetails.text()).toContain("DNS 规则");
    expect(traceDetails.text()).toContain("域名后缀 (chatgpt.com)");
    expect(traceDetails.text()).toContain("remote-dns (FakeIP)");
    expect(traceDetails.text()).toContain("请求出口");
    expect(traceDetails.text()).toContain("us_self (vless 节点)");
  });

  it("displays DNS rule and Outbound even when request fails or times out", async () => {
    const mockFailedResponse = {
      url: "https://blocked-site.com",
      status_code: null,
      latency: null,
      success: false,
      error: "网络无法在 10 秒内连通目标网站",
      dns_rule: "默认解析 (final)",
      dns_server: "local-dns (本地解析)",
      route_rule: "默认分流 (final)",
      outbound: "proxy ➔ AUTO-Test (选择组)",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockFailedResponse,
    });

    const wrapper = mount(SiteTestView, {
      props: {
        token: "test-token",
      },
    });

    const input = wrapper.find(".custom-url-form input");
    await input.setValue("https://blocked-site.com");
    await wrapper.find(".custom-url-form").trigger("submit.prevent");
    await flushPromises();

    const banner = wrapper.find(".custom-result-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.classes()).toContain("danger");
    expect(banner.text()).toContain("访问失败");

    const traceDetails = wrapper.find(".custom-trace-details");
    expect(traceDetails.exists()).toBe(true);
    expect(traceDetails.text()).toContain("默认解析 (final)");
    expect(traceDetails.text()).toContain("local-dns (本地解析)");
    expect(traceDetails.text()).toContain("默认分流 (final)");
    expect(traceDetails.text()).toContain("proxy ➔ AUTO-Test (选择组)");
  });
});
