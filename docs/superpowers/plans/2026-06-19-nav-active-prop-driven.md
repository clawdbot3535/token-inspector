# nav `active` → prop/variant-driven deviation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop emitting the inert `active:` (Tailwind `:active` press) for nav's current-page tokens — recognize nav `active` as prop/variant-driven so the grammar drops it and the scanner flags it as a `state-via-prop` deviation.

**Architecture:** One-line addition to the `PROP_DRIVEN_STATES` table in the grammar. This activates two already-wired paths: `heuristicSlotMapping`/`getSlotMapping` return `null` for nav `active` tokens (no inert `active:`), and the scanner emits a `state-via-prop` warning. Per-component keying preserves button's legitimate `:active` press state. Pure emit/scan change — fully unit-testable, no render change.

**Tech Stack:** TypeScript, the `@tg/grammar` workspace package, Vitest. `npx tsx` for ad-hoc checks.

---

## File Structure

- `packages/grammar/src/component-vocab.ts` — add the `nav` entry to `PROP_DRIVEN_STATES` (the only source change).
- `packages/grammar/src/component-vocab.test.ts` — `propDrivenStateFor("nav","active")` unit test.
- `packages/grammar/src/slot-mapping.test.ts` — nav active tokens drop; nav non-active + button active still map.
- `src/scanner.test.ts` — nav active token → `state-via-prop` warning.
- `src/recipe-engine.test.ts` — a nav recipe carries no `active:` classes.

One task: the change is atomic (a single table entry) with tests spanning the grammar, scanner, and recipe-engine layers that all verify it.

---

### Task 1: nav `active` joins `PROP_DRIVEN_STATES`

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts` (the `PROP_DRIVEN_STATES` map, ~lines 89-93)
- Test: `packages/grammar/src/component-vocab.test.ts`, `packages/grammar/src/slot-mapping.test.ts`, `src/scanner.test.ts`, `src/recipe-engine.test.ts`

- [ ] **Step 1: Write the failing tests (all four files)**

In `packages/grammar/src/component-vocab.test.ts`, add inside the existing `describe("PROP_DRIVEN_STATES / propDrivenStateFor", …)` block (after the input/button cases):

```ts
  it("marks nav `active` as prop/variant-driven (Nuxt applies it via the active variant)", () => {
    expect(propDrivenStateFor("nav", "active")).toBe("active");
  });
```

In `packages/grammar/src/slot-mapping.test.ts`, add next to the existing input/textarea prop-driven drop tests (the `drops input-border-active …` tests, ~line 679). `heuristicSlotMapping` is already imported in this file:

```ts
  it("drops nav-item-<variant>-*-active (Nuxt applies nav `active` via the active variant, not :active)", () => {
    expect(heuristicSlotMapping("nav-item-outline-bg-active", "color")).toBeNull();
    expect(heuristicSlotMapping("nav-item-link-text-active", "color")).toBeNull();
  });

  it("leaves nav non-active and button :active mappings intact (per-component scoping)", () => {
    expect(heuristicSlotMapping("nav-item-link-text", "color")).not.toBeNull(); // non-active nav token unaffected
    expect(heuristicSlotMapping("button-solid-bg-active", "color")).not.toBeNull(); // button press is a real :active
  });
```

In `src/scanner.test.ts`, add next to the existing `state-via-prop` tests (the `flags input-border-active …` test, ~line 500). `makeGraph`, `makeNode`, `scanGraph` are already in scope:

```ts
  it("flags nav-item-outline-bg-active as applied via the active variant/prop", () => {
    const graph = makeGraph([
      makeNode({ id: "nav-item-outline-bg-active", layer: "component", type: "color", source: "global", base: "#5667A7" }),
    ]);
    const report = scanGraph(graph, { components: ["nav"] });
    const hint = report.issues.find((i) => i.kind === "state-via-prop");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("warning");
    expect(hint?.componentName).toBe("nav");
    expect(hint?.message).toContain("active");
    expect(hint?.tokenIds).toContain("nav-item-outline-bg-active");
  });
```

In `src/recipe-engine.test.ts`, add inside the existing `describe("buildComponentRecipes", …)` block. `buildComponentRecipes`, `makeNode`, `makeGraph`, `buildGraph` are already in scope:

```ts
  it("emits no `active:` classes for nav (active is prop/variant-driven, not :active)", () => {
    const graph = makeGraph([
      makeNode({ id: "nav-item-outline-bg-active", layer: "component", type: "color", source: "global", base: "#5667A7" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["nav"] });
    expect(JSON.stringify(recipes.nav ?? {})).not.toContain("active:");
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/scanner.test.ts src/recipe-engine.test.ts`
Expected: FAIL —
  - `propDrivenStateFor("nav","active")` returns `null` (nav not yet in the table), not `"active"`.
  - `heuristicSlotMapping("nav-item-outline-bg-active","color")` returns `{slot:"item",…,statePrefix:"active"}` (verified current behavior), not `null`.
  - the scanner produces no `state-via-prop` issue for the nav token (mapping is non-null today, so the scanner's null-mapping branch isn't reached).
  - the nav recipe currently serializes with an `active:bg-[#5667A7]` class → `toContain("active:")` is true, so `not.toContain` fails.
  - The "leaves nav non-active and button :active intact" test PASSES already (those still map) — that's fine; it's a guard, not a red driver.

- [ ] **Step 3: Add the nav entry to `PROP_DRIVEN_STATES`**

In `packages/grammar/src/component-vocab.ts`, change the `PROP_DRIVEN_STATES` map from:

```ts
export const PROP_DRIVEN_STATES: ReadonlyMap<string, ReadonlyMap<string, string>> =
  new Map([
    ["input", new Map([["active", "highlight"]])],
    ["textarea", new Map([["active", "highlight"]])],
  ]);
```

to:

```ts
export const PROP_DRIVEN_STATES: ReadonlyMap<string, ReadonlyMap<string, string>> =
  new Map([
    ["input", new Map([["active", "highlight"]])],
    ["textarea", new Map([["active", "highlight"]])],
    // Nuxt UI v4 NavigationMenu applies the active (current-page) look via a baked-in
    // `active` boolean variant + compoundVariants, not a `:active` pseudo-class. So the
    // recipe can't express it (slot `ui` overrides apply unconditionally) — drop + flag.
    ["nav", new Map([["active", "active"]])],
  ]);
```

This is the only source change. It is variant-independent (the `propDrivenStateFor` guard in `slot-mapping.ts` keys on `parsed.component`/`parsed.state`), so all of outline/ghost/link nav active tokens drop, and the scanner (keying on `segs[0]` = `"nav"`) flags them.

- [ ] **Step 4: Run the four test files to verify green**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/scanner.test.ts src/recipe-engine.test.ts`
Expected: PASS — all new tests green, and the existing input/textarea/button tests in these files stay green (per-component scoping unchanged).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — full suite green (~892 tests; was 887, +5 new tests). If any pre-existing test asserted that a nav active token emits `active:` or maps to a slot, update it to the dropped/flagged behavior (the earlier grep found none; the suite is authoritative).

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/scanner.test.ts src/recipe-engine.test.ts
git commit -m "fix(grammar): nav active is prop/variant-driven — drop inert active:, flag deviation"
```

NOTE: a pre-commit hook runs full typecheck + the whole vitest suite automatically on commit; that is expected and should pass.

---

## Notes for the implementer

- **Overlay-context tokens** (`nav-item-overlay-dark/light-*-active`) are already `null`-mapped today (verified: `heuristicSlotMapping("nav-item-overlay-dark-outline-bg-active", …)` → `null`). After this change the scanner will additionally flag them `state-via-prop` (it keys on `segs[0]` = `"nav"`). That is acceptable/desirable — no special handling. If the full suite surfaces an existing scanner expectation about these overlay tokens, reconcile it to the new `state-via-prop` flagging (do not expand scope to suppress it).
- Do **not** add any other component to `PROP_DRIVEN_STATES`. Button `:active` is a real press state and must keep emitting `active:` (guarded by the slot-mapping test).
- No browser/dev-server step — this changes recipe emit + scan output only, both unit-tested.

---

## Self-Review

**1. Spec coverage:**
- Grammar change: add `nav` to `PROP_DRIVEN_STATES` (spec §1) → Task 1 Step 3. ✓
- Activates the drop (`slot-mapping.ts:387`) → grammar drop test (Step 1, slot-mapping.test.ts). ✓
- Activates the scanner flag (`scanner.ts:82`) → scanner test (Step 1, scanner.test.ts). ✓
- Per-component scoping preserved (spec §2) → button-active guard test. ✓
- No `active:` in nav recipe (spec "Testing") → recipe-engine test. ✓
- Overlay-context edge case (spec "Error handling") → Notes (already null; now flagged). ✓
- No browser verification (spec "Testing") → stated in Notes + Step list. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases". Every test step has full code; every run step has the command + expected red/green with the empirically-verified current values (`statePrefix:"active"` today → `null` after).

**3. Type consistency:** `propDrivenStateFor(component, state)` returns `string | null` — the test expects `"active"`. `PROP_DRIVEN_STATES` type is `ReadonlyMap<string, ReadonlyMap<string, string>>` — the new `["nav", new Map([["active", "active"]])]` entry matches. `heuristicSlotMapping(id, type?)` and `getSlotMapping(id, override?, type?)` signatures are used as they exist. Scanner issue shape (`kind`, `severity`, `componentName`, `message`, `tokenIds`) matches the existing input `state-via-prop` test. `buildComponentRecipes(graph, { components })` returns `{ [name]: recipe }` as used in existing button tests.

No issues found.
