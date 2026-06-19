# Design Spec — Real-tab polish / tech-debt consolidation

**Date:** 2026-06-19
**Status:** Approved
**Topic:** Close the deferred Real-tab review-minors (shared item-value constant, tighter radio mount assertion, LiveRealButton clarifying comment) and document the `apps/creator` smoke-test timeout. No behavior change.

## Context

Across the Real-tab v2 increments (v0.39–v0.41) and the chip work, several non-blocking review items were deferred:
- The preview item value `"a"` is duplicated across the radio override (`use-render-diff.ts:125`), the radio registry entry (`real-slotted-registry.ts:23`), the accordion override (`use-render-diff.ts:126`), and the accordion `items` in `LiveRealAccordion.vue`. A reviewer flagged the radio pair as a silent-drift risk.
- The radio checked-cell mount test (`LiveRealSlotted.test.ts:114-120`) asserts `some(... data-modelvalue === "a")` — it would pass even if the override leaked to the resting cell.
- `LiveRealButton` passes `componentName` to `buildStateCells` but never produces checked/open cells (button has none) — undocumented.
- `apps/creator/Creator.test.ts` got a 5s→15s timeout bump (v0.45.0) for a full-suite pool-contention flake; the reason isn't recorded in the test.

## Changes

### 1. Shared item-value constants (`src/app/components/real-slotted-registry.ts`)

Export two constants and use them everywhere the literal `"a"` preview item value appears:

```ts
/** The preview item value used by the radio registry entry and its checked-state override. */
export const RADIO_ITEM_VALUE = "a";
/** The preview item value used by LiveRealAccordion's items and its open-state override. */
export const ACCORDION_ITEM_VALUE = "a";
```

- `real-slotted-registry.ts`: `radio: { … items: [{ label: "Option", value: RADIO_ITEM_VALUE }] }`.
- `use-render-diff.ts` `STATE_PROPS_OVERRIDE`: `radio: { checked: { modelValue: RADIO_ITEM_VALUE } }`, `accordion: { open: { defaultValue: ACCORDION_ITEM_VALUE } }` (import both from `../components/real-slotted-registry.js`).
- `LiveRealAccordion.vue`: `items = [{ label: "Section", content: "…", value: ACCORDION_ITEM_VALUE }]` (import `ACCORDION_ITEM_VALUE`).

`real-slotted-registry.ts` is a dependency-free config leaf, so the composable → registry import (one string const) introduces no layering cycle. This makes the override↔registry invariant unbreakable.

### 2. Tighter radio mount assertion (`src/app/components/LiveRealSlotted.test.ts`)

Replace the `"passes componentName so radio's checked cell uses modelValue 'a'"` assertion with one that pins both halves:

```ts
    const radios = w.findAll('[data-testid="real-radio"]');
    // checked cell uses the item value (override applied via the componentName wiring)…
    expect(radios.filter((r) => r.attributes("data-modelvalue") === "a").length).toBe(1);
    // …and the resting radio has no selection (unchecked baseline — registry drops modelValue).
    expect(radios.some((r) => r.attributes("data-modelvalue") === "undefined")).toBe(true);
```

(The resting `URadioGroup` gets no `modelValue` → `String(undefined)` = `"undefined"`; the checked cell gets `RADIO_ITEM_VALUE` = `"a"`. Exactly one cell is selected.)

### 3. `LiveRealButton` clarifying comment (`src/app/components/LiveRealButton.vue:26`)

Above `const stateCells = computed(() => (recipe.value ? buildStateCells(recipe.value, props.componentName) : []));` add:

```ts
// `componentName` is passed for consistency with the slotted/accordion call sites; button has no
// checked/open tokens, so buildStateCells emits only a `disabled` cell (no per-component override).
```

### 4. Creator smoke-test timeout comment (`apps/creator/Creator.test.ts`)

Add a one-line comment at the bumped `it(…, 15_000)` explaining the timeout:

```ts
// 15s (not the 5s default): this mounts the whole Creator app + jsdom shims and reads token files;
// it runs ~120ms standalone but can exceed 5s under full-suite worker-pool contention.
```

(No rewrite — the timeout is an appropriate accommodation for a heavy integration smoke test.)

## Error handling / edge cases

- Pure refactor + test/comment changes; no runtime behavior change. The constants are `"a"` (unchanged value), so all existing recipes/previews/diffs are identical.
- The tighter radio assertion is strictly stronger than the current one (still passes on correct behavior; now also fails on a leaked override or a selected resting cell).

## Testing

- **No new tests.** The radio assertion change tightens an existing test. Run the full suite green (926 tests). Confirm `real-slotted-registry.test.ts` (shape-only) stays green (it asserts `typeof props === "object"`, not values; the `items` array still has an object). Confirm `LiveRealAccordion.test.ts` + `use-render-diff.test.ts` stay green (the constants resolve to `"a"`).
- **No browser step** — refactor/comment-only; no emit, render, or scan change.

## Out of scope / future

- Creator test rewrite (keep the timeout).
- Any other `"a"`-like fixture values not covered above.
- The genuinely-unsupported utility nulls (`ring-radius`, `:visited`) and `dropdown-item-text-muted` — separate gaps, not polish.
