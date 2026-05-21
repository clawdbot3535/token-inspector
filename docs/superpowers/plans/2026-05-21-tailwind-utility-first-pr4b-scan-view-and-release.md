# Tailwind-Utility-First — PR 4b: Scan View UI + v0.4.0 Release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Wire the scanner foundation from PR 4a into the Inspector UI. Add `ScanView.vue` (categorized accordions, component readiness table, output forecast). Add `HeaderStatusStrip.vue` (permanent compact strip). Remove the standalone `IssuesView.vue` — its function is absorbed into ScanView. Show the per-variant completeness as `n/m` badges in LiveButton. Ship the combined PR 4a + PR 4b work as v0.4.0.

**Architecture:** All UI-facing work plus the release ceremony. A new `useScanReport` composable wraps `scanGraph` reactively. App.vue mounts the new components and rewires the `view` mode union from `'inspector' | 'issues'` to `'inspector' | 'scan'`. Token highlighting plugs into the existing `state.highlightedIds` ref so clicking an issue jumps to its affected tokens in the list.

**Tech Stack:** Vue 3 Composition API, Tailwind v4, Nuxt UI v4, TypeScript strict + `noUncheckedIndexedAccess: true`.

**Spec:** `docs/superpowers/specs/2026-05-20-tailwind-utility-first-tokens-design.md` (commit `82c871b`).

**Prerequisites:**
- PR 4a merged to main. Scanner module, recipe-engine smart non-suffix, slot-mapping loader, app-config completeness annotations all live.
- 135+ tests still passing.
- Branch from `main` as `pr4b-scan-view-and-release`.

---

## File Structure

### New files

- `src/app/composables/use-scan-report.ts` — Reactive wrapper around `scanGraph(graph.value)`.
- `src/app/components/ScanView.vue` — Categorized accordion view with completeness table and forecast line.
- `src/app/components/HeaderStatusStrip.vue` — Permanent compact strip at the top of the inspector.

### Modified files

- `src/app/state.ts` — Replace `ViewMode = 'inspector' | 'issues'` with `'inspector' | 'scan'`.
- `src/app/App.vue` — Mount HeaderStatusStrip + ScanView. Wire `select-tokens` event to `state.highlightedIds`. Pass scan completeness to LiveButton.
- `src/app/components/LiveButton.vue` — Show `n/m` partial badge per size cell.
- `README.md` — Add "Token Scan" subsection.
- `CHANGELOG.md` — v0.4.0 entry covering BOTH PR 4a (engine) and PR 4b (UI).
- `package.json` + `package-lock.json` — Version bump to 0.4.0.

### Deleted files

- `src/app/components/IssuesView.vue` — Absorbed into ScanView.

---
## Phase P — Inspector Scan View

### Task 6: useScanReport composable

**Files:**
- Create: `src/app/composables/use-scan-report.ts`

**Context:** Reactive composable wrapping `scanGraph(graph.value, options)`. Recomputes when graph changes.

```ts
import { computed, type ComputedRef, type Ref } from "vue";
import { scanGraph, type ScanOptions } from "@core/scanner.js";
import type { TokenGraph, ScanReport } from "@core/token-graph.js";

const EMPTY_REPORT: ScanReport = {
  issues: [],
  completeness: [],
  forecast: {
    tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 },
    components: [],
    unmappedComponentPrefixes: [],
  },
  generatedAt: 0,
};

export function useScanReport(
  graph: Ref<TokenGraph | null>,
  options: ScanOptions = { components: ["button"] },
): ComputedRef<ScanReport> {
  return computed(() => {
    const g = graph.value;
    if (!g) return EMPTY_REPORT;
    return scanGraph(g, options);
  });
}
```

Commit:

```bash
git add src/app/composables/use-scan-report.ts
git commit -m "feat: useScanReport composable wrapping scanGraph"
```

---

### Task 7: ScanView component

**Files:**
- Create: `src/app/components/ScanView.vue`

**Context:** The main UI surface. Sections:

1. **Summary** — total counts per severity, total tokens, generated-at timestamp.
2. **Category accordions** — collapsible per category (data-quality, classification-hint, build-time). Each row inside an accordion is a clickable issue; click highlights affected tokens in the list.
3. **Component readiness table** — one row per component with each variant's completeness score.
4. **Output forecast** — single text line with predicted bytes, tailwind matches, theme extensions, mode-variant entries, unmapped prefixes.

Sketch the component shape:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ScanReport, ScanIssue, ScanCategory } from "@core/token-graph.js";

interface Props {
  report: ScanReport;
}
interface Emits {
  (event: "select-tokens", tokenIds: readonly string[]): void;
}
const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const CATEGORIES: ReadonlyArray<{ key: ScanCategory; label: string }> = [
  { key: "build-time", label: "Build errors" },
  { key: "data-quality", label: "Data quality" },
  { key: "classification-hint", label: "Classification hints" },
];

const counts = computed(() => {
  const c: Record<ScanCategory, number> = {
    "build-time": 0,
    "data-quality": 0,
    "classification-hint": 0,
  };
  for (const i of props.report.issues) c[i.category]++;
  return c;
});

const grouped = computed(() => {
  const out: Record<ScanCategory, ScanIssue[]> = {
    "build-time": [],
    "data-quality": [],
    "classification-hint": [],
  };
  for (const i of props.report.issues) out[i.category].push(i);
  return out;
});

const severityClass = (sev: string) => ({
  error: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  hint: "text-zinc-500 dark:text-zinc-400",
}[sev] ?? "");
</script>

<template>
  <div class="space-y-4 p-3">
    <!-- Summary line -->
    <div class="flex flex-wrap items-baseline gap-x-3 text-sm">
      <span class="font-semibold">{{ report.issues.length }} issues</span>
      <span class="text-zinc-500">across {{ Object.values(counts).filter(c => c > 0).length }} categories</span>
    </div>

    <!-- Category accordions -->
    <details v-for="cat in CATEGORIES" :key="cat.key" open class="rounded border border-zinc-200 dark:border-zinc-800">
      <summary class="cursor-pointer px-3 py-2 flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
        <span class="font-medium">{{ cat.label }}</span>
        <span class="text-xs font-mono text-zinc-500">{{ counts[cat.key] }}</span>
      </summary>
      <ul v-if="grouped[cat.key].length > 0" class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <li
          v-for="issue in grouped[cat.key]"
          :key="issue.id"
          class="px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
          @click="emit('select-tokens', issue.tokenIds)"
        >
          <div class="flex items-baseline gap-2">
            <span class="text-xs font-mono uppercase" :class="severityClass(issue.severity)">{{ issue.severity }}</span>
            <span class="text-xs text-zinc-500">{{ issue.kind }}</span>
          </div>
          <p class="text-sm mt-1">{{ issue.message }}</p>
        </li>
      </ul>
      <p v-else class="px-3 py-2 text-xs text-zinc-500 italic">No issues.</p>
    </details>

    <!-- Component readiness table -->
    <div v-if="report.completeness.length > 0">
      <h3 class="text-xs font-mono uppercase text-zinc-500 mb-1">Component readiness</h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-zinc-500">
            <th class="py-1">Component</th>
            <th class="py-1">Variant</th>
            <th class="py-1">Score</th>
            <th class="py-1">Missing</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in report.completeness" :key="`${c.component}-${c.variantKey}`" class="border-t border-zinc-100 dark:border-zinc-800">
            <td class="py-1 font-mono text-xs">{{ c.component }}</td>
            <td class="py-1 font-mono text-xs">{{ c.variantKey }}</td>
            <td class="py-1 font-mono text-xs">
              <span :class="c.defined === c.total ? 'text-emerald-600' : 'text-amber-600'">{{ c.defined }}/{{ c.total }}</span>
            </td>
            <td class="py-1 text-xs text-zinc-500">{{ c.missingUtilities.join(', ') || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Forecast -->
    <div class="text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800 pt-3">
      Forecast:
      ~{{ Math.round(report.forecast.tokensCss.estimatedBytes / 100) / 10 }}KB tokens.css,
      {{ report.forecast.tokensCss.tailwindMatches }} Tailwind matches,
      {{ report.forecast.tokensCss.themeExtensions }} theme extensions,
      {{ report.forecast.tokensCss.modeVariantEntries }} mode-variant entries.
      <span v-if="report.forecast.unmappedComponentPrefixes.length > 0">
        Unmapped: {{ report.forecast.unmappedComponentPrefixes.join(', ') }}.
      </span>
    </div>
  </div>
</template>
```

Commit:

```bash
git add src/app/components/ScanView.vue
git commit -m "feat: ScanView component aggregating issues, readiness, forecast"
```

---

### Task 8: HeaderStatusStrip + App.vue wiring

**Files:**
- Create: `src/app/components/HeaderStatusStrip.vue`
- Modify: `src/app/state.ts` (replace `view: 'inspector' | 'issues'` with `'inspector' | 'scan'`)
- Modify: `src/app/App.vue` (mount HeaderStatusStrip, replace IssuesView mount with ScanView, wire token highlighting)

**Context:** A permanent compact strip at the very top of the inspector — shows the scan summary and lets the user toggle to the Scan view.

`HeaderStatusStrip.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ScanReport } from "@core/token-graph.js";

interface Props {
  report: ScanReport;
  scanViewActive: boolean;
}
interface Emits {
  (event: "open-scan"): void;
}
const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const errorCount = computed(() => props.report.issues.filter((i) => i.severity === "error").length);
const warningCount = computed(() => props.report.issues.filter((i) => i.severity === "warning").length);
const hintCount = computed(() => props.report.issues.filter((i) => i.severity === "hint").length);
</script>

<template>
  <button
    type="button"
    class="w-full flex items-baseline gap-3 px-3 py-1.5 text-xs font-mono border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
    :class="scanViewActive && 'bg-zinc-100 dark:bg-zinc-800'"
    @click="emit('open-scan')"
  >
    <span class="text-zinc-500">Scan:</span>
    <span :class="errorCount > 0 ? 'text-red-600' : 'text-zinc-400'">{{ errorCount }} errors</span>
    <span class="text-zinc-400">·</span>
    <span :class="warningCount > 0 ? 'text-amber-600' : 'text-zinc-400'">{{ warningCount }} warnings</span>
    <span class="text-zinc-400">·</span>
    <span class="text-zinc-500">{{ hintCount }} hints</span>
    <span class="ml-auto text-zinc-400">{{ report.forecast.tokensCss.tailwindMatches }} tw · {{ report.forecast.tokensCss.themeExtensions }} theme · {{ report.forecast.tokensCss.modeVariantEntries }} mode-var</span>
  </button>
</template>
```

In `state.ts`, update the view union:

```ts
export type ViewMode = "inspector" | "scan";
```

(Drop `"issues"` if it was there.)

In App.vue, replace the IssuesView mount with ScanView when `view === "scan"`. Pass the scan report. Wire the `select-tokens` event to set `state.selection.value` and `state.highlightedIds.value` to highlight the affected tokens in the list. Mount HeaderStatusStrip at the very top of the layout (above the SummaryPanel from PR 1).

Commit:

```bash
git add src/app/components/HeaderStatusStrip.vue src/app/state.ts src/app/App.vue
git commit -m "feat: header status strip + ScanView wired in App.vue"
```

---

### Task 9: Remove IssuesView.vue

**Files:**
- Delete: `src/app/components/IssuesView.vue`

If any other components still reference IssuesView, update them to use ScanView or remove the imports.

```bash
grep -rn "IssuesView" src/ 2>/dev/null
git rm src/app/components/IssuesView.vue
git commit -m "refactor: remove standalone IssuesView, absorbed into ScanView"
```

---

## Phase Q — LiveButton partial badge

### Task 10: LiveButton shows n/m partial badge per size

**Files:**
- Modify: `src/app/components/LiveButton.vue`

**Context:** Each rendered preview cell gets a small badge next to the button label showing the variant's completeness (e.g., `sm · 2/5 ⚠`). LiveButton receives the scan report or completeness scores via props (App.vue computes upstream).

In `LiveButton.vue`, extend Props:

```ts
interface Props {
  graph: TokenGraph | null;
  completeness?: ReadonlyArray<CompletenessScore>;
}
```

In the template, look up the score for each size:

```vue
<div v-for="cell in previewCells" :key="cell.size" class="flex items-center gap-4">
  <button
    type="button"
    :class="cell.classes + ' bg-blue-500 text-white hover:bg-blue-600 transition-colors'"
  >
    Button {{ cell.size }}
    <span v-if="cellCompleteness(cell.size)" class="ml-2 text-xs font-mono opacity-70">
      {{ cellCompleteness(cell.size)!.defined }}/{{ cellCompleteness(cell.size)!.total }}
    </span>
  </button>
  <!-- existing code preview block -->
</div>
```

With a helper:

```ts
function cellCompleteness(size: string) {
  return props.completeness?.find((c) => c.component === "button" && c.variantKey === size);
}
```

In App.vue, pass `completeness` from the scan report to LiveButton.

Commit:

```bash
git add src/app/components/LiveButton.vue src/app/App.vue
git commit -m "feat: LiveButton shows completeness badge per size variant"
```

---

## Phase R — Release

### Task 11: README + CHANGELOG

**Files:**
- Modify: `README.md` (add Scan View + slot-mapping.json sections)
- Modify: `CHANGELOG.md` (v0.4.0 entry)

In README, add a "Token Scan" subsection describing the categories the scan covers and how to read the readiness table.

In CHANGELOG, add `## [0.4.0] — 2026-05-XX` with Added (scanner, ScanView, HeaderStatusStrip, slot-mapping.json, smart non-suffix, completeness annotations, LiveButton badges), Changed (engine behavior), Removed (IssuesView).

Commit:

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README + CHANGELOG for v0.4.0"
```

### Task 12: Version bump + tag + release

```bash
npm version 0.4.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to 0.4.0"
git checkout main
git merge --ff-only pr4-token-scan-and-smart-recipes
git push origin main
git tag -a v0.4.0 -m "v0.4.0 — Token Scan + Smart Recipe Engine

Scan view aggregates data-quality issues, classification hints,
completeness scores, and output forecast. Engine reassigns non-suffix
tokens to default size when they compete with size-suffix siblings.
slot-mapping.json enables project-level overrides.

See CHANGELOG.md for the full list."
git push origin v0.4.0
git branch -d pr4-token-scan-and-smart-recipes

# GitHub release
awk '/^## \[0\.4\.0\]/,/^## \[0\.3\.0\]/' CHANGELOG.md | sed '$d' > /tmp/v040-notes.md
gh release create v0.4.0 --title "v0.4.0 — Token Scan + Smart Recipe Engine" --notes-file /tmp/v040-notes.md
rm /tmp/v040-notes.md
```

---

## Spec coverage (PR 4b)

- **useScanReport composable** → Task 6
- **ScanView component** → Task 7
- **HeaderStatusStrip + App.vue rewiring** → Task 8
- **IssuesView removal** → Task 9
- **LiveButton partial badge** → Task 10
- **README + CHANGELOG for v0.4.0** → Task 11
- **Version bump + tag + GitHub release** → Task 12

Combined with PR 4a, all PR 4 spec requirements are covered.

### Open / deferred (later PRs)

- Hue-proximity color role derivation
- `badge`, `card`, `input` recipes
- Figma REST API import (PR 3, separate plan)
- Playwright CI
