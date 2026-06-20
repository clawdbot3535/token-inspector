<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { useCustomPreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = withDefaults(
  defineProps<{
    graph: TokenGraph | null;
    componentName?: string;
    customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
    showDiagnostics?: boolean;
  }>(),
  { componentName: "sidebar", customParts: () => new Map(), showDiagnostics: false },
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
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <aside data-testid="real-sidebar" :class="build.ui.base">
        <div class="flex flex-col gap-1">
          <a data-testid="real-sidebar-item" :class="build.ui.item">Dashboard</a>
          <a data-testid="real-sidebar-item" :class="build.ui.item">Projects</a>
        </div>
      </aside>
      <p class="mt-2 text-[10px] text-muted">
        Real custom component themed by your generated recipe (runtime-compiled).
      </p>
      <div v-if="showDiagnostics" data-testid="resting-diagnostics">
        <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
      </div>
    </template>
  </div>
</template>
