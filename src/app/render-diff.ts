// Pure comparison of a recipe's intended computed styles (expected) vs the rendered
// element's computed styles (actual). One delta per expected property. Both sides arrive
// already getComputedStyle-normalized (see use-render-diff), so plain string equality is
// sound — EXCEPT box-shadow: Tailwind composes it from layered CSS vars and emits transparent
// placeholder layers, while the probe (extract-arbitrary) emits a single ring layer.
// canonicalizeShadow strips the empty layers so the two compare on their meaningful shadow(s).
// KNOWN RESIDUAL: extract-arbitrary does not model `ring-offset`/inset, so a component with a
// ring-offset still shows a box-shadow delta (its real inset offset layers vs the probe's single
// ring). That's a probe-modelling gap, not a recipe defect; modelling Tailwind's full ring math
// was judged too brittle for the diagnostic. See the v0.47.1 changelog.

export interface RenderDelta {
  property: string;
  expected: string;
  actual: string;
  match: boolean;
}

/** Split a box-shadow into its comma-separated layers, respecting commas inside rgb()/rgba(). */
function splitShadowLayers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** A Tailwind placeholder layer: fully-transparent colour with all-zero
 *  offsets/blur/spread (with or without `inset`). Carries no visual shadow. */
function isEmptyShadowLayer(layer: string): boolean {
  const n = layer.replace(/\s+/g, " ").trim();
  return /^(inset )?rgba\(0, 0, 0, 0\) 0px 0px 0px 0px( inset)?$/.test(n);
}

/** Drop the transparent placeholder layers Tailwind always emits, so a 5-layer ring
 *  composite compares against the probe's single ring layer. Empty/`none` → "none". */
export function canonicalizeShadow(value: string): string {
  const v = (value ?? "").trim();
  if (!v || v === "none") return "none";
  const layers = splitShadowLayers(v)
    .map((l) => l.trim())
    .filter((l) => l && !isEmptyShadowLayer(l));
  return layers.length > 0 ? layers.join(", ") : "none";
}

export function diffComputed(
  expected: Readonly<Record<string, string>>,
  actual: Readonly<Record<string, string>>,
): RenderDelta[] {
  return Object.keys(expected).map((property) => {
    const normalize = property === "boxShadow" ? canonicalizeShadow : (s: string) => s.trim();
    const exp = normalize(expected[property] ?? "");
    const act = normalize(actual[property] ?? "");
    return { property, expected: exp, actual: act, match: exp === act };
  });
}
