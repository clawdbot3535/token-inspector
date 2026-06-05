# Scan view rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `ScanView.vue` into Issues / Readiness / Forecast tabs, with the Issues tab offering a severity filter and grouping by component (technical category labels dropped).

**Architecture:** A pure `groupIssuesByComponent` helper (unit-tested) plus a rewritten `ScanView.vue` holding internal tab/filter/collapse state. `ScanView`'s `report` prop and `select-tokens` emit are unchanged, so `App.vue` is untouched.

**Tech Stack:** TypeScript, Vue 3, Vitest, `@vue/test-utils` + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-05-scan-view-rework-design.md`

**Branch:** `feat/ui-scan-rework`. Commit per task. Do not push.

---

## File Structure

- `src/app/scan-grouping.ts` — **create**: pure `groupIssuesByComponent(issues)` + `ComponentGroup` type.
- `src/app/scan-grouping.test.ts` — **create**: unit tests.
- `src/app/components/ScanView.vue` — **rewrite**: tabs + severity filter + component grouping.
- `src/app/components/ScanView.test.ts` — **create**: mount test.

`ScanIssue = { id, category, severity, kind, message, tokenIds, componentName?, variantKey? }`. `ScanReport = { issues, completeness, forecast, generatedAt }`.

---

## Task 1: `groupIssuesByComponent` pure helper + tests

**Files:** `src/app/scan-grouping.ts`, `src/app/scan-grouping.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/scan-grouping.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { groupIssuesByComponent } from "./scan-grouping.js";
import type { ScanIssue } from "@core/token-graph.js";

function issue(opts: Partial<ScanIssue> & { id: string }): ScanIssue {
  return {
    id: opts.id,
    category: opts.category ?? "data-quality",
    severity: opts.severity ?? "warning",
    kind: opts.kind ?? "test",
    message: opts.message ?? "msg",
    tokenIds: opts.tokenIds ?? [],
    componentName: opts.componentName,
    variantKey: opts.variantKey,
  };
}

describe("groupIssuesByComponent", () => {
  it("groups by componentName, named alphabetically, General last", () => {
    const groups = groupIssuesByComponent([
      issue({ id: "1", componentName: "input" }),
      issue({ id: "2", componentName: "badge" }),
      issue({ id: "3" }), // no component → General
      issue({ id: "4", componentName: "input" }),
    ]);
    expect(groups.map((g) => g.component)).toEqual(["badge", "input", "General"]);
    expect(groups.find((g) => g.component === "input")!.issues.map((i) => i.id)).toEqual(["1", "4"]);
  });

  it("omits the General group when every issue has a component", () => {
    const groups = groupIssuesByComponent([
      issue({ id: "1", componentName: "button" }),
    ]);
    expect(groups.map((g) => g.component)).toEqual(["button"]);
  });

  it("preserves issue order within a group", () => {
    const groups = groupIssuesByComponent([
      issue({ id: "a", componentName: "x" }),
      issue({ id: "b", componentName: "x" }),
      issue({ id: "c", componentName: "x" }),
    ]);
    expect(groups[0]!.issues.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("returns [] for no issues", () => {
    expect(groupIssuesByComponent([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/scan-grouping.test.ts`
Expected: FAIL — `scan-grouping.js` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/app/scan-grouping.ts`:

```typescript
import type { ScanIssue } from "@core/token-graph.js";

export interface ComponentGroup {
  /** Component name, or "General" for issues without a componentName. */
  component: string;
  issues: ScanIssue[];
}

const GENERAL = "General";

/**
 * Group scan issues by `componentName`. Named components come first
 * (alphabetical); the `General` bucket (issues with no component) comes last.
 * Empty groups cannot occur (each group is created from at least one issue).
 */
export function groupIssuesByComponent(issues: readonly ScanIssue[]): ComponentGroup[] {
  const map = new Map<string, ScanIssue[]>();
  for (const i of issues) {
    const key = i.componentName ?? GENERAL;
    const arr = map.get(key) ?? [];
    arr.push(i);
    map.set(key, arr);
  }
  const named = [...map.keys()].filter((k) => k !== GENERAL).sort((a, b) => a.localeCompare(b));
  const order = map.has(GENERAL) ? [...named, GENERAL] : named;
  return order.map((component) => ({ component, issues: map.get(component)! }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/scan-grouping.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/scan-grouping.ts src/app/scan-grouping.test.ts
git commit -m "feat(scan): groupIssuesByComponent helper (named first, General last)"
```

---

## Task 2: Rewrite ScanView.vue + mount test

**Files:** `src/app/components/ScanView.vue`, `src/app/components/ScanView.test.ts`

- [ ] **Step 1: Write the failing mount test**

Create `src/app/components/ScanView.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";
import ScanView from "./ScanView.vue";

function issue(o: Partial<ScanIssue> & { id: string }): ScanIssue {
  return {
    id: o.id, category: o.category ?? "data-quality", severity: o.severity ?? "warning",
    kind: o.kind ?? "k", message: o.message ?? "msg", tokenIds: o.tokenIds ?? [],
    componentName: o.componentName, variantKey: o.variantKey,
  };
}
function report(issues: ScanIssue[]): ScanReport {
  return {
    issues,
    completeness: [
      { component: "button", axis: "size", variantKey: "md", defined: 3, total: 4, missingUtilities: ["gap"] },
    ],
    forecast: {
      tokensCss: { estimatedBytes: 1200, tailwindMatches: 52, themeExtensions: 10, modeVariantEntries: 44 },
      components: [],
      unmappedComponentPrefixes: [],
    },
    generatedAt: 0,
  };
}

describe("ScanView", () => {
  const base = [
    issue({ id: "1", componentName: "button", severity: "warning", message: "button warn" }),
    issue({ id: "2", componentName: "badge", severity: "hint", message: "badge hint" }),
    issue({ id: "3", severity: "warning", message: "general warn", tokenIds: ["x-y"] }),
  ];

  it("defaults to the Issues tab with a total count and groups by component", () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    expect(w.text()).toContain("Issues");
    expect(w.text()).toContain("· 3");
    // groups: badge, button, General (order from helper)
    const text = w.text();
    expect(text).toContain("button");
    expect(text).toContain("badge");
    expect(text).toContain("General");
  });

  it("filters by severity (Hints hides warning-only components)", async () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    const hintBtn = w.findAll("button").find((b) => b.text().startsWith("Hints"));
    await hintBtn!.trigger("click");
    expect(w.text()).toContain("badge hint");
    expect(w.text()).not.toContain("button warn");
  });

  it("emits select-tokens when a row with tokenIds is clicked", async () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    const row = w.findAll("li").find((li) => li.text().includes("general warn"));
    await row!.trigger("click");
    expect(w.emitted("select-tokens")?.[0]).toEqual([["x-y"]]);
  });

  it("switches to the Readiness and Forecast tabs", async () => {
    const w = mount(ScanView, { props: { report: report(base) } });
    const readiness = w.findAll("button").find((b) => b.text().startsWith("Readiness"));
    await readiness!.trigger("click");
    expect(w.text()).toContain("button"); // completeness row
    expect(w.text()).toContain("3/4");
    const forecast = w.findAll("button").find((b) => b.text().startsWith("Forecast"));
    await forecast!.trigger("click");
    expect(w.text()).toContain("Tailwind matches");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/components/ScanView.test.ts`
Expected: FAIL — the current `ScanView` has no tabs/severity filter/component grouping (assertions for `· 3`, `General`, tab switching fail).

- [ ] **Step 3: Rewrite `ScanView.vue`**

First READ the current `src/app/components/ScanView.vue` — you will MOVE its component-readiness `<table>` (the `<div v-if="report.completeness.length > 0">…</table></div>` block) and its forecast block (`<div class="text-xs …">Forecast: …</div>`) verbatim into the new Readiness/Forecast tabs. Then replace the whole file with:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";
import { groupIssuesByComponent } from "../scan-grouping.js";

interface Props { report: ScanReport; }
interface Emits { (event: "select-tokens", tokenIds: readonly string[]): void; }
const props = defineProps<Props>();
const emit = defineEmits<Emits>();

type Tab = "issues" | "readiness" | "forecast";
type SeverityFilter = "all" | "error" | "warning" | "hint";

const activeTab = ref<Tab>("issues");
const severityFilter = ref<SeverityFilter>("all");
// Component groups open by default; this holds the collapsed ones.
const collapsedGroups = ref<ReadonlySet<string>>(new Set());

function toggleGroup(component: string): void {
  const next = new Set(collapsedGroups.value);
  if (next.has(component)) next.delete(component);
  else next.add(component);
  collapsedGroups.value = next;
}

const counts = computed(() => {
  const c = { all: 0, error: 0, warning: 0, hint: 0 };
  for (const i of props.report.issues) {
    c.all += 1;
    if (i.severity === "error") c.error += 1;
    else if (i.severity === "warning") c.warning += 1;
    else if (i.severity === "hint") c.hint += 1;
  }
  return c;
});

const filteredIssues = computed(() =>
  severityFilter.value === "all"
    ? props.report.issues
    : props.report.issues.filter((i) => i.severity === severityFilter.value),
);

const groups = computed(() => groupIssuesByComponent(filteredIssues.value));

const severityTagClass = (sev: string): string =>
  ({
    error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    hint: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  })[sev] ?? "";

function onIssueClick(issue: ScanIssue): void {
  if (issue.tokenIds.length > 0) emit("select-tokens", issue.tokenIds);
}

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "issues", label: "Issues" },
  { value: "readiness", label: "Readiness" },
  { value: "forecast", label: "Forecast" },
];
const SEVERITY_FILTERS: ReadonlyArray<{ value: SeverityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "warning", label: "Warnings" },
  { value: "hint", label: "Hints" },
];
</script>

<template>
  <div class="flex flex-col">
    <!-- Tab bar -->
    <div class="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 px-3 pt-2">
      <button
        v-for="t in TABS"
        :key="t.value"
        type="button"
        class="px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors select-none"
        :class="activeTab === t.value
          ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-semibold'
          : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'"
        @click="activeTab = t.value"
      >
        {{ t.label }}<span v-if="t.value === 'issues'" class="ml-1 font-mono">· {{ counts.all }}</span>
      </button>
    </div>

    <!-- Issues tab -->
    <div v-if="activeTab === 'issues'" class="p-3 space-y-3">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="f in SEVERITY_FILTERS"
          :key="f.value"
          type="button"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
          :class="severityFilter === f.value
            ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
            : 'bg-transparent text-zinc-700 border-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800'"
          @click="severityFilter = f.value"
        >
          <span>{{ f.label }}</span>
          <span class="text-[10px] font-mono opacity-70">{{ counts[f.value] }}</span>
        </button>
      </div>

      <p v-if="filteredIssues.length === 0" class="text-xs text-zinc-400">
        No {{ severityFilter === 'all' ? '' : severityFilter + ' ' }}issues.
      </p>

      <div v-for="group in groups" :key="group.component" class="space-y-1">
        <button
          type="button"
          class="w-full flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-elevated rounded px-1 py-0.5 select-none"
          @click="toggleGroup(group.component)"
        >
          <span>{{ collapsedGroups.has(group.component) ? '▸' : '▾' }} {{ group.component }}</span>
          <span class="font-normal text-zinc-400 font-mono text-[10px]">{{ group.issues.length }}</span>
        </button>
        <ul v-if="!collapsedGroups.has(group.component)" class="space-y-1 text-xs">
          <li
            v-for="issue in group.issues"
            :key="issue.id"
            class="border border-zinc-200 dark:border-zinc-700 rounded p-2 flex items-start justify-between gap-2"
            :class="issue.tokenIds.length > 0 ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800' : ''"
            @click="onIssueClick(issue)"
          >
            <div class="min-w-0 space-y-0.5">
              <span
                class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
                :class="severityTagClass(issue.severity)"
              >{{ issue.severity }}</span>
              <span class="ml-2 text-zinc-700 dark:text-zinc-300">{{ issue.message }}</span>
              <div v-if="issue.variantKey" class="text-zinc-400 font-mono text-[10px]">
                {{ issue.componentName }} / {{ issue.variantKey }}
              </div>
            </div>
            <span v-if="issue.tokenIds.length > 0" class="shrink-0 text-[10px] text-zinc-400">
              {{ issue.tokenIds.length }} token{{ issue.tokenIds.length === 1 ? '' : 's' }} →
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Readiness tab -->
    <div v-else-if="activeTab === 'readiness'" class="p-3">
      <p v-if="report.completeness.length === 0" class="text-xs text-zinc-400">
        No completeness data.
      </p>
      <!-- MOVE the existing component-readiness <table> here (verbatim, minus the
           outer `v-if` since the empty state is handled above). -->
    </div>

    <!-- Forecast tab -->
    <div v-else class="p-3 text-xs text-zinc-500 dark:text-zinc-400">
      <!-- MOVE the existing forecast block's inner content here (verbatim, minus the
           `border-t … pt-3` wrapper classes which were for the old stacked layout). -->
    </div>
  </div>
</template>
```

Fill the two `MOVE …` placeholders with the actual markup from the current file:
- Readiness: the `<table class="w-full text-sm">…</table>` (the `<thead>`/`<tbody>` rows iterating `report.completeness`) exactly as it is now.
- Forecast: the inner `Forecast: ~…KB tokens.css, … matches, … extensions, … entries.` text plus the `unmappedComponentPrefixes` span, exactly as now.

- [ ] **Step 4: Run the mount test**

Run: `npx vitest run src/app/components/ScanView.test.ts`
Expected: PASS (4 tests). If a selector assertion fails, adjust the test selectors to the real markup (do not weaken the behavioral checks: default Issues tab + count, component grouping incl. General, severity filter narrowing, select-tokens emit, tab switching).

- [ ] **Step 5: Typecheck + full suite + build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: typecheck clean; all tests pass; build succeeds. (Ignore IDE `@core` staleness; only `npm run typecheck` exit code is authoritative.)

- [ ] **Step 6: CHANGELOG**

In `CHANGELOG.md` add a new `## [Unreleased]` section (above `## [0.5.0]`) with:

```markdown
## [Unreleased]

### Changed

- **Scan view reworked into tabs.** The scan area is now **Issues / Readiness / Forecast**
  tabs. The Issues tab adds a severity filter (`All` / `Errors` / `Warnings` / `Hints`) and
  groups issues by component (collapsible, `General` for component-less issues), replacing
  the single scroll and the technical category accordions. Row-click still jumps to the
  token.
```

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.test.ts CHANGELOG.md
git commit -m "feat(scan): rework ScanView into Issues/Readiness/Forecast tabs with severity filter + component grouping"
```

A pre-commit hook runs typecheck + the full suite; if it blocks, fix legitimately. After committing, report. The orchestrator performs the headless visual QA. Do not push.

---

## Self-Review

**Spec coverage:**
- "Issues/Readiness/Forecast tabs, Issues default" → Task 2 template + test. ✓
- "severity filter (totals), narrows list, empties hide" → counts + filteredIssues + groups omit empty; test "filters by severity". ✓
- "group by component, collapsible, default open, General last" → groups + collapsedGroups (default empty = open) + helper order; Task 1. ✓
- "severity coloured tag; row click emits select-tokens" → severityTagClass + onIssueClick; test "emits select-tokens". ✓
- "Readiness/Forecast tabs render existing content" → Task 2 Step 3 MOVE instructions + test "switches tabs". ✓
- "drop technical categories" → `byCategory`/accordions removed in the rewrite. ✓
- "props/emits unchanged, App.vue untouched" → same `report` prop + `select-tokens` emit; App.vue not in file list. ✓
- "pure helper unit-tested + mount test" → Task 1 + Task 2 tests. ✓

**Placeholder scan:** The two `MOVE …` markers in the template are explicit "copy this exact existing block" instructions with a precise description of what to move (the readiness table / the forecast text) — resolved in the same step, not deferred. Everything else is complete code with expected command output.

**Type consistency:** `Tab` / `SeverityFilter` literal unions are used consistently in state, `TABS`/`SEVERITY_FILTERS`, and the template. `counts` keys (`all`/`error`/`warning`/`hint`) match `SeverityFilter` values, so `counts[f.value]` type-checks. `groupIssuesByComponent(filteredIssues.value): ComponentGroup[]` matches the Task 1 signature. `ScanReport`/`ScanIssue` fixture fields match the real types.
