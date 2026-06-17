# Real-render for custom chip + sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the "Real" tab to the two custom components `chip` and `sidebar` by rendering their hand-built anatomy through the real runtime Tailwind compiler and diffing each slot.

**Architecture:** Two bespoke components (`LiveRealChip.vue`, `LiveRealSidebar.vue`) mirroring the existing bespoke `LiveRealAccordion.vue`, but using `useCustomPreviewRecipe` (custom recipe) instead of `usePreviewRecipe`, and rendering a hand-built anatomy DOM (no stock `U<X>` to mount) whose slot elements carry the `ti-slot-<slot>` sentinels from `buildSlotSentinels`. `App.vue` gates and routes them.

**Tech Stack:** Vue 3 `<script setup>`, vitest + @vue/test-utils (jsdom), `@tailwindcss/browser` runtime compiler.

**Spec:** `docs/superpowers/specs/2026-06-17-real-render-custom-chip-sidebar-design.md`

**Branch:** `feat/real-render-custom` (already created; spec already committed there).

---

### Task 1: `LiveRealChip.vue`

**Files:**
- Create: `src/app/components/LiveRealChip.vue`
- Test: `src/app/components/LiveRealChip.test.ts`

- [ ] **Step 1: Write the failing test** — `src/app/components/LiveRealChip.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealChip from "./LiveRealChip.vue";

function chipGraph() {
  const global = {
    chip: {
      bg: { $value: "#E4E4E7", $type: "color" },
      radius: { $value: 999, $type: "number" },
      "label-text": { $value: "#18181B", $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const parts = new Map<string, readonly string[]>([["chip", ["label", "close"]]]);

describe("LiveRealChip", () => {
  it("renders the chip anatomy with the base slot sentinel-stamped", () => {
    const w = mount(LiveRealChip, { props: { graph: chipGraph(), customParts: parts } });
    const base = w.find('[data-testid="real-chip"]');
    expect(base.exists()).toBe(true);
    expect(base.classes()).toContain("ti-slot-base");
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealChip, { props: { graph: null, customParts: parts } });
    expect(w.find('[data-testid="real-chip"]').exists()).toBe(false);
    expect(w.text()).toContain("No chip recipe");
  });
});
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `npx vitest run src/app/components/LiveRealChip.test.ts`
Expected: FAIL — "Cannot find module './LiveRealChip.vue'".

- [ ] **Step 3: Implement** — `src/app/components/LiveRealChip.vue`

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { useCustomPreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = withDefaults(
  defineProps<{
    graph: TokenGraph | null;
    componentName?: string;
    customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
  }>(),
  { componentName: "chip", customParts: () => new Map() },
);

const { recipe } = useCustomPreviewRecipe(
  () => props.graph,
  () => props.componentName,
  () => props.customParts,
);
const build = computed(() =>
  recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => build.value.specs);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <span data-testid="real-chip" class="inline-flex items-center gap-1" :class="build.ui.base">
        <span :class="build.ui.label">Chip</span>
        <span class="opacity-60" :class="build.ui.close">×</span>
      </span>
      <p class="mt-2 text-[10px] text-muted">
        Real custom component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run to verify it PASSES**

Run: `npx vitest run src/app/components/LiveRealChip.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LiveRealChip.vue src/app/components/LiveRealChip.test.ts
git commit -m "feat(fidelity): LiveRealChip (real-CSS render + per-slot diff for the custom chip)"
```

---

### Task 2: `LiveRealSidebar.vue`

**Files:**
- Create: `src/app/components/LiveRealSidebar.vue`
- Test: `src/app/components/LiveRealSidebar.test.ts`

- [ ] **Step 1: Write the failing test** — `src/app/components/LiveRealSidebar.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealSidebar from "./LiveRealSidebar.vue";

function sidebarGraph() {
  const global = {
    sidebar: {
      bg: { $value: "#F4F4F5", $type: "color" },
      border: { $value: "#E4E4E7", $type: "color" },
      "item-text": { $value: "#52525B", $type: "color" },
      "item-bg-hover": { $value: "#E4E4E7", $type: "color" },
      "item-padding": { $value: 6, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const parts = new Map<string, readonly string[]>([["sidebar", ["item"]]]);

describe("LiveRealSidebar", () => {
  it("renders the sidebar anatomy with base + item slots sentinel-stamped", () => {
    const w = mount(LiveRealSidebar, { props: { graph: sidebarGraph(), customParts: parts } });
    const root = w.find('[data-testid="real-sidebar"]');
    expect(root.exists()).toBe(true);
    expect(root.classes()).toContain("ti-slot-base");
    const item = w.find('[data-testid="real-sidebar-item"]');
    expect(item.exists()).toBe(true);
    expect(item.classes()).toContain("ti-slot-item");
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealSidebar, { props: { graph: null, customParts: parts } });
    expect(w.find('[data-testid="real-sidebar"]').exists()).toBe(false);
    expect(w.text()).toContain("No sidebar recipe");
  });
});
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `npx vitest run src/app/components/LiveRealSidebar.test.ts`
Expected: FAIL — "Cannot find module './LiveRealSidebar.vue'".

- [ ] **Step 3: Implement** — `src/app/components/LiveRealSidebar.vue`

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { useCustomPreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = withDefaults(
  defineProps<{
    graph: TokenGraph | null;
    componentName?: string;
    customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
  }>(),
  { componentName: "sidebar", customParts: () => new Map() },
);

const { recipe } = useCustomPreviewRecipe(
  () => props.graph,
  () => props.componentName,
  () => props.customParts,
);
const build = computed(() =>
  recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => build.value.specs);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <aside data-testid="real-sidebar" class="flex flex-col gap-1 w-48" :class="build.ui.base">
        <a data-testid="real-sidebar-item" :class="build.ui.item">Dashboard</a>
        <a data-testid="real-sidebar-item" :class="build.ui.item">Projects</a>
      </aside>
      <p class="mt-2 text-[10px] text-muted">
        Real custom component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run to verify it PASSES**

Run: `npx vitest run src/app/components/LiveRealSidebar.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LiveRealSidebar.vue src/app/components/LiveRealSidebar.test.ts
git commit -m "feat(fidelity): LiveRealSidebar (real-CSS render + per-slot diff for the custom sidebar)"
```

---

### Task 3: Wire chip + sidebar into App.vue's Real tab

**Files:**
- Modify: `src/app/App.vue` (imports ~lines 18-21; `realRenderSupported` ~line 180; Real-tab template block ~line 1098-1103)
- Test: `src/app/App.coverage.test.ts` (add 2 imports + 2 tests; update 1 negative test)

- [ ] **Step 1: Write the failing tests + update the negative test**

In `src/app/App.coverage.test.ts`, add these imports after the existing `LiveRealSlotted` import (near line 11):

```ts
import LiveRealChip from "./components/LiveRealChip.vue";
import LiveRealSidebar from "./components/LiveRealSidebar.vue";
```

Add these two tests inside the top-level `describe(...)`, after the "registry component (card)" test:

```ts
  it("offers a Real tab for chip and mounts LiveRealChip", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "chip");
    await flushPromises();
    await wrapper.find('[data-testid="real-tab"]').trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(LiveRealChip).exists()).toBe(true);
  });

  it("offers a Real tab for sidebar and mounts LiveRealSidebar", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "sidebar");
    await flushPromises();
    await wrapper.find('[data-testid="real-tab"]').trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(LiveRealSidebar).exists()).toBe(true);
  });
```

Update the existing negative test — it currently selects `"chip"`, which is about to become supported. Find:

```ts
  it("does not offer a Real tab for a non-supported component", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "chip");
    await flushPromises();
    expect(wrapper.find('[data-testid="real-tab"]').exists()).toBe(false);
  });
```

and change the `select-component` argument from `"chip"` to `"container"` (a layout-primitive group that has no Real tab):

```ts
    tree.vm.$emit("select-component", "container");
```

- [ ] **Step 2: Run to verify the new tests FAIL**

Run: `npx vitest run src/app/App.coverage.test.ts -t "Real tab for chip"`
Expected: FAIL — `real-tab` not present (chip not yet in `realRenderSupported`) / `LiveRealChip` not mounted.

- [ ] **Step 3: Implement the wiring in `src/app/App.vue`**

(a) Add two imports next to the other `LiveReal*` imports (after the `LiveRealAccordion` import, ~line 21):

```ts
import LiveRealChip from "./components/LiveRealChip.vue";
import LiveRealSidebar from "./components/LiveRealSidebar.vue";
```

(b) Replace the `realRenderSupported` computed with:

```ts
const realRenderSupported = computed(() =>
  ["button", "table", "nav", "accordion", "chip", "sidebar"].includes(selectedComponent.value) ||
  selectedComponent.value in REAL_SLOTTED_REGISTRY,
);
```

(c) In the `<template v-if="realRenderSupported && paneTab === 'real'">` block, add two branches immediately after the `LiveRealAccordion` element and before the `LiveRealSlotted` element:

```vue
                <LiveRealChip
                  v-else-if="selectedComponent === 'chip'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                  :custom-parts="customParts"
                />
                <LiveRealSidebar
                  v-else-if="selectedComponent === 'sidebar'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                  :custom-parts="customParts"
                />
```

(`customParts` is the existing `computed(() => customPartsByComponent(scanReport.value))` at ~line 124.)

- [ ] **Step 4: Run the App test file to verify PASS**

Run: `npx vitest run src/app/App.coverage.test.ts`
Expected: PASS — including the two new tests and the updated negative test (now using `container`).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test`
Expected: all pass (860 prior + 4 new chip/sidebar component tests + 2 new App tests = 866; the negative test was modified, not added).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue src/app/App.coverage.test.ts
git commit -m "feat(fidelity): Real tab for the custom chip + sidebar"
```

---

### Task 4: Browser verification

The unit tests prove wiring only (jsdom has no `getComputedStyle`). Verify the real render + diff in a browser.

**Files:** none (manual verification; tweak the anatomy/props only if something fails to render).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` and note the URL (e.g. `http://localhost:5173/`).

- [ ] **Step 2: Walk chip and sidebar via `/browse`**

Open the app, load the latest token export (`assets/tokens-20260615-161948.zip`), then for `chip` and `sidebar`: select it in the tree, click the **Real** tab, and confirm:
- the custom anatomy renders with real compiled CSS (not unstyled, no thrown errors in the console),
- there are NO unresolved custom elements,
- the per-slot diff table populates (chip: `base`/`label`; sidebar: `base`/`item`),
- the inspector chrome is unaffected — the v0.36.1 dark-leak fix still holds (SKIP tags / code preview do not flip).

- [ ] **Step 3: Record the verdict**

Note the diff headlines for chip and sidebar (for the release notes). If anything fails to render, adjust the anatomy/props in the component and re-verify; re-run that component's test after any edit.

---

### Task 5: Release v0.37.0

Follow the established release flow (matches v0.36.0).

- [ ] **Step 1: Bump version** — `npm version 0.37.0 --no-git-tag-version` (syncs package.json + package-lock.json).

- [ ] **Step 2: CHANGELOG entry** — add a linked `## [0.37.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.37.0) — <date>` section: "Real-render fidelity extended to the custom components `chip` and `sidebar` via bespoke `LiveRealChip` / `LiveRealSidebar` that render the hand-built anatomy through the runtime Tailwind compiler and diff each slot. Real-render now covers all 15 components. v1 diffs resting slots only (chip color variants deferred)." Include the verified diff headlines from Task 4.

- [ ] **Step 3: README** — bump the test count to the new total (866, or whatever `npm test` reports) and add `chip`/`sidebar` to the Real-render tab component list.

- [ ] **Step 4: Commit the release on the feat branch**

```bash
git add CHANGELOG.md README.md package.json package-lock.json
git commit -m "chore(release): v0.37.0 — real-render fidelity for custom chip + sidebar"
```

- [ ] **Step 5: Merge to main, tag, push, GitHub release**

```bash
git checkout main
git merge --no-ff feat/real-render-custom -m "Merge feat/real-render-custom: real-render fidelity for custom chip + sidebar (v0.37.0)"
git tag v0.37.0 <release-commit-sha>   # the chore(release) commit, per convention
```
Push + GitHub release need the repo-owner account (see memory "push-needs-clawdbot-account"):
```bash
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.37.0
gh release create v0.37.0 --title "v0.37.0 — real-render fidelity for custom chip + sidebar" --notes-file <notes> --verify-tag
gh auth switch --user d56de
```
Verify the v0.37.0 release link resolves (HTTP 200) in the browser.

---

## Self-Review

**Spec coverage:**
- chip real-render → Task 1. ✓
- sidebar real-render → Task 2. ✓
- App gating + routing + `customParts` → Task 3. ✓
- Negative test updated (chip now supported) → Task 3 step 1. ✓
- v1 resting-slots-only → components diff `recipe.slots` only, no variant logic (Tasks 1-2). ✓
- Tests assert directly on hand-built DOM (no stub) → Tasks 1-2. ✓
- jsdom limitation + browser verification → Task 4. ✓
- Risks (recipe population, repeated-item sentinel) → covered by the live-export browser test + `querySelector`-first semantics. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. (Task 5 tag/notes use `<release-commit-sha>`/`<notes>` placeholders — these are release-time values determined when running, consistent with the v0.36.0 release task.)

**Type consistency:** `useCustomPreviewRecipe(graph, componentName, customParts)` 3-arg signature matches `LiveChip.vue`; `buildSlotSentinels(recipe.slots)` / `useRealRender(host, specsFn)` / `RenderDeltaTable :label/:deltas` match the existing `LiveRealAccordion.vue`. `data-testid` names (`real-chip`, `real-sidebar`, `real-sidebar-item`) consistent between each component and its test.
