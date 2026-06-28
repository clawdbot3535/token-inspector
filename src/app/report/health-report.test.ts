// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildHealthReport } from "./health-report.js";
import type { ScanReport, ScanIssue, TokenGraph } from "@core/token-graph.js";

const issue = (kind: string, severity: ScanIssue["severity"], extra: Partial<ScanIssue> = {}): ScanIssue => ({
  id: `x-${kind}-${Math.random()}`.replace(/\./g, ""),
  category: "classification-hint",
  severity,
  kind,
  message: `msg for ${kind}`,
  tokenIds: [],
  ...extra,
});

const report: ScanReport = {
  issues: [
    issue("asymmetric-variant-coverage", "warning", { message: "button.text-hover missing on [outline, solid]" }), // figma-fix
    issue("possible-typo", "warning", { message: "`spaching` looks like a typo", typoFrom: "spaching", typoTo: "spacing" }), // data-quality
    issue("capability-gap", "hint"), // by-design
    issue("custom-without-parts", "hint"), // manual-dev
  ],
  completeness: [
    { component: "button", axis: "size", variantKey: "xs", defined: 2, total: 3, missingUtilities: ["icon-size"] },
    { component: "badge", axis: "size", variantKey: "md", defined: 2, total: 2, missingUtilities: [] },
  ],
  forecast: {
    tokensCss: { estimatedBytes: 7500, tailwindMatches: 12, themeExtensions: 5, modeVariantEntries: 3 },
    components: [
      { name: "button", inAllowList: true, variants: [{ component: "button", axis: "size", variantKey: "xs", defined: 2, total: 3, missingUtilities: ["icon-size"] }] },
      { name: "badge", inAllowList: true, variants: [{ component: "badge", axis: "size", variantKey: "md", defined: 2, total: 2, missingUtilities: [] }] },
    ],
    unmappedComponentPrefixes: [],
    nonComponentPrefixes: ["typography"],
  },
  generatedAt: 0,
};
const graph = { nodes: new Map([["button-bg", {}], ["badge-bg", {}]]) } as unknown as TokenGraph;

describe("buildHealthReport", () => {
  const md = buildHealthReport(graph, report);

  it("has the title + a summary line with component/token/scan counts", () => {
    expect(md).toContain("# Design System Health Report");
    expect(md).toContain("2 components");
    expect(md).toContain("2 tokens");
    expect(md).toMatch(/0 errors.*2 warnings.*2 hints/s); // 4 issues: 2 warning + 2 hint
  });

  it("has a per-owner deviation table with the owner labels + counts", () => {
    expect(md).toContain("Deviations by owner");
    expect(md).toContain("🎨 Figma-Fix");
    expect(md).toContain("🛠 Data-Quality");
    expect(md).toContain("⊘ by-design");
    expect(md).toContain("🔧 Manual-Dev");
  });

  it("lists designer action items from figma-fix + data-quality issues", () => {
    expect(md).toContain("Designer action items");
    expect(md).toContain("button.text-hover missing"); // figma-fix message
    expect(md).toContain("spaching"); // data-quality typo
    expect(md).not.toContain("msg for custom-without-parts"); // manual-dev message is NOT a designer action item
  });

  it("groups the action items by bucket with counts, most-actionable first", () => {
    expect(md).toContain("### Typos & naming (1)"); // possible-typo
    expect(md).toContain("### Variant coverage gaps (1)"); // asymmetric-variant-coverage
    // Typos (order 1) come before variant coverage (order 2).
    expect(md.indexOf("Typos & naming")).toBeLessThan(md.indexOf("Variant coverage gaps"));
  });

  it("has a component completeness section flagging the incomplete one", () => {
    expect(md).toContain("Component completeness");
    expect(md).toContain("button");
    expect(md).toContain("icon-size"); // the missing utility for button.xs
  });

  it("has an output forecast line with the token-css stats", () => {
    expect(md).toContain("12"); // tailwindMatches
    expect(md).toContain("theme extension");
  });

  it("has an Output targets section summarizing all three targets", () => {
    expect(md).toContain("Output targets");
    expect(md).toContain("Nuxt UI");
    expect(md).toContain("shadcn");
    expect(md).toContain("Generic");
  });
});
