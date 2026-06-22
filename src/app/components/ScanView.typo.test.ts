// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{ id: "i1", category: "data-quality", severity: "warning", kind: "possible-typo", message: "m", tokenIds: ["button-heigth-md"], ...issue }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView typo rename hint", () => {
  it("renders the 💡 from → to hint for a possible-typo issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ typoFrom: "heigth", typoTo: "height" }) }, global: { stubs } });
    const hint = wrapper.find("[data-testid=typo-hint]");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("heigth");
    expect(hint.text()).toContain("height");
  });

  it("copies the rename on Copy click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(ScanView, { props: { report: reportWith({ typoFrom: "heigth", typoTo: "height" }) }, global: { stubs } });
    await wrapper.get("[data-testid=typo-copy]").trigger("click");
    expect(writeText).toHaveBeenCalledWith("heigth → height");
  });

  it("renders no typo hint for a non-typo issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "unsupported-part", typoFrom: undefined, typoTo: undefined }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=typo-hint]").exists()).toBe(false);
  });
});
