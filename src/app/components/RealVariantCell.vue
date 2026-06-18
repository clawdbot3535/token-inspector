<script setup lang="ts">
import { ref } from "vue";
import { useRealRender, type SentinelBuild } from "../composables/use-render-diff.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = defineProps<{ label: string; specs: SentinelBuild["specs"] }>();
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => props.specs);
</script>

<template>
  <div class="mt-3" data-testid="real-variant-cell">
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{{ label }}</div>
    <div ref="hostRef"><slot /></div>
    <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
  </div>
</template>
