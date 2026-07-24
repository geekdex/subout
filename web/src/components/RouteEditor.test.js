// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// ============================================================
// Mock vuedraggable
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
// Mock Element Plus stubs
// ============================================================
const globalStubs = {
  "el-select": { template: "<div class='el-select'><slot /></div>" },
  "el-option": { template: "<div class='el-option'><slot /></div>" },
  "el-input": {
    template:
      "<input class='el-input' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />",
    props: ["modelValue", "size", "clearable", "prefixIcon", "placeholder"],
  },
  "el-switch": {
    template:
      "<div class='el-switch' @click='$emit(\"update:modelValue\", !modelValue)'><slot /></div>",
    props: ["modelValue"],
  },
  "el-button": {
    template:
      "<button class='el-button' @click='$emit(\"click\", $event)'><slot /></button>",
  },
  "el-tag": { template: "<span class='el-tag'><slot /></span>" },
  "el-tooltip": {
    template: "<span class='el-tooltip'><slot /><slot name='content' /></span>",
  },
  "el-icon": { template: "<span class='el-icon'><slot /></span>" },
  "el-card": {
    template:
      "<div class='el-card'><div class='el-card__header'><slot name='header' /></div><div class='el-card__body'><slot /></div></div>",
  },
  "el-collapse": { template: "<div class='el-collapse'><slot /></div>" },
  "el-collapse-item": {
    template:
      "<div class='el-collapse-item'><div class='el-collapse-item__header'><slot name='title' /></div><div class='el-collapse-item__wrap'><div class='el-collapse-item__content'><slot /></div></div></div>",
  },
  "el-alert": {
    template: "<div class='el-alert'><slot name='title' /><slot /></div>",
  },
  "el-popconfirm": {
    template: "<div class='el-popconfirm'><slot name='reference' /></div>",
  },
};

import RouteEditor from "./RouteEditor.vue";

// ============================================================
// Test data
// ============================================================
const mockConfigData = {
  dns: {
    servers: [
      { tag: "dns-google", type: "https", server: "8.8.8.8" },
      { tag: "dns-local", type: "local", server: "" },
    ],
  },
  route: {
    final: "proxy",
    default_domain_resolver: "dns-google",
    auto_detect_interface: true,
    rules: [
      { outbound: "proxy", geosite: ["google"], domain_suffix: [".com"] },
      { outbound: "direct", geoip: ["CN"] },
      { outbound: "block", ip_cidr: ["10.0.0.0/8"], action: "reject" },
    ],
    rule_set: [
      {
        tag: "geosite-cn",
        type: "remote",
        format: "binary",
        url: "https://example.com/cn.srs",
        download_detour: "proxy",
        update_interval: "1d",
      },
    ],
  },
};

const emptyConfigData = {
  dns: { servers: [] },
  route: {
    final: "",
    default_domain_resolver: "",
    auto_detect_interface: false,
    rules: [],
    rule_set: [],
  },
};

const duplicateInfo = [
  {
    typeLabel: "Geosite",
    value: "google",
    ruleIndices: [0, 1],
    outbounds: ["proxy", "direct"],
  },
];

function mountRouteEditor(configData, duplicates = []) {
  return mount(RouteEditor, {
    props: {
      configData,
      allOutboundTags: ["proxy", "direct", "block"],
      duplicateRouteRulesInfo: duplicates,
      editItem: vi.fn(),
      duplicateCheckFn: vi.fn(),
    },
    global: { stubs: globalStubs },
  });
}

describe("RouteEditor", () => {
  describe("Rendering", () => {
    it("renders stats bar with correct counts", () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const stats = wrapper.findAll(".stats-bar-item");
      expect(stats.length).toBe(4);
      expect(stats[0].text()).toContain("3");
      expect(stats[1].text()).toContain("1");
      expect(stats[2].text()).toContain("proxy");
    });

    it("renders basic params card", () => {
      const wrapper = mountRouteEditor(mockConfigData);
      expect(wrapper.text()).toContain("基本参数");
      expect(wrapper.text()).toContain("proxy");
      expect(wrapper.text()).toContain("默认 DNS 服务 Tag");
    });

    it("renders rule cards", () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const cards = wrapper.findAll(".rule-card");
      // 3 rules + 1 ruleset = 4 cards
      expect(cards.length).toBe(4);
      expect(wrapper.text()).toContain("google");
      expect(wrapper.text()).toContain("CN");
    });

    it("renders ruleset cards with details", () => {
      const wrapper = mountRouteEditor(mockConfigData);
      expect(wrapper.text()).toContain("geosite-cn");
      expect(wrapper.text()).toContain("remote");
      expect(wrapper.text()).toContain("binary");
      expect(wrapper.text()).toContain("1d");
    });

    it("shows duplicate route warning when data exists", () => {
      const wrapper = mountRouteEditor(mockConfigData, duplicateInfo);
      expect(wrapper.find(".el-alert").exists()).toBe(true);
      expect(wrapper.text()).toContain("重复");
      expect(wrapper.text()).toContain("google");
    });

    it("hides duplicate warning when no duplicates", () => {
      const wrapper = mountRouteEditor(mockConfigData);
      expect(wrapper.find(".el-alert").exists()).toBe(false);
    });

    it("shows empty state when no rules or rulesets", () => {
      const wrapper = mountRouteEditor(emptyConfigData);
      expect(wrapper.findAll(".rule-empty-state").length).toBe(2);
      expect(wrapper.text()).toContain("暂无路由规则");
      expect(wrapper.text()).toContain("暂无规则集");
    });
  });

  describe("Search filter", () => {
    it("filters rules when search term is entered", async () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const searchInput = wrapper.find(".search-filter-bar input");
      await searchInput.setValue("CN");
      await flushPromises();
      expect(wrapper.text()).toContain("(筛选显示 1 条)");
    });

    it("shows no-match state when filter yields empty", async () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const searchInput = wrapper.find(".search-filter-bar input");
      await searchInput.setValue("ZZZZNOEXIST");
      await flushPromises();
      expect(wrapper.text()).toContain("没有匹配的规则");
    });
  });

  describe("Collapse sections", () => {
    it("renders collapse items for rules and rulesets", () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const items = wrapper.findAll(".el-collapse-item");
      expect(items.length).toBe(2);
      expect(items[0].text()).toContain("分流路由规则列表");
      expect(items[1].text()).toContain("分流规则集集合");
    });
  });

  describe("Drag mode", () => {
    it("renders draggable for rules", () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const drags = wrapper.findAll(".mock-draggable");
      expect(drags.length).toBe(2); // rules + rulesets
    });

    it("shows drag handles", () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const handles = wrapper.findAll(".drag-handle");
      expect(handles.length).toBe(4); // 3 rules + 1 ruleset
    });
  });

  describe("Switch to search mode", () => {
    it("hides draggable and shows TransitionGroup when search is active", async () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const searchInput = wrapper.find(".search-filter-bar input");
      await searchInput.setValue("CN");
      await flushPromises();
      // rules draggable should be hidden, rulesets draggable still visible
      expect(wrapper.findAll(".mock-draggable").length).toBe(1); // rulesets only
    });
  });

  describe("Add button interactions", () => {
    it("calls editItem when add rule button is clicked", async () => {
      const wrapper = mountRouteEditor(mockConfigData);
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加"));
      expect(addBtn).toBeTruthy();
      await addBtn.trigger("click");
      expect(wrapper.props("editItem")).toHaveBeenCalled();
    });
  });
});
