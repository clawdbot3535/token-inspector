# Data-Quality owner v2 — malformed-value hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route `malformed-value` deviations to the Data-Quality owner and give them an advisory "fix the $value in Figma" hint in the Scan view (generic, no copy; severity stays error).

**Architecture:** Add `malformed-value` to `DATA_QUALITY_KINDS` in `owner-of.ts` (so `ownerOf` returns `"data-quality"` for it). Add a sibling hint span in `ScanView.vue` gated on `ownerOf(issue) === 'data-quality' && issue.kind === 'malformed-value'`. No build-graph / scanner / `ScanIssue`-type change; malformed-value already reaches the report.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-24-malformed-value-hint-design.md`

---

## File Structure

- **Modify** `src/app/resolve/owner-of.ts` — add `malformed-value` to `DATA_QUALITY_KINDS`.
- **Modify** `src/app/resolve/owner-of.test.ts` — assert `ownerOf(malformed-value) === "data-quality"`.
- **Modify** `src/app/components/ScanView.vue` — add the malformed-value hint span.
- **Create** `src/app/components/ScanView.malformed.test.ts` — hint render tests.

---

## Task 1: Route malformed-value to Data-Quality

**Files:**
- Modify: `src/app/resolve/owner-of.ts`, `src/app/resolve/owner-of.test.ts`

- [ ] **Step 1: Write the failing assertion**

In `src/app/resolve/owner-of.test.ts`, add a line to the existing `"maps each owner's kind to that owner"` test, immediately after the `possible-typo` assertion (line 17):

```ts
    expect(ownerOf(issue("possible-typo"))).toBe("data-quality");
    expect(ownerOf(issue("malformed-value"))).toBe("data-quality");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/resolve/owner-of.test.ts`
Expected: FAIL — `ownerOf(issue("malformed-value"))` is currently `null` (malformed-value is un-owned), so `.toBe("data-quality")` fails.

- [ ] **Step 3: Add malformed-value to the Data-Quality set**

In `src/app/resolve/owner-of.ts`, replace:

```ts
// The Data-Quality owner has no classifier module — it keys off this one kind.
const DATA_QUALITY_KINDS: ReadonlySet<string> = new Set(["possible-typo"]);
```

with:

```ts
// The Data-Quality owner has no classifier module — it keys off these kinds.
const DATA_QUALITY_KINDS: ReadonlySet<string> = new Set(["possible-typo", "malformed-value"]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/resolve/owner-of.test.ts`
Expected: PASS — all tests green (the `OWNER_FILTERS` order test is unaffected; malformed-value maps to the existing `data-quality` filter, it is not a new filter value).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all green; typecheck clean. (No existing test asserts malformed-value → "Other"/null, so nothing breaks.)

- [ ] **Step 6: Commit**

```bash
git add src/app/resolve/owner-of.ts src/app/resolve/owner-of.test.ts
git commit -m "feat(resolve): route malformed-value to the Data-Quality owner"
```

(The pre-commit hook runs vue-tsc + the full vitest suite and can flake transiently ~13s — re-run the same commit if it dies early.)

---

## Task 2: ScanView malformed-value hint

**Files:**
- Modify: `src/app/components/ScanView.vue`
- Test: `src/app/components/ScanView.malformed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ScanView.malformed.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{
      id: "i1",
      category: "build-time",
      severity: "error",
      kind: "malformed-value",
      message: "malformed-value for foo (type=color)",
      tokenIds: ["foo"],
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView malformed-value hint", () => {
  it("renders the malformed hint for a malformed-value issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    const hint = w.find("[data-testid=malformed-hint]");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("$value");
  });

  it("renders the typo hint (not the malformed hint) for a possible-typo issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({ kind: "possible-typo", category: "data-quality", severity: "warning", message: "m", typoFrom: "heigth", typoTo: "height" }) }, global: { stubs } });
    expect(w.find("[data-testid=malformed-hint]").exists()).toBe(false);
    expect(w.find("[data-testid=typo-hint]").exists()).toBe(true);
  });

  it("renders no malformed hint for a non-data-quality issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({ kind: "capability-gap", category: "classification-hint", severity: "hint", message: "m" }) }, global: { stubs } });
    expect(w.find("[data-testid=malformed-hint]").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ScanView.malformed.test.ts`
Expected: FAIL — `[data-testid=malformed-hint]` not found.

- [ ] **Step 3: Add the malformed hint span**

In `src/app/components/ScanView.vue`, add this span immediately AFTER the typo-hint span (the `<span ... data-testid="typo-hint"> … 💡 … <button data-testid="typo-copy">Copy</button> </span>` block), and BEFORE the owner-badge span (the `<span v-if="ownerBadge(ownerOf(issue))" …>`):

```html
              <span
                v-if="ownerOf(issue) === 'data-quality' && issue.kind === 'malformed-value'"
                class="ml-2 inline-flex items-center gap-1 text-[10px] text-sky-700 dark:text-sky-300"
                data-testid="malformed-hint"
                title="A color $value must be a Figma {components, hex} object; a number/dimension $value must be a number."
              >🛠 fix the $value in the Figma source</span>
```

(`ownerOf` is already imported in ScanView. This is mutually exclusive with the typo hint: the typo hint gate requires `issue.typoTo`, this one requires `issue.kind === 'malformed-value'` — one issue never has both. No Copy button: there is no single corrected value. Sky colour matches the typo hint, the same owner.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ScanView.malformed.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all tests green; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.malformed.test.ts
git commit -m "feat(resolve): ScanView malformed-value advisory hint (Data-Quality)"
```

---

## Self-Review

**Spec coverage:**
- `malformed-value` added to `DATA_QUALITY_KINDS` → Task 1 Step 3. ✓
- `ownerOf(malformed-value) === "data-quality"` asserted → Task 1 Step 1. ✓
- Sibling hint gated on `ownerOf === 'data-quality' && kind === 'malformed-value'`, generic text, no copy, sky → Task 2 Step 3. ✓
- Mutual exclusivity with the typo hint → Task 2 Step 1 second test (possible-typo → typo hint, not malformed). ✓
- Severity/category unchanged (error/build-time) → no scanner/build-graph/type change; Task 2 fixture uses `build-time`/`error`. ✓
- Non-goals (no per-type structured hint, no reclassify, no copy, only 2 src files) → only owner-of.ts + ScanView.vue touched. ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows full content, incl. the exact owner-of.ts before/after. ✓

**Type consistency:** `DATA_QUALITY_KINDS` (Task 1) is consumed by `ownerOf` (unchanged signature). The ScanView gate `ownerOf(issue) === 'data-quality' && issue.kind === 'malformed-value'` uses `ownerOf` (imported) + `issue.kind` (a `ScanIssue` field). `data-testid="malformed-hint"` matches the Task 2 test selector. The Task 1 test's `issue("malformed-value")` and the Task 2 fixture's `kind: "malformed-value"` are consistent. ✓
