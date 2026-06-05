# Design: Scan view rework — tabs + severity filter + component grouping

- **Date:** 2026-06-05
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/ui-scan-rework`
- **Scope:** the scan area (`ScanView.vue`) only. The sidebar rework shipped in v0.5.0;
  this is the second half of the UI cleanup.

## Problem

The scan area is one long vertical scroll: a count line, then issues grouped under three
**technical category** accordions (`build-time` / `data-quality` / `classification-hint`),
then the component-readiness table, then the forecast. There is no severity filter, issues
are not grouped by component, and the readiness table + forecast are buried below 40+ issue
rows. A designer who wants "all issues for `input`" or "just the warnings" has to scroll
and scan the whole list.

## Goal

Restructure `ScanView.vue` into three tabs — **Issues / Readiness / Forecast** — with the
Issues tab offering a **severity filter** and **grouping by component**. Drop the technical
category labels (severity + component carry the meaning). `ScanView`'s public interface
(`report` prop in, `select-tokens` emit out) and the row-click-jumps-to-token behavior are
unchanged.

Success criteria:
- The scan pane shows a tab bar: `Issues · N` / `Readiness` / `Forecast`; Issues is the
  default tab.
- Issues tab: a segmented severity filter (`All N` / `Errors N` / `Warnings N` / `Hints N`,
  counts from the full report); selecting one narrows the list; component groups with no
  matching issues hide.
- Issues are grouped by `componentName` (collapsible groups, severity shown as a coloured
  tag per row); issues without a `componentName` fall into a `General` group.
- Clicking an issue row with token ids still emits `select-tokens` (jumps to the inspector).
- Readiness tab renders the existing completeness table; Forecast tab renders the existing
  forecast content.
- Full suite + typecheck + build green; the grouping/filter behavior is covered by a
  `ScanView.test.ts` mount test.

## Decisions

- **One component, internal state.** `ScanView.vue` stays a single presentational
  component (props/emits unchanged); it gains internal `activeTab` and `severityFilter`
  state and a per-group collapse state. No new top-level wiring in `App.vue`.
- **Group by component only** (no group-by toggle) — YAGNI. Severity is the filter axis;
  component is the grouping axis. The technical categories are dropped, not toggled.
- **`General` fallback group** for issues with no `componentName` (e.g. build-time graph
  errors), so nothing is lost.
- **Severity filter counts are totals** (from the full report), not recomputed per current
  filter — they tell the designer how many of each exist.

## Design

### Component structure (`src/app/components/ScanView.vue`)

Props/emits unchanged:
```typescript
interface Props { report: ScanReport; }
(event: "select-tokens", tokenIds: readonly string[]): void
```

Internal state:
```typescript
type Tab = "issues" | "readiness" | "forecast";
type SeverityFilter = "all" | "error" | "warning" | "hint";
const activeTab = ref<Tab>("issues");
const severityFilter = ref<SeverityFilter>("all");
const collapsedGroups = ref<ReadonlySet<string>>(new Set()); // component names collapsed; default all expanded
```

Computed:
- `counts` — `{ all, error, warning, hint }` over `report.issues` (totals; drives the filter
  labels and the `Issues · N` tab count uses `all`).
- `filteredIssues` — `report.issues` filtered by `severityFilter` (`all` passes through).
- `groups: { component: string; issues: ScanIssue[] }[]` — `filteredIssues` grouped by
  `issue.componentName ?? "General"`, sorted with named components alphabetically and
  `General` last; empty groups omitted (so a severity filter that empties a component hides
  it). A pure helper `groupIssuesByComponent(issues)` is extracted for unit testing.

Template:
- **Tab bar**: three buttons (`Issues · {{ counts.all }}`, `Readiness`, `Forecast`),
  active styled, set `activeTab` on click.
- **Issues tab** (`v-if activeTab === 'issues'`):
  - Severity segmented control: `All {{counts.all}}` / `Errors {{counts.error}}` /
    `Warnings {{counts.warning}}` / `Hints {{counts.hint}}`, active = `severityFilter`.
  - For each group: a collapsible header (`▾/▸ {{component}}` + issue count, toggles
    `collapsedGroups`) and, when expanded, the issue rows. Each row: a coloured severity
    tag (`severityClass`), the message, an optional `componentName / variantKey` line, and
    the `N tokens →` affordance; `@click="onIssueClick(issue)"` (unchanged — emits
    `select-tokens` when `tokenIds.length > 0`).
  - Empty state: when `filteredIssues` is empty, a friendly line (e.g. "No
    {{severityFilter}} issues.").
- **Readiness tab** (`v-if activeTab === 'readiness'`): the existing component-readiness
  `<table>` (moved verbatim; empty state when `report.completeness` is empty).
- **Forecast tab** (`v-if activeTab === 'forecast'`): the existing forecast block (moved
  verbatim, with room to breathe).

Reuse the existing `severityClass` map (extend it to render coloured tags). The
`byCategory` computed and the category accordions are removed.

### Tests (`src/app/components/ScanView.test.ts`, new)

`@vue/test-utils` + jsdom, mounting `ScanView` with a hand-built `ScanReport`:
- Renders the three tabs; Issues is active by default and shows `Issues · N`.
- Issues are grouped by component: a report with `button` and `badge` issues yields a
  `button` group and a `badge` group; an issue with no `componentName` falls into `General`.
- Severity filter: selecting `Warnings` shows only warning rows and hides a component whose
  only issue was a hint.
- Clicking an issue row with `tokenIds` emits `select-tokens` with those ids.
- Switching to the Readiness tab shows the completeness table; Forecast tab shows the
  forecast text.
- A unit test for the pure `groupIssuesByComponent` helper (order: named alphabetical,
  `General` last; empty omitted).

### Verification

- `npm run typecheck && npx vitest run && npm run build` — all green.
- Headless: load the real export, open the scan pane; confirm the three tabs, the severity
  filter narrowing the list, component grouping, row-click jump, and the readiness/forecast
  tabs. Screenshot before/after.

## Out of scope

- `App.vue` scan/inspector layout, the scan toggle in `HeaderStatusStrip`, and whether the
  right code-preview panel shows in scan mode — unchanged.
- The `typography`-under-Components sidebar quirk (separate fix).
- Any change to the scanner / `ScanReport` data (`componentName` already present on issues).

## Risks

- **Issues without `componentName`.** Build-time graph errors carry no component; the
  `General` fallback group keeps them visible. The test covers this.
- **Component file growth.** `ScanView.vue` gains tabs + filter + grouping (~200 lines).
  Acceptable for one cohesive presentational component; the pure `groupIssuesByComponent`
  helper is extracted to keep the logic testable and the template lean.
