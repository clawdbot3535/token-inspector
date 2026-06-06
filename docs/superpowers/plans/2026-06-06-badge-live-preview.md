# badge live preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `badge` live preview — a new `LiveBadge.vue` rendering a size-rows × colour-badges matrix of `<span>` elements (static, no states), wired into `App.vue`.

**Architecture:** badge's recipe is `color × size` (no variant, no state); a `<span>` status indicator with real CSS borders. The existing `extractArbitrary` pipeline (incl. the border preflight compensation) covers every class family — no new entries. Task 1 builds `LiveBadge.vue` (TDD). Task 2 wires it into `App.vue` as a third preview branch.

**Tech Stack:** Vue 3 SFCs, Vitest + `@vue/test-utils` + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/badge-live-preview` (spec committed at `eb275e9`).

**Spec:** `docs/superpowers/specs/2026-06-06-badge-live-preview-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- The project `typecheck` does NOT cover `.test.ts` files — get props/arities right by hand.
- JIT pitfall: the preview MUST resolve recipe classes to inline styles via `extractArbitrary`; never rely on Tailwind JIT. NO new `extract-arbitrary` entries are needed (badge families are all covered, incl. `border-[var]` → inline `borderColor` + compensated `1px solid`).
- `recipe.variants.color` and `recipe.variants.size` are typed (`recipe-engine.ts:133-134`) as `Record<string, Partial<Record<RecipeSlot, string>>>`; `?.[key]?.["base"]` yields `string | undefined`.
- Model the file on `src/app/components/LiveButton.vue` / `LiveInput.vue` (same imports, fallback message, copy button, highlight code block).

---

### Task 1: `LiveBadge.vue` + tests

**Files:**
- Create: `src/app/components/LiveBadge.vue`
- Test: `src/app/components/LiveBadge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/LiveBadge.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveBadge from "./LiveBadge.vue";

// Minimal badge graph: two colour roles (default, error) each with bg/border/text,
// across two sizes (sm, md). Mirrors the real colour×size badge recipe shape.
function badgeGraph() {
  const global = {
    badge: {
      radius: { $value: 2, $type: "number" },
      "default-bg": { $value: "#F4F4F5", $type: "color" },
      "default-border": { $value: "#D4D4D8", $type: "color" },
      "default-text": { $value: "#52525B", $type: "color" },
      "error-bg": { $value: "#FEE2E2", $type: "color" },
      "error-border": { $value: "#EF4444", $type: "color" },
      "error-text": { $value: "#991B1B", $type: "color" },
      "padding-x-sm": { $value: 4, $type: "number" },
      "padding-x-md": { $value: 6, $type: "number" },
      "font-size-sm": { $value: 8, $type: "number" },
      "font-size-md": { $value: 10, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveBadge", () => {
  it("shows a fallback message and no badge cells when the graph has no badge tokens", () => {
    const wrapper = mount(LiveBadge, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="badge-cell"]')).toHaveLength(0);
  });

  it("renders a colour×size matrix of <span> badges (one per colour per size)", () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    const cells = wrapper.findAll('[data-testid="badge-cell"]');
    // 2 colours (default, error) × 2 sizes (sm, md)
    expect(cells.length).toBe(4);
    expect(cells.every((c) => c.element.tagName === "SPAN")).toBe(true);
    // One size-label per size row.
    expect(wrapper.findAll('[data-testid="badge-size-label"]').length).toBe(2);
  });

  it("resolves the real CSS border to inline styles (JIT-class regression guard)", () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    const cells = wrapper.findAll('[data-testid="badge-cell"]');
    // badge uses a real border (not a ring); extractArbitrary sets borderColor and
    // the preflight compensation adds a visible 1px solid border.
    expect(
      cells.some(
        (c) => c.element.style.borderStyle === "solid" && c.element.style.borderColor !== "",
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/LiveBadge.test.ts`
Expected: FAIL — `LiveBadge.vue` does not exist yet.

- [ ] **Step 3: Create `LiveBadge.vue`**

Create `src/app/components/LiveBadge.vue`:

```vue
<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCopyToClipboard } from "../composables/use-copy-to-clipboard.js";
import { extractArbitrary } from "../extract-arbitrary.js";

interface Props {
  graph: TokenGraph | null;
  /** Component name to preview (matches a key in the token graph). */
  componentName?: string;
  /** Tailwind utility to highlight inside the representative code block. */
  highlightUtility?: string;
  /** Completeness scores from the scan report; renders an n/m badge per size row. */
  completeness?: ReadonlyArray<CompletenessScore>;
}

const props = withDefaults(defineProps<Props>(), {
  componentName: "badge",
  highlightUtility: undefined,
  completeness: undefined,
});

// Smallest → largest, for ordering the size rows. Typed as string[] so a recipe
// size key that isn't in this list sorts to the front (indexOf -1) without `any`.
const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];

const badgeRecipe = computed(() => {
  if (!props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, { components: [props.componentName] });
  return recipes[props.componentName] ?? null;
});

const baseClasses = computed<string>(() => badgeRecipe.value?.slots["base"] ?? "");

// Size rows (ordered) and colour columns, derived from the recipe. A single
// "default" pseudo-key stands in when an axis is absent so a thin badge graph
// still renders one row / one cell.
const sizes = computed<string[]>(() => {
  const keys = Object.keys(badgeRecipe.value?.variants.size ?? {});
  if (keys.length === 0) return ["default"];
  return [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
});
const colors = computed<string[]>(() => {
  const keys = Object.keys(badgeRecipe.value?.variants.color ?? {});
  if (keys.length === 0) return ["default"];
  return [...keys].sort();
});

interface BadgeCell {
  color: string;
  classes: string;
  style: CSSProperties;
}
interface SizeRow {
  size: string;
  cells: BadgeCell[];
  completeness?: CompletenessScore;
}
interface HighlightSegment {
  token: string;
  highlight: boolean;
}

function mergedFor(color: string, size: string): string {
  const recipe = badgeRecipe.value;
  const colorClasses = recipe?.variants.color?.[color]?.["base"] ?? "";
  const sizeClasses = recipe?.variants.size?.[size]?.["base"] ?? "";
  return [baseClasses.value, colorClasses, sizeClasses]
    .filter((s) => s.length > 0)
    .join(" ")
    .trim();
}

function cellCompleteness(sizeKey: string): CompletenessScore | undefined {
  return props.completeness?.find(
    (c) => c.component === props.componentName && c.variantKey === sizeKey,
  );
}

function highlightSegments(classString: string): HighlightSegment[] {
  const target = props.highlightUtility;
  return classString
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((token) => ({ token, highlight: target !== undefined && token === target }));
}

const rows = computed<SizeRow[]>(() => {
  if (!badgeRecipe.value) return [];
  return sizes.value.map((size) => ({
    size,
    cells: colors.value.map((color) => {
      const { classes, style } = extractArbitrary(mergedFor(color, size));
      return { color, classes, style };
    }),
    completeness: cellCompleteness(size),
  }));
});

// Representative class string for the code block: first colour × md (else first size).
const inspectClasses = computed<string>(() => {
  const size = sizes.value.includes("md") ? "md" : (sizes.value[0] ?? "default");
  const color = colors.value[0] ?? "default";
  return mergedFor(color, size);
});
const segments = computed<HighlightSegment[]>(() => highlightSegments(inspectClasses.value));

const { copy, wasJustCopied } = useCopyToClipboard();
</script>

<template>
  <div class="space-y-4">
    <p v-if="!badgeRecipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in
      the loaded graph.
    </p>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="text-[10px] uppercase tracking-wider text-zinc-400">
          colour × size
        </span>
        <button
          type="button"
          class="ml-auto text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{ 'text-success border-success/60': wasJustCopied('livebadge') }"
          @click="copy(inspectClasses, 'livebadge')"
          title="Copy representative classes"
        >
          {{ wasJustCopied("livebadge") ? "Copied!" : "Copy" }}
        </button>
      </div>

      <div class="grid grid-cols-[56px_1fr] gap-y-4 gap-x-4 items-start">
        <template v-for="row in rows" :key="`size-${row.size}`">
          <div
            data-testid="badge-size-label"
            class="text-[10px] uppercase tracking-wider text-zinc-400 pt-1.5 flex flex-col gap-0.5"
          >
            <span>{{ row.size }}</span>
            <span
              v-if="row.completeness"
              class="font-mono"
              :class="
                row.completeness.defined === row.completeness.total
                  ? 'text-emerald-500'
                  : 'text-amber-500'
              "
            >
              {{ row.completeness.defined }}/{{ row.completeness.total }}
            </span>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <span
              v-for="cell in row.cells"
              :key="`badge-${row.size}-${cell.color}`"
              data-testid="badge-cell"
              class="inline-flex items-center"
              :class="cell.classes"
              :style="cell.style"
              :title="`${cell.color} · ${row.size}`"
            >{{ cell.color }}</span>
          </div>
        </template>
      </div>

      <code
        class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all"
      >
        <template
          v-for="(seg, segIdx) in segments"
          :key="segIdx"
        ><span
            v-if="seg.highlight"
            class="bg-primary/20 ring-1 ring-primary/40 rounded px-0.5"
          >{{ seg.token }}</span><span v-else>{{ seg.token }}</span><span
            v-if="segIdx < segments.length - 1"
          >&nbsp;</span></template>
      </code>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/LiveBadge.test.ts`
Expected: PASS — 4 badge cells (2 colours × 2 sizes) as `<span>`, 2 size labels, at least one inline `borderColor` + `solid`.

**If the matrix is empty (0 cells):** the synthetic fixture's token ids did not map to `variants.color`/`variants.size`. Debug by logging `buildComponentRecipes(badgeGraph(), { components: ["badge"] }).badge` and adjust the fixture token ids so the slot-mapping grammar routes them to colour roles (`default`/`error`) and size keys (`sm`/`md`) — colour roles and size suffixes are recognised by the grammar (the real export produces exactly this shape). Report what you changed.

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/LiveBadge.vue src/app/components/LiveBadge.test.ts
git commit -m "feat(preview): LiveBadge — colour×size span matrix for the badge component"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

### Task 2: Wire the badge preview into `App.vue`

**Files:**
- Modify: `src/app/App.vue` (import `LiveBadge`; `COMPONENTS_WITH_PREVIEW` ~line 129; add a `LiveBadge` branch at both mount sites ~lines 659 and 721; update the "not yet available" copy ~line 748)

- [ ] **Step 1: Import `LiveBadge` + register it**

In `src/app/App.vue`, add the import next to the other Live imports (~lines 17–18):
```typescript
import LiveBadge from "./components/LiveBadge.vue";
```
Change the preview set (~line 129) from:
```typescript
const COMPONENTS_WITH_PREVIEW: ReadonlySet<string> = new Set(["button", "input", "textarea"]);
```
to:
```typescript
const COMPONENTS_WITH_PREVIEW: ReadonlySet<string> = new Set(["button", "input", "textarea", "badge"]);
```

- [ ] **Step 2: Add the `LiveBadge` branch in the token-selected block**

Find the first `<LiveInput>` … `<LiveButton>` pair (~lines 659–680). Between the closing `/>` of `<LiveInput>` and the `<LiveButton`, insert a `LiveBadge` branch (it mirrors `LiveButton`'s props minus the icon, and keeps the same node-prefix guard):

```vue
              <LiveBadge
                v-else-if="
                  previewSupported &&
                  selectedComponent === 'badge' &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
```

Then change the following `<LiveButton`'s `v-else-if` so the chain is exclusive — it currently reads:
```
                v-else-if="
                  previewSupported &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
```
Leave it as-is: because `LiveBadge` is now an earlier `v-else-if`, the `LiveButton` branch only fires when the component is neither a field nor badge (i.e. button). No change needed to `LiveButton` here.

- [ ] **Step 3: Add the `LiveBadge` branch in the component-selected block**

Find the second `<LiveInput>` … `<LiveButton>` pair (~lines 721–735). Insert between them:
```vue
              <LiveBadge
                v-else-if="previewSupported && selectedComponent === 'badge'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :completeness="scanReport.completeness"
              />
```
The following `<LiveButton v-else-if="previewSupported" …>` is unchanged — it now only fires for `button`.

- [ ] **Step 4: Update the stale "not yet available" copy**

Find (~line 748) the message listing the preview-capable components and add `badge`:
```
                  Only <code class="font-mono">button</code>,
                  <code class="font-mono">input</code> and
                  <code class="font-mono">textarea</code> have a rendered
```
becomes:
```
                  Only <code class="font-mono">button</code>,
                  <code class="font-mono">input</code>,
                  <code class="font-mono">textarea</code> and
                  <code class="font-mono">badge</code> have a rendered
```

- [ ] **Step 5: Typecheck + full suite + build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: PASS (no unit test for App.vue wiring; build confirms the template compiles and the `LiveBadge` import resolves).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(preview): wire badge into the live-preview gates + Live pill"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after both tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Headless QA (the app ingests the committed `components/*.tokens.json`): start `npm run dev`, load the app, select the `badge` component; confirm:
  - a colour×size matrix of `<span>` badges renders with visible coloured backgrounds and borders,
  - one row per size (sm, md), colour roles side by side,
  - the sidebar shows the `Live` pill on `badge`,
  - console is clean.
  Screenshot for the record. Stop the dev server after.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** new `LiveBadge.vue` with derived colour/size axes, size-rows × colour-cells, `<span>` content = role, completeness per size, copy + representative highlight block (Task 1); `COMPONENTS_WITH_PREVIEW` + three-way branch + copy update (Task 2); span-matrix / border / size-row / fallback tests (Task 1, step 1). All spec items mapped.
- **No new extract-arbitrary:** confirmed the families are covered; `LiveBadge` only consumes `extractArbitrary`.
- **Type consistency:** `recipe.variants.color`/`.size` are `Record<string, Partial<Record<RecipeSlot, string>>>`; `SIZE_ORDER: readonly string[]` avoids `as any`; `BadgeCell`/`SizeRow`/`HighlightSegment` are explicit.
- **Immutability:** cells use `extractArbitrary`'s style object directly (read-only, never mutated); no per-cell augmentation needed (no disabled/state cue for a static badge).
- **No placeholders:** every step has full code, exact command, expected result.
