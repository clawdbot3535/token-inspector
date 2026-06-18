# Design Spec — Real-Tab v2 Phase B.3: accordion `open`-state cell

**Date:** 2026-06-18
**Status:** Approved
**Topic:** Accordion renders **closed** at rest and gains a dedicated **open** state cell, applying the B.2b pattern (unchecked-baseline + dedicated state cell) to the last settable interaction state. Resolves the same probe-can't-see-the-state artifact the accordion currently has.

## Context

Real-tab v2 has added `disabled` (B.1) and `checked` (B.2b) state cells via `buildStateCells` + `RealVariantCell`. `open` is the remaining settable state in the live export.

`LiveRealAccordion.vue` currently renders `<UAccordion :items="items" default-value="a" :ui="build.ui" />` — **open at rest** — and diffs `buildSlotSentinels(recipe.slots)` (raw classes) with a single `useRealRender`. So the `data-[state=open]:` classes fire in the render, but the diff probe is base-only (`extractArbitrary` skips prefixed classes) → the opened styling can't be represented by the probe. This is the **exact same artifact** B.2a/B.2b fixed for checked.

The live export carries one open token: `accordion-item/text-opened` → the grammar emits `data-[state=open]:text-[…]` on the trigger's text slot (the `data-[state=open]:` prefix family was unblocked in v0.28.9). nav has **no** `open` token — only `*-active` (current-page state, a separate `active`/`data-active` mechanism) — so nav is out of scope.

## Changes

### 1. `projectToState` (`src/app/project-to-state.ts`)

Widen the `state` parameter type from `PreviewState | "checked"` to `PreviewState | "checked" | "open"`. **No logic change** — the existing `data-[state=X]:` branch (`cls.match(/^data-\[state=([a-z]+)\]:(.+)$/)`) already promotes any matching state name when `dm[1] === state`; only the type union needs `"open"` so `buildStateCells` can call `projectToState(classes, "open")` without a type error. `STATE_PREFIXES` is unchanged (`open` uses the data-attribute branch, not the pseudo-prefix branch).

### 2. `buildStateCells` (`src/app/composables/use-render-diff.ts`)

- `SETTABLE_STATES` → `["disabled", "checked", "open"] as const`.
- `STATE_DETECT_PREFIX.open = "data-[state=open]:"`.
- `STATE_PROPS.open = {}` — `open` has no universal boolean activation prop (unlike `disabled`/`checked`); the activating prop is component-specific and supplied via the override.
- `STATE_PROPS_OVERRIDE.accordion = { open: { defaultValue: "a" } }` — `UAccordion` opens by item value (`default-value`), supplied per-component via the same `componentName`-keyed override mechanism radio uses for `checked`.

The detection loop, `ui` (full classes + sentinel), and `specs` (`projectToState(classes, state)`) are unchanged in shape — `open` flows through them exactly like `disabled`/`checked`.

### 3. `LiveRealAccordion.vue`

Refactor from the single open-at-rest render to the unified cells model used by `LiveRealSlotted`:

- Build `cells = [resting, ...buildStateCells(recipe, "accordion")]` where `resting` = `{ label: "resting", props: {}, ui: buildSlotSentinels(recipe.slots).ui, specs: buildSlotSentinels(recipe.slots).specs }`.
- Render each cell via `<RealVariantCell :label="cell.label" :specs="cell.specs">` wrapping `<UAccordion :items="items" v-bind="cell.props" :ui="cell.ui" />`.
- Resting binds `v-bind="{}"` → no `default-value` → **closed**. The open cell binds `v-bind="{ defaultValue: 'a' }"` → **open**.
- Remove the standalone `default-value="a"`, the top-level `hostRef`, and the single `useRealRender`/`RenderDeltaTable` loop — `RealVariantCell` owns the per-cell host, `useRealRender`, and delta table (same as `LiveRealSlotted`).
- `items`, `usePreviewRecipe`, and the `v-if="!recipe"` fallback are retained. `buildVariantCells` is **not** added (separate concern; accordion variant cells are out of scope).

## Data flow

`recipe` → resting cell renders the accordion **closed** (trigger visible, panel body absent from the DOM); its probe diffs the base trigger look (base text color, etc.). → `buildStateCells(recipe, "accordion")` detects `data-[state=open]:` on the text slot → emits an `open` cell with `props {defaultValue:"a"}`, `ui` = full slot classes + sentinel, `specs` = `projectToState(slots, "open")` (opened classes promoted to base). `RealVariantCell` renders `<UAccordion … v-bind="{defaultValue:'a'}">` → panel opens → `data-[state=open]:` fires → the trigger text promotes to the opened color → diffed against the projected-open intent.

## Error handling

- An accordion recipe with no `data-[state=open]:` classes → no open cell (data-driven gate); resting-only.
- When closed, Reka removes the panel content from the DOM → the content/body slot's sentinel isn't found → no diff rows for it in the resting cell (correct — nothing open to show).
- jsdom: `computeRenderDiff` early-returns `[]`; mount tests assert wiring only.
- Generic (non-accordion) components have no `open` tokens, so `open` in `SETTABLE_STATES` never produces a cell for them; `STATE_PROPS.open = {}` is therefore never the active props for any rendered open cell.

## Testing

- **`buildStateCells` unit** (`use-render-diff.test.ts`): a recipe with a `data-[state=open]:` class yields an `open` cell; `props` defaults to `{}`; `buildStateCells(recipe, "accordion")` yields `props {defaultValue:"a"}`; a recipe carrying disabled+checked+open emits cells in `["disabled","checked","open"]` order; the open cell's `specs[0].classes` equals the `projectToState(...,"open")` promotion (prefix dropped).
- **`projectToState` unit** (`project-to-state.test.ts`): `data-[state=open]:x` promotes under `"open"` and drops under another state; the existing checked/pseudo behavior is unchanged. (Type-level: `projectToState(s, "open")` compiles.)
- **`LiveRealAccordion` mount** (new or extended test): a recipe with a `data-[state=open]:` class renders a resting cell whose stubbed `UAccordion` receives **no** `defaultValue` (or `undefined`) plus an open cell whose `UAccordion` receives `defaultValue:"a"`; `RealVariantCell` count ≥ 2.
- **Browser verification** via `/browse` against the live `tokens-20260615` export: accordion **resting** renders closed (panel collapsed, trigger base look); the **open** cell renders the panel open with the trigger text showing the opened color (`data-[state=open]:text-[…]` firing) diffed against the projected intent; dark-leak guard 0; no new console errors (the known vue-router nav warning is pre-existing).

## Risks (caught by browser verification)

- **Reka open mechanism:** assumes `UAccordion`'s `default-value="a"` opens item `"a"` and that the open item's root carries `data-state="open"` so the `data-[state=open]:` classes fire. The browser check confirms the class actually fires.
- **Closed resting render:** dropping `default-value` must yield a fully-collapsed accordion whose trigger still carries the base slot classes (so the resting base diff is meaningful). Browser confirms; the trigger is always rendered, only the panel body is removed when closed.
- **Cells-model refactor parity:** `RealVariantCell` per-cell host/render must work for `UAccordion` the same as for the slotted components — covered by the mount test (cell count + props) and the browser sweep.

## Out of scope / future

- nav `open` (no open token — only `active`), overlay components (dropdown/modal "open" = portal/teleport visibility, a different rendering problem), and `selected` (item-level). Phase C (hover/focus/active) stays CDP-blocked.
- Adding `buildVariantCells` to accordion (accordion variant/color cells) — a separate increment if the recipe carries those axes.
- The B.2b deferred polish (shared `RADIO_ITEM_VALUE` constant, tighter radio assertion, `LiveRealButton` comment) is tracked separately and not part of this increment.
