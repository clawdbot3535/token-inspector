// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealAccordion from "./LiveRealAccordion.vue";
import RealVariantCell from "./RealVariantCell.vue";

function accGraph() {
  const global = { accordion: { item: { radius: { $value: 8, $type: "number" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

// accordion-item-text-opened → data-[state=open]:text-[…] (mirrors the live export token)
function accOpenGraph() {
  const global = { accordion: { item: { text: { opened: { $value: "#ffffff", $type: "color" } } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

const AccStub = {
  props: ["items", "ui", "defaultValue"],
  template: '<div data-testid="real-uaccordion" :data-ui="JSON.stringify(ui)" :data-open="defaultValue"></div>',
};
const mountOpts = { global: { stubs: { UAccordion: AccStub, UIcon: true } } };

describe("LiveRealAccordion", () => {
  it("renders a closed resting cell with sentinel slots (no open token → no open cell)", () => {
    const w = mount(LiveRealAccordion, { props: { graph: accGraph(), componentName: "accordion" }, ...mountOpts });
    const els = w.findAll('[data-testid="real-uaccordion"]');
    expect(els.length).toBe(1); // resting only — the radius-only recipe carries no data-[state=open]:
    const ui = JSON.parse(els[0]!.attributes("data-ui") ?? "{}");
    expect(ui.item).toContain("ti-slot-item");
    expect(els[0]!.attributes("data-open")).toBeUndefined(); // closed baseline (no default-value)
  });

  it("renders a closed resting cell and an open cell when the recipe has data-[state=open]: classes", () => {
    const w = mount(LiveRealAccordion, { props: { graph: accOpenGraph(), componentName: "accordion" }, ...mountOpts });
    const els = w.findAll('[data-testid="real-uaccordion"]');
    expect(els.length).toBeGreaterThanOrEqual(2); // resting hero + open cell
    expect(els.some((e) => e.attributes("data-open") === undefined)).toBe(true); // closed resting
    expect(els.some((e) => e.attributes("data-open") === "a")).toBe(true); // open cell force-opens panel "a"
    // Resting renders as the hero (outside KitMatrix); the open state cell routes through KitMatrix's RealVariantCell.
    expect(w.findAllComponents(RealVariantCell).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealAccordion, { props: { graph: null, componentName: "accordion" }, ...mountOpts });
    expect(w.find('[data-testid="real-uaccordion"]').exists()).toBe(false);
  });
});
