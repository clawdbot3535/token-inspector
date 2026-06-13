# Reclassify Layout / Typography Primitives (Bucket E) — Design

**Date:** 2026-06-13
**Status:** Approved (suppress-the-noise scope: recognise non-component prefixes and split them out of `unmappedComponentPrefixes`; no layer change, no CSS-var emit)
**Feature:** Recognise the export's layout / type-scale prefixes (`typography`, `container`, `page`, `grid`, `stack`, `section`) as non-component primitives so they stop reading as "unmapped components".

## Problem

`buildGraph`'s `layerFor` classifies tokens by source file — the `global` source → `"component"` layer (`src/build-graph.ts:172-175`). The export authors layout/type-scale primitives (`typography-heading-1-font-size`, `container-max-width`, `grid-gap-sm`, `stack-gap-md`, `section-padding-y-lg`, `page-max-width`) in the `global` source alongside real component tokens, so they land in the component layer. They are not Nuxt components: most read as NULL via `getSlotMapping`, and a few even "map" to phantom `ui.stack` / `ui.grid` recipes Nuxt has no concept of.

The user-facing symptom is the scan forecast's `unmappedComponentPrefixes` (`src/scanner.ts:766-768`), surfaced in `ScanView.vue:185-186` as `Unmapped: typography, grid, stack, page, container, section, sidebar`. This conflates two different things: genuine *not-yet-supported components* (`sidebar` — a real component deferred to a custom emit) and *not-components-at-all* (the layout/type-scale primitives, which belong in the theme/CSS layer).

## Goal

The scanner distinguishes "not a Nuxt component" (layout/typography primitives) from "an unmapped component", so the forecast reports them separately and honestly.

Success criteria (asserted by unit tests):
- `NON_COMPONENT_PREFIXES` (in `@tg/grammar`) contains `typography`, `container`, `page`, `grid`, `stack`, `section`.
- For a graph whose component-layer tokens include `typography-*`, `grid-*`, and a genuinely-unknown component prefix (e.g. `sidebar-*`): `forecast.nonComponentPrefixes` contains `typography` and `grid` (sorted), and `forecast.unmappedComponentPrefixes` contains `sidebar` but **not** `typography` / `grid`.
- A real Nuxt component awaiting support (`sidebar`) stays in `unmappedComponentPrefixes`.
- `OutputForecast` gains `nonComponentPrefixes: readonly string[]`.

## Non-goals

- **No layer reclassification.** These tokens stay component-layer; `classifyToken` still skips them (`src/classify-token.ts:72`), so there is no CSS-var emit. (Reclassifying to `primitive` would emit raw `--typography-*` / `--grid-*` vars whose names are not Tailwind-canonical — that belongs to the separate "fonts `@theme{--font-*}` pipeline" backlog item, not here.)
- **No UI tab move.** They remain under the Components tab (`token-tree.ts` partitions by layer, which is unchanged).
- **No grammar mapping change.** `getSlotMapping` is untouched; the phantom `ui.stack` etc. never emit anyway (not in `COMPONENT_ALLOW_LIST`).
- **`sidebar`** is NOT in `NON_COMPONENT_PREFIXES` — it is a genuine component deferred to a custom emit (Bucket D part 2).

## Approach

### Part 1 — `NON_COMPONENT_PREFIXES` (grammar package)

In `packages/grammar/src/component-vocab.ts` (next to `NON_PART_SEGMENTS`, `~line 153`), add:

```ts
/**
 * Top-level token prefixes that are layout / type-scale primitives, not Nuxt
 * UI components. They land in the component layer (authored in the `global`
 * source) but belong to the theme/CSS layer — they should be reported as
 * non-component primitives, not as "unmapped components".
 */
export const NON_COMPONENT_PREFIXES: ReadonlySet<string> = new Set<string>([
  "typography", "container", "page", "grid", "stack", "section",
]);
```

### Part 2 — Scanner forecast split (src)

In `src/scanner.ts` `computeForecast` (`~line 766`), split the not-in-allow-list prefixes into the two buckets, importing `NON_COMPONENT_PREFIXES` from `@tg/grammar`:

```ts
const notAllowed = Array.from(allComponentPrefixes).filter((p) => !allowSet.has(p));
const nonComponentPrefixes = notAllowed.filter((p) => NON_COMPONENT_PREFIXES.has(p)).sort();
const unmappedComponentPrefixes = notAllowed.filter((p) => !NON_COMPONENT_PREFIXES.has(p)).sort();
```

Add `nonComponentPrefixes` to the returned forecast object. In `src/token-graph.ts`, add `nonComponentPrefixes: readonly string[];` to the `OutputForecast` interface (`~line 202`, beside `unmappedComponentPrefixes`).

### Part 3 — UI label (web)

In `src/app/components/ScanView.vue` (`~line 185`), keep the `Unmapped: …` line (now only genuine unmapped components) and add an adjacent line when `report.forecast.nonComponentPrefixes.length > 0`:

```html
Layout/typography primitives (theme/CSS, not `ui.*` recipes): {{ report.forecast.nonComponentPrefixes.join(", ") }}.
```

## Module / file layout

- **Modify** `packages/grammar/src/component-vocab.ts` — add `NON_COMPONENT_PREFIXES`.
- **Modify** `packages/grammar/src/component-vocab.test.ts` — assert the set's membership.
- **Modify** `src/token-graph.ts` — add `nonComponentPrefixes` to `OutputForecast`.
- **Modify** `src/scanner.ts` — split the forecast prefixes (import `NON_COMPONENT_PREFIXES`).
- **Modify** `src/scanner.test.ts` — the split behaviour (typography/grid → non-component; sidebar → unmapped).
- **Modify** `src/app/components/ScanView.vue` — render the non-component line.

No `build-graph` / `classify-token` / renderer / `getSlotMapping` change.

## Testing (TDD)

- **Grammar (`component-vocab.test.ts`):** `NON_COMPONENT_PREFIXES` contains the 6 prefixes and not a real component (`button`).
- **Scanner (`scanner.test.ts`):** a synthetic graph with `typography-body-color`, `grid-gap-sm`, and `sidebar-item-bg` (all component-layer, none in the allow-list) → `forecast.nonComponentPrefixes` = `["grid", "typography"]`; `forecast.unmappedComponentPrefixes` contains `"sidebar"` and not `"typography"`/`"grid"`.
- **Gate:** full suite + `vue-tsc`; `npm run build`; `npm run build:tokens` — the CLI digest is unchanged in character (the CLI prints scan *issues*, not the forecast prefix lists), so this is observable only via the scanner unit tests and the web ScanView. The committed `global.tokens.json` fixture does carry `typography-*` tokens, so a real scan now reports `typography` under `nonComponentPrefixes` instead of `unmappedComponentPrefixes` (a behaviour change in the scanner output, proven by the unit test).

## Known boundaries

- These tokens remain component-layer (Components UI tab, `classifyToken` skip) — by design under the chosen "suppress the noise" scope; emitting them as `@theme` CSS vars is deferred to the fonts-pipeline effort.
- `NON_COMPONENT_PREFIXES` is a closed set matched to the current export's 6 layout/type-scale prefixes; a future export with a new primitive family would need an entry (it would otherwise read as an unmapped component — a visible, self-correcting signal).
- The real layout tokens (`container`/`page`/`grid`/`stack`/`section`) live only in the 914-token export; only `typography-*` is in the committed fixture. Unit tests on synthetic graphs are authoritative.
