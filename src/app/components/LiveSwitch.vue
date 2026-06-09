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

interface Cell { label: string; classes: string; style: CSSProperties; thumbClasses: string; thumbStyle: CSSProperties; }
interface HighlightSegment { token: string; highlight: boolean; }

function mergedForActiveSize(): string {
  const sizeClasses = switchRecipe.value?.variants.size?.[activeSize.value]?.["base"] ?? "";
  return [baseClasses.value, sizeClasses].filter((s) => s.length > 0).join(" ").trim();
}
function thumbFor(state: "default" | "checked"): { classes: string; style: CSSProperties } {
  const slotCls = switchRecipe.value?.slots["thumb"] ?? "";
  const sizeCls = switchRecipe.value?.variants.size?.[activeSize.value]?.["thumb"] ?? "";
  const merged = [slotCls, sizeCls].filter((s) => s.length > 0).join(" ");
  const { classes, style } = extractArbitrary(projectToState(merged, state));
  // The thumb is a shape, not text: a bare `color` token maps as text-color
  // (CSS `color`), but visually it is the knob's fill — promote it.
  if (style.color !== undefined && style.backgroundColor === undefined) {
    return { classes, style: { ...style, backgroundColor: style.color } };
  }
  return { classes, style };
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
    const thumb = thumbFor(state);
    return { label: state === "default" ? "unchecked" : "checked", classes, style, thumbClasses: thumb.classes, thumbStyle: thumb.style };
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
              :class="cell.thumbClasses"
              :style="cell.thumbStyle"
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
