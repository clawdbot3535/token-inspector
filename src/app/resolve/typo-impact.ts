import type { ScanIssue, TokenGraph } from "@core/token-graph.js";
import { getSlotMapping, type SlotMappingEntry } from "@tg/grammar";

// Impact preview for a `possible-typo` deviation (Data-Quality owner). For each
// affected token it answers ONE question — would fixing the typo in the Figma
// source change how the token maps? — by running the real slot-mapping path
// (`getSlotMapping`) on both the typo'd id and the corrected id. PURE and
// advisory: it never mutates the graph or the recipe engine.
//
// The impact is measured at the component slot-mapping level. A token that
// doesn't slot-map (a primitive / typography token, e.g. an auto-normalized
// `line-heigth`) reports `unmapped` on both sides → `cosmetic`, which is
// accurate for the current corpus. If a non-normalized primitive typo that
// affects theme output ever appears, a classify-based branch is a clean follow-up.

export type TypoImpactVerdict = "recovers" | "corrects" | "cosmetic";

export interface TokenRenameImpact {
  /** The typo'd token id (today). */
  from: string;
  /** The corrected token id (after the Figma rename). */
  to: string;
  /** How the typo'd id maps today. */
  before: string;
  /** How the corrected id would map. */
  after: string;
  verdict: TypoImpactVerdict;
}

function describe(mapping: SlotMappingEntry | null): string {
  if (mapping === null) return "unmapped";
  return `slots.${mapping.slot} · ${mapping.utilityType}`;
}

/** Replace every occurrence of the typo segment with its suggestion. Token ids
 * never repeat a segment, so this is exact (mirrors data-quality.ts's fixedId). */
function correctedId(id: string, from: string, to: string): string {
  return id
    .split("-")
    .map((s) => (s === from ? to : s))
    .join("-");
}

export function typoRenameImpact(graph: TokenGraph, issue: ScanIssue): TokenRenameImpact[] {
  if (issue.kind !== "possible-typo" || !issue.typoFrom || !issue.typoTo) return [];
  const from = issue.typoFrom;
  const to = issue.typoTo;
  const out: TokenRenameImpact[] = [];
  for (const tokenId of issue.tokenIds) {
    const fixed = correctedId(tokenId, from, to);
    if (fixed === tokenId) continue; // typo segment not present — defensive
    const valueType = graph.nodes.get(tokenId)?.type;
    const before = getSlotMapping(tokenId, undefined, valueType);
    const after = getSlotMapping(fixed, undefined, valueType);
    const beforeDesc = describe(before);
    const afterDesc = describe(after);
    let verdict: TypoImpactVerdict;
    if (before === null && after !== null) verdict = "recovers";
    else if (before !== null && after !== null && beforeDesc !== afterDesc) verdict = "corrects";
    else verdict = "cosmetic";
    out.push({ from: tokenId, to: fixed, before: beforeDesc, after: afterDesc, verdict });
  }
  return out;
}
