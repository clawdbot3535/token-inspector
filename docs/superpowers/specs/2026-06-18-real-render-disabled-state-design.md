# Design Spec — Real-Tab v2 Phase B.1: disabled state diffs

**Date:** 2026-06-18
**Status:** Approved
**Topic:** Diff each component's **disabled** appearance per slot — render the real component with `disabled` set so the recipe's `disabled:` classes AND Nuxt UI's own disabled styling both fire, then diff against the intended disabled look. Also unifies `LiveRealSlotted` onto a cell loop (closing the deferred Phase A.1 badge variants).

## Context

Real-tab v1 diffs the resting look; v2 Phase A (v0.38.0) added per-`variant`/`color` diffs. Phase B covers **settable interaction states**. Per the v2 roadmap, the states decompose by mechanism + effort:
- **Phase B.1 (this spec): `disabled`** — orthogonal and universal (not the resting state for any component; set uniformly via the `disabled` prop). `projectToState` already supports the `disabled` prefix, so no projection extension is needed.
- **Deferred: `checked`** — the registry renders checkbox/switch/radio *checked at rest* (`modelValue:true`/`"a"`), so a checked cell would duplicate resting; it needs an unchecked-baseline redesign first. Phase B.2.
- **Deferred: `open`** — accordion's open state is the `data-[state=open]:` prefix, which `projectToState`'s regex doesn't handle; needs a projection extension + accordion `default-value` setup. Phase B.2.
- **Deferred: `selected`** — item-level (nav/dropdown), hardest. Later.

## Mechanism

A settable state is diffed by rendering the real component **with the state set** (here: the `disabled` prop). Then:
- The recipe's `disabled:`-prefixed slot classes fire (because `:disabled` now matches), and Nuxt UI's own disabled styling applies.
- `getComputedStyle` on each sentinel-marked slot reflects the real disabled appearance.
- The diff probe is the **projected intent** — `projectToState(slotClasses, "disabled")` promotes the `disabled:` classes to base (and drops other-state prefixes), yielding the intended disabled look.

This catches what the resting diff cannot for states: e.g. a slot with no `disabled:` token still gets diffed against its base intent while disabled, so if Nuxt UI dims it (label opacity, etc.) and the recipe didn't intend that, the diff surfaces it.

## Architecture

### New: `buildStateCells(recipe, componentName)` — `src/app/composables/use-render-diff.ts`

Sibling to `buildVariantCells`. Returns one cell per supported settable state that the recipe actually carries:

```ts
const SETTABLE_STATES = ["disabled"] as const; // extensible (checked/open/selected later)
const STATE_PROPS: Record<string, Record<string, unknown>> = { disabled: { disabled: true } };

export interface StateCell {
  state: string;                  // "disabled"
  ui: Record<string, string>;     // FULL slot classes (prefixes intact) + ti-slot- sentinel
  specs: SentinelBuild["specs"];  // per slot: projectToState(slotClasses, state) — the promoted intent
  props: Record<string, unknown>; // STATE_PROPS[state], e.g. { disabled: true }
}

export function buildStateCells(recipe: ComponentRecipe, componentName: string): StateCell[];
```

For each state in `SETTABLE_STATES`: detect whether any slot's class string contains a `${state}:` prefix; if so, emit a cell. The cell stamps every populated slot — `ui[slot] = "${classes} ti-slot-${slot}"` (full classes, so the prefix fires when set) and `specs.push({ slot, selector, classes: projectToState(classes, state) })` (the projected intent for the probe). `props = STATE_PROPS[state]`. `componentName` is accepted for future per-component overrides (none needed for `disabled`). `projectToState` is imported from `../project-to-state.js` (it already handles `disabled`).

(Note the split from `buildSlotSentinels`, which uses the same classes for both `ui` and `specs`. State cells keep the full classes in `ui` but project the `specs`.)

### Changed: `LiveRealSlotted.vue` — unified cell loop

Today it renders one resting instance via a literal 9-branch tag chain. Refactor to render `cells = [restingCell, ...stateCells, ...variantCells]` through a single `v-for`, the literal chain appearing **once** inside `<RealVariantCell>`:

```
restingCell = { label: "resting", props: entry.props, ...buildSlotSentinels(recipe.slots) }   // {ui, specs}
stateCells  = buildStateCells(recipe, name).map(c => ({ label: c.state, props: { ...entry.props, ...c.props }, ui: c.ui, specs: c.specs }))
variantCells= buildVariantCells(recipe).map(c => ({ label: `${c.axis}: ${c.key}`, props: { ...entry.props, ...c.props }, ui: c.ui, specs: c.specs }))
```

Template (one chain, looped):
```vue
<template v-for="cell in cells" :key="cell.label">
  <RealVariantCell :label="cell.label" :specs="cell.specs">
    <UCard v-if="componentName === 'card'" v-bind="cell.props" :ui="cell.ui"><template v-if="entry.slot">{{ entry.slot }}</template></UCard>
    <UKbd v-else-if="componentName === 'kbd'" v-bind="cell.props" :ui="cell.ui" />
    … (the existing 9 literal branches, unchanged except v-bind/:ui now read from cell) …
  </RealVariantCell>
</template>
```

`cell.props` merges the registry render-props (`entry.props` — needed for the component to render at all) with the cell's state/variant props. The fallback ("No recipe") stays. This removes the separate resting block (resting is now the first cell) and **renders badge's variant cells** → closes the deferred Phase A.1. `RealVariantCell` is now the universal cell renderer; the name is retained to avoid churn (it is generic — label + specs + slotted anatomy).

### Changed: `LiveRealButton.vue`

Add `buildStateCells(recipe, "button")` and render its cells via `<RealVariantCell>` alongside the existing Phase A variant cells — anatomy `<UButton v-bind="cell.props" :ui="cell.ui" size="md">Button</UButton>` (so `cell.props = { disabled: true }` disables the real button). Resting single-element diff unchanged.

### Unchanged: `LiveRealChip.vue`

chip has no `disabled:` tokens → `buildStateCells` returns `[]` → no change.

## Data flow

`recipe` → `buildStateCells` detects `disabled:` → cell with full `ui` (prefixes intact) + projected `specs` + `{disabled:true}` → component renders the real element with `disabled` set + `:ui` → `disabled:` classes + Nuxt disabled styling apply → after runtime Tailwind paints, `RealVariantCell`'s `useRealRender` diffs each `.ti-slot-<slot>`'s computed style against the projected-intent probe → per-slot deltas under a `disabled` heading.

## Error handling

- No `disabled:` classes in the recipe → no disabled cell (data-driven gate).
- Component can't be disabled (e.g. a display-only component with stray `disabled:` tokens) → the `disabled` prop is a harmless no-op; the diff still measures the projected intent vs actual.
- jsdom: `computeRenderDiff` early-returns `[]`; tests assert wiring, not the pixel verdict.

## Testing

- **`buildStateCells` unit** (`use-render-diff.test.ts`): a recipe with `disabled:` classes in a slot yields one `disabled` cell with `props {disabled:true}`, `ui.<slot>` containing the full classes + `ti-slot-`, and `specs[].classes` equal to `projectToState(slotClasses, "disabled")` (the disabled-promoted form, not the raw classes); a recipe with no `disabled:` classes yields `[]`.
- **`LiveRealSlotted` mount** (extend its test): given a recipe with a `disabled:` class, renders a `RealVariantCell` whose anatomy carries `disabled` (assert the stub receives the `disabled` prop), plus the resting cell; an existing standard component still renders its resting cell. (The unified refactor must not break the existing resting/fallback assertions.)
- **`LiveRealButton` mount**: a button recipe with `disabled:` → a disabled `RealVariantCell` is rendered with the button disabled.
- **Browser verification** via `/browse`: select an input/checkbox/button (whichever carries disabled tokens in the live export), open Real, confirm a `disabled` block renders with the component actually disabled, per-slot diffs populate, chrome unaffected. The pixel verdict is browser-only (jsdom has no `getComputedStyle`), as in v1/Phase A.

## Risks (caught by browser verification)

- **Unified `LiveRealSlotted` refactor** touches the generic component serving 9 components — the existing resting + (badge) variant rendering must still work. Mount tests + the browser sweep over several standard components guard this.
- **Sentinel purity under state** — the v0.37.0 lesson holds: sentinel-bearing elements carry only recipe slot classes; scaffolding stays on non-sentinel wrappers.

## Out of scope / future

- `checked` (Phase B.2, needs unchecked-baseline redesign), `open` (Phase B.2, needs `projectToState` `data-[state=open]` extension + accordion `default-value`), `selected` (item-level).
- Renaming `RealVariantCell` to a state-neutral name (cosmetic; deferred to avoid churn).
