<script setup lang="ts">
import { computed } from "vue";
import type { RenderDelta } from "../render-diff.js";

const props = defineProps<{ deltas: readonly RenderDelta[] }>();

const matched = computed(() => props.deltas.filter((d) => d.match).length);
</script>

<template>
  <div v-if="deltas.length" data-testid="render-diff" class="mt-3 space-y-1">
    <div class="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
      Fidelity · {{ matched }}/{{ deltas.length }} match
    </div>
    <div role="list" class="space-y-0.5">
      <div
        v-for="d in deltas"
        :key="d.property"
        data-testid="render-delta"
        :data-property="d.property"
        :data-match="d.match"
        class="flex items-center gap-2 text-xs py-0.5 font-mono"
      >
        <span class="w-3 text-center" :class="d.match ? 'text-success' : 'text-error'">
          {{ d.match ? "✓" : "✗" }}
        </span>
        <span class="w-40 shrink-0">{{ d.property }}</span>
        <span class="text-muted">{{ d.expected }}</span>
        <span v-if="!d.match" class="text-error">→ {{ d.actual }}</span>
      </div>
    </div>
  </div>
</template>
