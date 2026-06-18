# Real-Tab v2 Phase B.1 — disabled state diffs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diff each component's **disabled** appearance per slot — render the real component with `disabled` set so the recipe's `disabled:` classes and Nuxt UI's own disabled styling both fire, then diff against the projected disabled intent. Also unify `LiveRealSlotted` onto a cell loop (which renders badge's variant cells too, closing the deferred Phase A.1).

**Architecture:** A data-driven `buildStateCells(recipe)` emits a cell per supported settable state present in the recipe (B.1: `disabled`) — `ui` keeps the full slot classes (so the prefix fires when the component is disabled), the diff `specs` use `projectToState(slot, "disabled")` (the promoted intent). `LiveRealSlotted` is refactored to render `[resting, ...state, ...variant]` cells through one literal-tag chain wrapped in the shared `RealVariantCell`. `LiveRealButton` adds a disabled cell.

**Tech Stack:** Vue 3 `<script setup>`, vitest + @vue/test-utils (jsdom), `@tailwindcss/browser` runtime compiler.

**Spec:** `docs/superpowers/specs/2026-06-18-real-render-disabled-state-design.md`

**Branch:** `feat/real-render-disabled-state` (created; spec committed there).

**Note (YAGNI deviation from spec):** the spec's `buildStateCells(recipe, componentName)` signature drops `componentName` here — no per-component override is needed for `disabled`. Add it back when Phase B.2 (radio `checked`) needs it.

---

### Task 1: `buildStateCells(recipe)`

**Files:**
- Modify: `src/app/composables/use-render-diff.ts`
- Test: `src/app/composables/use-render-diff.test.ts`

- [ ] **Step 1: Append tests** to `src/app/composables/use-render-diff.test.ts`

```ts
import { buildStateCells } from "./use-render-diff.js";

describe("buildStateCells", () => {
  it("emits a disabled cell when the recipe has disabled: classes — ui keeps full classes, specs use the projected intent", () => {
    const recipe = recipeWith({}, { base: "text-[#000] disabled:text-[#999]" });
    const cells = buildStateCells(recipe);
    expect(cells.map((c) => c.state)).toEqual(["disabled"]);
    const d = cells[0]!;
    expect(d.props).toEqual({ disabled: true });
    expect(d.ui.base).toBe("text-[#000] disabled:text-[#999] ti-slot-base"); // full classes + sentinel
    expect(d.specs[0]!.classes).toBe("text-[#000] text-[#999]"); // projectToState(...,"disabled"): promoted, prefix dropped
  });

  it("returns [] when the recipe has no disabled: classes", () => {
    expect(buildStateCells(recipeWith({}, { base: "text-[#000] hover:text-[#111]" }))).toEqual([]);
  });
});
```

(`recipeWith` already exists in this file from the `buildVariantCells` tests — its 2nd arg is the `slots` object. Reuse it.)

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts -t buildStateCells`
Expected: FAIL — `buildStateCells` not exported.

- [ ] **Step 3: Implement** in `src/app/composables/use-render-diff.ts`

Add this import near the top (next to the `ComponentRecipe` import added in Phase A):

```ts
import { projectToState } from "../project-to-state.js";
```

Append after `buildVariantCells`:

```ts
const SETTABLE_STATES = ["disabled"] as const;
const STATE_PROPS: Record<string, Record<string, unknown>> = { disabled: { disabled: true } };

export interface StateCell {
  state: string;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
  props: Record<string, unknown>;
}

/**
 * One cell per supported settable state the recipe actually carries (B.1: `disabled`).
 * `ui` keeps the FULL slot classes (prefixes intact) so the state fires when the component
 * is put in it; the diff `specs` use `projectToState(classes, state)` — the promoted intent.
 */
export function buildStateCells(recipe: ComponentRecipe): StateCell[] {
  const cells: StateCell[] = [];
  const slots = recipe.slots as Record<string, string | undefined>;
  for (const state of SETTABLE_STATES) {
    const prefix = `${state}:`;
    const present = Object.values(slots).some(
      (cls) => cls?.split(/\s+/).some((c) => c.startsWith(prefix)) ?? false,
    );
    if (!present) continue;
    const ui: Record<string, string> = {};
    const specs: SentinelBuild["specs"] = [];
    for (const [slot, classes] of Object.entries(slots)) {
      if (!classes) continue;
      ui[slot] = `${classes} ti-slot-${slot}`;
      specs.push({ slot, selector: `.ti-slot-${slot}`, classes: projectToState(classes, state) });
    }
    cells.push({ state, ui, specs, props: STATE_PROPS[state] ?? {} });
  }
  return cells;
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts -t buildStateCells`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/composables/use-render-diff.ts src/app/composables/use-render-diff.test.ts
git commit -m "feat(fidelity): buildStateCells — disabled-state cells (ui full, specs projected)"
```

---

### Task 2: Unify `LiveRealSlotted` onto a cell loop

**Files:**
- Modify: `src/app/components/LiveRealSlotted.vue`
- Test: `src/app/components/LiveRealSlotted.test.ts`

Refactor so it renders `[resting, ...state, ...variant]` cells through one `<RealVariantCell>`-wrapped literal chain. The 3 existing tests must still pass (resting + fallback + card slot); add a disabled-cell test.

- [ ] **Step 1: Append a failing test** to `src/app/components/LiveRealSlotted.test.ts`

```ts
import RealVariantCell from "./RealVariantCell.vue";

function disabledInputGraph() {
  const global = { input: { disabled: { bg: { $value: "#eeeeee", $type: "color" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const InputStub = {
  props: ["ui", "disabled", "modelValue"],
  template: '<input data-testid="real-input" :data-disabled="disabled" :data-ui="JSON.stringify(ui)" />',
};

describe("LiveRealSlotted — state cells", () => {
  it("renders a disabled cell with the real component disabled", () => {
    const w = mount(LiveRealSlotted, {
      props: { graph: disabledInputGraph(), componentName: "input" },
      global: { stubs: { UInput: InputStub } },
    });
    const inputs = w.findAll('[data-testid="real-input"]');
    // resting cell + a disabled cell
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(inputs.some((i) => i.attributes("data-disabled") === "true")).toBe(true);
    expect(w.findAllComponents(RealVariantCell).length).toBeGreaterThanOrEqual(2);
  });
});
```

If `disabledInputGraph` does not yield a `disabled:` class on a slot (so no disabled cell appears), adjust the token nesting — the state segment may be a suffix: try `{ input: { bg: { disabled: { $value: "#eeeeee", $type: "color" } } } }` (id `input-bg-disabled`). One of the two produces `disabled:bg-[#eeeeee]`; confirm via the Task 1 detection logic.

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/app/components/LiveRealSlotted.test.ts -t "state cells"`
Expected: FAIL — only one input (no disabled cell) / no `data-disabled="true"`.

- [ ] **Step 3: Replace `src/app/components/LiveRealSlotted.vue` with:**

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, buildStateCells, buildVariantCells, type SentinelBuild } from "../composables/use-render-diff.js";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";
import RealVariantCell from "./RealVariantCell.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const entry = computed(() => REAL_SLOTTED_REGISTRY[props.componentName] ?? null);

interface Cell {
  label: string;
  props: Record<string, unknown>;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
}

const cells = computed<Cell[]>(() => {
  const r = recipe.value;
  const e = entry.value;
  if (!r || !e) return [];
  const resting = buildSlotSentinels(r.slots);
  const out: Cell[] = [{ label: "resting", props: e.props, ui: resting.ui, specs: resting.specs }];
  for (const c of buildStateCells(r)) {
    out.push({ label: c.state, props: { ...e.props, ...c.props }, ui: c.ui, specs: c.specs });
  }
  for (const c of buildVariantCells(r)) {
    out.push({ label: `${c.axis}: ${c.key}`, props: { ...e.props, ...c.props }, ui: c.ui, specs: c.specs });
  }
  return out;
});
</script>

<template>
  <div class="p-4">
    <div v-if="!recipe || !entry" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <RealVariantCell v-for="cell in cells" :key="cell.label" :label="cell.label" :specs="cell.specs">
        <UCard v-if="componentName === 'card'" v-bind="cell.props" :ui="cell.ui">
          <template v-if="entry.slot">{{ entry.slot }}</template>
        </UCard>
        <UKbd v-else-if="componentName === 'kbd'" v-bind="cell.props" :ui="cell.ui" />
        <UBadge v-else-if="componentName === 'badge'" v-bind="cell.props" :ui="cell.ui" />
        <UProgress v-else-if="componentName === 'progress'" v-bind="cell.props" :ui="cell.ui" />
        <USwitch v-else-if="componentName === 'switch'" v-bind="cell.props" :ui="cell.ui" />
        <UCheckbox v-else-if="componentName === 'checkbox'" v-bind="cell.props" :ui="cell.ui" />
        <URadioGroup v-else-if="componentName === 'radio'" v-bind="cell.props" :ui="cell.ui" />
        <UInput v-else-if="componentName === 'input'" v-bind="cell.props" :ui="cell.ui" />
        <UTextarea v-else-if="componentName === 'textarea'" v-bind="cell.props" :ui="cell.ui" />
      </RealVariantCell>
    </template>
  </div>
</template>
```

(The literal 9-branch chain is unchanged except `v-bind`/`:ui` now read from `cell`. The separate descriptive `<p>` is dropped — each cell's label heads its block. The resting render is now the first cell; badge's variant cells now render too.)

- [ ] **Step 4: Run the test file (existing + new)**

Run: `npx vitest run src/app/components/LiveRealSlotted.test.ts`
Expected: PASS — the 3 existing tests (badge sentinel `:ui`, null fallback, card default slot) STILL pass (the badge/card stubs now render inside the resting `RealVariantCell`; `w.find` returns the first match) plus the new state-cells test.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LiveRealSlotted.vue src/app/components/LiveRealSlotted.test.ts
git commit -m "feat(fidelity): unify LiveRealSlotted onto a cell loop (resting + disabled state + variant cells)"
```

---

### Task 3: `LiveRealButton` disabled cell

**Files:**
- Modify: `src/app/components/LiveRealButton.vue`
- Test: `src/app/components/LiveRealButton.test.ts`

- [ ] **Step 1: Append a failing test** to `src/app/components/LiveRealButton.test.ts`

```ts
function disabledButtonGraph() {
  const global = { button: { disabled: { bg: { $value: "#eeeeee", $type: "color" } } } };
  return buildGraph([{ name: "global", data: global }]);
}

describe("LiveRealButton — disabled cell", () => {
  it("renders a disabled RealVariantCell with the button disabled", () => {
    const w = mount(LiveRealButton, { props: { graph: disabledButtonGraph(), componentName: "button" }, ...mountOpts });
    const disabledBtns = w.findAll('[data-testid="real-ubutton"]').filter((b) => b.attributes("data-disabled") === "true");
    expect(disabledBtns.length).toBeGreaterThanOrEqual(1);
  });
});
```

Ensure the `UButtonStub` (added in Phase A) also exposes `:data-disabled`: its props must include `"disabled"` and the template must have `:data-disabled="disabled"`. If it doesn't yet, extend the existing stub (do not add a second one). If `disabledButtonGraph` yields no `disabled:` class, try the suffix nesting `{ button: { bg: { disabled: {...} } } }` (id `button-bg-disabled`).

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/app/components/LiveRealButton.test.ts -t "disabled cell"`
Expected: FAIL — no disabled button rendered.

- [ ] **Step 3: Implement** — edit `src/app/components/LiveRealButton.vue`

Add `buildStateCells` to the `use-render-diff.js` import:

```ts
import { computeRenderDiff, buildVariantCells, buildStateCells } from "../composables/use-render-diff.js";
```

Add the computed (after `variantCells`):

```ts
const stateCells = computed(() => (recipe.value ? buildStateCells(recipe.value) : []));
```

In the template, after the existing variant-cell `<RealVariantCell v-for>` block, add the state cells:

```vue
      <RealVariantCell
        v-for="cell in stateCells"
        :key="cell.state"
        :label="cell.state"
        :specs="cell.specs"
      >
        <UButton v-bind="cell.props" :ui="cell.ui" size="md">Button</UButton>
      </RealVariantCell>
```

(`cell.props = { disabled: true }`, so `v-bind` disables the real button.)

- [ ] **Step 4: Run the test file**

Run: `npx vitest run src/app/components/LiveRealButton.test.ts`
Expected: PASS — existing resting/variant tests + the new disabled-cell test.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test`
Expected: all pass (872 prior + Task1 2 + Task2 1 + Task3 1 = 876).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/LiveRealButton.vue src/app/components/LiveRealButton.test.ts
git commit -m "feat(fidelity): disabled state diff for button"
```

---

### Task 4: Browser verification

Unit tests prove wiring only (jsdom has no `getComputedStyle`). Verify the real disabled render + that the `LiveRealSlotted` unify didn't regress.

**Files:** none (manual; adjust only if something fails).

- [ ] **Step 1:** Run `npm run dev`; note the URL.

- [ ] **Step 2: Verify via `/browse`** — load `assets/tokens-20260615-161948.zip`, then:
  - **Regression (the unify):** select a few standard components (card, kbd, badge, input, checkbox) → Real tab → confirm the **resting** diff still renders correctly (first cell), badge now shows its **variant/color** blocks (Phase A.1 closed), card still shows "Card body", no unresolved literals, chrome unaffected (dark-leak guard 0).
  - **Disabled (the feature):** for components carrying `disabled` tokens in the live export (e.g. button/input/checkbox), confirm a **`disabled`** block renders with the component actually disabled and per-slot diffs populate.

- [ ] **Step 3:** Record the disabled-block diff headlines (for release notes). If a component fails to render disabled, adjust and re-verify; re-run the affected test after any edit.

---

### Task 5: Release v0.39.0

Established flow (matches v0.38.0).

- [ ] **Step 1:** `npm version 0.39.0 --no-git-tag-version`.
- [ ] **Step 2: CHANGELOG** — linked `## [0.39.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.39.0) — <date>`: "Real-tab v2 Phase B.1 — per-slot **disabled**-state diffs (render the real component disabled, diff against `projectToState` intent) via `buildStateCells`. `LiveRealSlotted` unified onto a cell loop (resting + state + variant), which also renders badge's variant cells (closes the deferred Phase A.1). `checked`/`open`/`selected` = Phase B.2." Include verified disabled headlines from Task 4.
- [ ] **Step 3: README** — bump test count to the new total (876 or what `npm test` reports); note the Real tab now diffs the disabled state.
- [ ] **Step 4: Commit** on the branch: `chore(release): v0.39.0 — Real-tab disabled-state diffs (Phase B.1)`.
- [ ] **Step 5: Merge + tag + push + GitHub release:**

```bash
git checkout main
git merge --no-ff feat/real-render-disabled-state -m "Merge feat/real-render-disabled-state: Real-tab disabled-state diffs (v0.39.0)"
git tag v0.39.0 <release-commit-sha>
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.39.0
gh release create v0.39.0 --title "v0.39.0 — Real-tab disabled-state diffs (Phase B.1)" --notes-file <notes> --verify-tag
gh auth switch --user d56de
```
Verify the v0.39.0 release link resolves (HTTP 200).

---

## Self-Review

**Spec coverage:**
- disabled state diff, ui-full / specs-projected → Task 1 (`buildStateCells`). ✓
- render real component disabled + diff vs `projectToState` intent → Tasks 2-3 (`v-bind=cell.props` with `{disabled:true}`). ✓
- `projectToState` unchanged (handles disabled) → no task needed. ✓
- `LiveRealSlotted` unify (resting + state + variant via one chain) + closes badge/Phase A.1 → Task 2. ✓
- button disabled cell → Task 3. ✓
- chip unchanged (no disabled tokens) → not touched (data-driven). ✓
- testing (buildStateCells unit, LiveRealSlotted mount incl. regression, button mount, browser) → Tasks 1-4. ✓
- **Deviation:** dropped the spec's speculative `componentName` param from `buildStateCells` (YAGNI; re-add for B.2 radio override). Documented in the header.

**Placeholder scan:** No TBD/TODO; full code in every step; commands have expected output. The fixture-adjustment notes (state segment prefix vs suffix) are explicit fallbacks, not placeholders. (Task 5 `<release-commit-sha>`/`<notes>`/`<date>` are release-time values, per prior release tasks.)

**Type consistency:** `StateCell` (`state`/`ui`/`specs`/`props`) defined in Task 1, consumed in Tasks 2-3; `specs: SentinelBuild["specs"]` matches `RealVariantCell`'s `specs` prop + `useRealRender`'s param; the normalized `Cell` in `LiveRealSlotted` (`label`/`props`/`ui`/`specs`) maps cleanly from both `StateCell` and `VariantCell`; `buildStateCells`/`buildVariantCells`/`RealVariantCell` names consistent across tasks.
