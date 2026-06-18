# Real-Tab v2 Phase B.2b — unchecked baseline + checked cell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the checkable Real-render components to an unchecked resting baseline and add a dedicated `checked` state cell, so the resting diff matches the unchecked render and the checked intent gets its own correct probe (resolving the B.2a resting-diff artifact).

**Architecture:** `buildStateCells` gains a `checked` state alongside `disabled`, detecting it by the B.2a emit form `data-[state=checked]:` (not a Tailwind `checked:` pseudo). A per-state detection-prefix map decouples detection from the state name; a `componentName` param + per-component override map gives radio its item-value (`modelValue:"a"`) instead of the `true` default. The registry renders checkbox/switch/radio unchecked at rest. Both call sites (`LiveRealSlotted`, `LiveRealButton`) pass `componentName` through.

**Tech Stack:** Vue 3 `<script setup>`, Nuxt UI v4 (Reka), TypeScript, Vitest (jsdom for wiring, `/browse` for the real computed-style verdict).

---

## File Structure

- `src/app/components/real-slotted-registry.ts` — flip checkable entries to unchecked baseline (data only).
- `src/app/composables/use-render-diff.ts` — extend `buildStateCells` (checked state, detection-prefix map, `componentName` param + override map). The single source of truth for state-cell shape.
- `src/app/composables/use-render-diff.test.ts` — add `buildStateCells` checked unit tests.
- `src/app/components/LiveRealSlotted.vue` — pass `componentName` to `buildStateCells`.
- `src/app/components/LiveRealButton.vue` — pass `componentName` to `buildStateCells`.
- `src/app/components/LiveRealSlotted.test.ts` — add checked-cell mount tests (unchecked resting + checked cell; radio override via wiring).

No new files. `projectToState` (`src/app/project-to-state.ts`) already handles `data-[state=checked]:` (B.2a) — unchanged.

---

### Task 1: Registry unchecked-baseline flip

The checkable components must render **unchecked** at rest. This is a pure data change; the registry test asserts shape (`typeof props === "object"`), not values, so it stays green — no new assertion (the behavioral effect is covered by the Task 3 mount tests, which is where the unchecked baseline is observable).

**Files:**
- Modify: `src/app/components/real-slotted-registry.ts:19-22`
- Test (re-run only): `src/app/components/real-slotted-registry.test.ts`

- [ ] **Step 1: Flip the three checkable entries to unchecked**

In `src/app/components/real-slotted-registry.ts`, change lines 19-22 from:

```ts
  switch: { tag: "USwitch", props: { modelValue: true } },
  checkbox: { tag: "UCheckbox", props: { modelValue: true, label: "Checkbox" } },
  // radio maps to URadioGroup (Nuxt UI v4 has no standalone URadio) — breaks the otherwise 1:1 U<PascalKey> naming.
  radio: { tag: "URadioGroup", props: { modelValue: "a", items: [{ label: "Option", value: "a" }] } },
```

to:

```ts
  switch: { tag: "USwitch", props: { modelValue: false } },
  checkbox: { tag: "UCheckbox", props: { modelValue: false, label: "Checkbox" } },
  // radio maps to URadioGroup (Nuxt UI v4 has no standalone URadio) — breaks the otherwise 1:1 U<PascalKey> naming.
  // No modelValue → no selection → unchecked resting baseline (the checked cell sets modelValue to the item value).
  radio: { tag: "URadioGroup", props: { items: [{ label: "Option", value: "a" }] } },
```

- [ ] **Step 2: Run the registry test to confirm it stays green**

Run: `npx vitest run src/app/components/real-slotted-registry.test.ts`
Expected: PASS (3 tests — it asserts the 9 keys, U-prefixed tags, object props; values are not asserted).

- [ ] **Step 3: Commit**

```bash
git add src/app/components/real-slotted-registry.ts
git commit -m "feat(fidelity): unchecked resting baseline for checkbox/switch/radio"
```

---

### Task 2: `buildStateCells` — add the `checked` state

Extend `buildStateCells` to emit a `checked` cell when the recipe carries `data-[state=checked]:` classes, with a per-state detection prefix and a `componentName`-keyed override map for radio's checked value.

**Files:**
- Modify: `src/app/composables/use-render-diff.ts:105-140`
- Test: `src/app/composables/use-render-diff.test.ts:89-103`

- [ ] **Step 1: Write the failing unit tests**

In `src/app/composables/use-render-diff.test.ts`, add these three tests **inside** the existing `describe("buildStateCells", …)` block (after the existing `"returns []"` test at line 102, before the block's closing `})`):

```ts
  it("emits a checked cell when the recipe has data-[state=checked]: classes — props default to modelValue:true", () => {
    const recipe = recipeWith({}, { base: "bg-[#000] data-[state=checked]:bg-[#fff]" });
    const cells = buildStateCells(recipe);
    expect(cells.map((c) => c.state)).toEqual(["checked"]);
    const c = cells[0]!;
    expect(c.props).toEqual({ modelValue: true });
    expect(c.ui.base).toBe("bg-[#000] data-[state=checked]:bg-[#fff] ti-slot-base"); // full classes + sentinel
    expect(c.specs[0]!.classes).toBe("bg-[#000] bg-[#fff]"); // projectToState(...,"checked"): promoted, prefix dropped
  });

  it("uses the radio checked override (modelValue is the item value, not true)", () => {
    const recipe = recipeWith({}, { base: "bg-[#000] data-[state=checked]:bg-[#fff]" });
    const cells = buildStateCells(recipe, "radio");
    expect(cells[0]!.props).toEqual({ modelValue: "a" });
  });

  it("emits both cells in SETTABLE_STATES order when the recipe carries disabled and checked", () => {
    const recipe = recipeWith({}, { base: "disabled:opacity-[0.5] data-[state=checked]:bg-[#fff]" });
    expect(buildStateCells(recipe).map((c) => c.state)).toEqual(["disabled", "checked"]);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts -t "buildStateCells"`
Expected: FAIL — the checked recipe yields `[]` (current `SETTABLE_STATES` is `["disabled"]` and detection scans `"checked:"`, which never matches `data-[state=checked]:`), and `buildStateCells(recipe, "radio")` is a 2-arg call the current 1-arg signature rejects (TS / runtime ignores the arg).

- [ ] **Step 3: Implement the `checked` state**

In `src/app/composables/use-render-diff.ts`, replace lines 105-140 (the `SETTABLE_STATES` const through the end of `buildStateCells`) with:

```ts
const SETTABLE_STATES = ["disabled", "checked"] as const;
type SettableState = (typeof SETTABLE_STATES)[number];

// The class prefix that marks each state in the emitted recipe. `disabled` is a Tailwind
// pseudo-prefix; `checked` is emitted as a Reka data-attribute variant (B.2a) so it fires on
// Nuxt UI v4's checkbox/switch/radio (driven by data-state="checked", not a native :checked input).
const STATE_DETECT_PREFIX: Record<SettableState, string> = {
  disabled: "disabled:",
  checked: "data-[state=checked]:",
};

// Props that put the real component into each state. Per-component differences (radio's checked
// value is the selected item value, not `true`) live in STATE_PROPS_OVERRIDE, keyed by componentName.
const STATE_PROPS: Record<SettableState, Record<string, unknown>> = {
  disabled: { disabled: true },
  checked: { modelValue: true },
};
const STATE_PROPS_OVERRIDE: Record<string, Partial<Record<SettableState, Record<string, unknown>>>> = {
  radio: { checked: { modelValue: "a" } }, // URadioGroup selects by item value (registry item value is "a")
};

export interface StateCell {
  state: SettableState;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
  props: Record<string, unknown>;
}

/**
 * One cell per supported settable state the recipe actually carries (`disabled`, `checked`).
 * `ui` keeps the FULL slot classes (prefixes intact) so the state fires when the component is put
 * in it; the diff `specs` use `projectToState(classes, state)` — the promoted intent. `componentName`
 * selects per-component state props (radio's checked value differs from the `true` default).
 */
export function buildStateCells(recipe: ComponentRecipe, componentName?: string): StateCell[] {
  const cells: StateCell[] = [];
  const slots = recipe.slots as Record<string, string | undefined>;
  for (const state of SETTABLE_STATES) {
    const prefix = STATE_DETECT_PREFIX[state];
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
    const props = STATE_PROPS_OVERRIDE[componentName ?? ""]?.[state] ?? STATE_PROPS[state];
    cells.push({ state, ui, specs, props });
  }
  return cells;
}
```

- [ ] **Step 4: Run the full render-diff test file to verify green**

Run: `npx vitest run src/app/composables/use-render-diff.test.ts`
Expected: PASS — the existing disabled tests and `buildVariantCells`/`buildSlotSentinels` tests stay green; the three new checked tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/composables/use-render-diff.ts src/app/composables/use-render-diff.test.ts
git commit -m "feat(fidelity): buildStateCells emits a checked cell (data-[state=checked])"
```

---

### Task 3: Wire `componentName` through both call sites + checked-cell mount tests

The call sites currently call `buildStateCells(r)` with no `componentName`, so radio's checked cell would get the `true` default instead of `modelValue:"a"`. Pass `componentName` through, and add mount tests proving (a) checkbox renders an unchecked resting cell + a checked cell, and (b) radio's checked cell carries `modelValue:"a"` (which only works once `componentName` flows through).

**Files:**
- Modify: `src/app/components/LiveRealSlotted.vue:26`
- Modify: `src/app/components/LiveRealButton.vue:26`
- Test: `src/app/components/LiveRealSlotted.test.ts` (append a new describe block)

- [ ] **Step 1: Write the failing mount tests**

In `src/app/components/LiveRealSlotted.test.ts`, append at the end of the file:

```ts
function checkedCheckboxGraph() {
  const global = { checkbox: { bg: { checked: { $value: "#ffffff", $type: "color" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const CheckboxStub = {
  props: ["ui", "modelValue", "label"],
  template:
    '<input type="checkbox" data-testid="real-checkbox" :data-modelvalue="String(modelValue)" :data-ui="JSON.stringify(ui)" />',
};

function checkedRadioGraph() {
  const global = { radio: { bg: { checked: { $value: "#ffffff", $type: "color" } } } };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const RadioStub = {
  props: ["ui", "modelValue", "items"],
  template: '<div data-testid="real-radio" :data-modelvalue="String(modelValue)" :data-ui="JSON.stringify(ui)"></div>',
};

describe("LiveRealSlotted — checked cell", () => {
  it("renders an unchecked resting cell and a checked cell (checkbox)", () => {
    const w = mount(LiveRealSlotted, {
      props: { graph: checkedCheckboxGraph(), componentName: "checkbox" },
      global: { stubs: { UCheckbox: CheckboxStub } },
    });
    const boxes = w.findAll('[data-testid="real-checkbox"]');
    expect(boxes.length).toBeGreaterThanOrEqual(2); // resting + checked
    expect(boxes.some((b) => b.attributes("data-modelvalue") === "false")).toBe(true); // unchecked baseline
    expect(boxes.some((b) => b.attributes("data-modelvalue") === "true")).toBe(true); // checked cell
  });

  it("passes componentName so radio's checked cell uses modelValue 'a' (the item value)", () => {
    const w = mount(LiveRealSlotted, {
      props: { graph: checkedRadioGraph(), componentName: "radio" },
      global: { stubs: { URadioGroup: RadioStub } },
    });
    const radios = w.findAll('[data-testid="real-radio"]');
    expect(radios.some((r) => r.attributes("data-modelvalue") === "a")).toBe(true); // override applied via wiring
  });
});
```

- [ ] **Step 2: Run the new mount tests to verify they fail**

Run: `npx vitest run src/app/components/LiveRealSlotted.test.ts -t "checked cell"`
Expected: FAIL — the radio test fails because `LiveRealSlotted` calls `buildStateCells(r)` without `componentName`, so radio's checked cell gets the `true` default (`data-modelvalue="true"`), never `"a"`. (The checkbox test may already pass after Tasks 1-2 — that's fine; the radio test is the red driver for the wiring.)

- [ ] **Step 3: Pass `componentName` from `LiveRealSlotted`**

In `src/app/components/LiveRealSlotted.vue`, change line 26 from:

```ts
  for (const c of buildStateCells(r)) {
```

to:

```ts
  for (const c of buildStateCells(r, props.componentName)) {
```

- [ ] **Step 4: Pass `componentName` from `LiveRealButton`**

In `src/app/components/LiveRealButton.vue`, change line 26 from:

```ts
const stateCells = computed(() => (recipe.value ? buildStateCells(recipe.value) : []));
```

to:

```ts
const stateCells = computed(() => (recipe.value ? buildStateCells(recipe.value, props.componentName) : []));
```

- [ ] **Step 5: Run the mount tests + the existing disabled mount test to verify green**

Run: `npx vitest run src/app/components/LiveRealSlotted.test.ts`
Expected: PASS — the new checked-cell block, the existing "state cells" disabled block, and the base mount tests all green.

- [ ] **Step 6: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — full suite green (≈880 tests; was 877 at v0.39.1, +3 buildStateCells unit tests; the 2 mount tests land in the existing files).

- [ ] **Step 7: Commit**

```bash
git add src/app/components/LiveRealSlotted.vue src/app/components/LiveRealButton.vue src/app/components/LiveRealSlotted.test.ts
git commit -m "feat(fidelity): wire componentName to buildStateCells; checked-cell mount tests"
```

---

### Task 4: Browser verification (the real verdict)

jsdom returns empty computed styles, so the unit tests only prove wiring. The actual checked-cell diff and the artifact resolution must be confirmed in a real browser via the `/browse` skill (per CLAUDE.md — never `mcp__claude-in-chrome__*`). This is a verification task: no code changes; if it surfaces a defect, loop back to the relevant task.

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serves the inspector (note the localhost URL).

- [ ] **Step 2: Load the live token export and open the Real tab for the checkable components**

Using `/browse`: open the inspector URL, load the production token export used in prior Real-tab sweeps (the `tokens-2026…` export with checkbox/switch/radio checked tokens), then for each of **checkbox**, **switch**, **radio**: select the component and open the **Real** tab.

- [ ] **Step 3: Verify the unchecked resting baseline**

Confirm the **resting** cell renders unchecked:
- checkbox / radio: no indicator/dot visible (Reka renders the indicator only when checked);
- switch: thumb in the off position.
Confirm the resting per-slot diff reads as a clean base match (the B.2a artifact — switch thumb reading low at rest — is gone).

- [ ] **Step 4: Verify the checked cell**

Confirm a **checked** cell appears below the resting/variant cells for each component, rendering the component checked (indicator/dot/thumb-on visible) with sensible per-slot diffs against the projected checked intent. In DevTools, confirm the rendered root carries `data-state="checked"` and the recipe's `data-[state=checked]:` classes are firing (not inert).

- [ ] **Step 5: Confirm the dark-leak guard**

Confirm no `prefers-color-scheme` dark-utility regression while the Real tab is open (the v0.36.1 guard): the app chrome stays in its selected theme. Quick check: in DevTools, count of `@media (prefers-color-scheme: dark)` rules generated by the runtime compiler should be 0.

- [ ] **Step 6: Record the result**

Capture the per-slot match deltas for checkbox/switch/radio (resting + checked) for the release notes. If any check fails, return to the relevant task (registry/buildStateCells/wiring) and re-run the loop. If all pass, the feature is verified and ready for release.

---

## Self-Review

**1. Spec coverage:**
- Registry flip (spec §1) → Task 1. ✓
- `buildStateCells`: SETTABLE_STATES += checked, STATE_DETECT_PREFIX map, STATE_PROPS checked, componentName + radio override (spec §2) → Task 2. ✓
- Call sites pass componentName (spec §3) → Task 3. ✓
- Data-flow / artifact-resolution outcome (spec "Data flow") → Task 4 browser verification. ✓
- Testing: buildStateCells unit (checked + radio override), LiveRealSlotted mount (unchecked resting + checked cell), registry stays green, browser verify (spec "Testing") → Tasks 2, 3, 1, 4. ✓
- Risks: radio unchecked render + checked-cell prop precedence (spec "Risks") → Task 4 (radio render) + Task 3 checkbox mount test asserts the merge `{...e.props, ...c.props}` lets `modelValue:true` win over the flipped `false`. ✓
- Out of scope: open/selected, Phase C — not touched. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows full code; every run step shows the command + expected output.

**3. Type consistency:** `buildStateCells(recipe, componentName?)` signature is identical at the definition (Task 2) and both call sites (Task 3). `SettableState = "disabled" | "checked"` is assignable to `projectToState`'s `PreviewState | "checked"` parameter (`"disabled"` ∈ `PreviewState`, `"checked"` is the union member) — no type error. `StateCell` shape unchanged (state/ui/specs/props). `STATE_PROPS_OVERRIDE[componentName ?? ""]?.[state]` safely yields `undefined` for unknown/absent names, falling through to `STATE_PROPS[state]`.

No issues found.
