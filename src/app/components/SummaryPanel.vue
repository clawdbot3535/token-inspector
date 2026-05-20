<script setup lang="ts">
import type { ClassificationSummary } from "../classifications.js";
import type { ClassificationFilter } from "../state.js";

interface Props {
  summary: ClassificationSummary;
}

interface Emits {
  (event: "select", filter: ClassificationFilter): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div
    class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-900 text-sm"
  >
    <button
      type="button"
      class="font-semibold hover:underline"
      @click="emit('select', 'all')"
    >
      {{ summary.total }} tokens
    </button>
    <span class="text-zinc-400">·</span>
    <button
      type="button"
      class="hover:underline"
      @click="emit('select', 'tailwind-default')"
    >
      <span class="font-mono">{{ summary.tailwind }}</span>
      <span class="text-zinc-500"> Tailwind matches</span>
    </button>
    <span class="text-zinc-400">·</span>
    <button
      type="button"
      class="hover:underline"
      @click="emit('select', 'theme-static')"
    >
      <span class="font-mono">{{ summary.themeStatic }}</span>
      <span class="text-zinc-500"> theme-static</span>
    </button>
    <span class="text-zinc-400">·</span>
    <button
      type="button"
      class="hover:underline"
      @click="emit('select', 'theme-mode-variant')"
    >
      <span class="font-mono">{{ summary.modeVariant }}</span>
      <span class="text-zinc-500"> mode-variant</span>
    </button>
    <span class="text-zinc-400">·</span>
    <button
      type="button"
      class="hover:underline"
      @click="emit('select', 'skip')"
    >
      <span class="font-mono">{{ summary.skipped }}</span>
      <span class="text-zinc-500"> skipped</span>
    </button>
  </div>
</template>
