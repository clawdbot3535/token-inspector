// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";
import ComponentTree from "./components/ComponentTree.vue";
import FilterChips from "./components/FilterChips.vue";

async function flushAll() {
  await flushPromises();
  await new Promise<void>((r) => setTimeout(r, 0));
  await flushPromises();
}

if (!("text" in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, "text", {
    value(this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    },
  });
}
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.stubGlobal("matchMedia", (m: string) => ({
  matches: false, media: m, onchange: null,
  addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
}));

const mountOpts = {
  global: {
    stubs: {
      UApp: { template: "<div><slot /></div>" },
      UIcon: true, UButton: true, UInput: true,
      ScanView: true, ComponentTree: true, SummaryPanel: true, HeaderStatusStrip: true,
      TokenPreview: true, AliasChain: true, UsedByList: true, CodePreview: true, FigmaPreview: true,
      ClassificationBadge: true, FilterChips: true, OutputSection: true, ResizeHandle: true,
      CommitPanel: true, GitLoader: true,
      LiveButton: true, LiveInput: true, LiveBadge: true, LiveSwitch: true, LiveCheckbox: true,
      LiveRadio: true, LiveCard: true, LiveKbd: true, LiveProgress: true, LiveModal: true,
      LiveTable: true, LiveDropdown: true, LiveAccordion: true, LiveNav: true, LiveSidebar: true,
      LiveChip: true,
      // CoverageView intentionally NOT stubbed — we assert it mounts.
    },
  },
};

function tokenFile(): File {
  const data = {
    nav: { link: { bg: { $value: "#3b82f6", $type: "color" } }, item: { bg: { $value: "#3b82f6", $type: "color" } } },
    button: { bg: { $value: "#3b82f6", $type: "color" } },
  };
  return new File([JSON.stringify(data)], "global.tokens.json", { type: "application/json" });
}

async function mountLoaded() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: [tokenFile()], configurable: true });
  await input.trigger("change");
  await flushAll();
  return wrapper;
}

afterEach(() => vi.unstubAllGlobals());

describe("App coverage view", () => {
  it("offers a Coverage tab for a composite and toggles the view", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");          // clear node -> Chain 2
    tree.vm.$emit("select-component", "nav");
    await flushPromises();

    const covTab = wrapper.find('[data-testid="coverage-tab"]');
    expect(covTab.exists()).toBe(true);
    expect(wrapper.find('[data-testid="coverage-view"]').exists()).toBe(false); // default tab = preview
    expect(covTab.attributes("aria-selected")).toBe("false");
    await covTab.trigger("click");
    expect(wrapper.find('[data-testid="coverage-view"]').exists()).toBe(true);
    expect(covTab.attributes("aria-selected")).toBe("true");
  });

  it("shows no Coverage tab for a component without anatomy", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "button");
    await flushPromises();
    expect(wrapper.find('[data-testid="coverage-tab"]').exists()).toBe(false);
  });

  it("highlights a slot's tokens in the tree on click, staying on the coverage view", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "nav");
    await flushPromises();
    await wrapper.find('[data-testid="coverage-tab"]').trigger("click");
    await flushPromises();

    // nav-link-bg routes to the link slot (grammar fix) → the link row is a clickable button
    const linkRow = wrapper.find('[data-testid="coverage-slot"][data-slot="link"]');
    expect(linkRow.element.tagName).toBe("BUTTON");
    await linkRow.trigger("click");
    await flushPromises();

    const highlighted = tree.props("highlightedIds") as ReadonlySet<string>;
    expect(highlighted.has("nav-link-bg")).toBe(true);
    // reveals: the token's ancestor groups get expanded so the highlight is visible
    expect((tree.props("expandedPaths") as ReadonlySet<string>).size).toBeGreaterThan(0);
    // stays on the coverage view (no navigation to node-detail)
    expect(wrapper.find('[data-testid="coverage-view"]').exists()).toBe(true);
  });

  it("clears an active kind-filter on slot click so the highlighted tokens are visible", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "nav");
    await flushPromises();

    // a kind-filter that would hide nav's component-layer tokens from the tree
    wrapper.findComponent(FilterChips).vm.$emit("update:modelValue", "color");
    await flushPromises();
    expect(wrapper.findComponent(FilterChips).props("modelValue")).toBe("color");

    await wrapper.find('[data-testid="coverage-tab"]').trigger("click");
    await flushPromises();
    await wrapper.find('[data-testid="coverage-slot"][data-slot="link"]').trigger("click");
    await flushPromises();

    // the kind-filter is reset to "all" so the highlighted tokens show in the tree
    expect(wrapper.findComponent(FilterChips).props("modelValue")).toBe("all");
  });
});
