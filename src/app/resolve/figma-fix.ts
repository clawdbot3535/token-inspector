import { makeOwnerPredicate } from "./owners.js";

// These kind strings are emitted in src/scanner.ts (asymmetric-variant-coverage :868,
// asymmetric-size-coverage :570, incomplete-size-variant :549,
// non-suffix-vs-size-conflict :521, orphaned-size-key :607,
// collection-anatomy-mismatch :435, mode-invariant-semantic :630,
// single-mode-semantic :654, snap-to-tailwind :679). ScanIssue.kind is typed `string`
// (open for extension), so a scanner-side kind rename will NOT surface as a compile error
// here — keep this set aligned on any rename. (Same caveat as BY_DESIGN_KINDS in
// src/app/resolve/by-design.ts.)
//
// The last three are Figma source adjustments to the token set itself: single-mode-semantic
// (a mode value is missing), mode-invariant-semantic (a semantic that belongs in a primitive
// file), and snap-to-tailwind (a primitive a step off the Tailwind scale). Unlike the
// build-time Data-Quality kinds, the *value* is well-formed — the token set's shape is what
// the designer should refine.
export const FIGMA_FIX_KINDS: ReadonlySet<string> = new Set([
  "asymmetric-variant-coverage",
  "asymmetric-size-coverage",
  "incomplete-size-variant",
  "non-suffix-vs-size-conflict",
  "orphaned-size-key",
  "collection-anatomy-mismatch",
  "single-mode-semantic",
  "mode-invariant-semantic",
  "snap-to-tailwind",
]);

/**
 * True when an issue's fix lives in the Figma token source — the coverage of the design
 * token set is incomplete or inconsistent (the designer must add or align tokens), a
 * component is filed in the wrong Figma collection (it should move to `components/custom`),
 * or a semantic/primitive token's shape should be refined (mode coverage, primitive vs.
 * semantic placement, Tailwind-scale alignment). Advisory: there is no in-app override.
 */
export const isFigmaFix = makeOwnerPredicate(FIGMA_FIX_KINDS);
