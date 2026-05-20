// Reactive classification map for the loaded graph.
//
// Builds Map<TokenId, Classification> on demand and memoizes by graph
// identity — recomputes only when a new graph is dropped.

import { computed, type ComputedRef, type Ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import {
  classifyGraph,
  type Classification,
  type ClassificationKind,
} from "@core/classify-token.js";

export interface ClassificationSummary {
  readonly total: number;
  readonly tailwind: number;
  readonly themeStatic: number;
  readonly modeVariant: number;
  readonly skipped: number;
}

export function useClassifications(
  graph: Ref<TokenGraph | null>,
): {
  classifications: ComputedRef<ReadonlyMap<string, Classification>>;
  summary: ComputedRef<ClassificationSummary>;
  kindOf: (tokenId: string) => ClassificationKind | null;
} {
  const classifications = computed<ReadonlyMap<string, Classification>>(() => {
    const g = graph.value;
    if (!g) return new Map();
    return classifyGraph(g);
  });

  const summary = computed<ClassificationSummary>(() => {
    let tailwind = 0;
    let themeStatic = 0;
    let modeVariant = 0;
    let skipped = 0;
    for (const c of classifications.value.values()) {
      switch (c.kind) {
        case "tailwind-default":
          tailwind++;
          break;
        case "theme-static":
          themeStatic++;
          break;
        case "theme-mode-variant":
          modeVariant++;
          break;
        case "skip":
          skipped++;
          break;
      }
    }
    return {
      total: tailwind + themeStatic + modeVariant + skipped,
      tailwind,
      themeStatic,
      modeVariant,
      skipped,
    };
  });

  function kindOf(tokenId: string): ClassificationKind | null {
    return classifications.value.get(tokenId)?.kind ?? null;
  }

  return { classifications, summary, kindOf };
}
