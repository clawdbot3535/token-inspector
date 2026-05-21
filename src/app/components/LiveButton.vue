<script setup lang="ts">
import { computed } from "vue";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import type { TokenGraph } from "@core/token-graph.js";

interface Props {
  graph: TokenGraph | null;
}

const props = defineProps<Props>();

const buttonRecipe = computed(() => {
  if (!props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, { components: ["button"] });
  return recipes["button"] ?? null;
});

const SIZES = ["sm", "md", "lg"] as const;

interface PreviewCell {
  size: string;
  classes: string;
}

const previewCells = computed<PreviewCell[]>(() => {
  const recipe = buttonRecipe.value;
  if (!recipe) return [];
  const baseClasses = recipe.slots["base"] ?? "";
  return SIZES.map((size) => {
    const sizeBlock = recipe.variants.size?.[size];
    const sizeClasses = sizeBlock?.["base"] ?? "";
    return {
      size,
      classes: [baseClasses, sizeClasses].filter((s) => s.length > 0).join(" ").trim(),
    };
  });
});

function copy(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="!buttonRecipe" class="text-xs text-zinc-500 italic">
      No button tokens detected in the loaded graph.
    </p>
    <div
      v-for="cell in previewCells"
      :key="cell.size"
      class="flex items-center gap-4"
    >
      <button
        type="button"
        :class="cell.classes + ' bg-blue-500 text-white hover:bg-blue-600 transition-colors'"
      >
        Button {{ cell.size }}
      </button>
      <code
        class="text-xs font-mono flex-1 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all"
      >
        {{ cell.classes }}
      </code>
      <button
        type="button"
        class="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        @click="copy(cell.classes)"
      >
        Copy
      </button>
    </div>
  </div>
</template>
