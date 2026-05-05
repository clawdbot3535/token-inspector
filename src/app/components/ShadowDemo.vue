<script setup lang="ts">
defineProps<{ value: string; label?: string }>();
</script>

<template>
  <div class="space-y-2">
    <div v-if="label" class="text-xs text-muted">{{ label }}</div>
    <div class="flex items-center justify-center bg-elevated rounded p-6">
      <div
        class="size-16 rounded bg-default border border-default"
        :style="{ boxShadow: value }"
      />
    </div>
    <div class="font-mono text-[11px] break-all text-muted">{{ value }}</div>
  </div>
</template>
