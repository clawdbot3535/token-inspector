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
  componentName: "radio",
  highlightUtility: undefined,
  completeness: undefined,
});

const recipe = computed(() => {
  if (!props.graph) return null;
  return buildComponentRecipes(props.graph, { components: [props.componentName] })[props.componentName] ?? null;
});
const baseClasses = computed<string>(() => recipe.value?.slots["base"] ?? "");
// The checked fill lives on the `indicator` slot (the dot only shows when
// checked) — merged into the checked cell so it reads as the checked background.
const indicatorClasses = computed<string>(() => recipe.value?.slots["indicator"] ?? "");

const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];
const sizeClasses = computed<string>(() => {
  const sizes = recipe.value?.variants.size ?? {};
  const keys = Object.keys(sizes);
  if (keys.length === 0) return "";
  const key = keys.includes("md")
    ? "md"
    : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
  return sizes[key]?.["base"] ?? "";
});

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
  const base = [baseClasses.value, sizeClasses.value].filter((s) => s.length > 0).join(" ");
  return (["default", "checked"] as const).map((state) => {
    const merged =
      state === "checked"
        ? [base, indicatorClasses.value].filter((s) => s.length > 0).join(" ")
        : base;
    const { classes, style } = extractArbitrary(projectToState(merged, state));
    return { label: state === "default" ? "unchecked" : "checked", checked: state === "checked", classes, style };
  });
});
const inspectClasses = computed<string>(() =>
  [baseClasses.value, sizeClasses.value].filter((s) => s.length > 0).join(" "),
);
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
          :class="{ 'text-success border-success/60': wasJustCopied('liveradio') }"
          @click="copy(inspectClasses, 'liveradio')"
          title="Copy classes"
        >{{ wasJustCopied("liveradio") ? "Copied!" : "Copy" }}</button>
      </div>

      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <div v-for="cell in cells" :key="cell.label" class="flex flex-col items-start gap-1">
          <span
            data-testid="radio-box"
            class="inline-flex items-center justify-center size-5 rounded-full"
            :class="cell.classes"
            :style="cell.style"
          >
            <span v-if="cell.checked" class="block size-1.5 rounded-full bg-white" />
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
