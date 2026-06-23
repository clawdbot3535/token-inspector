# Manual-Dev Owner v1 + Owner-Predicate Consolidation — Design

**Date:** 2026-06-23
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — fifth (final) owner

## Summary

The (Y) deviation-routing track routes every scan deviation to an *owner*. Four
owners ship today:

- **Heuristic-Extension** (v0.54.0) — active `Resolve →` override. Kinds:
  `unsupported-part`, `component-looks-custom`.
- **Data-Quality** (v0.54.4) — advisory `💡 from → to` typo hint. Kind: `possible-typo`.
- **by-design / Constraint** (v0.54.5) — advisory `⊘ by-design` badge. Kinds:
  `capability-gap`, `state-via-prop`, `unsupported-state`.
- **Figma-Fix** (v0.54.6) — advisory `🎨 fix in Figma` badge. Kinds:
  `asymmetric-variant-coverage`, `asymmetric-size-coverage`, `incomplete-size-variant`,
  `non-suffix-vs-size-conflict`, `orphaned-size-key`.

This adds the **Manual-Dev** owner — the fifth and final — for deviations that are
**resolvable, but only by hand-coding in the developer's Nuxt app** (a hand-written
custom recipe, or a CSS override that fights Nuxt's default). v1 is advisory-only
(symmetric to by-design and Figma-Fix): a `🔧 hand-code` badge reframes the affected
issues. It also performs the **owner-predicate consolidation** the Figma-Fix final
reviewer flagged for "the third `is…` classifier" — sharing the predicate mechanic via
a `makeOwnerPredicate` factory.

## Scope

Three kinds get the Manual-Dev verdict:

| Kind | scanner.ts | severity | why it's Manual-Dev |
|------|-----------|----------|---------------------|
| `custom-without-parts` | :451 | warning | a custom component with no derivable parts — the dev must hand-write its parts/recipe |
| `disabled-via-opacity` | :232 | warning | Nuxt dims disabled via opacity, not colour — the dev *can* hand-code a CSS colour override |
| `resting-shadowed-by-state` | :252 | warning | the resting colour is out-specified by a `data-[state=…]` variant — the dev *can* hand-code a higher-specificity override |

**Boundary resolution:** `disabled-via-opacity` and `resting-shadowed-by-state` are in
`CAPABILITY_DEVIATION_KINDS` (`kit-behaviors.ts`) but were NOT in `BY_DESIGN_KINDS`
(orphaned). They differ from the by-design kinds: by-design = *impossible / nothing to
do* (e.g. `capability-gap` — Nuxt has no such slot); these two are *possible but only
by hand-coding against Nuxt's default*. That is exactly the Manual-Dev definition, so
this owner claims them.

### Non-goals (v1)

- **No count change.** Header counts unchanged. (Advisory.)
- **No scanner change.** No new emit logic, no severity change.
- **No `ScanIssue` field.** Owner classification is derived app-side from `issue.kind`.
- **No interaction.** No Copy, no Dismiss, no persisted state.
- **No per-kind code snippet/pointer.** The "how to hand-code it" guidance is v2.

## Architecture

This v1 bundles the new owner with a small, behaviour-preserving consolidation.

### New — `src/app/resolve/owners.ts`

The shared owner-predicate mechanic:

```ts
import type { ScanIssue } from "@core/token-graph.js";

/**
 * Build an owner-classification predicate from a set of ScanIssue.kind strings.
 *
 * Owner kind-sets are disjoint by construction — a given kind belongs to exactly one
 * (Y) owner — so an issue matches at most one owner predicate. Each owner's KINDS set
 * lives in its own module (the semantic home: its name + JSDoc + the scanner-line
 * caveat). Those kind strings are emitted in src/scanner.ts; ScanIssue.kind is typed
 * `string`, so a scanner-side kind rename will NOT surface as a compile error — keep
 * each owner set aligned with its scanner emit sites on any rename.
 */
export function makeOwnerPredicate(
  kinds: ReadonlySet<string>,
): (issue: ScanIssue) => boolean {
  return (issue) => kinds.has(issue.kind);
}
```

### Refactored (behaviour-preserving) — `by-design.ts` & `figma-fix.ts`

Each keeps its `*_KINDS` set and its own scanner-line caveat comment, and changes ONLY
its predicate line to use the factory:

```ts
import { makeOwnerPredicate } from "./owners.js";
// …BY_DESIGN_KINDS unchanged…
export const isByDesign = makeOwnerPredicate(BY_DESIGN_KINDS);
```

Exports and module paths are unchanged, so the existing `by-design.test.ts` and
`figma-fix.test.ts` run untouched and serve as the **regression guard** for the
refactor.

### New — `src/app/resolve/manual-dev.ts`

```ts
import type { ScanIssue } from "@core/token-graph.js";
import { makeOwnerPredicate } from "./owners.js";

// Emitted in src/scanner.ts: custom-without-parts :451, disabled-via-opacity :232,
// resting-shadowed-by-state :252. Keep aligned with those emit sites on any rename.
export const MANUAL_DEV_KINDS: ReadonlySet<string> = new Set([
  "custom-without-parts",
  "disabled-via-opacity",
  "resting-shadowed-by-state",
]);

/** True when an issue is resolvable only by hand-coding in the Nuxt app (a custom
 *  recipe, or a CSS override against Nuxt's default). Advisory: no in-app override. */
export const isManualDev = makeOwnerPredicate(MANUAL_DEV_KINDS);
```

### Changed — `src/app/components/ScanView.vue`

Import `isManualDev` (existing `isByDesign`/`isFigmaFix` imports unchanged) and add one
template branch after the figma-fix badge span:

```
🔧 hand-code   (teal pill)
```

- `v-if="isManualDev(issue)"`, `data-testid="manual-dev"`, constant text `🔧 hand-code`.
- Styling: muted **teal** — `bg-teal-100 text-teal-700 dark:bg-teal-900/40
  dark:text-teal-300` — distinct from by-design (zinc), typo (sky), figma-fix (violet),
  and `✓ resolved` (emerald).
- Title: "Resolvable only by hand-coding in your Nuxt app (a custom recipe or a CSS
  override against Nuxt's default)."

## Data flow

None. All predicates are pure functions over `issue.kind`. No new state, no new props,
no `App.vue` change.

## Invariants & edge cases

- **Disjoint owners:** the three Manual-Dev kinds appear in no other owner's set, so the
  badge never co-renders with another owner's affordance. Test-asserted.
- **Refactor preserves behaviour:** `isByDesign`/`isFigmaFix` keep identical signatures,
  exports, and paths; their existing tests are the guard.

## Testing

- `src/app/resolve/owners.test.ts` — `makeOwnerPredicate(set)` returns a predicate that
  is `true` for a member kind and `false` for a non-member; returns a function.
- `src/app/resolve/manual-dev.test.ts` — `isManualDev` is `true` for the 3 kinds;
  `false` for `capability-gap` (by-design), `asymmetric-variant-coverage` (figma-fix),
  `possible-typo` (data-quality), `unsupported-part` (heuristic); `MANUAL_DEV_KINDS`
  holds exactly the 3.
- **Unchanged** `by-design.test.ts` + `figma-fix.test.ts` — regression guard for the
  factory refactor.
- `src/app/components/ScanView.manualdev.test.ts` — badge renders for each of the 3
  kinds; not for a non-manual-dev issue; the by-design badge, figma-fix badge, and
  Resolve button do NOT appear for a manual-dev issue.

## Deliberately out of scope (parked)

- `collection-anatomy-mismatch` — parked for Figma-Fix v2 (dual-owner ambiguity; not
  double-claimed here).
- `border-on-unframed-variant` → by-design extension (framework constraint).
- `mode-invariant-semantic` / `single-mode-semantic` / `snap-to-tailwind` /
  `unresolved-alias` → Data-Quality / hygiene; not "developer hand-codes."
- v2: per-kind "how to hand-code it" pointer/snippet.
- Full 24-kind → owner routing table + an owner filter in ScanView.
- Merging all owner files into a single `owners.ts` (kept per-owner for cohesion).
