// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveNav from "./LiveNav.vue";

function navGraph() {
  // variant-after-sub-element → variants.variant.{outline,ghost}.item (bucket B)
  const global = {
    nav: {
      "item-outline-text": { $value: "#52525B", $type: "color" },
      "item-ghost-text": { $value: "#71717A", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveNav", () => {
  it("shows a fallback message when the graph has no nav tokens", () => {
    const wrapper = mount(LiveNav, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="nav-item"]')).toHaveLength(0);
  });
  it("renders one item row per variant, each coloured from its token", () => {
    const wrapper = mount(LiveNav, { props: { graph: navGraph() }, ...mountOpts });
    const items = wrapper.findAll('[data-testid="nav-item"]');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect((item.element as HTMLElement).style.color).not.toBe("");
    }
  });
});
