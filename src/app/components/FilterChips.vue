<script setup lang="ts">
import { computed } from "vue";
import type { ClassificationFilter } from "../state.js";
import type { ClassificationSummary } from "../classifications.js";

interface Props {
  modelValue: ClassificationFilter;
  summary: ClassificationSummary;
}

interface Emits {
  (event: "update:modelValue", value: ClassificationFilter): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

interface ChipDef {
  value: ClassificationFilter;
  label: string;
  count: (s: ClassificationSummary) => number;
}

const CHIPS: ReadonlyArray<ChipDef> = [
  { value: "all", label: "All", count: (s) => s.total },
  { value: "tailwind-default", label: "Tailwind", count: (s) => s.tailwind },
  { value: "theme-static", label: "Theme", count: (s) => s.themeStatic },
  { value: "theme-mode-variant", label: "Dark-var", count: (s) => s.modeVariant },
  { value: "skip", label: "Component", count: (s) => s.skipped },
];

const chips = computed(() =>
  CHIPS.map((c) => ({
    ...c,
    n: c.count(props.summary),
    active: c.value === props.modelValue,
  })),
);
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <button
      v-for="chip in chips"
      :key="chip.value"
      type="button"
      :class="[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
        chip.active
          ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
          : 'bg-transparent text-zinc-700 border-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800',
      ]"
      @click="emit('update:modelValue', chip.value)"
    >
      <span>{{ chip.label }}</span>
      <span class="text-[10px] font-mono opacity-70">{{ chip.n }}</span>
    </button>
  </div>
</template>
