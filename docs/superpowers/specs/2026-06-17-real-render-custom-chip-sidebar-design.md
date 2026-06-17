# Design Spec — Real-render fidelity for the custom components chip + sidebar

**Date:** 2026-06-17
**Status:** Approved
**Topic:** Extend the "Real" tab (real CSS render + render-vs-tokens diff) to the two CUSTOM components, `chip` and `sidebar`, which have no stock Nuxt UI component to mount.

## Context

The "Real" tab renders a component themed by the generated recipe through the real `@tailwindcss/browser` runtime compiler, then diffs the rendered computed styles against the recipe's intent. It covers 13 components (4 bespoke + 9 generic via `LiveRealSlotted`).

`chip` and `sidebar` were deferred because they are flagged CUSTOM (`KNOWN_CUSTOM_COMPONENTS`, rendered via `useCustomPreviewRecipe`) — they diverge from any stock Nuxt UI component, so there is no faithful `U<X>` to mount and diff against.

Key finding that unblocks them: `useCustomPreviewRecipe` returns a recipe with the **same shape** as a standard recipe — `recipe.slots` (chip: `base`/`label`/`close`; sidebar: `base`/`item`) plus `recipe.variants.color`. So `buildSlotSentinels(recipe.slots)` works on custom recipes too. The only thing absent is a `U<X>` to mount; the existing previews instead build a **hand-constructed DOM** for the custom anatomy.

## What "real-render" means here (and what it does not)

For standard components the diff catches Nuxt UI's own base/theme styles overriding the recipe. Custom components have **no third-party base** — the emitted recipe IS the complete styling. So the diff measures something different: it validates that the **emitted recipe classes actually compile** under real Tailwind and **paint as intended** (catches non-compiling arbitrary values, cascade effects, browser-default interference). This is a legitimate, useful check — just a different one. Confirmed as the intended value.

## Scope

**In scope:** `chip`, `sidebar` — real-CSS render of the hand-built custom anatomy + per-slot fidelity diff.

**v1 boundary:** resting-state slots only — chip `base`/`label`/`close`; sidebar `base`/`item`. chip's color variants (`variants.color`, e.g. error/success) are NOT diffed in v1, matching the resting-only scope of the standard real-render. Variants are a possible later extension.

**Out of scope:** rendering against a nearest stock `U<X>` (declined — misleading); tooltip/popover (0 tokens).

## Architecture

Two bespoke components (chosen over a generic one because the anatomies differ structurally and can't be genericized via a registry). Both mirror the existing bespoke `LiveRealAccordion.vue` pattern, swapping the mounted `U<X>` for a hand-built anatomy.

### New file: `src/app/components/LiveRealChip.vue`

- Props: `{ graph: TokenGraph | null; componentName?: string; customParts?: ReadonlyMap<string, ReadonlyArray<string>> }` (default `componentName = "chip"`, `customParts = new Map()`), matching `LiveChip.vue`.
- `useCustomPreviewRecipe(() => graph, () => componentName, () => customParts)` → `recipe`.
- `build = recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] }`.
- `useRealRender(hostRef, () => build.value.specs)` → `slotDiffs`.
- Template: `ref="hostRef"` wrapper; fallback `"No {{ componentName }} recipe to render."` when `!recipe`; otherwise the chip anatomy:
  ```html
  <span :class="build.ui.base">
    <span :class="build.ui.label">Chip</span>
    <span :class="build.ui.close">×</span>
  </span>
  ```
  followed by the descriptive `<p>` and one `<RenderDeltaTable :label="sd.slot" :deltas="sd.deltas">` per `slotDiffs` entry.

### New file: `src/app/components/LiveRealSidebar.vue`

- Same props/composables (default `componentName = "sidebar"`).
- Template anatomy:
  ```html
  <aside :class="build.ui.base">
    <a :class="build.ui.item">Dashboard</a>
    <a :class="build.ui.item">Projects</a>
  </aside>
  ```
  All `item` rows carry the `ti-slot-item` sentinel (via `build.ui.item`); `computeSlotDiffs` uses `querySelector` (first match) so the diff targets the first item — sufficient for the resting-state check. Then descriptive `<p>` + `RenderDeltaTable` per slot.

Both build the `:class` from `build.ui[slot]` (which already carries the `ti-slot-<slot>` sentinel appended by `buildSlotSentinels`), so the rendered element is exactly what `useRealRender` queries and diffs.

### Changed file: `src/app/App.vue`

- Import `LiveRealChip`, `LiveRealSidebar`.
- `realRenderSupported`: `["button", "table", "nav", "accordion", "chip", "sidebar"].includes(selectedComponent.value) || selectedComponent.value in REAL_SLOTTED_REGISTRY`.
- Template: add two `v-else-if` branches in the Real-tab block — `<LiveRealChip v-else-if="selectedComponent === 'chip'" :graph :component-name :custom-parts="customParts" />` and the sidebar equivalent. `customParts` is the existing `computed(() => customPartsByComponent(scanReport.value))`.

## Data flow

`graph + componentName + customParts` → `useCustomPreviewRecipe` → custom `recipe.slots` → `buildSlotSentinels` (appends `ti-slot-<slot>` + emits diff specs for populated slots) → hand-built anatomy renders each slot's element with `build.ui[slot]` → after runtime Tailwind paints, `useRealRender` queries each `.ti-slot-<slot>` and diffs computed vs a probe styled from the recipe classes → `slotDiffs` → `RenderDeltaTable`.

## Error handling

- No graph / no custom recipe → graceful "No `<name>` recipe to render." fallback.
- Component with no custom tokens → empty `recipe.slots` → empty `:ui`, no specs, no diff rows; the anatomy still renders unstyled. Acceptable.
- jsdom (tests): `computeRenderDiff` early-returns `[]`; tests assert wiring (sentinels in the rendered DOM), not the pixel verdict.

## Testing strategy

Unit/mount tests (vitest + jsdom) — note these are SIMPLER than the standard-9 tests: the DOM is hand-built (no `U<X>` to stub), so the test asserts directly on the rendered elements.

1. **`LiveRealChip.test.ts`** — mount with a chip custom-graph fixture + `customParts`; assert (a) the chip anatomy renders and a slot element's class contains a `ti-slot-` sentinel (e.g. the base `<span>` carries `ti-slot-base`), (b) `graph: null` → fallback text, no anatomy.
2. **`LiveRealSidebar.test.ts`** — same shape for the sidebar anatomy (`ti-slot-base` / `ti-slot-item`).
3. **App wiring** (`App.coverage.test.ts`): chip and sidebar each offer the Real tab and mount `LiveRealChip` / `LiveRealSidebar`. **Update the existing negative test** `"does not offer a Real tab for a non-supported component"` — it currently selects `chip`, which is now supported; switch it to a still-unsupported group (e.g. `container` or `typography`).

**The real fidelity verdict is browser-only** (jsdom has no `getComputedStyle`). Both verified manually via `/browse`: select chip + sidebar, open Real, confirm the anatomy renders with real compiled CSS, per-slot diffs populate, no unresolved elements, and the inspector chrome is unaffected (the v0.36.1 dark-leak fix holds).

## Risks (caught by browser verification)

- **Custom recipe slot population** — if `chip`/`sidebar` have no tokens in the test/export, the recipe is null and only the fallback shows. The browser test uses the live export, which has chip (29) and sidebar tokens.
- **Sentinel on repeated items** — multiple sidebar `item` rows share `ti-slot-item`; `querySelector` resolves the first, which is intended.

## Out of scope / future

- chip color-variant diffs (error/success) and interaction states.
- A generic custom real-render abstraction (only 2 custom components; bespoke is clearer).
