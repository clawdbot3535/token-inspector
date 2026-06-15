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

// --- jsdom shims (same gaps as App.test.ts / App.preview-routing.test.ts) ---
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

const themeButton = (wrapper: Awaited<ReturnType<typeof mountLoaded>>, label: "light" | "dark") =>
  wrapper.findAll("button").find((b) => b.text().trim() === label)!;

afterEach(() => vi.unstubAllGlobals());

describe("App view state — theme toggle", () => {
  it("toggles the document root dark/light class both ways", async () => {
    const wrapper = await mountLoaded();
    const root = document.documentElement;

    await themeButton(wrapper, "dark").trigger("click");
    await flushPromises();
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("light")).toBe(false);

    await themeButton(wrapper, "light").trigger("click");
    await flushPromises();
    expect(root.classList.contains("light")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
  });
});

describe("App view state — live filter chip", () => {
  it("flips aria-pressed on each click", async () => {
    const wrapper = await mountLoaded();
    const chip = wrapper.find('[data-testid="live-filter"]');
    expect(chip.attributes("aria-pressed")).toBe("false");
    await chip.trigger("click");
    expect(chip.attributes("aria-pressed")).toBe("true");
    await chip.trigger("click");
    expect(chip.attributes("aria-pressed")).toBe("false");
  });
});

describe("App view state — output tabs", () => {
  it("switches the selected tab both ways", async () => {
    const wrapper = await mountLoaded();
    const css = () => wrapper.find('[data-testid="tab-tokens.css"]');
    const cfg = () => wrapper.find('[data-testid="tab-app.config.ts"]');
    expect(css().exists()).toBe(true);
    expect(cfg().exists()).toBe(true);
    // exactly one selected initially
    const selectedInitially = [css(), cfg()].filter(
      (t) => t.attributes("aria-selected") === "true",
    );
    expect(selectedInitially).toHaveLength(1);

    await cfg().trigger("click");
    expect(cfg().attributes("aria-selected")).toBe("true");
    expect(css().attributes("aria-selected")).toBe("false");

    await css().trigger("click");
    expect(css().attributes("aria-selected")).toBe("true");
    expect(cfg().attributes("aria-selected")).toBe("false");
  });
});

describe("App view state — selection auto-switches output tab", () => {
  it("switches to app.config.ts when a component-layer node is selected", async () => {
    const wrapper = await mountLoaded();
    // start from a known non-app.config.ts tab
    await wrapper.find('[data-testid="tab-tokens.css"]').trigger("click");
    expect(wrapper.find('[data-testid="tab-tokens.css"]').attributes("aria-selected")).toBe("true");

    wrapper.findComponent(ComponentTree).vm.$emit("select", "button-bg");
    await flushPromises();

    expect(wrapper.find('[data-testid="tab-app.config.ts"]').attributes("aria-selected")).toBe("true");
  });
});
