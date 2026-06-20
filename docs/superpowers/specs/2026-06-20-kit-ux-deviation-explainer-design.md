# Kit UI/UX — Deviation Explainer + Matrix Layout — Design Spec

**Status:** Draft for review
**Date:** 2026-06-20
**Topic:** Make the Kit area trustworthy and scannable: inline-explain which render differences are *correct Nuxt behavior* vs. a real recipe gap (B, primary), and lay the variant/state cells out as labeled axis-rows instead of a vertical single-cell stack (A, secondary).

---

## Mission context

The inspector is a DEV↔Design bridge. v0.49.0 made the Kit render the single source of truth (real `@nuxt/ui` v4 components). But two gaps remain in the Kit *presentation*:
1. **Correct-but-surprising Nuxt deviations look like unexplained discrepancies.** A user inspecting `button` saw `outline` render with different apparent padding (Nuxt adds a `ring-inset`) and `link` with no underline (Nuxt's underline is `hover:` only). These are *correct* — the recipe is faithful, this is just how Nuxt renders — but nothing tells the user that, and the render-diff Diagnostics are **blind to them by design** (the diff strips `inset` and never captures hover state). The user can't tell "correct framework behavior" from "real recipe gap."
2. **The render is a vertical single-cell stack** — one variant per row — which is hard to scan and compare.

This spec adds an **explanation layer** (B) and a **scannable layout** (A). B weighs heavier.

---

## Goal

- **(B)** Inline, at the render, annotate cells whose appearance reflects *known* Nuxt behavior — a small `ⓘ` note ("outline: Nuxt adds an inset ring — expected", "link: underline on hover only", "disabled: Nuxt dims via opacity, not colour"). Plus a per-component "Known Nuxt behaviors" reference panel. The user trusts and understands what they see.
- **(A)** Arrange the variant/state cells as labeled horizontal axis-rows (Variants / Colors / States) instead of a vertical stack.

**Success criteria:**
- A cell with a known behavior shows an inline `ⓘ` note; a plain cell shows none (no clutter).
- The notes come from a curated catalog (seeded narrow) + the existing capability-deviation scanner warnings — no fragile auto-detection.
- A "Known Nuxt behaviors" panel lists the component's notes as a reference.
- Variant/state cells render as labeled axis-rows.
- All existing tests stay green; new logic is unit/mount-tested; visual layout verified via headless `/browse`.

---

## Scope

**In scope:**
- A curated behavior catalog + lookup + a bridge that reuses the existing capability-deviation `ScanIssue`s.
- Inline `ⓘ` notes per cell (only where a note exists).
- A "Known Nuxt behaviors" reference panel per component.
- A shared `KitMatrix.vue` that lays cells out as labeled axis-rows and hosts the notes + per-cell diagnostics; the 7 `LiveReal*.vue` refactored to use it.

**Out of scope (parked):**
- **#1 — per-size (sm/md/lg) cells** — still parked; everything renders at `size="md"`.
- **True cartesian variant×color product grid** — v1 uses axis-rows (Variants row, Colors row, States row), NOT the product (solid×primary, solid×error, …). The product needs new cell-combination logic and is combinatorially large. Future option.
- **Full behavior catalog** — v1 seeds only the confirmed cases (`button.outline`, `button.link`) + the scanner reuse; grows iteratively.
- **Q (true-export fidelity)** — separate track.

---

## Current state (key seams)

- `src/app/components/LiveKitPanel.vue` — per-component entry: header + coverage badge + dispatch to `LiveReal*` + diagnose toggle + modal/dropdown placeholder.
- `src/app/components/LiveReal*.vue` (7: button/table/nav/accordion/chip/sidebar bespoke + `LiveRealSlotted`) — each renders a hero `<U*>`, a gated resting `RenderDeltaTable`, then `<RealVariantCell v-for="cell in variantCells">` and `<… in stateCells>` loops (the **vertical stack** to replace).
- `src/app/components/RealVariantCell.vue` — props `{ label, specs, showDiagnostics }`; renders a label + the cell's `<U*>` (default slot) + the gated delta table via `useRealRender`.
- `src/app/composables/use-render-diff.ts` — `buildVariantCells(recipe) → VariantCell[] {axis:"variant"|"color", key, ui, specs, props}` and `buildStateCells(recipe, component) → StateCell[] {state, ui, specs, props}`. (Cells are per-axis, NOT a product.)
- `src/scanner.ts` — `scanGraph(graph, {components}) → { issues: ScanIssue[] }`; `ScanIssue = { kind, componentName, tokenIds, message, severity, … }`. Capability-deviation kinds already produced: `disabled-via-opacity`, `resting-shadowed-by-state`, `unsupported-state`, `state-via-prop` (+ nav active etc.). The app already runs `scanGraph` (scan view / issues count) — results available in app state.

---

## Design — four units

### 1. `src/app/kit-behaviors.ts` — curated catalog + lookup + scanner bridge

```ts
export interface KitNote { text: string; kind: "expected" | "gap"; }

// Curated, keyed by (component → variant|state). Seeded NARROW for v1.
export const KIT_BEHAVIORS: Readonly<Record<string, {
  variants?: Record<string, readonly KitNote[]>;
  states?: Record<string, readonly KitNote[]>;
}>> = {
  button: {
    variants: {
      outline: [{ text: "Nuxt adds an inset ring — expected; the recipe has no inset concept.", kind: "expected" }],
      link:    [{ text: "Underline shows on hover only (Nuxt default).", kind: "expected" }],
    },
  },
};

export function behaviorsFor(
  component: string,
  sel: { variant?: string; state?: string },
): readonly KitNote[] { /* look up KIT_BEHAVIORS[component].variants[sel.variant] / .states[sel.state] */ }
```

**Scanner bridge** (reuse the free token-level deviations):
```ts
// Maps the component's capability-deviation ScanIssues to KitNotes (+ the state cell they apply to, where derivable).
export function scannerNotesFor(
  component: string,
  graph: TokenGraph | null,
): { byState: Record<string, readonly KitNote[]>; all: readonly KitNote[] }
```
- Runs `scanGraph(graph, { components: [component] })` internally (graph is already available in the Kit), then filters its issues to `componentName === component` and a fixed `CAPABILITY_DEVIATION_KINDS` set. Self-contained — no `issues` prop threaded down from app state.
- Derives the cell key for inline placement where clean: `disabled-via-opacity` → state `disabled`; `unsupported-state`/`state-via-prop` → their state (from the issue's token/kind). Where no clean state mapping exists (e.g. `resting-shadowed-by-state`), the note goes only into `all` (the b3 catalog), not inline.
- Each issue → `KitNote { text: issue.message (or a friendlier rephrase), kind: "expected" }`.

Pure functions, fully unit-tested. No UI, no Vue.

### 2. `src/app/components/KitMatrix.vue` — shared layout + inline notes

Props: `{ componentName: string; variantCells: VariantCell[]; stateCells: StateCell[]; graph: TokenGraph | null; showDiagnostics: boolean }`. A scoped slot `#cell="{ cell }"` lets the caller render the real `<U*>` for one cell. KitMatrix computes `scannerNotesFor(componentName, graph)` once (a computed) for the inline state-cell notes.

Renders, top→bottom:
- **Variants row** — the `variantCells` with `axis === "variant"`, as a labeled horizontal strip; each cell = scoped-slot `<U*>` + an inline `ⓘ` note if `behaviorsFor(componentName, { variant: cell.key }).length` (rendered next to the cell) + the gated per-cell diagnostics (reuse `RealVariantCell`/`useRealRender`).
- **Colors row** — the `variantCells` with `axis === "color"`, same treatment.
- **States row** — the `stateCells`; inline note = `behaviorsFor(componentName, { state: cell.state })` ∪ `scannerNotesFor(componentName, graph).byState[cell.state]`.
- Cells with no note render no `ⓘ` (no clutter).

`KitMatrix` is the single home of A (axis-row layout) + B-inline (the `ⓘ` notes). It reuses the existing diagnostics machinery per cell (so `showDiagnostics` still gates the delta tables).

### 3. The 7 `LiveReal*.vue` → use `KitMatrix`

Each `LiveReal*` keeps its **hero** + gated resting `RenderDeltaTable` (unchanged), and replaces its two `<RealVariantCell v-for>` loops with one `<KitMatrix>`:
```html
<KitMatrix :component-name="componentName" :variant-cells="variantCells" :state-cells="stateCells"
  :graph="graph" :show-diagnostics="showDiagnostics">
  <template #cell="{ cell }">
    <UButton v-bind="cell.props" :ui="cell.ui" size="md">Button</UButton>
  </template>
</KitMatrix>
```
`graph` is already a prop on each `LiveReal*`; KitMatrix computes the component's scanner notes from it (no app-state threading). The per-component `<U*>` markup stays in each `LiveReal*` (it differs per component). Mechanical change × 7 files.

### 4. b3 catalog panel in `LiveKitPanel`

A collapsible **"Known Nuxt behaviors"** disclosure (sibling to the existing diagnose toggle), listing `behaviorsFor(componentName, …)` (all entries) + `scannerNotesFor(componentName, issues).all` as a per-component reference. Default collapsed.

---

## Data flow

`graph → usePreviewRecipe → recipe → buildVariantCells/buildStateCells → LiveReal* (graph in hand) → KitMatrix`. KitMatrix renders each cell via the scoped slot, looks up `behaviorsFor` + `scannerNotesFor(componentName, graph)` for the inline `ⓘ`, lays cells out as axis-rows, and gates per-cell diagnostics by `showDiagnostics`. `LiveKitPanel`'s b3 panel reads the same two lookups for the full catalog. No change to recipe building or the scanner — purely additive presentation + a new data module.

## Error handling

- A component/cell with no catalog entry and no scanner issue → no note (the common case; silent, not blank).
- `scannerNotesFor` with no issues for the component → empty (b3 panel hidden or shows "none").
- The notes never block the render — they're additive annotations.

## Testing

- **`kit-behaviors.test.ts`** (unit): `behaviorsFor` returns the seeded notes for `button.outline`/`button.link` and `[]` otherwise; `scannerNotesFor` filters by component + capability kinds, maps `disabled-via-opacity` → `byState.disabled`, and routes unmappable kinds to `all` only.
- **`KitMatrix.test.ts`** (mount): renders a Variants/Colors/States row from fixture cells; an `ⓘ` note appears on a cell with a catalog entry (`outline`) and on a `disabled` state cell with a scanner issue; NO note on a plain cell; diagnostics gated by `showDiagnostics`; scoped slot receives each cell.
- **`LiveKitPanel`**: b3 panel mounts with the component's notes; collapsed by default.
- **`LiveReal*`**: existing tests stay green after the `KitMatrix` swap (the variant/state cells still render the real `<U*>`).
- **Visual layout + note placement** verified via headless `/browse` on the live export (not jsdom-testable for computed styles).
- Pre-commit gate (vue-tsc + full vitest) green throughout.

---

## Resolved / flagged decisions (for your spec review)

1. **A = axis-rows, NOT a cartesian variant×color grid.** *(confirmed in review.)* The sketch implied a product grid; the existing `buildVariantCells` only yields per-axis cells, so v1 lays out labeled Variants/Colors/States rows. The true product grid is a future option (new cell logic + combinatorial size).
2. **Inline scanner notes only where a clean state mapping exists** (e.g. `disabled-via-opacity` → disabled cell); all others go into the b3 catalog only. Avoids guessing cell placement.
3. **Inline-note density: only on cells with a note** (no `ⓘ` on plain cells).

## Future (parked)
- Per-size cells (#1); true cartesian variant×color product grid; full behavior catalog (grow during joint component review); Q (true-export fidelity).
