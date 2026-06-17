# Real-Render Fidelity — table (composite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan. Steps use checkbox (`- [ ]`) syntax. NOTE: Task 3 ends with a browser-only `/browse` verdict (does `<UTable :ui>` land the sentinel on th/td); prefer INLINE so it can run.

**Goal:** Bring the render-vs-tokens fidelity diff to its first multi-element composite (`table`), with a generic per-slot resolution via sentinel classes.

**Architecture:** `computeSlotDiffs` queries each slot's sentinel-marked element and reuses Spec 2's `computeRenderDiff`. `LiveRealTable` renders a real `<UTable :data :ui>` with `th`/`td` sentinels and shows one labeled `RenderDeltaTable` per slot. App widens the Real tab to `["button","table"]`.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Nuxt UI v4 `UTable` (`:data` auto-derives columns; `th`/`td` are `:ui` slots), Vitest + jsdom (shape), `/browse` (the verdict). Reuses `computeRenderDiff`, `extractArbitrary`, `usePreviewRecipe`, `ensureRuntimeTailwind`.

---

### Task 1: `computeSlotDiffs` — generic per-slot diff

**Files:**
- Modify: `src/app/composables/use-render-diff.ts`
- Test: `src/app/composables/use-render-diff.test.ts`

- [ ] **Step 1: Write the failing test** — add to `src/app/composables/use-render-diff.test.ts`:

```ts
import { computeSlotDiffs } from "./use-render-diff.js"; // add to the existing import

describe("computeSlotDiffs", () => {
  it("returns a SlotDiff per spec; [] for a selector that matches nothing", () => {
    const host = document.createElement("div");
    const th = document.createElement("div");
    th.className = "ti-slot-th";
    host.appendChild(th);
    document.body.appendChild(host);

    const diffs = computeSlotDiffs(host, [
      { slot: "th", selector: ".ti-slot-th", classes: "rounded-[8px]" },
      { slot: "td", selector: ".ti-slot-td", classes: "p-[16px]" }, // not present
    ]);
    expect(diffs.map((d) => d.slot)).toEqual(["th", "td"]);
    expect(diffs.find((d) => d.slot === "th")!.deltas.length).toBeGreaterThan(0); // rounded → borderRadius
    expect(diffs.find((d) => d.slot === "td")!.deltas).toEqual([]); // selector miss
    host.remove();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts -t "computeSlotDiffs"`
Expected: FAIL — `computeSlotDiffs` not exported.

- [ ] **Step 3: Implement** — append to `src/app/composables/use-render-diff.ts`:

```ts
export interface SlotDiff {
  slot: string;
  deltas: RenderDelta[];
}

/** For each spec, find the sentinel-marked element within host and diff it against its recipe classes. */
export function computeSlotDiffs(
  host: ParentNode,
  specs: ReadonlyArray<{ slot: string; selector: string; classes: string }>,
): SlotDiff[] {
  return specs.map((s) => {
    const el = host.querySelector(s.selector);
    return { slot: s.slot, deltas: el ? computeRenderDiff(el, s.classes) : [] };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts`
Expected: PASS (the new case + the 2 existing `computeRenderDiff` cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/composables/use-render-diff.ts src/app/composables/use-render-diff.test.ts
git commit -m "feat(fidelity): computeSlotDiffs — per-slot diff via sentinel selectors"
```

---

### Task 2: `RenderDeltaTable` optional `label`

**Files:**
- Modify: `src/app/components/RenderDeltaTable.vue`
- Test: `src/app/components/RenderDeltaTable.test.ts`

- [ ] **Step 1: Write the failing test** — add to `RenderDeltaTable.test.ts`:

```ts
it("prefixes the headline with the slot label when given", () => {
  const w = mount(RenderDeltaTable, { props: { deltas, label: "th" } });
  expect(w.find('[data-testid="render-diff"]').text()).toContain("th · 1/2 match");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/RenderDeltaTable.test.ts -t "slot label"`
Expected: FAIL — headline has no `th ·` prefix (label prop ignored).

- [ ] **Step 3: Implement** — in `RenderDeltaTable.vue`, change the props + headline:

```ts
const props = defineProps<{ deltas: readonly RenderDelta[]; label?: string }>();
const matched = computed(() => props.deltas.filter((d) => d.match).length);
const headline = computed(() =>
  `${props.label ? `${props.label} · ` : "Fidelity · "}${matched.value}/${props.deltas.length} match`,
);
```

And the headline `<div>`:
```vue
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
      {{ headline }}
    </div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/RenderDeltaTable.test.ts`
Expected: PASS (the new label case + the 3 existing — the no-label headline still reads `Fidelity · 1/2 match`).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/RenderDeltaTable.vue src/app/components/RenderDeltaTable.test.ts
git commit -m "feat(fidelity): RenderDeltaTable optional slot label"
```

---

### Task 3: `LiveRealTable.vue` + App wiring + `/browse` verdict

**Files:**
- Create: `src/app/components/LiveRealTable.vue`
- Test: `src/app/components/LiveRealTable.test.ts`
- Modify: `src/app/App.vue`
- Test: `src/app/App.coverage.test.ts`

- [ ] **Step 1: Write the failing test** (`src/app/components/LiveRealTable.test.ts`)

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealTable from "./LiveRealTable.vue";

function tableGraph() {
  const global = {
    table: {
      th: { padding: { $value: 8, $type: "number" } },
      td: { padding: { $value: 4, $type: "number" } },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const UTableStub = {
  props: ["data", "columns", "ui"],
  template: '<table data-testid="real-utable" :data-ui="JSON.stringify(ui)"></table>',
};
const mountOpts = { global: { stubs: { UTable: UTableStub, UIcon: true } } };

describe("LiveRealTable", () => {
  it("renders a real UTable and stamps th/td slots with recipe classes + sentinels", () => {
    const w = mount(LiveRealTable, { props: { graph: tableGraph(), componentName: "table" }, ...mountOpts });
    const t = w.find('[data-testid="real-utable"]');
    expect(t.exists()).toBe(true);
    const ui = JSON.parse(t.attributes("data-ui") ?? "{}");
    expect(ui.th).toContain("ti-slot-th");
    expect(ui.td).toContain("ti-slot-td");
    expect(ui.th.length).toBeGreaterThan("ti-slot-th".length); // also carries recipe classes
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealTable, { props: { graph: null, componentName: "table" }, ...mountOpts });
    expect(w.find('[data-testid="real-utable"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/LiveRealTable.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `src/app/components/LiveRealTable.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";
import { computeSlotDiffs, type SlotDiff } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

// Representative data — UTable auto-derives columns from the row keys.
const rows = [
  { name: "Token", value: "8px" },
  { name: "Spacing", value: "16px" },
];

const ui = computed<Record<string, string> | null>(() => {
  const r = recipe.value;
  if (!r) return null;
  return {
    th: [r.slots["th"] ?? "", "ti-slot-th"].join(" ").trim(),
    td: [r.slots["td"] ?? "", "ti-slot-td"].join(" ").trim(),
  };
});

const hostRef = ref<HTMLElement | null>(null);
const slotDiffs = ref<SlotDiff[]>([]);

async function refreshDiff(): Promise<void> {
  await ensureRuntimeTailwind();
  await nextTick();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const host = hostRef.value;
  const r = recipe.value;
  if (!host || !r) {
    slotDiffs.value = [];
    return;
  }
  slotDiffs.value = computeSlotDiffs(host, [
    { slot: "th", selector: ".ti-slot-th", classes: r.slots["th"] ?? "" },
    { slot: "td", selector: ".ti-slot-td", classes: r.slots["td"] ?? "" },
  ]);
}

onMounted(refreshDiff);
watch([() => props.graph, () => props.componentName], refreshDiff);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!ui" class="text-xs text-muted">No table recipe to render.</div>
    <template v-else>
      <UTable :data="rows" :ui="ui" />
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 table themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/LiveRealTable.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into App.vue.**

Add the import next to `LiveRealButton`:
```ts
import LiveRealTable from "./components/LiveRealTable.vue";
```

Widen `realRenderSupported` (currently `=== "button"`):
```ts
const realRenderSupported = computed(() => ["button", "table"].includes(selectedComponent.value));
```

Replace the single Real-render line:
```vue
              <LiveRealButton
                v-if="realRenderSupported && paneTab === 'real'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
              />
```
with a per-component branch:
```vue
              <template v-if="realRenderSupported && paneTab === 'real'">
                <LiveRealButton
                  v-if="selectedComponent === 'button'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                />
                <LiveRealTable
                  v-else-if="selectedComponent === 'table'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                />
              </template>
```

- [ ] **Step 6: Add the App test** — in `src/app/App.coverage.test.ts`, add the import + a test:

```ts
import LiveRealTable from "./components/LiveRealTable.vue";
// ...
it("offers a Real tab for table and mounts LiveRealTable (not LiveRealButton)", async () => {
  const wrapper = await mountLoaded();
  const tree = wrapper.findComponent(ComponentTree);
  tree.vm.$emit("select", "");
  tree.vm.$emit("select-component", "table");
  await flushPromises();
  const realTab = wrapper.find('[data-testid="real-tab"]');
  expect(realTab.exists()).toBe(true);
  await realTab.trigger("click");
  await flushPromises();
  expect(wrapper.findComponent(LiveRealTable).exists()).toBe(true);
  expect(wrapper.findComponent(LiveRealButton).exists()).toBe(false);
});
```
(`LiveRealButton` is already imported in this file from Spec 1; `UTable` is stubbed `true` in this file's mountOpts, so `LiveRealTable` mounts but its inner UTable is a stub — fine, we assert the component mounts. `LiveRealTable` itself is NOT in the stub list, so it mounts real.)

- [ ] **Step 7: Run the App tests + the full suite**

Run: `npx vitest run src/app/App.coverage.test.ts src/app/App.preview-routing.test.ts && npm test`
Expected: table Real-tab test green; button Real-tab test still green; routing unchanged; full suite green.

- [ ] **Step 8: Commit**

```bash
git add src/app/components/LiveRealTable.vue src/app/components/LiveRealTable.test.ts src/app/App.vue src/app/App.coverage.test.ts
git commit -m "feat(fidelity): real-render + per-slot diff for table (th/td)"
```

- [ ] **Step 9: `/browse` verdict (browser-only — confirms the sentinel lands + the real diff)**

```
npm run dev   # background
# /browse: load assets/tokens-20260615-161804.zip, select the table group, click Real tab, wait ~2s
$B js "({utable: !!document.querySelector('[data-testid=real-utable], table'), th: document.querySelectorAll('.ti-slot-th').length, td: document.querySelectorAll('.ti-slot-td').length})"
$B js "[...document.querySelectorAll('[data-testid=render-diff]')].map(t=>t.innerText.split('\\n')[0]).join(' | ')"
```
Expected: a real `<table>` renders; `.ti-slot-th`/`.ti-slot-td` counts > 0 (sentinel landed); two delta tables headlined `th · …` and `td · …`. **If the sentinel counts are 0, STOP** — `:ui.th`/`.td` is not the slot key that lands on the cells; read `node_modules/@nuxt/ui/dist/runtime/components/Table.vue` for the actual th/td slot keys and adjust `ui` in `LiveRealTable`. Screenshot; document the per-slot match result (and any genuine deviations — real findings). Stop the dev server.

## Self-Review

**1. Spec coverage:**
- Sentinel per-slot resolution → Task 3 (`ui.th/td` += `ti-slot-th/td`) + Task 1 (`computeSlotDiffs` queries them). ✓
- `computeSlotDiffs` (per-slot, reuses `computeRenderDiff`, miss → `[]`) → Task 1. ✓
- `LiveRealTable` (real `<UTable :data :ui>`, sentinels, per-slot RenderDeltaTable) → Task 3. ✓
- `RenderDeltaTable` optional `label` → Task 2. ✓
- App widens `realRenderSupported` to button+table, per-component branch → Task 3. ✓
- Testing split (jsdom shape: computeSlotDiffs, LiveRealTable :ui, App mount; /browse verdict) → Tasks 1/2/3 + Step 9. ✓
- Out-of-scope (nav/accordion, modal/dropdown, other slots, variant matrix, Figma-frame) honored. ✓

**2. Placeholder scan:** none — every code step shows real code. Step 9 is an explicit `/browse` procedure with a STOP-and-adjust condition.

**3. Type consistency:** `SlotDiff {slot, deltas: RenderDelta[]}` (Task 1) consumed by `LiveRealTable` (Task 3). `computeSlotDiffs(host, specs)` signature matches its test + the LiveRealTable call. `RenderDeltaTable` props `{deltas, label?}` (Task 2) match the `:label`/`:deltas` usage (Task 3). `usePreviewRecipe`/`computeRenderDiff`/`ensureRuntimeTailwind` reused with their real signatures. `r.slots["th"]`/`["td"]` are the table recipe's slot keys (table NUXT_SLOTS includes th/td; the live export routes table-th/td-* there).
