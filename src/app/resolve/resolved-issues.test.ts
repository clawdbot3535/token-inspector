// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";
import { resolvedIssueIds } from "./resolved-issues.js";

function reportWith(issues: Partial<ScanIssue>[]): ScanReport {
  return {
    issues: issues.map((i, n) => ({ id: `i${n}`, category: "classification-hint", severity: "warning", kind: "unsupported-part", message: "m", tokenIds: [], ...i })),
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}

describe("resolvedIssueIds", () => {
  it("includes an issue whose only resolvable token is resolved", () => {
    const report = reportWith([{ id: "a", kind: "unsupported-part", tokenIds: ["chip-mystery-bg"], componentName: "chip" }]);
    const ids = resolvedIssueIds(report, new Set(["chip-mystery-bg"]));
    expect(ids.has("a")).toBe(true);
  });
  it("excludes it when not resolved", () => {
    const report = reportWith([{ id: "a", kind: "unsupported-part", tokenIds: ["chip-mystery-bg"], componentName: "chip" }]);
    expect(resolvedIssueIds(report, new Set()).has("a")).toBe(false);
  });
  it("excludes a multi-resolvable-token issue with one token still unresolved", () => {
    const report = reportWith([{ id: "a", kind: "component-looks-custom", tokenIds: ["chip-x-bg", "chip-y-bg"], componentName: "chip", customParts: ["x", "y"] }]);
    expect(resolvedIssueIds(report, new Set(["chip-x-bg"])).has("a")).toBe(false);
  });
  it("ignores non-extendable issues (no resolvable tokens)", () => {
    const report = reportWith([{ id: "a", kind: "malformed-value", tokenIds: ["foo"] }]);
    expect(resolvedIssueIds(report, new Set(["foo"])).has("a")).toBe(false);
  });
});
