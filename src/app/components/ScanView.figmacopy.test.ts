// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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
      tokenIds: [],
      componentName: "button",
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView figma-fix copy", () => {
  it("renders a Copy button for an issue carrying figmaFixTokens", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ figmaFixTokens: ["button-outline-border", "button-ghost-border"] }) }, global: { stubs } });
    const btn = wrapper.find("[data-testid=figma-fix-copy]");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("2");
  });

  it("copies the newline-joined token list on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(ScanView, { props: { report: reportWith({ figmaFixTokens: ["button-outline-border", "button-ghost-border"] }) }, global: { stubs } });
    await wrapper.get("[data-testid=figma-fix-copy]").trigger("click");
    expect(writeText).toHaveBeenCalledWith("button-outline-border\nbutton-ghost-border");
  });

  it("renders no Copy button for a figma-fix issue without figmaFixTokens", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "orphaned-size-key", figmaFixTokens: undefined }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=figma-fix-copy]").exists()).toBe(false);
  });
});
