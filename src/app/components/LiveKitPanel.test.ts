// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveKitPanel from "./LiveKitPanel.vue";
import LiveRealButton from "./LiveRealButton.vue";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { radius: { $value: 8, $type: "number" }, bg: { $value: "#3b82f6", $type: "color" } } } },
  ];
  return buildGraph(sources);
}

// modal has anatomy → coverageFor returns non-null (button is not in COMPONENT_ANATOMY).
// Use a token id that routes to a curated slot: modal-content-bg → `content` slot.
function modalGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { modal: { content: { bg: { $value: "#ffffff", $type: "color" } } } } },
  ];
  return buildGraph(sources);
}

const STUBS = {
  LiveRealButton: true, LiveRealTable: true, LiveRealNav: true,
  LiveRealAccordion: true, LiveRealChip: true, LiveRealSidebar: true, LiveRealSlotted: true,
};

describe("LiveKitPanel", () => {
  it("renders the real-render child for a supported component (no placeholder)", () => {
    const w = mount(LiveKitPanel, { props: { graph: buttonGraph(), componentName: "button" }, global: { stubs: STUBS } });
    expect(w.find('[data-testid="kit-placeholder"]').exists()).toBe(false);
    expect(w.findComponent(LiveRealButton).exists()).toBe(true);
  });

  it("shows the Real-Render-folgt placeholder for modal and dropdown", () => {
    for (const name of ["modal", "dropdown"]) {
      const w = mount(LiveKitPanel, { props: { graph: buttonGraph(), componentName: name }, global: { stubs: STUBS } });
      expect(w.find('[data-testid="kit-placeholder"]').exists()).toBe(true);
    }
  });

  it("renders a coverage badge with an X/Y figure", () => {
    // modal has anatomy — coverageFor returns non-null with structuralTouched/structuralTotal.
    const w = mount(LiveKitPanel, { props: { graph: modalGraph(), componentName: "modal" }, global: { stubs: STUBS } });
    const badge = w.find('[data-testid="kit-coverage-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toMatch(/\d+\/\d+/);
  });

  it("defaults diagnostics off and toggles showDiagnostics on the child", async () => {
    const w = mount(LiveKitPanel, { props: { graph: buttonGraph(), componentName: "button" }, global: { stubs: STUBS } });
    const child = w.findComponent(LiveRealButton);
    expect(child.props("showDiagnostics")).toBe(false);
    await w.find('[data-testid="kit-diagnose-toggle"]').trigger("click");
    expect(child.props("showDiagnostics")).toBe(true);
  });
});
