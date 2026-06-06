# switch preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `NUXT_SLOTS` to `switch`/`radio` (so `switch-thumb-*` routes), add a `checked` projection, and build `LiveSwitch` — a token-driven pill track with a decorative thumb, unchecked/checked.

**Architecture:** Task 1 = inventory + `checked` projection (foundation). Task 2 = `LiveSwitch.vue` + tests. Task 3 = `App.vue` wiring.

**Tech Stack:** TS engine + Vue 3 SFC, Vitest + @vue/test-utils + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; every task commit must be green.

**Branch:** `feat/switch-preview` (spec committed at `33e42f6`).

**Spec:** `docs/superpowers/specs/2026-06-06-switch-preview-design.md`

**Reminders:**
- Git attribution disabled globally — NO trailer. Verify with `git log -1 --format=%B`; amend if present.
- `typecheck` does NOT cover `.test.ts`. `heuristicSlotMapping(id, valueType?)` is 2-arg. VTU `.element` is `Element` — cast to `HTMLElement` for `.style`.
- **Correction to the spec:** add `"checked"` ONLY to `STATE_PREFIXES` (and widen `projectToState`'s `state` param type) — do NOT add it to `PREVIEW_STATES`, or `LiveButton` (which maps over `PREVIEW_STATES`) would render a spurious extra "checked" cell.
- No new `extract-arbitrary` work; mirror `LiveBadge`/`LiveButton` for the switch + size-switch pattern.

---

### Task 1: inventory extension + `checked` projection

**Files:**
- Modify: `src/component-vocab.ts`, `src/app/project-to-state.ts`
- Test: `src/component-vocab.test.ts`, `src/app/project-to-state.test.ts`, `src/slot-mapping.test.ts`

- [ ] **Step 1: Failing tests**

`src/component-vocab.test.ts` — add to the `NUXT_SLOTS`/`SLOT_PAIRS`/alias describes:
```typescript
  it("inventories switch and radio slots", () => {
    expect(nuxtSlotsFor("switch")?.has("thumb")).toBe(true);
    expect(nuxtSlotsFor("radio")?.has("indicator")).toBe(true);
  });
  it("aliases the radio dot to the Nuxt indicator slot", () => {
    expect(FIGMA_NUXT_PART_ALIAS.get("dot")).toBe("indicator");
  });
```
`src/app/project-to-state.test.ts` — add:
```typescript
  it("promotes checked: classes on the checked state and drops them on default", () => {
    expect(projectToState("bg-[#A] checked:bg-[#B]", "checked")).toContain("bg-[#B]");
    const def = projectToState("bg-[#A] checked:bg-[#B]", "default");
    expect(def).not.toContain("bg-[#B]");
    expect(def).not.toContain("checked:");
  });
```
`src/slot-mapping.test.ts` — add (routes once switch is inventoried):
```typescript
  it("routes switch-thumb-border to the thumb slot (switch inventoried)", () => {
    expect(heuristicSlotMapping("switch-thumb-border")?.slot).toBe("thumb");
  });
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/component-vocab.test.ts src/app/project-to-state.test.ts src/slot-mapping.test.ts`.

- [ ] **Step 3: Inventory (`component-vocab.ts`)**

In the `NUXT_SLOTS` map, add two entries:
```typescript
  ["switch", new Set(["root", "base", "container", "thumb", "icon", "wrapper", "label", "description"])],
  ["radio", new Set(["root", "fieldset", "legend", "item", "container", "base", "indicator", "wrapper", "label", "description"])],
```
In `FIGMA_NUXT_PART_ALIAS`, add: `["dot", "indicator"],`.

- [ ] **Step 4: `checked` projection (`project-to-state.ts`)**

Add `"checked"` to the `STATE_PREFIXES` set. Widen `projectToState`'s parameter type so `"checked"` is accatable WITHOUT touching `PREVIEW_STATES`:
```typescript
export function projectToState(classString: string, state: PreviewState | "checked"): string {
```
(`PREVIEW_STATES`/`PreviewState` stay as-is. `STATE_PREFIXES` now contains `hover, active, disabled, focus, checked`.)

- [ ] **Step 5: Run → PASS** — `npx vitest run src/component-vocab.test.ts src/app/project-to-state.test.ts src/slot-mapping.test.ts`.

- [ ] **Step 6: Typecheck + full suite** — `npm run typecheck && npx vitest run`. If a golden snapshot (recipe-engine) changed because `switch-thumb-border` now routes, review the diff (a `thumb` slot added to switch) and update with `-u`; report it. No other test should change.

- [ ] **Step 7: Commit**
```bash
git add src/component-vocab.ts src/app/project-to-state.ts src/component-vocab.test.ts src/app/project-to-state.test.ts src/slot-mapping.test.ts
git commit -m "feat(vocab): inventory switch/radio + dot→indicator alias + checked projection"
```
Verify no attribution trailer; amend if present.

---

### Task 2: `LiveSwitch.vue`

**Files:**
- Create: `src/app/components/LiveSwitch.vue`
- Test: `src/app/components/LiveSwitch.test.ts`

- [ ] **Step 1: Failing test**

Create `src/app/components/LiveSwitch.test.ts`:
```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveSwitch from "./LiveSwitch.vue";

function switchGraph() {
  const global = {
    switch: {
      bg: { $value: "#E4E4E7", $type: "color" },
      "bg-checked": { $value: "#4F63D2", $type: "color" },
      border: { $value: "#D4D4D8", $type: "color" },
      "width-md": { $value: 36, $type: "number" },
      "height-md": { $value: 20, $type: "number" },
      radius: { $value: 9999, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
const mountOpts = { global: { stubs: { UIcon: true } } };

describe("LiveSwitch", () => {
  it("shows a fallback message when the graph has no switch tokens", () => {
    const wrapper = mount(LiveSwitch, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(wrapper.findAll('[data-testid="switch-track"]')).toHaveLength(0);
  });
  it("renders an unchecked and a checked track with a thumb, and the checked bg differs", () => {
    const wrapper = mount(LiveSwitch, { props: { graph: switchGraph() }, ...mountOpts });
    const tracks = wrapper.findAll('[data-testid="switch-track"]');
    expect(tracks.length).toBe(2);
    expect(wrapper.findAll('[data-testid="switch-thumb"]').length).toBe(2);
    const bgs = tracks.map((t) => (t.element as HTMLElement).style.backgroundColor);
    // unchecked bg (#E4E4E7) vs checked bg (#4F63D2) — both resolved inline (JIT-safe).
    expect(bgs[0]).not.toBe(bgs[1]);
    expect(bgs.every((b) => b !== "")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL** (file doesn't exist).

- [ ] **Step 3: Create `LiveSwitch.vue`**

```vue
<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
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
  componentName: "switch",
  highlightUtility: undefined,
  completeness: undefined,
});

const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];
const switchRecipe = computed(() => {
  if (!props.graph) return null;
  return buildComponentRecipes(props.graph, { components: [props.componentName] })[props.componentName] ?? null;
});
const baseClasses = computed<string>(() => switchRecipe.value?.slots["base"] ?? "");
const sizes = computed<string[]>(() => {
  const keys = Object.keys(switchRecipe.value?.variants.size ?? {});
  if (keys.length === 0) return ["default"];
  return [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
});
const selectedSize = ref<string>("md");
const activeSize = computed<string>(() =>
  sizes.value.includes(selectedSize.value) ? selectedSize.value : (sizes.value[0] ?? "default"),
);

interface Cell { label: string; classes: string; style: CSSProperties; }
interface HighlightSegment { token: string; highlight: boolean; }

function mergedForActiveSize(): string {
  const sizeClasses = switchRecipe.value?.variants.size?.[activeSize.value]?.["base"] ?? "";
  return [baseClasses.value, sizeClasses].filter((s) => s.length > 0).join(" ").trim();
}
function cellCompleteness(sizeKey: string): CompletenessScore | undefined {
  return props.completeness?.find((c) => c.component === props.componentName && c.variantKey === sizeKey);
}
function highlightSegments(classString: string): HighlightSegment[] {
  const target = props.highlightUtility;
  return classString.split(/\s+/).filter((t) => t.length > 0).map((token) => ({ token, highlight: target !== undefined && token === target }));
}

const cells = computed<Cell[]>(() => {
  if (!switchRecipe.value) return [];
  const merged = mergedForActiveSize();
  return (["default", "checked"] as const).map((state) => {
    const { classes, style } = extractArbitrary(projectToState(merged, state));
    return { label: state === "default" ? "unchecked" : "checked", classes, style };
  });
});
const activeCompleteness = computed<CompletenessScore | undefined>(() => cellCompleteness(activeSize.value));
const inspectClasses = computed<string>(() => mergedForActiveSize());
const segments = computed<HighlightSegment[]>(() => highlightSegments(inspectClasses.value));
const { copy, wasJustCopied } = useCopyToClipboard();
</script>

<template>
  <div class="space-y-4">
    <p v-if="!switchRecipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in
      the loaded graph.
    </p>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="text-[10px] uppercase tracking-wider text-zinc-400">state</span>
        <div
          v-if="sizes.length > 1"
          class="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-[10px] overflow-hidden"
          :title="`Preview size — currently ${activeSize}`"
        >
          <button
            v-for="s in sizes"
            :key="s"
            type="button"
            data-testid="switch-size-switch"
            class="px-1.5 py-0.5 transition-colors"
            :class="activeSize === s ? 'bg-primary text-inverted' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'"
            @click="selectedSize = s"
          >{{ s }}</button>
        </div>
        <span
          v-if="activeCompleteness"
          class="text-[9px] font-mono"
          :class="activeCompleteness.defined === activeCompleteness.total ? 'text-emerald-500' : 'text-amber-500'"
        >{{ activeCompleteness.defined }}/{{ activeCompleteness.total }}</span>
        <button
          type="button"
          class="ml-auto text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{ 'text-success border-success/60': wasJustCopied('liveswitch') }"
          @click="copy(inspectClasses, 'liveswitch')"
          title="Copy classes"
        >{{ wasJustCopied("liveswitch") ? "Copied!" : "Copy" }}</button>
      </div>

      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <div v-for="cell in cells" :key="cell.label" class="flex flex-col items-start gap-1">
          <span
            data-testid="switch-track"
            class="inline-flex items-center min-w-[2.25rem] min-h-[1.25rem] rounded-full border"
            :class="[cell.classes, cell.label === 'checked' ? 'justify-end' : 'justify-start']"
            :style="cell.style"
          >
            <span
              data-testid="switch-thumb"
              class="block h-[70%] aspect-square rounded-full bg-white shadow-sm mx-0.5"
            />
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

(The `min-w`/`min-h`/`rounded-full`/`border` on the track are static fallbacks so the pill is
recognisable even before the recipe's width/height resolve; `cell.classes`/`cell.style` from the
recipe layer the real width/height/bg/border on top. The thumb is decorative.)

- [ ] **Step 4: Run → PASS** — `npx vitest run src/app/components/LiveSwitch.test.ts`.

- [ ] **Step 5: Typecheck + full suite** — `npm run typecheck && npx vitest run`.

- [ ] **Step 6: Commit**
```bash
git add src/app/components/LiveSwitch.vue src/app/components/LiveSwitch.test.ts
git commit -m "feat(preview): LiveSwitch — token-driven track + decorative thumb (unchecked/checked)"
```
Verify no attribution trailer; amend if present.

---

### Task 3: wire switch into `App.vue`

**Files:**
- Modify: `src/app/App.vue`

- [ ] **Step 1: Register + import**
- Add `import LiveSwitch from "./components/LiveSwitch.vue";` by the other Live imports.
- `COMPONENTS_WITH_PREVIEW = new Set(["button", "input", "textarea", "badge", "switch"]);`

- [ ] **Step 2: Mount branch (both sites)**
At each of the two mount sites, add a `LiveSwitch` `v-else-if` AFTER the `LiveBadge` branch and BEFORE the `LiveButton` branch:
- token-selected site:
  ```vue
                <LiveSwitch
                  v-else-if="
                    previewSupported &&
                    selectedComponent === 'switch' &&
                    selectedNode.id.split('-')[0] === selectedComponent
                  "
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                  :highlight-utility="selectedVueTemplateClasses"
                  :completeness="scanReport.completeness"
                />
  ```
- component-selected site:
  ```vue
                <LiveSwitch
                  v-else-if="previewSupported && selectedComponent === 'switch'"
                  :graph="state.graph.value"
                  :component-name="selectedComponent"
                  :completeness="scanReport.completeness"
                />
  ```
(Verify the exact prop expressions match the adjacent `LiveBadge` at each site.)

- [ ] **Step 3: Update the "not yet available" copy** to include `switch` (append `<code class="font-mono">switch</code>` to the list of preview-capable components, matching the existing markup).

- [ ] **Step 4: Typecheck + full suite + build** — `npm run typecheck && npx vitest run && npm run build`.

- [ ] **Step 5: Commit**
```bash
git add src/app/App.vue
git commit -m "feat(preview): wire switch into the live-preview gates + Live pill"
```
Verify no attribution trailer; amend if present.

---

## Final verification (after all tasks)

- [ ] `npm run typecheck && npx vitest run && npm run build` — green.
- [ ] Against the export: `npm run build:tokens`; confirm `switch.slots.thumb` exists (from
  `switch-thumb-border`) and `switch.slots.base` has the track tokens (width/height/radius/bg +
  `checked:bg`). Confirm `unsupported-part` did NOT newly over-fire for `switch` (thumb is a slot /
  thumb-border routes; thumb-color/size's 2nd segment `thumb` is mapped → not flagged). Note any
  new `radio` flag (expected: `radio-dot` with a `dot`→`indicator` rename suggestion).
- [ ] Headless QA: select `switch`; confirm a pill track whose background differs between the
  unchecked and checked cells, a visible thumb (left vs right), the `sm/md` size switch, console
  clean. Wait a tick after a size-switch click before reading. Screenshot.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by
  fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** inventory switch/radio + dot alias (Task 1); checked projection without
  polluting PREVIEW_STATES (Task 1, the spec-correction); LiveSwitch token track + decorative
  thumb + checked/unchecked + size switch (Task 2); wiring (Task 3). All mapped.
- **No regression:** `checked` added only to `STATE_PREFIXES` + the param type, so LiveButton's
  PREVIEW_STATES loop is unchanged; the inventory additions don't touch existing component tests.
- **No placeholders:** full LiveSwitch file, exact vocab/projection edits, exact wiring, tests.
