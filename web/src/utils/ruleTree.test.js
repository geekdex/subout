import { describe, it, expect } from "vitest";
import { cleanRuleTree, ruleMatchesQuery, createDnsNestedTemplate } from "./ruleTree.js";

describe("ruleTree utilities", () => {
  const sampleUserRule = {
    type: "logical",
    mode: "and",
    server: "remote-dns",
    rules: [
      {
        query_type: ["A", "AAAA"],
      },
      {
        type: "logical",
        mode: "or",
        rules: [
          {
            domain: ["claude.ai"],
          },
          {
            domain_suffix: [".io", ".google", ".org"],
          },
          {
            rule_set: ["geosite-google", "geosite-youtube"],
          },
        ],
      },
    ],
  };

  describe("cleanRuleTree", () => {
    it("preserves valid nested logical rule structure", () => {
      const cleaned = cleanRuleTree(sampleUserRule.rules);
      expect(cleaned).toHaveLength(2);
      expect(cleaned[0]).toEqual({ query_type: ["A", "AAAA"] });
      expect(cleaned[1].type).toBe("logical");
      expect(cleaned[1].mode).toBe("or");
      expect(cleaned[1].rules).toHaveLength(3);
      expect(cleaned[1].rules[0]).toEqual({ domain: ["claude.ai"] });
      expect(cleaned[1].rules[1]).toEqual({ domain_suffix: [".io", ".google", ".org"] });
      expect(cleaned[1].rules[2]).toEqual({ rule_set: ["geosite-google", "geosite-youtube"] });
    });

    it("filters out empty conditions", () => {
      const dirty = [
        { query_type: ["A"] },
        { domain: [] }, // empty
        { domain_suffix: ["   ", ""] }, // all blank
        {
          type: "logical",
          mode: "or",
          rules: [{ rule_set: [] }, { domain: ["google.com"] }],
        },
      ];
      const cleaned = cleanRuleTree(dirty);
      expect(cleaned).toHaveLength(2);
      expect(cleaned[0]).toEqual({ query_type: ["A"] });
      expect(cleaned[1].rules).toEqual([{ domain: ["google.com"] }]);
    });

    it("handles port conversion to numbers", () => {
      const rules = [{ port: "53, 853" }, { port: [443, 80] }];
      const cleaned = cleanRuleTree(rules);
      expect(cleaned[0].port).toEqual([53, 853]);
      expect(cleaned[1].port).toEqual([443, 80]);
    });
  });

  describe("ruleMatchesQuery", () => {
    it("finds match in top-level server name", () => {
      expect(ruleMatchesQuery(sampleUserRule, "remote")).toBe(true);
      expect(ruleMatchesQuery(sampleUserRule, "remote-dns")).toBe(true);
    });

    it("finds match in root-level query_type child", () => {
      expect(ruleMatchesQuery(sampleUserRule, "AAAA")).toBe(true);
      expect(ruleMatchesQuery(sampleUserRule, "a")).toBe(true);
    });

    it("finds match inside deeply nested child", () => {
      expect(ruleMatchesQuery(sampleUserRule, "claude")).toBe(true);
      expect(ruleMatchesQuery(sampleUserRule, ".io")).toBe(true);
      expect(ruleMatchesQuery(sampleUserRule, "geosite-youtube")).toBe(true);
    });

    it("returns false for non-matching query", () => {
      expect(ruleMatchesQuery(sampleUserRule, "nonexistent-criterion")).toBe(false);
    });
  });

  describe("createDnsNestedTemplate", () => {
    it("creates standard AND/OR template", () => {
      const tpl = createDnsNestedTemplate();
      expect(tpl).toHaveLength(2);
      expect(tpl[0].query_type).toEqual(["A", "AAAA"]);
      expect(tpl[1].type).toBe("logical");
      expect(tpl[1].mode).toBe("or");
    });
  });
});
