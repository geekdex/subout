// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ModeSelectModal from "./ModeSelectModal.vue";
import KernelDownloadCard from "./KernelDownloadCard.vue";
import SimpleConfigView from "./SimpleConfigView.vue";
import SettingsView from "./SettingsView.vue";
import { kernelInfo, serviceStatus, appMode } from "../store.js";

describe("ModeSelectModal", () => {
  it("renders both simple mode and expert mode options", () => {
    const wrapper = mount(ModeSelectModal, {
      props: { show: true },
    });
    expect(wrapper.text()).toContain("欢迎使用 Subout Panel");
    expect(wrapper.text()).toContain("小白简单模式");
    expect(wrapper.text()).toContain("专业模式 (专家模式)");
  });
});

describe("KernelDownloadCard", () => {
  beforeEach(() => {
    kernelInfo.value = {
      os: "linux",
      arch: "amd64",
      supported: true,
      download_url:
        "https://github.com/SagerNet/sing-box/releases/download/v1.13.19/sing-box-1.13.19-linux-amd64.tar.gz",
      filename: "sing-box-1.13.19-linux-amd64.tar.gz",
      is_installed: false,
      binary_path: "/root/.config/subout/bin/sing-box",
      version: null,
      download_status: { status: "idle", progress: 0 },
    };
    serviceStatus.value = {
      running: false,
      ready: false,
      pid: null,
      last_error: null,
      conflicting_processes: [],
    };
  });

  it("shows download button when kernel is not installed", () => {
    const wrapper = mount(KernelDownloadCard);
    expect(wrapper.text()).toContain("sing-box 核心内核");
    expect(wrapper.text()).toContain("一键下载并集成内核");
    expect(wrapper.text()).toContain("未安装内核");
  });

  it("shows ready badge and NO re-download prompt when kernel is installed and healthy", async () => {
    kernelInfo.value.is_installed = true;
    kernelInfo.value.version = "sing-box version 1.13.19";
    const wrapper = mount(KernelDownloadCard);
    expect(wrapper.text()).toContain("已安装就绪");
    expect(wrapper.text()).toContain("sing-box version 1.13.19");
    expect(wrapper.text()).not.toContain("重新下载内核");
  });

  it("shows re-download prompt and error alert when kernel binary is corrupted or invalid", async () => {
    kernelInfo.value.is_installed = true;
    kernelInfo.value.version = null; // Corrupted / cannot get version
    const wrapper = mount(KernelDownloadCard);
    expect(wrapper.text()).toContain("内核异常");
    expect(wrapper.text()).toContain("重新下载内核");
    expect(wrapper.text()).toContain("未能检测到有效版本信息");
  });

  it("shows re-download retry and error when kernel download fails", async () => {
    kernelInfo.value.download_status = {
      status: "error",
      error: "网络连接超时",
    };
    const wrapper = mount(KernelDownloadCard);
    expect(wrapper.text()).toContain("下载失败");
    expect(wrapper.text()).toContain("重新下载内核");
    expect(wrapper.text()).toContain("网络连接超时");
  });

  it("shows cancel download button when downloading", async () => {
    kernelInfo.value.download_status = {
      status: "downloading",
      progress: 45.5,
      downloaded_bytes: 5000000,
      total_bytes: 10000000,
      speed_bytes_per_sec: 1000000,
    };
    const wrapper = mount(KernelDownloadCard);
    expect(wrapper.text()).toContain("正在从官方源下载内核文件");
    expect(wrapper.text()).toContain("取消下载");
  });
});

describe("SimpleConfigView", () => {
  it("renders compact simplified DNS and Route cards with AUTO-Test, TUN, and LocalDNS + FakeIP first", () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/nodes")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, tag: "HK-01-香港", node_type: "vless", enabled: true },
              {
                id: 2,
                tag: "JP-01-东京",
                node_type: "shadowsocks",
                enabled: true,
              },
            ]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            config: {
              dns: {
                mode: "preset_fakeip",
                domestic_dns: "223.5.5.5",
                foreign_dns: "fakeip",
              },
              inbound: {
                inbound_type: "tun",
                mixed_port: 2080,
                allow_lan: false,
                tun_stack: "system",
                tun_auto_route: true,
              },
              route: {
                mode: "smart",
                block_ads: true,
                bypass_lan: true,
                default_outbound: "AUTO-Test",
              },
            },
            generated: {},
          }),
      });
    });

    const wrapper = mount(SimpleConfigView);
    expect(wrapper.text()).toContain("极简配置管理");
    expect(wrapper.text()).toContain("智能分流");
    expect(wrapper.text()).toContain("LocalDNS + FakeIP");
    expect(wrapper.text()).toContain("阿里 + Cloudflare DoH");
    expect(wrapper.text()).toContain("腾讯 + Google DoH");
    expect(wrapper.text()).toContain("自定义 DNS");
    expect(wrapper.text()).toContain("TUN 虚拟网卡 (整机透明代理)");
    expect(wrapper.text()).toContain("混合端口 (Mixed HTTP + SOCKS5)");
    expect(wrapper.text()).toContain("查看配置预览");
    expect(wrapper.text()).toContain("默认出口策略与节点");
    expect(wrapper.text()).toContain("自动测速优选");
    expect(wrapper.text()).toContain("手动指定节点");

    // Verify DNS cards order: LocalDNS + FakeIP first and recommended
    const dnsCards = wrapper.findAll(".option-grid")[1].findAll(".option-card");
    expect(dnsCards[0].text()).toContain("LocalDNS + FakeIP");
    expect(dnsCards[0].text()).toContain("推荐");
    expect(dnsCards[1].text()).toContain("阿里 + Cloudflare DoH");
    expect(dnsCards[2].text()).toContain("腾讯 + Google DoH");
    expect(dnsCards[3].text()).toContain("自定义 DNS");

    // Verify inbound cards order: TUN first, Mixed second
    const inboundCards = wrapper.findAll(".option-grid")[2].findAll(".option-card");
    expect(inboundCards[0].text()).toContain("TUN 虚拟网卡");
    expect(inboundCards[1].text()).toContain("混合端口");

    // Verify outbound buttons order: AUTO-Test first, Direct second, Manual third
    const outboundBtns = wrapper.find(".outbound-box").findAll("button.btn");
    expect(outboundBtns[0].text()).toContain("自动测速优选");
    expect(outboundBtns[1].text()).toContain("默认直连");
    expect(outboundBtns[2].text()).toContain("手动指定节点");
  });

  it("prompts for sudo password when applying default TUN mode on Linux as non-root", async () => {
    const { systemModeInfo, dialog, kernelInfo, sessionSudoPassword } =
      await import("../store.js");
    sessionSudoPassword.value = "";
    systemModeInfo.value.is_linux = true;
    systemModeInfo.value.os = "linux";
    systemModeInfo.value.is_root = false;
    kernelInfo.value.is_installed = true;

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/nodes")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes("/api/simple-config")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              config: {
                dns: {
                  mode: "preset_domestic_foreign",
                  domestic_dns: "223.5.5.5",
                  foreign_dns: "https://1.1.1.1/dns-query",
                },
                inbound: {
                  inbound_type: "tun",
                  mixed_port: 2080,
                  allow_lan: false,
                  tun_stack: "system",
                  tun_auto_route: true,
                },
                route: {
                  mode: "smart",
                  block_ads: true,
                  bypass_lan: true,
                  default_outbound: "AUTO-Test",
                },
              },
              generated: {},
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const wrapper = mount(SimpleConfigView);
    await new Promise((r) => setTimeout(r, 20));

    // Click "保存并应用" button directly with default TUN mode
    const applyBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("保存并应用"));
    expect(applyBtn).toBeDefined();
    await applyBtn.trigger("click");
    await new Promise((r) => setTimeout(r, 20));

    // Verify prompt dialog was activated for sudo password
    expect(dialog.show).toBe(true);
    expect(dialog.type).toBe("prompt");
    expect(dialog.inputType).toBe("password");
    expect(dialog.message).toContain(
      "开启 TUN 虚拟网卡需要系统管理员 (root) 权限",
    );
  });
});

describe("SettingsView - Mode adaptive", () => {
  it("hides Auto-Update settings panel in simple mode", async () => {
    appMode.value = "simple";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          is_password_env_set: false,
          has_sudo_pass: false,
        }),
    });
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).not.toContain("自动化配置更新");
  });

  it("shows Auto-Update settings panel in expert mode", async () => {
    appMode.value = "expert";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          is_password_env_set: false,
          has_sudo_pass: false,
          config: {},
          last_status: "idle",
        }),
    });
    const wrapper = mount(SettingsView);
    expect(wrapper.text()).toContain("自动化配置更新");
  });
});

describe("DashboardView - Mode Switch Confirmation", () => {
  it("requires manual confirmation and shows service interruption warning when service is running", async () => {
    const { default: DashboardView } = await import("./DashboardView.vue");
    const { dialog, serviceStatus, appMode } = await import("../store.js");

    appMode.value = "simple";
    serviceStatus.value.running = true;
    dialog.show = false;

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/dashboard/stats")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ subs: 1, nodes: 5, groups: 2 }),
        });
      }
      if (url.includes("/api/service/status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ running: true }),
        });
      }
      if (url.includes("/api/service/logs")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes("/api/system/mode")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ status: "success", service_restarted: true }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const wrapper = mount(DashboardView);
    await new Promise((r) => setTimeout(r, 20));

    // Click mode switch pill
    const modePill = wrapper.find(".mode-switch-pill");
    expect(modePill.exists()).toBe(true);
    await modePill.trigger("click");
    await new Promise((r) => setTimeout(r, 20));

    // Verify confirmation dialog was prompted with service interruption warning
    expect(dialog.show).toBe(true);
    expect(dialog.title).toContain("切换为 专业模式");
    expect(dialog.message).toContain("短暂停止服务（约 1~2 秒）");
    expect(dialog.message).toContain("相互不干扰");
    expect(dialog.confirmText).toBe("确认中断并切换");
    expect(dialog.isDanger).toBe(true);
  });

  it("shows gentle confirmation when service is stopped", async () => {
    const { default: DashboardView } = await import("./DashboardView.vue");
    const { dialog, serviceStatus, appMode } = await import("../store.js");

    appMode.value = "expert";
    serviceStatus.value.running = false;
    dialog.show = false;

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/dashboard/stats")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ subs: 1, nodes: 5, groups: 2 }),
        });
      }
      if (url.includes("/api/service/status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ running: false }),
        });
      }
      if (url.includes("/api/service/logs")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const wrapper = mount(DashboardView);
    await new Promise((r) => setTimeout(r, 20));

    const modePill = wrapper.find(".mode-switch-pill");
    await modePill.trigger("click");
    await new Promise((r) => setTimeout(r, 20));

    // Verify confirmation dialog without danger badge
    expect(dialog.show).toBe(true);
    expect(dialog.title).toContain("切换为 小白简单模式");
    expect(dialog.message).toContain("相互不干扰");
    expect(dialog.confirmText).toBe("确认切换");
    expect(dialog.isDanger).toBe(false);
  });

  it("disables start proxy service button when kernel is not installed", async () => {
    const { default: DashboardView } = await import("./DashboardView.vue");
    const { kernelInfo, serviceStatus } = await import("../store.js");

    kernelInfo.value.is_installed = false;
    kernelInfo.value.version = null;
    serviceStatus.value.running = false;
    serviceStatus.value.conflicting_processes = [];

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/dashboard/stats")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ subs: 1, nodes: 5, groups: 2 }),
        });
      }
      if (url.includes("/api/kernel/info")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              is_installed: false,
              version: null,
              download_status: { status: "idle" },
            }),
        });
      }
      if (url.includes("/api/service/status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ running: false, conflicting_processes: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const wrapper = mount(DashboardView);
    await new Promise((r) => setTimeout(r, 20));

    const startBtn = wrapper.find(".service-power-actions .btn-primary");
    expect(startBtn.exists()).toBe(true);
    expect(startBtn.text()).toContain("启动代理服务");
    expect(startBtn.attributes("disabled")).toBeDefined();
    expect(startBtn.element.disabled).toBe(true);
  });

  it("enables start proxy service button when kernel is installed and ready", async () => {
    const { default: DashboardView } = await import("./DashboardView.vue");
    const { kernelInfo, serviceStatus } = await import("../store.js");

    kernelInfo.value.is_installed = true;
    kernelInfo.value.version = "sing-box version 1.13.19";
    kernelInfo.value.download_status = { status: "idle" };
    serviceStatus.value.running = false;
    serviceStatus.value.conflicting_processes = [];

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes("/api/dashboard/stats")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ subs: 1, nodes: 5, groups: 2 }),
        });
      }
      if (url.includes("/api/kernel/info")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              is_installed: true,
              version: "sing-box version 1.13.19",
              download_status: { status: "idle" },
            }),
        });
      }
      if (url.includes("/api/service/status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ running: false, conflicting_processes: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const wrapper = mount(DashboardView);
    await new Promise((r) => setTimeout(r, 20));

    const startBtn = wrapper.find(".service-power-actions .btn-primary");
    expect(startBtn.exists()).toBe(true);
    expect(startBtn.text()).toContain("启动代理服务");
    expect(startBtn.attributes("disabled")).toBeUndefined();
    expect(startBtn.element.disabled).toBe(false);
  });
});
