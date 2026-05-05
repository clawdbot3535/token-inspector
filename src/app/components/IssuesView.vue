<script setup lang="ts">
import { computed } from "vue";
import type { GraphIssue, TokenGraph } from "@core/token-graph.js";

const props = defineProps<{ graph: TokenGraph }>();
defineEmits<{ select: [id: string] }>();

const grouped = computed<Record<string, GraphIssue[]>>(() => {
  const out: Record<string, GraphIssue[]> = {};
  for (const issue of props.graph.issues) {
    (out[issue.kind] ??= []).push(issue);
  }
  return out;
});

function exportJson() {
  const blob = new Blob([JSON.stringify([...props.graph.issues], null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "graph-issues.json";
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="p-4 space-y-4">
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium">
        {{ graph.issues.length }} issue{{ graph.issues.length === 1 ? "" : "s" }}
      </div>
      <button
        v-if="graph.issues.length > 0"
        class="text-xs px-2 py-1 rounded bg-elevated hover:bg-accented"
        @click="exportJson"
      >
        Export JSON
      </button>
    </div>
    <div v-if="graph.issues.length === 0" class="text-sm text-muted">
      No issues — the graph built cleanly.
    </div>
    <div v-for="(group, kind) in grouped" :key="kind" class="space-y-2">
      <div class="text-xs uppercase tracking-wider text-muted">
        {{ kind }} ({{ group.length }})
      </div>
      <ul class="space-y-1 text-xs">
        <li
          v-for="(issue, i) in group"
          :key="i"
          class="border border-default rounded p-2 flex items-start justify-between gap-2"
        >
          <div class="space-y-0.5 min-w-0">
            <div v-if="issue.path" class="font-mono text-muted truncate">
              {{ issue.path.join(" / ") }}
            </div>
            <div>{{ issue.message }}</div>
          </div>
          <button
            v-if="issue.nodeId"
            class="text-xs text-primary shrink-0 hover:underline"
            @click="$emit('select', issue.nodeId)"
          >
            Open →
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
