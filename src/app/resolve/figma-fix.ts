import { makeOwnerPredicate } from "./owners.js";

// These kind strings are emitted in src/scanner.ts (asymmetric-variant-coverage :868,
// asymmetric-size-coverage :570, incomplete-size-variant :549,
// non-suffix-vs-size-conflict :521, orphaned-size-key :607,
// collection-anatomy-mismatch :435). ScanIssue.kind is typed `string` (open for
// extension), so a scanner-side kind rename will NOT surface as a compile error here —
// keep this set aligned on any rename. (Same caveat as BY_DESIGN_KINDS in
// src/app/resolve/by-design.ts.)
export const FIGMA_FIX_KINDS: ReadonlySet<string> = new Set([
  "asymmetric-variant-coverage",
  "asymmetric-size-coverage",
  "incomplete-size-variant",
  "non-suffix-vs-size-conflict",
  "orphaned-size-key",
  "collection-anatomy-mismatch",
]);

/**
 * True when an issue's fix lives in the Figma token source — either the coverage of the
 * design token set is incomplete or inconsistent (the designer must add or align tokens),
 * or a component is filed in the wrong Figma collection (it should move to
 * `components/custom`). Advisory: there is no in-app override.
 */
export const isFigmaFix = makeOwnerPredicate(FIGMA_FIX_KINDS);
