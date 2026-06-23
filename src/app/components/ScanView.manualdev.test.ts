// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{
      id: "i1",
      category: "classification-hint",
      severity: "warning",
      kind: "custom-without-parts",
      message: "m",
      tokenIds: ["foo-bar"],
      componentName: "foo",
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView manual-dev badge", () => {
  it("renders the 🔧 hand-code badge for each manual-dev kind", () => {
    for (const kind of ["custom-without-parts", "disabled-via-opacity", "resting-shadowed-by-state"]) {
      const wrapper = mount(ScanView, { props: { report: reportWith({ kind }) }, global: { stubs } });
      const badge = wrapper.find("[data-testid=manual-dev]");
      expect(badge.exists(), kind).toBe(true);
      expect(badge.text()).toContain("hand-code");
    }
  });

  it("renders no manual-dev badge for a non-manual-dev issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "capability-gap" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=manual-dev]").exists()).toBe(false);
  });

  it("shows no by-design / figma-fix badge or Resolve button for a manual-dev issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "disabled-via-opacity" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=by-design]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=figma-fix]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
  });
});
