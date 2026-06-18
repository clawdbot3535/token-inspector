<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { buildSlotSentinels, buildStateCells, type SentinelBuild } from "../composables/use-render-diff.js";
import RealVariantCell from "./RealVariantCell.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

const items = [{ label: "Section", content: "Body text for the panel.", value: "a" }];

interface Cell {
  label: string;
  props: Record<string, unknown>;
  ui: Record<string, string>;
  specs: SentinelBuild["specs"];
}

// Resting renders CLOSED (no default-value → base trigger look, panel body absent from the DOM).
// buildStateCells appends an `open` cell when the recipe carries data-[state=open]: classes; the
// accordion override sets default-value so that cell renders the panel open.
const cells = computed<Cell[]>(() => {
  const r = recipe.value;
  if (!r) return [];
  const resting = buildSlotSentinels(r.slots);
  const out: Cell[] = [{ label: "resting", props: {}, ui: resting.ui, specs: resting.specs }];
  for (const c of buildStateCells(r, props.componentName)) {
    out.push({ label: c.state, props: c.props, ui: c.ui, specs: c.specs });
  }
  return out;
});
</script>

<template>
  <div class="p-4">
    <div v-if="!recipe" class="text-xs text-muted">No accordion recipe to render.</div>
    <template v-else>
      <RealVariantCell v-for="cell in cells" :key="cell.label" :label="cell.label" :specs="cell.specs">
        <UAccordion :items="items" v-bind="cell.props" :ui="cell.ui" />
      </RealVariantCell>
    </template>
  </div>
</template>
