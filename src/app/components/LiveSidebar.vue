<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { TokenGraph, CompletenessScore } from "@core/token-graph.js";
import { useCustomPreviewRecipe } from "../composables/use-preview-recipe.js";
import { extractArbitrary } from "../extract-arbitrary.js";
import { projectToState } from "../project-to-state.js";

interface Props {
  graph: TokenGraph | null;
  componentName?: string;
  customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
  highlightUtility?: string;
  completeness?: ReadonlyArray<CompletenessScore>;
}
const props = withDefaults(defineProps<Props>(), {
  componentName: "sidebar",
  customParts: () => new Map(),
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = useCustomPreviewRecipe(() => props.graph, () => props.componentName, () => props.customParts);
const base = computed(() => extractArbitrary(recipe.value?.slots["base"] ?? ""));

interface Row { label: string; classes: string; style: CSSProperties; }
const items = computed<Row[]>(() => {
  const item = recipe.value?.slots["item"] ?? "";
  if (!item) return [];
  return (["default", "hover", "active"] as const).map((s) => {
    const { classes, style } = extractArbitrary(projectToState(item, s));
    return { label: s === "default" ? "Dashboard" : s === "hover" ? "Projects" : "Settings", classes, style };
  });
});
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div data-testid="sidebar-root" class="space-y-0.5" :class="base.classes" :style="base.style">
        <div
          v-for="row in items"
          :key="row.label"
          data-testid="sidebar-item"
          :class="row.classes"
          :style="row.style"
        >{{ row.label }}</div>
      </div>
    </template>
  </div>
</template>
