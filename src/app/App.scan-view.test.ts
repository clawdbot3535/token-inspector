// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";
import ScanView from "./components/ScanView.vue";
import FilterChips from "./components/FilterChips.vue";

async function flushAll() {
  await flushPromises();
  await new Promise<void>((r) => setTimeout(r, 0));
  await flushPromises();
}

// --- jsdom shims (same gaps as the other App mount tests) -----------------
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
      LiveButton: true,
      LiveInput: true,
      LiveBadge: true,
      LiveSwitch: true,
      LiveCheckbox: true,
      LiveRadio: true,
      LiveCard: true,
      LiveKbd: true,
      LiveProgress: true,
      LiveModal: true,
      LiveTable: true,
      LiveDropdown: true,
      LiveAccordion: true,
      LiveNav: true,
      LiveSidebar: true,
      LiveChip: true,
    },
  },
};

function fileFrom(data: Record<string, unknown>): File {
  return new File([JSON.stringify(data)], "global.tokens.json", { type: "application/json" });
}
// dimension token -> buildGraph emits no issues
const cleanFixtureFile = () => fileFrom({ spacing: { sm: { $value: 8, $type: "dimension" } } });
// bare-hex color -> buildGraph emits one malformed-value issue
const issueFixtureFile = () =>
  fileFrom({ button: { bg: { $value: "#3b82f6", $type: "color" } } });

async function mountLoaded(file: File) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("not found", { status: 404 })),
  );
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushAll();
  return wrapper;
}

afterEach(() => vi.unstubAllGlobals());

describe("App scan-view toggle", () => {
  it("hides the scan toggle when the graph has no issues", async () => {
    const wrapper = await mountLoaded(cleanFixtureFile());
    expect(wrapper.find('[data-testid="scan-toggle"]').exists()).toBe(false);
    expect(wrapper.findComponent(ScanView).exists()).toBe(false);
  });

  it("toggles ScanView on/off when the issue button is clicked", async () => {
    const wrapper = await mountLoaded(issueFixtureFile());
    const toggle = () => wrapper.find('[data-testid="scan-toggle"]');

    // button present, view starts on the inspector
    expect(toggle().exists()).toBe(true);
    expect(toggle().attributes("aria-pressed")).toBe("false");
    expect(wrapper.findComponent(ScanView).exists()).toBe(false);

    // click -> scan view
    await toggle().trigger("click");
    expect(toggle().attributes("aria-pressed")).toBe("true");
    expect(wrapper.findComponent(ScanView).exists()).toBe(true);

    // click again -> back to inspector
    await toggle().trigger("click");
    expect(toggle().attributes("aria-pressed")).toBe("false");
    expect(wrapper.findComponent(ScanView).exists()).toBe(false);
  });

  it("clears an active kind-filter when ScanView highlights tokens", async () => {
    const wrapper = await mountLoaded(issueFixtureFile());
    await wrapper.find('[data-testid="scan-toggle"]').trigger("click"); // open scan view
    await flushAll();

    // a kind-filter that would hide the highlighted tokens from the tree
    wrapper.findComponent(FilterChips).vm.$emit("update:modelValue", "color");
    await flushAll();
    expect(wrapper.findComponent(FilterChips).props("modelValue")).toBe("color");

    // ScanView highlights some tokens (e.g. clicking an issue's token list)
    wrapper.findComponent(ScanView).vm.$emit("select-tokens", ["button-bg"]);
    await flushAll();

    // the kind-filter is reset to "all" so the highlighted tokens are visible
    expect(wrapper.findComponent(FilterChips).props("modelValue")).toBe("all");
  });
});
