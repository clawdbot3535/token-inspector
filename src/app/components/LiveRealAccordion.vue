<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, buildStateCells } from "../composables/use-render-diff.js";
import KitMatrix from "./KitMatrix.vue";
import { ACCORDION_ITEM_VALUE } from "./real-slotted-registry.js";

const props = withDefaults(
  defineProps<{ graph: TokenGraph | null; componentName: string; showDiagnostics?: boolean }>(),
  { showDiagnostics: false },
);
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const items = [{ label: "Section", content: "Body text for the panel.", value: ACCORDION_ITEM_VALUE }];

// Resting hero renders CLOSED (no default-value → base trigger look, panel body absent from the DOM).
const restingUi = computed(() => (recipe.value ? buildSlotSentinels(recipe.value.slots).ui : {}));
// buildStateCells appends an `open` cell when the recipe carries data-[state=open]: classes; the
// accordion override sets default-value so that cell renders the panel open. Accordion has no variants.
const stateCells = computed(() => (recipe.value ? buildStateCells(recipe.value, props.componentName) : []));
</script>

<template>
  <div class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No accordion recipe to render.</div>
    <template v-else>
      <UAccordion :items="items" :ui="restingUi" />
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>

      <KitMatrix :component-name="componentName" :variant-cells="[]" :state-cells="stateCells"
        :graph="graph" :show-diagnostics="showDiagnostics">
        <template #cell="{ cell }">
          <UAccordion :items="items" v-bind="cell.props" :ui="cell.ui" />
        </template>
      </KitMatrix>
    </template>
  </div>
</template>
