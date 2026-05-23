// Aggregates data-quality + classification-hint + build-time issues
// into a single ScanReport. Allow-list scoped per component.

import type {
  TokenGraph,
  TokenNode,
  ScanIssue,
  ScanReport,
  ScanSeverity,
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
    // The scanner's data-quality checks below operate on the size axis
    // only — they treat `variantKey` as a size key. Skip tokens on other
    // axes (variant/state) to avoid false-positive completeness warnings;
    // size-axis tokens and unbucketed tokens still flow through.
    if (mapping.variantAxis !== null && mapping.variantAxis !== "size") {
      continue;
    }
    const value =
      node.cssValue.base ?? node.cssValue.light ?? node.cssValue.dark ?? "";
    const arr = componentTokens.get(prefix) ?? [];
    arr.push({
      node,
      utilityType: mapping.utilityType,
      variantKey: mapping.variantKey,
      value,
    });
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

  // ─── 5. Variant-axis asymmetry detection ─────────────────────────────────
  // Runs on every component prefix in the graph (NOT scoped to allow-list),
  // because designers need feedback on shape consistency regardless of
  // whether the component will be rendered into app.config.ts yet.
  for (const issue of detectAsymmetricVariantCoverage(graph)) {
    issues.push(issue);
  }

  // ─── 6. Output forecast ───────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────
// Variant-axis asymmetry detection
//
// Detects "designer forgot to mirror a value into another variant" shapes
// across all components in the graph. A 2nd-segment is treated as a
// variant when its name is in KNOWN_VARIANT_NAMES — that list covers
// Nuxt UI v4 visual variants (solid/outline/ghost/link/subtle/soft)
// plus semantic color roles commonly used as variants on info-style
// components (accent/default/primary/secondary/success/error/warning/info/neutral).
//
// The same word can act as a variant in 2nd position or a state-modifier
// in trailing position; position alone disambiguates. That lets us
// recognise `badge-error-bg` (variant=error) and `chip-bg-error`
// (state=error) without conflict.
// ────────────────────────────────────────────────────────────────────────────

const KNOWN_VARIANT_NAMES: ReadonlySet<string> = new Set([
  // Nuxt UI v4 visual variants
  "solid",
  "outline",
  "ghost",
  "link",
  "subtle",
  "soft",
  // Semantic color-role variants (badge, alert, status etc.)
  "accent",
  "default",
  "primary",
  "secondary",
  "success",
  "error",
  "warning",
  "info",
  "neutral",
]);

const ASYM_STATE_KEYS: ReadonlySet<string> = new Set([
  // Real interaction states
  "default",
  "hover",
  "active",
  "disabled",
  "focus",
  // Component-internal state modifiers (treated as states when trailing)
  "checked",
  "hovered",
  // Semantic state modifiers — same words also appear in KNOWN_VARIANT_NAMES
  // but at a different position; position disambiguates the role.
  "error",
  "success",
  "warning",
  "info",
]);

const ASYM_SIZE_KEYS: ReadonlySet<string> = new Set([
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
]);

interface ParsedComponentToken {
  /** 2nd segment of the id — known variant key (never null when returned). */
  variant: string;
  /** Utility base joining 3rd…N segments minus any trailing state/size. */
  utilityBase: string;
  /** Trailing state suffix (hover/active/...) when present. */
  state: string | null;
}

function parseComponentTokenId(
  id: string,
  prefix: string,
): ParsedComponentToken | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const parts = id.split("-");
  // Need at least: prefix + variant + utility
  if (parts.length < 3) return null;
  const variant = parts[1];
  if (variant === undefined) return null;
  // Reject 2nd-segments that aren't recognised variant names; this is
  // the primary discriminator vs. utility namespaces (font, padding, …).
  if (!KNOWN_VARIANT_NAMES.has(variant)) return null;

  let end = parts.length;
  let state: string | null = null;
  const last = parts[parts.length - 1];
  if (last !== undefined) {
    if (ASYM_STATE_KEYS.has(last)) {
      state = last;
      end -= 1;
    } else if (ASYM_SIZE_KEYS.has(last)) {
      end -= 1;
    }
  }

  const utilityBase = parts.slice(2, end).join("-");
  if (utilityBase.length === 0) return null;
  return { variant, utilityBase, state };
}

export function detectAsymmetricVariantCoverage(
  graph: TokenGraph,
): ScanIssue[] {
  const issues: ScanIssue[] = [];

  // Group component-layer tokens by their prefix.
  const byPrefix = new Map<string, string[]>();
  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const prefix = node.id.split("-")[0];
    if (prefix === undefined) continue;
    const arr = byPrefix.get(prefix) ?? [];
    arr.push(node.id);
    byPrefix.set(prefix, arr);
  }

  for (const [prefix, ids] of byPrefix) {
    // Parse every token; tokens whose 2nd-segment isn't a known variant
    // (utility-namespace tokens, single-shape tokens) are filtered out
    // inside parseComponentTokenId.
    const variants = new Set<string>();
    const parsedTokens: Array<{ id: string; parsed: ParsedComponentToken }> = [];
    for (const id of ids) {
      const parsed = parseComponentTokenId(id, prefix);
      if (parsed === null) continue;
      parsedTokens.push({ id, parsed });
      variants.add(parsed.variant);
    }

    if (variants.size < 2) continue; // Not a multi-variant component.

    // Matrix cell key: `${utility}|${state ?? ""}` → variants that have it.
    const matrix = new Map<string, Set<string>>();
    for (const { parsed } of parsedTokens) {
      const cellKey = `${parsed.utilityBase}|${parsed.state ?? ""}`;
      let set = matrix.get(cellKey);
      if (!set) {
        set = new Set();
        matrix.set(cellKey, set);
      }
      set.add(parsed.variant);
    }

    const allVariants = [...variants].sort();
    for (const [cellKey, present] of matrix) {
      const missing = allVariants.filter((v) => !present.has(v));
      if (missing.length === 0) continue;

      const [utility, state] = cellKey.split("|");
      const utilityDisplay = state ? `${utility}-${state}` : utility;

      // Severity tiering: single-variant utility ("only outline has border")
      // is likely intentional → hint. Two or more sibling variants have it
      // → almost certainly a forgotten mirror → warning.
      const haveCount = present.size;
      const severity: ScanSeverity = haveCount >= 2 ? "warning" : "hint";

      const haveStr = [...present].sort().join(", ");
      const missingStr = missing.join(", ");
      const intentionalNote =
        haveCount === 1
          ? ` Only one variant defines this — likely intentional (e.g. outline is the only variant with a border), but worth confirming.`
          : ``;

      issues.push({
        id: `dq-asym-variant-${prefix}-${cellKey.replace("|", "-")}`,
        category: "data-quality",
        severity,
        kind: "asymmetric-variant-coverage",
        message: `${prefix}.${utilityDisplay} is defined on [${haveStr}] but missing on [${missingStr}].${intentionalNote} Add ${missing.map((v) => `\`${prefix}-${v}-${utilityDisplay}\``).join(", ")} in Figma if the gap is unintentional.`,
        tokenIds: [],
        componentName: prefix,
      });
    }
  }

  return issues;
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
