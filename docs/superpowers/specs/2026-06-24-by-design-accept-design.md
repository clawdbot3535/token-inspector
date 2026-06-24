# by-design owner v2 — accept / dismiss — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — by-design owner v2

## Summary

The by-design owner (v0.54.5) flags inherent Nuxt UI constraints with an advisory
`⊘ by-design` badge but, by design, offers no action — v1 explains, it doesn't dismiss.
This v2 adds the dismiss half: an **Accept** toggle on by-design issues that marks them
acknowledged ("reviewed, expected, not a problem") and **subtracts them from the header
issue count** (`N errors · N warnings · N hints`).

It is the first *passive* resolution action, orthogonal to the Heuristic owner's active
*resolve*: resolve means "I'll fix this token" (token-id-keyed, feeds the live render);
accept means "this is expected, stop counting it" (issue-id-keyed, presentation/count
only). The two meet only in the header count, which now subtracts `resolved ∪ accepted`.

## Scope

- by-design issues (`capability-gap`, `state-via-prop`, `unsupported-state`) get an
  **Accept** button in the Scan view; clicking toggles an accepted state (**✓ accepted**,
  click again to un-accept).
- Accepted by-design issues are subtracted from the `HeaderStatusStrip` counts.
- State is keyed by `issue.id` (not token id — `capability-gap` has empty `tokenIds`)
  and held **in-session** (a plain `ref`, like the existing `resolveOverride`; resets on
  reload).

### Non-goals

- **Only by-design is acceptable.** figma-fix / data-quality / manual-dev / heuristic are
  out of scope (no Accept affordance, never subtracted).
- **No localStorage persistence** (in-session, matching the resolve pattern). Persisting
  the same set is a future fast-follow.
- **No "hide accepted" toggle** — accepted issues stay visible in the list (like
  `✓ resolved`), only the count drops.
- No scanner / `ScanIssue` / recipe-engine / export change. Accept does not feed the
  recipe engine (so, unlike `resolveOverride`, it is NOT `provide`d — just props/emits).

## Architecture

Parallel to the Heuristic resolve flow (`resolveOverride` → `resolvedIssueIds` →
HeaderStatusStrip / ScanView), but a distinct, issue-id-keyed, presentation-only state.

### New — `src/app/resolve/accepted-issues.ts`

Mirrors `resolved-issues.ts`:

```ts
import type { ScanReport } from "@core/token-graph.js";
import { ownerOf } from "./owner-of.js";

/**
 * Issue ids the user has accepted as by-design (acknowledged, not a problem). Only
 * by-design issues can be accepted — a defensive guard, since only they expose the
 * Accept affordance. The single source of truth for "this deviation is accepted".
 */
export function acceptedByDesignIds(
  report: ScanReport,
  accepted: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const issue of report.issues) {
    if (ownerOf(issue) === "by-design" && accepted.has(issue.id)) out.add(issue.id);
  }
  return out;
}
```

### Changed — `src/app/App.vue`

- `const acceptedIds = ref<Set<string>>(new Set());` (in-session, mirrors
  `resolveOverride`'s lifecycle; NOT `provide`d).
- A toggle handler:
  ```ts
  function onToggleAccept(issueId: string): void {
    const next = new Set(acceptedIds.value);
    if (next.has(issueId)) next.delete(issueId);
    else next.add(issueId);
    acceptedIds.value = next;
  }
  ```
- Pass `:accepted="acceptedIds"` to both `ScanView` and `HeaderStatusStrip`; wire
  `@accept="onToggleAccept"` on `ScanView`.

### Changed — `src/app/components/HeaderStatusStrip.vue`

- Add prop `accepted?: ReadonlySet<string>`.
- `const acceptedIds = computed(() => acceptedByDesignIds(props.report, props.accepted ?? new Set<string>()));`
- Each severity count gains a second exclusion:
  `!resolvedIds.value.has(i.id) && !acceptedIds.value.has(i.id)`.

### Changed — `src/app/components/ScanView.vue`

- Add prop `accepted?: ReadonlySet<string>` and emit `(event: "accept", issueId: string)`.
- `function issueAccepted(issue: ScanIssue): boolean { return props.accepted?.has(issue.id) ?? false; }`
- For by-design issues (`ownerOf(issue) === "by-design"`), near the ⊘ badge, render:
  - if not accepted → an **Accept** button (`data-testid="accept-issue"`,
    `@click.stop="$emit('accept', issue.id)"`),
  - else → **✓ accepted** (`data-testid="accept-done"`, also clickable to un-accept via
    the same `accept` emit — toggle), in a colour distinct from the emerald `✓ resolved`
    (e.g. teal/amber).

## Data flow

`App.acceptedIds` (ref) → `:accepted` prop → ScanView (affordance state) +
HeaderStatusStrip (count). ScanView click → `accept(issueId)` → App toggles the set →
both re-render. Pure presentation/count; no scanner/engine/export involvement.

## Invariants & edge cases

- **Orthogonal to resolved:** by-design issues are never in `resolvedIssueIds` (they have
  no resolvable tokens), so `resolved` and `accepted` never double-count the same issue.
- **`capability-gap` (tokenIds: [])** works because acceptance is id-keyed.
- A stale accepted id (from a different export) matches no issue → harmless no-op.
- Accept affordance only renders for by-design → the accepted set only ever holds
  by-design ids; the helper's `ownerOf` guard is defensive.

## Testing

- **New** `src/app/resolve/accepted-issues.test.ts` — `acceptedByDesignIds` returns the
  by-design issue ids present in the accepted set; excludes a non-by-design id even if it
  is in the set; returns empty for an empty accepted set.
- **`HeaderStatusStrip`** (extend its test) — a by-design issue in the accepted set is
  subtracted from its severity count (in addition to resolved).
- **New** `src/app/components/ScanView.accept.test.ts` — a by-design issue renders the
  Accept button; clicking emits `accept` with the issue id; with that id in the
  `accepted` prop it renders `✓ accepted`; a non-by-design issue has no Accept affordance.

## Deliberately out of scope (parked)

- Generalising accept to the other advisory owners (figma-fix / data-quality / manual-dev).
- localStorage persistence of the accepted set.
- A "hide accepted issues" filter/toggle.
