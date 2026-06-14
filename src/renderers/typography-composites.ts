// Composite Tailwind v4 type-scale emission for typography role tokens.
//
// The design system authors per-role type scales in components/global.tokens.json
// as flat tokens: typography-<role>-font-size / -line-height / -letter-spacing /
// -font-weight. These live in the `global` source → component layer, so the
// classification engine (classify-token.ts) skips them. This module re-surfaces
// the subset that forms a Tailwind v4 type scale (roles that define a font-size)
// as composite custom properties:
//
//   --text-<role>: <font-size>;
//   --text-<role>--line-height: <line-height>;
//   --text-<role>--letter-spacing: <letter-spacing>;
//   --text-<role>--font-weight: <font-weight>;
//
// Tailwind v4 consumes these to generate a `text-<role>` utility that sets all
// four properties at once.

import type { TokenGraph } from "../token-graph.js";

export interface TypographyCompositeEntry {
  /** CSS custom property name, including the leading `--`. */
  cssName: string;
  /** Resolved CSS value. */
  value: string;
  /** Originating token id (for the Inspector line map). */
  tokenId: string;
}

// Matches `typography-<role>-<prop>` after typo normalisation. <role> is greedy
// so multi-segment roles (heading-1, heading-2) are captured whole.
const ROLE_ID =
  /^typography-(.+)-(font-size|line-height|letter-spacing|font-weight)$/;

type RoleProp = "font-size" | "line-height" | "letter-spacing" | "font-weight";

/** Normalise the known source typo so `line-heigth` routes as `line-height`. */
function normalizeId(id: string): string {
  return id.replace(/-line-heigth(?=-|$)/, "-line-height");
}

/** Append `px` to a bare numeric (used for unitless line-height role tokens). */
function withLengthUnit(value: string): string {
  return /^-?\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value;
}

export function collectTypographyComposites(
  graph: TokenGraph,
): TypographyCompositeEntry[] {
  const roles = new Map<
    string,
    Map<RoleProp, { value: string; tokenId: string }>
  >();

  for (const node of graph.nodes.values()) {
    const m = normalizeId(node.id).match(ROLE_ID);
    if (!m) continue;
    const role = m[1]!;
    const prop = m[2] as RoleProp;
    const value = node.cssValue.base;
    if (value === undefined || value === "") continue;
    let propMap = roles.get(role);
    if (!propMap) {
      propMap = new Map();
      roles.set(role, propMap);
    }
    // Keep the original (un-normalised) id so the line map points at the real token.
    propMap.set(prop, { value, tokenId: node.id });
  }

  const entries: TypographyCompositeEntry[] = [];
  for (const [role, propMap] of roles) {
    const fontSize = propMap.get("font-size");
    if (!fontSize) continue; // no base font-size → not a Tailwind type scale
    entries.push({
      cssName: `--text-${role}`,
      value: fontSize.value,
      tokenId: fontSize.tokenId,
    });
    const lineHeight = propMap.get("line-height");
    if (lineHeight) {
      entries.push({
        cssName: `--text-${role}--line-height`,
        value: withLengthUnit(lineHeight.value),
        tokenId: lineHeight.tokenId,
      });
    }
    const letterSpacing = propMap.get("letter-spacing");
    if (letterSpacing) {
      entries.push({
        cssName: `--text-${role}--letter-spacing`,
        value: letterSpacing.value,
        tokenId: letterSpacing.tokenId,
      });
    }
    const fontWeight = propMap.get("font-weight");
    if (fontWeight) {
      entries.push({
        cssName: `--text-${role}--font-weight`,
        value: fontWeight.value,
        tokenId: fontWeight.tokenId,
      });
    }
  }
  return entries;
}
