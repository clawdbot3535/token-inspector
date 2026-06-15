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
  componentName: "modal",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const overlay = computed(() => extractArbitrary(recipe.value?.slots["overlay"] ?? ""));
const content = computed(() => extractArbitrary(recipe.value?.slots["content"] ?? ""));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div
        data-testid="modal-overlay"
        class="flex items-center justify-center p-6 rounded-md"
        :class="overlay.classes"
        :style="overlay.style"
      >
        <div data-testid="modal-content" class="max-w-xs w-full" :class="content.classes" :style="content.style">
          <p class="font-medium">Modal title</p>
          <p class="text-sm text-zinc-500">Modal body content.</p>
        </div>
      </div>
    </template>
  </div>
</template>
