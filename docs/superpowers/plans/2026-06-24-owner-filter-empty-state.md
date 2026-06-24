# Owner-Filter Empty-State Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Scan view's empty-state message reflect BOTH active filters (severity and owner), instead of ignoring the owner filter.

**Architecture:** A new pure, testable view-layer helper `emptyIssuesMessage(severity, owner)` (mirroring the `owner-badges.ts` pattern: presentation strings as a pure module at the `src/app/` level) composes `No [owner-label ][severity ]issues.`, reading the owner label from the `OWNER_FILTERS` registry. ScanView's inline template expression is replaced with a call to it.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest.

---

## File Structure

- **Create** `src/app/empty-issues-message.ts` — the pure helper `emptyIssuesMessage(severity, owner)`. Single responsibility: compose the empty-state line from the two filter values.
- **Create** `src/app/empty-issues-message.test.ts` — unit tests for the wording combinations.
- **Modify** `src/app/components/ScanView.vue` — import the helper; replace the inline empty-state expression (line ~178) with a call to it.

Two tasks: Task 1 produces the tested helper; Task 2 wires it into ScanView.

---

## Task 1: Pure helper `empty-issues-message.ts`

**Files:**
- Create: `src/app/empty-issues-message.ts`
- Test: `src/app/empty-issues-message.test.ts`

### Context the implementer needs

`OWNER_FILTERS` and the `OwnerFilter` type are exported from `src/app/resolve/owner-of.js`. `OWNER_FILTERS` is an array of `{ value: OwnerFilter; label: string }`:

```ts
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

`OwnerFilter` is `Owner | "all" | "other"`. The severity filter values are `"all" | "error" | "warning" | "hint"` (typed locally in ScanView; the helper takes `severity: string`).

The wording rule: `No [owner-label ][severity ]issues.` — drop the owner label when owner is `"all"`, drop the severity word when severity is `"all"`, owner label before severity word.

- [ ] **Step 1: Write the failing test**

Create `src/app/empty-issues-message.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyIssuesMessage } from "./empty-issues-message.js";

describe("emptyIssuesMessage", () => {
  it("is unqualified when both filters are all", () => {
    expect(emptyIssuesMessage("all", "all")).toBe("No issues.");
  });

  it("includes only the severity word when owner is all", () => {
    expect(emptyIssuesMessage("warning", "all")).toBe("No warning issues.");
  });

  it("includes only the owner label when severity is all", () => {
    expect(emptyIssuesMessage("all", "figma-fix")).toBe("No Figma-Fix issues.");
  });

  it("includes the owner label before the severity word when both are set", () => {
    expect(emptyIssuesMessage("warning", "by-design")).toBe("No by-design warning issues.");
    expect(emptyIssuesMessage("error", "manual-dev")).toBe("No Manual-Dev error issues.");
  });

  it("uses the OWNER_FILTERS label for the 'other' bucket", () => {
    expect(emptyIssuesMessage("all", "other")).toBe("No Other issues.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/empty-issues-message.test.ts`
Expected: FAIL — `Failed to resolve import "./empty-issues-message.js"` (module does not exist yet).

- [ ] **Step 3: Write the helper**

Create `src/app/empty-issues-message.ts`:

```ts
import { OWNER_FILTERS, type OwnerFilter } from "./resolve/owner-of.js";

/**
 * The empty-state line for the Issues tab, reflecting both active filters:
 * "No [owner-label ][severity ]issues." Each qualifier is dropped when its filter is
 * "all". The owner label is read from OWNER_FILTERS (single source — no second
 * owner→text mapping).
 */
export function emptyIssuesMessage(severity: string, owner: OwnerFilter): string {
  const ownerLabel =
    owner === "all" ? "" : (OWNER_FILTERS.find((f) => f.value === owner)?.label ?? "");
  const severityWord = severity === "all" ? "" : severity;
  const qualifier = [ownerLabel, severityWord].filter(Boolean).join(" ");
  return qualifier ? `No ${qualifier} issues.` : "No issues.";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/empty-issues-message.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/empty-issues-message.ts src/app/empty-issues-message.test.ts
git commit -m "feat(scan): emptyIssuesMessage helper reflecting severity + owner filters"
```

The pre-commit hook runs vue-tsc + the full vitest suite. If it dies after ~13s with NO test failures listed, that is the known transient flake — re-run the exact same `git commit` (up to 2-3 times). Do NOT use `--no-verify`. Do NOT change other files to "fix" a flake.

---

## Task 2: Wire the helper into ScanView

**Files:**
- Modify: `src/app/components/ScanView.vue` (import block; empty-state `<p>` at line ~178)

### Context the implementer needs

ScanView already has `const severityFilter = ref<SeverityFilter>("all")` and
`const ownerFilter = ref<OwnerFilter>("all")`. The current empty-state markup is:

```html
      <p v-if="filteredIssues.length === 0" class="text-xs text-zinc-400">
        No {{ severityFilter === 'all' ? '' : severityFilter + ' ' }}issues.
      </p>
```

In a Vue template, refs auto-unwrap, so passing `severityFilter` / `ownerFilter` to a function passes their values.

- [ ] **Step 1: Add the import**

In the `<script setup>` import block of `src/app/components/ScanView.vue`, add (next to the other `../` app-module imports, e.g. after the `ownerBadge` import from `../owner-badges.js`):

```ts
import { emptyIssuesMessage } from "../empty-issues-message.js";
```

- [ ] **Step 2: Replace the empty-state expression**

Change the empty-state `<p>` from:

```html
      <p v-if="filteredIssues.length === 0" class="text-xs text-zinc-400">
        No {{ severityFilter === 'all' ? '' : severityFilter + ' ' }}issues.
      </p>
```

to:

```html
      <p v-if="filteredIssues.length === 0" class="text-xs text-zinc-400">
        {{ emptyIssuesMessage(severityFilter, ownerFilter) }}
      </p>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: all green, 0 failures (existing ScanView mount tests must stay green — the empty-state message text changed only in the owner-filtered case; if any existing test asserts the literal old empty-state string, update it to the new `emptyIssuesMessage` output for that filter combination, but do NOT weaken an unrelated assertion).

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ScanView.vue
git commit -m "feat(scan): empty-state message reflects the active owner filter"
```

(Same pre-commit-hook flake note as Task 1.)

---

## Notes for the implementer

- The `.js` import extensions are correct (NodeNext ESM from `.ts`/`.vue`); ignore any editor "Cannot find module" false positives.
- Do NOT change the filter logic (ScanView lines ~62-63), the counts, the chip rows, or relocate the local `SeverityFilter` type — out of scope.
- Touch only the three files named. The helper is the single source of the wording; do not duplicate the composition inline.
