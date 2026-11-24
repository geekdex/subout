import type { NodeItem } from "../types/api";

export function formatBytes(
  bytes: number | null | undefined,
  decimals = 2,
): string {
  if (bytes === null || bytes === undefined || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0 || i >= sizes.length) return `${bytes} B`;
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0秒";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);
  return parts.join(" ");
}

export function formatDate(
  dateVal: string | number | null | undefined,
): string {
  if (!dateVal) return "-";
  try {
    const d =
      typeof dateVal === "number"
        ? new Date(dateVal > 1e11 ? dateVal : dateVal * 1000)
        : new Date(dateVal.includes("T") ? dateVal : dateVal.replace(" ", "T"));
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(dateVal);
  }
}

/** 测速结果的分类，阈值与测速单元格的颜色/文案保持一致 */
export type LatencyCategory = "untested" | "timeout" | "good" | "fair" | "poor";

export function getLatencyCategory(
  latencyMs: number | null | undefined,
): LatencyCategory {
  if (latencyMs === null || latencyMs === undefined) return "untested";
  if (latencyMs <= 0) return "timeout";
  if (latencyMs < 150) return "good";
  if (latencyMs < 350) return "fair";
  return "poor";
}

/**
 * 节点当前生效的延迟，口径与后端 primary latency（web/nodes.rs）一致：
 * 只要测过 Web 就以 Web 为准，非正值（含 0 / -1 / -2）一律判超时，不回退 TCP；
 * 没测 Web 时才看 TCP，TCP 也没有才回退旧版 latency_ms（仍为 null 表示未测试）。
 * 测速单元格展示、排序与筛选共用此口径，避免三者判定不一致。
 */
export function getEffectiveLatency(node: NodeItem): number | null | undefined {
  const {
    last_web_latency: web,
    last_tcp_latency: tcp,
    latency_ms: legacy,
  } = node;
  if (web !== null && web !== undefined) return web > 0 ? web : -1;
  if (tcp !== null && tcp !== undefined) return tcp > 0 ? tcp : -1;
  return legacy ?? null;
}

export function formatLatency(latencyMs: number | null | undefined): {
  text: string;
  color: string;
} {
  if (latencyMs === null || latencyMs === undefined) {
    return { text: "未测试", color: "text-slate-500" };
  }
  const category = getLatencyCategory(latencyMs);
  if (category === "timeout") {
    return { text: "超时", color: "text-rose-400" };
  }
  return {
    text: `${latencyMs} ms`,
    color:
      category === "good"
        ? "text-emerald-400"
        : category === "fair"
          ? "text-amber-400"
          : "text-rose-400",
  };
}

export const KNOWN_SPEED_TEST_ENDPOINTS: Record<string, string> = {
  "https://www.gstatic.com/generate_204": "Google 静态资源",
  "https://www.google.com/generate_204": "Google 主站连通性",
  "https://speed.cloudflare.com/__down?bytes=0": "Cloudflare 测速站",
  "https://cp.cloudflare.com/generate_204": "Cloudflare 连通性",
  "https://captive.apple.com/hotspot-detect.html": "Apple 网络连通性",
  "https://detectportal.firefox.com/success.txt": "Mozilla 网络连通性",
  "https://1.1.1.1/cdn-cgi/trace": "Cloudflare 网络诊断",
  "http://www.gstatic.com/generate_204": "Google 静态资源",
  "http://www.google.com/generate_204": "Google 主站连通性",
  "http://speed.cloudflare.com/__down?bytes=0": "Cloudflare 测速站",
  "http://cp.cloudflare.com/generate_204": "Cloudflare 连通性",
};

export function getTestEndpointName(url?: string | null): string {
  if (!url) return "未指定测试点";
  const trimmed = url.trim();
  if (KNOWN_SPEED_TEST_ENDPOINTS[trimmed]) {
    return KNOWN_SPEED_TEST_ENDPOINTS[trimmed];
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.hostname || trimmed;
  } catch {
    return trimmed;
  }
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
