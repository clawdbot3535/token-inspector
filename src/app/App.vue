<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { buildGraph } from "@core/build-graph.js";
import { createAppState, useFilteredNodes, useRenderedOutput } from "./state.js";
import { loadSources } from "./load-sources.js";
import { aliasChain, resolveCss, usedBy, type Variant } from "./resolve.js";
import TokenPreview from "./components/TokenPreview.vue";
import AliasChain from "./components/AliasChain.vue";
import UsedByList from "./components/UsedBy.vue";
import CodePreview from "./components/CodePreview.vue";
import IssuesView from "./components/IssuesView.vue";
import FigmaPreview from "./components/FigmaPreview.vue";
import LiveButton from "./components/LiveButton.vue";
import { defaultRenderers } from "@core/renderers/index.js";
import { buildZip, downloadBlob } from "./zip.js";
import {
  loadFigmaMapping,
  parseFigmaFileUrl,
  buildTokenToVariants,
  matchMapping,
  type FigmaMappingFile,
} from "./figma-mapping.js";

const builtInMapping = ref<FigmaMappingFile>({ components: [] });
const droppedMapping = ref<FigmaMappingFile | null>(null);
const pastedFileUrl = ref<string | null>(
  typeof localStorage !== "undefined"
    ? localStorage.getItem("figma-file-url")
    : null,
);

onMounted(async () => {
  builtInMapping.value = await loadFigmaMapping();
});

const figmaMapping = computed<FigmaMappingFile>(() => {
  const base = droppedMapping.value ?? builtInMapping.value;
  if (!pastedFileUrl.value) return base;
  return { ...base, fileFallbackUrl: pastedFileUrl.value };
});

const tokenToVariants = computed(() => buildTokenToVariants(figmaMapping.value));

function setFigmaUrl(input: string) {
  const parsed = parseFigmaFileUrl(input);
  if (!parsed) {
    pastedFileUrl.value = null;
    if (typeof localStorage !== "undefined") localStorage.removeItem("figma-file-url");
    return false;
  }
  pastedFileUrl.value = parsed;
  if (typeof localStorage !== "undefined") localStorage.setItem("figma-file-url", parsed);
  return true;
}

const state = createAppState();
const filteredNodes = useFilteredNodes(state);
const rendered = useRenderedOutput(state);

const issueCount = computed(() => state.graph.value?.issues.length ?? 0);
const nodeCount = computed(() => state.graph.value?.nodes.size ?? 0);

const selectedNode = computed(() => {
  const g = state.graph.value;
  const id = state.selection.value;
  return g && id ? (g.nodes.get(id) ?? null) : null;
});

const variantForSelected = computed<Variant>(() => {
  const node = selectedNode.value;
  if (!node) return "base";
  if (node.layer === "semantic") return state.theme.value;
  return "base";
});

const chainForSelected = computed(() => {
  const g = state.graph.value;
  const node = selectedNode.value;
  if (!g || !node) return [];
  return aliasChain(g, node.id, variantForSelected.value);
});

const terminalForSelected = computed(() => {
  const g = state.graph.value;
  const node = selectedNode.value;
  if (!g || !node) return undefined;
  return resolveCss(g, node.id, variantForSelected.value);
});

const usedByForSelected = computed(() => {
  const g = state.graph.value;
  const node = selectedNode.value;
  if (!g || !node) return [];
  return usedBy(g, node.id);
});

const defaultIconForSelected = computed<string | undefined>(() => {
  const node = selectedNode.value;
  if (!node) return undefined;
  return matchMapping(figmaMapping.value, node.id)?.defaultIcon;
});

async function handleFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  state.loadError.value = null;
  try {
    const { sources, figmaMapping: dropped, warnings } = await loadSources([...files]);
    if (warnings.length > 0) console.warn("Load warnings:", warnings);
    if (sources.length === 0 && !dropped) {
      state.loadError.value = "No recognized token files in drop.";
      return;
    }
    if (dropped) droppedMapping.value = dropped;
    if (sources.length > 0) {
      state.graph.value = buildGraph(sources);
      state.selection.value = null;
      state.view.value = "inspector";
    }
  } catch (cause) {
    state.loadError.value = cause instanceof Error ? cause.message : String(cause);
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

function downloadAll() {
  const g = state.graph.value;
  if (!g) return;
  const entries = defaultRenderers.map((r) => ({
    name: r.id,
    data: r.render(g).text,
  }));
  downloadBlob(buildZip(entries), "tokens-bundle.zip");
}
</script>

<template>
  <UApp>
    <div class="h-screen flex flex-col bg-default text-default">
      <!-- Header -->
      <header class="flex items-center justify-between px-4 h-12 border-b border-default">
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-layers" class="text-primary size-5" />
          <h1 class="text-sm font-semibold">Figma → Nuxt UI v4 — Token Inspector</h1>
        </div>
        <div class="flex items-center gap-3 text-xs text-muted">
          <span v-if="state.graph.value">
            {{ nodeCount }} nodes
            <button
              v-if="issueCount > 0"
              class="text-warning hover:underline"
              @click="state.view.value = state.view.value === 'issues' ? 'inspector' : 'issues'"
            >
              · {{ issueCount }} issue{{ issueCount === 1 ? "" : "s" }}
            </button>
          </span>
          <div v-if="state.graph.value" class="flex items-center gap-2">
            <input
              type="text"
              :value="pastedFileUrl ?? ''"
              placeholder="Paste Figma file URL…"
              class="text-xs px-2 py-1 rounded border border-default bg-default w-48 focus:outline-none focus:border-primary"
              @change="setFigmaUrl(($event.target as HTMLInputElement).value)"
            />
          </div>
          <div v-if="state.graph.value" class="flex rounded overflow-hidden border border-default">
            <button
              v-for="t in (['light', 'dark'] as const)"
              :key="t"
              class="px-2 py-1 text-xs"
              :class="
                state.theme.value === t
                  ? 'bg-primary text-inverted'
                  : 'bg-default hover:bg-elevated'
              "
              @click="state.theme.value = t"
            >
              {{ t }}
            </button>
          </div>
          <UButton
            v-if="state.graph.value"
            icon="i-lucide-download"
            color="primary"
            variant="ghost"
            size="xs"
            @click="downloadAll"
          >
            Download .zip
          </UButton>
          <UButton
            v-if="state.graph.value"
            icon="i-lucide-upload"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="state.graph.value = null"
          >
            Re-drop
          </UButton>
        </div>
      </header>

      <!-- Body -->
      <main class="flex-1 flex overflow-hidden">
        <!-- Empty state -->
        <div
          v-if="!state.graph.value"
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
              <br />Expected layers: color · dimension · typography · light · dark · global
              <br />Optional: figma-mapping.json (for component previews + variants)
            </p>
            <label
              class="inline-block px-3 py-1.5 text-xs rounded-md bg-primary text-inverted cursor-pointer hover:bg-primary/90"
            >
              Or pick files…
              <input type="file" multiple accept=".json,.zip" class="hidden" @change="onPick" />
            </label>
            <p v-if="state.loadError.value" class="mt-4 text-xs text-error">
              {{ state.loadError.value }}
            </p>
          </div>
        </div>

        <!-- Inspector shell -->
        <template v-else>
          <!-- Sidebar: token browser -->
          <aside class="w-72 border-r border-default flex flex-col">
            <div class="p-2 border-b border-default">
              <UInput
                v-model="state.filters.value.search"
                placeholder="Search tokens…"
                icon="i-lucide-search"
                size="xs"
              />
            </div>
            <div class="flex-1 overflow-y-auto text-xs font-mono">
              <button
                v-for="node in filteredNodes"
                :key="node.id"
                class="w-full text-left px-3 py-1 hover:bg-elevated transition-colors"
                :class="{
                  'bg-primary/10 text-primary': state.selection.value === node.id,
                  'bg-warning/15 text-warning':
                    state.selection.value !== node.id &&
                    state.highlightedIds.value.has(node.id),
                }"
                @click="state.selection.value = node.id"
              >
                {{ node.id }}
              </button>
            </div>
          </aside>

          <!-- Main: issues view OR node detail -->
          <section
            v-if="state.view.value === 'issues' && state.graph.value"
            class="flex-1 overflow-y-auto"
          >
            <IssuesView
              :graph="state.graph.value"
              @select="(id: string) => { state.selection.value = id; state.view.value = 'inspector'; }"
            />
          </section>
          <section v-else class="flex-1 overflow-y-auto p-4 text-sm space-y-4">
            <template v-if="selectedNode && state.graph.value">
              <div>
                <div class="font-mono text-xs text-muted">
                  {{ selectedNode.path.join(" / ") }}
                </div>
                <div class="font-mono text-base">{{ selectedNode.id }}</div>
                <div class="flex gap-2 mt-1 text-[11px] text-muted">
                  <span class="px-1.5 py-0.5 rounded bg-elevated">{{ selectedNode.layer }}</span>
                  <span class="px-1.5 py-0.5 rounded bg-elevated">{{ selectedNode.type }}</span>
                  <span
                    v-for="t in selectedNode.themes"
                    :key="t"
                    class="px-1.5 py-0.5 rounded bg-elevated"
                  >{{ t }}</span>
                </div>
              </div>

              <TokenPreview
                :graph="state.graph.value"
                :node="selectedNode"
                :variant="variantForSelected"
              />

              <LiveButton
                v-if="selectedNode.id === 'button' || selectedNode.id.startsWith('button-')"
                :graph="state.graph.value"
                :variant="state.theme.value"
                :default-icon="defaultIconForSelected"
                @highlight="state.highlightedIds.value = $event"
              />

              <FigmaPreview
                v-if="selectedNode.layer === 'component'"
                :mapping="figmaMapping"
                :token-id="selectedNode.id"
                @highlight="state.highlightedIds.value = $event"
              />

              <AliasChain
                :chain="chainForSelected"
                :terminal="terminalForSelected"
                @select="state.selection.value = $event"
              />

              <UsedByList :nodes="usedByForSelected" @select="state.selection.value = $event" />

              <details class="text-xs">
                <summary class="cursor-pointer text-muted">Raw node</summary>
                <pre class="mt-1 bg-elevated p-3 rounded overflow-auto">{{
                  JSON.stringify(selectedNode, null, 2)
                }}</pre>
              </details>
            </template>
            <div v-else class="text-sm text-muted">
              Select a token from the left to inspect.
            </div>
          </section>

          <!-- Output: live preview -->
          <aside class="w-[28rem] border-l border-default flex flex-col">
            <div class="flex border-b border-default">
              <button
                v-for="tab in (['tokens.css', 'app.config.ts', 'tokens.ts'] as const)"
                :key="tab"
                class="px-3 py-2 text-xs border-r border-default"
                :class="{
                  'bg-elevated font-medium': state.outputTab.value === tab,
                  'text-muted': state.outputTab.value !== tab,
                }"
                @click="state.outputTab.value = tab"
              >
                {{ tab }}
              </button>
            </div>
            <CodePreview
              v-if="rendered"
              :text="rendered.text"
              :lines="rendered.lines"
              :selected-id="state.selection.value"
              :highlighted-ids="state.highlightedIds.value"
            />
          </aside>
        </template>
      </main>
    </div>
  </UApp>
</template>
