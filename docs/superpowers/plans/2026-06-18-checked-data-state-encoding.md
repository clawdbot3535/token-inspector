# Phase B.2a — fix `checked` encoding (`checked:` → `data-[state=checked]`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make checked-state recipe classes actually fire on Nuxt UI v4's Reka components by emitting `data-[state=checked]:` instead of `checked:` — and teach `projectToState` the `data-[state=X]:` form so the emit and the mock-preview projection stay consistent.

**Architecture:** Two ordered changes. (1) `projectToState` learns the `data-[state=X]:` prefix (purely additive — nothing emits it yet, so the suite stays green). (2) The grammar's `normalizeState` maps `checked` → `data-[state=checked]`, and the one downstream check keyed on the raw `"checked"` statePrefix (heuristic checked→indicator routing) updates to the normalized value. Ordering matters: projectToState must handle the new form before the grammar emits it, or the checkbox/radio/switch previews regress mid-stream.

**Tech Stack:** TypeScript, vitest. Grammar in `packages/grammar`, app composables in `src/app`.

**Spec:** `docs/superpowers/specs/2026-06-18-checked-data-state-encoding-design.md`

**Branch:** `fix/checked-data-state` (created; spec committed there).

**Planning finding (refines the spec):** the spec's "1-line normalizeState change" also requires updating `heuristicSlotMapping`'s `entry.statePrefix === "checked"` check (line ~441, the v0.25.0 checked-bg→indicator routing) to the normalized `"data-[state=checked]"`, or that routing silently stops firing. Folded into Task 2.

---

### Task 1: `projectToState` learns `data-[state=X]:`

**Files:**
- Modify: `src/app/project-to-state.ts`
- Test: `src/app/project-to-state.test.ts`

- [ ] **Step 1: Append a failing test** to `src/app/project-to-state.test.ts`

```ts
it("promotes data-[state=checked]: classes under the matching state and drops them otherwise", () => {
  expect(projectToState("bg-[#A] data-[state=checked]:bg-[#B]", "checked")).toBe("bg-[#A] bg-[#B]");
  const hov = projectToState("bg-[#A] data-[state=checked]:bg-[#B]", "hover");
  expect(hov).toBe("bg-[#A]");
  // existing pseudo-prefix behavior still works alongside
  expect(projectToState("bg-[#A] hover:bg-[#C]", "hover")).toBe("bg-[#A] bg-[#C]");
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run src/app/project-to-state.test.ts -t "data-\[state"`
Expected: FAIL — currently `data-[state=checked]:bg-[#B]` is treated as a base class (the `^([a-z-]+):` regex doesn't match it), so it is kept verbatim, not promoted/dropped.

- [ ] **Step 3: Implement** — in `src/app/project-to-state.ts`, inside the `for` loop of `projectToState`, add a `data-[state=X]:` branch BEFORE the existing `const m = cls.match(/^([a-z-]+):(.+)$/);` line:

```ts
  for (const cls of classString.split(/\s+/).filter(Boolean)) {
    // Reka data-state variant, e.g. `data-[state=checked]:bg-[#x]` / `data-[state=open]:…`.
    // The bracketed state name is the prefix-state; promote when it matches, drop otherwise.
    const dm = cls.match(/^data-\[state=([a-z]+)\]:(.+)$/);
    if (dm !== null) {
      if (dm[1] === state) stateClasses.push(dm[2]!);
      continue;
    }
    const m = cls.match(/^([a-z-]+):(.+)$/);
    if (m === null) {
      baseClasses.push(cls);
      continue;
    }
    const prefix = m[1]!;
    const rest = m[2]!;
    if (!STATE_PREFIXES.has(prefix)) {
      baseClasses.push(cls);
      continue;
    }
    if (prefix === state) {
      stateClasses.push(rest);
    }
  }
```

(Only the `dm` branch is new; the rest of the loop body is unchanged.)

- [ ] **Step 4: Run to verify PASS + full file**

Run: `npx vitest run src/app/project-to-state.test.ts`
Expected: PASS — the new test + all existing tests (the existing `checked:` pseudo-prefix tests still pass; `projectToState` now supports BOTH `checked:` and `data-[state=checked]:`).

- [ ] **Step 5: Commit**

```bash
git add src/app/project-to-state.ts src/app/project-to-state.test.ts
git commit -m "feat(fidelity): projectToState handles the data-[state=X] variant form"
```

---

### Task 2: grammar — `checked` → `data-[state=checked]`

**Files:**
- Modify: `packages/grammar/src/slot-mapping.ts` (`normalizeState` ~line 190; the heuristic checked→indicator routing ~line 441)
- Test: `packages/grammar/src/slot-mapping.test.ts`, `src/recipe-engine.test.ts`

- [ ] **Step 1: Update the failing grammar tests** in `packages/grammar/src/slot-mapping.test.ts`

Change the two `statePrefix: "checked"` expectations to `"data-[state=checked]"`:
- the `"recognizes checked as a state, emitting a base \`checked:\` prefix..."` test (`heuristicSlotMapping("switch-bg-checked")`) → `statePrefix: "data-[state=checked]"` (and update its title to say `data-[state=checked]`).
- the `"maps checkbox-border-checked to ring-color with a checked prefix"` test (`heuristicSlotMapping("checkbox-border-checked")`) → `statePrefix: "data-[state=checked]"`.

Leave the `checkbox-bg-checked-error` → indicator-slot routing test unchanged (it asserts the routed result with NO statePrefix; it must still pass after the routing check is updated in Step 3).

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts -t checked`
Expected: FAIL — the two updated expectations now want `data-[state=checked]` but the code still produces `checked`; AND the `checkbox-bg-checked-error` routing test FAILS too (once normalizeState changes in Step 3, the routing check keyed on raw `"checked"` stops firing — Step 3 fixes both).

- [ ] **Step 3: Implement** — in `packages/grammar/src/slot-mapping.ts`:

(a) `normalizeState` — add the `checked` case:

```ts
function normalizeState(s: string): string {
  if (s === "hovered") return "hover";
  if (s === "opened" || s === "open") return "data-[state=open]";
  if (s === "checked") return "data-[state=checked]";
  return s;
}
```

(b) The heuristic checked-bg → indicator routing (~line 441) keys on the raw `"checked"`; update it to the normalized value so it keeps firing:

```ts
      if (
        slot === "base" &&
        entry.statePrefix === "data-[state=checked]" &&
        entry.utilityType === "bg-color" &&
        (nuxtSlotsFor(parsed.component)?.has("indicator") ?? false)
      ) {
```

(Update the adjacent comment's `checked:` reference to `data-[state=checked]:` for accuracy.)

- [ ] **Step 4: Run the grammar test file**

Run: `npx vitest run packages/grammar/src/slot-mapping.test.ts`
Expected: PASS — the two updated `statePrefix` expectations now match, and the `checkbox-bg-checked-error` → indicator routing still fires (the check now compares the normalized value).

- [ ] **Step 5: Verify the recipe-engine checked test**

Run: `npx vitest run src/recipe-engine.test.ts -t "checked fill"`
Expected: PASS — `buildComponentRecipes` still routes the checked-error fill onto `variants.color.error.indicator` (routing preserved via the Step 3 update). If an assertion there checks for the literal `checked:` substring, confirm it still holds (the indicator routing drops the prefix entirely, so neither `checked:` nor `data-[state=checked]:` appears on `error.base`). Adjust only if it asserts the old literal directly.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm test`
Expected: all pass. The checkbox/radio/switch **previews** still render checked because `projectToState` (Task 1) now promotes `data-[state=checked]:`. (876 + Task 1's 1 new test = 877; no tests removed.)

- [ ] **Step 7: Commit**

```bash
git add packages/grammar/src/slot-mapping.ts packages/grammar/src/slot-mapping.test.ts src/recipe-engine.test.ts
git commit -m "fix(grammar): checked → data-[state=checked] (fires on Nuxt UI Reka components)"
```

---

### Task 3: Browser verification

Unit tests prove the emit + projection; verify the real-component effect + no preview regression.

**Files:** none (manual; adjust only if something fails).

- [ ] **Step 1:** Run `npm run dev`; note the URL.

- [ ] **Step 2: Verify via `/browse`** — load `assets/tokens-20260615-161948.zip`, then:
  - **The fix:** select `switch` (and `checkbox`) → **Real** tab. They render checked-at-rest, so the resting cell now carries `data-[state=checked]:` classes that fire on the Reka root/thumb. Confirm the per-slot diff **improves** vs the pre-fix state (the checked bg/border/thumb-color now match where they previously didn't, because `checked:` was inert). Inspect the rendered element's class list to confirm `data-[state=checked]:…` is present (not `checked:…`).
  - **Preview regression:** switch to the **Preview** tab for checkbox/switch/radio — the mock previews still render their checked look (projectToState promotes the new form).
  - No unresolved elements; chrome unaffected (dark-leak guard 0).

- [ ] **Step 3:** Record the switch/checkbox resting-diff match deltas (before/after) for the release notes. If the classes don't fire (wrong Reka attribute value), note the actual `data-state` value observed and adjust `normalizeState` + the routing check accordingly, then re-run Task 2's tests.

---

### Task 4: Release v0.39.1

Patch release (a recipe-output correctness fix, like chip-close-icon v0.37.1). Established flow.

- [ ] **Step 1:** `npm version 0.39.1 --no-git-tag-version`.
- [ ] **Step 2: CHANGELOG** — linked `## [0.39.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.39.1) — <date>`: "Fixed: checked-state tokens emit `data-[state=checked]:` instead of `checked:` (Tailwind `:checked`), so checked styling actually fires on Nuxt UI v4's Reka checkbox/switch/radio. `projectToState` learns the `data-[state=X]` form (keeps the mock previews consistent + generalizes to `open`). Surfaced by the Real tab; verified live on switch/checkbox." Include the resting-diff deltas from Task 3.
- [ ] **Step 3: README** — bump test count to the new total (877 or what `npm test` reports).
- [ ] **Step 4: Commit** on the branch: `chore(release): v0.39.1 — checked → data-[state=checked] encoding fix`.
- [ ] **Step 5: Merge + tag + push + GitHub release:**

```bash
git checkout main
git merge --no-ff fix/checked-data-state -m "Merge fix/checked-data-state: checked → data-[state=checked] (v0.39.1)"
git tag v0.39.1 <release-commit-sha>
gh auth switch --user clawdbot3535
git push origin main
git push origin v0.39.1
gh release create v0.39.1 --title "v0.39.1 — checked → data-[state=checked] encoding fix" --notes-file <notes> --verify-tag
gh auth switch --user d56de
```
Verify the v0.39.1 release link resolves (HTTP 200).

---

## Self-Review

**Spec coverage:**
- `normalizeState` checked → `data-[state=checked]` → Task 2 step 3a. ✓
- `projectToState` recognizes `data-[state=X]:` (keeps previews, generalizes to open) → Task 1. ✓
- Test updates (slot-mapping, recipe-engine, project-to-state) → Tasks 1-2. ✓
- Verification (resting diff improves + previews intact) → Task 3. ✓
- **Refinement beyond the spec:** the heuristic checked→indicator routing check (raw `"checked"`) must update to the normalized value — Task 2 step 3b. Documented in the header.
- Ordering (projectToState before grammar emit, so previews don't regress mid-stream) → Task 1 then Task 2. ✓

**Placeholder scan:** No TBD/TODO; full code in every code step; commands have expected output. (Task 4 `<release-commit-sha>`/`<notes>`/`<date>` are release-time values, per prior release tasks.)

**Type consistency:** `projectToState(classString, state)` signature unchanged (the `state` arg already accepts `"checked"`/`"open"` via the `PreviewState | "checked"` union; `"open"` is also accepted since `PreviewState` is a string-literal set the data-state names belong to — if TS rejects `"open"`, it isn't passed in this plan, so no signature change needed). `normalizeState` return type `string` unchanged. The grammar `statePrefix` stays `string`. No new exported types.
