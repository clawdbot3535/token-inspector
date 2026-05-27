// Reactive composable wrapping scanGraph(). Recomputes when the graph changes.
// The default allow-list is the canonical COMPONENT_ALLOW_LIST from the
// app-config renderer — single source of truth.

import { computed, type ComputedRef, type Ref } from "vue";
import { scanGraph, type ScanOptions } from "@core/scanner.js";
import type { TokenGraph, ScanReport } from "@core/token-graph.js";
import { COMPONENT_ALLOW_LIST } from "@core/renderers/app-config.js";

const EMPTY_REPORT: ScanReport = {
  issues: [],
  completeness: [],
  forecast: {
    tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 },
    components: [],
    unmappedComponentPrefixes: [],
  },
  generatedAt: 0,
};

const DEFAULT_OPTIONS: ScanOptions = {
  components: COMPONENT_ALLOW_LIST,
};

export function useScanReport(
  graph: Ref<TokenGraph | null>,
  options: ScanOptions = DEFAULT_OPTIONS,
): ComputedRef<ScanReport> {
  return computed(() => {
    const g = graph.value;
    if (!g) return EMPTY_REPORT;
    return scanGraph(g, options);
  });
}
