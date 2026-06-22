# by-design / Constraint Owner v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe three "capability-family" scan deviations (`capability-gap`, `state-via-prop`, `unsupported-state`) with an advisory `⊘ by-design` owner-verdict badge in the Scan view, so the user can recognise them as inherent Nuxt UI constraints rather than fixable warnings.

**Architecture:** A pure classifier (`isByDesign(issue)` over `issue.kind`) in `src/app/resolve/`, mirroring the existing `heuristic-extendable.ts` owner classifier. `ScanView.vue` gains one additive template branch that renders a muted pill when the predicate is true. No scanner change, no `ScanIssue` field, no new state, no count change — advisory only.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-22-by-design-constraint-owner-design.md`

---

## File Structure

- **Create** `src/app/resolve/by-design.ts` — exports `BY_DESIGN_KINDS` (set) + `isByDesign(issue)`. One responsibility: classify an issue as the by-design owner's domain.
- **Create** `src/app/resolve/by-design.test.ts` — unit tests for the classifier.
- **Modify** `src/app/components/ScanView.vue` — import the classifier + add the badge template branch.
- **Create** `src/app/components/ScanView.bydesign.test.ts` — mount tests for the badge.

---

## Task 1: by-design classifier

**Files:**
- Create: `src/app/resolve/by-design.ts`
- Test: `src/app/resolve/by-design.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/resolve/by-design.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isByDesign, BY_DESIGN_KINDS } from "./by-design.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "classification-hint",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("isByDesign", () => {
  it("is true for the capability-family kinds", () => {
    expect(isByDesign(issue("capability-gap"))).toBe(true);
    expect(isByDesign(issue("state-via-prop"))).toBe(true);
    expect(isByDesign(issue("unsupported-state"))).toBe(true);
  });

  it("is false for non-by-design kinds", () => {
    expect(isByDesign(issue("unsupported-part"))).toBe(false);
    expect(isByDesign(issue("component-looks-custom"))).toBe(false);
    expect(isByDesign(issue("possible-typo"))).toBe(false);
    expect(isByDesign(issue("malformed-value"))).toBe(false);
  });

  it("BY_DESIGN_KINDS holds exactly the three capability-family kinds", () => {
    expect([...BY_DESIGN_KINDS].sort()).toEqual(
      ["capability-gap", "state-via-prop", "unsupported-state"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/resolve/by-design.test.ts`
Expected: FAIL — cannot resolve module `./by-design.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/resolve/by-design.ts`:

```ts
import type { ScanIssue } from "@core/token-graph.js";

// These kind strings are emitted in src/scanner.ts (capability-gap :368,
// state-via-prop :173, unsupported-state :191). ScanIssue.kind is typed `string`
// (open for extension), so a scanner-side kind rename will NOT surface as a compile
// error here — keep this set aligned on any rename. (Same caveat as
// CAPABILITY_DEVIATION_KINDS in src/app/kit-behaviors.ts.)
//
// Deliberately NOT reused from CAPABILITY_DEVIATION_KINDS: that set also contains
// `unsupported-part` (the heuristic-extendable owner — the opposite of by-design)
// plus kinds out of this v1's scope.
export const BY_DESIGN_KINDS: ReadonlySet<string> = new Set([
  "capability-gap",
  "state-via-prop",
  "unsupported-state",
]);

/**
 * True when an issue is an inherent Nuxt UI architectural constraint — the
 * by-design owner's domain. Advisory: there is no source fix and no in-app override.
 */
export function isByDesign(issue: ScanIssue): boolean {
  return BY_DESIGN_KINDS.has(issue.kind);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/resolve/by-design.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/resolve/by-design.ts src/app/resolve/by-design.test.ts
git commit -m "feat(resolve): by-design owner classifier (capability-family kinds)"
```

(The pre-commit hook runs vue-tsc + the full vitest suite and can flake transiently ~13s — just re-run the commit if it dies early.)

---

## Task 2: ScanView by-design badge

**Files:**
- Modify: `src/app/components/ScanView.vue` (import after line 6; template branch inside the affordance `<div>` at lines 160–183)
- Test: `src/app/components/ScanView.bydesign.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ScanView.bydesign.test.ts`:

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
      kind: "state-via-prop",
      message: "m",
      tokenIds: ["alert-success-border"],
      componentName: "alert",
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView by-design badge", () => {
  it("renders the ⊘ by-design badge for each capability-family kind", () => {
    for (const kind of ["capability-gap", "state-via-prop", "unsupported-state"]) {
      const wrapper = mount(ScanView, { props: { report: reportWith({ kind }) }, global: { stubs } });
      const badge = wrapper.find("[data-testid=by-design]");
      expect(badge.exists(), kind).toBe(true);
      expect(badge.text()).toContain("by-design");
    }
  });

  it("renders no by-design badge for a non-by-design issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "possible-typo" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=by-design]").exists()).toBe(false);
  });

  it("shows no Resolve button or ✓ resolved for a by-design issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "unsupported-state" }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=resolve-done]").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ScanView.bydesign.test.ts`
Expected: FAIL — `[data-testid=by-design]` not found (badge not yet rendered).

- [ ] **Step 3: Add the import to ScanView.vue**

In `src/app/components/ScanView.vue`, add the import directly after the existing `resolved-issues` import (currently line 6):

```ts
import { resolvedIssueIds } from "../resolve/resolved-issues.js";
import { isByDesign } from "../resolve/by-design.js";
```

(In Vue `<script setup>`, a top-level import referenced in the template is exposed to it automatically — no extra wiring needed.)

- [ ] **Step 4: Add the badge branch to the template**

In `src/app/components/ScanView.vue`, inside the right-side affordance `<div class="shrink-0 flex items-center gap-1">`, add the badge span immediately after the closing `</span>` of the typo-hint block (after the line `<button type="button" class="underline" data-testid="typo-copy" @click.stop="copyRename(issue)">Copy</button>` and its `</span>`), before the `</div>`:

```html
              <span
                v-if="isByDesign(issue)"
                class="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                data-testid="by-design"
                title="Nuxt UI constraint — expected; no fix needed"
              >⊘ by-design</span>
```

The muted zinc styling matches the existing `hint` severity tag and signals "informational / expected" (not alarming). The badge text is constant; the kind-specific *why* stays in `issue.message`. By-design kinds are never heuristic-extendable and never `possible-typo`, so this branch is mutually exclusive with the Resolve button / `✓ resolved` / typo hint.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ScanView.bydesign.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all tests green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.bydesign.test.ts
git commit -m "feat(resolve): ScanView ⊘ by-design owner badge"
```

---

## Self-Review

**Spec coverage:**
- Scope (3 capability-family kinds) → Task 1 `BY_DESIGN_KINDS` + Task 2 badge. ✓
- Advisory `⊘ by-design` badge with constant text → Task 2 Step 4. ✓
- Reuse existing `issue.message` (no new rationale text) → Task 2 keeps the message span untouched. ✓
- Non-goals (no count change, no scanner change, no `ScanIssue` field, no interaction) → no scanner/type files touched; badge has no click handler. ✓
- Standalone set, not reused from `CAPABILITY_DEVIATION_KINDS` → Task 1 comment + Step 3. ✓
- Home in `src/app/resolve/` → Task 1 paths. ✓
- Tests (classifier + ScanView render incl. negative + no-Resolve) → Task 1 test, Task 2 test. ✓
- Edge case `capability-gap` `tokenIds: []` renders → Task 2 first test iterates `capability-gap` (fixture token list is irrelevant to the badge; badge keys off `kind`). ✓
- Invariant by-design ∩ heuristic-extendable = ∅ → Task 2 third test asserts no Resolve button for a by-design issue. ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows full content. ✓

**Type consistency:** `isByDesign(issue: ScanIssue): boolean` and `BY_DESIGN_KINDS: ReadonlySet<string>` are defined in Task 1 and referenced identically in Task 1 tests and Task 2 (import + template). `data-testid` values (`by-design`, `resolve-issue`, `resolve-done`, `typo-hint`) match the existing ScanView template. ✓
