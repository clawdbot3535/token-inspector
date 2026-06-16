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
    { slot: "link", classification: "structural", controls: "link: text, bg, hover", touched: false, tokenIds: [] },
    { slot: "item", classification: "optional", controls: "entry container: spacing", touched: true, tokenIds: ["nav-item-bg"] },
    { slot: "root", classification: "optional", controls: "navbar container: layout", touched: false, tokenIds: [] },
    { slot: "linkLabel", classification: "inherited", controls: "link text wrapper (follows link)", touched: true, tokenIds: [], inheritsFrom: "link" },
    { slot: "childLinkLabel", classification: "inherited", controls: "submenu link label (follows childLink)", touched: false, tokenIds: [], inheritsFrom: "childLink" },
  ],
  toDesign: [
    { slot: "link", classification: "structural", controls: "link: text, bg, hover", touched: false, tokenIds: [] },
    { slot: "root", classification: "optional", controls: "navbar container: layout", touched: false, tokenIds: [] },
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

  it("renders a covered slot as a button that emits select-tokens with its tokenIds", async () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    const item = w.find('[data-testid="coverage-slot"][data-slot="item"]');
    expect(item.element.tagName).toBe("BUTTON");
    await item.trigger("click");
    expect(w.emitted("select-tokens")?.[0]).toEqual([["nav-item-bg"]]);
  });

  it("renders an untouched slot as a non-button that emits nothing", async () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    const link = w.find('[data-testid="coverage-slot"][data-slot="link"]');
    expect(link.element.tagName).not.toBe("BUTTON");
    await link.trigger("click");
    expect(w.emitted("select-tokens")).toBeUndefined();
  });

  it("renders inherited slots in their own section with a parent tag", () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    const ll = w.find('[data-testid="coverage-slot"][data-slot="linkLabel"]');
    expect(ll.exists()).toBe(true);
    expect(ll.text()).toContain("inherits link");   // names the parent
    expect(ll.text()).toContain("✓");               // parent designed → covered
    const cll = w.find('[data-testid="coverage-slot"][data-slot="childLinkLabel"]');
    expect(cll.text()).toContain("inherits childLink");
    expect(cll.text()).toContain("↳");              // parent not designed → follows
  });

  it("does not list inherited slots under Optional", () => {
    const w = mount(CoverageView, { props: { coverage: navCoverage } });
    const optionalSection = w.findAll("section").find((s) => s.text().includes("Optional"))!;
    const optionalSlots = optionalSection
      .findAll('[data-testid="coverage-slot"]')
      .map((e) => e.attributes("data-slot"));
    expect(optionalSlots).not.toContain("linkLabel");
  });
});
