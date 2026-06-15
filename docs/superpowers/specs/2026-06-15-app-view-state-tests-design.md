# App.vue View-State Tests — Design

**Date:** 2026-06-15
**Status:** Approved
**Type:** Test coverage + one small additive a11y change

## Problem

`App.vue` mount coverage now spans the load/commit gates (`App.test.ts`) and preview
routing (`App.preview-routing.test.ts`). The **app-level view-state machine** is still
untested:

- **Theme toggle** (App.vue:536-548): clicking `light`/`dark` sets `state.theme.value`,
  and an `immediate` watch (App.vue:152-160) toggles the `dark` / `light` class on
  `document.documentElement`. That side-effect drives Tailwind `dark:` variants and Nuxt
  UI color-mode — pure wiring, nothing guards it.
- **Live-filter chip** (App.vue:660-675): `[data-testid="live-filter"]` toggles `liveOnly`,
  reflected in its `aria-pressed` and passed to the component tree section.
- **Output-tab switching** (App.vue ~1125-1140): tab buttons set `state.outputTab.value`.
- **Selection → output-tab auto-switch** (App.vue:248-251): selecting a node with
  `layer === "component"` while the output tab is not `app.config.ts` auto-switches the tab
  to `app.config.ts`, so the code preview tracks the inspected component.

## Goal

A characterization test for the above four app-level behaviors, mounting the real `App`
and driving each through the DOM / child-event seams, asserting real side-effects.

## Approach

New file `src/app/App.view-state.test.ts`, reusing the jsdom harness pattern from
`App.preview-routing.test.ts` (the `flushAll` FileReader helper, the `ResizeObserver` /
`matchMedia` / `fetch` stubs, the `Blob.prototype.text` polyfill, the heavy-children stub
set, and the `mountLoaded()` + `tokenFile()` fixture). Heavy children stay stubbed `true`;
`Live*` stay stubbed (their identity is irrelevant here). `ComponentTree` stays stubbed and
is driven via `findComponent(ComponentTree).vm.$emit(...)` (same seam as the routing test).

Assertions target **real side-effects**, not Tailwind class strings:
- Theme → `document.documentElement.classList.contains("dark" | "light")`.
- Live-filter → the chip's `aria-pressed` attribute.
- Output tab → the tab button's `aria-selected` attribute (added in this increment).
- Auto-switch → the `app.config.ts` tab's `aria-selected` after selecting `button-bg`.

### One additive production change

The output-tab buttons currently expose no per-tab test/a11y hook. Add to each tab button:
- `:data-testid="`tab-${tab}`"`
- `role="tab"` and `:aria-selected="state.outputTab.value === tab"`

This is additive (an `aria-selected` tablist is a real a11y improvement and the clean test
seam) and changes no logic. No other production code is touched.

### Fixture

Reuse the `{ <name>: { bg: … } }` `global.tokens.json` fixture from the routing test (the
probe confirmed these nodes classify as `layer === "component"`, with ids `<name>-bg`).
Theme / live-filter / output-tab tests need only a loaded graph; the auto-switch test
selects `button-bg`.

## Test cases

1. **Theme toggle** — clicking the `dark` button adds `dark` to `document.documentElement`
   and removes `light`; then clicking `light` adds `light` and removes `dark`. Asserts the
   transition both ways (no assumption about the default theme, since the `immediate` watch
   may set one on mount). Buttons found by their `light` / `dark` text.
2. **Live-filter chip** — `[data-testid="live-filter"]` starts `aria-pressed="false"`; one
   click → `"true"`; second click → `"false"`.
3. **Output-tab switching** — the two default tabs render with `data-testid="tab-tokens.css"`
   / `tab-app.config.ts`; exactly one is `aria-selected` initially; clicking `tab-app.config.ts`
   makes it `aria-selected="true"` and `tab-tokens.css` `aria-selected="false"`; clicking
   `tab-tokens.css` reverses it. Asserts the switch both ways (no assumption about which tab
   is the default).
4. **Selection auto-switch** — first click `tab-tokens.css` to put the output tab in a known
   non-`app.config.ts` state, then emit `select("button-bg")` from `ComponentTree`; the
   `app.config.ts` tab becomes `aria-selected="true"` (the component-layer node forced the
   switch via App.vue:248-251).

## Out of scope (deferred — each needs a richer fixture)

- **View/scan toggle** — the issues button renders only when `issueCount > 0`; needs an
  issue-producing fixture (deterministic malformed tokens).
- **Custom-components tab + active-tab fallback watch** (App.vue:138-142) — needs a
  custom-flagged component (real `COMPONENT_ALLOW_LIST` + foreign-part structure), the same
  fixture difficulty as the Tier-3 preview probe.
- **Download .zip** (Blob/URL mocking; `zip.ts` is unit-tested in `zip.test.ts`).
- **Figma URL paste** (`parseFigmaFileUrl` is unit-tested in `figma-mapping.test.ts`).
- **Clear-graph** (`state.graph.value = null`; trivial, and the button is a stubbed `UButton`).

## Success criteria

- `src/app/App.view-state.test.ts` exists and passes (4 behavior groups).
- The output-tab `aria-selected` / `data-testid` / `role="tab"` additions are present in
  `App.vue` and break no existing test.
- Full suite green.

## Release

Patch release **v0.28.2** (CHANGELOG `### Tests` + a one-line note on the tab a11y addition;
README test-count bump; tag, merge, push, GitHub Release). No roadmap-feature row.
