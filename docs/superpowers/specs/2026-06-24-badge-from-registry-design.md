# Badge-from-Registry Consolidation — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — cross-cutting cleanup (post owner filter)

## Summary

The five (Y) owners each surface a per-issue affordance in the Scan view. Three of them
are **static advisory badges** with structurally identical markup differing only by
colour, glyph/label, `data-testid`, and `title`: `by-design` (⊘, zinc), `figma-fix`
(🎨, violet), `manual-dev` (🔧, teal). They are currently three near-duplicate
`<span v-if="is*(issue)">` branches in `ScanView.vue`.

This refactor consolidates them into a single registry-driven badge, driven by the
`ownerOf(issue)` aggregator shipped in v0.55.0, plus a small follow-on: the typo-hint
branch's gate changes from the hardcoded `issue.kind === 'possible-typo'` to
`ownerOf(issue) === 'data-quality'`, removing the `possible-typo` string literal from
`ScanView.vue` (it then lives only in `owner-of.ts`'s `DATA_QUALITY_KINDS`).

**This is a behaviour-preserving refactor** — same badges, `data-testid`s, colours,
titles, and text. The existing badge/typo tests are the regression guard.

## Scope

- The three static badge `<span>`s (currently `ScanView.vue:220–237`) collapse into one
  registry-driven `<span>`.
- The typo-hint gate (`ScanView.vue:213`) changes to `ownerOf(issue) === 'data-quality'
  && issue.typoTo`. The typo hint's interactive parts (the `from → to` text + the Copy
  button) are unchanged.

### Non-goals

- **No visible change.** Identical rendered badges (testid, colour classes, title,
  glyph + label), identical typo hint.
- **The interactive affordances are untouched** — the Resolve button, `✓ resolved`, and
  the typo hint's Copy/from→to. Only the typo hint's *gate* changes.
- **`owner-of.ts` stays logic-only.** Badge presentation (Tailwind classes, emoji
  glyphs) lives in the new view-layer module, not the resolve layer.
- No new owner, no scanner change, no `ScanIssue` change.
- The heuristic and data-quality owners get no static badge (they have the interactive
  Resolve button and typo hint respectively).

## Architecture

### New — `src/app/owner-badges.ts`

A view-layer registry of the static owner badges (sibling to `scan-grouping.ts`):

```ts
import type { Owner } from "./resolve/owner-of.js";

export interface OwnerBadge {
  /** Tailwind classes for the muted pill (light + dark). */
  cls: string;
  /** Hover / screen-reader tooltip. */
  title: string;
  /** Visible glyph + label text. */
  label: string;
}

// Only three of the five (Y) owners have a static badge. `heuristic` uses the
// interactive "Resolve →" button and `data-quality` the interactive typo hint, so
// neither has an entry here. (This map intentionally holds presentation — Tailwind +
// glyphs — which is why it lives in the view layer, not owner-of.ts.)
export const OWNER_BADGES: Partial<Record<Owner, OwnerBadge>> = {
  "by-design": {
    cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    title: "Nuxt UI constraint — expected; no fix needed",
    label: "⊘ by-design",
  },
  "figma-fix": {
    cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    title: "Fix in the Figma token source — add or align the missing/inconsistent tokens",
    label: "🎨 fix in Figma",
  },
  "manual-dev": {
    cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    title:
      "Resolvable only by hand-coding in your Nuxt app (a custom recipe or a CSS override against Nuxt's default)",
    label: "🔧 hand-code",
  },
};

/** The static badge for an owner, or undefined (heuristic / data-quality / no owner). */
export function ownerBadge(owner: Owner | null): OwnerBadge | undefined {
  return owner ? OWNER_BADGES[owner] : undefined;
}
```

Imports only the `Owner` **type** from `owner-of.ts` — no logic, no cycle.

### Changed — `src/app/components/ScanView.vue`

1. Import `ownerBadge` from `../owner-badges.js` (`ownerOf` is already imported).
2. Replace the three static badge `<span>`s (by-design / figma-fix / manual-dev) with a
   single one:

   ```html
   <span
     v-if="ownerBadge(ownerOf(issue))"
     class="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
     :class="ownerBadge(ownerOf(issue))!.cls"
     :data-testid="ownerOf(issue)"
     :title="ownerBadge(ownerOf(issue))!.title"
   >{{ ownerBadge(ownerOf(issue))!.label }}</span>
   ```

   `:data-testid="ownerOf(issue)"` yields `"by-design"` / `"figma-fix"` / `"manual-dev"`
   exactly when its badge renders — preserving the existing testids.
3. Change the typo-hint gate from `issue.kind === 'possible-typo' && issue.typoTo` to
   `ownerOf(issue) === 'data-quality' && issue.typoTo`.

## Data flow

None. `ownerBadge` is a pure lookup; `ownerOf` is a pure function. Calling them a few
times per row in the template matches the file's existing style (e.g.
`issueResolvableToken(issue)` is already called in both `v-if` and `@click`). Both are
cheap and side-effect-free.

## Invariants & edge cases

- `ownerOf(issue)` ∈ {heuristic, data-quality, other(null)} → `ownerBadge` returns
  undefined → no static badge (correct: those owners use other affordances or none).
- The single badge is mutually exclusive with the Resolve button / `✓ resolved` / typo
  hint by construction (disjoint owner kind-sets), exactly as the three separate badges
  were.

## Testing

- **New** `src/app/owner-badges.test.ts` — `ownerBadge("by-design"/"figma-fix"/
  "manual-dev")` returns the correct badge (label glyph + colour class substring);
  `ownerBadge("heuristic"/"data-quality"/null)` returns `undefined`.
- **Regression guard — unchanged:**
  - `ScanView.bydesign.test.ts`, `ScanView.figmafix.test.ts`,
    `ScanView.manualdev.test.ts` — assert the badge `data-testid` + text per owner; the
    single-span version must reproduce them exactly.
  - `ScanView.typo.test.ts` — covers the changed typo gate: a `possible-typo` fixture
    (→ `ownerOf` = `data-quality`) still renders the hint + Copy; an `unsupported-part`
    fixture (→ `heuristic`) still does not.
  These passing **without modification** is the proof the refactor is behaviour-preserving.

## Deliberately out of scope (parked)

- Driving the interactive affordances (Resolve button, typo hint, `✓ resolved`) from the
  registry — they are not static badges.
- The owner-filter empty-state polish (message ignores the owner constraint).
- Any colour/label restyling of the badges.
