# Bucket 3 — unsupported-state detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A state token on a stateless component (kbd → UKbd, which has no interaction states) should be dropped instead of emitting an inert `active:`, and flagged as a new `unsupported-state` deviation.

**Architecture:** Add a `STATELESS_COMPONENTS` set to the grammar (mirroring `PROP_DRIVEN_STATES`). `heuristicSlotMapping` drops a state token whose component is in the set; the scanner's existing `mapping === null` branch flags it `unsupported-state`. Pure emit/scan change — fully unit-testable, no render change. Per-component scoping leaves button/input states intact.

**Tech Stack:** TypeScript, the `@tg/grammar` workspace package, Vitest. `npx tsx` for ad-hoc checks.

---

## File Structure

- `packages/grammar/src/component-vocab.ts` — add the `STATELESS_COMPONENTS` set (auto-exported via the package index).
- `packages/grammar/src/slot-mapping.ts` — import the set; add the drop guard after the prop-driven guard.
- `src/scanner.ts` — import the set + `STATE_KEYS`; add the `unsupportedStateForId` detector + the `unsupported-state` issue push.
- `packages/grammar/src/component-vocab.test.ts` — set membership.
- `packages/grammar/src/slot-mapping.test.ts` — kbd state tokens drop; non-state/non-stateless intact.
- `src/scanner.test.ts` — kbd state token → `unsupported-state` warning.
- `src/recipe-engine.test.ts` — no `active:` in a kbd recipe.

One task: three small source changes (set + drop + flag) that together implement one behavior, with tests across the grammar, scanner, and recipe-engine layers.

---

### Task 1: unsupported-state detector for stateless components

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts`, `packages/grammar/src/slot-mapping.ts`, `src/scanner.ts`
- Test: `packages/grammar/src/component-vocab.test.ts`, `packages/grammar/src/slot-mapping.test.ts`, `src/scanner.test.ts`, `src/recipe-engine.test.ts`

- [ ] **Step 1: Write the failing tests (all four test files)**

In `packages/grammar/src/component-vocab.test.ts`, add a new `describe` block (after the existing `describe("PROP_DRIVEN_STATES / propDrivenStateFor", …)` block). Add `STATELESS_COMPONENTS` to the existing import from `./component-vocab.js` at the top of the file:

```ts
describe("STATELESS_COMPONENTS", () => {
  it("includes kbd (UKbd has no interaction states)", () => {
    expect(STATELESS_COMPONENTS.has("kbd")).toBe(true);
  });
  it("excludes components that do have states (button)", () => {
    expect(STATELESS_COMPONENTS.has("button")).toBe(false);
  });
});
```

In `packages/grammar/src/slot-mapping.test.ts`, add next to the existing prop-driven drop tests (`drops input-border-active …`, ~line 679). `heuristicSlotMapping` is already imported:

```ts
  it("drops kbd state tokens (UKbd is stateless — no :active/:hover/etc.)", () => {
    expect(heuristicSlotMapping("kbd-bg-active", "color")).toBeNull();
  });

  it("leaves kbd non-state and non-stateless components' states intact", () => {
    expect(heuristicSlotMapping("kbd-bg", "color")).not.toBeNull(); // base bg, no state — unaffected
    expect(heuristicSlotMapping("button-solid-bg-active", "color")).not.toBeNull(); // button :active is real
  });
```

In `src/scanner.test.ts`, add next to the existing `state-via-prop` tests (`flags input-border-active …`, ~line 500). `makeGraph`, `makeNode`, `scanGraph` are already in scope:

```ts
  it("flags kbd-bg-active as an unsupported state (kbd is stateless)", () => {
    const graph = makeGraph([
      makeNode({ id: "kbd-bg-active", layer: "component", type: "color", source: "global", base: "#27272A" }),
    ]);
    const report = scanGraph(graph, { components: ["kbd"] });
    const hint = report.issues.find((i) => i.kind === "unsupported-state");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("warning");
    expect(hint?.componentName).toBe("kbd");
    expect(hint?.message).toContain("stateless");
    expect(hint?.tokenIds).toContain("kbd-bg-active");
  });

  it("does not flag button-solid-bg-active as unsupported-state (button has :active)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-bg-active", layer: "component", type: "color", source: "global", base: "#5667A7" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "unsupported-state")).toBeUndefined();
  });
```

In `src/recipe-engine.test.ts`, add inside the existing `describe("buildComponentRecipes", …)` block. `buildComponentRecipes`, `makeNode`, `makeGraph` are already in scope:

```ts
  it("emits no `active:` classes for kbd (UKbd is stateless)", () => {
    const graph = makeGraph([
      makeNode({ id: "kbd-bg-active", layer: "component", type: "color", source: "global", base: "#27272A" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["kbd"] });
    expect(JSON.stringify(recipes.kbd ?? {})).not.toContain("active:");
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/scanner.test.ts src/recipe-engine.test.ts`
Expected: FAIL —
  - `STATELESS_COMPONENTS` is not exported yet → the component-vocab test fails to import / `STATELESS_COMPONENTS.has` is undefined.
  - `heuristicSlotMapping("kbd-bg-active","color")` returns `{slot:"base",utilityType:"bg-color",variantAxis:null,variantKey:null,statePrefix:"active"}` (verified current behavior), not `null`.
  - the scanner produces no `unsupported-state` issue for the kbd token (mapping is non-null today, so the null branch isn't reached).
  - the kbd recipe currently serializes with `active:bg-[#27272A]` → `not.toContain("active:")` fails.
  - The "leaves … intact" and "does not flag button" guard tests PASS already — that's fine.

If the red step does not behave as described, STOP and report it rather than forcing green.

- [ ] **Step 3: Add the `STATELESS_COMPONENTS` set (grammar vocab)**

In `packages/grammar/src/component-vocab.ts`, immediately after the `PROP_DRIVEN_STATES` map and its `propDrivenStateFor` function (~line 99), add:

```ts
/**
 * Components mapped to Nuxt UI v4 components that expose NO interaction states at all
 * (UKbd is a static key display — no hover/active/focus/disabled). Any state token on these
 * is unexpressible: the grammar drops it and the scanner flags an `unsupported-state` deviation.
 * Distinct from PROP_DRIVEN_STATES (there a prop drives the state; here the state does not exist).
 * Seed: kbd (the live-export case `kbd-bg-active`). badge/card/progress are candidate additions
 * when an export carries their state tokens; custom components (chip/sidebar) are excluded.
 */
export const STATELESS_COMPONENTS: ReadonlySet<string> = new Set(["kbd"]);
```

- [ ] **Step 4: Add the grammar drop guard (slot-mapping)**

In `packages/grammar/src/slot-mapping.ts`, add `STATELESS_COMPONENTS` to the existing import from `./component-vocab.js` (the import that already brings in `STATE_KEYS`, `propDrivenStateFor`, etc., ~line 81).

Then, immediately after the existing prop-driven guard:

```ts
  // Prop-driven states (input `active` → `highlight` prop) are applied by Nuxt
  // via a prop, not a recipe class — drop them; the scanner flags the deviation.
  if (propDrivenStateFor(parsed.component, parsed.state) !== null) {
    return null;
  }
```

add:

```ts
  // Stateless components (kbd) expose NO interaction states — a state token here can't be
  // expressed as a recipe class; drop it. The scanner flags it as `unsupported-state`.
  if (parsed.state !== null && parsed.state !== "default" && STATELESS_COMPONENTS.has(parsed.component)) {
    return null;
  }
```

- [ ] **Step 5: Add the scanner detector + flag**

In `src/scanner.ts`, add `STATELESS_COMPONENTS` and `STATE_KEYS` to the existing import from `@tg/grammar` (~line 20, the import that already brings in `getSlotMapping`, `propDrivenStateFor`, etc.).

Add a detector helper next to the existing `propDrivenStateForId` (~line 41-48):

```ts
/** {state} when the token's trailing segment is an interaction state on a stateless component, else null. */
function unsupportedStateForId(id: string): { state: string } | null {
  const segs = id.split("-");
  if (segs.length < 2) return null;
  const component = segs[0]!;
  const last = segs[segs.length - 1]!;
  if (!STATELESS_COMPONENTS.has(component)) return null;
  if (last === "default" || !STATE_KEYS.has(last)) return null;
  return { state: last };
}
```

In the `if (mapping === null) { … }` block, after the `pd` (`state-via-prop`) push and before the null-token accounting (`const nseg = node.id.split("-")[1];`), add:

```ts
      const us = unsupportedStateForId(node.id);
      if (us !== null) {
        issues.push({
          id: `us-${node.id}`,
          category: "classification-hint",
          severity: "warning",
          kind: "unsupported-state",
          message:
            `\`${node.id}\` targets the \`${us.state}\` state, but Nuxt UI v4's \`${prefix}\` is a ` +
            `stateless component (no hover/active/focus/disabled) — so no \`ui.${prefix}\` override is emitted.`,
          tokenIds: [node.id],
          componentName: prefix,
        });
      }
```

(`prefix` is the already-computed `node.id.split("-")[0]`. `ScanIssue.kind` is typed `string`, so `"unsupported-state"` needs no type change.)

- [ ] **Step 6: Run the four test files to verify green**

Run: `npx vitest run packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/scanner.test.ts src/recipe-engine.test.ts`
Expected: PASS — all new tests green; existing prop-driven/input/button tests in these files stay green.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — full suite green (~897 tests; was 892, +5 new tests). If a pre-existing test asserted `kbd-bg-active` maps or emits `active:`, update it to the dropped/flagged behavior (none expected; the suite is authoritative).

- [ ] **Step 8: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/slot-mapping.ts src/scanner.ts packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/scanner.test.ts src/recipe-engine.test.ts
git commit -m "feat(grammar): unsupported-state detector — drop + flag state tokens on stateless components (kbd)"
```

NOTE: a pre-commit hook runs full typecheck + the whole vitest suite automatically on commit; that is expected and should pass.

---

## Notes for the implementer

- Do **not** add any component to `STATELESS_COMPONENTS` other than `kbd`. badge/card/progress are documented future additions but have no motivating tokens today; chip/sidebar are custom (excluded).
- `pd` (`state-via-prop`) and `us` (`unsupported-state`) are mutually exclusive — kbd is not in `PROP_DRIVEN_STATES` — so the two scanner checks are independent `if`s. Do not make `us` an `else if` of `pd` unless you also confirm no token could be both (it can't today, but independent `if`s are clearer).
- No browser/dev-server step — recipe emit + scan output only, both unit-tested.

---

## Self-Review

**1. Spec coverage:**
- `STATELESS_COMPONENTS` set (spec §1) → Step 3. ✓
- Grammar drop guard (spec §2) → Step 4. ✓
- Scanner `unsupportedStateForId` + `unsupported-state` push (spec §3) → Step 5. ✓
- Per-component scoping / non-state tokens intact (spec "Error handling") → slot-mapping guard test + scanner button test. ✓
- No `active:` in kbd recipe (spec "Testing") → recipe-engine test. ✓
- New `unsupported-state` kind, no type change (spec §3) → Step 5 note (`kind: string`). ✓
- No browser verification (spec "Testing") → Notes + step list. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases". Every code step shows full code with exact insertion anchors; every run step has the command + empirically-verified red/green values (`statePrefix:"active"` today → `null` after).

**3. Type consistency:** `STATELESS_COMPONENTS: ReadonlySet<string>` is used via `.has(string)` in both `slot-mapping.ts` and `scanner.ts` and the tests — consistent. `unsupportedStateForId` returns `{ state: string } | null`, matching `propDrivenStateForId`'s shape convention. The scanner issue object shape (`id`, `category`, `severity`, `kind`, `message`, `tokenIds`, `componentName`) matches the adjacent `state-via-prop` push exactly. `heuristicSlotMapping(id, "color")` and `buildComponentRecipes(graph, { components })` signatures used as they exist. `STATE_KEYS` and `STATELESS_COMPONENTS` are both exported from `@tg/grammar` (the index `export *`s `component-vocab.js`).

No issues found.
