# checkbox + radio previews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `LiveCheckbox` (square + checkmark) and `LiveRadio` (circle + dot) previews — a token-driven box (bg/ring/radius incl. the `checked:` state) with a decorative indicator, unchecked + checked — and wire both into `App.vue`.

**Architecture:** Task 1 = `LiveCheckbox.vue`. Task 2 = `LiveRadio.vue` (LiveCheckbox adapted: round box, dot indicator). Task 3 = `App.vue` wiring. Both components mirror `LiveSwitch`'s recipe→`projectToState`→`extractArbitrary` pipeline. No inventory work (both already in `NUXT_SLOTS`; `checked` projection already exists).

**Tech Stack:** Vue 3 SFC, Vitest + @vue/test-utils + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/checkbox-radio-preview` (spec committed at `b2615b9`).

**Spec:** `docs/superpowers/specs/2026-06-06-checkbox-radio-preview-design.md`

**Reminders:**
- Git attribution disabled globally — NO trailer. Verify `git log -1 --format=%B`; amend if present.
- `typecheck` excludes `.test.ts`. VTU `.element` is `Element` → cast to `HTMLElement` for `.style`.
- No new `extract-arbitrary` work. The box size + indicator are decorative (static classes); the box colours/ring/radius come from the recipe.

---

### Task 1: `LiveCheckbox.vue`

**Files:** Create `src/app/components/LiveCheckbox.vue`; Test `src/app/components/LiveCheckbox.test.ts`.

- [ ] **Step 1: Failing test** — create `src/app/components/LiveCheckbox.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveCheckbox from "./LiveCheckbox.vue";

function checkboxGraph() {
  const global = {
    checkbox: {
      bg: { $value: "#FFFFFF", $type: "color" },
      "bg-checked": { $value: "#4F63D2", $type: "color" },
      border: { $value: "#D4D4D8", $type: "color" },
      radius: { $value: 4, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveCheckbox", () => {
  it("shows a fallback message when the graph has no checkbox tokens", () => {
    const wrapper = mount(LiveCheckbox, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="checkbox-box"]')).toHaveLength(0);
  });
  it("renders an unchecked and a checked box whose background differs", () => {
    const wrapper = mount(LiveCheckbox, { props: { graph: checkboxGraph() }, ...mountOpts });
    const boxes = wrapper.findAll('[data-testid="checkbox-box"]');
    expect(boxes.length).toBe(2);
    const bgs = boxes.map((b) => (b.element as HTMLElement).style.backgroundColor);
    expect(bgs[0]).not.toBe(bgs[1]); // unchecked #FFFFFF vs checked #4F63D2, both inline (JIT-safe)
    expect(bgs.every((b) => b !== "")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/app/components/LiveCheckbox.test.ts`.

- [ ] **Step 3: Create `LiveCheckbox.vue`**

```vue
<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCopyToClipboard } from "../composables/use-copy-to-clipboard.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "checkbox",
  highlightUtility: undefined,
  completeness: undefined,
});

const recipe = computed(() => {
  if (!props.graph) return null;
  return buildComponentRecipes(props.graph, { components: [props.componentName] })[props.componentName] ?? null;
});
const baseClasses = computed<string>(() => recipe.value?.slots["base"] ?? "");

interface Cell { label: string; checked: boolean; classes: string; style: CSSProperties; }
interface HighlightSegment { token: string; highlight: boolean; }

const completeness = computed<CompletenessScore | undefined>(() =>
  props.completeness?.find((c) => c.component === props.componentName),
);
function highlightSegments(classString: string): HighlightSegment[] {
  const target = props.highlightUtility;
  return classString.split(/\s+/).filter((t) => t.length > 0).map((token) => ({ token, highlight: target !== undefined && token === target }));
}

const cells = computed<Cell[]>(() => {
  if (!recipe.value) return [];
  return (["default", "checked"] as const).map((state) => {
    const { classes, style } = extractArbitrary(projectToState(baseClasses.value, state));
    return { label: state === "default" ? "unchecked" : "checked", checked: state === "checked", classes, style };
  });
});
const inspectClasses = computed<string>(() => baseClasses.value);
const segments = computed<HighlightSegment[]>(() => highlightSegments(inspectClasses.value));
const { copy, wasJustCopied } = useCopyToClipboard();
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in
      the loaded graph.
    </p>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="text-[10px] uppercase tracking-wider text-zinc-400">state</span>
        <span
          v-if="completeness"
          class="text-[9px] font-mono"
          :class="completeness.defined === completeness.total ? 'text-emerald-500' : 'text-amber-500'"
        >{{ completeness.defined }}/{{ completeness.total }}</span>
        <button
          type="button"
          class="ml-auto text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{ 'text-success border-success/60': wasJustCopied('livecheckbox') }"
          @click="copy(inspectClasses, 'livecheckbox')"
          title="Copy classes"
        >{{ wasJustCopied("livecheckbox") ? "Copied!" : "Copy" }}</button>
      </div>

      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <div v-for="cell in cells" :key="cell.label" class="flex flex-col items-start gap-1">
          <span
            data-testid="checkbox-box"
            class="inline-flex items-center justify-center size-5 rounded-sm"
            :class="cell.classes"
            :style="cell.style"
          >
            <UIcon v-if="cell.checked" name="i-lucide-check" class="size-3.5 text-white" />
          </span>
          <span class="text-[10px] text-zinc-500 font-mono">{{ cell.label }}</span>
        </div>
      </div>

      <code class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all">
        <template
          v-for="(seg, segIdx) in segments"
          :key="segIdx"
        ><span
            v-if="seg.highlight"
            class="bg-primary/20 ring-1 ring-primary/40 rounded px-0.5"
          >{{ seg.token }}</span><span v-else>{{ seg.token }}</span><span
            v-if="segIdx < segments.length - 1"
          >&nbsp;</span></template>
      </code>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/app/components/LiveCheckbox.test.ts`.
- [ ] **Step 5: `npm run typecheck && npx vitest run`** → PASS.
- [ ] **Step 6: Commit**
```bash
git add src/app/components/LiveCheckbox.vue src/app/components/LiveCheckbox.test.ts
git commit -m "feat(preview): LiveCheckbox — token-driven box + decorative checkmark (unchecked/checked)"
```
Verify no trailer; amend if present.

---

### Task 2: `LiveRadio.vue`

**Files:** Create `src/app/components/LiveRadio.vue`; Test `src/app/components/LiveRadio.test.ts`.

`LiveRadio.vue` is `LiveCheckbox.vue` with four changes: `componentName` default `"radio"`; the
box `data-testid="radio-box"` and static class `rounded-full` (instead of `rounded-sm`); the
indicator is a dot, not a checkmark; the copy key is `liveradio`.

- [ ] **Step 1: Failing test** — create `src/app/components/LiveRadio.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveRadio from "./LiveRadio.vue";

function radioGraph() {
  const global = {
    radio: {
      bg: { $value: "#FFFFFF", $type: "color" },
      "bg-checked": { $value: "#4F63D2", $type: "color" },
      border: { $value: "#D4D4D8", $type: "color" },
      radius: { $value: 9999, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveRadio", () => {
  it("shows a fallback message when the graph has no radio tokens", () => {
    const wrapper = mount(LiveRadio, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="radio-box"]')).toHaveLength(0);
  });
  it("renders an unchecked and a checked circle whose background differs", () => {
    const wrapper = mount(LiveRadio, { props: { graph: radioGraph() }, ...mountOpts });
    const boxes = wrapper.findAll('[data-testid="radio-box"]');
    expect(boxes.length).toBe(2);
    const bgs = boxes.map((b) => (b.element as HTMLElement).style.backgroundColor);
    expect(bgs[0]).not.toBe(bgs[1]);
    // radio-radius (9999) resolves to an inline borderRadius (round).
    expect((boxes[0]!.element as HTMLElement).style.borderRadius).not.toBe("");
  });
});
```

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Create `LiveRadio.vue`** — copy `LiveCheckbox.vue` verbatim, then apply:
  - `componentName` default → `"radio"`.
  - copy key `'livecheckbox'` → `'liveradio'` (both occurrences).
  - the box `<span data-testid="checkbox-box" … class="… rounded-sm">` → `data-testid="radio-box"` and `rounded-full` (keep `inline-flex items-center justify-center size-5`).
  - the indicator: replace the `<UIcon … i-lucide-check … />` with a dot:
    ```vue
            <span v-if="cell.checked" class="block size-1.5 rounded-full bg-white" />
    ```
- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: `npm run typecheck && npx vitest run`** → PASS.
- [ ] **Step 6: Commit**
```bash
git add src/app/components/LiveRadio.vue src/app/components/LiveRadio.test.ts
git commit -m "feat(preview): LiveRadio — token-driven circle + decorative dot (unchecked/checked)"
```
Verify no trailer; amend if present.

---

### Task 3: wire checkbox + radio into `App.vue`

**Files:** Modify `src/app/App.vue`.

READ the current mount sites first (the `v-if`/`v-else-if` chain: `LiveInput` → `LiveBadge` →
`LiveSwitch` → `LiveButton`, at each of the two sites). Confirm exact prop expressions.

- [ ] **Step 1: Register + import**
- Add `import LiveCheckbox from "./components/LiveCheckbox.vue";` and `import LiveRadio from "./components/LiveRadio.vue";` by the other Live imports.
- `COMPONENTS_WITH_PREVIEW = new Set(["button", "input", "textarea", "badge", "switch", "checkbox", "radio"]);`

- [ ] **Step 2: Token-selected site** — between the `<LiveSwitch …/>` and `<LiveButton …>`, insert:
```vue
                <LiveCheckbox
                  v-else-if="
                    previewSupported &&
                    selectedComponent === 'checkbox' &&
                    selectedNode.id.split('-')[0] === selectedComponent
                  "
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                  :highlight-utility="selectedVueTemplateClasses"
                  :completeness="scanReport.completeness"
                />
                <LiveRadio
                  v-else-if="
                    previewSupported &&
                    selectedComponent === 'radio' &&
                    selectedNode.id.split('-')[0] === selectedComponent
                  "
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                  :highlight-utility="selectedVueTemplateClasses"
                  :completeness="scanReport.completeness"
                />
```

- [ ] **Step 3: Component-selected site** — between the `<LiveSwitch …/>` and `<LiveButton …>`, insert:
```vue
                <LiveCheckbox
                  v-else-if="previewSupported && selectedComponent === 'checkbox'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                  :completeness="scanReport.completeness"
                />
                <LiveRadio
                  v-else-if="previewSupported && selectedComponent === 'radio'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                  :completeness="scanReport.completeness"
                />
```
(Mirror the exact `:graph`/`:completeness`/`:highlight-utility` expressions used by the adjacent `<LiveSwitch>` at each site.)

- [ ] **Step 4: "Not yet available" copy** — add `checkbox` and `radio` to the list of preview-capable components, matching the existing `<code>` markup.

- [ ] **Step 5: `npm run typecheck && npx vitest run && npm run build`** → PASS (clean build, template compiles, imports resolve).
- [ ] **Step 6: Commit**
```bash
git add src/app/App.vue
git commit -m "feat(preview): wire checkbox + radio into the live-preview gates + Live pill"
```
Verify no trailer; amend if present.

---

## Final verification (after all tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — green.
- [ ] Headless QA: select `checkbox` — a square that flips background between unchecked/checked + a
  checkmark in the checked cell; select `radio` — a circle that flips + a dot. `Live` pill on both.
  Console clean. Screenshot each.
- [ ] Dispatch a final code reviewer.
- [ ] superpowers:finishing-a-development-branch — **do not push**; merge to `main` by FF only on
  explicit user request.

## Self-review notes

- **Spec coverage:** LiveCheckbox (square/checkmark), LiveRadio (circle/dot), both unchecked/checked
  via the `checked` projection, decorative indicator + size, App.vue 6-way chain + copy. All mapped.
- **No regression:** new components + additive `COMPONENTS_WITH_PREVIEW` entries + new v-else-if
  branches; `LiveSwitch`/others and the `LiveButton` catch-all unchanged.
- **No placeholders:** full LiveCheckbox file, exact LiveRadio diff, exact wiring, tests.
