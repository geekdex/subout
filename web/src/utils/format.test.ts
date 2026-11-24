import { describe, it, expect } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatDate,
  formatLatency,
  getLatencyCategory,
  getEffectiveLatency,
  getErrorMessage,
  getTestEndpointName,
} from "./format";
import type { NodeItem } from "../types/api";

describe("format utilities", () => {
  it("formats bytes correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(null)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(1073741824)).toBe("1 GB");
    expect(formatBytes(1610612736)).toBe("1.5 GB");
  });

  it("formats duration in seconds", () => {
    expect(formatDuration(0)).toBe("0秒");
    expect(formatDuration(45)).toBe("45秒");
    expect(formatDuration(125)).toBe("2分 5秒");
    expect(formatDuration(3665)).toBe("1小时 1分 5秒");
    expect(formatDuration(90000)).toBe("1天 1小时");
  });

  it("formats latency status", () => {
    expect(formatLatency(null).text).toBe("未测试");
    expect(formatLatency(undefined).text).toBe("未测试");
    expect(formatLatency(-1).text).toBe("超时");
    expect(formatLatency(0).text).toBe("超时");
    expect(formatLatency(50).color).toContain("emerald");
    expect(formatLatency(149).color).toContain("emerald");
    expect(formatLatency(150).color).toContain("amber");
    expect(formatLatency(200).color).toContain("amber");
    expect(formatLatency(349).color).toContain("amber");
    expect(formatLatency(350).color).toContain("rose");
    expect(formatLatency(500).color).toContain("rose");
  });

  it("maps latency values to the same categories used by the filter", () => {
    expect(getLatencyCategory(null)).toBe("untested");
    expect(getLatencyCategory(undefined)).toBe("untested");
    expect(getLatencyCategory(-1)).toBe("timeout");
    expect(getLatencyCategory(0)).toBe("timeout");
    expect(getLatencyCategory(149)).toBe("good");
    expect(getLatencyCategory(150)).toBe("fair");
    expect(getLatencyCategory(349)).toBe("fair");
    expect(getLatencyCategory(350)).toBe("poor");
  });

  it("严格校验区间端点：超时含 0，良好为开区间，一般左闭右开，较差含 350", () => {
    // (-∞, 0]ms
    expect(getLatencyCategory(-100)).toBe("timeout");
    expect(getLatencyCategory(-0.01)).toBe("timeout");
    expect(getLatencyCategory(0)).toBe("timeout");
    // (0, 150)ms：紧邻 150 左侧仍属于良好，150 本身不属于
    expect(getLatencyCategory(0.01)).toBe("good");
    expect(getLatencyCategory(149.99)).toBe("good");
    expect(getLatencyCategory(150)).not.toBe("good");
    // [150, 350)ms：含 150、不含 350
    expect(getLatencyCategory(150)).toBe("fair");
    expect(getLatencyCategory(150.01)).toBe("fair");
    expect(getLatencyCategory(349.99)).toBe("fair");
    expect(getLatencyCategory(350)).not.toBe("fair");
    // [350, +∞)ms
    expect(getLatencyCategory(350)).toBe("poor");
    expect(getLatencyCategory(350.01)).toBe("poor");
    expect(getLatencyCategory(60000)).toBe("poor");
  });

  it("picks the effective latency consistently with the table cell", () => {
    const makeNode = (overrides: Partial<NodeItem> = {}): NodeItem => ({
      id: 1,
      subscription_id: null,
      tag: "t",
      node_type: "vless",
      server: "s",
      port: 443,
      raw_json: "{}",
      enabled: true,
      ...overrides,
    });

    expect(getEffectiveLatency(makeNode())).toBeNull();
    expect(
      getEffectiveLatency(
        makeNode({ last_tcp_latency: 40, last_web_latency: 120 }),
      ),
    ).toBe(120);
    expect(getEffectiveLatency(makeNode({ last_tcp_latency: 40 }))).toBe(40);
    expect(
      getEffectiveLatency(
        makeNode({ last_web_latency: -1, last_tcp_latency: 40 }),
      ),
    ).toBe(-1);
    expect(getEffectiveLatency(makeNode({ latency_ms: 200 }))).toBe(200);
  });

  it("resolves effective latency at boundary values across legacy fields", () => {
    const makeNode = (overrides: Partial<NodeItem> = {}): NodeItem => ({
      id: 1,
      subscription_id: null,
      tag: "t",
      node_type: "vless",
      server: "s",
      port: 443,
      raw_json: "{}",
      enabled: true,
      ...overrides,
    });

    // Web 只要测过就以 Web 为准：0 / -1 / -2 都判超时，不回退 TCP
    expect(
      getEffectiveLatency(
        makeNode({ last_web_latency: 0, last_tcp_latency: null }),
      ),
    ).toBe(-1);
    expect(
      getEffectiveLatency(
        makeNode({ last_web_latency: 0, last_tcp_latency: 150 }),
      ),
    ).toBe(-1);
    expect(
      getEffectiveLatency(
        makeNode({ last_web_latency: -2, last_tcp_latency: 150 }),
      ),
    ).toBe(-1);
    expect(
      getEffectiveLatency(
        makeNode({ last_web_latency: -1, last_tcp_latency: -1 }),
      ),
    ).toBe(-1);
    // Web 有效（>0）时优先，即使 TCP 为 -1 也按 Web 结果计
    expect(
      getEffectiveLatency(
        makeNode({ last_web_latency: 120, last_tcp_latency: -1 }),
      ),
    ).toBe(120);
    // 没测 Web 时才回退 TCP，TCP 非正值同样判超时
    expect(getEffectiveLatency(makeNode({ last_tcp_latency: 150 }))).toBe(150);
    expect(getEffectiveLatency(makeNode({ last_tcp_latency: 0 }))).toBe(-1);
    expect(getEffectiveLatency(makeNode({ last_tcp_latency: -2 }))).toBe(-1);
    // 旧字段兜底：0 算超时，null 才是未测试
    expect(
      getEffectiveLatency(
        makeNode({
          last_tcp_latency: null,
          last_web_latency: null,
          latency_ms: 0,
        }),
      ),
    ).toBe(0);
    expect(
      getEffectiveLatency(
        makeNode({
          last_tcp_latency: null,
          last_web_latency: null,
          latency_ms: 200,
        }),
      ),
    ).toBe(200);
    expect(
      getEffectiveLatency(
        makeNode({
          last_tcp_latency: null,
          last_web_latency: null,
          latency_ms: null,
        }),
      ),
    ).toBeNull();
  });

  it("formats date string gracefully", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("")).toBe("-");
    expect(formatDate("invalid-date")).toBe("invalid-date");
    const valid = formatDate("2026-11-03T10:00:00Z");
    expect(valid).toContain("2026");
    const spaceDate = formatDate("2026-11-05 16:45:00");
    expect(spaceDate).toContain("2026");
  });

  it("maps test endpoint urls to readable names", () => {
    expect(getTestEndpointName("https://www.gstatic.com/generate_204")).toBe(
      "Google 静态资源",
    );
    expect(getTestEndpointName("https://www.google.com/generate_204")).toBe(
      "Google 主站连通性",
    );
    expect(getTestEndpointName("https://cp.cloudflare.com/generate_204")).toBe(
      "Cloudflare 连通性",
    );
    expect(
      getTestEndpointName("https://captive.apple.com/hotspot-detect.html"),
    ).toBe("Apple 网络连通性");
    expect(
      getTestEndpointName("https://detectportal.firefox.com/success.txt"),
    ).toBe("Mozilla 网络连通性");
    expect(getTestEndpointName("https://1.1.1.1/cdn-cgi/trace")).toBe(
      "Cloudflare 网络诊断",
    );
    expect(getTestEndpointName(null)).toBe("未指定测试点");
    expect(getTestEndpointName("https://custom.test/ping")).toBe("custom.test");
  });

  it("extracts error messages reliably", () => {
    expect(getErrorMessage(new Error("Test error"))).toBe("Test error");
    expect(getErrorMessage({ message: "Custom obj error" })).toBe(
      "Custom obj error",
    );
    expect(getErrorMessage("Raw string error")).toBe("Raw string error");
  });
});
