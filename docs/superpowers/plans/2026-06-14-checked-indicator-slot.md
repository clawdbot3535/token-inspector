# Checked×Color → Indicator Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a `checked` bg-color fill to the `indicator` slot (dropping the redundant `checked` prefix) for components that have an indicator slot — fixing `checkbox/radio-bg-checked-{error,success}` to match Nuxt UI v4. Switch (no indicator) is unchanged.

**Architecture:** One targeted rule in `matchParsed` (`@tg/grammar` `slot-mapping.ts`), consulting `nuxtSlotsFor` like the v0.22.0 overlay guard. No renderer/scanner/allow-list change. The `compoundVariants` emit path is deferred (no motivating tokens).

**Tech Stack:** TypeScript, Vitest, npm workspace (`@tg/grammar`). ESM (`.js` suffix). Pre-commit runs `vue-tsc` + full vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-checked-indicator-slot-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/slot-mapping.ts` — the `matchParsed` indicator rule.
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — new tests + update 2 existing.
- **Modify** `src/recipe-engine.test.ts` — checkbox indicator recipe test.

---

### Task 1: Route checked bg-color → indicator slot

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts`
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Write/adjust the failing tests**

In `packages/grammar/src/slot-mapping.test.ts`:

(a) **Update** the existing `checkbox-bg-checked` test (≈ line 353-357) — repoint to `switch-bg-checked` (a component with no indicator slot, so the base/checked-prefix behavior still holds):

```ts
  it("recognizes checked as a state, emitting a base `checked:` prefix on a component with no indicator slot", () => {
    expect(heuristicSlotMapping("switch-bg-checked")).toEqual({
      slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null, statePrefix: "checked",
    });
  });
```

(b) **Update** the existing `checkbox-bg-checked-error` test (≈ line 788-795) to the new indicator behavior:

```ts
  it("routes a checked bg fill to the indicator slot (checkbox-bg-checked-error)", () => {
    expect(heuristicSlotMapping("checkbox-bg-checked-error", "color")).toEqual({
      slot: "indicator",
      utilityType: "bg-color",
      variantAxis: "color",
      variantKey: "error",
    });
  });
```

(c) **Append** a new describe block:

```ts
describe("checked bg-color → indicator slot", () => {
  it("routes checkbox-bg-checked (no color) to the indicator slot, dropping the prefix", () => {
    expect(heuristicSlotMapping("checkbox-bg-checked")).toEqual({
      slot: "indicator", utilityType: "bg-color", variantAxis: null, variantKey: null,
    });
  });
  it("routes radio-bg-checked-error to the indicator slot", () => {
    expect(heuristicSlotMapping("radio-bg-checked-error", "color")).toEqual({
      slot: "indicator", utilityType: "bg-color", variantAxis: "color", variantKey: "error",
    });
  });
  it("leaves switch-bg-checked-error on the base slot (no indicator slot)", () => {
    expect(heuristicSlotMapping("switch-bg-checked-error", "color")).toEqual({
      slot: "base", utilityType: "bg-color", variantAxis: "color", variantKey: "error", statePrefix: "checked",
    });
  });
  it("does not move a checked border (ring-color) off base", () => {
    expect(heuristicSlotMapping("checkbox-border-checked")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null, statePrefix: "checked",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: FAIL — `checkbox-bg-checked-error` / `checkbox-bg-checked` / `radio-bg-checked-error` still map to `base` with a `checked` prefix.

- [ ] **Step 3: Implement**

In `packages/grammar/src/slot-mapping.ts`, in `matchParsed`, replace the `HEURISTIC_RULES` loop tail:

```ts
  for (const rule of HEURISTIC_RULES) {
    if (rule.match(parsed.utility)) {
      const entry = rule.build(ctx);
      return slot === "base" ? entry : { ...entry, slot };
    }
  }
  return null;
```

with:

```ts
  for (const rule of HEURISTIC_RULES) {
    if (rule.match(parsed.utility)) {
      const entry = rule.build(ctx);
      // A `checked` bg-color fill belongs on the `indicator` slot for components
      // that have one (checkbox/radio): the indicator embodies the checked state,
      // so the fill drops the `checked` prefix and moves off `base`. Components
      // without an indicator slot (switch) keep the base `checked:` behaviour.
      if (
        slot === "base" &&
        entry.statePrefix === "checked" &&
        entry.utilityType === "bg-color" &&
        (nuxtSlotsFor(parsed.component)?.has("indicator") ?? false)
      ) {
        return {
          slot: "indicator",
          utilityType: entry.utilityType,
          variantAxis: entry.variantAxis,
          variantKey: entry.variantKey,
        };
      }
      return slot === "base" ? entry : { ...entry, slot };
    }
  }
  return null;
```

(`nuxtSlotsFor` is already imported in `slot-mapping.ts`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/grammar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "feat(grammar): route checked bg-color fill to the indicator slot (checkbox/radio)"
```

---

### Task 2: Recipe-engine integration test

**Files:**
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Write the test**

In `src/recipe-engine.test.ts`, append:

```ts
describe("buildComponentRecipes — checked fill on the indicator slot", () => {
  it("emits a checkbox checked-error fill on variants.color.error.indicator", () => {
    const graph = makeGraph([
      makeNode({ id: "checkbox-bg-checked-error", layer: "component", type: "color", source: "global", base: "#DC2626" }),
    ]);
    const r = buildComponentRecipes(graph, { components: ["checkbox"] });
    expect(r.checkbox?.variants?.color?.error?.indicator).toContain("bg-[#DC2626]");
    expect(r.checkbox?.variants?.color?.error?.base ?? "").not.toContain("checked:");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/recipe-engine.test.ts -t "indicator slot"`
Expected: PASS (Task 1 makes this true).

- [ ] **Step 3: Commit**

```bash
git add src/recipe-engine.test.ts
git commit -m "test(recipe-engine): lock checkbox checked fill on the indicator slot"
```

---

### Task 3: Verify against the live export + full suite

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test` — Expected: all pass.
Run: `npm run typecheck` — Expected: clean.

- [ ] **Step 2: Verify the real-export recipes**

Create `scripts/_probe-checked.ts`:

```ts
import { parseGitUrl, fetchTokenFiles } from "../src/app/git-import.js";
import { loadSources } from "../src/app/load-sources.js";
import { buildGraph } from "../src/build-graph.js";
import { buildComponentRecipes } from "../src/recipe-engine.js";

const ref = parseGitUrl("https://github.com/clawdbot3535/design-token-export")!;
const g = buildGraph((await loadSources(await fetchTokenFiles(ref))).sources);
for (const c of ["checkbox", "radio", "switch"]) {
  console.log(`\n### ${c} variants.color`);
  console.log(JSON.stringify(buildComponentRecipes(g, { components: [c] })[c]?.variants?.color ?? {}, null, 1));
}
```

Run: `npx tsx scripts/_probe-checked.ts && rm -f scripts/_probe-checked.ts`
Expected: checkbox/radio error+success have the checked fill on `indicator` (no `checked:` on `base`); switch keeps its checked fill on `base`.

---

### Task 4: Release (gated on green tree + user OK)

Target **v0.25.0**.

- [ ] Bump `package.json` to `0.25.0` (`npm version 0.25.0 --no-git-tag-version`).
- [ ] `CHANGELOG.md` entry (checked bg-color fill → indicator slot for checkbox/radio; switch unchanged; note compoundVariants deferred — no motivating tokens).
- [ ] README roadmap line for v0.25.0; update the "Next" line (compoundVariants deferred until variant×color tokens exist; data-state prefix syntax as a follow-up).
- [ ] Commit `chore(release): v0.25.0 — checked fill on the indicator slot`, tag `v0.25.0`.
- [ ] Merge to `main` (`--ff-only`), push (`gh auth switch --user clawdbot3535` if 403, then back to `d56de`), publish the GitHub Release, delete the branch.

---

## Self-Review

- **Spec coverage:** indicator rule → Task 1 impl; checkbox/radio→indicator + switch-unchanged + border-unaffected → Task 1 tests; recipe-level → Task 2; live verify → Task 3. compoundVariants deferral documented in spec (no code).
- **Placeholder scan:** none — concrete code/commands throughout.
- **Type consistency:** the rule returns a `SlotMappingEntry` (`{slot, utilityType, variantAxis, variantKey}`, `statePrefix` omitted); `nuxtSlotsFor` already imported. `toEqual` shapes match the file convention (base entries carry `slot`/`statePrefix`; the indicator result omits `statePrefix`).
