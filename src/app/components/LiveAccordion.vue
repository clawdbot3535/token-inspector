<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "accordion",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

interface Row { label: string; classes: string; style: CSSProperties; }
const rows = computed<Row[]>(() => {
  const item = recipe.value?.slots["item"] ?? "";
  if (!item) return [];
  return (["default", "disabled"] as const).map((s) => {
    const { classes, style } = extractArbitrary(projectToState(item, s));
    return { label: s === "default" ? "Section" : "Disabled", classes, style };
  });
});
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div class="max-w-sm w-full space-y-1">
        <div
          v-for="row in rows"
          :key="row.label"
          data-testid="accordion-item"
          class="border-b border-zinc-200 dark:border-zinc-800"
          :class="row.classes"
          :style="row.style"
        >{{ row.label }}</div>
      </div>
    </template>
  </div>
</template>
