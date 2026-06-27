// Hex → OKLCH, the color format shadcn/ui uses in its globals.css. Hand-rolled
// (no dependency) per Björn Ottosson's reference conversion: sRGB → linear RGB →
// LMS → OKLab → OKLCH. Pure + deterministic; validated against white/black/red.

function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const round = (n: number, d: number): number => Number(n.toFixed(d));

/**
 * Convert a hex color to an `oklch(L C H)` string. Accepts `#RGB`/`#RRGGBB`
 * (with or without `#`, any case). Any value that is not a hex color (rgba,
 * `var(...)`, …) is returned unchanged.
 */
export function hexToOklch(value: string): string {
  let h = value.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return value;

  const r = linearize(parseInt(h.slice(0, 2), 16) / 255);
  const g = linearize(parseInt(h.slice(2, 4), 16) / 255);
  const b = linearize(parseInt(h.slice(4, 6), 16) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  const Lr = round(L, 4);
  const Cr = round(C, 4);
  // Hue is meaningless when there's no chroma — pin it to 0 so achromatic colors
  // read `oklch(L 0 0)` (shadcn's convention) instead of an atan2 artifact.
  const Hr = Cr === 0 ? 0 : round(H, 3);
  return `oklch(${Lr} ${Cr} ${Hr})`;
}
