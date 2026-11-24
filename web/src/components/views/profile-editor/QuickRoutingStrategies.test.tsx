import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import {
  QuickRoutingStrategies,
  applyRoutingStrategy,
  REPLACES_RULES,
} from "./QuickRoutingStrategies";
import { SingBoxVisualConfig } from "./types";

const empty = {} as SingBoxVisualConfig;

describe("applyRoutingStrategy", () => {
  it("smart routing writes explicit rule sets and keeps proxy as final", () => {
    const next = applyRoutingStrategy(empty, "smart", "AUTO-Test");
    expect(next.route?.final).toBe("AUTO-Test");
    expect(next.route?.auto_detect_interface).toBe(true);
    expect(next.route?.rule_set?.map((r) => r.tag)).toContain("geosite-geolocation-cn");
    expect(next.route?.rules).toContainEqual({
      rule_set: ["geosite-geolocation-cn"],
      outbound: "direct",
    });
    // WYSIWYG: no hidden application-only field is written.
    expect(next.route).not.toHaveProperty("mode");
  });

  it("GFW routing routes blocked domains to proxy and defaults to direct", () => {
    const next = applyRoutingStrategy(empty, "gfw", "AUTO-Test");
    expect(next.route?.final).toBe("direct");
    expect(next.route?.rules).toContainEqual({
      rule_set: ["geosite-geolocation-!cn"],
      outbound: "AUTO-Test",
    });
  });

  it("domain-based strategies preserve existing rules; global strategies replace them", () => {
    const custom = { domain: ["example.com"], outbound: "my-node" };
    const config = {
      route: { rules: [custom] },
    } as SingBoxVisualConfig;

    const smart = applyRoutingStrategy(config, "smart", "AUTO-Test");
    expect(smart.route?.rules?.[0]).toEqual(custom);
    expect(smart.route?.rules?.length).toBeGreaterThan(1);

    const gfw = applyRoutingStrategy(config, "gfw", "AUTO-Test");
    expect(gfw.route?.rules?.[0]).toEqual(custom);

    const global = applyRoutingStrategy(config, "global", "AUTO-Test");
    expect(global.route?.rules).not.toContainEqual(custom);
    expect(global.route?.rules).toEqual(applyRoutingStrategy(empty, "global").route?.rules);

    const direct = applyRoutingStrategy(config, "direct_all", "AUTO-Test");
    expect(direct.route?.rules).not.toContainEqual(custom);
    expect(REPLACES_RULES).toMatchObject({
      smart: false,
      gfw: false,
      global: true,
      direct_all: true,
    });
  });

  it("global and direct_all only change the final outbound", () => {
    const global = applyRoutingStrategy(empty, "global", "AUTO-Test");
    expect(global.route?.final).toBe("AUTO-Test");
    expect(global.route?.rule_set).toBeUndefined();

    const direct = applyRoutingStrategy(empty, "direct_all", "AUTO-Test");
    expect(direct.route?.final).toBe("direct");
    expect(direct.route?.rule_set).toBeUndefined();
  });
});

describe("QuickRoutingStrategies component", () => {
  it("offers all four strategies and emits the generated config", () => {
    const onChange = vi.fn();
    render(
      <QuickRoutingStrategies
        config={empty}
        onChange={onChange}
        proxyTag="AUTO-Test"
      />,
    );

    for (const label of [
      "智能分流",
      "GFW 列表代理",
      "全部代理",
      "全部直连",
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }

    fireEvent.click(screen.getByText("全部直连"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].route.final).toBe("direct");
  });

  it("warns about existing rules and labels which strategies clear them", () => {
    const config = {
      route: { rules: [{ domain: ["example.com"], outbound: "direct" }] },
    } as SingBoxVisualConfig;
    render(
      <QuickRoutingStrategies config={config} onChange={vi.fn()} />,
    );

    expect(screen.getByText(/当前已有 1 条分流规则/)).toBeDefined();
    // Two strategy buttons plus the warning banner mention clearing rules.
    expect(screen.getAllByText(/清空现有规则/).length).toBe(3);
    expect(screen.getAllByText(/保留现有规则/).length).toBe(2);
  });
});
