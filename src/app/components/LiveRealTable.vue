<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";
import { computeSlotDiffs, type SlotDiff } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

// Representative data — UTable auto-derives columns from the row keys.
const rows = [
  { name: "Token", value: "8px" },
  { name: "Spacing", value: "16px" },
];

const ui = computed<Record<string, string> | null>(() => {
  const r = recipe.value;
  if (!r) return null;
  return {
    th: [r.slots["th"] ?? "", "ti-slot-th"].join(" ").trim(),
    td: [r.slots["td"] ?? "", "ti-slot-td"].join(" ").trim(),
  };
});

const hostRef = ref<HTMLElement | null>(null);
const slotDiffs = ref<SlotDiff[]>([]);

async function refreshDiff(): Promise<void> {
  await ensureRuntimeTailwind();
  await nextTick();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const host = hostRef.value;
  const r = recipe.value;
  if (!host || !r) {
    slotDiffs.value = [];
    return;
  }
  slotDiffs.value = computeSlotDiffs(host, [
    { slot: "th", selector: ".ti-slot-th", classes: r.slots["th"] ?? "" },
    { slot: "td", selector: ".ti-slot-td", classes: r.slots["td"] ?? "" },
  ]);
}

onMounted(refreshDiff);
watch([() => props.graph, () => props.componentName], refreshDiff);
</script>

<template>
  <div ref="hostRef" class="p-4">
    <div v-if="!ui" class="text-xs text-muted">No table recipe to render.</div>
    <template v-else>
      <UTable :data="rows" :ui="ui" />
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 table themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </template>
  </div>
</template>
