// App state — single source of truth, mirrors the discriminated union
// from docs/screen-breakdown.md. Selection and filters are derived
// views over the immutable TokenGraph; never mutate the graph.

import { ref, computed, type Ref } from "vue";
import type {
  GraphLayer,
  Theme,
  TokenGraph,
  TokenId,
  TokenType,
} from "@core/token-graph.js";
import type { RenderedText, CompletenessScore } from "@core/token-graph.js";
import type { SlotMappingOverride } from "@tg/grammar";
import { defaultRenderers, appConfigRenderer, customComponentsRenderer } from "@core/renderers/index.js";

export type ViewMode = "inspector" | "scan";
export type OutputTab = "tokens.css" | "app.config.ts" | "custom-components.ts";
export type ClassificationFilter =
  | "all"
  | "tailwind-default"
  | "theme-static"
  | "theme-mode-variant"
  | "skip";

export interface Filters {
  search: string;
  layers: ReadonlyArray<GraphLayer>;
  types: ReadonlyArray<TokenType>;
  classification: ClassificationFilter;
}

export interface AppState {
  graph: Ref<TokenGraph | null>;
  selection: Ref<TokenId | null>;
  /** Tokens highlighted by an external trigger (e.g. variant click). */
  highlightedIds: Ref<ReadonlySet<TokenId>>;
  filters: Ref<Filters>;
  view: Ref<ViewMode>;
  outputTab: Ref<OutputTab>;
  theme: Ref<Theme>;
  loadError: Ref<string | null>;
}

const ALL_LAYERS: ReadonlyArray<GraphLayer> = ["primitive", "semantic", "component"];

export function createAppState(): AppState {
  return {
    graph: ref<TokenGraph | null>(null),
    selection: ref<TokenId | null>(null),
    highlightedIds: ref<ReadonlySet<TokenId>>(new Set()),
    filters: ref<Filters>({ search: "", layers: ALL_LAYERS, types: [], classification: "all" }),
    view: ref<ViewMode>("inspector"),
    outputTab: ref<OutputTab>("tokens.css"),
    theme: ref<Theme>("light"),
    loadError: ref<string | null>(null),
  };
}

/**
 * Derived: the rendered text + line map for the currently active output tab.
 * `completeness` (from the scan report) is threaded into the app.config.ts
 * render so the on-screen preview AND the download carry the same
 * `// Incomplete in Figma` comments the CLI emits — otherwise the Inspector
 * output silently diverges from the CLI for the same input.
 */
export function useRenderedOutput(
  state: AppState,
  completeness?: Ref<ReadonlyArray<CompletenessScore> | undefined>,
  customParts?: Ref<ReadonlyMap<string, ReadonlyArray<string>> | undefined>,
  slotMappingOverride?: Ref<SlotMappingOverride | undefined>,
  defaultSizeByComponent?: Ref<Readonly<Record<string, string>> | undefined>,
) {
  return computed<RenderedText | null>(() => {
    const g = state.graph.value;
    if (!g) return null;
    if (state.outputTab.value === appConfigRenderer.id) {
      return appConfigRenderer.render(g, {
        completeness: completeness?.value,
        customComponents: customParts?.value
          ? new Set(customParts.value.keys())
          : undefined,
        slotMappingOverride: slotMappingOverride?.value,
        defaultSizeByComponent: defaultSizeByComponent?.value,
      });
    }
    if (state.outputTab.value === customComponentsRenderer.id) {
      return customComponentsRenderer.render(g, {
        customParts: customParts?.value,
        slotMappingOverride: slotMappingOverride?.value,
        defaultSizeByComponent: defaultSizeByComponent?.value,
      });
    }
    const renderer = defaultRenderers.find((r) => r.id === state.outputTab.value);
    return renderer ? renderer.render(g) : null;
  });
}

/** Derived: nodes after applying search + layer + type filters. */
export function useFilteredNodes(state: AppState) {
  return computed(() => {
    const g = state.graph.value;
    if (!g) return [];
    const { search, layers, types } = state.filters.value;
    const q = search.trim().toLowerCase();
    const out = [];
    for (const node of g.nodes.values()) {
      if (!layers.includes(node.layer)) continue;
      if (types.length > 0 && !types.includes(node.type)) continue;
      if (q && !node.id.includes(q) && !node.path.join("/").toLowerCase().includes(q)) {
        continue;
      }
      out.push(node);
    }
    return out;
  });
}
