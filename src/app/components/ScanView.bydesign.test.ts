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
      kind: "state-via-prop",
      message: "m",
      tokenIds: ["alert-success-border"],
      componentName: "alert",
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView by-design badge", () => {
  it("renders the ⊘ by-design badge for each capability-family kind", () => {
    for (const kind of ["capability-gap", "state-via-prop", "unsupported-state"]) {
      const wrapper = mount(ScanView, { props: { report: reportWith({ kind }) }, global: { stubs } });
      const badge = wrapper.find("[data-testid=by-design]");
      expect(badge.exists(), kind).toBe(true);
      expect(badge.text()).toContain("by-design");
    }
  });

  it("renders no by-design badge for a non-by-design issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "possible-typo" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=by-design]").exists()).toBe(false);
  });

  it("shows no Resolve button or ✓ resolved for a by-design issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "unsupported-state" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=resolve-done]").exists()).toBe(false);
  });
});
