// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{
      id: "i1",
      category: "build-time",
      severity: "error",
      kind: "malformed-value",
      message: "malformed-value for foo (type=color)",
      tokenIds: ["foo"],
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView malformed-value hint", () => {
  it("renders the malformed hint for a malformed-value issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    const hint = w.find("[data-testid=malformed-hint]");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("$value");
  });

  it("renders the typo hint (not the malformed hint) for a possible-typo issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({ kind: "possible-typo", category: "data-quality", severity: "warning", message: "m", typoFrom: "heigth", typoTo: "height" }) }, global: { stubs } });
    expect(w.find("[data-testid=malformed-hint]").exists()).toBe(false);
    expect(w.find("[data-testid=typo-hint]").exists()).toBe(true);
  });

  it("renders no malformed hint for a non-data-quality issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({ kind: "capability-gap", category: "classification-hint", severity: "hint", message: "m" }) }, global: { stubs } });
    expect(w.find("[data-testid=malformed-hint]").exists()).toBe(false);
  });
});
