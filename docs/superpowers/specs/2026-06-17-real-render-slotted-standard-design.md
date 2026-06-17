# Design Spec — Real-render fidelity for 9 standard components

**Date:** 2026-06-17
**Status:** Approved
**Topic:** Extend the "Real" tab (real Nuxt UI render + render-vs-tokens diff) from 4 components to 13 by covering the easy standard components.

## Context

The inspector's "Real" tab mounts the *actual* Nuxt UI v4 component themed by the generated recipe, then diffs its computed styles (`getComputedStyle`) against the recipe's intent — the true validation beyond the mock-preview ceiling. It currently supports **4** components: button, table, nav, accordion (`realRenderSupported` whitelist in `App.vue`).

This is highly useful for designers: it shows whether the tokens they authored actually paint the real component correctly. They want it on more components, starting with the easy ones.

## Scope

**In scope — 9 standard components** that map 1:1 to a real `U<X>` and build their recipe via `usePreviewRecipe`:

`card, kbd, badge, progress, switch, checkbox, radio, input, textarea`

**Explicitly deferred — chip, sidebar.** These are flagged CUSTOM in the inspector (`KNOWN_CUSTOM_COMPONENTS`, rendered via `useCustomPreviewRecipe`) precisely because they diverge from any stock Nuxt UI component. There is no faithful real `U<X>` to render them against, so a render-diff would be misleading. Out of scope.

**v1 scope boundary:** the diff covers **resting-state slot styles** only (`recipe.slots`) — no variant or interaction-state deltas. This matches the existing accordion/table/nav precedent (button is the lone exception, composing a representative variant into its single-element diff; that stays button-specific). Variants and states (e.g. checkbox checked/unchecked, switch on/off) are a possible later extension, confirmed out of scope for now.

## Architecture

One generic component plus a config registry — chosen over 9 bespoke files to avoid ~9× near-identical 30-line duplicates. The existing 4 bespoke components (button/table/nav/accordion) stay as-is; they have special rendering needs.

### New file: `src/app/components/real-slotted-registry.ts`

```ts
export interface RealSlottedEntry {
  /** Globally-registered Nuxt UI component name, e.g. "UCard". */
  tag: string;
  /** Minimal props to render the component in a resting state. */
  props: Record<string, unknown>;
  /** Optional default-slot text for components that need children. */
  slot?: string;
}

export const REAL_SLOTTED_REGISTRY: Readonly<Record<string, RealSlottedEntry>> = {
  card:     { tag: "UCard",       props: {},                                                   slot: "Card body" },
  kbd:      { tag: "UKbd",        props: { value: "K" } },
  badge:    { tag: "UBadge",      props: { label: "Badge" } },
  progress: { tag: "UProgress",   props: { modelValue: 50 } },
  switch:   { tag: "USwitch",     props: { modelValue: true } },
  checkbox: { tag: "UCheckbox",   props: { modelValue: true, label: "Checkbox" } },
  radio:    { tag: "URadioGroup", props: { modelValue: "a", items: [{ label: "Option", value: "a" }] } },
  input:    { tag: "UInput",      props: { modelValue: "Text" } },
  textarea: { tag: "UTextarea",   props: { modelValue: "Text" } },
};
```

### New file: `src/app/components/LiveRealSlotted.vue`

Structurally identical to `LiveRealAccordion.vue` (~35 lines), generalized:

- Props: `{ graph: TokenGraph | null; componentName: string }`.
- `usePreviewRecipe(() => graph, () => componentName)` → `recipe`.
- `entry = REAL_SLOTTED_REGISTRY[componentName]`.
- `build = recipe ? buildSlotSentinels(recipe.slots) : { ui: {}, specs: [] }`.
- `useRealRender(hostRef, () => build.specs)` → `slotDiffs`.
- Template: fallback `"No <name> recipe to render."` when `!recipe || !entry`; otherwise
  `<component :is="entry.tag" v-bind="entry.props" :ui="build.ui">{{ entry.slot }}</component>`
  followed by one `<RenderDeltaTable>` per `slotDiffs` entry.

Global Nuxt UI registration (Vite plugin) resolves `:is="'UCard'"` at runtime — no import needed, same mechanism that lets `<UButton>` work today.

### Changed file: `src/app/App.vue`

- `realRenderSupported`: the 4 bespoke names plus `Object.keys(REAL_SLOTTED_REGISTRY)` (→ 13 supported).
- Template: after the 4 existing `v-if`/`v-else-if` Real-tab branches, add a final `v-else-if="REAL_SLOTTED_REGISTRY[selectedComponent]"` rendering `<LiveRealSlotted :graph :component-name />`.

## Data flow

`graph + componentName` → `usePreviewRecipe` → `recipe.slots` → `buildSlotSentinels` appends `ti-slot-<slot>` to each populated slot's classes and emits diff specs → real `U<X>` mounts with `:ui` (slot→classes) → after runtime Tailwind paints, `useRealRender` queries each `.ti-slot-<slot>` and diffs its `getComputedStyle` against a hidden probe styled from the recipe classes → `slotDiffs` → `RenderDeltaTable` rows.

## Error handling

- No graph / no recipe / unknown component → graceful "No `<name>` recipe to render." message (no crash).
- Component with zero mapped tokens → empty `recipe.slots` → empty `:ui`, empty specs, empty diff (renders the stock component, no diff rows). Acceptable.
- jsdom (tests): `computeRenderDiff` early-returns `[]` (no `getComputedStyle` values). Tests assert wiring, not the pixel verdict.

## Testing strategy

Unit/mount tests (vitest + jsdom) — mirror `LiveRealNav.test.ts` / `App.coverage.test.ts`:

1. **`real-slotted-registry.test.ts`** — data test: all 9 keys present, each has a `U`-prefixed `tag` and a `props` object.
2. **`LiveRealSlotted.test.ts`** — mount with U* globally stubbed; assert (a) it renders the entry's tag, (b) the `:ui` passed contains a `ti-slot-base` sentinel when the recipe has a base slot, (c) the "no recipe" fallback shows when `graph` is null.
3. **App wiring** (extend `App.coverage.test.ts` or the Real-tab test): `realRenderSupported` is true for the 9 new names, and the Real tab mounts `LiveRealSlotted` for one representative (e.g. `card`).

**The real fidelity verdict is a browser artifact** (jsdom returns empty computed values, see `use-render-diff.ts:4`). All 9 are verified manually via `/browse` before release — confirming each `U<X>` resolves via `:is`, renders in a resting state, and produces sensible diff rows.

## Risks (caught by browser verification)

- **`:is="stringName"` resolution** — does Vue resolve every globally-registered Nuxt UI component by string name in `<component :is>`? Very likely (global registration + `resolveDynamicComponent`), but unproven for these specific tags. Browser check confirms.
- **Render without enough props** — some components may need more than the minimal props to paint a resting state (e.g. `URadioGroup` items, `UProgress` modelValue). Registry props are a best guess; browser check confirms each renders, and props are adjusted per-component if needed.

## Out of scope / future

- Variant and interaction-state diffs (checkbox checked, switch on, hover/focus).
- chip, sidebar (custom components — no faithful real `U<X>`).
- tooltip, popover (0 tokens in the export — moot).
