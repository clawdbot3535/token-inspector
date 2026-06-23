# Figma-Fix Owner v1 — Design

**Date:** 2026-06-23
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — fourth owner

## Summary

The (Y) deviation-routing track routes every scan deviation to an *owner* who can
resolve it. Three owners ship today:

- **Heuristic-Extension** (v0.54.0) — active: a `Resolve →` button injects a live
  slot-mapping override. Kinds: `unsupported-part`, `component-looks-custom`.
- **Data-Quality** (v0.54.4) — advisory: a `💡 from → to` typo rename hint. Kind:
  `possible-typo`.
- **by-design / Constraint** (v0.54.5) — advisory: a `⊘ by-design` badge for inherent
  Nuxt UI constraints. Kinds: `capability-gap`, `state-via-prop`, `unsupported-state`.

This adds the **Figma-Fix** owner: the owner for deviations whose fix lives in the
**Figma token source/structure** — the design token set is incomplete or inconsistent,
and the designer must add or align tokens in Figma. v1 is **advisory-only** (symmetric
to by-design and Data-Quality): it reframes the affected issues with a `🎨 fix in Figma`
owner verdict so the user knows these are the designer's to-do list.

## Scope

Five "coverage-gap" issue kinds get the Figma-Fix owner verdict — one coherent theme
(the Figma token set is incomplete/inconsistent → add or align tokens):

| Kind | scanner.ts | severity | what the message already says |
|------|-----------|----------|-------------------------------|
| `asymmetric-variant-coverage` | :868 | warning/error | "…defined on [X] but missing on [Y]. Add `p-v-u`… in Figma if the gap is unintentional." |
| `asymmetric-size-coverage` | :570 | warning | "…has sizes [X] but other utilities also cover [Y]." |
| `incomplete-size-variant` | :549 | warning | "…is missing: u1, u2" |
| `non-suffix-vs-size-conflict` | :521 | warning | "…(v) conflicts with …-sm (v2). Size-specific value wins." |
| `orphaned-size-key` | :607 | hint | "size 'xs' appears on fewer utilities than its siblings…" |

All five carry an actionable, Figma-oriented `message`. The gap is not text — it is
**routing visibility**: in the Scan view these look like any other warning. The feature
adds the owner-verdict framing (and `asymmetric-variant-coverage` already embeds the
exact "Add … in Figma" list in its message).

### Non-goals (v1)

- **No count change.** The header counts are unchanged. (Advisory, like by-design.)
- **No scanner change.** No new emit logic, no severity change.
- **No `ScanIssue` field.** Owner classification is derived app-side from `issue.kind`.
- **No interaction.** No Copy, no Dismiss, no persisted state.

A future v2 could add a copy-able "tokens to add in Figma" list (would require a
structured field + scanner emit changes — deferred).

## Architecture

### New — `src/app/resolve/figma-fix.ts`

Mirrors `by-design.ts` (an owner classifier already living in `resolve/`):

```ts
import type { ScanIssue } from "@core/token-graph.js";

// These kind strings are emitted in src/scanner.ts (asymmetric-variant-coverage :868,
// asymmetric-size-coverage :570, incomplete-size-variant :549,
// non-suffix-vs-size-conflict :521, orphaned-size-key :607). ScanIssue.kind is typed
// `string` (open for extension), so a scanner-side kind rename will NOT surface as a
// compile error here — keep this set aligned on any rename. (Same caveat as
// BY_DESIGN_KINDS / CAPABILITY_DEVIATION_KINDS.)
export const FIGMA_FIX_KINDS: ReadonlySet<string> = new Set([
  "asymmetric-variant-coverage",
  "asymmetric-size-coverage",
  "incomplete-size-variant",
  "non-suffix-vs-size-conflict",
  "orphaned-size-key",
]);

/**
 * True when an issue's fix lives in the Figma token source (incomplete/inconsistent
 * coverage — the designer must add or align tokens). Advisory: there is no in-app
 * override.
 */
export function isFigmaFix(issue: ScanIssue): boolean {
  return FIGMA_FIX_KINDS.has(issue.kind);
}
```

**Home:** `src/app/resolve/` — the de-facto (Y) routing home (`heuristic-extendable.ts`,
`by-design.ts`, `resolved-issues.ts`).

### Changed — `src/app/components/ScanView.vue`

A new template branch in the issue-row affordance area renders the verdict badge when
`isFigmaFix(issue)` is true:

```
⚠ warning   button · 1 token
button.outline is defined on [solid] but missing on [outline, ghost]. Add
button-outline-border, button-ghost-border in Figma if the gap is unintentional.
🎨 fix in Figma
```

- Badge text is **constant** (`🎨 fix in Figma`); the specific "what to add" stays in
  `issue.message`.
- Styling: a muted **violet** pill — `bg-violet-100 text-violet-700
  dark:bg-violet-900/40 dark:text-violet-300` — distinct from by-design (zinc), the typo
  hint (sky), and the severity tags (amber/red). Title:
  "Fix in the Figma token source — add or align the missing/inconsistent tokens."
- Cleanly additive and mutually exclusive: the five Figma-Fix kinds are disjoint from
  the by-design, heuristic-extendable, and `possible-typo` kind-sets, so the badge never
  co-renders with `⊘ by-design`, the Resolve button, `✓ resolved`, or the typo hint.

## Data flow

None. `isFigmaFix` is a pure function over `issue.kind`. No new state, no new props on
ScanView, no `App.vue` change — identical to the by-design mechanism.

## Invariants & edge cases

- **Disjoint owners:** the five Figma-Fix kinds appear in no other owner's set.
- **`asymmetric-variant-coverage` severity varies** (warning when one variant defines
  it, else error) — the badge is severity-independent (keys off `kind`), so it renders
  in both cases.

## Testing

- `src/app/resolve/figma-fix.test.ts` — `isFigmaFix` returns `true` for the 5 kinds;
  `false` for `capability-gap` (by-design), `possible-typo`, `unsupported-part`, and
  `collection-anatomy-mismatch` (deliberately out of scope).
- `src/app/components/ScanView.figmafix.test.ts` — the badge renders for one fixture
  issue of each of the 5 kinds; does NOT render for a non-Figma-Fix issue; the
  `⊘ by-design` badge and the Resolve button do NOT appear for these kinds.

## Verification caveat

Like the typo hint, these coverage-gap kinds only fire when an export triggers them —
live verification may need a suitable export (the default sample may not trigger them).

## Deliberately out of scope (parked)

- `unresolved-alias` — looked like Figma-Fix but was an exporter bug (fixed in the
  plugin; real-world count is now 0; its "library/remote" message wording is inaccurate).
- `collection-anatomy-mismatch` — a genuine Figma structural fix, but a different theme
  (collection re-filing) → v2.
- `border-on-unframed-variant` — belongs to the **by-design** owner (Nuxt UI constraint);
  a separate future by-design extension, not Figma-Fix.
- v2 copy-able "tokens to add in Figma" list (structured field + scanner emit).
- The full 24-kind → owner routing table + an owner filter in ScanView.
