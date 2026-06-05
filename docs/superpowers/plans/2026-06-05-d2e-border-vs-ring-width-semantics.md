# D2e — `border-width` (resting) vs `ring-width` (focus) semantics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map `border-width` (resting frame) → base ring width and `ring-width` (focus emphasis) → `focus:ring-[Npx]` on ring-framed components, and make the preview compose ring colour + width into a single ring per state.

**Architecture:** Two pre-loop intercepts in `heuristicSlotMapping` (a focus-scoped `ring-width` rule and a component-level `border-width`→ring redirect), reusing the D2c `ring-width` utility type and emit path (no recipe-engine source change). The preview (`extract-arbitrary.ts`) stops keeping ring width/colour independent and composes one `boxShadow: 0 0 0 <width> <colour>` per state.

**Tech Stack:** TypeScript engine + Vue 3 preview, Vitest, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; **every task commit must be green**.

**Branch:** `fix/d2e-width-semantics` (already checked out; spec committed at `8256180`).

**Spec:** `docs/superpowers/specs/2026-06-05-d2e-border-vs-ring-width-semantics-design.md`

**Real data (new export `assets/tokens-20260605-123353.zip`):** `button-border-width=1`, `button-ring-width=2`, `input-border-width=1`, `input-ring-width=2` (component-level); `input-border-active=#8A9DDB` (out of scope — a separate deviation).

**Critical correctness note (do not get this wrong):** Do NOT add `RING_FRAMED_VARIANTS.has(component)` to the shared `ringFramed` const — that would make `button-solid-border` (colour) map to `ring-color` and break D2c (solid keeps `border-color`). The component-level redirect must be a **separate** condition gated on `variant === null` and applied **only** to the `border-width` intercept.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `src/slot-mapping.ts` | focus-scoped `ring-width` intercept; component-level `border-width`→ring redirect | 1 |
| `src/slot-mapping.test.ts` | mapping assertions | 1 |
| `src/recipe-engine.test.ts` | end-to-end emit assertions (no source change) | 1 |
| `src/app/extract-arbitrary.ts` | compose ring colour+width into one boxShadow | 2 |
| `src/app/extract-arbitrary.test.ts` | update the D2c independent-ring test to the composed behaviour | 2 |
| `src/app/components/LiveButton.test.ts` | resting-1px vs focus-2px ring smoke | 3 |

---

### Task 1: Grammar — `ring-width`→focus, component-level `border-width`→ring

**Files:**
- Modify: `src/slot-mapping.ts` (import line 71; intercept block lines 355-369)
- Test: `src/slot-mapping.test.ts`, `src/recipe-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/slot-mapping.test.ts` (in the variant-axis / D2c area; keep with the other button cases):

```typescript
  it("maps component-level button-border-width to ring-width on base (D2e resting)", () => {
    expect(heuristicSlotMapping("button-border-width")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps button-ring-width to ring-width with a forced focus prefix (D2e)", () => {
    expect(heuristicSlotMapping("button-ring-width")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
      statePrefix: "focus",
    });
  });

  it("maps input-border-width to ring-width on base (input is ring-framed)", () => {
    expect(heuristicSlotMapping("input-border-width", undefined, "number")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps input-ring-width to focus ring-width", () => {
    expect(heuristicSlotMapping("input-ring-width", undefined, "number")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
      statePrefix: "focus",
    });
  });

  it("keeps button-solid-border as border-color (D2c unchanged — solid not framed)", () => {
    expect(heuristicSlotMapping("button-solid-border")).toEqual({
      slot: "base",
      utilityType: "border-color",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("keeps a non-framed component border-width as CSS border-width (table)", () => {
    expect(heuristicSlotMapping("table-border-width")).toEqual({
      slot: "base",
      utilityType: "border-width",
      variantAxis: null,
      variantKey: null,
    });
  });
```

Add to `src/recipe-engine.test.ts` (variant-axis describe block — end-to-end emit):

```typescript
  it("emits ring-[1px] (resting) + focus:ring-[2px] (focus) from component-level width tokens (D2e)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
      makeNode({ id: "button-ring-width", layer: "component", type: "number", source: "global", base: "2px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const base = recipes.button?.slots.base ?? "";
    expect(base).toContain("ring-[1px]");
    expect(base).toContain("focus:ring-[2px]");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/slot-mapping.test.ts src/recipe-engine.test.ts`
Expected: FAIL — `button-border-width` currently → `border-width` (not ring-width); `button-ring-width` → `null`.

- [ ] **Step 3: Update the import**

`src/slot-mapping.ts` line 71 — add `RING_FRAMED_VARIANTS`:

```typescript
import { BUTTON_VARIANT_KEYS, COLOR_ROLE_KEYS, SIZE_KEYS, STATE_KEYS, RING_FRAMED_COMPONENTS, RING_FRAMED_VARIANTS, isRingFramedVariant } from "./component-vocab.js";
```

- [ ] **Step 4: Add the focus `ring-width` intercept and the component-level `border-width` redirect**

In `src/slot-mapping.ts`, replace the current intercept block (lines 355-369) with:

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

  // `ring-*` tokens are the focus-ring family (ring-focus colour, ring-offset).
  // A bare `ring-width` is the focus-ring WIDTH → ring-width with a `focus:`
  // prefix (Nuxt `focus-visible:ring-2`). An explicit state suffix wins. (D2e)
  if (parsed.utility === "ring-width") {
    const entry = buildEntry(slot, "ring-width", ctx);
    return entry.statePrefix == null ? { ...entry, statePrefix: "focus" } : entry;
  }

  // `border-width` is the RESTING frame width. On a ring-framed variant/component
  // it is the base ring width; a *component-level* width (variant === null) on a
  // component that frames some variants (button) is also the resting ring width.
  // Otherwise (table, nav) it stays a CSS border-width. (D2e)
  const restingRingWidth =
    ringFramed ||
    (parsed.variant === null && RING_FRAMED_VARIANTS.has(parsed.component));
  if (parsed.utility === "border-width" && restingRingWidth) {
    return buildEntry(slot, "ring-width", ctx);
  }
```

(This replaces the old `if (parsed.utility === "border-width" && ringFramed)` block. `ring-color` and the new `ring-width`/`border-width` intercepts now sit together; the `border-width` HEURISTIC_RULES fallback still catches the non-framed case, e.g. `table-border-width`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/slot-mapping.test.ts src/recipe-engine.test.ts`
Expected: PASS — including the unchanged `button-solid-border` (still border-color) and `table-border-width` (still border-width) assertions, and the prior D2c `button-outline-border-width` → ring-width test (still green via `ringFramed`).

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/slot-mapping.ts src/slot-mapping.test.ts src/recipe-engine.test.ts
git commit -m "feat(grammar): border-width=resting ring, ring-width=focus ring (D2e width semantics)"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

### Task 2: Preview — compose ring colour + width into one boxShadow

**Files:**
- Modify: `src/app/extract-arbitrary.ts` (`extractArbitrary` loop, lines 128-189)
- Test: `src/app/extract-arbitrary.test.ts` (lines 96-116)

- [ ] **Step 1: Update the D2c independent-ring test to the composed behaviour (RED)**

In `src/app/extract-arbitrary.test.ts`, replace the block at lines 96-110 (the comment + `it("routes ring-[length] to an outline fallback, …")`) with:

```typescript
  // D2e: a ring is one boxShadow carrying both width and colour, so the preview
  // shows the token's real ring width per state (resting 1px vs focus 2px),
  // not a fixed 2px and not a competing CSS outline.
  it("composes ring width + colour into a single boxShadow", () => {
    const both = extractArbitrary("ring-[1px] ring-[#4F63D2]");
    expect(both.style.boxShadow).toBe("0 0 0 1px #4F63D2");
    expect(both.style.outlineWidth).toBeUndefined();

    const widthOnly = extractArbitrary("ring-[1px]");
    expect(widthOnly.style.boxShadow).toBe("0 0 0 1px currentColor");

    const colorOnly = extractArbitrary("ring-[#4F63D2]");
    expect(colorOnly.style.boxShadow).toBe("0 0 0 2px #4F63D2");
  });
```

The `it("treats ring-[var(--c)] as a color …")` test (lines 112-116) stays as-is — it already asserts `0 0 0 2px var(--brand)` (colour, default 2px width) and `outlineWidth` undefined, which the composed behaviour still satisfies.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/extract-arbitrary.test.ts`
Expected: FAIL — `ring-[1px]` currently sets `outlineWidth`/no boxShadow; `ring-[1px] ring-[#4F63D2]` currently yields `outlineWidth` + a separate `0 0 0 2px #4F63D2`.

- [ ] **Step 3: Accumulate ring width/colour and compose after the loop**

In `src/app/extract-arbitrary.ts`, declare two locals just inside `extractArbitrary`, before the `for` loop (after `const classes: string[] = [];`, line 130):

```typescript
  let ringColor: string | undefined;
  let ringWidth: string | undefined;
```

Replace the `ring` branch (lines 154-163) with accumulation only:

```typescript
    } else if (prefix === "ring") {
      // ring-[length] = width, ring-[colour] = colour; composed below (D2e).
      if (isLengthValue(value)) ringWidth = value;
      else ringColor = value;
      continue;
```

(The `border` branch at lines 164-170 is unchanged.)

After the loop, before the border-colour preflight block (line 183), add the composition:

```typescript
  // Compose the ring (D2e): one boxShadow carrying the token's width + colour.
  // Defaults: 2px width (Tailwind ring default) and currentColor when only one
  // half is present. ring-[length] no longer emits a competing CSS outline.
  if (ringColor !== undefined || ringWidth !== undefined) {
    style.boxShadow = `0 0 0 ${ringWidth ?? "2px"} ${ringColor ?? "currentColor"}`;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/extract-arbitrary.test.ts`
Expected: PASS (the composed test, the `ring-[var]` test, the `border-[length]` test, and all prior extract-arbitrary tests).

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. (The D2c `LiveButton` test "paints a ring (boxShadow) on the outline variant" still passes: that fixture has a ring colour but no width, so it composes `0 0 0 2px <colour>`.)

- [ ] **Step 6: Commit**

```bash
git add src/app/extract-arbitrary.ts src/app/extract-arbitrary.test.ts
git commit -m "fix(preview): compose ring colour + width into one boxShadow (resting vs focus width)"
```
Verify no attribution trailer; amend if present.

---

### Task 3: LiveButton — resting-1px vs focus-2px ring smoke

**Files:**
- Test: `src/app/components/LiveButton.test.ts`

- [ ] **Step 1: Write the test**

`LiveButton` projects each state and runs `extractArbitrary`. With component-level `button-border-width=1` + `button-ring-width=2` plus an outline border colour, the outline preview's resting ring is `0 0 0 1px …` and its focus ring is `0 0 0 2px …`.

Add to `src/app/components/LiveButton.test.ts` (a new graph helper + test; mirror the existing `outlineBorderGraph` style):

```typescript
// border-width=1 (resting) + ring-width=2 (focus) + an outline border colour.
// D2e: resting ring composes to 1px, focus ring to 2px.
function widthGraph() {
  const global = {
    button: {
      "border-width": { $value: 1, $type: "number" },
      "ring-width": { $value: 2, $type: "number" },
      outline: { border: { $value: { components: [0.31, 0.39, 0.82], hex: "#4F63D2" }, $type: "color" } },
      "outline-ring-focus": { $value: { components: [0.44, 0.51, 0.76], hex: "#6F82C2" }, $type: "color" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

describe("LiveButton — D2e ring widths", () => {
  it("resting outline ring is 1px (border-width), focus ring is 2px (ring-width)", () => {
    const wrapper = mount(LiveButton, { props: { graph: widthGraph() }, ...mountOpts });
    const shadows = previewButtons(wrapper).map((b) => b.element.style.boxShadow);
    // Some preview cell paints a 1px resting ring; some (the focus state cell) a 2px ring.
    expect(shadows.some((s) => s.startsWith("0 0 0 1px"))).toBe(true);
    expect(shadows.some((s) => s.startsWith("0 0 0 2px"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/app/components/LiveButton.test.ts`
Expected: PASS. If the nested `button.outline.border` / `button.outline-ring-focus` shapes don't resolve through `buildGraph` (no preview ring), adjust the fixture's `$value` colour shape to whatever the loader accepts (match the existing `outlineBorderGraph` fixture and `recipe-engine.test.ts` colour nodes); the assertions (a 1px and a 2px ring exist across the preview cells) are what matter. Confirm by reading the resolved recipe if needed.

- [ ] **Step 3: Typecheck + full suite + commit**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

```bash
git add src/app/components/LiveButton.test.ts
git commit -m "test(preview): LiveButton resting 1px vs focus 2px ring (D2e)"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after all tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] **End-to-end against the new export** (transient, do NOT commit the export swap unless the user asks):
  ```bash
  cp components/global.tokens.json /tmp/d2e-global.bak
  unzip -o assets/tokens-20260605-123353.zip -d /tmp/d2e-new > /dev/null
  cp /tmp/d2e-new/*.tokens.json components/
  npm run build:tokens
  ```
  Confirm in `output/nuxt/app.config.ts`: `ui.button.slots.base` carries `ring-[1px]` (resting) **and** `focus:ring-[2px]` (focus), with **no** stray `border-[1px]`; `ui.input.slots.base` likewise carries `ring-[1px]` + `focus:ring-[2px]`.
  Then restore: `cp /tmp/d2e-global.bak components/global.tokens.json && git checkout components/ && npm run build:tokens`.
- [ ] Headless (optional): load the new export, confirm the outline button shows a thin (1px) resting ring and a 2px ring on focus; input likewise.
- [ ] Dispatch a final whole-branch code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** ring-width→focus (Task 1), border-width→resting ring incl. component-level (Task 1), non-framed border-width stays CSS (Task 1 test), preview compose (Task 2), resting-vs-focus preview proof (Task 3). All spec criteria mapped.
- **D2c preserved:** `button-solid-border`→border-color and `button-outline-border-width`→ring-width are re-asserted in Task 1; the component-level redirect is gated on `variant === null` so it cannot touch solid/ghost/link variant borders.
- **No recipe-engine source change:** `ring-width` is already wired (D2c); Task 1 only adds emit *tests*. The focus-prefixed, `variantKey: null` ring-width lands on `slots.base` (statePrefix ≠ null skips the non-suffix→default-size redirect).
- **Type consistency:** `ring-width`/`border-width` utility types unchanged from D2c; `restingRingWidth`/`ringFramed` are local bools; `ringColor`/`ringWidth` locals in `extractArbitrary`.
- **No placeholders:** every code step shows full code + exact command + expected result.
