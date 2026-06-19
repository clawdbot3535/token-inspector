// Pure comparison of a recipe's intended computed styles (expected) vs the rendered
// element's computed styles (actual). One delta per expected property. Both sides arrive
// already getComputedStyle-normalized (see use-render-diff), so plain string equality is
// sound — EXCEPT box-shadow: Tailwind composes it from layered CSS vars and emits transparent
// placeholder layers, while the probe (extract-arbitrary) emits the ring layers directly.
// canonicalizeShadow strips the empty layers AND the `inset` keyword so the two compare on their
// meaningful shadow(s). (extract-arbitrary models ring-offset as the same two-layer composite
// Tailwind emits; the `inset` is normalized because Nuxt UI renders form-control rings inset while
// the recipe has no inset concept to express — a systematic convention, not a per-recipe defect.)

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

/** Normalize a box-shadow for comparison: drop Tailwind's transparent placeholder
 *  layers and the `inset` keyword (the recipe can't express inset; Nuxt UI's
 *  form-control inset rings are a systematic convention, so inset ≈ outset here),
 *  so a multi-layer ring composite compares against the probe's layers. Empty/`none` → "none". */
export function canonicalizeShadow(value: string): string {
  const v = (value ?? "").trim();
  if (!v || v === "none") return "none";
  const layers = splitShadowLayers(v)
    .map((l) => l.replace(/\binset\b/g, "").replace(/\s+/g, " ").trim())
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
