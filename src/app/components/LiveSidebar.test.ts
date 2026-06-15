// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveSidebar from "./LiveSidebar.vue";

function sidebarGraph() {
  const global = {
    sidebar: {
      bg: { $value: "#F4F4F5", $type: "color" },
      border: { $value: "#E4E4E7", $type: "color" },
      "item-text": { $value: "#52525B", $type: "color" },
      "item-bg-hover": { $value: "#E4E4E7", $type: "color" },
      "item-padding": { $value: 6, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const parts = new Map<string, readonly string[]>([["sidebar", ["item"]]]);
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveSidebar", () => {
  it("shows a fallback message when the graph has no sidebar tokens", () => {
    const wrapper = mount(LiveSidebar, { props: { graph: null, customParts: parts }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="sidebar-root"]')).toHaveLength(0);
  });
  it("renders a panel with item rows styled from tokens", () => {
    const wrapper = mount(LiveSidebar, { props: { graph: sidebarGraph(), customParts: parts }, ...mountOpts });
    const root = wrapper.find('[data-testid="sidebar-root"]');
    expect(root.exists()).toBe(true);
    expect((root.element as HTMLElement).style.backgroundColor).not.toBe("");
    expect(wrapper.findAll('[data-testid="sidebar-item"]')).toHaveLength(3);
  });
});
