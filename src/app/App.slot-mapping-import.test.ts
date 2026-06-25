// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";

async function flushAll() {
  // Several rounds: loadSources reads each file via the FileReader shim (a
  // macrotask), and a multi-file drop chains them sequentially.
  for (let i = 0; i < 5; i++) {
    await flushPromises();
    await new Promise<void>((r) => setTimeout(r, 0));
  }
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
      UIcon: true, UInput: true, ScanView: true, ComponentTree: true, SummaryPanel: true,
      HeaderStatusStrip: true, TokenPreview: true, AliasChain: true, UsedByList: true,
      CodePreview: true, FigmaPreview: true, ClassificationBadge: true, FilterChips: true,
      OutputSection: true, ResizeHandle: true, CommitPanel: true, GitLoader: true,
      LiveKitPanel: { template: '<div />', name: "LiveKitPanel" },
      // Pass-through UButton so data-testid attributes (scan-toggle, download-slot-mapping) survive.
      UButton: { template: '<button v-bind="$attrs"><slot /></button>' },
    },
  },
};

// A bare-hex color -> buildGraph emits a malformed-value issue (so the scan toggle shows).
const issueFixtureFile = () =>
  new File([JSON.stringify({ button: { bg: { $value: "#3b82f6", $type: "color" } } })], "global.tokens.json", { type: "application/json" });
const slotMappingFile = () =>
  new File([JSON.stringify({ overrides: {
    "button-mystery-bg": { slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null, statePrefix: null },
  } })], "slot-mapping.json", { type: "application/json" });

async function mountAndLoad(files: File[]) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: files, configurable: true });
  await input.trigger("change");
  await flushAll();
  return wrapper;
}

afterEach(() => vi.unstubAllGlobals());

describe("App slot-mapping.json reimport", () => {
  it("applies an imported slot-mapping.json's overrides (download button appears)", async () => {
    const wrapper = await mountAndLoad([issueFixtureFile(), slotMappingFile()]);
    // The Download slot-mapping.json button is gated on resolveOverride being non-empty
    // and lives in the scan section — opening it proves the override was applied.
    await wrapper.find('[data-testid="scan-toggle"]').trigger("click");
    await flushAll();
    expect(wrapper.find('[data-testid="download-slot-mapping"]').exists()).toBe(true);
  });

  it("does not raise the 'no token files' error when only a slot-mapping.json is dropped", async () => {
    const wrapper = await mountAndLoad([slotMappingFile()]);
    expect(wrapper.text()).not.toContain("No recognized token files");
  });
});
