// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveAccordion from "./LiveAccordion.vue";

function accordionGraph() {
  const global = {
    accordion: {
      "item-text": { $value: "#52525B", $type: "color" },
      "item-padding-y": { $value: 14, $type: "number" },
      "item-border": { $value: "#E4E4E7", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveAccordion", () => {
  it("shows a fallback message when the graph has no accordion tokens", () => {
    const wrapper = mount(LiveAccordion, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="accordion-item"]')).toHaveLength(0);
  });
  it("renders default and disabled item rows styled from tokens", () => {
    const wrapper = mount(LiveAccordion, { props: { graph: accordionGraph() }, ...mountOpts });
    const items = wrapper.findAll('[data-testid="accordion-item"]');
    expect(items).toHaveLength(2);
    expect((items[0]!.element as HTMLElement).style.color).not.toBe("");
  });
});
