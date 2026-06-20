# Kit UI/UX — Deviation Explainer + Matrix Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Kit area trustworthy + scannable: inline `ⓘ` notes that explain *correct* Nuxt behavior vs. a real recipe gap (B), a per-component "Known Nuxt behaviors" reference panel, and variant/state cells laid out as labeled axis-rows instead of a vertical stack (A).

**Architecture:** A pure data module `kit-behaviors.ts` (curated catalog + a bridge reusing the existing capability-deviation `ScanIssue`s) feeds inline notes. A shared `KitMatrix.vue` lays cells out as Variants/Colors/States rows and renders each via a scoped slot, reusing `RealVariantCell` (extended with a `notes` prop) per cell. The 7 `LiveReal*.vue` swap their `RealVariantCell` loops for `<KitMatrix>`. A b3 panel in `LiveKitPanel` lists the catalog.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest + `@vue/test-utils` (jsdom). Render fidelity is `/browse`-verified, not jsdom; tests assert structure + note presence.

---

## File Structure
- **Create `src/app/kit-behaviors.ts`** — `KitNote`, `KIT_BEHAVIORS` (seed button outline/link), `behaviorsFor`, `allBehaviorsFor`, `scannerNotesFor`. Pure, no Vue.
- **Create `src/app/kit-behaviors.test.ts`** — unit tests.
- **Modify `src/app/components/RealVariantCell.vue`** — add a `notes?: readonly KitNote[]` prop + inline `ⓘ` render.
- **Modify `src/app/components/RealVariantCell.test.ts`** — note-render tests.
- **Create `src/app/components/KitMatrix.vue`** — axis-row layout + per-cell notes, reusing RealVariantCell via a scoped slot.
- **Create `src/app/components/KitMatrix.test.ts`** — mount tests.
- **Modify the 7 `LiveReal*.vue`** — replace the `RealVariantCell` loops with `<KitMatrix>` + `#cell`.
- **Modify `src/app/components/LiveKitPanel.vue`** — add the b3 "Known Nuxt behaviors" panel.
- **Modify `src/app/components/LiveKitPanel.test.ts`** — b3 panel test.

Verified shapes: `ScanIssue` from `@core/token-graph.js` (`{ kind, componentName?, tokenIds, message, severity, … }`); `scanGraph(graph, ScanOptions): ScanReport` from `@core/scanner.js` (`.issues`); capability-deviation kinds = `disabled-via-opacity`/`resting-shadowed-by-state`/`unsupported-state`/`state-via-prop`/`unsupported-part`; `disabled-via-opacity` always → state `disabled`. `VariantCell {axis:"variant"|"color", key, ui, specs, props}`; `StateCell {state:"disabled"|"checked"|"open", ui, specs, props}`.

---

### Task 1: `kit-behaviors.ts` — catalog + lookup + scanner bridge

**Files:**
- Create: `src/app/kit-behaviors.ts`
- Test: `src/app/kit-behaviors.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/app/kit-behaviors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import { behaviorsFor, allBehaviorsFor, scannerNotesFor } from "./kit-behaviors.js";

describe("behaviorsFor", () => {
  it("returns the seeded notes for button outline + link", () => {
    expect(behaviorsFor("button", { variant: "outline" }).length).toBe(1);
    expect(behaviorsFor("button", { variant: "link" })[0]!.text.toLowerCase()).toContain("hover");
  });
  it("returns [] for an unknown component/variant/state", () => {
    expect(behaviorsFor("button", { variant: "solid" })).toEqual([]);
    expect(behaviorsFor("card", { state: "disabled" })).toEqual([]);
  });
});

describe("allBehaviorsFor", () => {
  it("flattens a component's catalog entries", () => {
    expect(allBehaviorsFor("button").length).toBe(2); // outline + link
    expect(allBehaviorsFor("card")).toEqual([]);
  });
});

function inputDisabledGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { input: { bg: { disabled: { $value: "#F4F4F5", $type: "color" } } } } },
  ];
  return buildGraph(sources);
}

describe("scannerNotesFor", () => {
  it("maps disabled-via-opacity to the disabled state + the catalog", () => {
    const r = scannerNotesFor("input", inputDisabledGraph());
    expect(r.all.length).toBeGreaterThanOrEqual(1);
    expect(r.all[0]!.kind).toBe("expected");
    expect(r.byState["disabled"]?.length).toBeGreaterThanOrEqual(1);
  });
  it("returns empty for a null graph", () => {
    expect(scannerNotesFor("input", null)).toEqual({ byState: {}, all: [] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/app/kit-behaviors.test.ts`
Expected: FAIL — `kit-behaviors.ts` does not exist.

- [ ] **Step 3: Implement.** Create `src/app/kit-behaviors.ts`:

```ts
import { scanGraph } from "@core/scanner.js";
import type { TokenGraph } from "@core/token-graph.js";

export interface KitNote {
  text: string;
  kind: "expected" | "gap";
}

/** Curated "expected Nuxt behavior" catalog, keyed by (component → variant|state).
 *  Seeded narrow for v1 (the confirmed cases); grows during joint component review. */
export const KIT_BEHAVIORS: Readonly<
  Record<string, { variants?: Record<string, readonly KitNote[]>; states?: Record<string, readonly KitNote[]> }>
> = {
  button: {
    variants: {
      outline: [{ text: "Nuxt adds an inset ring — expected; the recipe has no inset concept.", kind: "expected" }],
      link: [{ text: "Underline shows on hover only (Nuxt default).", kind: "expected" }],
    },
  },
};

export function behaviorsFor(component: string, sel: { variant?: string; state?: string }): readonly KitNote[] {
  const entry = KIT_BEHAVIORS[component];
  if (!entry) return [];
  const out: KitNote[] = [];
  if (sel.variant && entry.variants?.[sel.variant]) out.push(...entry.variants[sel.variant]!);
  if (sel.state && entry.states?.[sel.state]) out.push(...entry.states[sel.state]!);
  return out;
}

export function allBehaviorsFor(component: string): readonly KitNote[] {
  const entry = KIT_BEHAVIORS[component];
  if (!entry) return [];
  return [...Object.values(entry.variants ?? {}).flat(), ...Object.values(entry.states ?? {}).flat()];
}

const CAPABILITY_DEVIATION_KINDS: ReadonlySet<string> = new Set([
  "disabled-via-opacity",
  "resting-shadowed-by-state",
  "unsupported-state",
  "state-via-prop",
  "unsupported-part",
]);

/** Capability-deviation kinds whose affected state cell is deterministic. */
const KIND_TO_STATE: Readonly<Record<string, string>> = { "disabled-via-opacity": "disabled" };

export interface ScannerNotes {
  byState: Record<string, readonly KitNote[]>;
  all: readonly KitNote[];
}

/** Reuse the scanner's capability-deviation warnings for `component` as KitNotes.
 *  Self-contained: runs scanGraph for the component, no app-state threading. */
export function scannerNotesFor(component: string, graph: TokenGraph | null): ScannerNotes {
  if (!graph) return { byState: {}, all: [] };
  const issues = scanGraph(graph, { components: [component] }).issues.filter(
    (i) => i.componentName === component && CAPABILITY_DEVIATION_KINDS.has(i.kind),
  );
  const byState: Record<string, KitNote[]> = {};
  const all: KitNote[] = [];
  for (const issue of issues) {
    const note: KitNote = { text: issue.message, kind: "expected" };
    all.push(note);
    const state = KIND_TO_STATE[issue.kind];
    if (state) (byState[state] ??= []).push(note);
  }
  return { byState, all };
}
```

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/app/kit-behaviors.test.ts`
Expected: PASS. If `scannerNotesFor` test fails because the `inputDisabledGraph` fixture does not produce a `disabled-via-opacity` issue, fix the FIXTURE (the real `input-bg-disabled` token shape) until `scanGraph(graph, {components:["input"]})` yields that issue — do NOT weaken the assertion. (`input` ∈ the scanner's `OPACITY_DISABLED_COMPONENTS`; `input.bg.disabled` → token id `input-bg-disabled`.)

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/kit-behaviors.ts src/app/kit-behaviors.test.ts
git commit -m "feat(kit): kit-behaviors catalog + behaviorsFor + scannerNotesFor bridge"
```

---

### Task 2: `RealVariantCell` — `notes` prop renders an inline `ⓘ`

**Files:**
- Modify: `src/app/components/RealVariantCell.vue`
- Test: `src/app/components/RealVariantCell.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `src/app/components/RealVariantCell.test.ts`:

```ts
describe("RealVariantCell — notes", () => {
  it("renders an inline note when notes are present", () => {
    const w = mount(RealVariantCell, {
      props: { label: "outline", specs: [], notes: [{ text: "Nuxt adds an inset ring", kind: "expected" }] },
      slots: { default: "<button>x</button>" },
    });
    const note = w.find('[data-testid="rvc-note"]');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("inset ring");
  });
  it("renders no note element when notes is empty/absent", () => {
    const w = mount(RealVariantCell, { props: { label: "solid", specs: [] }, slots: { default: "<button>x</button>" } });
    expect(w.find('[data-testid="rvc-note"]').exists()).toBe(false);
  });
});
```
(`mount`/`RealVariantCell` are already imported in this file from the existing tests — do not duplicate.)

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/RealVariantCell.test.ts -t "notes"`
Expected: FAIL — `rvc-note` does not exist; `notes` prop unknown.

- [ ] **Step 3: Implement.** Replace the full content of `src/app/components/RealVariantCell.vue` with:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useRealRender, type SentinelBuild } from "../composables/use-render-diff.js";
import type { KitNote } from "../kit-behaviors.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = withDefaults(
  defineProps<{ label: string; specs: SentinelBuild["specs"]; showDiagnostics?: boolean; notes?: readonly KitNote[] }>(),
  { showDiagnostics: false, notes: () => [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => props.specs);
</script>

<template>
  <div class="mt-3" data-testid="real-variant-cell">
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{{ label }}</div>
    <div ref="hostRef"><slot /></div>
    <p v-if="notes.length" data-testid="rvc-note" class="mt-1 max-w-[14rem] text-[10px] text-zinc-500 leading-snug">
      <span v-for="(n, i) in notes" :key="i" class="block">ⓘ {{ n.text }}</span>
    </p>
    <div v-if="showDiagnostics" data-testid="rvc-diagnostics">
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/app/components/RealVariantCell.test.ts`
Expected: PASS (new note tests + existing gating tests).

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/components/RealVariantCell.vue src/app/components/RealVariantCell.test.ts
git commit -m "feat(kit): RealVariantCell renders an inline note when given notes"
```

---

### Task 3: `KitMatrix.vue` — axis-row layout + per-cell notes

**Files:**
- Create: `src/app/components/KitMatrix.vue`
- Test: `src/app/components/KitMatrix.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/app/components/KitMatrix.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import KitMatrix from "./KitMatrix.vue";

const variantCells = [
  { axis: "variant", key: "solid", ui: { base: "" }, specs: [], props: { variant: "solid" } },
  { axis: "variant", key: "outline", ui: { base: "" }, specs: [], props: { variant: "outline" } },
  { axis: "color", key: "primary", ui: { base: "" }, specs: [], props: { color: "primary" } },
];
const stateCells = [{ state: "disabled", ui: { base: "" }, specs: [], props: { disabled: true } }];

const slotTpl = { cell: '<button data-testid="cell-btn">x</button>' };

function inputDisabledGraph() {
  const sources: SourceFile[] = [
    { name: "global", data: { input: { bg: { disabled: { $value: "#F4F4F5", $type: "color" } } } } },
  ];
  return buildGraph(sources);
}

describe("KitMatrix", () => {
  it("renders Variants / Colors / States rows", () => {
    const w = mount(KitMatrix, {
      props: { componentName: "button", variantCells, stateCells, graph: null },
      slots: slotTpl,
    });
    expect(w.find('[data-testid="kit-row-variants"]').exists()).toBe(true);
    expect(w.find('[data-testid="kit-row-colors"]').exists()).toBe(true);
    expect(w.find('[data-testid="kit-row-states"]').exists()).toBe(true);
  });

  it("renders a catalog note on outline but not on solid", () => {
    const w = mount(KitMatrix, {
      props: { componentName: "button", variantCells, stateCells: [], graph: null },
      slots: slotTpl,
    });
    const cells = w.findAll('[data-testid="real-variant-cell"]');
    const solid = cells.find((c) => c.text().startsWith("solid"))!;
    const outline = cells.find((c) => c.text().startsWith("outline"))!;
    expect(solid.find('[data-testid="rvc-note"]').exists()).toBe(false);
    expect(outline.find('[data-testid="rvc-note"]').exists()).toBe(true);
  });

  it("renders a scanner note on the disabled state cell (disabled-via-opacity)", () => {
    const w = mount(KitMatrix, {
      props: { componentName: "input", variantCells: [], stateCells, graph: inputDisabledGraph() },
      slots: slotTpl,
    });
    const stateCell = w.find('[data-testid="kit-row-states"] [data-testid="real-variant-cell"]');
    expect(stateCell.find('[data-testid="rvc-note"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/KitMatrix.test.ts`
Expected: FAIL — `KitMatrix.vue` does not exist.

- [ ] **Step 3: Implement.** Create `src/app/components/KitMatrix.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import type { VariantCell, StateCell } from "../composables/use-render-diff.js";
import { behaviorsFor, scannerNotesFor, type KitNote } from "../kit-behaviors.js";
import RealVariantCell from "./RealVariantCell.vue";

const props = withDefaults(
  defineProps<{
    componentName: string;
    variantCells: VariantCell[];
    stateCells: StateCell[];
    graph: TokenGraph | null;
    showDiagnostics?: boolean;
  }>(),
  { showDiagnostics: false },
);

const scannerNotes = computed(() => scannerNotesFor(props.componentName, props.graph));
const variantAxisCells = computed(() => props.variantCells.filter((c) => c.axis === "variant"));
const colorAxisCells = computed(() => props.variantCells.filter((c) => c.axis === "color"));

function variantNotes(key: string): readonly KitNote[] {
  return behaviorsFor(props.componentName, { variant: key });
}
function stateNotes(state: string): readonly KitNote[] {
  return [...behaviorsFor(props.componentName, { state }), ...(scannerNotes.value.byState[state] ?? [])];
}
</script>

<template>
  <div data-testid="kit-matrix">
    <section v-if="variantAxisCells.length" data-testid="kit-row-variants">
      <h3 class="mt-4 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">Variants</h3>
      <div class="flex flex-wrap gap-4 items-start">
        <RealVariantCell v-for="cell in variantAxisCells" :key="cell.key"
          :label="cell.key" :specs="cell.specs" :show-diagnostics="showDiagnostics" :notes="variantNotes(cell.key)">
          <slot name="cell" :cell="cell" />
        </RealVariantCell>
      </div>
    </section>

    <section v-if="colorAxisCells.length" data-testid="kit-row-colors">
      <h3 class="mt-4 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">Colors</h3>
      <div class="flex flex-wrap gap-4 items-start">
        <RealVariantCell v-for="cell in colorAxisCells" :key="cell.key"
          :label="cell.key" :specs="cell.specs" :show-diagnostics="showDiagnostics" :notes="variantNotes(cell.key)">
          <slot name="cell" :cell="cell" />
        </RealVariantCell>
      </div>
    </section>

    <section v-if="stateCells.length" data-testid="kit-row-states">
      <h3 class="mt-4 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">States</h3>
      <div class="flex flex-wrap gap-4 items-start">
        <RealVariantCell v-for="cell in stateCells" :key="cell.state"
          :label="cell.state" :specs="cell.specs" :show-diagnostics="showDiagnostics" :notes="stateNotes(cell.state)">
          <slot name="cell" :cell="cell" />
        </RealVariantCell>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/app/components/KitMatrix.test.ts`
Expected: PASS (3 tests). If the scanner-note test fails, reconcile the same fixture issue as Task 1 Step 4 (the `inputDisabledGraph` must produce the `disabled-via-opacity` issue).

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/components/KitMatrix.vue src/app/components/KitMatrix.test.ts
git commit -m "feat(kit): KitMatrix — axis-row layout + per-cell behavior notes"
```

---

### Task 4: Refactor the 7 `LiveReal*.vue` to use `KitMatrix`

**Files:**
- Modify: `src/app/components/LiveRealButton.vue` (canonical, full below)
- Modify: `LiveRealTable.vue`, `LiveRealNav.vue`, `LiveRealAccordion.vue`, `LiveRealChip.vue`, `LiveRealSidebar.vue`, `LiveRealSlotted.vue` (same transformation)

**Transformation rule (apply to all 7 — READ each first):**
1. Add `import KitMatrix from "./KitMatrix.vue";`. Remove the now-unused `import RealVariantCell from "./RealVariantCell.vue";` (KitMatrix uses it internally) — but ONLY if the file no longer references `RealVariantCell` directly.
2. Replace the file's TWO `<RealVariantCell v-for="cell in variantCells" …>…</RealVariantCell>` and `<RealVariantCell v-for="cell in stateCells" …>…</RealVariantCell>` loops with a SINGLE `<KitMatrix>` whose `#cell` scoped slot contains the file's existing per-cell `<U*>` markup (copy it verbatim from inside the old `RealVariantCell`).
3. Keep everything else (the hero, the gated resting `RenderDeltaTable`, the `recipe`/`variantCells`/`stateCells`/`graph` setup) unchanged. `graph` is already a prop.

- [ ] **Step 1: Implement `LiveRealButton.vue` (canonical).** Replace its `<template>`'s two `RealVariantCell` loops; the result `<template>` is:

```vue
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

      <KitMatrix :component-name="componentName" :variant-cells="variantCells" :state-cells="stateCells"
        :graph="graph" :show-diagnostics="showDiagnostics">
        <template #cell="{ cell }">
          <UButton v-bind="cell.props" :ui="cell.ui" size="md">Button</UButton>
        </template>
      </KitMatrix>
    </template>
  </div>
</template>
```
And in `<script setup>`: add `import KitMatrix from "./KitMatrix.vue";` and remove `import RealVariantCell from "./RealVariantCell.vue";`.

- [ ] **Step 2: Run the existing LiveRealButton tests (they must stay green).**
Run: `npx vitest run src/app/components/LiveRealButton.test.ts`
Expected: PASS. (The variant-cell tests use `findAllComponents(RealVariantCell)` — RealVariantCells now live inside KitMatrix but `findAllComponents` finds them recursively; the `showDiagnostics` gating forwards through KitMatrix; the hero + `resting-diagnostics` are unchanged.) If a test fails because it asserted a layout that changed, update it to the new structure — but the component/diagnostics assertions should hold as-is.

- [ ] **Step 3: Apply the SAME rule to the other 6 files.** READ each, copy its per-cell `<U*>` markup into the `#cell` slot, swap the loops for `<KitMatrix>`, fix imports. Files: `LiveRealTable.vue`, `LiveRealNav.vue`, `LiveRealAccordion.vue`, `LiveRealChip.vue`, `LiveRealSidebar.vue`, `LiveRealSlotted.vue`. (Chip/sidebar keep their `customParts`; all keep `graph`. If a file had only ONE loop or differently-named cell vars, adapt — pass whatever `variantCells`/`stateCells` it has; if a file has no state cells, pass `:state-cells="[]"` or its empty array.)

- [ ] **Step 4: Full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all green; typecheck clean. Fix any LiveReal* test that asserted the old vertical layout.

- [ ] **Step 5: Commit.**
```bash
git add src/app/components/LiveReal*.vue
git commit -m "refactor(kit): LiveReal* render variant/state cells via KitMatrix"
```

---

### Task 5: b3 "Known Nuxt behaviors" panel in `LiveKitPanel`

**Files:**
- Modify: `src/app/components/LiveKitPanel.vue`
- Test: `src/app/components/LiveKitPanel.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `src/app/components/LiveKitPanel.test.ts` (it already has `mount`, `buildGraph`, the `STUBS` map, and a `buttonGraph()` helper — reuse them):

```ts
describe("LiveKitPanel — known behaviors panel", () => {
  it("shows a Known-Nuxt-behaviors toggle for a component with catalog entries (button)", async () => {
    const w = mount(LiveKitPanel, { props: { graph: buttonGraph(), componentName: "button" }, global: { stubs: STUBS } });
    const toggle = w.find('[data-testid="kit-catalog-toggle"]');
    expect(toggle.exists()).toBe(true);
    expect(w.find('[data-testid="kit-catalog"]').exists()).toBe(false); // collapsed by default
    await toggle.trigger("click");
    expect(w.find('[data-testid="kit-catalog"]').exists()).toBe(true);
    expect(w.find('[data-testid="kit-catalog"]').text().toLowerCase()).toContain("inset ring");
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/LiveKitPanel.test.ts -t "known behaviors"`
Expected: FAIL — `kit-catalog-toggle` does not exist.

- [ ] **Step 3: Implement.** In `src/app/components/LiveKitPanel.vue`:
  1. Add to `<script setup>` imports: `import { allBehaviorsFor, scannerNotesFor } from "../kit-behaviors.js";`
  2. After the `coverage` computed, add:
```ts
const showCatalog = ref(false);
const catalogNotes = computed(() => [
  ...allBehaviorsFor(props.componentName),
  ...scannerNotesFor(props.componentName, props.graph).all,
]);
```
  3. In the template, immediately AFTER the existing `kit-diagnose-toggle` `<button>…</button>` (and before the closing `</div>` of `<div class="p-4">`), insert:
```html
<button v-if="catalogNotes.length" type="button" data-testid="kit-catalog-toggle"
  class="mt-3 ml-4 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
  :aria-expanded="showCatalog"
  @click="showCatalog = !showCatalog">
  {{ showCatalog ? "▾ Known Nuxt behaviors" : "▸ Known Nuxt behaviors" }}
</button>
<ul v-if="showCatalog" data-testid="kit-catalog" class="mt-1 text-[10px] text-zinc-500 list-disc pl-5">
  <li v-for="(n, i) in catalogNotes" :key="i">{{ n.text }}</li>
</ul>
```
(`ref` and `computed` are already imported in this file.)

- [ ] **Step 4: Run to verify pass + full suite.**
Run: `npx vitest run src/app/components/LiveKitPanel.test.ts && npx vitest run && npm run typecheck`
Expected: all green; typecheck clean.

- [ ] **Step 5: Commit.**
```bash
git add src/app/components/LiveKitPanel.vue src/app/components/LiveKitPanel.test.ts
git commit -m "feat(kit): LiveKitPanel b3 Known-Nuxt-behaviors catalog panel"
```

---

### Task 6: Manual `/browse` QA (not jsdom-testable)

- [ ] Load the live export (`assets/tokens-20260619-214856.zip` or latest) via the `/browse` skill. Select `button`: confirm the Variants/Colors/States rows render side-by-side, the `outline`/`link` cells show their ⓘ note, the `disabled` state cell shows the opacity note, and "Known Nuxt behaviors" lists them. Spot-check 2–3 other components (e.g. `input` disabled note, a registry component) for layout sanity and no regressions. Note any spacing/wrap issues (e.g. the `mt-3` per-cell margin inside the flex rows) — tweak the row/cell spacing classes if the layout looks off; this is the one visual-polish step.

---

## Self-review checklist (run before handoff)
- README test-count line: update if the harness reports a changed total after Tasks 1–5.
- Confirm the 7 LiveReal* all render via KitMatrix (grep `RealVariantCell` in `src/app/components/LiveReal*.vue` → should be none; it lives only in KitMatrix).
- Confirm `kit-behaviors.ts` is imported only where expected (KitMatrix, LiveKitPanel, RealVariantCell type-only).

## Out of scope (parked — do NOT build here)
Per-size (sm/md/lg) cells (#1); true cartesian variant×color product grid; full behavior catalog (grow during joint review); Q (true-export fidelity). See the spec's "Future".
