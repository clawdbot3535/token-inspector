# chip close-button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route `chip-close-button-size` to the chip's `close` slot (via a curated composite alias) and render the chip close as a `<button>` in both previews — reflecting the Figma close-button mechanic.

**Architecture:** A curated 2-segment composite alias (`close-button`→`close`, in `FIGMA_NUXT_PART_ALIAS`) + a composite lookup in the slot-prefix detection routes the token to `close` as a `size` utility (→ `size-[Npx]`). Both preview components render the close as a `<button>` wrapping a sentinel `<span>` that carries the `close` recipe classes (sentinel-purity preserved).

**Tech Stack:** TypeScript, `@tg/grammar`, Vue 3 `<script setup>`, Vitest, `/browse`.

---

## File Structure

- `packages/grammar/src/component-vocab.ts` — add the `close-button`→`close` alias entry.
- `packages/grammar/src/slot-mapping.ts` — composite (2-segment) alias lookup in slot-prefix detection.
- `packages/grammar/src/slot-mapping.test.ts` + `packages/grammar/src/component-vocab.test.ts` + `src/custom-recipe-engine.test.ts` — grammar + recipe tests.
- `src/app/components/LiveChip.vue` + `src/app/components/LiveRealChip.vue` — render close as `<button>`.
- `src/app/components/LiveChip.test.ts` + `src/app/components/LiveRealChip.test.ts` — mount tests.

Ordering: Task 1 (grammar) → Task 2 (previews, depends on the routing) → Task 3 (browser verify).

---

### Task 1: Grammar — `close-button`→`close` composite alias

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts`, `packages/grammar/src/slot-mapping.ts`
- Test: `packages/grammar/src/component-vocab.test.ts`, `packages/grammar/src/slot-mapping.test.ts`, `src/custom-recipe-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/grammar/src/component-vocab.test.ts`, add (ensure `FIGMA_NUXT_PART_ALIAS` is imported — it is used elsewhere in this file's tests; if not, add it to the import):

```ts
it("aliases the close-button composite part to the close slot", () => {
  expect(FIGMA_NUXT_PART_ALIAS.get("close-button")).toBe("close");
});
```

In `packages/grammar/src/slot-mapping.test.ts`, add next to the existing `chip-close-icon-size` test (~line 64). The `SlotMappingEntry` shape mirrors the existing close-icon-size assertion:

```ts
it("routes chip-close-button-size to the close slot (close-button composite alias)", () => {
  expect(heuristicSlotMapping("chip-close-button-size", undefined, new Set(["label", "close"]))).toEqual({
    slot: "close",
    utilityType: "size",
    variantAxis: null,
    variantKey: null,
  });
});

it("leaves chip-close-icon-size and chip-close-size unchanged by the composite alias", () => {
  const icon = heuristicSlotMapping("chip-close-icon-size", undefined, new Set(["label", "close"]));
  expect(icon?.slot).toBe("close");
  expect(icon?.utilityType).toBe("icon-size");
  const size = heuristicSlotMapping("chip-close-size", undefined, new Set(["label", "close"]));
  expect(size?.slot).toBe("close");
  expect(size?.utilityType).toBe("size");
});
```

In `src/custom-recipe-engine.test.ts`, add a synthetic-graph test (the file imports `buildGraph`, `buildCustomRecipes`, and the token types; build a minimal chip graph and pass the parts map directly):

```ts
it("routes chip-close-button-size into the custom chip recipe's close slot", () => {
  const graph = buildGraph([{
    name: "global",
    data: { chip: {
      bg: { $value: "#E4E4E7", $type: "color" },
      "close-button-size": { $value: 16, $type: "number" },
    } },
  }]);
  const recipes = buildCustomRecipes(graph, new Map([["chip", ["label", "close"]]]), {});
  expect(recipes.chip?.slots.close ?? "").toContain("size-[16px]");
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/custom-recipe-engine.test.ts -t "close-button"`
Then also: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t "close slot"`
Expected: FAIL — `FIGMA_NUXT_PART_ALIAS.get("close-button")` is `undefined`; `heuristicSlotMapping("chip-close-button-size", …)` returns `null` (verified current behavior: the `button` segment makes the utility `"button-size"`, unknown); the recipe has no `close` slot. (The "leaves … unchanged" guard test passes already — fine.)

- [ ] **Step 3: Add the alias entry** (`packages/grammar/src/component-vocab.ts`)

In `FIGMA_NUXT_PART_ALIAS`, add the `close-button` entry:

```ts
export const FIGMA_NUXT_PART_ALIAS: ReadonlyMap<string, string> = new Map([
  ["row", "tr"],
  ["divider", "separator"],
  ["check", "icon"],
  ["dot", "indicator"],
  ["fill", "indicator"],
  ["track", "base"],
  // Composite (2-segment) part name: a `close` element that IS a button → the `close` slot.
  // Consulted by the 2-segment composite lookup in slot-mapping; the `button` descriptor is
  // thereby consumed so e.g. `chip-close-button-size` → close slot + size utility.
  ["close-button", "close"],
]);
```

- [ ] **Step 4: Add the composite lookup** (`packages/grammar/src/slot-mapping.ts`)

Replace the slot-prefix detection block (currently lines ~123-139, the `let slotPrefix … const slotSeg … if (slotSeg !== undefined && slotSeg !== "base" && componentSlots !== undefined) { … }`) with:

```ts
  let slotPrefix: RecipeSlot | null = null;
  const slotSeg = parts[start];
  // Curated multi-segment composite part name (e.g. `close-button` → `close`): try the
  // 2-segment alias FIRST so a trailing descriptor segment is consumed with the slot.
  // Only consults the curated alias map (not a dynamic match against all slots), and only
  // in the custom/extraSlots pass (componentSlots provided).
  if (slotSeg !== undefined && parts[start + 1] !== undefined && componentSlots !== undefined) {
    const composite = `${slotSeg}-${parts[start + 1]}`;
    const aliased = FIGMA_NUXT_PART_ALIAS.get(composite);
    if (aliased !== undefined && componentSlots.has(aliased)) {
      slotPrefix = aliased;
      start += 2;
    }
  }
  if (slotPrefix === null && slotSeg !== undefined && slotSeg !== "base" && componentSlots !== undefined) {
    if (componentSlots.has(slotSeg)) {
      slotPrefix = slotSeg;
      start += 1;
    } else {
      // Honour the curated Figma→Nuxt rename map: a segment whose alias target
      // is a real slot for this component routes to that Nuxt slot name
      // (e.g. radio `dot` → `indicator`).
      const aliased = FIGMA_NUXT_PART_ALIAS.get(slotSeg);
      if (aliased !== undefined && componentSlots.has(aliased)) {
        slotPrefix = aliased;
        start += 1;
      }
    }
  }
```

(This wraps the existing single-segment block in `if (slotPrefix === null && …)` and prepends the composite check. The single-segment logic is otherwise unchanged.)

- [ ] **Step 5: Run the tests to verify green**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/custom-recipe-engine.test.ts`
Expected: PASS — new tests green; all existing grammar + custom-recipe tests stay green (composite lookup matches only `close-button` today).

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/slot-mapping.ts packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/custom-recipe-engine.test.ts
git commit -m "feat(grammar): route close-button composite to the close slot (chip-close-button-size)"
```

NOTE: a pre-commit hook runs full typecheck + the whole vitest suite; expected to pass.

---

### Task 2: Previews — render the chip close as a `<button>`

**Files:**
- Modify: `src/app/components/LiveChip.vue`, `src/app/components/LiveRealChip.vue`
- Test: `src/app/components/LiveChip.test.ts`, `src/app/components/LiveRealChip.test.ts`

- [ ] **Step 1: Write the failing mount tests**

In `src/app/components/LiveRealChip.test.ts`, add (mirrors the existing `chipGraph`/`parts` setup; uses the Task-1 routing so the close slot gets `size-[…]`):

```ts
function chipCloseGraph() {
  const global = {
    chip: {
      bg: { $value: "#E4E4E7", $type: "color" },
      "close-button-size": { $value: 16, $type: "number" },
    },
  };
  return buildGraph([{ name: "global", data: global }]);
}

describe("LiveRealChip — close button", () => {
  it("renders the close as a <button> wrapping the close-slotted span", () => {
    const w = mount(LiveRealChip, { props: { graph: chipCloseGraph(), customParts: parts } });
    const btn = w.find('[data-testid="real-chip"] button');
    expect(btn.exists()).toBe(true);
    const span = btn.find("span");
    expect(span.classes()).toContain("ti-slot-close");
    expect(span.classes().some((c) => c.startsWith("size-["))).toBe(true);
  });
});
```

In `src/app/components/LiveChip.test.ts`, add:

```ts
describe("LiveChip — close button", () => {
  it("renders the close affordance as a <button>", () => {
    const wrapper = mount(LiveChip, { props: { graph: chipGraph(), customParts: parts }, ...mountOpts });
    const btn = wrapper.find('[data-testid="chip"] button');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("×");
  });
});
```

- [ ] **Step 2: Run the mount tests to verify they fail**

Run: `npx vitest run src/app/components/LiveRealChip.test.ts src/app/components/LiveChip.test.ts -t "close button"`
Expected: FAIL — the close is currently a `<span>`, so `find("… button")` does not exist.

- [ ] **Step 3: Render the close as a button in `LiveChip.vue`**

In `src/app/components/LiveChip.vue`, replace the close span in the pill template:

```html
          <span class="opacity-60" :class="pill.close.classes" :style="pill.close.style">×</span>
```

with:

```html
          <button
            type="button"
            class="appearance-none border-0 bg-transparent p-0 cursor-pointer inline-flex items-center justify-center leading-none opacity-60"
          >
            <span :class="pill.close.classes" :style="pill.close.style">×</span>
          </button>
```

- [ ] **Step 4: Render the close as a button in `LiveRealChip.vue`** (BOTH spots)

In `src/app/components/LiveRealChip.vue`, replace the resting close span:

```html
        <span :class="build.ui.close">×</span>
```

with:

```html
        <button
          type="button"
          class="appearance-none border-0 bg-transparent p-0 cursor-pointer inline-flex items-center justify-center leading-none"
        >
          <span :class="build.ui.close">×</span>
        </button>
```

and replace the variant-cell close span:

```html
          <span :class="cell.ui.close">×</span>
```

with:

```html
          <button
            type="button"
            class="appearance-none border-0 bg-transparent p-0 cursor-pointer inline-flex items-center justify-center leading-none"
          >
            <span :class="cell.ui.close">×</span>
          </button>
```

(The `<button>` carries static scaffolding only — UA-chrome reset + centering — and is NOT the sentinel-bearing element. The inner `<span>` keeps the `close` recipe classes / sentinel, preserving sentinel-purity.)

- [ ] **Step 5: Run the mount tests to verify green**

Run: `npx vitest run src/app/components/LiveRealChip.test.ts src/app/components/LiveChip.test.ts`
Expected: PASS — close-button tests green; existing chip preview tests stay green.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — full suite green (~917 tests; was 910).

- [ ] **Step 7: Commit**

```bash
git add src/app/components/LiveChip.vue src/app/components/LiveRealChip.vue src/app/components/LiveChip.test.ts src/app/components/LiveRealChip.test.ts
git commit -m "feat(preview): render chip close as a <button> wrapping the close-slotted span"
```

---

### Task 3: Browser verification

jsdom can't compute styles, so the size/visual is confirmed in a real browser via `/browse` (per CLAUDE.md — never `mcp__claude-in-chrome__*`). Verification only; loop back on a defect.

**Files:** none.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Vite serves the inspector (note the localhost URL).

- [ ] **Step 2: Load the live export and open the chip preview**

Using `/browse`: open the inspector URL, set the file input (`input[type="file"]`) to `/Users/christian/Dev/token-inspector/assets/tokens-20260619-093216.zip`, select the **chip** component. Check the **Preview** tab and the **Real** tab.

- [ ] **Step 3: Verify the close button**

Confirm the chip close renders as a **`<button>`** (DOM: a `button` element inside the chip), sized by the `close` slot (`chip-close-button-size` → `size-[16px]`), not an unstyled faint `×`. Confirm no default UA button chrome (the reset classes apply).

- [ ] **Step 4: Verify the Real-tab close slot diff**

On the Real tab, confirm a `close` slot row appears and diffs its `size` (width/height) against the recipe. Confirm the dark-leak guard (0 `prefers-color-scheme: dark` rules) and no new console errors.

- [ ] **Step 5: Record the result**

Capture the before/after (unstyled `×` → sized close button) for the release notes. If a check fails, return to the relevant task.

---

## Self-Review

**1. Spec coverage:**
- Grammar composite alias `close-button`→`close` + 2-seg lookup (spec §1) → Task 1. ✓
- Recipe gains `close` slot with `size-[…]` (spec data-flow) → Task 1 custom-recipe test. ✓
- Previews render close as `<button>` wrapping sentinel span, both files + both LiveRealChip spots (spec §2) → Task 2. ✓
- Sentinel-purity preserved (reset on button, recipe classes on span) (spec §2) → Task 2 Step 4 note + the mount test asserting the span (not the button) carries `ti-slot-close`. ✓
- Existing tokens unaffected (spec blast-radius) → Task 1 "leaves … unchanged" test. ✓
- Browser verify (spec Testing) → Task 3. ✓
- Out-of-scope (badge-in-nav, closeIcon, interactivity) — not touched. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step has full code with exact anchors; run steps show commands + empirically-grounded red/green (`button-size` unknown → null today; `close-button` the only 2-seg alias).

**3. Type consistency:** `FIGMA_NUXT_PART_ALIAS` stays `ReadonlyMap<string, string>` — the new `["close-button","close"]` entry fits. The slot-prefix block keeps `slotPrefix: RecipeSlot | null` and the same `start`/`componentSlots` variables; the composite branch only adds a `start += 2` path. `heuristicSlotMapping(id, undefined, Set)` and `buildCustomRecipes(graph, Map, {})` signatures used as they exist. The mount tests assert the sentinel (`ti-slot-close`) on the inner `<span>`, consistent with the spec's purity requirement.

No issues found.
