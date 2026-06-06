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

// A button graph whose outline variant defines an opaque border — D2c routes
// it to ring-color, so the outline preview button must paint a ring (boxShadow).
function outlineBorderGraph() {
  const global = {
    button: {
      solid: { bg: { $value: { components: [0.31, 0.39, 0.82], hex: "#4F63D2" }, $type: "color" } },
      outline: { border: { $value: { components: [0.31, 0.39, 0.82], hex: "#4F63D2" }, $type: "color" } },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

describe("LiveButton", () => {
  it("shows a fallback message and no preview when the graph has no button tokens", () => {
    const wrapper = mount(LiveButton, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(previewButtons(wrapper)).toHaveLength(0);
  });

  it("renders the active size's padding inline (JIT-class regression)", () => {
    const wrapper = mount(LiveButton, { props: { graph: buttonGraph() }, ...mountOpts });
    const buttons = previewButtons(wrapper);
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    // default active size md → py-2 (0.5rem), resolved inline, not left to the JIT.
    expect(buttons.every((b) => b.element.style.paddingTop === "0.5rem")).toBe(true);
  });

  it("shows a size switch button per recipe size", () => {
    const wrapper = mount(LiveButton, { props: { graph: buttonGraph() }, ...mountOpts });
    // buttonGraph defines padding-y-sm/md/lg → sizes sm, md, lg.
    expect(wrapper.findAll('[data-testid="button-size-switch"]').length).toBe(3);
  });

  it("shows the active size's completeness score in the header", () => {
    const wrapper = mount(LiveButton, {
      props: {
        graph: buttonGraph(),
        completeness: [
          {
            component: "button",
            axis: "size",
            variantKey: "md",
            defined: 2,
            total: 3,
            missingUtilities: [],
          },
        ],
      },
      ...mountOpts,
    });
    expect(wrapper.text()).toContain("2/3");
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

describe("LiveButton — D2c outline ring", () => {
  it("paints a ring (boxShadow) on the outline variant preview", () => {
    const wrapper = mount(LiveButton, {
      props: { graph: outlineBorderGraph() },
      ...mountOpts,
    });
    const ringed = previewButtons(wrapper).some(
      (b) => b.element.style.boxShadow.length > 0,
    );
    expect(ringed).toBe(true);
  });
});

// border-width=1 (resting) + ring-width=2 (focus) + an outline border colour.
// D2e: resting ring composes to 1px, focus ring to 2px.
function widthGraph() {
  const global = {
    button: {
      "border-width": { $value: 1, $type: "number" },
      "ring-width": { $value: 2, $type: "number" },
      outline: { border: { $value: { components: [0.31, 0.39, 0.82], hex: "#4F63D2" }, $type: "color" } },
      "outline-ring-focus": { $value: { components: [0.44, 0.51, 0.76], hex: "#6F82C2" }, $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

describe("LiveButton — D2e ring widths", () => {
  it("resting outline ring is 1px (border-width), focus ring is 2px (ring-width)", () => {
    const wrapper = mount(LiveButton, { props: { graph: widthGraph() }, ...mountOpts });
    const shadows = previewButtons(wrapper).map((b) => b.element.style.boxShadow);
    // Some preview cell paints a 1px resting ring; some (the focus state cell) a 2px ring.
    expect(shadows.some((s) => s.startsWith("0 0 0 1px"))).toBe(true);
    expect(shadows.some((s) => s.startsWith("0 0 0 2px"))).toBe(true);
  });
});
