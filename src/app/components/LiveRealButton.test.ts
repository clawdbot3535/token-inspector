// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealButton from "./LiveRealButton.vue";
import RealVariantCell from "./RealVariantCell.vue";

function buttonGraph() {
  const global = {
    button: {
      radius: { $value: 8, $type: "number" },
      bg: { $value: "#3b82f6", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

// Capture the :ui prop the real UButton would receive.
const UButtonStub = {
  props: ["ui", "variant", "size", "disabled"],
  template:
    '<button data-testid="real-ubutton" :data-variant="variant" :data-disabled="disabled" :data-ui="JSON.stringify(ui)"><slot /></button>',
};
const mountOpts = { global: { stubs: { UButton: UButtonStub, UIcon: true } } };

describe("LiveRealButton", () => {
  it("renders a real UButton and passes the generated recipe's base classes via :ui", () => {
    const w = mount(LiveRealButton, {
      props: { graph: buttonGraph(), componentName: "button" },
      ...mountOpts,
    });
    const btn = w.find('[data-testid="real-ubutton"]');
    expect(btn.exists()).toBe(true);
    const ui = JSON.parse(btn.attributes("data-ui") ?? "{}");
    expect(typeof ui.base).toBe("string");
    expect(ui.base.length).toBeGreaterThan(0); // carries the generated recipe classes
  });

  it("shows a fallback (no UButton) when the graph is null", () => {
    const w = mount(LiveRealButton, {
      props: { graph: null, componentName: "button" },
      ...mountOpts,
    });
    expect(w.find('[data-testid="real-ubutton"]').exists()).toBe(false);
  });
});

function variantButtonGraph() {
  const global = {
    button: {
      radius: { $value: 6, $type: "number" },
      solid: { bg: { $value: "#3b82f6", $type: "color" } },
      ghost: { bg: { $value: "#000000", $type: "color" } },
    },
  };
  return buildGraph([{ name: "global", data: global }]);
}

describe("LiveRealButton — variant cells", () => {
  it("renders a RealVariantCell per variant key, each carrying the variant prop", () => {
    const w = mount(LiveRealButton, {
      props: { graph: variantButtonGraph(), componentName: "button" },
      ...mountOpts,
    });
    expect(w.findAllComponents(RealVariantCell).length).toBeGreaterThanOrEqual(2); // solid + ghost
    expect(w.findAll('[data-testid="real-ubutton"]').length).toBeGreaterThanOrEqual(2);
    // Each cell forwards its variant key as the real Nuxt `variant` prop (cell.props).
    const variants = w.findAll('[data-testid="real-ubutton"]').map((b) => b.attributes("data-variant"));
    expect(variants).toEqual(expect.arrayContaining(["solid", "ghost"]));
  });
});

function disabledButtonGraph() {
  const global = { button: { bg: { disabled: { $value: "#eeeeee", $type: "color" } } } };
  return buildGraph([{ name: "global", data: global }]);
}

describe("LiveRealButton — disabled cell", () => {
  it("renders a disabled RealVariantCell with the button disabled", () => {
    const w = mount(LiveRealButton, { props: { graph: disabledButtonGraph(), componentName: "button" }, ...mountOpts });
    const disabledBtns = w.findAll('[data-testid="real-ubutton"]').filter((b) => b.attributes("data-disabled") === "true");
    expect(disabledBtns.length).toBeGreaterThanOrEqual(1);
  });
});
