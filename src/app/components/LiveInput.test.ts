// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveInput from "./LiveInput.vue";

// Minimal input graph exercising state-prefixed border colors + an arbitrary
// height. Distinct per-state border colors prove each state cell resolves its
// own promoted classes to inline styles (the JIT-class regression guard).
function inputGraph() {
  const global = {
    input: {
      border: { $value: "#D4D4D8", $type: "color" },
      "border-hover": { $value: "#A1A1AA", $type: "color" },
      "border-focus": { $value: "#3B82F6", $type: "color" },
      "bg-disabled": { $value: "#F4F4F5", $type: "color" },
      "border-disabled": { $value: "#E4E4E7", $type: "color" },
      height: { $value: 36, $type: "number" },
      "padding-x": { $value: 6, $type: "number" },
      "padding-y": { $value: 8, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

// UIcon is an app-global auto-import; stub it so mounting needs no Nuxt UI plugin.
const mountOpts = { global: { stubs: { UIcon: true } } };

function previewInputs(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll("input");
}

describe("LiveInput", () => {
  it("shows a fallback message and no preview when the graph has no input tokens", () => {
    const wrapper = mount(LiveInput, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(previewInputs(wrapper)).toHaveLength(0);
  });

  it("renders one input per state with inline border/height (JIT-class regression)", () => {
    const wrapper = mount(LiveInput, { props: { graph: inputGraph() }, ...mountOpts });
    const inputs = previewInputs(wrapper);
    // default / hover / focus / disabled
    expect(inputs.length).toBe(4);

    // height-[36px] resolves to an inline style on every cell, not the JIT.
    expect(inputs.every((i) => i.element.style.height === "36px")).toBe(true);

    // Each state promotes its own border color → distinct inline borderColor.
    const borderColors = new Set(inputs.map((i) => i.element.style.borderColor));
    expect(borderColors.size).toBeGreaterThanOrEqual(3);
  });

  it("applies the disabled opacity/cursor cue to the disabled cell only", () => {
    const wrapper = mount(LiveInput, { props: { graph: inputGraph() }, ...mountOpts });
    const inputs = previewInputs(wrapper);
    const dimmed = inputs.filter((i) => i.element.style.opacity === "0.6");
    expect(dimmed).toHaveLength(1);
    expect(dimmed[0]!.element.style.cursor).toBe("not-allowed");
  });

  it("offsets inputs and renders a leading icon when an icon-size token exists", () => {
    const global = {
      input: {
        border: { $value: "#D4D4D8", $type: "color" },
        height: { $value: 36, $type: "number" },
        "icon-size-md": { $value: 16, $type: "number" },
      },
    };
    const sources: SourceFile[] = [{ name: "global", data: global }];
    const wrapper = mount(LiveInput, { props: { graph: buildGraph(sources) }, ...mountOpts });
    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((i) => i.classes().includes("pl-7"))).toBe(true);
  });
});
