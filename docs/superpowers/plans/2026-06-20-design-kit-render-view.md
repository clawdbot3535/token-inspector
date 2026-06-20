# Design-Kit Render View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the Preview/Real tab split into a single trustworthy "Kit" view — the real Nuxt UI v4 component themed by the exported tokens, with the diagnostic deltas demoted to a collapsible toggle, a per-component coverage badge, and the hand-built approximation retired.

**Architecture:** Reuse the existing real-render components (`LiveReal*.vue` + `RealVariantCell` + `use-render-diff`) as-is — this is a presentation change, not a new render engine. A new `LiveKitPanel.vue` becomes the single per-component entry: it dispatches to the existing `LiveReal*.vue`, shows a coverage badge, owns a "Diagnose" toggle (a `showDiagnostics` flag threaded into the children to gate their delta tables), and shows a "Real-Render folgt" placeholder for `modal`/`dropdown` (the only two components without a real render). `App.vue`'s tabs collapse `preview|coverage|real` → `kit|coverage`. The `Live*.vue` approximations are deleted.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest + `@vue/test-utils` (jsdom). NOTE: computed-style render fidelity is NOT unit-testable (jsdom returns empty `getComputedStyle` — see `use-render-diff.ts` line 4 "real verdict is /browse"); tests assert **structure** (which child renders, badge text, toggle wiring, prop forwarding), and visual fidelity is verified by headless `/browse` QA after Task 5.

---

## File Structure

- **Create `src/app/components/LiveKitPanel.vue`** — single per-component kit panel: header + coverage badge, real-render dispatch (reusing `LiveReal*.vue`), `showDiagnostics` toggle, modal/dropdown placeholder. One responsibility: present one component's real render as a kit panel.
- **Create `src/app/components/LiveKitPanel.test.ts`** — mount tests for dispatch, placeholder, coverage badge, toggle.
- **Modify `src/app/components/RealVariantCell.vue`** — add `showDiagnostics` prop (default false), gate the delta table.
- **Modify `src/app/components/RealVariantCell.test.ts`** — gating tests.
- **Modify the 7 `LiveReal*.vue`** (`LiveRealButton`, `LiveRealTable`, `LiveRealNav`, `LiveRealAccordion`, `LiveRealChip`, `LiveRealSidebar`, `LiveRealSlotted`) — accept `showDiagnostics` (default false), gate the resting delta table, forward to each `RealVariantCell`.
- **Modify `src/app/components/LiveRealButton.test.ts`** — gating tests (canonical example for the 7).
- **Modify `src/app/App.vue`** — `paneTab` → `"kit"|"coverage"`; tab buttons → Kit|Coverage; render `LiveKitPanel`; remove the Preview + Real dispatch blocks and all `Live*`/`LiveReal*` imports; drop now-unused `realRenderSupported`/`FIELD_PREVIEW_COMPONENTS`/`isFieldComponent`.
- **Modify the `App.*.test.ts` family** — update `paneTab` references `"preview"/"real"` → `"kit"`; remove `App.preview-routing.test.ts` (it guards the deleted Preview dispatch).
- **Delete the 16 `Live*.vue` approximations** (`LiveButton`, `LiveBadge`, `LiveInput`, `LiveSwitch`, `LiveCheckbox`, `LiveRadio`, `LiveCard`, `LiveKbd`, `LiveProgress`, `LiveModal`, `LiveTable`, `LiveDropdown`, `LiveAccordion`, `LiveNav`, `LiveSidebar`, `LiveChip`) **+ their `*.test.ts`**, then grep-prune verified orphans.

**Reused unchanged:** `use-render-diff.ts`, `render-diff.ts`, `real-slotted-registry.ts`, `extract-arbitrary.ts`, `project-to-state.ts` (the real path still uses `extractArbitrary` in `computeRenderDiff` and `projectToState` in `buildStateCells` — do NOT delete these), `CoverageView.vue`, `coverage.ts`, the recipe engine.

---

### Task 1: `RealVariantCell` — `showDiagnostics` gates the delta table

**Files:**
- Modify: `src/app/components/RealVariantCell.vue`
- Test: `src/app/components/RealVariantCell.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `src/app/components/RealVariantCell.test.ts`:

```ts
import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import RealVariantCell from "./RealVariantCell.vue";

const SPECS = [{ slot: "base", selector: ".ti-slot-base", classes: "bg-[#ffffff]" }];

describe("RealVariantCell — diagnostics gating", () => {
  it("hides the delta section by default", () => {
    const w = mount(RealVariantCell, {
      props: { label: "solid", specs: SPECS },
      slots: { default: "<button>x</button>" },
    });
    expect(w.find('[data-testid="rvc-diagnostics"]').exists()).toBe(false);
  });

  it("shows the delta section when showDiagnostics is true", () => {
    const w = mount(RealVariantCell, {
      props: { label: "solid", specs: SPECS, showDiagnostics: true },
      slots: { default: "<button>x</button>" },
    });
    expect(w.find('[data-testid="rvc-diagnostics"]').exists()).toBe(true);
  });
});
```
(If the file already imports `mount`/`describe`/`it`/`expect`/`RealVariantCell`, do not duplicate the imports — only add the `describe` block.)

- [ ] **Step 2: Run it to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/app/components/RealVariantCell.test.ts -t "diagnostics gating"`
Expected: FAIL — `[data-testid="rvc-diagnostics"]` does not exist yet (and `showDiagnostics` prop is unknown).

- [ ] **Step 3: Implement.** Replace the full content of `src/app/components/RealVariantCell.vue` with:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useRealRender, type SentinelBuild } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = withDefaults(
  defineProps<{ label: string; specs: SentinelBuild["specs"]; showDiagnostics?: boolean }>(),
  { showDiagnostics: false },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => props.specs);
</script>

<template>
  <div class="mt-3" data-testid="real-variant-cell">
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{{ label }}</div>
    <div ref="hostRef"><slot /></div>
    <div v-if="showDiagnostics" data-testid="rvc-diagnostics">
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/app/components/RealVariantCell.test.ts`
Expected: PASS (new gating tests + any pre-existing RealVariantCell tests still green).

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/components/RealVariantCell.vue src/app/components/RealVariantCell.test.ts
git commit -m "feat(kit): RealVariantCell showDiagnostics gates the delta table"
```

---

### Task 2: Thread `showDiagnostics` through the 7 `LiveReal*.vue`

**Files:**
- Modify: `src/app/components/LiveRealButton.vue` (canonical example, full below)
- Modify: `src/app/components/LiveRealTable.vue`, `LiveRealNav.vue`, `LiveRealAccordion.vue`, `LiveRealChip.vue`, `LiveRealSidebar.vue`, `LiveRealSlotted.vue` (same transformation)
- Test: `src/app/components/LiveRealButton.test.ts`

**Transformation rule (apply to all 7 files — read each first):**
1. Change `defineProps` to add an optional `showDiagnostics?: boolean` defaulted to `false` via `withDefaults`, keeping every existing prop (chip/sidebar also keep `customParts`).
2. Wrap the **resting** `<RenderDeltaTable :deltas="deltas" />` in `<div v-if="showDiagnostics" data-testid="resting-diagnostics">…</div>`.
3. Add `:show-diagnostics="showDiagnostics"` to **every** `<RealVariantCell …>` in the template.

- [ ] **Step 1: Write the failing test.** Append to `src/app/components/LiveRealButton.test.ts` (it already imports `mount`, `RealVariantCell`, and defines `variantButtonGraph` + `mountOpts`):

```ts
describe("LiveRealButton — diagnostics gating", () => {
  it("hides resting diagnostics and forwards showDiagnostics=false by default", () => {
    const w = mount(LiveRealButton, {
      props: { graph: variantButtonGraph(), componentName: "button" },
      ...mountOpts,
    });
    expect(w.find('[data-testid="resting-diagnostics"]').exists()).toBe(false);
    for (const c of w.findAllComponents(RealVariantCell)) {
      expect(c.props("showDiagnostics")).toBe(false);
    }
  });

  it("shows resting diagnostics and forwards showDiagnostics=true when enabled", () => {
    const w = mount(LiveRealButton, {
      props: { graph: variantButtonGraph(), componentName: "button", showDiagnostics: true },
      ...mountOpts,
    });
    expect(w.find('[data-testid="resting-diagnostics"]').exists()).toBe(true);
    for (const c of w.findAllComponents(RealVariantCell)) {
      expect(c.props("showDiagnostics")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/LiveRealButton.test.ts -t "diagnostics gating"`
Expected: FAIL — no `resting-diagnostics` wrapper; `showDiagnostics` prop unknown.

- [ ] **Step 3: Implement on `LiveRealButton.vue` (canonical).** Apply the rule. The result:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe, representativeSizeClasses } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";
import { computeRenderDiff, buildVariantCells, buildStateCells } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";
import RealVariantCell from "./RealVariantCell.vue";
import type { RenderDelta } from "../render-diff.js";

const props = withDefaults(
  defineProps<{ graph: TokenGraph | null; componentName: string; showDiagnostics?: boolean }>(),
  { showDiagnostics: false },
);
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

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
const stateCells = computed(() => (recipe.value ? buildStateCells(recipe.value, props.componentName) : []));

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
      <p class="mt-2 text-[10px] text-muted">Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).</p>
      <div v-if="showDiagnostics" data-testid="resting-diagnostics">
        <RenderDeltaTable :deltas="deltas" />
      </div>

      <RealVariantCell v-for="cell in variantCells" :key="cell.axis + ':' + cell.key"
        :label="`${cell.axis}: ${cell.key}`" :specs="cell.specs" :show-diagnostics="showDiagnostics">
        <UButton v-bind="cell.props" :ui="cell.ui" size="md">Button</UButton>
      </RealVariantCell>

      <RealVariantCell v-for="cell in stateCells" :key="cell.state"
        :label="cell.state" :specs="cell.specs" :show-diagnostics="showDiagnostics">
        <UButton v-bind="cell.props" :ui="cell.ui" size="md">Button</UButton>
      </RealVariantCell>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Apply the SAME rule to the other 6 files.** Read each, then: (a) wrap `defineProps` in `withDefaults(defineProps<{ …existing props…; showDiagnostics?: boolean }>(), { showDiagnostics: false })`; (b) wrap its resting `<RenderDeltaTable :deltas="…"/>` (if present) in `<div v-if="showDiagnostics" data-testid="resting-diagnostics">…</div>`; (c) add `:show-diagnostics="showDiagnostics"` to every `<RealVariantCell>`. Files: `LiveRealTable.vue`, `LiveRealNav.vue`, `LiveRealAccordion.vue`, `LiveRealChip.vue`, `LiveRealSidebar.vue`, `LiveRealSlotted.vue`. (If a file has no resting `RenderDeltaTable`, skip (b) for it.)

- [ ] **Step 5: Run to verify pass + full suite.**
Run: `npx vitest run src/app/components/LiveRealButton.test.ts && npx vitest run`
Expected: gating tests PASS; whole suite green (the other 6 edits are prop-additive and must not break existing tests).

- [ ] **Step 6: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/components/LiveReal*.vue src/app/components/LiveRealButton.test.ts
git commit -m "feat(kit): thread showDiagnostics through LiveReal* (gate resting + cell deltas)"
```

---

### Task 3: `LiveKitPanel.vue` — single kit entry (dispatch + coverage badge + toggle + placeholder)

**Files:**
- Create: `src/app/components/LiveKitPanel.vue`
- Test: `src/app/components/LiveKitPanel.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/app/components/LiveKitPanel.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveKitPanel from "./LiveKitPanel.vue";
import LiveRealButton from "./LiveRealButton.vue";

function buttonGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { button: { radius: { $value: 8, $type: "number" }, bg: { $value: "#3b82f6", $type: "color" } } } },
  ];
  return buildGraph(sources);
}

const STUBS = {
  LiveRealButton: true, LiveRealTable: true, LiveRealNav: true,
  LiveRealAccordion: true, LiveRealChip: true, LiveRealSidebar: true, LiveRealSlotted: true,
};

describe("LiveKitPanel", () => {
  it("renders the real-render child for a supported component (no placeholder)", () => {
    const w = mount(LiveKitPanel, { props: { graph: buttonGraph(), componentName: "button" }, global: { stubs: STUBS } });
    expect(w.find('[data-testid="kit-placeholder"]').exists()).toBe(false);
    expect(w.findComponent(LiveRealButton).exists()).toBe(true);
  });

  it("shows the Real-Render-folgt placeholder for modal and dropdown", () => {
    for (const name of ["modal", "dropdown"]) {
      const w = mount(LiveKitPanel, { props: { graph: buttonGraph(), componentName: name }, global: { stubs: STUBS } });
      expect(w.find('[data-testid="kit-placeholder"]').exists()).toBe(true);
    }
  });

  it("renders a coverage badge with an X/Y figure", () => {
    const w = mount(LiveKitPanel, { props: { graph: buttonGraph(), componentName: "button" }, global: { stubs: STUBS } });
    const badge = w.find('[data-testid="kit-coverage-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toMatch(/\d+\/\d+/);
  });

  it("defaults diagnostics off and toggles showDiagnostics on the child", async () => {
    const w = mount(LiveKitPanel, { props: { graph: buttonGraph(), componentName: "button" }, global: { stubs: STUBS } });
    const child = w.findComponent(LiveRealButton);
    expect(child.props("showDiagnostics")).toBe(false);
    await w.find('[data-testid="kit-diagnose-toggle"]').trigger("click");
    expect(child.props("showDiagnostics")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/LiveKitPanel.test.ts`
Expected: FAIL — `LiveKitPanel.vue` does not exist.

- [ ] **Step 3: Implement.** Create `src/app/components/LiveKitPanel.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { coverageFor } from "@core/coverage.js";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";
import LiveRealButton from "./LiveRealButton.vue";
import LiveRealTable from "./LiveRealTable.vue";
import LiveRealNav from "./LiveRealNav.vue";
import LiveRealAccordion from "./LiveRealAccordion.vue";
import LiveRealChip from "./LiveRealChip.vue";
import LiveRealSidebar from "./LiveRealSidebar.vue";
import LiveRealSlotted from "./LiveRealSlotted.vue";

const props = defineProps<{
  graph: TokenGraph | null;
  componentName: string;
  customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
}>();

const showDiagnostics = ref(false);

const BESPOKE = ["button", "table", "nav", "accordion", "chip", "sidebar"];
const hasRealRender = computed(
  () => BESPOKE.includes(props.componentName) || props.componentName in REAL_SLOTTED_REGISTRY,
);

const coverage = computed(() => (props.graph ? coverageFor(props.graph, props.componentName) : null));
</script>

<template>
  <div class="p-4" data-testid="kit-panel">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-semibold">{{ componentName }}</h2>
      <span v-if="coverage" data-testid="kit-coverage-badge"
        class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {{ coverage.structuralTouched }}/{{ coverage.structuralTotal }} gemappt
      </span>
    </div>

    <div v-if="!hasRealRender" data-testid="kit-placeholder"
      class="text-xs text-muted border border-dashed border-default rounded p-6 text-center">
      Real-Render folgt — {{ componentName }} ist eine Overlay-Komponente und bekommt im nächsten Schritt einen echten Inline-Render.
    </div>
    <template v-else>
      <LiveRealButton v-if="componentName === 'button'" :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
      <LiveRealTable v-else-if="componentName === 'table'" :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
      <LiveRealNav v-else-if="componentName === 'nav'" :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
      <LiveRealAccordion v-else-if="componentName === 'accordion'" :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
      <LiveRealChip v-else-if="componentName === 'chip'" :graph="graph" :component-name="componentName" :custom-parts="customParts" :show-diagnostics="showDiagnostics" />
      <LiveRealSidebar v-else-if="componentName === 'sidebar'" :graph="graph" :component-name="componentName" :custom-parts="customParts" :show-diagnostics="showDiagnostics" />
      <LiveRealSlotted v-else :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
    </template>

    <button v-if="hasRealRender" type="button" data-testid="kit-diagnose-toggle"
      class="mt-3 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      :aria-expanded="showDiagnostics"
      @click="showDiagnostics = !showDiagnostics">
      {{ showDiagnostics ? "▾ Diagnose ausblenden" : "▸ Diagnose / Abweichungen" }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/app/components/LiveKitPanel.test.ts`
Expected: PASS (4 tests). If the coverage-badge test fails because `coverageFor(buttonGraph(), "button")` returns `null`, the minimal fixture lacks anatomy — enrich `buttonGraph` with another `button` slot token (e.g. add `text: { $value: "#111111", $type: "color" }`) until `coverageFor` returns a non-null `ComponentCoverage`; do NOT weaken the assertion.

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/components/LiveKitPanel.vue src/app/components/LiveKitPanel.test.ts
git commit -m "feat(kit): LiveKitPanel — single real-render entry + coverage badge + diagnose toggle"
```

---

### Task 4: `App.vue` — collapse tabs to `kit | coverage`, render `LiveKitPanel`

**Files:**
- Modify: `src/app/App.vue`
- Test: `src/app/App.view-state.test.ts`, `src/app/App.output-tabs.test.ts`, remove `src/app/App.preview-routing.test.ts`

- [ ] **Step 1: Update the IA mount test first (RED).** In `src/app/App.view-state.test.ts`, find every assertion/selector referencing `paneTab` values or testids `"preview-tab"`/`"real-tab"` and the default `"preview"`; change them to the new world. Add (or adapt an existing) test asserting:

```ts
it("defaults the component pane to the Kit tab and renders LiveKitPanel", async () => {
  const w = await mountLoaded();
  // select a component (reuse this file's existing component-selection helper / click)
  // ...trigger selecting a component group that maps to a previewable component...
  expect(w.find('[data-testid="kit-tab"]').exists()).toBe(true);
  expect(w.find('[data-testid="real-tab"]').exists()).toBe(false);
  expect(w.find('[data-testid="preview-tab"]').exists()).toBe(false);
  expect(w.findComponent({ name: "LiveKitPanel" }).exists()).toBe(true);
});
```
(Use this file's existing `mountLoaded`/selection helpers; do not invent new infrastructure. If the file stubs child components, add `LiveKitPanel` to the stub list or assert via `[data-testid="kit-panel"]`.)

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/App.view-state.test.ts`
Expected: FAIL — `kit-tab` testid absent; `LiveKitPanel` not rendered yet.

- [ ] **Step 3: Edit `App.vue` — script.**
  1. Add import: `import LiveKitPanel from "./components/LiveKitPanel.vue";`
  2. Remove all `Live*` and `LiveReal*` component imports (the full block listed in File Structure — `LiveButton … LiveChip` and `LiveRealButton … LiveRealSidebar`). `REAL_SLOTTED_REGISTRY` is still imported if used elsewhere; if its only remaining use was the removed `realRenderSupported`, remove that import too (verify with grep in Step 6).
  3. Change `const paneTab = ref<"preview" | "coverage" | "real">("preview");` → `const paneTab = ref<"kit" | "coverage">("kit");`
  4. In the `watch(selectedComponent, …)` reset, change `paneTab.value = "preview";` → `paneTab.value = "kit";`
  5. Delete the `realRenderSupported` computed, and the `FIELD_PREVIEW_COMPONENTS` set + `isFieldComponent` computed (they were only used by the Preview/Real templates). Keep `COMPONENTS_WITH_PREVIEW` + `previewSupported` (still used by tree routing / `previewComponentForGroup`).

- [ ] **Step 4: Edit `App.vue` — template.**
  1. Replace the three-button tablist (the `<div v-if="coverage || realRenderSupported" role="tablist" …>` block) with:

```html
<div v-if="previewSupported" role="tablist" class="flex gap-1 border-b border-default" data-testid="coverage-tabs">
  <button type="button" role="tab" data-testid="kit-tab"
    :aria-selected="paneTab === 'kit'"
    class="px-3 py-1 text-xs"
    :class="paneTab === 'kit' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
    @click="paneTab = 'kit'"
  >Kit</button>
  <button v-if="coverage" type="button" role="tab" data-testid="coverage-tab"
    :aria-selected="paneTab === 'coverage'"
    class="px-3 py-1 text-xs inline-flex items-center gap-1"
    :class="paneTab === 'coverage' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
    @click="paneTab = 'coverage'"
  >
    Coverage
    <span v-if="coverage.structuralTotal - coverage.structuralTouched > 0"
      class="text-[10px] font-mono px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
    >{{ coverage.structuralTotal - coverage.structuralTouched }}</span>
  </button>
</div>
```
  2. Delete the entire Real-tab dispatch block (`<template v-if="realRenderSupported && paneTab === 'real'">…</template>`).
  3. Replace the entire Preview-tab dispatch block (`<template v-if="(!coverage || paneTab === 'preview') && paneTab !== 'real'">…</template>`) with:

```html
<template v-if="previewSupported && paneTab === 'kit'">
  <LiveKitPanel :graph="state.graph.value" :component-name="selectedComponent" :custom-parts="customParts" />
</template>
```
  4. Leave the existing `paneTab === 'coverage'` → `CoverageView` block unchanged.

- [ ] **Step 5: Remove the obsolete routing test.** `App.preview-routing.test.ts` guarded the now-deleted Preview/Real dispatch chains. Delete it:
```bash
git rm src/app/App.preview-routing.test.ts
```
Then scan `App.output-tabs.test.ts` and any other `App.*.test.ts` for `paneTab`/`"preview"`/`"real"`/`preview-tab`/`real-tab` references and update them to `kit`/`kit-tab` (output-tab tests for `tokens.css`/`app.config.ts`/`custom-components.ts` are a different tab system — leave those untouched).

- [ ] **Step 6: Run the App suite + grep for orphaned symbols.**
Run: `npx vitest run src/app/ && npm run typecheck`
Expected: PASS; typecheck clean (no unused `realRenderSupported`/`isFieldComponent`/`FIELD_PREVIEW_COMPONENTS`/removed imports — typecheck flags unused locals in `.vue` script setup; fix any it reports).
Also run: `grep -rn "LiveButton\|LiveRealButton\|realRenderSupported\|isFieldComponent" src/app/App.vue` — expect **no matches** (all gone from App.vue).

- [ ] **Step 7: Commit.**
```bash
git add src/app/App.vue src/app/App.view-state.test.ts src/app/App.output-tabs.test.ts
git commit -m "feat(kit): App.vue tabs kit|coverage, render LiveKitPanel, drop preview/real dispatch"
```

---

### Task 5: Retire the `Live*.vue` approximations

**Files:**
- Delete: 16 `Live*.vue` + their `*.test.ts` (see list)
- Modify: prune verified orphan helpers only

- [ ] **Step 1: Confirm nothing references the approximations.**
Run: `grep -rln "LiveButton\|LiveBadge\|LiveInput\|LiveSwitch\|LiveCheckbox\|LiveRadio\|LiveCard\|LiveKbd\|LiveProgress\|LiveModal\|LiveTable\|LiveDropdown\|LiveAccordion\|LiveNav\|LiveSidebar\|LiveChip" src --include=*.vue --include=*.ts | grep -v "LiveReal" | grep -v "/components/Live\(Button\|Badge\|Input\|Switch\|Checkbox\|Radio\|Card\|Kbd\|Progress\|Modal\|Table\|Dropdown\|Accordion\|Nav\|Sidebar\|Chip\)\.\(vue\|test\.ts\)"`
Expected: no matches outside the files being deleted themselves. (`LiveReal*` are excluded — they stay.) If a match appears, resolve that reference before deleting.

- [ ] **Step 2: Delete the approximation files + their tests.**
```bash
cd /Users/christian/Dev/token-inspector
git rm src/app/components/LiveButton.vue src/app/components/LiveBadge.vue src/app/components/LiveInput.vue \
  src/app/components/LiveSwitch.vue src/app/components/LiveCheckbox.vue src/app/components/LiveRadio.vue \
  src/app/components/LiveCard.vue src/app/components/LiveKbd.vue src/app/components/LiveProgress.vue \
  src/app/components/LiveModal.vue src/app/components/LiveTable.vue src/app/components/LiveDropdown.vue \
  src/app/components/LiveAccordion.vue src/app/components/LiveNav.vue src/app/components/LiveSidebar.vue \
  src/app/components/LiveChip.vue
# remove the matching test files that exist (ignore "did not match" for any that don't):
git rm src/app/components/LiveCard.test.ts src/app/components/LiveKbd.test.ts src/app/components/LiveProgress.test.ts \
  src/app/components/LiveModal.test.ts src/app/components/LiveTable.test.ts src/app/components/LiveDropdown.test.ts \
  src/app/components/LiveAccordion.test.ts src/app/components/LiveNav.test.ts src/app/components/LiveSidebar.test.ts \
  src/app/components/LiveChip.test.ts 2>/dev/null; true
```
Then list any remaining `Live*.test.ts` that import a deleted file and `git rm` them too: `grep -rln "from \"./Live\(Button\|Badge\|Input\|Switch\|Checkbox\|Radio\|Card\|Kbd\|Progress\|Modal\|Table\|Dropdown\|Accordion\|Nav\|Sidebar\|Chip\).vue\"" src/app/components` → delete each match.

- [ ] **Step 3: Prune verified-orphan helpers (grep-gated — delete ONLY if zero references remain).**
For each candidate symbol, grep before removing. **Keep** anything still referenced by the real path.
```bash
grep -rn "PREVIEW_STATES" src        # if only defined in project-to-state.ts with no other refs → remove that export
grep -rn "use-preview-recipe" src    # usePreviewRecipe/representativeSizeClasses are used by LiveReal* → KEEP
grep -rn "extractArbitrary\|SCALE_TO_CSS\|ARBITRARY_TO_CSS" src  # used by computeRenderDiff probe → KEEP
grep -rn "projectToState" src        # used by buildStateCells → KEEP
```
Remove only exports with zero remaining references (most likely just `PREVIEW_STATES` and any preview-only helper). Do not touch shared helpers.

- [ ] **Step 4: Full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all green; typecheck clean. Fix any test that still imported a deleted component.

- [ ] **Step 5: Commit.**
```bash
git add -A
git commit -m "refactor(kit): retire Live* approximation render path"
```

---

## After all tasks — manual fidelity QA (not unit-testable)

Computed-style fidelity cannot be asserted in jsdom. After Task 5, verify the real render visually with the live export via the **/browse** skill (gstack headless browser): load `assets/tokens-20260619-214856.zip` (or the latest export), select each component, confirm the Kit panel renders the real Nuxt UI component, the coverage badge shows, the Diagnose toggle reveals/hides deltas, and modal/dropdown show the "Real-Render folgt" placeholder. Note any component whose render looks wrong (a genuine fidelity gap to log, not a tooling artifact).

## Self-review checklist (run before handoff)
- README test-count line: update if the harness reports a changed total after Tasks 1–5 (net: +RealVariantCell/LiveKitPanel/LiveRealButton tests, −deleted Live* tests).
- Confirm `App.vue` has zero `Live*`/`LiveReal*`/`realRenderSupported` references (Task 4 Step 6 grep).
- Confirm `extract-arbitrary.ts` / `project-to-state.ts` core exports survived (still used by the real path).

## Out of scope (parked — do NOT build here)
Q (generated runnable Nuxt kit), Y (deviation decision-routing into Figma/heuristic/dev), Figma side-by-side, acceptance checklist, "finished" marker, whole-kit single-page overview, real inline-open render for modal/dropdown. See the spec's "Future rounds".
