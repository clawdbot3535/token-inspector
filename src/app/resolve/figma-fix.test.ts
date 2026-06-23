import { describe, it, expect } from "vitest";
import { isFigmaFix, FIGMA_FIX_KINDS } from "./figma-fix.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "data-quality",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("isFigmaFix", () => {
  it("is true for the coverage-gap kinds", () => {
    expect(isFigmaFix(issue("asymmetric-variant-coverage"))).toBe(true);
    expect(isFigmaFix(issue("asymmetric-size-coverage"))).toBe(true);
    expect(isFigmaFix(issue("incomplete-size-variant"))).toBe(true);
    expect(isFigmaFix(issue("non-suffix-vs-size-conflict"))).toBe(true);
    expect(isFigmaFix(issue("orphaned-size-key"))).toBe(true);
  });

  it("is false for other owners' kinds", () => {
    expect(isFigmaFix(issue("capability-gap"))).toBe(false);       // by-design
    expect(isFigmaFix(issue("possible-typo"))).toBe(false);        // Data-Quality
    expect(isFigmaFix(issue("unsupported-part"))).toBe(false);     // Heuristic-Extension
    expect(isFigmaFix(issue("collection-anatomy-mismatch"))).toBe(false); // deliberately out of scope
  });

  it("FIGMA_FIX_KINDS holds exactly the five coverage-gap kinds", () => {
    expect([...FIGMA_FIX_KINDS].sort()).toEqual(
      [
        "asymmetric-size-coverage",
        "asymmetric-variant-coverage",
        "incomplete-size-variant",
        "non-suffix-vs-size-conflict",
        "orphaned-size-key",
      ].sort(),
    );
  });
});
