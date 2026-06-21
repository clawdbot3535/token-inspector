// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport } from "@core/token-graph.js";

function reportWith(kind: string): ScanReport {
  return {
    issues: [{ id: "i1", category: "classification-hint", severity: "warning", kind, message: "m", tokenIds: ["button-mystery-bg"], componentName: "button" }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView resolve affordance", () => {
  it("shows a Resolve button for a heuristic-extendable issue and emits resolve with the tokenId", async () => {
    const wrapper = mount(ScanView, { props: { report: reportWith("unsupported-part") }, global: { stubs } });
    const btn = wrapper.find("[data-testid=resolve-issue]");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(wrapper.emitted("resolve")?.[0]?.[0]).toBe("button-mystery-bg");
  });

  it("shows NO Resolve button for a non-extendable issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith("malformed-value") }, global: { stubs } });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
  });
});
