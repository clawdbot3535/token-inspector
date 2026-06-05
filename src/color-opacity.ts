/**
 * True for a colour value that paints (alpha > 0). Fully-transparent values
 * (`transparent`, `rgba(…, 0)`, `#RRGGBB00`, empty) return false. `rgb(…)` (no
 * alpha), plain hex, named colours, and `var(…)` are treated as opaque.
 * Single source of truth — consumed by the scanner (deviation hints) and the
 * recipe engine (dropping transparent emissions).
 */
export function isOpaqueColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "") return false;
  // rgba(r, g, b, a) — alpha is the 4th component.
  const rgba = v.match(/^rgba\(\s*[^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/);
  if (rgba) return parseFloat(rgba[1]!) > 0;
  // rgb(r, g, b) — no alpha channel; always opaque.
  if (/^rgb\([^)]*\)$/.test(v)) return true;
  const hex8 = v.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/);
  if (hex8) return parseInt(hex8[1]!, 16) > 0;
  return true; // #RRGGBB, named colours, var(…)
}
