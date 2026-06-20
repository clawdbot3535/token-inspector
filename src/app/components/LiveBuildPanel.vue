<script setup lang="ts">
import type { TokenGraph } from "@core/token-graph.js";
import { toLiveBuildFiles } from "../live-build/to-live-build-files.js";
import { stackblitzSubstrate } from "../live-build/stackblitz-substrate.js";
import type { LiveBuildSubstrate } from "../live-build/substrate.js";

const props = withDefaults(
  defineProps<{ graph: TokenGraph | null; substrate?: LiveBuildSubstrate }>(),
  { substrate: () => stackblitzSubstrate },
);

const TITLE = "Design Kit — Live Build";

function openLiveBuild(): void {
  if (!props.graph) return;
  props.substrate.openExternal(toLiveBuildFiles(props.graph), { title: TITLE });
}
</script>

<template>
  <div class="flex flex-col gap-3 text-xs text-muted" data-testid="live-build-panel">
    <p>
      Open your generated kit as a live, runnable build on StackBlitz — the real
      build-time Tailwind output (the literal product), not the in-app approximation.
      Your kit is sent to stackblitz.com to run; it is ephemeral and not saved.
    </p>
    <div>
      <UButton size="sm" :disabled="!graph" data-testid="live-build-open" @click="openLiveBuild">
        Open in StackBlitz ↗
      </UButton>
    </div>
  </div>
</template>
