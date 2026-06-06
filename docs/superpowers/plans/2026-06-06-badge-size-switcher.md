# badge size switcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `LiveBadge`'s fixed per-size rows with a `sm/md/…` size switcher (one colour row for the selected size), mirroring `LiveButton`'s switcher. `LiveBadge` only.

**Architecture:** One file: `LiveBadge.vue` is rewritten — a `selectedSize` ref + guarded `activeSize` computed, a single-row `cells` computed (was per-size `rows`), and a header switcher shown when `sizes.length > 1`. Tests updated to the new structure.

**Tech Stack:** Vue 3 SFC, Vitest + `@vue/test-utils` + jsdom, vue-tsc. Pre-commit hook = `vue-tsc` + full vitest suite; the commit must be green.

**Branch:** `feat/badge-size-switcher` (spec committed at `9053e0d`).

**Spec:** `docs/superpowers/specs/2026-06-06-badge-size-switcher-design.md`

**Reminders:**
- Git attribution disabled globally — NO `Co-Authored-By`/"Generated with" trailer. Verify with `git log -1 --format=%B`; amend if present.
- The project `typecheck` does NOT cover `.test.ts` — get props/casts right by hand. VTU's `DOMWrapper.element` is `Element`; cast to `HTMLElement` before `.style` (as the existing badge tests do).
- No new `extract-arbitrary` work; the switcher mirrors `LiveButton`'s `stateAxisSize` toggle markup.

---

### Task 1: size switcher in `LiveBadge.vue`

**Files:**
- Rewrite: `src/app/components/LiveBadge.vue`
- Test: `src/app/components/LiveBadge.test.ts`

- [ ] **Step 1: Update the tests (RED)**

In `src/app/components/LiveBadge.test.ts`, keep the existing `badgeGraph()` helper and `mountOpts`.
Add a single-size helper after `badgeGraph()`:

```typescript
// Same two colours but only one size (md) — exercises the "no switcher" path.
function badgeGraphOneSize() {
  const global = {
    badge: {
      radius: { $value: 2, $type: "number" },
      "default-bg": { $value: "#F4F4F5", $type: "color" },
      "default-border": { $value: "#D4D4D8", $type: "color" },
      "default-text": { $value: "#52525B", $type: "color" },
      "error-bg": { $value: "#FEE2E2", $type: "color" },
      "error-border": { $value: "#EF4444", $type: "color" },
      "error-text": { $value: "#991B1B", $type: "color" },
      "padding-x-md": { $value: 6, $type: "number" },
      "font-size-md": { $value: 10, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}
```

Replace the existing "renders a colour×size matrix" test (the one asserting 4 cells + 2
`badge-size-label`s) with these. Keep the `fallback` test and the `border` (JIT guard) test as-is:

```typescript
  it("renders one colour row for the active size, with a size switcher", () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    const cells = wrapper.findAll('[data-testid="badge-cell"]');
    // One row → one cell per colour (2), NOT colours×sizes.
    expect(cells.length).toBe(2);
    expect(cells.every((c) => c.element.tagName === "SPAN")).toBe(true);
    // Two sizes (sm, md) → two switch buttons.
    expect(wrapper.findAll('[data-testid="badge-size-switch"]').length).toBe(2);
  });

  it("switches the rendered size when another size button is clicked", async () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraph() }, ...mountOpts });
    const before = wrapper.find('[data-testid="badge-cell"]').attributes("class");
    const buttons = wrapper.findAll('[data-testid="badge-size-switch"]');
    // default active size is md; click the other (sm).
    const sm = buttons.find((b) => b.text() === "sm")!;
    await sm.trigger("click");
    const after = wrapper.find('[data-testid="badge-cell"]').attributes("class");
    // sm vs md carry different scale classes (px-1 vs px-1.5), so the class string changes.
    expect(after).not.toBe(before);
  });

  it("shows no switcher when the recipe has a single size", () => {
    const wrapper = mount(LiveBadge, { props: { graph: badgeGraphOneSize() }, ...mountOpts });
    expect(wrapper.findAll('[data-testid="badge-size-switch"]')).toHaveLength(0);
    // The colour row still renders.
    expect(wrapper.findAll('[data-testid="badge-cell"]').length).toBe(2);
  });
```

(If a `badge-size-label` assertion remains anywhere, delete it — that testid is removed.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/components/LiveBadge.test.ts`
Expected: FAIL — the current `LiveBadge` renders per-size rows (4 cells, `badge-size-label`s) and
has no `badge-size-switch` buttons.

- [ ] **Step 3: Rewrite `LiveBadge.vue`**

Replace the entire contents of `src/app/components/LiveBadge.vue` with:

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
  /** Component name to preview (matches a key in the token graph). */
  componentName?: string;
  /** Tailwind utility to highlight inside the representative code block. */
  highlightUtility?: string;
  /** Completeness scores from the scan report; renders an n/m badge for the active size. */
  completeness?: ReadonlyArray<CompletenessScore>;
}

const props = withDefaults(defineProps<Props>(), {
  componentName: "badge",
  highlightUtility: undefined,
  completeness: undefined,
});

// Smallest → largest, for ordering the size switcher. Typed as string[] so a recipe
// size key that isn't in this list sorts to the front (indexOf -1) without `any`.
const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];

const badgeRecipe = computed(() => {
  if (!props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, { components: [props.componentName] });
  return recipes[props.componentName] ?? null;
});

const baseClasses = computed<string>(() => badgeRecipe.value?.slots["base"] ?? "");

// Sizes (ordered) and colour roles, derived from the recipe. A single "default"
// pseudo-key stands in when an axis is absent so a thin badge graph still renders.
const sizes = computed<string[]>(() => {
  const keys = Object.keys(badgeRecipe.value?.variants.size ?? {});
  if (keys.length === 0) return ["default"];
  return [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
});
const colors = computed<string[]>(() => {
  const keys = Object.keys(badgeRecipe.value?.variants.color ?? {});
  if (keys.length === 0) return ["default"];
  return [...keys].sort();
});

// The switcher's selected size, resolved through `activeSize` so a graph change can
// never leave the row pointed at a size the recipe no longer has.
const selectedSize = ref<string>("md");
const activeSize = computed<string>(() =>
  sizes.value.includes(selectedSize.value) ? selectedSize.value : (sizes.value[0] ?? "default"),
);

interface BadgeCell {
  color: string;
  classes: string;
  style: CSSProperties;
}
interface HighlightSegment {
  token: string;
  highlight: boolean;
}

function mergedFor(color: string, size: string): string {
  const recipe = badgeRecipe.value;
  const colorClasses = recipe?.variants.color?.[color]?.["base"] ?? "";
  const sizeClasses = recipe?.variants.size?.[size]?.["base"] ?? "";
  return [baseClasses.value, colorClasses, sizeClasses]
    .filter((s) => s.length > 0)
    .join(" ")
    .trim();
}

function cellCompleteness(sizeKey: string): CompletenessScore | undefined {
  return props.completeness?.find(
    (c) => c.component === props.componentName && c.variantKey === sizeKey,
  );
}

function highlightSegments(classString: string): HighlightSegment[] {
  const target = props.highlightUtility;
  return classString
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((token) => ({ token, highlight: target !== undefined && token === target }));
}

// One row: a cell per colour at the active size.
const cells = computed<BadgeCell[]>(() => {
  if (!badgeRecipe.value) return [];
  return colors.value.map((color) => {
    const { classes, style } = extractArbitrary(
      projectToState(mergedFor(color, activeSize.value), "default"),
    );
    return { color, classes, style };
  });
});

const activeCompleteness = computed<CompletenessScore | undefined>(() =>
  cellCompleteness(activeSize.value),
);

// Representative class string for the code block: first colour × the active size.
const inspectClasses = computed<string>(() =>
  mergedFor(colors.value[0] ?? "default", activeSize.value),
);
const segments = computed<HighlightSegment[]>(() => highlightSegments(inspectClasses.value));

const { copy, wasJustCopied } = useCopyToClipboard();
</script>

<template>
  <div class="space-y-4">
    <p v-if="!badgeRecipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in
      the loaded graph.
    </p>

    <template v-else>
      <div class="flex items-center gap-3">
        <span class="text-[10px] uppercase tracking-wider text-zinc-400">colour</span>

        <!-- Size switcher — shown only when there is more than one size. -->
        <div
          v-if="sizes.length > 1"
          class="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-[10px] overflow-hidden"
          :title="`Preview size — currently ${activeSize}`"
        >
          <button
            v-for="s in sizes"
            :key="s"
            type="button"
            data-testid="badge-size-switch"
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
          :class="{ 'text-success border-success/60': wasJustCopied('livebadge') }"
          @click="copy(inspectClasses, 'livebadge')"
          title="Copy representative classes"
        >
          {{ wasJustCopied("livebadge") ? "Copied!" : "Copy" }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2 items-center">
        <span
          v-for="cell in cells"
          :key="`badge-${cell.color}`"
          data-testid="badge-cell"
          class="inline-flex items-center"
          :class="cell.classes"
          :style="cell.style"
          :title="`${cell.color} · ${activeSize}`"
        >{{ cell.color }}</span>
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/components/LiveBadge.test.ts`
Expected: PASS — one colour row (2 cells), a 2-button switcher, clicking `sm` changes the cell
classes, single-size graph shows no switcher, fallback + border guard still pass.

- [ ] **Step 5: Typecheck + full suite + build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/LiveBadge.vue src/app/components/LiveBadge.test.ts
git commit -m "feat(preview): badge size switcher (one colour row per selected size)"
```
Verify no attribution trailer (`git log -1 --format=%B`); amend if present.

---

## Final verification (after the task)

- [ ] `npm run typecheck && npx vitest run && npm run build` — all green.
- [ ] Headless QA (committed `components/*.tokens.json`): start `npm run dev`, select `badge`;
  confirm a `sm/md` switcher, one colour row that updates when toggled, coloured backgrounds +
  borders, console clean. Screenshot. Stop the dev server after.
- [ ] Dispatch a final code reviewer.
- [ ] Then superpowers:finishing-a-development-branch — **do not push**; merge to `main` by
  fast-forward only on explicit user request.

## Self-review notes

- **Spec coverage:** `selectedSize` + guarded `activeSize`; single-row `cells`; header switcher
  gated on `sizes.length > 1`; completeness once; `inspectClasses` on active size; tests for
  one-row / switcher-present / switch-rerenders / no-switcher-≤1-size (Step 1). All mapped.
- **Immutability / quality:** `extractArbitrary`'s style used directly (no mutation); no `any`;
  `BadgeCell`/`HighlightSegment` kept, `SizeRow` removed; `data-testid="badge-cell"` preserved.
- **No regression:** scanner/recipe untouched; other previews untouched.
- **No placeholders:** full file + exact commands + expected results.
