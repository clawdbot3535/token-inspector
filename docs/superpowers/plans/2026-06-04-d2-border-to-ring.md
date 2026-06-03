# D2 — `border` → `ring` for ring-framed components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For components whose Nuxt UI v4 frame is a Tailwind `ring` (input, textarea, checkbox, radio, kbd, dropdown, modal), emit the Figma `border` family as `ring` utilities instead of CSS `border`, so the recipe matches Nuxt's ring model.

**Architecture:** A `RING_FRAMED_COMPONENTS` set in `component-vocab.ts` (single source of truth). `heuristicSlotMapping` intercepts a bare `border` utility before the rule loop — mirroring the existing `text` disambiguation intercept — and routes it to `ring-color` when the token's component is in the set; everything else falls through to the existing `border-color` rule. No call-site signature changes (the component is derived from the token id). Because the grammar change alters `input`'s emitted frame, the cycle-A input characterisation assertions, the golden snapshot, and the LiveInput preview test are updated in the same commit (they assert the old border output).

**Tech Stack:** TypeScript, Vitest, Vue 3.

**Spec:** `docs/superpowers/specs/2026-06-04-d2-border-to-ring-design.md`

**Branch:** `fix/border-to-ring`. Commit per task. Do not push.

---

## File Structure

- `src/component-vocab.ts` — **modify**: add `RING_FRAMED_COMPONENTS`.
- `src/slot-mapping.ts` — **modify**: import the set; add the `border`→`ring-color` intercept in `heuristicSlotMapping`.
- `src/slot-mapping.test.ts` — **modify**: grammar unit tests for the remap + the non-remapped guards.
- `src/recipe-engine.test.ts` — **modify**: update the cycle-A input characterisation assertions (border→ring); add a D2 end-to-end test.
- `src/__snapshots__/recipe-engine.test.ts.snap` — **regenerated**: the pinned `ui.input` block changes border→ring.
- `src/app/components/LiveInput.test.ts` — **modify**: the JIT-regression test asserts `boxShadow` (ring) instead of `borderColor`.
- `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md` — **modify** (Task 2): mark D2 fixed.
- `CHANGELOG.md` — **modify** (Task 2).

Verified current grammar outputs (baseline): `input-border` → border-color; `input-border-hover`/`-focus`/`-disabled` → border-color + statePrefix; `checkbox-border-checked` → border-color + checked; `radio-border-hovered` → border-color + hover; `table-border` → border-color; `button-solid-border` → border-color (variant solid); `kbd/dropdown/modal-border` → border-color; `input-border-error`/`-success` → **null** (dropped at parse, before any intercept); `input-ring-focus` → ring-color + focus (already).

---

## Task 1: Grammar remap + all affected test/snapshot updates (one commit)

The grammar change and the test/snapshot updates ship together: the pre-commit hook runs the full suite, so an intermediate commit with the grammar change but stale border-assertions would be blocked.

**Files:** `src/component-vocab.ts`, `src/slot-mapping.ts`, `src/slot-mapping.test.ts`, `src/recipe-engine.test.ts`, `src/__snapshots__/recipe-engine.test.ts.snap`, `src/app/components/LiveInput.test.ts`

- [ ] **Step 1: Write the failing grammar unit tests**

Append to `src/slot-mapping.test.ts`:

```typescript
describe("heuristicSlotMapping — border→ring for ring-framed components", () => {
  it("maps input-border to ring-color", () => {
    expect(heuristicSlotMapping("input-border")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
    });
  });

  it("maps input-border-hover to ring-color with a hover prefix", () => {
    expect(heuristicSlotMapping("input-border-hover")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
      statePrefix: "hover",
    });
  });

  it("maps checkbox-border-checked to ring-color with a checked prefix", () => {
    expect(heuristicSlotMapping("checkbox-border-checked")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
      statePrefix: "checked",
    });
  });

  it("keeps table-border as border-color (genuine CSS border, not remapped)", () => {
    expect(heuristicSlotMapping("table-border")).toEqual({
      slot: "base", utilityType: "border-color", variantAxis: null, variantKey: null,
    });
  });

  it("keeps button-solid-border as border-color (deferred to D2b)", () => {
    expect(heuristicSlotMapping("button-solid-border")).toEqual({
      slot: "base", utilityType: "border-color", variantAxis: "variant", variantKey: "solid",
    });
  });

  it("does NOT resurrect input-border-error (stays dropped/null)", () => {
    expect(heuristicSlotMapping("input-border-error")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: FAIL — `input-border`/`input-border-hover`/`checkbox-border-checked` currently return `border-color`, not `ring-color`. (The `table-border`, `button-solid-border`, and `input-border-error` cases already pass — they assert unchanged behavior.)

- [ ] **Step 3: Add `RING_FRAMED_COMPONENTS` to `src/component-vocab.ts`**

Append:

```typescript
/**
 * Components whose Nuxt UI v4 frame is a Tailwind `ring` (not a CSS border):
 * their `border-*` tokens emit `ring-*` utilities. Limited to clean base-ring
 * frames. Variant-conditional/special framers (button, badge, card, chip,
 * switch) and genuine border framers (table, nav) are intentionally excluded.
 */
export const RING_FRAMED_COMPONENTS: ReadonlySet<string> = new Set([
  "input", "textarea", "checkbox", "radio", "kbd", "dropdown", "modal",
]);
```

- [ ] **Step 4: Add the intercept in `src/slot-mapping.ts`**

Add `RING_FRAMED_COMPONENTS` to the existing `./component-vocab.js` import. Then in `heuristicSlotMapping`, immediately AFTER the existing `text` disambiguation intercept and BEFORE the `for (const rule of HEURISTIC_RULES)` loop, add:

```typescript
  // Ring-framed components (input, checkbox, …) draw their frame as a Tailwind
  // `ring`, not a CSS border, so a bare `border` utility emits ring-color.
  // Genuine border framers (table, nav) and variant-conditional framers
  // (button, badge, …) fall through to the border-color rule below.
  const component = tokenId.split("-")[0] ?? "";
  if (parsed.utility === "border" && RING_FRAMED_COMPONENTS.has(component)) {
    return buildEntry(slot, "ring-color", ctx);
  }
```

(`slot` and `ctx` are already in scope from the lines above the `text` intercept; `buildEntry` carries `ctx.state` through to `statePrefix`, so `input-border-hover` yields ring-color + `hover` exactly like the border-color path did.)

- [ ] **Step 5: Run grammar tests to verify they pass**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: PASS (new tests + all existing, including the D1 text-color tests and the variant-axis text test).

- [ ] **Step 6: Update the cycle-A input characterisation assertions (border→ring)**

In `src/recipe-engine.test.ts`, in the `it("promotes interaction-state tokens to pseudo-class prefixes on base", …)` test (~line 690), change the two border assertions to ring:

```typescript
    expect(base).toContain("focus:ring-[#3B82F6]");
    expect(base).toContain("hover:ring-[#A1A1AA]");
    expect(base).toContain("disabled:bg-[#F4F4F5]");
    expect(base).toContain("focus:rounded-lg");
```

(Only the two `border`→`ring` lines change; the `disabled:bg` and `focus:rounded` lines stay. The two `SEED for cycle B` tests below are unaffected — they assert the `solid` bg variant and the dropped error/success, neither of which D2 touches.)

- [ ] **Step 7: Add the D2 end-to-end test in `src/recipe-engine.test.ts`**

Append:

```typescript
describe("buildComponentRecipes — ring-framed border emits ring (D2)", () => {
  // input-border aliasing a semantic border color; the frame must emit a ring,
  // not a CSS border, matching Nuxt UI's ring-based input.
  function aliasedBorderGraph() {
    const light = {
      color: { border: { default: { $value: "#D4D4D8", $type: "color" } } },
    };
    const global = {
      input: {
        border: {
          $value: "#D4D4D8",
          $type: "color",
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "color/border/default" },
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

  it("emits ring-[var(--color-border-default)] for input-border, not a CSS border", () => {
    const recipes = buildComponentRecipes(aliasedBorderGraph(), { components: ["input"] });
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).toContain("ring-[var(--color-border-default)]");
    expect(base).not.toContain("border-[");
  });
});
```

- [ ] **Step 8: Update the LiveInput JIT-regression test (`borderColor` → `boxShadow`)**

In `src/app/components/LiveInput.test.ts`, the test `it("renders one input per state with inline border/height (JIT-class regression)", …)` asserts distinct inline `borderColor`. After D2 the input frame is a ring, which `extractArbitrary` maps to `boxShadow` (`0 0 0 2px <color>`), not `borderColor`. Replace the borderColor assertion block:

```typescript
    // height-[36px] resolves to an inline style on every cell, not the JIT.
    expect(inputs.every((i) => i.element.style.height === "36px")).toBe(true);

    // Each state promotes its own ring color → distinct inline boxShadow
    // (the input frame is a ring, not a CSS border, matching Nuxt UI).
    const boxShadows = new Set(inputs.map((i) => i.element.style.boxShadow));
    expect(boxShadows.size).toBeGreaterThanOrEqual(3);

    // No icon-size token here → no icons → padding stays the recipe value.
    expect(inputs.every((i) => i.element.style.paddingLeft === "0.375rem")).toBe(true);
```

Also update the test title to read `inline ring/height` instead of `inline border/height`. The other LiveInput tests (fallback, disabled cue, leading/trailing icon padding) are unaffected.

- [ ] **Step 9: Regenerate the golden snapshot and verify the diff**

Run: `npx vitest run -u src/recipe-engine.test.ts`
Then: `git diff src/__snapshots__/recipe-engine.test.ts.snap`
Expected: the ONLY change in the `input` block is `border-[…]` → `ring-[…]` (base resting ring, `hover:`, `focus:`, `disabled:` variants). Confirm there is no unrelated change (no size/variant/bg churn). If anything else changed, stop and investigate before continuing.

- [ ] **Step 10: Full verification**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass. (Ignore IDE `@core` import staleness — only `npm run typecheck` exit code is authoritative.)

- [ ] **Step 11: Commit**

```bash
git add src/component-vocab.ts src/slot-mapping.ts src/slot-mapping.test.ts src/recipe-engine.test.ts src/__snapshots__/recipe-engine.test.ts.snap src/app/components/LiveInput.test.ts
git commit -m "fix(grammar): emit ring instead of border for ring-framed components"
```

A pre-commit hook runs typecheck + the full suite; if it blocks, fix legitimately.

---

## Task 2: Verify against real export + docs

**Files:** `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`, `CHANGELOG.md`

- [ ] **Step 1: Verify the real export emits ring for ring-framed, border for the rest**

Run: `npx tsx scripts/build-cli.ts`
Then inspect `output/nuxt/app.config.ts` (gitignored):

```bash
node -e 'const fs=require("fs");const s=fs.readFileSync("output/nuxt/app.config.ts","utf8");for(const c of ["input","checkbox","radio","kbd","dropdown","modal","table","nav"]){const i=s.indexOf(c+":");if(i<0){console.log(c,"(absent)");continue;}let d=0,st=false,o="";for(let j=i;j<s.length;j++){const ch=s[j];o+=ch;if(ch==="{"){d++;st=true}else if(ch==="}"){d--;if(st&&d===0)break}}const ring=(o.match(/ring-\[/g)||[]).length;const bord=(o.match(/border-\[/g)||[]).length;console.log(c.padEnd(10),"ring-[ x"+ring,"border-[ x"+bord);}'
```

Expected: `input`, `checkbox`, `radio`, `kbd`, `dropdown`, `modal` show `ring-[` occurrences and ZERO `border-[` (for frame tokens); `table` and `nav` still show `border-[` (no remap). Paste the output in your report. `output/` is gitignored — do not stage it. If a ring-framed component still shows `border-[` for a frame token, stop and report DONE_WITH_CONCERNS.

- [ ] **Step 2: Mark D2 fixed in the seeds doc**

In `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`, find the `## D2 — \`border\` vs \`ring\`` section and append a FIXED note at the end of that section (before `## D3`):

```markdown

**FIXED 2026-06-04 (partial):** ring-framed components with a clean base ring —
`input`, `textarea`, `checkbox`, `radio`, `kbd`, `dropdown`, `modal` — now emit
`ring-*` for their `border-*` tokens via `RING_FRAMED_COMPONENTS` in the grammar.
Variant-conditional/special framers (`button`, `badge`, `card`, `chip`, `switch`)
remain deferred to **D2b**; `table`/`nav` keep genuine CSS borders. See
`docs/superpowers/specs/2026-06-04-d2-border-to-ring-design.md`.
```

- [ ] **Step 3: CHANGELOG**

In `CHANGELOG.md` under `## [Unreleased]` → `### Fixed`, add:

```markdown
- **Ring-framed components emit `ring-*` for their `border-*` tokens.** Nuxt UI v4
  form fields and several other components draw their frame as a Tailwind ring
  (with `border-0`), not a CSS border. `input`, `textarea`, `checkbox`, `radio`,
  `kbd`, `dropdown`, and `modal` border tokens now emit `ring-[…]` (resting, hover,
  focus, …) instead of `border-[…]`, removing the double frame on focus. Variant-
  conditional framers (button, badge, card, chip, switch) are deferred; `table`/`nav`
  keep genuine borders.
```

Then in the `### Known deviations` list, REMOVE the now-fixed bullet:

```markdown
- `input-border-*` emits a CSS `border`, but a Nuxt UI input frame is a `ring`.
```

(Leave the error/success and solid deviation bullets.)

- [ ] **Step 4: Final verification**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 5: Commit (do NOT push)**

```bash
git add docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md CHANGELOG.md
git commit -m "docs: mark D2 fixed (ring-framed border→ring), changelog"
```

Stop and report. Do not push.

---

## Self-Review

**Spec coverage:**
- "RING_FRAMED_COMPONENTS set" → Task 1 Step 3. ✓
- "border rule emits ring-color for ring-framed components, via inline intercept" → Task 1 Step 4 (the spec's lower-risk option). ✓
- "scope set {input, textarea, checkbox, radio, kbd, dropdown, modal}" → the set literal. ✓
- "table/nav keep border; button/badge/etc deferred" → grammar unit tests (table-border, button-solid-border stay border-color) + the set excludes them. ✓
- "border-checked/border-hovered remap uniformly" → checkbox-border-checked test. ✓
- "input-border-error stays dropped" → the null guard test. ✓
- "ripple: cycle-A assertions, snapshot, LiveInput test" → Task 1 Steps 6, 9, 8. ✓
- "end-to-end ring var proof" → Task 1 Step 7. ✓
- "real export verification (ring for framed, border for table/nav)" → Task 2 Step 1. ✓
- "seeds D2 mark + CHANGELOG" → Task 2 Steps 2-3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. Step 9 is a regeneration with an explicit diff-shape check, not a placeholder.

**Type consistency:** `RING_FRAMED_COMPONENTS: ReadonlySet<string>` matches the existing vocab-set style in `component-vocab.ts`. The intercept returns a `SlotMappingEntry` via `buildEntry(slot, "ring-color", ctx)` — `"ring-color"` is an existing `UtilityType` already used by the `ring` rule. `component` is `string` (`tokenId.split("-")[0] ?? ""`). No signature changes, so all four `getSlotMapping` call sites are unaffected.
