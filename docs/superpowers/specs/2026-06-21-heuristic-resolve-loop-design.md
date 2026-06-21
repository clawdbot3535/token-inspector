# (Y) v1 — Heuristic-Extension Resolution Loop — Design Spec

**Status:** Draft for review
**Date:** 2026-06-21
**Topic:** The first vertical slice of **(Y) deviation decision-routing**: for a token the inspector's slot-mapping heuristic can't place, let the user **generate a `slot-mapping.json` override, apply it live (the Kit render updates in-session), and export it** — turning a "the heuristic can't handle this" deviation into a one-action fix. One owner (Heuristic-Extension), end to end.

---

## Mission context

The inspector is a **DEV↔Design bridge**: bring the Figma kit into the project automatically, and **surface a decision where the automation breaks**. The Kit/render track (v0.49–v0.53) built the "what you see IS the product" half. **(Y) is the other half**: route every deviation/unmapped token to an owner and help the user resolve it.

A signal inventory (this session) found **24 distinct warning kinds** + unmapped signals (classify `skip`, coverage `toDesign`, forecast `unmappedComponentPrefixes`/`nonComponentPrefixes`). The agreed taxonomy is **5 owners**: Figma-Fix · **Heuristic-Extension** · Manual-Dev · by-design-Constraint · Data-Quality. The agreed purpose is a **resolution workflow** (owner **+ a concrete next action**), not just triage labels. Because a full resolution workflow over all 24 kinds × 5 owners is large, v1 is a **vertical slice: the Heuristic-Extension owner only, fully working** — detect → generate → apply → re-render → export. The routing logic that identifies "this deviation is heuristic-extendable" is the seed the other four owners build on later.

**Confirmed mechanism (recon, file refs):**
- A `slot-mapping.json` override entry is `SlotMappingEntry = { slot, utilityType, variantAxis: "size"|"color"|"variant"|null, variantKey: string|null, statePrefix?: string|null }`; a `null` entry explicitly skips a token. Parsed by `parseSlotMappingFile` (`src/slot-mapping-loader.ts:10-59`).
- `buildComponentRecipes(graph, options)` **already accepts `options.slotMappingOverride`** and threads it to `getSlotMapping(node.id, options.slotMappingOverride, node.type)` (`src/recipe-engine.ts:182,205,224`) — the override is checked **before** the heuristic. The CLI renderer already passes it (`app-config.ts:71-75`).
- The **web app does not yet** load or use any slot-mapping override (`App.vue:118`). The live render path `usePreviewRecipe` (`src/app/composables/use-preview-recipe.ts:33`) calls `buildComponentRecipes(g, { components: [name] })` **without** the override. **The only seam needed is to thread an in-memory override through that call** (~2-3 lines) — no grammar/recipe-engine/scanner change, no file I/O.
- Valid slots for a component: `nuxtSlotsFor(component)` (`packages/grammar/src/component-vocab.ts`) → the slot set, ready to power a dropdown.
- The heuristic-extendable deviations carry enough to seed an override: `unsupported-part` (`scanner.ts:312-350`: `tokenIds`, `componentName`), `component-looks-custom` (`scanner.ts:382-415`: `tokenIds`, `componentName`, `customParts`), and the null-`getSlotMapping` cases. Missing only `utilityType`, which is guessed from the token-name suffix or chosen by the user.

---

## Goal

In the inspector, a token flagged as "the slot-mapping heuristic can't place this" gains a **Resolve** action that opens an override editor pre-filled with a best guess; the user adjusts slot/utilityType/variant, hits **Apply**, and the live Kit render updates to show the token now landing — and the accumulated overrides export as a `slot-mapping.json` for the user's repo/CLI.

**Success criteria:**
- The heuristic-extendable deviations (`unsupported-part`, `component-looks-custom`, null-slot-mapping) are surfaced in ScanView with a **Resolve →** affordance.
- The Resolve panel pre-fills a best-guess `SlotMappingEntry` (slot from `nuxtSlotsFor`, utilityType from the token-name suffix, variant axis/key from segments) which the user can adjust via dropdowns.
- **Apply** adds the override to a session override map and the live Kit render (`buildComponentRecipes` with the override) re-runs **in-session**, showing the token now routed to the chosen slot.
- The accumulated override exports as a valid `slot-mapping.json` (download).
- Pure classifier + the recipe-with-override path are unit-tested; the panel is mount-tested; existing tests stay green; no change to scanner/grammar/recipe-engine **logic** (only the additive composable seam + new app-layer module).

---

## Scope

**In scope:**
- A pure **`heuristicExtendable(graph)`** classifier producing the resolvable deviations + a best-guess override per token.
- A **session override state** (`ref<SlotMappingOverride>`) + the **live seam** threading it into the render path (`usePreviewRecipe` + the KitMatrix/LiveKitPanel recipe build).
- A **`ResolvePanel.vue`** override editor (pre-filled, adjustable, Apply + before/after).
- A **Resolve →** affordance in `ScanView.vue` for the heuristic-extendable issues.
- **Export** of the session override as a downloadable `slot-mapping.json`.

**Out of scope (parked → later (Y) rounds):**
- The other **four owners** (Figma-Fix, Manual-Dev, by-design-Constraint, Data-Quality) and their actions.
- The full **24-kind routing table** (v1 only classifies "is this heuristic-extendable?"; the complete owner-routing of every kind is a later round).
- Auto-including the `slot-mapping.json` in the **existing export bundle** (v1 is a standalone download; bundle integration is a later option).
- Persisting the override across sessions / loading an existing `slot-mapping.json` into the app.

---

## Current state (key seams, from recon)

- **`src/recipe-engine.ts`** — `buildComponentRecipes(graph, { components, slotMappingOverride? })`; override checked first, heuristic fallback. The injection point already exists.
- **`src/app/composables/use-preview-recipe.ts:33`** — calls `buildComponentRecipes(g, { components: [name] })` with NO override (the seam to extend).
- **`src/app/components/KitMatrix.vue` / `LiveKitPanel.vue`** — the live Kit render; also call the recipe build (thread the override here too so the matrix reflects it).
- **`src/app/components/ScanView.vue`** — the Issues tab listing all warnings grouped by component/severity; the Resolve affordance attaches here.
- **`packages/grammar/src/component-vocab.ts`** — `nuxtSlotsFor(component)` for the slot dropdown.
- **`src/slot-mapping-loader.ts`** — `SlotMappingEntry`/`SlotMappingOverride`/`SlotMappingFile` types + `parseSlotMappingFile` (the export must produce this shape).
- **`src/scanner.ts`** — the deviation ScanIssues (`unsupported-part`, `component-looks-custom`, null-slot-mapping) with `tokenIds`/`componentName`/`customParts`.

---

## Design — units

### 1. `heuristicExtendable(graph) → ResolvableDeviation[]` (pure)
`src/app/resolve/heuristic-extendable.ts`. Scans the graph's issues (reusing the existing scan), filters to the heuristic-extendable kinds (`unsupported-part`, `component-looks-custom`, and the null-`getSlotMapping` cases that mean "no rule matched" — NOT `state-via-prop`/`unsupported-state`, which are by-design, owner = constraint). For each resolvable token returns:
```ts
type ResolvableDeviation = {
  tokenId: string;
  component: string;
  kind: string;              // the originating ScanIssue kind
  candidateSlots: string[];  // from nuxtSlotsFor(component) (+ customParts)
  guess: SlotMappingEntry;   // best-guess pre-fill
};
```
`guess` derives: `slot` = best match from candidateSlots (heuristic — e.g. the base slot or a name-segment match); `utilityType` = from the token-name suffix via a small map reusing existing utility detection (`-bg`→`bg-color`, `-padding-x`→`padding-x`, …); `variantAxis`/`variantKey` = from token segments; `statePrefix` = null. Pure, deterministic, unit-tested.

### 2. Session override state + live seam
- A `ref<SlotMappingOverride>` (`Record<tokenId, SlotMappingEntry | null>`) owned in `App.vue` (or a small `useResolveOverrides` composable), accumulating applied overrides.
- **Seam:** add an optional `slotMappingOverride` param to `usePreviewRecipe` and thread it to its `buildComponentRecipes` call; likewise pass it into the `KitMatrix`/`LiveKitPanel` recipe build. Applying/adjusting an override updates the ref → the live render recomputes with the override → the token lands. No file I/O.

### 3. `ResolvePanel.vue` — the override editor
`src/app/components/ResolvePanel.vue`. Props: `deviation: ResolvableDeviation`, `modelValue` (the current entry), emits `apply(tokenId, entry)`. Renders: the token id + component; a **slot** dropdown (`candidateSlots`); a **utilityType** dropdown (the loader's `UtilityType` union); **variantAxis** + **variantKey** inputs; an optional **statePrefix** field — all pre-filled from `guess`. An **Apply** button commits the entry to the session override (→ live re-render). A small **before/after**: "before: unmapped → after: `<slot>` / `<utilityType>`".

### 4. Resolve affordance in `ScanView.vue`
For issues whose kind is heuristic-extendable, render a **Resolve →** button next to the issue that opens the `ResolvePanel` for that token (inline expand or a docked side panel). Resolved tokens show a ✓ and drop out of the "needs resolution" set.

### 5. Export
`src/app/resolve/export-slot-mapping.ts` — `buildSlotMappingFile(override) → string`: serialises the session `SlotMappingOverride` into the `SlotMappingFile` shape (`{ overrides: {...} }`) the loader parses. A **Download `slot-mapping.json`** button (reusing the existing `downloadBlob` util). The user drops it into their repo so the CLI/build (`build:tokens`) consumes it — closing the loop into the real project.

---

## Data flow

`graph → scan issues → heuristicExtendable() → ResolvePanel (guess + user edit) → session slotMappingOverride ref → buildComponentRecipes(graph, { components, slotMappingOverride }) → live Kit re-render` ; and `slotMappingOverride → buildSlotMappingFile() → slot-mapping.json download`.

No change to scanner/grammar/recipe-engine logic; the override param already exists. Only the composable seam + the new `src/app/resolve/` module + `ResolvePanel.vue` + the ScanView affordance are added.

## Error handling

- A token with no derivable component or no candidate slots → the Resolve affordance is disabled with a hint ("no Nuxt slot to map to — this is a custom component → owner: dev", pointing at a future owner).
- An override that still yields no recipe change (e.g. wrong utilityType) → the before/after shows "still unmapped", so the user sees the override didn't take.
- A malformed user entry (empty slot) → Apply disabled until slot + utilityType are set.
- Export with an empty override → the download button is disabled.

## Testing

- **Unit (pure):** `heuristicExtendable` — a fixture graph with an `unsupported-part` token (e.g. `button-mystery-bg`) yields one resolvable with `component: "button"`, sensible `candidateSlots` (from `nuxtSlotsFor`), and a `guess` whose `utilityType` is `bg-color`. A `state-via-prop`/`unsupported-state` token is NOT included (by-design, not heuristic-extendable).
- **Recipe-with-override (integration at the engine seam):** `buildComponentRecipes(graph, { components:["button"], slotMappingOverride: { "button-mystery-bg": <entry> } })` routes the previously-unmapped token to the chosen slot (asserts the slot now carries the token's utility). Guards that the live loop actually changes the render.
- **Component (mock):** `ResolvePanel` mount — pre-fills from `guess`; changing the slot dropdown + Apply emits `apply(tokenId, entry)` with the edited entry; Apply disabled with no slot.
- **Export:** `buildSlotMappingFile({ "button-mystery-bg": entry })` parses back via `parseSlotMappingFile` to an equivalent override (round-trip).
- Existing scanner/recipe-engine/grammar tests stay green; the `usePreviewRecipe` seam keeps current behaviour when no override is passed (characterisation).
- Pre-commit gate (vue-tsc + full vitest) green. (`*.test.ts` excluded from `npm run typecheck`; mind the `new Map(arr.map(...))` `as const` footgun.)

## Resolved decisions (review-approved)
1. **Purpose = resolution workflow** (owner + concrete action), not just triage labels.
2. **Taxonomy = 5 owners** (Figma-Fix / Heuristic-Extension / Manual-Dev / by-design-Constraint / Data-Quality).
3. **v1 = vertical slice of ONE owner** (Heuristic-Extension), fully end-to-end.
4. **(a) Placement** = augment `ScanView` with a Resolve affordance (not a new view).
5. **(b) Output** = standalone `slot-mapping.json` download (not auto-joined to the export bundle yet).
6. **(c) Auto-fill** = pre-fill a best-guess entry the user adjusts (not a blank form).

## Flagged for the plan (implementation details)
- The exact `utilityType`-from-suffix guess map (reuse existing utility detection in `recipe-engine`/`extract-arbitrary` where possible rather than a new table).
- Whether the override ref lives in `App.vue` directly or a `useResolveOverrides` composable (pick the lighter that fits the existing App.vue state pattern).
- Threading the override into BOTH `usePreviewRecipe` AND the `KitMatrix`/`LiveKitPanel` recipe call (confirm there isn't a single shared seam to extend once).
- The precise null-`getSlotMapping` subset to include (exclude the by-design `state-via-prop`/`unsupported-state`; include genuine "no rule matched").

## Future (parked)
- The other four owners (Figma-Fix hints, Manual-Dev snippet/`custom-components` pointer, by-design-Constraint acknowledgement reusing the capability catalog, Data-Quality apply-the-did-you-mean-rename) — each a later (Y) round on the same routing backbone.
- The complete 24-kind → owner routing table + an owner filter/overview in ScanView.
- Auto-including `slot-mapping.json` in the existing export bundle (zip + git-export); loading an existing override file back into the app for round-tripping.
