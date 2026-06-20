<script setup lang="ts">
import { ref } from "vue";
import { useRealRender, type SentinelBuild } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = withDefaults(
  defineProps<{ label: string; specs: SentinelBuild["specs"]; showDiagnostics?: boolean }>(),
  { showDiagnostics: false },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => props.specs);
</script>

<template>
  <div class="mt-3" data-testid="real-variant-cell">
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{{ label }}</div>
    <div ref="hostRef"><slot /></div>
    <div v-if="showDiagnostics" data-testid="rvc-diagnostics">
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </div>
  </div>
</template>
