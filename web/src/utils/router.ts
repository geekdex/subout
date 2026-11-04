import { NavTab } from "../components/layout/Sidebar";

export const VALID_TABS: readonly NavTab[] = [
  "dashboard",
  "simple",
  "profiles",
  "subscriptions",
  "nodes",
  "groups",
  "auto-update",
  "logs",
  "settings",
] as const;

export interface RouteState {
  tab: NavTab;
  params: Record<string, string>;
}

export function parseRoute(
  hash: string = typeof window !== "undefined" ? window.location.hash : "",
  pathname: string = typeof window !== "undefined" ? window.location.pathname : "",
): RouteState {
  let cleanHash = hash.replace(/^[#/]+/, "");
  let queryString = "";

  if (cleanHash.includes("?")) {
    const parts = cleanHash.split("?");
    cleanHash = parts[0];
    queryString = parts.slice(1).join("?");
  }

  // 1. Try matching tab from hash
  const matchedTab = VALID_TABS.find((t) => t === cleanHash);
  if (matchedTab) {
    return {
      tab: matchedTab,
      params: parseQueryParams(queryString),
    };
  }

  // 2. Fallback to pathname (e.g. user typed http://host/settings directly)
  const cleanPath = pathname.replace(/^\/+|\/+$/g, "");
  const matchedPathTab = VALID_TABS.find((t) => t === cleanPath);
  if (matchedPathTab) {
    return {
      tab: matchedPathTab,
      params: typeof window !== "undefined" ? parseQueryParams(window.location.search.replace(/^\?/, "")) : {},
    };
  }

  // 3. Default fallback
  return {
    tab: "dashboard",
    params: {},
  };
}

function parseQueryParams(queryString: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!queryString) return params;

  try {
    const searchParams = new URLSearchParams(queryString);
    searchParams.forEach((val, key) => {
      params[key] = val;
    });
  } catch {
    // ignore malformed query strings
  }
  return params;
}

export function formatRoute(tab: NavTab, params?: Record<string, string | number>): string {
  let result = `#/${tab}`;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        searchParams.set(k, String(v));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      result += `?${qs}`;
    }
  }
  return result;
}

export function navigateTo(
  tab: NavTab,
  params?: Record<string, string | number>,
  replace = false,
): void {
  if (typeof window === "undefined") return;

  const targetHash = formatRoute(tab, params);
  if (replace) {
    const url = new URL(window.location.href);
    url.hash = targetHash;
    window.history.replaceState(null, "", url.toString());
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    if (window.location.hash === targetHash) return;
    window.location.hash = targetHash;
  }
}
