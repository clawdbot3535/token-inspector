// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealNav from "./LiveRealNav.vue";

function navGraph() {
  const global = { nav: { item: { radius: { $value: 8, $type: "number" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const NavStub = {
  props: ["items", "ui"],
  template: '<nav data-testid="real-unav" :data-ui="JSON.stringify(ui)"></nav>',
};
const mountOpts = { global: { stubs: { UNavigationMenu: NavStub, UIcon: true } } };

describe("LiveRealNav", () => {
  it("renders a real UNavigationMenu with sentinel-stamped populated slots", () => {
    const w = mount(LiveRealNav, { props: { graph: navGraph(), componentName: "nav" }, ...mountOpts });
    const ui = JSON.parse(w.find('[data-testid="real-unav"]').attributes("data-ui") ?? "{}");
    expect(ui.item).toContain("ti-slot-item");
    expect(ui.item.length).toBeGreaterThan("ti-slot-item".length);
  });
  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealNav, { props: { graph: null, componentName: "nav" }, ...mountOpts });
    expect(w.find('[data-testid="real-unav"]').exists()).toBe(false);
  });
});
