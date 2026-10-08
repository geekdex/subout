// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RuleTreeEditor from "./RuleTreeEditor.vue";
import RuleTreeGroup from "./RuleTreeGroup.vue";
import RuleTreeCondition from "./RuleTreeCondition.vue";

describe("RuleTree Components", () => {
  const userSampleRule = {
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
            domain_suffix: [".io", ".google", "feiniaoyun.xyz"],
          },
          {
            rule_set: ["geosite-google", "geosite-youtube"],
          },
        ],
      },
    ],
  };

  describe("RuleTreeCondition", () => {
    it("renders query_type pills and allows toggling", async () => {
      const condition = { query_type: ["A", "AAAA"] };
      const wrapper = mount(RuleTreeCondition, {
        props: {
          modelValue: condition,
          index: 0,
          ruleType: "dns",
        },
      });

      expect(wrapper.text()).toContain("条件 #1");
      const activePills = wrapper.findAll(".pill-btn.active");
      const activeTexts = activePills.map((p) => p.text());
      expect(activeTexts).toContain("A");
      expect(activeTexts).toContain("AAAA");

      // Click HTTPS to add it
      const httpsPill = wrapper.findAll(".pill-btn").find((p) => p.text() === "HTTPS");
      expect(httpsPill).toBeTruthy();
      await httpsPill.trigger("click");

      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      const emittedVal = wrapper.emitted("update:modelValue")[0][0];
      expect(emittedVal.query_type).toContain("HTTPS");
    });

    it("renders domain_suffix textarea and parses lines", async () => {
      const condition = { domain_suffix: [".io", ".google"] };
      const wrapper = mount(RuleTreeCondition, {
        props: {
          modelValue: condition,
          index: 1,
          ruleType: "dns",
        },
      });

      const textarea = wrapper.find("textarea");
      expect(textarea.element.value).toContain(".io\n.google");
      expect(wrapper.text()).toContain("2 项");

      await textarea.setValue(".io\n.google\n.dev");
      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      const emittedVal = wrapper.emitted("update:modelValue")[0][0];
      expect(emittedVal.domain_suffix).toEqual([".io", ".google", ".dev"]);
    });

    it("emits remove when delete button is clicked", async () => {
      const wrapper = mount(RuleTreeCondition, {
        props: {
          modelValue: { domain: ["test.com"] },
          index: 0,
          ruleType: "dns",
        },
      });

      const delBtn = wrapper.find(".btn-danger-subtle");
      await delBtn.trigger("click");
      expect(wrapper.emitted("remove")).toBeTruthy();
    });
  });

  describe("RuleTreeGroup", () => {
    it("renders group header with mode toggle (AND / OR)", async () => {
      const group = {
        type: "logical",
        mode: "and",
        rules: [{ query_type: ["A"] }],
      };
      const wrapper = mount(RuleTreeGroup, {
        props: {
          modelValue: group,
          depth: 0,
          isRoot: true,
          ruleType: "dns",
        },
      });

      expect(wrapper.text()).toContain("根逻辑匹配组");
      const orBtn = wrapper.find(".mode-btn-or");
      await orBtn.trigger("click");

      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      expect(wrapper.emitted("update:modelValue")[0][0].mode).toBe("or");
    });

    it("adds a new condition item", async () => {
      const group = {
        type: "logical",
        mode: "and",
        rules: [],
      };
      const wrapper = mount(RuleTreeGroup, {
        props: {
          modelValue: group,
          depth: 0,
          isRoot: true,
          ruleType: "dns",
        },
      });

      const addBtn = wrapper.findAll(".add-action-btn").find((b) => b.text().includes("添加匹配条件"));
      await addBtn.trigger("click");

      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      const emittedRules = wrapper.emitted("update:modelValue")[0][0].rules;
      expect(emittedRules).toHaveLength(1);
      expect(emittedRules[0].query_type).toEqual(["A", "AAAA"]);
    });

    it("adds a nested sub-logical group with opposite mode", async () => {
      const group = {
        type: "logical",
        mode: "and",
        rules: [],
      };
      const wrapper = mount(RuleTreeGroup, {
        props: {
          modelValue: group,
          depth: 0,
          isRoot: true,
          ruleType: "dns",
        },
      });

      const addSubGroupBtn = wrapper
        .findAll(".add-action-btn")
        .find((b) => b.text().includes("添加子逻辑组"));
      await addSubGroupBtn.trigger("click");

      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      const emittedRules = wrapper.emitted("update:modelValue")[0][0].rules;
      expect(emittedRules).toHaveLength(1);
      expect(emittedRules[0].type).toBe("logical");
      expect(emittedRules[0].mode).toBe("or"); // opposite of AND
    });
  });

  describe("RuleTreeEditor with User Sample Rule", () => {
    it("renders complete nested hierarchy of the user sample rule", () => {
      const wrapper = mount(RuleTreeEditor, {
        props: {
          modelValue: userSampleRule,
          ruleType: "dns",
        },
      });

      expect(wrapper.text()).toContain("根逻辑匹配组");
      expect(wrapper.text()).toContain("快捷模版");
      expect(wrapper.text()).toContain("A");
      expect(wrapper.text()).toContain("AAAA");
      expect(wrapper.text()).toContain("子逻辑组 (层级 1)");
      const textareas = wrapper.findAll("textarea");
      expect(textareas.some((t) => t.element.value.includes("claude.ai"))).toBe(true);
      expect(textareas.some((t) => t.element.value.includes("feiniaoyun.xyz"))).toBe(true);
      expect(textareas.some((t) => t.element.value.includes("geosite-google"))).toBe(true);
    });

    it("applies best practice template", async () => {
      const emptyRule = { type: "logical", mode: "or", rules: [] };
      const wrapper = mount(RuleTreeEditor, {
        props: {
          modelValue: emptyRule,
          ruleType: "dns",
        },
      });

      const tplBtn = wrapper
        .findAll(".preset-btn")
        .find((b) => b.text().includes("A/AAAA + 域名/规则集分流"));
      expect(tplBtn).toBeTruthy();
      await tplBtn.trigger("click");

      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      const emittedRule = wrapper.emitted("update:modelValue")[0][0];
      expect(emittedRule.type).toBe("logical");
      expect(emittedRule.mode).toBe("and");
      expect(emittedRule.rules).toHaveLength(2);
      expect(emittedRule.rules[0].query_type).toEqual(["A", "AAAA"]);
      expect(emittedRule.rules[1].type).toBe("logical");
      expect(emittedRule.rules[1].mode).toBe("or");
    });
  });
});
