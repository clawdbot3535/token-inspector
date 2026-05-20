<script setup lang="ts">
import { computed } from "vue";
import type { ClassificationKind } from "@core/classify-token.js";

interface Props {
  kind: ClassificationKind;
}

const props = defineProps<Props>();

interface BadgeStyle {
  label: string;
  classes: string;
}

const STYLES: Record<ClassificationKind, BadgeStyle> = {
  "tailwind-default": {
    label: "tailwind",
    classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  "theme-static": {
    label: "theme",
    classes: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  "theme-mode-variant": {
    label: "mode-var",
    classes: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  skip: {
    label: "skip",
    classes: "bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
  },
};

const style = computed<BadgeStyle>(() => STYLES[props.kind]);
</script>

<template>
  <span
    :class="['inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide', style.classes]"
  >
    {{ style.label }}
  </span>
</template>
