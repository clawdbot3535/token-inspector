# Figma-Fix v2 — Copy-able tokens list Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the "tokens to add in Figma" list that `asymmetric-variant-coverage` already computes onto the `ScanIssue` as a structured `figmaFixTokens` field, and surface a `📋 Copy N tokens` button in the Scan view that copies the newline-joined list.

**Architecture:** Task 1 adds the field to the `ScanIssue` type + sets it at the scanner emit (message stays byte-identical). Task 2 adds a ScanView copy affordance (parallel to the typo `[Copy]`). Behaviour is additive; the existing scanner message test stays green.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest + `@vue/test-utils` (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-24-figma-fix-copy-tokens-design.md`

---

## File Structure

- **Modify** `src/token-graph.ts` — add `figmaFixTokens?: readonly string[]` to `ScanIssue`.
- **Modify** `src/scanner.ts` — set `figmaFixTokens` at the `asymmetric-variant-coverage` emit (message unchanged).
- **Modify** `src/scanner.test.ts` — add a test asserting `figmaFixTokens` + unchanged message.
- **Modify** `src/app/components/ScanView.vue` — add `copyFigmaTokens` + the Copy button.
- **Create** `src/app/components/ScanView.figmacopy.test.ts` — mount tests for the Copy button.

---

## Task 1: `figmaFixTokens` field + scanner emit

**Files:**
- Modify: `src/token-graph.ts`, `src/scanner.ts`
- Test: `src/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scanner.test.ts`, add this test immediately AFTER the existing test titled `"recognises semantic color-role variants (accent/error/success/...) on badge"` (which ends around line 439):

```ts
  it("carries the tokens-to-add as structured figmaFixTokens", () => {
    const graph = makeGraph([
      makeNode({ id: "badge-accent-bg", layer: "component", type: "color", source: "global", base: "#001" }),
      makeNode({ id: "badge-accent-text", layer: "component", type: "color", source: "global", base: "#002" }),
      makeNode({ id: "badge-error-bg", layer: "component", type: "color", source: "global", base: "#003" }),
      // error MISSING text → must suggest adding `badge-error-text`
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const finding = report.issues.find(
      (i) => i.kind === "asymmetric-variant-coverage" && i.componentName === "badge" && i.message.includes("text"),
    );
    expect(finding).toBeDefined();
    expect(finding!.figmaFixTokens).toEqual(["badge-error-text"]);
    // message text is unchanged (still lists the token wrapped in backticks)
    expect(finding!.message).toContain("`badge-error-text`");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/scanner.test.ts -t "carries the tokens-to-add"`
Expected: FAIL — `finding!.figmaFixTokens` is `undefined`, so `.toEqual(["badge-error-text"])` fails.

- [ ] **Step 3: Add the field to the ScanIssue type**

In `src/token-graph.ts`, in the `ScanIssue` interface, add the field directly after the `typoFrom?` / `typoTo?` lines (before the closing `}`):

```ts
  /** For possible-typo: the typo'd path segment and its suggested correction. */
  typoFrom?: string;
  typoTo?: string;
  /** For asymmetric-variant-coverage: the exact token names to add in Figma. */
  figmaFixTokens?: readonly string[];
}
```

- [ ] **Step 4: Set the field at the scanner emit**

In `src/scanner.ts`, in the `asymmetric-variant-coverage` block, replace this:

```ts
      const intentionalNote =
        haveCount === 1
          ? ` Only one variant defines this — likely intentional (e.g. outline is the only variant with a border), but worth confirming.`
          : ``;

      issues.push({
        id: `dq-asym-variant-${prefix}-${cellKey.replace("|", "-")}`,
        category: "data-quality",
        severity,
        kind: "asymmetric-variant-coverage",
        message: `${prefix}.${utilityDisplay} is defined on [${haveStr}] but missing on [${missingStr}].${intentionalNote} Add ${missing.map((v) => `\`${prefix}-${v}-${utilityDisplay}\``).join(", ")} in Figma if the gap is unintentional.`,
        tokenIds: [],
        componentName: prefix,
      });
```

with this (extract the raw token names once; the message is derived from them and stays byte-identical):

```ts
      const intentionalNote =
        haveCount === 1
          ? ` Only one variant defines this — likely intentional (e.g. outline is the only variant with a border), but worth confirming.`
          : ``;
      const tokensToAdd = missing.map((v) => `${prefix}-${v}-${utilityDisplay}`);

      issues.push({
        id: `dq-asym-variant-${prefix}-${cellKey.replace("|", "-")}`,
        category: "data-quality",
        severity,
        kind: "asymmetric-variant-coverage",
        message: `${prefix}.${utilityDisplay} is defined on [${haveStr}] but missing on [${missingStr}].${intentionalNote} Add ${tokensToAdd.map((t) => `\`${t}\``).join(", ")} in Figma if the gap is unintentional.`,
        tokenIds: [],
        componentName: prefix,
        figmaFixTokens: tokensToAdd,
      });
```

(`tokensToAdd` holds the raw names; the message still wraps each in markdown backticks, so its rendered string is identical to before.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/scanner.test.ts -t "carries the tokens-to-add"`
Expected: PASS.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all green (the other `asymmetric-variant-coverage` tests still pass — message unchanged); typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/token-graph.ts src/scanner.ts src/scanner.test.ts
git commit -m "feat(scanner): asymmetric-variant-coverage carries structured figmaFixTokens"
```

(The pre-commit hook runs vue-tsc + the full vitest suite and can flake transiently ~13s — just re-run the commit if it dies early.)

---

## Task 2: ScanView Copy-tokens affordance

**Files:**
- Modify: `src/app/components/ScanView.vue`
- Test: `src/app/components/ScanView.figmacopy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/ScanView.figmacopy.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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
      tokenIds: [],
      componentName: "button",
      ...issue,
    }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView figma-fix copy", () => {
  it("renders a Copy button for an issue carrying figmaFixTokens", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ figmaFixTokens: ["button-outline-border", "button-ghost-border"] }) }, global: { stubs } });
    const btn = wrapper.find("[data-testid=figma-fix-copy]");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("2");
  });

  it("copies the newline-joined token list on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(ScanView, { props: { report: reportWith({ figmaFixTokens: ["button-outline-border", "button-ghost-border"] }) }, global: { stubs } });
    await wrapper.get("[data-testid=figma-fix-copy]").trigger("click");
    expect(writeText).toHaveBeenCalledWith("button-outline-border\nbutton-ghost-border");
  });

  it("renders no Copy button for a figma-fix issue without figmaFixTokens", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "orphaned-size-key", figmaFixTokens: undefined }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=figma-fix-copy]").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/ScanView.figmacopy.test.ts`
Expected: FAIL — `[data-testid=figma-fix-copy]` not found.

- [ ] **Step 3: Add the `copyFigmaTokens` handler**

In `src/app/components/ScanView.vue`, add this function directly after the existing `copyRename` function:

```ts
async function copyFigmaTokens(issue: ScanIssue): Promise<void> {
  if (!issue.figmaFixTokens?.length) return;
  try {
    await navigator.clipboard?.writeText(issue.figmaFixTokens.join("\n"));
  } catch {
    // clipboard unavailable — the token names are still listed in the message
  }
}
```

- [ ] **Step 4: Add the Copy button to the template**

In `src/app/components/ScanView.vue`, inside the right-side affordance `<div class="shrink-0 flex items-center gap-1">`, add the button immediately AFTER the owner-badge span (the span with `:data-testid="ownerOf(issue)"` ending in `>{{ ownerBadge(ownerOf(issue))!.label }}</span>`), and BEFORE that div's closing `</div>`:

```html
              <button
                v-if="issue.figmaFixTokens?.length"
                type="button"
                class="ml-1 text-[10px] underline text-violet-700 dark:text-violet-300"
                data-testid="figma-fix-copy"
                @click.stop="copyFigmaTokens(issue)"
              >📋 Copy {{ issue.figmaFixTokens.length }} token{{ issue.figmaFixTokens.length === 1 ? '' : 's' }}</button>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/components/ScanView.figmacopy.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: all tests green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.figmacopy.test.ts
git commit -m "feat(resolve): ScanView 📋 Copy tokens button for figma-fix coverage gaps"
```

---

## Self-Review

**Spec coverage:**
- `figmaFixTokens?: readonly string[]` on `ScanIssue` → Task 1 Step 3. ✓
- Scanner sets it at the asymmetric-variant-coverage emit; message byte-identical → Task 1 Step 4 (message derived from the same `tokensToAdd`). ✓
- Scanner test asserts the field + unchanged message → Task 1 Step 1. ✓
- ScanView `copyFigmaTokens` + `📋 Copy N tokens` button gated on `figmaFixTokens?.length`, newline-joined copy → Task 2 Steps 3, 4. ✓
- Only asymmetric-variant-coverage carries the field → no other emit touched; Task 2 negative test uses `orphaned-size-key`. ✓
- Non-goals (no message change, no other-kind change, no owner/badge/filter change) → Task 1 keeps message identical; only the asym emit + the type + ScanView touched. ✓
- Clipboard-unavailable silent no-op → Task 2 Step 3 try/catch. ✓

**Placeholder scan:** No TBD/TODO; every code/command step shows full content, incl. the exact scanner before/after. ✓

**Type consistency:** `figmaFixTokens?: readonly string[]` defined in Task 1 (token-graph.ts) is set in Task 1 (scanner.ts, as `tokensToAdd: string[]` — assignable to `readonly string[]`) and read in Task 2 (`issue.figmaFixTokens?.length`, `issue.figmaFixTokens.join("\n")`, `issue.figmaFixTokens.length`). `data-testid="figma-fix-copy"` matches the Task 2 test selector. The copy payload `join("\n")` matches the test's expected `"button-outline-border\nbutton-ghost-border"`. ✓
