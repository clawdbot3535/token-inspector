import { describe, it, expect } from "vitest";
import { acceptedByDesignIds } from "./accepted-issues.js";
import type { ScanIssue, ScanReport } from "@core/token-graph.js";

const issue = (id: string, kind: string): ScanIssue => ({
  id, category: "classification-hint", severity: "warning", kind, message: "", tokenIds: [],
});
const report = (issues: ScanIssue[]): ScanReport => ({
  issues,
  completeness: [],
  forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
  generatedAt: 0,
} as ScanReport);

describe("acceptedByDesignIds", () => {
  it("returns by-design issue ids that are in the accepted set", () => {
    const r = report([issue("a", "capability-gap"), issue("b", "state-via-prop")]);
    expect([...acceptedByDesignIds(r, new Set(["a"]))]).toEqual(["a"]);
  });

  it("excludes a non-by-design id even if it is in the accepted set", () => {
    const r = report([issue("x", "asymmetric-variant-coverage")]); // figma-fix, not by-design
    expect(acceptedByDesignIds(r, new Set(["x"])).size).toBe(0);
  });

  it("is empty for an empty accepted set", () => {
    const r = report([issue("a", "capability-gap")]);
    expect(acceptedByDesignIds(r, new Set<string>()).size).toBe(0);
  });
});
