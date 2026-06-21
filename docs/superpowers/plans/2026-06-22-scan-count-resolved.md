# (Y) — Scan Summary Count Subtracts Resolved Deviations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The scan summary's `N errors · N warnings · N hints` (the `HeaderStatusStrip`) excludes fully-resolved deviations, so the count drops as the user resolves. Presentation-only — no `scanGraph`/`customParts`/export change.

**Architecture:** A pure `resolvedIssueIds(report, resolved)` helper (single source of truth for "this deviation is handled") subtracts fully-resolved issues from `HeaderStatusStrip`'s counts; `App.vue` passes the existing `resolvedTokenIds` set; `ScanView`'s `issueResolved` (v0.54.1) refactors to use the same helper.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`), Vitest + @vue/test-utils.

---

## File Structure
- **Create `src/app/resolve/resolved-issues.ts`** — `resolvedIssueIds(report, resolved) → Set<string>` + test.
- **Modify `src/app/components/HeaderStatusStrip.vue`** — `resolved?` prop; counts subtract resolved.
- **Modify `src/app/App.vue`** — pass `:resolved` to `HeaderStatusStrip`.
- **Modify `src/app/components/ScanView.vue`** — `issueResolved` uses the shared helper (DRY).

**Verified facts (recon):**
- `HeaderStatusStrip.vue`: `interface Props { report: ScanReport; }` (`:5`), `const props = defineProps<Props>();` (`:13`); `errorCount`/`warningCount`/`hintCount = computed(() => props.report.issues.filter((i) => i.severity === X).length)` (`:16-23`).
- `App.vue`: `resolvedTokenIds = computed(() => new Set(Object.keys(resolveOverride.value)))` exists; `<HeaderStatusStrip :report="..." />` mounts around `:658`.
- `ScanView.vue` (v0.54.1) has `props.resolved: ReadonlySet<string>` (default `new Set()`), `resolvableTokenIds`, and `issueResolved(issue)` (inline).
- `ScanIssue = { id; severity; kind; tokenIds: readonly string[]; … }`; `heuristicExtendable(report) → ResolvableDeviation[]` (`src/app/resolve/heuristic-extendable.ts`).

---

### Task 1: `resolvedIssueIds` pure helper

**Files:**
- Create: `src/app/resolve/resolved-issues.ts`
- Test: `src/app/resolve/resolved-issues.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/app/resolve/resolved-issues.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";
import { resolvedIssueIds } from "./resolved-issues.js";

function reportWith(issues: Partial<ScanIssue>[]): ScanReport {
  return {
    issues: issues.map((i, n) => ({ id: `i${n}`, category: "classification-hint", severity: "warning", kind: "unsupported-part", message: "m", tokenIds: [], ...i })),
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}

describe("resolvedIssueIds", () => {
  it("includes an issue whose only resolvable token is resolved", () => {
    const report = reportWith([{ id: "a", kind: "unsupported-part", tokenIds: ["chip-mystery-bg"], componentName: "chip" }]);
    const ids = resolvedIssueIds(report, new Set(["chip-mystery-bg"]));
    expect(ids.has("a")).toBe(true);
  });
  it("excludes it when not resolved", () => {
    const report = reportWith([{ id: "a", kind: "unsupported-part", tokenIds: ["chip-mystery-bg"], componentName: "chip" }]);
    expect(resolvedIssueIds(report, new Set()).has("a")).toBe(false);
  });
  it("excludes a multi-resolvable-token issue with one token still unresolved", () => {
    const report = reportWith([{ id: "a", kind: "component-looks-custom", tokenIds: ["chip-x-bg", "chip-y-bg"], componentName: "chip", customParts: ["x", "y"] }]);
    expect(resolvedIssueIds(report, new Set(["chip-x-bg"])).has("a")).toBe(false);
  });
  it("ignores non-extendable issues (no resolvable tokens)", () => {
    const report = reportWith([{ id: "a", kind: "malformed-value", tokenIds: ["foo"] }]);
    expect(resolvedIssueIds(report, new Set(["foo"])).has("a")).toBe(false);
  });
});
```
(NOTE: `heuristicExtendable` only treats `unsupported-part`/`component-looks-custom` token ids as resolvable. The fixtures above use those kinds so the tokens are resolvable; the `malformed-value` case has no resolvable token. If `heuristicExtendable` requires the token's 2nd segment to be a non-slot to count it, the `chip-mystery-bg`/`chip-x-bg` ids satisfy that — verify by running; adjust ids if needed so each test's intent holds.)

- [ ] **Step 2: Run to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/app/resolve/resolved-issues.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement.** Create `src/app/resolve/resolved-issues.ts`:

```ts
import type { ScanReport } from "@core/token-graph.js";
import { heuristicExtendable } from "./heuristic-extendable.js";

/** Issue ids that are FULLY resolved: the issue has ≥1 heuristic-extendable
 *  token and every such token is in the session override (`resolved`). The
 *  single source of truth for "this deviation is handled". */
export function resolvedIssueIds(report: ScanReport, resolved: ReadonlySet<string>): Set<string> {
  const resolvableTokenIds = new Set(heuristicExtendable(report).map((r) => r.tokenId));
  const out = new Set<string>();
  for (const issue of report.issues) {
    const resolvable = issue.tokenIds.filter((t) => resolvableTokenIds.has(t));
    if (resolvable.length > 0 && resolvable.every((t) => resolved.has(t))) out.add(issue.id);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass.**
Run: `npx vitest run src/app/resolve/resolved-issues.test.ts`
Expected: 4/4 PASS. (If a fixture token isn't treated as resolvable by `heuristicExtendable`, adjust the token id so its 2nd segment is a genuine non-slot part — keep each test's intent.)

- [ ] **Step 5: Typecheck + commit.**
Run: `npm run typecheck`
```bash
git add src/app/resolve/resolved-issues.ts src/app/resolve/resolved-issues.test.ts
git commit -m "feat(resolve): resolvedIssueIds helper (fully-resolved deviation ids)"
```

---

### Task 2: `HeaderStatusStrip` counts subtract resolved + wire `App.vue`

**Files:**
- Modify: `src/app/components/HeaderStatusStrip.vue`, `src/app/App.vue`
- Test: `src/app/components/HeaderStatusStrip.test.ts` (extend if it exists, else create)

- [ ] **Step 1: Write the failing test.** In `src/app/components/HeaderStatusStrip.test.ts` (read the existing file to match its mount/imports; if none exists, create it):

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import HeaderStatusStrip from "./HeaderStatusStrip.vue";
import type { ScanReport } from "@core/token-graph.js";

function reportWith(tokenIds: string[]): ScanReport {
  return {
    issues: [{ id: "a", category: "classification-hint", severity: "warning", kind: "unsupported-part", message: "m", tokenIds, componentName: "chip" }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}

describe("HeaderStatusStrip resolved subtraction", () => {
  it("drops a fully-resolved warning from the warning count", () => {
    const report = reportWith(["chip-mystery-bg"]);
    const without = mount(HeaderStatusStrip, { props: { report } });
    const withResolved = mount(HeaderStatusStrip, { props: { report, resolved: new Set(["chip-mystery-bg"]) } });
    expect(without.text()).toContain("1 warnings");
    expect(withResolved.text()).toContain("0 warnings");
  });
});
```
(Match the rendered string — the spec says it renders `{{ warningCount }} warnings`; if the exact text differs, assert on the real rendered count text.)

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/HeaderStatusStrip.test.ts`
Expected: FAIL — `resolved` prop ignored, both render "1 warnings".

- [ ] **Step 3: Implement in `HeaderStatusStrip.vue`.**
  - Add to imports: `import { resolvedIssueIds } from "../resolve/resolved-issues.js";` (and ensure `computed` is imported).
  - Extend `Props`: `interface Props { report: ScanReport; resolved?: ReadonlySet<string>; }`.
  - Add: `const resolvedIds = computed(() => resolvedIssueIds(props.report, props.resolved ?? new Set<string>()));`
  - Change each count to exclude resolved issues:
    ```ts
    const errorCount = computed(() => props.report.issues.filter((i) => i.severity === "error" && !resolvedIds.value.has(i.id)).length);
    const warningCount = computed(() => props.report.issues.filter((i) => i.severity === "warning" && !resolvedIds.value.has(i.id)).length);
    const hintCount = computed(() => props.report.issues.filter((i) => i.severity === "hint" && !resolvedIds.value.has(i.id)).length);
    ```

- [ ] **Step 4: Run the HeaderStatusStrip test.**
Run: `npx vitest run src/app/components/HeaderStatusStrip.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `App.vue`.** On the `<HeaderStatusStrip :report="scanReport" ... />` mount (around line 658), add `:resolved="resolvedTokenIds"`. Read the exact mount markup first and add the binding.

- [ ] **Step 6: Run full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit.**
```bash
git add src/app/components/HeaderStatusStrip.vue src/app/App.vue src/app/components/HeaderStatusStrip.test.ts
git commit -m "feat(resolve): scan summary counts subtract fully-resolved deviations"
```

---

### Task 3: DRY `ScanView.issueResolved` onto the shared helper

**Files:**
- Modify: `src/app/components/ScanView.vue`
- Test: existing `src/app/components/ScanView.resolve.test.ts` (must stay green — same behaviour)

- [ ] **Step 1: Implement.** In `src/app/components/ScanView.vue`:
  - Add to imports: `import { resolvedIssueIds } from "../resolve/resolved-issues.js";`
  - Add a computed: `const resolvedIds = computed(() => resolvedIssueIds(props.report, props.resolved));`
  - Replace the body of `issueResolved` with:
    ```ts
    function issueResolved(issue: ScanIssue): boolean {
      return resolvedIds.value.has(issue.id);
    }
    ```
  (Leave `resolvableTokenIds` + `issueResolvableToken` unchanged — the Resolve button targets the first *unresolved* resolvable token, a separate concern.)

- [ ] **Step 2: Run the ScanView resolve test + full suite + typecheck.**
Run: `npx vitest run src/app/components/ScanView.resolve.test.ts && npx vitest run && npm run typecheck`
Expected: all green (the refactor is behaviour-preserving — `resolvedIssueIds` computes the same predicate the inline version did).

- [ ] **Step 3: Commit.**
```bash
git add src/app/components/ScanView.vue
git commit -m "refactor(resolve): ScanView.issueResolved uses the shared resolvedIssueIds helper"
```

---

## Self-review checklist (run before handoff)
- README test-count: bump if the harness total changed (Tasks 1–2 add tests).
- Confirm the `HeaderStatusStrip` `resolved` default (`?? new Set()`) keeps existing mounts (no `resolved` passed) unchanged.
- Confirm `ScanView.resolve.test.ts` stays green after the Task 3 refactor (behaviour-preserving).

## Out of scope (parked)
B — override-aware `scanGraph` (resolved issues disappear; supersedes #2's ✓); C — override-aware export. See the spec's "Future".
