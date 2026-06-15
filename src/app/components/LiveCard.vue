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
  componentName: "card",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const rootClasses = computed<string>(() => recipe.value?.slots["root"] ?? "");
const rendered = computed(() => extractArbitrary(rootClasses.value));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div data-testid="card-root" class="max-w-sm" :class="rendered.classes" :style="rendered.style">
        <p class="font-medium">Card title</p>
        <p class="text-sm text-zinc-500">Card body content.</p>
      </div>
      <code class="block text-xs font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all">{{ rootClasses }}</code>
    </template>
  </div>
</template>
