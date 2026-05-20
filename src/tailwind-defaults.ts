// Public API over the generated Tailwind v4 defaults table.
// All matchers return a utility suffix on hit (e.g. "1" for spacing,
// "md" for radius) or null when the value does not correspond to a
// Tailwind default.

import {
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  TRACKING,
  LEADING,
  BORDER_WIDTH,
} from "./tailwind-defaults.generated.js";

const DEFAULT_REM_BASE = 16;

/**
 * Normalize a CSS length string to the rem form used as the lookup key.
 * Returns null for non-length values (auto, %, calc(), …).
 * `0` is canonicalized — `"0px"`, `"0rem"`, and `"0"` all return `"0"`.
 */
export function normalizeToRem(value: string, remBase = DEFAULT_REM_BASE): string | null {
  const trimmed = value.trim();
  if (trimmed === "0" || /^0(px|rem)$/.test(trimmed)) return "0";

  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (pxMatch) {
    const px = Number.parseFloat(pxMatch[1]);
    const rem = px / remBase;
    return `${trimRem(rem)}rem`;
  }

  const remMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)rem$/);
  if (remMatch) {
    const n = Number.parseFloat(remMatch[1]);
    return `${trimRem(n)}rem`;
  }

  return null;
}

function trimRem(n: number): string {
  // 6 decimal places, then strip trailing zeros, then trailing '.'
  return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function matcher(table: Readonly<Record<string, string>>) {
  return (value: string, remBase?: number): string | null => {
    const normalized = normalizeToRem(value, remBase);
    if (normalized === null) return null;
    return table[normalized] ?? table[value] ?? null;
  };
}

export const matchSpacing = matcher(SPACING);
export const matchRadius = matcher(RADIUS);
export const matchFontSize = matcher(FONT_SIZE);
export const matchTracking = matcher(TRACKING);
export const matchLeading = matcher(LEADING);
export const matchBorderWidth = matcher(BORDER_WIDTH);

/**
 * Font-weight values are unitless ("400", "700"). Direct lookup.
 */
export function matchFontWeight(value: string): string | null {
  return FONT_WEIGHT[value.trim()] ?? null;
}
