// Heuristic mapping from Figma component-layer token ids to Nuxt UI v4
// recipe paths. Each token resolves to:
//   { slot: 'base' | 'leadingIcon' | 'trailingIcon' | ... ,
//     utilityType: 'padding-x' | 'padding-y' | 'rounded' | 'font-weight'
//                  | 'text-size' | 'gap' | 'icon-size',
//     variantAxis: 'size' | 'color' | 'state' | null,
//     variantKey:  string | null }
//
// PR 2 ships with conventions for the `button` component. Other
// components follow in later PRs.

export type RecipeSlot = "base" | "leadingIcon" | "trailingIcon" | "label";
export type UtilityType =
  | "padding-x"
  | "padding-y"
  | "rounded"
  | "font-weight"
  | "text-size"
  | "gap"
  | "icon-size";
export type VariantAxis = "size" | "color" | "state";

export interface SlotMappingEntry {
  slot: RecipeSlot;
  utilityType: UtilityType;
  variantAxis: VariantAxis | null;
  variantKey: string | null;
}

export type SlotMappingOverride = Readonly<Record<string, SlotMappingEntry | null>>;

const SIZE_KEYS = new Set(["xs", "sm", "md", "lg", "xl", "2xl"]);
const STATE_KEYS = new Set(["default", "hover", "active", "disabled", "focus"]);

interface ParsedSegments {
  component: string;
  utility: string;
  variant: string | null;
}

function parseSegments(tokenId: string): ParsedSegments | null {
  const parts = tokenId.split("-");
  if (parts.length < 2) return null;
  const component = parts[0];
  if (component === undefined) return null;
  const last = parts[parts.length - 1];
  if (last === undefined) return null;

  // Variant axis detection from suffix.
  if (SIZE_KEYS.has(last) || STATE_KEYS.has(last)) {
    return {
      component,
      utility: parts.slice(1, -1).join("-"),
      variant: last,
    };
  }
  return {
    component,
    utility: parts.slice(1).join("-"),
    variant: null,
  };
}

const HEURISTIC_RULES: ReadonlyArray<{
  match: (utility: string) => boolean;
  build: (variant: string | null) => SlotMappingEntry;
}> = [
  {
    match: (u) => u === "padding-x",
    build: (v) => ({
      slot: "base",
      utilityType: "padding-x",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "padding-y",
    build: (v) => ({
      slot: "base",
      utilityType: "padding-y",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "radius" || u === "rounded",
    build: (v) => ({
      slot: "base",
      utilityType: "rounded",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "font-weight" || u === "weight",
    build: (v) => ({
      slot: "base",
      utilityType: "font-weight",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "text-size" || u === "font-size" || u === "text",
    build: (v) => ({
      slot: "base",
      utilityType: "text-size",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "gap",
    build: (v) => ({
      slot: "base",
      utilityType: "gap",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "icon-size" || u === "icon",
    build: (v) => ({
      slot: "leadingIcon",
      utilityType: "icon-size",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
];

function variantAxisFor(variant: string | null): VariantAxis | null {
  if (!variant) return null;
  if (SIZE_KEYS.has(variant)) return "size";
  if (STATE_KEYS.has(variant)) return "state";
  return null;
}

/**
 * Pure heuristic mapping. Returns null if no rule matches.
 */
export function heuristicSlotMapping(tokenId: string): SlotMappingEntry | null {
  const parsed = parseSegments(tokenId);
  if (!parsed) return null;
  for (const rule of HEURISTIC_RULES) {
    if (rule.match(parsed.utility)) {
      return rule.build(parsed.variant);
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
): SlotMappingEntry | null {
  if (override && Object.prototype.hasOwnProperty.call(override, tokenId)) {
    return override[tokenId] ?? null;
  }
  return heuristicSlotMapping(tokenId);
}
