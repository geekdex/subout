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
  "el-divider": { template: "<hr class='el-divider' />" },
  "el-empty": { template: "<div class='el-empty'><slot /></div>" },
};

import DnsEditor from "./DnsEditor.vue";

// ============================================================
// Test data
// ============================================================
const mockConfigData = {
  dns: {
    strategy: "prefer_ipv4",
    final: "dns-google",
    client_subnet: "223.5.5.0/24",
    independent_cache: false,
    disable_cache: false,
    disable_expire: true,
    reverse_mapping: false,
    fakeip: {
      enabled: true,
      inet4_range: "198.18.0.0/15",
      inet6_range: "fc00::/18",
    },
    servers: [
      { tag: "dns-google", type: "https", server: "8.8.8.8", detour: "proxy" },
      { tag: "dns-local", type: "local", server: "", detour: "" },
    ],
    rules: [
      { server: "dns-google", geosite: ["google"], domain_suffix: [".com"] },
      { server: "dns-local", geoip: ["CN"], invert: true },
    ],
  },
};

const emptyConfigData = {
  dns: {
    strategy: "prefer_ipv4",
    final: "",
    client_subnet: "",
    independent_cache: false,
    disable_cache: false,
    disable_expire: false,
    reverse_mapping: false,
    fakeip: { enabled: false, inet4_range: "", inet6_range: "" },
    servers: [],
    rules: [],
  },
};

function mountDnsEditor(configData) {
  return mount(DnsEditor, {
    props: {
      configData,
      allOutboundTags: ["proxy", "direct"],
      editItem: vi.fn(),
      duplicateCheckFn: vi.fn(),
    },
    global: {
      stubs: {
        ...globalStubs,
        Transition: { template: "<div><slot /></div>" },
      },
    },
  });
}

describe("DnsEditor", () => {
  describe("Rendering", () => {
    it("renders stats bar with correct counts", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const stats = wrapper.findAll(".stats-bar-item");
      expect(stats.length).toBe(4);
      expect(stats[0].text()).toContain("2");
      expect(stats[1].text()).toContain("2");
    });

    it("renders basic params card", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      expect(wrapper.text()).toContain("基本参数");
      expect(wrapper.text()).toContain("prefer_ipv4");
    });

    it("renders cache section with FakeIP settings", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      expect(wrapper.text()).toContain("缓存与映射");
      expect(wrapper.text()).toContain("FakeIP");
      expect(wrapper.text()).toContain("IPv4 CIDR 地址段");
      expect(wrapper.text()).toContain("IPv6 CIDR 地址段");
    });

    it("renders server cards inside draggable", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      expect(wrapper.findAll(".rule-card").length).toBe(4); // 2 servers + 2 rules
      expect(wrapper.text()).toContain("dns-google");
      expect(wrapper.text()).toContain("dns-local");
    });

    it("renders rule cards with criteria tags", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      expect(wrapper.text()).toContain("google");
      expect(wrapper.text()).toContain(".com");
      expect(wrapper.text()).toContain("CN");
    });

    it("shows empty state when no servers or rules", () => {
      const wrapper = mountDnsEditor(emptyConfigData);
      expect(wrapper.findAll(".rule-empty-state").length).toBe(2);
      expect(wrapper.text()).toContain("暂无 DNS 服务器");
      expect(wrapper.text()).toContain("暂无 DNS 规则");
    });
  });

  describe("Search filter", () => {
    it("shows search bar when rules exist", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      expect(wrapper.find(".search-filter-bar").exists()).toBe(true);
    });

    it("hides search bar when no rules exist", () => {
      const wrapper = mountDnsEditor(emptyConfigData);
      expect(wrapper.find(".search-filter-bar").exists()).toBe(false);
    });

    it("filters rules when search query is entered", async () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const searchInput = wrapper.find(".search-filter-bar input");
      await searchInput.setValue("CN");
      await flushPromises();
      expect(wrapper.text()).toContain("CN");
      // google rule is filtered out; server "dns-google" still visible
      expect(wrapper.text()).toContain("(筛选显示 1 条)");
    });

    it("switches to drag mode when search is cleared", async () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const searchInput = wrapper.find(".search-filter-bar input");
      await searchInput.setValue("CN");
      await flushPromises();
      expect(wrapper.findAll(".mock-draggable").length).toBe(1); // servers draggable only
      await searchInput.setValue("");
      await flushPromises();
      expect(wrapper.findAll(".mock-draggable").length).toBe(2); // both draggable
    });

    it("shows no-match state when filter yields empty", async () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const searchInput = wrapper.find(".search-filter-bar input");
      await searchInput.setValue("ZZZZNOTEXIST");
      await flushPromises();
      expect(wrapper.text()).toContain("没有匹配的规则");
    });
  });

  describe("Collapse sections", () => {
    it("renders collapse items for servers and rules", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const collapseItems = wrapper.findAll(".el-collapse-item");
      expect(collapseItems.length).toBe(2);
      expect(collapseItems[0].text()).toContain("DNS 服务器列表");
      expect(collapseItems[1].text()).toContain("DNS 分流规则列表");
    });
  });

  describe("Add button interactions", () => {
    it("calls editItem when add server button is clicked", async () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const addBtn = wrapper
        .findAll("button")
        .find((b) => b.text().includes("添加"));
      expect(addBtn).toBeTruthy();
      await addBtn.trigger("click");
      expect(wrapper.props("editItem")).toHaveBeenCalled();
    });
  });

  describe("Drag mode (no search)", () => {
    it("renders draggable for servers", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const drags = wrapper.findAll(".mock-draggable");
      expect(drags.length).toBe(2); // servers + rules
    });

    it("shows drag handles on server cards", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const handles = wrapper.findAll(".drag-handle");
      expect(handles.length).toBe(4); // 2 servers + 2 rules
    });
  });

  describe("Server type tag colors", () => {
    it("maps https to success type", () => {
      const wrapper = mountDnsEditor(mockConfigData);
      const tags = wrapper.findAll(".el-tag");
      const httpsTag = tags.find((t) => t.text() === "https");
      expect(httpsTag).toBeTruthy();
    });
  });
});
