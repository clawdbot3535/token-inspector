import type { ScanIssue } from "@core/token-graph.js";

// These kind strings are emitted in src/scanner.ts (asymmetric-variant-coverage :868,
// asymmetric-size-coverage :570, incomplete-size-variant :549,
// non-suffix-vs-size-conflict :521, orphaned-size-key :607). ScanIssue.kind is typed
// `string` (open for extension), so a scanner-side kind rename will NOT surface as a
// compile error here — keep this set aligned on any rename. (Same caveat as
// BY_DESIGN_KINDS in src/app/resolve/by-design.ts.)
export const FIGMA_FIX_KINDS: ReadonlySet<string> = new Set([
  "asymmetric-variant-coverage",
  "asymmetric-size-coverage",
  "incomplete-size-variant",
  "non-suffix-vs-size-conflict",
  "orphaned-size-key",
]);

/**
 * True when an issue's fix lives in the Figma token source — the coverage of the
 * design token set is incomplete or inconsistent, and the designer must add or align
 * tokens in Figma. Advisory: there is no in-app override.
 */
export function isFigmaFix(issue: ScanIssue): boolean {
  return FIGMA_FIX_KINDS.has(issue.kind);
}
