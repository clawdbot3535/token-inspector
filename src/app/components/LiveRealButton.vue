<script setup lang="ts">
import { computed, onMounted } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { usePreviewRecipe, representativeSizeClasses } from "../composables/use-preview-recipe.js";
import { ensureRuntimeTailwind } from "../composables/use-runtime-tailwind.js";

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

// Boot the runtime compiler so the generated arbitrary classes get CSS.
onMounted(() => {
  void ensureRuntimeTailwind();
});
</script>

<template>
  <div class="p-4">
    <div v-if="!ui" class="text-xs text-muted">No {{ componentName }} recipe to render.</div>
    <UButton v-else :ui="ui" :variant="variantKey ?? undefined" size="md">Button</UButton>
    <p class="mt-2 text-[10px] text-muted">
      Real Nuxt UI v4 component themed by your generated recipe (runtime-compiled).
    </p>
  </div>
</template>
