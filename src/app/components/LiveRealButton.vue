<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe, representativeSizeClasses } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";
import { computeRenderDiff } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";
import type { RenderDelta } from "../render-diff.js";

const props = defineProps<{ graph: TokenGraph | null; componentName: string }>();

const { recipe } = usePreviewRecipe(() => props.graph, () => props.componentName);

// Pick a representative variant (solid if defined, else the first) for v1's resting render.
const variantKey = computed<string | null>(() => {
  const v = recipe.value?.variants.variant ?? {};
  const keys = Object.keys(v);
  return keys.includes("solid") ? "solid" : keys[0] ?? null;
});

// The :ui prop is a slot→classes override map. Compose the generated base + representative
// size base + the chosen variant's base so the real UButton paints with the user's tokens.
const ui = computed<Record<string, string> | null>(() => {
  const r = recipe.value;
  if (!r) return null;
  const variantBase = variantKey.value ? r.variants.variant?.[variantKey.value]?.["base"] ?? "" : "";
  const base = [r.slots["base"] ?? "", representativeSizeClasses(r), variantBase]
    .filter(Boolean)
    .join(" ");
  const out: Record<string, string> = { base };
  if (r.slots["label"]) out.label = r.slots["label"];
  if (r.slots["leadingIcon"]) out.leadingIcon = r.slots["leadingIcon"];
  return out;
});

const hostRef = ref<HTMLElement | null>(null);
const deltas = ref<RenderDelta[]>([]);

// After the runtime compiler paints the recipe classes, diff the real button's computed
// base styles against the recipe's intent.
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
  <div ref="hostRef" class="p-4">
    <div v-if="!ui" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <template v-else>
      <UButton :ui="ui" :variant="variantKey ?? undefined" size="md">Button</UButton>
      <p class="mt-2 text-[10px] text-muted">
        Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
      </p>
      <RenderDeltaTable :deltas="deltas" />
    </template>
  </div>
</template>
