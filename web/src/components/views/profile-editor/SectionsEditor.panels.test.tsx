import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { SingBoxVisualConfig } from "./types";
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
});
