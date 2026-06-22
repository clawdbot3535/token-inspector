# (Y) Data-Quality Owner v1 — Typo Rename Hint — Design Spec

**Status:** Draft for review
**Date:** 2026-06-22
**Topic:** The first slice of the **Data-Quality** (Y) owner: surface the existing did-you-mean correction on `possible-typo` deviations as a structured, copy-able **"Rename `from` → `to`"** action in the Scan view. Advisory (the fix belongs in the Figma source) — typo-only, no in-app override.

---

## Mission context

(Y) routes each deviation to an owner + a concrete action. The **Heuristic-Extension** owner (v0.54.0–v0.54.3) applies an inspector-side `slot-mapping.json` override. **Data-Quality** is different by nature: a `possible-typo` token name is wrong at the **source** (Figma), so the inspector can only *suggest* the fix — it can't apply an override. The scanner already DETECTS typos (`src/data-quality.ts` → `possible-typo` issues, using `suggestVocabWord` for a did-you-mean), but the correction lives only inside the message string. This slice exposes it structurally + as a prominent copy-able action, marking the deviation as the Data-Quality owner's.

**Confirmed mechanism (recon):** `src/data-quality.ts` builds `possible-typo` issues; in the emission loop (`~:63-83`) it already has `segment` (the typo'd path segment) and `suggestion` (the corrected word) in scope, and reconstructs the corrected id for the message. The `possible-typo` `ScanIssue` currently carries `id`/`category: "data-quality"`/`severity: "warning"`/`kind`/`message`/`tokenIds` — **no structured suggestion field**. `ScanView` renders `report.issues` (typos included) and already hosts a per-issue right-hand affordance area (the Heuristic `Resolve →` button, v0.54.0). The typo detector finds real typos on the live export (e.g. `heigth` → `height`, `spaching` → `spacing`).

---

## Goal

In the Scan view, a `possible-typo` deviation shows a **"💡 `from` → `to`"** affordance with a **Copy** button (copies the `from → to` rename) — the Data-Quality owner's concrete action. No engine/export/`scanGraph` change.

**Success criteria:**
- The `possible-typo` `ScanIssue` carries structured `typoFrom` (the typo segment) + `typoTo` (the suggested correction).
- `ScanView` renders, for `possible-typo` issues, an inline `💡 {typoFrom} → {typoTo}` hint + a Copy button that copies `"{typoFrom} → {typoTo}"` to the clipboard.
- Advisory: no override is applied, no ✓ (the typo persists until fixed in Figma + re-imported) — consistent with the owner's source-fix nature.
- No change to the scanner's typo detection logic, the recipe engine, the export, or other issue kinds; existing tests stay green.

---

## Scope

**In scope:**
- `src/data-quality.ts`: emit `typoFrom`/`typoTo` on the `possible-typo` issue (from the already-in-scope `segment`/`suggestion`).
- `src/token-graph.ts`: `ScanIssue` gains optional `typoFrom?`/`typoTo?`.
- `ScanView.vue`: for `possible-typo` issues, the `💡 from → to` + Copy affordance.

**Out of scope (parked):**
- **`malformed-value`** deviations (no auto-suggestion; the fix is "use a `{components,hex}` value object" — a generic hint, lower value).
- **B — in-session rename apply/preview** (rename the token in the graph → re-render). A graph mutation + a rename map; preview-only since the source still needs fixing. Parked.
- The other (Y) owners (Figma-Fix, Manual-Dev, by-design-Constraint).

---

## Current state (key seams)

- `src/data-quality.ts:~63-83` — the `possible-typo` emission loop: `for (const { segment, suggestion, ids } of hits.values()) { … issues.push({ id, category: "data-quality", severity: "warning", kind: "possible-typo", message, tokenIds: ids }); }`.
- `src/token-graph.ts:~167` — `ScanIssue` interface (has `componentName?`, `customParts?`, `variantKey?`; add `typoFrom?`/`typoTo?`).
- `src/app/components/ScanView.vue` — renders `report.issues` grouped; the per-issue right-hand affordance area (`<div class="shrink-0 flex items-center gap-1">`) already holds the token-count span + the Heuristic `Resolve →` button + the `✓ resolved` span.

---

## Design — units

### 1. `data-quality.ts` — emit the structured suggestion
In the `issues.push({…})` for `possible-typo`, add two fields (both already in scope):
```ts
issues.push({
  …, kind: "possible-typo", message: …, tokenIds: ids,
  typoFrom: segment,
  typoTo: suggestion,
});
```

### 2. `token-graph.ts` — `ScanIssue` fields
Add to the `ScanIssue` interface:
```ts
/** For possible-typo: the typo'd path segment and its suggested correction. */
typoFrom?: string;
typoTo?: string;
```

### 3. `ScanView.vue` — the Data-Quality affordance
In the per-issue right-hand affordance `<div>`, add a branch for typo issues (a sibling of the Heuristic Resolve button — they're mutually exclusive kinds, so both can be present without conflict):
```html
<span
  v-if="issue.kind === 'possible-typo' && issue.typoTo"
  class="ml-2 inline-flex items-center gap-1 text-[10px] text-sky-700 dark:text-sky-300"
  data-testid="typo-hint"
>
  💡 <code>{{ issue.typoFrom }}</code> → <code>{{ issue.typoTo }}</code>
  <button
    type="button"
    class="underline"
    data-testid="typo-copy"
    @click.stop="copyRename(issue)"
  >Copy</button>
</span>
```
with a `copyRename(issue)` that writes `\`${issue.typoFrom} → ${issue.typoTo}\`` to the clipboard via `navigator.clipboard.writeText`. (Guard: only when `typoFrom`/`typoTo` are set.)

---

## Data flow

`buildGraph/scanGraph → data-quality emits possible-typo with typoFrom/typoTo → report.issues → ScanView renders the 💡 from→to hint + Copy`. No override, no graph mutation, no export change — purely surfacing the existing detection more actionably.

## Error handling

- A `possible-typo` issue missing `typoTo` (shouldn't happen post-change, but defensive) → the `v-if="issue.typoTo"` guard hides the affordance.
- `navigator.clipboard` unavailable (rare/old browser) → wrap `copyRename` in a try/catch; on failure, no-op (the hint text is still visible to read).

## Testing

- **Unit (scanner):** the existing `data-quality`/typo test — assert the emitted `possible-typo` issue carries `typoFrom`/`typoTo` matching the detected segment + suggestion (e.g. a graph with a `…-heigth-…` token → issue `typoFrom: "heigth"`, `typoTo: "height"`).
- **Component:** `ScanView` mount with a `possible-typo` issue (`typoFrom: "heigth"`, `typoTo: "height"`) → `[data-testid=typo-hint]` renders `heigth` and `height`; a non-typo issue → no `typo-hint`. (Clipboard: stub `navigator.clipboard.writeText` and assert the Copy button calls it with `"heigth → height"`.)
- Existing scanner/ScanView tests stay green.
- Pre-commit gate (vue-tsc + full vitest) green. (Hook flakes transiently — retry.)

## Resolved decisions (review-approved)
1. **Data-Quality owner v1 = advisory typo rename hint** (not an in-app override — the fix is source-side).
2. **Typo-only** (`malformed-value` deferred — no auto-suggestion).
3. **Copy target = the rename `from → to`** (the Figma operation), not the affected token-id list (which is already in the issue message).
4. **Advisory — no ✓ / no count subtraction** (the typo persists until the source is fixed; unlike the Heuristic owner's applied override).

## Flagged for the plan
- Confirm the existing `data-quality` test file name + the typo fixture (a token whose segment is a near-miss of a vocab word, e.g. `heigth`).
- The exact ScanView affordance placement (inside the existing right-hand `flex` div, as a sibling of the Resolve button / ✓ span).

## Future (parked)
- `malformed-value` hint (generic "fix the value in Figma").
- B — in-session rename preview (graph rename → re-render → issue clears).
- The other (Y) owners + the full 24-kind routing/owner-filter.
