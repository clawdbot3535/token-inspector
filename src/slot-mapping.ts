// Heuristic mapping from Figma component-layer token ids to Nuxt UI v4
// recipe paths. Each token resolves to:
//   { slot: 'base' | 'leadingIcon' | 'trailingIcon' | ... ,
//     utilityType: 'padding-x' | 'padding-y' | 'rounded' | 'font-weight'
//                  | 'text-size' | 'gap' | 'icon-size'
//                  | 'bg-color' | 'text-color' | 'border-color' | 'border-width'
//                  | 'ring-color' | 'ring-width' | 'underline-color'
//                  | 'height' | 'width' | 'line-height'
//                  | 'letter-spacing' | 'placeholder-color'
//                  | 'ring-offset' | 'font-family' | 'padding'
//                  | 'overlay-bg',
//     variantAxis: 'size' | 'color' | 'variant' | null,
//       (a trailing interaction state becomes `statePrefix`, not an axis —
//        Nuxt UI v4 has no `state` prop)
//     variantKey:  string | null,
//     statePrefix: string | null }
//
// Token id shape:
//   <component>-[<variant>-]<utility...>[-<size|state>]
//
//   The optional second segment <variant> is recognised when it matches
//   one of the Nuxt UI v4 button-style variants (solid/outline/ghost/link/...).
//   The optional last segment <size|state> is recognised against SIZE_KEYS
//   or STATE_KEYS.
//
// The same id grammar applies to every component in the standard set
// (button, badge, input, …); `button` is used as the running example below.

export type RecipeSlot = "base" | "leadingIcon" | "trailingIcon" | "label";
export type UtilityType =
  | "padding-x"
  | "padding-y"
  | "rounded"
  | "font-weight"
  | "text-size"
  | "gap"
  | "icon-size"
  | "bg-color"
  | "text-color"
  | "border-color"
  | "border-width"
  | "ring-color"
  | "ring-width"
  | "underline-color"
  | "height"
  | "width"
  | "line-height"
  | "letter-spacing"
  | "placeholder-color"
  | "ring-offset"
  | "font-family"
  | "padding"
  | "overlay-bg";
export type VariantAxis = "size" | "color" | "variant";

export interface SlotMappingEntry {
  slot: RecipeSlot;
  utilityType: UtilityType;
  variantAxis: VariantAxis | null;
  variantKey: string | null;
  /**
   * Optional Tailwind pseudo-class prefix (e.g. "hover", "active",
   * "disabled", "focus"). When set, the recipe-engine wraps the emitted
   * utility class with this prefix. Used when a token also carries a
   * state suffix that cannot serve as a bucket key (because the variant
   * axis is already occupied, e.g. button-solid-bg-hover).
   */
  statePrefix?: string | null;
}

export type SlotMappingOverride = Readonly<Record<string, SlotMappingEntry | null>>;

import { BUTTON_VARIANT_KEYS, COLOR_ROLE_KEYS, SIZE_KEYS, STATE_KEYS, RING_FRAMED_COMPONENTS, RING_FRAMED_VARIANTS, isRingFramedVariant } from "./component-vocab.js";

// Approach-B extension point: maps a sub-element segment (immediately after
// the component) to a Nuxt UI recipe slot. EMPTY in v0.4.0 — v0.5.0+ fills it
// per component (e.g. "item" → "item", "thumb" → "thumb"). Leaving it empty
// keeps every token routing to the "base" slot, unchanged.
const SLOT_PREFIXES: ReadonlyMap<string, RecipeSlot> = new Map();

interface ParsedSegments {
  component: string;
  utility: string;
  /** The Nuxt UI variant key (solid/outline/...) when present as 2nd segment. */
  variant: string | null;
  /** The color-role variant (default/accent/error/...) when present as 2nd segment. */
  colorRole: string | null;
  /** The size key (xs/sm/...) when present as last segment. */
  size: string | null;
  /** The state key (hover/active/...) when present as last segment. */
  state: string | null;
  /** The recipe slot from SLOT_PREFIXES when a sub-element segment is matched. */
  slotPrefix: RecipeSlot | null;
}

function parseSegments(tokenId: string): ParsedSegments | null {
  const parts = tokenId.split("-");
  if (parts.length < 2) return null;
  const component = parts[0];
  if (component === undefined) return null;

  let start = 1;
  let end = parts.length;
  let variant: string | null = null;
  let colorRole: string | null = null;
  let size: string | null = null;
  let state: string | null = null;

  // 2nd segment may be a Nuxt UI variant key or a color-role key. Only
  // consume it when there are more segments after it — otherwise a token
  // literally called e.g. "button-solid" would lose its utility name.
  const second = parts[1];
  if (parts.length >= 3 && second !== undefined) {
    if (BUTTON_VARIANT_KEYS.has(second)) { variant = second; start = 2; }
    else if (COLOR_ROLE_KEYS.has(second)) { colorRole = second; start = 2; }
  }

  // Approach-B seam: after variant/color-role detection, check if the next
  // segment is a known sub-element slot prefix (empty map in v0.4.0).
  let slotPrefix: RecipeSlot | null = null;
  const slotSeg = parts[start];
  if (slotSeg !== undefined && SLOT_PREFIXES.has(slotSeg)) {
    slotPrefix = SLOT_PREFIXES.get(slotSeg)!;
    start += 1;
  }

  // Last segment may be a size or state suffix. Only consume it when
  // there is at least one utility segment remaining between start and end.
  const last = parts[parts.length - 1];
  if (last !== undefined && end - start > 1) {
    if (SIZE_KEYS.has(last)) {
      size = last;
      end -= 1;
    } else if (STATE_KEYS.has(last)) {
      state = last;
      end -= 1;
    }
  }

  return {
    component,
    utility: parts.slice(start, end).join("-"),
    variant,
    colorRole,
    size,
    state,
    slotPrefix,
  };
}

interface BuildContext {
  variant: string | null;
  colorRole: string | null;
  size: string | null;
  state: string | null;
}

function normalizeState(s: string): string { return s === "hovered" ? "hover" : s; }

function buildEntry(
  slot: RecipeSlot,
  utilityType: UtilityType,
  ctx: BuildContext,
): SlotMappingEntry {
  // Precedence: explicit variant axis (solid/outline/...) wins over size,
  // size wins over state. The leftover axes attach as statePrefix
  // (state when variant or size is already the bucket key).
  if (ctx.variant !== null) {
    // `default` state is not a real pseudo-class — emit unprefixed.
    const entry: SlotMappingEntry = {
      slot,
      utilityType,
      variantAxis: "variant",
      variantKey: ctx.variant,
    };
    if (ctx.state !== null && ctx.state !== "default") {
      entry.statePrefix = normalizeState(ctx.state);
    }
    return entry;
  }
  if (ctx.colorRole !== null) {
    const entry: SlotMappingEntry = {
      slot,
      utilityType,
      variantAxis: "color",
      variantKey: ctx.colorRole,
    };
    if (ctx.state !== null && ctx.state !== "default") entry.statePrefix = normalizeState(ctx.state);
    return entry;
  }
  if (ctx.size !== null) {
    return {
      slot,
      utilityType,
      variantAxis: "size",
      variantKey: ctx.size,
    };
  }
  if (ctx.state !== null && ctx.state !== "default") {
    // A bare state suffix with no variant/size/color context (e.g.
    // `button-rounded-focus`, `checkbox-bg-checked`) emits a Tailwind
    // pseudo-class prefix on the base slot (`focus:rounded-md`), NOT a
    // `variants.state` axis. Nuxt UI v4 has no `state` prop, so a state
    // variant renders dead config that never applies. normalizeState maps
    // "hovered" → "hover". `default` is the base look (not a pseudo-class)
    // and falls through to the unprefixed base entry below.
    return {
      slot,
      utilityType,
      variantAxis: null,
      variantKey: null,
      statePrefix: normalizeState(ctx.state),
    };
  }
  return {
    slot,
    utilityType,
    variantAxis: null,
    variantKey: null,
  };
}

const HEURISTIC_RULES: ReadonlyArray<{
  match: (utility: string) => boolean;
  build: (ctx: BuildContext) => SlotMappingEntry;
}> = [
  // ── Spacing / sizing ──────────────────────────────────────────────────
  {
    match: (u) => u === "padding-x",
    build: (ctx) => buildEntry("base", "padding-x", ctx),
  },
  {
    match: (u) => u === "padding-y",
    build: (ctx) => buildEntry("base", "padding-y", ctx),
  },
  {
    match: (u) => u === "radius" || u === "rounded",
    build: (ctx) => buildEntry("base", "rounded", ctx),
  },
  {
    match: (u) => u === "font-weight" || u === "weight",
    build: (ctx) => buildEntry("base", "font-weight", ctx),
  },
  {
    match: (u) => u === "text-size" || u === "font-size" || u === "text",
    build: (ctx) => buildEntry("base", "text-size", ctx),
  },
  {
    match: (u) => u === "gap",
    build: (ctx) => buildEntry("base", "gap", ctx),
  },
  {
    match: (u) => u === "icon-size" || u === "icon",
    build: (ctx) => buildEntry("leadingIcon", "icon-size", ctx),
  },
  // ── Color utilities ───────────────────────────────────────────────────
  // Background — order matters: `bg-*` rules sit ahead of generic `text`
  // above; the `text` rule above only matches utility==='text' (text-size
  // alias), not the color text rule below.
  {
    match: (u) => u === "bg",
    build: (ctx) => buildEntry("base", "bg-color", ctx),
  },
  // `text` matches text-size above when no variant axis is present (e.g.
  // primitive-like tokens), but when a variant axis IS present we want
  // text to mean text-color. The build function below disambiguates by
  // delegating to text-color when `variant` is set.
  {
    match: (u) => u === "text-color" || u === "color",
    build: (ctx) => buildEntry("base", "text-color", ctx),
  },
  {
    match: (u) => u === "border",
    build: (ctx) => buildEntry("base", "border-color", ctx),
  },
  {
    match: (u) => u === "border-width",
    build: (ctx) => buildEntry("base", "border-width", ctx),
  },
  {
    match: (u) => u === "ring",
    build: (ctx) => buildEntry("base", "ring-color", ctx),
  },
  {
    match: (u) => u === "underline",
    build: (ctx) => buildEntry("base", "underline-color", ctx),
  },
  // ── New utility types (v0.4.0) ────────────────────────────────────────
  {
    match: (u) => u === "height",
    build: (ctx) => buildEntry("base", "height", ctx),
  },
  {
    match: (u) => u === "width",
    build: (ctx) => buildEntry("base", "width", ctx),
  },
  {
    match: (u) => u === "line-height" || u === "leading",
    build: (ctx) => buildEntry("base", "line-height", ctx),
  },
  {
    match: (u) => u === "letter-spacing" || u === "tracking",
    build: (ctx) => buildEntry("base", "letter-spacing", ctx),
  },
  {
    match: (u) => u === "placeholder",
    build: (ctx) => buildEntry("base", "placeholder-color", ctx),
  },
  {
    match: (u) => u === "ring-offset",
    build: (ctx) => buildEntry("base", "ring-offset", ctx),
  },
  {
    match: (u) => u === "font-family",
    build: (ctx) => buildEntry("base", "font-family", ctx),
  },
  {
    match: (u) => u === "padding",
    build: (ctx) => buildEntry("base", "padding", ctx),
  },
  {
    match: (u) => u === "overlay-bg" || u === "overlay",
    build: (ctx) => buildEntry("base", "overlay-bg", ctx),
  },
];

/**
 * Pure heuristic mapping. Returns null if no rule matches.
 */
export function heuristicSlotMapping(
  tokenId: string,
  // TokenType in practice (e.g. "color"); typed as string to keep this module a pure id-based classifier with no domain-type coupling.
  valueType?: string,
): SlotMappingEntry | null {
  const parsed = parseSegments(tokenId);
  if (!parsed) return null;
  const slot: RecipeSlot = parsed.slotPrefix ?? "base";
  const ctx: BuildContext = {
    variant: parsed.variant,
    colorRole: parsed.colorRole,
    size: parsed.size,
    state: parsed.state,
  };

  // `text` defaults to text-size, but it means text-color when the token is a
  // color — signalled either by a variant/color-role axis (button/badge) or,
  // axis-independently, by the token's value type (input/textarea text colors).
  if (
    parsed.utility === "text" &&
    (valueType === "color" || parsed.variant !== null || parsed.colorRole !== null)
  ) {
    return buildEntry(slot, "text-color", ctx);
  }

  // Ring-framed components (input, checkbox, …) draw their frame as a Tailwind
  // `ring`, not a CSS border, so a bare `border` utility emits ring-color.
  // Variant-conditional framers (button) ring only specific variants
  // (outline/subtle) — those redirect to ring-color too; their other variants
  // (solid/ghost/link) keep border-color. Genuine border framers (table, nav)
  // fall through to the border-color rule below.
  const ringFramed =
    RING_FRAMED_COMPONENTS.has(parsed.component) ||
    isRingFramedVariant(parsed.component, parsed.variant);
  if (parsed.utility === "border" && ringFramed) {
    return buildEntry(slot, "ring-color", ctx);
  }

  // `ring-*` tokens are the focus-ring family (ring-focus colour, ring-offset).
  // A bare `ring-width` is the focus-ring WIDTH → ring-width with a `focus:`
  // prefix (Nuxt `focus-visible:ring-2`). An explicit state suffix wins. (D2e)
  if (parsed.utility === "ring-width") {
    const entry = buildEntry(slot, "ring-width", ctx);
    return entry.statePrefix == null ? { ...entry, statePrefix: "focus" } : entry;
  }

  // `border-width` is the RESTING frame width. On a ring-framed variant/component
  // it is the base ring width; a *component-level* width (variant === null) on a
  // component that frames some variants (button) is also the resting ring width.
  // Otherwise (table, nav) it stays a CSS border-width. (D2e)
  const restingRingWidth =
    ringFramed ||
    (parsed.variant === null && RING_FRAMED_VARIANTS.has(parsed.component));
  if (parsed.utility === "border-width" && restingRingWidth) {
    return buildEntry(slot, "ring-width", ctx);
  }

  for (const rule of HEURISTIC_RULES) {
    if (rule.match(parsed.utility)) {
      // Route the slot through parsed.slotPrefix so v0.5.0 can fill
      // SLOT_PREFIXES and sub-element tokens get their correct recipe slot.
      const entry = rule.build(ctx);
      return slot === "base" ? entry : { ...entry, slot };
    }
  }
  return null;
}

/**
 * Merge heuristic with override. Override entries are keyed by token id;
 * a `null` override explicitly skips a token even if the heuristic would match.
 */
export function getSlotMapping(
  tokenId: string,
  override?: SlotMappingOverride,
  valueType?: string,
): SlotMappingEntry | null {
  if (override && Object.prototype.hasOwnProperty.call(override, tokenId)) {
    return override[tokenId] ?? null;
  }
  return heuristicSlotMapping(tokenId, valueType);
}
