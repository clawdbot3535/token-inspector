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
  it("is true for the Figma-Fix kinds (coverage-gap + collection-anatomy-mismatch)", () => {
    expect(isFigmaFix(issue("asymmetric-variant-coverage"))).toBe(true);
    expect(isFigmaFix(issue("asymmetric-size-coverage"))).toBe(true);
    expect(isFigmaFix(issue("incomplete-size-variant"))).toBe(true);
    expect(isFigmaFix(issue("non-suffix-vs-size-conflict"))).toBe(true);
    expect(isFigmaFix(issue("orphaned-size-key"))).toBe(true);
    expect(isFigmaFix(issue("collection-anatomy-mismatch"))).toBe(true);
  });

  it("is false for other owners' kinds", () => {
    expect(isFigmaFix(issue("capability-gap"))).toBe(false);       // by-design
    expect(isFigmaFix(issue("possible-typo"))).toBe(false);        // Data-Quality
    expect(isFigmaFix(issue("unsupported-part"))).toBe(false);     // Heuristic-Extension
  });

  it("FIGMA_FIX_KINDS holds exactly the six Figma-Fix kinds", () => {
    expect([...FIGMA_FIX_KINDS].sort()).toEqual(
      [
        "asymmetric-size-coverage",
        "asymmetric-variant-coverage",
        "collection-anatomy-mismatch",
        "incomplete-size-variant",
        "non-suffix-vs-size-conflict",
        "orphaned-size-key",
      ].sort(),
    );
  });
});
