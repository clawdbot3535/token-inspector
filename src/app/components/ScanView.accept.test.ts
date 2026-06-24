// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{ id: "i1", category: "classification-hint", severity: "warning", kind: "capability-gap", message: "m", tokenIds: [], componentName: "alert", ...issue }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView accept (by-design)", () => {
  it("renders an Accept button for a by-design issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    expect(w.find("[data-testid=accept-issue]").exists()).toBe(true);
  });

  it("emits accept with the issue id on click", async () => {
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    await w.get("[data-testid=accept-issue]").trigger("click");
    expect(w.emitted("accept")?.[0]).toEqual(["i1"]);
  });

  it("shows ✓ accepted (not the Accept button) when the id is in the accepted prop", () => {
    const w = mount(ScanView, { props: { report: reportWith({}), accepted: new Set(["i1"]) }, global: { stubs } });
    expect(w.find("[data-testid=accept-done]").exists()).toBe(true);
    expect(w.find("[data-testid=accept-issue]").exists()).toBe(false);
  });

  it("renders no Accept affordance for a non-by-design issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({ kind: "asymmetric-variant-coverage" }) }, global: { stubs } });
    expect(w.find("[data-testid=accept-issue]").exists()).toBe(false);
    expect(w.find("[data-testid=accept-done]").exists()).toBe(false);
  });
});
