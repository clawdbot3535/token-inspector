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
