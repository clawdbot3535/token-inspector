// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";
import ComponentTree from "./components/ComponentTree.vue";

// FileReader fires on a macro-task in jsdom; drain it then follow-on promises.
async function flushAll() {
  await flushPromises();
  await new Promise<void>((r) => setTimeout(r, 0));
  await flushPromises();
}

// --- jsdom shims (same gaps as App.test.ts) -------------------------------
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
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
vi.stubGlobal("matchMedia", (m: string) => ({
  matches: false,
  media: m,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));

// --- name -> expected Live* stub testid -----------------------------------
const EXPECTED: Record<string, string> = {
  button: "live-button",
  input: "live-input",
  textarea: "live-input",
  badge: "live-badge",
  switch: "live-switch",
  checkbox: "live-checkbox",
  radio: "live-radio",
  card: "live-card",
  kbd: "live-kbd",
  progress: "live-progress",
  modal: "live-modal",
  table: "live-table",
  dropdown: "live-dropdown",
  accordion: "live-accordion",
  nav: "live-nav",
  sidebar: "live-sidebar",
  chip: "live-chip",
};
const NAMES = Object.keys(EXPECTED);

const liveStub = (testid: string) => ({ template: `<div data-testid="${testid}" />` });
const mountOpts = {
  global: {
    stubs: {
      UApp: { template: "<div><slot /></div>" },
      UIcon: true,
      UButton: true,
      UInput: true,
      ScanView: true,
      ComponentTree: true,
      SummaryPanel: true,
      HeaderStatusStrip: true,
      TokenPreview: true,
      AliasChain: true,
      UsedByList: true,
      CodePreview: true,
      FigmaPreview: true,
      ClassificationBadge: true,
      FilterChips: true,
      OutputSection: true,
      ResizeHandle: true,
      CommitPanel: true,
      GitLoader: true,
      // name-emitting Live* stubs — these are what the routing test asserts on
      LiveButton: liveStub("live-button"),
      LiveInput: liveStub("live-input"),
      LiveBadge: liveStub("live-badge"),
      LiveSwitch: liveStub("live-switch"),
      LiveCheckbox: liveStub("live-checkbox"),
      LiveRadio: liveStub("live-radio"),
      LiveCard: liveStub("live-card"),
      LiveKbd: liveStub("live-kbd"),
      LiveProgress: liveStub("live-progress"),
      LiveModal: liveStub("live-modal"),
      LiveTable: liveStub("live-table"),
      LiveDropdown: liveStub("live-dropdown"),
      LiveAccordion: liveStub("live-accordion"),
      LiveNav: liveStub("live-nav"),
      LiveSidebar: liveStub("live-sidebar"),
      LiveChip: liveStub("live-chip"),
    },
  },
};

// global.tokens.json with one bg token per component -> ids `<name>-bg`
function tokenFile(): File {
  const data: Record<string, unknown> = {};
  for (const n of NAMES) data[n] = { bg: { $value: "#3b82f6", $type: "color" } };
  return new File([JSON.stringify(data)], "global.tokens.json", { type: "application/json" });
}

async function mountLoaded() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("not found", { status: 404 })),
  );
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: [tokenFile()], configurable: true });
  await input.trigger("change");
  await flushAll();
  return wrapper;
}

afterEach(() => vi.unstubAllGlobals());

describe("App preview routing — Chain 2 (component-group select)", () => {
  it.each(NAMES)("routes %s to its own Live* (not the LiveButton catch-all)", async (name) => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", ""); // clear node -> selectedNode null -> Chain 2
    tree.vm.$emit("select-component", name); // set the component group
    await flushPromises();

    const expected = EXPECTED[name];
    expect(wrapper.find(`[data-testid="${expected}"]`).exists()).toBe(true);
    if (expected !== "live-button") {
      expect(wrapper.find('[data-testid="live-button"]').exists()).toBe(false);
    }
  });

  it("renders no Live* for a component without preview support", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "tooltip"); // not in COMPONENTS_WITH_PREVIEW
    await flushPromises();
    for (const testid of new Set(Object.values(EXPECTED))) {
      expect(wrapper.find(`[data-testid="${testid}"]`).exists()).toBe(false);
    }
  });
});
