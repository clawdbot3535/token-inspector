# Real-tab polish / tech-debt consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the deferred Real-tab review-minors (shared item-value constant, tighter radio assertion, two clarifying comments) with no behavior change.

**Architecture:** Extract `RADIO_ITEM_VALUE`/`ACCORDION_ITEM_VALUE` (= `"a"`) into the dependency-free `real-slotted-registry.ts` and reference them from the registry, the `STATE_PROPS_OVERRIDE` (use-render-diff), and `LiveRealAccordion`. Tighten one mount assertion; add two comments. Pure refactor — the constants resolve to `"a"`, so all existing recipes/previews/diffs are identical.

**Tech Stack:** TypeScript, Vue 3, Vitest.

---

## File Structure

- `src/app/components/real-slotted-registry.ts` — export the two constants; radio entry uses `RADIO_ITEM_VALUE`.
- `src/app/composables/use-render-diff.ts` — `STATE_PROPS_OVERRIDE` uses the imported constants.
- `src/app/components/LiveRealAccordion.vue` — `items` uses `ACCORDION_ITEM_VALUE`.
- `src/app/components/real-slotted-registry.test.ts` — guard the registry↔const link.
- `src/app/components/LiveRealSlotted.test.ts` — tighten the radio checked-cell assertion.
- `src/app/components/LiveRealButton.vue`, `apps/creator/Creator.test.ts` — clarifying comments.

Ordering: Task 1 (constants) → Task 2 (assertion + comments). Independent, but Task 1 first so the constants exist.

---

### Task 1: Shared item-value constants

**Files:**
- Modify: `src/app/components/real-slotted-registry.ts`, `src/app/composables/use-render-diff.ts`, `src/app/components/LiveRealAccordion.vue`
- Test: `src/app/components/real-slotted-registry.test.ts`

- [ ] **Step 1: Write the failing guard test**

In `src/app/components/real-slotted-registry.test.ts`, add `RADIO_ITEM_VALUE` to the import from `./real-slotted-registry.js`, and add:

```ts
it("radio's registry item value uses the shared RADIO_ITEM_VALUE constant", () => {
  expect(RADIO_ITEM_VALUE).toBe("a");
  const radioItems = (REAL_SLOTTED_REGISTRY.radio.props as { items: { value: string }[] }).items;
  expect(radioItems[0]!.value).toBe(RADIO_ITEM_VALUE);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/components/real-slotted-registry.test.ts -t "RADIO_ITEM_VALUE"`
Expected: FAIL — `RADIO_ITEM_VALUE` is not exported yet (import error / undefined).

- [ ] **Step 3: Export the constants** (`src/app/components/real-slotted-registry.ts`)

After the header comment (before `export interface RealSlottedEntry`), add:

```ts
/** The preview item value used by the radio registry entry and its checked-state override. */
export const RADIO_ITEM_VALUE = "a";
/** The preview item value used by LiveRealAccordion's items and its open-state override. */
export const ACCORDION_ITEM_VALUE = "a";
```

Change the `radio` entry from `items: [{ label: "Option", value: "a" }]` to:

```ts
  radio: { tag: "URadioGroup", props: { items: [{ label: "Option", value: RADIO_ITEM_VALUE }] } },
```

- [ ] **Step 4: Use the constants in the overrides** (`src/app/composables/use-render-diff.ts`)

Add an import after the existing imports (lines ~6-11):

```ts
import { RADIO_ITEM_VALUE, ACCORDION_ITEM_VALUE } from "../components/real-slotted-registry.js";
```

In `STATE_PROPS_OVERRIDE`, change the radio + accordion entries to use the constants:

```ts
const STATE_PROPS_OVERRIDE: Record<string, Partial<Record<SettableState, Record<string, unknown>>>> = {
  radio: { checked: { modelValue: RADIO_ITEM_VALUE } }, // URadioGroup selects by item value
  accordion: { open: { defaultValue: ACCORDION_ITEM_VALUE } }, // UAccordion opens by item value
};
```

(`real-slotted-registry.ts` imports nothing from `use-render-diff.ts`, so this composable→registry import introduces no cycle.)

- [ ] **Step 5: Use the constant in LiveRealAccordion** (`src/app/components/LiveRealAccordion.vue`)

Add `ACCORDION_ITEM_VALUE` to the import from `./real-slotted-registry.js` (add the import if the file doesn't already import from the registry), and change the `items` line (line ~11):

```ts
const items = [{ label: "Section", content: "Body text for the panel.", value: ACCORDION_ITEM_VALUE }];
```

- [ ] **Step 6: Run to verify green**

Run: `npx vitest run src/app/components/real-slotted-registry.test.ts src/app/components/LiveRealAccordion.test.ts src/app/components/LiveRealSlotted.test.ts src/app/composables/use-render-diff.test.ts`
Expected: PASS — the guard test + all existing radio/accordion/checked tests stay green (the constants resolve to `"a"`, so values are unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/app/components/real-slotted-registry.ts src/app/composables/use-render-diff.ts src/app/components/LiveRealAccordion.vue src/app/components/real-slotted-registry.test.ts
git commit -m "refactor(preview): share RADIO_ITEM_VALUE/ACCORDION_ITEM_VALUE across registry + overrides"
```

NOTE: a pre-commit hook runs full typecheck + the whole vitest suite; expected to pass.

---

### Task 2: Tighter radio assertion + clarifying comments

**Files:**
- Modify: `src/app/components/LiveRealSlotted.test.ts`, `src/app/components/LiveRealButton.vue`, `apps/creator/Creator.test.ts`

- [ ] **Step 1: Tighten the radio checked-cell assertion** (`src/app/components/LiveRealSlotted.test.ts`)

In the `"passes componentName so radio's checked cell uses modelValue 'a'"` test, replace the assertion block (the `const radios = …` + the single `expect(radios.some(... === "a"))`) with:

```ts
    const radios = w.findAll('[data-testid="real-radio"]');
    // checked cell uses the item value (override applied via the componentName wiring)…
    expect(radios.filter((r) => r.attributes("data-modelvalue") === "a").length).toBe(1);
    // …and the resting radio has no selection (unchecked baseline — registry drops modelValue).
    expect(radios.some((r) => r.attributes("data-modelvalue") === "undefined")).toBe(true);
```

- [ ] **Step 2: Run to verify it passes (stronger, still green)**

Run: `npx vitest run src/app/components/LiveRealSlotted.test.ts`
Expected: PASS — the tightened assertion holds (exactly one checked radio cell = `"a"`; the resting cell = `"undefined"`). If it FAILS, that reveals a real wiring defect — investigate, don't loosen.

- [ ] **Step 3: Add the LiveRealButton comment** (`src/app/components/LiveRealButton.vue`)

Above the `const stateCells = computed(() => (recipe.value ? buildStateCells(recipe.value, props.componentName) : []));` line (~line 26), add:

```ts
// `componentName` is passed for consistency with the slotted/accordion call sites; button has no
// checked/open tokens, so buildStateCells emits only a `disabled` cell (no per-component override).
```

- [ ] **Step 4: Add the Creator timeout comment** (`apps/creator/Creator.test.ts`)

Find the `it(...)` test whose timeout argument is `15_000` (its closing `}, 15_000);` is at ~line 126). Immediately above that `it(` declaration line, add:

```ts
  // 15s (not the 5s default): this mounts the whole Creator app + jsdom shims and reads token files;
  // it runs ~120ms standalone but can exceed 5s under full-suite worker-pool contention.
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — full suite green (~927 tests; was 926, +1 registry guard test from Task 1).

- [ ] **Step 6: Commit**

```bash
git add src/app/components/LiveRealSlotted.test.ts src/app/components/LiveRealButton.vue apps/creator/Creator.test.ts
git commit -m "test+docs: tighten radio checked-cell assertion; document button/creator-timeout intent"
```

---

## Self-Review

**1. Spec coverage:**
- Shared `RADIO_ITEM_VALUE`/`ACCORDION_ITEM_VALUE` (spec §1) → Task 1. ✓
- Tighter radio assertion (spec §2) → Task 2 Step 1. ✓
- LiveRealButton comment (spec §3) → Task 2 Step 3. ✓
- Creator timeout comment (spec §4) → Task 2 Step 4. ✓
- No behavior change / constants = `"a"` (spec) → Task 1 Step 6 (existing tests stay green). ✓
- No browser step (spec) → not included. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step has full code with exact anchors; run steps show commands + expected results. Step 4's "find the `it(...)` with the `15_000` timeout" is a precise locator (grep `15_000` → its enclosing `it(`), not a placeholder.

**3. Type consistency:** `RADIO_ITEM_VALUE`/`ACCORDION_ITEM_VALUE` are `string` (`"a"`) — assignable everywhere the literal was used (`items[].value`, `modelValue`, `defaultValue`). The composable→registry import direction is acyclic (registry imports nothing from the composable). The guard test reads `REAL_SLOTTED_REGISTRY.radio.props.items` — matches the registry shape. The tightened radio assertion uses the same `data-testid="real-radio"` + `data-modelvalue` attributes the existing test/stub already expose.

No issues found.
