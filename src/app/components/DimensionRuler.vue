<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ value: string; label?: string }>();

const parsed = computed(() => {
  const m = props.value.trim().match(/^(-?[\d.]+)(.*)$/);
  if (!m || !m[1]) return null;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return null;
  return { num, unit: m[2] || "" };
});

// Cap visualization width so big values stay on screen.
const VIS_WIDTH_MAX = 320;
const VIS_PER_PX = 1;

const visWidth = computed(() => {
  if (!parsed.value) return 0;
  return Math.min(parsed.value.num * VIS_PER_PX, VIS_WIDTH_MAX);
});

const truncated = computed(() => {
  if (!parsed.value) return false;
  return parsed.value.num * VIS_PER_PX > VIS_WIDTH_MAX;
});
</script>

<template>
  <div class="space-y-1">
    <div v-if="props.label" class="text-xs text-muted">{{ props.label }}</div>
    <div class="font-mono text-xs">{{ props.value }}</div>
    <div v-if="parsed" class="relative h-3 bg-elevated rounded overflow-hidden" :style="{ width: VIS_WIDTH_MAX + 'px' }">
      <div
        class="h-full bg-primary"
        :style="{ width: visWidth + 'px' }"
      />
      <span v-if="truncated" class="absolute right-1 top-0 text-[10px] text-muted leading-3">…</span>
    </div>
  </div>
</template>
