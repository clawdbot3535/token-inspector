# (Y) #2 — Override-Aware Resolve Affordance — Design Spec

**Status:** Draft for review
**Date:** 2026-06-21
**Topic:** Make the (Y) v1 Resolve affordance **override-aware**: once a deviation's token has been resolved (it's in the session `slot-mapping.json` override), stop offering it for resolution and mark it **✓ resolved**. Closes v1 limitation #2 ("resolved issues don't drop out"). Localized to the resolve UI — no scanner/export change.

---

## Mission context

(Y) v1 (v0.54.0, [[deviation-routing-y]]) added a **Resolve →** button in the Scan view for tokens the slot-mapping heuristic can't place (`unsupported-part` / `component-looks-custom`). After **Apply**, the override is stored (`App.vue`'s `resolveOverride` ref) and the live recipe re-renders — but the Scan view still shows the **Resolve →** button on the now-resolved token, because the resolvable set isn't override-aware. This nags the user with already-handled items.

**Why the localized approach (recon-grounded):** the deep alternative — threading the override into `scanGraph` so resolved tokens genuinely drop from `unsupported-part` — is feasible (the detector gates on `getSlotMapping(node.id, undefined, …)` at `scanner.ts:165`; passing the override would exclude resolved tokens from `nullTokensByComponent`). BUT the same null-analysis feeds `customPartsByComponent` → the custom-components export. A resolved **chip** token (chip is custom) would drop from `customParts` yet NOT be caught by `buildComponentRecipes` (chip renders via `buildCustomRecipes`, which doesn't consume the override) → **the token would vanish from both outputs.** So the deep "override-aware scanGraph" requires v1 limitation #1 (custom-component override support) first. This spec does the **localized** version: the resolve *affordance* (not the scan report) becomes override-aware.

---

## Goal

In the Scan view, a deviation whose resolvable token(s) are all in the session override shows **✓ resolved** instead of a **Resolve →** button; a deviation with a still-unresolved resolvable token keeps offering **Resolve →** (for that token). The `scanReport`, `customParts`, and export are unchanged.

**Success criteria:**
- A resolved token's issue shows **✓ resolved** (no Resolve button) once all its heuristic-extendable tokens are in the override.
- An issue with multiple resolvable tokens still shows **Resolve →** while any of them is unresolved (targeting the first unresolved one).
- No change to `scanGraph`, `customPartsByComponent`, the export, or any non-resolve UI.
- Existing tests stay green; the resolve-loop (apply → live re-render → download) is unaffected.

---

## Scope

**In scope:**
- `ScanView.vue`: the resolvable-token computation + the template become override-aware (Resolve button targets the first *unresolved* resolvable token; a **✓ resolved** indicator when all are resolved).
- `App.vue`: derive `resolvedTokenIds` from the session override and pass it to `ScanView`.

**Out of scope (parked):**
- **Deep override-aware `scanGraph`** (the warnings count dropping, `customParts`/export re-routing) — needs v1 limitation #1 (custom-component override support) first, else custom tokens vanish.
- Custom-component live-render (#1) and the other four (Y) owners.

---

## Current state (key seams)

- `App.vue`: owns `const resolveOverride = ref<SlotMappingOverride>({})`, mounts `<ScanView :report @select-tokens @resolve>`.
- `ScanView.vue`: `resolvableTokenIds = computed(() => new Set(heuristicExtendable(props.report).map(r => r.tokenId)))`; `issueResolvableToken(issue) = issue.tokenIds.find(t => resolvableTokenIds.value.has(t)) ?? null`; the template shows the Resolve button `v-if="issueResolvableToken(issue)"`.

---

## Design — units

### 1. `ScanView.vue` — override-aware resolvable computation
- Add a prop **`resolved?: ReadonlySet<string>`** (default `new Set()`), the token ids already in the session override.
- Change `issueResolvableToken(issue)` to return the first resolvable token **not yet resolved**:
  ```ts
  function issueResolvableToken(issue: ScanIssue): string | null {
    return issue.tokenIds.find((t) => resolvableTokenIds.value.has(t) && !props.resolved.has(t)) ?? null;
  }
  ```
- Add `issueResolved(issue)`: true when the issue has ≥1 resolvable token AND every resolvable token of the issue is resolved:
  ```ts
  function issueResolved(issue: ScanIssue): boolean {
    const resolvable = issue.tokenIds.filter((t) => resolvableTokenIds.value.has(t));
    return resolvable.length > 0 && resolvable.every((t) => props.resolved.has(t));
  }
  ```
- Template: keep the **Resolve →** button `v-if="issueResolvableToken(issue)"`; add a **✓ resolved** span `v-else-if="issueResolved(issue)"` (`data-testid="resolve-done"`).

### 2. `App.vue` — pass the resolved set
- `const resolvedTokenIds = computed<Set<string>>(() => new Set(Object.keys(resolveOverride.value)));`
- On the `<ScanView>` mount, add `:resolved="resolvedTokenIds"`.

---

## Data flow

`App.resolveOverride (ref) → resolvedTokenIds (computed Set) → ScanView :resolved prop → issueResolvableToken / issueResolved → Resolve button vs ✓`. When the user Applies a resolution, `resolveOverride` updates → `resolvedTokenIds` recomputes → ScanView re-renders the affected issue as ✓. The `scanReport` is untouched.

## Error handling

- No override yet → `resolved` is empty → behaviour identical to today (Resolve buttons everywhere they were).
- An issue with a resolvable token that's resolved AND another that isn't → still shows **Resolve →** (targets the unresolved one); flips to ✓ only when all are resolved.

## Testing

- **ScanView (mount):** extend `ScanView.resolve.test.ts` — with `:resolved` containing the issue's token, the Resolve button is absent and `[data-testid=resolve-done]` (✓) is present; with `:resolved` empty, the Resolve button shows (regression of existing behaviour); a two-token issue with one resolved still shows the Resolve button.
- **App (optional):** the existing resolve flow test still passes; `resolvedTokenIds` derives from the override (covered transitively by the ScanView test + the override-merge already tested).
- Pre-commit gate (vue-tsc + full vitest) green.

## Resolved decisions (review-approved)
1. **Localized (A)**, not deep override-aware `scanGraph` (B) — B needs limitation #1 first, else custom tokens vanish.
2. **✓ resolved indicator** + Resolve button hidden once all the issue's resolvable tokens are resolved (the button targets the first *unresolved* resolvable token meanwhile).
3. The `resolved` set is passed to `ScanView` as a **prop** (derived from `App.resolveOverride`), consistent with ScanView's prop-driven design.

## Flagged for the plan
- Confirm `props.resolved` default (`() => new Set<string>()`) so the prop is optional and existing ScanView mounts don't need it.
- The ✓ indicator's exact placement (in the same flex row as the count + Resolve button).

## Future (parked)
- Deep override-aware `scanGraph` (warnings count drops, `customParts`/export re-route) — after limitation #1 (custom-component override via `buildCustomRecipes`).
