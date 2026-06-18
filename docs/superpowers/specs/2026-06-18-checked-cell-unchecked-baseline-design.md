# Design Spec — Real-Tab v2 Phase B.2b: unchecked baseline + checked cell

**Date:** 2026-06-18
**Status:** Approved
**Topic:** Flip the checkable components' resting render to **unchecked** and add a dedicated **checked** state cell to the Real tab. Resolves the B.2a measurement artifact and makes the checked appearance properly diffable.

## Context

Real-tab v2 Phase B.1 added the `disabled` state cell; B.2a fixed checked-state tokens to emit `data-[state=checked]:` (so they fire on Nuxt UI v4's Reka components) and taught `projectToState` that form. B.2a left an artifact: `checkbox`/`switch`/`radio` render **checked-at-rest** (registry `modelValue:true`/`"a"`), but the Real tab's *resting* probe is base-only — so the checked classes now correctly fire while the base-only probe can't represent them, making the resting diff read low.

B.2b resolves this by flipping the resting baseline to unchecked and adding a checked cell (the state's intent gets its own, correct, probe). This is the increment the user originally asked for under "Phase B.2 checked with the unchecked-baseline redesign."

## Changes

### 1. Registry baseline flip — `src/app/components/real-slotted-registry.ts`

The checkable components render **unchecked** at rest:
- `checkbox` → `modelValue: false` (was `true`)
- `switch` → `modelValue: false` (was `true`)
- `radio` → drop `modelValue` (was `"a"`) — `URadioGroup`'s `modelValue` is optional; omitted = no selection = unchecked. Keep `items: [{ label: "Option", value: "a" }]`.

Safe against the existing registry test (it only asserts `typeof entry.props === "object"`, not specific values).

### 2. `buildStateCells` extension — `src/app/composables/use-render-diff.ts`

- `SETTABLE_STATES` becomes `["disabled", "checked"] as const`.
- **Per-state detection prefix.** Detection currently scans `cls.startsWith("${state}:")`. `checked` is emitted (post-B.2a) as `data-[state=checked]:`, not `checked:`, so add a map:
  ```ts
  const STATE_DETECT_PREFIX: Record<SettableState, string> = {
    disabled: "disabled:",
    checked: "data-[state=checked]:",
  };
  ```
  Detection uses `STATE_DETECT_PREFIX[state]`. The `specs` projection is unchanged — `projectToState(classes, "checked")` (B.2a taught it to promote `data-[state=checked]:`).
- `STATE_PROPS` gains `checked: { modelValue: true }`.
- **`componentName` param returns** to `buildStateCells(recipe, componentName)` (deferred in B.1 under YAGNI). A per-component override map applies the state props that differ by component:
  ```ts
  const STATE_PROPS_OVERRIDE: Record<string, Partial<Record<SettableState, Record<string, unknown>>>> = {
    radio: { checked: { modelValue: "a" } }, // the registry item value; checkbox/switch use the `true` default
  };
  ```
  The cell's `props` = `STATE_PROPS_OVERRIDE[componentName]?.[state] ?? STATE_PROPS[state]`.

### 3. Call sites — pass `componentName`

`src/app/components/LiveRealSlotted.vue` (`buildStateCells(r)` → `buildStateCells(r, props.componentName)`) and `src/app/components/LiveRealButton.vue` (`buildStateCells(recipe.value)` → `buildStateCells(recipe.value, props.componentName)`). No other wiring: checkbox/switch/radio already flow through `LiveRealSlotted`'s unified cell loop, so the checked cell renders automatically.

## Data flow

`recipe` → `buildStateCells(recipe, componentName)` detects `data-[state=checked]:` in a slot → emits a `checked` cell with `props` `{modelValue:true}` (or `{modelValue:"a"}` for radio), `ui` = full slot classes + sentinel, `specs` = `projectToState(slot, "checked")`. `LiveRealSlotted` merges the cell into `[resting, ...state, ...variant]`; the literal-tag chain renders the component with `v-bind="{...entry.props (now unchecked), ...cell.props (modelValue → checked)}"` → the component is checked → `data-[state=checked]:` fires + the Reka indicator/thumb render → `useRealRender` diffs each sentinel-marked slot against the projected checked intent.

The **resting** cell (entry.props, now unchecked) renders the unchecked look — base/label only for checkbox/radio (no indicator when unchecked), base/thumb-off for switch — and its base-only probe matches. Artifact resolved.

## Error handling

- A component with no `data-[state=checked]:` classes → no checked cell (data-driven gate; button has none).
- Reka renders `CheckboxIndicator`/`RadioGroupIndicator` only when checked → in the resting (unchecked) cell, those slots are absent from the DOM, so their sentinels aren't found and they simply produce no diff rows (correct — there's nothing unchecked to show there).
- jsdom: `computeRenderDiff` early-returns `[]`; tests assert wiring.

## Testing

- **`buildStateCells` unit** (`use-render-diff.test.ts`): a recipe with a `data-[state=checked]:` class yields a `checked` cell with `props {modelValue:true}`; `buildStateCells(recipe, "radio")` yields `props {modelValue:"a"}`; a recipe with only a `disabled:` class still yields just the disabled cell; the detection no longer false-matches a bare `checked:` (none should exist post-B.2a, but the prefix is now `data-[state=checked]:`).
- **`LiveRealSlotted` mount** (extend its test): a checkbox recipe with a `data-[state=checked]:` class renders a `RealVariantCell` whose stubbed `UCheckbox` receives `modelValue:true` (the checked cell), plus the resting cell whose `UCheckbox` receives `modelValue:false` (unchecked baseline).
- **Registry**: the existing real-slotted-registry test stays green (asserts shape, not values).
- **Browser verification** via `/browse`: checkbox/switch/radio show an **unchecked** resting cell (no indicator for checkbox/radio; switch thumb off) + a **checked** cell rendering checked (indicator/thumb-on present, `data-[state=checked]:` firing) with sensible per-slot diffs. Confirm the **B.2a artifact is resolved** — the switch resting diff is back to a clean unchecked match. Chrome unaffected (dark-leak guard 0).

## Risks (caught by browser verification)

- **Radio unchecked render:** omitting `modelValue` must yield a no-selection RadioGroup (not error/auto-select). Browser confirms; if it auto-selects or errors, set an explicit non-matching `modelValue`.
- **Checked cell prop precedence:** the cell merge `{...entry.props, ...cell.props}` must let `cell.props.modelValue` (checked) override the flipped resting `entry.props.modelValue` (unchecked). Spread order already does this (cell wins) — covered by the mount test.

## Out of scope / future

- `open` (grammar + `projectToState` ready; needs accordion `default-value` setup + an open cell) and `selected` (item-level, nav/dropdown). Phase C (hover/focus/active) stays CDP-blocked.
- Deriving the radio checked value from the registry `items` dynamically (hardcoded `"a"` matches the registry; revisit only if the registry item value changes).
