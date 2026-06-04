# Design: Sidebar — layer sections + chip cleanup

- **Date:** 2026-06-04
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/ui-sidebar-scan-cleanup`
- **Scope:** the left sidebar only. The scan-area navigation rework is a separate
  cycle (decomposed during brainstorming).

## Problem

The left sidebar lists all 514 tokens as one path-based tree. Component groups
(`button`, `input`, …) sit at the same level as primitive/semantic collections
(`color` 99, `border`, `font-size`, `font-weight`, …), so the thing the inspector is
actually about — components that map to Nuxt recipes — is mixed in with raw scales.
Above the tree, five classification filter chips (`All / Tailwind / Theme / Dark-var /
Component`) add chrome, and the `Component` chip duplicates what a structural grouping
would express.

## Goal

Group the sidebar into three collapsible **layer sections** — `Components`, `Semantic`,
`Primitives` — derived from each node's existing `layer` field, with `Components`
expanded by default and the other two collapsed. Remove the redundant `Component`
filter chip (the section replaces it); keep the orthogonal classification filters
(`All / Tailwind / Theme / Dark-var`), the search box, and expand/collapse. Reuse the
existing path-tree (`buildTokenTree`) and recursive renderer (`ComponentTree.vue`)
unchanged — the sections are only a partition layered on top.

Success criteria:
- The sidebar shows three section headers in order: `Components`, `Semantic`,
  `Primitives`, each with a token count; empty sections are hidden.
- `Components` is expanded on first render; `Semantic` and `Primitives` are collapsed.
- Inside each section, the existing path-tree renders exactly as today (same grouping,
  labels, `Live` pill, click-to-select, highlight).
- The `Component` filter chip is gone; `All / Tailwind / Theme / Dark-var` remain and
  still filter the tree; with a filter active, a section with zero matching tokens hides.
- Full suite + typecheck + build green; `buildLayeredTree` is unit-tested.

## Decisions

- **Group by `node.layer`** (`component` / `semantic` / `primitive`) — chosen over
  grouping by Figma source-collection (Color/Dimension/Typography). The layer field is
  the graph's own meaning (recipe-bound vs themeable vs raw scale) and directly separates
  components from the rest.
- **Keep the building blocks.** `buildTokenTree` and `ComponentTree.vue` do not change;
  a new pure `buildLayeredTree` partitions nodes by layer and calls `buildTokenTree` per
  partition. `ComponentTree` is rendered once per non-empty section.
- **Chip cleanup is minimal:** drop only the `Component` chip; the remaining chips are a
  classification filter on a different axis than layer, so they stay.

## Design

### Change 1 — `buildLayeredTree` (`src/app/token-tree.ts`)

A new pure function beside `buildTokenTree`:

```typescript
export interface LayerSection {
  /** The graph layer this section represents. */
  layer: GraphLayer;            // "component" | "semantic" | "primitive"
  /** Display label, e.g. "Components". */
  label: string;
  /** Path-tree for this layer's nodes (via buildTokenTree). */
  tree: TreeNode[];
  /** Leaf count in this section. */
  count: number;
}

/**
 * Partition nodes by graph layer and build a path-tree per layer.
 * Returns sections in fixed order [component, semantic, primitive];
 * sections with no nodes are omitted.
 */
export function buildLayeredTree(nodes: readonly TokenNode[]): LayerSection[];
```

- Order is fixed: `component`, then `semantic`, then `primitive`.
- `label`: `"Components"`, `"Semantic"`, `"Primitives"`.
- `count` = number of leaf nodes in the partition (sum of leaves in `tree`, or simply the
  partition length since every node is one leaf).
- Empty partitions are omitted (no empty section header).
- Implementation: a single pass partitioning `nodes` by `node.layer` into three arrays,
  then `buildTokenTree(partition)` for each non-empty one. Import `GraphLayer` from
  `@core/token-graph.js`.

### Change 2 — render sections in `App.vue`

Today `const tokenTree = computed(() => buildTokenTree(visibleNodes.value))` feeds a single
`<ComponentTree :nodes="tokenTree" …/>`, where `visibleNodes` is the classification-filtered
node list. Add a sibling computed for rendering and KEEP the flat one for the existing
helpers:

```typescript
const sections = computed(() => buildLayeredTree(visibleNodes.value)); // for rendering
// tokenTree stays: treeLeafCount, ancestorPaths, and the search-driven expand collection
// operate on path keys / leaf ids, which are identical flat or sectioned — so those
// helpers need no change.
```

Replace the single `<ComponentTree>` with a loop over `sections`. Each section is a
collapsible header (label + count + chevron) followed by a `<ComponentTree>` for
`section.tree` when the section is expanded.

- **Section collapse state:** a new reactive `Set<GraphLayer>` of expanded sections (or a
  per-layer boolean), initialised so `component` is expanded and `semantic`/`primitive`
  are collapsed. Persist alongside the existing collapse state if convenient, but not
  required for v1.
- **Props to `ComponentTree` are unchanged** (`nodes`, `selectedId`, `highlightedIds`,
  `expandedPaths`, `kindOf`, `preview-components`) — passed per section with
  `section.tree`. The within-tree expand/collapse state (`expandedPaths`) stays global
  and shared, as today.
- **Expand all / Collapse all** continue to operate on the leaf/group paths; they may also
  open/close the section headers (nice-to-have, not required).

### Change 3 — remove the `Component` filter chip

The classification filter chips live in `App.vue`. Remove the `Component` chip from the
chip list; keep `All`, `Tailwind`, `Theme`, `Dark-var`. The active classification filter
already produces a filtered node list that feeds the tree; with sections, the filtered
nodes are partitioned by layer and any section with zero matching nodes is omitted
(handled by `buildLayeredTree` returning no section for an empty partition).

### What does NOT change

- `buildTokenTree`, `leafIds`, `ancestorPaths` (token-tree.ts) — reused as-is.
- `ComponentTree.vue` (recursive renderer, `Live` pill, selection/highlight) — unchanged.
- The classification engine, recipe output, scan view, previews.

### Tests

- `src/app/token-tree.test.ts` (new cases for `buildLayeredTree`):
  - A mix of `component` / `semantic` / `primitive` nodes → three sections in the fixed
    order, each with the correct `label`, `count`, and a `tree` matching
    `buildTokenTree` of that partition.
  - Omitting a layer (e.g. no `primitive` nodes) → that section is absent.
  - All-one-layer input → a single section.
- App.vue has no mount test; the section wiring is covered by `npm run build` +
  `typecheck`. The behavioral logic lives in the unit-tested `buildLayeredTree`.

### Verification

- `npm run typecheck && npx vitest run && npm run build` — all green.
- Headless: load the real export; confirm three sections (`Components` open;
  `Semantic`/`Primitives` collapsed), the `Component` chip gone, the other chips still
  filtering, and the in-section trees/`Live` pills unchanged. Screenshot before/after.

## Out of scope

- Scan-area navigation rework (separate cycle).
- Grouping by Figma source-collection (rejected in favour of layer).
- Persisting section collapse state across reloads (could be a later nicety).

## Risks

- **Filter × section composition.** A classification filter that empties a layer must hide
  that section, not show an empty header. `buildLayeredTree` omitting empty partitions
  handles this, provided App.vue passes the already-filtered node list into it.
- **`expandedPaths` sharing.** Path keys are component-name-prefixed and unique across
  layers, so a single shared `expandedPaths` set works across all three sections without
  collisions. Confirmed by the existing path scheme (`<segment>/<segment>`).
