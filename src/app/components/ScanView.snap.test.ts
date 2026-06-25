// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{ id: "i1", category: "classification-hint", severity: "hint", kind: "snap-to-tailwind", message: "m", tokenIds: ["spacing-custom-5"], componentName: "spacing", snapTo: "4px", ...issue }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView snap-to-tailwind copy", () => {
  it("renders a Copy button for a snap-to-tailwind issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    const btn = w.find("[data-testid=snap-copy]");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("4px");
  });

  it("copies the suggested value on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    await w.get("[data-testid=snap-copy]").trigger("click");
    expect(writeText).toHaveBeenCalledWith("4px");
  });

  it("renders no snap Copy button for a non-snap issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({ kind: "possible-typo", snapTo: undefined }) }, global: { stubs } });
    expect(w.find("[data-testid=snap-copy]").exists()).toBe(false);
  });
});
