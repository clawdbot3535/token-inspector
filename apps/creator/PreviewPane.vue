<script setup lang="ts">
import { computed } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import LiveKitPanel from "@/components/LiveKitPanel.vue";

interface Props {
  graph: TokenGraph | null;
  component: string;
  unmappedCount: number;
  tokenCount: number;
}
const props = defineProps<Props>();

const isMapped = computed(
  () => props.tokenCount > 0 && props.unmappedCount === 0,
);
</script>

<template>
  <div class="flex flex-col gap-4 h-full overflow-auto p-4">
    <!-- Mapped badge -->
    <div class="flex items-center gap-2">
      <span
        data-testid="mapped-badge"
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
        :class="
          isMapped
            ? 'bg-success/15 text-success'
            : 'bg-warning/15 text-warning'
        "
      >
        {{ isMapped ? "100% mapped" : `${unmappedCount} unmapped` }}
      </span>
      <span class="text-[10px] text-muted">{{ tokenCount }} token{{ tokenCount === 1 ? "" : "s" }}</span>
    </div>

    <!-- Real-render kit panel for all components -->
    <div class="flex-1">
      <LiveKitPanel
        :graph="graph"
        :component-name="component"
      />
    </div>
  </div>
</template>
