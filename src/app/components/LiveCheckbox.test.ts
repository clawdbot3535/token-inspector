// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveCheckbox from "./LiveCheckbox.vue";

function checkboxGraph() {
  const global = {
    checkbox: {
      bg: { $value: "#FFFFFF", $type: "color" },
      "bg-checked": { $value: "#4F63D2", $type: "color" },
      border: { $value: "#D4D4D8", $type: "color" },
      radius: { $value: 4, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveCheckbox", () => {
  it("shows a fallback message when the graph has no checkbox tokens", () => {
    const wrapper = mount(LiveCheckbox, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="checkbox-box"]')).toHaveLength(0);
  });
  it("renders an unchecked and a checked box whose background differs", () => {
    const wrapper = mount(LiveCheckbox, { props: { graph: checkboxGraph() }, ...mountOpts });
    const boxes = wrapper.findAll('[data-testid="checkbox-box"]');
    expect(boxes.length).toBe(2);
    const bgs = boxes.map((b) => (b.element as HTMLElement).style.backgroundColor);
    expect(bgs[0]).not.toBe(bgs[1]); // unchecked #FFFFFF vs checked #4F63D2, both inline (JIT-safe)
    expect(bgs.every((b) => b !== "")).toBe(true);
  });
  it("sizes the box from the size-md token", () => {
    const global = {
      checkbox: {
        bg: { $value: "#FFFFFF", $type: "color" },
        "bg-checked": { $value: "#4F63D2", $type: "color" },
        "size-md": { $value: 18, $type: "number" },
      },
    };
    const sources: SourceFile[] = [{ name: "global", data: global }];
    const wrapper = mount(LiveCheckbox, { props: { graph: buildGraph(sources) }, ...mountOpts });
    const box = wrapper.find('[data-testid="checkbox-box"]');
    expect((box.element as HTMLElement).style.width).toBe("18px");
    expect((box.element as HTMLElement).style.height).toBe("18px");
  });
});
