# Component Recipes (card / dropdown / modal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit correct `ui.card` / `ui.dropdown` / `ui.modal` recipes by teaching the grammar a per-component default base slot (card→root, dropdown→content, modal→content) and routing `modal-overlay-bg` to the `overlay` slot.

**Architecture:** A `COMPONENT_BASE_SLOT` map + `defaultBaseSlot()` helper in `@tg/grammar`; `matchParsed` uses it instead of the hard-coded `"base"`. `card`/`modal` join `NUXT_SLOTS`. A 2-line guard in `heuristicSlotMapping` lets the `overlay` slot win over the colliding `overlay-bg` utility. No `COMPONENT_ALLOW_LIST` or renderer change (all three already allow-listed and emitting — this corrects their slots).

**Tech Stack:** TypeScript, Vitest, npm workspace (`@tg/grammar` consumed by `src/`). ESM (`.js` suffix). Pre-commit runs `vue-tsc` + full vitest on every commit.

**Spec:** `docs/superpowers/specs/2026-06-14-component-recipes-design.md`

---

## File Structure

- **Modify** `packages/grammar/src/component-vocab.ts` — `card`+`modal` in `NUXT_SLOTS`; new `COMPONENT_BASE_SLOT` + `defaultBaseSlot`.
- **Modify** `packages/grammar/src/slot-mapping.ts` — `matchParsed` default base slot; overlay-slot guard in `heuristicSlotMapping`.
- **Modify** `packages/grammar/src/component-vocab.test.ts` — new vocab tests.
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — new routing tests + update `modal-border`/`card-border`.
- **Modify** `src/recipe-engine.test.ts` — new card/modal recipe tests + update the card-padding assertion.

No `slot-mapping.ts` consumer (renderer/scanner/build-cli) change beyond the grammar.

---

### Task 1: Per-component default base slot + card/modal vocab

**Files:**
- Modify: `packages/grammar/src/component-vocab.ts`, `packages/grammar/src/slot-mapping.ts`
- Test: `packages/grammar/src/component-vocab.test.ts`, `packages/grammar/src/slot-mapping.test.ts`, `src/recipe-engine.test.ts`

- [ ] **Step 1: Write/adjust the failing tests**

In `packages/grammar/src/component-vocab.test.ts`, add `defaultBaseSlot` to the existing `./component-vocab.js` import, then append:

```ts
describe("nuxtSlotsFor — card / modal", () => {
  it("knows card slots", () => {
    expect(nuxtSlotsFor("card")?.has("root")).toBe(true);
    expect(nuxtSlotsFor("card")?.has("body")).toBe(true);
  });
  it("knows modal slots including overlay", () => {
    expect(nuxtSlotsFor("modal")?.has("content")).toBe(true);
    expect(nuxtSlotsFor("modal")?.has("overlay")).toBe(true);
  });
});

describe("defaultBaseSlot", () => {
  it("maps card→root, dropdown→content, modal→content", () => {
    expect(defaultBaseSlot("card")).toBe("root");
    expect(defaultBaseSlot("dropdown")).toBe("content");
    expect(defaultBaseSlot("modal")).toBe("content");
  });
  it("falls back to base for every other component", () => {
    expect(defaultBaseSlot("button")).toBe("base");
  });
});
```

In `packages/grammar/src/slot-mapping.test.ts`, append (new routing tests):

```ts
describe("per-component default base slot", () => {
  it("routes bare card tokens to the root slot", () => {
    expect(heuristicSlotMapping("card-bg")?.slot).toBe("root");
  });
  it("routes bare dropdown tokens to the content slot", () => {
    expect(heuristicSlotMapping("dropdown-bg")?.slot).toBe("content");
  });
  it("routes bare modal tokens to the content slot", () => {
    expect(heuristicSlotMapping("modal-bg")?.slot).toBe("content");
  });
  it("keeps other components on the base slot", () => {
    expect(heuristicSlotMapping("button-bg")?.slot ?? "base").toBe("base");
  });
});
```

In `packages/grammar/src/slot-mapping.test.ts`, **update** the two existing assertions (the emit is being corrected):
- `modal-border` (≈ line 563): `slot: "base"` → `slot: "content"`.
- `card-border` (≈ line 575): `slot: "base"` → `slot: "root"`.

In `src/recipe-engine.test.ts`, **update** the card-padding assertion (≈ line 750):
`expect(recipes!.card?.slots.base).toContain("p-[8px]")` →
`expect(recipes!.card?.slots.root).toContain("p-[8px]")`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts packages/grammar/src/component-vocab.test.ts`
Expected: FAIL — `defaultBaseSlot` not exported; `card-bg`/`modal-bg` still map to `base`.

- [ ] **Step 3: Implement**

In `packages/grammar/src/component-vocab.ts`, add to the `NUXT_SLOTS` map (after the `accordion` entry, before `button`):

```ts
  ["card", new Set(["root", "header", "title", "description", "body", "footer"])],
  ["modal", new Set([
    "overlay", "content", "header", "wrapper", "body", "footer",
    "title", "description", "close",
  ])],
```

Then, after the `nuxtSlotsFor` function, add:

```ts
/**
 * The default recipe slot for a component's bare (no sub-element) tokens. Nuxt UI
 * v4 components name their styling base differently — Card's is `root`, Dropdown
 * and Modal's is `content` — whereas most components use `base`.
 */
export const COMPONENT_BASE_SLOT: ReadonlyMap<string, string> = new Map([
  ["card", "root"],
  ["dropdown", "content"],
  ["modal", "content"],
]);

/** The base slot for a component's bare tokens (`base` unless overridden). */
export function defaultBaseSlot(component: string): string {
  return COMPONENT_BASE_SLOT.get(component) ?? "base";
}
```

In `packages/grammar/src/slot-mapping.ts`, add `defaultBaseSlot` to the existing `./component-vocab.js` import, then change the default in `matchParsed` (≈ line 363):

```ts
  const slot: RecipeSlot = parsed.slotPrefix ?? defaultBaseSlot(parsed.component);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/grammar src/recipe-engine.test.ts`
Expected: PASS (new + updated tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/component-vocab.ts packages/grammar/src/slot-mapping.ts packages/grammar/src/component-vocab.test.ts packages/grammar/src/slot-mapping.test.ts src/recipe-engine.test.ts
git commit -m "feat(grammar): per-component default base slot (card→root, dropdown/modal→content)"
```

---

### Task 2: Route modal `overlay` slot over the `overlay-bg` utility

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts` (`heuristicSlotMapping`)
- Test: `packages/grammar/src/slot-mapping.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/grammar/src/slot-mapping.test.ts`, append:

```ts
describe("overlay slot vs overlay-bg utility", () => {
  it("routes modal-overlay-bg to the overlay slot, not the overlay-bg base utility", () => {
    const m = heuristicSlotMapping("modal-overlay-bg");
    expect(m?.slot).toBe("overlay");
    expect(m?.utilityType).toBe("bg-color");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t "overlay slot"`
Expected: FAIL — `modal-overlay-bg` matches the `overlay-bg` utility on the `content` slot (slot is `content`, utilityType is `overlay-bg`).

- [ ] **Step 3: Implement the guard**

In `packages/grammar/src/slot-mapping.ts`, in `heuristicSlotMapping`, replace:

```ts
  const normal = matchParsed(parsed, valueType);
  if (normal) return normal;
```

with:

```ts
  const normal = matchParsed(parsed, valueType);
  // An `overlay` slot (e.g. modal) takes precedence over the `overlay-bg` base
  // utility: when the normal pass matched overlay-bg but the component actually
  // has an `overlay` slot, fall through to the slot fallback below so the token
  // routes to `slots.overlay` instead of colliding with the content bg.
  const overlayShadowsSlot =
    normal?.utilityType === "overlay-bg" &&
    (nuxtSlotsFor(parsed.component)?.has("overlay") ?? false);
  if (normal && !overlayShadowsSlot) return normal;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS (incl. the new overlay test; no regressions).

- [ ] **Step 5: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts
git commit -m "fix(grammar): route an overlay slot over the overlay-bg utility (modal)"
```

---

### Task 3: Recipe-engine integration tests (card root, modal content+overlay)

**Files:**
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Write the tests**

In `src/recipe-engine.test.ts`, append a new describe block:

```ts
describe("buildComponentRecipes — card / modal slot correctness", () => {
  it("emits card surface tokens on the root slot", () => {
    const graph = makeGraph([
      makeNode({ id: "card-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "card-padding", layer: "component", type: "dimension", source: "global", base: "24px" }),
    ]);
    const r = buildComponentRecipes(graph, { components: ["card"] });
    expect(r.card?.slots.root).toContain("#FFFFFF");
    expect(r.card?.slots.root).toContain("p-[24px]");
    expect(r.card?.slots.base ?? "").toBe("");
  });

  it("emits modal content and overlay on distinct slots (no bg collision)", () => {
    const graph = makeGraph([
      makeNode({ id: "modal-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "modal-overlay-bg", layer: "component", type: "color", source: "global", base: "rgba(0,0,0,0.5)" }),
    ]);
    const r = buildComponentRecipes(graph, { components: ["modal"] });
    expect(r.modal?.slots.content).toContain("#FFFFFF");
    expect(r.modal?.slots.overlay).toContain("rgba");
    expect(r.modal?.slots.base ?? "").toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/recipe-engine.test.ts -t "slot correctness"`
Expected: PASS (Tasks 1–2 already make this true; these lock the recipe-level behavior).

- [ ] **Step 3: Commit**

```bash
git add src/recipe-engine.test.ts
git commit -m "test(recipe-engine): lock card root + modal content/overlay slot emit"
```

---

### Task 4: Verify against the live export + full suite

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test`
Expected: all pass.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 2: Verify the real-export recipes**

Create `scripts/_probe-recipes.ts`:

```ts
import { parseGitUrl, fetchTokenFiles } from "../src/app/git-import.js";
import { loadSources } from "../src/app/load-sources.js";
import { buildGraph } from "../src/build-graph.js";
import { buildComponentRecipes } from "../src/recipe-engine.js";

const ref = parseGitUrl("https://github.com/clawdbot3535/design-token-export")!;
const g = buildGraph((await loadSources(await fetchTokenFiles(ref))).sources);
const r = buildComponentRecipes(g, { components: ["card", "dropdown", "modal"] });
for (const c of ["card", "dropdown", "modal"]) {
  console.log(`\n### ${c}`);
  for (const [s, v] of Object.entries(r[c]?.slots ?? {})) if (v) console.log(`  slots.${s}: ${v}`);
}
```

Run: `npx tsx scripts/_probe-recipes.ts && rm -f scripts/_probe-recipes.ts`
Expected: `card` → only `slots.root` (no `slots.base`); `dropdown` → `slots.content` (bare) + `slots.item`; `modal` → `slots.content` (bg/ring/padding/rounded) + `slots.overlay` (rgba bg), no double-bg on one slot.

---

### Task 5: Release (gated on green tree + user OK)

Target **v0.22.0**.

- [ ] Bump `package.json` to `0.22.0` (`npm version 0.22.0 --no-git-tag-version`).
- [ ] `CHANGELOG.md` entry (per-component base slot card→root/dropdown→content/modal→content; modal overlay slot; corrects existing wrong-slot emit; deferred stragglers `dropdown-item-hover-bg`, `dropdown-item-text-muted`).
- [ ] README roadmap line for v0.22.0; update the "Next" line (component recipes done for card/dropdown/modal).
- [ ] Commit `chore(release): v0.22.0 — card/dropdown/modal component recipes`, tag `v0.22.0`.
- [ ] Merge to `main` (`--ff-only`), push (`gh auth switch --user clawdbot3535` if 403, then back to `d56de`), publish the GitHub Release, delete the branch.

---

## Self-Review

- **Spec coverage:** per-component base slot → Task 1; `card`/`modal` `NUXT_SLOTS` → Task 1; overlay guard → Task 2; recipe-level correctness → Task 3; existing-test updates (modal-border/card-border/card-padding) → Task 1 Step 1; real-export verify → Task 4.
- **Placeholder scan:** none — concrete code/commands throughout.
- **Type consistency:** `defaultBaseSlot(component: string): string` defined in Task 1, imported into `slot-mapping.ts` and used at line ~363; `COMPONENT_BASE_SLOT` is `ReadonlyMap<string,string>`. The overlay guard uses `nuxtSlotsFor` (already imported in `slot-mapping.ts`). `RecipeSlot = string`, so `root`/`content`/`overlay` are valid with no type change.
