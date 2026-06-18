<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe, representativeSizeClasses } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";
import { computeRenderDiff, buildVariantCells } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";
import RealVariantCell from "./RealVariantCell.vue";
import type { RenderDelta } from "../render-diff.js";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();
const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

// Resting look: base + representative size only (no variant — variants get their own cells below).
const ui = computed<Record<string, string> | null>(() => {
  const r = recipe.value;
  if (!r) return null;
  const base = [r.slots["base"] ?? "", representativeSizeClasses(r)].filter(Boolean).join(" ");
  const out: Record<string, string> = { base };
  if (r.slots["label"]) out.label = r.slots["label"];
  if (r.slots["leadingIcon"]) out.leadingIcon = r.slots["leadingIcon"];
  return out;
});

const variantCells = computed(() => (recipe.value ? buildVariantCells(recipe.value) : []));

const hostRef = ref<HTMLElement | null>(null);
const deltas = ref<RenderDelta[]>([]);

// Resting diff: base+size only, no variant prop on the resting <UButton>. Nuxt UI applies its
// own default variant ("solid") internally, so color/background deltas here may reflect that
// default rather than the recipe — intentional: variant intent is diffed per-cell below.
async function refreshDiff(): Promise<void> {
  await ensureRuntimeTailwind();
  await nextTick();
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  const el = hostRef.value?.querySelector("button");
  const base = ui.value?.base;
  deltas.value = el && base ? computeRenderDiff(el, base) : [];
}

onMounted(refreshDiff);
watch([() => props.graph, () => props.componentName], refreshDiff);
</script>

<template>
  <div class="p-4">
    <div v-if="!ui" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <div ref="hostRef">
        <UButton :ui="ui" size="md">Button</UButton>
      </div>
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable :deltas="deltas" />

      <RealVariantCell
        v-for="cell in variantCells"
        :key="cell.axis + ':' + cell.key"
        :label="`${cell.axis}: ${cell.key}`"
        :specs="cell.specs"
      >
        <UButton v-bind="cell.props" :ui="cell.ui" size="md">Button</UButton>
      </RealVariantCell>
    </template>
  </div>
</template>
