# Drop fully-transparent colour emissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop emitting colour-utility classes whose token resolves to a fully-transparent value (alpha 0), removing dead `border-[var(--color-transparent)]` / `bg-[…]` output and the preview phantom border.

**Architecture:** Extract the opacity check into a shared `src/color-opacity.ts` (one source of truth), have the scanner import it (behaviour-preserving), then gate emission in `recipe-engine.ts` on `COLOR_UTILITY_TYPES.has(utilityType) && !isOpaqueColor(resolved.value)`.

**Tech Stack:** TypeScript engine, Vitest, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `fix/drop-transparent-colors` (spec committed at `8424f6e`).

**Spec:** `docs/superpowers/specs/2026-06-05-drop-transparent-colors-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- The project `typecheck` does NOT cover `.test.ts` — get arities right by hand.
- Verified facts: `resolveTokenToValue("button-ghost-border")` → `"rgba(0, 0, 0, 0)"` (transparent); `"button-outline-border"` → `"#4F63D2"` (opaque). `isOpaqueColor("rgba(0, 0, 0, 0)")` → false; `isOpaqueColor("#4F63D2")` → true.

---

### Task 1: Extract `isOpaqueColor` into a shared module

**Files:**
- Create: `src/color-opacity.ts`
- Create: `src/color-opacity.test.ts`
- Modify: `src/scanner.ts` (delete the local `isOpaqueColor` ~lines 56-69; import from the new module)

- [ ] **Step 1: Write the failing test (new module)**

Create `src/color-opacity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isOpaqueColor } from "./color-opacity.js";

describe("isOpaqueColor", () => {
  it("treats fully-transparent values as not opaque", () => {
    expect(isOpaqueColor("rgba(0, 0, 0, 0)")).toBe(false);
    expect(isOpaqueColor("transparent")).toBe(false);
    expect(isOpaqueColor("#00000000")).toBe(false);
    expect(isOpaqueColor("")).toBe(false);
  });
  it("treats painted values as opaque", () => {
    expect(isOpaqueColor("#4F63D2")).toBe(true);
    expect(isOpaqueColor("#000000ff")).toBe(true);
    expect(isOpaqueColor("rgba(79, 99, 210, 1)")).toBe(true);
    expect(isOpaqueColor("rgb(0, 0, 0)")).toBe(true); // no alpha → opaque even with zero channels
    expect(isOpaqueColor("var(--x)")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/color-opacity.test.ts`
Expected: FAIL — `./color-opacity.js` does not exist.

- [ ] **Step 3: Create the module (verbatim move)**

Create `src/color-opacity.ts` with the function moved byte-for-byte from `scanner.ts` (keep the regexes identical — they were already bug-fixed for `rgb()`):

```typescript
/**
 * True for a colour value that paints (alpha > 0). Fully-transparent values
 * (`transparent`, `rgba(…, 0)`, `#RRGGBB00`, empty) return false. `rgb(…)` (no
 * alpha), plain hex, named colours, and `var(…)` are treated as opaque.
 * Single source of truth — consumed by the scanner (deviation hints) and the
 * recipe engine (dropping transparent emissions).
 */
export function isOpaqueColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "") return false;
  // rgba(r, g, b, a) — alpha is the 4th component.
  const rgba = v.match(/^rgba\(\s*[^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/);
  if (rgba) return parseFloat(rgba[1]!) > 0;
  // rgb(r, g, b) — no alpha channel; always opaque.
  if (/^rgb\([^)]*\)$/.test(v)) return true;
  const hex8 = v.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/);
  if (hex8) return parseInt(hex8[1]!, 16) > 0;
  return true; // #RRGGBB, named colours, var(…)
}
```

- [ ] **Step 4: Rewire the scanner**

In `src/scanner.ts`: delete the local `isOpaqueColor` function (the `/** … */` doc comment + the function body, currently ~lines 56-69) and add an import near the other imports (with `getSlotMapping` / `component-vocab`):

```typescript
import { isOpaqueColor } from "./color-opacity.js";
```

Leave every call site (`isOpaqueColor(value)` in the D2c unframed-variant hint) unchanged.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/color-opacity.test.ts src/scanner.test.ts`
Expected: PASS — the new module tests pass and the scanner's existing tests (including the `rgb()`/`rgba()` opacity cases in the D2c hint) stay green via the imported helper.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/color-opacity.ts src/color-opacity.test.ts src/scanner.ts
git commit -m "refactor(color): extract isOpaqueColor into shared color-opacity module"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

### Task 2: Drop transparent colours in the recipe engine

**Files:**
- Modify: `src/recipe-engine.ts` (import; skip after the resolved-value guard ~line 191)
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/recipe-engine.test.ts` (in the variant-axis describe block, mirroring the existing colour tests):

```typescript
  it("drops a fully-transparent border colour (no class emitted)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-ghost-border", layer: "component", type: "color", source: "global", base: "rgba(0, 0, 0, 0)" }),
      makeNode({ id: "button-ghost-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const cls = recipes.button?.variants.variant?.ghost?.base ?? "";
    expect(cls).not.toContain("border-");
    expect(cls).toContain("text-[#52525B]"); // the opaque sibling still emits
  });

  it("drops a fully-transparent background colour", () => {
    const graph = makeGraph([
      makeNode({ id: "button-link-bg", layer: "component", type: "color", source: "global", base: "rgba(0, 0, 0, 0)" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const cls = recipes.button?.variants.variant?.link?.base ?? "";
    expect(cls).not.toContain("bg-");
  });

  it("keeps opaque colours (transparent rule is value-gated)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe("bg-[#4F63D2]");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/recipe-engine.test.ts`
Expected: FAIL — the transparent border/bg currently emit `border-[rgba(0,0,0,0)]` / `bg-[rgba(0,0,0,0)]` (the `.not.toContain` assertions fail). The opaque test already passes.

- [ ] **Step 3: Import the helper**

In `src/recipe-engine.ts`, add near the other imports:

```typescript
import { isOpaqueColor } from "./color-opacity.js";
```

- [ ] **Step 4: Skip transparent colours**

In `buildComponentRecipes`, immediately after the resolved-value guard (currently lines 190-191):

```typescript
    const resolved = resolveTokenToValue(node.id, graph);
    if ("error" in resolved) continue;
```

add:

```typescript
    // A fully-transparent colour paints nothing — emitting a class (e.g.
    // border-[var(--color-transparent)]) is dead output and trips the preview's
    // border-preflight compensation. Skip it; Nuxt's (equally transparent)
    // default applies.
    if (COLOR_UTILITY_TYPES.has(mapping.utilityType) && !isOpaqueColor(resolved.value)) {
      continue;
    }
```

`COLOR_UTILITY_TYPES` is already defined in this file (~line 65); `mapping` is the non-null
mapping in scope. This runs before the size-redirect and `utilityForMapping`, so the token is
fully skipped (not added to any bucket).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/recipe-engine.test.ts`
Expected: PASS (transparent border/bg drop; opaque solid-bg unchanged).

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. If an existing recipe-engine/renderer test newly fails because it asserted a transparent emission, that test was pinning the dead-output bug — update its expectation to the no-emit behaviour (verify the fixture value is genuinely `rgba(…,0)`/transparent before changing).

- [ ] **Step 7: Commit**

```bash
git add src/recipe-engine.ts src/recipe-engine.test.ts
git commit -m "fix(recipe): drop fully-transparent colour emissions (dead border/bg classes)"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after both tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] `npm run build:tokens` (committed export): confirm `ui.button` has **no**
  `border-[var(--color-transparent)]` / `bg-[var(--color-transparent)]` on any variant;
  ghost/link/solid have no `border-[…]`; `outline` still rings; opaque bgs intact. Quick check:
  `grep -c 'color-transparent' output/nuxt/app.config.ts` should drop to 0 for the button
  variants (the primitive `--color-transparent` definition in tokens.css may remain — that's
  fine).
- [ ] Against the new export (transient swap, restore after — `assets/tokens-20260605-123353.zip`):
  `npm run build:tokens`; confirm none of the ~22 transparent tokens (incl. `button-overlay-*`)
  emit a class. Restore: `git checkout components/ && npm run build:tokens`.
- [ ] Headless (optional): load an export, confirm ghost/link button previews have no phantom 1px border.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** shared helper extraction (Task 1), value-gated drop in the recipe engine (Task 2), opacity + recipe tests. All mapped.
- **Behaviour-preserving extraction:** the function is moved verbatim; the scanner's existing opacity tests (rgb/rgba) guard the move.
- **Value-gated, colour-only:** the skip checks `COLOR_UTILITY_TYPES` so non-colour utilities are untouched; opaque colours pass `isOpaqueColor` and emit as before.
- **No placeholders:** every step has full code + exact command + expected result.
