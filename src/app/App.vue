<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import { useResizablePane } from "./composables/use-resizable-pane.js";
import { useInjectedTokensCss } from "./composables/use-injected-tokens-css.js";
import ResizeHandle from "./components/ResizeHandle.vue";
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
import ComponentTree from "./components/ComponentTree.vue";
import { buildTokenTree, leafIds, ancestorPaths } from "./token-tree.js";
import ClassificationBadge from "./components/ClassificationBadge.vue";
import FilterChips from "./components/FilterChips.vue";
import SummaryPanel from "./components/SummaryPanel.vue";
import OutputSection from "./components/OutputSection.vue";
import { useClassifications } from "./classifications.js";
import { resolveTokenToValue } from "@core/resolve-token.js";
import { classifyToken } from "@core/classify-token.js";
import { getSlotMapping } from "@core/slot-mapping.js";
import { shadowIdFor, prefixForUtility, utilityFor } from "@core/recipe-engine.js";
import { defaultRenderers } from "@core/renderers/index.js";
import { buildZip, downloadBlob } from "./zip.js";
import {
  loadFigmaMapping,
  parseFigmaFileUrl,
  buildTokenToVariants,
  matchMapping,
  type FigmaMappingFile,
} from "./figma-mapping.js";

const appVersion = __APP_VERSION__;

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

const leftPane = useResizablePane({
  storageKey: "inspector.leftPaneWidth",
  initialWidth: 288,
  minWidth: 200,
  maxWidth: 600,
});

const rightPane = useResizablePane({
  storageKey: "inspector.rightPaneWidth",
  initialWidth: 448,
  minWidth: 320,
  maxWidth: 800,
  direction: "grow-left",
});

const state = createAppState();
const filteredNodes = useFilteredNodes(state);
const rendered = useRenderedOutput(state);
// Mount the rendered tokens.css into <head> so live previews can resolve
// `var(--<token-id>)` references emitted by the recipe-engine.
useInjectedTokensCss(state.graph);
const { kindOf, summary, classifications } = useClassifications(state.graph);

const selectedClassification = computed(() => {
  const id = state.selection.value;
  if (!id) return null;
  return classifications.value.get(id) ?? null;
});

const selectedVueTemplateClasses = computed<string | undefined>(() => {
  const id = state.selection.value;
  const graph = state.graph.value;
  if (!id || !graph) return undefined;
  const node = graph.nodes.get(id);
  if (!node || node.layer !== "component") return undefined;

  const mapping = getSlotMapping(id);
  if (!mapping) return undefined;

  const resolved = resolveTokenToValue(id, graph);
  if ("error" in resolved) return undefined;

  // Fabricate a shadow node with a canonical primitive-style id so
  // classifyToken's tailwindCategoryFor picks the right category.
  // Same technique used by the recipe engine for per-graph resolution.
  const shadowNode = {
    ...node,
    id: shadowIdFor(mapping.utilityType),
    layer: "primitive" as const,
    cssValue: { base: resolved.value },
  };
  const classification = classifyToken(shadowNode, graph);

  const base = utilityFor(mapping.utilityType, classification);
  if (base == null) return undefined;
  return mapping.statePrefix != null ? `${mapping.statePrefix}:${base}` : base;
});

const visibleNodes = computed(() => {
  const filter = state.filters.value.classification;
  if (filter === "all") return filteredNodes.value;
  return filteredNodes.value.filter((node) => kindOf(node.id) === filter);
});

// Hierarchical token tree for the left sidebar.
const tokenTree = computed(() => buildTokenTree(visibleNodes.value));

// Persisted expansion state — Set of group paths the user has opened.
const EXPAND_STORAGE_KEY = "inspector.tree.expanded";
const expandedPaths = ref<Set<string>>(loadExpanded());

function loadExpanded(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(EXPAND_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((s) => typeof s === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function persistExpanded(set: ReadonlySet<string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(EXPAND_STORAGE_KEY, JSON.stringify([...set]));
}

function toggleExpanded(path: string): void {
  const next = new Set(expandedPaths.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  expandedPaths.value = next;
  persistExpanded(next);
}

/**
 * Effective expansion set used for rendering. When a search query is
 * active we force-open every group so matches stay visible without the
 * user having to expand manually. Auto-expanded groups don't get
 * persisted — they vanish again when the search clears.
 */
const effectiveExpandedPaths = computed<ReadonlySet<string>>(() => {
  if (state.filters.value.search.trim().length === 0) return expandedPaths.value;
  const all = new Set(expandedPaths.value);
  // Walk every group node in the current tree and add its path.
  function collect(nodes: ReturnType<typeof buildTokenTree>): void {
    for (const n of nodes) {
      if (n.kind === "group") {
        all.add(n.path);
        collect(n.children);
      }
    }
  }
  collect(tokenTree.value);
  return all;
});

// When selection changes from elsewhere (issues click, used-by, …),
// open every ancestor group so the selected leaf is in view.
watch(
  () => state.selection.value,
  (id) => {
    if (id === null) return;
    const ancestors = ancestorPaths(tokenTree.value, id);
    if (ancestors.length === 0) return;
    const next = new Set(expandedPaths.value);
    let changed = false;
    for (const p of ancestors) {
      if (!next.has(p)) {
        next.add(p);
        changed = true;
      }
    }
    if (changed) {
      expandedPaths.value = next;
      persistExpanded(next);
    }
  },
);

function expandAll(): void {
  const all = new Set<string>();
  function collect(nodes: ReturnType<typeof buildTokenTree>): void {
    for (const n of nodes) {
      if (n.kind === "group") {
        all.add(n.path);
        collect(n.children);
      }
    }
  }
  collect(tokenTree.value);
  expandedPaths.value = all;
  persistExpanded(all);
}

function collapseAll(): void {
  expandedPaths.value = new Set();
  persistExpanded(new Set());
}

const treeLeafCount = computed(() => leafIds(tokenTree.value).length);

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
          <h1 class="text-sm font-semibold">Token Inspector</h1>
          <span
            class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated text-muted border border-default"
            :title="`Token Inspector v${appVersion}`"
          >v{{ appVersion }}</span>
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
          <aside
            class="relative shrink-0 border-r border-default flex flex-col"
            :style="{ width: leftPane.width.value + 'px' }"
          >
            <div class="px-2 pt-2 border-b border-default">
              <SummaryPanel
                :summary="summary"
                @select="
                  (f) =>
                    (state.filters.value = {
                      ...state.filters.value,
                      classification: f,
                    })
                "
              />
            </div>
            <div class="p-2 border-b border-default space-y-2">
              <UInput
                v-model="state.filters.value.search"
                placeholder="Search tokens…"
                icon="i-lucide-search"
                size="xs"
              />
              <FilterChips
                :model-value="state.filters.value.classification"
                :summary="summary"
                @update:model-value="(v) => (state.filters.value = { ...state.filters.value, classification: v })"
              />
            </div>
            <div
              class="px-2 py-1 border-b border-default flex items-center justify-between text-[10px] text-zinc-500"
            >
              <span class="font-mono">{{ treeLeafCount }} tokens</span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="hover:text-zinc-900 dark:hover:text-zinc-100"
                  @click="expandAll"
                >
                  Expand all
                </button>
                <span class="text-zinc-300 dark:text-zinc-700">·</span>
                <button
                  type="button"
                  class="hover:text-zinc-900 dark:hover:text-zinc-100"
                  @click="collapseAll"
                >
                  Collapse all
                </button>
              </div>
            </div>
            <div class="flex-1 overflow-y-auto py-1">
              <ComponentTree
                :nodes="tokenTree"
                :selected-id="state.selection.value"
                :highlighted-ids="state.highlightedIds.value"
                :expanded-paths="effectiveExpandedPaths"
                :kind-of="kindOf"
                @select="(id: string) => (state.selection.value = id)"
                @toggle="toggleExpanded"
              />
            </div>
            <ResizeHandle side="right" @pointerdown="leftPane.onPointerDown" />
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

              <OutputSection
                v-if="selectedClassification"
                :classification="selectedClassification"
                :vue-template-classes="selectedVueTemplateClasses"
                :token-id="selectedNode.id"
              />

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
          <aside
            class="relative shrink-0 border-l border-default flex flex-col"
            :style="{ width: rightPane.width.value + 'px' }"
          >
            <ResizeHandle side="left" @pointerdown="rightPane.onPointerDown" />
            <div class="flex border-b border-default overflow-x-auto">
              <button
                v-for="tab in (['tokens.css', 'app.config.ts'] as const)"
                :key="tab"
                class="px-3 py-2 text-xs border-r border-default whitespace-nowrap"
                :class="{
                  'bg-elevated font-medium': state.outputTab.value === tab,
                  'text-muted': state.outputTab.value !== tab,
                }"
                @click="state.outputTab.value = tab"
              >
                {{ tab }}
                <span
                  v-if="tab === 'tokens.css'"
                  class="ml-1 text-[9px] text-muted/60 font-normal"
                >assets/css/tokens.css</span>
                <span
                  v-if="tab === 'app.config.ts'"
                  class="ml-1 text-[9px] text-muted/60 font-normal"
                >app.config.ts (or merge with existing)</span>
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
