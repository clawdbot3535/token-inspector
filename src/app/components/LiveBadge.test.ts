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

// Same two colours but only one size (md) — exercises the "no switcher" path.
function badgeGraphOneSize() {
  const global = {
    badge: {
      radius: { $value: 2, $type: "number" },
      "default-bg": { $value: "#F4F4F5", $type: "color" },
      "default-border": { $value: "#D4D4D8", $type: "color" },
      "default-text": { $value: "#52525B", $type: "color" },
      "error-bg": { $value: "#FEE2E2", $type: "color" },
      "error-border": { $value: "#EF4444", $type: "color" },
      "error-text": { $value: "#991B1B", $type: "color" },
      "padding-x-md": { $value: 6, $type: "number" },
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

  it("renders one colour row for the active size, with a size switcher", () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    const cells = wrapper.findAll('[data-testid="badge-cell"]');
    // One row → one cell per colour (2), NOT colours×sizes.
    expect(cells.length).toBe(2);
    expect(cells.every((c) => c.element.tagName === "SPAN")).toBe(true);
    // Two sizes (sm, md) → two switch buttons.
    expect(wrapper.findAll('[data-testid="badge-size-switch"]').length).toBe(2);
  });

  it("switches the rendered size when another size button is clicked", async () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    const before = (wrapper.find('[data-testid="badge-cell"]').element as HTMLElement).style.fontSize;
    const buttons = wrapper.findAll('[data-testid="badge-size-switch"]');
    // default active size is md; click the other (sm).
    const sm = buttons.find((b) => b.text() === "sm")!;
    await sm.trigger("click");
    const after = (wrapper.find('[data-testid="badge-cell"]').element as HTMLElement).style.fontSize;
    // sm vs md carry different font-size tokens (8px vs 10px) — extractArbitrary puts them in style.
    expect(after).not.toBe(before);
  });

  it("shows no switcher when the recipe has a single size", () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraphOneSize() }, ...mountOpts });
    expect(wrapper.findAll('[data-testid="badge-size-switch"]')).toHaveLength(0);
    // The colour row still renders.
    expect(wrapper.findAll('[data-testid="badge-cell"]').length).toBe(2);
  });

  it("falls back to the first available size when the selected size leaves the recipe", async () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    expect(wrapper.findAll('[data-testid="badge-size-switch"]').length).toBe(2);
    // Swap to a single-size graph — the previously-active size set changes.
    await wrapper.setProps({ graph: badgeGraphOneSize() });
    // activeSize guard must not throw; the colour row still renders, switcher gone.
    expect(wrapper.findAll('[data-testid="badge-size-switch"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="badge-cell"]').length).toBeGreaterThan(0);
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
