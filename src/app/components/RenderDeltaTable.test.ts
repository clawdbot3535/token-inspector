// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RenderDeltaTable from "./RenderDeltaTable.vue";
import type { RenderDelta } from "../render-diff.js";

const deltas: RenderDelta[] = [
  { property: "backgroundColor", expected: "rgb(86, 103, 167)", actual: "rgb(86, 103, 167)", match: true },
  { property: "borderRadius", expected: "8px", actual: "4px", match: false },
];

describe("RenderDeltaTable", () => {
  it("renders one row per delta with expected/actual + a marker", () => {
    const w = mount(RenderDeltaTable, { props: { deltas } });
    const rows = w.findAll('[data-testid="render-delta"]');
    expect(rows).toHaveLength(2);
    const radius = w.find('[data-testid="render-delta"][data-property="borderRadius"]');
    expect(radius.attributes("data-match")).toBe("false");
    expect(radius.text()).toContain("8px");
    expect(radius.text()).toContain("4px");
    expect(radius.text()).toContain("✗");
  });

  it("shows an N/M match headline", () => {
    const w = mount(RenderDeltaTable, { props: { deltas } });
    expect(w.find('[data-testid="render-diff"]').text()).toContain("1/2");
  });

  it("prefixes the headline with the slot label when given", () => {
    const w = mount(RenderDeltaTable, { props: { deltas, label: "th" } });
    expect(w.find('[data-testid="render-diff"]').text()).toContain("th · 1/2 match");
  });

  it("renders nothing for an empty delta list", () => {
    const w = mount(RenderDeltaTable, { props: { deltas: [] } });
    expect(w.findAll('[data-testid="render-delta"]')).toHaveLength(0);
    expect(w.find('[data-testid="render-diff"]').exists()).toBe(false);
  });
});
