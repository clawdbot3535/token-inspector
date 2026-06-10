# icon slot mirror — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror `leadingIcon` recipe classes to `trailingIcon` (own tokens win) via a shared `SLOT_MIRROR` constant consumed by the recipe engine AND the scanner — so trailing icons get sized and the `capability-gap` misreport stops.

**Architecture:** Task 1 = `SLOT_MIRROR` constant + recipe-engine post-build mirror + tests (+ golden review). Task 2 = scanner record-time mirror + tests. Both small; each leaves the suite green.

**Tech Stack:** TS engine, Vitest, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest; every task commit must be green.

**Branch:** `feat/icon-slot-mirror` (spec at `d97cc0a`).

**Spec:** `docs/superpowers/specs/2026-06-10-icon-slot-mirror-design.md`

**Reminders:**
- Git attribution disabled — NO trailer; verify `git log -1 --format=%B`, amend if present.
- `typecheck` excludes `.test.ts`.
- Golden `app.config.ts` snapshot WILL change — review the diff (ONLY new `trailingIcon` entries) before `-u`.

---

### Task 1: `SLOT_MIRROR` + recipe-engine mirror

**Files:** Modify `src/component-vocab.ts`, `src/recipe-engine.ts`; Test `src/recipe-engine.test.ts`; golden snapshot via `-u` after review.

- [ ] **Step 1: Failing tests** — add to `src/recipe-engine.test.ts` (mirror the file's existing graph-builder helper):

```typescript
  it("mirrors leadingIcon classes to trailingIcon when trailingIcon has no own tokens", () => {
    const graph = /* helper: { button: { "icon-size": { $value: 16, $type: "number" } } } */;
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes["button"]?.slots["leadingIcon"]).toContain("size-[16px]");
    expect(recipes["button"]?.slots["trailingIcon"]).toBe(recipes["button"]?.slots["leadingIcon"]);
  });

  it("keeps explicit trailingIcon tokens instead of the mirror", () => {
    const graph = /* helper: { button: { "icon-size": { $value: 16, $type: "number" },
                                          "trailingIcon-size": { $value: 20, $type: "number" } } } */;
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes["button"]?.slots["trailingIcon"]).toContain("size-[20px]");
    expect(recipes["button"]?.slots["trailingIcon"]).not.toContain("size-[16px]");
  });

  it("mirrors inside size-variant buckets too", () => {
    const graph = /* helper: { button: { "icon-size-md": { $value: 16, $type: "number" } } } */;
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const md = recipes["button"]?.variants.size?.["md"];
    expect(md?.["leadingIcon"]).toContain("size-[16px]");
    expect(md?.["trailingIcon"]).toBe(md?.["leadingIcon"]);
  });
```
NOTE for the second test: `button-trailingIcon-size` routes via the exact-match sub-element
fallback only if `trailingIcon` is in `nuxtSlotsFor("button")` — verify with a quick
`heuristicSlotMapping("button-trailingIcon-size")` probe; if it does NOT route (slot not in the
button inventory), use a component whose inventory contains `trailingIcon`, or assert the
own-token-wins behaviour through a slot-mapping override instead — report which path was taken.

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/recipe-engine.test.ts`.

- [ ] **Step 3: Implement**

`src/component-vocab.ts` — next to `SLOT_PAIRS` (~line 169):
```typescript
/** Slots whose classes mirror to a partner slot when the partner has no own
 *  tokens. Figma defines icon utilities once (`icon-size`) for ANY icon;
 *  Nuxt's theme sizes leading AND trailing alike. Consumed by the recipe
 *  engine (post-build copy) and the scanner (filled-slot recording). */
export const SLOT_MIRROR: ReadonlyArray<readonly [string, string]> = [
  ["leadingIcon", "trailingIcon"],
];
```

`src/recipe-engine.ts` — import `SLOT_MIRROR` from `./component-vocab.js` (extend the existing
import); at the END of `buildComponentRecipes`, after all tokens are bucketed and any existing
post-passes, before the return, add:
```typescript
  // Mirror icon classes to the partner slot (Figma defines icon-size once for
  // ANY icon; Nuxt sizes leading AND trailing alike). Own tokens win per bucket.
  for (const recipe of Object.values(recipes)) {
    for (const [from, to] of SLOT_MIRROR) {
      if (recipe.slots[from] !== undefined && recipe.slots[to] === undefined) {
        recipe.slots[to] = recipe.slots[from];
      }
      for (const axis of Object.values(recipe.variants)) {
        for (const entry of Object.values(axis)) {
          if (entry[from] !== undefined && entry[to] === undefined) {
            entry[to] = entry[from];
          }
        }
      }
    }
  }
```
(Adapt the iteration to the file's actual recipe/variants shapes — `recipes` may be a Map or
record; `axis` entries are `Record<string, Record<RecipeSlot, string>>`-like. Mirror the existing
code style.)

- [ ] **Step 4: Run → PASS** — `npx vitest run src/recipe-engine.test.ts`.
- [ ] **Step 5: Full gate + golden review** — `npm run typecheck && npx vitest run`. The golden
  `app.config.ts` snapshot will fail: inspect the diff — ONLY new `trailingIcon` entries (mirroring
  leadingIcon values) — then `npx vitest run -u` and re-run green. Report the exact diff.
- [ ] **Step 6: Commit**
```bash
git add src/component-vocab.ts src/recipe-engine.ts src/recipe-engine.test.ts src/renderers/__snapshots__
git commit -m "feat(recipes): mirror leadingIcon classes to trailingIcon (SLOT_MIRROR, own tokens win)"
```
Verify no trailer.

---

### Task 2: scanner record-time mirror

**Files:** Modify `src/scanner.ts`; Test `src/scanner.test.ts`.

- [ ] **Step 1: Failing tests** — add to `src/scanner.test.ts` (mirror the file's existing
  capability-gap test setup — there are existing tests for the trailingIcon gap to model on):

```typescript
  it("does not flag a trailingIcon capability-gap when icon-size fills leadingIcon (mirrored)", () => {
    const graph = /* helper: a button graph with "icon-size": 16 and a base token (e.g. bg) */;
    const report = /* run the scanner the way neighbouring tests do */;
    const gaps = report.issues.filter((i) => i.kind === "capability-gap");
    expect(gaps.some((g) => /trailingIcon/.test(g.message ?? ""))).toBe(false);
  });

  it("still flags the reverse direction (explicit trailing token, no leading)", () => {
    const graph = /* helper: a component graph with ONLY a trailingIcon-routed token + a base token */;
    const report = /* … */;
    const gaps = report.issues.filter((i) => i.kind === "capability-gap");
    expect(gaps.some((g) => /leadingIcon/.test(g.message ?? ""))).toBe(true);
  });
```
(Adapt graph/report access to the file's existing helpers EXACTLY; there are existing
capability-gap tests — extend their pattern. If an existing test asserts the OLD behaviour — a
trailingIcon gap fired by icon-size — UPDATE that test to the new truthful behaviour and call it
out in your report.)

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — in `src/scanner.ts`: extend the component-vocab import with
  `SLOT_MIRROR`; at the filled-slot recording site (~line 147):
```typescript
    fslots.add(mapping.slot);
    for (const [from, to] of SLOT_MIRROR) {
      if (mapping.slot === from) fslots.add(to);
    }
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/scanner.test.ts`.
- [ ] **Step 5: Full gate + build** — `npm run typecheck && npx vitest run && npm run build`.
- [ ] **Step 6: Commit**
```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scan): mirrored slots count as filled — capability-gap stops misreporting trailingIcon"
```
Verify no trailer.

---

## Final verification

- [ ] `npm run typecheck && npx vitest run && npm run build` — green.
- [ ] `npm run build:tokens`; diff `output/nuxt/app.config.ts` vs main — only `trailingIcon`
  additions; confirm via a scan probe that the button/input/badge trailingIcon capability-gap
  hints are gone and no NEW findings appeared.
- [ ] Headless QA: load the real export; check the scan view has no trailingIcon capability-gap;
  LiveInput trailing icon carries the size (inline style); console clean. Screenshot.
- [ ] Dispatch a final code reviewer.
- [ ] superpowers:finishing-a-development-branch — **do not push**; FF-merge to `main` only on
  explicit user request.

## Self-review notes

- **Spec coverage:** constant (T1), engine mirror incl. variants + own-token-wins (T1), golden
  review (T1), scanner mirror + both directions (T2). All mapped.
- **Helper references:** test snippets explicitly defer to each file's existing helpers (graph
  builder, scanner runner) — the implementer extends established patterns rather than inventing
  parallel ones; the trailingIcon-routing caveat in T1 test 2 has an explicit probe + fallback.
- **No placeholders that hide work:** every implementation step has the actual code; the two
  "adapt to file shape" notes concern mechanical iteration shapes, with the logic fully given.
