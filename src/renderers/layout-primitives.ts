// Tailwind v4 @theme emission for layout primitive tokens.
//
// The design system authors layout primitives — container / page / grid / stack /
// section — in components/global.tokens.json. They live in the `global` source →
// component layer, so classify-token.ts skips them. This module re-surfaces them as
// Tailwind v4 @theme custom properties that generate real utilities:
//
//   widths        (…max-width…)        → --container-* (→ max-w-*)
//   gaps/paddings (…gap…/…padding…)    → --spacing-*   (→ p-/px-/py-/m-/gap-*)
//   radii         (…radius…)           → --radius-*    (→ rounded-*)
//   grid-columns  (a raw count)        → --grid-columns (no utility — variable only)
//
// container & page define identical width values, so widths dedupe into one
// --container-* scale. Guard: if a variant's values ever diverge, keep both and
// qualify the non-container family (--container-page-<variant>) — never overwrite.

import type { TokenGraph } from "../token-graph.js";

export interface LayoutPrimitiveEntry {
  /** CSS custom property name, including the leading `--`. */
  cssName: string;
  /** Resolved CSS value. */
  value: string;
  /** Originating token id (for the Inspector line map). */
  tokenId: string;
}

const FAMILIES = ["container", "page", "grid", "stack", "section"] as const;

const SPACING_DROP: ReadonlySet<string> = new Set(["gap", "padding", "x", "y"]);
const RADIUS_DROP: ReadonlySet<string> = new Set(["radius"]);
const WIDTH_DROP: ReadonlySet<string> = new Set(["max", "width"]);

function familyOf(id: string): string | null {
  for (const f of FAMILIES) {
    if (id === f || id.startsWith(`${f}-`)) return f;
  }
  return null;
}

function stripWords(parts: readonly string[], drop: ReadonlySet<string>): string[] {
  return parts.filter((p) => !drop.has(p));
}

interface WidthDraft {
  family: string;
  variant: string;
  value: string;
  tokenId: string;
}

export function collectLayoutPrimitives(graph: TokenGraph): LayoutPrimitiveEntry[] {
  const entries: LayoutPrimitiveEntry[] = [];
  const widths: WidthDraft[] = [];

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const id = node.id;
    const family = familyOf(id);
    if (!family) continue;
    const value = node.cssValue.base;
    if (value === undefined || value === "") continue;
    const parts = id.split("-");

    if (id.includes("max-width")) {
      const variant = stripWords(parts.slice(1), WIDTH_DROP).join("-") || "default";
      widths.push({ family, variant, value, tokenId: id });
    } else if (parts.includes("radius")) {
      entries.push({
        cssName: `--radius-${stripWords(parts, RADIUS_DROP).join("-")}`,
        value,
        tokenId: id,
      });
    } else if (parts.includes("gap") || parts.includes("padding")) {
      entries.push({
        cssName: `--spacing-${stripWords(parts, SPACING_DROP).join("-")}`,
        value,
        tokenId: id,
      });
    } else {
      // grid-columns and any other layout-family token with no utility namespace.
      entries.push({ cssName: `--${id}`, value, tokenId: id });
    }
  }

  // Widths → --container-* with dedup + divergence guard.
  const byVariant = new Map<string, WidthDraft[]>();
  for (const w of widths) {
    const list = byVariant.get(w.variant) ?? [];
    list.push(w);
    byVariant.set(w.variant, list);
  }
  for (const [variant, toks] of byVariant) {
    const distinct = new Set(toks.map((t) => t.value));
    if (toks.length === 1 || distinct.size === 1) {
      const canonical = toks.find((t) => t.family === "container") ?? toks[0]!;
      entries.push({
        cssName: `--container-${variant}`,
        value: canonical.value,
        tokenId: canonical.tokenId,
      });
    } else {
      for (const t of toks) {
        const key = t.family === "container" ? variant : `${t.family}-${variant}`;
        entries.push({ cssName: `--container-${key}`, value: t.value, tokenId: t.tokenId });
      }
    }
  }

  return entries;
}
