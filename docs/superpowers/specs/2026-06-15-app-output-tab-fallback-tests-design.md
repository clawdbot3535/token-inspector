# App.vue Output-Tab Fallback + Custom-Tab Tests — Design

**Date:** 2026-06-15
**Status:** Approved
**Type:** Test coverage + one small additive test hook

## Problem

The previous increment (v0.28.2) deferred two output-tab behaviors because they need a
*custom-flagged* component fixture:

- **Conditional custom tab** (App.vue:130-134): `outputTabs` includes `custom-components.ts`
  only when `customOutputText` is non-empty (a component the scanner flagged
  `component-looks-custom`). Untested — the third tab could silently stop appearing.
- **Active-tab fallback watch** (App.vue:138-142): when `outputTabs` shrinks and the active
  tab is no longer in it, the watch resets `state.outputTab.value` to `tokens.css`. Without
  it, the preview pane renders blank with a dangling active tab. Untested.

## Feasibility (verified during planning)

A throwaway probe ran the exact app path (`buildGraph` → `scanGraph(g, { components:
COMPONENT_ALLOW_LIST })` → `customPartsByComponent` → `customComponentsRenderer.render`):

- `{ sidebar: { bg, item: { text } } }` → custom output text length 443 (→ 3 tabs).
- `{ button: { bg } }` → custom output text length 0 (→ 2 tabs).

So a `sidebar` fixture cheaply produces the custom tab, and a plain fixture removes it.
`handleFiles` (App.vue:434-453) replaces the graph wholesale and resets selection/view, so a
second load drives the custom→plain transition that fires the fallback watch.

## Approach

New file `src/app/App.output-tabs.test.ts`, reusing the established jsdom harness (the
`flushAll` FileReader helper, the `ResizeObserver` / `matchMedia` / `fetch` stubs, the
`Blob.prototype.text` polyfill, the heavy-children + `Live*` stub set). Two differences from
the view-state test's mount options:

- `UButton` is stubbed as a **click-passthrough** (`<button v-bind="$attrs"><slot/></button>`)
  so the clear-graph button's `@click` fires and its `data-testid` falls through. (The real
  Nuxt UI `UButton` forwards attrs + click, so this faithfully models production.)
- A `mountLoaded(file)` helper parameterized by which fixture file to load.

Fixtures:
- `customFixtureFile()` → `global.tokens.json` = `{ sidebar: { bg, item: { text } } }` (3 tabs).
- `plainFixtureFile()` → `global.tokens.json` = `{ button: { bg } }` (2 tabs).

### One additive production change

Add `data-testid="clear-graph"` to the clear-graph button (App.vue:569-576, the
upload-icon `UButton` whose `@click` sets `state.graph.value = null`). Additive attribute,
no logic change; consistent with the existing `commit-open` / `live-filter` / `tab-*` testids.

## Test cases

1. **Custom tab appears for a custom-flagged component** — load `customFixtureFile()`; assert
   `[data-testid="tab-custom-components.ts"]` exists (alongside `tab-tokens.css` /
   `tab-app.config.ts`).
2. **No custom tab for a plain component** — load `plainFixtureFile()`; assert
   `[data-testid="tab-custom-components.ts"]` does **not** exist (exactly the
   `tokens.css` + `app.config.ts` pair renders).
3. **Fallback watch resets the active tab when it disappears** —
   - Load `customFixtureFile()` (3 tabs).
   - Click `tab-custom-components.ts`; assert it is `aria-selected="true"`.
   - Click `[data-testid="clear-graph"]` → `state.graph.value = null` (the loader returns;
     `outputTabs` shrinks to the 2-tab set → the watch fires).
   - Re-load via the now-present file input with `plainFixtureFile()` (2 tabs visible).
   - Assert `tab-custom-components.ts` no longer exists **and** `tab-tokens.css` is
     `aria-selected="true"` — proving the watch reset the active tab from the (now absent)
     `custom-components.ts`. Without the watch the active tab would still be
     `custom-components.ts`, so no tab would be selected and the assertion would fail.

## Out of scope (still deferred)

- **View/scan toggle** — the issues button renders only when `issueCount > 0`; needs a
  deterministic issue-producing fixture, a separate investigation.
- **Download .zip** (Blob/URL mocking; `zip.ts` unit-tested), **Figma URL paste**
  (`parseFigmaFileUrl` unit-tested).

## Success criteria

- `src/app/App.output-tabs.test.ts` exists and passes (3 tests).
- `data-testid="clear-graph"` present on the clear button; no existing test broken.
- Full suite green.

## Release

Patch release **v0.28.3** (CHANGELOG `### Tests` + a note on the `clear-graph` testid;
README test-count bump; tag, merge, push, GitHub Release). No roadmap-feature row.
