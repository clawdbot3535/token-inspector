// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import HeaderStatusStrip from "./HeaderStatusStrip.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

const issue = (id: string, kind: string, severity: ScanIssue["severity"]): ScanIssue => ({
  id, category: "classification-hint", severity, kind, message: id, tokenIds: [],
});
function report(issues: ScanIssue[]): ScanReport {
  return {
    issues,
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const issues = [issue("w1", "capability-gap", "warning"), issue("w2", "asymmetric-variant-coverage", "warning")];

describe("HeaderStatusStrip accept subtraction", () => {
  it("counts all warnings when nothing is accepted", () => {
    const w = mount(HeaderStatusStrip, { props: { report: report(issues), scanViewActive: false } });
    expect(w.text()).toContain("2 warnings");
  });

  it("subtracts an accepted by-design issue from the warning count", () => {
    const w = mount(HeaderStatusStrip, { props: { report: report(issues), scanViewActive: false, accepted: new Set(["w1"]) } });
    expect(w.text()).toContain("1 warnings");
    expect(w.text()).not.toContain("2 warnings");
  });
});
