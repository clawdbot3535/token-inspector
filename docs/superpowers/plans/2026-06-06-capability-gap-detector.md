# capability-gap detector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scanner `capability-gap` hint that flags a leading/trailing slot-pair asymmetry — one half filled by a Figma token, the counterpart a real Nuxt slot but unfilled (e.g. `trailingIcon` when `icon-size` fills `leadingIcon`).

**Architecture:** Task 1 adds a `SLOT_PAIRS` constant to `component-vocab.ts`. Task 2 adds the detector to `scanner.ts`: accumulate the filled `RecipeSlot`s per component (from `mapping.slot`), then after the index loop emit a `hint` for each pair where one side is filled and the other is an unfilled `NUXT_SLOTS` slot.

**Tech Stack:** TypeScript engine, Vitest, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/capability-gap-detector` (spec committed at `b9652b0`).

**Spec:** `docs/superpowers/specs/2026-06-06-capability-gap-detector-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- The project `typecheck` does NOT cover `.test.ts` — get arities right by hand. `scanGraph(graph, options)` is 2-arg; `makeNode`/`makeGraph` helpers are at the top of `src/scanner.test.ts`.
- `SLOT_PAIRS` is typed `readonly [string, string]` (NOT `RecipeSlot`) on purpose — `slot-mapping.ts` imports from `component-vocab.ts`, so importing `RecipeSlot` here would create a cycle.
- `tokenIds: []` is idiomatic (`ScanIssue.tokenIds` is `readonly string[]`; `incomplete-size-variant`/`asymmetric-size-coverage`/`orphaned-size-key` already emit `[]`). `kind` is a free `string`.
- Scanner anchors: accumulator decls at `scanner.ts:85-87`; the non-null mapping path (where `mapping.slot` is in scope) at `scanner.ts:139-143` (BEFORE the size-axis `continue`); the `unsupported-part` emit loop at `scanner.ts:200-231`; `// ─── 3. Per-component analysis` at `scanner.ts:233`.

---

### Task 1: `SLOT_PAIRS` constant

**Files:**
- Modify: `src/component-vocab.ts` (append after the existing exports)
- Test: `src/component-vocab.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/component-vocab.test.ts`, add `SLOT_PAIRS` to the import from `./component-vocab`, and append:

```typescript
describe("SLOT_PAIRS", () => {
  it("pairs leadingIcon with trailingIcon", () => {
    expect(SLOT_PAIRS.some(([a, b]) => a === "leadingIcon" && b === "trailingIcon")).toBe(true);
  });
  it("every pair is two distinct non-empty slot names", () => {
    for (const [a, b] of SLOT_PAIRS) {
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
      expect(a).not.toBe(b);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/component-vocab.test.ts`
Expected: FAIL — `SLOT_PAIRS` not exported.

- [ ] **Step 3: Add `SLOT_PAIRS`**

Append to `src/component-vocab.ts`:

```typescript
/**
 * Leading/trailing slot counterparts among the grammar-fillable RecipeSlots.
 * Used by the capability-gap detector: when one half is filled by a Figma token
 * and the other is a real Nuxt slot but unfilled, that asymmetry is flagged.
 * Only `leadingIcon`/`trailingIcon` is fillable today (the `leading`/`trailing`
 * input wrappers are not RecipeSlot values). Extensible. Typed as `string` pairs
 * (not `RecipeSlot`) on purpose: `slot-mapping.ts` already imports from this
 * module, so importing `RecipeSlot` here would create a cycle; the values are
 * only compared against the `string` `NUXT_SLOTS` sets.
 */
export const SLOT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["leadingIcon", "trailingIcon"],
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/component-vocab.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/component-vocab.ts src/component-vocab.test.ts
git commit -m "feat(vocab): SLOT_PAIRS (leading/trailing slot counterparts)"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

### Task 2: `capability-gap` scanner detector

**Files:**
- Modify: `src/scanner.ts` (import `SLOT_PAIRS`; accumulator at ~line 87; record `mapping.slot` at ~line 143; emit after the `unsupported-part` loop ~line 231, before `// ─── 3. Per-component analysis`)
- Test: `src/scanner.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/scanner.test.ts` (new `describe`):

```typescript
describe("scanGraph — capability-gap hint (paired-slot asymmetry)", () => {
  it("flags trailingIcon when icon-size fills leadingIcon", () => {
    const graph = makeGraph([
      makeNode({ id: "button-icon-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const cg = report.issues.filter((i) => i.kind === "capability-gap");
    expect(cg.map((i) => i.id)).toEqual(["cg-button-trailingIcon"]);
    expect(cg[0]!.severity).toBe("hint");
    expect(cg[0]!.componentName).toBe("button");
    expect(cg[0]!.message).toContain("trailingIcon");
    expect(cg[0]!.tokenIds).toEqual([]);
  });

  it("does not flag a capability gap without an icon-size token", () => {
    const graph = makeGraph([
      makeNode({ id: "button-bg", layer: "component", type: "color", source: "global", base: "#222222" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "capability-gap")).toBeUndefined();
  });

  it("skips a component with no NUXT_SLOTS entry", () => {
    const graph = makeGraph([
      makeNode({ id: "widget-icon-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const report = scanGraph(graph, { components: ["widget"] });
    expect(report.issues.find((i) => i.kind === "capability-gap")).toBeUndefined();
  });

  it("emits one capability-gap per (component, slot) across multiple icon tokens", () => {
    const graph = makeGraph([
      makeNode({ id: "button-icon-size-sm", layer: "component", type: "dimension", source: "global", base: "12px" }),
      makeNode({ id: "button-icon-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(
      report.issues.filter((i) => i.kind === "capability-gap" && i.id === "cg-button-trailingIcon"),
    ).toHaveLength(1);
  });
});
```

(Verify `makeNode`'s exact field names against the top of `src/scanner.test.ts`; mirror the
shape the existing `unsupported-part` tests use. If `getSlotMapping("button-icon-size-md")` does
not yield `slot: "leadingIcon"`, log the mapping and adjust the token id to one the grammar
routes to `leadingIcon` — the `icon-size`/`icon` rule maps there, `slot-mapping.ts:253-254`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL — no `capability-gap` issues emitted.

- [ ] **Step 3: Import `SLOT_PAIRS`**

In `src/scanner.ts`, add `SLOT_PAIRS` to the existing `./component-vocab.js` import (the line at `scanner.ts:21` that already imports `nuxtSlotsFor`, `NON_PART_SEGMENTS`, …).

- [ ] **Step 4: Add the accumulator**

Next to the other per-component accumulators (after `scanner.ts:87`), add:

```typescript
  const filledSlotsByComponent = new Map<string, Set<string>>();
```

- [ ] **Step 5: Record the filled slot in the non-null mapping path**

In the index loop, in the non-null path where `mapping` is in scope and the mapped 2nd-segment is
already recorded (right after the `mappedSecondSegByComponent.set(prefix, ms);` block, ~line 143,
which is BEFORE the size-axis `continue`), add:

```typescript
    const fslots = filledSlotsByComponent.get(prefix) ?? new Set<string>();
    fslots.add(mapping.slot);
    filledSlotsByComponent.set(prefix, fslots);
```

- [ ] **Step 6: Emit the capability-gap hints after the loop**

After the `unsupported-part` emit loop closes (~line 231) and before `// ─── 3. Per-component
analysis` (~line 233), add:

```typescript
  // Capability gap: a leading/trailing slot pair where one half is filled by a
  // Figma token and the counterpart is a real Nuxt slot but unfilled. Surfaces a
  // Nuxt capability the tokens don't cover (e.g. trailingIcon — `icon-size` is a
  // shared size the grammar routes only to leadingIcon). Hint severity: nothing
  // is wrong or dropped. Components with no NUXT_SLOTS entry are skipped.
  for (const [comp, filled] of filledSlotsByComponent) {
    const slots = nuxtSlotsFor(comp);
    if (!slots) continue;
    for (const [a, b] of SLOT_PAIRS) {
      for (const [filledSide, gapSide] of [[a, b], [b, a]] as const) {
        if (filled.has(filledSide) && !filled.has(gapSide) && slots.has(gapSide)) {
          issues.push({
            id: `cg-${comp}-${gapSide}`,
            category: "classification-hint",
            severity: "hint",
            kind: "capability-gap",
            message:
              `Nuxt UI v4 \`${comp}\` has a \`${gapSide}\` slot, but the Figma tokens only fill ` +
              `\`${filledSide}\` (via \`icon-size\`). Nuxt sizes both icons from the same value, ` +
              `so \`${gapSide}\` stays unsized in the recipe — add a trailing token, route ` +
              `\`icon-size\` to both adapter-side, or ignore if a leading-only icon is intended.`,
            tokenIds: [],
            componentName: comp,
          });
        }
      }
    }
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — button flags `cg-button-trailingIcon` (hint, empty tokenIds); no gap without icon-size; uninventoried skipped; one hint per slot.

- [ ] **Step 8: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (the detector only adds `capability-gap` issues; no existing detector touched).

- [ ] **Step 9: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): capability-gap hint from leading/trailing slot asymmetry"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after both tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Against the export (transient swap or the committed `components/`): build the CLI scan and
  confirm exactly **`button`, `input`, `textarea`, `badge`** each emit one `capability-gap` hint
  on `trailingIcon`, and **no other component** does. List the set.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by
  fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** `SLOT_PAIRS` (Task 1); filled-slot accumulator + paired-asymmetry emit +
  hint severity + routing-nuance message (Task 2); tests for flag/no-icon/uninventoried/one-per-slot.
- **Type safety:** `SLOT_PAIRS: readonly [string, string]` (no `RecipeSlot` import → no cycle);
  `[[a,b],[b,a]] as const` keeps the inner destructuring typed; `mapping.slot` is `RecipeSlot`
  (assignable to the `Set<string>`).
- **Disjoint & additive:** the accumulator piggybacks the existing `getSlotMapping` call; the emit
  loop only pushes `capability-gap` issues; no existing detector touched. Iterating
  `filledSlotsByComponent` means only components with mapped tokens are candidates.
- **No placeholders:** every step has full code + exact command + expected result.
