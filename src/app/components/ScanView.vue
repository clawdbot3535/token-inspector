<script setup lang="ts">
import { computed } from "vue";
import type { ScanReport, ScanIssue, ScanCategory } from "@core/token-graph.js";

interface Props {
  report: ScanReport;
}
interface Emits {
  (event: "select-tokens", tokenIds: readonly string[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const CATEGORIES: ScanCategory[] = ["build-time", "data-quality", "classification-hint"];

const byCategory = computed<Record<ScanCategory, ScanIssue[]>>(() => {
  const out: Record<ScanCategory, ScanIssue[]> = {
    "build-time": [],
    "data-quality": [],
    "classification-hint": [],
  };
  for (const i of props.report.issues) {
    out[i.category].push(i);
  }
  return out;
});

const severityClass = (sev: string) =>
  ({
    error: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    hint: "text-zinc-500 dark:text-zinc-400",
  })[sev] ?? "";

const errorCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "error").length,
);
const warningCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "warning").length,
);
const hintCount = computed(() =>
  props.report.issues.filter((i) => i.severity === "hint").length,
);

function onIssueClick(issue: ScanIssue): void {
  if (issue.tokenIds.length > 0) {
    emit("select-tokens", issue.tokenIds);
  }
}
</script>

<template>
  <div class="space-y-4 p-3">
    <!-- Summary line -->
    <div class="flex flex-wrap items-baseline gap-x-3 text-sm">
      <span class="font-semibold">{{ report.issues.length }} issues</span>
      <span :class="errorCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-400'">
        {{ errorCount }} errors
      </span>
      <span class="text-zinc-400">·</span>
      <span :class="warningCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'">
        {{ warningCount }} warnings
      </span>
      <span class="text-zinc-400">·</span>
      <span class="text-zinc-500">{{ hintCount }} hints</span>
    </div>

    <!-- Category accordions -->
    <div
      v-for="cat in CATEGORIES"
      :key="cat"
      class="space-y-1"
    >
      <details v-if="byCategory[cat].length > 0" open>
        <summary
          class="cursor-pointer text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 select-none"
        >
          {{ cat }} ({{ byCategory[cat].length }})
        </summary>
        <ul class="mt-1 space-y-1 text-xs">
          <li
            v-for="issue in byCategory[cat]"
            :key="issue.id"
            class="border border-zinc-200 dark:border-zinc-700 rounded p-2 flex items-start justify-between gap-2"
            :class="issue.tokenIds.length > 0 ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800' : ''"
            @click="onIssueClick(issue)"
          >
            <div class="min-w-0 space-y-0.5">
              <span :class="severityClass(issue.severity)" class="font-mono">
                {{ issue.severity }}
              </span>
              <span class="ml-2 text-zinc-700 dark:text-zinc-300">{{ issue.message }}</span>
              <div
                v-if="issue.componentName"
                class="text-zinc-400 font-mono text-[10px]"
              >
                {{ issue.componentName }}{{ issue.variantKey ? ` / ${issue.variantKey}` : "" }}
              </div>
            </div>
            <span
              v-if="issue.tokenIds.length > 0"
              class="shrink-0 text-[10px] text-zinc-400"
            >
              {{ issue.tokenIds.length }} token{{ issue.tokenIds.length === 1 ? "" : "s" }} →
            </span>
          </li>
        </ul>
      </details>
      <div v-else class="text-xs text-zinc-400">{{ cat }}: none</div>
    </div>

    <!-- Component readiness table -->
    <div v-if="report.completeness.length > 0">
      <h3 class="text-xs font-mono uppercase text-zinc-500 dark:text-zinc-400 mb-1">
        Component readiness
      </h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-zinc-500 dark:text-zinc-400">
            <th class="py-1 pr-2">Component</th>
            <th class="py-1 pr-2">Axis</th>
            <th class="py-1 pr-2">Variant</th>
            <th class="py-1 pr-2">Score</th>
            <th class="py-1">Missing</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in report.completeness"
            :key="`${c.component}-${c.axis}-${c.variantKey}`"
            class="border-t border-zinc-100 dark:border-zinc-800"
          >
            <td class="py-1 pr-2 font-mono text-xs">{{ c.component }}</td>
            <td class="py-1 pr-2 font-mono text-xs text-zinc-400">{{ c.axis }}</td>
            <td class="py-1 pr-2 font-mono text-xs">{{ c.variantKey }}</td>
            <td class="py-1 pr-2 font-mono text-xs">
              <span
                :class="c.defined === c.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'"
              >{{ c.defined }}/{{ c.total }}</span>
            </td>
            <td class="py-1 text-xs text-zinc-500 dark:text-zinc-400">
              {{ c.missingUtilities.join(", ") || "—" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Forecast -->
    <div class="text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 pt-3">
      Forecast:
      ~{{ Math.round(report.forecast.tokensCss.estimatedBytes / 100) / 10 }}KB tokens.css,
      {{ report.forecast.tokensCss.tailwindMatches }} Tailwind matches,
      {{ report.forecast.tokensCss.themeExtensions }} theme extensions,
      {{ report.forecast.tokensCss.modeVariantEntries }} mode-variant entries.
      <span v-if="report.forecast.unmappedComponentPrefixes.length > 0">
        Unmapped: {{ report.forecast.unmappedComponentPrefixes.join(", ") }}.
      </span>
    </div>
  </div>
</template>
