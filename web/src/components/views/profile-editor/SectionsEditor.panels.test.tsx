import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import {
  SingBoxVisualConfig,
  parseConfigToVisualState,
  serializeVisualStateToConfig,
  validateExplicitPlatformConstraints,
} from "./types";
import {
  RouteTabPanel,
  DnsTabPanel,
  InboundsTabPanel,
  OutboundsTabPanel,
  BasicDirectTabPanel,
} from "./SectionsEditor";
import { RouteTabPanel as DirectRouteTabPanel } from "./RouteTabPanel";
import { DnsTabPanel as DirectDnsTabPanel } from "./DnsTabPanel";
import { InboundsTabPanel as DirectInboundsTabPanel } from "./InboundsTabPanel";
import { OutboundsTabPanel as DirectOutboundsTabPanel } from "./OutboundsTabPanel";
import { BasicDirectTabPanel as DirectBasicDirectTabPanel } from "./BasicDirectTabPanel";

const emptyConfig = {} as SingBoxVisualConfig;
const onChange = () => vi.fn();

describe("SectionsEditor barrel", () => {
  it("re-exports the same components as the individual panel modules", () => {
    expect(RouteTabPanel).toBe(DirectRouteTabPanel);
    expect(DnsTabPanel).toBe(DirectDnsTabPanel);
    expect(InboundsTabPanel).toBe(DirectInboundsTabPanel);
    expect(OutboundsTabPanel).toBe(DirectOutboundsTabPanel);
    expect(BasicDirectTabPanel).toBe(DirectBasicDirectTabPanel);
  });
});

describe("split editor panels render independently", () => {
  const cases: Array<{
    name: string;
    element: () => React.ReactElement;
    title: RegExp;
  }> = [
    {
      name: "route",
      element: () => (
        <RouteTabPanel
          platform="linux"
          config={emptyConfig}
          onChange={onChange()}
          outboundTags={[]}
          dnsServerTags={[]}
          inboundTags={[]}
          httpClientTags={[]}
        />
      ),
      title: /路由分流与规则集工具箱/,
    },
    {
      name: "dns",
      element: () => (
        <DnsTabPanel
          platform="linux"
          config={emptyConfig}
          onChange={onChange()}
          outboundTags={[]}
          inboundTags={[]}
          ruleSetTags={[]}
        />
      ),
      title: /DNS 服务器与解析分流工具箱/,
    },
    {
      name: "inbounds",
      element: () => (
        <InboundsTabPanel
          platform="linux"
          config={emptyConfig}
          onChange={onChange()}
        />
      ),
      title: /入站监听快捷工具箱/,
    },
    {
      name: "outbounds",
      element: () => (
        <OutboundsTabPanel
          config={emptyConfig}
          onChange={onChange()}
          nodes={[]}
          nodeGroups={[]}
          onSyncFromNodePool={onChange()}
          syncing={false}
        />
      ),
      title: /出站策略组与按需点选工具箱/,
    },
    {
      name: "basic",
      element: () => (
        <BasicDirectTabPanel
          config={emptyConfig}
          onChange={onChange()}
          outboundTags={[]}
        />
      ),
      title: /日志配置 \(log\)/,
    },
  ];

  it.each(cases)("$name panel renders its own section", ({ element, title }) => {
    render(element());
    expect(screen.getByText(title)).toBeDefined();
  });
});

describe("split editor panels keep their onChange contracts", () => {
  it("DNS panel adds a local DNS server through onChange", () => {
    const onChangeMock = vi.fn();
    render(
      <DnsTabPanel
        platform="linux"
        config={emptyConfig}
        onChange={onChangeMock}
        outboundTags={[]}
        inboundTags={[]}
        ruleSetTags={[]}
      />,
    );

    fireEvent.click(screen.getByText("+ 本地系统 DNS (local)"));
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const next = onChangeMock.mock.calls[0][0] as SingBoxVisualConfig;
    expect(next.dns?.servers?.[0]).toMatchObject({
      tag: "local-dns",
      type: "local",
    });
  });

  it("inbounds panel appends a SOCKS5 inbound through onChange", () => {
    const onChangeMock = vi.fn();
    render(
      <InboundsTabPanel
        platform="linux"
        config={emptyConfig}
        onChange={onChangeMock}
      />,
    );

    fireEvent.click(screen.getByText("新增 SOCKS5 入站"));
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const next = onChangeMock.mock.calls[0][0] as SingBoxVisualConfig;
    expect(next.inbounds?.[0]).toMatchObject({
      type: "socks",
      tag: "socks-in",
    });
  });

  it("route panel clears rule sets through onChange", () => {
    const onChangeMock = vi.fn();
    const config = {
      route: { rule_set: [{ tag: "geosite-cn", type: "remote", url: "x" }] },
    } as unknown as SingBoxVisualConfig;
    render(
      <RouteTabPanel
        platform="linux"
        config={config}
        onChange={onChangeMock}
        outboundTags={["proxy"]}
        dnsServerTags={[]}
        inboundTags={[]}
        httpClientTags={[]}
      />,
    );

    fireEvent.click(screen.getByText("清空规则集"));
    expect(onChangeMock).toHaveBeenCalledTimes(1);
    const next = onChangeMock.mock.calls[0][0] as SingBoxVisualConfig;
    expect(next.route?.rule_set).toEqual([]);
  });

  const tunConfig = {
    inbounds: [
      {
        type: "tun",
        tag: "tun-in",
        address: ["172.19.0.1/30"],
        auto_route: true,
      },
    ],
  } as unknown as SingBoxVisualConfig;

  it("TUN expert panel edits route_exclude_address without adding hidden fields", () => {
    const onChangeMock = vi.fn();
    render(
      <InboundsTabPanel
        platform="linux"
        config={tunConfig}
        onChange={onChangeMock}
      />,
    );

    const input = screen.getByLabelText(
      "排除目标 IP / IP 段 (route_exclude_address)",
    );
    fireEvent.change(input, { target: { value: "10.0.0.0/8, 192.168.1.100" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const next = onChangeMock.mock.calls.at(-1)![0] as SingBoxVisualConfig;
    expect(next.inbounds![0]).toEqual({
      ...tunConfig.inbounds![0],
      route_exclude_address: ["10.0.0.0/8", "192.168.1.100"],
    });
  });

  it("TUN expert panel edits exclude_interface and warns on non-Linux", () => {
    const onChangeMock = vi.fn();
    const { rerender } = render(
      <InboundsTabPanel
        platform="linux"
        config={tunConfig}
        onChange={onChangeMock}
      />,
    );

    const input = screen.getByLabelText("排除网卡名称 (exclude_interface)");
    fireEvent.change(input, { target: { value: "zt0" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const next = onChangeMock.mock.calls.at(-1)![0] as SingBoxVisualConfig;
    expect(next.inbounds![0].exclude_interface).toEqual(["zt0"]);

    rerender(
      <InboundsTabPanel
        platform="macos"
        config={next}
        onChange={onChangeMock}
      />,
    );
    expect(screen.getByText(/仅 Linux 支持网卡名称分流/)).toBeDefined();
  });

  it("TUN expert panel documents the strict_route return-traffic caveat", () => {
    render(
      <InboundsTabPanel
        platform="linux"
        config={tunConfig}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/回程流量不会自动排除/).textContent).toContain(
      "br-lan",
    );
  });
});

describe("TUN exclusion fields validation and serialization", () => {
  const configWithExcludeIface = {
    inbounds: [{ type: "tun", exclude_interface: ["zt0"] }],
  } as unknown as SingBoxVisualConfig;

  it("accepts exclude_interface on Linux, rejects elsewhere, and names only the set field", () => {
    expect(
      validateExplicitPlatformConstraints(configWithExcludeIface, "linux"),
    ).toEqual([]);
    const errors = validateExplicitPlatformConstraints(
      configWithExcludeIface,
      "macos",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("exclude_interface");
    expect(errors[0]).not.toContain("include_interface");
  });

  it("rejects include_interface and exclude_interface used together on Linux", () => {
    const config = {
      inbounds: [
        {
          type: "tun",
          exclude_interface: ["zt0"],
          include_interface: ["eth0"],
        },
      ],
    } as unknown as SingBoxVisualConfig;
    const errors = validateExplicitPlatformConstraints(config, "linux");
    expect(errors.some((e) => e.includes("二者只能保留一项"))).toBe(true);
  });

  it("round-trips single-string and array forms without dropping fields", () => {
    const raw = JSON.stringify({
      inbounds: [
        {
          type: "tun",
          route_exclude_address: "10.0.0.0/8",
          exclude_interface: ["zt0"],
          route_exclude_address_set: "geoip-cn",
        },
      ],
    });
    const state = parseConfigToVisualState(raw);
    expect(state.inbounds![0].route_exclude_address).toEqual(["10.0.0.0/8"]);

    const out = serializeVisualStateToConfig(state, "linux");
    expect(out.inbounds).toEqual([
      {
        type: "tun",
        route_exclude_address: ["10.0.0.0/8"],
        exclude_interface: ["zt0"],
        route_exclude_address_set: ["geoip-cn"],
      },
    ]);
  });
});
