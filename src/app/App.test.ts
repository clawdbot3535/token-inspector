// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";

// ---------------------------------------------------------------------------
// Helper: flush Promises AND allow FileReader macro-tasks to complete.
// jsdom's FileReader fires load via a macro-task (not a microtask), so a
// bare flushPromises() is not sufficient to drain it. This helper runs one
// real event-loop turn (setTimeout 0) to let FileReader fire, then flushes
// any follow-on promise chains.
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
  });
}

// ResizeObserver is used by some composables / child components
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
// matchMedia is accessed by Nuxt UI internals
vi.stubGlobal("matchMedia", (_: string) => ({
  matches: false,
  media: _,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));

// ---------------------------------------------------------------------------
// Mount options
// Heavy children are stubbed true; CommitPanel + GitLoader stay REAL so the
// gate assertions exercise the real component tree.
// ---------------------------------------------------------------------------
const mountOpts = {
  global: {
    stubs: {
      // Nuxt UI shell — must render its default slot
      UApp: { template: "<div><slot /></div>" },
      // Nuxt UI atoms
      UIcon: true,
      UButton: true,
      UInput: true,
      // Heavy inspector children
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
      // CommitPanel + GitLoader are intentionally NOT stubbed
    },
  },
};

// ---------------------------------------------------------------------------
// Minimal token file that passes loadSources without error
// ---------------------------------------------------------------------------
function tokenFile(): File {
  const data = JSON.stringify({
    global: { "bg-primary": { $value: "#0070f3", $type: "color" } },
  });
  return new File([data], "global.tokens.json", { type: "application/json" });
}

// ---------------------------------------------------------------------------
afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
describe("App gates", () => {
  it("shows loader without graph; shows commit toggle after load; shows panel after toggle", async () => {
    // Stub fetch — App fetches /figma-mapping.json on mount; 404 is fine
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );

    const wrapper = mount(App, mountOpts);
    await flushPromises();

    // ── Gate 1: no graph ─────────────────────────────────────────────────
    // Drop zone + git loader visible; commit toggle and panel absent
    expect(wrapper.find('[data-testid="repo-load"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="commit-open"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="export-url"]').exists()).toBe(false);

    // ── Load a token file through the REAL handleFiles path ───────────────
    const input = wrapper.find('input[type="file"]');
    expect(input.exists()).toBe(true);
    Object.defineProperty(input.element, "files", {
      value: [tokenFile()],
      configurable: true,
    });
    await input.trigger("change");
    // FileReader fires via a macro-task — flushAll() drains it then Vue reactivity
    await flushAll();

    // ── Gate 2: graph loaded ──────────────────────────────────────────────
    // Drop zone gone; commit toggle present; panel still hidden
    expect(wrapper.find('[data-testid="repo-load"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="commit-open"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="export-url"]').exists()).toBe(false);

    // ── Gate 3: toggle commit panel ───────────────────────────────────────
    const commitOpen = wrapper.find('[data-testid="commit-open"]');
    expect(commitOpen.attributes("aria-expanded")).toBe("false");
    await commitOpen.trigger("click");
    await flushPromises();

    // CommitPanel is now rendered → export-url input visible
    expect(wrapper.find('[data-testid="export-url"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="commit-open"]').attributes("aria-expanded")).toBe("true");
  });
});
