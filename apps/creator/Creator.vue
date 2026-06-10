<script setup lang="ts">
import { ref } from "vue";
import { loadSources } from "@/load-sources.js";
import GitLoader from "@/components/GitLoader.vue";
import type { SourceFile } from "@core/token-graph.js";

// Tokens loaded via drop / picker / Git. The picker + preview (Tasks 3-4)
// will consume this; for now the shell just confirms what loaded.
const loadedSources = ref<SourceFile[]>([]);
const loadError = ref<string | null>(null);

async function handleFiles(files: FileList | readonly File[] | null) {
  if (!files || files.length === 0) return;
  loadError.value = null;
  try {
    const { sources, warnings } = await loadSources([...files]);
    if (warnings.length > 0) console.warn("Load warnings:", warnings);
    if (sources.length === 0) {
      loadError.value = "No recognized token files in drop.";
      return;
    }
    loadedSources.value = sources;
  } catch (cause) {
    loadError.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  handleFiles(e.dataTransfer?.files ?? null);
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  handleFiles(input.files);
}
</script>

<template>
  <UApp>
    <div class="h-screen flex flex-col bg-default text-default">
      <!-- Header -->
      <header class="flex items-center justify-between px-4 h-12 border-b border-default">
        <div class="flex items-center gap-3">
          <span class="text-primary text-lg leading-none">◆</span>
          <h1 class="text-sm font-semibold">Token Creator</h1>
        </div>
        <div v-if="loadedSources.length > 0" class="text-xs text-muted">
          {{ loadedSources.length }} source{{ loadedSources.length === 1 ? "" : "s" }} loaded
        </div>
      </header>

      <!-- Body -->
      <main class="flex-1 flex flex-col overflow-hidden">
        <!-- Load prompt (reuses the inspector's drop / picker / Git path) -->
        <div
          class="flex-1 flex items-center justify-center p-8"
          @dragover.prevent
          @drop="onDrop"
        >
          <div
            class="border-2 border-dashed border-default rounded-lg p-12 text-center max-w-md"
          >
            <UIcon name="i-lucide-file-json" class="size-10 mx-auto text-muted mb-4" />
            <p class="text-sm font-medium mb-2">Drop Figma token files here</p>
            <p class="text-xs text-muted mb-4">
              Accepts .json or .zip (Figma export bundle)
              <br />Load your tokens to start scaffolding a component.
            </p>
            <label
              class="inline-block px-3 py-1.5 text-xs rounded-md bg-primary text-inverted cursor-pointer hover:bg-primary/90"
            >
              Or pick files…
              <input type="file" multiple accept=".json,.zip" class="hidden" @change="onPick" />
            </label>
            <GitLoader
              @files="handleFiles"
              @error="(m: string) => (loadError = m)"
            />
            <p
              v-if="loadedSources.length > 0"
              class="mt-4 text-xs text-primary"
              data-testid="sources-loaded"
            >
              {{ loadedSources.length }} source{{ loadedSources.length === 1 ? "" : "s" }} loaded
            </p>
            <p v-if="loadError" class="mt-4 text-xs text-error">
              {{ loadError }}
            </p>
          </div>
        </div>
      </main>
    </div>
  </UApp>
</template>
