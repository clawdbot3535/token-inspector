<script setup lang="ts">
import { computed, ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { coverageFor } from "@core/coverage.js";
import { REAL_SLOTTED_REGISTRY } from "./real-slotted-registry.js";
import { allBehaviorsFor, scannerNotesFor } from "../kit-behaviors.js";
import LiveRealButton from "./LiveRealButton.vue";
import LiveRealTable from "./LiveRealTable.vue";
import LiveRealNav from "./LiveRealNav.vue";
import LiveRealAccordion from "./LiveRealAccordion.vue";
import LiveRealChip from "./LiveRealChip.vue";
import LiveRealSidebar from "./LiveRealSidebar.vue";
import LiveRealSlotted from "./LiveRealSlotted.vue";

const props = defineProps<{
  graph: TokenGraph | null;
  componentName: string;
  customParts?: ReadonlyMap<string, ReadonlyArray<string>>;
}>();

const showDiagnostics = ref(false);

const BESPOKE = ["button", "table", "nav", "accordion", "chip", "sidebar"];
const hasRealRender = computed(
  () => BESPOKE.includes(props.componentName) || props.componentName in REAL_SLOTTED_REGISTRY,
);

const coverage = computed(() => (props.graph ? coverageFor(props.graph, props.componentName) : null));

const showCatalog = ref(false);
const catalogNotes = computed(() => [
  ...allBehaviorsFor(props.componentName),
  ...scannerNotesFor(props.componentName, props.graph).all,
]);
</script>

<template>
  <div class="p-4" data-testid="kit-panel">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-semibold">{{ componentName }}</h2>
      <span v-if="coverage" data-testid="kit-coverage-badge"
        class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {{ coverage.structuralTouched }}/{{ coverage.structuralTotal }} mapped
      </span>
    </div>

    <div v-if="!hasRealRender" data-testid="kit-placeholder"
      class="text-xs text-muted border border-dashed border-default rounded p-6 text-center">
      Real render coming — {{ componentName }} is an overlay component and will get a real inline render in the next step.
    </div>
    <template v-else>
      <LiveRealButton v-if="componentName === 'button'" :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
      <LiveRealTable v-else-if="componentName === 'table'" :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
      <LiveRealNav v-else-if="componentName === 'nav'" :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
      <LiveRealAccordion v-else-if="componentName === 'accordion'" :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
      <LiveRealChip v-else-if="componentName === 'chip'" :graph="graph" :component-name="componentName" :custom-parts="customParts" :show-diagnostics="showDiagnostics" />
      <LiveRealSidebar v-else-if="componentName === 'sidebar'" :graph="graph" :component-name="componentName" :custom-parts="customParts" :show-diagnostics="showDiagnostics" />
      <LiveRealSlotted v-else :graph="graph" :component-name="componentName" :show-diagnostics="showDiagnostics" />
    </template>

    <button v-if="hasRealRender" type="button" data-testid="kit-diagnose-toggle"
      class="mt-3 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      :aria-expanded="showDiagnostics"
      @click="showDiagnostics = !showDiagnostics">
      {{ showDiagnostics ? "▾ Hide diagnostics" : "▸ Diagnostics / deltas" }}
    </button>
    <button v-if="catalogNotes.length" type="button" data-testid="kit-catalog-toggle"
      class="mt-3 ml-4 text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      :aria-expanded="showCatalog"
      @click="showCatalog = !showCatalog">
      {{ showCatalog ? "▾ Known Nuxt behaviors" : "▸ Known Nuxt behaviors" }}
    </button>
    <ul v-if="showCatalog" data-testid="kit-catalog" class="mt-1 text-[10px] text-zinc-500 list-disc pl-5">
      <li v-for="(n, i) in catalogNotes" :key="i">{{ n.text }}</li>
    </ul>
  </div>
</template>
