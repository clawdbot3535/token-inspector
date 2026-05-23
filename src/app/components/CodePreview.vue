<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import type { LineMap } from "@core/token-graph.js";

const props = defineProps<{
  text: string;
  lines: LineMap;
  selectedId: string | null;
  highlightedIds?: ReadonlySet<string>;
  /**
   * Extra line numbers to highlight in addition to those derived from
   * selectedId/highlightedIds. Used when the active selection maps to a
   * synthetic anchor not present in the LineMap — e.g. a component-layer
   * token's resolved utility class living inside a recipe class string.
   */
  extraHighlightLines?: ReadonlySet<number>;
}>();

const container = ref<HTMLDivElement | null>(null);

const lines = computed(() => props.text.split("\n"));

const selectionLines = computed<Set<number>>(() => {
  if (!props.selectedId) return new Set();
  return new Set(props.lines.get(props.selectedId) ?? []);
});

const highlightedLines = computed<Set<number>>(() => {
  const set = new Set<number>();
  if (!props.highlightedIds) return set;
  for (const id of props.highlightedIds) {
    const arr = props.lines.get(id);
    if (arr) for (const l of arr) set.add(l);
  }
  return set;
});

const extraLines = computed<Set<number>>(() => {
  return new Set(props.extraHighlightLines ?? []);
});

const focusLines = computed<Set<number>>(() => {
  const s = new Set<number>(selectionLines.value);
  for (const n of highlightedLines.value) s.add(n);
  for (const n of extraLines.value) s.add(n);
  return s;
});

watch(focusLines, async (set) => {
  if (set.size === 0) return;
  await nextTick();
  const first = Math.min(...set);
  const el = container.value?.querySelector(`[data-line="${first}"]`);
  if (el && container.value) {
    const rect = el.getBoundingClientRect();
    const cRect = container.value.getBoundingClientRect();
    if (rect.top < cRect.top || rect.bottom > cRect.bottom) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
});
</script>

<template>
  <div
    ref="container"
    class="flex-1 overflow-auto text-[11px] leading-tight font-mono"
  >
    <div
      v-for="(line, i) in lines"
      :key="i"
      :data-line="i + 1"
      class="flex pl-2 pr-3 transition-colors"
      :class="{
        'bg-primary/15 ring-1 ring-primary/40': selectionLines.has(i + 1),
        'bg-warning/15 ring-1 ring-warning/40':
          !selectionLines.has(i + 1) && highlightedLines.has(i + 1),
        'bg-primary/10 ring-1 ring-primary/40 ring-dashed':
          !selectionLines.has(i + 1) &&
          !highlightedLines.has(i + 1) &&
          extraLines.has(i + 1),
      }"
    >
      <span class="select-none text-muted/50 w-8 text-right shrink-0 mr-3">
        {{ i + 1 }}
      </span>
      <span class="whitespace-pre">{{ line }}</span>
    </div>
  </div>
</template>
