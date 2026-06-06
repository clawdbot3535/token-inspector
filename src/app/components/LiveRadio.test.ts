// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRadio from "./LiveRadio.vue";

function radioGraph() {
  const global = {
    radio: {
      bg: { $value: "#FFFFFF", $type: "color" },
      "bg-checked": { $value: "#4F63D2", $type: "color" },
      border: { $value: "#D4D4D8", $type: "color" },
      radius: { $value: 9999, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveRadio", () => {
  it("shows a fallback message when the graph has no radio tokens", () => {
    const wrapper = mount(LiveRadio, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="radio-box"]')).toHaveLength(0);
  });
  it("renders an unchecked and a checked circle whose background differs", () => {
    const wrapper = mount(LiveRadio, { props: { graph: radioGraph() }, ...mountOpts });
    const boxes = wrapper.findAll('[data-testid="radio-box"]');
    expect(boxes.length).toBe(2);
    const bgs = boxes.map((b) => (b.element as HTMLElement).style.backgroundColor);
    expect(bgs[0]).not.toBe(bgs[1]);
    // radio-radius (9999) resolves to an inline borderRadius (round).
    expect((boxes[0]!.element as HTMLElement).style.borderRadius).not.toBe("");
  });
});
