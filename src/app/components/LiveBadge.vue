<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
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
  /** Completeness scores from the scan report; renders an n/m badge per size row. */
  completeness?: ReadonlyArray<CompletenessScore>;
}

const props = withDefaults(defineProps<Props>(), {
  componentName: "badge",
  highlightUtility: undefined,
  completeness: undefined,
});

// Smallest → largest, for ordering the size rows. Typed as string[] so a recipe
// size key that isn't in this list sorts to the front (indexOf -1) without `any`.
const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];

const badgeRecipe = computed(() => {
  if (!props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, { components: [props.componentName] });
  return recipes[props.componentName] ?? null;
});

const baseClasses = computed<string>(() => badgeRecipe.value?.slots["base"] ?? "");

// Size rows (ordered) and colour columns, derived from the recipe. A single
// "default" pseudo-key stands in when an axis is absent so a thin badge graph
// still renders one row / one cell.
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

interface BadgeCell {
  color: string;
  classes: string;
  style: CSSProperties;
}
interface SizeRow {
  size: string;
  cells: BadgeCell[];
  completeness?: CompletenessScore;
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

const rows = computed<SizeRow[]>(() => {
  if (!badgeRecipe.value) return [];
  return sizes.value.map((size) => ({
    size,
    cells: colors.value.map((color) => {
      const { classes, style } = extractArbitrary(projectToState(mergedFor(color, size), "default"));
      return { color, classes, style };
    }),
    completeness: cellCompleteness(size),
  }));
});

// Representative class string for the code block: first colour × md (else first size).
const inspectClasses = computed<string>(() => {
  const size = sizes.value.includes("md") ? "md" : (sizes.value[0] ?? "default");
  const color = colors.value[0] ?? "default";
  return mergedFor(color, size);
});
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
        <span class="text-[10px] uppercase tracking-wider text-zinc-400">
          colour × size
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

      <div class="grid grid-cols-[56px_1fr] gap-y-4 gap-x-4 items-start">
        <template v-for="row in rows" :key="`size-${row.size}`">
          <div
            data-testid="badge-size-label"
            class="text-[10px] uppercase tracking-wider text-zinc-400 pt-1.5 flex flex-col gap-0.5"
          >
            <span>{{ row.size }}</span>
            <span
              v-if="row.completeness"
              class="font-mono"
              :class="
                row.completeness.defined === row.completeness.total
                  ? 'text-emerald-500'
                  : 'text-amber-500'
              "
            >
              {{ row.completeness.defined }}/{{ row.completeness.total }}
            </span>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <span
              v-for="cell in row.cells"
              :key="`badge-${row.size}-${cell.color}`"
              data-testid="badge-cell"
              class="inline-flex items-center"
              :class="cell.classes"
              :style="cell.style"
              :title="`${cell.color} · ${row.size}`"
            >{{ cell.color }}</span>
          </div>
        </template>
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
