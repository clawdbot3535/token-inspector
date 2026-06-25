import { describe, it, expect } from "vitest";
import { typoRenameImpact } from "./typo-impact.js";
import type { ScanIssue, TokenGraph } from "@core/token-graph.js";

// Minimal graph: typoRenameImpact only reads graph.nodes.get(id)?.type.
const graphWith = (ids: string[], type = "dimension"): TokenGraph =>
  ({ nodes: new Map(ids.map((id) => [id, { id, type }])) }) as unknown as TokenGraph;

const typoIssue = (tokenIds: string[], typoFrom: string, typoTo: string): ScanIssue => ({
  id: `typo-${typoFrom}-${typoTo}`,
  category: "data-quality",
  severity: "warning",
  kind: "possible-typo",
  message: "",
  tokenIds,
  typoFrom,
  typoTo,
});

describe("typoRenameImpact", () => {
  it("verdict 'recovers' when fixing the typo turns an unmapped token into a mapped one", () => {
    const g = graphWith(["button-heigth-md"]);
    const r = typoRenameImpact(g, typoIssue(["button-heigth-md"], "heigth", "height"));
    expect(r).toEqual([
      {
        from: "button-heigth-md",
        to: "button-height-md",
        before: "unmapped",
        after: "slots.base · height",
        verdict: "recovers",
      },
    ]);
  });

  it("verdict 'cosmetic' when the mapping is unchanged (non-slotting / auto-normalized token)", () => {
    const g = graphWith(["typography-heading-2-line-heigth"]);
    const r = typoRenameImpact(g, typoIssue(["typography-heading-2-line-heigth"], "heigth", "height"));
    expect(r[0]?.verdict).toBe("cosmetic");
    expect(r[0]?.before).toBe("unmapped");
    expect(r[0]?.after).toBe("unmapped");
  });

  it("computes one impact per affected token", () => {
    const g = graphWith(["button-heigth-md", "card-heigth-lg"]);
    const r = typoRenameImpact(g, typoIssue(["button-heigth-md", "card-heigth-lg"], "heigth", "height"));
    expect(r.map((x) => x.to)).toEqual(["button-height-md", "card-height-lg"]);
  });

  it("returns [] for a non-typo issue (no typoTo)", () => {
    const g = graphWith(["x-malformed"]);
    const issue = { ...typoIssue(["x-malformed"], "a", "b"), kind: "malformed-value" };
    expect(typoRenameImpact(g, issue)).toEqual([]);
  });

  it("returns [] when typoFrom/typoTo are absent", () => {
    const g = graphWith(["some-token"]);
    const issue = { ...typoIssue(["some-token"], "a", "b"), typoFrom: undefined, typoTo: undefined };
    expect(typoRenameImpact(g, issue)).toEqual([]);
  });
});
