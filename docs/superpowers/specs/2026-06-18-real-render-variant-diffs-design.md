# Design Spec — Real-Tab v2 Phase A: variant + color diffs

**Date:** 2026-06-18
**Status:** Approved
**Topic:** Extend the "Real" tab from resting-only to also diff each `variant` and `color` variant key, per slot, against the recipe's intent — rendering the real component *with that variant applied*.

## Context

The Real tab (v1, shipped across v0.33.0–v0.37.1) renders the actual component themed by the recipe and diffs computed styles against intent — but only for the **resting** appearance. The recipe also encodes variant axes (`variants.variant.*`, `variants.color.*`, `variants.size.*`), and those are never diffed. Designers most want to verify the discrete "looks" — does `solid`/`ghost`/`outline`/`link` (button) or `error`/`success` (chip) paint correctly, and does Nuxt UI's own variant theming override the recipe.

This is **Phase A** of "Real-tab v2." The full state/variant space decomposes into three phases with materially different mechanisms:
- **Phase A (this spec): variant + color diffs** — live-renderable by setting the Nuxt variant prop; reuses the resting mechanism.
- **Phase B (deferred): settable interaction states** (disabled/checked/open/selected) — render with the state attr/prop, diff against `projectToState` intent.
- **Phase C (blocked): pseudo-class states** (hover/focus/active) — cannot force pseudo-states via the `/browse` CDP allowlist; needs static CSS-rule analysis. Out of scope.

`size` stays the representative resting diff (it's a dimensional variation, partly covered already), not a Phase-A axis.

## Mechanism (precedented)

`LiveRealButton.vue` already renders the real `<UButton>` with `:variant` set + composed `base + representativeSize + variant.base` classes — for **one** representative variant (solid). Phase A generalizes that proven pattern to *every* `variant`/`color` key.

Recipe axis names (`variant`/`color`) deliberately equal Nuxt UI's prop names, so a variant cell wires into the real component with zero mapping: set `{ [axis]: key }` as props, and the component renders in that variant (Nuxt's own variant theming active) while the composed `:ui` carries the recipe's intent. For custom chip (no `color` prop) the prop is a harmless no-op and the composed `:ui` carries the styling — the same dual-path v1 already relies on.

## Architecture

### New: `buildVariantCells(recipe)` — `src/app/composables/use-render-diff.ts`

Data-driven; no per-component config. Returns one **cell** per key in the `variant` and `color` axes present on the recipe:

```ts
export interface VariantCell {
  axis: "variant" | "color";
  key: string;                    // e.g. "solid", "error"
  ui: Record<string, string>;     // sentinel-stamped composed slot classes
  specs: SlotDiffSpec[];          // per-slot diff specs (slot, selector, classes)
  props: Record<string, string>;  // { [axis]: key } — the real Nuxt variant prop
}

export function buildVariantCells(recipe: ComponentRecipe): VariantCell[];
```

For each axis (`variant`, then `color`) and each key, it composes per slot — `composed[slot] = [recipe.slots[slot], recipe.variants[axis][key][slot]].filter(Boolean).join(" ")` over the union of base + variant slots — then runs `buildSlotSentinels(composed)` to get `{ ui, specs }`. A recipe with no `variant`/`color` axis yields `[]`.

### New: `RealVariantCell.vue` — `src/app/components/RealVariantCell.vue`

A shared per-cell diff renderer so the host/diff/label logic isn't duplicated across components. Props: `{ label: string; specs: SlotDiffSpec[] }` + a scoped default slot. It owns a `ref="hostRef"` wrapper, runs `useRealRender(hostRef, () => specs)`, and renders the label + one `RenderDeltaTable` per slot diff. The consuming component supplies its anatomy through the default slot (the cell does not know the anatomy). The component passes `cell.ui`/`cell.props` into its anatomy itself; `RealVariantCell` only needs the `specs` to diff and a `label` to head the block.

### Changed: the variant/color-bearing `LiveReal*` components

Only components whose recipe has a `variant` or `color` axis change; others are untouched (resting only). A changed component keeps its existing resting diff, then renders one `<RealVariantCell>` block per `buildVariantCells(recipe)` entry — its anatomy rendered with `v-bind="cell.props"` (real Nuxt variant prop) + `:ui="cell.ui"` (composed sentinel classes), labeled `variant: <key>` / `color: <key>`. From the live export this is **button** (`variant`) and **chip** / **badge** (`color`); the set is discovered from the recipe, so any future variant/color axis is covered automatically.

`LiveRealButton` is refactored from its bespoke single-representative-variant logic onto `buildVariantCells` + `RealVariantCell`, removing the one-off variant composition.

## Data flow

`recipe` → `buildVariantCells` → per variant key: composed (base+variant) slot classes → `buildSlotSentinels` (sentinel-stamped `ui` + diff `specs`) → component renders anatomy with `v-bind=cell.props` + `:ui=cell.ui` → after runtime Tailwind paints, `useRealRender` (inside `RealVariantCell`) queries each `.ti-slot-<slot>` and diffs computed vs a probe styled from the composed classes → per-slot deltas under a `variant: <key>` heading.

## UI

Under each variant/color-bearing component's Real tab: the resting diff first (unchanged), then a stacked, labeled block per variant key (`variant: solid`, `color: error`, …), each with its per-slot `RenderDeltaTable`s. Stacked (not a selector) so all variants are scannable at a glance — a fidelity diagnostic, not an interactive picker.

## Error handling

- Recipe with no `variant`/`color` axis → `buildVariantCells` returns `[]` → component renders resting only (unchanged).
- A variant key whose slot composition is empty → no specs for that slot → no diff row (same as v1 empty-slot handling).
- jsdom: `computeRenderDiff` early-returns `[]`; tests assert wiring, not the pixel verdict.

## Testing

- **`buildVariantCells` unit test** (`use-render-diff.test.ts`): a recipe with `variants.variant.{solid,ghost}` yields 2 cells with `props {variant:key}`, composed `ui` containing both base and variant classes plus the `ti-slot-*` sentinels; a recipe with no variant/color axis yields `[]`.
- **`RealVariantCell` mount test**: renders the label and a `RenderDeltaTable` per spec; renders the scoped-slot anatomy.
- **Component mount test** (e.g. `LiveRealButton`): given a recipe with variant keys, renders one `RealVariantCell` per key, each anatomy carrying the variant prop + sentinel-stamped `:ui`.
- **Browser verification** via `/browse`: select button (and chip/badge), open Real, confirm a per-variant block renders for each key, the real component is in that variant, and per-slot diffs populate. The pixel verdict is browser-only (jsdom has no `getComputedStyle`), as in v1.

## Risks (caught by browser verification)

- **Double-application of variant styling** — setting `:variant="solid"` AND `:ui` with our solid classes: the `:ui` override is expected to win (it's how v1 themes the component). Browser confirms the composed intent paints; where Nuxt's variant theme leaks through, that's the legitimate finding the diff exists to surface.
- **Sentinel purity under composition** — the composed slot classes must still carry only recipe classes (+ the sentinel); the v0.37.0 lesson holds — anatomy scaffolding stays on non-sentinel wrappers.

## Out of scope / future

- `size`-axis diffs (stays representative resting).
- Phase B (settable interaction states) and Phase C (pseudo-class states, CDP-blocked).
- A variant *selector* UI (stacked is the chosen presentation).
