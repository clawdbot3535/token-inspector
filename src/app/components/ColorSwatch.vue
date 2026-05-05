<script setup lang="ts">
const props = defineProps<{ value: string; label?: string }>();

function contrastAgainst(hex: string, bg: "white" | "black"): string {
  // Quick relative-luminance approximation. Good enough for a preview hint.
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "—";
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const bgLum = bg === "white" ? 1 : 0;
  const ratio = (Math.max(lum, bgLum) + 0.05) / (Math.min(lum, bgLum) + 0.05);
  return ratio.toFixed(2) + ":1";
}

const isHex = /^#[0-9a-f]{3,8}$/i.test(props.value);
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      class="size-12 rounded border border-default shadow-sm shrink-0"
      :style="{ background: props.value }"
      :title="props.value"
    />
    <div class="text-xs space-y-0.5">
      <div v-if="props.label" class="text-muted">{{ props.label }}</div>
      <div class="font-mono">{{ props.value }}</div>
      <div v-if="isHex" class="text-muted text-[10px] flex gap-2">
        <span>vs ⚪ {{ contrastAgainst(props.value, "white") }}</span>
        <span>vs ⚫ {{ contrastAgainst(props.value, "black") }}</span>
      </div>
    </div>
  </div>
</template>
