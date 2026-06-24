import type { ScanIssue } from "@core/token-graph.js";
import { BY_DESIGN_KINDS } from "./by-design.js";
import { FIGMA_FIX_KINDS } from "./figma-fix.js";
import { MANUAL_DEV_KINDS } from "./manual-dev.js";
import { HEURISTIC_EXTENDABLE_KINDS } from "./heuristic-extendable.js";

export type Owner =
  | "heuristic"
  | "data-quality"
  | "by-design"
  | "figma-fix"
  | "manual-dev";

// The Data-Quality owner has no classifier module — it keys off these kinds.
const DATA_QUALITY_KINDS: ReadonlySet<string> = new Set(["possible-typo", "malformed-value"]);

// Owner kind-sets are disjoint (verified across all five owners), so the first
// matching set is the unique owner. owner-of.ts imports the owner modules for their
// sets; those modules import only owners.ts (the factory), never owner-of.ts — no cycle.
const OWNER_KINDS: ReadonlyArray<readonly [Owner, ReadonlySet<string>]> = [
  ["heuristic", HEURISTIC_EXTENDABLE_KINDS],
  ["data-quality", DATA_QUALITY_KINDS],
  ["by-design", BY_DESIGN_KINDS],
  ["figma-fix", FIGMA_FIX_KINDS],
  ["manual-dev", MANUAL_DEV_KINDS],
];

/** The (Y) owner that claims this issue's kind, or null when no owner does ("Other"). */
export function ownerOf(issue: ScanIssue): Owner | null {
  for (const [owner, kinds] of OWNER_KINDS) {
    if (kinds.has(issue.kind)) return owner;
  }
  return null;
}

export type OwnerFilter = Owner | "all" | "other";

export const OWNER_FILTERS: ReadonlyArray<{ value: OwnerFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "heuristic", label: "Heuristic" },
  { value: "data-quality", label: "Data-Quality" },
  { value: "by-design", label: "by-design" },
  { value: "figma-fix", label: "Figma-Fix" },
  { value: "manual-dev", label: "Manual-Dev" },
  { value: "other", label: "Other" },
];
