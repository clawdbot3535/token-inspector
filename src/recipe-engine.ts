// Walks component-layer tokens, applies slot-mapping, classifies each
// value via the existing classification engine, and assembles
// Nuxt UI v4 { slots, variants } recipes per component.
//
// Allow-list: pass `{ components: [...] }` to scope output to specific
// components (the renderer passes the full 15-component standard set).

import type { TokenGraph, TokenId } from "./token-graph.js";
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

/**
 * Decide what to emit inside the arbitrary-value brackets for a color
 * utility. Walks one alias step from the starting component token; if
 * it lands on a non-component node (semantic or primitive), emit a
 * `var(--<id>)` reference so dark-mode overrides in tokens.css apply
 * automatically. Falls back to the resolved literal hex when the token
 * is a literal (no alias) or its chain only contains component nodes.
 */
type ColorReference =
  | { kind: "var"; targetId: TokenId }
  | { kind: "literal"; value: string }
  | { kind: "unresolved" };

function resolveColorReference(graph: TokenGraph, id: TokenId): ColorReference {
  const visited = new Set<TokenId>();
  let current: TokenId | undefined = id;
  let walked = false;

  while (current !== undefined) {
    if (visited.has(current)) break; // cycle — fall through to literal
    visited.add(current);
    const node = graph.nodes.get(current);
    if (!node) break;

    // Stop at the first non-component ancestor we walked to.
    // tokens.css exports primitive + semantic vars but NOT component vars,
    // so a var(--<component-id>) wouldn't resolve in CSS.
    if (walked && node.layer !== "component") {
      return { kind: "var", targetId: current };
    }

    const alias = node.alias.base ?? node.alias.light ?? node.alias.dark;
    if (alias === undefined) break;
    walked = true;
    current = alias.to;
  }

  // Fallback: literal value via the existing terminal resolver.
  const resolved = resolveTokenToValue(id, graph);
  if ("error" in resolved) return { kind: "unresolved" };
  return { kind: "literal", value: resolved.value };
}

export interface ComponentRecipe {
  slots: Partial<Record<RecipeSlot, string>>;
  variants: {
    size?: Record<string, Partial<Record<RecipeSlot, string>>>;
    color?: Record<string, Partial<Record<RecipeSlot, string>>>;
    variant?: Record<string, Partial<Record<RecipeSlot, string>>>;
    state?: Record<string, Partial<Record<RecipeSlot, string>>>;
  };
}

export interface BuildRecipesOptions {
  components: ReadonlyArray<string>;
  slotMappingOverride?: SlotMappingOverride;
  remBase?: number;
  /**
   * Per-component default size for non-suffix tokens that compete with
   * size-suffixed siblings. When a non-suffix token's utility type has
   * any size variant defined in the graph, the non-suffix value goes
   * into variants.size.<defaultSize> instead of slots.base.
   * Defaults to "md" if not specified.
   */
  defaultSizeByComponent?: Readonly<Record<string, string>>;
}

export function buildComponentRecipes(
  graph: TokenGraph,
  options: BuildRecipesOptions,
): Record<string, ComponentRecipe> {
  const allowSet = new Set(options.components);
  const out: Record<string, ComponentRecipe> = {};
  const utilityBuckets = new Map<string, string[]>();

  // Pre-scan: for each (component, utilityType), collect which size keys are
  // defined. Used to decide whether non-suffix tokens go to slots.base or to
  // the default size variant.
  const utilityHasSizeVariants = new Map<string, Set<string>>(); // key: `${component}|${utility}`

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const componentName = node.id.split("-")[0];
    if (componentName === undefined || !allowSet.has(componentName)) continue;
    const mapping = getSlotMapping(node.id, options.slotMappingOverride);
    if (!mapping || mapping.variantKey === null) continue;
    if (mapping.variantAxis !== "size") continue;
    const key = `${componentName}|${mapping.utilityType}`;
    let set = utilityHasSizeVariants.get(key);
    if (!set) {
      set = new Set();
      utilityHasSizeVariants.set(key, set);
    }
    set.add(mapping.variantKey);
  }

  // Set of utility types that carry color values; the recipe-engine emits
  // these directly as Tailwind arbitrary-value classes without going
  // through the shadow-node tailwind-default matching.
  const COLOR_UTILITY_TYPES: ReadonlySet<UtilityType> = new Set<UtilityType>([
    "bg-color",
    "text-color",
    "border-color",
    "ring-color",
    "underline-color",
    "placeholder-color",
    "overlay-bg",
  ]);

  // Set of utility types that always emit arbitrary-value classes from the
  // resolved primitive value, bypassing Tailwind-default scale matching.
  // Values like "40px", "1.5", "Inter" have no Tailwind scale entry.
  const ARBITRARY_VALUE_TYPES: ReadonlySet<UtilityType> = new Set<UtilityType>([
    "height",
    "width",
    "line-height",
    "letter-spacing",
    "ring-offset",
    "font-family",
    "padding",
  ]);

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;

    const componentName = node.id.split("-")[0];
    if (componentName === undefined || !allowSet.has(componentName)) continue;

    const mapping = getSlotMapping(node.id, options.slotMappingOverride);
    if (!mapping) continue;

    const resolved = resolveTokenToValue(node.id, graph);
    if ("error" in resolved) continue;

    // Redirect non-suffix tokens to the default size variant when the utility
    // type has size-suffixed siblings in the graph. State-prefixed tokens
    // (statePrefix set, variantKey null) are NOT non-suffix defaults — they
    // emit a `focus:`/`hover:` utility on base and must skip this redirect.
    let effectiveMapping = mapping;
    if (mapping.variantKey === null && mapping.statePrefix == null) {
      const presenceKey = `${componentName}|${mapping.utilityType}`;
      const sizesPresent = utilityHasSizeVariants.get(presenceKey);
      if (sizesPresent && sizesPresent.size > 0) {
        const defaultSize =
          options.defaultSizeByComponent?.[componentName] ?? "md";
        // Skip if the default size already has its own token — size-suffix wins.
        if (sizesPresent.has(defaultSize)) {
          continue;
        }
        effectiveMapping = {
          ...mapping,
          variantAxis: "size",
          variantKey: defaultSize,
        };
      }
    }

    // Color utilities never match a Tailwind default — short-circuit
    // the shadow-node classification step and emit an arbitrary-value
    // class. Prefer var(--semantic-id) over baked-in hex so dark-mode
    // overrides in tokens.css cascade through automatically; fall back
    // to the literal value when no aliased semantic ancestor exists.
    let utility: string | null;
    if (COLOR_UTILITY_TYPES.has(effectiveMapping.utilityType)) {
      const colorRef = resolveColorReference(graph, node.id);
      let inner: string;
      switch (colorRef.kind) {
        case "var":
          inner = `var(--${colorRef.targetId})`;
          break;
        case "literal":
          inner = colorRef.value;
          break;
        case "unresolved":
          // Defensive — earlier resolveTokenToValue already returned a
          // value, so this branch is practically unreachable. Fall back
          // to the terminal value we already have.
          inner = resolved.value;
          break;
      }
      utility =
        `${prefixForUtility(effectiveMapping.utilityType)}[${escapeArbitrary(inner)}]`;
    } else if (ARBITRARY_VALUE_TYPES.has(effectiveMapping.utilityType)) {
      // Arbitrary-value types (height, width, line-height, etc.) always emit
      // directly from the resolved primitive value — no Tailwind scale exists.
      utility = `${prefixForUtility(effectiveMapping.utilityType)}[${escapeArbitrary(resolved.value)}]`;
    } else {
      const classification = classifyToken(
        // Fabricate a tiny shadow node carrying the resolved primitive value so
        // classifyToken does not skip it as component-layer.
        // Override the id with a canonical primitive id so tailwindCategoryFor
        // picks the right Tailwind category (radius, font-size, etc.) instead
        // of falling through to the "spacing" default.
        {
          ...node,
          id: shadowIdFor(effectiveMapping.utilityType),
          layer: "primitive",
          cssValue: { base: resolved.value },
        },
        graph,
        { remBase: options.remBase },
      );

      utility = utilityFor(effectiveMapping.utilityType, classification);
    }
    if (!utility) continue;

    // Apply pseudo-class state prefix when set (e.g. button-solid-bg-hover
    // → "hover:bg-[#X]" inside variants.variant.solid.base).
    if (effectiveMapping.statePrefix != null) {
      utility = `${effectiveMapping.statePrefix}:${utility}`;
    }

    const bucketKey = bucketKeyFor(componentName, effectiveMapping);
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
 *
 * Exported so App.vue's per-token skip-branch resolver can reuse this
 * without duplicating the switch.
 */
export function shadowIdFor(utilityType: UtilityType): string {
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
    case "bg-color":
    case "text-color":
    case "border-color":
    case "ring-color":
    case "underline-color":
      // Color utilities bypass shadow-node classification; this id is
      // only here to satisfy the exhaustive switch and is never read.
      return "color-temp";
    case "height":
    case "width":
    case "line-height":
    case "letter-spacing":
    case "ring-offset":
    case "font-family":
    case "padding":
      // Arbitrary-value types — bypass classification entirely; id never read.
      return "arbitrary-temp";
    case "placeholder-color":
    case "overlay-bg":
      // Color-path arbitrary types; id never read.
      return "color-temp";
  }
}

/**
 * Derive a single Tailwind utility string from a classification result
 * produced on a shadow node. Returns null if the classification cannot
 * produce a concrete utility (e.g. mode-variant shadows, skip).
 *
 * Exported so App.vue's per-token skip-branch resolver can reuse this
 * without duplicating the derivation logic.
 */
export function utilityFor(
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

/**
 * Exported so App.vue's per-token skip-branch resolver can reuse this
 * without duplicating the switch.
 */
export function prefixForUtility(utilityType: UtilityType): string {
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
    case "bg-color":
      return "bg-";
    case "text-color":
      return "text-";
    case "border-color":
      return "border-";
    case "ring-color":
      return "ring-";
    case "underline-color":
      return "underline-";
    case "height":
      return "h-";
    case "width":
      return "w-";
    case "line-height":
      return "leading-";
    case "letter-spacing":
      return "tracking-";
    case "placeholder-color":
      return "placeholder:text-";
    case "ring-offset":
      return "ring-offset-";
    case "font-family":
      return "font-";
    case "padding":
      return "p-";
    case "overlay-bg":
      return "bg-";
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
