# D2c — Button variant-conditional ring + `border-width` grammar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the heuristic that the button `outline`/`subtle` variants are ring-framed, so their `border` → `ring-color` and `border-width` → `ring-width`, emit those as `ring-[…]`, render them in the LiveButton preview without the JIT, and flag an opaque border on an unframed button variant.

**Architecture:** A new per-variant ring-framing table (`RING_FRAMED_VARIANTS`) in `component-vocab.ts` drives a widened border intercept in `slot-mapping.ts`. Two new `UtilityType` members (`border-width`, `ring-width`) flow through the existing arbitrary-value emit path in `recipe-engine.ts` (`ring-[1px]` / `border-[1px]`). The preview (`extract-arbitrary.ts`) learns to split length-vs-color for `ring-[…]` / `border-[…]`. The scanner gains an opacity-gated hint for borders on unframed variants.

**Tech Stack:** TypeScript (pure engine modules + Vue 3 preview), Vitest, vue-tsc. Pre-commit hook runs `vue-tsc` + the full vitest suite, so **every task commit must be green**.

**Branch:** `fix/d2c-variant-rings` (already checked out, cut from `main`).

**Spec:** `docs/superpowers/specs/2026-06-05-d2c-button-variant-rings-design.md`

**Critical sequencing constraint:** Adding members to the `UtilityType` union makes the exhaustive `switch` statements in `recipe-engine.ts` (`prefixForUtility`, `shadowIdFor`) fail to compile until their new cases are added. Therefore Task 3 adds the new types **and** all switch cases in one commit. Task 2 (the visible outline-border→ring fix) needs no new types — `ring-color` already exists — so it lands first and small.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `src/component-vocab.ts` | `RING_FRAMED_VARIANTS` table + `isRingFramedVariant` helper | 1 |
| `src/component-vocab.test.ts` | unit test for the helper | 1 |
| `src/slot-mapping.ts` | widened border intercept; new `border-width`/`ring-width` utility types + rule | 2, 3 |
| `src/slot-mapping.test.ts` | update flipped assertions; add new mappings | 2, 3 |
| `src/recipe-engine.ts` | arbitrary-value emit + prefix + shadow-id for new types | 3 |
| `src/recipe-engine.test.ts` | update flipped assertion; add emit tests | 3 |
| `src/app/extract-arbitrary.ts` | length-vs-color split for `ring-[…]`/`border-[…]` | 4 |
| `src/app/extract-arbitrary.test.ts` | preview unit tests | 4 |
| `src/app/components/LiveButton.test.ts` | outline-ring smoke test | 5 |
| `src/scanner.ts` | opacity-gated unframed-variant-border hint | 6 |
| `src/scanner.test.ts` | hint fires/doesn't-fire tests | 6 |

---

### Task 1: Per-variant ring-framing vocabulary

**Files:**
- Modify: `src/component-vocab.ts` (after `RING_FRAMED_COMPONENTS`, ends line 37)
- Test: `src/component-vocab.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/component-vocab.test.ts`. Update the import on line 2 to include the new symbols:

```typescript
import {
  BUTTON_VARIANT_KEYS,
  COLOR_ROLE_KEYS,
  KNOWN_VARIANT_NAMES,
  SIZE_KEYS,
  STATE_KEYS,
  RING_FRAMED_VARIANTS,
  isRingFramedVariant,
} from "./component-vocab";
```

Add this `describe` block at the end of the file:

```typescript
describe("RING_FRAMED_VARIANTS / isRingFramedVariant", () => {
  it("marks button outline and subtle as ring-framed", () => {
    expect(isRingFramedVariant("button", "outline")).toBe(true);
    expect(isRingFramedVariant("button", "subtle")).toBe(true);
  });
  it("does not mark solid/ghost/link as ring-framed", () => {
    expect(isRingFramedVariant("button", "solid")).toBe(false);
    expect(isRingFramedVariant("button", "ghost")).toBe(false);
    expect(isRingFramedVariant("button", "link")).toBe(false);
  });
  it("returns false for a null variant or an unknown component", () => {
    expect(isRingFramedVariant("button", null)).toBe(false);
    expect(isRingFramedVariant("input", "outline")).toBe(false);
  });
  it("framed variant keys are a subset of BUTTON_VARIANT_KEYS", () => {
    for (const v of RING_FRAMED_VARIANTS.get("button") ?? []) {
      expect(BUTTON_VARIANT_KEYS.has(v)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/component-vocab.test.ts`
Expected: FAIL — `isRingFramedVariant`/`RING_FRAMED_VARIANTS` are not exported (TS / import error).

- [ ] **Step 3: Add the table and helper**

In `src/component-vocab.ts`, insert after the `RING_FRAMED_COMPONENTS` declaration (after line 37):

```typescript
/**
 * Components whose ring frame is *variant-conditional*: only the listed
 * variants draw a Tailwind `ring`; the others have no frame. Distinct from
 * RING_FRAMED_COMPONENTS, where every `border-*` token is a ring. Nuxt UI v4
 * frames the button `outline` and `subtle` variants with `ring ring-inset`;
 * `solid`/`soft`/`ghost`/`link` have no frame (their `border` tokens are
 * transparent placeholders). `subtle` is included for Nuxt-correctness even
 * though the current export defines no `subtle` tokens.
 */
export const RING_FRAMED_VARIANTS: ReadonlyMap<string, ReadonlySet<string>> =
  new Map([["button", new Set(["outline", "subtle"])]]);

/** True when `component`'s `variant` draws a Tailwind ring frame (D2c). */
export function isRingFramedVariant(
  component: string,
  variant: string | null,
): boolean {
  if (variant === null) return false;
  return RING_FRAMED_VARIANTS.get(component)?.has(variant) ?? false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/component-vocab.test.ts`
Expected: PASS (all four new cases + the existing four).

- [ ] **Step 5: Commit**

```bash
git add src/component-vocab.ts src/component-vocab.test.ts
git commit -m "feat(vocab): RING_FRAMED_VARIANTS for variant-conditional ring framing (button outline/subtle)"
```

---

### Task 2: Outline `border` → `ring-color` (visible fix, no new types)

**Files:**
- Modify: `src/slot-mapping.ts` (border intercept, lines 349-355; import line 71)
- Test: `src/slot-mapping.test.ts` (flip lines 79-96; add new cases)

- [ ] **Step 1: Update the flipped assertions to the new expected behavior (RED)**

In `src/slot-mapping.test.ts`, replace the existing `button-outline-border` block (lines 79-86) so it expects `ring-color`:

```typescript
  it("maps button-outline-border to ring-color on the outline variant (D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "variant",
      variantKey: "outline",
    });
  });
```

Replace the existing `button-outline-border-disabled` block (lines 88-96) so it expects `ring-color`:

```typescript
  it("maps button-outline-border-disabled to ring-color with disabled prefix (D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border-disabled")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "variant",
      variantKey: "outline",
      statePrefix: "disabled",
    });
  });
```

Add two new cases in the same `describe("heuristicSlotMapping — variant axis …")` block (e.g. after the disabled case): an unframed variant stays `border-color`, and a hover state on outline:

```typescript
  it("keeps button-solid-border as border-color (solid is not ring-framed)", () => {
    expect(heuristicSlotMapping("button-solid-border")).toEqual({
      slot: "base",
      utilityType: "border-color",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("maps button-outline-border-hover to ring-color with hover prefix (D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border-hover")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "variant",
      variantKey: "outline",
      statePrefix: "hover",
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: FAIL — the two outline cases currently return `border-color` (intercept only fires for `RING_FRAMED_COMPONENTS`); the new hover case fails too. The solid case already passes.

- [ ] **Step 3: Widen the border intercept**

In `src/slot-mapping.ts`, update the import on line 71 to add `isRingFramedVariant`:

```typescript
import { BUTTON_VARIANT_KEYS, COLOR_ROLE_KEYS, SIZE_KEYS, STATE_KEYS, RING_FRAMED_COMPONENTS, isRingFramedVariant } from "./component-vocab.js";
```

Replace the border intercept (lines 349-355) with a version that also fires for ring-framed variants. Keep the comment accurate:

```typescript
  // Ring-framed components (input, checkbox, …) draw their frame as a Tailwind
  // `ring`, not a CSS border, so a bare `border` utility emits ring-color.
  // Variant-conditional framers (button) ring only specific variants
  // (outline/subtle) — those redirect to ring-color too; their other variants
  // (solid/ghost/link) keep border-color. Genuine border framers (table, nav)
  // fall through to the border-color rule below.
  const ringFramed =
    RING_FRAMED_COMPONENTS.has(parsed.component) ||
    isRingFramedVariant(parsed.component, parsed.variant);
  if (parsed.utility === "border" && ringFramed) {
    return buildEntry(slot, "ring-color", ctx);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: PASS. Also run the full suite to confirm nothing else (e.g. recipe-engine) regressed yet — `recipe-engine.test.ts` line 244 will now FAIL because `button-outline-border` emits `ring-[…]`; that is fixed in Task 3. To keep this commit green, **also apply the Task 3 Step 1 recipe-test edit now** is NOT allowed (it needs the emit code). Instead, defer: run only the targeted file here, and do the recipe flip + emit together in Task 3.

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: PASS (targeted).

> ⚠️ Do not run the full suite as the commit gate for this task in isolation — `recipe-engine.test.ts:244` depends on Task 3. If the pre-commit hook (full suite) blocks the commit, proceed directly into Task 3 and commit Task 2 + Task 3 changes together under the Task 3 commit. (See "Commit grouping note" below.)

- [ ] **Step 5: Commit (see grouping note)**

```bash
git add src/slot-mapping.ts src/slot-mapping.test.ts
git commit -m "fix(slot-mapping): button outline/subtle border emits ring-color, not invisible border-color"
```

**Commit grouping note:** The pre-commit hook runs the full suite, and `recipe-engine.test.ts:244` asserts the *old* `outline.base === "border-[#5667A7]"`. That assertion flips in Task 3. If you implement strictly task-by-task, the Task 2 commit will be blocked by that one stale assertion. Two acceptable resolutions:
1. **Preferred:** Make the Task 3 Step 1 edit to `recipe-engine.test.ts:244` (changing the expectation to `ring-[#5667A7]`) part of the **Task 2** staged changes, so the full suite is green at the Task 2 commit. Then Task 3 only adds the new `border-width`/`ring-width` machinery. Update the Task 2 `git add` to include `src/recipe-engine.test.ts`.
2. Combine Task 2 and Task 3 into a single commit.

Use resolution 1. Concretely, in Task 2 Step 1 also apply this edit to `src/recipe-engine.test.ts` (line 244):

```typescript
    expect(v?.outline?.base).toBe("ring-[#5667A7]"); // D2c: outline border → ring
```

…and add `src/recipe-engine.test.ts` to the Task 2 `git add`. With that, the full suite is green at the Task 2 commit (this single assertion is the only recipe-engine dependency on the old behavior; the emit path already produces `ring-[…]` because `ring-color` is a long-existing, fully-wired utility type).

---

### Task 3: `border-width` / `ring-width` utility types + emit

**Files:**
- Modify: `src/slot-mapping.ts` (UtilityType union ~lines 30-51; header comment ~line 6; intercept; HEURISTIC_RULES)
- Modify: `src/recipe-engine.ts` (`ARBITRARY_VALUE_TYPES` ~line 77; `prefixForUtility` ~line 362; `shadowIdFor` ~line 270)
- Test: `src/slot-mapping.test.ts`, `src/recipe-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/slot-mapping.test.ts` (in the variant-axis describe block, or a new D2c block):

```typescript
  it("maps button-outline-border-width to ring-width on the outline variant (D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border-width")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: "variant",
      variantKey: "outline",
    });
  });

  it("maps an unframed-variant border-width to the border-width utility", () => {
    expect(heuristicSlotMapping("button-solid-border-width")).toEqual({
      slot: "base",
      utilityType: "border-width",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("maps a component-level border-width (no variant) to border-width", () => {
    expect(heuristicSlotMapping("table-border-width")).toEqual({
      slot: "base",
      utilityType: "border-width",
      variantAxis: null,
      variantKey: null,
    });
  });
```

Add to `src/recipe-engine.test.ts` (in the variant-axis describe block):

```typescript
  it("emits ring-[Npx] for an outline border-width token (D2c)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-outline-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.outline?.base).toBe("ring-[1px]");
  });

  it("emits border-[Npx] for an unframed-variant border-width token", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-border-width", layer: "component", type: "number", source: "global", base: "2px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe("border-[2px]");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/slot-mapping.test.ts src/recipe-engine.test.ts`
Expected: FAIL — `border-width` is unrecognized (`heuristicSlotMapping` returns `null`); `ring-width`/`border-width` are not valid `UtilityType` members (TS errors in the test expectations).

- [ ] **Step 3: Add the utility types**

In `src/slot-mapping.ts`, add to the `UtilityType` union (after `"border-color"` on line 40 / near the color group, and `"width"`):

```typescript
  | "border-color"
  | "border-width"
  | "ring-color"
  | "ring-width"
```

Update the header doc comment block (lines 4-11) to mention `border-width | ring-width` alongside the other utility names (one-line addition, keep the list accurate).

- [ ] **Step 4: Add the border-width intercept + fallback rule**

In `src/slot-mapping.ts`, immediately after the `border` intercept added in Task 2, add the `border-width` intercept:

```typescript
  if (parsed.utility === "border-width" && ringFramed) {
    return buildEntry(slot, "ring-width", ctx);
  }
```

In the `HEURISTIC_RULES` array, add a fallback rule for the non-framed case. Place it right after the existing `border` rule (the `{ match: (u) => u === "border", … }` entry near line 271):

```typescript
  {
    match: (u) => u === "border-width",
    build: (ctx) => buildEntry("base", "border-width", ctx),
  },
```

- [ ] **Step 5: Wire the emit path in `recipe-engine.ts`**

Add both new types to `ARBITRARY_VALUE_TYPES` (after `"width"`, ~line 79):

```typescript
const ARBITRARY_VALUE_TYPES: ReadonlySet<UtilityType> = new Set<UtilityType>([
  "height",
  "width",
  "border-width",
  "ring-width",
  "line-height",
  "letter-spacing",
  "ring-offset",
  "font-family",
  "padding",
]);
```

Add cases to `prefixForUtility` (the `switch`, ~line 362). `ring-width` reuses the `ring-` prefix, `border-width` the `border-` prefix (Tailwind disambiguates `ring-[1px]` width vs `ring-[#hex]` color by value shape):

```typescript
    case "border-color":
      return "border-";
    case "border-width":
      return "border-";
    case "ring-color":
      return "ring-";
    case "ring-width":
      return "ring-";
```

Add both to the `shadowIdFor` arbitrary group (the `switch`, ~line 290-298) so the exhaustive switch compiles:

```typescript
    case "height":
    case "width":
    case "border-width":
    case "ring-width":
    case "line-height":
    case "letter-spacing":
    case "ring-offset":
    case "font-family":
    case "padding":
      // Arbitrary-value types — bypass classification entirely; id never read.
      return "arbitrary-temp";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/slot-mapping.test.ts src/recipe-engine.test.ts`
Expected: PASS (new D2c cases green; the flipped line-244 assertion from Task 2 stays green).

- [ ] **Step 7: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS — the exhaustive switches now cover the new members; no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/slot-mapping.ts src/recipe-engine.ts src/slot-mapping.test.ts src/recipe-engine.test.ts
git commit -m "feat(grammar): border-width/ring-width utility types — outline border-width emits ring-[Npx]"
```

---

### Task 4: Preview — split length vs color for `ring-[…]` / `border-[…]`

**Files:**
- Modify: `src/app/extract-arbitrary.ts` (`ring` branch ~lines 147-149; `border` handling via `ARBITRARY_TO_CSS`; add `isLengthValue` helper)
- Test: `src/app/extract-arbitrary.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/app/extract-arbitrary.test.ts` (inside the `describe("extractArbitrary", …)` block):

```typescript
  // D2c: ring-[1px] is a width, ring-[#hex] is a color. Keep them independent:
  // ring-color stays a 2px boxShadow; ring-width emits an outline fallback so
  // ring-[1px] never corrupts the boxShadow into "0 0 0 2px 1px".
  it("routes ring-[length] to an outline fallback, ring-[color] to boxShadow", () => {
    const width = extractArbitrary("ring-[1px]");
    expect(width.style.outlineWidth).toBe("1px");
    expect(width.style.outlineStyle).toBe("solid");
    expect(width.style.outlineColor).toBe("currentColor");
    expect(width.style.boxShadow).toBeUndefined();

    const color = extractArbitrary("ring-[#4F63D2]");
    expect(color.style.boxShadow).toBe("0 0 0 2px #4F63D2");
    expect(color.style.outlineWidth).toBeUndefined();
  });

  // D2c: border-[1px] is a width, border-[#hex]/border-[var(--c)] is a color.
  it("routes border-[length] to borderWidth, border-[color] to borderColor", () => {
    const width = extractArbitrary("border-[2px]");
    expect(width.style.borderWidth).toBe("2px");
    expect(width.style.borderColor).toBeUndefined();

    const color = extractArbitrary("border-[#fff]");
    expect(color.style.borderColor).toBe("#fff");
    // existing preflight compensation still applies for color-only borders:
    expect(color.style.borderWidth).toBe("1px");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/extract-arbitrary.test.ts`
Expected: FAIL — `ring-[1px]` currently yields `boxShadow: "0 0 0 2px 1px"`; `border-[2px]` yields `borderColor: "2px"` (via `ARBITRARY_TO_CSS.border`).

- [ ] **Step 3: Add the `isLengthValue` helper**

In `src/app/extract-arbitrary.ts`, add near the other value classifiers (after `fontProperty`, ~line 97):

```typescript
// A Tailwind arbitrary value is a CSS length (not a color) when it begins with
// a digit / sign / dot or carries a length unit. Colors are #hex, rgb(),
// hsl(), var(), or colour words. Used to split `ring-[1px]` (width) from
// `ring-[#hex]` (color) and likewise for `border-[…]`.
function isLengthValue(value: string): boolean {
  return /^[-.\d]/.test(value.trim()) || /\d(px|rem|em)\b/.test(value);
}
```

- [ ] **Step 4: Update the `ring` branch and add a `border` branch**

In `extractArbitrary`, replace the `ring` branch (lines 147-149) with a length-vs-color split, and add a `border` branch before the generic `else` (which currently sends `border` to `borderColor` via `ARBITRARY_TO_CSS`):

```typescript
    } else if (prefix === "ring") {
      if (isLengthValue(value)) {
        // ring-width — independent of the ring-color boxShadow (D2c).
        style.outlineStyle = "solid";
        style.outlineWidth = value;
        style.outlineColor = "currentColor";
      } else {
        style.boxShadow = `0 0 0 2px ${value}`;
      }
      continue;
    } else if (prefix === "border") {
      if (isLengthValue(value)) {
        style.borderWidth = value;
      } else {
        style.borderColor = value;
      }
      continue;
    } else {
      properties = ARBITRARY_TO_CSS[prefix];
    }
```

Note: the `border: ["borderColor"]` entry in `ARBITRARY_TO_CSS` (line 42) is now dead (the explicit branch handles `border`). Remove that one line from `ARBITRARY_TO_CSS` to avoid a misleading duplicate mapping. (`ring: ["boxShadow"]` on line 44 is likewise now handled by the explicit branch; remove it too.)

The existing preflight compensation block (lines 162-168, `if (style.borderColor !== undefined) …`) is unchanged and still adds `borderWidth: 1px` + `borderStyle: solid` for a color-only border. A width-only `border-[2px]` sets `borderWidth` directly and skips that block (no `borderColor`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/extract-arbitrary.test.ts`
Expected: PASS — including the pre-existing `border-[var(--c)]` compensation test (line 90-95) and the `text-[..]` disambiguation test.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/extract-arbitrary.ts src/app/extract-arbitrary.test.ts
git commit -m "fix(preview): split ring-[length]/border-[length] (width) from ring-[color]/border-[color]"
```

---

### Task 5: LiveButton outline-ring smoke test

**Files:**
- Test: `src/app/components/LiveButton.test.ts`

- [ ] **Step 1: Write the test**

`LiveButton` renders one preview button per variant key (its `variantRows` computed). A graph with an opaque `button.outline.border` makes the outline row's recipe carry `ring-[#…]`, which `extractArbitrary` turns into a `boxShadow`. Assert at least one preview button paints a ring.

Add a graph helper and a test to `src/app/components/LiveButton.test.ts`:

```typescript
// A button graph whose outline variant defines an opaque border — D2c routes
// it to ring-color, so the outline preview button must paint a ring (boxShadow).
function outlineBorderGraph() {
  const global = {
    button: {
      solid: { bg: { $value: { colorSpace: "srgb", components: [0.31, 0.39, 0.82], alpha: 1, hex: "#4F63D2" }, $type: "color" } },
      outline: { border: { $value: { colorSpace: "srgb", components: [0.31, 0.39, 0.82], alpha: 1, hex: "#4F63D2" }, $type: "color" } },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

describe("LiveButton — D2c outline ring", () => {
  it("paints a ring (boxShadow) on the outline variant preview", () => {
    const wrapper = mount(LiveButton, {
      props: { graph: outlineBorderGraph() },
      ...mountOpts,
    });
    const ringed = previewButtons(wrapper).some(
      (b) => b.element.style.boxShadow.length > 0,
    );
    expect(ringed).toBe(true);
  });
});
```

If the hex-object `$value` shape does not resolve to `#4F63D2` through `buildGraph` in this minimal fixture (verify by reading the resolved class), fall back to a string `$value: "#4F63D2"` form — match whatever shape `buildGraph` accepts in the other engine tests. The assertion (some preview button has a non-empty `boxShadow`) is what matters.

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/app/components/LiveButton.test.ts`
Expected: PASS (the outline variant row renders a `ring-[#4F63D2]` → `boxShadow`). If it fails because the color does not resolve, adjust the fixture `$value` shape per the note above until the outline button carries a `boxShadow`, then PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/LiveButton.test.ts
git commit -m "test(preview): LiveButton paints a ring on the outline variant (D2c)"
```

---

### Task 6: Scanner hint — opaque border on an unframed button variant

**Files:**
- Modify: `src/scanner.ts` (import line 21; add `isOpaqueColor` helper near line 54; insert hint in the index loop ~line 101)
- Test: `src/scanner.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/scanner.test.ts` (a new `describe`):

```typescript
describe("scanGraph — D2c border-on-unframed-variant hint", () => {
  function unframed(base: string) {
    return makeGraph([
      makeNode({ id: "button-solid-border", layer: "component", type: "color", source: "global", base }),
    ]);
  }

  it("flags an opaque border on the solid (unframed) variant", () => {
    const report = scanGraph(unframed("#4F63D2"), { components: ["button"] });
    const hint = report.issues.find((i) => i.kind === "border-on-unframed-variant");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("hint");
    expect(hint?.componentName).toBe("button");
    expect(hint?.tokenIds).toContain("button-solid-border");
  });

  it("does not flag a transparent placeholder border", () => {
    const report = scanGraph(unframed("rgba(0, 0, 0, 0)"), { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "border-on-unframed-variant")).toBeUndefined();
  });

  it("does not flag the outline (framed) variant border", () => {
    const graph = makeGraph([
      makeNode({ id: "button-outline-border", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "border-on-unframed-variant")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL — no `border-on-unframed-variant` issue is emitted.

- [ ] **Step 3: Add the opacity helper + import**

In `src/scanner.ts`, extend the import on line 21:

```typescript
import { KNOWN_VARIANT_NAMES, RING_FRAMED_VARIANTS } from "./component-vocab.js";
```

Add a helper near `isValidationColorBorder` (after line 54):

```typescript
/**
 * True for a colour value that paints (alpha > 0). Transparent placeholders
 * (`rgba(…, 0)`, `transparent`, `#RRGGBB00`) return false. For numeric
 * border-width values, a positive length is "opaque" (handled at the call site).
 */
function isOpaqueColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "") return false;
  const rgba = v.match(/^rgba?\([^)]*?,\s*([0-9.]+)\s*\)$/);
  if (rgba) return parseFloat(rgba[1]!) > 0;
  const hex8 = v.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/);
  if (hex8) return parseInt(hex8[1]!, 16) > 0;
  return true; // #RRGGBB, named colours, var(…)
}
```

- [ ] **Step 4: Emit the hint in the index loop**

In `scanGraph`, inside the `for (const node of graph.nodes.values())` index loop, after the `if (mapping === null) { … continue; }` block (ends ~line 100) and **before** the `if (mapping.variantAxis !== null && mapping.variantAxis !== "size") continue;` line (~line 105), insert:

```typescript
    // D2c: an opaque border / border-width on an unframed button variant
    // (solid/ghost/link) is a deviation — Nuxt UI v4 frames only outline/subtle,
    // so the border never renders. Gated on opacity so the transparent
    // placeholder borders (rgba(…,0)) do not trip it.
    const framedVariants = RING_FRAMED_VARIANTS.get(prefix);
    if (
      framedVariants !== undefined &&
      (mapping.utilityType === "border-color" || mapping.utilityType === "border-width") &&
      mapping.variantAxis === "variant" &&
      mapping.variantKey !== null &&
      !framedVariants.has(mapping.variantKey)
    ) {
      const value =
        node.cssValue.base ?? node.cssValue.light ?? node.cssValue.dark ?? "";
      const opaque =
        node.type === "color" ? isOpaqueColor(value) : parseFloat(value) > 0;
      if (opaque) {
        issues.push({
          id: `uvb-${node.id}`,
          category: "classification-hint",
          severity: "hint",
          kind: "border-on-unframed-variant",
          message:
            `\`${node.id}\` sets a border on the \`${mapping.variantKey}\` button variant, ` +
            `which Nuxt UI v4 renders without a frame (only \`outline\`/\`subtle\` are ring-framed). ` +
            `This border will not appear in the output.`,
          tokenIds: [node.id],
          componentName: prefix,
        });
      }
    }
```

Note: this does not `continue` — the token still flows through its normal `border-color` mapping below. `mapping.variantKey` is the variant name (`solid`) because button border tokens sit on the `variant` axis.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — opaque solid border emits exactly one hint; transparent and outline do not.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): hint on opaque border applied to an unframed button variant (D2c)"
```

---

## Final verification (after all tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] `npm run build:tokens` — regenerate `output/`; confirm `ui.button` is unchanged for the *current* export except that `variants.variant.outline.base` now carries `ring-[#4F63D2]` (+ `hover:`/`disabled:` ring states) instead of an invisible `border-[…]`. The `solid/ghost/link` borders remain `border-[…]` (transparent) and no `border-on-unframed-variant` hint fires (they are `rgba(0,0,0,0)`).
- [ ] Headless (optional): load the export, open the button preview, confirm the outline variant shows a ring; open the scan pane and confirm no false unframed-variant hint on the current export.
- [ ] Dispatch a final code-reviewer over the whole branch.
- [ ] Then use superpowers:finishing-a-development-branch (do not push; per standing instruction, merge to `main` by fast-forward only on explicit request).

## Self-review notes

- **Spec coverage:** outline border→ring (Task 2), border-width→ring-width emit (Task 3), preview split (Task 4), LiveButton smoke (Task 5), scanner hint (Task 6), per-variant framing table (Task 1) — all spec success-criteria mapped.
- **Type consistency:** `RING_FRAMED_VARIANTS`/`isRingFramedVariant` (Task 1) used verbatim in Tasks 2 & 6. `UtilityType` members `border-width`/`ring-width` (Task 3) used in Task 3 emit + Task 6 mapping check. `isLengthValue`/`isOpaqueColor` defined once where used.
- **Flipped existing tests handled:** `slot-mapping.test.ts:79-96` (Task 2) and `recipe-engine.test.ts:244` (folded into Task 2 staging per the grouping note) — both called out so no green commit is blocked.
- **No placeholders:** every code step shows complete code and the exact run command + expected result.
