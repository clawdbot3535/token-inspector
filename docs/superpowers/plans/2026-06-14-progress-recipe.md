# Progress Recipe Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map all 6 `progress-*` tokens by registering `progress` in `NUXT_SLOTS` and adding `fill → indicator` / `track → base` to `FIGMA_NUXT_PART_ALIAS`, so `progress-fill-bg` → `slots.indicator` and `progress-track-bg` → `slots.base`.

**Architecture:** Two additive vocabulary changes in `@tg/grammar` (no logic change), reusing the v0.19.0 part-alias seam. `progress` is already in `COMPONENT_ALLOW_LIST` and emits; this completes the two NULL tokens.

**Tech Stack:** TypeScript, Vitest, npm workspace (`@tg/grammar`). ESM (`.js` suffix). Pre-commit runs `vue-tsc` + full vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-progress-recipe-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/component-vocab.ts` — `progress` in `NUXT_SLOTS`; `fill`/`track` in `FIGMA_NUXT_PART_ALIAS`.
- **Modify** `packages/grammar/src/component-vocab.test.ts` — `nuxtSlotsFor("progress")` assertion.
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — fill/track alias routing tests.
- **Modify** `src/recipe-engine.test.ts` — progress recipe integration test.

No allow-list / renderer / scanner change.

---

### Task 1: Register progress slots + fill/track aliases

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts`
- Test: `packages/grammar/src/component-vocab.test.ts`, `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/grammar/src/component-vocab.test.ts`, append:

```ts
describe("nuxtSlotsFor — progress", () => {
  it("knows progress slots including indicator", () => {
    expect(nuxtSlotsFor("progress")?.has("indicator")).toBe(true);
    expect(nuxtSlotsFor("progress")?.has("base")).toBe(true);
  });
});
```

In `packages/grammar/src/slot-mapping.test.ts`, append:

```ts
describe("part alias routing — progress (fill→indicator, track→base)", () => {
  it("routes progress-fill-bg to the indicator slot", () => {
    expect(heuristicSlotMapping("progress-fill-bg", "color")).toEqual({
      slot: "indicator", utilityType: "bg-color", variantAxis: null, variantKey: null,
    });
  });
  it("routes progress-track-bg to the base slot", () => {
    expect(heuristicSlotMapping("progress-track-bg", "color")).toEqual({
      slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts packages/grammar/src/component-vocab.test.ts`
Expected: FAIL — `progress` not in `NUXT_SLOTS`; `progress-fill-bg` / `progress-track-bg` map to `null`.

- [ ] **Step 3: Implement**

In `packages/grammar/src/component-vocab.ts`, add to the `NUXT_SLOTS` map (after the `modal` entry, before the closing `]);`):

```ts
  ["progress", new Set(["root", "base", "indicator", "status", "steps", "step"])],
```

And add to `FIGMA_NUXT_PART_ALIAS` (after the `["dot", "indicator"]` entry):

```ts
  ["fill", "indicator"],
  ["track", "base"],
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/grammar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "feat(grammar): map progress fill→indicator / track→base (progress recipe)"
```

---

### Task 2: Recipe-engine integration test

**Files:**
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Write the test**

In `src/recipe-engine.test.ts`, append a new describe block:

```ts
describe("buildComponentRecipes — progress", () => {
  it("maps track bg to base, fill bg to indicator, and heights to size variants", () => {
    const graph = makeGraph([
      makeNode({ id: "progress-track-bg", layer: "component", type: "color", source: "global", base: "#E4E4E7" }),
      makeNode({ id: "progress-fill-bg", layer: "component", type: "color", source: "global", base: "#5667A7" }),
      makeNode({ id: "progress-radius", layer: "component", type: "dimension", source: "global", base: "999px" }),
      makeNode({ id: "progress-height-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    const r = buildComponentRecipes(graph, { components: ["progress"] });
    expect(r.progress?.slots.base).toContain("bg-[#E4E4E7]");
    expect(r.progress?.slots.base).toContain("rounded-[999px]");
    expect(r.progress?.slots.indicator).toContain("bg-[#5667A7]");
    expect(r.progress?.variants?.size?.md?.base).toContain("h-[8px]");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/recipe-engine.test.ts -t "progress"`
Expected: PASS (Task 1 already makes this true; this locks the recipe-level behavior).

- [ ] **Step 3: Commit**

```bash
git add src/recipe-engine.test.ts
git commit -m "test(recipe-engine): lock progress base/indicator/size recipe"
```

---

### Task 3: Verify against the live export + full suite

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test` — Expected: all pass.
Run: `npm run typecheck` — Expected: clean.

- [ ] **Step 2: Verify the real-export recipe**

Create `scripts/_probe-progress.ts`:

```ts
import { parseGitUrl, fetchTokenFiles } from "../src/app/git-import.js";
import { loadSources } from "../src/app/load-sources.js";
import { buildGraph } from "../src/build-graph.js";
import { buildComponentRecipes } from "../src/recipe-engine.js";

const ref = parseGitUrl("https://github.com/clawdbot3535/design-token-export")!;
const g = buildGraph((await loadSources(await fetchTokenFiles(ref))).sources);
console.log(JSON.stringify(buildComponentRecipes(g, { components: ["progress"] }).progress, null, 2));
```

Run: `npx tsx scripts/_probe-progress.ts && rm -f scripts/_probe-progress.ts`
Expected: `slots.base` = `bg-[#E4E4E7] rounded-[999px]` (track bg + radius); `slots.indicator` = `bg-[#5667A7]` (fill bg); `variants.size` sm/md/lg → `h-[4px]`/`h-[8px]`/`h-[12px]`. All 6 tokens mapped, none NULL.

---

### Task 4: Release (gated on green tree + user OK)

Target **v0.24.0**.

- [ ] Bump `package.json` to `0.24.0` (`npm version 0.24.0 --no-git-tag-version`).
- [ ] `CHANGELOG.md` entry (progress recipe: `fill → indicator`, `track → base` aliases + `progress` in `NUXT_SLOTS`, completing the 2 NULL tokens; note tooltip/popover have no tokens and kbd already emits correctly).
- [ ] README roadmap line for v0.24.0; update the "Next" line (drop tooltip/popover/kbd/progress; note tooltip/popover deferred until they have tokens).
- [ ] Commit `chore(release): v0.24.0 — progress component recipe`, tag `v0.24.0`.
- [ ] Merge to `main` (`--ff-only`), push (`gh auth switch --user clawdbot3535` if 403, then back to `d56de`), publish the GitHub Release, delete the branch.

---

## Self-Review

- **Spec coverage:** `NUXT_SLOTS` progress + fill/track aliases → Task 1; recipe-level correctness → Task 2; live-export verify → Task 3. tooltip/popover/kbd scope decisions documented in the spec (no code).
- **Placeholder scan:** none — concrete code/commands throughout.
- **Type consistency:** tests use the existing `heuristicSlotMapping` / `buildComponentRecipes` / `makeNode` / `makeGraph` helpers already in those files; the `toEqual` shape matches the file's alias-test convention (base entries carry `slot: "base"`). No new exports introduced.
