# Tier-2 Component Previews — Design Spec

**Date:** 2026-06-15
**Status:** Approved
**Feature branch:** `feat/tier2-previews`

## Problem

Tier-1 previews shipped in v0.26.0 (card/kbd/progress) on the `usePreviewRecipe`
composable. The five multi-element components still show an info pill instead of a
rendered preview: `modal`, `dropdown`, `accordion`, `nav`, `table`. Their recipes
are correct (v0.16.0–v0.24.0); this makes them visible.

## Goal

Bespoke live previews for all five, reusing the proven preview pattern
(`usePreviewRecipe` + `extractArbitrary(projectToState(...))` → inline styles,
fallback when no tokens, wired into both App.vue preview chains). One release,
**v0.27.0**. Representative fidelity — show the states/variants each recipe
defines, not an exhaustive matrix.

## Recipe shapes (live export)

```
modal:     content (bg/pad/ring/rounded) + overlay (rgba bg)
dropdown:  content (bg/ring/rounded) + item (text + hover:bg + active:bg + pad/radius)
accordion: item (border/font/gap/leading/pad/size/text/tracking + disabled:/focus:)
nav:       item (base: border/pad/size/leading/tracking) + variants.variant.{outline,ghost,link}.item (the colours live in the variants)
table:     base (bg/border/rounded) + th (bg/text) + td (text)
```

## Per-component render

Each is a new `Live*.vue`, props `{ graph, componentName, highlightUtility?,
completeness? }`, `usePreviewRecipe(() => props.graph, () => props.componentName)`,
fallback `<p>No <comp> tokens…</p>` when `recipe` is null. `r(classes)` ≔
`extractArbitrary(classes)` → `{ classes, style }`; `state(slot, s)` ≔
`extractArbitrary(projectToState(slot, s))`.

- **`LiveModal`** — an overlay box (`data-testid="modal-overlay"`, styled by
  `slots.overlay`) containing a content panel (`data-testid="modal-content"`,
  styled by `slots.content`) with a sample title + body line.
- **`LiveDropdown`** — a surface (`data-testid="dropdown-content"`, `slots.content`)
  containing three rows (`data-testid="dropdown-item"`) styled by `slots.item`
  projected to `default` / `hover` / `active`, labelled "Item / Hovered / Active".
- **`LiveAccordion`** — two rows (`data-testid="accordion-item"`) styled by
  `slots.item` projected to `default` and `disabled`, labelled "Section / Disabled".
- **`LiveNav`** — one row per variant present in `recipe.variants.variant`
  (`data-testid="nav-item"`), each styled by the **merged** base `slots.item` +
  that variant's `item` classes (projected to `default`), labelled with the
  variant name. (The base `item` carries no colour, so per-variant rendering is
  required to show anything coloured.)
- **`LiveTable`** — a `<table>` wrapped in a `slots.base` container
  (`data-testid="table-root"`); a header row of `slots.th`-styled `<th>`
  (`data-testid="table-th"`) + two body rows of `slots.td`-styled `<td>`
  (`data-testid="table-td"`).

## Wiring (`App.vue`)

For each: import the component; add its name to `COMPONENTS_WITH_PREVIEW`; add a
`v-else-if` branch in **both** template chains before the `LiveButton` catch-all
(chain 1 ≈ token-selected view, gate `previewSupported && selectedComponent ===
'<name>' && selectedNode.id.split('-')[0] === selectedComponent`, props incl.
`:highlight-utility`; chain 2 ≈ component-group view, gate `previewSupported &&
selectedComponent === '<name>'`, no `highlight-utility`). Name + both branches go
in together (LiveButton is the catch-all — a name without a branch renders
button-shaped).

## Testing

A jsdom mount test per preview (mirror `LiveCard.test.ts`): fallback message +
`0` root elements when `graph: null`; and with a realistic fixture graph, the
styled element(s) render and reflect a token value (non-empty inline style). For
`LiveNav`, assert one `nav-item` row per variant in the fixture; for `LiveTable`,
assert `table-th` and `table-td` both present; for `LiveDropdown`, assert three
`dropdown-item` rows.

## Scope boundaries

- Representative fidelity only — no exhaustive variant×state matrices.
- Tier-3 custom-recipe previews (`chip`, `sidebar`, rendered from
  `custom-components.ts`, not `ui.*`) remain deferred.
- No change to `usePreviewRecipe`, the recipe engine, or the grammar.

## Release

Ship as **v0.27.0**. README roadmap: move Tier-2 to released; "Next" = Tier-3
(`chip`/`sidebar`) + the data-blocked items.
