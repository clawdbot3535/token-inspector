import { describe, it, expect } from "vitest";
import { makeOwnerPredicate } from "./owners.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "classification-hint",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("makeOwnerPredicate", () => {
  it("returns a predicate true for member kinds and false for non-members", () => {
    const isFoo = makeOwnerPredicate(new Set(["a", "b"]));
    expect(isFoo(issue("a"))).toBe(true);
    expect(isFoo(issue("b"))).toBe(true);
    expect(isFoo(issue("c"))).toBe(false);
  });

  it("returns a function", () => {
    expect(typeof makeOwnerPredicate(new Set<string>())).toBe("function");
  });
});
