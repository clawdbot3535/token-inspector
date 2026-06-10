<script setup lang="ts">
import { ref, computed } from "vue";
import { loadSources } from "@/load-sources.js";
import GitLoader from "@/components/GitLoader.vue";
import { useInjectedTokensCss } from "@/composables/use-injected-tokens-css.js";
import { useCreator } from "./useCreator.js";
import ComponentPicker from "./ComponentPicker.vue";
import SlotConfig from "./SlotConfig.vue";
import PreviewPane from "./PreviewPane.vue";
import OutputPane from "./OutputPane.vue";

const {
  loadedSources,
  selected,
  profile,
  scaffoldTree,
  unmappedCount,
  tokenCount,
  previewGraph,
  download,
} = useCreator();

// Inject the scaffolded graph's rendered tokens.css into <head> so the live
// preview's `var(--…)` references resolve to the loaded palette's real colours.
useInjectedTokensCss(previewGraph);

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

// Profile axes for the selected component
const componentNames = computed(() => Object.keys(profile.components));
const compProfile = computed(
  () => profile.components[selected.component] ?? { parts: [], states: [], sizes: [] },
);
</script>

<template>
  <UApp>
    <div class="h-screen flex flex-col bg-default text-default">
      <!-- Header -->
      <header class="flex items-center justify-between px-4 h-12 border-b border-default shrink-0">
        <div class="flex items-center gap-3">
          <span class="text-primary text-lg leading-none">◆</span>
          <h1 class="text-sm font-semibold">Token Creator</h1>
        </div>
        <div v-if="loadedSources.length > 0" class="flex items-center gap-3">
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
            :class="
              unmappedCount === 0
                ? 'bg-success/15 text-success'
                : 'bg-warning/15 text-warning'
            "
          >
            {{ unmappedCount === 0 ? "100% mapped" : `${unmappedCount} unmapped` }}
            / {{ tokenCount }} tokens
          </span>
          <span class="text-xs text-muted">
            {{ loadedSources.length }} source{{ loadedSources.length === 1 ? "" : "s" }}
          </span>
        </div>
      </header>

      <!-- Pre-load prompt -->
      <main
        v-if="loadedSources.length === 0"
        class="flex-1 flex flex-col overflow-hidden"
      >
        <div
          class="flex-1 flex items-center justify-center p-8"
          @dragover.prevent
          @drop="onDrop"
        >
          <div class="border-2 border-dashed border-default rounded-lg p-12 text-center max-w-md">
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
            <p v-if="loadError" class="mt-4 text-xs text-error">
              {{ loadError }}
            </p>
          </div>
        </div>
      </main>

      <!-- 3-column layout (Layout A) — shown once sources are loaded -->
      <main
        v-else
        data-testid="creator-layout"
        class="flex-1 flex overflow-hidden"
      >
        <!-- Left column: ComponentPicker + SlotConfig -->
        <aside class="w-44 border-r border-default flex flex-col overflow-hidden shrink-0">
          <div class="px-2 py-2 border-b border-default shrink-0">
            <p class="text-[10px] uppercase tracking-wider text-muted px-1">Component</p>
          </div>
          <div class="flex-1 overflow-y-auto p-1">
            <ComponentPicker
              :components="componentNames"
              :model-value="selected.component"
              @update:model-value="(v) => { selected.component = v; selected.slots = [...(profile.components[v]?.parts ?? [])]; selected.states = [...(profile.components[v]?.states ?? [])]; selected.sizes = [...(profile.components[v]?.sizes ?? [])]; }"
            />
          </div>
          <div class="border-t border-default p-2 shrink-0 overflow-y-auto max-h-60">
            <SlotConfig
              :parts="compProfile.parts"
              :states="compProfile.states"
              :sizes="compProfile.sizes"
              :selected-parts="selected.slots"
              :selected-states="selected.states"
              :selected-sizes="selected.sizes"
              @update:selected-parts="(v) => (selected.slots = v)"
              @update:selected-states="(v) => (selected.states = v)"
              @update:selected-sizes="(v) => (selected.sizes = v)"
            />
          </div>
        </aside>

        <!-- Center column: PreviewPane -->
        <section class="flex-1 overflow-hidden border-r border-default">
          <PreviewPane
            :graph="previewGraph"
            :component="selected.component"
            :unmapped-count="unmappedCount"
            :token-count="tokenCount"
          />
        </section>

        <!-- Right column: OutputPane -->
        <aside class="w-80 overflow-hidden shrink-0">
          <OutputPane
            :tree="scaffoldTree"
            :value-strategy="selected.valueStrategy"
            @update:value-strategy="(v) => (selected.valueStrategy = v)"
            @download="download()"
          />
        </aside>
      </main>
    </div>
  </UApp>
</template>
