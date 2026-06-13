# Accordion as an Allow-List Component (Bucket D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map the new export's `accordion-item-*` tokens by registering `accordion` as a Nuxt-native component — add it to `NUXT_SLOTS` (grammar) and `COMPONENT_ALLOW_LIST` (renderer), so the existing sub-element routing emits a `ui.accordion` recipe.

**Architecture:** Two purely-additive vocabulary entries; no logic changes. Adding `accordion` to `NUXT_SLOTS` lets `heuristicSlotMapping`'s fallback route the `item` sub-element; adding it to `COMPONENT_ALLOW_LIST` makes `appConfigRenderer` emit it. 14 of 18 real tokens map to `slots.item`; 4 stragglers stay NULL by design. Because the change is additive (no existing test asserts these tokens are NULL), the two tasks are independently green commits.

**Tech Stack:** TypeScript, Vitest, npm workspace (`@tg/grammar` consumed by `src/`). ESM (`.js` import suffix). Pre-commit hook runs `vue-tsc` + full vitest on every commit.

**Spec:** `docs/superpowers/specs/2026-06-13-accordion-component-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/component-vocab.ts` — add the `accordion` `NUXT_SLOTS` entry.
- **Modify** `packages/grammar/src/component-vocab.test.ts` — `nuxtSlotsFor("accordion")` assertion.
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — `accordion-item-*` mapping cases + straggler negatives.
- **Modify** `src/renderers/app-config.ts` — add `"accordion"` to `COMPONENT_ALLOW_LIST`.
- **Modify** `src/recipe-engine.test.ts` — `buildComponentRecipes` emits `ui.accordion.slots.item`.
- **Modify** `src/renderers/renderers.test.ts` — `appConfigRenderer` emits an `accordion` recipe block.

No `slot-mapping.ts` / renderer-logic / scanner / build-cli change.

---

## Task 1: Register `accordion` in the grammar (`NUXT_SLOTS`)

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts` (`NUXT_SLOTS` map, line ~112)
- Test: `packages/grammar/src/component-vocab.test.ts`, `packages/grammar/src/slot-mapping.test.ts`
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Write the failing grammar tests**

In `packages/grammar/src/component-vocab.test.ts`, append (the file already imports `nuxtSlotsFor` — if not, add it to the existing `./component-vocab.js` import):

```ts
describe("nuxtSlotsFor — accordion", () => {
  it("returns the Nuxt UI v4 Accordion theme slots", () => {
    const slots = nuxtSlotsFor("accordion");
    expect(slots).toBeDefined();
    for (const s of ["root", "item", "header", "trigger", "content", "body", "leadingIcon", "trailingIcon", "label"]) {
      expect(slots!.has(s)).toBe(true);
    }
  });
});
```

In `packages/grammar/src/slot-mapping.test.ts`, append:

```ts
describe("heuristicSlotMapping — accordion (item sub-element)", () => {
  it("maps accordion-item-bg to the item slot", () => {
    expect(heuristicSlotMapping("accordion-item-bg", "color")).toEqual({
      slot: "item", utilityType: "bg-color", variantAxis: null, variantKey: null,
    });
  });

  it("maps accordion-item-border to border-color (accordion is not ring-framed)", () => {
    expect(heuristicSlotMapping("accordion-item-border", "color")).toEqual({
      slot: "item", utilityType: "border-color", variantAxis: null, variantKey: null,
    });
  });

  it("carries a trailing disabled state (accordion-item-text-disabled)", () => {
    expect(heuristicSlotMapping("accordion-item-text-disabled", "color")).toEqual({
      slot: "item", utilityType: "text-color", variantAxis: null, variantKey: null,
      statePrefix: "disabled",
    });
  });

  it("maps the non-color item utilities (padding-x, font-size, gap, icon-size)", () => {
    expect(heuristicSlotMapping("accordion-item-padding-x")?.utilityType).toBe("padding-x");
    expect(heuristicSlotMapping("accordion-item-font-size")?.utilityType).toBe("text-size");
    expect(heuristicSlotMapping("accordion-item-gap")?.utilityType).toBe("gap");
    expect(heuristicSlotMapping("accordion-item-icon-size")?.utilityType).toBe("icon-size");
    expect(heuristicSlotMapping("accordion-item-padding-x")?.slot).toBe("item");
  });

  it("leaves the 4 straggler tokens NULL (non-standard utilities / non-state word)", () => {
    expect(heuristicSlotMapping("accordion-item-border-focus-ring", "color")).toBeNull();
    expect(heuristicSlotMapping("accordion-item-focus-offset")).toBeNull();
    expect(heuristicSlotMapping("accordion-item-ring-radius")).toBeNull();
    expect(heuristicSlotMapping("accordion-item-text-opened", "color")).toBeNull();
  });
});
```

In `src/recipe-engine.test.ts`, append a test inside the existing `describe("buildComponentRecipes", …)` block (use the file's `makeNode` / `makeGraph` helpers):

```ts
  it("emits a ui.accordion recipe routing item tokens to slots.item", () => {
    const graph = makeGraph([
      makeNode({ id: "accordion-item-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "accordion-item-text-disabled", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["accordion"] });
    expect(recipes["accordion"]?.slots.item).toContain("bg-[#FFFFFF]");
    expect(recipes["accordion"]?.slots.item).toContain("disabled:text-[#A1A1AA]");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/recipe-engine.test.ts`
Expected: the `nuxtSlotsFor — accordion` test FAILS (`slots` is `undefined`); the `accordion` mapping cases FAIL (currently NULL); the `buildComponentRecipes` accordion test FAILS (`recipes["accordion"]` is `undefined`). The 4-straggler negative case already passes (they stay NULL).

- [ ] **Step 3: Add the `accordion` NUXT_SLOTS entry**

In `packages/grammar/src/component-vocab.ts`, insert the entry as the first element of the `NUXT_SLOTS` map. Change:

```ts
export const NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["button", new Set(["base", "label", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailingIcon"])],
```

to:

```ts
export const NUXT_SLOTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["accordion", new Set([
    "root", "item", "header", "trigger", "content", "body",
    "leadingIcon", "trailingIcon", "label",
  ])],
  ["button", new Set(["base", "label", "leadingIcon", "leadingAvatar", "leadingAvatarSize", "trailingIcon"])],
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/recipe-engine.test.ts`
Expected: PASS — `nuxtSlotsFor("accordion")` returns the set; the mapping cases map to `slot: "item"`; `buildComponentRecipes` emits `recipes["accordion"].slots.item`; the 4 stragglers stay NULL.

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/component-vocab.test.ts \
        packages/grammar/src/slot-mapping.test.ts src/recipe-engine.test.ts
git commit -m "feat(grammar): register accordion (item sub-element routes to a ui.accordion recipe)"
```

Expected: pre-commit hook (vue-tsc + full vitest) passes.

---

## Task 2: Emit `accordion` from the renderer (`COMPONENT_ALLOW_LIST`)

**Files:**
- Modify: `src/renderers/app-config.ts` (`COMPONENT_ALLOW_LIST`, line ~51)
- Test: `src/renderers/renderers.test.ts`

> Depends on Task 1: the renderer only emits a non-empty `accordion` block once the grammar maps its tokens.

- [ ] **Step 1: Write the failing renderer test**

In `src/renderers/renderers.test.ts`, add an import for the scanner near the top (alongside the existing `buildGraph` / `appConfigRenderer` imports):

```ts
import { scanGraph, customPartsByComponent } from "../scanner.js";
```

Then append inside the `describe("appConfigRenderer — recipe emission", …)` block. This runs the real scan→render path, so it proves both that `accordion` emits in the `ui:` block AND that it is not flagged `component-looks-custom` (its only sub-element, `item`, is a real Nuxt slot):

```ts
  it("emits an accordion recipe block, not routed to custom, when accordion-item tokens are present", () => {
    const accordionSources: SourceFile[] = [
      {
        name: "global",
        data: {
          accordion: {
            item: {
              bg: { $type: "color", $value: "#FFFFFF" },
              text: { $type: "color", $value: "#18181B" },
            },
          },
        },
      },
    ];
    const g = buildGraph(accordionSources);
    const customComponents = new Set(customPartsByComponent(scanGraph(g, { components: ["accordion"] })).keys());
    const out = appConfigRenderer.render(g, { customComponents });
    expect(out.text).toContain("accordion: {");
    expect(out.text).toContain("item:");
    expect(customComponents.has("accordion")).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderers/renderers.test.ts`
Expected: FAIL — `out.text` does not contain `accordion: {` because `accordion` is not in `COMPONENT_ALLOW_LIST`, so the renderer skips it.

- [ ] **Step 3: Add `accordion` to `COMPONENT_ALLOW_LIST`**

In `src/renderers/app-config.ts`, change:

```ts
export const COMPONENT_ALLOW_LIST = [
  "button", "badge", "input", "textarea", "card", "modal", "kbd", "chip",
  "checkbox", "radio", "switch", "nav", "dropdown", "table", "progress",
] as const;
```

to (append `"accordion"`):

```ts
export const COMPONENT_ALLOW_LIST = [
  "button", "badge", "input", "textarea", "card", "modal", "kbd", "chip",
  "checkbox", "radio", "switch", "nav", "dropdown", "table", "progress",
  "accordion",
] as const;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderers/renderers.test.ts`
Expected: PASS — `out.text` contains `accordion: {` with an `item:` slot and no `custom/accordion` pointer.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/app-config.ts src/renderers/renderers.test.ts
git commit -m "feat(renderer): add accordion to COMPONENT_ALLOW_LIST so ui.accordion emits"
```

Expected: pre-commit hook passes.

---

## Task 3: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS — all files green (≈ 634 tests), no type errors.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds (`vue-tsc -b` + `vite build`).

- [ ] **Step 3: Confirm the CLI digest is unchanged on the local fixture**

Run: `npm run build:tokens`
Expected: exit 0, scan digest unchanged in character — the committed `components/` fixture has no `accordion` tokens, so this is a no-op there (like the nav bucket). This confirms regression-safety; the new behavior is proven by the unit tests.

- [ ] **Step 4 (optional): Real-export spot-check via git-import**

The real `accordion-item-*` tokens live only in the 914-token export. Optional: import `github.com/clawdbot3535/design-token-export` through the inspector's git-import and confirm `ui.accordion` appears with a populated `slots.item` (and `accordion` is not in `custom-components.ts`). Not required for completion — the unit tests are authoritative.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 `NUXT_SLOTS` entry → Task 1 Step 3. ✓
- Part 2 `COMPONENT_ALLOW_LIST` entry → Task 2 Step 3. ✓
- Success criteria (nuxtSlotsFor set; bg→item; border→border-color; text-disabled state; non-color utilities; buildComponentRecipes emits slots.item; 4 stragglers NULL; not flagged custom) → Task 1 Steps 1/4 + Task 2 Step 1. ✓
- No-op on local fixture (no digest/snapshot change) → Task 3 Step 3. ✓
- Defer 4 stragglers + sidebar → Task 1 straggler-negative test + spec Non-goals (not implemented, by design). ✓

**Placeholder scan:** none — every code/test step shows full content.

**Type consistency:** test assertions use `SlotMappingEntry` fields (`slot`/`utilityType`/`variantAxis`/`variantKey`/`statePrefix`); `recipes["accordion"]?.slots.item` mirrors the existing `?.slots.base` access; `makeNode`/`makeGraph` signatures match `src/recipe-engine.test.ts`; the `SourceFile` shape (`{ name, data }`) matches `renderers.test.ts`'s `recipeSources`. `COMPONENT_ALLOW_LIST` stays `as const`.
