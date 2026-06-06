# Design: badge preview size switcher

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/badge-size-switcher`
- **Theme:** replace `LiveBadge`'s fixed size-rows with a `sm/md/…` size switcher (one row of
  colour badges for the selected size), mirroring `LiveButton`'s switcher. A small follow-up to
  the badge preview.

## Problem / goal

`LiveBadge` (shipped in the badge-preview cycle) renders the colour×size matrix as **one row per
size** (layout L1). `LiveButton` instead offers an `sm/md/lg` **switcher**. With more than two
sizes the stacked rows get tall, and the two previews handle size inconsistently. Give `LiveBadge`
the same switcher: pick a size, see that size's full colour row.

Scope is `LiveBadge` only — **not** a shared/unified switcher across previews (that broader option
was considered and declined; it would touch the working `LiveButton`). Mirror `LiveButton`'s
inline switcher pattern locally.

Success criteria:
- When a badge recipe has **>1 size**, `LiveBadge` shows a size switcher (one toggle button per
  size, the active one highlighted); the badge grid shows **one row** of colour badges for the
  selected size.
- Switching the size re-renders the colour row at that size (classes/styles change).
- With **≤1 size**, no switcher renders — just the single row.
- Defaults to `md` when present, else the first (ordered) size.
- Borders still resolve to inline styles (the JIT guard holds); `button`/`input`/`textarea`
  previews untouched; full suite + typecheck + build green; headless QA clean.

## Decisions

- **Inline switcher in `LiveBadge`**, mirroring `LiveButton`'s `stateAxisSize` toggle — not a
  shared composable (the declined "unified everywhere" option). Keeps the change local and leaves
  `LiveButton` untouched.
- **One colour row for the selected size**, replacing the per-size rows. Colour stays the primary
  axis (the row); size moves from a row-axis to a switcher.
- **`activeSize` is a guarded derivation**, not the raw ref: `selectedSize` (ref, default `"md"`)
  is resolved through `activeSize = sizes.includes(selectedSize) ? selectedSize : (sizes[0] ?? "default")`
  so a graph/size-set change can never leave the row pointed at a missing size.
- **Switcher hidden at ≤1 size** — a one-button switcher is noise; the single row suffices.
- **Completeness shows once** (for `activeSize`), not per row.

## Design

### `src/app/components/LiveBadge.vue` (revise)

- Add `import { ref } from "vue"` (alongside the existing `computed`).
- `const selectedSize = ref<string>("md");`
- `const activeSize = computed(() => (sizes.value.includes(selectedSize.value) ? selectedSize.value : (sizes.value[0] ?? "default")));`
- Replace the `rows` computed (size-rows × colour-cells) with a single-row `cells` computed:
  ```typescript
  const cells = computed<BadgeCell[]>(() => {
    if (!badgeRecipe.value) return [];
    return colors.value.map((color) => {
      const { classes, style } = extractArbitrary(projectToState(mergedFor(color, activeSize.value), "default"));
      return { color, classes, style };
    });
  });
  ```
- Completeness for the active size: `const activeCompleteness = computed(() => cellCompleteness(activeSize.value));`
- Representative code block: `inspectClasses` uses `activeSize` instead of the hard-coded `md`-or-first.
- **Template:**
  - Header keeps the `colour` label + copy button; insert a size switcher between them, shown
    only when `sizes.length > 1`, mirroring `LiveButton`'s markup (an `inline-flex` rounded group
    of `<button>`s, the active one styled `bg-primary text-inverted`, `data-testid="badge-size-switch"`
    on each button, `@click="selectedSize = s"`).
  - Replace the `<template v-for="row in rows">` grid with a single wrapping flex row of
    `<span data-testid="badge-cell" …>` over `cells` (same span markup as today: `:class="cell.classes"`,
    `:style="cell.style"`, content = `cell.color`).
  - Render the `activeCompleteness` n/m once (e.g. next to the label).
- `SizeRow` interface and the per-size `rows` structure are removed; `BadgeCell` stays.

### Tests (`src/app/components/LiveBadge.test.ts`) — update

- **fallback** (null graph) — unchanged (no cells).
- **one colour row for the active size:** the 2-colour × 2-size `badgeGraph()` → `badge-cell`
  count equals the **colour** count (2), not colours×sizes; all `<span>`; the border JIT guard
  still holds (≥1 cell with inline `borderStyle: solid` + `borderColor`).
- **switcher present with >1 size:** `findAll('[data-testid="badge-size-switch"]').length === 2`
  (sm, md).
- **switching size re-renders:** record a cell's `class`/`style` (or the `inspectClasses` code
  block text) for the default size, click the other size button (`await` the click), assert the
  rendered classes change (md vs sm carry different `px-*`/`text-[…]`).
- **no switcher with ≤1 size:** a `badgeGraph` variant with a single size → no
  `badge-size-switch` buttons, one colour row still renders.
- Remove/replace the old "4 cells (2×2)" and "2 size-label rows" assertions.

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Headless QA (committed `components/*.tokens.json`): select `badge`; confirm the `sm/md`
  switcher, one colour row that changes when toggled, coloured backgrounds + borders, clean
  console. Screenshot.

## Out of scope
- A shared/unified size switcher across all previews (declined).
- Changing `LiveButton`'s switcher.
- New `extract-arbitrary` work (none needed).

## Risks
- **Reactivity of `selectedSize` across graph changes** — mitigated by the `activeSize` guard
  (never trusts the raw ref against the current size set).
- **Revises the just-shipped L1 layout** — intentional and approved; the `data-testid="badge-cell"`
  hook is preserved so only the row/switcher assertions change.
