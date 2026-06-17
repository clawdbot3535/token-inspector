# Real-Render Fidelity — composites (table first) — Design

**Date:** 2026-06-17
**Status:** Approved
**Type:** Feature — extends the render-vs-tokens fidelity check to a multi-element composite (table)
**Parent:** Spec 1 (real render, v0.32.0) + Spec 2 (the diff, v0.33.0) + the office-hours direction.

## Context

The fidelity check works for `button` (a single-element component whose `base` slot IS the rendered
`<button>`). Composites are the real payoff — their `Live*` previews are lossy approximations. But
their structural slots are NOT the root element (table = `th`/`td`, nav = `link`, accordion =
`item`/`trigger`/`body`, …), so the diff must read **each slot's** DOM element. Spec 2 deferred this
"per-slot DOM querying" precisely because Nuxt UI v4 exposes no `data-slot` hooks.

This spec solves per-slot resolution generically (sentinel classes) and proves it on the cleanest
composite, **`table`** (slots `th`/`td`, always-visible, real data = a couple of columns/rows, no
open-state, not portaled). nav/accordion (inline) and the portaled modal/dropdown are later.

## Per-slot resolution — sentinel classes (the new mechanism)

We own each slot's class string (we pass it through the component's `:ui` prop), so append a unique
**sentinel** class per slot and query by it: `:ui="{ th: slots.th + ' ti-slot-th', td: slots.td + ' ti-slot-td' }"`. The sentinel is a plain class (no CSS) → it never affects computed style and never
pollutes the `extractArbitrary` expected side (we feed `extractArbitrary` the *recipe* classes, not
the sentinel). Resolution then depends only on our contract, not Nuxt UI's internal DOM. Generic: any
future composite slot is `recipeClasses + ' ti-slot-<name>'`.

## Architecture

### 1. `computeSlotDiffs` — `src/app/composables/use-render-diff.ts` (extend)

```ts
export interface SlotDiff { slot: string; deltas: RenderDelta[]; }

/** For each spec, find the sentinel-marked element within host and diff it against its recipe classes. */
export function computeSlotDiffs(
  host: ParentNode,
  specs: ReadonlyArray<{ slot: string; selector: string; classes: string }>,
): SlotDiff[];
```

Queries `host.querySelector(spec.selector)` and runs the existing `computeRenderDiff(el, spec.classes)`
per spec; a missing element yields `deltas: []`. Browser-only (delegates to `computeRenderDiff`).

### 2. `LiveRealTable.vue` — `src/app/components/` (new)

Renders a real Nuxt UI v4 `<UTable :data :columns :ui>`:
- **Data:** representative `columns` (2) + `data` (2 rows) — static, just enough to render `th`/`td`.
  (Exact `<UTable>` prop names — `:data` / `:columns`, TanStack-backed — confirmed in the plan's
  /browse spike, Task 1.)
- **`:ui`:** the generated `table` recipe's slot classes with sentinels:
  `{ th: slots.th + ' ti-slot-th', td: slots.td + ' ti-slot-td', ...other slots verbatim }`.
- After `ensureRuntimeTailwind()` + a `requestAnimationFrame` (the compiler-paint pattern from
  `LiveRealButton`), `computeSlotDiffs(host, [{slot:'th',selector:'.ti-slot-th',classes:slots.th},
  {slot:'td',selector:'.ti-slot-td',classes:slots.td}])` → per-slot diffs (host = a template ref).
- Renders one `<RenderDeltaTable :label="sd.slot" :deltas="sd.deltas">` per structural slot.
- Recipe via `usePreviewRecipe(() => graph, () => "table")` (the existing seam).

### 3. `RenderDeltaTable.vue` — add an optional `label`

`defineProps<{ deltas: readonly RenderDelta[]; label?: string }>()`. When `label` is set, the headline
reads `{label} · {matched}/{total} match` (e.g. `th · 2/2 match`); without it, the existing
`Fidelity · N/M match`. Backward-compatible (button passes no label).

### 4. App.vue

`realRenderSupported` widens from `selectedComponent === "button"` to
`["button", "table"].includes(selectedComponent)`. In the Real pane, render `<LiveRealButton>` for
button and `<LiveRealTable>` for table (a `v-if` per component). Tab gating + the existing tab bar are
unchanged.

### 5. Data flow

```
table recipe slots (th, td, …)
   ├─▶ :ui="{ th: th+' ti-slot-th', td: td+' ti-slot-td' }" on a real <UTable :data :columns>
   │       ▶ @tailwindcss/browser compiles the arbitrary classes → th/td paint
   └─▶ computeSlotDiffs(host, specs):  querySelector('.ti-slot-th') → computeRenderDiff(el, slots.th)
                                       querySelector('.ti-slot-td') → computeRenderDiff(el, slots.td)
                              ▼
                   [{slot:'th', deltas}, {slot:'td', deltas}]  → one labeled RenderDeltaTable each
```

## Testing

Same pure/DOM split.

- **`use-render-diff.test.ts`** (extend, jsdom): `computeSlotDiffs` with a host containing
  sentinel-marked elements + classes carrying arbitrary values → one `SlotDiff` per spec with the
  right `slot`; a spec whose selector matches nothing → `deltas: []`.
- **`LiveRealTable.test.ts`** (new, jsdom): mounts a stubbed `UTable` (capturing the `:ui` prop);
  assert `ui.th` / `ui.td` contain BOTH the recipe classes AND the `ti-slot-th` / `ti-slot-td`
  sentinels; null graph → no `UTable`.
- **App** (extend `App.coverage.test.ts`): selecting `table` shows the Real tab; clicking it mounts
  `LiveRealTable` (not `LiveRealButton`); a non-supported component still has no Real tab.
- **`/browse` verdict (browser-only, the real proof):** load the export, select table → Real tab;
  assert a real `<UTable>` renders, `.ti-slot-th` / `.ti-slot-td` are queryable, and a per-slot delta
  table shows for `th` and `td` (matches + any genuine deviations attributed).

## Out of scope (later)

nav (`link`) + accordion (`item`/`trigger`/`body`, body needs expand-to-measure) as the next inline
increment; the portaled modal/dropdown (Teleport querying + force-open); other table slots beyond
th/td; the variant matrix; the Figma-frame diff (Approach B).

## Success criteria

- `computeSlotDiffs` returns per-slot deltas; sentinel resolution works (jsdom for shape, /browse for real).
- Selecting `table` → Real tab renders a real `<UTable>` themed by the recipe with a per-slot (th/td)
  fidelity table; `/browse` confirms.
- Unit suites green; the browser verdict documented via `/browse`.

## Release

Minor — the fidelity check reaches its first multi-element composite (table). README note; test-count bump.
