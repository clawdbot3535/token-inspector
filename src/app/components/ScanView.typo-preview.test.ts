// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue, TokenGraph } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{ id: "i1", category: "data-quality", severity: "warning", kind: "possible-typo", message: "m", tokenIds: ["button-heigth-md"], typoFrom: "heigth", typoTo: "height", ...issue }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const graph = { nodes: new Map([["button-heigth-md", { id: "button-heigth-md", type: "dimension" }]]) } as unknown as TokenGraph;
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView typo rename preview", () => {
  it("renders a Preview toggle for a typo issue when a graph is provided", () => {
    const w = mount(ScanView, { props: { report: reportWith({}), graph }, global: { stubs } });
    expect(w.find("[data-testid=typo-preview-toggle]").exists()).toBe(true);
    // The impact block is hidden until the toggle is clicked.
    expect(w.find("[data-testid=typo-preview]").exists()).toBe(false);
  });

  it("reveals the before→after impact when the toggle is clicked", async () => {
    const w = mount(ScanView, { props: { report: reportWith({}), graph }, global: { stubs } });
    await w.get("[data-testid=typo-preview-toggle]").trigger("click");
    const block = w.find("[data-testid=typo-preview]");
    expect(block.exists()).toBe(true);
    expect(block.text()).toContain("button-height-md"); // corrected id
    expect(block.text()).toContain("height");           // after-mapping utility
    expect(block.text()).toContain("recovers");          // verdict
  });

  it("renders no Preview toggle when no graph is provided", () => {
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    expect(w.find("[data-testid=typo-preview-toggle]").exists()).toBe(false);
  });

  it("renders no Preview toggle for a non-typo issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({ kind: "unsupported-part", typoFrom: undefined, typoTo: undefined }), graph }, global: { stubs } });
    expect(w.find("[data-testid=typo-preview-toggle]").exists()).toBe(false);
  });
});
