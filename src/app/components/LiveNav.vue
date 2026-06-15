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
  componentName: "nav",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

interface Row { label: string; classes: string; style: CSSProperties; }
const variants = computed<Row[]>(() => {
  const base = recipe.value?.slots["item"] ?? "";
  const vmap = (recipe.value?.variants?.variant ?? {}) as Record<string, { item?: string }>;
  return Object.keys(vmap).map((key) => {
    const merged = [base, vmap[key]?.item ?? ""].filter((s) => s.length > 0).join(" ");
    const { classes, style } = extractArbitrary(projectToState(merged, "default"));
    return { label: key, classes, style };
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
          v-for="row in variants"
          :key="row.label"
          data-testid="nav-item"
          class="capitalize"
          :class="row.classes"
          :style="row.style"
        >{{ row.label }}</div>
      </div>
    </template>
  </div>
</template>
