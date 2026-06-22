import type { ScanIssue } from "@core/token-graph.js";

// These kind strings are emitted in src/scanner.ts (capability-gap :368,
// state-via-prop :173, unsupported-state :191). ScanIssue.kind is typed `string`
// (open for extension), so a scanner-side kind rename will NOT surface as a compile
// error here — keep this set aligned on any rename. (Same caveat as
// CAPABILITY_DEVIATION_KINDS in src/app/kit-behaviors.ts.)
//
// Deliberately NOT reused from CAPABILITY_DEVIATION_KINDS: that set also contains
// `unsupported-part` (the heuristic-extendable owner — the opposite of by-design)
// plus kinds out of this v1's scope.
export const BY_DESIGN_KINDS: ReadonlySet<string> = new Set([
  "capability-gap",
  "state-via-prop",
  "unsupported-state",
]);

/**
 * True when an issue is an inherent Nuxt UI architectural constraint — the
 * by-design owner's domain. Advisory: there is no source fix and no in-app override.
 */
export function isByDesign(issue: ScanIssue): boolean {
  return BY_DESIGN_KINDS.has(issue.kind);
}
