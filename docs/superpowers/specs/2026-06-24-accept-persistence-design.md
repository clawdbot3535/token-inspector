# by-design accept → localStorage persistence — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — by-design accept fast-follow

## Summary

The by-design **Accept** state (v0.57.0) is held in an in-session `acceptedIds` ref in
`App.vue` and resets on reload. This makes it persist to `localStorage`, so accepted
by-design issues stay cleared from the header count across sessions — the actual point
of Accept (otherwise the user re-accepts every reload).

It mirrors the existing `expandedPaths` persistence (a `Set<string>` ↔ localStorage as a
JSON array, guarded + try/catch), but extracts the load/save into a small testable
module so the logic can be unit-tested without a heavy App mount test.

## Scope

- Persist exactly the `acceptedIds` set (issue ids the user has accepted as by-design):
  load on mount, save on every Accept toggle.

### Non-goals

- **Do NOT persist `resolveOverride`** — it stays in-session by design (it feeds the
  live recipe engine; transient).
- **No pruning of stale ids.** Ids from a different export sit harmlessly in the set
  (`acceptedByDesignIds` only matches issues present in the current report, so a stale id
  is never subtracted). Pruning to the current report is a possible v2 refinement.
- No storage-key versioning/migration (new key, empty default).
- No change to ScanView / HeaderStatusStrip / the `acceptedByDesignIds` helper — they
  consume the `accepted` prop and are persistence-agnostic.

## Architecture

### New — `src/app/accepted-storage.ts`

A small localStorage-backed module, mirroring App.vue's `expandedPaths`
load/persist logic (`loadExpanded`/`persistExpanded`) but as a reusable, testable unit:

```ts
export const ACCEPTED_STORAGE_KEY = "inspector.accepted";

/** The accepted by-design issue ids persisted from a previous session (empty if none
 *  / localStorage unavailable / malformed). */
export function loadAcceptedIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ACCEPTED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((s) => typeof s === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function saveAcceptedIds(set: ReadonlySet<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACCEPTED_STORAGE_KEY, JSON.stringify([...set]));
}
```

(This is the same shape as the inline `loadExpanded`/`persistExpanded` in App.vue;
extracting it makes it unit-testable. `expandedPaths` itself is left inline — out of
scope to refactor.)

### Changed — `src/app/App.vue`

- Import `loadAcceptedIds`, `saveAcceptedIds` from `./accepted-storage.js`.
- Initialize from storage:
  ```ts
  const acceptedIds = ref<Set<string>>(loadAcceptedIds());   // was: ref(new Set())
  ```
- Save on every toggle (mirrors `toggleExpanded` → `persistExpanded(next)`):
  ```ts
  function onToggleAccept(issueId: string): void {
    const next = new Set(acceptedIds.value);
    if (next.has(issueId)) next.delete(issueId);
    else next.add(issueId);
    acceptedIds.value = next;
    saveAcceptedIds(next);
  }
  ```

## Data flow

Mount → `loadAcceptedIds()` seeds the ref → `:accepted` prop to ScanView +
HeaderStatusStrip (unchanged). Accept toggle → `onToggleAccept` updates the ref AND calls
`saveAcceptedIds`. The consumers are persistence-agnostic.

## Edge cases

- localStorage unavailable (`typeof localStorage === "undefined"`) → guard → no-op /
  empty Set (matches `expandedPaths`).
- Malformed JSON or non-array → try/catch → empty Set.
- Stale ids from another export → remain in the set, never matched/subtracted (harmless;
  set stays small).

## Testing

- **New** `src/app/accepted-storage.test.ts` (jsdom for localStorage):
  - `loadAcceptedIds()` returns empty when the key is absent.
  - Round-trip: `saveAcceptedIds(new Set(["a","b"]))` then `loadAcceptedIds()` returns a
    set equal to `{a, b}`.
  - Malformed JSON in the key → `loadAcceptedIds()` returns empty.
  - A non-array JSON value (e.g. `"5"`) → returns empty.
  - (Reset `localStorage`/`removeItem` between cases.)
- The App.vue glue (ref init + save-in-toggle) is 2 lines, verified by `npm run typecheck`
  + the existing accept tests (ScanView/HeaderStatusStrip set the `accepted` prop
  directly, so they are persistence-independent and stay green). No new App mount test.

## Deliberately out of scope (parked)

- Pruning stale accepted ids to the current report.
- Persisting other in-session state (resolveOverride stays transient).
- Refactoring `expandedPaths` to use the new module (it stays inline).
