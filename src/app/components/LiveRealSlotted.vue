<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, useRealRender } from "../composables/use-render-diff.js";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const entry = computed(() => REAL_SLOTTED_REGISTRY[props.componentName] ?? null);
const build = computed(() =>
  recipe.value ? buildSlotSentinels(recipe.value.slots) : { ui: {}, specs: [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => build.value.specs);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!recipe || !entry" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <component :is="entry.tag" v-bind="entry.props" :ui="build.ui">
        <template v-if="entry.slot">{{ entry.slot }}</template>
      </component>
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
