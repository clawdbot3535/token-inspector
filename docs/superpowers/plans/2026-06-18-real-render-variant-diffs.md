# Real-Tab v2 Phase A — variant + color diffs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the "Real" tab to diff each `variant`/`color` recipe key (not just the resting look), per slot, against intent — rendering the real component with that variant applied — for the two bespoke components button and chip.

**Architecture:** A data-driven `buildVariantCells(recipe)` turns the recipe's `variant`/`color` axes into per-key "cells" (composed sentinel `ui` + diff `specs` + the Nuxt variant prop). A shared `RealVariantCell.vue` owns the per-cell host + `useRealRender` + delta tables, taking the component's anatomy via a scoped slot. button and chip render their resting diff (unchanged) plus one `RealVariantCell` per cell.

**Tech Stack:** Vue 3 `<script setup>`, vitest + @vue/test-utils (jsdom), `@tailwindcss/browser` runtime compiler.

**Spec:** `docs/superpowers/specs/2026-06-18-real-render-variant-diffs-design.md`

**Branch:** `feat/real-render-variants` (already created; spec already committed there).

**Scope note:** `badge` (and any other color-axis *standard* component) lives in the generic `LiveRealSlotted`, whose literal-tag `v-if` chain + registry render-props make variant wiring need a larger unified-cell refactor. Deferred to a focused follow-up (Phase A.1). This plan delivers the mechanism + button (variant) + chip (color).

---

### Task 1: `buildVariantCells(recipe)`

**Files:**
- Modify: `src/app/composables/use-render-diff.ts`
- Test: `src/app/composables/use-render-diff.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `src/app/composables/use-render-diff.test.ts`

```ts
import { buildVariantCells } from "./use-render-diff.js";
import type { ComponentRecipe } from "@core/recipe-engine.js";

function recipeWith(variants: ComponentRecipe["variants"], slots: Record<string, string> = { base: "rounded-[4px]" }): ComponentRecipe {
  return { slots, variants } as unknown as ComponentRecipe;
}

describe("buildVariantCells", () => {
  it("emits one cell per variant+color key, composed base+variant classes, sentinel-stamped, with the Nuxt prop", () => {
    const recipe = recipeWith({
      variant: { solid: { base: "bg-[#A]" }, ghost: { base: "bg-transparent" } },
      color: { error: { base: "text-[#E]" } },
    });
    const cells = buildVariantCells(recipe);
    expect(cells.map((c) => `${c.axis}:${c.key}`)).toEqual(["variant:solid", "variant:ghost", "color:error"]);

    const solid = cells[0]!;
    expect(solid.props).toEqual({ variant: "solid" });
    expect(solid.ui.base).toContain("rounded-[4px]"); // base slot composed in
    expect(solid.ui.base).toContain("bg-[#A]"); // variant slot composed in
    expect(solid.ui.base).toContain("ti-slot-base"); // sentinel appended
    expect(solid.specs[0]!.classes).toBe("rounded-[4px] bg-[#A]"); // probe = composed classes, NO sentinel

    const error = cells[2]!;
    expect(error.props).toEqual({ color: "error" });
  });

  it("returns [] for a recipe with no variant/color axis", () => {
    expect(buildVariantCells(recipeWith({}))).toEqual([]);
    expect(buildVariantCells(recipeWith({ size: { md: { base: "p-2" } } }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts -t buildVariantCells`
Expected: FAIL — `buildVariantCells` is not exported.

- [ ] **Step 3: Implement** — add to `src/app/composables/use-render-diff.ts`

Add the import at the top (with the other imports):

```ts
import type { ComponentRecipe } from "@core/recipe-engine.js";
```

Append this exported interface + function (after `buildSlotSentinels`):

```ts
export interface VariantCell {
  axis: "variant" | "color";
  key: string;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
  props: Record<string, string>;
}

/**
 * Turn a recipe's `variant` and `color` axes into per-key diff cells. Each cell
 * composes the base slot classes with the variant's slot overrides, stamps the
 * sentinels (via buildSlotSentinels), and carries `{ [axis]: key }` as the real
 * Nuxt variant prop (recipe axis names equal Nuxt prop names). `size` is excluded.
 */
export function buildVariantCells(recipe: ComponentRecipe): VariantCell[] {
  const cells: VariantCell[] = [];
  const baseSlots = recipe.slots as Record<string, string | undefined>;
  for (const axis of ["variant", "color"] as const) {
    const bucket = recipe.variants[axis];
    if (!bucket) continue;
    for (const key of Object.keys(bucket)) {
      const variantSlots = bucket[key] as Record<string, string | undefined>;
      const composed: Record<string, string | undefined> = {};
      for (const slot of new Set([...Object.keys(baseSlots), ...Object.keys(variantSlots)])) {
        const merged = [baseSlots[slot], variantSlots[slot]].filter(Boolean).join(" ");
        composed[slot] = merged || undefined;
      }
      const { ui, specs } = buildSlotSentinels(composed);
      cells.push({ axis, key, ui, specs, props: { [axis]: key } });
    }
  }
  return cells;
}
```

- [ ] **Step 4: Run to verify it PASSES**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts -t buildVariantCells`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/composables/use-render-diff.ts src/app/composables/use-render-diff.test.ts
git commit -m "feat(fidelity): buildVariantCells — recipe variant/color axes → per-key diff cells"
```

---

### Task 2: `RealVariantCell.vue`

**Files:**
- Create: `src/app/components/RealVariantCell.vue`
- Test: `src/app/components/RealVariantCell.test.ts`

- [ ] **Step 1: Write the failing test** — `src/app/components/RealVariantCell.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RealVariantCell from "./RealVariantCell.vue";

describe("RealVariantCell", () => {
  it("renders the label and the slotted anatomy inside its host", () => {
    const w = mount(RealVariantCell, {
      props: { label: "variant: solid", specs: [] },
      slots: { default: '<span data-testid="anatomy" class="ti-slot-base">X</span>' },
    });
    expect(w.text()).toContain("variant: solid");
    expect(w.find('[data-testid="anatomy"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `npx vitest run src/app/components/RealVariantCell.test.ts`
Expected: FAIL — "Cannot find module './RealVariantCell.vue'".

- [ ] **Step 3: Implement** — `src/app/components/RealVariantCell.vue`

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useRealRender, type SentinelBuild } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ label: string; specs: SentinelBuild["specs"] }>();
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => props.specs);
</script>

<template>
  <div class="mt-3" data-testid="real-variant-cell">
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{{ label }}</div>
    <div ref="hostRef"><slot /></div>
    <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
  </div>
</template>
```

- [ ] **Step 4: Run to verify it PASSES**

Run: `npx vitest run src/app/components/RealVariantCell.test.ts`
Expected: PASS (1 test). (In jsdom `useRealRender` produces no diffs — `getComputedStyle` is empty — so the test asserts only label + slotted anatomy.)

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RealVariantCell.vue src/app/components/RealVariantCell.test.ts
git commit -m "feat(fidelity): RealVariantCell — per-variant diff block (host + useRealRender + label)"
```

---

### Task 3: button variant diffs (`LiveRealButton.vue`)

**Files:**
- Modify: `src/app/components/LiveRealButton.vue`
- Test: `src/app/components/LiveRealButton.test.ts`

`LiveRealButton` currently composes one representative variant (solid) into its resting `ui`. Drop that, keep the resting diff as base+size only, and add a `RealVariantCell` per variant/color key.

- [ ] **Step 1: Write the failing test** — append to `src/app/components/LiveRealButton.test.ts`

```ts
import RealVariantCell from "./RealVariantCell.vue";

// graph with two button variants so buildVariantCells yields 2 cells
function variantButtonGraph() {
  const global = {
    button: {
      radius: { $value: 6, $type: "number" },
      solid: { bg: { $value: "#3b82f6", $type: "color" } },
      ghost: { bg: { $value: "#000000", $type: "color" } },
    },
  };
  return buildGraph([{ name: "global", data: global }]);
}

describe("LiveRealButton — variant cells", () => {
  it("renders a RealVariantCell per variant key, each carrying the variant prop + sentinel ui", () => {
    const w = mount(LiveRealButton, { props: { graph: variantButtonGraph(), componentName: "button" }, ...mountOpts });
    const cells = w.findAllComponents(RealVariantCell);
    expect(cells.length).toBeGreaterThanOrEqual(2); // solid + ghost
    // the UButton inside a cell receives the variant prop
    const uButton = w.findAll('[data-testid="real-ubutton"]');
    expect(uButton.length).toBeGreaterThanOrEqual(2);
  });
});
```

Add, near the top of the existing test file, a `UButton` stub that exposes its `variant` prop + `:ui` (if the file does not already stub `UButton`), and ensure `mountOpts` registers it:

```ts
const UButtonStub = {
  props: ["ui", "variant"],
  template: '<button data-testid="real-ubutton" :data-variant="variant" :data-ui="JSON.stringify(ui)"><slot /></button>',
};
const mountOpts = { global: { stubs: { UButton: UButtonStub } } };
```

(If the file already defines `mountOpts`/a `UButton` stub, extend that one instead of redefining — keep a single `mountOpts`.)

- [ ] **Step 2: Run to verify it FAILS**

Run: `npx vitest run src/app/components/LiveRealButton.test.ts -t "variant cells"`
Expected: FAIL — no `RealVariantCell` rendered yet.

- [ ] **Step 3: Implement** — `src/app/components/LiveRealButton.vue`

Replace the entire file with:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe, representativeSizeClasses } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";
import { computeRenderDiff, buildVariantCells } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";
import RealVariantCell from "./RealVariantCell.vue";
import type { RenderDelta } from "../render-diff.js";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

// Resting look: base + representative size only (no variant — variants get their own cells below).
const ui = computed<Record<string, string> | null>(() => {
  const r = recipe.value;
  if (!r) return null;
  const base = [r.slots["base"] ?? "", representativeSizeClasses(r)].filter(Boolean).join(" ");
  const out: Record<string, string> = { base };
  if (r.slots["label"]) out.label = r.slots["label"];
  if (r.slots["leadingIcon"]) out.leadingIcon = r.slots["leadingIcon"];
  return out;
});

const variantCells = computed(() => (recipe.value ? buildVariantCells(recipe.value) : []));

const hostRef = ref<HTMLElement | null>(null);
const deltas = ref<RenderDelta[]>([]);

async function refreshDiff(): Promise<void> {
  await ensureRuntimeTailwind();
  await nextTick();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const el = hostRef.value?.querySelector("button");
  const base = ui.value?.base;
  deltas.value = el && base ? computeRenderDiff(el, base) : [];
}

onMounted(refreshDiff);
watch([() => props.graph, () => props.componentName], refreshDiff);
</script>

<template>
  <div class="p-4">
    <div v-if="!ui" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <div ref="hostRef">
        <UButton :ui="ui" size="md">Button</UButton>
      </div>
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable :deltas="deltas" />

      <RealVariantCell
        v-for="cell in variantCells"
        :key="cell.axis + cell.key"
        :label="`${cell.axis}: ${cell.key}`"
        :specs="cell.specs"
      >
        <UButton v-bind="cell.props" :ui="cell.ui" size="md">Button</UButton>
      </RealVariantCell>
    </template>
  </div>
</template>
```

(The resting `<UButton>` is now wrapped in its own `ref="hostRef"` div so `querySelector("button")` still targets the resting button only, not the variant cells' buttons.)

- [ ] **Step 4: Run the test file**

Run: `npx vitest run src/app/components/LiveRealButton.test.ts`
Expected: PASS — existing resting tests + the new variant-cells test.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LiveRealButton.vue src/app/components/LiveRealButton.test.ts
git commit -m "feat(fidelity): per-variant diffs for button (drop one-off representative variant)"
```

---

### Task 4: chip color diffs (`LiveRealChip.vue`)

**Files:**
- Modify: `src/app/components/LiveRealChip.vue`
- Test: `src/app/components/LiveRealChip.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/app/components/LiveRealChip.test.ts`

```ts
import RealVariantCell from "./RealVariantCell.vue";

// chip graph with colour variants (error/success) so buildVariantCells yields cells
function chipColorGraph() {
  const global = {
    chip: {
      bg: { $value: "#E4E4E7", $type: "color" },
      "bg-error": { $value: "#FECACA", $type: "color" },
      "bg-success": { $value: "#BBF7D0", $type: "color" },
    },
  };
  return buildGraph([{ name: "global", data: global }]);
}

describe("LiveRealChip — colour cells", () => {
  it("renders a RealVariantCell per colour variant", () => {
    const w = mount(LiveRealChip, { props: { graph: chipColorGraph(), customParts: parts } });
    expect(w.findAllComponents(RealVariantCell).length).toBeGreaterThanOrEqual(2); // error + success
  });
});
```

(`parts` and `buildGraph` are already imported/defined in this test file from the v0.37.0 tests; reuse them.)

- [ ] **Step 2: Run to verify it FAILS**

Run: `npx vitest run src/app/components/LiveRealChip.test.ts -t "colour cells"`
Expected: FAIL — no `RealVariantCell` rendered.

- [ ] **Step 3: Implement** — `src/app/components/LiveRealChip.vue`

Add two imports to the `<script setup>` (alongside the existing ones):

```ts
import { buildVariantCells } from "../composables/use-render-diff.js";
import RealVariantCell from "./RealVariantCell.vue";
```

Add the computed (after the existing `build` computed):

```ts
const variantCells = computed(() => (recipe.value ? buildVariantCells(recipe.value) : []));
```

In the template, inside the `<template v-else>` block, after the existing `RenderDeltaTable` loop, add the variant cells (chip is custom — no Nuxt variant prop, so do NOT bind `cell.props`; the composed `cell.ui` carries the colour):

```vue
      <RealVariantCell
        v-for="cell in variantCells"
        :key="cell.axis + cell.key"
        :label="`${cell.axis}: ${cell.key}`"
        :specs="cell.specs"
      >
        <span :class="cell.ui.base">
          <span :class="cell.ui.label">Chip</span>
          <span :class="cell.ui.close">×</span>
        </span>
      </RealVariantCell>
```

- [ ] **Step 4: Run the test file**

Run: `npx vitest run src/app/components/LiveRealChip.test.ts`
Expected: PASS — existing chip tests + the new colour-cells test.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test`
Expected: all pass (867 prior + Task1 2 + Task2 1 + Task3 1 + Task4 1 = 872).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/LiveRealChip.vue src/app/components/LiveRealChip.test.ts
git commit -m "feat(fidelity): per-colour-variant diffs for the custom chip"
```

---

### Task 5: Browser verification

The unit tests prove wiring only (jsdom has no `getComputedStyle`). Verify the real per-variant render + diff in a browser.

**Files:** none (manual; tweak only if something fails to render).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` and note the URL.

- [ ] **Step 2: Verify button + chip via `/browse`**

Open the app, load `assets/tokens-20260615-161948.zip`, then:
- **button** → Real tab: confirm the resting diff plus one labeled block per variant (`variant: solid`, `variant: ghost`, `variant: outline`, `variant: link`); each block's `<button>` is in that real variant; per-slot diffs populate; no unresolved elements; inspector chrome unaffected (v0.36.1 dark-leak fix holds).
- **chip** → Real tab: confirm the resting diff plus a `color: error` / `color: success` block, each with per-slot diffs.

- [ ] **Step 3: Record the verdict**

Note the per-variant diff headlines (for the release notes). If a variant block renders blank or errors, adjust the anatomy/props and re-verify; re-run that component's test after any edit.

---

### Task 6: Release v0.38.0

Follow the established release flow (matches v0.37.0).

- [ ] **Step 1: Bump version** — `npm version 0.38.0 --no-git-tag-version`.

- [ ] **Step 2: CHANGELOG entry** — add a linked `## [0.38.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.38.0) — <date>` section: "Real-tab v2 Phase A — the Real tab now diffs each `variant`/`color` key per slot (not just resting), rendering the real component in that variant via `buildVariantCells` + a shared `RealVariantCell`. Live for button (variant) and chip (color). badge/generic + settable-states (Phase B) + pseudo-classes (Phase C, CDP-blocked) deferred." Include the verified per-variant headlines from Task 5.

- [ ] **Step 3: README** — bump the test count to the new total (872, or whatever `npm test` reports) and note the Real tab now covers variants for button/chip.

- [ ] **Step 4: Commit the release on the feat branch**

```bash
git add CHANGELOG.md README.md package.json package-lock.json
git commit -m "chore(release): v0.38.0 — Real-tab variant + colour diffs (Phase A)"
```

- [ ] **Step 5: Merge to main, tag, push, GitHub release**

```bash
git checkout main
git merge --no-ff feat/real-render-variants -m "Merge feat/real-render-variants: Real-tab variant + colour diffs (v0.38.0)"
git tag v0.38.0 <release-commit-sha>   # the chore(release) commit, per convention
```
Push + GitHub release via the repo-owner account (see memory "push-needs-clawdbot-account"):
```bash
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.38.0
gh release create v0.38.0 --title "v0.38.0 — Real-tab variant + colour diffs (Phase A)" --notes-file <notes> --verify-tag
gh auth switch --user d56de
```
Verify the v0.38.0 release link resolves (HTTP 200) in the browser.

---

## Self-Review

**Spec coverage:**
- variant + color diffs, per slot, with the real variant prop → Task 1 (`buildVariantCells` composes + `props {[axis]:key}`) + Tasks 3-4 (render with prop). ✓
- shared `buildVariantCells` (data-driven, no per-component config) → Task 1. ✓
- shared `RealVariantCell` (host + useRealRender + labels, anatomy via scoped slot) → Task 2. ✓
- stacked labeled blocks per variant → Tasks 3-4 templates. ✓
- `LiveRealButton` refactored off the one-off representative variant → Task 3 (resting = base+size only). ✓
- size excluded; Phase B/C deferred → not implemented (documented). ✓
- testing: buildVariantCells unit + RealVariantCell mount + component mount + browser → Tasks 1-5. ✓
- **Gap vs spec:** the spec named badge among the color-axis components; this plan defers badge/`LiveRealSlotted` (generic literal-tag chain needs a unified-cell refactor) to Phase A.1. Documented in the Scope note; flag to the user.

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. (Task 6 tag/notes use `<release-commit-sha>`/`<notes>`/`<date>` — release-time values, consistent with prior release tasks.)

**Type consistency:** `VariantCell` (`axis`/`key`/`ui`/`specs`/`props`) defined in Task 1, consumed in Tasks 2-4; `specs: SentinelBuild["specs"]` matches `useRealRender`'s `specsFn` param type; `buildVariantCells`/`RealVariantCell` names consistent across tasks; `ComponentRecipe` imported from `@core/recipe-engine.js` (the path the app already uses).
