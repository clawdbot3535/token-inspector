<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, buildStateCells, buildVariantCells } from "../composables/use-render-diff.js";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";
import KitMatrix from "./KitMatrix.vue";

const props = withDefaults(
  defineProps<{ graph: TokenGraph | null; componentName: string; showDiagnostics?: boolean }>(),
  { showDiagnostics: false },
);
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const entry = computed(() => REAL_SLOTTED_REGISTRY[props.componentName] ?? null);

// Resting hero: registry props + sentinel-stamped slots, no state/variant override.
const restingUi = computed(() => (recipe.value ? buildSlotSentinels(recipe.value.slots).ui : {}));
const variantCells = computed(() => (recipe.value ? buildVariantCells(recipe.value) : []));
const stateCells = computed(() => (recipe.value ? buildStateCells(recipe.value, props.componentName) : []));
</script>

<template>
  <div class="p-4">
    <div v-if="!recipe || !entry" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <!-- Resting hero. Literal Nuxt UI tags only — a dynamic <component :is="entry.tag"> string is
           invisible to Nuxt UI's compile-time auto-import scan and silently falls back to a native
           element. The registry `tag` field is documentation; the v-if chain drives the render. -->
      <UCard v-if="componentName === 'card'" v-bind="entry.props" :ui="restingUi">
        <template v-if="entry.slot">{{ entry.slot }}</template>
      </UCard>
      <UKbd v-else-if="componentName === 'kbd'" v-bind="entry.props" :ui="restingUi" />
      <UBadge v-else-if="componentName === 'badge'" v-bind="entry.props" :ui="restingUi" />
      <UProgress v-else-if="componentName === 'progress'" v-bind="entry.props" :ui="restingUi" />
      <USwitch v-else-if="componentName === 'switch'" v-bind="entry.props" :ui="restingUi" />
      <UCheckbox v-else-if="componentName === 'checkbox'" v-bind="entry.props" :ui="restingUi" />
      <URadioGroup v-else-if="componentName === 'radio'" v-bind="entry.props" :ui="restingUi" />
      <UInput v-else-if="componentName === 'input'" v-bind="entry.props" :ui="restingUi" />
      <UTextarea v-else-if="componentName === 'textarea'" v-bind="entry.props" :ui="restingUi" />
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>

      <KitMatrix :component-name="componentName" :variant-cells="variantCells" :state-cells="stateCells"
        :graph="graph" :show-diagnostics="showDiagnostics">
        <template #cell="{ cell }">
          <UCard v-if="componentName === 'card'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui">
            <template v-if="entry.slot">{{ entry.slot }}</template>
          </UCard>
          <UKbd v-else-if="componentName === 'kbd'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui" />
          <UBadge v-else-if="componentName === 'badge'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui" />
          <UProgress v-else-if="componentName === 'progress'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui" />
          <USwitch v-else-if="componentName === 'switch'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui" />
          <UCheckbox v-else-if="componentName === 'checkbox'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui" />
          <URadioGroup v-else-if="componentName === 'radio'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui" />
          <UInput v-else-if="componentName === 'input'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui" />
          <UTextarea v-else-if="componentName === 'textarea'" v-bind="{ ...entry.props, ...cell.props }" :ui="cell.ui" />
        </template>
      </KitMatrix>
    </template>
  </div>
</template>
