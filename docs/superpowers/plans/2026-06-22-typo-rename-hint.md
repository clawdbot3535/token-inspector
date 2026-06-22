# (Y) Data-Quality Owner v1 — Typo Rename Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `possible-typo` deviation shows a copy-able **"💡 `from` → `to`"** rename hint in the Scan view (the Data-Quality owner's advisory action) — by emitting the already-detected correction as structured `typoFrom`/`typoTo` fields and rendering them in `ScanView`.

**Architecture:** `src/data-quality.ts` already computes the typo `segment` + `suggestion`; emit them as `typoFrom`/`typoTo` on the `possible-typo` `ScanIssue` (a new optional field on `ScanIssue`). `ScanView` renders an inline `💡 from → to` + Copy affordance for typo issues. Advisory — no override, no engine/export/`scanGraph` change.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`), Vitest + @vue/test-utils.

---

## File Structure
- **Modify `src/token-graph.ts`** — `ScanIssue` gains `typoFrom?`/`typoTo?`.
- **Modify `src/data-quality.ts`** — emit `typoFrom`/`typoTo` on the `possible-typo` issue.
- **Modify `src/app/components/ScanView.vue`** — the `💡 from → to` + Copy affordance for typo issues.
- **Test:** a focused `src/data-quality.test.ts` (the field emission) + a `ScanView` typo test.

**Verified facts (recon):**
- `src/data-quality.ts` exports `detectPossibleTypos(graph)` (called by `scanner.ts:22,695`). Its emission loop (`~:63-83`): `for (const { segment, suggestion, ids } of hits.values()) { … issues.push({ id: \`typo-${segment}-${suggestion}\`, category: "data-quality", severity: "warning", kind: "possible-typo", message: …, tokenIds: ids }); }`. `segment` (the typo) and `suggestion` (the correction) are in scope.
- `src/token-graph.ts:~167` — `ScanIssue` (has `componentName?`, `customParts?`, `variantKey?`).
- `ScanView.vue` (v0.54.x) — per-issue right-hand affordance `<div class="shrink-0 flex items-center gap-1">` holds the token-count span + the Heuristic `Resolve →` button + the `✓ resolved` span. The `v-for="issue in group.issues"` exposes `issue` (a `ScanIssue`).
- A real fixture: a token whose 2nd-or-later segment is `heigth` → suggests `height` (the live export has `heigth`, `spaching`).

---

### Task 1: Emit structured `typoFrom`/`typoTo`

**Files:**
- Modify: `src/token-graph.ts`, `src/data-quality.ts`
- Test: `src/data-quality.test.ts` (create)

- [ ] **Step 1: Write the failing test.** Create `src/data-quality.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGraph } from "./build-graph.js";
import type { SourceFile } from "./token-graph.js";
import { detectPossibleTypos } from "./data-quality.js";

function typoGraph() {
  // "heigth" is a near-miss of the vocab word "height".
  const sources: SourceFile[] = [
    { name: "global", data: { button: { heigth: { md: { $value: 8, $type: "dimension" } } } } },
  ];
  return buildGraph(sources);
}

describe("detectPossibleTypos structured suggestion", () => {
  it("emits typoFrom/typoTo on the possible-typo issue", () => {
    const issues = detectPossibleTypos(typoGraph());
    const typo = issues.find((i) => i.kind === "possible-typo" && i.tokenIds.includes("button-heigth-md"));
    expect(typo, "expected a possible-typo issue for button-heigth-md").toBeDefined();
    expect(typo!.typoFrom).toBe("heigth");
    expect(typo!.typoTo).toBe("height");
  });
});
```
(If `detectPossibleTypos` takes a different argument shape, or `heigth`→`height` isn't detected with the default max edit distance, grep `data-quality.ts` for the call signature + `suggestVocabWord`/`maxDist`, and pick a fixture segment that the detector actually flags — confirm `height` is in the vocab. Keep the test's intent: the emitted typo issue carries `typoFrom`/`typoTo`.)

- [ ] **Step 2: Run to verify it fails.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/data-quality.test.ts`
Expected: FAIL — `typoFrom`/`typoTo` are `undefined` (not emitted) or a type error (field not on `ScanIssue`).

- [ ] **Step 3: Implement — `ScanIssue` fields.** In `src/token-graph.ts`, add to the `ScanIssue` interface (near `customParts?`/`variantKey?`):
```ts
  /** For possible-typo: the typo'd path segment and its suggested correction. */
  typoFrom?: string;
  typoTo?: string;
```

- [ ] **Step 4: Implement — emit them.** In `src/data-quality.ts`, in the `possible-typo` `issues.push({…})`, add the two fields (alongside `tokenIds: ids`):
```ts
      tokenIds: ids,
      typoFrom: segment,
      typoTo: suggestion,
```

- [ ] **Step 5: Run to verify pass + typecheck.**
Run: `npx vitest run src/data-quality.test.ts && npm run typecheck`
Expected: PASS; typecheck clean. (Run the FULL suite too — `npx vitest run` — to confirm no existing typo/scanner test broke.)

- [ ] **Step 6: Commit.**
```bash
git add src/token-graph.ts src/data-quality.ts src/data-quality.test.ts
git commit -m "feat(resolve): possible-typo issue carries structured typoFrom/typoTo"
```

---

### Task 2: `ScanView` typo rename hint + Copy

**Files:**
- Modify: `src/app/components/ScanView.vue`
- Test: `src/app/components/ScanView.typo.test.ts` (create)

- [ ] **Step 1: Write the failing test.** Create `src/app/components/ScanView.typo.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";

function reportWith(issue: Partial<ScanIssue>): ScanReport {
  return {
    issues: [{ id: "i1", category: "data-quality", severity: "warning", kind: "possible-typo", message: "m", tokenIds: ["button-heigth-md"], ...issue }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView typo rename hint", () => {
  it("renders the 💡 from → to hint for a possible-typo issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ typoFrom: "heigth", typoTo: "height" }) }, global: { stubs } });
    const hint = wrapper.find("[data-testid=typo-hint]");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain("heigth");
    expect(hint.text()).toContain("height");
  });

  it("copies the rename on Copy click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(ScanView, { props: { report: reportWith({ typoFrom: "heigth", typoTo: "height" }) }, global: { stubs } });
    await wrapper.get("[data-testid=typo-copy]").trigger("click");
    expect(writeText).toHaveBeenCalledWith("heigth → height");
  });

  it("renders no typo hint for a non-typo issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith({ kind: "unsupported-part", typoFrom: undefined, typoTo: undefined }) }, global: { stubs } });
    expect(wrapper.find("[data-testid=typo-hint]").exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
Run: `npx vitest run src/app/components/ScanView.typo.test.ts`
Expected: FAIL — no `typo-hint`.

- [ ] **Step 3: Implement.** In `src/app/components/ScanView.vue`:
  - Add a `copyRename` method in `<script setup>`:
    ```ts
    async function copyRename(issue: ScanIssue): Promise<void> {
      if (!issue.typoFrom || !issue.typoTo) return;
      try {
        await navigator.clipboard?.writeText(`${issue.typoFrom} → ${issue.typoTo}`);
      } catch {
        // clipboard unavailable — the hint text is still visible to read
      }
    }
    ```
  - In the per-issue right-hand affordance `<div class="shrink-0 flex items-center gap-1">` (the one holding the count span + the Resolve button + the ✓ span), add a typo branch as a sibling:
    ```html
    <span
      v-if="issue.kind === 'possible-typo' && issue.typoTo"
      class="ml-2 inline-flex items-center gap-1 text-[10px] text-sky-700 dark:text-sky-300"
      data-testid="typo-hint"
    >
      💡 <code>{{ issue.typoFrom }}</code> → <code>{{ issue.typoTo }}</code>
      <button type="button" class="underline" data-testid="typo-copy" @click.stop="copyRename(issue)">Copy</button>
    </span>
    ```

- [ ] **Step 4: Run the test + full suite + typecheck.**
Run: `npx vitest run src/app/components/ScanView.typo.test.ts && npx vitest run && npm run typecheck`
Expected: all green. Existing ScanView tests stay green (the typo branch is additive, gated on `kind === 'possible-typo'`).

- [ ] **Step 5: Commit.**
```bash
git add src/app/components/ScanView.vue src/app/components/ScanView.typo.test.ts
git commit -m "feat(resolve): ScanView typo rename hint + Copy (Data-Quality owner)"
```

---

### Task 3: Manual check (light)
- [ ] `npm run dev` → `/browse` the live export → Scan view → find a `possible-typo` issue (the export has `heigth`/`spaching`) → confirm the `💡 from → to` hint shows + the Copy button is present. (The emission + render are unit-tested; this confirms it surfaces on real data.)

---

## Self-review checklist (run before handoff)
- README test-count: bump if the harness total changed (Tasks 1–2 add tests).
- Confirm the typo affordance is gated on `kind === 'possible-typo'` so other issue kinds are unaffected.
- Confirm `copyRename` guards `navigator.clipboard` (jsdom/older browsers).

## Out of scope (parked)
`malformed-value` hint; in-session rename preview (B); the other (Y) owners. See the spec's "Future".
