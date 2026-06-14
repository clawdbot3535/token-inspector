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
import { collectTypographyComposites } from "@core/renderers/typography-composites.js";
import { collectLayoutPrimitives } from "@core/renderers/layout-primitives.js";

/**
 * Inspector classification map: the core classification, plus overrides for the
 * component-layer tokens the renderer emits as Tailwind v4 @theme vars
 * (typography roles → --text-*, layout primitives → --container-/--spacing-/--radius-*).
 * Those would otherwise read as `skip`, diverging from the actual CLI/download
 * output. Reuses the existing `theme-static` kind so the badge, summary, filter,
 * and detail panel all reflect the real emit.
 */
export function buildInspectorClassifications(
  graph: TokenGraph,
): Map<string, Classification> {
  const out = new Map<string, Classification>(classifyGraph(graph));
  for (const e of [
    ...collectTypographyComposites(graph),
    ...collectLayoutPrimitives(graph),
  ]) {
    out.set(e.tokenId, {
      kind: "theme-static",
      cssName: e.cssName,
      value: e.value,
      modeInvariantHint: false,
    });
  }
  return out;
}

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
    return buildInspectorClassifications(g);
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
