<script setup lang="ts">
import { ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import { toLiveBuildFiles } from "../live-build/to-live-build-files.js";
import { stackblitzSubstrate } from "../live-build/stackblitz-substrate.js";
import type { LiveBuildSubstrate } from "../live-build/substrate.js";

const props = withDefaults(
  defineProps<{ graph: TokenGraph | null; substrate?: LiveBuildSubstrate }>(),
  { substrate: () => stackblitzSubstrate },
);

const TITLE = "Design Kit — Live Build";
const status = ref<"idle" | "embedding" | "ready" | "error">("idle");
const embedEl = ref<HTMLElement | null>(null);

async function start(): Promise<void> {
  if (!props.graph || !embedEl.value) return;
  status.value = "embedding";
  try {
    const files = toLiveBuildFiles(props.graph);
    // Fresh host child each run: embedProject replaces the element it mounts into,
    // so a persistent wrapper lets "Rebuild" work without losing the container.
    const host = document.createElement("div");
    host.style.height = "100%";
    embedEl.value.replaceChildren(host);
    await props.substrate.embed(host, files, { title: TITLE });
    status.value = "ready";
  } catch {
    status.value = "error";
  }
}

function openExternal(): void {
  if (!props.graph) return;
  props.substrate.openExternal(toLiveBuildFiles(props.graph), { title: TITLE });
}
</script>

<template>
  <div class="flex flex-col gap-2 h-full" data-testid="live-build-panel">
    <div v-if="status === 'idle'" class="text-xs text-muted space-y-2">
      <p>
        Runs the real <code>@nuxt/ui</code> build in a sandbox (~30–90&nbsp;s first boot).
        Your generated kit is sent to stackblitz.com to run; it is ephemeral and not saved.
      </p>
      <UButton size="sm" :disabled="!graph" data-testid="live-build-start" @click="start">
        Start live build
      </UButton>
    </div>

    <div v-else-if="status === 'embedding'" class="text-xs text-muted">
      Booting sandbox &amp; installing dependencies…
    </div>

    <div v-else-if="status === 'error'" class="text-xs text-error space-y-2">
      <p>Couldn't start the embedded build.</p>
      <UButton size="sm" variant="outline" data-testid="live-build-open-external" @click="openExternal">
        Open in StackBlitz ↗
      </UButton>
    </div>

    <div
      ref="embedEl"
      class="flex-1 min-h-[400px] rounded border border-default overflow-hidden"
      :class="status === 'ready' ? '' : 'hidden'"
      data-testid="live-build-embed"
    ></div>

    <div v-if="status === 'ready'" class="flex gap-2">
      <UButton size="xs" variant="outline" @click="start">Rebuild</UButton>
      <UButton size="xs" variant="ghost" data-testid="live-build-open-external" @click="openExternal">
        Open in StackBlitz ↗
      </UButton>
    </div>
  </div>
</template>
