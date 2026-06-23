// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{
      id: "i1",
      category: "data-quality",
      severity: "warning",
      kind: "asymmetric-variant-coverage",
      message: "m",
      tokenIds: ["button-outline-border"],
      componentName: "button",
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView figma-fix badge", () => {
  it("renders the 🎨 fix in Figma badge for each coverage-gap kind", () => {
    for (const kind of [
      "asymmetric-variant-coverage",
      "asymmetric-size-coverage",
      "incomplete-size-variant",
      "non-suffix-vs-size-conflict",
      "orphaned-size-key",
    ]) {
      const wrapper = mount(ScanView, { props: { report: reportWith({ kind }) }, global: { stubs } });
      const badge = wrapper.find("[data-testid=figma-fix]");
      expect(badge.exists(), kind).toBe(true);
      expect(badge.text()).toContain("fix in Figma");
    }
  });

  it("renders no figma-fix badge for a non-figma-fix issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "capability-gap" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=figma-fix]").exists()).toBe(false);
  });

  it("shows no by-design badge or Resolve button for a figma-fix issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "incomplete-size-variant" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=by-design]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
  });
});
