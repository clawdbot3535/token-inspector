# App.vue Preview-Routing Tests — Design

**Date:** 2026-06-15
**Status:** Approved
**Type:** Test coverage (no production code change)

## Problem

`src/app/App.test.ts` mounts the whole app and characterizes the **load/commit gates**
(no graph → drop zone → load file via the real `handleFiles` path → commit toggle →
commit panel). It stubs every inspector child and never selects a component, so the
**preview-routing logic in `App.vue` is entirely untested.**

That routing is the project's most fragile seam, documented as a recurring footgun:

- `App.vue` has **two** `v-else-if` template chains that pick the live preview for the
  selected component:
  - **Chain 1 (token-selected):** gated on
    `previewSupported && selectedComponent === '<name>' && selectedNode.id.split('-')[0] === selectedComponent`.
    Renders inside `<template v-if="selectedNode && state.graph.value">`.
  - **Chain 2 (component-group):** gated on the simpler `previewSupported && selectedComponent === '<name>'`.
- In **both** chains, `LiveButton` is the final **unguarded catch-all** (its gate has no
  `selectedComponent === 'button'` check). So a component added to
  `COMPONENTS_WITH_PREVIEW` *without* its own earlier branch silently renders
  button-shaped — tests stay green, the preview is wrong.

Untested routing nuances:
- `textarea` must route to `LiveInput` (the field-component preview), not `LiveButton`.
- `chip` / `sidebar` are custom-recipe previews that carry an extra `:custom-parts` prop.
- A name **not** in `COMPONENTS_WITH_PREVIEW` (e.g. `tooltip`) must route to **no** `Live*`
  at all (the catch-all must not fire for an unsupported component, because `previewSupported`
  is false).

## Goal

A characterization test that, for every name in `COMPONENTS_WITH_PREVIEW`, asserts the
correct `Live*` component renders in **both** chains and that the `LiveButton` catch-all
does **not** fire for non-button components. Guards the catch-all footgun against future
branch reorders / forgotten branches.

## Approach

**Name-emitting `Live*` stubs** (chosen). Mount `App` with a loaded graph, stub all 16
`Live*` components with stubs that emit a stable testid (`<div data-testid="live-card" />`,
etc.), and drive selection by `$emit`-ing the same events the real `ComponentTree` fires
(`select-component` for the group, `select` for a token id). test-utils lets a stubbed
child emit events; the parent's `@select-component` / `@select` handlers run and mutate
`selectedComponent` / `state.selection`. Then assert the matching `live-<name>` testid is
present and `live-button` is absent (except when the name is `button`).

This characterizes **routing** — the thing that breaks — independent of recipe internals.
Rendering fidelity is already covered by the 16 per-component `Live*.test.ts` files.

**Rejected — real `Live*` + DOM-signature assertions:** brittle (depends on recipe output
and `extractArbitrary` inline styles) and redundant with the per-component tests.

### Why selection can be driven from a stubbed tree

`ComponentTree` is stubbed `true`, but `wrapper.findComponent(ComponentTree).vm.$emit(...)`
still fires the parent's listeners:
- `@select-component="(name) => { selectedComponent = name; ... }"` — drives Chain 2.
- `@select="(id) => (state.selection.value = id)"` — sets the selected node id; combined
  with a graph that contains a node whose id starts with `<name>-`, `selectedNode` resolves
  and Chain 1's `selectedNode.id.split('-')[0] === selectedComponent` is satisfied.

`previewSupported` only checks set membership, so Chain 2 routing does not require per-component
tokens. Chain 1 requires a real node id in the graph, so the fixture loads tokens that produce
one selectable node id per component under test.

## Test structure

New file: `src/app/App.preview-routing.test.ts` (keep `App.test.ts` as the gates test —
many-small-files; the routing concern is distinct from the load/commit concern).

Reuses the existing jsdom harness from `App.test.ts`: `ResizeObserver` / `matchMedia` /
`fetch` stubs, the `Blob.prototype.text` polyfill, and the `flushAll` FileReader helper.
Lift the shared shims into the new file (duplicated, not extracted — two small test files
are clearer than a shared helper module for ~30 lines of jsdom shims).

Mount options: all heavy non-preview children stubbed `true` (as today) **plus** all 16
`Live*` stubbed to name-emitting stubs. `ComponentTree` stubbed `true` (we emit from it).

Fixture: a token file whose component collection contains one color token per preview
component, named so the build produces a selectable node id of the form `<name>-bg` (e.g.
`button-bg`, `card-bg`, `chip-bg`, `sidebar-bg`, …). Loaded through the real `handleFiles`
path (file input `change`), exactly like `App.test.ts`.

**Node-id probe (plan step):** Chain 2 routing is purely name-driven (emit
`select-component(name)`), so it needs no per-component tokens and covers all 16 names
unconditionally. Chain 1 routing depends on `selectedNode.id.split('-')[0] === name`, i.e.
on the exact node-id shape the build emits. The plan's first step probes the real id shape
from a candidate fixture (dump `state.graph` node ids) before writing Chain 1 assertions.
If a clean `<name>-…` id is reproducible for every component, Chain 1 loops over all 16;
if some names can't yield one, Chain 1 falls back to a representative subset (a standard
component, a field component, a custom component) while Chain 2 stays comprehensive. Either
way the catch-all footgun is fully guarded by the comprehensive Chain 2 pass.

Cases:
1. **Chain 2 (group select) routing** — for each `name` in `COMPONENTS_WITH_PREVIEW`:
   emit `select-component(name)`, assert `live-<live-of(name)>` present and, when
   `name !== 'button'`, `live-button` absent.
2. **Chain 1 (node select) routing** — for each `name`: set selection to `<name>-bg`,
   emit `select-component(name)`, assert the same.
3. **`textarea` → `LiveInput`** — explicit assertion that `textarea` routes to `live-input`,
   not `live-button` (the field-component nuance).
4. **Unsupported component → no preview** — emit `select-component('tooltip')`; assert no
   `live-*` testid renders (catch-all must not fire when `previewSupported` is false).

`live-of(name)` maps the routing names to their stub testids: `button→live-button`,
`input→live-input`, `textarea→live-input`, `badge→live-badge`, `switch→live-switch`,
`checkbox→live-checkbox`, `radio→live-radio`, `card→live-card`, `kbd→live-kbd`,
`progress→live-progress`, `modal→live-modal`, `table→live-table`, `dropdown→live-dropdown`,
`accordion→live-accordion`, `nav→live-nav`, `sidebar→live-sidebar`, `chip→live-chip`.

## Out of scope (deferred)

Lower regression risk; separate increment if wanted later:
- Output-tab switching (`CodePreview` / `OutputSection`, incl. the conditional `custom` tab).
- Issues-view toggle (`ScanView`).
- Selection of individual tokens → detail pane content.

## Success criteria

- `src/app/App.preview-routing.test.ts` exists and passes.
- It fails if any `COMPONENTS_WITH_PREVIEW` member loses its branch in either chain (the
  catch-all then renders `live-button` and the assertion trips).
- Full suite green; no production code touched.

## Release

Test-only. Patch release **v0.28.1** (CHANGELOG `### Tests` note, README test-count bump,
tag, merge, push, GitHub Release). No roadmap-feature row.
