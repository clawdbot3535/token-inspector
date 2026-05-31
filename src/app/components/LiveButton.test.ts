// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveButton from "./LiveButton.vue";

// Minimal button graph: padding-y scales per size (4/8/10px → py-1/py-2/py-2.5).
// This is the exact shape that exposed the JIT-class bug — py-2.5 (lg) rendered
// nothing until extractArbitrary resolved scale classes to inline styles.
function buttonGraph() {
  const global = {
    button: {
      "padding-y-sm": { $value: 4, $type: "number" },
      "padding-y-md": { $value: 8, $type: "number" },
      "padding-y-lg": { $value: 10, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

// UIcon is an app-global auto-import; stub it so mounting doesn't need the
// Nuxt UI plugin.
const mountOpts = { global: { stubs: { UIcon: true } } };

function previewButtons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll("button").filter((b) => b.text() === "Button");
}

describe("LiveButton", () => {
  it("shows a fallback message and no preview when the graph has no button tokens", () => {
    const wrapper = mount(LiveButton, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(previewButtons(wrapper)).toHaveLength(0);
  });

  it("renders size variants with distinct inline padding (JIT-class regression)", () => {
    const wrapper = mount(LiveButton, {
      props: { graph: buttonGraph() },
      ...mountOpts,
    });
    const buttons = previewButtons(wrapper);
    expect(buttons.length).toBeGreaterThanOrEqual(3);

    const paddings = new Set(buttons.map((b) => b.element.style.paddingTop));
    // sm=py-1 (0.25rem), md=py-2 (0.5rem), lg=py-2.5 (0.625rem) — all inline,
    // none left to the JIT. 0.625rem is the lg value that used to vanish.
    expect(paddings.has("0.625rem")).toBe(true);
    expect(paddings.size).toBeGreaterThanOrEqual(3);
  });

  it("resizes the state-row buttons when the size switcher is clicked", async () => {
    const wrapper = mount(LiveButton, {
      props: { graph: buttonGraph() },
      ...mountOpts,
    });
    // The size switcher buttons carry the bare size label.
    const lgSwitch = wrapper
      .findAll("button")
      .find((b) => b.text() === "lg");
    expect(lgSwitch).toBeDefined();
    await lgSwitch!.trigger("click");

    // After switching to lg, at least one preview button must carry the lg
    // padding (py-2.5 → 0.625rem) — proving the switch drives the cells.
    const paddings = previewButtons(wrapper).map((b) => b.element.style.paddingTop);
    expect(paddings.filter((p) => p === "0.625rem").length).toBeGreaterThanOrEqual(2);
  });
});
