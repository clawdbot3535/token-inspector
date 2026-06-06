# button preview alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `LiveButton` with the badge preview — drop the size-axis row, move the completeness score into the variant-row header next to a recipe-derived size switcher, render only the state row at the active size.

**Architecture:** One file: `LiveButton.vue` is revised to mirror `LiveBadge`'s `sizes`/`selectedSize`/`activeSize` switch mechanism; `sizeCells` and the size-axis grid are removed; the state row becomes a single flex row at `activeSize`; an `activeCompleteness` score renders in each variant-row header. Tests updated.

**Tech Stack:** Vue 3 SFC, Vitest + `@vue/test-utils` + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; the commit must be green.

**Branch:** `feat/button-preview-align` (spec committed at `b8891aa`).

**Spec:** `docs/superpowers/specs/2026-06-06-button-preview-align-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- `typecheck` does NOT cover `.test.ts`. VTU `DOMWrapper.element` is `Element`; cast to `HTMLElement` if you touch `.style` on a non-tag selector (existing button tests use tag/`previewButtons` helpers that already type the element).
- No new `extract-arbitrary` work. Mirror `LiveBadge`'s switch markup exactly.

---

### Task 1: revise `LiveButton.vue` + tests

**Files:**
- Modify: `src/app/components/LiveButton.vue`
- Test: `src/app/components/LiveButton.test.ts`

READ both files first. The current `LiveButton.vue` per variant row renders a size-axis row
(`sizeCells`) and a state-axis row (`stateCells`) in a `grid-cols-[72px_1fr]`, with a fixed
`SIZES = ["sm","md","lg"]` switcher (`stateAxisSize`) and per-size completeness badges.

- [ ] **Step 1: Update the tests (RED)**

In `src/app/components/LiveButton.test.ts`:

(a) REPLACE the test `"renders size variants with distinct inline padding (JIT-class regression)"`
(it relied on all sizes showing at once) with this active-size JIT guard:

```typescript
  it("renders the active size's padding inline (JIT-class regression)", () => {
    const wrapper = mount(LiveButton, { props: { graph: buttonGraph() }, ...mountOpts });
    const buttons = previewButtons(wrapper);
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    // default active size md → py-2 (0.5rem), resolved inline, not left to the JIT.
    expect(buttons.every((b) => b.element.style.paddingTop === "0.5rem")).toBe(true);
  });
```

(b) ADD two tests in the `describe("LiveButton", …)` block:

```typescript
  it("shows a size switch button per recipe size", () => {
    const wrapper = mount(LiveButton, { props: { graph: buttonGraph() }, ...mountOpts });
    // buttonGraph defines padding-y-sm/md/lg → sizes sm, md, lg.
    expect(wrapper.findAll('[data-testid="button-size-switch"]').length).toBe(3);
  });

  it("shows the active size's completeness score in the header", () => {
    const wrapper = mount(LiveButton, {
      props: {
        graph: buttonGraph(),
        // Fill every required CompletenessScore field — check the type in
        // token-graph.ts; variantKey must be the active size "md".
        completeness: [{ component: "button", variantKey: "md", defined: 2, total: 3 }] as never,
      },
      ...mountOpts,
    });
    expect(wrapper.text()).toContain("2/3");
  });
```

(If `CompletenessScore` has more required fields than `{component, variantKey, defined, total}`,
fill them per the type instead of the `as never` cast — prefer a correctly-typed literal.)

(c) KEEP unchanged: the fallback test, the `"resizes the state-row buttons when the size switcher
is clicked"` test (still valid — the switch now drives the only row), and the `D2c outline ring` /
`D2e ring widths` describes (they assert on the state row, which still renders resting + focus
states).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/components/LiveButton.test.ts`
Expected: FAIL — no `button-size-switch` testid yet; the active-size padding test fails because the
size-axis row still emits sm/lg paddings; the score test fails (score not in header).

- [ ] **Step 3: Script — switch mechanism**

In `src/app/components/LiveButton.vue` `<script setup>`:

(i) Add `ref` to the vue import: `import { computed, ref, type CSSProperties } from "vue";`

(ii) Replace the `SIZES` const, `Size` type, and `stateAxisSize` ref (keep `FALLBACK_VARIANT`):
```typescript
// Fallback rendered as a single row when no variant tokens are present.
const FALLBACK_VARIANT = "default";

// Sizes derived from the recipe (ordered xs→xl), the switcher's selected size,
// and a guarded active size — mirrors LiveBadge so the switch shows the real
// sizes (button has xs/sm/md/lg) and never points at a missing one.
const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];
const sizes = computed<string[]>(() => {
  const keys = Object.keys(buttonRecipe.value?.variants.size ?? {});
  if (keys.length === 0) return ["default"];
  return [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
});
const selectedSize = ref<string>("md");
const activeSize = computed<string>(() =>
  sizes.value.includes(selectedSize.value) ? selectedSize.value : (sizes.value[0] ?? "default"),
);
```

- [ ] **Step 4: Script — drop sizeCells, point state row at activeSize, add header score**

(i) In the `VariantRow` interface, remove the `sizeCells: PreviewCell[];` line.

(ii) In `variantRows`, delete the entire `// ── Sizes row …` block that builds `sizeCells` (the
`const sizeCells: PreviewCell[] = SIZES.map(...)` through its `});`), change the state-row size
lookup from `recipe.variants.size?.[stateAxisSize.value]` to `recipe.variants.size?.[activeSize.value]`,
and remove `sizeCells,` from the returned object literal.

(iii) After the `variantRows` computed, add:
```typescript
// Completeness for the active size — shown once in each variant row header
// (replaces the per-size-cell badges of the removed size axis).
const activeCompleteness = computed<CompletenessScore | undefined>(() =>
  cellCompleteness(activeSize.value),
);
```
(`CompletenessScore` is already imported; `cellCompleteness` is unchanged.)

- [ ] **Step 5: Template — header switcher + score, single state row**

Replace the whole `<div v-for="row in variantRows" …> … </div>` block (the variant-row body)
with:

```vue
    <div
      v-for="row in variantRows"
      :key="row.variant"
      class="space-y-2 border-t border-zinc-200 dark:border-zinc-700 pt-3"
    >
      <div class="flex items-center gap-3">
        <span class="text-xs font-mono uppercase tracking-wide text-zinc-500">
          {{ row.variant }}
        </span>

        <!-- Size switcher — drives the state row's size. Shown when >1 size. -->
        <div
          v-if="sizes.length > 1"
          class="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-[10px] overflow-hidden"
          :title="`Preview size — currently ${activeSize}`"
        >
          <button
            v-for="s in sizes"
            :key="s"
            type="button"
            data-testid="button-size-switch"
            class="px-1.5 py-0.5 transition-colors"
            :class="
              activeSize === s
                ? 'bg-primary text-inverted'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            "
            @click="selectedSize = s"
          >
            {{ s }}
          </button>
        </div>

        <span
          v-if="activeCompleteness"
          class="text-[9px] font-mono"
          :class="
            activeCompleteness.defined === activeCompleteness.total
              ? 'text-emerald-500'
              : 'text-amber-500'
          "
        >
          {{ activeCompleteness.defined }}/{{ activeCompleteness.total }}
        </span>

        <button
          type="button"
          class="ml-auto text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{
            'text-success border-success/60': wasJustCopied(`livebtn-${row.variant}`),
          }"
          @click="copy(row.inspectClasses, `livebtn-${row.variant}`)"
          :title="`Copy ${activeSize} classes for ${row.variant}`"
        >
          {{ wasJustCopied(`livebtn-${row.variant}`) ? "Copied!" : "Copy" }}
        </button>
      </div>

      <!-- State row at the active size (the only row; badge-style). -->
      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <div
          v-for="cell in row.stateCells"
          :key="`state-${cell.label}`"
          class="flex flex-col justify-end items-center gap-1 min-w-[88px]"
        >
          <button
            type="button"
            :class="
              cell.buttonClasses +
              (hasVariantTokens
                ? ' inline-flex items-center transition-colors'
                : ' inline-flex items-center bg-blue-500 text-white hover:bg-blue-600 transition-colors')
            "
            :style="cell.style"
          >
            <UIcon v-if="hasLeadingIcon" :name="iconName" class="shrink-0" />
            {{ buttonLabel }}
          </button>
          <span class="text-[10px] text-zinc-500 font-mono">{{ cell.label }}</span>
        </div>
      </div>

      <code
        class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all"
      >
        <template
          v-for="(seg, segIdx) in row.segments"
          :key="segIdx"
        ><span
            v-if="seg.highlight"
            class="bg-primary/20 ring-1 ring-primary/40 rounded px-0.5"
          >{{ seg.token }}</span><span v-else>{{ seg.token }}</span><span
            v-if="segIdx < row.segments.length - 1"
          >&nbsp;</span></template>
      </code>
    </div>
```

(This removes the `grid-cols-[72px_1fr]` axis grid and both axis-label cells; the state cells keep
their exact `<button>` markup, icon gate, and fallback styling.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/components/LiveButton.test.ts`
Expected: PASS — active-size padding inline (md 0.5rem), 3 switch buttons, score in header, the
switch test still resizes the state row, D2c/D2e/fallback green.

- [ ] **Step 7: Typecheck + full suite + build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: PASS. (`sizeCells`/`SIZES`/`Size`/`stateAxisSize` are fully removed — no dangling refs.)

- [ ] **Step 8: Commit**

```bash
git add src/app/components/LiveButton.vue src/app/components/LiveButton.test.ts
git commit -m "feat(preview): align button preview with badge (size switch + header score, drop size axis)"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

## Final verification (after the task)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Headless QA (committed `components/*.tokens.json`): start `npm run dev`, select `button`;
  confirm per variant the header shows the size switch (`xs/sm/md/lg`) + a score, **no** size-axis
  row, and the state row changes size when the switch is toggled. **Wait a tick after the click
  before reading** an inline metric (the badge-switcher flush lesson). Console clean. Screenshot.
  Stop the dev server.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by
  fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** recipe-derived `sizes` + `selectedSize`/`activeSize` switch; size-axis row
  removed; header switcher + `activeCompleteness` score; state row at active size as the only row
  (Steps 3–5); tests for switcher count / header score / active-size JIT guard, switch-resizes kept
  (Step 1). All mapped.
- **Cleanup:** `SIZES`, `Size`, `stateAxisSize`, `sizeCells` all removed; `cellCompleteness` reused
  for the header score.
- **No regression:** `LiveBadge`/`LiveInput`, recipe engine, scanner untouched; D2c/D2e ring tests
  unchanged (they assert on the state row).
- **No placeholders:** full template block + precise script edits + exact commands.
