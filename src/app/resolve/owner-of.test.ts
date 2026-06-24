import { describe, it, expect } from "vitest";
import { ownerOf, OWNER_FILTERS } from "./owner-of.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "classification-hint",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("ownerOf", () => {
  it("maps each owner's kind to that owner", () => {
    expect(ownerOf(issue("unsupported-part"))).toBe("heuristic");
    expect(ownerOf(issue("possible-typo"))).toBe("data-quality");
    expect(ownerOf(issue("malformed-value"))).toBe("data-quality");
    expect(ownerOf(issue("capability-gap"))).toBe("by-design");
    expect(ownerOf(issue("asymmetric-variant-coverage"))).toBe("figma-fix");
    expect(ownerOf(issue("custom-without-parts"))).toBe("manual-dev");
  });

  it("returns null for an un-owned kind", () => {
    expect(ownerOf(issue("snap-to-tailwind"))).toBe(null);
    expect(ownerOf(issue("mode-invariant-semantic"))).toBe(null);
  });
});

describe("OWNER_FILTERS", () => {
  it("lists all, the five owners, then other, in order", () => {
    expect(OWNER_FILTERS.map((f) => f.value)).toEqual([
      "all", "heuristic", "data-quality", "by-design", "figma-fix", "manual-dev", "other",
    ]);
  });
});
