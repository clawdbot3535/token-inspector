# Variant-after-Sub-Element + nav Overlay Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map component tokens whose Nuxt variant / `overlay` marker sits after a sub-element slot (e.g. `nav-item-ghost-bg`, `nav-item-overlay-dark-ghost-bg`), unblocking ~35 NULL nav tokens and nav overlay recipes.

**Architecture:** Two small, parallel, additive changes sharing one principle — "a structuring marker may sit after a sub-element, not only at the fixed 2nd segment." (1) `parseSegments` gains a post-`slotPrefix` variant/color-role check (grammar package, fallback path only). (2) `stripOverlayPrefix` gains a second case for `overlay` after a sub-element slot (src). `buildOverlayRecipes` is already component-agnostic and needs no change.

**Tech Stack:** TypeScript, Vitest, npm workspace (`@tg/grammar` consumed by `src/`). ESM (`.js` import suffix). `noUncheckedIndexedAccess` is ON. Pre-commit hook runs `vue-tsc` + full vitest on every commit.

**Spec:** `docs/superpowers/specs/2026-06-12-nav-variant-after-subelement-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/slot-mapping.ts` — `parseSegments` (new post-slotPrefix block) + top-of-file shape docstring. (`BUTTON_VARIANT_KEYS`/`COLOR_ROLE_KEYS` already imported.)
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — variant-after-sub-element + regression/negative cases.
- **Modify** `src/custom-recipe-engine.ts` — `stripOverlayPrefix` (case 2) + add `nuxtSlotsFor` to the `@tg/grammar` import + two docstrings.
- **Modify** `src/custom-recipe-engine.test.ts` — flip the two "deferred" tests to the new behavior + add negative cases.

No renderer / build-cli / App.vue / scanner changes.

---

## Task 1: Parser — variant after sub-element

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts` (`parseSegments`, between the `slotPrefix` seam ending ~line 128 and the size/state strip ~line 130; docstring ~lines 17-24)
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/grammar/src/slot-mapping.test.ts`:

```ts
describe("heuristicSlotMapping — variant after sub-element (nav)", () => {
  it("maps nav-item-ghost-bg to item slot + ghost variant", () => {
    expect(heuristicSlotMapping("nav-item-ghost-bg")).toEqual({
      slot: "item",
      utilityType: "bg-color",
      variantAxis: "variant",
      variantKey: "ghost",
    });
  });

  it("maps nav-item-link-text to item slot + link variant (text-color)", () => {
    expect(heuristicSlotMapping("nav-item-link-text", "color")).toEqual({
      slot: "item",
      utilityType: "text-color",
      variantAxis: "variant",
      variantKey: "link",
    });
  });

  it("maps a color-role after a sub-element (nav-item-primary-bg)", () => {
    expect(heuristicSlotMapping("nav-item-primary-bg")).toEqual({
      slot: "item",
      utilityType: "bg-color",
      variantAxis: "color",
      variantKey: "primary",
    });
  });

  it("carries a trailing state on a variant-after-sub-element token", () => {
    expect(heuristicSlotMapping("nav-item-ghost-bg-hover")).toEqual({
      slot: "item",
      utilityType: "bg-color",
      variantAxis: "variant",
      variantKey: "ghost",
      statePrefix: "hover",
    });
  });

  it("does not change variant-at-2nd-segment tokens (button-ghost-bg)", () => {
    expect(heuristicSlotMapping("button-ghost-bg")).toEqual({
      slot: "base",
      utilityType: "bg-color",
      variantAxis: "variant",
      variantKey: "ghost",
    });
  });

  it("stays NULL when the segment after the sub-element is not a variant", () => {
    expect(heuristicSlotMapping("nav-item-foo-bg")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: the four nav cases FAIL (currently NULL); `button-ghost-bg` and `nav-item-foo-bg` already pass.

- [ ] **Step 3: Implement the post-slotPrefix variant check**

In `packages/grammar/src/slot-mapping.ts`, in `parseSegments`, immediately AFTER the `slotPrefix` seam block (the `if (slotSeg !== undefined && … ) { slotPrefix = slotSeg; start += 1; }` block) and BEFORE the `// Last segment may be a size or state suffix.` comment, insert:

```ts
  // Seam (bucket B): a Nuxt variant / color-role may sit AFTER the sub-element
  // prefix, not only at the fixed 2nd segment (e.g. `nav-item-ghost-bg` =
  // item slot + ghost variant + bg utility). Fires only when a slot prefix was
  // just consumed, no variant was found at the 2nd segment, and a utility
  // segment remains. Honours both BUTTON_VARIANT_KEYS and COLOR_ROLE_KEYS,
  // mirroring the 2nd-segment logic.
  if (slotPrefix !== null && variant === null && colorRole === null) {
    const afterSlot = parts[start];
    if (afterSlot !== undefined && end - start > 1) {
      if (BUTTON_VARIANT_KEYS.has(afterSlot)) { variant = afterSlot; start += 1; }
      else if (COLOR_ROLE_KEYS.has(afterSlot)) { colorRole = afterSlot; start += 1; }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS (all new cases green, existing 91 unchanged).

- [ ] **Step 5: Update the shape docstring**

In `packages/grammar/src/slot-mapping.ts`, update the token-id-shape comment near the top. Change the line:

```
//   <component>-[<variant>-]<utility...>[-<size|state>]
```

to:

```
//   <component>-[<sub-element>-][<variant>-]<utility...>[-<size|state>]
//   The <variant> may follow a recognised sub-element slot (e.g.
//   `nav-item-ghost-bg`), not only sit at the fixed 2nd segment.
```

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "feat(nav): map a Nuxt variant/color-role after a sub-element slot"
```

---

## Task 2: Overlay — stripOverlayPrefix after sub-element + nav overlay recipes

**Files:**
- Modify: `src/custom-recipe-engine.ts` (`@tg/grammar` import line 10; `stripOverlayPrefix` ~lines 98-109; its docstring ~lines 90-96)
- Test: `src/custom-recipe-engine.test.ts` (flip the two deferred tests + add negatives)

> Depends on Task 1: `buildOverlayRecipes` maps the stripped `nav-item-ghost-bg` logical id via the Task 1 parser change. Do Task 1 first.

- [ ] **Step 1: Write/flip the failing tests**

(a) In `src/custom-recipe-engine.test.ts`, REPLACE the existing test at the `stripOverlayPrefix` describe block (the one titled `"is a no-op when overlay sits after a sub-element (deferred nav case)"`):

```ts
  it("is a no-op when overlay sits after a sub-element (deferred nav case)", () => {
    expect(stripOverlayPrefix("nav-item-overlay-dark-ghost-bg")).toEqual({
      logicalId: "nav-item-overlay-dark-ghost-bg",
      mode: null,
    });
  });
```

with:

```ts
  it("strips an overlay marker after a recognised sub-element slot", () => {
    expect(stripOverlayPrefix("nav-item-overlay-dark-ghost-bg")).toEqual({
      logicalId: "nav-item-ghost-bg",
      mode: "dark",
    });
  });

  it("is a no-op when the segment before overlay is not a known slot", () => {
    expect(stripOverlayPrefix("nav-xyz-overlay-dark-bg")).toEqual({
      logicalId: "nav-xyz-overlay-dark-bg",
      mode: null,
    });
  });

  it("is a no-op for a bad overlay mode after a sub-element", () => {
    expect(stripOverlayPrefix("nav-item-overlay-foo-bg")).toEqual({
      logicalId: "nav-item-overlay-foo-bg",
      mode: null,
    });
  });
```

(b) In the `buildOverlayRecipes` describe block, REPLACE the existing test titled `"defers sub-element overlay tokens (nav-item-overlay-*) — emits nothing"`:

```ts
  it("defers sub-element overlay tokens (nav-item-overlay-*) — emits nothing", () => {
    const graph = ovGraph([ ovNode("nav-item-overlay-dark-ghost-bg", "#FAFAFA") ]);
    expect(buildOverlayRecipes(graph)).toEqual({});
  });
```

with:

```ts
  it("emits a nav overlay recipe for an overlay token after a sub-element", () => {
    const graph = ovGraph([ ovNode("nav-item-overlay-dark-ghost-bg", "#FAFAFA") ]);
    const recipes = buildOverlayRecipes(graph);
    expect(recipes["navOverlayDark"]).toBeDefined();
    expect(recipes["navOverlayDark"].variants.variant?.ghost?.item).toMatch(/bg-\[/);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/custom-recipe-engine.test.ts`
Expected: the new `nav-item-overlay-dark-ghost-bg` strip test and the `navOverlayDark` emit test FAIL (current code returns `mode: null` / `{}`); the two negative cases already pass.

- [ ] **Step 3a: Add the `nuxtSlotsFor` import**

In `src/custom-recipe-engine.ts`, line 10 currently reads:

```ts
import { COLOR_ROLE_KEYS, getSlotMapping, type SlotMappingOverride } from "@tg/grammar";
```

Change it to:

```ts
import { COLOR_ROLE_KEYS, getSlotMapping, nuxtSlotsFor, type SlotMappingOverride } from "@tg/grammar";
```

- [ ] **Step 3b: Implement `stripOverlayPrefix` case 2**

In `src/custom-recipe-engine.ts`, replace the body of `stripOverlayPrefix` (currently the early-return version) with:

```ts
export function stripOverlayPrefix(tokenId: string): {
  logicalId: string;
  mode: OverlayMode | null;
} {
  const parts = tokenId.split("-");
  // Case 1: overlay at the fixed 2nd segment — `comp-overlay-<mode>-<utility...>`.
  if (parts.length >= 4 && parts[1] === "overlay") {
    const mode = parts[2];
    if (mode === "light" || mode === "dark") {
      return { logicalId: [parts[0], ...parts.slice(3)].join("-"), mode };
    }
  }
  // Case 2: overlay after a recognised sub-element slot —
  // `comp-<sub>-overlay-<mode>-<utility...>` (e.g. nav-item-overlay-dark-ghost-bg).
  // The logical id keeps the sub-element; the variant-after-sub-element parser
  // change then maps it.
  if (parts.length >= 5 && parts[2] === "overlay") {
    const sub = parts[1];
    const slots = sub !== undefined ? nuxtSlotsFor(parts[0]!) : undefined;
    if (sub !== undefined && slots?.has(sub)) {
      const mode = parts[3];
      if (mode === "light" || mode === "dark") {
        return { logicalId: [parts[0], sub, ...parts.slice(4)].join("-"), mode };
      }
    }
  }
  return { logicalId: tokenId, mode: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/custom-recipe-engine.test.ts`
Expected: PASS (flipped tests + negatives green; the existing 2nd-segment overlay tests still pass).

- [ ] **Step 5: Update the `stripOverlayPrefix` docstring**

In `src/custom-recipe-engine.ts`, replace the docstring above `stripOverlayPrefix` (currently states the nav case is "deferred") with:

```ts
/**
 * Detects an `overlay-light`/`overlay-dark` marker and returns the logical base
 * id with the marker removed plus the mode. The marker may sit either at the
 * fixed 2nd segment (`button-overlay-dark-solid-bg` → `button-solid-bg`) or
 * after a recognised sub-element slot (`nav-item-overlay-dark-ghost-bg` →
 * `nav-item-ghost-bg`). Returns mode `null` when no overlay marker is present,
 * the mode is invalid, or the pre-overlay segment is not a known slot.
 */
```

- [ ] **Step 6: Commit**

```bash
git add src/custom-recipe-engine.ts src/custom-recipe-engine.test.ts
git commit -m "feat(nav): strip overlay marker after a sub-element so nav overlay recipes emit"
```

---

## Task 3: Full gate + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS — all 47 files green, including the new nav cases (≈ 619 tests), no type errors.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds (`vue-tsc -b` + `vite build`), confirming the `nuxtSlotsFor` import resolves through `@tg/grammar` for the web bundle.

- [ ] **Step 3: Confirm no regression on the local fixture's CLI digest**

Run: `npm run build:tokens`
Expected: exit 0, scan digest unchanged in character (the committed `components/` fixture has no `nav-item-*` variant tokens, so this change is a no-op there — it does not introduce new errors). This confirms regression-safety; the new behavior is proven by the unit tests in Tasks 1-2.

- [ ] **Step 4 (optional): Real-export spot-check**

The actual `nav-item-*` tokens live only in the new 914-token export (not the repo). If a manual check is wanted, import `github.com/clawdbot3535/design-token-export` via the inspector's git-import in the web app and confirm `ui.nav` now carries `item` variant entries and that `custom-components.ts` shows `navOverlayDark`/`navOverlayLight`. Not required for completion.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 parser variant-after-sub-element (both key sets) → Task 1 (block honours `BUTTON_VARIANT_KEYS` + `COLOR_ROLE_KEYS`; color-role case tested). ✓
- Fallback-path-only / regression-free → Task 1 `button-ghost-bg` regression test + the `slotPrefix !== null` guard. ✓
- Part 2 `stripOverlayPrefix` case 2 + `nuxtSlotsFor` → Task 2 Steps 3a/3b. ✓
- `buildOverlayRecipes` unchanged, nav emits → Task 2 Step 1(b) emit test. ✓
- Flip the two obsolete "deferred" tests → Task 2 Step 1(a)/(b). ✓
- Negative/guard cases (bad mode, non-slot prefix) → Task 2 Step 1(a). ✓
- Docstrings updated → Task 1 Step 5, Task 2 Step 5. ✓
- No renderer/CLI/scanner change → confirmed in File Structure + Task 3. ✓

**Placeholder scan:** none — every code/test step is complete.

**Type consistency:** `parseSegments` locals (`variant`, `colorRole`, `start`, `end`, `slotPrefix`) match the existing function. `stripOverlayPrefix` returns `{ logicalId: string; mode: OverlayMode | null }` consistently. Test assertions use `SlotMappingEntry` field names (`slot`/`utilityType`/`variantAxis`/`variantKey`/`statePrefix`) matching the type, and the `recipes[...].variants.variant?.ghost?.item` access mirrors the existing `?.solid?.base` pattern.
