<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { useCustomPreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender, buildVariantCells } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";
import RealVariantCell from "./RealVariantCell.vue";

const props = withDefaults(
  defineProps<{
    graph: TokenGraph | null;
    componentName?: string;
    customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
  }>(),
  { componentName: "chip", customParts: () => new Map() },
);

const { recipe } = useCustomPreviewRecipe(
  () => props.graph,
  () => props.componentName,
  () => props.customParts,
);
const build = computed(() =>
  recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => build.value.specs);
const variantCells = computed(() => (recipe.value ? buildVariantCells(recipe.value) : []));
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <span data-testid="real-chip" :class="build.ui.base">
        <span :class="build.ui.label">Chip</span>
        <button
          type="button"
          class="appearance-none border-0 bg-transparent p-0 cursor-pointer inline-flex items-center justify-center leading-none"
        >
          <span :class="build.ui.close">×</span>
        </button>
      </span>
      <p class="mt-2 text-[10px] text-muted">
        Real custom component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />

      <RealVariantCell
        v-for="cell in variantCells"
        :key="cell.axis + ':' + cell.key"
        :label="`${cell.axis}: ${cell.key}`"
        :specs="cell.specs"
      >
        <span :class="cell.ui.base">
          <span :class="cell.ui.label">Chip</span>
          <button
            type="button"
            class="appearance-none border-0 bg-transparent p-0 cursor-pointer inline-flex items-center justify-center leading-none"
          >
            <span :class="cell.ui.close">×</span>
          </button>
        </span>
      </RealVariantCell>
    </template>
  </div>
</template>
