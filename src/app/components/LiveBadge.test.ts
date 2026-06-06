// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveBadge from "./LiveBadge.vue";

// Minimal badge graph: two colour roles (default, error) each with bg/border/text,
// across two sizes (sm, md). Mirrors the real colour×size badge recipe shape.
function badgeGraph() {
  const global = {
    badge: {
      radius: { $value: 2, $type: "number" },
      "default-bg": { $value: "#F4F4F5", $type: "color" },
      "default-border": { $value: "#D4D4D8", $type: "color" },
      "default-text": { $value: "#52525B", $type: "color" },
      "error-bg": { $value: "#FEE2E2", $type: "color" },
      "error-border": { $value: "#EF4444", $type: "color" },
      "error-text": { $value: "#991B1B", $type: "color" },
      "padding-x-sm": { $value: 4, $type: "number" },
      "padding-x-md": { $value: 6, $type: "number" },
      "font-size-sm": { $value: 8, $type: "number" },
      "font-size-md": { $value: 10, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveBadge", () => {
  it("shows a fallback message and no badge cells when the graph has no badge tokens", () => {
    const wrapper = mount(LiveBadge, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="badge-cell"]')).toHaveLength(0);
  });

  it("renders a colour×size matrix of <span> badges (one per colour per size)", () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    const cells = wrapper.findAll('[data-testid="badge-cell"]');
    // 2 colours (default, error) × 2 sizes (sm, md)
    expect(cells.length).toBe(4);
    expect(cells.every((c) => c.element.tagName === "SPAN")).toBe(true);
    // One size-label per size row.
    expect(wrapper.findAll('[data-testid="badge-size-label"]').length).toBe(2);
  });

  it("resolves the real CSS border to inline styles (JIT-class regression guard)", () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    const cells = wrapper.findAll('[data-testid="badge-cell"]');
    // badge uses a real border (not a ring); extractArbitrary sets borderColor and
    // the preflight compensation adds a visible 1px solid border.
    expect(
      cells.some(
        (c) =>
          (c.element as HTMLElement).style.borderStyle === "solid" &&
          (c.element as HTMLElement).style.borderColor !== "",
      ),
    ).toBe(true);
  });
});
