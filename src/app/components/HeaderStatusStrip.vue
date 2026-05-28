<script setup lang="ts">
import { computed } from "vue";
import type { ScanReport } from "@core/token-graph.js";

interface Props {
  report: ScanReport;
  scanViewActive: boolean;
}
interface Emits {
  (event: "open-scan"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const errorCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "error").length,
);
const warningCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "warning").length,
);
const hintCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "hint").length,
);
</script>

<template>
  <button
    type="button"
    class="w-full flex items-baseline gap-3 px-3 py-1.5 text-xs font-mono border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
    :class="scanViewActive ? 'bg-zinc-100 dark:bg-zinc-800' : ''"
    @click="emit('open-scan')"
  >
    <span class="text-zinc-500">Scan:</span>
    <span :class="errorCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-400'">
      {{ errorCount }} errors
    </span>
    <span class="text-zinc-400">·</span>
    <span :class="warningCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'">
      {{ warningCount }} warnings
    </span>
    <span class="text-zinc-400">·</span>
    <span class="text-zinc-500">{{ hintCount }} hints</span>
    <span class="ml-auto text-zinc-400">
      {{ report.forecast.tokensCss.tailwindMatches }} tw
      · {{ report.forecast.tokensCss.themeExtensions }} theme
      · {{ report.forecast.tokensCss.modeVariantEntries }} mode-var
    </span>
  </button>
</template>
