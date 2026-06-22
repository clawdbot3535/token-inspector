import { describe, it, expect } from "vitest";
import { isByDesign, BY_DESIGN_KINDS } from "./by-design.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "classification-hint",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("isByDesign", () => {
  it("is true for the capability-family kinds", () => {
    expect(isByDesign(issue("capability-gap"))).toBe(true);
    expect(isByDesign(issue("state-via-prop"))).toBe(true);
    expect(isByDesign(issue("unsupported-state"))).toBe(true);
  });

  it("is false for non-by-design kinds", () => {
    expect(isByDesign(issue("unsupported-part"))).toBe(false);
    expect(isByDesign(issue("component-looks-custom"))).toBe(false);
    expect(isByDesign(issue("possible-typo"))).toBe(false);
    expect(isByDesign(issue("malformed-value"))).toBe(false);
  });

  it("BY_DESIGN_KINDS holds exactly the three capability-family kinds", () => {
    expect([...BY_DESIGN_KINDS].sort()).toEqual(
      ["capability-gap", "state-via-prop", "unsupported-state"].sort(),
    );
  });
});
