# Tier-1 Component Previews + Preview Composable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live previews for `card`, `kbd`, `progress`, built on a shared `usePreviewRecipe` composable that also de-duplicates the checkbox/radio/switch previews.

**Architecture:** A composable (`src/app/composables/use-preview-recipe.ts`) builds a component recipe + computes representative `sizeClasses`. The form-control trio refactors onto it (behavior-preserving). Three new `Live*.vue` previews render their recipe via the existing `extractArbitrary`→inline-style path. `App.vue` gains imports, `COMPONENTS_WITH_PREVIEW` entries, and a `v-else-if` branch per preview in both template chains.

**Tech Stack:** Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom), `@core/*`→`./src/*`. Pre-commit runs `vue-tsc` + full vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-tier1-previews-design.md`

**CRITICAL wiring gotcha:** `LiveButton` is the final `v-else-if` and is the **catch-all** — its gate is only `previewSupported && selectedNode.id.split('-')[0] === selectedComponent` (no `selectedComponent === 'button'`). So a name added to `COMPONENTS_WITH_PREVIEW` without its own earlier branch renders button-shaped. Always add the name AND the branch (in both chains, before the `LiveButton` entry) together.

---

### Task 1: `usePreviewRecipe` composable

**Files:**
- Create: `src/app/composables/use-preview-recipe.ts`
- Test: `src/app/composables/use-preview-recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/composables/use-preview-recipe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { usePreviewRecipe } from "./use-preview-recipe.js";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile, TokenGraph } from "@core/token-graph.js";

function graphWith(global: Record<string, unknown>): TokenGraph {
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

describe("usePreviewRecipe", () => {
  it("returns null recipe when graph is null", () => {
    const { recipe } = usePreviewRecipe(() => null, () => "progress");
    expect(recipe.value).toBeNull();
  });

  it("picks the md size base classes when present", () => {
    const g = graphWith({ progress: { "height-md": { $value: 8, $type: "number" }, "fill-bg": { $value: "#5667A7", $type: "color" } } });
    const { sizeClasses } = usePreviewRecipe(() => g, () => "progress");
    expect(sizeClasses.value).toContain("h-[8px]");
  });

  it("returns empty sizeClasses when the component has no size variants", () => {
    const g = graphWith({ card: { bg: { $value: "#FFFFFF", $type: "color" } } });
    const { sizeClasses } = usePreviewRecipe(() => g, () => "card");
    expect(sizeClasses.value).toBe("");
  });

  it("reacts to a changing graph getter", () => {
    const gref = ref<TokenGraph | null>(null);
    const { recipe } = usePreviewRecipe(() => gref.value, () => "kbd");
    expect(recipe.value).toBeNull();
    gref.value = graphWith({ kbd: { bg: { $value: "#F4F4F5", $type: "color" } } });
    expect(recipe.value).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './use-preview-recipe.js'`):
`npx vitest run src/app/composables/use-preview-recipe.test.ts`

- [ ] **Step 3: Implement** — create `src/app/composables/use-preview-recipe.ts`:

```ts
import { computed, type ComputedRef } from "vue";
import { buildComponentRecipes, type ComponentRecipe } from "@core/recipe-engine.js";
import type { TokenGraph } from "@core/token-graph.js";

const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];

/**
 * Build the recipe for a component and expose the representative size base
 * classes (md if present, else the smallest defined). Dedups the recipe-build +
 * SIZE_ORDER/sizeClasses logic previously copy-pasted across the form-control
 * previews. Getters keep it reactive without binding to a specific ref API.
 */
export function usePreviewRecipe(
  graphFn: () => TokenGraph | null,
  componentNameFn: () => string,
): { recipe: ComputedRef<ComponentRecipe | null>; sizeClasses: ComputedRef<string> } {
  const recipe = computed<ComponentRecipe | null>(() => {
    const g = graphFn();
    if (!g) return null;
    const name = componentNameFn();
    return buildComponentRecipes(g, { components: [name] })[name] ?? null;
  });
  const sizeClasses = computed<string>(() => {
    const sizes = recipe.value?.variants.size ?? {};
    const keys = Object.keys(sizes);
    if (keys.length === 0) return "";
    const key = keys.includes("md")
      ? "md"
      : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
    return sizes[key]?.["base"] ?? "";
  });
  return { recipe, sizeClasses };
}
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/app/composables/use-preview-recipe.test.ts`
- [ ] **Step 5: Commit**: `git add src/app/composables/use-preview-recipe.* && git commit -m "feat(app): usePreviewRecipe composable (shared recipe + sizeClasses)"`

---

### Task 2: Refactor checkbox/radio/switch onto the composable

**Files:** Modify `src/app/components/LiveCheckbox.vue`, `LiveRadio.vue`, `LiveSwitch.vue`

- [ ] **Step 1:** In each of the three, add the import:
`import { usePreviewRecipe } from "../composables/use-preview-recipe.js";`

- [ ] **Step 2:** In each, REPLACE the inline `recipe` computed, the `const SIZE_ORDER = …` line, and the `sizeClasses` computed with:

```ts
const { recipe, sizeClasses } = usePreviewRecipe(() => props.graph, () => props.componentName);
```

Leave `baseClasses`, `indicatorClasses`, `cells`, `inspectClasses`, etc. unchanged. Remove the now-unused `buildComponentRecipes` import from each file (the composable owns it).

- [ ] **Step 3: Run — expect PASS (behavior-preserving)**:
`npx vitest run src/app/components/LiveCheckbox.test.ts src/app/components/LiveRadio.test.ts src/app/components/LiveSwitch.test.ts`

- [ ] **Step 4: Commit**: `git add src/app/components/LiveCheckbox.vue src/app/components/LiveRadio.vue src/app/components/LiveSwitch.vue && git commit -m "refactor(app): checkbox/radio/switch previews use usePreviewRecipe"`

---

### Task 3: LiveCard preview + wiring

**Files:** Create `src/app/components/LiveCard.vue`, `LiveCard.test.ts`; modify `src/app/App.vue`

- [ ] **Step 1: Write the failing test** — `src/app/components/LiveCard.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveCard from "./LiveCard.vue";

function cardGraph() {
  const global = { card: { bg: { $value: "#FFFFFF", $type: "color" }, padding: { $value: 24, $type: "number" }, radius: { $value: 8, $type: "number" } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveCard", () => {
  it("shows a fallback message when the graph has no card tokens", () => {
    const wrapper = mount(LiveCard, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="card-root"]')).toHaveLength(0);
  });
  it("renders a card box whose background comes from the token", () => {
    const wrapper = mount(LiveCard, { props: { graph: cardGraph() }, ...mountOpts });
    const box = wrapper.find('[data-testid="card-root"]');
    expect(box.exists()).toBe(true);
    expect((box.element as HTMLElement).style.backgroundColor).not.toBe("");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run src/app/components/LiveCard.test.ts`

- [ ] **Step 3: Implement** — create `src/app/components/LiveCard.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "card",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const rootClasses = computed<string>(() => recipe.value?.slots["root"] ?? "");
const rendered = computed(() => extractArbitrary(rootClasses.value));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div data-testid="card-root" class="max-w-sm" :class="rendered.classes" :style="rendered.style">
        <p class="font-medium">Card title</p>
        <p class="text-sm text-zinc-500">Card body content.</p>
      </div>
      <code class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all">{{ rootClasses }}</code>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/app/components/LiveCard.test.ts`

- [ ] **Step 5: Wire into `App.vue`**:
  - Add the import near the other `Live*` imports (≈ line 22): `import LiveCard from "./components/LiveCard.vue";`
  - Add `"card"` to the `COMPONENTS_WITH_PREVIEW` set (line 163).
  - In **both** template chains, add this branch immediately before the `<LiveButton` catch-all entry:

```html
              <LiveCard
                v-else-if="
                  previewSupported &&
                  selectedComponent === 'card' &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
```

- [ ] **Step 6: Run full suite** (App.test.ts mounts App): `npm test` — expect PASS.
- [ ] **Step 7: Commit**: `git add src/app/components/LiveCard.* src/app/App.vue && git commit -m "feat(app): LiveCard preview (card root slot)"`

---

### Task 4: LiveKbd preview + wiring

**Files:** Create `src/app/components/LiveKbd.vue`, `LiveKbd.test.ts`; modify `src/app/App.vue`

- [ ] **Step 1: Write the failing test** — `src/app/components/LiveKbd.test.ts` (mirror Task 3; fixture `{ kbd: { bg:{$value:"#F4F4F5",$type:"color"}, "padding-x":{$value:2,$type:"number"}, radius:{$value:2,$type:"number"} } }`, testid `kbd-key`, fallback text "No", assert `style.backgroundColor !== ""`).

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run src/app/components/LiveKbd.test.ts`

- [ ] **Step 3: Implement** — `src/app/components/LiveKbd.vue` (same shape as LiveCard, default `componentName: "kbd"`, read `slots["base"]`):

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "kbd",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const baseClasses = computed<string>(() => recipe.value?.slots["base"] ?? "");
const rendered = computed(() => extractArbitrary(baseClasses.value));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <kbd data-testid="kbd-key" class="inline-flex items-center font-mono text-sm" :class="rendered.classes" :style="rendered.style">⌘K</kbd>
      <code class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all">{{ baseClasses }}</code>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/app/components/LiveKbd.test.ts`
- [ ] **Step 5: Wire into `App.vue`** — import `LiveKbd`; add `"kbd"` to `COMPONENTS_WITH_PREVIEW`; add a `LiveKbd` `v-else-if` branch (`selectedComponent === 'kbd'`) before `<LiveButton` in both chains (same props block as Task 3).
- [ ] **Step 6: Run full suite**: `npm test` — expect PASS.
- [ ] **Step 7: Commit**: `git add src/app/components/LiveKbd.* src/app/App.vue && git commit -m "feat(app): LiveKbd preview (kbd base slot)"`

---

### Task 5: LiveProgress preview + wiring

**Files:** Create `src/app/components/LiveProgress.vue`, `LiveProgress.test.ts`; modify `src/app/App.vue`

- [ ] **Step 1: Write the failing test** — `src/app/components/LiveProgress.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveProgress from "./LiveProgress.vue";

function progressGraph() {
  const global = { progress: {
    "track-bg": { $value: "#E4E4E7", $type: "color" },
    "fill-bg": { $value: "#5667A7", $type: "color" },
    "height-md": { $value: 8, $type: "number" },
    radius: { $value: 999, $type: "number" },
  } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveProgress", () => {
  it("shows a fallback message when the graph has no progress tokens", () => {
    const wrapper = mount(LiveProgress, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="progress-track"]')).toHaveLength(0);
  });
  it("renders a track and an indicator fill with distinct backgrounds", () => {
    const wrapper = mount(LiveProgress, { props: { graph: progressGraph() }, ...mountOpts });
    const track = wrapper.find('[data-testid="progress-track"]');
    const indicator = wrapper.find('[data-testid="progress-indicator"]');
    expect(track.exists()).toBe(true);
    expect(indicator.exists()).toBe(true);
    const tbg = (track.element as HTMLElement).style.backgroundColor;
    const ibg = (indicator.element as HTMLElement).style.backgroundColor;
    expect(tbg).not.toBe("");
    expect(ibg).not.toBe("");
    expect(tbg).not.toBe(ibg);
    expect((indicator.element as HTMLElement).style.width).toBe("60%");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run src/app/components/LiveProgress.test.ts`

- [ ] **Step 3: Implement** — `src/app/components/LiveProgress.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "progress",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe, sizeClasses } = usePreviewRecipe(() => props.graph, () => props.componentName);
const trackClasses = computed<string>(() =>
  [recipe.value?.slots["base"] ?? "", sizeClasses.value].filter((s) => s.length > 0).join(" "),
);
const trackRendered = computed(() => extractArbitrary(trackClasses.value));
const indicatorRendered = computed(() => extractArbitrary(recipe.value?.slots["indicator"] ?? ""));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div data-testid="progress-track" class="w-full max-w-sm overflow-hidden" :class="trackRendered.classes" :style="trackRendered.style">
        <div data-testid="progress-indicator" class="h-full" :class="indicatorRendered.classes" :style="[{ width: '60%' }, indicatorRendered.style]" />
      </div>
      <code class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all">{{ trackClasses }}</code>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/app/components/LiveProgress.test.ts`
- [ ] **Step 5: Wire into `App.vue`** — import `LiveProgress`; add `"progress"` to `COMPONENTS_WITH_PREVIEW`; add a `LiveProgress` `v-else-if` branch (`selectedComponent === 'progress'`) before `<LiveButton` in both chains.
- [ ] **Step 6: Run full suite**: `npm test` — expect PASS.
- [ ] **Step 7: Commit**: `git add src/app/components/LiveProgress.* src/app/App.vue && git commit -m "feat(app): LiveProgress preview (track + indicator + size)"`

---

### Task 6: Verify + release

- [ ] **Step 1:** `npm test` (full) + `npm run typecheck` — expect all green.
- [ ] **Step 2 (optional manual):** `npm run dev`, load a graph with card/kbd/progress tokens, click each in the tree, confirm the rendered preview.
- [ ] **Step 3: Release v0.26.0** — bump `package.json` to `0.26.0`; `CHANGELOG.md` entry (Tier-1 previews card/kbd/progress + `usePreviewRecipe` composable dedup; Tier 2/3 deferred); README roadmap row + "Next" update (Tier 2/3 previews remain); commit `chore(release): v0.26.0 — card/kbd/progress live previews`, tag `v0.26.0`; merge to `main` (`--ff-only`), push (`gh auth switch --user clawdbot3535` if 403, then back to `d56de`), publish the GitHub Release, delete the branch.

---

## Self-Review

- **Spec coverage:** composable → Task 1; refactor trio → Task 2; card/kbd/progress previews + wiring → Tasks 3-5; release → Task 6.
- **Placeholder scan:** Task 4's test/SFC are described against the Task 3 template (LiveKbd is structurally identical to LiveCard with `slots.base` + `componentName: "kbd"`); all other steps have concrete code.
- **Type consistency:** `usePreviewRecipe(graphFn, componentNameFn) → { recipe, sizeClasses }` defined in Task 1, consumed identically in Tasks 2-5; previews use props `{ graph, componentName, highlightUtility?, completeness? }` matching the existing previews and the App.vue prop bindings; `extractArbitrary` returns `{ classes, style }` as used by the existing previews.
- **Wiring gotcha:** each preview adds its `COMPONENTS_WITH_PREVIEW` name and its branch (both chains, before the `LiveButton` catch-all) in the same task — never a name without a branch.
