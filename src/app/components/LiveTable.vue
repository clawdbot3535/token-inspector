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
  componentName: "table",
  highlightUtility: undefined,
  completeness: undefined,
});

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const base = computed(() => extractArbitrary(recipe.value?.slots["base"] ?? ""));
const th = computed(() => extractArbitrary(recipe.value?.slots["th"] ?? ""));
const td = computed(() => extractArbitrary(recipe.value?.slots["td"] ?? ""));
</script>

<template>
  <div class="space-y-4">
    <p v-if="!recipe" class="text-xs text-zinc-500 italic">
      No <code class="font-mono">{{ componentName }}</code> tokens detected in the loaded graph.
    </p>
    <template v-else>
      <div data-testid="table-root" class="max-w-sm overflow-hidden" :class="base.classes" :style="base.style">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr>
              <th data-testid="table-th" class="px-3 py-1.5 font-medium" :class="th.classes" :style="th.style">Name</th>
              <th data-testid="table-th" class="px-3 py-1.5 font-medium" :class="th.classes" :style="th.style">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-testid="table-td" class="px-3 py-1.5" :class="td.classes" :style="td.style">Row one</td>
              <td data-testid="table-td" class="px-3 py-1.5" :class="td.classes" :style="td.style">Active</td>
            </tr>
            <tr>
              <td data-testid="table-td" class="px-3 py-1.5" :class="td.classes" :style="td.style">Row two</td>
              <td data-testid="table-td" class="px-3 py-1.5" :class="td.classes" :style="td.style">Idle</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
