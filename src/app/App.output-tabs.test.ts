// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "./App.vue";

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

// UButton is a click-passthrough here so the clear-graph button works and its
// data-testid falls through (the real Nuxt UI UButton forwards attrs + click).
const mountOpts = {
  global: {
    stubs: {
      UApp: { template: "<div><slot /></div>" },
      UButton: { template: '<button v-bind="$attrs"><slot /></button>', inheritAttrs: false },
      UIcon: true,
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
// sidebar is a known-custom component -> non-empty custom output -> 3 tabs
const customFixtureFile = () =>
  fileFrom({
    sidebar: {
      bg: { $value: "#F4F4F5", $type: "color" },
      item: { text: { $value: "#52525B", $type: "color" } },
    },
  });
// plain component -> empty custom output -> 2 tabs
const plainFixtureFile = () =>
  fileFrom({ button: { bg: { $value: "#3b82f6", $type: "color" } } });

async function loadFile(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushAll();
}

async function mountLoaded(file: File) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("not found", { status: 404 })),
  );
  const wrapper = mount(App, mountOpts);
  await flushPromises();
  await loadFile(wrapper, file);
  return wrapper;
}

const tab = (wrapper: ReturnType<typeof mount>, name: string) =>
  wrapper.find(`[data-testid="tab-${name}"]`);

afterEach(() => vi.unstubAllGlobals());

describe("App output tabs — conditional custom tab", () => {
  it("shows the custom-components.ts tab for a custom-flagged component", async () => {
    const wrapper = await mountLoaded(customFixtureFile());
    expect(tab(wrapper, "tokens.css").exists()).toBe(true);
    expect(tab(wrapper, "app.config.ts").exists()).toBe(true);
    expect(tab(wrapper, "custom-components.ts").exists()).toBe(true);
  });

  it("hides the custom-components.ts tab for a plain component", async () => {
    const wrapper = await mountLoaded(plainFixtureFile());
    expect(tab(wrapper, "tokens.css").exists()).toBe(true);
    expect(tab(wrapper, "app.config.ts").exists()).toBe(true);
    expect(tab(wrapper, "custom-components.ts").exists()).toBe(false);
  });
});

describe("App output tabs — active-tab fallback watch", () => {
  it("resets the active tab to tokens.css when the active tab disappears", async () => {
    const wrapper = await mountLoaded(customFixtureFile());
    // select the custom tab
    await tab(wrapper, "custom-components.ts").trigger("click");
    expect(tab(wrapper, "custom-components.ts").attributes("aria-selected")).toBe("true");

    // clear the graph -> outputTabs shrinks to 2 -> watch fires
    await wrapper.find('[data-testid="clear-graph"]').trigger("click");
    await flushPromises();

    // reload a plain fixture (file input is back now that graph is null)
    await loadFile(wrapper, plainFixtureFile());

    // the custom tab is gone and the active tab fell back to tokens.css
    expect(tab(wrapper, "custom-components.ts").exists()).toBe(false);
    expect(tab(wrapper, "tokens.css").attributes("aria-selected")).toBe("true");
  });
});
