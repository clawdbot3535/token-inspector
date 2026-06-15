# App.vue Scan-View Toggle Tests — Design

**Date:** 2026-06-15
**Status:** Approved
**Type:** Test coverage + one small additive test hook

## Problem

The last untested app-level behavior in `App.vue` is the **scan/issues view toggle**:

- The header issue button (App.vue:517-524) renders only `v-if="issueCount > 0"`
  (`issueCount = state.graph.value?.issues.length`) and toggles
  `state.view.value` between `"scan"` and `"inspector"`.
- The main pane switches on it: `ScanView` renders `v-if="state.view.value === 'scan'"`
  (App.vue:740-751), the inspector detail pane is the `v-else` (App.vue:752).

Nothing guards that the button is gated on issue count, that clicking it switches the
view, or that `ScanView` mounts/unmounts accordingly.

## Feasibility (verified during planning)

A throwaway `buildGraph` probe established both fixtures:

- `{ spacing: { sm: { $value: 8, $type: "dimension" } } }` → `graph.issues` empty → `issueCount === 0`.
- `{ button: { bg: { $value: "#3b82f6", $type: "color" } } }` → one `malformed-value` issue
  → `issueCount === 1`.

(Incidental finding, not addressed here: `buildGraph` flags a bare-hex color `$value` as
`malformed-value`, so any color fixture carries a graph issue. Harmless to existing tests;
noted as a separate data-format curiosity.)

## Approach

New file `src/app/App.scan-view.test.ts`, reusing the established jsdom harness (the
`flushAll` FileReader helper, the `ResizeObserver` / `matchMedia` / `fetch` stubs, the
`Blob.prototype.text` polyfill, the heavy-children + `Live*` stub set, and a
`mountLoaded(file)` helper). `ScanView` stays stubbed `true`; its presence is asserted via
`wrapper.findComponent(ScanView).exists()` (an unmounted `v-if` branch yields a
non-existent wrapper).

### One additive production change

Add `data-testid="scan-toggle"` to the header issue button (App.vue:516-524). Additive
attribute, no logic change; consistent with the existing `commit-open` / `live-filter` /
`tab-*` / `clear-graph` testids. The button already carries `:aria-pressed`.

### Fixtures

- `cleanFixtureFile()` → `global.tokens.json` = `{ spacing: { sm: { $value: 8, $type: "dimension" } } }` (0 issues).
- `issueFixtureFile()` → `global.tokens.json` = `{ button: { bg: { $value: "#3b82f6", $type: "color" } } }` (1 issue).

## Test cases

1. **No toggle button for a clean graph** — load `cleanFixtureFile()`; assert
   `[data-testid="scan-toggle"]` does not exist (`issueCount === 0` gates it out).
2. **Toggle mounts/unmounts ScanView** — load `issueFixtureFile()`:
   - `[data-testid="scan-toggle"]` exists with `aria-pressed="false"`;
   - `findComponent(ScanView).exists()` is `false` initially (view = `inspector`);
   - click the toggle → `findComponent(ScanView).exists()` is `true`, button `aria-pressed="true"`;
   - click again → `findComponent(ScanView).exists()` is `false`, button `aria-pressed="false"`.

## Out of scope

- The secondary `HeaderStatusStrip @open-scan` toggle path (App.vue:630-631) — mutates the
  same `state.view`, marginal extra coverage.
- The bare-hex `malformed-value` data-format question (separate investigation if wanted).

## Success criteria

- `src/app/App.scan-view.test.ts` exists and passes (2 tests).
- `data-testid="scan-toggle"` present on the header issue button; no existing test broken.
- Full suite green. Closes the App.vue mount-test coverage backlog item.

## Release

Patch release **v0.28.4** (CHANGELOG `### Tests` + a note on the `scan-toggle` testid;
README test-count bump; tag, merge, push, GitHub Release). No roadmap-feature row.
