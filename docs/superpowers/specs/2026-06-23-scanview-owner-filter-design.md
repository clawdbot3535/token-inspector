# ScanView Owner Filter — Design

**Date:** 2026-06-23
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — cross-cutting (post-taxonomy)

## Summary

The (Y) owner taxonomy is complete: every scan deviation is routed to one of five
owners (Heuristic-Extension, Data-Quality, by-design, Figma-Fix, Manual-Dev), each
surfaced by a per-issue affordance/badge in the Scan view. This feature adds an **owner
filter** — a second chip row in the Scan view's Issues tab, mirroring the existing
severity filter, that filters the issue list by owner (plus an "Other" bucket for the
deviation kinds no owner claims yet). It also introduces the first single-source
`ownerOf(issue)` aggregator, which the parked 24-kind routing work will reuse.

## Scope

A second chip row labelled "Owner:" under the existing severity chip row, in the Issues
tab:

`All · Heuristic · Data-Quality · by-design · Figma-Fix · Manual-Dev · Other`

- Single-select; each chip shows a count (totals over all issues, like the severity
  chips).
- Selecting an owner filters the visible issue groups to that owner. **Combined with the
  severity filter via AND.**
- **"Other"** = issues whose `kind` is claimed by no owner (e.g. `snap-to-tailwind`,
  `mode-invariant-semantic`, `single-mode-semantic`, `unresolved-alias`,
  `border-on-unframed-variant`, `collection-anatomy-mismatch`). This is effectively the
  "still-to-route" view.
- "All" (default) shows everything.

### Non-goals

- **No badge refactor.** The five per-issue badge `v-if` branches in ScanView are NOT
  refactored to use `ownerOf` — that is a separate change. This feature is additive.
- **No filter persistence.** `ownerFilter` is component state, like `severityFilter`.
- **Owner counts are totals** over all issues, not conditioned on the current severity
  selection (matches the severity chips' existing behaviour; keeps it simple).
- No owner filtering on the Readiness/Forecast tabs (Issues tab only).

## Architecture

### New — `src/app/resolve/owner-of.ts`

The single-source owner aggregator + the filter registry:

```ts
import type { ScanIssue } from "@core/token-graph.js";
import { BY_DESIGN_KINDS } from "./by-design.js";
import { FIGMA_FIX_KINDS } from "./figma-fix.js";
import { MANUAL_DEV_KINDS } from "./manual-dev.js";
import { HEURISTIC_EXTENDABLE_KINDS } from "./heuristic-extendable.js";

export type Owner =
  | "heuristic" | "data-quality" | "by-design" | "figma-fix" | "manual-dev";

const DATA_QUALITY_KINDS: ReadonlySet<string> = new Set(["possible-typo"]);

// Owner kind-sets are disjoint (verified), so first match is the unique owner.
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
```

**No circular import:** `owner-of.ts` imports the owner modules for their `*_KINDS`
sets; those modules import only `owners.ts` (the `makeOwnerPredicate` factory), never
`owner-of.ts`.

### Changed — `src/app/resolve/heuristic-extendable.ts`

`HEURISTIC_EXTENDABLE_KINDS` is currently module-private. Add `export` to it. No
behaviour change — the existing `heuristic-extendable.test.ts` stays green (regression
guard).

### Changed — `src/app/components/ScanView.vue`

- Import `ownerOf`, `OWNER_FILTERS`, and the `OwnerFilter` type.
- Add `const ownerFilter = ref<OwnerFilter>("all")`.
- Add an `ownerCounts` computed: a record keyed by `OwnerFilter` value, counting all
  issues (`ownerOf(i) ?? "other"`), with `all` = total.
- Extend `filteredIssues` to AND the owner filter:
  ```ts
  report.issues.filter((i) =>
    (severityFilter.value === "all" || i.severity === severityFilter.value) &&
    (ownerFilter.value === "all" || (ownerOf(i) ?? "other") === ownerFilter.value),
  )
  ```
- Add a second chip row in the template, reusing the exact severity-chip markup/styling
  but driven by `OWNER_FILTERS` / `ownerFilter` / `ownerCounts`, with
  `data-testid="owner-filter"`. The row wraps if needed; all seven chips always show
  (consistent with the four always-shown severity chips, including 0 counts).

## Data flow

`ownerFilter` is a local ref. `ownerOf` is a pure function over `issue.kind`. The
`groups` computed already derives from `filteredIssues`, so the owner filter flows
through automatically. No new props, no emits, no `App.vue` change.

## Invariants & edge cases

- **Disjoint owners** → `ownerOf` returns at most one owner; first-match iteration is
  correct.
- An issue whose `kind` matches no owner set → `ownerOf` returns `null` → bucketed as
  "other".
- Empty owner buckets still render their chip (count 0), like the severity chips.

## Testing

- `src/app/resolve/owner-of.test.ts` — `ownerOf` returns the right owner for one kind
  from each of the five owners; returns `null` for an un-owned kind (e.g.
  `snap-to-tailwind`); `OWNER_FILTERS` has the expected seven values in order.
- `src/app/components/ScanView.ownerfilter.test.ts` — with a report mixing owners:
  selecting an owner chip narrows the visible issues to that owner; "All" shows all;
  "Other" shows only un-owned issues; an owner chip combined with a severity chip
  applies both; chip counts render.
- **Unchanged** `heuristic-extendable.test.ts` — regression guard for the added export.

## Deliberately out of scope (parked)

- Refactoring the five badge `v-if` branches to be driven by `ownerOf` / a shared owner
  registry (the badge metadata — glyph/color/title — could later move into the registry;
  separate change).
- Owner-filter persistence across sessions.
- Counts conditioned on the other active filter.
- The full 24-kind → owner routing table (this filter's "Other" bucket is the view onto
  that backlog).
