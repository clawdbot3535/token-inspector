<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "progress",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe, sizeClasses } = usePreviewRecipe(() => props.graph, () => props.componentName);
const trackClasses = computed<string>(() =>
  [recipe.value?.slots["base"] ?? "", sizeClasses.value].filter((s) => s.length > 0).join(" "),
);
const trackRendered = computed(() => extractArbitrary(trackClasses.value));
const indicatorRendered = computed(() => extractArbitrary(recipe.value?.slots["indicator"] ?? ""));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div
        data-testid="progress-track"
        class="w-full max-w-sm overflow-hidden"
        :class="trackRendered.classes"
        :style="trackRendered.style"
      >
        <div
          data-testid="progress-indicator"
          class="h-full"
          :class="indicatorRendered.classes"
          :style="[{ width: '60%' }, indicatorRendered.style]"
        />
      </div>
      <code class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all">{{ trackClasses }}</code>
    </template>
  </div>
</template>
