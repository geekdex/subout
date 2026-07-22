// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

// ============================================================
// Mock vuedraggable — render children in item slot
// ============================================================
vi.mock("vuedraggable", () => ({
  default: {
    name: "draggable",
    props: [
      "modelValue",
      "handle",
      "animation",
      "ghostClass",
      "itemKey",
      "tag",
    ],
    template: `
      <div class="mock-draggable">
        <template v-for="item in modelValue" :key="item">
          <slot name="item" :element="item" :index="modelValue.indexOf(item)" />
        </template>
      </div>
    `,
  },
}));

// ============================================================
// Mock Element Plus components used by RuleCriteriaTags
// ============================================================
const globalStubs = {
  "el-tag": { template: "<span class='el-tag'><slot /></span>" },
  "el-tooltip": { template: "<span class='el-tooltip'><slot /></span>" },
  "el-icon": { template: "<span class='el-icon'><slot /></span>" },
};

import RuleCriteriaTags from "./RuleCriteriaTags.vue";

const sampleDnsRule = {
  server: "dns-google",
  geosite: ["google", "youtube"],
  domain_suffix: [".com"],
  client_subnet: "223.5.5.0/24",
};

const sampleRouteRule = {
  outbound: "proxy",
  rule_set: ["geosite-cn"],
  geoip: ["CN"],
  action: "route",
};

const logicalRule = {
  type: "logical",
  mode: "and",
  rules: [{ geosite: ["google"] }, { geoip: ["US"] }],
};

describe("RuleCriteriaTags", () => {
  it("renders DNS rule criteria tags", () => {
    const wrapper = mount(RuleCriteriaTags, {
      props: { rule: sampleDnsRule, type: "dns" },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain("Geosite");
    expect(wrapper.text()).toContain("google");
    expect(wrapper.text()).toContain("youtube");
    expect(wrapper.text()).toContain("Suffix");
    expect(wrapper.text()).toContain(".com");
    expect(wrapper.text()).toContain("ECS");
    expect(wrapper.text()).toContain("223.5.5.0/24");
  });

  it("renders Route rule criteria tags", () => {
    const wrapper = mount(RuleCriteriaTags, {
      props: { rule: sampleRouteRule, type: "route" },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain("RuleSet");
    expect(wrapper.text()).toContain("geosite-cn");
    expect(wrapper.text()).toContain("GeoIP");
    expect(wrapper.text()).toContain("CN");
    expect(wrapper.text()).toContain("动作");
    expect(wrapper.text()).toContain("route");
  });

  it("renders logical rule with sub-rules", () => {
    const wrapper = mount(RuleCriteriaTags, {
      props: { rule: logicalRule, type: "route" },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain("AND");
    expect(wrapper.text()).toContain("google");
    expect(wrapper.text()).toContain("US");
  });

  it("shows empty-state text for rules with no criteria", () => {
    const wrapper = mount(RuleCriteriaTags, {
      props: { rule: { outbound: "proxy" }, type: "route" },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain("无条件，匹配全部");
  });

  it("highlights duplicate criteria when duplicateCheckFn is provided", () => {
    const fn = vi.fn((field) => field === "geosite");
    const wrapper = mount(RuleCriteriaTags, {
      props: {
        rule: sampleDnsRule,
        type: "dns",
        duplicateCheckFn: fn,
      },
      global: { stubs: globalStubs },
    });
    const tags = wrapper.findAll(".criteria-tag");
    const geositeTag = tags.find((t) => t.text().includes("Geosite"));
    expect(geositeTag?.classes()).toContain("duplicate-tag");
  });

  it("formats array values with join", () => {
    const wrapper = mount(RuleCriteriaTags, {
      props: {
        rule: { domain: ["example.com", "test.org"] },
        type: "dns",
      },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain("example.com, test.org");
  });

  it("formats single string values without join", () => {
    const wrapper = mount(RuleCriteriaTags, {
      props: {
        rule: { geoip: "CN" },
        type: "route",
      },
      global: { stubs: globalStubs },
    });
    expect(wrapper.text()).toContain("CN");
  });
});
