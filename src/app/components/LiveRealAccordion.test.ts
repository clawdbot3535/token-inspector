// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealAccordion from "./LiveRealAccordion.vue";

function accGraph() {
  const global = { accordion: { item: { radius: { $value: 8, $type: "number" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const AccStub = {
  props: ["items", "ui", "defaultValue"],
  template: '<div data-testid="real-uaccordion" :data-ui="JSON.stringify(ui)" :data-open="defaultValue"></div>',
};
const mountOpts = { global: { stubs: { UAccordion: AccStub, UIcon: true } } };

describe("LiveRealAccordion", () => {
  it("renders a real UAccordion with sentinel slots and force-opens a panel", () => {
    const w = mount(LiveRealAccordion, { props: { graph: accGraph(), componentName: "accordion" }, ...mountOpts });
    const el = w.find('[data-testid="real-uaccordion"]');
    const ui = JSON.parse(el.attributes("data-ui") ?? "{}");
    expect(ui.item).toContain("ti-slot-item");
    expect(el.attributes("data-open")).toBe("a");
  });
  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealAccordion, { props: { graph: null, componentName: "accordion" }, ...mountOpts });
    expect(w.find('[data-testid="real-uaccordion"]').exists()).toBe(false);
  });
});
