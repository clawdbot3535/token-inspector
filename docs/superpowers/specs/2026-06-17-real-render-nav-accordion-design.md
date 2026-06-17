# Real-Render Fidelity — nav & accordion (inline composites) — Design

**Date:** 2026-06-17
**Status:** Approved
**Type:** Feature — extends the render-vs-tokens fidelity check to the inline composites nav + accordion
**Parent:** Spec 1 (real render, v0.32.0) + Spec 2 (diff, v0.33.0) + Spec 3 (table / sentinel per-slot, v0.34.0).

## Context

Spec 3 proved the sentinel-class per-slot mechanism on `table`. This extends it to the two remaining
**inline** composites, `nav` and `accordion` (the portaled `modal`/`dropdown` are a later increment).
A correctness point the nav export surfaced: a composite's **structural** slots are often the ones
with *no tokens yet* (nav `link`, accordion `trigger`/`body` are structural-MISSING in the live
export — that's what the Coverage Guide flags). The fidelity diff has a different job — verify the
slots that **are** styled render faithfully — so it must key off the slots the **recipe populates**
(`item` for both, in this export), not a hardcoded structural list. This makes the per-slot builder
fully component-agnostic.

## Architecture

### 1. `buildSlotSentinels(recipeSlots)` — `src/app/composables/use-render-diff.ts`

```ts
export interface SentinelBuild {
  ui: Record<string, string>;                                   // slot → "<recipe classes> ti-slot-<slot>"
  specs: Array<{ slot: string; selector: string; classes: string }>;
}
/** For every populated recipe slot, append a sentinel class and emit its diff spec. */
export function buildSlotSentinels(slots: Readonly<Record<string, string>>): SentinelBuild;
```

Iterate `slots`; for each with a non-empty class string, set `ui[slot] = classes + ' ti-slot-<slot>'`
and push `{ slot, selector: '.ti-slot-<slot>', classes }`. Empty/absent slots are skipped. The
sentinel is a plain (no-CSS) class, so it never affects computed style nor the `extractArbitrary`
expected side (specs carry the recipe `classes`, sentinel-free). camelCase slot names
(`linkLeadingIcon`) produce valid case-sensitive `.ti-slot-linkLeadingIcon` selectors.

### 2. `useRealRender(hostRef, specsFn)` — same file (composable)

Extracts the refresh boilerplate currently duplicated in the LiveReal* components:
```ts
export function useRealRender(
  hostRef: Ref<HTMLElement | null>,
  specsFn: () => ReadonlyArray<{ slot: string; selector: string; classes: string }>,
): { slotDiffs: Ref<SlotDiff[]> };
```
On mount and whenever `specsFn`'s source changes: `await ensureRuntimeTailwind()` → `nextTick()` →
one `requestAnimationFrame` (compiler paint) → `slotDiffs.value = computeSlotDiffs(host, specsFn())`.
Browser-only (delegates to the browser-only `computeSlotDiffs`). **Refactor `LiveRealTable` onto
it** (removes its hand-rolled `refreshDiff` + hardcoded th/td; its `{ui,specs}` now come from
`buildSlotSentinels(recipe.slots)`).

### 3. `LiveRealNav.vue` / `LiveRealAccordion.vue` — `src/app/components/`

Each: `usePreviewRecipe(() => graph, () => name)` → `{ ui, specs } = buildSlotSentinels(recipe.slots)`
→ render the real component with representative data + `:ui` → `useRealRender(hostRef, () => specs)` →
one `<RenderDeltaTable :label="sd.slot" :deltas="sd.deltas">` per `slotDiff`.
- **`LiveRealNav`**: `<UNavigationMenu :items="[{label:'Home',to:'#'},{label:'Docs',to:'#'}]" :ui="ui">`.
- **`LiveRealAccordion`**: `<UAccordion :items="[{label:'Section',content:'Body',value:'a'}]" default-value="a" :ui="ui">` — the `default-value` force-opens the panel so `trigger`/`body` render *if* they carry tokens (robust for future exports; today only `item` is populated, and `item` renders without opening).

### 4. App.vue

`realRenderSupported` widens to `["button","table","nav","accordion"]`. The Real pane's per-component
`v-if` branch gains `<LiveRealNav v-else-if="selectedComponent === 'nav'">` and
`<LiveRealAccordion v-else-if="selectedComponent === 'accordion'">`. Tab gating/bar unchanged.

`LiveRealButton` stays on its base-only path (the genuine single-element case; base = the button
element itself, no sentinel) — left untouched to avoid churn on working, tested code.

## Data flow (nav, illustrative)

```
nav recipe slots ({ item: '<classes>', linkLeadingIcon: '<classes>', … })
   buildSlotSentinels → ui = { item: classes+' ti-slot-item', … }, specs = [{item, '.ti-slot-item', classes}, …]
   ▶ <UNavigationMenu :items :ui> renders; @tailwindcss/browser compiles the arbitrary classes
   ▶ useRealRender → computeSlotDiffs(host, specs): querySelector('.ti-slot-item') → computeRenderDiff
                              ▼
                   [{slot:'item', deltas}, …]  → one labeled RenderDeltaTable each
```

## Testing

- **`use-render-diff.test.ts`** (extend, jsdom): `buildSlotSentinels` — populated slots → `ui` carries
  `classes + ti-slot-<slot>` and a matching spec; empty/absent slots skipped. (`useRealRender` is
  RAF/browser-timed; covered via the component + App tests + /browse rather than a brittle timer unit.)
- **`LiveRealNav.test.ts` / `LiveRealAccordion.test.ts`** (jsdom): stub the real component capturing
  `:ui`; assert the populated slot(s) carry `ti-slot-<slot>` + recipe classes; null graph → no component.
  Accordion: assert `default-value` is passed (the force-open).
- **App** (`App.coverage.test.ts`, extend): selecting `nav` / `accordion` shows the Real tab and mounts
  `LiveRealNav` / `LiveRealAccordion`; a non-supported component (e.g. `chip`) has no Real tab.
- **`/browse` verdict (browser-only):** load the export, select nav → Real tab: a real
  `<UNavigationMenu>` renders, `.ti-slot-item` is queryable, an `item · N/M` delta table shows; same
  for accordion (`item`). Document the per-slot match result + any genuine deltas.

## Out of scope (later)

The portaled `modal`/`dropdown` (Teleport → query `<body>`, force-open); other slots beyond what the
export populates; the variant matrix; the Figma-frame diff (Approach B); folding `LiveRealButton` into
the generic path.

## Success criteria

- `buildSlotSentinels` emits ui+specs for populated slots only; `useRealRender` drives the refresh;
  `LiveRealTable` refactored onto both with its tests still green.
- Selecting nav/accordion → Real tab renders the real component themed by the recipe with a per-slot
  delta table for each populated slot; `/browse` confirms (nav/accordion diff `item`).
- Unit suites green; the browser verdict documented via `/browse`.

## Release

Minor — the fidelity check covers the inline composites (nav, accordion). README note; test-count bump.
