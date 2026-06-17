// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealSidebar from "./LiveRealSidebar.vue";

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

describe("LiveRealSidebar", () => {
  it("renders the sidebar anatomy with base + item slots sentinel-stamped", () => {
    const w = mount(LiveRealSidebar, { props: { graph: sidebarGraph(), customParts: parts } });
    const root = w.find('[data-testid="real-sidebar"]');
    expect(root.exists()).toBe(true);
    expect(root.classes()).toContain("ti-slot-base");
    const item = w.find('[data-testid="real-sidebar-item"]');
    expect(item.exists()).toBe(true);
    expect(item.classes()).toContain("ti-slot-item");
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealSidebar, { props: { graph: null, customParts: parts } });
    expect(w.find('[data-testid="real-sidebar"]').exists()).toBe(false);
    expect(w.text()).toContain("No sidebar recipe");
  });
});
