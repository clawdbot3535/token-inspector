<script setup lang="ts">
import { computed, ref } from "vue";
import type { ScanReport, ScanIssue } from "@core/token-graph.js";
import { groupIssuesByComponent } from "../scan-grouping.js";
import { heuristicExtendable } from "../resolve/heuristic-extendable.js";

interface Props { report: ScanReport; resolved?: ReadonlySet<string>; }
interface Emits {
  (event: "select-tokens", tokenIds: readonly string[]): void;
  (event: "resolve", tokenId: string): void;
}
const props = withDefaults(defineProps<Props>(), { resolved: () => new Set<string>() });
const emit = defineEmits<Emits>();

type Tab = "issues" | "readiness" | "forecast";
type SeverityFilter = "all" | "error" | "warning" | "hint";

const activeTab = ref<Tab>("issues");
const severityFilter = ref<SeverityFilter>("all");
const collapsedGroups = ref<ReadonlySet<string>>(new Set());

function toggleGroup(component: string): void {
  const next = new Set(collapsedGroups.value);
  if (next.has(component)) next.delete(component);
  else next.add(component);
  collapsedGroups.value = next;
}

const counts = computed(() => {
  const c = { all: 0, error: 0, warning: 0, hint: 0 };
  for (const i of props.report.issues) {
    c.all += 1;
    if (i.severity === "error") c.error += 1;
    else if (i.severity === "warning") c.warning += 1;
    else if (i.severity === "hint") c.hint += 1;
  }
  return c;
});

const filteredIssues = computed(() =>
  severityFilter.value === "all"
    ? props.report.issues
    : props.report.issues.filter((i) => i.severity === severityFilter.value),
);

const groups = computed(() => groupIssuesByComponent(filteredIssues.value));

const severityTagClass = (sev: string): string =>
  ({
    error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    hint: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  })[sev] ?? "";

function onIssueClick(issue: ScanIssue): void {
  if (issue.tokenIds.length > 0) emit("select-tokens", issue.tokenIds);
}

const resolvableTokenIds = computed<Set<string>>(
  () => new Set(heuristicExtendable(props.report).map((r) => r.tokenId)),
);
function issueResolvableToken(issue: ScanIssue): string | null {
  return issue.tokenIds.find((t) => resolvableTokenIds.value.has(t) && !props.resolved.has(t)) ?? null;
}
function issueResolved(issue: ScanIssue): boolean {
  const resolvable = issue.tokenIds.filter((t) => resolvableTokenIds.value.has(t));
  return resolvable.length > 0 && resolvable.every((t) => props.resolved.has(t));
}

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "issues", label: "Issues" },
  { value: "readiness", label: "Readiness" },
  { value: "forecast", label: "Forecast" },
];
const SEVERITY_FILTERS: ReadonlyArray<{ value: SeverityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "warning", label: "Warnings" },
  { value: "hint", label: "Hints" },
];
</script>

<template>
  <div class="flex flex-col">
    <div role="tablist" class="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 px-3 pt-2">
      <button
        v-for="t in TABS"
        :key="t.value"
        type="button"
        role="tab"
        :aria-selected="activeTab === t.value"
        class="px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors select-none"
        :class="activeTab === t.value
          ? 'border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-semibold'
          : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'"
        @click="activeTab = t.value"
      >
        {{ t.label }}<span v-if="t.value === 'issues'" class="ml-1 font-mono">· {{ counts.all }}</span>
      </button>
    </div>

    <div v-if="activeTab === 'issues'" class="p-3 space-y-3">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="f in SEVERITY_FILTERS"
          :key="f.value"
          type="button"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
          :class="severityFilter === f.value
            ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
            : 'bg-transparent text-zinc-700 border-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800'"
          @click="severityFilter = f.value"
        >
          <span>{{ f.label }}</span>
          <span class="text-[10px] font-mono opacity-70">{{ counts[f.value] }}</span>
        </button>
      </div>

      <p v-if="filteredIssues.length === 0" class="text-xs text-zinc-400">
        No {{ severityFilter === 'all' ? '' : severityFilter + ' ' }}issues.
      </p>

      <div v-for="group in groups" :key="group.component" class="space-y-1">
        <button
          type="button"
          class="w-full flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-elevated transition-colors rounded px-1 py-0.5 select-none"
          @click="toggleGroup(group.component)"
        >
          <span>{{ collapsedGroups.has(group.component) ? '▸' : '▾' }} {{ group.component }}</span>
          <span class="font-normal text-zinc-400 font-mono text-[10px]">{{ group.issues.length }}</span>
        </button>
        <ul v-if="!collapsedGroups.has(group.component)" class="space-y-1 text-xs">
          <li
            v-for="issue in group.issues"
            :key="issue.id"
            class="border border-zinc-200 dark:border-zinc-700 rounded p-2 flex items-start justify-between gap-2"
            :class="issue.tokenIds.length > 0 ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800' : ''"
            @click="onIssueClick(issue)"
          >
            <div class="min-w-0 space-y-0.5">
              <span
                class="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
                :class="severityTagClass(issue.severity)"
              >{{ issue.severity }}</span>
              <span class="ml-2 text-zinc-700 dark:text-zinc-300">{{ issue.message }}</span>
              <div v-if="issue.componentName && issue.variantKey" class="text-zinc-400 font-mono text-[10px]">
                {{ issue.componentName }} / {{ issue.variantKey }}
              </div>
            </div>
            <div class="shrink-0 flex items-center gap-1">
              <span v-if="issue.tokenIds.length > 0" class="text-[10px] text-zinc-400">
                {{ issue.tokenIds.length }} token{{ issue.tokenIds.length === 1 ? '' : 's' }} &rarr;
              </span>
              <UButton
                v-if="issueResolvableToken(issue)"
                size="xs" variant="soft" class="ml-2"
                data-testid="resolve-issue"
                @click.stop="$emit('resolve', issueResolvableToken(issue)!)"
              >Resolve →</UButton>
              <span
                v-else-if="issueResolved(issue)"
                data-testid="resolve-done"
                class="ml-2 text-[10px] text-emerald-600 dark:text-emerald-400"
              >✓ resolved</span>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <div v-else-if="activeTab === 'readiness'" class="p-3">
      <p v-if="report.completeness.length === 0" class="text-xs text-zinc-400">
        No completeness data.
      </p>
      <table v-else class="w-full text-sm">
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

    <div v-else class="p-3 text-xs text-zinc-500 dark:text-zinc-400">
      Forecast:
      ~{{ Math.round(report.forecast.tokensCss.estimatedBytes / 100) / 10 }}KB tokens.css,
      {{ report.forecast.tokensCss.tailwindMatches }} Tailwind matches,
      {{ report.forecast.tokensCss.themeExtensions }} theme extensions,
      {{ report.forecast.tokensCss.modeVariantEntries }} mode-variant entries.
      <span v-if="report.forecast.unmappedComponentPrefixes.length > 0">
        Unmapped: {{ report.forecast.unmappedComponentPrefixes.join(", ") }}.
      </span>
      <span v-if="report.forecast.nonComponentPrefixes.length > 0">
        Layout/typography primitives (theme/CSS, not <code>ui.*</code> recipes):
        {{ report.forecast.nonComponentPrefixes.join(", ") }}.
      </span>
    </div>
  </div>
</template>
