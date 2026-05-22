// Aggregates data-quality + classification-hint + build-time issues
// into a single ScanReport. Allow-list scoped per component.

import type {
  TokenGraph,
  TokenNode,
  ScanIssue,
  ScanReport,
  CompletenessScore,
  OutputForecast,
} from "./token-graph.js";
import { classifyToken } from "./classify-token.js";
import { getSlotMapping } from "./slot-mapping.js";
import { matchSpacing } from "./tailwind-defaults.js";

// Standard size key ordering — xs is the smallest / most fringe position.
const SIZE_ORDER: ReadonlyArray<string> = ["xs", "sm", "md", "lg", "xl", "2xl"];

export interface ScanOptions {
  components: ReadonlyArray<string>;
  remBase?: number;
}

// Internal entry used while building per-component data.
interface ComponentEntry {
  node: TokenNode;
  utilityType: string;
  variantKey: string | null;
  value: string;
}

export function scanGraph(graph: TokenGraph, options: ScanOptions): ScanReport {
  const issues: ScanIssue[] = [];
  const allowSet = new Set(options.components);

  // ─── 1. Build-time issues ─────────────────────────────────────────────────
  for (const gi of graph.issues) {
    issues.push({
      id: `bt-${gi.kind}-${gi.nodeId ?? "global"}-${issues.length}`,
      category: "build-time",
      severity: "error",
      kind: gi.kind,
      message: gi.message,
      tokenIds: gi.nodeId !== undefined ? [gi.nodeId] : [],
    });
  }

  // ─── 2. Index component-layer tokens ──────────────────────────────────────
  const componentTokens = new Map<string, ComponentEntry[]>();
  const allComponentPrefixes = new Set<string>();

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const prefix = node.id.split("-")[0];
    if (prefix === undefined) continue;
    allComponentPrefixes.add(prefix);
    if (!allowSet.has(prefix)) continue;
    const mapping = getSlotMapping(node.id);
    if (mapping === null) continue;
    const value =
      node.cssValue.base ?? node.cssValue.light ?? node.cssValue.dark ?? "";
    const arr = componentTokens.get(prefix) ?? [];
    arr.push({ node, utilityType: mapping.utilityType, variantKey: mapping.variantKey, value });
    componentTokens.set(prefix, arr);
  }

  // ─── 3. Per-component analysis ────────────────────────────────────────────
  const completeness: CompletenessScore[] = [];

  for (const [componentName, entries] of componentTokens) {
    // Maps: size → Set<utilityType>
    const utilitiesPerSize = new Map<string, Set<string>>();
    // Maps: utilityType → Set<sizeKey> (only for size-suffixed)
    const utilityHasSizeVariants = new Map<string, Set<string>>();
    // Maps: utilityType → { tokenId, value } for non-suffixed entries
    const utilityNonSuffix = new Map<string, { tokenId: string; value: string }>();
    // Maps: utilityType → Map<sizeKey, { tokenId, value }>
    const utilitySuffixValues = new Map<
      string,
      Map<string, { tokenId: string; value: string }>
    >();

    for (const { node, utilityType, variantKey, value } of entries) {
      if (variantKey === null) {
        utilityNonSuffix.set(utilityType, { tokenId: node.id, value });
      } else {
        // Size-suffixed entry
        let sizeMap = utilitySuffixValues.get(utilityType);
        if (sizeMap === undefined) {
          sizeMap = new Map();
          utilitySuffixValues.set(utilityType, sizeMap);
        }
        sizeMap.set(variantKey, { tokenId: node.id, value });

        let sizeSet = utilityHasSizeVariants.get(utilityType);
        if (sizeSet === undefined) {
          sizeSet = new Set();
          utilityHasSizeVariants.set(utilityType, sizeSet);
        }
        sizeSet.add(variantKey);

        let perSize = utilitiesPerSize.get(variantKey);
        if (perSize === undefined) {
          perSize = new Set();
          utilitiesPerSize.set(variantKey, perSize);
        }
        perSize.add(utilityType);
      }
    }

    // Canonical utility set = union across all sizes
    const canonicalUtilities = new Set<string>();
    for (const set of utilitiesPerSize.values()) {
      for (const u of set) canonicalUtilities.add(u);
    }

    // Non-suffix vs size-suffix conflict detection
    for (const [utility, nonSuffix] of utilityNonSuffix) {
      const sizeMap = utilitySuffixValues.get(utility);
      if (sizeMap === undefined) continue;
      for (const [variantKey, sizeEntry] of sizeMap) {
        if (sizeEntry.value !== nonSuffix.value) {
          issues.push({
            id: `dq-conflict-${componentName}-${utility}-${variantKey}`,
            category: "data-quality",
            severity: "warning",
            kind: "non-suffix-vs-size-conflict",
            message: `${componentName}.${utility} (${nonSuffix.value}) conflicts with ${componentName}.${utility}-${variantKey} (${sizeEntry.value}). Size-specific value wins.`,
            tokenIds: [nonSuffix.tokenId, sizeEntry.tokenId],
            componentName,
          });
          break; // one conflict per utility is enough
        }
      }
    }

    // Incomplete size variant + completeness scores
    for (const [variantKey, defined] of utilitiesPerSize) {
      const missing = Array.from(canonicalUtilities).filter(
        (u) => !defined.has(u),
      );
      completeness.push({
        component: componentName,
        axis: "size",
        variantKey,
        defined: defined.size,
        total: canonicalUtilities.size,
        missingUtilities: missing,
      });
      if (missing.length > 0) {
        issues.push({
          id: `dq-incomplete-${componentName}-${variantKey}`,
          category: "data-quality",
          severity: "warning",
          kind: "incomplete-size-variant",
          message: `${componentName}.${variantKey} is missing: ${missing.join(", ")}`,
          tokenIds: [],
          componentName,
          variantKey,
        });
      }
    }

    // Asymmetric size coverage
    const allSizes = new Set<string>();
    for (const sizeSet of utilityHasSizeVariants.values()) {
      for (const k of sizeSet) allSizes.add(k);
    }
    for (const [utility, sizes] of utilityHasSizeVariants) {
      const missingSizes = Array.from(allSizes).filter((s) => !sizes.has(s));
      if (missingSizes.length > 0) {
        issues.push({
          id: `dq-asym-${componentName}-${utility}`,
          category: "data-quality",
          severity: "warning",
          kind: "asymmetric-size-coverage",
          message: `${componentName}.${utility} has sizes [${Array.from(sizes).join(", ")}] but other utilities also cover [${missingSizes.join(", ")}].`,
          tokenIds: [],
          componentName,
        });
      }
    }

    // Orphaned size keys (a size suffix used by fewer utilities than the maximum).
    // All sizes with count < maxSizeCount are flagged; when all are equal (single
    // utility), the one with the "smallest" standard position comes first so the
    // most-unusual variant is surfaced at the top of the issue list.
    const sizeUseCount = new Map<string, number>();
    for (const sizeSet of utilityHasSizeVariants.values()) {
      for (const s of sizeSet) {
        sizeUseCount.set(s, (sizeUseCount.get(s) ?? 0) + 1);
      }
    }
    const maxSizeCount = sizeUseCount.size > 0
      ? Math.max(...sizeUseCount.values())
      : 0;
    // Sort orphan candidates: fringe sizes (xs, sm) before common ones (md, lg).
    const orphanCandidates = Array.from(sizeUseCount.entries())
      .filter(([, count]) => count < maxSizeCount || maxSizeCount === 1)
      .sort(([a], [b]) => {
        const ai = SIZE_ORDER.indexOf(a);
        const bi = SIZE_ORDER.indexOf(b);
        const aIdx = ai === -1 ? SIZE_ORDER.length : ai;
        const bIdx = bi === -1 ? SIZE_ORDER.length : bi;
        return aIdx - bIdx;
      });
    for (const [size] of orphanCandidates) {
      issues.push({
        id: `dq-orphan-${componentName}-${size}`,
        category: "data-quality",
        severity: "hint",
        kind: "orphaned-size-key",
        message: `${componentName}: size '${size}' appears on only one utility — possibly typo or unfinished pass.`,
        tokenIds: [],
        componentName,
        variantKey: size,
      });
    }
  }

  // ─── 4. Classification hints (all nodes) ──────────────────────────────────
  for (const node of graph.nodes.values()) {
    // Mode-invariant semantic: light and dark values are identical
    if (
      (node.source === "light" || node.source === "dark") &&
      node.cssValue.light !== undefined &&
      node.cssValue.dark !== undefined &&
      node.cssValue.light === node.cssValue.dark
    ) {
      issues.push({
        id: `ch-mode-invariant-${node.id}`,
        category: "classification-hint",
        severity: "hint",
        kind: "mode-invariant-semantic",
        message: `${node.id} has identical light + dark values — consider moving to a primitive file.`,
        tokenIds: [node.id],
      });
    }

    // Snap-to-tailwind: primitive dimension/number that doesn't match but
    // is within 1-2px of a Tailwind default.
    if (
      node.layer === "primitive" &&
      (node.type === "dimension" || node.type === "number")
    ) {
      const value = node.cssValue.base;
      if (value === undefined) continue;
      // Skip if it already matches a Tailwind default.
      const alreadyMatched = matchSpacing(value, options.remBase);
      if (alreadyMatched !== null) continue;
      const suggestion = suggestNearestTailwind(value, options.remBase);
      if (suggestion !== null) {
        issues.push({
          id: `ch-snap-${node.id}`,
          category: "classification-hint",
          severity: "hint",
          kind: "snap-to-tailwind",
          message: `${node.id} = ${value} is close to ${suggestion.utility} (${suggestion.value}) — consider snapping.`,
          tokenIds: [node.id],
        });
      }
    }
  }

  // ─── 5. Output forecast ───────────────────────────────────────────────────
  const forecast = computeForecast(
    graph,
    allowSet,
    allComponentPrefixes,
    completeness,
    options.remBase,
  );

  return {
    issues,
    completeness,
    forecast,
    generatedAt: Date.now(),
  };
}

/**
 * If `value` is a px dimension that doesn't match a Tailwind spacing default
 * but is within 2px of one, return the nearest candidate.
 */
function suggestNearestTailwind(
  value: string,
  remBase?: number,
): { utility: string; value: string } | null {
  const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (pxMatch === null || pxMatch[1] === undefined) return null;
  const px = Number.parseFloat(pxMatch[1]);
  // Search offsets in priority order: -1, +1, -2, +2
  for (const delta of [-1, 1, -2, 2]) {
    const candidate = px + delta;
    if (candidate <= 0) continue;
    const hit = matchSpacing(`${candidate}px`, remBase);
    if (hit !== null) {
      return { utility: `p-${hit}`, value: `${candidate}px` };
    }
  }
  return null;
}

function computeForecast(
  graph: TokenGraph,
  allowSet: ReadonlySet<string>,
  allComponentPrefixes: ReadonlySet<string>,
  completeness: ReadonlyArray<CompletenessScore>,
  remBase?: number,
): OutputForecast {
  let tailwindMatches = 0;
  let themeExtensions = 0;
  let modeVariantEntries = 0;
  let estimatedBytes = 200; // baseline overhead

  for (const node of graph.nodes.values()) {
    const c = classifyToken(node, graph, remBase !== undefined ? { remBase } : {});
    switch (c.kind) {
      case "tailwind-default":
        tailwindMatches++;
        break;
      case "theme-static":
        themeExtensions++;
        estimatedBytes += c.cssName.length + c.value.length + 8;
        break;
      case "theme-mode-variant":
        modeVariantEntries++;
        estimatedBytes +=
          c.cssName.length * 2 +
          c.lightValue.length +
          c.darkValue.length +
          16;
        break;
      case "skip":
        // component-layer — no output
        break;
    }
  }

  // Group completeness scores by component name
  const componentsByName = new Map<string, CompletenessScore[]>();
  for (const score of completeness) {
    const arr = componentsByName.get(score.component) ?? [];
    arr.push(score);
    componentsByName.set(score.component, arr);
  }

  const components = Array.from(allComponentPrefixes)
    .sort()
    .map((name) => ({
      name,
      inAllowList: allowSet.has(name),
      variants: (componentsByName.get(name) ?? []) as readonly CompletenessScore[],
    }));

  const unmappedComponentPrefixes = Array.from(allComponentPrefixes)
    .filter((p) => !allowSet.has(p))
    .sort();

  return {
    tokensCss: {
      estimatedBytes,
      tailwindMatches,
      themeExtensions,
      modeVariantEntries,
    },
    components,
    unmappedComponentPrefixes,
  };
}
