<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import LiveButton from "@/components/LiveButton.vue";
import LiveInput from "@/components/LiveInput.vue";
import LiveBadge from "@/components/LiveBadge.vue";
import LiveSwitch from "@/components/LiveSwitch.vue";
import LiveCheckbox from "@/components/LiveCheckbox.vue";
import LiveRadio from "@/components/LiveRadio.vue";
import type { Component } from "vue";

// Map component name → Live component. textarea shares LiveInput.
const LIVE_MAP: Record<string, Component> = {
  button: LiveButton,
  input: LiveInput,
  textarea: LiveInput,
  badge: LiveBadge,
  switch: LiveSwitch,
  checkbox: LiveCheckbox,
  radio: LiveRadio,
};

interface Props {
  graph: TokenGraph | null;
  component: string;
  unmappedCount: number;
  tokenCount: number;
}
const props = defineProps<Props>();

const liveComponent = computed(
  () => LIVE_MAP[props.component] ?? null,
);

const fallbackRecipes = computed(() => {
  if (liveComponent.value !== null || !props.graph) return null;
  const recipes = buildComponentRecipes(props.graph, {
    components: [props.component],
  });
  return recipes[props.component] ?? null;
});

const isMapped = computed(
  () => props.tokenCount > 0 && props.unmappedCount === 0,
);
</script>

<template>
  <div class="flex flex-col gap-4 h-full overflow-auto p-4">
    <!-- Mapped badge -->
    <div class="flex items-center gap-2">
      <span
        data-testid="mapped-badge"
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
        :class="
          isMapped
            ? 'bg-success/15 text-success'
            : 'bg-warning/15 text-warning'
        "
      >
        {{ isMapped ? "100% mapped" : `${unmappedCount} unmapped` }}
      </span>
      <span class="text-[10px] text-muted">{{ tokenCount }} token{{ tokenCount === 1 ? "" : "s" }}</span>
    </div>

    <!-- Live preview for the 7 supported components -->
    <div v-if="liveComponent !== null" class="flex-1">
      <component
        :is="liveComponent"
        :graph="graph"
        :component-name="component"
      />
    </div>

    <!-- Fallback panel for the remaining 8 components -->
    <div v-else class="flex-1 space-y-3">
      <p class="text-xs text-muted italic">
        No live render for <span class="font-mono">{{ component }}</span> — showing recipe slots.
      </p>
      <template v-if="fallbackRecipes">
        <!-- Base slot -->
        <div v-if="fallbackRecipes.slots['base']" class="space-y-1">
          <p class="text-[10px] uppercase tracking-wider text-muted">base</p>
          <p class="font-mono text-[11px] text-default break-all bg-elevated rounded px-2 py-1.5">
            {{ fallbackRecipes.slots["base"] }}
          </p>
        </div>
        <!-- Other slots -->
        <template v-for="(cls, slot) in fallbackRecipes.slots" :key="slot">
          <div v-if="slot !== 'base' && cls" class="space-y-1">
            <p class="text-[10px] uppercase tracking-wider text-muted">{{ slot }}</p>
            <p class="font-mono text-[11px] text-default break-all bg-elevated rounded px-2 py-1.5">
              {{ cls }}
            </p>
          </div>
        </template>
      </template>
      <p v-else class="text-xs text-muted">
        No recipe data available — load tokens first.
      </p>
    </div>
  </div>
</template>
