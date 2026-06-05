# Pair component-level resting ring-width with its ring-colour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a component-level resting `ring-width` only where a resting ring-*colour* lives (the framed variant for button; base for input), never on a bare `slots.base` that unframed variants inherit. Drop it when there is no resting ring-colour to pair with.

**Architecture:** Two additions to `buildComponentRecipes` in `src/recipe-engine.ts` — a pre-scan that records each component's resting ring-colour bucket locations (opaque only), and a main-loop intercept that relocates the component-level resting ring-width to those locations (or drops it).

**Tech Stack:** TypeScript engine, Vitest, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; the commit must be green.

**Branch:** `fix/resting-ring-width-pairing` (spec committed at `9bc69c3`).

**Spec:** `docs/superpowers/specs/2026-06-06-resting-ring-width-pairing-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- The project `typecheck` does NOT cover `.test.ts` — get arities right by hand. The `makeNode`/`makeGraph` helpers are at the top of `src/recipe-engine.test.ts`.
- `isOpaqueColor` (from `./color-opacity.js`), `resolveTokenToValue`, `bucketKeyFor`, `utilityForMapping`, `VariantAxis`, and `SlotMappingEntry` are all already imported/defined in `recipe-engine.ts`.
- Verified mappings: `button-border-width` → `{utilityType:"ring-width", variantAxis:null, variantKey:null}` (no statePrefix); `button-outline-border` → ring-colour on `variantAxis:"variant", variantKey:"outline"`; `input-border` → ring-colour on `variantAxis:null`.

---

### Task 1: Pair the resting ring-width with its ring-colour

**Files:**
- Modify: `src/recipe-engine.ts` (pre-scan after the size-variant pre-scan ~line 180; intercept in the main loop after the transparent-skip ~line 200, before the size-redirect ~line 207)
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/recipe-engine.test.ts` (variant-axis describe block):

```typescript
  it("pairs a component-level resting ring-width with the framed variant's ring-colour (D2e leak fix)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
      makeNode({ id: "button-outline-border", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#222222" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    // ring-[1px] lands on outline (with its ring colour), NOT on slots.base.
    expect(recipes.button?.variants.variant?.outline?.base ?? "").toContain("ring-[1px]");
    expect(recipes.button?.slots.base ?? "").not.toContain("ring-[1px]");
    // unframed variants get no resting ring.
    expect(recipes.button?.variants.variant?.solid?.base ?? "").not.toContain("ring-[");
  });

  it("keeps a whole-component resting ring-width on base when the ring-colour is on base (input)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
      makeNode({ id: "input-border", layer: "component", type: "color", source: "global", base: "#E4E4E7" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["input"] });
    expect(recipes.input?.slots.base ?? "").toContain("ring-[1px]");
  });

  it("drops a component-level resting ring-width with no resting ring-colour to pair with", () => {
    const graph = makeGraph([
      makeNode({ id: "button-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#222222" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const r = recipes.button;
    const anyRingWidth =
      (r?.slots.base ?? "").includes("ring-[1px]") ||
      Object.values(r?.variants.variant ?? {}).some((v) => (v.base ?? "").includes("ring-[1px]"));
    expect(anyRingWidth).toBe(false);
  });

  it("leaves the focus ring-width on base (component-level, intended on all variants)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-ring-width", layer: "component", type: "number", source: "global", base: "2px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base ?? "").toContain("focus:ring-[2px]");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/recipe-engine.test.ts`
Expected: FAIL — currently `button-border-width` lands `ring-[1px]` on `slots.base` (so the first test's `slots.base` `.not.toContain` fails, and `outline` lacks it); the drop test fails (it's on base). The input test and focus test already pass.

- [ ] **Step 3: Add the resting-ring-colour-targets pre-scan**

In `buildComponentRecipes`, after the existing size-variant pre-scan loop (the one populating `utilityHasSizeVariants`, ending ~line 180), add:

```typescript
  // Where each component's RESTING ring-colour lives (base for whole-component
  // framers like input; the framed variant(s) for variant-conditional framers
  // like button). A component-level resting ring-WIDTH is paired to these
  // locations so it never paints a colourless ring on an unframed variant.
  type RingColourTarget = { variantAxis: VariantAxis | null; variantKey: string | null };
  const restingRingColourTargets = new Map<string, RingColourTarget[]>();

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const componentName = node.id.split("-")[0];
    if (componentName === undefined || !allowSet.has(componentName)) continue;
    const mapping = getSlotMapping(node.id, options.slotMappingOverride, node.type);
    if (!mapping || mapping.utilityType !== "ring-color" || mapping.statePrefix != null) continue;
    if (mapping.variantAxis !== null && mapping.variantAxis !== "variant") continue;
    const resolved = resolveTokenToValue(node.id, graph);
    if ("error" in resolved || !isOpaqueColor(resolved.value)) continue; // dropped colours aren't pairing targets
    const list = restingRingColourTargets.get(componentName) ?? [];
    const target: RingColourTarget = { variantAxis: mapping.variantAxis, variantKey: mapping.variantKey };
    if (!list.some((t) => t.variantAxis === target.variantAxis && t.variantKey === target.variantKey)) {
      list.push(target);
    }
    restingRingColourTargets.set(componentName, list);
  }
```

- [ ] **Step 4: Add the main-loop intercept**

In the per-node main loop, after the transparent-colour skip block (the `if (COLOR_UTILITY_TYPES.has(mapping.utilityType) && !isOpaqueColor(resolved.value)) { continue; }`, ~line 200) and BEFORE the size-redirect block (`let effectiveMapping = mapping;`, ~line 206), add:

```typescript
    // A component-level resting ring-width (no variant, no state) must pair with
    // a resting ring-COLOUR, or it paints a colourless ring on every variant.
    // Emit it only at the colour's location(s); drop it if there is none.
    // (Fixes the D2e leak where button-border-width ringed solid/ghost/link.)
    if (
      mapping.utilityType === "ring-width" &&
      mapping.variantAxis === null &&
      mapping.variantKey === null &&
      mapping.statePrefix == null
    ) {
      const targets = restingRingColourTargets.get(componentName) ?? [];
      const widthClass = utilityForMapping(
        graph,
        node,
        mapping.utilityType,
        resolved.value,
        options.remBase,
      );
      if (widthClass) {
        for (const target of targets) {
          const targetMapping: SlotMappingEntry = {
            ...mapping,
            variantAxis: target.variantAxis,
            variantKey: target.variantKey,
          };
          const bk = bucketKeyFor(componentName, targetMapping);
          const arr = utilityBuckets.get(bk) ?? [];
          arr.push(widthClass);
          utilityBuckets.set(bk, arr);
        }
      }
      continue; // handled (and dropped when targets is empty)
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/recipe-engine.test.ts`
Expected: PASS — button width relocated to outline (not base); input width stays on base; no-colour width dropped; focus width unchanged.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. If an existing recipe-engine test (e.g. an earlier D2e test that asserted `button.slots.base` contains `ring-[1px]`) newly fails, that test was pinning the bug — update it to the new behaviour (ring-width on `variants.variant.outline.base`, not base). Verify the fixture genuinely has a per-variant ring-colour before changing the expectation; report any such change.

- [ ] **Step 7: Commit**

```bash
git add src/recipe-engine.ts src/recipe-engine.test.ts
git commit -m "fix(recipe): pair component-level resting ring-width with its ring-colour (no unframed-variant leak)"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

## Final verification (after the task)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Against the new export (transient swap, restore after — `assets/tokens-20260605-123353.zip`): `npm run build:tokens`; confirm:
  - `button.slots.base` has **no** `ring-[1px]`,
  - `button.variants.variant.outline.base` **has** `ring-[1px]` (alongside its ring-colour),
  - solid/ghost/link button variants have no resting `ring-[`,
  - `input.slots.base` still has `ring-[1px]`.
  Restore: `git checkout components/ && npm run build:tokens`.
- [ ] Headless (optional): load the new export, confirm solid/ghost/link button previews have no resting ring while outline does.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** pre-scan targets (Step 3), intercept + relocate/drop (Step 4), tests for button/input/drop/focus (Step 1). All mapped.
- **Disjoint & safe:** the intercept fires only for `ring-width` with `variantAxis===null && variantKey===null && statePrefix==null` — per-variant and focus ring-widths are untouched; the `continue` prevents double-bucketing. The opaque gate keeps a width from pairing with a dropped transparent colour.
- **No regression for whole-component framers:** input's resting ring-colour is on base (`variantAxis null`), so its width stays on base (input regression test).
- **No placeholders:** every step has full code + exact command + expected result.
