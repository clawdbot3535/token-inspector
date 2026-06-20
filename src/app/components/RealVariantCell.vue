<script setup lang="ts">
import { ref } from "vue";
import { useRealRender, type SentinelBuild } from "../composables/use-render-diff.js";
import type { KitNote } from "../kit-behaviors.js";
import RenderDeltaTable from "./RenderDeltaTable.vue";

const props = withDefaults(
  defineProps<{ label: string; specs: SentinelBuild["specs"]; showDiagnostics?: boolean; notes?: readonly KitNote[] }>(),
  { showDiagnostics: false, notes: () => [] },
);
const hostRef = ref<HTMLElement | null>(null);
const { slotDiffs } = useRealRender(hostRef, () => props.specs);
</script>

<template>
  <div class="mt-3" data-testid="real-variant-cell">
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{{ label }}</div>
    <div ref="hostRef"><slot /></div>
    <p v-if="notes.length" data-testid="rvc-note" class="mt-1 max-w-[14rem] text-[10px] text-zinc-500 leading-snug">
      <span v-for="(n, i) in notes" :key="i" class="block">ⓘ {{ n.text }}</span>
    </p>
    <div v-if="showDiagnostics" data-testid="rvc-diagnostics">
      <RenderDeltaTable v-for="sd in slotDiffs" :key="sd.slot" :label="sd.slot" :deltas="sd.deltas" />
    </div>
  </div>
</template>
