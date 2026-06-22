# by-design / Constraint Owner v1 — Design

**Date:** 2026-06-22
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — third owner

## Summary

The (Y) deviation-routing track routes every scan deviation to an *owner* who can
resolve it. Two owners ship today:

- **Heuristic-Extension** (v0.54.0) — active: a `Resolve →` button injects a live
  slot-mapping override. Kinds: `unsupported-part`, `component-looks-custom`.
- **Data-Quality** (v0.54.4) — advisory: a `💡 from → to` typo rename hint. Kind:
  `possible-typo`.

This adds the **by-design / Constraint** owner: the owner for deviations that are
inherent Nuxt UI architectural constraints — *nobody* fixes them, they are correct
as-is. v1 is **advisory-only** (symmetric to Data-Quality): it reframes the affected
issues with a `⊘ by-design` owner verdict so the user can trust them as non-problems.

## Scope

Three "capability-family" issue kinds get the by-design owner verdict:

| Kind | scanner.ts | severity | notes |
|------|-----------|----------|-------|
| `state-via-prop` | :173 | warning | state applied via a Nuxt UI prop, not a recipe class |
| `unsupported-state` | :191 | warning | component is stateless — no equivalent for these states |
| `capability-gap` | :368 | hint | a real Nuxt slot the Figma tokens don't fill (`tokenIds: []`, component-scoped) |

All three already carry a rich `message` explaining *why*. The gap is not text — it
is **routing visibility**: in the Scan view these look like any other warning. The
feature adds the owner-verdict framing.

### Non-goals (v1)

- **No count change.** The header `N warnings` is unchanged. (The user chose
  "explain", not "dismiss".)
- **No scanner change.** No new emit logic, no severity change.
- **No `ScanIssue` field.** Owner classification is a presentation/routing concern,
  derived app-side from `issue.kind`.
- **No interaction.** No Copy, no Dismiss, no persisted state — there is nothing to
  copy and nothing to fix.

These are deliberate v1 boundaries. A future v2 could add an "accept / dismiss"
action that subtracts by-design issues from the count (a distinct semantic state from
`resolved`).

## Architecture

### New — `src/app/resolve/by-design.ts`

Mirrors `heuristic-extendable.ts` (an owner classifier already living in `resolve/`):

```ts
import type { ScanIssue } from "@core/token-graph.js";

// These kind strings are emitted in src/scanner.ts. ScanIssue.kind is typed
// `string` (open for extension), so a scanner-side kind rename will NOT surface as a
// compile error here — keep this set aligned on any rename. (Same caveat as
// CAPABILITY_DEVIATION_KINDS in src/app/kit-behaviors.ts.)
export const BY_DESIGN_KINDS: ReadonlySet<string> = new Set([
  "capability-gap",
  "state-via-prop",
  "unsupported-state",
]);

/** True when an issue is an inherent Nuxt UI constraint — the by-design owner's
 *  domain. Advisory: there is no source fix and no in-app override. */
export function isByDesign(issue: ScanIssue): boolean {
  return BY_DESIGN_KINDS.has(issue.kind);
}
```

**Standalone set — not reused from `CAPABILITY_DEVIATION_KINDS`** (in
`kit-behaviors.ts`). That set also contains `unsupported-part`, which is
*heuristic-extendable* (the opposite owner), plus `disabled-via-opacity` and
`resting-shadowed-by-state` which are out of v1 scope.

**Home:** `src/app/resolve/` — already the de-facto (Y) routing home
(`heuristic-extendable.ts`, `resolved-issues.ts`).

### Changed — `src/app/components/ScanView.vue`

A new template branch in the issue-row affordance area renders the verdict badge when
`isByDesign(issue)` is true:

```
⚠ warning   alert · 1 token
`alert-success-border` targets the success state, but Nuxt UI v4's alert is
stateless — no override emitted.
⊘ by-design · Nuxt UI constraint — expected
```

- Badge text is **constant** (kind-agnostic) for v1; the kind-specific *why* is
  already in `issue.message`.
- Styling: a muted/neutral pill (not alarming red/yellow), signalling
  "informational / expected", matching existing ScanView tag conventions.
- Cleanly additive: by-design kinds are never heuristic-extendable and never
  `possible-typo`, so the badge is mutually exclusive with the Resolve button,
  `✓ resolved`, and the typo hint in practice.

## Data flow

None. `isByDesign` is a pure function over `issue.kind`. No new state, no new props
on ScanView, no `App.vue` change. (Contrast the Heuristic owner, which needs a
`resolveOverride` ref + injection — by-design persists nothing.)

## Invariants & edge cases

- **Disjoint owners:** by-design ∩ heuristic-extendable = ∅. Badge and Resolve
  button cannot both apply to one issue.
- **`capability-gap` has `tokenIds: []`** → the badge still renders (component-scoped,
  no token-count dependency).

## Testing

- `src/app/resolve/by-design.test.ts` — `isByDesign` returns `true` for the 3 kinds;
  `false` for `unsupported-part`, `possible-typo`, `malformed-value`, and other kinds.
- `src/app/components/ScanView.bydesign.test.ts` — the badge renders for one fixture
  issue of each of the 3 kinds; does NOT render for a non-by-design issue; the
  Resolve button / `✓ resolved` do NOT appear for these kinds.

## Out of scope (parked)

- v2 "accept / dismiss" action + count subtraction (distinct state from `resolved`).
- Other 2 owners (Figma-Fix, Manual-Dev) + Data-Quality `malformed-value`.
- Broader by-design kinds (`single-mode-semantic`, `mode-invariant-semantic`,
  `disabled-via-opacity`, `resting-shadowed-by-state`).
- Full 24-kind core-side routing (Approach C — rejected for v1).
