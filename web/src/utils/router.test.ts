import { describe, it, expect } from "vitest";
import { parseRoute, formatRoute } from "./router";

describe("router utils", () => {
  it("parses valid hash routes correctly", () => {
    expect(parseRoute("#/settings").tab).toBe("settings");
    expect(parseRoute("#/nodes").tab).toBe("nodes");
    expect(parseRoute("#/auto-update").tab).toBe("auto-update");
    expect(parseRoute("#simple").tab).toBe("simple");
  });

  it("parses hash with query parameters", () => {
    const route = parseRoute("#/profiles?id=12&view=editor");
    expect(route.tab).toBe("profiles");
    expect(route.params.id).toBe("12");
    expect(route.params.view).toBe("editor");
  });

  it("falls back to pathname when hash is empty", () => {
    expect(parseRoute("", "/settings").tab).toBe("settings");
    expect(parseRoute("#/", "/nodes").tab).toBe("nodes");
  });

  it("falls back to dashboard on invalid routes", () => {
    expect(parseRoute("#/unknown-page").tab).toBe("dashboard");
    expect(parseRoute("", "/").tab).toBe("dashboard");
  });

  it("formats routes correctly", () => {
    expect(formatRoute("settings")).toBe("#/settings");
    expect(formatRoute("profiles", { id: 5 })).toBe("#/profiles?id=5");
  });
});
