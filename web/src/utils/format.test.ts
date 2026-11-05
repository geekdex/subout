import { describe, it, expect } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatDate,
  formatLatency,
  getErrorMessage,
  getTestEndpointName,
} from "./format";

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
    expect(formatLatency(0).text).toBe("超时");
    expect(formatLatency(-1).text).toBe("超时");
    expect(formatLatency(50).color).toContain("emerald");
    expect(formatLatency(200).color).toContain("amber");
    expect(formatLatency(500).color).toContain("rose");
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
