// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealSlotted from "./LiveRealSlotted.vue";
import RealVariantCell from "./RealVariantCell.vue";

function badgeGraph() {
  const global = { badge: { bg: { $value: "#3b82f6", $type: "color" } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

function cardGraph() {
  const global = { card: { bg: { $value: "#3b82f6", $type: "color" } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

const BadgeStub = {
  props: ["ui", "label"],
  template: '<span data-testid="real-slotted" :data-ui="JSON.stringify(ui)"></span>',
};
const mountOpts = { global: { stubs: { UBadge: BadgeStub } } };

const CardStub = {
  props: ["ui"],
  template: '<div data-testid="real-card"><slot /></div>',
};

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

  it("renders the default-slot content for components that declare one (card)", () => {
    const w = mount(LiveRealSlotted, {
      props: { graph: cardGraph(), componentName: "card" },
      global: { stubs: { UCard: CardStub } },
    });
    const el = w.find('[data-testid="real-card"]');
    expect(el.exists()).toBe(true);
    expect(el.text()).toContain("Card body");
  });
});

function disabledInputGraph() {
  const global = { input: { bg: { disabled: { $value: "#eeeeee", $type: "color" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const InputStub = {
  props: ["ui", "disabled", "modelValue"],
  template: '<input data-testid="real-input" :data-disabled="disabled" :data-ui="JSON.stringify(ui)" />',
};

describe("LiveRealSlotted — state cells", () => {
  it("renders a disabled cell with the real component disabled", () => {
    const w = mount(LiveRealSlotted, {
      props: { graph: disabledInputGraph(), componentName: "input" },
      global: { stubs: { UInput: InputStub } },
    });
    const inputs = w.findAll('[data-testid="real-input"]');
    expect(inputs.length).toBeGreaterThanOrEqual(2); // resting + disabled cell
    expect(inputs.some((i) => i.attributes("data-disabled") === "true")).toBe(true);
    expect(w.findAllComponents(RealVariantCell).length).toBeGreaterThanOrEqual(2);
  });
});
