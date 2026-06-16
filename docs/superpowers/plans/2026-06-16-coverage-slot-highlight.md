# Coverage Slot Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a covered slot in the coverage view highlights and reveals its tokens in the left tree, without leaving the Coverage tab.

**Architecture:** Three layers. (1) `coverageFor` collects token ids per slot into `SlotCoverage.tokenIds`. (2) `CoverageView` renders covered rows as clickable buttons that emit `select-tokens`. (3) App.vue wires that to `highlightedIds` + `ancestorPaths` auto-reveal, leaving `selection`/`view` untouched. TDD; the pre-commit gate (vue-tsc + full vitest) is the ripple check.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom), `@core/coverage.js`.

---

### Task 1: Engine — `SlotCoverage.tokenIds`

**Files:**
- Modify: `src/coverage.ts` (the `SlotCoverage` interface + the `coverageFor` loop)
- Test: `src/coverage.test.ts` (new assertion)
- Modify: `src/app/components/CoverageView.test.ts` (update the existing `navCoverage` fixture so the required new field keeps the suite green)

- [ ] **Step 1: Write the failing test** — add to `src/coverage.test.ts` inside `describe("coverageFor", …)`:

```ts
it("populates tokenIds for a routed slot and leaves untouched slots empty", () => {
  const cov = coverageFor(graphWith(["nav-item-bg"]), "nav")!;
  expect(cov.slots.find((s) => s.slot === "item")!.tokenIds).toEqual(["nav-item-bg"]);
  expect(cov.slots.find((s) => s.slot === "link")!.tokenIds).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/coverage.test.ts -t "tokenIds"`
Expected: FAIL — `tokenIds` is `undefined` (property does not exist yet).

- [ ] **Step 3: Add `tokenIds` to the `SlotCoverage` interface** in `src/coverage.ts`:

```ts
export interface SlotCoverage {
  slot: string;
  classification: SlotClassification;
  controls: string;
  /** True iff at least one of the component's tokens routes to this slot. */
  touched: boolean;
  /** The component's token ids that route to this slot ([] when untouched). */
  tokenIds: readonly string[];
}
```

- [ ] **Step 4: Collect ids per slot in `coverageFor`** — replace the `touched` set + the `slots` map. The loop currently is:

```ts
  const touched = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.id.split("-")[0] !== component) continue;
    if (OVERLAY_CONTEXT.test(node.id)) continue;
    const slot = getSlotMapping(node.id, undefined, node.type)?.slot;
    if (slot) touched.add(slot);
  }

  const slots: SlotCoverage[] = [...anatomy.entries()].map(([slot, a]) => ({
    slot,
    classification: a.classification,
    controls: a.controls,
    touched: touched.has(slot),
  }));
```

Replace it with:

```ts
  const tokensBySlot = new Map<string, string[]>();
  for (const node of graph.nodes.values()) {
    if (node.id.split("-")[0] !== component) continue;
    if (OVERLAY_CONTEXT.test(node.id)) continue;
    const slot = getSlotMapping(node.id, undefined, node.type)?.slot;
    if (!slot) continue;
    const arr = tokensBySlot.get(slot);
    if (arr) arr.push(node.id);
    else tokensBySlot.set(slot, [node.id]);
  }

  const slots: SlotCoverage[] = [...anatomy.entries()].map(([slot, a]) => ({
    slot,
    classification: a.classification,
    controls: a.controls,
    touched: tokensBySlot.has(slot),
    tokenIds: tokensBySlot.get(slot) ?? [],
  }));
```

(The `structural`/`toDesign`/return block below is unchanged — `touched` is now read off each `slots` entry, which it already is.)

- [ ] **Step 5: Update the existing `CoverageView.test.ts` fixture** so the required `tokenIds` field is present (otherwise vue-tsc fails the gate). In `src/app/components/CoverageView.test.ts`, the `navCoverage` fixture's `slots` and `toDesign` entries each gain a `tokenIds`:

```ts
  slots: [
    { slot: "link", classification: "structural", controls: "link: text, bg, hover", touched: false, tokenIds: [] },
    { slot: "item", classification: "optional", controls: "entry container: spacing", touched: true, tokenIds: ["nav-item-bg"] },
    { slot: "root", classification: "optional", controls: "navbar container: layout", touched: false, tokenIds: [] },
  ],
  toDesign: [
    { slot: "link", classification: "structural", controls: "link: text, bg, hover", touched: false, tokenIds: [] },
    { slot: "root", classification: "optional", controls: "navbar container: layout", touched: false, tokenIds: [] },
  ],
```

- [ ] **Step 6: Run the engine test + full suite**

Run: `npx vitest run src/coverage.test.ts && npm test`
Expected: the new `tokenIds` test passes; full suite green (the fixture update keeps CoverageView's existing 3 tests green).

- [ ] **Step 7: Commit**

```bash
git add src/coverage.ts src/coverage.test.ts src/app/components/CoverageView.test.ts
git commit -m "feat(coverage): SlotCoverage.tokenIds — token ids routing to each slot"
```

---

### Task 2: CoverageView — clickable covered rows

**Files:**
- Modify: `src/app/components/CoverageView.vue`
- Test: `src/app/components/CoverageView.test.ts`

- [ ] **Step 1: Write the failing tests** — add to `src/app/components/CoverageView.test.ts` (the `navCoverage` fixture from Task 1 already has `item.tokenIds = ["nav-item-bg"]` and `link.tokenIds = []`):

```ts
it("renders a covered slot as a button that emits select-tokens with its tokenIds", async () => {
  const w = mount(CoverageView, { props: { coverage: navCoverage } });
  const item = w.find('[data-testid="coverage-slot"][data-slot="item"]');
  expect(item.element.tagName).toBe("BUTTON");
  await item.trigger("click");
  expect(w.emitted("select-tokens")?.[0]).toEqual([["nav-item-bg"]]);
});

it("renders an untouched slot as a non-button that emits nothing", async () => {
  const w = mount(CoverageView, { props: { coverage: navCoverage } });
  const link = w.find('[data-testid="coverage-slot"][data-slot="link"]');
  expect(link.element.tagName).not.toBe("BUTTON");
  await link.trigger("click");
  expect(w.emitted("select-tokens")).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/CoverageView.test.ts -t "select-tokens"`
Expected: FAIL — rows are `<li>`, not buttons; no `select-tokens` event emitted.

- [ ] **Step 3: Add the emit + make rows clickable** — replace the whole `src/app/components/CoverageView.vue` with:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ComponentCoverage } from "@core/coverage.js";

const props = defineProps<{ coverage: ComponentCoverage }>();
const emit = defineEmits<{ "select-tokens": [ids: readonly string[]] }>();

const structural = computed(() => props.coverage.slots.filter((s) => s.classification === "structural"));
const optional = computed(() => props.coverage.slots.filter((s) => s.classification === "optional"));
</script>

<template>
  <div data-testid="coverage-view" class="space-y-4">
    <div class="flex items-baseline justify-between">
      <div class="font-mono text-base">{{ coverage.component }} — coverage</div>
      <div
        class="text-xs font-mono"
        :class="coverage.structuralTouched < coverage.structuralTotal ? 'text-warning' : 'text-success'"
      >
        {{ coverage.structuralTouched }}/{{ coverage.structuralTotal }} structural
      </div>
    </div>

    <section>
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Structural · must design
      </h3>
      <div role="list" class="space-y-0.5">
        <component
          :is="s.tokenIds.length ? 'button' : 'div'"
          v-for="s in structural"
          :key="s.slot"
          :type="s.tokenIds.length ? 'button' : undefined"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5 w-full text-left rounded"
          :class="s.tokenIds.length ? 'cursor-pointer hover:bg-elevated' : ''"
          @click="s.tokenIds.length && emit('select-tokens', s.tokenIds)"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-error'">
            {{ s.touched ? "✓" : "✗" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
          <span
            v-if="!s.touched"
            class="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
          >to design</span>
        </component>
      </div>
    </section>

    <section>
      <h3 class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
        Optional · designed or Nuxt default
      </h3>
      <div role="list" class="space-y-0.5">
        <component
          :is="s.tokenIds.length ? 'button' : 'div'"
          v-for="s in optional"
          :key="s.slot"
          :type="s.tokenIds.length ? 'button' : undefined"
          data-testid="coverage-slot"
          :data-slot="s.slot"
          :data-touched="s.touched"
          class="flex items-center gap-2 text-xs py-0.5 w-full text-left rounded"
          :class="s.tokenIds.length ? 'cursor-pointer hover:bg-elevated' : ''"
          @click="s.tokenIds.length && emit('select-tokens', s.tokenIds)"
        >
          <span class="w-3 text-center" :class="s.touched ? 'text-success' : 'text-zinc-400'">
            {{ s.touched ? "✓" : "○" }}
          </span>
          <span class="font-mono">{{ s.slot }}</span>
          <span class="text-muted truncate">{{ s.controls }}</span>
        </component>
      </div>
    </section>
  </div>
</template>
```

Note: `<component :is>` renders a `<button>` for covered slots (clickable, hover) and a `<div>` for untouched ones; the `data-testid`/`data-slot`/`data-touched` attributes stay on the row regardless, so the Task-1 fixture-based tests still pass.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/components/CoverageView.test.ts`
Expected: PASS — the 2 new tests + the 3 existing (count header, to-design, optional touched/untouched).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/CoverageView.vue src/app/components/CoverageView.test.ts
git commit -m "feat(coverage): clickable covered slot rows emit select-tokens"
```

---

### Task 3: App.vue — highlight + reveal on slot click

**Files:**
- Modify: `src/app/App.vue` (the `<CoverageView …>` usage in the component-selected pane)
- Test: `src/app/App.coverage.test.ts`

- [ ] **Step 1: Write the failing test** — add to `src/app/App.coverage.test.ts` inside `describe("App coverage view", …)`:

```ts
it("highlights a slot's tokens in the tree on click, staying on the coverage view", async () => {
  const wrapper = await mountLoaded();
  const tree = wrapper.findComponent(ComponentTree);
  tree.vm.$emit("select", "");
  tree.vm.$emit("select-component", "nav");
  await flushPromises();
  await wrapper.find('[data-testid="coverage-tab"]').trigger("click");
  await flushPromises();

  // nav-link-bg routes to the link slot (grammar fix) → the link row is a clickable button
  const linkRow = wrapper.find('[data-testid="coverage-slot"][data-slot="link"]');
  expect(linkRow.element.tagName).toBe("BUTTON");
  await linkRow.trigger("click");
  await flushPromises();

  const highlighted = tree.props("highlightedIds") as ReadonlySet<string>;
  expect(highlighted.has("nav-link-bg")).toBe(true);
  // stays on the coverage view (no navigation to node-detail)
  expect(wrapper.find('[data-testid="coverage-view"]').exists()).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/App.coverage.test.ts -t "highlights a slot"`
Expected: FAIL — `CoverageView` has no `@select-tokens` handler, so `highlightedIds` stays empty.

- [ ] **Step 3: Wire `@select-tokens` on `CoverageView`** in `src/app/App.vue`. The current usage (in the component-selected / Chain-2 pane) is:

```vue
              <CoverageView v-if="coverage && paneTab === 'coverage'" :coverage="coverage" />
```

Replace it with:

```vue
              <CoverageView
                v-if="coverage && paneTab === 'coverage'"
                :coverage="coverage"
                @select-tokens="(ids: readonly string[]) => {
                  state.highlightedIds.value = new Set(ids);
                  const next = new Set(expandedPaths.value);
                  for (const id of ids) for (const p of ancestorPaths(tokenTree.value, id)) next.add(p);
                  expandedPaths.value = next;
                  persistExpanded(next);
                }"
              />
```

`ancestorPaths`, `tokenTree`, `expandedPaths`, and `persistExpanded` are already in App.vue scope (the `watch(state.selection)` auto-reveal uses all four). The handler deliberately does not set `state.selection` or `state.view`, so the coverage view stays mounted.

- [ ] **Step 4: Run the App test + the routing regression**

Run: `npx vitest run src/app/App.coverage.test.ts src/app/App.preview-routing.test.ts`
Expected: PASS — the new highlight test green; the 3 existing coverage tests + 37 routing cases stay green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all green (810 + 1 engine + 2 CoverageView + 1 App = 814).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue src/app/App.coverage.test.ts
git commit -m "feat(coverage): click a covered slot to highlight + reveal its tokens"
```

## Self-Review

**1. Spec coverage:**
- Engine `SlotCoverage.tokenIds` (populated per slot, `[]` untouched) → Task 1. ✓
- CoverageView covered rows clickable, emit `select-tokens`, untouched inert → Task 2. ✓
- App wiring: highlight + `ancestorPaths` reveal, no `selection`/`view` change → Task 3. ✓
- Tests in all three layers → Tasks 1/2/3 Step 1. ✓
- Out-of-scope (node-chain coverage, single-token select, untouched highlight) correctly omitted. ✓

**2. Placeholder scan:** none — every code step shows the actual code/commands.

**3. Type consistency:** `SlotCoverage.tokenIds: readonly string[]` defined in Task 1 and consumed as `s.tokenIds.length` / `emit('select-tokens', s.tokenIds)` in Task 2 and `highlightedIds` in Task 3. The emit name `select-tokens` matches the App `@select-tokens` handler and the existing `ScanView` event shape (`[ids: readonly string[]]`). The required-field ripple to `CoverageView.test.ts` is handled in Task 1 Step 5.
