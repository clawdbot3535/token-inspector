# Real-render fidelity for 9 standard components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the "Real" tab (real Nuxt UI render + render-vs-tokens diff) from 4 components to 13 by covering card, kbd, badge, progress, switch, checkbox, radio, input, textarea via one generic component driven by a registry.

**Architecture:** A `real-slotted-registry.ts` maps each component name to `{ tag, props, slot? }`. A single `LiveRealSlotted.vue` builds the recipe with `usePreviewRecipe`, stamps sentinels with `buildSlotSentinels`, mounts the real `U<X>` via `<component :is="entry.tag">` with `:ui`, and diffs with `useRealRender` — structurally identical to the existing `LiveRealAccordion.vue`. `App.vue` adds the 9 to `realRenderSupported` and a final template branch.

**Tech Stack:** Vue 3 `<script setup>`, Nuxt UI v4 (globally registered components), vitest + @vue/test-utils (jsdom), runtime Tailwind compiler.

**Spec:** `docs/superpowers/specs/2026-06-17-real-render-slotted-standard-design.md`

**Branch:** `feat/real-render-slotted` (already created; spec already committed there).

---

### Task 1: Slotted-component registry

**Files:**
- Create: `src/app/components/real-slotted-registry.ts`
- Test: `src/app/components/real-slotted-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";

const STANDARD = ["card", "kbd", "badge", "progress", "switch", "checkbox", "radio", "input", "textarea"];

describe("REAL_SLOTTED_REGISTRY", () => {
  it("covers exactly the 9 standard slotted components", () => {
    expect(Object.keys(REAL_SLOTTED_REGISTRY).sort()).toEqual([...STANDARD].sort());
  });

  it("each entry has a U-prefixed tag and a props object", () => {
    for (const [name, entry] of Object.entries(REAL_SLOTTED_REGISTRY)) {
      expect(entry.tag, name).toMatch(/^U[A-Z]/);
      expect(typeof entry.props, name).toBe("object");
    }
  });

  it("excludes the custom components chip and sidebar", () => {
    expect(REAL_SLOTTED_REGISTRY).not.toHaveProperty("chip");
    expect(REAL_SLOTTED_REGISTRY).not.toHaveProperty("sidebar");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/real-slotted-registry.test.ts`
Expected: FAIL — "Cannot find module './real-slotted-registry.js'".

- [ ] **Step 3: Write minimal implementation**

```ts
// Registry for the generic Real-render component: maps a standard component name to the real
// Nuxt UI tag plus the minimal props (and optional default-slot text) needed to paint a resting
// state. Custom components (chip, sidebar) are intentionally absent — they have no faithful U<X>.

export interface RealSlottedEntry {
  /** Globally-registered Nuxt UI component name, e.g. "UCard". */
  tag: string;
  /** Minimal props to render the component in a resting state. */
  props: Record<string, unknown>;
  /** Optional default-slot text for components that need children. */
  slot?: string;
}

export const REAL_SLOTTED_REGISTRY: Readonly<Record<string, RealSlottedEntry>> = {
  card: { tag: "UCard", props: {}, slot: "Card body" },
  kbd: { tag: "UKbd", props: { value: "K" } },
  badge: { tag: "UBadge", props: { label: "Badge" } },
  progress: { tag: "UProgress", props: { modelValue: 50 } },
  switch: { tag: "USwitch", props: { modelValue: true } },
  checkbox: { tag: "UCheckbox", props: { modelValue: true, label: "Checkbox" } },
  radio: { tag: "URadioGroup", props: { modelValue: "a", items: [{ label: "Option", value: "a" }] } },
  input: { tag: "UInput", props: { modelValue: "Text" } },
  textarea: { tag: "UTextarea", props: { modelValue: "Text" } },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/real-slotted-registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/real-slotted-registry.ts src/app/components/real-slotted-registry.test.ts
git commit -m "feat(fidelity): registry of standard components for generic real-render"
```

---

### Task 2: Generic `LiveRealSlotted.vue`

**Files:**
- Create: `src/app/components/LiveRealSlotted.vue`
- Test: `src/app/components/LiveRealSlotted.test.ts`

**Note on the test:** the component renders the real tag via `<component :is="entry.tag">`. A dynamic string `:is` resolves through `resolveDynamicComponent`, so the stub MUST be registered via `global.components` (not `global.stubs`) for `:is="'UBadge'"` to find it. The `:ui` assertion is slot-name-agnostic (asserts *some* populated slot got a `ti-slot-` sentinel) so it does not depend on the exact slot-mapping output.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealSlotted from "./LiveRealSlotted.vue";

function badgeGraph() {
  const global = { badge: { bg: { $value: "#3b82f6", $type: "color" } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

const BadgeStub = {
  props: ["ui", "label"],
  template: '<span data-testid="real-slotted" :data-ui="JSON.stringify(ui)"></span>',
};
const mountOpts = { global: { components: { UBadge: BadgeStub } } };

describe("LiveRealSlotted", () => {
  it("mounts the registry tag and stamps populated slots with sentinels in :ui", () => {
    const w = mount(LiveRealSlotted, { props: { graph: badgeGraph(), componentName: "badge" }, ...mountOpts });
    const el = w.find('[data-testid="real-slotted"]');
    expect(el.exists()).toBe(true);
    const ui = JSON.parse(el.attributes("data-ui") ?? "{}");
    expect(Object.values(ui).join(" ")).toContain("ti-slot-");
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealSlotted, { props: { graph: null, componentName: "badge" }, ...mountOpts });
    expect(w.find('[data-testid="real-slotted"]').exists()).toBe(false);
    expect(w.text()).toContain("No badge recipe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/LiveRealSlotted.test.ts`
Expected: FAIL — "Cannot find module './LiveRealSlotted.vue'".

- [ ] **Step 3: Write minimal implementation**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender } from "../composables/use-render-diff.js";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const entry = computed(() => REAL_SLOTTED_REGISTRY[props.componentName] ?? null);
const build = computed(() =>
  recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => build.value.specs);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe || !entry" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <component :is="entry.tag" v-bind="entry.props" :ui="build.ui">{{ entry.slot }}</component>
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/LiveRealSlotted.test.ts`
Expected: PASS (2 tests).
If the first test fails because `badge.bg` did not populate a slot, switch the fixture to `{ badge: { radius: { $value: 8, $type: "number" } } }` (radius is the most reliably-mapped property; mirrors the working nav fixture) and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LiveRealSlotted.vue src/app/components/LiveRealSlotted.test.ts
git commit -m "feat(fidelity): generic LiveRealSlotted (real render + per-slot diff via registry)"
```

---

### Task 3: Wire the 9 into App.vue's Real tab

**Files:**
- Modify: `src/app/App.vue` (imports near line 18-21; `realRenderSupported` at line ~180; template branch after line 1102)
- Test: `src/app/App.coverage.test.ts` (add one test + one import)

- [ ] **Step 1: Write the failing test**

Add this import alongside the other `LiveReal*` imports at the top of `src/app/App.coverage.test.ts` (after line 10):

```ts
import LiveRealSlotted from "./components/LiveRealSlotted.vue";
```

Add this test inside the existing top-level `describe(...)` block, after the "accordion" Real-tab test (after line 195):

```ts
  it("offers a Real tab for a registry component (card) and mounts LiveRealSlotted", async () => {
    const wrapper = await mountLoaded();
    const tree = wrapper.findComponent(ComponentTree);
    tree.vm.$emit("select", "");
    tree.vm.$emit("select-component", "card");
    await flushPromises();
    const realTab = wrapper.find('[data-testid="real-tab"]');
    expect(realTab.exists()).toBe(true);
    await realTab.trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(LiveRealSlotted).exists()).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/App.coverage.test.ts -t "registry component"`
Expected: FAIL — `realTab.exists()` is false (card is not yet in `realRenderSupported`), so the assertion on the tab or on `LiveRealSlotted` fails.

- [ ] **Step 3: Write the implementation**

In `src/app/App.vue`, add two imports next to the existing `LiveReal*` imports (after line 21):

```ts
import LiveRealSlotted from "./components/LiveRealSlotted.vue";
import { REAL_SLOTTED_REGISTRY } from "./components/real-slotted-registry.js";
```

Replace the `realRenderSupported` computed (lines 180-182) with:

```ts
const realRenderSupported = computed(() =>
  ["button", "table", "nav", "accordion"].includes(selectedComponent.value) ||
  selectedComponent.value in REAL_SLOTTED_REGISTRY,
);
```

In the template, add this branch immediately after the closing `/>` of the `LiveRealAccordion` element (after line 1102, before the `</template>` on line 1103):

```vue
                <LiveRealSlotted
                  v-else-if="REAL_SLOTTED_REGISTRY[selectedComponent]"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/App.coverage.test.ts`
Expected: PASS (all tests, including the new one and the unchanged "does not offer a Real tab for ... chip" negative test — chip stays out of the registry).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test`
Expected: all tests pass (852 prior + 6 new = 858).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue src/app/App.coverage.test.ts
git commit -m "feat(fidelity): Real tab for card/kbd/badge/progress/switch/checkbox/radio/input/textarea"
```

---

### Task 4: Browser verification of all 9

The unit tests prove wiring only — `getComputedStyle` is empty in jsdom, so the real fidelity verdict is a browser artifact. Verify every component renders and diffs sensibly before release.

**Files:** none (manual verification; registry prop tweaks only if a component fails to render).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Note the local URL.

- [ ] **Step 2: Load a real token export and walk all 9**

Use the `/browse` skill to open the app, load a token export (the latest `tokens-*` export used for previous fidelity work), then for each of `card, kbd, badge, progress, switch, checkbox, radio, input, textarea`: select the component in the tree, click the **Real** tab, and confirm:
- the real component renders in a resting state (not blank, not a thrown error in the console),
- `:is="'U<X>'"` resolved (no "Failed to resolve component" warning),
- the per-slot diff table shows sensible rows (or "no deltas" when the token matches).

- [ ] **Step 3: Fix any component that fails to render**

If a component renders blank or errors, adjust only its `props` entry in `real-slotted-registry.ts` (e.g. add a required prop) and re-verify. Re-run `npx vitest run src/app/components/real-slotted-registry.test.ts` after any registry edit. Commit any fix:

```bash
git add src/app/components/real-slotted-registry.ts
git commit -m "fix(fidelity): registry props so <component> renders a resting state"
```

- [ ] **Step 4: Record the verdict**

Note which of the 9 render cleanly and which (if any) need follow-up. This list goes into the release notes.

---

### Task 5: Release

Follow the established release flow (matches v0.34.0 / v0.35.0). Version: bump minor to the next `0.x.0`.

- [ ] **Step 1: Bump version**

Edit `package.json` `"version"` to the next minor (e.g. `0.36.0`). Run `npm install` to sync `package-lock.json` if needed.

- [ ] **Step 2: CHANGELOG entry**

Add a `## [0.36.0]` section: "Real-render fidelity extended to 9 standard components (card, kbd, badge, progress, switch, checkbox, radio, input, textarea) via a generic `LiveRealSlotted` + registry. chip/sidebar deferred (custom). Resting-state slot diffs only." Note any component from Task 4 that needs follow-up.

- [ ] **Step 3: README test count**

Update the test count in `README.md` to the new total (858, or whatever `npm test` reports). Add the 9 to the Real-render tab component list.

- [ ] **Step 4: Commit the release on the feat branch**

```bash
git add CHANGELOG.md README.md package.json package-lock.json
git commit -m "chore(release): v0.36.0 — real-render fidelity for 9 standard components"
```

- [ ] **Step 5: Merge to main, tag, push**

```bash
git checkout main
git merge --no-ff feat/real-render-slotted -m "Merge feat/real-render-slotted: real-render fidelity for 9 standard components (v0.36.0)"
git tag v0.36.0   # tag the release commit per convention
```
Push needs the repo-owner account (see memory note "push-needs-clawdbot-account"):
```bash
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.36.0
gh auth switch --user d56de
```

---

## Self-Review

**Spec coverage:**
- 9 standard components → Task 1 registry + Task 3 wiring. ✓
- chip/sidebar deferred → absent from registry, asserted in Task 1 step 1; chip negative test in App still passes (Task 3 step 4). ✓
- v1 resting-state slot diffs only → `LiveRealSlotted` diffs `recipe.slots` only (Task 2), no variant logic. ✓
- Generic component + registry architecture → Tasks 1 + 2. ✓
- App wiring (`realRenderSupported` + template branch) → Task 3. ✓
- Testing strategy (registry data test, mount test, App wiring test) → Tasks 1-3. ✓
- jsdom limitation + browser verification → Task 4. ✓
- Risks (`:is` resolution, render without enough props) → Task 4 steps 2-3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**Type consistency:** `RealSlottedEntry` / `REAL_SLOTTED_REGISTRY` names consistent across Tasks 1-3; `usePreviewRecipe`/`buildSlotSentinels`/`useRealRender`/`RenderDeltaTable` signatures match the existing `LiveRealAccordion.vue`. ✓
