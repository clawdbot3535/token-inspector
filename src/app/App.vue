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
import ScanView from "./components/ScanView.vue";
import HeaderStatusStrip from "./components/HeaderStatusStrip.vue";
import FigmaPreview from "./components/FigmaPreview.vue";
import LiveButton from "./components/LiveButton.vue";
import LiveBadge from "./components/LiveBadge.vue";
import LiveInput from "./components/LiveInput.vue";
import LiveSwitch from "./components/LiveSwitch.vue";
import LiveCheckbox from "./components/LiveCheckbox.vue";
import LiveRadio from "./components/LiveRadio.vue";
import ComponentTree from "./components/ComponentTree.vue";
import { buildTokenTree, buildLayeredTree, leafIds, ancestorPaths } from "./token-tree.js";
import ClassificationBadge from "./components/ClassificationBadge.vue";
import FilterChips from "./components/FilterChips.vue";
import SummaryPanel from "./components/SummaryPanel.vue";
import OutputSection from "./components/OutputSection.vue";
import { useClassifications } from "./classifications.js";
import { resolveTokenToValue } from "@core/resolve-token.js";
import { getSlotMapping } from "@core/slot-mapping.js";
import { utilityForMapping } from "@core/recipe-engine.js";
import { defaultRenderers, appConfigRenderer } from "@core/renderers/index.js";
import type { GraphLayer } from "@core/token-graph.js";
import { buildZip, downloadBlob } from "./zip.js";
import { useScanReport } from "./composables/use-scan-report.js";
import {
  loadFigmaMapping,
  parseFigmaFileUrl,
  buildTokenToVariants,
  matchMapping,
  type FigmaMappingFile,
} from "./figma-mapping.js";
import { parseGitUrl, fetchTokenFiles } from "./git-import.js";
import { commitFiles, type ExportFile } from "./git-export.js";

const appVersion = __APP_VERSION__;

const builtInMapping = ref<FigmaMappingFile>({ components: [] });
const droppedMapping = ref<FigmaMappingFile | null>(null);
const pastedFileUrl = ref<string | null>(
  typeof localStorage !== "undefined"
    ? localStorage.getItem("figma-file-url")
    : null,
);

const repoUrl = ref<string>(
  typeof localStorage !== "undefined"
    ? (localStorage.getItem("figma-tokens-repo-url") ?? "")
    : "",
);
const repoLoading = ref(false);

const exportUrl = ref<string>(
  typeof localStorage !== "undefined" ? (localStorage.getItem("figma-tokens-export-url") ?? "") : "",
);
const commitMessage = ref<string>("chore(tokens): update from Figma");
const pat = ref<string>(
  typeof sessionStorage !== "undefined" ? (sessionStorage.getItem("git-export-pat") ?? "") : "",
);
const committing = ref(false);
const commitConfirm = ref(false);
const commitUrl = ref<string | null>(null);
const commitError = ref<string | null>(null);

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
// Thread the scan completeness into the rendered app.config.ts so the
// on-screen preview matches the CLI output (and the download below).
const rendered = useRenderedOutput(
  state,
  computed(() => scanReport.value.completeness),
);
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

// LiveButton renders <button> markup with button-specific defaults
// (transition-colors, fallback blue chrome). Rendering it for badge / nav /
// card etc. would produce a button-shaped preview for components that
// aren't buttons — confusing. Gate the visual preview on the supported
// set; other components still get the token tree, OutputSection, and
// code-preview highlighting, just not the rendered chip.
const COMPONENTS_WITH_PREVIEW: ReadonlySet<string> = new Set(["button", "input", "textarea", "badge", "switch", "checkbox", "radio"]);
// input + textarea are the form-field previews (rendered by LiveInput); button
// is rendered by LiveButton.
const FIELD_PREVIEW_COMPONENTS: ReadonlySet<string> = new Set(["input", "textarea"]);
const isFieldComponent = computed(() => FIELD_PREVIEW_COMPONENTS.has(selectedComponent.value));
const previewSupported = computed(() =>
  COMPONENTS_WITH_PREVIEW.has(selectedComponent.value),
);

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

// Lucide icon name to render inside the live preview for the focused
// component. Prefers the figma-mapping.json defaultIcon; otherwise uses a
// per-component sensible default (e.g. a search glyph for inputs); finally
// falls back to "i-lucide-rocket" so the icon slot stays visible.
const DEFAULT_PREVIEW_ICONS: Readonly<Record<string, string>> = {
  input: "i-lucide-search",
};
const iconForSelectedComponent = computed<string>(() => {
  const mapping = figmaMapping.value.components.find(
    (c) => c.prefix === selectedComponent.value,
  );
  return (
    mapping?.defaultIcon ??
    DEFAULT_PREVIEW_ICONS[selectedComponent.value] ??
    "i-lucide-rocket"
  );
});

async function handleFiles(files: FileList | readonly File[] | null) {
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

async function loadFromRepo() {
  const ref_ = parseGitUrl(repoUrl.value);
  if (!ref_) {
    state.loadError.value = "Unrecognised GitHub/GitLab URL.";
    return;
  }
  repoLoading.value = true;
  try {
    const files = await fetchTokenFiles(ref_);
    await handleFiles(files);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("figma-tokens-repo-url", repoUrl.value.trim());
    }
  } catch (e) {
    state.loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    repoLoading.value = false;
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

function persistPat() {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem("git-export-pat", pat.value);
}

function buildExportFiles(): ExportFile[] {
  const g = state.graph.value;
  if (!g) return [];
  const target = parseGitUrl(exportUrl.value);
  const dir = target?.dir ?? "";
  return defaultRenderers.map((r) => ({
    path: dir ? `${dir}/${r.id}` : r.id,
    content:
      r.id === appConfigRenderer.id
        ? appConfigRenderer.render(g, { completeness: scanReport.value.completeness }).text
        : r.render(g).text,
  }));
}

function requestCommit() {
  commitUrl.value = null;
  commitError.value = null;
  if (!state.graph.value) { commitError.value = "Load tokens first."; return; }
  if (!parseGitUrl(exportUrl.value)) { commitError.value = "Unrecognised GitHub/GitLab URL."; return; }
  if (pat.value.trim().length === 0) { commitError.value = "A write token is required."; return; }
  commitConfirm.value = true;
}

async function doCommit() {
  const target = parseGitUrl(exportUrl.value);
  if (!target) { commitError.value = "Unrecognised GitHub/GitLab URL."; commitConfirm.value = false; return; }
  committing.value = true;
  try {
    const result = await commitFiles(target, buildExportFiles(), pat.value.trim(), commitMessage.value);
    commitUrl.value = result.commitUrl;
    if (typeof localStorage !== "undefined") localStorage.setItem("figma-tokens-export-url", exportUrl.value.trim());
  } catch (e) {
    commitError.value = e instanceof Error ? e.message : "Commit failed.";
  } finally {
    committing.value = false;
    commitConfirm.value = false;
  }
}

function downloadAll() {
  const g = state.graph.value;
  if (!g) return;
  const entries = defaultRenderers.map((r) => ({
    name: r.id,
    // app.config.ts must carry the same completeness comments the CLI emits;
    // the generic registry render(g) drops them. tokens.css ignores options.
    data:
      r.id === appConfigRenderer.id
        ? appConfigRenderer.render(g, {
            completeness: scanReport.value.completeness,
          }).text
        : r.render(g).text,
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
      <main class="flex-1 flex flex-col overflow-hidden">
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
            <div class="mt-4 flex gap-2 items-center">
              <input
                v-model="repoUrl"
                type="text"
                placeholder="GitHub / GitLab folder URL…"
                class="flex-1 text-xs px-2 py-1.5 rounded border border-default bg-default focus:outline-none focus:border-primary"
                @keydown.enter="loadFromRepo"
              />
              <button
                data-testid="repo-load"
                :disabled="repoLoading || repoUrl.trim().length === 0"
                class="px-3 py-1.5 text-xs rounded-md bg-elevated border border-default hover:bg-elevated/80 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                @click="loadFromRepo"
              >{{ repoLoading ? "Loading…" : "Load from Git" }}</button>
            </div>
            <p v-if="state.loadError.value" class="mt-4 text-xs text-error">
              {{ state.loadError.value }}
            </p>
            <div class="flex flex-col gap-2 mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <span class="text-[10px] uppercase tracking-wider text-zinc-400">Commit to Git</span>
              <input
                type="text"
                v-model="exportUrl"
                data-testid="export-url"
                placeholder="target repo: github.com/owner/nuxt-app/tree/main/app"
                class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent font-mono"
              />
              <input
                type="text"
                v-model="commitMessage"
                placeholder="commit message"
                class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
              />
              <input
                type="password"
                v-model="pat"
                data-testid="export-pat"
                placeholder="write PAT (kept in sessionStorage only)"
                autocomplete="off"
                class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent font-mono"
                @input="persistPat"
              />
              <button
                type="button"
                data-testid="commit-button"
                class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                :disabled="committing || !state.graph.value"
                @click="requestCommit"
              >Commit to Git…</button>

              <div
                v-if="commitConfirm"
                data-testid="commit-confirm"
                class="text-[11px] rounded border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1"
              >
                <p>Commit <code class="font-mono">tokens.css</code> + <code class="font-mono">app.config.ts</code> to:</p>
                <p class="font-mono break-all">{{ exportUrl }}</p>
                <div class="flex gap-2 pt-1">
                  <button type="button" class="px-2 py-0.5 rounded bg-primary text-inverted disabled:opacity-50" :disabled="committing" @click="doCommit">{{ committing ? "Committing…" : "Confirm" }}</button>
                  <button type="button" class="px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700" :disabled="committing" @click="commitConfirm = false">Cancel</button>
                </div>
              </div>

              <p v-if="commitUrl" data-testid="commit-result" class="text-[11px] text-emerald-600 dark:text-emerald-400 break-all">
                Committed: <a :href="commitUrl" target="_blank" rel="noopener" class="underline">{{ commitUrl }}</a>
              </p>
              <p v-if="commitError" class="text-[11px] text-red-600 dark:text-red-400">{{ commitError }}</p>
            </div>
          </div>
        </div>

        <!-- Inspector shell -->
        <template v-else>
          <!-- Scan status strip — in-flow block above the content row -->
          <HeaderStatusStrip
            :report="scanReport"
            :scan-view-active="state.view.value === 'scan'"
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
                  @select="(id: string) => (state.selection.value = id)"
                  @toggle="toggleExpanded"
                  @select-component="(name: string) => {
                    selectedComponent = name;
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
              @select-tokens="(ids: readonly string[]) => {
                state.highlightedIds.value = new Set(ids);
                if (ids.length === 1 && ids[0] !== undefined) state.selection.value = ids[0];
                state.view.value = 'inspector';
              }"
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

              <LiveInput
                v-if="
                  previewSupported &&
                  isFieldComponent &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :leading-icon-name="iconForSelectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
              <LiveBadge
                v-else-if="
                  previewSupported &&
                  selectedComponent === 'badge' &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
              <LiveSwitch
                v-else-if="
                  previewSupported &&
                  selectedComponent === 'switch' &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
              <LiveCheckbox
                v-else-if="
                  previewSupported &&
                  selectedComponent === 'checkbox' &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
              <LiveRadio
                v-else-if="
                  previewSupported &&
                  selectedComponent === 'radio' &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
              />
              <LiveButton
                v-else-if="
                  previewSupported &&
                  selectedNode.id.split('-')[0] === selectedComponent
                "
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :icon-name="iconForSelectedComponent"
                :highlight-utility="selectedVueTemplateClasses"
                :completeness="scanReport.completeness"
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
              <LiveInput
                v-if="previewSupported && isFieldComponent"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :leading-icon-name="iconForSelectedComponent"
                :completeness="scanReport.completeness"
              />
              <LiveBadge
                v-else-if="previewSupported && selectedComponent === 'badge'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :completeness="scanReport.completeness"
              />
              <LiveSwitch
                v-else-if="previewSupported && selectedComponent === 'switch'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :completeness="scanReport.completeness"
              />
              <LiveCheckbox
                v-else-if="previewSupported && selectedComponent === 'checkbox'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :completeness="scanReport.completeness"
              />
              <LiveRadio
                v-else-if="previewSupported && selectedComponent === 'radio'"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :completeness="scanReport.completeness"
              />
              <LiveButton
                v-else-if="previewSupported"
                :graph="state.graph.value"
                :component-name="selectedComponent"
                :icon-name="iconForSelectedComponent"
                :completeness="scanReport.completeness"
              />
              <div
                v-else
                class="rounded-md ring-1 ring-warning/30 bg-warning/5 px-3 py-3 text-xs space-y-1"
              >
                <div class="text-warning font-medium">
                  Live preview not yet available for
                  <code class="font-mono">{{ selectedComponent }}</code>.
                </div>
                <div class="text-zinc-500">
                  Only <code class="font-mono">button</code>,
                  <code class="font-mono">input</code>,
                  <code class="font-mono">textarea</code>,
                  <code class="font-mono">badge</code>,
                  <code class="font-mono">switch</code>,
                  <code class="font-mono">checkbox</code> and
                  <code class="font-mono">radio</code> have a rendered
                  preview today — other components produce the correct
                  <code class="font-mono">app.config.ts</code> recipe and
                  highlight on click, but the visual chip is button-specific
                  and would mis-represent
                  <code class="font-mono">{{ selectedComponent }}</code>.
                  Component-shaped previews arrive in v0.5.0+.
                </div>
              </div>
            </div>
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
              :extra-highlight-lines="utilityHighlightLines"
            />
          </aside>
          </div>
        </template>
      </main>
    </div>
  </UApp>
</template>
