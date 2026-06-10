# toggle active states — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visible pressed states + ARIA for the scan-view switch (issues button + HeaderStatusStrip) and the `Commit…` panel toggle.

**Architecture:** One task — three small template edits (App.vue ×2, HeaderStatusStrip.vue ×1) + two test extensions. Class/ARIA additions only; no logic changes.

**Tech Stack:** Vue 3 SFC, Vitest + VTU + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest; commit must be green.

**Branch:** `fix/toggle-active-states` (spec at `2c36c62`).

**Spec:** `docs/superpowers/specs/2026-06-10-toggle-active-states-design.md`

**Reminders:**
- Git attribution disabled — NO trailer; verify `git log -1 --format=%B`, amend if present.
- `typecheck` excludes `.test.ts`.

---

### Task 1: pressed states + ARIA + tests

**Files:** Modify `src/app/App.vue`, `src/app/components/HeaderStatusStrip.vue`; Test `src/app/components/HeaderStatusStrip.test.ts` (exists — extend), `src/app/App.test.ts` (exists — extend).

- [ ] **Step 1: Failing tests**

`src/app/components/HeaderStatusStrip.test.ts` — read the existing tests for the mount/props pattern (it takes a `report` + `scanViewActive` prop), then add:
```typescript
  it("marks the strip pressed when the scan view is active", () => {
    const wrapper = /* mount with the file's existing report fixture */ ({ scanViewActive: true });
    const btn = wrapper.find("button");
    expect(btn.attributes("aria-pressed")).toBe("true");
    expect(btn.classes().join(" ")).toContain("ring-1");
  });
  it("is unpressed when the scan view is inactive", () => {
    const wrapper = /* mount */ ({ scanViewActive: false });
    const btn = wrapper.find("button");
    expect(btn.attributes("aria-pressed")).toBe("false");
    expect(btn.classes().join(" ")).not.toContain("ring-1");
  });
```
(Adapt the mount helper to the file's existing fixture EXACTLY — there are existing HeaderStatusStrip tests to model on. If the existing tests pass `scanViewActive` already, extend; otherwise add the prop.)

`src/app/App.test.ts` — in the existing gate smoke test, around the commit-open click:
```typescript
    const commitOpen = wrapper.find('[data-testid="commit-open"]');
    expect(commitOpen.attributes("aria-expanded")).toBe("false");
    await commitOpen.trigger("click");
    expect(wrapper.find('[data-testid="export-url"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="commit-open"]').attributes("aria-expanded")).toBe("true");
```
(Integrate into the existing assertions — do not duplicate the click.)

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/app/components/HeaderStatusStrip.test.ts src/app/App.test.ts`.

- [ ] **Step 3: Implement**

`src/app/components/HeaderStatusStrip.vue` (root `<button>`, ~line 28):
```vue
    :class="scanViewActive ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700' : ''"
    :aria-pressed="scanViewActive"
```
(Replace the existing `:class="scanViewActive ? 'bg-zinc-100 dark:bg-zinc-800' : ''"` binding; add the aria attribute.)

`src/app/App.vue` — issues button (~452):
```vue
            <button
              v-if="issueCount > 0"
              class="text-warning hover:underline rounded px-1"
              :class="state.view.value === 'scan' ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700' : ''"
              :aria-pressed="state.view.value === 'scan'"
              @click="state.view.value = state.view.value === 'scan' ? 'inspector' : 'scan'"
            >
```
`src/app/App.vue` — `commit-open` button (~494): in its static class string, REMOVE `hover:bg-elevated/80` and add the dynamic binding + aria:
```vue
            class="text-xs px-2 py-1 rounded border border-default transition-colors"
            :class="showCommitPanel ? 'bg-elevated' : 'hover:bg-elevated/80'"
            :aria-expanded="showCommitPanel"
```

- [ ] **Step 4: Run → PASS** — the two test files.
- [ ] **Step 5: Full gate** — `npm run typecheck && npx vitest run && npm run build`.
- [ ] **Step 6: Commit**
```bash
git add src/app/App.vue src/app/components/HeaderStatusStrip.vue src/app/components/HeaderStatusStrip.test.ts src/app/App.test.ts
git commit -m "fix(ui): pressed states + ARIA for the scan-view switch and the commit toggle"
```
Verify no trailer.

---

## Final verification

- [ ] `npm run typecheck && npx vitest run && npm run build` — green.
- [ ] Headless QA: load the export; click the HeaderStatusStrip → strip shows ring+bg, issues
  button (if rendered) shows the same treatment, `aria-pressed=true`; click again → cleared. Open
  the commit panel → `Commit…` has `bg-elevated` + `aria-expanded=true`; close → reverted. Spot-check
  dark mode via the light/dark toggle. Screenshots (scan active, commit open).
- [ ] Dispatch a final code reviewer (small diff — fold into the QA turn if trivial).
- [ ] superpowers:finishing-a-development-branch — **do not push**; FF-merge to `main` only on
  explicit user request. (Note: `feat/icon-slot-mirror` is ALSO unmerged — present both.)

## Self-review notes

- **Spec coverage:** both scan triggers (T1), commit toggle (T1), ARIA (T1), tests for strip +
  commit, issues-button via headless QA. All mapped.
- **No logic changes:** click handlers untouched; class strings and two aria attributes only.
- **No placeholders:** full code per edit; test snippets defer only to the existing
  HeaderStatusStrip fixture (explicitly).
