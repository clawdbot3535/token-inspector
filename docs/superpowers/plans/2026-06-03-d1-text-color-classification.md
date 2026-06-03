# D1 — Classify bare `text` by value type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify a bare `text` utility as `text-color` when the token's value type is `color`, so aliased component color tokens (e.g. `input-text`) emit themeable `var(--…)` again instead of a hardcoded `text-[#hex]`.

**Architecture:** Thread the token's value type into the slot-mapping grammar (the single source of truth), additively extending the `text`/`text-size` disambiguation. All four `getSlotMapping` call sites (recipe-engine ×2, scanner, App.vue highlight resolver) pass `node.type`, so recipe output, scan, and inspector highlight stay consistent. No change to the alias machinery or `resolveColorReference` — they already work; the fix only routes color `text` tokens into the color path.

**Tech Stack:** TypeScript, Vitest, Vue 3.

**Spec:** `docs/superpowers/specs/2026-06-03-d1-text-color-classification-design.md`

**Branch:** `fix/lost-semantic-alias`. Commit per task. Do not push until the user decides.

---

## File Structure

- `src/slot-mapping.ts` — **modify**: add optional `valueType` param to `heuristicSlotMapping` and `getSlotMapping`; extend the `text` disambiguation. (Single source of truth for classification.)
- `src/slot-mapping.test.ts` — **modify**: classification unit tests for value-type routing.
- `src/recipe-engine.ts` — **modify**: pass `node.type` at the two `getSlotMapping` calls (lines ~167, ~185).
- `src/recipe-engine.test.ts` — **modify**: end-to-end test proving an aliased color `text` token emits `text-[var(--…)]`.
- `src/scanner.ts` — **modify**: pass `node.type` at the `getSlotMapping` call (line ~65).
- `src/app/App.vue` — **modify**: pass `node.type` in the highlight resolver (line ~146).
- `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md` — **modify**: correct the D1 root-cause section.
- `CHANGELOG.md` — **modify**: add the fix to `[Unreleased]`; correct the now-fixed deviation line.

`node.type` is `TokenNode.type` (a `TokenType` string union including `"color"`, `"number"`, …), confirmed by runtime trace. `SlotMappingEntry` shape: `{ slot, utilityType, variantAxis, variantKey, statePrefix? }`.

---

## Task 1: Value-type disambiguation in the grammar

**Files:**
- Modify: `src/slot-mapping.ts`
- Test: `src/slot-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/slot-mapping.test.ts`:

```typescript
describe("heuristicSlotMapping — text disambiguation by value type", () => {
  it("maps a color-typed bare text token to text-color (no variant axis)", () => {
    expect(heuristicSlotMapping("input-text", "color")).toEqual({
      slot: "base",
      utilityType: "text-color",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps a number-typed bare text token to text-size", () => {
    expect(heuristicSlotMapping("input-font-size", "number")).toEqual({
      slot: "base",
      utilityType: "text-size",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("treats a bare 'text' token as text-size when value type is not color", () => {
    expect(heuristicSlotMapping("input-text", "number")).toEqual({
      slot: "base",
      utilityType: "text-size",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("keeps the variant-axis text-color path working without a value type", () => {
    expect(heuristicSlotMapping("button-solid-text-default")).toEqual({
      slot: "base",
      utilityType: "text-color",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("forwards value type through getSlotMapping", () => {
    expect(getSlotMapping("input-text", undefined, "color")?.utilityType).toBe("text-color");
    expect(getSlotMapping("input-text", undefined, "number")?.utilityType).toBe("text-size");
  });
});
```

(If the existing `button-solid-text-default` assertion differs in shape from the one above — e.g. includes a `statePrefix` — match the existing test at `src/slot-mapping.test.ts` line ~71 instead; the point is only that the variant path is unchanged.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: FAIL — `heuristicSlotMapping`/`getSlotMapping` do not yet accept a value-type argument (TypeScript arity error and/or `input-text` still resolves to `text-size`).

- [ ] **Step 3: Add the `valueType` parameter and extend the condition**

In `src/slot-mapping.ts`, change the `heuristicSlotMapping` signature:

```typescript
export function heuristicSlotMapping(
  tokenId: string,
  valueType?: string,
): SlotMappingEntry | null {
```

Replace the existing `text` disambiguation block:

```typescript
  if ((parsed.variant !== null || parsed.colorRole !== null) && parsed.utility === "text") {
    return buildEntry(slot, "text-color", ctx);
  }
```

with the additive value-type-aware version:

```typescript
  // `text` defaults to text-size, but it means text-color when the token is a
  // color — signalled either by a variant/color-role axis (button/badge) or,
  // axis-independently, by the token's value type (input/textarea text colors).
  if (
    parsed.utility === "text" &&
    (valueType === "color" || parsed.variant !== null || parsed.colorRole !== null)
  ) {
    return buildEntry(slot, "text-color", ctx);
  }
```

Then change `getSlotMapping` to accept and forward `valueType`:

```typescript
export function getSlotMapping(
  tokenId: string,
  override?: SlotMappingOverride,
  valueType?: string,
): SlotMappingEntry | null {
  if (override && Object.prototype.hasOwnProperty.call(override, tokenId)) {
    return override[tokenId] ?? null;
  }
  return heuristicSlotMapping(tokenId, valueType);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: PASS (new tests + all existing slot-mapping tests, including the line ~128 "treats text as text-color when a variant axis is present" test).

- [ ] **Step 5: Commit**

```bash
git add src/slot-mapping.ts src/slot-mapping.test.ts
git commit -m "fix(grammar): classify bare text as text-color by value type"
```

---

## Task 2: Thread `node.type` through all four call sites

After Task 1 the grammar can do the right thing, but only if callers pass the value type. This task wires it and proves the end-to-end `var()` emission.

**Files:**
- Modify: `src/recipe-engine.ts` (two calls), `src/scanner.ts` (one call), `src/app/App.vue` (one call)
- Test: `src/recipe-engine.test.ts`

- [ ] **Step 1: Write the failing end-to-end test**

Append to `src/recipe-engine.test.ts` (reuse the existing `buildGraph` / `SourceFile` imports added in the cycle-A input characterisation block):

```typescript
describe("buildComponentRecipes — color text tokens emit var() (D1)", () => {
  // A semantic color target + a component `text` token aliasing it via the
  // Figma alias extension, with NO variant axis — the input shape that used to
  // leak a hardcoded hex.
  function aliasedTextGraph() {
    const light = {
      color: { text: { primary: { $value: "#18181B", $type: "color" } } },
    };
    const global = {
      input: {
        text: {
          $value: "#18181B",
          $type: "color",
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "color/text/primary" },
          },
        },
      },
    };
    const sources: SourceFile[] = [
      { name: "light", data: light },
      { name: "global", data: global },
    ];
    return buildGraph(sources);
  }

  it("emits text-[var(--color-text-primary)] for an aliased color text token", () => {
    const recipes = buildComponentRecipes(aliasedTextGraph(), { components: ["input"] });
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).toContain("text-[var(--color-text-primary)]");
    expect(base).not.toContain("text-[#18181B]");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/recipe-engine.test.ts`
Expected: FAIL — `buildComponentRecipes` still calls `getSlotMapping` without a value type, so `input-text` classifies as `text-size` and emits `text-[#18181B]` (no `var()`).

- [ ] **Step 3: Pass `node.type` in `recipe-engine.ts` (both calls)**

There are two `getSlotMapping(node.id, options.slotMappingOverride)` calls inside `buildComponentRecipes` (the size-presence pre-scan ~line 167 and the main emit loop ~line 185), both with `node` in scope. Change BOTH to:

```typescript
    const mapping = getSlotMapping(node.id, options.slotMappingOverride, node.type);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/recipe-engine.test.ts`
Expected: PASS (new D1 test + existing recipe-engine tests, including the cycle-A input characterisation — see Task 3 for the snapshot check).

- [ ] **Step 5: Pass `node.type` in `scanner.ts`**

In `src/scanner.ts` (~line 65), with `node` in scope, change:

```typescript
    const mapping = getSlotMapping(node.id);
```

to:

```typescript
    const mapping = getSlotMapping(node.id, undefined, node.type);
```

(Behaviorally inert for the scanner's size-axis checks — `text-color` is not a size axis either way — but keeps classification consistent with the grammar.)

- [ ] **Step 6: Pass `node.type` in the App.vue highlight resolver**

In `src/app/App.vue` (~line 146), the `selectedVueTemplateClasses` computed already has `node` from `graph.nodes.get(id)`. Change:

```typescript
  const mapping = getSlotMapping(id);
```

to:

```typescript
  const mapping = getSlotMapping(id, undefined, node.type);
```

This keeps the inspector's highlighted class in sync with the recipe (both now resolve color `text` tokens to `var()` via `utilityForMapping`).

- [ ] **Step 7: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/recipe-engine.ts src/recipe-engine.test.ts src/scanner.ts src/app/App.vue
git commit -m "fix(pipeline): pass token value type into slot mapping at all call sites"
```

---

## Task 3: Verify against the real export, fix docs

**Files:**
- Modify: `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`, `CHANGELOG.md`
- Possibly regenerated: `src/__snapshots__/recipe-engine.test.ts.snap`

- [ ] **Step 1: Confirm the cycle-A characterisation snapshot is stable**

Run: `npx vitest run src/recipe-engine.test.ts`
Expected: PASS with no snapshot update. The cycle-A `input` fixture uses literal hex with NO alias, so `input-text` resolves to a literal either way (`text-size` arbitrary vs `text-color` literal both produce `text-[#18181B]`). If vitest reports an obsolete/updated snapshot, inspect `git diff src/__snapshots__/recipe-engine.test.ts.snap`; only accept it if the change is the expected identical-string no-op, then `npx vitest run -u` and note it.

- [ ] **Step 2: Verify the real export now emits `var()`**

Run: `npx tsx scripts/build-cli.ts`
Then inspect the `input:` block in `output/nuxt/app.config.ts` (gitignored):

```bash
node -e 'const fs=require("fs");const s=fs.readFileSync("output/nuxt/app.config.ts","utf8");const i=s.indexOf("input:");let d=0,st=false,o="";for(let j=i;j<s.length;j++){const c=s[j];o+=c;if(c==="{"){d++;st=true}else if(c==="}"){d--;if(st&&d===0)break}}console.log(o)'
```

Expected: the base string now contains `text-[var(--color-text-primary)]` and
`disabled:text-[var(--color-state-disabled-text)]`, and NO `text-[#18181B]` /
`text-[#A1A1AA]`. Also confirm `button` still emits `text-[var(--…)]` (no regression).

- [ ] **Step 3: Correct the D1 section of the seeds doc**

In `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`, replace the
D1 "Lost semantic alias" root-cause text (which hypothesised that
`com.figma.aliasData` is not followed) with the corrected cause and a fixed marker:

```markdown
## D1 — Bare `text` color token misclassified as `text-size` (FIXED 2026-06-03)

**Root cause (corrected):** the alias machinery is healthy — `input-text` resolves to
`color-text-primary` and the color resolver returns a `var()` reference. The bug was in
`heuristicSlotMapping`: a bare `text` utility only routed to `text-color` when a
variant/color-role axis was present, so axis-less color tokens (`input-text`,
`textarea/text`) fell through to `text-size`, bypassing the color path and leaking a
hardcoded `text-[#hex]`.

**Fix:** classify bare `text` as `text-color` when the token's value type is `color`,
threaded through all `getSlotMapping` call sites. See
`docs/superpowers/specs/2026-06-03-d1-text-color-classification-design.md`.

**Follow-up (not done):** a `hardcoded-color` detector for genuinely alias-less color
tokens. A scan of the current export found exactly one (`modal-overlay-bg`), so this is
deferred as low-value for now.
```

- [ ] **Step 4: Add the CHANGELOG entry and correct the deviation list**

In `CHANGELOG.md` under `## [Unreleased]` → `### Fixed`, add:

```markdown
- **Component `text` color tokens emit themeable `var(--…)` again.** A bare `text`
  utility was classified as `text-size` unless a variant/color-role axis was present, so
  axis-less color tokens (`input-text`, `input-text-disabled`, `textarea/text`) leaked a
  hardcoded `text-[#hex]` instead of a semantic `var()` reference. Bare `text` is now
  classified as `text-color` whenever the token's value type is `color`, threaded through
  the slot-mapping grammar's call sites.
```

Then in the `### Known deviations` list, REMOVE the now-incorrect/fixed bullet:

```markdown
- `input-text` / `input-text-disabled` emit a hardcoded hex (`text-[#…]`)
  instead of a `var(--…)` reference — the semantic alias (`com.figma.aliasData`)
  on these override-resolved tokens is not followed.
```

(The remaining deviations — `error`/`success`, `solid`, `border`→`ring` — stay.)

- [ ] **Step 5: Final verification**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md CHANGELOG.md src/__snapshots__/recipe-engine.test.ts.snap
git commit -m "docs: mark D1 fixed, correct seeds root cause, changelog"
```

(Only stage the snapshot file if Step 1 produced an accepted update; otherwise omit it.)

Stop here and report status. Do not push.

---

## Self-Review

**Spec coverage:**
- Spec "value-type-aware grammar" → Task 1. ✓
- Spec "thread node type at 4 call sites" → Task 2 (recipe-engine ×2, scanner, App.vue). ✓
- Spec success criterion "getSlotMapping(…, 'color') → text-color / 'number' → text-size" → Task 1 tests. ✓
- Spec success criterion "real export emits var()" → Task 3 Step 2. ✓
- Spec "end-to-end var proof test" → Task 2 test. ✓
- Spec "cycle-A snapshot unchanged (or deliberate)" → Task 3 Step 1. ✓
- Spec "correct seeds doc D1" → Task 3 Step 3. ✓
- Spec "fix only, no detector" → no detector task; deferral noted in Task 3 Step 3. ✓
- Spec "additive condition, button/badge unchanged" → Task 1 condition + the variant-path test. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows full code; commands have expected output. The one conditional ("if the existing assertion differs… match the existing test") names the exact file/line and the invariant to preserve — not a placeholder.

**Type consistency:** `valueType?: string` is consistent across `heuristicSlotMapping` and `getSlotMapping`; callers pass `node.type` (`TokenType`, assignable to `string`). `getSlotMapping(tokenId, override?, valueType?)` arg order is consistent at every call site (recipe-engine passes `options.slotMappingOverride` as override; scanner and App.vue pass `undefined` as override then `node.type`). `SlotMappingEntry.utilityType` values `"text-color"` / `"text-size"` match the existing grammar and tests.
