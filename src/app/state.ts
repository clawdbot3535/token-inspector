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
import type { RenderedText } from "@core/token-graph.js";
import { defaultRenderers } from "@core/renderers/index.js";

export type ViewMode = "inspector" | "issues";
export type OutputTab =
  | "tokens.css"
  | "app.config.ts"
  | "tokens.ts"
  /** New Tailwind v4 @theme{} renderer — maps to tokensCssRenderer (id: "tokens-css"). */
  | "tokens-css";
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

/** Derived: the rendered text + line map for the currently active output tab. */
export function useRenderedOutput(state: AppState) {
  return computed<RenderedText | null>(() => {
    if (!state.graph.value) return null;
    const renderer = defaultRenderers.find((r) => r.id === state.outputTab.value);
    return renderer ? renderer.render(state.graph.value) : null;
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
