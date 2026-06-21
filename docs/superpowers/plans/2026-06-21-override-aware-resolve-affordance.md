# (Y) #2 — Override-Aware Resolve Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a deviation's heuristic-extendable token is in the session slot-mapping override, the Scan view stops offering it for resolution and shows **✓ resolved** instead of the **Resolve →** button.

**Architecture:** Localized to the resolve UI: `ScanView.vue` gains a `resolved: ReadonlySet<string>` prop (the resolved token ids); `issueResolvableToken` returns the first *unresolved* resolvable token; a new `issueResolved` drives a ✓ indicator. `App.vue` derives the set from its existing `resolveOverride` ref and passes it down. No scanner/export change.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`), Vitest + @vue/test-utils.

---

## File Structure
- **Modify `src/app/components/ScanView.vue`** — `resolved` prop + override-aware `issueResolvableToken` + `issueResolved` + the ✓ template branch.
- **Modify `src/app/App.vue`** — `resolvedTokenIds` computed + `:resolved` on the `<ScanView>` mount.
- **Modify `src/app/components/ScanView.resolve.test.ts`** — cases for resolved (✓, no button), unresolved (button), partial (button).

**Verified facts (from the (Y) v1 code):**
- `ScanView.vue` currently has: `const resolvableTokenIds = computed<Set<string>>(() => new Set(heuristicExtendable(props.report).map((r) => r.tokenId)));` and `function issueResolvableToken(issue: ScanIssue): string | null { return issue.tokenIds.find((t) => resolvableTokenIds.value.has(t)) ?? null; }`. The Resolve button is in a `<div class="shrink-0 flex items-center gap-1">` next to the token-count span, gated `v-if="issueResolvableToken(issue)"`, emitting `@click.stop="$emit('resolve', issueResolvableToken(issue)!)"`. Props are `interface Props { report: ScanReport; }`.
- `App.vue` has `const resolveOverride = ref<SlotMappingOverride>({})` and mounts `<ScanView :report="scanReport" @select-tokens="onScanSelectTokens" @resolve="onResolve" />`.

---

### Task 1: Override-aware Resolve affordance

**Files:**
- Modify: `src/app/components/ScanView.vue`, `src/app/App.vue`
- Test: `src/app/components/ScanView.resolve.test.ts`

- [ ] **Step 1: Write the failing test.** REPLACE the body of `src/app/components/ScanView.resolve.test.ts` with (keeps the existing fixture helper + stubs, adds the resolved cases):

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScanView from "./ScanView.vue";
import type { ScanReport } from "@core/token-graph.js";

function reportWith(kind: string, tokenIds: string[] = ["button-mystery-bg"]): ScanReport {
  return {
    issues: [{ id: "i1", category: "classification-hint", severity: "warning", kind, message: "m", tokenIds, componentName: "button" }],
    completeness: [],
    forecast: { tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 }, components: [], unmappedComponentPrefixes: [], nonComponentPrefixes: [] },
    generatedAt: 0,
  } as ScanReport;
}
const stubs = { UButton: { props: ["disabled"], template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>' } };

describe("ScanView resolve affordance", () => {
  it("shows a Resolve button for an unresolved heuristic-extendable issue and emits resolve", async () => {
    const wrapper = mount(ScanView, { props: { report: reportWith("unsupported-part") }, global: { stubs } });
    const btn = wrapper.find("[data-testid=resolve-issue]");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(wrapper.emitted("resolve")?.[0]?.[0]).toBe("button-mystery-bg");
  });

  it("shows NO Resolve button for a non-extendable issue", () => {
    const wrapper = mount(ScanView, { props: { report: reportWith("malformed-value") }, global: { stubs } });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
  });

  it("shows ✓ resolved (no Resolve button) when the token is in the resolved set", () => {
    const wrapper = mount(ScanView, {
      props: { report: reportWith("unsupported-part"), resolved: new Set(["button-mystery-bg"]) },
      global: { stubs },
    });
    expect(wrapper.find("[data-testid=resolve-issue]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=resolve-done]").exists()).toBe(true);
  });

  it("still shows Resolve when a multi-token issue has one resolved and one not", () => {
    const wrapper = mount(ScanView, {
      props: { report: reportWith("component-looks-custom", ["button-mystery-bg", "button-other-bg"]), resolved: new Set(["button-mystery-bg"]) },
      global: { stubs },
    });
    const btn = wrapper.find("[data-testid=resolve-issue]");
    expect(btn.exists()).toBe(true);
  });
});
```
(NOTE: the multi-token test assumes BOTH `button-mystery-bg` and `button-other-bg` are heuristic-extendable for a `component-looks-custom` issue. If `heuristicExtendable` only treats the first/those-with-customParts, adjust the fixture so the issue genuinely has two resolvable tokens — the intent: with one resolved and one not, the button still shows targeting the unresolved one.)

- [ ] **Step 2: Run to verify the new cases fail.**
Run: `cd /Users/christian/Dev/token-inspector && npx vitest run src/app/components/ScanView.resolve.test.ts`
Expected: the two new cases FAIL (no `resolved` prop / no `resolve-done` testid yet).

- [ ] **Step 3: Implement in `ScanView.vue`.**
  - Change the `Props` interface to add the optional `resolved` set:
    ```ts
    interface Props { report: ScanReport; resolved?: ReadonlySet<string>; }
    ```
  - Give it a default via `withDefaults` (or a computed fallback). Replace `const props = defineProps<Props>();` with:
    ```ts
    const props = withDefaults(defineProps<Props>(), { resolved: () => new Set<string>() });
    ```
  - Change `issueResolvableToken` to skip already-resolved tokens, and add `issueResolved`:
    ```ts
    function issueResolvableToken(issue: ScanIssue): string | null {
      return issue.tokenIds.find((t) => resolvableTokenIds.value.has(t) && !props.resolved.has(t)) ?? null;
    }
    function issueResolved(issue: ScanIssue): boolean {
      const resolvable = issue.tokenIds.filter((t) => resolvableTokenIds.value.has(t));
      return resolvable.length > 0 && resolvable.every((t) => props.resolved.has(t));
    }
    ```
  - In the template, in the `<div class="shrink-0 flex items-center gap-1">` that holds the count span + Resolve button, ADD a ✓ branch as a sibling of the Resolve `UButton` (the button keeps `v-if="issueResolvableToken(issue)"`):
    ```html
    <span v-else-if="issueResolved(issue)" data-testid="resolve-done" class="text-[10px] text-emerald-600 dark:text-emerald-400">✓ resolved</span>
    ```
    (`v-else-if` chained to the Resolve `UButton`'s `v-if` — so each issue shows EITHER the Resolve button OR the ✓, never both.)

- [ ] **Step 4: Run the ScanView test.**
Run: `npx vitest run src/app/components/ScanView.resolve.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Wire `App.vue`.**
  - After the existing resolve block (where `resolveOverride` is declared), add:
    ```ts
    const resolvedTokenIds = computed<Set<string>>(() => new Set(Object.keys(resolveOverride.value)));
    ```
    (`computed` is already imported in App.vue.)
  - On the `<ScanView ... />` mount, add the `:resolved` binding:
    ```html
    <ScanView
      :report="scanReport"
      :resolved="resolvedTokenIds"
      @select-tokens="onScanSelectTokens"
      @resolve="onResolve"
    />
    ```

- [ ] **Step 6: Run full suite + typecheck.**
Run: `npx vitest run && npm run typecheck`
Expected: all green; typecheck clean. Existing ScanView/App tests stay green.

- [ ] **Step 7: Commit.**
```bash
git add src/app/components/ScanView.vue src/app/App.vue src/app/components/ScanView.resolve.test.ts
git commit -m "feat(resolve): override-aware affordance — resolved deviations show ✓ instead of Resolve"
```

---

### Task 2: Manual check (optional, light)
- [ ] `npm run dev` → `/browse` the live export → scan view → Resolve a chip deviation → Apply → confirm that issue now shows **✓ resolved** (no Resolve button), while the other unresolved chip deviations still show **Resolve →**. (The override-merge + the prop reactivity are unit-tested; this confirms the App→ScanView wiring live.)

---

## Self-review checklist (run before handoff)
- README test-count: bump if the harness total changed (Task 1 adds 2 tests).
- Confirm `withDefaults(..., { resolved: () => new Set() })` keeps existing `<ScanView>` mounts (and the `App.scan-view.test.ts` ones) working without passing `resolved`.
- Confirm the ✓ and Resolve button are mutually exclusive (`v-if` / `v-else-if`).

## Out of scope (parked)
Deep override-aware `scanGraph` (warnings count drops, `customParts`/export re-route) — needs limitation #1 (custom-component override via `buildCustomRecipes`) first, else custom tokens vanish from both outputs. See the spec's "Future".
