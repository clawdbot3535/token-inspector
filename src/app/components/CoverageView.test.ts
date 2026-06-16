// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CoverageView from "./CoverageView.vue";
import type { ComponentCoverage } from "@core/coverage.js";

const navCoverage: ComponentCoverage = {
  component: "nav",
  structuralTotal: 1,
  structuralTouched: 0,
  slots: [
    { slot: "link", classification: "structural", controls: "link: text, bg, hover", touched: false },
    { slot: "item", classification: "optional", controls: "entry container: spacing", touched: true },
    { slot: "root", classification: "optional", controls: "navbar container: layout", touched: false },
  ],
  toDesign: [
    { slot: "link", classification: "structural", controls: "link: text, bg, hover", touched: false },
    { slot: "root", classification: "optional", controls: "navbar container: layout", touched: false },
  ],
};

describe("CoverageView", () => {
  it("shows the structural count header", () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    expect(w.find('[data-testid="coverage-view"]').exists()).toBe(true);
    expect(w.text()).toContain("0/1 structural");
  });

  it("flags a missing structural slot with a to-design tag", () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    const link = w.find('[data-testid="coverage-slot"][data-slot="link"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes("data-touched")).toBe("false");
    expect(link.text()).toContain("to design");
  });

  it("renders optional slots too (touched and untouched)", () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    expect(w.find('[data-testid="coverage-slot"][data-slot="item"]').attributes("data-touched")).toBe("true");
    expect(w.find('[data-testid="coverage-slot"][data-slot="root"]').attributes("data-touched")).toBe("false");
  });
});
