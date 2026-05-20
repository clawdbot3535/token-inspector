// Pure classification engine. Given a TokenNode, decides how it surfaces
// in the output: as a Tailwind utility (no output), a static @theme var,
// a mode-variant @theme var with .dark override, or skipped entirely.
//
// This module is the single source of truth shared by:
//   - renderers/tokens-css.ts (build-time output)
//   - src/app/classifications.ts (Inspector live view)

import type { TokenGraph, TokenNode } from "./token-graph.js";
import {
  matchSpacing,
  matchRadius,
  matchFontSize,
  matchFontWeight,
  matchTracking,
  matchLeading,
  matchBorderWidth,
} from "./tailwind-defaults.js";

export type ClassificationKind =
  | "skip"
  | "tailwind-default"
  | "theme-static"
  | "theme-mode-variant";

export type Classification =
  | { kind: "skip"; reason: "component-layer" }
  | {
      kind: "tailwind-default";
      utility: string; // e.g. 'p-1', 'rounded-md'
      utilityCategory: TailwindCategory;
      resolvedValue: string; // e.g. '0.25rem' — for Inspector tooltip
    }
  | {
      kind: "theme-static";
      cssName: string; // e.g. '--color-blue-500' (with leading --)
      value: string; // e.g. '#3b82f6'
      modeInvariantHint: boolean; // true if node is in semantic layer but light === dark
      utilityHint?: { utility: string; resolvedValue: string }; // close-but-not-exact suggestion
    }
  | {
      kind: "theme-mode-variant";
      cssName: string;
      lightValue: string;
      darkValue: string;
    };

export type TailwindCategory =
  | "spacing"
  | "radius"
  | "font-size"
  | "font-weight"
  | "tracking"
  | "leading"
  | "border-width";

export interface ClassifyOptions {
  /** Root font size in px for px-to-rem conversion. Default 16. */
  remBase?: number;
}

/**
 * Classify a single token. The graph argument is currently unused but
 * reserved for PR 2's indirect-alias mode-variance resolution.
 */
export function classifyToken(
  node: TokenNode,
  _graph: TokenGraph,
  options: ClassifyOptions = {},
): Classification {
  // 1. Layer check — component-layer tokens never appear in output.
  if (node.layer === "component") {
    return { kind: "skip", reason: "component-layer" };
  }

  // 2. Mode-variance check — semantic nodes with diverging light/dark.
  const lightValue = node.cssValue.light;
  const darkValue = node.cssValue.dark;
  const hasLight = lightValue !== undefined;
  const hasDark = darkValue !== undefined;
  if (hasLight && hasDark && lightValue !== darkValue) {
    return {
      kind: "theme-mode-variant",
      cssName: `--${node.id}`,
      lightValue,
      darkValue,
    };
  }

  // 3. Resolve the single canonical value for non-mode-variant nodes.
  const value =
    node.cssValue.base ?? node.cssValue.light ?? node.cssValue.dark ?? "";
  if (!value) {
    // No value at all — defensively classify as static empty.
    return {
      kind: "theme-static",
      cssName: `--${node.id}`,
      value: "",
      modeInvariantHint: false,
    };
  }

  // 4. Numeric types — try Tailwind-default match.
  const category = tailwindCategoryFor(node);
  if (category !== null) {
    const matched = matchForCategory(category, value, options.remBase);
    if (matched !== null) {
      return {
        kind: "tailwind-default",
        utility: `${utilityPrefix(category)}${matched}`,
        utilityCategory: category,
        resolvedValue: value,
      };
    }
    // Numeric but no match — emit as theme-static with hint.
    return {
      kind: "theme-static",
      cssName: `--${node.id}`,
      value,
      modeInvariantHint: isModeInvariantSemantic(node),
      utilityHint: nearestUtilityHint(category, value, options.remBase),
    };
  }

  // 5. Non-numeric (color, shadow, gradient, font-family, string) — theme-static.
  return {
    kind: "theme-static",
    cssName: `--${node.id}`,
    value,
    modeInvariantHint: isModeInvariantSemantic(node),
  };
}

/**
 * Build a full classification map for the graph.
 */
export function classifyGraph(
  graph: TokenGraph,
  options: ClassifyOptions = {},
): Map<string, Classification> {
  const out = new Map<string, Classification>();
  for (const node of graph.nodes.values()) {
    out.set(node.id, classifyToken(node, graph, options));
  }
  return out;
}

// ---------- Helpers ----------

function isModeInvariantSemantic(node: TokenNode): boolean {
  // Node lives in the semantic source (light/dark) but its light/dark
  // values are identical — caller may want to surface a warning.
  if (node.source !== "light" && node.source !== "dark") return false;
  if (node.cssValue.light === undefined || node.cssValue.dark === undefined) {
    return false;
  }
  return node.cssValue.light === node.cssValue.dark;
}

function tailwindCategoryFor(node: TokenNode): TailwindCategory | null {
  // Map TokenType + id-prefix to Tailwind category.
  switch (node.type) {
    case "dimension":
    case "number": {
      const id = node.id;
      if (/^spacing-/.test(id) || /-spacing-/.test(id) || /^space-/.test(id)) {
        return "spacing";
      }
      if (/^radius-/.test(id) || /-radius-/.test(id) || /^rounded-/.test(id)) {
        return "radius";
      }
      if (/^font-size-/.test(id) || /^text-/.test(id)) return "font-size";
      if (/^tracking-/.test(id) || /^letter-spacing-/.test(id)) return "tracking";
      if (/^leading-/.test(id) || /^line-height-/.test(id)) return "leading";
      if (/^border(-width)?-/.test(id)) return "border-width";
      // Fallback: treat as spacing for unprefixed numerics.
      return "spacing";
    }
    case "fontWeight":
      return "font-weight";
    default:
      return null;
  }
}

function matchForCategory(
  category: TailwindCategory,
  value: string,
  remBase?: number,
): string | null {
  switch (category) {
    case "spacing":
      return matchSpacing(value, remBase);
    case "radius":
      return matchRadius(value, remBase);
    case "font-size":
      return matchFontSize(value, remBase);
    case "font-weight":
      return matchFontWeight(value);
    case "tracking":
      return matchTracking(value, remBase);
    case "leading":
      return matchLeading(value, remBase);
    case "border-width":
      return matchBorderWidth(value, remBase);
  }
}

function utilityPrefix(category: TailwindCategory): string {
  switch (category) {
    case "spacing":
      return "p-"; // Inspector display only — actual usage may be p- / m- / gap-.
    case "radius":
      return "rounded-";
    case "font-size":
      return "text-";
    case "font-weight":
      return "font-";
    case "tracking":
      return "tracking-";
    case "leading":
      return "leading-";
    case "border-width":
      return "border-";
  }
}

function nearestUtilityHint(
  category: TailwindCategory,
  _value: string,
  _remBase?: number,
): { utility: string; resolvedValue: string } | undefined {
  // PR 1 ships without nearest-neighbor computation. The hint field is
  // reserved; the Inspector simply omits the subline when undefined.
  // PR 2 may fill this in if the visual review surfaces real need.
  void category;
  return undefined;
}
