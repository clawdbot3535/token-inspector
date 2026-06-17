# Real-Render Fidelity — nav & accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax. NOTE: Task 3 ends with browser-only `/browse` verdicts; prefer INLINE.

**Goal:** Extend the render-vs-tokens fidelity diff to the inline composites `nav` and `accordion`, via a generic sentinel-per-populated-slot builder and a shared refresh composable.

**Architecture:** `buildSlotSentinels(recipe.slots)` emits `{ui, specs}` for every populated slot; `useRealRender(hostRef, specsFn)` extracts the compiler-paint refresh. `LiveRealNav`/`LiveRealAccordion` render the real Nuxt UI components with sentinel-stamped `:ui`; `LiveRealTable` refactors onto the shared helpers. App widens the Real tab to button+table+nav+accordion.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Nuxt UI v4 `UNavigationMenu` (`:items`) / `UAccordion` (`:items` + `default-value` force-open; `item`/`trigger`/`body` are `:ui` slots), Vitest + jsdom (shape), `/browse` (verdict). Reuses `computeSlotDiffs`, `computeRenderDiff`, `usePreviewRecipe`, `ensureRuntimeTailwind`.

---

### Task 1: `buildSlotSentinels` + `useRealRender`; refactor `LiveRealTable`

**Files:**
- Modify: `src/app/composables/use-render-diff.ts`
- Test: `src/app/composables/use-render-diff.test.ts`
- Modify: `src/app/components/LiveRealTable.vue` (refactor onto the new helpers)

- [ ] **Step 1: Write the failing test** — add to `use-render-diff.test.ts`:

```ts
import { buildSlotSentinels } from "./use-render-diff.js"; // add to the existing import line

describe("buildSlotSentinels", () => {
  it("emits ui + specs for populated slots, skipping empty ones", () => {
    const { ui, specs } = buildSlotSentinels({ item: "rounded-[8px]", link: "", base: "p-[4px]" });
    expect(ui.item).toBe("rounded-[8px] ti-slot-item");
    expect(ui.base).toBe("p-[4px] ti-slot-base");
    expect(ui.link).toBeUndefined(); // empty slot skipped
    expect(specs).toEqual([
      { slot: "item", selector: ".ti-slot-item", classes: "rounded-[8px]" },
      { slot: "base", selector: ".ti-slot-base", classes: "p-[4px]" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts -t "buildSlotSentinels"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement** — append to `use-render-diff.ts` (and add the imports at the top:
`import { onMounted, ref, watch, nextTick, type Ref } from "vue";` and
`import { ensureRuntimeTailwind } from "./use-runtime-tailwind.js";`):

```ts
export interface SentinelBuild {
  ui: Record<string, string>;
  specs: Array<{ slot: string; selector: string; classes: string }>;
}

/** For every populated recipe slot, append a sentinel class and emit its diff spec. */
export function buildSlotSentinels(slots: Readonly<Record<string, string>>): SentinelBuild {
  const ui: Record<string, string> = {};
  const specs: SentinelBuild["specs"] = [];
  for (const [slot, classes] of Object.entries(slots)) {
    if (!classes) continue;
    ui[slot] = `${classes} ti-slot-${slot}`;
    specs.push({ slot, selector: `.ti-slot-${slot}`, classes });
  }
  return { ui, specs };
}

/** Drive the per-slot diff once the runtime compiler has painted. Browser-only. */
export function useRealRender(
  hostRef: Ref<HTMLElement | null>,
  specsFn: () => ReadonlyArray<{ slot: string; selector: string; classes: string }>,
): { slotDiffs: Ref<SlotDiff[]> } {
  const slotDiffs = ref<SlotDiff[]>([]);
  async function refresh(): Promise<void> {
    await ensureRuntimeTailwind();
    await nextTick();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const host = hostRef.value;
    slotDiffs.value = host ? computeSlotDiffs(host, specsFn()) : [];
  }
  onMounted(refresh);
  watch(() => JSON.stringify(specsFn()), refresh);
  return { slotDiffs };
}
```

- [ ] **Step 4: Refactor `LiveRealTable.vue`** onto the helpers — replace the whole file:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const rows = [
  { name: "Token", value: "8px" },
  { name: "Spacing", value: "16px" },
];

const build = computed(() =>
  recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => build.value.specs);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No table recipe to render.</div>
    <template v-else>
      <UTable :data="rows" :ui="build.ui" />
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 table themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
```

- [ ] **Step 5: Run the unit + LiveRealTable tests**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts src/app/components/LiveRealTable.test.ts`
Expected: PASS — `buildSlotSentinels` green; `computeRenderDiff`/`computeSlotDiffs` still green; `LiveRealTable` still passes (`build.ui.th`/`.td` carry `ti-slot-th`/`ti-slot-td` + recipe classes; null graph → no `UTable`).

- [ ] **Step 6: Commit**

```bash
git add src/app/composables/use-render-diff.ts src/app/composables/use-render-diff.test.ts src/app/components/LiveRealTable.vue
git commit -m "feat(fidelity): buildSlotSentinels + useRealRender; LiveRealTable onto them"
```

---

### Task 2: `LiveRealNav.vue` + `LiveRealAccordion.vue`

**Files:**
- Create: `src/app/components/LiveRealNav.vue`, `src/app/components/LiveRealAccordion.vue`
- Test: `src/app/components/LiveRealNav.test.ts`, `src/app/components/LiveRealAccordion.test.ts`

- [ ] **Step 1: Write the failing tests.**

`src/app/components/LiveRealNav.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealNav from "./LiveRealNav.vue";

function navGraph() {
  const global = { nav: { item: { radius: { $value: 8, $type: "number" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const NavStub = {
  props: ["items", "ui"],
  template: '<nav data-testid="real-unav" :data-ui="JSON.stringify(ui)"></nav>',
};
const mountOpts = { global: { stubs: { UNavigationMenu: NavStub, UIcon: true } } };

describe("LiveRealNav", () => {
  it("renders a real UNavigationMenu with sentinel-stamped populated slots", () => {
    const w = mount(LiveRealNav, { props: { graph: navGraph(), componentName: "nav" }, ...mountOpts });
    const ui = JSON.parse(w.find('[data-testid="real-unav"]').attributes("data-ui") ?? "{}");
    expect(ui.item).toContain("ti-slot-item");
    expect(ui.item.length).toBeGreaterThan("ti-slot-item".length);
  });
  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealNav, { props: { graph: null, componentName: "nav" }, ...mountOpts });
    expect(w.find('[data-testid="real-unav"]').exists()).toBe(false);
  });
});
```

`src/app/components/LiveRealAccordion.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealAccordion from "./LiveRealAccordion.vue";

function accGraph() {
  const global = { accordion: { item: { radius: { $value: 8, $type: "number" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const AccStub = {
  props: ["items", "ui", "defaultValue"],
  template: '<div data-testid="real-uaccordion" :data-ui="JSON.stringify(ui)" :data-open="defaultValue"></div>',
};
const mountOpts = { global: { stubs: { UAccordion: AccStub, UIcon: true } } };

describe("LiveRealAccordion", () => {
  it("renders a real UAccordion with sentinel slots and force-opens a panel", () => {
    const w = mount(LiveRealAccordion, { props: { graph: accGraph(), componentName: "accordion" }, ...mountOpts });
    const el = w.find('[data-testid="real-uaccordion"]');
    const ui = JSON.parse(el.attributes("data-ui") ?? "{}");
    expect(ui.item).toContain("ti-slot-item");
    expect(el.attributes("data-open")).toBe("a"); // force-open
  });
  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealAccordion, { props: { graph: null, componentName: "accordion" }, ...mountOpts });
    expect(w.find('[data-testid="real-uaccordion"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/components/LiveRealNav.test.ts src/app/components/LiveRealAccordion.test.ts`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Implement `src/app/components/LiveRealNav.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const items = [
  { label: "Home", to: "#" },
  { label: "Docs", to: "#" },
];
const build = computed(() =>
  recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => build.value.specs);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No nav recipe to render.</div>
    <template v-else>
      <UNavigationMenu :items="items" :ui="build.ui" />
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 navigation menu themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
```

- [ ] **Step 4: Implement `src/app/components/LiveRealAccordion.vue`** (same shape; force-open panel `a`):

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const items = [{ label: "Section", content: "Body text for the panel.", value: "a" }];
const build = computed(() =>
  recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => build.value.specs);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No accordion recipe to render.</div>
    <template v-else>
      <UAccordion :items="items" default-value="a" :ui="build.ui" />
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 accordion themed by your generated recipe (runtime-compiled, first panel open).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/app/components/LiveRealNav.test.ts src/app/components/LiveRealAccordion.test.ts`
Expected: PASS (2 each).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/LiveRealNav.vue src/app/components/LiveRealNav.test.ts src/app/components/LiveRealAccordion.vue src/app/components/LiveRealAccordion.test.ts
git commit -m "feat(fidelity): LiveRealNav + LiveRealAccordion (real components, sentinel slots)"
```

---

### Task 3: App wiring + `/browse` verdict

**Files:**
- Modify: `src/app/App.vue`
- Test: `src/app/App.coverage.test.ts`

- [ ] **Step 1: Write the failing test** — add to `App.coverage.test.ts` (import the two components):

```ts
import LiveRealNav from "./components/LiveRealNav.vue";
import LiveRealAccordion from "./components/LiveRealAccordion.vue";
// ...
it("offers a Real tab for nav and mounts LiveRealNav", async () => {
  const wrapper = await mountLoaded();
  const tree = wrapper.findComponent(ComponentTree);
  tree.vm.$emit("select", "");
  tree.vm.$emit("select-component", "nav");
  await flushPromises();
  await wrapper.find('[data-testid="real-tab"]').trigger("click");
  await flushPromises();
  expect(wrapper.findComponent(LiveRealNav).exists()).toBe(true);
});

it("offers a Real tab for accordion and mounts LiveRealAccordion", async () => {
  const wrapper = await mountLoaded();
  const tree = wrapper.findComponent(ComponentTree);
  tree.vm.$emit("select", "");
  tree.vm.$emit("select-component", "accordion");
  await flushPromises();
  await wrapper.find('[data-testid="real-tab"]').trigger("click");
  await flushPromises();
  expect(wrapper.findComponent(LiveRealAccordion).exists()).toBe(true);
});
```
Update the existing "does not offer a Real tab for a non-supported component" test to use a component that is still unsupported — change `"nav"` to `"chip"`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/App.coverage.test.ts -t "Real tab for nav"`
Expected: FAIL — nav not yet in `realRenderSupported`; no branch mounts `LiveRealNav`.

- [ ] **Step 3: Wire App.vue.** Add imports next to `LiveRealTable`:
```ts
import LiveRealNav from "./components/LiveRealNav.vue";
import LiveRealAccordion from "./components/LiveRealAccordion.vue";
```
Widen `realRenderSupported`:
```ts
const realRenderSupported = computed(() => ["button", "table", "nav", "accordion"].includes(selectedComponent.value));
```
Extend the Real pane's per-component branch (after the `<LiveRealTable>` else-if):
```vue
                <LiveRealNav
                  v-else-if="selectedComponent === 'nav'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                />
                <LiveRealAccordion
                  v-else-if="selectedComponent === 'accordion'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                />
```

- [ ] **Step 4: Run the App tests + routing regression**

Run: `npx vitest run src/app/App.coverage.test.ts src/app/App.preview-routing.test.ts`
Expected: PASS — nav/accordion Real-tab tests green; button/table still green; the renamed "non-supported" test (chip) green; routing unchanged.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue src/app/App.coverage.test.ts
git commit -m "feat(fidelity): Real tab for nav + accordion"
```

- [ ] **Step 7: `/browse` verdict (browser-only)**

```
npm run dev   # background
# /browse: load assets/tokens-20260615-161804.zip
#   select nav group → Real tab → wait ~2s:
$B js "({unav: !!document.querySelector('nav'), item: document.querySelectorAll('.ti-slot-item').length})"
$B js "[...document.querySelectorAll('[data-testid=render-diff]')].map(t=>t.innerText.split(String.fromCharCode(10))[0]).join('  ||  ')"
#   select accordion group → Real tab → wait ~2s: repeat the two reads
```
Expected: nav renders a real `<UNavigationMenu>`, `.ti-slot-item` queryable, an `item · N/M` delta table; accordion renders a real `<UAccordion>` (first panel open), `item · N/M`. **If `.ti-slot-item` count is 0, STOP** — the recipe slot name doesn't match the component's `:ui` slot key; verify against the component's theme. Screenshot each; document the per-slot match (+ any real deltas). Stop the dev server.

## Self-Review

**1. Spec coverage:**
- `buildSlotSentinels` (populated slots → ui+specs, sentinel) → Task 1. ✓
- `useRealRender` (compiler-paint refresh, returns slotDiffs) → Task 1. ✓
- `LiveRealTable` refactored onto both → Task 1. ✓
- `LiveRealNav` (`<UNavigationMenu :items :ui>`) + `LiveRealAccordion` (`<UAccordion :items default-value :ui>`, force-open) → Task 2. ✓
- App widens `realRenderSupported` to button+table+nav+accordion + branches → Task 3. ✓
- Testing (buildSlotSentinels jsdom; component mount; App; /browse) → Tasks 1/2/3 + Step 7. ✓
- `LiveRealButton` left untouched; out-of-scope (modal/dropdown, variant matrix, Figma-frame) honored. ✓

**2. Placeholder scan:** none — every code step shows real code; Step 7 is an explicit `/browse` procedure with a STOP condition.

**3. Type consistency:** `SentinelBuild {ui, specs}` (Task 1) consumed by `LiveRealTable`/`LiveRealNav`/`LiveRealAccordion` via `build.ui` / `build.specs`. `useRealRender(hostRef, specsFn) → {slotDiffs}` (Task 1) used identically in all three. `buildSlotSentinels(slots)` + `computeSlotDiffs`/`SlotDiff` reused with real signatures. `RenderDeltaTable` `{deltas, label?}` (from v0.34.0) used per slotDiff. Nuxt UI slot keys (`item`, etc.) come from `recipe.slots`, which are the components' `:ui` slot names.
