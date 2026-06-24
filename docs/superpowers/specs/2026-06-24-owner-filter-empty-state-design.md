# Owner-Filter Empty-State Polish — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — owner-filter polish

## Summary

The Scan view's Issues tab has two filter chip rows — Severity (all/error/warning/hint)
and Owner (all/Heuristic/Data-Quality/by-design/Figma-Fix/Manual-Dev/Other) — AND-combined
to produce `filteredIssues`. When that list is empty, ScanView shows a "No … issues."
message. Today the message only reflects the **severity** filter:

```html
<p v-if="filteredIssues.length === 0" class="text-xs text-zinc-400">
  No {{ severityFilter === 'all' ? '' : severityFilter + ' ' }}issues.
</p>
```

So filtering to an owner that has no issues (while other owners do) shows a misleading
"No issues." This polish makes the message reflect **both** active filters.

The empty-state message lagged because it predates the owner filter (added v0.55.0); the
filter *logic* (ScanView.vue:62-63) already AND-combines both — only the *explanation* of
the empty result was never updated.

## Wording rule (owner-label-prefix variant, chosen)

`No [ownerLabel ][severity ]issues.` — the owner label is omitted when owner is `"all"`,
the severity word is omitted when severity is `"all"`. The owner label comes from the
`OWNER_FILTERS` registry (single source — no second owner→text mapping).

| severity | owner | message |
|---|---|---|
| all | all | `No issues.` |
| warning | all | `No warning issues.` |
| all | figma-fix | `No Figma-Fix issues.` |
| warning | by-design | `No by-design warning issues.` |
| error | manual-dev | `No Manual-Dev error issues.` |
| all | other | `No Other issues.` |

## Architecture

A new pure, testable view-layer helper, mirroring the `owner-badges.ts` pattern from
v0.55.1 (view-layer presentation strings live as a pure module at the `src/app/` level,
**not** in `src/app/resolve/`):

### New — `src/app/empty-issues-message.ts`

```ts
import { OWNER_FILTERS, type OwnerFilter } from "./resolve/owner-of.js";

/**
 * The empty-state line for the Issues tab, reflecting both active filters:
 * "No [owner-label ][severity ]issues." Qualifiers are dropped when their filter is
 * "all". The owner label is read from OWNER_FILTERS (single source).
 */
export function emptyIssuesMessage(severity: string, owner: OwnerFilter): string {
  const ownerLabel =
    owner === "all" ? "" : (OWNER_FILTERS.find((f) => f.value === owner)?.label ?? "");
  const severityWord = severity === "all" ? "" : severity;
  const qualifier = [ownerLabel, severityWord].filter(Boolean).join(" ");
  return qualifier ? `No ${qualifier} issues.` : "No issues.";
}
```

The `owner` is typed `OwnerFilter` (already exported from owner-of.ts). The `severity`
param is typed `string` — the `"all"` sentinel is a plain compare, and this avoids
relocating the `SeverityFilter` type that currently lives locally inside ScanView (no
scope creep). The defensive `?? ""` on the label lookup never triggers for a real
`OwnerFilter` value (all are in OWNER_FILTERS) but keeps the function total.

### New — `src/app/empty-issues-message.test.ts`

Unit tests for the wording combinations: all/all → "No issues."; severity-only;
owner-only; both (`by-design` + `warning` → "No by-design warning issues."); the `other`
owner → "No Other issues."; and that the `"all"` owner skips the label.

### Changed — `src/app/components/ScanView.vue`

- Import `emptyIssuesMessage` from `../empty-issues-message.js`.
- Replace the inline expression at ScanView.vue:178 with
  `{{ emptyIssuesMessage(severityFilter, ownerFilter) }}` (the refs auto-unwrap to their
  values in template).

## Non-goals

- No change to the filter *logic* (ScanView.vue:62-63 already AND-combines both filters),
  the counts (`counts` / `ownerCounts`), or the chip rows.
- No relocation of the local `SeverityFilter` type out of ScanView.
- No change to which issues are subtracted from the header count (that's
  HeaderStatusStrip, unrelated).

## Testing

- `src/app/empty-issues-message.test.ts` — the wording combinations above (incl. the
  `other` and `all`-label-skip edges).
- Full suite green (a new test file adds new `it` cases → the suite count rises; the exact
  number is whatever the run reports — the gate is green + 0 failures).
