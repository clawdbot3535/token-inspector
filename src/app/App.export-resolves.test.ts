// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

// Capture the bundle entries downloadAll hands to buildZip.
const captured = vi.hoisted(() => ({ entries: [] as Array<{ name: string; data: string }> }));
vi.mock("./zip.js", () => ({
  buildZip: (entries: Array<{ name: string; data: string }>) => {
    captured.entries = entries;
    return new Blob([]);
  },
  downloadBlob: () => {},
}));

import App from "./App.vue";

async function flushAll() {
  for (let i = 0; i < 5; i++) {
    await flushPromises();
    await new Promise<void>((r) => setTimeout(r, 0));
  }
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
      UIcon: true, UInput: true, ScanView: true, ComponentTree: true, SummaryPanel: true,
      HeaderStatusStrip: true, TokenPreview: true, AliasChain: true, UsedByList: true,
      CodePreview: true, FigmaPreview: true, ClassificationBadge: true, FilterChips: true,
      OutputSection: true, ResizeHandle: true, CommitPanel: true, GitLoader: true,
      LiveKitPanel: { template: '<div />', name: "LiveKitPanel" },
      UButton: { template: '<button v-bind="$attrs"><slot /></button>' },
    },
  },
};

// button-mystery flags button `component-looks-custom` → its tokens render in
// custom-components.ts. The override reroutes button-mystery-radius, changing
// that recipe (the auto-mapping and the override both emit a `rounded` class,
// but to different slots — so the rendered text differs).
const sourceFile = () =>
  new File([JSON.stringify({ button: { mystery: { radius: { $value: 8, $type: "dimension" } } } })], "global.tokens.json", { type: "application/json" });
const overrideFile = () =>
  new File([JSON.stringify({ overrides: {
    "button-mystery-radius": { slot: "base", utilityType: "rounded", variantAxis: null, variantKey: null, statePrefix: null },
  } })], "slot-mapping.json", { type: "application/json" });

// button-padding-x is a normal slot token (button stays allow-list, renders in
// app.config.ts); a size sibling lets the imported defaultSize redirect it.
const sizeSourceFile = () =>
  new File([JSON.stringify({ button: { "padding-x": { $value: 8, $type: "dimension" }, "padding-x-lg": { $value: 16, $type: "dimension" } } })], "global.tokens.json", { type: "application/json" });
const defaultSizeFile = () =>
  new File([JSON.stringify({ components: { button: { defaultSize: "sm" } } })], "slot-mapping.json", { type: "application/json" });

async function exportEntry(files: File[], name: string): Promise<string | undefined> {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: files, configurable: true });
  await input.trigger("change");
  await flushAll();
  await wrapper.find('[data-testid="download-all"]').trigger("click");
  return captured.entries.find((e) => e.name === name)?.data;
}

afterEach(() => { vi.unstubAllGlobals(); captured.entries = []; });

describe("App export reflects resolves", () => {
  it("the exported custom-components.ts reflects the applied resolve override", async () => {
    const withOverride = await exportEntry([sourceFile(), overrideFile()], "nuxt/custom-components.ts");
    const without = await exportEntry([sourceFile()], "nuxt/custom-components.ts");
    expect(withOverride).toBeDefined();
    expect(without).toBeDefined();
    // The override threads through downloadAll → customOutputText → the renderer,
    // so the exported recipe differs from the un-resolved one.
    expect(withOverride).not.toBe(without);
  });

  it("the exported runnable kit (kit/theme.ts) reflects the applied resolve override", async () => {
    // The kit renders allow-list components, so button-mystery-radius lands in
    // the kit theme directly (downloadAll → buildKitFiles(g, resolveOverride)).
    const withOverride = await exportEntry([sourceFile(), overrideFile()], "kit/theme.ts");
    const without = await exportEntry([sourceFile()], "kit/theme.ts");
    expect(withOverride).toBeDefined();
    expect(without).toBeDefined();
    expect(withOverride).not.toBe(without);
  });

  it("the bundle includes a generated REPORT.md health digest", async () => {
    const report = await exportEntry([sizeSourceFile()], "REPORT.md");
    expect(report).toBeDefined();
    expect(report).toContain("# Design System Health Report");
    expect(report).toContain("Deviations by owner");
  });

  it("the bundle includes a shadcn/globals.css theme", async () => {
    const css = await exportEntry([sizeSourceFile()], "shadcn/globals.css");
    expect(css).toBeDefined();
    expect(css).toContain(":root {");
    expect(css).toContain("@theme inline {");
  });

  it("the bundle includes the framework-agnostic tokens/ files", async () => {
    const css = await exportEntry([sizeSourceFile()], "tokens/variables.css");
    expect(css).toBeDefined();
    expect(css).toContain(":root {");
    expect(css).not.toContain("@theme");
    const json = await exportEntry([sizeSourceFile()], "tokens/tokens.json");
    expect(json).toBeDefined();
    expect(() => JSON.parse(json!)).not.toThrow();
  });

  it("the bundle includes a USAGE.md start-here guide", async () => {
    const usage = await exportEntry([sizeSourceFile()], "USAGE.md");
    expect(usage).toBeDefined();
    expect(usage).toContain("# Using this export");
    expect(usage).toContain("shadcn/ui");
  });

  it("the exported app.config.ts reflects an imported defaultSizeByComponent", async () => {
    // Importing a slot-mapping.json with components.{defaultSize} captures it in
    // App state, and downloadAll's app.config render redirects the non-suffix
    // token to that size — so the exported config differs from the un-sized one.
    const withSize = await exportEntry([sizeSourceFile(), defaultSizeFile()], "nuxt/app.config.ts");
    const without = await exportEntry([sizeSourceFile()], "nuxt/app.config.ts");
    expect(withSize).toBeDefined();
    expect(without).toBeDefined();
    expect(withSize).not.toBe(without);
  });
});
