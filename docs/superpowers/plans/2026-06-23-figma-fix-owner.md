# Figma-Fix Owner v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe five "coverage-gap" scan deviations (`asymmetric-variant-coverage`, `asymmetric-size-coverage`, `incomplete-size-variant`, `non-suffix-vs-size-conflict`, `orphaned-size-key`) with an advisory `🎨 fix in Figma` owner-verdict badge in the Scan view, so the user recognises them as the designer's to-do list (the Figma token set is incomplete/inconsistent — add or align tokens).

**Architecture:** A pure classifier (`isFigmaFix(issue)` over `issue.kind`) in `src/app/resolve/`, mirroring the existing `by-design.ts` owner classifier. `ScanView.vue` gains one additive template branch that renders a muted violet pill when the predicate is true. No scanner change, no `ScanIssue` field, no new state, no count change — advisory only.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-23-figma-fix-owner-design.md`

---

## File Structure

- **Create** `src/app/resolve/figma-fix.ts` — exports `FIGMA_FIX_KINDS` (set) + `isFigmaFix(issue)`. One responsibility: classify an issue as the Figma-Fix owner's domain.
- **Create** `src/app/resolve/figma-fix.test.ts` — unit tests for the classifier.
- **Modify** `src/app/components/ScanView.vue` — import the classifier + add the badge template branch (after the existing by-design badge span).
- **Create** `src/app/components/ScanView.figmafix.test.ts` — mount tests for the badge.

---

## Task 1: Figma-Fix classifier

**Files:**
- Create: `src/app/resolve/figma-fix.ts`
- Test: `src/app/resolve/figma-fix.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/resolve/figma-fix.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isFigmaFix, FIGMA_FIX_KINDS } from "./figma-fix.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "data-quality",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("isFigmaFix", () => {
  it("is true for the coverage-gap kinds", () => {
    expect(isFigmaFix(issue("asymmetric-variant-coverage"))).toBe(true);
    expect(isFigmaFix(issue("asymmetric-size-coverage"))).toBe(true);
    expect(isFigmaFix(issue("incomplete-size-variant"))).toBe(true);
    expect(isFigmaFix(issue("non-suffix-vs-size-conflict"))).toBe(true);
    expect(isFigmaFix(issue("orphaned-size-key"))).toBe(true);
  });

  it("is false for other owners' kinds", () => {
    expect(isFigmaFix(issue("capability-gap"))).toBe(false);       // by-design
    expect(isFigmaFix(issue("possible-typo"))).toBe(false);        // Data-Quality
    expect(isFigmaFix(issue("unsupported-part"))).toBe(false);     // Heuristic-Extension
    expect(isFigmaFix(issue("collection-anatomy-mismatch"))).toBe(false); // deliberately out of scope
  });

  it("FIGMA_FIX_KINDS holds exactly the five coverage-gap kinds", () => {
    expect([...FIGMA_FIX_KINDS].sort()).toEqual(
      [
        "asymmetric-size-coverage",
        "asymmetric-variant-coverage",
        "incomplete-size-variant",
        "non-suffix-vs-size-conflict",
        "orphaned-size-key",
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/resolve/figma-fix.test.ts`
Expected: FAIL — cannot resolve module `./figma-fix.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/resolve/figma-fix.ts`:

```ts
import type { ScanIssue } from "@core/token-graph.js";

// These kind strings are emitted in src/scanner.ts (asymmetric-variant-coverage :868,
// asymmetric-size-coverage :570, incomplete-size-variant :549,
// non-suffix-vs-size-conflict :521, orphaned-size-key :607). ScanIssue.kind is typed
// `string` (open for extension), so a scanner-side kind rename will NOT surface as a
// compile error here — keep this set aligned on any rename. (Same caveat as
// BY_DESIGN_KINDS in src/app/resolve/by-design.ts.)
export const FIGMA_FIX_KINDS: ReadonlySet<string> = new Set([
  "asymmetric-variant-coverage",
  "asymmetric-size-coverage",
  "incomplete-size-variant",
  "non-suffix-vs-size-conflict",
  "orphaned-size-key",
]);

/**
 * True when an issue's fix lives in the Figma token source — the coverage of the
 * design token set is incomplete or inconsistent, and the designer must add or align
 * tokens in Figma. Advisory: there is no in-app override.
 */
export function isFigmaFix(issue: ScanIssue): boolean {
  return FIGMA_FIX_KINDS.has(issue.kind);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/resolve/figma-fix.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/resolve/figma-fix.ts src/app/resolve/figma-fix.test.ts
git commit -m "feat(resolve): Figma-Fix owner classifier (coverage-gap kinds)"
```

(The pre-commit hook runs vue-tsc + the full vitest suite and can flake transiently ~13s — just re-run the commit if it dies early.)

---

## Task 2: ScanView Figma-Fix badge

**Files:**
- Modify: `src/app/components/ScanView.vue` (import after the existing by-design import; badge span after the by-design badge span at line ~189, inside the affordance `<div class="shrink-0 flex items-center gap-1">`)
- Test: `src/app/components/ScanView.figmafix.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ScanView.figmafix.test.ts`:

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
      category: "data-quality",
      severity: "warning",
      kind: "asymmetric-variant-coverage",
      message: "m",
      tokenIds: ["button-outline-border"],
      componentName: "button",
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView figma-fix badge", () => {
  it("renders the 🎨 fix in Figma badge for each coverage-gap kind", () => {
    for (const kind of [
      "asymmetric-variant-coverage",
      "asymmetric-size-coverage",
      "incomplete-size-variant",
      "non-suffix-vs-size-conflict",
      "orphaned-size-key",
    ]) {
      const wrapper = mount(ScanView, { props: { report: reportWith({ kind }) }, global: { stubs } });
      const badge = wrapper.find("[data-testid=figma-fix]");
      expect(badge.exists(), kind).toBe(true);
      expect(badge.text()).toContain("fix in Figma");
    }
  });

  it("renders no figma-fix badge for a non-figma-fix issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "capability-gap" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=figma-fix]").exists()).toBe(false);
  });

  it("shows no by-design badge or Resolve button for a figma-fix issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "incomplete-size-variant" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=by-design]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ScanView.figmafix.test.ts`
Expected: FAIL — `[data-testid=figma-fix]` not found (badge not yet rendered).

- [ ] **Step 3: Add the import to ScanView.vue**

In `src/app/components/ScanView.vue`, add the import directly after the existing `by-design` import (currently line 7 `import { isByDesign } from "../resolve/by-design.js";`):

```ts
import { isFigmaFix } from "../resolve/figma-fix.js";
```

(In Vue `<script setup>`, a top-level import referenced in the template is exposed to it automatically — no extra wiring needed.)

- [ ] **Step 4: Add the badge branch to the template**

In `src/app/components/ScanView.vue`, inside the right-side affordance `<div class="shrink-0 flex items-center gap-1">`, add the badge span immediately AFTER the closing `</span>` of the existing by-design badge (the span with `data-testid="by-design"`, whose content is `⊘ by-design`, currently ending at line ~189), and BEFORE that div's closing `</div>`:

```html
              <span
                v-if="isFigmaFix(issue)"
                class="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                data-testid="figma-fix"
                title="Fix in the Figma token source — add or align the missing/inconsistent tokens"
              >🎨 fix in Figma</span>
```

The muted violet styling is distinct from the by-design badge (zinc), the typo hint (sky), and the severity tags (amber/red), signalling "the designer's domain" without being alarming. The badge text is constant; the specific "what to add" stays in `issue.message`. The five Figma-Fix kinds are disjoint from the by-design, heuristic-extendable, and `possible-typo` kind-sets, so this branch is mutually exclusive with the Resolve button / `✓ resolved` / typo hint / by-design badge.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ScanView.figmafix.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all tests green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.figmafix.test.ts
git commit -m "feat(resolve): ScanView 🎨 fix in Figma owner badge"
```

---

## Self-Review

**Spec coverage:**
- Scope (5 coverage-gap kinds) → Task 1 `FIGMA_FIX_KINDS` + Task 2 badge. ✓
- Advisory `🎨 fix in Figma` badge with constant text → Task 2 Step 4. ✓
- Reuse existing `issue.message` (no new rationale text) → Task 2 keeps the message span untouched. ✓
- Non-goals (no count change, no scanner change, no `ScanIssue` field, no interaction) → no scanner/type files touched; badge has no click handler. ✓
- Muted violet styling distinct from the other owners → Task 2 Step 4 class list. ✓
- Home in `src/app/resolve/` → Task 1 paths. ✓
- Tests (classifier incl. out-of-scope negatives + ScanView render incl. negative + no-by-design/no-Resolve) → Task 1 test, Task 2 test. ✓
- Invariant: Figma-Fix disjoint from by-design/heuristic/typo → Task 2 third test asserts no by-design badge and no Resolve button for a Figma-Fix issue. ✓
- `asymmetric-variant-coverage` severity varies but badge is severity-independent → fixtures use `severity: "warning"`; the badge keys off `kind`, so severity is irrelevant. ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows full content. ✓

**Type consistency:** `isFigmaFix(issue: ScanIssue): boolean` and `FIGMA_FIX_KINDS: ReadonlySet<string>` are defined in Task 1 and referenced identically in Task 1 tests and Task 2 (import + template). `data-testid` values (`figma-fix`, `by-design`, `resolve-issue`) match the existing ScanView template. ✓
