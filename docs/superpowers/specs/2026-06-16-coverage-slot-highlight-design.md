# Coverage view — click-a-slot to highlight its tokens — Design

**Date:** 2026-06-16
**Status:** Approved
**Type:** Feature — interaction enhancement to the coverage view (v0.29.0)
**Parent:** `docs/superpowers/specs/2026-06-16-coverage-view-design.md` (the coverage view; this was its
explicit out-of-scope item).

## Context

The coverage view (v0.29.0) lists a component's slots but is read-only. This adds a direct
manipulation: click a slot that *has* tokens → highlight those tokens in the left token tree, so a
designer can jump from "the `item` slot is covered" to "…by exactly these tokens". It reuses the
existing highlight machinery (`state.highlightedIds` + the `ancestorPaths` auto-reveal that the
selection watch already uses), so it composes rather than inventing a new mechanism.

## Architecture

Three layers, each independently testable.

### 1. Engine — `src/coverage.ts`

Extend `SlotCoverage` with the tokens that route to the slot:

```ts
export interface SlotCoverage {
  slot: string;
  classification: SlotClassification;
  controls: string;
  touched: boolean;
  tokenIds: readonly string[];   // token ids routing to this slot ([] when untouched)
}
```

`coverageFor` already loops the component's tokens calling `getSlotMapping`; instead of a `touched`
`Set<string>`, accumulate a `Map<slot, string[]>` of ids. Then `touched = map.has(slot)` and
`tokenIds = map.get(slot) ?? []`. `tokenIds` is in graph-insertion order. Purely additive; the
overlay-context exclusion and all other behaviour are unchanged.

### 2. `CoverageView.vue`

A slot row with `tokenIds.length > 0` renders as a clickable control (`<button>` via
`<component :is>`, `cursor-pointer` + hover, `type="button"`); rows with no tokens render as a plain
element (nothing to highlight). On click, the clickable row emits `select-tokens(s.tokenIds)`.
`defineEmits<{ "select-tokens": [ids: readonly string[]] }>()`. The existing
`data-testid="coverage-slot"` / `data-slot` / `data-touched` attributes stay on the row element
regardless of which tag it is, so the v0.29.0 tests keep passing.

### 3. App.vue wiring

`<CoverageView @select-tokens="…">` runs a handler that highlights AND reveals, but does **not**
change `selection` or `view` (which is what keeps the user on the Coverage tab — the one way this
must differ from ScanView's handler, whose `selection` set would switch to node-detail and unmount
the coverage view):

```ts
@select-tokens="(ids: readonly string[]) => {
  state.highlightedIds.value = new Set(ids);
  const next = new Set(expandedPaths.value);
  for (const id of ids) for (const p of ancestorPaths(tokenTree.value, id)) next.add(p);
  expandedPaths.value = next;
  persistExpanded(next);
}"
```

`ancestorPaths(tree, id)` and `persistExpanded(set)` already exist (used by the
`watch(state.selection)` auto-reveal). Result: the left tree expands the highlighted tokens'
ancestor groups and highlights them, while the Coverage panel stays in place.

## Data flow

click slot row → `CoverageView` emits `select-tokens(tokenIds)` → App sets `highlightedIds` +
expands `ancestorPaths` for each id → `ComponentTree` highlights matching leaves (now revealed).

## Out of scope

- Highlighting from the node-detail (Chain 1) pane — coverage lives in the component-selected pane.
- Selecting/opening a single token on click (deliberately avoided — it would unmount the view).
- Highlighting tokens for *untouched* slots (there are none).

## Testing

- **`src/coverage.test.ts`**: a routed slot has its `tokenIds` populated (e.g. `nav-item-bg` →
  `item.tokenIds` contains `"nav-item-bg"`); an untouched slot has `tokenIds === []`.
- **`src/app/components/CoverageView.test.ts`**: a touched slot row is a clickable control and emits
  `select-tokens` with its `tokenIds` on click; an untouched slot row is not a button and emits
  nothing.
- **`src/app/App.coverage.test.ts`**: clicking a touched slot in the rendered coverage view sets
  `ComponentTree`'s `highlightedIds` prop to that slot's tokens AND leaves the coverage view mounted
  (no navigation to node-detail).

## Success criteria

- `SlotCoverage.tokenIds` is populated per slot; `[]` for untouched.
- Clicking a covered slot highlights + reveals its tokens in the left tree, staying on the Coverage
  tab. Untouched slots are inert.
- New + existing suites green.

## Release

Minor **v0.30.0** — user-facing interaction added to the coverage view. CHANGELOG `### Added`;
README test-count bump.
