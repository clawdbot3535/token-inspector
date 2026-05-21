// Walks component-layer tokens, applies slot-mapping, classifies each
// value via the existing classification engine, and assembles
// Nuxt UI v4 { slots, variants } recipes per component.
//
// Allow-list: pass `{ components: ['button'] }` to scope output.

import type { TokenGraph } from "./token-graph.js";
import { classifyToken } from "./classify-token.js";
import { resolveTokenToValue } from "./resolve-token.js";
import {
  getSlotMapping,
  type SlotMappingOverride,
  type SlotMappingEntry,
  type RecipeSlot,
  type UtilityType,
  type VariantAxis,
} from "./slot-mapping.js";

export interface ComponentRecipe {
  slots: Partial<Record<RecipeSlot, string>>;
  variants: {
    size?: Record<string, Partial<Record<RecipeSlot, string>>>;
    color?: Record<string, Partial<Record<RecipeSlot, string>>>;
    state?: Record<string, Partial<Record<RecipeSlot, string>>>;
  };
}

export interface BuildRecipesOptions {
  components: ReadonlyArray<string>;
  slotMappingOverride?: SlotMappingOverride;
  remBase?: number;
}

export function buildComponentRecipes(
  graph: TokenGraph,
  options: BuildRecipesOptions,
): Record<string, ComponentRecipe> {
  const allowSet = new Set(options.components);
  const out: Record<string, ComponentRecipe> = {};
  const utilityBuckets = new Map<string, string[]>();

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;

    const componentName = node.id.split("-")[0];
    if (componentName === undefined || !allowSet.has(componentName)) continue;

    const mapping = getSlotMapping(node.id, options.slotMappingOverride);
    if (!mapping) continue;

    const resolved = resolveTokenToValue(node.id, graph);
    if ("error" in resolved) continue;

    const classification = classifyToken(
      // Fabricate a tiny shadow node carrying the resolved primitive value so
      // classifyToken does not skip it as component-layer.
      // Override the id with a canonical primitive id so tailwindCategoryFor
      // picks the right Tailwind category (radius, font-size, etc.) instead
      // of falling through to the "spacing" default.
      {
        ...node,
        id: shadowIdFor(mapping.utilityType),
        layer: "primitive",
        cssValue: { base: resolved.value },
      },
      graph,
      { remBase: options.remBase },
    );

    const utility = utilityFor(mapping.utilityType, classification);
    if (!utility) continue;

    const bucketKey = bucketKeyFor(componentName, mapping);
    const arr = utilityBuckets.get(bucketKey) ?? [];
    arr.push(utility);
    utilityBuckets.set(bucketKey, arr);
  }

  for (const [bucketKey, utilities] of utilityBuckets) {
    const parsed = parseBucketKey(bucketKey);
    if (!parsed) continue;

    const recipe = (out[parsed.component] ??= { slots: {}, variants: {} });
    const dedupedSorted = Array.from(new Set(utilities)).sort();
    const classString = dedupedSorted.join(" ");

    if (parsed.variantAxis === null) {
      recipe.slots[parsed.slot] = classString;
    } else {
      const axis = (recipe.variants[parsed.variantAxis] ??= {});
      const variantKey = parsed.variantKey;
      if (variantKey === null) continue;
      const variantBucket = (axis[variantKey] ??= {});
      variantBucket[parsed.slot] = classString;
    }
  }

  return out;
}

/**
 * Returns a canonical primitive-style id that tailwindCategoryFor (in
 * classify-token.ts) will map to the correct Tailwind category for this
 * utility type. This avoids the component token's original id (e.g.
 * "button-radius") failing the prefix regex checks.
 */
function shadowIdFor(utilityType: UtilityType): string {
  switch (utilityType) {
    case "padding-x":
    case "padding-y":
    case "gap":
    case "icon-size":
      return "spacing-temp";
    case "rounded":
      return "radius-temp";
    case "font-weight":
      return "font-weight-temp"; // handled by TokenType, not id, but safe
    case "text-size":
      return "font-size-temp";
  }
}

function utilityFor(
  utilityType: UtilityType,
  classification: ReturnType<typeof classifyToken>,
): string | null {
  if (classification.kind === "skip") return null;

  if (classification.kind === "tailwind-default") {
    // classifyToken's utility prefix is always `<word>-` (e.g. "p-", "rounded-",
    // "font-", "text-"). Strip everything up to and including the first "-"
    // to get the bare Tailwind scale suffix, then re-prefix for this utility type.
    const dashIndex = classification.utility.indexOf("-");
    if (dashIndex === -1) return null;
    const suffix = classification.utility.slice(dashIndex + 1);
    return prefixForUtility(utilityType) + suffix;
  }

  if (classification.kind === "theme-static") {
    // The shadow node fabricates a primitive-style id ("spacing-temp" etc.)
    // so classifyToken can run on it. That id's cssName ("--spacing-temp")
    // does not exist in tokens.css. Emit the raw resolved value as a
    // Tailwind arbitrary value (px-[16px]) instead of var(--spacing-temp).
    return `${prefixForUtility(utilityType)}[${escapeArbitrary(classification.value)}]`;
  }

  if (classification.kind === "theme-mode-variant") {
    // Defensive — shadow nodes have no light/dark cssValue so this branch
    // should be unreachable for numeric tokens. If we do land here, emit
    // the light value as arbitrary so the output stays valid Tailwind.
    return `${prefixForUtility(utilityType)}[${escapeArbitrary(classification.lightValue)}]`;
  }

  return null;
}

/**
 * Escape spaces for Tailwind v4 arbitrary-value syntax. Tailwind reads
 * underscores as literal spaces inside `[...]`, so any space in the raw
 * CSS value must be converted to `_`.
 */
function escapeArbitrary(value: string): string {
  return value.replace(/\s+/g, "_");
}

function prefixForUtility(utilityType: UtilityType): string {
  switch (utilityType) {
    case "padding-x":
      return "px-";
    case "padding-y":
      return "py-";
    case "rounded":
      return "rounded-";
    case "font-weight":
      return "font-";
    case "text-size":
      return "text-";
    case "gap":
      return "gap-";
    case "icon-size":
      return "size-";
  }
}

function bucketKeyFor(componentName: string, mapping: SlotMappingEntry): string {
  if (mapping.variantAxis === null) {
    return `${componentName}|null|null|${mapping.slot}`;
  }
  return `${componentName}|${mapping.variantAxis}|${mapping.variantKey}|${mapping.slot}`;
}

interface ParsedBucket {
  component: string;
  variantAxis: VariantAxis | null;
  variantKey: string | null;
  slot: RecipeSlot;
}

function parseBucketKey(key: string): ParsedBucket | null {
  const parts = key.split("|");
  if (parts.length !== 4) return null;
  const component = parts[0];
  const axisRaw = parts[1];
  const variantKeyRaw = parts[2];
  const slotRaw = parts[3];
  if (
    component === undefined ||
    axisRaw === undefined ||
    variantKeyRaw === undefined ||
    slotRaw === undefined
  ) {
    return null;
  }
  const variantAxis: VariantAxis | null =
    axisRaw === "null" ? null : (axisRaw as VariantAxis);
  const variantKey = variantKeyRaw === "null" ? null : variantKeyRaw;
  return {
    component,
    variantAxis,
    variantKey,
    slot: slotRaw as RecipeSlot,
  };
}
