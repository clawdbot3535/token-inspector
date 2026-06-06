# Design: checkbox + radio previews (LiveCheckbox, LiveRadio)

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/checkbox-radio-preview`
- **Theme:** complete the core form-control previews — `LiveCheckbox` (square + checkmark) and
  `LiveRadio` (circle + dot), each a token-driven box with a decorative indicator, unchecked +
  checked. Same pattern as `LiveSwitch` (token track + decorative thumb).

## Problem / goal

`checkbox` and `radio` have recipes and inventory entries but no previews. Build one bespoke
preview each. Findings (real recipe):
- **Box (base) is token-driven for colours + shape:** `bg`, `bg-checked` (a `checked:` class),
  `border`→`ring` (both are ring-framed), and `radius` (`checkbox`→`rounded-sm`, `radio`→
  `rounded-full`) all map to `base`.
- **Box SIZE is NOT token-driven:** `checkbox-size-md`/`radio-size-md` → `null` (the grammar
  doesn't recognise the `size` utility name — the known color/size gap). So the preview box uses a
  fixed decorative size.
- **Indicator is NOT token-driven:** `checkbox-check`/`radio-dot` don't route (naming mismatch,
  exact-match routing). So the checkmark/dot is drawn decoratively (shown when checked).

Both components are inventoried already (`checkbox` from the slot-inventory cycle, `radio` from the
switch cycle); the `checked` projection already exists. So this cycle is purely the two preview
components + their `App.vue` wiring.

Success criteria:
- Selecting `checkbox` → `LiveCheckbox`: a small **square** (token bg/ring/`rounded-sm`) rendered
  **unchecked** and **checked** (bg/ring flip via the `checked:` classes), with a decorative
  checkmark in the checked cell.
- Selecting `radio` → `LiveRadio`: a small **circle** (`rounded-full`) rendered unchecked +
  checked, with a decorative dot in the checked cell.
- Both JIT-safe (the `checked:bg` resolves to an inline `backgroundColor` differing from
  unchecked). Sidebar `Live` pill for both. `LiveSwitch`/other previews unaffected; full suite +
  typecheck + build green; headless QA clean.

## Decisions

- **Two bespoke components** (`LiveCheckbox.vue`, `LiveRadio.vue`), consistent with the
  one-`LiveX`-per-component pattern (`LiveButton`/`LiveBadge`/`LiveSwitch`). They are ~90% alike,
  but the per-component split keeps each focused and matches the existing convention.
- **No size switch.** The box size isn't token-driven (`size-md` → null), so a size switch would
  have no visible effect; the meaningful axis is unchecked/checked. (YAGNI; add later if the
  color/size grammar gap is closed.)
- **Two cells: unchecked + checked**, projected from `base` via `projectToState(base, "default")`
  and `projectToState(base, "checked")` (the `checked` state added in the switch cycle).
- **Decorative indicator** (shown only in the checked cell): a checkmark for checkbox
  (`i-lucide-check` via `UIcon`), a filled dot for radio (a small `rounded-full` span). Not
  token-driven (check/dot don't route; Nuxt's defaults are a plain check/dot anyway).
- **Fixed decorative box size** (e.g. `size-5`), since the recipe size doesn't map.
- **`base` only** (no size-variant merge) — the box's colours/ring/radius all live on `base`, and
  the size variants are dominated by the unmapped `size-md`.

## Design

Both files mirror the `LiveSwitch` pipeline (recipe → `projectToState` → `extractArbitrary` →
inline styles; fallback message; copy + highlight code block).

### `src/app/components/LiveCheckbox.vue` (new)
- Props: `graph`, `componentName?` (default `"checkbox"`), `highlightUtility?`, `completeness?`.
- `recipe`, `baseClasses = recipe.slots.base`.
- `cells` = `(["default","checked"] as const).map(state => { const { classes, style } =
  extractArbitrary(projectToState(baseClasses, state)); return { label: state === "default" ?
  "unchecked" : "checked", classes, style, checked: state === "checked" }; })`.
- Template, per cell: a box `<span data-testid="checkbox-box" class="inline-flex items-center
  justify-center size-5" :class="cell.classes" :style="cell.style">` containing, when
  `cell.checked`, a decorative `<UIcon name="i-lucide-check" class="size-3/4 text-white" />`.
  Cell label `unchecked`/`checked`. Header: label + `activeCompleteness` (if scan present) +
  copy; a representative code block (`inspectClasses = baseClasses`) with `highlightSegments`.
- `data-testid="checkbox-box"` on the box; the checkmark is decorative.

### `src/app/components/LiveRadio.vue` (new)
- Same structure, `componentName` default `"radio"`, box `data-testid="radio-box"`, and the
  decorative indicator is a dot: `<span class="size-1/3 rounded-full bg-white" />` shown when
  `cell.checked`. The recipe's `rounded-full` (from `radio-radius`) makes the box a circle.

### `src/app/App.vue`
- `COMPONENTS_WITH_PREVIEW` += `"checkbox"`, `"radio"`.
- Import `LiveCheckbox`, `LiveRadio`. Add two `v-else-if` branches at BOTH mount sites, after the
  `LiveSwitch` branch and before `LiveButton`: `selectedComponent === 'checkbox'` → `LiveCheckbox`,
  `selectedComponent === 'radio'` → `LiveRadio` (token site keeps the `selectedNode.id.split('-')[0]
  === selectedComponent` guard, mirroring the siblings). Update the "not yet available" copy.

### Tests
- `LiveCheckbox.test.ts`: a checkbox graph (`bg`, `bg-checked`, `border`) → two `checkbox-box`
  cells; the checked box's inline `backgroundColor` differs from unchecked (JIT-safe); fallback on
  null graph. (`UIcon` stubbed — assert via the box, not the icon.)
- `LiveRadio.test.ts`: same with `radio-box`; plus the box carries a rounded radius when
  `radio-radius` is present (e.g. inline `borderRadius` set, or the `rounded-full` class resolved).

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Headless QA: select `checkbox` then `radio`; confirm a square / circle that flips background
  between unchecked and checked, a checkmark / dot in the checked cell, the `Live` pill, console
  clean. Screenshot each.

## Out of scope
- Size switch / token-driven box size (the color/size grammar gap).
- Token-driven indicator (needs `check`→`icon` / `dot`→`indicator` Figma rename or aliased
  routing — deliberately left to the unsupported-part rename hint).
- A shared `LiveCheckable` component (chose two bespoke).

## Risks
- **Decorative indicator + size** — documented; the box colours/ring/shape (the bulk) are
  token-driven. If the grammar gap / Figma rename land later, the box size and indicator become
  token-driven without changing the preview's structure.
- **Chain length in App.vue** — the mount sites now have a 6-way `v-if`/`v-else-if` chain
  (input/textarea → badge → switch → checkbox → radio → button). Each branch is exact and mutually
  exclusive; `LiveButton` stays the catch-all. Verify no component routes to two previews.
