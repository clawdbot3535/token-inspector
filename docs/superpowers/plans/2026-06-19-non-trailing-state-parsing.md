# non-trailing state parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse an interaction state in non-trailing position (`<state>-<utility>`, e.g. `hover-bg`, `disabled-bg`), so those tokens route where the state is real (dropdown/table hover) or are flagged where it isn't (badge disabled).

**Architecture:** A non-trailing state scan in `parseSegments` (after the trailing-state block) pulls a `STATE_KEYS` segment (excl. `default`) out of the utility. `badge` joins `STATELESS_COMPONENTS` (UBadge is stateless) so `badge-disabled-*` drops instead of emitting an inert `disabled:`. The scanner's state detectors gain non-trailing parity so the dropped badge token is still flagged.

**Tech Stack:** TypeScript, `@tg/grammar`, Vitest, `/browse`.

---

## File Structure

- `packages/grammar/src/slot-mapping.ts` — non-trailing state scan in `parseSegments`.
- `packages/grammar/src/component-vocab.ts` — add `badge` to `STATELESS_COMPONENTS`.
- `src/scanner.ts` — `unsupportedStateForId` + `propDrivenStateForId` non-trailing parity.
- Tests: `slot-mapping.test.ts`, `component-vocab.test.ts`, `recipe-engine.test.ts`, `scanner.test.ts`.

Ordering: Task 1 (grammar parse + badge STATELESS — interdependent) → Task 2 (scanner parity) → Task 3 (browser).

---

### Task 1: Grammar — non-trailing state parse + `badge` stateless

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts`, `packages/grammar/src/component-vocab.ts`
- Test: `packages/grammar/src/slot-mapping.test.ts`, `packages/grammar/src/component-vocab.test.ts`, `src/recipe-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/grammar/src/slot-mapping.test.ts`, add (the file uses `heuristicSlotMapping`):

```ts
describe("non-trailing state parsing", () => {
  it("routes a leading-state token to state:utility (dropdown item hover)", () => {
    const m = heuristicSlotMapping("dropdown-item-hover-bg", undefined, undefined);
    expect(m?.slot).toBe("item");
    expect(m?.utilityType).toBe("bg-color");
    expect(m?.statePrefix).toBe("hover");
  });

  it("routes table-row-hover-bg to the tr slot with hover", () => {
    const m = heuristicSlotMapping("table-row-hover-bg", undefined, undefined);
    expect(m?.slot).toBe("tr");
    expect(m?.statePrefix).toBe("hover");
  });

  it("leaves trailing-state tokens unchanged (button-solid-bg-active)", () => {
    const m = heuristicSlotMapping("button-solid-bg-active", undefined, "color");
    expect(m?.utilityType).toBe("bg-color");
    expect(m?.statePrefix).toBe("active");
  });

  it("drops badge-disabled-bg (badge is stateless; leading disabled recognized)", () => {
    expect(heuristicSlotMapping("badge-disabled-bg", undefined, "color")).toBeNull();
  });

  it("still maps badge non-state tokens (badge-bg → base)", () => {
    expect(heuristicSlotMapping("badge-bg", undefined, "color")?.slot).toBe("base");
  });
});
```

In `packages/grammar/src/component-vocab.test.ts`, add (in/after the existing `STATELESS_COMPONENTS` describe):

```ts
it("marks badge as stateless (UBadge has no interaction states)", () => {
  expect(STATELESS_COMPONENTS.has("badge")).toBe(true);
});
it("keeps badge in NUXT_SLOTS (its non-state tokens still map)", () => {
  expect(nuxtSlotsFor("badge")?.has("base")).toBe(true);
});
```

(Ensure `STATELESS_COMPONENTS` and `nuxtSlotsFor` are imported in the test file.)

In `src/recipe-engine.test.ts`, add (uses `buildGraph`, `buildComponentRecipes`, `makeNode`/`makeGraph`):

```ts
it("routes a dropdown leading-state token (hover) onto the item slot", () => {
  const graph = makeGraph([
    makeNode({ id: "dropdown-item-hover-bg", layer: "component", type: "color", source: "global", base: "#eee" }),
  ]);
  const recipes = buildComponentRecipes(graph, { components: ["dropdown"] });
  expect(JSON.stringify(recipes.dropdown ?? {})).toContain("hover:");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts packages/grammar/src/component-vocab.test.ts src/recipe-engine.test.ts -t "non-trailing\|stateless\|leading-state\|dropdown leading"`
Expected: FAIL — `dropdown-item-hover-bg`/`table-row-hover-bg` return `null` (verified current behavior); `STATELESS_COMPONENTS.has("badge")` is false; `badge-disabled-bg` is non-null (would emit `disabled:` once the parse change lands without the stateless entry, or is null today — either way the combined assertions fail before both changes). The "trailing unchanged" + "badge-bg maps" guards pass already.

- [ ] **Step 3: Add the non-trailing state scan** (`packages/grammar/src/slot-mapping.ts`)

In `parseSegments`, the trailing size/state block (lines ~169-178) is followed by the `return`. Replace the `return { … }` (lines ~180-188) with a non-trailing scan + the `utilityParts`-based return:

```ts
  // Non-trailing state: a STATE_KEYS segment (excluding `default`, which doubles as a
  // color-role) elsewhere in the utility range, e.g. `hover-bg` / `disabled-bg`. Runs only
  // when no trailing state was found; the matched segment is removed from the utility.
  let utilityParts = parts.slice(start, end);
  if (state === null && utilityParts.length > 1) {
    const i = utilityParts.findIndex((s) => s !== "default" && STATE_KEYS.has(s));
    if (i !== -1) {
      state = utilityParts[i]!;
      utilityParts = [...utilityParts.slice(0, i), ...utilityParts.slice(i + 1)];
    }
  }

  return {
    component,
    utility: utilityParts.join("-"),
    variant,
    colorRole,
    size,
    state,
    slotPrefix,
  };
```

(`STATE_KEYS` is already imported in this file.)

- [ ] **Step 4: Add `badge` to `STATELESS_COMPONENTS`** (`packages/grammar/src/component-vocab.ts`)

Change `STATELESS_COMPONENTS` from `new Set(["kbd"])` to:

```ts
export const STATELESS_COMPONENTS: ReadonlySet<string> = new Set(["kbd", "badge"]);
```

(UBadge's Nuxt theme has variants `fieldGroup/color/variant/size/square` — no `disabled`, no `:disabled` — so its state tokens are unexpressible. badge stays in `NUXT_SLOTS`, so its non-state tokens still map; only state tokens drop.)

- [ ] **Step 5: Run to verify green**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts packages/grammar/src/component-vocab.test.ts src/recipe-engine.test.ts`
Expected: PASS — new tests green; existing grammar/recipe tests stay green (trailing-state runs first, so existing tokens are unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/component-vocab.ts packages/grammar/src/slot-mapping.test.ts packages/grammar/src/component-vocab.test.ts src/recipe-engine.test.ts
git commit -m "feat(grammar): parse non-trailing state (<state>-<utility>); badge stateless"
```

NOTE: pre-commit hook runs full typecheck + whole suite; expected to pass.

---

### Task 2: Scanner detector parity (non-trailing state)

**Files:**
- Modify: `src/scanner.ts`
- Test: `src/scanner.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/scanner.test.ts`, add (`scanGraph`, `makeGraph`, `makeNode` in scope):

```ts
describe("scanGraph — non-trailing unsupported state", () => {
  it("flags badge-disabled-bg (leading disabled on stateless badge)", () => {
    const graph = makeGraph([
      makeNode({ id: "badge-disabled-bg", layer: "component", type: "color", source: "global", base: "#f4f4f5" }),
    ]);
    const report = scanGraph(graph, { components: ["badge"] });
    const w = report.issues.find((i) => i.kind === "unsupported-state");
    expect(w).toBeDefined();
    expect(w?.componentName).toBe("badge");
  });

  it("does not flag dropdown-item-hover-bg as unsupported (dropdown is not stateless)", () => {
    const graph = makeGraph([
      makeNode({ id: "dropdown-item-hover-bg", layer: "component", type: "color", source: "global", base: "#eee" }),
    ]);
    const report = scanGraph(graph, { components: ["dropdown"] });
    expect(report.issues.find((i) => i.kind === "unsupported-state")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/scanner.test.ts -t "non-trailing unsupported"`
Expected: FAIL — `unsupportedStateForId("badge-disabled-bg")` checks the trailing segment (`bg`), so no `unsupported-state` warning fires.

- [ ] **Step 3: Implement non-trailing parity** (`src/scanner.ts`)

Replace `propDrivenStateForId` and `unsupportedStateForId` with versions that scan all non-component segments:

```ts
function propDrivenStateForId(id: string): { state: string; prop: string } | null {
  const segs = id.split("-");
  if (segs.length < 2) return null;
  const component = segs[0]!;
  for (const seg of segs.slice(1)) {
    const prop = propDrivenStateFor(component, seg);
    if (prop !== null) return { state: seg, prop };
  }
  return null;
}

/** {state} when any non-component segment is an interaction state on a stateless component, else null. */
function unsupportedStateForId(id: string): { state: string } | null {
  const segs = id.split("-");
  if (segs.length < 2) return null;
  const component = segs[0]!;
  if (!STATELESS_COMPONENTS.has(component)) return null;
  const state = segs.slice(1).find((s) => s !== "default" && STATE_KEYS.has(s));
  return state === undefined ? null : { state };
}
```

(`propDrivenStateFor` returns non-null only for curated `(component, state)` pairs — only `active` on input/textarea/nav — so scanning all segments is safe. `STATE_KEYS`, `STATELESS_COMPONENTS` are already imported in scanner.ts.)

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS — new tests green; existing `state-via-prop` / `unsupported-state` (kbd) tests stay green (trailing tokens are still found by the all-segment scan).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — full suite green (~924 tests; was 916).

- [ ] **Step 6: Commit**

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): detect non-trailing state in unsupported/prop-driven detectors"
```

---

### Task 3: Browser verification

jsdom can't compute styles; confirm the real verdict via `/browse` (per CLAUDE.md — never `mcp__claude-in-chrome__*`). Verification only.

**Files:** none.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` — note the localhost URL.

- [ ] **Step 2: Load the live export**

Using `/browse`: open the inspector, set the file input to `/Users/christian/Dev/token-inspector/assets/tokens-20260619-093216.zip`.

- [ ] **Step 3: Verify dropdown/table hover routed**

Select **dropdown** (and **table**); in the output (app.config.ts `ui.dropdown` / the recipe) confirm the item/row slot now carries a `hover:bg-[…]` class (previously the `*-item-hover-bg` token was dropped). The Real tab is optional here (hover is CDP-unforceable), so confirm via the emitted recipe/output text.

- [ ] **Step 4: Verify badge flagged**

Open the **Scan** view (issues); confirm an `unsupported-state` warning for `badge-disabled-bg` ("badge is a stateless component …"). Confirm the badge recipe carries no `disabled:` class.

- [ ] **Step 5: Confirm guards**

Dark-leak guard: 0 `prefers-color-scheme: dark` rules; no new console errors (the vue-router nav warning is pre-existing).

- [ ] **Step 6: Record the result**

Capture the dropdown/table hover-class appearance + the badge warning for the release notes. Loop back on a defect.

---

## Self-Review

**1. Spec coverage:**
- Non-trailing state scan in `parseSegments` (spec §1) → Task 1 Step 3. ✓
- `badge` → `STATELESS_COMPONENTS` (spec §2) → Task 1 Step 4. ✓
- Scanner detector parity (spec §3) → Task 2. ✓
- Disambiguation (STATE_KEYS minus `default`, length>1 guard, trailing-first) (spec) → Task 1 Step 3 code + the "trailing unchanged"/"default"/"state-only" coverage. ✓
- Routing (dropdown/table hover) + flagging (badge) (spec data-flow) → Task 1 (route) + Task 2 (flag). ✓
- Browser verify (spec Testing) → Task 3. ✓
- Out-of-scope (per-component hover encoding, card/progress, muted) — not touched. ✓

**2. Placeholder scan:** No TBD/TODO. Every code step shows full code with exact anchors; run steps show commands + empirically-grounded red/green (`dropdown-item-hover-bg`/`table-row-hover-bg`/`badge-disabled-bg` → null today; `table-row` → `tr` via alias).

**3. Type consistency:** `parseSegments` return shape unchanged (component/utility/variant/colorRole/size/state/slotPrefix) — only `utility` is computed from `utilityParts`. `STATE_KEYS` (grammar) used in both the parse and the scanner detector. `STATELESS_COMPONENTS` extended (`kbd`+`badge`), used by the existing stateless guard (grammar) + `unsupportedStateForId` (scanner). `heuristicSlotMapping(id, type?, slots?)` and `buildComponentRecipes(graph, {components})` used as they exist. Scanner issue shape (`kind:"unsupported-state"`, `componentName`) matches v0.43.0.

No issues found.
