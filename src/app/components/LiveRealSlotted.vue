<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, buildStateCells, buildVariantCells, type SentinelBuild } from "../composables/use-render-diff.js";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";
import RealVariantCell from "./RealVariantCell.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);
const entry = computed(() => REAL_SLOTTED_REGISTRY[props.componentName] ?? null);

interface Cell {
  label: string;
  props: Record<string, unknown>;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
}

const cells = computed<Cell[]>(() => {
  const r = recipe.value;
  const e = entry.value;
  if (!r || !e) return [];
  const resting = buildSlotSentinels(r.slots);
  const out: Cell[] = [{ label: "resting", props: e.props, ui: resting.ui, specs: resting.specs }];
  for (const c of buildStateCells(r)) {
    out.push({ label: c.state, props: { ...e.props, ...c.props }, ui: c.ui, specs: c.specs });
  }
  for (const c of buildVariantCells(r)) {
    out.push({ label: `${c.axis}: ${c.key}`, props: { ...e.props, ...c.props }, ui: c.ui, specs: c.specs });
  }
  return out;
});
</script>

<template>
  <div class="p-4">
    <div v-if="!recipe || !entry" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <RealVariantCell v-for="cell in cells" :key="cell.label" :label="cell.label" :specs="cell.specs">
        <UCard v-if="componentName === 'card'" v-bind="cell.props" :ui="cell.ui">
          <template v-if="entry.slot">{{ entry.slot }}</template>
        </UCard>
        <UKbd v-else-if="componentName === 'kbd'" v-bind="cell.props" :ui="cell.ui" />
        <UBadge v-else-if="componentName === 'badge'" v-bind="cell.props" :ui="cell.ui" />
        <UProgress v-else-if="componentName === 'progress'" v-bind="cell.props" :ui="cell.ui" />
        <USwitch v-else-if="componentName === 'switch'" v-bind="cell.props" :ui="cell.ui" />
        <UCheckbox v-else-if="componentName === 'checkbox'" v-bind="cell.props" :ui="cell.ui" />
        <URadioGroup v-else-if="componentName === 'radio'" v-bind="cell.props" :ui="cell.ui" />
        <UInput v-else-if="componentName === 'input'" v-bind="cell.props" :ui="cell.ui" />
        <UTextarea v-else-if="componentName === 'textarea'" v-bind="cell.props" :ui="cell.ui" />
      </RealVariantCell>
    </template>
  </div>
</template>
