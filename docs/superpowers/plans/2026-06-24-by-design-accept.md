# by-design owner v2 — accept/dismiss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user Accept (toggle) a by-design scan issue as acknowledged/expected, which subtracts it from the header issue count — an issue-id-keyed, in-session, presentation-only state parallel to (and orthogonal to) the Heuristic resolve flow.

**Architecture:** A pure `acceptedByDesignIds(report, accepted)` helper (mirrors `resolvedIssueIds`). `App.vue` holds an in-session `acceptedIds` ref + a toggle handler, passing `:accepted` to ScanView (affordance) and HeaderStatusStrip (count). HeaderStatusStrip subtracts `resolved ∪ accepted`. ScanView shows an Accept button / ✓ accepted on by-design issues. No scanner/engine/export change; not `provide`d (accept doesn't feed the recipe engine).

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-24-by-design-accept-design.md`

---

## File Structure

- **Create** `src/app/resolve/accepted-issues.ts` — `acceptedByDesignIds(report, accepted)` (+ test).
- **Modify** `src/app/components/HeaderStatusStrip.vue` — `accepted` prop + subtract from counts (+ test).
- **Modify** `src/app/components/ScanView.vue` — `accepted` prop + `accept` emit + Accept affordance (+ test).
- **Modify** `src/app/App.vue` — `acceptedIds` ref + `onToggleAccept` + wire `:accepted` / `@accept`.

---

## Task 1: `acceptedByDesignIds` helper

**Files:**
- Create: `src/app/resolve/accepted-issues.ts`, `src/app/resolve/accepted-issues.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/resolve/accepted-issues.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { acceptedByDesignIds } from "./accepted-issues.js";
import type { ScanIssue, ScanReport } from "@core/token-graph.js";

const issue = (id: string, kind: string): ScanIssue => ({
  id, category: "classification-hint", severity: "warning", kind, message: "", tokenIds: [],
});
const report = (issues: ScanIssue[]): ScanReport => ({
  issues,
  completeness: [],
  forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
  generatedAt: 0,
} as ScanReport);

describe("acceptedByDesignIds", () => {
  it("returns by-design issue ids that are in the accepted set", () => {
    const r = report([issue("a", "capability-gap"), issue("b", "state-via-prop")]);
    expect([...acceptedByDesignIds(r, new Set(["a"]))]).toEqual(["a"]);
  });

  it("excludes a non-by-design id even if it is in the accepted set", () => {
    const r = report([issue("x", "asymmetric-variant-coverage")]); // figma-fix, not by-design
    expect(acceptedByDesignIds(r, new Set(["x"])).size).toBe(0);
  });

  it("is empty for an empty accepted set", () => {
    const r = report([issue("a", "capability-gap")]);
    expect(acceptedByDesignIds(r, new Set<string>()).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/resolve/accepted-issues.test.ts`
Expected: FAIL — cannot resolve module `./accepted-issues.js`.

- [ ] **Step 3: Create the helper**

Create `src/app/resolve/accepted-issues.ts`:

```ts
import type { ScanReport } from "@core/token-graph.js";
import { ownerOf } from "./owner-of.js";

/**
 * Issue ids the user has accepted as by-design (acknowledged, not a problem). Only
 * by-design issues can be accepted — a defensive guard, since only they expose the
 * Accept affordance. The single source of truth for "this deviation is accepted".
 */
export function acceptedByDesignIds(
  report: ScanReport,
  accepted: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const issue of report.issues) {
    if (ownerOf(issue) === "by-design" && accepted.has(issue.id)) out.add(issue.id);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/resolve/accepted-issues.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/resolve/accepted-issues.ts src/app/resolve/accepted-issues.test.ts
git commit -m "feat(resolve): acceptedByDesignIds helper"
```

(The pre-commit hook runs vue-tsc + the full vitest suite and can flake transiently ~13s — re-run the same commit if it dies early.)

---

## Task 2: HeaderStatusStrip subtracts accepted

**Files:**
- Modify: `src/app/components/HeaderStatusStrip.vue`
- Test: `src/app/components/HeaderStatusStrip.accept.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/HeaderStatusStrip.accept.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import HeaderStatusStrip from "./HeaderStatusStrip.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

const issue = (id: string, kind: string, severity: ScanIssue["severity"]): ScanIssue => ({
  id, category: "classification-hint", severity, kind, message: id, tokenIds: [],
});
function report(issues: ScanIssue[]): ScanReport {
  return {
    issues,
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const issues = [issue("w1", "capability-gap", "warning"), issue("w2", "asymmetric-variant-coverage", "warning")];

describe("HeaderStatusStrip accept subtraction", () => {
  it("counts all warnings when nothing is accepted", () => {
    const w = mount(HeaderStatusStrip, { props: { report: report(issues), scanViewActive: false } });
    expect(w.text()).toContain("2 warnings");
  });

  it("subtracts an accepted by-design issue from the warning count", () => {
    const w = mount(HeaderStatusStrip, { props: { report: report(issues), scanViewActive: false, accepted: new Set(["w1"]) } });
    expect(w.text()).toContain("1 warnings");
    expect(w.text()).not.toContain("2 warnings");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/HeaderStatusStrip.accept.test.ts`
Expected: FAIL — the second test still shows "2 warnings" (accepted not yet subtracted).

- [ ] **Step 3: Add the import + prop + computed**

In `src/app/components/HeaderStatusStrip.vue`:

Add the import after the existing `resolved-issues` import (line 4 `import { resolvedIssueIds } from "../resolve/resolved-issues.js";`):

```ts
import { acceptedByDesignIds } from "../resolve/accepted-issues.js";
```

Add the prop to the `Props` interface (after `resolved?: ReadonlySet<string>;`):

```ts
interface Props {
  report: ScanReport;
  scanViewActive: boolean;
  resolved?: ReadonlySet<string>;
  accepted?: ReadonlySet<string>;
}
```

Add the computed after the existing `resolvedIds` computed (lines 18–20):

```ts
const acceptedIds = computed(() =>
  acceptedByDesignIds(props.report, props.accepted ?? new Set<string>()),
);
```

- [ ] **Step 4: Subtract accepted from each count**

In `src/app/components/HeaderStatusStrip.vue`, replace the three count computeds:

```ts
const errorCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "error" && !resolvedIds.value.has(i.id)).length,
);
const warningCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "warning" && !resolvedIds.value.has(i.id)).length,
);
const hintCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "hint" && !resolvedIds.value.has(i.id)).length,
);
```

with:

```ts
const errorCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "error" && !resolvedIds.value.has(i.id) && !acceptedIds.value.has(i.id)).length,
);
const warningCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "warning" && !resolvedIds.value.has(i.id) && !acceptedIds.value.has(i.id)).length,
);
const hintCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "hint" && !resolvedIds.value.has(i.id) && !acceptedIds.value.has(i.id)).length,
);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/components/HeaderStatusStrip.accept.test.ts`
Expected: PASS — 2 tests green.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/HeaderStatusStrip.vue src/app/components/HeaderStatusStrip.accept.test.ts
git commit -m "feat(resolve): HeaderStatusStrip subtracts accepted by-design issues"
```

---

## Task 3: ScanView Accept affordance

**Files:**
- Modify: `src/app/components/ScanView.vue`
- Test: `src/app/components/ScanView.accept.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ScanView.accept.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{ id: "i1", category: "classification-hint", severity: "warning", kind: "capability-gap", message: "m", tokenIds: [], componentName: "alert", ...issue }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView accept (by-design)", () => {
  it("renders an Accept button for a by-design issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    expect(w.find("[data-testid=accept-issue]").exists()).toBe(true);
  });

  it("emits accept with the issue id on click", async () => {
    const w = mount(ScanView, { props: { report: reportWith({}) }, global: { stubs } });
    await w.get("[data-testid=accept-issue]").trigger("click");
    expect(w.emitted("accept")?.[0]).toEqual(["i1"]);
  });

  it("shows ✓ accepted (not the Accept button) when the id is in the accepted prop", () => {
    const w = mount(ScanView, { props: { report: reportWith({}), accepted: new Set(["i1"]) }, global: { stubs } });
    expect(w.find("[data-testid=accept-done]").exists()).toBe(true);
    expect(w.find("[data-testid=accept-issue]").exists()).toBe(false);
  });

  it("renders no Accept affordance for a non-by-design issue", () => {
    const w = mount(ScanView, { props: { report: reportWith({ kind: "asymmetric-variant-coverage" }) }, global: { stubs } });
    expect(w.find("[data-testid=accept-issue]").exists()).toBe(false);
    expect(w.find("[data-testid=accept-done]").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ScanView.accept.test.ts`
Expected: FAIL — `[data-testid=accept-issue]` not found.

- [ ] **Step 3: Add the `accepted` prop + `accept` emit + helper**

In `src/app/components/ScanView.vue`, change the `Props`/`Emits`/`withDefaults` (lines 10–15):

```ts
interface Props { report: ScanReport; resolved?: ReadonlySet<string>; accepted?: ReadonlySet<string>; }
interface Emits {
  (event: "select-tokens", tokenIds: readonly string[]): void;
  (event: "resolve", tokenId: string): void;
  (event: "accept", issueId: string): void;
}
const props = withDefaults(defineProps<Props>(), { resolved: () => new Set<string>(), accepted: () => new Set<string>() });
```

Then add this helper next to the existing `issueResolved` function (after the `issueResolved` definition):

```ts
function issueAccepted(issue: ScanIssue): boolean {
  return props.accepted.has(issue.id);
}
```

- [ ] **Step 4: Add the Accept affordance to the template**

In `src/app/components/ScanView.vue`, inside the right-side affordance `<div class="shrink-0 flex items-center gap-1">`, add these two sibling conditionals immediately AFTER the figma-fix-copy `<button>` (the one ending `</button>` with `data-testid="figma-fix-copy"`), and BEFORE the div's closing `</div>`:

```html
              <button
                v-if="ownerOf(issue) === 'by-design' && !issueAccepted(issue)"
                type="button"
                class="ml-2 text-[10px] underline text-zinc-500 dark:text-zinc-400"
                data-testid="accept-issue"
                @click.stop="$emit('accept', issue.id)"
              >Accept</button>
              <span
                v-else-if="ownerOf(issue) === 'by-design' && issueAccepted(issue)"
                class="ml-2 text-[10px] underline cursor-pointer text-teal-600 dark:text-teal-400"
                data-testid="accept-done"
                @click.stop="$emit('accept', issue.id)"
              >✓ accepted</span>
```

(Teal distinguishes "✓ accepted" from the emerald "✓ resolved". Both states emit the same `accept` event — clicking ✓ accepted toggles it back off.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ScanView.accept.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.accept.test.ts
git commit -m "feat(resolve): ScanView Accept toggle for by-design issues"
```

---

## Task 4: App.vue wiring

**Files:**
- Modify: `src/app/App.vue`

This task wires the in-session state to the two components. It adds no new test; its verification is `npm run typecheck` + the full suite (the component + helper tests already prove the behavior). First read App.vue around the anchor lines to place edits precisely.

- [ ] **Step 1: Add the `acceptedIds` ref**

In `src/app/App.vue`, add this line immediately AFTER the existing `resolvedTokenIds` computed (the line `const resolvedTokenIds = computed<Set<string>>(() => new Set(Object.keys(resolveOverride.value)));`):

```ts
const acceptedIds = ref<Set<string>>(new Set());
```

(`ref` is already imported in App.vue. Unlike `resolveOverride`, `acceptedIds` is NOT `provide`d — it does not feed the recipe engine.)

- [ ] **Step 2: Add the toggle handler**

In `src/app/App.vue`, add this function immediately AFTER the existing `onResolve` function (the line `function onResolve(tokenId: string): void { activeResolve.value = tokenId; }`):

```ts
function onToggleAccept(issueId: string): void {
  const next = new Set(acceptedIds.value);
  if (next.has(issueId)) next.delete(issueId);
  else next.add(issueId);
  acceptedIds.value = next;
}
```

- [ ] **Step 3: Wire `:accepted` to HeaderStatusStrip**

In `src/app/App.vue`, the `<HeaderStatusStrip>` element has `:resolved="resolvedTokenIds"`. Add `:accepted="acceptedIds"` immediately after that line, within the same element.

- [ ] **Step 4: Wire `:accepted` + `@accept` to ScanView**

In `src/app/App.vue`, the `<ScanView>` element has `:resolved="resolvedTokenIds"` and `@resolve="onResolve"`. Add `:accepted="acceptedIds"` after its `:resolved` line and `@accept="onToggleAccept"` after its `@resolve` line, within the same element. (Both `<HeaderStatusStrip>` and `<ScanView>` carry `:resolved="resolvedTokenIds"`; make sure you add `:accepted` to BOTH elements, and `@accept` only to `<ScanView>`.)

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all green; typecheck clean (confirms the prop/emit contract matches ScanView + HeaderStatusStrip).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(resolve): wire by-design accept toggle (App acceptedIds → ScanView + header)"
```

---

## Self-Review

**Spec coverage:**
- `acceptedByDesignIds` helper (by-design guard, id-keyed) → Task 1. ✓
- In-session `acceptedIds` ref + toggle handler, not `provide`d → Task 4 Steps 1–2. ✓
- HeaderStatusStrip subtracts `resolved ∪ accepted` → Task 2 Steps 3–4. ✓
- ScanView Accept button / ✓ accepted toggle on by-design issues, `accept` emit → Task 3 Steps 3–4. ✓
- Wiring `:accepted` to both components + `@accept` to ScanView → Task 4 Steps 3–4. ✓
- Issue-id-keyed (capability-gap with empty tokenIds works) → Task 1 keys by `issue.id`; Task 3 test fixture uses `capability-gap` with `tokenIds: []`. ✓
- Orthogonal to resolved (no double-count) → by-design issues never in resolvedIssueIds; counts AND both exclusions. ✓
- Non-goals (by-design only, in-session, no hide, no scanner/engine change) → helper guards by-design; ref resets on reload; accepted issues stay in list; only the 4 files touched. ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows full content. The only non-literal edits are Task 4 Steps 3–4 (prop additions to existing elements) — described precisely with the `:resolved`-disambiguation note, since `:resolved="resolvedTokenIds"` is not unique. ✓

**Type consistency:** `acceptedByDesignIds(report, accepted: ReadonlySet<string>): Set<string>` (Task 1) is consumed in HeaderStatusStrip (Task 2) and the App ref is `ref<Set<string>>` (Task 4). ScanView `accepted?: ReadonlySet<string>` + `accept` emit (Task 3) match App's `:accepted="acceptedIds"` + `@accept="onToggleAccept"` (Task 4). `data-testid` values (`accept-issue`, `accept-done`) match the Task 3 test. The `onToggleAccept(issueId: string)` signature matches ScanView's `accept` emit payload (`issue.id`). ✓
