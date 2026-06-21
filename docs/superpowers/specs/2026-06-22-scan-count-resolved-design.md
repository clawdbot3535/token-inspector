# (Y) — Scan Summary Count Subtracts Resolved Deviations — Design Spec

**Status:** Draft for review
**Date:** 2026-06-22
**Topic:** Make the scan summary's `N errors · N warnings · N hints` counts (the `HeaderStatusStrip`) **subtract fully-resolved deviations**, so the count reflects resolution progress. A presentation-layer tweak — `scanGraph`, `customParts`, and the export are untouched. Chosen (option **A**) over the deeper "override-aware `scanGraph`" (B).

---

## Mission context

(Y) v1 surfaces deviations and lets the user resolve them into a session slot-mapping override; v0.54.1 (#2) marks a resolved issue **✓ resolved** in the Scan view, but the prominent scan-summary count (`HeaderStatusStrip`, "Scan: N errors · N warnings …") still includes resolved deviations — so the headline number doesn't reflect progress.

**Why A, not B (the deep override-aware `scanGraph`):** threading the session override into `scanGraph` (so resolved tokens are no longer flagged) would drop the count too, but it makes resolved issues **disappear** entirely — superseding the just-shipped #2 ✓ — and couples to `customPartsByComponent`. (The recon de-risked the "vanish" concern: `chip`/`sidebar` are in `KNOWN_CUSTOM_COMPONENTS` so they never drop from `customParts` regardless of the scan. But B still supersedes #2 and is more invasive.) The export-aware variant (C) is also rejected: the `slot-mapping.json` download is the canonical persistence; baking the override into the in-app `app.config.ts` export would duplicate it and de-faithful the export. **A keeps #2's ✓, touches nothing risky, and delivers the visible goal (the count drops).**

**Confirmed mechanism (recon):** `HeaderStatusStrip` (`src/app/components/HeaderStatusStrip.vue`) takes `report: ScanReport` and computes `errorCount`/`warningCount`/`hintCount` as `props.report.issues.filter((i) => i.severity === X).length`. `ScanView` (v0.54.1) already has an inline `issueResolved(issue)` predicate (the issue has ≥1 heuristic-extendable token and all are in the resolved set). `App.vue` already computes `resolvedTokenIds = computed(() => new Set(Object.keys(resolveOverride.value)))` and passes it to `ScanView`.

---

## Goal

The `HeaderStatusStrip` counts exclude fully-resolved deviations: as the user resolves deviations, the `N warnings` (and `N errors`/`N hints` where applicable) drop to reflect remaining work. `ScanView`'s per-issue ✓ stays. No change to `scanGraph`, `customParts`, or the export.

**Success criteria:**
- A fully-resolved deviation (all its heuristic-extendable tokens in the session override) is excluded from the `HeaderStatusStrip` severity counts.
- A partially-resolved deviation (some resolvable tokens still unresolved) still counts.
- A pure `resolvedIssueIds(report, resolved)` helper is the single source of truth for "this deviation is handled"; `ScanView`'s `issueResolved` uses it too (DRY).
- `scanGraph`/`customParts`/export and standard non-resolve behaviour are unchanged; existing tests stay green.

---

## Scope

**In scope:**
- A pure **`resolvedIssueIds(report, resolved)`** helper.
- `HeaderStatusStrip.vue`: a `resolved?` prop; the counts subtract fully-resolved issues.
- `App.vue`: pass `resolvedTokenIds` to `HeaderStatusStrip`.
- `ScanView.vue`: refactor `issueResolved` to use the shared helper (DRY).

**Out of scope (parked):**
- **B — override-aware `scanGraph`** (resolved issues disappear from the report; supersedes #2 ✓). Parked.
- **C — override-aware export** (`app.config.ts` reflecting the session override). Rejected (the `slot-mapping.json` is the canonical persistence).

---

## Current state (key seams)

- `src/app/components/HeaderStatusStrip.vue` — `Props { report: ScanReport }`; `errorCount`/`warningCount`/`hintCount` = `report.issues.filter(severity === X).length`; rendered as `N errors · N warnings · N hints`.
- `src/app/components/ScanView.vue` — `issueResolved(issue)` (v0.54.1): `const resolvable = issue.tokenIds.filter((t) => resolvableTokenIds.value.has(t)); return resolvable.length > 0 && resolvable.every((t) => props.resolved.has(t));` where `resolvableTokenIds = new Set(heuristicExtendable(props.report).map((r) => r.tokenId))`.
- `src/app/App.vue` — `resolvedTokenIds = computed(() => new Set(Object.keys(resolveOverride.value)))`; mounts `<HeaderStatusStrip :report="scanReport" />` (around line 658).
- `src/app/resolve/heuristic-extendable.ts` — `heuristicExtendable(report) → ResolvableDeviation[]`.

---

## Design — units

### 1. `resolvedIssueIds(report, resolved)` (pure helper)
`src/app/resolve/resolved-issues.ts`:
```ts
import type { ScanReport } from "@core/token-graph.js";
import { heuristicExtendable } from "./heuristic-extendable.js";

/** Issue ids that are FULLY resolved: the issue has ≥1 heuristic-extendable
 *  token and every such token is in the session override (`resolved`). The
 *  single source of truth for "this deviation is handled". */
export function resolvedIssueIds(report: ScanReport, resolved: ReadonlySet<string>): Set<string> {
  const resolvableTokenIds = new Set(heuristicExtendable(report).map((r) => r.tokenId));
  const out = new Set<string>();
  for (const issue of report.issues) {
    const resolvable = issue.tokenIds.filter((t) => resolvableTokenIds.has(t));
    if (resolvable.length > 0 && resolvable.every((t) => resolved.has(t))) out.add(issue.id);
  }
  return out;
}
```

### 2. `HeaderStatusStrip.vue` — counts subtract resolved
- Add `resolved?: ReadonlySet<string>` to `Props` (default empty).
- Compute `const resolvedIds = computed(() => resolvedIssueIds(props.report, props.resolved ?? new Set<string>()));`
- Each count excludes resolved issues: `props.report.issues.filter((i) => i.severity === X && !resolvedIds.value.has(i.id)).length`.

### 3. `App.vue` — pass the resolved set
- On the `<HeaderStatusStrip :report="scanReport" ... />` mount, add `:resolved="resolvedTokenIds"`.

### 4. `ScanView.vue` — DRY `issueResolved`
- Replace the inline body of `issueResolved` with the shared helper: compute `const resolvedIds = computed(() => resolvedIssueIds(props.report, props.resolved));` and `function issueResolved(issue) { return resolvedIds.value.has(issue.id); }`. (`issueResolvableToken` keeps using `resolvableTokenIds` — it's about the first *unresolved* resolvable token, a separate concern.)

---

## Data flow

`App.resolveOverride → resolvedTokenIds (Set) → HeaderStatusStrip :resolved + ScanView :resolved → resolvedIssueIds(report, resolved) → counts/✓ exclude fully-resolved issues`. Applying a resolution updates `resolveOverride` → `resolvedTokenIds` → both components recompute. The `scanReport` itself is unchanged.

## Error handling

- No override → `resolved` empty → `resolvedIssueIds` empty → counts identical to today.
- A resolved token belonging to a multi-token issue with other unresolved resolvable tokens → the issue is NOT in `resolvedIssueIds` → still counts (consistent with the ✓ rule).

## Testing

- **Unit (pure):** `resolvedIssueIds` — a report with one `unsupported-part` issue (`tokenIds: ["chip-x"]`) + `resolved: {"chip-x"}` → the issue id is in the set; with `resolved` empty → not; a two-resolvable-token issue with one resolved → not in the set.
- **Component:** `HeaderStatusStrip` mount — with a warning issue + `resolved` containing its token, `warningCount` renders one fewer than without `resolved`.
- `ScanView` existing resolve tests stay green after the `issueResolved` refactor (same behaviour).
- Pre-commit gate (vue-tsc + full vitest) green.

## Resolved decisions (review-approved)
1. **A (count-only presentation)**, not B (override-aware `scanGraph`, which supersedes #2 ✓) or C (override-aware export, which duplicates `slot-mapping.json`).
2. A shared `resolvedIssueIds` helper is the single source of truth; `ScanView` + `HeaderStatusStrip` both use it.

## Flagged for the plan
- Confirm the exact `HeaderStatusStrip` mount in `App.vue` (around line 658) + that `ScanView`'s `props.resolved` already exists (it does, from v0.54.1).

## Future (parked)
- **B** override-aware `scanGraph` (resolved issues disappear; would supersede #2's ✓ — a deliberate UX change, not now).
- The other (Y) owners + the full 24-kind routing.
