// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealSlotted from "./LiveRealSlotted.vue";

function badgeGraph() {
  const global = { badge: { bg: { $value: "#3b82f6", $type: "color" } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

const BadgeStub = {
  props: ["ui", "label"],
  template: '<span data-testid="real-slotted" :data-ui="JSON.stringify(ui)"></span>',
};
const mountOpts = { global: { components: { UBadge: BadgeStub } } };

describe("LiveRealSlotted", () => {
  it("mounts the registry tag and stamps populated slots with sentinels in :ui", () => {
    const w = mount(LiveRealSlotted, { props: { graph: badgeGraph(), componentName: "badge" }, ...mountOpts });
    const el = w.find('[data-testid="real-slotted"]');
    expect(el.exists()).toBe(true);
    const ui = JSON.parse(el.attributes("data-ui") ?? "{}");
    expect(Object.values(ui).join(" ")).toContain("ti-slot-");
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealSlotted, { props: { graph: null, componentName: "badge" }, ...mountOpts });
    expect(w.find('[data-testid="real-slotted"]').exists()).toBe(false);
    expect(w.text()).toContain("No badge recipe");
  });
});
