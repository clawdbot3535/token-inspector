// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";
import ComponentTree from "./components/ComponentTree.vue";

async function flushAll() {
  await flushPromises();
  await new Promise<void>((r) => setTimeout(r, 0));
  await flushPromises();
}

// --- jsdom shims (same as App.view-state.test.ts) ---
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

const NAMES = ["button", "input", "badge", "card", "chip"];
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
      LiveKitPanel: { template: '<div data-testid="kit-panel" />', name: "LiveKitPanel" },
      LiveBuildPanel: { template: '<div data-testid="lbp-stub" />', name: "LiveBuildPanel" },
    },
  },
};

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

describe("App view state — Live Build tab", () => {
  it("switches to the Live Build tab and mounts the panel", async () => {
    const wrapper = await mountLoaded();
    // activate the kit/coverage pane by selecting a previewable component group
    wrapper.findComponent(ComponentTree).vm.$emit("select-component", "button");
    await flushPromises();

    // live-build-tab should be present in the tablist
    expect(wrapper.find('[data-testid="live-build-tab"]').exists()).toBe(true);
    // panel not yet shown (kit tab is default)
    expect(wrapper.find('[data-testid="lbp-stub"]').exists()).toBe(false);

    // click the Live Build tab
    await wrapper.get('[data-testid="live-build-tab"]').trigger("click");
    await flushPromises();

    // panel now mounted; kit panel hidden
    expect(wrapper.find('[data-testid="lbp-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="kit-panel"]').exists()).toBe(false);
  });
});
