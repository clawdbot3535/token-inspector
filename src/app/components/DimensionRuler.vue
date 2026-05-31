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
const REM_PX = 16;

// Normalize the parsed value to pixels so the bar is to scale across units.
// Returns null for non-length units (%, vw, calc()…) which can't be drawn
// to a fixed pixel scale — the bar is hidden and only the value text shows.
const pxValue = computed<number | null>(() => {
  if (!parsed.value) return null;
  const { num, unit } = parsed.value;
  switch (unit) {
    case "":
    case "px":
      return num;
    case "rem":
    case "em":
      return num * REM_PX;
    default:
      return null;
  }
});

const visWidth = computed(() => {
  if (pxValue.value === null) return 0;
  // Clamp to [0, MAX]: negative lengths (e.g. letter-spacing) draw an empty
  // bar while the value text still reports the real number.
  return Math.max(0, Math.min(pxValue.value, VIS_WIDTH_MAX));
});

const truncated = computed(() => {
  return pxValue.value !== null && pxValue.value > VIS_WIDTH_MAX;
});
</script>

<template>
  <div class="space-y-1">
    <div v-if="props.label" class="text-xs text-muted">{{ props.label }}</div>
    <div class="font-mono text-xs">{{ props.value }}</div>
    <div v-if="pxValue !== null" class="relative h-3 bg-elevated rounded overflow-hidden" :style="{ width: VIS_WIDTH_MAX + 'px' }">
      <div
        class="h-full bg-primary"
        :style="{ width: visWidth + 'px' }"
      />
      <span v-if="truncated" class="absolute right-1 top-0 text-[10px] text-muted leading-3">…</span>
    </div>
  </div>
</template>
