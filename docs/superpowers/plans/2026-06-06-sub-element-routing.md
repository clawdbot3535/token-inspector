# sub-element slot routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Figma sub-element tokens (`dropdown-item-*`, `table-th-*`, `nav-item-*`) to their Nuxt recipe slot by exact name match against `NUXT_SLOTS`, as a FALLBACK after the normal mapping (so `icon-size` is never disrupted). No aliasing.

**Architecture:** Task 1 widens `RecipeSlot` to `string` (mechanical, no behaviour change). Task 2 rewires `slot-mapping.ts`: extract the match body into a helper, give `parseSegments` an optional `componentSlots` set that consumes a leading exact-match slot segment, and make `heuristicSlotMapping` try the normal match first and only fall back to slot-routing when it is null.

**Tech Stack:** TypeScript engine, Vitest, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/sub-element-routing` (spec committed at `2326bf4`).

**Spec:** `docs/superpowers/specs/2026-06-06-sub-element-routing-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- The project `typecheck` does NOT cover `.test.ts`. `heuristicSlotMapping(tokenId, valueType?)` is **2-arg** (no 3rd arg).
- **Exact match only, no alias.** Naming mismatches (`check`/`row`/`divider`/`dot`) stay unrouted and `unsupported-part`-flagged — do NOT use `FIGMA_NUXT_PART_ALIAS` here.
- Key anchors in `slot-mapping.ts`: `ParsedSegments` interface (~80-94, has `component`, `utility`, `slotPrefix`); `parseSegments(tokenId)` (~96); the empty `SLOT_PREFIXES` map + the seam consuming it (~79, ~119-126); `heuristicSlotMapping` (~330) whose match body is lines ~337-401; `getSlotMapping` (~408). `slot-mapping.ts` already imports from `./component-vocab.js`.

---

### Task 1: widen `RecipeSlot` to `string`

**Files:**
- Modify: `src/slot-mapping.ts`, `src/recipe-engine.ts`

- [ ] **Step 1: Widen the type**

In `src/slot-mapping.ts`, change:
```typescript
export type RecipeSlot = "base" | "leadingIcon" | "trailingIcon" | "label";
```
to:
```typescript
// A Nuxt UI recipe slot name. Common slots: base, leadingIcon, trailingIcon,
// label; sub-element slots (item, th, td, …) are routed from NUXT_SLOTS.
export type RecipeSlot = string;
```

- [ ] **Step 2: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS unchanged — this is type-only; `SLOT_PREFIXES` is still empty so no token routes yet, and `Record<RecipeSlot, …>` in `recipe-engine.ts` still compiles (now `Record<string, …>`). If `recipe-engine.ts` has a spot that relied on the closed union (e.g. an exhaustiveness check), fix it minimally; report it. No test should change.

- [ ] **Step 3: Commit**

```bash
git add src/slot-mapping.ts src/recipe-engine.ts
git commit -m "refactor(slot-mapping): widen RecipeSlot to string for sub-element slots"
```
Verify no attribution trailer; amend if present.

---

### Task 2: exact-match sub-element routing (fallback)

**Files:**
- Modify: `src/slot-mapping.ts`
- Test: `src/slot-mapping.test.ts`, `src/recipe-engine.test.ts` (+ golden snapshot)

- [ ] **Step 1: Write failing tests**

In `src/slot-mapping.test.ts`, add (the helper is the 2-arg `heuristicSlotMapping`; match the import already used in the file):

```typescript
describe("sub-element slot routing (exact-match NUXT_SLOTS, fallback)", () => {
  it("routes dropdown-item-* to the item slot", () => {
    const m = heuristicSlotMapping("dropdown-item-padding-x");
    expect(m?.slot).toBe("item");
  });
  it("routes table-th-* to the th slot", () => {
    expect(heuristicSlotMapping("table-th-bg")?.slot).toBe("th");
  });
  it("routes nav-item-* to the item slot", () => {
    expect(heuristicSlotMapping("nav-item-radius")?.slot).toBe("item");
  });
  it("does NOT regress icon-size (stays leadingIcon, even when the component has an icon slot)", () => {
    expect(heuristicSlotMapping("button-icon-size-md")?.slot).toBe("leadingIcon");
    expect(heuristicSlotMapping("checkbox-icon-size-md")?.slot).toBe("leadingIcon");
  });
  it("does NOT route a naming-mismatch part (checkbox-check stays unrouted)", () => {
    // "check" is not an exact checkbox slot (Nuxt uses "icon") → unsupported-part flags it elsewhere.
    expect(heuristicSlotMapping("checkbox-check-color")?.slot).not.toBe("check");
  });
  it("does not route for a component with no NUXT_SLOTS entry", () => {
    const m = heuristicSlotMapping("widget-item-padding-x");
    // no inventory → "item" cannot be a known slot → either null or slot 'base', never 'item'.
    expect(m?.slot).not.toBe("item");
  });
});
```

(Verify the exact `slot` strings against the real grammar when you run them; if `dropdown-item-padding-x`'s utility doesn't match a rule even after routing, pick a sub-element token that does — e.g. `dropdown-item-bg` → `item` — and note the change.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: FAIL — sub-element tokens currently return `null` (utility `item-padding-x` matches no rule; `SLOT_PREFIXES` empty).

- [ ] **Step 3: Add the `componentSlots` param to `parseSegments`**

- Import `nuxtSlotsFor` from `./component-vocab.js` (add to the existing import).
- Remove the empty `const SLOT_PREFIXES … = new Map();`.
- Change `parseSegments`'s signature to `function parseSegments(tokenId: string, componentSlots?: ReadonlySet<string>): ParsedSegments | null`.
- In the seam (the block that currently does `if (slotSeg !== undefined && SLOT_PREFIXES.has(slotSeg)) { slotPrefix = …; start += 1; }`), replace the condition with an exact-match against `componentSlots`:
  ```typescript
  const slotSeg = parts[start];
  if (
    slotSeg !== undefined &&
    slotSeg !== "base" &&
    componentSlots !== undefined &&
    componentSlots.has(slotSeg)
  ) {
    slotPrefix = slotSeg;
    start += 1;
  }
  ```
  (When `componentSlots` is omitted — the normal first pass — nothing is consumed, exactly today's behaviour.)

- [ ] **Step 4: Extract the match body into a helper**

Extract the body of `heuristicSlotMapping` from `const slot: RecipeSlot = parsed.slotPrefix ?? "base";` through the final `return null;` (the prop-driven check, the `text`/`border`/`ring-width`/`border-width` special cases, and the `HEURISTIC_RULES` loop) into a new function:

```typescript
function matchParsed(parsed: ParsedSegments, valueType?: string): SlotMappingEntry | null {
  const slot: RecipeSlot = parsed.slotPrefix ?? "base";
  const ctx: BuildContext = {
    variant: parsed.variant,
    colorRole: parsed.colorRole,
    size: parsed.size,
    state: parsed.state,
  };
  // …(unchanged: prop-driven drop, text-color, border→ring, ring-width, border-width,
  //    the HEURISTIC_RULES loop, return null)…
}
```

- [ ] **Step 5: Rewire `heuristicSlotMapping` with the fallback**

```typescript
export function heuristicSlotMapping(
  tokenId: string,
  valueType?: string,
): SlotMappingEntry | null {
  const parsed = parseSegments(tokenId);
  if (!parsed) return null;

  // 1) Normal mapping — no sub-element routing. icon-size and every existing
  //    rule win here, so this path is regression-free.
  const normal = matchParsed(parsed, valueType);
  if (normal) return normal;

  // 2) Fallback: route a leading segment that EXACTLY matches a Nuxt slot of
  //    this component (from NUXT_SLOTS). No aliasing — naming mismatches stay
  //    null and are surfaced by the unsupported-part hint.
  const slots = nuxtSlotsFor(parsed.component);
  if (slots) {
    const routed = parseSegments(tokenId, slots);
    if (routed && routed.slotPrefix !== null) {
      const m = matchParsed(routed, valueType);
      if (m) return m;
    }
  }
  return null;
}
```

(`getSlotMapping` is unchanged — it still delegates to `heuristicSlotMapping`.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: PASS — item/th/nav-item route; icon-size unregressed; check/uninventoried not routed.

- [ ] **Step 7: Recipe-engine test + golden snapshot**

Add to `src/recipe-engine.test.ts` (variant/slot describe area):
```typescript
  it("emits a sub-element slot for an exact-match Nuxt slot token", () => {
    const graph = makeGraph([
      makeNode({ id: "dropdown-item-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["dropdown"] });
    // dropdown-item-bg → slots.item carries the bg utility (not slots.base).
    expect(recipes.dropdown?.slots["item"] ?? "").toContain("bg-[");
    expect(recipes.dropdown?.slots["base"] ?? "").not.toContain("bg-[");
  });
```
Run `npx vitest run src/recipe-engine.test.ts`. If a golden snapshot test fails because a snapshotted recipe now includes routed sub-element slots, review the diff (additions only for the routed slots; existing slots unchanged) and update it: `npx vitest run -u src/recipe-engine.test.ts`. Report what the snapshot gained.

- [ ] **Step 8: Typecheck + full suite + build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/slot-mapping.ts src/slot-mapping.test.ts src/recipe-engine.test.ts src/__snapshots__/recipe-engine.test.ts.snap
git commit -m "feat(slot-mapping): exact-match sub-element slot routing (fallback after normal match)"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after both tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Against the export (`npm run build:tokens`, on the committed `components/`): confirm the
  generated `app.config` now has **`item`** slots for `dropdown`/`nav` and a **`th`** slot for
  `table`; confirm `button`/`input`/`checkbox` `icon-size` still land on `leadingIcon` (diff those
  recipes vs `main` — unchanged); confirm the `unsupported-part` set is **unchanged**
  (chip-label/close, button-overlay, table-row/divider, checkbox-check still flagged). List the
  newly-emitted sub-element slots and any unexpected new routing.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by
  fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** RecipeSlot→string (Task 1); exact-match fallback routing via `NUXT_SLOTS`,
  no alias, normal-match-first (Task 2 steps 3-5); icon-size no-regression + mismatch-not-routed +
  uninventoried-skip tests; recipe-engine emits sub-element slot + snapshot (Task 2 step 7). All mapped.
- **Regression safety:** the fallback only runs when the normal match is null, so `icon-size` and
  every existing rule are untouched (Step 5 ordering). Task 1 is type-only.
- **No alias:** `FIGMA_NUXT_PART_ALIAS` is deliberately not imported here.
- **No placeholders:** full code for the seam, the helper signature, the rewired function, and tests.
