// Translates a Tailwind class string into the subset of classes Tailwind
// JIT can render plus an inline-style object carrying everything it can't.
//
// Why this exists: Tailwind v4 JIT only generates CSS for classes that
// appear as static strings in the scanned source. The recipe-engine emits
// classes dynamically at runtime, so the JIT never sees them. Two kinds slip
// through:
//   1. arbitrary-value classes like `px-[10px]` / `h-[44px]`
//   2. plain scale classes like `py-2.5` / `rounded-sm` / `text-lg`
// Either may or may not have been generated from some unrelated static
// occurrence (e.g. `px-2.5` ships in @nuxt/ui but `py-2.5` does not), so a
// recipe value renders or vanishes by coincidence. We resolve both kinds to
// inline styles so the live preview always reflects the real token value.

import type { CSSProperties } from "vue";
import {
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from "@core/tailwind-defaults.generated.js";

// Tailwind utility prefix → CSS property mapping for arbitrary-value classes.
const ARBITRARY_TO_CSS: Readonly<Record<string, ReadonlyArray<keyof CSSProperties>>> = {
  p: ["padding"],
  px: ["paddingLeft", "paddingRight"],
  py: ["paddingTop", "paddingBottom"],
  pl: ["paddingLeft"],
  pr: ["paddingRight"],
  pt: ["paddingTop"],
  pb: ["paddingBottom"],
  // h-[..]/w-[..] carry per-size dimensions when the recipe emits height/
  // width as arbitrary-value utilities. Without these every size collapses
  // to its content height.
  h: ["height"],
  w: ["width"],
  gap: ["gap"],
  size: ["width", "height"],
  rounded: ["borderRadius"],
  leading: ["lineHeight"],
  tracking: ["letterSpacing"],
  bg: ["backgroundColor"],
  underline: ["textDecorationColor"],
};

// The generated defaults tables are keyed `remValue → scaleSuffix`
// (e.g. "0.625rem" → "2.5"). For the preview we need the inverse: given a
// scale class like `py-2.5`, recover the concrete CSS length "0.625rem".
function invert(table: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [value, suffix] of Object.entries(table)) out[suffix] = value;
  return out;
}

const SPACING_BY_SUFFIX = invert(SPACING);
const RADIUS_BY_SUFFIX = invert(RADIUS);
const FONT_SIZE_BY_SUFFIX = invert(FONT_SIZE);
const FONT_WEIGHT_BY_SUFFIX = invert(FONT_WEIGHT);

interface ScaleFamily {
  table: Readonly<Record<string, string>>;
  props: ReadonlyArray<keyof CSSProperties>;
}

// Scale-class prefix → which defaults table resolves its suffix and which CSS
// properties it drives. Only families the recipe-engine emits as scale
// classes are listed; anything else (inline-flex, items-center, …) stays a
// class name and renders from the app's own always-present utilities.
const SCALE_TO_CSS: Readonly<Record<string, ScaleFamily>> = {
  px: { table: SPACING_BY_SUFFIX, props: ["paddingLeft", "paddingRight"] },
  py: { table: SPACING_BY_SUFFIX, props: ["paddingTop", "paddingBottom"] },
  pl: { table: SPACING_BY_SUFFIX, props: ["paddingLeft"] },
  pr: { table: SPACING_BY_SUFFIX, props: ["paddingRight"] },
  pt: { table: SPACING_BY_SUFFIX, props: ["paddingTop"] },
  pb: { table: SPACING_BY_SUFFIX, props: ["paddingBottom"] },
  p: { table: SPACING_BY_SUFFIX, props: ["padding"] },
  gap: { table: SPACING_BY_SUFFIX, props: ["gap"] },
  size: { table: SPACING_BY_SUFFIX, props: ["width", "height"] },
  rounded: { table: RADIUS_BY_SUFFIX, props: ["borderRadius"] },
  text: { table: FONT_SIZE_BY_SUFFIX, props: ["fontSize"] },
  // font-light / font-bold / font-thin … — six of the nine weights never
  // appear statically in source, so the JIT skips them; resolve to fontWeight.
  font: { table: FONT_WEIGHT_BY_SUFFIX, props: ["fontWeight"] },
};

// `text-[…]` is ambiguous: text-[#fff] is color, text-[14px] is font-size.
function textProperty(value: string): keyof CSSProperties {
  return /^(#|rgb|hsl|var\()/i.test(value) ? "color" : "fontSize";
}

// `font-[…]` is ambiguous: the recipe engine emits both font-weight
// (font-[400], numeric) and font-family (font-[Inter] / font-[Google_Sans_Flex])
// through the same `font-` prefix. Disambiguate by value shape.
function fontProperty(value: string): keyof CSSProperties {
  return /^\d+$/.test(value.trim()) ? "fontWeight" : "fontFamily";
}

// A Tailwind arbitrary value is a CSS length (not a color) when it begins with
// a digit, sign, or dot. Colours are #hex, rgb(), hsl(), var(), or colour
// words (all start with a letter or #). Used to split `ring-[1px]` (width)
// from `ring-[#hex]` (color) and likewise for `border-[…]`. Every width the
// recipe engine emits is a resolved length that leads with a digit/sign/dot.
function isLengthValue(value: string): boolean {
  return /^[-.\d]/.test(value.trim());
}

export interface Extracted {
  classes: string;
  style: CSSProperties;
}

/**
 * Resolve a non-arbitrary class as a Tailwind scale utility (e.g. `py-2.5`,
 * `rounded-sm`, `text-lg`) and write its concrete value into `style`.
 * Returns true when handled; false means the caller should keep it as a
 * class name.
 */
function applyScaleClass(cls: string, style: Record<string, string>): boolean {
  const m = cls.match(/^([a-z]+)-(.+)$/);
  if (m === null) return false;
  const family = SCALE_TO_CSS[m[1]!];
  if (family === undefined) return false;
  const value = family.table[m[2]!];
  if (value === undefined) return false;
  for (const prop of family.props) style[prop as string] = value;
  return true;
}

export function extractArbitrary(classString: string): Extracted {
  const style: Record<string, string> = {};
  const classes: string[] = [];
  let ringColor: string | undefined;
  let ringWidth: string | undefined;
  let ringOffsetWidth: string | undefined;
  let ringOffsetColor: string | undefined;
  for (const cls of classString.split(/\s+/).filter(Boolean)) {
    if (cls.includes(":")) {
      classes.push(cls);
      continue;
    }
    const m = cls.match(/^([a-z-]+)-\[(.+)\]$/);
    if (m === null) {
      // Not an arbitrary value — try to resolve it as a scale utility so the
      // preview doesn't depend on the JIT having generated it. Genuinely
      // static classes (inline-flex, items-center, …) fall through unchanged.
      if (!applyScaleClass(cls, style)) classes.push(cls);
      continue;
    }
    const prefix = m[1]!;
    const rawValue = m[2]!;
    // Tailwind v4 reads `_` inside [...] as a literal space.
    const value = rawValue.replace(/_/g, " ");

    let properties: ReadonlyArray<keyof CSSProperties> | undefined;
    if (prefix === "text") {
      properties = [textProperty(value)];
    } else if (prefix === "font") {
      properties = [fontProperty(value)];
    } else if (prefix === "ring") {
      // ring-[length] = width, ring-[colour] = colour; composed below (D2e).
      if (isLengthValue(value)) ringWidth = value;
      else ringColor = value;
      continue;
    } else if (prefix === "ring-offset") {
      // ring-offset-[length] = offset width, ring-offset-[colour] = offset colour
      // (Tailwind default #fff); composed into the ring's offset layer below.
      if (isLengthValue(value)) ringOffsetWidth = value;
      else ringOffsetColor = value;
      continue;
    } else if (prefix === "border") {
      if (isLengthValue(value)) {
        style.borderWidth = value;
      } else {
        style.borderColor = value;
      }
      continue;
    } else {
      properties = ARBITRARY_TO_CSS[prefix];
    }
    if (properties === undefined) {
      classes.push(cls);
      continue;
    }
    for (const prop of properties) {
      style[prop as string] = value;
    }
  }

  // Compose the ring (D2e): a boxShadow carrying the token's width + colour, plus a
  // ring-offset layer when present — matching Tailwind's two-layer offset composite
  // (offset layer at `offset`, ring layer at `offset + width`; `calc` lets the browser
  // sum the lengths). Defaults: 1px width (Tailwind v4), currentColor, #fff offset colour.
  // ring-[length] emits no competing CSS outline.
  if (ringColor !== undefined || ringWidth !== undefined) {
    const width = ringWidth ?? "1px";
    const color = ringColor ?? "currentColor";
    if (ringOffsetWidth !== undefined) {
      const offsetColor = ringOffsetColor ?? "#fff";
      style.boxShadow = `0 0 0 ${ringOffsetWidth} ${offsetColor}, 0 0 0 calc(${ringOffsetWidth} + ${width}) ${color}`;
    } else {
      style.boxShadow = `0 0 0 ${width} ${color}`;
    }
  }

  // Tailwind preflight zeroes border-width on every element, so a bare
  // `border-color` is invisible. Compensate when the recipe set a border
  // color but did not specify a width / style.
  if (style.borderColor !== undefined) {
    if (style.borderWidth === undefined) style.borderWidth = "1px";
    if (style.borderStyle === undefined) style.borderStyle = "solid";
  }
  // A `<button>` has no default text-decoration, so `text-decoration-color`
  // on its own paints nothing. Surface the underline when the recipe sets
  // an underline color.
  if (style.textDecorationColor !== undefined) {
    if (style.textDecorationLine === undefined) {
      style.textDecorationLine = "underline";
    }
  }

  return { classes: classes.join(" "), style: style as CSSProperties };
}
