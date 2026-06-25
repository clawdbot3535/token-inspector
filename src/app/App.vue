<script setup lang="ts">
import { computed, ref, watch, onMounted, provide } from "vue";
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
import ScanView from "./components/ScanView.vue";
import HeaderStatusStrip from "./components/HeaderStatusStrip.vue";
import FigmaPreview from "./components/FigmaPreview.vue";
import LiveKitPanel from "./components/LiveKitPanel.vue";
import LiveBuildPanel from "./components/LiveBuildPanel.vue";
import CoverageView from "./components/CoverageView.vue";
import { coverageFor } from "@core/coverage.js";
import ComponentTree from "./components/ComponentTree.vue";
import { buildTokenTree, buildLayeredTree, leafIds, ancestorPaths } from "./token-tree.js";
import ClassificationBadge from "./components/ClassificationBadge.vue";
import FilterChips from "./components/FilterChips.vue";
import SummaryPanel from "./components/SummaryPanel.vue";
import OutputSection from "./components/OutputSection.vue";
import { useClassifications } from "./classifications.js";
import { resolveTokenToValue } from "@core/resolve-token.js";
import { getSlotMapping } from "@tg/grammar";
import { utilityForMapping } from "@core/recipe-engine.js";
import { defaultRenderers, appConfigRenderer, customComponentsRenderer } from "@core/renderers/index.js";
import { buildKitFiles } from "@core/renderers/kit/kit-emitter.js";
import { customPartsByComponent, declaredCustomComponents } from "@core/scanner.js";
import type { GraphLayer } from "@core/token-graph.js";
import { buildZip, downloadBlob } from "./zip.js";
import { useScanReport } from "./composables/use-scan-report.js";
import { previewComponentForGroup, groupHasPreview } from "./preview-component.js";
import {
  loadFigmaMapping,
  parseFigmaFileUrl,
  buildTokenToVariants,
  matchMapping,
  type FigmaMappingFile,
} from "./figma-mapping.js";
import CommitPanel from "./components/CommitPanel.vue";
import GitLoader from "./components/GitLoader.vue";
import ResolvePanel from "./components/ResolvePanel.vue";
import { heuristicExtendable, type ResolvableDeviation } from "./resolve/heuristic-extendable.js";
import { RESOLVE_OVERRIDE_KEY } from "./resolve/override-key.js";
import { buildSlotMappingFile, slotMappingBundleEntry } from "./resolve/export-slot-mapping.js";
import { loadAcceptedIds, saveAcceptedIds } from "./accepted-storage.js";
import type { SlotMappingOverride, SlotMappingEntry } from "@tg/grammar";

const appVersion = __APP_VERSION__;
const unpushed = __APP_UNPUSHED__;

const builtInMapping = ref<FigmaMappingFile>({ components: [] });
const droppedMapping = ref<FigmaMappingFile | null>(null);
const pastedFileUrl = ref<string | null>(
  typeof localStorage !== "undefined"
    ? localStorage.getItem("figma-file-url")
    : null,
);

const showCommitPanel = ref(false);

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
const scanReport = useScanReport(state.graph);
const resolveOverride = ref<SlotMappingOverride>({});
provide(RESOLVE_OVERRIDE_KEY, resolveOverride);
const resolvedTokenIds = computed<Set<string>>(() => new Set(Object.keys(resolveOverride.value)));
const acceptedIds = ref<Set<string>>(loadAcceptedIds());
const resolvables = computed<ResolvableDeviation[]>(() => heuristicExtendable(scanReport.value));
const activeResolve = ref<string | null>(null);
const activeDeviation = computed<ResolvableDeviation | null>(
  () => resolvables.value.find((r) => r.tokenId === activeResolve.value) ?? null,
);
function onResolve(tokenId: string): void { activeResolve.value = tokenId; }
function onToggleAccept(issueId: string): void {
  const next = new Set(acceptedIds.value);
  if (next.has(issueId)) next.delete(issueId);
  else next.add(issueId);
  acceptedIds.value = next;
  saveAcceptedIds(next);
}
function onApply(tokenId: string, entry: SlotMappingEntry): void {
  resolveOverride.value = { ...resolveOverride.value, [tokenId]: entry };
  activeResolve.value = null;
}
function downloadSlotMapping(): void {
  const blob = new Blob([buildSlotMappingFile(resolveOverride.value)], { type: "application/json" });
  downloadBlob(blob, "slot-mapping.json");
}
// Components the scanner flagged `component-looks-custom` — routed out of the
// app.config.ts ui: block and into the custom-components.ts tab/download.
const customParts = computed(() =>
  customPartsByComponent(
    scanReport.value,
    state.graph.value ? declaredCustomComponents(state.graph.value) : undefined,
  ),
);
// Thread the scan completeness into the rendered app.config.ts so the
// on-screen preview matches the CLI output (and the download below).
const rendered = useRenderedOutput(
  state,
  computed(() => scanReport.value.completeness),
  customParts,
  resolveOverride,
);
// Browser render omits defaultSizeByComponent (no slot-mapping.json in the browser) — matches the other web renders. Drives both tab visibility and download.
const customOutputText = computed(() => {
  const g = state.graph.value;
  if (!g) return "";
  return customComponentsRenderer.render(g, {
    customParts: customParts.value,
    slotMappingOverride: resolveOverride.value,
  }).text;
});
// The custom-components.ts tab is only reachable when the rendered text is non-empty.
const outputTabs = computed(() =>
  customOutputText.value.trim().length > 0
    ? (["tokens.css", "app.config.ts", "custom-components.ts"] as const)
    : (["tokens.css", "app.config.ts"] as const),
);
// If the active tab disappears (e.g. loading a token set with no flagged
// components while custom-components.ts is selected), fall back to a visible
// tab — otherwise the preview pane renders blank with no active tab.
watch(outputTabs, (tabs) => {
  if (!(tabs as readonly string[]).includes(state.outputTab.value)) {
    state.outputTab.value = "tokens.css";
  }
});
// Mount the rendered tokens.css into <head> so live previews can resolve
// `var(--<token-id>)` references emitted by the recipe-engine.
useInjectedTokensCss(state.graph);
const { kindOf, summary, classifications } = useClassifications(state.graph);

// Sync state.theme onto the document root so Tailwind's `dark:` variants
// and Nuxt UI's color-mode-aware components react to the toggle. Without
// this the theme buttons only affected which value resolveCss returned
// for the *displayed* tokens, never the page chrome itself.
watch(
  () => state.theme.value,
  (theme) => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  },
  { immediate: true },
);

// Component the middle-pane preview focuses on. Driven by user clicks on
// the component-tree group rows; falls back to the only currently
// supported component when nothing has been chosen.
const selectedComponent = ref<string>("button");
const paneTab = ref<"kit" | "coverage" | "livebuild">("kit");
const coverage = computed(() =>
  state.graph.value && selectedComponent.value
    ? coverageFor(state.graph.value, selectedComponent.value)
    : null,
);
watch(selectedComponent, () => {
  paneTab.value = "kit";
});

// Components that get a rendered preview in the Kit panel. Gate the visual
// preview on this set; other components still get the token tree,
// OutputSection, and code-preview highlighting, just not the rendered kit.
const COMPONENTS_WITH_PREVIEW: ReadonlySet<string> = new Set(["button", "input", "textarea", "badge", "switch", "checkbox", "radio", "card", "kbd", "progress", "modal", "table", "dropdown", "accordion", "nav", "sidebar", "chip"]);
const previewSupported = computed(() =>
  COMPONENTS_WITH_PREVIEW.has(selectedComponent.value),
);

// Live filter chip state
const liveOnly = ref(false);
/** Count of COMPONENTS_WITH_PREVIEW names present in the loaded component tree. */
const liveCount = computed(() => {
  const componentSection = sections.value.find((s) => s.layer === "component");
  if (!componentSection) return COMPONENTS_WITH_PREVIEW.size;
  return componentSection.tree.filter(
    (node) => node.kind === "group" && groupHasPreview(node.label, COMPONENTS_WITH_PREVIEW),
  ).length;
});

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

  const mapping = getSlotMapping(id, undefined, node.type);
  if (!mapping) return undefined;

  const resolved = resolveTokenToValue(id, graph);
  if ("error" in resolved) return undefined;

  // Reuse the recipe engine's emit logic so the highlighted class always
  // matches what the recipe actually produced — color and arbitrary-value
  // types (e.g. ring-offset → `ring-offset-[4px]`) would otherwise resolve to
  // a different scale class through the shadow-node path alone.
  const base = utilityForMapping(graph, node, mapping.utilityType, resolved.value);
  if (base == null) return undefined;
  return mapping.statePrefix != null ? `${mapping.statePrefix}:${base}` : base;
});

// Line numbers in the active code-preview text that contain the assigned
// Tailwind utility for the currently selected (skip-kind) token. When set,
// the CodePreview pulses those lines so the designer can spot the mapping
// without manually scanning the recipe class string.
const utilityHighlightLines = computed<Set<number>>(() => {
  const set = new Set<number>();
  const utility = selectedVueTemplateClasses.value;
  const text = rendered.value?.text;
  if (!utility || !text) return set;
  // Escape regex specials in the utility so brackets and pseudo-class
  // colons match literally.
  const escaped = utility.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineRegex = new RegExp(escaped);
  text.split("\n").forEach((line, idx) => {
    if (lineRegex.test(line)) set.add(idx + 1);
  });
  return set;
});

// When the user clicks a skip-token, jump the right-pane to app.config.ts
// because that's where the resolved utility actually lives. The watch is
// silent on subsequent re-selections within the same kind to avoid
// stealing the user's tab choice once they've manually navigated.
watch(
  () => state.selection.value,
  (id) => {
    if (id === null) return;
    const node = state.graph.value?.nodes.get(id);
    if (node?.layer === "component" && state.outputTab.value !== "app.config.ts") {
      state.outputTab.value = "app.config.ts";
    }
  },
);

const visibleNodes = computed(() => {
  const filter = state.filters.value.classification;
  if (filter === "all") return filteredNodes.value;
  return filteredNodes.value.filter((node) => kindOf(node.id) === filter);
});

// Hierarchical token tree for the left sidebar.
const tokenTree = computed(() => buildTokenTree(visibleNodes.value));

// Layer sections for rendering. `tokenTree` (flat) stays for the path/leaf
// helpers (treeLeafCount, ancestorPaths, search-expand) — same path keys/leaf ids.
const sections = computed(() => buildLayeredTree(visibleNodes.value));

// Collapsed sections. Components open by default; semantic/primitive collapsed.
const collapsedSections = ref<ReadonlySet<GraphLayer>>(new Set(["semantic", "primitive"]));
function toggleSection(layer: GraphLayer): void {
  const next = new Set(collapsedSections.value);
  if (next.has(layer)) next.delete(layer);
  else next.add(layer);
  collapsedSections.value = next;
}

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

function onCoverageSelectTokens(ids: readonly string[]): void {
  state.highlightedIds.value = new Set(ids);
  // A kind-filter (color/dimension/…) would hide the slot's tokens from the tree, making the
  // highlight invisible. Clear it first so the tokens are visible — and so tokenTree (which is
  // built from the filtered visibleNodes) includes them, letting ancestorPaths resolve + expand.
  if (state.filters.value.classification !== "all") {
    state.filters.value = { ...state.filters.value, classification: "all" };
  }
  const next = new Set(expandedPaths.value);
  for (const id of ids) for (const p of ancestorPaths(tokenTree.value, id)) next.add(p);
  expandedPaths.value = next;
  persistExpanded(next);
}

// ScanView "select tokens" (issue / readiness click): highlight, switch to the inspector, and
// open a single token. Clears the kind-filter first (mirrors onCoverageSelectTokens) so the
// highlighted tokens are visible — the clear precedes the selection set so the selection watch's
// auto-expand reads the unfiltered tree.
function onScanSelectTokens(ids: readonly string[]): void {
  state.highlightedIds.value = new Set(ids);
  if (state.filters.value.classification !== "all") {
    state.filters.value = { ...state.filters.value, classification: "all" };
  }
  if (ids.length === 1 && ids[0] !== undefined) state.selection.value = ids[0];
  state.view.value = "inspector";
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

async function handleFiles(files: FileList | readonly File[] | null) {
  if (!files || files.length === 0) return;
  state.loadError.value = null;
  try {
    const { sources, figmaMapping: dropped, slotMapping, warnings } = await loadSources([...files]);
    if (warnings.length > 0) console.warn("Load warnings:", warnings);
    if (sources.length === 0 && !dropped && !slotMapping) {
      state.loadError.value = "No recognized token files in drop.";
      return;
    }
    if (dropped) droppedMapping.value = dropped;
    // Reimport a slot-mapping.json: restore the session resolves (replace).
    if (slotMapping?.overrides) resolveOverride.value = slotMapping.overrides;
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
  const entries = [
    ...defaultRenderers.map((r) => ({
      name: r.id,
      // app.config.ts must carry the same completeness comments the CLI emits,
      // and route flagged components out of its ui: block; the generic registry
      // render(g) drops both. tokens.css ignores options.
      data:
        r.id === appConfigRenderer.id
          ? appConfigRenderer.render(g, {
              completeness: scanReport.value.completeness,
              customComponents: new Set(customParts.value.keys()),
              slotMappingOverride: resolveOverride.value,
            }).text
          : r.render(g).text,
    })),
    // custom-components.ts is only emitted when the rendered text is non-empty.
    ...(customOutputText.value.trim().length > 0
      ? [{
          name: customComponentsRenderer.id,
          // defaultSizeByComponent is unavailable in the browser (no slot-mapping.json); download matches CLI output unless a defaultSizeByComponent override is active. Matches appConfigRenderer's web behaviour.
          data: customOutputText.value,
        }]
      : []),
    ...buildKitFiles(g).map((f) => ({ name: f.path, data: f.content })),
    // Carry the session resolves with the bundle so the CLI/build (and a later
    // reimport) can apply the same slot-mapping overrides. Empty → no entry.
    ...slotMappingBundleEntry(resolveOverride.value),
  ];
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
            class="text-[10px] font-mono px-1.5 py-0.5 rounded border"
            :class="unpushed === 0
              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800'"
            :title="unpushed === 0
              ? `Token Inspector v${appVersion}`
              : `Token Inspector v${appVersion} · ${unpushed} unpushed`"
          >v{{ appVersion }}</span>
        </div>
        <div class="flex items-center gap-3 text-xs text-muted">
          <span v-if="state.graph.value">
            {{ nodeCount }} nodes
            <button
              v-if="issueCount > 0"
              data-testid="scan-toggle"
              class="text-warning hover:underline rounded px-1"
              :class="state.view.value === 'scan' ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700' : ''"
              :aria-pressed="state.view.value === 'scan'"
              @click="state.view.value = state.view.value === 'scan' ? 'inspector' : 'scan'"
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
            data-testid="download-all"
            @click="downloadAll"
          >
            Download .zip
          </UButton>
          <button
            v-if="state.graph.value"
            type="button"
            data-testid="commit-open"
            class="text-xs px-2 py-1 rounded border border-default transition-colors"
            :class="showCommitPanel ? 'bg-elevated' : 'hover:bg-elevated/80'"
            :aria-expanded="showCommitPanel"
            @click="showCommitPanel = !showCommitPanel"
          >Commit…</button>
          <UButton
            v-if="state.graph.value"
            data-testid="clear-graph"
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
      <main class="flex-1 flex flex-col overflow-hidden">
        <!-- Commit panel (header-toggled; only when a graph is loaded) -->
        <CommitPanel
          v-if="state.graph.value && showCommitPanel"
          :graph="state.graph.value"
          :completeness="scanReport.completeness"
        />

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
            <GitLoader
              @files="handleFiles"
              @error="(m: string) => (state.loadError.value = m)"
            />
            <p v-if="state.loadError.value" class="mt-4 text-xs text-error">
              {{ state.loadError.value }}
            </p>
          </div>
        </div>

        <!-- Inspector shell -->
        <template v-else>
          <!-- Scan status strip — in-flow block above the content row -->
          <HeaderStatusStrip
            :report="scanReport"
            :scan-view-active="state.view.value === 'scan'"
            :resolved="resolvedTokenIds"
            :accepted="acceptedIds"
            @open-scan="state.view.value = state.view.value === 'scan' ? 'inspector' : 'scan'"
          />

          <!-- Content row: sidebar · main · output -->
          <div class="flex-1 flex overflow-hidden">
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
              <div class="flex flex-wrap items-center gap-1">
                <FilterChips
                  :model-value="state.filters.value.classification"
                  :summary="summary"
                  @update:model-value="(v) => (state.filters.value = { ...state.filters.value, classification: v })"
                />
                <button
                  type="button"
                  data-testid="live-filter"
                  :aria-pressed="liveOnly"
                  :class="[
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
                    liveOnly
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                      : 'bg-transparent text-zinc-700 border-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800',
                  ]"
                  @click="liveOnly = !liveOnly"
                >
                  <span>Live</span>
                  <span class="text-[10px] font-mono opacity-70">{{ liveCount }}</span>
                </button>
              </div>
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
              <template v-for="section in sections" :key="section.layer">
                <button
                  type="button"
                  class="w-full flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 hover:bg-elevated transition-colors select-none"
                  @click="toggleSection(section.layer)"
                >
                  <span class="font-semibold">
                    {{ collapsedSections.has(section.layer) ? '▸' : '▾' }} {{ section.label }}
                  </span>
                  <span class="font-mono tabular-nums text-zinc-400">{{ section.count }}</span>
                </button>
                <ComponentTree
                  v-if="!collapsedSections.has(section.layer)"
                  :nodes="section.tree"
                  :selected-id="state.selection.value"
                  :highlighted-ids="state.highlightedIds.value"
                  :expanded-paths="effectiveExpandedPaths"
                  :kind-of="kindOf"
                  :preview-components="COMPONENTS_WITH_PREVIEW"
                  :live-only="section.layer === 'component' && liveOnly"
                  @select="(id: string) => (state.selection.value = id)"
                  @toggle="toggleExpanded"
                  @select-component="(name: string) => {
                    selectedComponent = previewComponentForGroup(name, COMPONENTS_WITH_PREVIEW);
                    state.selection.value = null;
                  }"
                />
              </template>
            </div>
            <ResizeHandle side="right" @pointerdown="leftPane.onPointerDown" />
          </aside>

          <!-- Main: scan view OR node detail -->
          <section
            v-if="state.view.value === 'scan'"
            class="flex-1 overflow-y-auto"
          >
            <ScanView
              :report="scanReport"
              :resolved="resolvedTokenIds"
              :accepted="acceptedIds"
              :graph="state.graph.value"
              @select-tokens="onScanSelectTokens"
              @resolve="onResolve"
              @accept="onToggleAccept"
            />
            <ResolvePanel v-if="activeDeviation" :deviation="activeDeviation" @apply="onApply" />
            <UButton v-if="Object.keys(resolveOverride).length > 0" size="xs" variant="outline" data-testid="download-slot-mapping" @click="downloadSlotMapping">Download slot-mapping.json</UButton>
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

              <LiveKitPanel
                v-if="
                  previewSupported &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :custom-parts="customParts"
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
            <div v-else-if="state.graph.value" class="space-y-4">
              <div>
                <div class="font-mono text-xs text-muted">component</div>
                <div class="font-mono text-base">{{ selectedComponent }}</div>
                <div class="text-[11px] text-muted mt-1">
                  Click a token on the left to inspect a single value, or
                  click a different component group to switch the preview.
                </div>
              </div>
              <div v-if="previewSupported" role="tablist" class="flex gap-1 border-b border-default" data-testid="coverage-tabs">
                <button type="button" role="tab" data-testid="kit-tab"
                  :aria-selected="paneTab === 'kit'"
                  class="px-3 py-1 text-xs"
                  :class="paneTab === 'kit' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
                  @click="paneTab = 'kit'"
                >Kit</button>
                <button v-if="coverage" type="button" role="tab" data-testid="coverage-tab"
                  :aria-selected="paneTab === 'coverage'"
                  class="px-3 py-1 text-xs inline-flex items-center gap-1"
                  :class="paneTab === 'coverage' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
                  @click="paneTab = 'coverage'"
                >
                  Coverage
                  <span v-if="coverage.structuralTotal - coverage.structuralTouched > 0"
                    class="text-[10px] font-mono px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                  >{{ coverage.structuralTotal - coverage.structuralTouched }}</span>
                </button>
                <button type="button" role="tab" data-testid="live-build-tab"
                  :aria-selected="paneTab === 'livebuild'"
                  class="px-3 py-1 text-xs"
                  :class="paneTab === 'livebuild' ? 'border-b-2 border-primary font-medium' : 'text-muted'"
                  @click="paneTab = 'livebuild'"
                >Live Build</button>
              </div>

              <CoverageView
                v-if="coverage && paneTab === 'coverage'"
                :coverage="coverage"
                @select-tokens="onCoverageSelectTokens"
              />

              <template v-if="previewSupported && paneTab === 'kit'">
                <LiveKitPanel :graph="state.graph.value" :component-name="selectedComponent" :custom-parts="customParts" />
              </template>
              <template v-if="previewSupported && paneTab === 'livebuild'">
                <LiveBuildPanel :graph="state.graph.value" />
              </template>
            </div>
            <div v-else class="text-sm text-muted">
              Select a token from the left to inspect.
            </div>
          </section>

          <!-- Output: kit + coverage pane -->
          <aside
            class="relative shrink-0 border-l border-default flex flex-col"
            :style="{ width: rightPane.width.value + 'px' }"
          >
            <ResizeHandle side="left" @pointerdown="rightPane.onPointerDown" />
            <div class="flex border-b border-default overflow-x-auto">
              <button
                v-for="tab in outputTabs"
                :key="tab"
                role="tab"
                :data-testid="`tab-${tab}`"
                :aria-selected="state.outputTab.value === tab"
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
                <span
                  v-if="tab === 'custom-components.ts'"
                  class="ml-1 text-[9px] text-muted/60 font-normal"
                >hand-built (not a Nuxt override)</span>
              </button>
            </div>
            <CodePreview
              v-if="rendered"
              :text="rendered.text"
              :lines="rendered.lines"
              :selected-id="state.selection.value"
              :highlighted-ids="state.highlightedIds.value"
              :extra-highlight-lines="utilityHighlightLines"
            />
          </aside>
          </div>
        </template>
      </main>
    </div>
  </UApp>
</template>
