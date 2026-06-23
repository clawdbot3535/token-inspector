import { describe, it, expect } from "vitest";
import { isManualDev, MANUAL_DEV_KINDS } from "./manual-dev.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "classification-hint",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("isManualDev", () => {
  it("is true for the hand-code-only kinds", () => {
    expect(isManualDev(issue("custom-without-parts"))).toBe(true);
    expect(isManualDev(issue("disabled-via-opacity"))).toBe(true);
    expect(isManualDev(issue("resting-shadowed-by-state"))).toBe(true);
  });

  it("is false for other owners' kinds", () => {
    expect(isManualDev(issue("capability-gap"))).toBe(false);              // by-design
    expect(isManualDev(issue("asymmetric-variant-coverage"))).toBe(false); // figma-fix
    expect(isManualDev(issue("possible-typo"))).toBe(false);               // data-quality
    expect(isManualDev(issue("unsupported-part"))).toBe(false);            // heuristic
  });

  it("MANUAL_DEV_KINDS holds exactly the three kinds", () => {
    expect([...MANUAL_DEV_KINDS].sort()).toEqual(
      ["custom-without-parts", "disabled-via-opacity", "resting-shadowed-by-state"].sort(),
    );
  });
});
