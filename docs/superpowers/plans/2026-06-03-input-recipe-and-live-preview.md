# Input Recipe + LiveInput Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and golden-pin the `ui.input` recipe the engine already emits, and add a focused `LiveInput.vue` preview, matching the treatment `button` has — with no recipe-engine or slot-mapping-grammar changes.

**Architecture:** The recipe engine is component-agnostic and already emits `ui.input` from the 23 real `input-*` tokens. This cycle (A) characterises that output with a golden snapshot, builds a standalone `LiveInput.vue` that reuses the existing `projectToState` (state promotion) and `extractArbitrary` (JIT-safe inline styles) helpers, and wires it into `App.vue` beside `LiveButton`. Known input deviations (`solid` non-variant, dropped `border-error`/`border-success`) are documented as seeds for Cycle B, not corrected here.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest, `@vue/test-utils` + jsdom, Tailwind v4 (preview via inline-style resolution).

**Spec:** `docs/superpowers/specs/2026-06-03-input-recipe-and-live-preview-design.md`

**Constraint:** Do NOT push. Commit locally per task. CI runs only after the user approves a push.

---

## File Structure

- `src/recipe-engine.test.ts` — **modify**: add an `input` characterisation describe block + golden snapshot.
- `src/__snapshots__/recipe-engine.test.ts.snap` — **regenerated** by the snapshot test (do not hand-edit).
- `src/app/components/LiveInput.vue` — **create**: the input preview (states row + leadingIcon + code block).
- `src/app/components/LiveInput.test.ts` — **create**: mount tests (fallback, JIT-regression inline styles, disabled cue).
- `src/app/App.vue` — **modify**: register `input` for preview, render `LiveInput` for input at the two existing preview spots.
- `CHANGELOG.md` — **modify**: add an Unreleased entry.
- `README.md` — **modify**: roadmap note (input recipe + LiveInput shipped).

Reused as-is (no changes expected):
- `src/app/project-to-state.ts` — `projectToState`, `PREVIEW_STATES`, `PreviewState`.
- `src/app/extract-arbitrary.ts` — `extractArbitrary` (already maps `border`/`h`/`ring`/`bg`/`size`/`rounded`/`text`/`font`).
- `@core/recipe-engine.js` — `buildComponentRecipes`.

---

## Task 1: Golden-pin the `ui.input` recipe (characterisation)

This is a **characterisation test**: it pins the engine's *current* `input` output so future changes are visible diffs, and its explicit assertions encode the Cycle-B seeds. No production code changes.

**Files:**
- Modify: `src/recipe-engine.test.ts` (append a new describe block at end of file)
- Regenerates: `src/__snapshots__/recipe-engine.test.ts.snap`

- [ ] **Step 1: Write the characterisation test**

Append to `src/recipe-engine.test.ts` (it already imports `buildComponentRecipes`; add `buildGraph` + `SourceFile` imports at the top if not present — check existing imports first and reuse them):

```typescript
import { buildGraph } from "./build-graph.js";
import type { SourceFile } from "./token-graph.js";

// Mirrors the real `input` subtree in components/global.tokens.json (literal
// values so the snapshot is hermetic — the real export resolves these to
// var() refs, which the CLI e2e step in the plan verifies separately).
function inputGraph() {
  const global = {
    input: {
      border: { $value: "#D4D4D8", $type: "color" },
      "border-hover": { $value: "#A1A1AA", $type: "color" },
      "border-focus": { $value: "#3B82F6", $type: "color" },
      "border-disabled": { $value: "#E4E4E7", $type: "color" },
      "border-error": { $value: "#EF4444", $type: "color" },
      "border-success": { $value: "#22C55E", $type: "color" },
      "bg-disabled": { $value: "#F4F4F5", $type: "color" },
      text: { $value: "#18181B", $type: "color" },
      "text-disabled": { $value: "#A1A1AA", $type: "color" },
      placeholder: { $value: "#71717A", $type: "color" },
      "placeholder-disabled": { $value: "#D4D4D8", $type: "color" },
      "solid-bg": { $value: "#FAFAFA", $type: "color" },
      "outline-bg": { $value: "#FFFFFF", $type: "color" },
      "ring-focus": { $value: "#3B82F6", $type: "color" },
      height: { $value: 36, $type: "number" },
      "padding-x": { $value: 6, $type: "number" },
      "padding-y": { $value: 8, $type: "number" },
      radius: { $value: 6, $type: "number" },
      "radius-focus": { $value: 8, $type: "number" },
      "ring-offset": { $value: 4, $type: "number" },
      "font-size": { $value: 14, $type: "number" },
      "font-weight": { $value: 400, $type: "number" },
      "icon-size-md": { $value: 16, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

describe("buildComponentRecipes — input characterisation (cycle A baseline)", () => {
  it("pins the emitted ui.input recipe block", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    expect(recipes["input"]).toMatchSnapshot();
  });

  it("promotes interaction-state tokens to pseudo-class prefixes on base", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).toContain("focus:border-[#3B82F6]");
    expect(base).toContain("hover:border-[#A1A1AA]");
    expect(base).toContain("disabled:bg-[#F4F4F5]");
    expect(base).toContain("focus:rounded-lg");
  });

  it("SEED for cycle B: input-border-error/success are silently dropped (no color axis)", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    // The validation-state border colors map to nothing today — documented as
    // the `silently-dropped-token` deviation for the cycle-B detection layer.
    expect(recipes["input"]?.variants.color).toBeUndefined();
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).not.toContain("#EF4444");
    expect(base).not.toContain("#22C55E");
  });

  it("SEED for cycle B: emits a `solid` variant that Nuxt UI input does not define", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    // `solid` is not a Nuxt UI v4 input variant — `variant-not-in-target` seed.
    expect(recipes["input"]?.variants.variant?.["solid"]).toBeDefined();
    expect(recipes["input"]?.variants.variant?.["outline"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to generate the snapshot and verify assertions**

Run: `npx vitest run src/recipe-engine.test.ts`
Expected: PASS. A new `input characterisation` snapshot is written to `src/__snapshots__/recipe-engine.test.ts.snap`. The four `it` blocks pass (they assert current behavior).

- [ ] **Step 3: Eyeball the generated snapshot**

Run: `git diff src/__snapshots__/recipe-engine.test.ts.snap`
Confirm the new `input` block contains: `slots.base` with `focus:`/`hover:`/`disabled:` prefixes, `h-[36px]`, `px-1.5 py-2`, `rounded-md`, `ring-offset-[4px]`; `variants.size.md.leadingIcon` = `size-4`; `variants.variant.outline` and `variants.variant.solid`; and NO `variants.color`. This is the honest baseline (deviations included).

- [ ] **Step 4: Commit**

```bash
git add src/recipe-engine.test.ts src/__snapshots__/recipe-engine.test.ts.snap
git commit -m "test: golden-pin ui.input recipe + document cycle-B deviation seeds"
```

---

## Task 2: Write the failing `LiveInput` mount test

**Files:**
- Create: `src/app/components/LiveInput.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/components/LiveInput.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { buildGraph } from "@core/build-graph.js";
import type { SourceFile } from "@core/token-graph.js";
import LiveInput from "./LiveInput.vue";

// Minimal input graph exercising state-prefixed border colors + an arbitrary
// height. Distinct per-state border colors prove each state cell resolves its
// own promoted classes to inline styles (the JIT-class regression guard).
function inputGraph() {
  const global = {
    input: {
      border: { $value: "#D4D4D8", $type: "color" },
      "border-hover": { $value: "#A1A1AA", $type: "color" },
      "border-focus": { $value: "#3B82F6", $type: "color" },
      "bg-disabled": { $value: "#F4F4F5", $type: "color" },
      "border-disabled": { $value: "#E4E4E7", $type: "color" },
      height: { $value: 36, $type: "number" },
      "padding-x": { $value: 6, $type: "number" },
      "padding-y": { $value: 8, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

// UIcon is an app-global auto-import; stub it so mounting needs no Nuxt UI plugin.
const mountOpts = { global: { stubs: { UIcon: true } } };

function previewInputs(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll("input");
}

describe("LiveInput", () => {
  it("shows a fallback message and no preview when the graph has no input tokens", () => {
    const wrapper = mount(LiveInput, { props: { graph: null }, ...mountOpts });
    expect(wrapper.text()).toContain("No");
    expect(previewInputs(wrapper)).toHaveLength(0);
  });

  it("renders one input per state with inline border/height (JIT-class regression)", () => {
    const wrapper = mount(LiveInput, { props: { graph: inputGraph() }, ...mountOpts });
    const inputs = previewInputs(wrapper);
    // default / hover / focus / disabled
    expect(inputs.length).toBe(4);

    // height-[36px] resolves to an inline style on every cell, not the JIT.
    expect(inputs.every((i) => i.element.style.height === "36px")).toBe(true);

    // Each state promotes its own border color → distinct inline borderColor.
    const borderColors = new Set(inputs.map((i) => i.element.style.borderColor));
    expect(borderColors.size).toBeGreaterThanOrEqual(3);
  });

  it("applies the disabled opacity/cursor cue to the disabled cell only", () => {
    const wrapper = mount(LiveInput, { props: { graph: inputGraph() }, ...mountOpts });
    const inputs = previewInputs(wrapper);
    const dimmed = inputs.filter((i) => i.element.style.opacity === "0.6");
    expect(dimmed).toHaveLength(1);
    expect(dimmed[0]!.element.style.cursor).toBe("not-allowed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/components/LiveInput.test.ts`
Expected: FAIL — `Failed to resolve import "./LiveInput.vue"` (the component does not exist yet).

---

## Task 3: Implement `LiveInput.vue`

**Files:**
- Create: `src/app/components/LiveInput.vue`

- [ ] **Step 1: Write the component**

Create `src/app/components/LiveInput.vue`:

```vue
<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCopyToClipboard } from "../composables/use-copy-to-clipboard.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState, type PreviewState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  /** Component name to preview (matches a key in the token graph). */
  componentName?: string;
  /** Lucide icon name rendered in the leading slot when the recipe declares one. */
  iconName?: string;
  /** Tailwind utility to highlight inside the code block (selected token's class). */
  highlightUtility?: string;
  /** Completeness scores from the scan report; renders an n/m badge when present. */
  completeness?: ReadonlyArray<CompletenessScore>;
}

const props = withDefaults(defineProps<Props>(), {
  componentName: "input",
  iconName: "i-lucide-search",
  highlightUtility: undefined,
  completeness: undefined,
});

// Inputs render the states the recipe actually encodes. `active` (in
// PREVIEW_STATES) is omitted because inputs have no active token family;
// `error`/`success` validation colors are dropped by the engine today and
// surfaced as a Scan-View deviation in cycle B, not rendered here.
const INPUT_STATES: ReadonlyArray<PreviewState> = ["default", "hover", "focus", "disabled"];

const inputRecipe = computed(() => {
  if (!props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, {
    components: [props.componentName],
  });
  return recipes[props.componentName] ?? null;
});

const baseClasses = computed<string>(() => inputRecipe.value?.slots["base"] ?? "");

interface PreviewCell {
  /** State key shown under the input. */
  label: string;
  /** Class string with arbitrary/scale classes removed (for the live input). */
  inputClasses: string;
  /** Inline style hosting values Tailwind JIT can't see. */
  style: CSSProperties;
}

interface HighlightSegment {
  token: string;
  highlight: boolean;
}

/** Tokenise a class string and flag tokens equal to the highlight target. */
function highlightSegments(classString: string): HighlightSegment[] {
  const target = props.highlightUtility;
  return classString
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((token) => ({ token, highlight: target !== undefined && token === target }));
}

const stateCells = computed<PreviewCell[]>(() => {
  const base = baseClasses.value;
  if (base.length === 0) return [];
  return INPUT_STATES.map((state) => {
    const projected = projectToState(base, state);
    const { classes: inputClasses, style } = extractArbitrary(projected);
    // Spread into a new object rather than mutating extractArbitrary's result.
    const cellStyle: CSSProperties =
      state === "disabled"
        ? { ...style, opacity: "0.6", cursor: "not-allowed" }
        : style;
    return { label: state, inputClasses, style: cellStyle };
  });
});

const segments = computed<HighlightSegment[]>(() => highlightSegments(baseClasses.value));

/** Completeness score for this component's base slot, when a scan report is present. */
const baseCompleteness = computed<CompletenessScore | undefined>(() =>
  props.completeness?.find((c) => c.component === props.componentName),
);

// Show a leading icon when the recipe declares a leadingIcon slot (input
// icon-size tokens land there). The icon size resolves to an inline style.
const hasLeadingIcon = computed<boolean>(() => {
  const r = inputRecipe.value;
  if (!r) return false;
  if (r.slots.leadingIcon) return true;
  for (const slots of Object.values(r.variants.size ?? {})) {
    if (slots.leadingIcon) return true;
  }
  return false;
});

const iconStyle = computed<CSSProperties>(() => {
  const r = inputRecipe.value;
  const cls = r?.slots.leadingIcon ?? r?.variants.size?.["md"]?.leadingIcon ?? "";
  return extractArbitrary(cls).style;
});

const { copy, wasJustCopied } = useCopyToClipboard();
</script>

<template>
  <div class="space-y-4">
    <p v-if="!inputRecipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in
      the loaded graph.
    </p>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="text-[10px] uppercase tracking-wider text-zinc-400">state</span>
        <span
          v-if="baseCompleteness"
          class="text-[9px] font-mono"
          :class="
            baseCompleteness.defined === baseCompleteness.total
              ? 'text-emerald-500'
              : 'text-amber-500'
          "
        >
          {{ baseCompleteness.defined }}/{{ baseCompleteness.total }}
        </span>
        <button
          type="button"
          class="ml-auto text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          :class="{ 'text-success border-success/60': wasJustCopied('liveinput-base') }"
          @click="copy(baseClasses, 'liveinput-base')"
          title="Copy base classes"
        >
          {{ wasJustCopied("liveinput-base") ? "Copied!" : "Copy" }}
        </button>
      </div>

      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <div
          v-for="cell in stateCells"
          :key="`state-${cell.label}`"
          class="flex flex-col items-start gap-1 min-w-[160px]"
        >
          <div class="relative inline-flex items-center w-full">
            <UIcon
              v-if="hasLeadingIcon"
              :name="iconName"
              class="absolute left-2 shrink-0 text-zinc-400 pointer-events-none"
              :style="iconStyle"
            />
            <input
              type="text"
              placeholder="Placeholder"
              :class="cell.inputClasses + ' w-full' + (hasLeadingIcon ? ' pl-7' : '')"
              :style="cell.style"
              :disabled="cell.label === 'disabled'"
            />
          </div>
          <span class="text-[10px] text-zinc-500 font-mono">{{ cell.label }}</span>
        </div>
      </div>

      <code
        class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all"
      >
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

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run src/app/components/LiveInput.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 3: Typecheck the component**

Run: `npx vue-tsc --noEmit -p tsconfig.json` (or the project's `typecheck` script: `npm run typecheck`)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/LiveInput.vue src/app/components/LiveInput.test.ts
git commit -m "feat(preview): add LiveInput component for the input recipe"
```

---

## Task 4: Wire `LiveInput` into `App.vue`

`App.vue` gates the preview on `COMPONENTS_WITH_PREVIEW` and renders `<LiveButton>` at two spots (token-selected view ~line 622, component-only view ~line 672). Add `input` to the supported set and render `LiveInput` instead of `LiveButton` when the focused component is `input`.

**Files:**
- Modify: `src/app/App.vue`

- [ ] **Step 1: Import LiveInput**

Below the existing `import LiveButton from "./components/LiveButton.vue";` (~line 17), add:

```typescript
import LiveInput from "./components/LiveInput.vue";
```

- [ ] **Step 2: Add `input` to the supported-preview set**

Change the set (~line 128):

```typescript
const COMPONENTS_WITH_PREVIEW: ReadonlySet<string> = new Set(["button", "input"]);
```

- [ ] **Step 3: Render LiveInput at the token-selected spot**

Replace the first `<LiveButton>` block (~lines 622-632) with a mutually-exclusive pair (LiveInput for input, LiveButton otherwise):

```vue
              <LiveInput
                v-if="
                  previewSupported &&
                  selectedComponent === 'input' &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :icon-name="iconForSelectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
              <LiveButton
                v-else-if="
                  previewSupported &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :icon-name="iconForSelectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
```

- [ ] **Step 4: Render LiveInput at the component-only spot**

Replace the second `<LiveButton>` block (~lines 672-678) with:

```vue
              <LiveInput
                v-if="previewSupported && selectedComponent === 'input'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :icon-name="iconForSelectedComponent"
                :completeness="scanReport.completeness"
              />
              <LiveButton
                v-else-if="previewSupported"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :icon-name="iconForSelectedComponent"
                :completeness="scanReport.completeness"
              />
```

- [ ] **Step 5: Update the "button-only" warn-box copy**

In the `v-else` warn box (~lines 683-695), update the two sentences that claim only `button` is supported so they read `button` and `input`. Change:

```
                  Only <code class="font-mono">button</code> has a rendered
                  preview today — other components produce the correct
```

to:

```
                  Only <code class="font-mono">button</code> and
                  <code class="font-mono">input</code> have a rendered
                  preview today — other components produce the correct
```

- [ ] **Step 6: Typecheck + full test run**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass (existing 282 + new input/LiveInput tests).

- [ ] **Step 7: Build the app**

Run: `npm run build`
Expected: build succeeds (this is the check that the `App.vue` template edits are valid, since there is no App.vue mount test).

- [ ] **Step 8: Commit**

```bash
git add src/app/App.vue
git commit -m "feat(preview): render LiveInput for the input component in the inspector"
```

---

## Task 5: Verify end-to-end + docs (no push)

**Files:**
- Modify: `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Verify the real export emits the pinned shape**

Run: `npx tsx scripts/build-cli.ts`
Then inspect the `input:` block in `output/nuxt/app.config.ts` (gitignored). Confirm it matches the structure pinned in Task 1 — `slots.base` with `focus:`/`hover:`/`disabled:` prefixes, `variants.size.md.leadingIcon`, `variants.variant.outline`+`solid`, no `color` axis. (Real values are `var(--…)` refs; the unit snapshot uses literals — structure is what must match.)

Expected: structure matches; `input-border-error`/`input-border-success` absent (the documented drop).

- [ ] **Step 2: Manual visual QA (user performs locally)**

Run the inspector dev server (`npm run dev` or the project's app script), load the `components/` tokens, click the `input` component group. Confirm:
- Four state cells render real `<input>` elements: default / hover / focus / disabled.
- Borders, radius, height, padding, placeholder color are visible and differ by state (focus border vs default border, disabled is dimmed).
- The leading icon renders at the `size-4` size.
- Clicking an `input-*` token highlights its class in the code block.

- [ ] **Step 3: Add CHANGELOG entry**

Add under an `## [Unreleased]` heading in `CHANGELOG.md` (create the heading if absent, above the latest version):

```markdown
## [Unreleased]

### Added

- **`input` recipe verified + `LiveInput` preview.** The `ui.input` recipe the
  engine already emits is now pinned by a golden snapshot, and a bespoke
  `LiveInput.vue` renders the input across its real interaction states
  (default / hover / focus / disabled) with JIT-safe inline styles, matching
  the `button` treatment. No engine or grammar changes.

### Known deviations (seeds for the cycle-B detection layer)

- `input-border-error` / `input-border-success` are silently dropped by the
  recipe grammar (`<comp>-border-<colorrole>` matches no rule).
- `input-solid-bg` emits a `solid` variant that Nuxt UI v4 `input` does not define.
```

- [ ] **Step 4: Update the README roadmap note**

In `README.md`, in the `## Status` / `## Roadmap` area, note that `input` now has a verified recipe + `LiveInput` preview (the first component past `button` on the v0.5.0 recipe-output track). Keep it to one or two sentences consistent with the existing roadmap voice; do not restructure the table.

- [ ] **Step 5: Final verification**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 6: Commit (do NOT push)**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: changelog + roadmap note for input recipe and LiveInput"
```

Stop here. Report status to the user and await an explicit push/QA-sign-off decision.

---

## Self-Review

**Spec coverage:**
- Spec A1 (verify & golden-pin) → Task 1. ✓
- Spec A2 (LiveInput.vue, standalone, extractArbitrary, state promotion, disabled cue, leadingIcon) → Tasks 2-3. ✓
- Spec A3 (tests: component test + golden snapshot) → Task 1 (snapshot) + Task 2 (component). ✓
- Spec A4 (e2e CLI verify + manual visual QA, no push) → Task 5 steps 1-2. ✓
- Spec "states default/hover/focus/disabled only; error/success not rendered" → `INPUT_STATES` in Task 3 + Task 1 drop-seed assertion. ✓
- Spec "no engine/grammar change" → no task touches `recipe-engine.ts` / `slot-mapping.ts`. ✓
- Spec out-of-scope B-seeds documented → Task 1 assertions + Task 5 CHANGELOG. ✓
- Spec risk "JIT preview pitfall" → resolved during research (`extractArbitrary` already maps every input family); Task 2 guards it with the inline-style regression test. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. The only prose-directed step is Task 5 Step 4 (README one-liner in existing voice) — intentional, low-risk wording, not code.

**Type consistency:** `Props`, `PreviewCell`, `HighlightSegment` defined in Task 3 and used only there. `INPUT_STATES: ReadonlyArray<PreviewState>` uses `PreviewState` imported from `project-to-state.ts`. Test helper names (`inputGraph`, `previewInputs`) are self-contained per file. `buildComponentRecipes` option shape (`{ components: [...] }`) matches existing usage. Component prop names (`graph`, `component-name`, `icon-name`, `highlight-utility`, `completeness`) match `LiveInput` `Props` and mirror `LiveButton`'s wiring in `App.vue`.
