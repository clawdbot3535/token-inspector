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
      <UCard v-if="componentName === 'card'" v-bind="entry.props" :ui="build.ui">
        <template v-if="entry.slot">{{ entry.slot }}</template>
      </UCard>
      <UKbd v-else-if="componentName === 'kbd'" v-bind="entry.props" :ui="build.ui" />
      <UBadge v-else-if="componentName === 'badge'" v-bind="entry.props" :ui="build.ui" />
      <UProgress v-else-if="componentName === 'progress'" v-bind="entry.props" :ui="build.ui" />
      <USwitch v-else-if="componentName === 'switch'" v-bind="entry.props" :ui="build.ui" />
      <UCheckbox v-else-if="componentName === 'checkbox'" v-bind="entry.props" :ui="build.ui" />
      <URadioGroup v-else-if="componentName === 'radio'" v-bind="entry.props" :ui="build.ui" />
      <UInput v-else-if="componentName === 'input'" v-bind="entry.props" :ui="build.ui" />
      <UTextarea v-else-if="componentName === 'textarea'" v-bind="entry.props" :ui="build.ui" />
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
