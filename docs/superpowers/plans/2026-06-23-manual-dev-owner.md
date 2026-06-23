# Manual-Dev Owner v1 + Owner-Predicate Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the fifth (Y) owner — an advisory `🔧 hand-code` badge in the Scan view for three "hand-code-only" deviations (`custom-without-parts`, `disabled-via-opacity`, `resting-shadowed-by-state`) — and consolidate the owner-predicate mechanic into a shared `makeOwnerPredicate` factory that `by-design.ts` and `figma-fix.ts` are refactored onto.

**Architecture:** A new `src/app/resolve/owners.ts` exports `makeOwnerPredicate(kinds)`. The two existing owner classifiers are refactored to build their predicate from it (behaviour-preserving — their existing tests are the regression guard). A new `manual-dev.ts` adds the third owner via the factory. `ScanView.vue` gains one additive teal badge branch. No scanner change, no `ScanIssue` field, no new state, no count change.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-23-manual-dev-owner-design.md`

---

## File Structure

- **Create** `src/app/resolve/owners.ts` — `makeOwnerPredicate(kinds)` factory + the shared owner-concept/drift doc.
- **Create** `src/app/resolve/owners.test.ts` — factory unit tests.
- **Modify** `src/app/resolve/by-design.ts` — predicate built via the factory (set + caveat unchanged).
- **Modify** `src/app/resolve/figma-fix.ts` — predicate built via the factory (set + caveat unchanged).
- **Create** `src/app/resolve/manual-dev.ts` — `MANUAL_DEV_KINDS` + `isManualDev` via the factory.
- **Create** `src/app/resolve/manual-dev.test.ts` — classifier unit tests.
- **Modify** `src/app/components/ScanView.vue` — import + teal badge branch.
- **Create** `src/app/components/ScanView.manualdev.test.ts` — badge mount tests.

---

## Task 1: Shared `makeOwnerPredicate` factory + refactor the two existing owners

**Files:**
- Create: `src/app/resolve/owners.ts`, `src/app/resolve/owners.test.ts`
- Modify: `src/app/resolve/by-design.ts`, `src/app/resolve/figma-fix.ts`

- [ ] **Step 1: Write the failing factory test**

Create `src/app/resolve/owners.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeOwnerPredicate } from "./owners.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "classification-hint",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("makeOwnerPredicate", () => {
  it("returns a predicate true for member kinds and false for non-members", () => {
    const isFoo = makeOwnerPredicate(new Set(["a", "b"]));
    expect(isFoo(issue("a"))).toBe(true);
    expect(isFoo(issue("b"))).toBe(true);
    expect(isFoo(issue("c"))).toBe(false);
  });

  it("returns a function", () => {
    expect(typeof makeOwnerPredicate(new Set<string>())).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/resolve/owners.test.ts`
Expected: FAIL — cannot resolve module `./owners.js`.

- [ ] **Step 3: Create the factory**

Create `src/app/resolve/owners.ts`:

```ts
import type { ScanIssue } from "@core/token-graph.js";

/**
 * Build an owner-classification predicate from a set of ScanIssue.kind strings.
 *
 * The (Y) deviation-routing owners each claim a DISJOINT set of issue kinds, so an
 * issue matches at most one owner predicate. Each owner's KINDS set lives in its own
 * module (the semantic home: its name, JSDoc, and the scanner-line caveat). Those kind
 * strings are emitted in src/scanner.ts; ScanIssue.kind is typed `string`, so a
 * scanner-side kind rename will NOT surface as a compile error — keep each owner set
 * aligned with its scanner emit sites on any rename.
 */
export function makeOwnerPredicate(
  kinds: ReadonlySet<string>,
): (issue: ScanIssue) => boolean {
  return (issue) => kinds.has(issue.kind);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/resolve/owners.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Refactor `by-design.ts` onto the factory**

In `src/app/resolve/by-design.ts`, replace the first import line:

```ts
import type { ScanIssue } from "@core/token-graph.js";
```

with:

```ts
import { makeOwnerPredicate } from "./owners.js";
```

Then replace the predicate function (the `export function isByDesign(...) { ... }` block):

```ts
export function isByDesign(issue: ScanIssue): boolean {
  return BY_DESIGN_KINDS.has(issue.kind);
}
```

with (keep the JSDoc comment directly above it unchanged):

```ts
export const isByDesign = makeOwnerPredicate(BY_DESIGN_KINDS);
```

(The `BY_DESIGN_KINDS` set and its caveat comment stay exactly as they are. `ScanIssue` is no longer referenced in this file, so its import is correctly removed.)

- [ ] **Step 6: Refactor `figma-fix.ts` onto the factory**

In `src/app/resolve/figma-fix.ts`, replace the first import line:

```ts
import type { ScanIssue } from "@core/token-graph.js";
```

with:

```ts
import { makeOwnerPredicate } from "./owners.js";
```

Then replace the predicate function:

```ts
export function isFigmaFix(issue: ScanIssue): boolean {
  return FIGMA_FIX_KINDS.has(issue.kind);
}
```

with (keep the JSDoc comment above it unchanged):

```ts
export const isFigmaFix = makeOwnerPredicate(FIGMA_FIX_KINDS);
```

- [ ] **Step 7: Run the resolve-layer tests as the regression guard**

Run: `npx vitest run src/app/resolve/owners.test.ts src/app/resolve/by-design.test.ts src/app/resolve/figma-fix.test.ts`
Expected: PASS — the existing `by-design.test.ts` (3 tests) and `figma-fix.test.ts` (3 tests) confirm the refactor preserved behaviour; `owners.test.ts` (2 tests) passes. All green.

- [ ] **Step 8: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all green; typecheck clean (confirms no unused-import / type fallout from dropping the `ScanIssue` imports).

- [ ] **Step 9: Commit**

```bash
git add src/app/resolve/owners.ts src/app/resolve/owners.test.ts src/app/resolve/by-design.ts src/app/resolve/figma-fix.ts
git commit -m "refactor(resolve): shared makeOwnerPredicate factory; by-design + figma-fix use it"
```

(The pre-commit hook runs vue-tsc + the full vitest suite and can flake transiently ~13s — just re-run the commit if it dies early.)

---

## Task 2: Manual-Dev classifier

**Files:**
- Create: `src/app/resolve/manual-dev.ts`
- Test: `src/app/resolve/manual-dev.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/resolve/manual-dev.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isManualDev, MANUAL_DEV_KINDS } from "./manual-dev.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "classification-hint",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("isManualDev", () => {
  it("is true for the hand-code-only kinds", () => {
    expect(isManualDev(issue("custom-without-parts"))).toBe(true);
    expect(isManualDev(issue("disabled-via-opacity"))).toBe(true);
    expect(isManualDev(issue("resting-shadowed-by-state"))).toBe(true);
  });

  it("is false for other owners' kinds", () => {
    expect(isManualDev(issue("capability-gap"))).toBe(false);              // by-design
    expect(isManualDev(issue("asymmetric-variant-coverage"))).toBe(false); // figma-fix
    expect(isManualDev(issue("possible-typo"))).toBe(false);               // data-quality
    expect(isManualDev(issue("unsupported-part"))).toBe(false);            // heuristic
  });

  it("MANUAL_DEV_KINDS holds exactly the three kinds", () => {
    expect([...MANUAL_DEV_KINDS].sort()).toEqual(
      ["custom-without-parts", "disabled-via-opacity", "resting-shadowed-by-state"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/resolve/manual-dev.test.ts`
Expected: FAIL — cannot resolve module `./manual-dev.js`.

- [ ] **Step 3: Create the classifier**

Create `src/app/resolve/manual-dev.ts`:

```ts
import { makeOwnerPredicate } from "./owners.js";

// These kind strings are emitted in src/scanner.ts (custom-without-parts :451,
// disabled-via-opacity :232, resting-shadowed-by-state :252). ScanIssue.kind is typed
// `string`, so a scanner-side kind rename will NOT surface as a compile error here —
// keep this set aligned on any rename. (Shared caveat: see owners.ts.)
//
// `disabled-via-opacity` + `resting-shadowed-by-state` are also in
// CAPABILITY_DEVIATION_KINDS (kit-behaviors.ts) but are NOT by-design: unlike
// capability-gap (Nuxt has no such slot), these are overridable by hand-written CSS —
// i.e. the developer's domain.
export const MANUAL_DEV_KINDS: ReadonlySet<string> = new Set([
  "custom-without-parts",
  "disabled-via-opacity",
  "resting-shadowed-by-state",
]);

/**
 * True when an issue is resolvable only by hand-coding in the developer's Nuxt app —
 * a hand-written custom recipe, or a CSS override that fights Nuxt's default. Advisory:
 * there is no in-app override.
 */
export const isManualDev = makeOwnerPredicate(MANUAL_DEV_KINDS);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/resolve/manual-dev.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/resolve/manual-dev.ts src/app/resolve/manual-dev.test.ts
git commit -m "feat(resolve): Manual-Dev owner classifier (hand-code-only kinds)"
```

---

## Task 3: ScanView Manual-Dev badge

**Files:**
- Modify: `src/app/components/ScanView.vue` (import after the existing figma-fix import; badge span after the figma-fix badge span, inside the affordance `<div class="shrink-0 flex items-center gap-1">`)
- Test: `src/app/components/ScanView.manualdev.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ScanView.manualdev.test.ts`:

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
      category: "classification-hint",
      severity: "warning",
      kind: "custom-without-parts",
      message: "m",
      tokenIds: ["foo-bar"],
      componentName: "foo",
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView manual-dev badge", () => {
  it("renders the 🔧 hand-code badge for each manual-dev kind", () => {
    for (const kind of ["custom-without-parts", "disabled-via-opacity", "resting-shadowed-by-state"]) {
      const wrapper = mount(ScanView, { props: { report: reportWith({ kind }) }, global: { stubs } });
      const badge = wrapper.find("[data-testid=manual-dev]");
      expect(badge.exists(), kind).toBe(true);
      expect(badge.text()).toContain("hand-code");
    }
  });

  it("renders no manual-dev badge for a non-manual-dev issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "capability-gap" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=manual-dev]").exists()).toBe(false);
  });

  it("shows no by-design / figma-fix badge or Resolve button for a manual-dev issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "disabled-via-opacity" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=by-design]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=figma-fix]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ScanView.manualdev.test.ts`
Expected: FAIL — `[data-testid=manual-dev]` not found.

- [ ] **Step 3: Add the import to ScanView.vue**

In `src/app/components/ScanView.vue`, add the import directly after the existing `figma-fix` import (the line `import { isFigmaFix } from "../resolve/figma-fix.js";`):

```ts
import { isManualDev } from "../resolve/manual-dev.js";
```

- [ ] **Step 4: Add the badge branch to the template**

In `src/app/components/ScanView.vue`, inside the right-side affordance `<div class="shrink-0 flex items-center gap-1">`, add the badge span immediately AFTER the closing `</span>` of the existing figma-fix badge (the span with `data-testid="figma-fix"`, content `🎨 fix in Figma`), and BEFORE that div's closing `</div>`:

```html
              <span
                v-if="isManualDev(issue)"
                class="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                data-testid="manual-dev"
                title="Resolvable only by hand-coding in your Nuxt app (a custom recipe or a CSS override against Nuxt's default)"
              >🔧 hand-code</span>
```

The muted teal styling is distinct from by-design (zinc), the typo hint (sky), figma-fix (violet), and `✓ resolved` (emerald). The badge text is constant; the specific "why" stays in `issue.message` (and the curated `kit-behaviors.ts` notes for the two capability-deviation kinds). The three manual-dev kinds are disjoint from every other owner's set, so this branch is mutually exclusive with the Resolve button / `✓ resolved` / typo hint / by-design / figma-fix badges.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ScanView.manualdev.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all tests green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.manualdev.test.ts
git commit -m "feat(resolve): ScanView 🔧 hand-code owner badge (Manual-Dev)"
```

---

## Self-Review

**Spec coverage:**
- Shared `makeOwnerPredicate` factory + shared concept/drift doc → Task 1 Steps 3. ✓
- Behaviour-preserving refactor of by-design.ts + figma-fix.ts, guarded by their existing tests → Task 1 Steps 5–7. ✓
- Manual-Dev scope (3 kinds) → Task 2 `MANUAL_DEV_KINDS`. ✓
- Boundary resolution note (the two capability-deviation orphans are overridable, not by-design) → Task 2 Step 3 comment. ✓
- Advisory `🔧 hand-code` teal badge, constant text → Task 3 Step 4. ✓
- Non-goals (no count change, no scanner change, no `ScanIssue` field, no interaction, no snippet) → no scanner/type files touched; badge has no handler. ✓
- Tests (factory, classifier incl. cross-owner negatives, ScanView render incl. negative + mutual-exclusion, regression guard) → Tasks 1–3. ✓
- Owner disjointness invariant → Task 3 third test (no by-design/figma-fix badge, no Resolve, for a manual-dev issue). ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows full content, including exact before/after for the two refactors. ✓

**Type consistency:** `makeOwnerPredicate(kinds: ReadonlySet<string>): (issue: ScanIssue) => boolean` (Task 1) is consumed identically in by-design.ts/figma-fix.ts (Task 1) and manual-dev.ts (Task 2). `isManualDev` / `MANUAL_DEV_KINDS` defined in Task 2, used in Task 2 tests + Task 3 import/template. `data-testid` values (`manual-dev`, `by-design`, `figma-fix`, `resolve-issue`) match the existing ScanView template. ✓
