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
  componentName: "dropdown",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const content = computed(() => extractArbitrary(recipe.value?.slots["content"] ?? ""));

interface Row { label: string; classes: string; style: CSSProperties; }
const items = computed<Row[]>(() => {
  const item = recipe.value?.slots["item"] ?? "";
  if (!item) return [];
  return (["default", "hover", "active"] as const).map((s) => {
    const { classes, style } = extractArbitrary(projectToState(item, s));
    const label = s === "default" ? "Item" : s === "hover" ? "Hovered" : "Active";
    return { label, classes, style };
  });
});
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div data-testid="dropdown-content" class="max-w-xs w-full p-1 space-y-0.5" :class="content.classes" :style="content.style">
        <div
          v-for="row in items"
          :key="row.label"
          data-testid="dropdown-item"
          :class="row.classes"
          :style="row.style"
        >{{ row.label }}</div>
      </div>
    </template>
  </div>
</template>
