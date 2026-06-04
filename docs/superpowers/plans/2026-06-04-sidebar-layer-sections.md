# Sidebar — layer sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the left sidebar into three collapsible layer sections (Components / Semantic / Primitives), components expanded by default, and remove the now-redundant `Component` filter chip.

**Architecture:** A new pure `buildLayeredTree` partitions nodes by `node.layer` and reuses the existing `buildTokenTree` per partition. `App.vue` renders one collapsible section header + the existing `ComponentTree` per section. `buildTokenTree` and `ComponentTree.vue` are untouched; the flat `tokenTree` computed stays for the existing path/leaf helpers.

**Tech Stack:** TypeScript, Vue 3, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-sidebar-layer-sections-design.md`

**Branch:** `feat/ui-sidebar-scan-cleanup`. Commit per task. Do not push.

---

## File Structure

- `src/app/token-tree.ts` — **modify**: add `GraphLayer` import, `LayerSection` interface, `buildLayeredTree`.
- `src/app/token-tree.test.ts` — **modify**: unit tests for `buildLayeredTree`.
- `src/app/App.vue` — **modify**: `sections` computed + section collapse state + section-rendering template (replace the single `<ComponentTree>`).
- `src/app/components/FilterChips.vue` — **modify**: drop the `Component` chip.
- `CHANGELOG.md` — **modify** (Task 2): Added entry.

Reference: `node.layer: "primitive" | "semantic" | "component"`. `token-tree.test.ts` uses `makeNode({ id, path?, layer?, type?, source? })`. `buildTokenTree(nodes)` and the module-local `countLeaves` already exist.

---

## Task 1: `buildLayeredTree` + tests

**Files:** `src/app/token-tree.ts`, `src/app/token-tree.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/app/token-tree.test.ts` (it already imports `makeNode`, `GraphLayer`; add `buildLayeredTree` to the `./token-tree.js` import):

```typescript
describe("buildLayeredTree", () => {
  it("returns Components / Semantic / Primitives sections in fixed order", () => {
    const sections = buildLayeredTree([
      makeNode({ id: "button-bg", path: ["button", "bg"], layer: "component" }),
      makeNode({ id: "button-text", path: ["button", "text"], layer: "component" }),
      makeNode({ id: "color-text-primary", path: ["color", "text", "primary"], layer: "semantic" }),
      makeNode({ id: "color-blue-500", path: ["color", "blue", "500"], layer: "primitive" }),
    ]);
    expect(sections.map((s) => s.layer)).toEqual(["component", "semantic", "primitive"]);
    expect(sections.map((s) => s.label)).toEqual(["Components", "Semantic", "Primitives"]);
    expect(sections.map((s) => s.count)).toEqual([2, 1, 1]);
    // each section's tree equals buildTokenTree of that layer's nodes
    expect(sections[0]!.tree).toEqual(
      buildTokenTree([
        makeNode({ id: "button-bg", path: ["button", "bg"], layer: "component" }),
        makeNode({ id: "button-text", path: ["button", "text"], layer: "component" }),
      ]),
    );
  });

  it("omits sections with no nodes", () => {
    const sections = buildLayeredTree([
      makeNode({ id: "button-bg", path: ["button", "bg"], layer: "component" }),
      makeNode({ id: "color-blue-500", path: ["color", "blue", "500"], layer: "primitive" }),
    ]);
    expect(sections.map((s) => s.layer)).toEqual(["component", "primitive"]);
  });

  it("returns a single section when all nodes share a layer", () => {
    const sections = buildLayeredTree([
      makeNode({ id: "color-blue-500", path: ["color", "blue", "500"], layer: "primitive" }),
      makeNode({ id: "color-red-500", path: ["color", "red", "500"], layer: "primitive" }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ layer: "primitive", label: "Primitives", count: 2 });
  });

  it("returns no sections for an empty input", () => {
    expect(buildLayeredTree([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/token-tree.test.ts`
Expected: FAIL — `buildLayeredTree` is not exported yet (import error / undefined).

- [ ] **Step 3: Implement `buildLayeredTree`**

In `src/app/token-tree.ts`:

(a) Extend the type import:
```typescript
import type { TokenNode, GraphLayer } from "@core/token-graph.js";
```

(b) Add the section type near the other exported interfaces (e.g. after `TreeNode`):
```typescript
export interface LayerSection {
  /** The graph layer this section represents. */
  layer: GraphLayer;
  /** Display label, e.g. "Components". */
  label: string;
  /** Path-tree for this layer's nodes (via buildTokenTree). */
  tree: TreeNode[];
  /** Leaf count in this section. */
  count: number;
}
```

(c) Add the function (e.g. just after `buildTokenTree`):
```typescript
const LAYER_ORDER: ReadonlyArray<{ layer: GraphLayer; label: string }> = [
  { layer: "component", label: "Components" },
  { layer: "semantic", label: "Semantic" },
  { layer: "primitive", label: "Primitives" },
];

/**
 * Partition nodes by graph layer and build a path-tree per layer.
 * Sections come in fixed order [component, semantic, primitive];
 * a layer with no nodes is omitted.
 */
export function buildLayeredTree(nodes: readonly TokenNode[]): LayerSection[] {
  const sections: LayerSection[] = [];
  for (const { layer, label } of LAYER_ORDER) {
    const partition = nodes.filter((n) => n.layer === layer);
    if (partition.length === 0) continue;
    sections.push({ layer, label, tree: buildTokenTree(partition), count: partition.length });
  }
  return sections;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/token-tree.test.ts`
Expected: PASS (new tests + existing buildTokenTree/leafIds/ancestorPaths tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/token-tree.ts src/app/token-tree.test.ts
git commit -m "feat(sidebar): buildLayeredTree partitions tokens by graph layer"
```

---

## Task 2: Render sections in App.vue + drop the Component chip

**Files:** `src/app/App.vue`, `src/app/components/FilterChips.vue`, `CHANGELOG.md`

- [ ] **Step 1: Drop the `Component` chip in `FilterChips.vue`**

In `src/app/components/FilterChips.vue`, remove this entry from the `CHIPS` array:
```typescript
  { value: "skip", label: "Component", count: (s) => s.skipped },
```
Leave the other four (`all`, `tailwind-default`, `theme-static`, `theme-mode-variant`). No other change — the `ClassificationFilter` type and `summary` are untouched.

- [ ] **Step 2: Add the `sections` computed + collapse state in `App.vue` script**

Extend the token-tree import:
```typescript
import { buildTokenTree, buildLayeredTree, leafIds, ancestorPaths } from "./token-tree.js";
```
Add a `GraphLayer` type import (from `@core/token-graph.js`; add it to an existing type import from that module if present, else a new `import type { GraphLayer } from "@core/token-graph.js";`).

Just after the existing `const tokenTree = computed(() => buildTokenTree(visibleNodes.value));`, add:
```typescript
// Layer sections for rendering. `tokenTree` (flat) stays for the path/leaf
// helpers (treeLeafCount, ancestorPaths, search-expand) — same path keys/leaf ids.
const sections = computed(() => buildLayeredTree(visibleNodes.value));

// Collapsed sections. Components open by default; semantic/primitive collapsed.
const collapsedSections = ref<ReadonlySet<GraphLayer>>(new Set(["semantic", "primitive"]));
function toggleSection(layer: GraphLayer): void {
  const next = new Set(collapsedSections.value);
  if (next.has(layer)) next.delete(layer);
  else next.add(layer);
  collapsedSections.value = next;
}
```
(`ref` is already imported in App.vue — confirm; if not, add it to the `vue` import.)

- [ ] **Step 3: Replace the single `<ComponentTree>` with section rendering**

In the sidebar's scroll container (`<div class="flex-1 overflow-y-auto py-1">`), replace the single `<ComponentTree :nodes="tokenTree" …/>` with:

```vue
              <template v-for="section in sections" :key="section.layer">
                <button
                  type="button"
                  class="w-full flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 hover:bg-elevated transition-colors select-none"
                  @click="toggleSection(section.layer)"
                >
                  <span class="font-semibold">
                    {{ collapsedSections.has(section.layer) ? '▸' : '▾' }} {{ section.label }}
                  </span>
                  <span class="font-mono tabular-nums text-zinc-400">{{ section.count }}</span>
                </button>
                <ComponentTree
                  v-if="!collapsedSections.has(section.layer)"
                  :nodes="section.tree"
                  :selected-id="state.selection.value"
                  :highlighted-ids="state.highlightedIds.value"
                  :expanded-paths="effectiveExpandedPaths"
                  :kind-of="kindOf"
                  :preview-components="COMPONENTS_WITH_PREVIEW"
                  @select="(id: string) => (state.selection.value = id)"
                  @toggle="toggleExpanded"
                  @select-component="(name: string) => {
                    selectedComponent = name;
                    state.selection.value = null;
                  }"
                />
              </template>
```

(The `ComponentTree` props are identical to before except `:nodes="section.tree"`. The `tokenTree`-based helpers above — `treeLeafCount`, `expandAll`, `collapseAll`, `effectiveExpandedPaths`, `ancestorPaths` — are unchanged.)

- [ ] **Step 4: Typecheck + build + full suite**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: typecheck clean; all tests pass; build succeeds. (App.vue has no mount test; build validates the template. Ignore IDE `@core` staleness — only `npm run typecheck` exit code is authoritative.)

- [ ] **Step 5: CHANGELOG**

In `CHANGELOG.md` under `## [Unreleased]` → `### Added`, add:
```markdown
- **Sidebar grouped into layer sections.** The left token tree is now split into
  collapsible `Components` / `Semantic` / `Primitives` sections (Components expanded by
  default), so component tokens are no longer mixed in with raw primitives. The redundant
  `Component` filter chip was removed; `All` / `Tailwind` / `Theme` / `Dark-var` remain.
```

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue src/app/components/FilterChips.vue CHANGELOG.md
git commit -m "feat(sidebar): render layer sections, drop redundant Component chip"
```

A pre-commit hook runs typecheck + the full suite; if it blocks, fix legitimately.

After committing, report. The orchestrator performs the headless visual QA (three sections, Components open, chip gone, in-section trees + Live pill unchanged). Do not push.

---

## Self-Review

**Spec coverage:**
- "buildLayeredTree partition by layer, fixed order, omit empty, reuse buildTokenTree" → Task 1. ✓
- "sections computed + collapse state (Components open, others collapsed)" → Task 2 Step 2. ✓
- "section headers + ComponentTree per section, props unchanged" → Task 2 Step 3. ✓
- "keep flat tokenTree for helpers" → Task 2 Step 2 comment (helpers untouched). ✓
- "remove Component chip, keep the rest" → Task 2 Step 1. ✓
- "buildTokenTree / ComponentTree.vue unchanged" → neither is modified. ✓
- "unit tests for buildLayeredTree; build+typecheck for wiring" → Task 1 tests + Task 2 Step 4. ✓
- "headless verification" → orchestrator after Task 2. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. The "add ref/GraphLayer import if absent" notes are concrete conditional guards, not placeholders.

**Type consistency:** `LayerSection` fields (`layer: GraphLayer`, `label`, `tree: TreeNode[]`, `count: number`) are used consistently in Task 1 (definition + tests) and Task 2 (`section.layer/label/tree/count`). `collapsedSections: ReadonlySet<GraphLayer>` with immutable replace in `toggleSection`. `buildLayeredTree(nodes)` signature matches the call site `buildLayeredTree(visibleNodes.value)`.
