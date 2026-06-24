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
    expect(ownerOf(issue("collection-anatomy-mismatch"))).toBe("figma-fix");
    expect(ownerOf(issue("custom-without-parts"))).toBe("manual-dev");
  });

  it("routes the formerly-unowned kinds (full routing — Other now empty)", () => {
    expect(ownerOf(issue("border-on-unframed-variant"))).toBe("by-design");
    expect(ownerOf(issue("unresolved-alias"))).toBe("data-quality");
    expect(ownerOf(issue("duplicate-id"))).toBe("data-quality");
    expect(ownerOf(issue("unknown-type"))).toBe("data-quality");
    expect(ownerOf(issue("single-mode-semantic"))).toBe("figma-fix");
    expect(ownerOf(issue("mode-invariant-semantic"))).toBe("figma-fix");
    expect(ownerOf(issue("snap-to-tailwind"))).toBe("figma-fix");
  });

  it("returns null only for a kind no owner claims (defensive fallback)", () => {
    // Every kind the scanner / build-graph emits today is routed; "Other" is now a
    // forward-compat bucket for a hypothetical future kind not yet assigned an owner.
    expect(ownerOf(issue("no-such-future-kind"))).toBe(null);
  });
});

describe("OWNER_FILTERS", () => {
  it("lists all, the five owners, then other, in order", () => {
    expect(OWNER_FILTERS.map((f) => f.value)).toEqual([
      "all", "heuristic", "data-quality", "by-design", "figma-fix", "manual-dev", "other",
    ]);
  });
});
