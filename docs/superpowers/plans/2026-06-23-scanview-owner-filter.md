# ScanView Owner Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second "Owner:" chip row to the Scan view's Issues tab that filters issues by their (Y) owner (Heuristic / Data-Quality / by-design / Figma-Fix / Manual-Dev / Other), combined via AND with the existing severity filter.

**Architecture:** A new `src/app/resolve/owner-of.ts` aggregator maps an issue to its single owner via the disjoint owner kind-sets (`ownerOf(issue): Owner | null`) and exposes an ordered `OWNER_FILTERS` chip registry. `ScanView.vue` gains an `ownerFilter` ref, an `ownerCounts` computed, an extended `filteredIssues`, and a second chip row mirroring the severity row. No badge refactor, no scanner change.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-23-scanview-owner-filter-design.md`

---

## File Structure

- **Create** `src/app/resolve/owner-of.ts` — `ownerOf(issue)` + `Owner`/`OwnerFilter` types + `OWNER_FILTERS` registry.
- **Create** `src/app/resolve/owner-of.test.ts` — aggregator unit tests.
- **Modify** `src/app/resolve/heuristic-extendable.ts` — `export` the `HEURISTIC_EXTENDABLE_KINDS` set (currently module-private).
- **Modify** `src/app/components/ScanView.vue` — owner filter state, counts, combined filtering, second chip row.
- **Create** `src/app/components/ScanView.ownerfilter.test.ts` — owner filter mount tests.

---

## Task 1: `ownerOf` aggregator + owner registry

**Files:**
- Create: `src/app/resolve/owner-of.ts`, `src/app/resolve/owner-of.test.ts`
- Modify: `src/app/resolve/heuristic-extendable.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/resolve/owner-of.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ownerOf, OWNER_FILTERS } from "./owner-of.js";
import type { ScanIssue } from "@core/token-graph.js";

const issue = (kind: string): ScanIssue => ({
  id: `x-${kind}`,
  category: "classification-hint",
  severity: "warning",
  kind,
  message: "",
  tokenIds: [],
});

describe("ownerOf", () => {
  it("maps each owner's kind to that owner", () => {
    expect(ownerOf(issue("unsupported-part"))).toBe("heuristic");
    expect(ownerOf(issue("possible-typo"))).toBe("data-quality");
    expect(ownerOf(issue("capability-gap"))).toBe("by-design");
    expect(ownerOf(issue("asymmetric-variant-coverage"))).toBe("figma-fix");
    expect(ownerOf(issue("custom-without-parts"))).toBe("manual-dev");
  });

  it("returns null for an un-owned kind", () => {
    expect(ownerOf(issue("snap-to-tailwind"))).toBe(null);
    expect(ownerOf(issue("mode-invariant-semantic"))).toBe(null);
  });
});

describe("OWNER_FILTERS", () => {
  it("lists all, the five owners, then other, in order", () => {
    expect(OWNER_FILTERS.map((f) => f.value)).toEqual([
      "all", "heuristic", "data-quality", "by-design", "figma-fix", "manual-dev", "other",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/resolve/owner-of.test.ts`
Expected: FAIL — cannot resolve module `./owner-of.js` (and/or `HEURISTIC_EXTENDABLE_KINDS` not exported).

- [ ] **Step 3: Export the heuristic kind-set**

In `src/app/resolve/heuristic-extendable.ts`, add `export` to the `HEURISTIC_EXTENDABLE_KINDS` declaration. Change:

```ts
const HEURISTIC_EXTENDABLE_KINDS: ReadonlySet<string> = new Set([
```

to:

```ts
export const HEURISTIC_EXTENDABLE_KINDS: ReadonlySet<string> = new Set([
```

(Nothing else in the file changes. The set still has `"unsupported-part"`, `"component-looks-custom"`.)

- [ ] **Step 4: Create the aggregator**

Create `src/app/resolve/owner-of.ts`:

```ts
import type { ScanIssue } from "@core/token-graph.js";
import { BY_DESIGN_KINDS } from "./by-design.js";
import { FIGMA_FIX_KINDS } from "./figma-fix.js";
import { MANUAL_DEV_KINDS } from "./manual-dev.js";
import { HEURISTIC_EXTENDABLE_KINDS } from "./heuristic-extendable.js";

export type Owner =
  | "heuristic"
  | "data-quality"
  | "by-design"
  | "figma-fix"
  | "manual-dev";

// The Data-Quality owner has no classifier module — it keys off this one kind.
const DATA_QUALITY_KINDS: ReadonlySet<string> = new Set(["possible-typo"]);

// Owner kind-sets are disjoint (verified across all five owners), so the first
// matching set is the unique owner. owner-of.ts imports the owner modules for their
// sets; those modules import only owners.ts (the factory), never owner-of.ts — no cycle.
const OWNER_KINDS: ReadonlyArray<readonly [Owner, ReadonlySet<string>]> = [
  ["heuristic", HEURISTIC_EXTENDABLE_KINDS],
  ["data-quality", DATA_QUALITY_KINDS],
  ["by-design", BY_DESIGN_KINDS],
  ["figma-fix", FIGMA_FIX_KINDS],
  ["manual-dev", MANUAL_DEV_KINDS],
];

/** The (Y) owner that claims this issue's kind, or null when no owner does ("Other"). */
export function ownerOf(issue: ScanIssue): Owner | null {
  for (const [owner, kinds] of OWNER_KINDS) {
    if (kinds.has(issue.kind)) return owner;
  }
  return null;
}

export type OwnerFilter = Owner | "all" | "other";

export const OWNER_FILTERS: ReadonlyArray<{ value: OwnerFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "heuristic", label: "Heuristic" },
  { value: "data-quality", label: "Data-Quality" },
  { value: "by-design", label: "by-design" },
  { value: "figma-fix", label: "Figma-Fix" },
  { value: "manual-dev", label: "Manual-Dev" },
  { value: "other", label: "Other" },
];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/resolve/owner-of.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Run the regression guard + full suite + typecheck**

Run: `npx vitest run src/app/resolve/heuristic-extendable.test.ts` (confirms the added export didn't break it), then `npx vitest run` and `npm run typecheck`.
Expected: all green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/resolve/owner-of.ts src/app/resolve/owner-of.test.ts src/app/resolve/heuristic-extendable.ts
git commit -m "feat(resolve): ownerOf aggregator + OWNER_FILTERS registry"
```

(The pre-commit hook runs vue-tsc + the full vitest suite and can flake transiently ~13s — just re-run the commit if it dies early.)

---

## Task 2: ScanView owner filter chip row

**Files:**
- Modify: `src/app/components/ScanView.vue`
- Test: `src/app/components/ScanView.ownerfilter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ScanView.ownerfilter.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

const mk = (kind: string, message: string, severity: ScanIssue["severity"] = "warning"): ScanIssue => ({
  id: message,
  category: "classification-hint",
  severity,
  kind,
  message,
  tokenIds: [],
  componentName: "button",
});

function report(issues: ScanIssue[]): ScanReport {
  return {
    issues,
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

const ISSUES: ScanIssue[] = [
  mk("capability-gap", "MSGBYDESIGN"),
  mk("asymmetric-variant-coverage", "MSGFIGMA"),
  mk("custom-without-parts", "MSGMANUAL"),
  mk("snap-to-tailwind", "MSGOTHER", "hint"),
  mk("capability-gap", "MSGBYDESIGNHINT", "hint"),
];

function ownerChip(wrapper: ReturnType<typeof mount>, label: string) {
  return wrapper.find("[data-testid=owner-filter]").findAll("button").find((b) => b.text().includes(label));
}

describe("ScanView owner filter", () => {
  it("renders an owner filter chip row with all seven chips", () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    const row = w.find("[data-testid=owner-filter]");
    expect(row.exists()).toBe(true);
    expect(row.findAll("button").length).toBe(7);
  });

  it("shows all issues by default", () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    const t = w.text();
    expect(t).toContain("MSGBYDESIGN");
    expect(t).toContain("MSGFIGMA");
    expect(t).toContain("MSGMANUAL");
    expect(t).toContain("MSGOTHER");
  });

  it("filters to a single owner when its chip is clicked", async () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    await ownerChip(w, "Figma-Fix")!.trigger("click");
    const t = w.text();
    expect(t).toContain("MSGFIGMA");
    expect(t).not.toContain("MSGBYDESIGN");
    expect(t).not.toContain("MSGMANUAL");
  });

  it("the Other chip shows only un-owned issues", async () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    await ownerChip(w, "Other")!.trigger("click");
    const t = w.text();
    expect(t).toContain("MSGOTHER");
    expect(t).not.toContain("MSGFIGMA");
  });

  it("combines the owner filter with the severity filter (AND)", async () => {
    const w = mount(ScanView, { props: { report: report(ISSUES) }, global: { stubs } });
    await ownerChip(w, "by-design")!.trigger("click");
    // both by-design issues visible under owner filter alone
    expect(w.text()).toContain("MSGBYDESIGNHINT");
    // now also pick severity = Warnings → the hint-severity by-design issue drops out
    const sevWarn = w.findAll("button").find((b) => b.text().includes("Warnings"));
    await sevWarn!.trigger("click");
    const t = w.text();
    expect(t).toContain("MSGBYDESIGN");        // warning by-design stays
    expect(t).not.toContain("MSGBYDESIGNHINT"); // hint by-design filtered out
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ScanView.ownerfilter.test.ts`
Expected: FAIL — `[data-testid=owner-filter]` not found.

- [ ] **Step 3: Add imports + owner state to ScanView.vue**

In `src/app/components/ScanView.vue`, add the import after the existing `manual-dev` import (the line `import { isManualDev } from "../resolve/manual-dev.js";`):

```ts
import { ownerOf, OWNER_FILTERS, type OwnerFilter } from "../resolve/owner-of.js";
```

Then add the owner-filter ref directly after the existing `const severityFilter = ref<SeverityFilter>("all");` line:

```ts
const ownerFilter = ref<OwnerFilter>("all");
```

- [ ] **Step 4: Add the `ownerCounts` computed**

In `src/app/components/ScanView.vue`, add this immediately after the existing `counts` computed (the block that ends `  return c;\n});`):

```ts
const ownerCounts = computed(() => {
  const c: Record<string, number> = {
    all: props.report.issues.length,
    heuristic: 0,
    "data-quality": 0,
    "by-design": 0,
    "figma-fix": 0,
    "manual-dev": 0,
    other: 0,
  };
  for (const i of props.report.issues) c[ownerOf(i) ?? "other"] += 1;
  return c;
});
```

- [ ] **Step 5: Extend `filteredIssues` to AND the owner filter**

In `src/app/components/ScanView.vue`, replace the existing `filteredIssues` computed:

```ts
const filteredIssues = computed(() =>
  severityFilter.value === "all"
    ? props.report.issues
    : props.report.issues.filter((i) => i.severity === severityFilter.value),
);
```

with:

```ts
const filteredIssues = computed(() =>
  props.report.issues.filter(
    (i) =>
      (severityFilter.value === "all" || i.severity === severityFilter.value) &&
      (ownerFilter.value === "all" || (ownerOf(i) ?? "other") === ownerFilter.value),
  ),
);
```

- [ ] **Step 6: Add the owner chip row to the template**

In `src/app/components/ScanView.vue`, add the owner chip row immediately AFTER the closing `</div>` of the existing severity chip row (the `<div class="flex flex-wrap gap-1">` whose `v-for` is over `SEVERITY_FILTERS`), and BEFORE the `<p v-if="filteredIssues.length === 0" …>` empty-state paragraph:

```html
      <div class="flex flex-wrap gap-1" data-testid="owner-filter">
        <button
          v-for="f in OWNER_FILTERS"
          :key="f.value"
          type="button"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
          :class="ownerFilter === f.value
            ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
            : 'bg-transparent text-zinc-700 border-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800'"
          @click="ownerFilter = f.value"
        >
          <span>{{ f.label }}</span>
          <span class="text-[10px] font-mono opacity-70">{{ ownerCounts[f.value] }}</span>
        </button>
      </div>
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ScanView.ownerfilter.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 8: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all tests green; typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.ownerfilter.test.ts
git commit -m "feat(resolve): ScanView owner filter chip row"
```

---

## Self-Review

**Spec coverage:**
- `ownerOf(issue): Owner | null` aggregator over disjoint sets → Task 1 Step 4. ✓
- `OWNER_FILTERS` ordered registry (all + 5 owners + other) → Task 1 Step 4 + test. ✓
- Export `HEURISTIC_EXTENDABLE_KINDS` (regression-guarded) → Task 1 Steps 3, 6. ✓
- Second chip row mirroring severity, `data-testid="owner-filter"`, counts → Task 2 Step 6. ✓
- `ownerFilter` ref + `ownerCounts` totals + combined AND filtering → Task 2 Steps 3–5. ✓
- "Other" = un-owned issues → Task 1 (`ownerOf` returns null) + Task 2 (`ownerOf(i) ?? "other"`); test "Other chip" + "un-owned kind". ✓
- Combined severity AND owner → Task 2 test "combines… (AND)". ✓
- Non-goals (no badge refactor, no persistence, totals counts) → no badge code touched; `ownerFilter` is a local ref; `ownerCounts` counts all issues. ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows full content, including the exact `filteredIssues` before/after. ✓

**Type consistency:** `Owner` / `OwnerFilter` / `ownerOf` / `OWNER_FILTERS` defined in Task 1 are imported and used identically in Task 2 (`ref<OwnerFilter>`, `ownerOf(i) ?? "other"`, `v-for="f in OWNER_FILTERS"`, `ownerCounts[f.value]`). `data-testid="owner-filter"` matches the Task 2 test selector. The `ownerCounts` record keys exactly match the `OwnerFilter` values (`all` + 5 owners + `other`). ✓
