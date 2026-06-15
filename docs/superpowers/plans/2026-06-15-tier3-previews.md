# Tier-3 Component Previews (chip / sidebar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live previews for `chip` and `sidebar` (custom recipes), via a new `useCustomPreviewRecipe` composable that builds with `buildCustomRecipes`. Last preview tier — after this every component has a preview.

**Tech Stack:** Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom). `@core/*`→`./src/*`. Pre-commit runs `vue-tsc` + full vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-tier3-previews-design.md`

**Shared facts:**
- Custom recipe: `buildCustomRecipes(graph, customParts, {})[name]` → `ComponentRecipe`. `customParts = customPartsByComponent(scanReport)` already exists in `App.vue:113` (`customParts`).
- Previews take props `{ graph, componentName, customParts, highlightUtility?, completeness? }` and use `useCustomPreviewRecipe(() => props.graph, () => props.componentName, () => props.customParts)`.
- `extractArbitrary(c) → {classes, style}`; `projectToState(c, "default")` strips state prefixes to resting.
- Fixtures use literal hex colors (jsdom retains literal inline styles). Wiring: each name + both-chain branches together (LiveButton catch-all); custom branches carry the extra `:custom-parts="customParts"`.

---

### Task 1: `useCustomPreviewRecipe` composable (+ extract `representativeSizeClasses`)

**Files:** Modify `src/app/composables/use-preview-recipe.ts`, `use-preview-recipe.test.ts`

- [ ] **Step 1: Write the failing test** — append to `use-preview-recipe.test.ts`:

```ts
import { buildCustomRecipes } from "@core/custom-recipe-engine.js"; // (only if needed) — else rely on the composable
import { useCustomPreviewRecipe } from "./use-preview-recipe.js";

describe("useCustomPreviewRecipe", () => {
  it("returns null when graph is null", () => {
    const { recipe } = useCustomPreviewRecipe(() => null, () => "sidebar", () => new Map());
    expect(recipe.value).toBeNull();
  });
  it("builds a custom recipe from buildCustomRecipes + parts", () => {
    const g = graphWith({ sidebar: { bg: { $value: "#F4F4F5", $type: "color" }, "item-text": { $value: "#52525B", $type: "color" } } });
    const parts = new Map<string, readonly string[]>([["sidebar", ["item"]]]);
    const { recipe } = useCustomPreviewRecipe(() => g, () => "sidebar", () => parts);
    expect(recipe.value?.slots["base"]).toContain("bg-[#F4F4F5]");
    expect(recipe.value?.slots["item"]).toContain("#52525B");
  });
});
```

(`graphWith` already defined in this test file.)

- [ ] **Step 2: Run — expect FAIL** (`useCustomPreviewRecipe` not exported): `npx vitest run src/app/composables/use-preview-recipe.test.ts`

- [ ] **Step 3: Implement** in `use-preview-recipe.ts`:
  - Add import: `import { buildComponentRecipes, buildCustomRecipes? }` — actually `buildCustomRecipes` lives in `@core/custom-recipe-engine.js`; add `import { buildCustomRecipes } from "@core/custom-recipe-engine.js";`.
  - Extract the size logic into an exported pure helper:

```ts
export function representativeSizeClasses(recipe: ComponentRecipe | null): string {
  const sizes = recipe?.variants.size ?? {};
  const keys = Object.keys(sizes);
  if (keys.length === 0) return "";
  const key = keys.includes("md") ? "md" : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
  return sizes[key]?.["base"] ?? "";
}
```

  - Change `usePreviewRecipe`'s `sizeClasses` computed to `computed<string>(() => representativeSizeClasses(recipe.value))`.
  - Add:

```ts
export function useCustomPreviewRecipe(
  graphFn: () => TokenGraph | null,
  componentNameFn: () => string,
  partsFn: () => ReadonlyMap<string, ReadonlyArray<string>>,
): { recipe: ComputedRef<ComponentRecipe | null>; sizeClasses: ComputedRef<string> } {
  const recipe = computed<ComponentRecipe | null>(() => {
    const g = graphFn();
    if (!g) return null;
    const name = componentNameFn();
    return buildCustomRecipes(g, partsFn(), {})[name] ?? null;
  });
  const sizeClasses = computed<string>(() => representativeSizeClasses(recipe.value));
  return { recipe, sizeClasses };
}
```

- [ ] **Step 4: Run — expect PASS** (incl. the existing usePreviewRecipe tests): `npx vitest run src/app/composables/use-preview-recipe.test.ts`
- [ ] **Step 5: Commit**: `git add src/app/composables/use-preview-recipe.* && git commit -m "feat(app): useCustomPreviewRecipe composable (buildCustomRecipes)"`

---

### Task 2: LiveSidebar

**Files:** Create `src/app/components/LiveSidebar.vue`, `LiveSidebar.test.ts`; modify `src/app/App.vue`

- [ ] **Step 1: Write the failing test** — `LiveSidebar.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveSidebar from "./LiveSidebar.vue";

function sidebarGraph() {
  const global = { sidebar: {
    bg: { $value: "#F4F4F5", $type: "color" },
    border: { $value: "#E4E4E7", $type: "color" },
    "item-text": { $value: "#52525B", $type: "color" },
    "item-bg-hover": { $value: "#E4E4E7", $type: "color" },
    "item-padding": { $value: 6, $type: "number" },
  } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const parts = new Map<string, readonly string[]>([["sidebar", ["item"]]]);
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveSidebar", () => {
  it("shows a fallback message when the graph has no sidebar tokens", () => {
    const wrapper = mount(LiveSidebar, { props: { graph: null, customParts: parts }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="sidebar-root"]')).toHaveLength(0);
  });
  it("renders a panel with item rows styled from tokens", () => {
    const wrapper = mount(LiveSidebar, { props: { graph: sidebarGraph(), customParts: parts }, ...mountOpts });
    const root = wrapper.find('[data-testid="sidebar-root"]');
    expect(root.exists()).toBe(true);
    expect((root.element as HTMLElement).style.backgroundColor).not.toBe("");
    expect(wrapper.findAll('[data-testid="sidebar-item"]')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run src/app/components/LiveSidebar.test.ts`

- [ ] **Step 3: Implement** `LiveSidebar.vue`:

```vue
<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCustomPreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "sidebar",
  customParts: () => new Map(),
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = useCustomPreviewRecipe(() => props.graph, () => props.componentName, () => props.customParts);
const base = computed(() => extractArbitrary(recipe.value?.slots["base"] ?? ""));
interface Row { label: string; classes: string; style: CSSProperties; }
const items = computed<Row[]>(() => {
  const item = recipe.value?.slots["item"] ?? "";
  if (!item) return [];
  return (["default", "hover", "active"] as const).map((s) => {
    const { classes, style } = extractArbitrary(projectToState(item, s));
    return { label: s === "default" ? "Dashboard" : s === "hover" ? "Projects" : "Settings", classes, style };
  });
});
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div data-testid="sidebar-root" class="space-y-0.5" :class="base.classes" :style="base.style">
        <div v-for="row in items" :key="row.label" data-testid="sidebar-item" :class="row.classes" :style="row.style">{{ row.label }}</div>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/app/components/LiveSidebar.test.ts`
- [ ] **Step 5: Wire `App.vue`** — import `LiveSidebar`; `COMPONENTS_WITH_PREVIEW` += `"sidebar"`; branch in both chains before `LiveButton`, carrying `:custom-parts="customParts"`:

Chain 1:
```html
              <LiveSidebar
                v-else-if="previewSupported && selectedComponent === 'sidebar' && selectedNode.id.split('-')[0] === selectedComponent"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :custom-parts="customParts"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
```
Chain 2:
```html
              <LiveSidebar
                v-else-if="previewSupported && selectedComponent === 'sidebar'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :custom-parts="customParts"
                :completeness="scanReport.completeness"
              />
```

- [ ] **Step 6: Run** `npm test` — expect PASS.
- [ ] **Step 7: Commit**: `git add src/app/components/LiveSidebar.* src/app/App.vue && git commit -m "feat(app): LiveSidebar preview (custom recipe — panel + item rows)"`

---

### Task 3: LiveChip

**Files:** Create `src/app/components/LiveChip.vue`, `LiveChip.test.ts`; modify `src/app/App.vue`

- [ ] **Step 1: Write the failing test** — `LiveChip.test.ts`: fixture `{ chip: { bg:{#E4E4E7,color}, radius:{999,number}, "label-text":{#18181B,color}, "bg-error":{#FECACA,color}, "bg-success":{#BBF7D0,color} } }`, `parts = new Map([["chip", ["label", "close"]]])`. Assert: fallback on `graph:null` (0 `chip`); with graph → exactly `3` `[data-testid="chip"]` pills (default + error + success), the first pill's `style.backgroundColor !== ""`.

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run src/app/components/LiveChip.test.ts`

- [ ] **Step 3: Implement** `LiveChip.vue`:

```vue
<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCustomPreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "chip",
  customParts: () => new Map(),
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = useCustomPreviewRecipe(() => props.graph, () => props.componentName, () => props.customParts);

interface Render { classes: string; style: CSSProperties; }
interface Pill { label: string; base: Render; lbl: Render; close: Render; }
const pills = computed<Pill[]>(() => {
  const r = recipe.value;
  if (!r) return [];
  const baseSlot = r.slots["base"] ?? "";
  const labelSlot = r.slots["label"] ?? "";
  const closeR = extractArbitrary(projectToState(r.slots["close"] ?? "", "default"));
  const colorVariants = (r.variants?.color ?? {}) as Record<string, { base?: string; label?: string }>;
  const rows = [{ key: "default", baseExtra: "", lblExtra: "" }, ...Object.keys(colorVariants).map((k) => ({ key: k, baseExtra: colorVariants[k]?.base ?? "", lblExtra: colorVariants[k]?.label ?? "" }))];
  return rows.map((row) => ({
    label: row.key === "default" ? "Chip" : row.key,
    base: extractArbitrary(projectToState([baseSlot, row.baseExtra].filter((s) => s.length > 0).join(" "), "default")),
    lbl: extractArbitrary(projectToState([labelSlot, row.lblExtra].filter((s) => s.length > 0).join(" "), "default")),
    close: closeR,
  }));
});
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <span v-for="pill in pills" :key="pill.label" data-testid="chip" class="inline-flex items-center gap-1" :class="pill.base.classes" :style="pill.base.style">
          <span :class="pill.lbl.classes" :style="pill.lbl.style">{{ pill.label }}</span>
          <span class="opacity-60" :class="pill.close.classes" :style="pill.close.style">×</span>
        </span>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/app/components/LiveChip.test.ts`
- [ ] **Step 5: Wire `App.vue`** — import `LiveChip`; `COMPONENTS_WITH_PREVIEW` += `"chip"`; branch in both chains before `LiveButton`, with `:custom-parts="customParts"` (mirror Task 2's chain-1/chain-2 shapes, `selectedComponent === 'chip'`).
- [ ] **Step 6: Run** `npm test` + `npm run typecheck` — expect PASS.
- [ ] **Step 7: Commit**: `git add src/app/components/LiveChip.* src/app/App.vue && git commit -m "feat(app): LiveChip preview (custom recipe — default/error/success pills)"`

---

### Task 4: Verify + release

- [ ] `npm test` (full) + `npm run typecheck` — green.
- [ ] (optional) `npm run dev`, load the live export, click chip + sidebar, confirm renders.
- [ ] **Release v0.28.0** — bump `package.json`; `CHANGELOG.md` (Tier-3 chip/sidebar custom-recipe previews + `useCustomPreviewRecipe`; **every component now has a live preview**; only data-blocked items remain); README roadmap row + "Next" + the "Inspector UI" prose ("every standard component" → "every component") + "Current release" bump; commit `chore(release): v0.28.0 — chip/sidebar custom-recipe previews`, tag `v0.28.0`; merge `--ff-only` to `main`, push (`gh auth switch --user clawdbot3535` if 403, back to `d56de`), publish GitHub Release, delete branch.

---

## Self-Review

- **Spec coverage:** composable → T1; sidebar → T2; chip → T3; release → T4.
- **Placeholder scan:** T1/T2/T3 have full code; T3's wiring references T2's chain shapes (identical except the name) — unambiguous.
- **Type consistency:** `useCustomPreviewRecipe(graphFn, nameFn, partsFn) → {recipe, sizeClasses}`; `representativeSizeClasses(recipe)` shared by both composables; previews add the `customParts` prop and pass `:custom-parts="customParts"` (App.vue's existing computed). `recipe.variants.color` cast to `Record<string,{base?,label?}>` in LiveChip.
