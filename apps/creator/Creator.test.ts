// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import Creator from "./Creator.vue";

// ---------------------------------------------------------------------------
// Helper: flush Promises AND a macro-task so FileReader callbacks fire
// ---------------------------------------------------------------------------
async function flushAll() {
  await flushPromises();
  await new Promise<void>((r) => setTimeout(r, 0));
  await flushPromises();
}

// ---------------------------------------------------------------------------
// Browser-API shims (jsdom gaps)
// ---------------------------------------------------------------------------

// jsdom's File/Blob instances lack .text() — polyfill via TextDecoder so that
// loadSources can call file.text() to read token JSON.
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
    configurable: true,
  });
}

// matchMedia stub (jsdom missing)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((_: string) => ({
    matches: false,
    media: _,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })),
});

// ---------------------------------------------------------------------------
// Mount options — stub heavy bits, keep the real load path
// ---------------------------------------------------------------------------
const mountOpts = {
  global: {
    stubs: {
      UApp: { template: "<div><slot /></div>" },
      UIcon: true,
      UButton: true,
      GitLoader: true,
    },
  },
};

// ---------------------------------------------------------------------------
// Minimal token file: includes a "switch" group so the creator scaffold has
// something to resolve against, and the graph has a node for the preview.
// ---------------------------------------------------------------------------
function switchTokenFile(): File {
  const data = JSON.stringify({
    global: {
      "color-bg-muted": { $value: "#f4f4f5", $type: "color" },
      "color-border-default": { $value: "#e4e4e7", $type: "color" },
      "color-text-default": { $value: "#18181b", $type: "color" },
    },
  });
  return new File([data], "global.tokens.json", { type: "application/json" });
}

// ---------------------------------------------------------------------------
afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
describe("Creator smoke test", () => {
  // 15s (not the 5s default): this mounts the whole Creator app + jsdom shims and reads token files;
  // it runs ~120ms standalone but can exceed 5s under full-suite worker-pool contention.
  it("shows load prompt before sources; after load + pick switch: badge 100%, switch-track renders, JSON has switch", async () => {
    const wrapper = mount(Creator, mountOpts);
    await flushPromises();

    // ── Gate 1: pre-load prompt visible ──────────────────────────────────
    expect(wrapper.find('[data-testid="sources-loaded"]').exists()).toBe(false);

    // ── Seed a token file through the real handleFiles path ───────────────
    const input = wrapper.find('input[type="file"]');
    expect(input.exists()).toBe(true);
    Object.defineProperty(input.element, "files", {
      value: [switchTokenFile()],
      configurable: true,
    });
    await input.trigger("change");
    await flushAll();

    // ── Gate 2: sources loaded, 3-column UI rendered ──────────────────────
    // Load succeeded → the pre-load prompt is replaced by the 3-column layout.
    expect(wrapper.find('[data-testid="creator-layout"]').exists()).toBe(true);
    expect(wrapper.find('input[type="file"]').exists()).toBe(false); // drop zone gone
    // Pick "switch" via ComponentPicker
    const switchBtn = wrapper.find('[data-testid="component-picker-switch"]');
    expect(switchBtn.exists()).toBe(true);
    await switchBtn.trigger("click");
    await flushPromises();

    // ── Gate 3: assertions ────────────────────────────────────────────────
    // mapped-badge shows 100% (no unmapped tokens for switch)
    const badge = wrapper.find('[data-testid="mapped-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("100%");

    // Live preview mounted — switch-track is the real LiveSwitch element
    expect(wrapper.find('[data-testid="switch-track"]').exists()).toBe(true);

    // Output JSON contains "switch"
    const output = wrapper.find('[data-testid="creator-output"]');
    expect(output.exists()).toBe(true);
    expect(output.text()).toContain("switch");
  }, 15_000);
});
