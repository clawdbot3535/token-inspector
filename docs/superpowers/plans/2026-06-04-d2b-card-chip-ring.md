# D2b — `card` + `chip` join the ring-framed set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `card` and `chip` to `RING_FRAMED_COMPONENTS` so their `border-*` tokens emit `ring-*` (matching Nuxt UI v4), reusing the D2 grammar mechanism unchanged.

**Architecture:** Two set members added in `component-vocab.ts`; the D2 grammar intercept already reads the set, so no other source changes. Purely additive — `card`/`chip` have no live preview and aren't in snapshot fixtures, so no existing test changes (unlike D2, which altered `input`).

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-d2b-card-chip-ring-design.md`

**Branch:** `fix/d2b-variant-frames`. Commit per task. Do not push.

---

## File Structure

- `src/component-vocab.ts` — **modify**: add `card`, `chip` to `RING_FRAMED_COMPONENTS`; extend the doc comment with exclusion rationale.
- `src/slot-mapping.test.ts` — **modify**: grammar unit tests for card/chip (ring) + switch (stays border) + chip-border-error (stays null).
- `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md` — **modify** (Task 2): extend the D2 FIXED note.
- `CHANGELOG.md` — **modify** (Task 2): extend the existing D2 "Ring-framed components emit…" Fixed line.

Verified current grammar baseline: `card-border` → border-color (base); `chip-border` → border-color (base); `chip-border-active` → border-color + `active`; `switch-border` → border-color (base); `chip-border-error` → `null`.

---

## Task 1: Extend the ring-framed set + grammar tests

**Files:** `src/component-vocab.ts`, `src/slot-mapping.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe("heuristicSlotMapping — border→ring for ring-framed components", …)` block in `src/slot-mapping.test.ts`:

```typescript
  it("maps card-border to ring-color (card frame is a ring)", () => {
    expect(heuristicSlotMapping("card-border")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
    });
  });

  it("maps chip-border to ring-color (chip halo is a ring)", () => {
    expect(heuristicSlotMapping("chip-border")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
    });
  });

  it("maps chip-border-active to ring-color with an active prefix", () => {
    expect(heuristicSlotMapping("chip-border-active")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
      statePrefix: "active",
    });
  });

  it("keeps switch-border as border-color (sizing border, excluded)", () => {
    expect(heuristicSlotMapping("switch-border")).toEqual({
      slot: "base", utilityType: "border-color", variantAxis: null, variantKey: null,
    });
  });

  it("leaves chip-border-error null (trailing color-role, unchanged)", () => {
    expect(heuristicSlotMapping("chip-border-error")).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: FAIL — `card-border` and `chip-border`/`chip-border-active` currently return `border-color`, not `ring-color`. (`switch-border` and `chip-border-error` cases already pass — they assert unchanged behavior.)

- [ ] **Step 3: Add `card` + `chip` to the set and extend the comment**

In `src/component-vocab.ts`, replace the current `RING_FRAMED_COMPONENTS` declaration (and its doc comment) with:

```typescript
/**
 * Components whose Nuxt UI v4 frame is a Tailwind `ring` (not a CSS border):
 * their `border-*` tokens emit `ring-*` utilities. Limited to frames expressed
 * on the base slot.
 *
 * Excluded on purpose:
 * - `button`, `badge`: ring is variant/color-conditional (only outline/subtle) —
 *   their border tokens live on the variant/color axis; needs a variant-aware
 *   remap (D2c), not this component-level one.
 * - `switch`: its `border-*` is a transparent `border-2` used only for sizing
 *   (the visible state is a background fill); it is not a frame.
 * - `table`, `nav`: genuine CSS borders (`divide-y`, `border-s`).
 */
export const RING_FRAMED_COMPONENTS: ReadonlySet<string> = new Set([
  "input", "textarea", "checkbox", "radio", "kbd", "dropdown", "modal",
  "card", "chip",
]);
```

(No change to `slot-mapping.ts` — the intercept already reads this set.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/slot-mapping.test.ts`
Expected: PASS (new tests + all existing).

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass with no other changes (no snapshot/LiveInput churn — `card`/`chip` aren't in those fixtures). If any unrelated test fails or a snapshot is flagged obsolete, stop and investigate.

- [ ] **Step 6: Commit**

```bash
git add src/component-vocab.ts src/slot-mapping.test.ts
git commit -m "fix(grammar): add card and chip to the ring-framed set"
```

A pre-commit hook runs typecheck + the full suite; if it blocks, fix legitimately.

---

## Task 2: Verify real export + docs

**Files:** `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`, `CHANGELOG.md`

- [ ] **Step 1: Verify the real export**

Run: `npx tsx scripts/build-cli.ts`
Then:

```bash
node -e 'const fs=require("fs");const s=fs.readFileSync("output/nuxt/app.config.ts","utf8");for(const c of ["card","chip","switch","table","nav"]){const i=s.indexOf(c+":");if(i<0){console.log(c.padEnd(8),"(absent)");continue;}let d=0,st=false,o="";for(let j=i;j<s.length;j++){const ch=s[j];o+=ch;if(ch==="{"){d++;st=true}else if(ch==="}"){d--;if(st&&d===0)break}}const ring=(o.match(/ring-\[/g)||[]).length;const bord=(o.match(/border-\[/g)||[]).length;console.log(c.padEnd(8),"ring-[ x"+ring,"border-[ x"+bord);}'
```

Expected: `card` and `chip` show `ring-[` occurrences and ZERO `border-[` for frame tokens; `switch`, `table`, `nav` still show `border-[` (or are absent). Paste the output. `output/` is gitignored — do not stage it. If `card`/`chip` still show `border-[` for a frame token, stop and report DONE_WITH_CONCERNS.

- [ ] **Step 2: Extend the seeds doc D2 FIXED note**

In `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`, find the `**FIXED 2026-06-04 (partial):**` note in the D2 section. Replace its component list and deferral sentence so it reads (adjust to match the exact surrounding wording, but the content is):

```markdown
**FIXED 2026-06-04 (partial):** ring-framed components with a base-slot ring —
`input`, `textarea`, `checkbox`, `radio`, `kbd`, `dropdown`, `modal`, `card`, `chip` —
now emit `ring-*` for their `border-*` tokens via `RING_FRAMED_COMPONENTS` in the
grammar. Still deferred to **D2c**: `button` and `badge` (ring is variant/color-
conditional). Not remapped: `switch` (transparent sizing `border-2`, not a frame),
`table`/`nav` (genuine CSS borders). See
`docs/superpowers/specs/2026-06-04-d2b-card-chip-ring-design.md`.
```

- [ ] **Step 3: Extend the existing CHANGELOG D2 line**

In `CHANGELOG.md` under `## [Unreleased]` → `### Fixed`, find the bullet beginning
**"Ring-framed components emit `ring-*` for their `border-*` tokens."** Edit it in place to:
- add `card` and `chip` to the list of components that now emit `ring-[…]`, and
- update the deferral clause to name only `button`/`badge` (and note `switch`/`table`/`nav` are not remapped).

The edited bullet should read:

```markdown
- **Ring-framed components emit `ring-*` for their `border-*` tokens.** Nuxt UI v4
  form fields and several other components draw their frame as a Tailwind ring
  (with `border-0`), not a CSS border. `input`, `textarea`, `checkbox`, `radio`,
  `kbd`, `dropdown`, `modal`, `card`, and `chip` border tokens now emit `ring-[…]`
  (resting, hover, focus, …) instead of `border-[…]`, removing the double frame on
  focus. `button`/`badge` (variant/color-conditional rings) are deferred; `switch`
  (sizing border) and `table`/`nav` (genuine borders) are not remapped.
```

- [ ] **Step 4: Final verification**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 5: Commit (do NOT push)**

```bash
git add docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md CHANGELOG.md
git commit -m "docs: D2b — card/chip ring-framed; extend D2 changelog + seeds"
```

Stop and report. Do not push.

---

## Self-Review

**Spec coverage:**
- "add card + chip to RING_FRAMED_COMPONENTS" → Task 1 Step 3. ✓
- "reuse D2 mechanism unchanged (no slot-mapping.ts change)" → Task 1 (only component-vocab + test). ✓
- "switch excluded + documented" → Task 1 Step 3 comment + the switch-border guard test. ✓
- success criteria (card-border/chip-border → ring; chip-border-active → ring+active; switch-border → border-color; chip-border-error → null) → Task 1 Step 1 tests. ✓
- "purely additive, no ripple" → Task 1 Step 5 explicitly checks for no snapshot/other churn. ✓
- "real export verification" → Task 2 Step 1. ✓
- "seeds note + extend existing CHANGELOG line" → Task 2 Steps 2-3. ✓
- "defer button/badge to D2c" → documented in the set comment + seeds + CHANGELOG. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output.

**Type consistency:** `RING_FRAMED_COMPONENTS` stays `ReadonlySet<string>`; the two added members are strings matching token prefixes. `"ring-color"` / `"border-color"` are existing `UtilityType`s. No signature changes; no call sites touched.
