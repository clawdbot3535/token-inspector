# Real-Tab v2 Phase B.3 — accordion `open`-state cell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accordion renders **closed** at rest and gains a dedicated **open** state cell, applying the B.2b pattern to the last settable interaction state and resolving the probe-can't-see-the-state artifact.

**Architecture:** `projectToState` learns `"open"` (type only — the `data-[state=X]:` branch already promotes it). `buildStateCells` gains `open` in `SETTABLE_STATES` with a `data-[state=open]:` detection prefix and an accordion-keyed override that supplies `default-value` activation. `LiveRealAccordion` is refactored from its single open-at-rest render to the unified `[resting, ...buildStateCells]` cells model rendered through `RealVariantCell` (mirroring `LiveRealSlotted`).

**Tech Stack:** Vue 3 `<script setup>`, Nuxt UI v4 (Reka `UAccordion`, `data-state="open"`), TypeScript, Vitest (jsdom for wiring; `/browse` for the real computed-style verdict).

---

## File Structure

- `src/app/project-to-state.ts` — widen the `projectToState` `state` param type to include `"open"` (no logic change).
- `src/app/project-to-state.test.ts` — add an `open`-projection unit test.
- `src/app/composables/use-render-diff.ts` — extend `buildStateCells` (`open` state, detection prefix, props default, accordion override).
- `src/app/composables/use-render-diff.test.ts` — add `buildStateCells` `open` unit tests.
- `src/app/components/LiveRealAccordion.vue` — refactor to the unified cells model.
- `src/app/components/LiveRealAccordion.test.ts` — update the open-at-rest test to the closed baseline; add an open-cell test.

No new files. Ordering matters: Task 1 (projectToState type) precedes Task 2 (buildStateCells calls `projectToState(classes, "open")`).

---

### Task 1: `projectToState` learns `"open"`

`buildStateCells` will call `projectToState(classes, "open")`. The function's `data-[state=X]:` branch already promotes any matching state, but the `state` parameter type (`PreviewState | "checked"`) rejects `"open"`. Widen it.

**Files:**
- Modify: `src/app/project-to-state.ts:39`
- Test: `src/app/project-to-state.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/app/project-to-state.test.ts`, add after the existing `data-[state=checked]:` test (before the final closing `})` of the `describe`):

```ts
  it("promotes data-[state=open]: classes under the open state and drops them otherwise", () => {
    expect(projectToState("text-[#A] data-[state=open]:text-[#B]", "open")).toBe("text-[#A] text-[#B]");
    expect(projectToState("text-[#A] data-[state=open]:text-[#B]", "default")).toBe("text-[#A]");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/project-to-state.test.ts -t "data-\[state=open\]"`
Expected: FAIL — TypeScript rejects `"open"` as the `state` argument (`Argument of type '"open"' is not assignable to parameter of type 'PreviewState | "checked"'`). (vitest runs via esbuild so it may run, but `vue-tsc` in the pre-commit hook would block; the assertion drives the type widening either way.)

- [ ] **Step 3: Widen the parameter type**

In `src/app/project-to-state.ts`, change the signature on line 39 from:

```ts
export function projectToState(classString: string, state: PreviewState | "checked"): string {
```

to:

```ts
export function projectToState(classString: string, state: PreviewState | "checked" | "open"): string {
```

No other change — the existing `data-\[state=([a-z]+)\]:` branch already promotes `"open"` when `dm[1] === state`, and `STATE_PREFIXES` (the pseudo-prefix set) is not consulted for the data-attribute form.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/project-to-state.test.ts`
Expected: PASS — the new test plus all existing `projectToState` tests are green.

- [ ] **Step 5: Commit**

```bash
git add src/app/project-to-state.ts src/app/project-to-state.test.ts
git commit -m "feat(fidelity): projectToState accepts the open state"
```

NOTE: a pre-commit hook runs full typecheck + the whole vitest suite automatically on commit; that is expected and should pass.

---

### Task 2: `buildStateCells` — add the `open` state

Extend `buildStateCells` so it emits an `open` cell when the recipe carries `data-[state=open]:` classes, with the accordion override supplying `default-value` activation.

**Files:**
- Modify: `src/app/composables/use-render-diff.ts` (the `SETTABLE_STATES` / `STATE_DETECT_PREFIX` / `STATE_PROPS` / `STATE_PROPS_OVERRIDE` block, currently lines ~105-124)
- Test: `src/app/composables/use-render-diff.test.ts` (existing `describe("buildStateCells", …)` block)

- [ ] **Step 1: Write the failing unit tests**

In `src/app/composables/use-render-diff.test.ts`, add these three tests inside the existing `describe("buildStateCells", …)` block (after the last checked test, before the block's closing `})`):

```ts
  it("emits an open cell when the recipe has data-[state=open]: classes — props default to {}", () => {
    const recipe = recipeWith({}, { base: "text-[#000] data-[state=open]:text-[#fff]" });
    const cells = buildStateCells(recipe);
    expect(cells.map((c) => c.state)).toEqual(["open"]);
    const c = cells[0]!;
    expect(c.props).toEqual({});
    expect(c.ui.base).toBe("text-[#000] data-[state=open]:text-[#fff] ti-slot-base"); // full classes + sentinel
    expect(c.specs[0]!.classes).toBe("text-[#000] text-[#fff]"); // projectToState(...,"open"): promoted, prefix dropped
  });

  it("uses the accordion open override (defaultValue is the item value)", () => {
    const recipe = recipeWith({}, { base: "text-[#000] data-[state=open]:text-[#fff]" });
    const cells = buildStateCells(recipe, "accordion");
    expect(cells[0]!.props).toEqual({ defaultValue: "a" });
  });

  it("emits disabled, checked, open in SETTABLE_STATES order when the recipe carries all three", () => {
    const recipe = recipeWith({}, { base: "disabled:opacity-[0.5] data-[state=checked]:bg-[#c] data-[state=open]:text-[#o]" });
    expect(buildStateCells(recipe).map((c) => c.state)).toEqual(["disabled", "checked", "open"]);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts -t "buildStateCells"`
Expected: FAIL — the open recipe yields `[]` (current `SETTABLE_STATES` is `["disabled", "checked"]` and there is no `open` detection prefix), and the accordion-override test gets `{}` instead of `{ defaultValue: "a" }`.

- [ ] **Step 3: Implement the `open` state**

In `src/app/composables/use-render-diff.ts`, update the four module-level tables (do NOT change the `buildStateCells` function body — it already reads these tables). Change:

```ts
const SETTABLE_STATES = ["disabled", "checked"] as const;
```
to:
```ts
const SETTABLE_STATES = ["disabled", "checked", "open"] as const;
```

Add `open` to `STATE_DETECT_PREFIX`:
```ts
const STATE_DETECT_PREFIX: Record<SettableState, string> = {
  disabled: "disabled:",
  checked: "data-[state=checked]:",
  open: "data-[state=open]:",
};
```

Add `open` to `STATE_PROPS` (no universal activation prop — `open` is set per-component via the override):
```ts
const STATE_PROPS: Record<SettableState, Record<string, unknown>> = {
  disabled: { disabled: true },
  checked: { modelValue: true },
  open: {},
};
```

Add the accordion entry to `STATE_PROPS_OVERRIDE`:
```ts
const STATE_PROPS_OVERRIDE: Record<string, Partial<Record<SettableState, Record<string, unknown>>>> = {
  radio: { checked: { modelValue: "a" } }, // URadioGroup selects by item value (registry item value is "a")
  accordion: { open: { defaultValue: "a" } }, // UAccordion opens by item value (default-value); item value is "a"
};
```

The detection loop (`STATE_DETECT_PREFIX[state]`), `ui`, `specs` (`projectToState(classes, state)`), and the `STATE_PROPS_OVERRIDE[componentName ?? ""]?.[state] ?? STATE_PROPS[state]` lookup are already in place from the checked work — `open` flows through them unchanged.

- [ ] **Step 4: Run the render-diff test file to verify green**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts`
Expected: PASS — existing disabled/checked/variant/sentinel tests stay green; the three new open tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/composables/use-render-diff.ts src/app/composables/use-render-diff.test.ts
git commit -m "feat(fidelity): buildStateCells emits an open cell (data-[state=open])"
```

---

### Task 3: Refactor `LiveRealAccordion` to the cells model

Replace the single open-at-rest render with `[resting(closed), ...buildStateCells(recipe, "accordion")]` rendered through `RealVariantCell` (mirroring `LiveRealSlotted`).

**Files:**
- Modify: `src/app/components/LiveRealAccordion.vue` (whole file)
- Test: `src/app/components/LiveRealAccordion.test.ts`

- [ ] **Step 1: Update the existing test + add the open-cell test**

Replace the entire body of `src/app/components/LiveRealAccordion.test.ts` with:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRealAccordion from "./LiveRealAccordion.vue";
import RealVariantCell from "./RealVariantCell.vue";

function accGraph() {
  const global = { accordion: { item: { radius: { $value: 8, $type: "number" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

// accordion-item-text-opened → data-[state=open]:text-[…] (mirrors the live export token)
function accOpenGraph() {
  const global = { accordion: { item: { text: { opened: { $value: "#ffffff", $type: "color" } } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

const AccStub = {
  props: ["items", "ui", "defaultValue"],
  template: '<div data-testid="real-uaccordion" :data-ui="JSON.stringify(ui)" :data-open="defaultValue"></div>',
};
const mountOpts = { global: { stubs: { UAccordion: AccStub, UIcon: true } } };

describe("LiveRealAccordion", () => {
  it("renders a closed resting cell with sentinel slots (no open token → no open cell)", () => {
    const w = mount(LiveRealAccordion, { props: { graph: accGraph(), componentName: "accordion" }, ...mountOpts });
    const els = w.findAll('[data-testid="real-uaccordion"]');
    expect(els.length).toBe(1); // resting only — the radius-only recipe carries no data-[state=open]:
    const ui = JSON.parse(els[0]!.attributes("data-ui") ?? "{}");
    expect(ui.item).toContain("ti-slot-item");
    expect(els[0]!.attributes("data-open")).toBeUndefined(); // closed baseline (no default-value)
  });

  it("renders a closed resting cell and an open cell when the recipe has data-[state=open]: classes", () => {
    const w = mount(LiveRealAccordion, { props: { graph: accOpenGraph(), componentName: "accordion" }, ...mountOpts });
    const els = w.findAll('[data-testid="real-uaccordion"]');
    expect(els.length).toBeGreaterThanOrEqual(2); // resting + open
    expect(els.some((e) => e.attributes("data-open") === undefined)).toBe(true); // closed resting
    expect(els.some((e) => e.attributes("data-open") === "a")).toBe(true); // open cell force-opens panel "a"
    expect(w.findAllComponents(RealVariantCell).length).toBeGreaterThanOrEqual(2);
  });

  it("shows a fallback when the graph is null", () => {
    const w = mount(LiveRealAccordion, { props: { graph: null, componentName: "accordion" }, ...mountOpts });
    expect(w.find('[data-testid="real-uaccordion"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/LiveRealAccordion.test.ts`
Expected: FAIL — the current component renders a single open-at-rest `UAccordion` with `data-open="a"`, so the new "closed resting" assertion (`data-open` undefined) and the open-cell test (≥2 accordions, one closed) fail.

- [ ] **Step 3: Refactor the component**

Replace the entire contents of `src/app/components/LiveRealAccordion.vue` with:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, buildStateCells, type SentinelBuild } from "../composables/use-render-diff.js";
import RealVariantCell from "./RealVariantCell.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const items = [{ label: "Section", content: "Body text for the panel.", value: "a" }];

interface Cell {
  label: string;
  props: Record<string, unknown>;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
}

// Resting renders CLOSED (no default-value → base trigger look, panel body absent from the DOM).
// buildStateCells appends an `open` cell when the recipe carries data-[state=open]: classes; the
// accordion override sets default-value so that cell renders the panel open.
const cells = computed<Cell[]>(() => {
  const r = recipe.value;
  if (!r) return [];
  const resting = buildSlotSentinels(r.slots);
  const out: Cell[] = [{ label: "resting", props: {}, ui: resting.ui, specs: resting.specs }];
  for (const c of buildStateCells(r, props.componentName)) {
    out.push({ label: c.state, props: c.props, ui: c.ui, specs: c.specs });
  }
  return out;
});
</script>

<template>
  <div class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No accordion recipe to render.</div>
    <template v-else>
      <RealVariantCell v-for="cell in cells" :key="cell.label" :label="cell.label" :specs="cell.specs">
        <UAccordion :items="items" v-bind="cell.props" :ui="cell.ui" />
      </RealVariantCell>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run the accordion test to verify green**

Run: `npx vitest run src/app/components/LiveRealAccordion.test.ts`
Expected: PASS — all three tests green (closed resting, resting+open with the open-token fixture, null fallback).

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — full suite green (≈887 tests; was 882 at v0.40.0, +1 projectToState +3 buildStateCells +1 accordion open-cell test).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/LiveRealAccordion.vue src/app/components/LiveRealAccordion.test.ts
git commit -m "feat(fidelity): LiveRealAccordion closed baseline + open cell (cells model)"
```

---

### Task 4: Browser verification (the real verdict)

jsdom returns empty computed styles, so the unit tests only prove wiring. The actual open-cell diff and the artifact resolution must be confirmed in a real browser via the `/browse` skill (per CLAUDE.md — never `mcp__claude-in-chrome__*`). Verification only: no code changes; if it surfaces a defect, loop back.

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serves the inspector (note the localhost URL).

- [ ] **Step 2: Load the live export and open the accordion Real tab**

Using `/browse`: open the inspector URL, set the file input (`input[type="file"]`, accepts `.json,.zip`) to `/Users/christian/Dev/token-inspector/assets/tokens-20260615-161948.zip`, then select the **accordion** component and open the **Real** tab.

- [ ] **Step 3: Verify the closed resting baseline**

Confirm the **resting** cell renders the accordion **closed** (trigger visible, panel body collapsed/absent). Confirm its per-slot diff reflects the base trigger look (e.g. the trigger text at its base color, not the opened color).

- [ ] **Step 4: Verify the open cell**

Confirm an **open** cell appears below resting, rendering the panel **open** (body visible). In DevTools, confirm the open item's root carries `data-state="open"` and the `data-[state=open]:text-[…]` class is firing (the trigger text shows the opened color from `accordion-item/text-opened`), diffed against the projected-open intent.

- [ ] **Step 5: Confirm the dark-leak guard**

In DevTools, confirm the count of CSS rules containing `prefers-color-scheme: dark` generated by the runtime compiler is **0** while the Real tab is open (the v0.36.1 guard), and there are no new console errors (the vue-router nav warning is pre-existing).

- [ ] **Step 6: Record the result**

Capture the resting + open per-slot match counts for the release notes. If any check fails, return to the relevant task and re-run the loop. If all pass, the feature is verified and ready for release.

---

## Self-Review

**1. Spec coverage:**
- `projectToState` widen to include `"open"` (spec §1) → Task 1. ✓
- `buildStateCells`: SETTABLE_STATES += open, STATE_DETECT_PREFIX.open, STATE_PROPS.open={}, accordion override (spec §2) → Task 2. ✓
- `LiveRealAccordion` cells-model refactor: resting closed (`{}`) + open cell (`{defaultValue:"a"}`) via RealVariantCell, drop standalone default-value/useRealRender (spec §3) → Task 3. ✓
- Data flow / artifact resolution → Task 4 browser verification. ✓
- Testing: buildStateCells unit (open + accordion override + order), projectToState unit (open), LiveRealAccordion mount (closed resting + open cell), browser verify (spec "Testing") → Tasks 2, 1, 3, 4. ✓
- Risks: Reka open mechanism + closed resting render + refactor parity (spec "Risks") → Task 4 (open mechanism, closed render) + Task 3 mount test (cell count, props). ✓
- Out of scope: nav/overlays/selected, no buildVariantCells on accordion, B.2b polish — not touched. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows full code; every run step shows the command + expected output.

**3. Type consistency:** `projectToState(s, "open")` (Task 1 widened type) is what `buildStateCells` calls (Task 2) — consistent. `SettableState = "disabled" | "checked" | "open"` is assignable to `projectToState`'s `PreviewState | "checked" | "open"` param. `buildStateCells(recipe, componentName?)` signature unchanged (already accepts the optional `componentName` from the checked work); `LiveRealAccordion` passes `props.componentName` (Task 3), same as `LiveRealSlotted`/`LiveRealButton`. `STATE_PROPS_OVERRIDE.accordion.open = { defaultValue: "a" }` flows to `<UAccordion v-bind="cell.props">` → `default-value="a"`. The `Cell` interface in `LiveRealAccordion` matches the one in `LiveRealSlotted` (label/props/ui/specs).

No issues found.
