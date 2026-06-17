// Walks component-layer tokens, applies slot-mapping, classifies each
// value via the existing classification engine, and assembles
// Nuxt UI v4 { slots, variants } recipes per component.
//
// Allow-list: pass `{ components: [...] }` to scope output to specific
// components (the renderer passes the full 15-component standard set).

import type { TokenGraph, TokenId, TokenNode } from "./token-graph.js";
import { classifyToken } from "./classify-token.js";
import { resolveTokenToValue } from "./resolve-token.js";
import { isOpaqueColor } from "./color-opacity.js";
import {
  getSlotMapping,
  type SlotMappingOverride,
  type SlotMappingEntry,
  type RecipeSlot,
  type UtilityType,
  type VariantAxis,
  SLOT_MIRROR,
} from "@tg/grammar";

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

// Utility types that carry color values; emitted directly as arbitrary-value
// classes (with a var()/literal inner) without shadow-node scale matching.
const COLOR_UTILITY_TYPES: ReadonlySet<UtilityType> = new Set<UtilityType>([
  "bg-color",
  "text-color",
  "border-color",
  "ring-color",
  "underline-color",
  "placeholder-color",
  "overlay-bg",
]);

// Utility types that always emit arbitrary-value classes from the resolved
// primitive value, bypassing Tailwind-default scale matching ("40px", "Inter").
const ARBITRARY_VALUE_TYPES: ReadonlySet<UtilityType> = new Set<UtilityType>([
  "height",
  "width",
  "size",
  "border-width",
  "ring-width",
  "line-height",
  "letter-spacing",
  "ring-offset",
  "font-family",
  "padding",
]);

/**
 * Single source of truth for "what Tailwind utility class does this component
 * token emit". Used by buildComponentRecipes for recipe output AND by the
 * Inspector to highlight the matching class — keeping the two from drifting
 * (an arbitrary type like `ring-offset` emits `ring-offset-[4px]`, not the
 * scale class the shadow-node path alone would produce). Returns the bare
 * utility; callers apply any statePrefix. `resolvedValue` is the token's
 * already-resolved terminal value.
 */
export function utilityForMapping(
  graph: TokenGraph,
  node: TokenNode,
  utilityType: UtilityType,
  resolvedValue: string,
  remBase?: number,
): string | null {
  // A colour-valued icon token (e.g. chip-close-icon) carries the icon's COLOUR,
  // not its size. The icon-size rule is name-based and value-type-blind, so without
  // this it would emit a nonsensical size-[#hex]. Nuxt UI icons take colour from
  // text-colour, so resolve it the same way the colour path does and emit text-[…].
  if (utilityType === "icon-size" && node.type === "color") {
    const ref = resolveColorReference(graph, node.id);
    const inner =
      ref.kind === "var" ? `var(--${ref.targetId})` : ref.kind === "literal" ? ref.value : resolvedValue;
    return `${prefixForUtility("text-color")}[${escapeArbitrary(inner)}]`;
  }
  if (COLOR_UTILITY_TYPES.has(utilityType)) {
    const colorRef = resolveColorReference(graph, node.id);
    const inner =
      colorRef.kind === "var"
        ? `var(--${colorRef.targetId})`
        : colorRef.kind === "literal"
          ? colorRef.value
          : resolvedValue;
    return `${prefixForUtility(utilityType)}[${escapeArbitrary(inner)}]`;
  }
  if (ARBITRARY_VALUE_TYPES.has(utilityType)) {
    return `${prefixForUtility(utilityType)}[${escapeArbitrary(resolvedValue)}]`;
  }
  // Fabricate a shadow node with a canonical primitive-style id so
  // classifyToken's tailwindCategoryFor picks the right category (radius,
  // font-size, …) instead of falling through to the "spacing" default.
  const classification = classifyToken(
    { ...node, id: shadowIdFor(utilityType), layer: "primitive", cssValue: { base: resolvedValue } },
    graph,
    { remBase },
  );
  return utilityFor(utilityType, classification);
}

export interface ComponentRecipe {
  slots: Partial<Record<RecipeSlot, string>>;
  variants: {
    size?: Record<string, Partial<Record<RecipeSlot, string>>>;
    color?: Record<string, Partial<Record<RecipeSlot, string>>>;
    variant?: Record<string, Partial<Record<RecipeSlot, string>>>;
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
    const mapping = getSlotMapping(node.id, options.slotMappingOverride, node.type);
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

  // Pre-scan: record where each component's RESTING ring-colour lives so a
  // component-level resting ring-WIDTH can be paired to those locations only.
  // (A ring-width without a ring-colour still draws a ring, so we must not
  // emit it on variants that have no colour to justify it.)
  type RingColourTarget = { variantAxis: VariantAxis | null; variantKey: string | null };
  const restingRingColourTargets = new Map<string, RingColourTarget[]>();

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const componentName = node.id.split("-")[0];
    if (componentName === undefined || !allowSet.has(componentName)) continue;
    const mapping = getSlotMapping(node.id, options.slotMappingOverride, node.type);
    if (!mapping || mapping.utilityType !== "ring-color" || mapping.statePrefix != null) continue;
    if (mapping.variantAxis !== null && mapping.variantAxis !== "variant") continue;
    const resolved = resolveTokenToValue(node.id, graph);
    if ("error" in resolved || !isOpaqueColor(resolved.value)) continue; // dropped colours aren't pairing targets
    const list = restingRingColourTargets.get(componentName) ?? [];
    const target: RingColourTarget = { variantAxis: mapping.variantAxis, variantKey: mapping.variantKey };
    if (!list.some((t) => t.variantAxis === target.variantAxis && t.variantKey === target.variantKey)) {
      list.push(target);
    }
    restingRingColourTargets.set(componentName, list);
  }

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;

    const componentName = node.id.split("-")[0];
    if (componentName === undefined || !allowSet.has(componentName)) continue;

    const mapping = getSlotMapping(node.id, options.slotMappingOverride, node.type);
    if (!mapping) continue;

    const resolved = resolveTokenToValue(node.id, graph);
    if ("error" in resolved) continue;

    // A fully-transparent colour paints nothing — emitting a class (e.g.
    // border-[var(--color-transparent)]) is dead output and trips the preview's
    // border-preflight compensation. Skip it; Nuxt's (equally transparent)
    // default applies.
    if (COLOR_UTILITY_TYPES.has(mapping.utilityType) && !isOpaqueColor(resolved.value)) {
      continue;
    }

    // A component-level resting ring-width (no variant, no state) must pair with
    // a resting ring-COLOUR, or it paints a colourless ring on every variant.
    // Emit it only at the colour's location(s); drop it if there is none.
    // (Fixes the D2e leak where button-border-width ringed solid/ghost/link.)
    if (
      mapping.utilityType === "ring-width" &&
      mapping.variantAxis === null &&
      mapping.variantKey === null &&
      mapping.statePrefix == null
    ) {
      const targets = restingRingColourTargets.get(componentName) ?? [];
      const widthClass = utilityForMapping(
        graph,
        node,
        mapping.utilityType,
        resolved.value,
        options.remBase,
      );
      if (widthClass) {
        for (const target of targets) {
          const targetMapping: SlotMappingEntry = {
            ...mapping,
            variantAxis: target.variantAxis,
            variantKey: target.variantKey,
          };
          const bk = bucketKeyFor(componentName, targetMapping);
          const arr = utilityBuckets.get(bk) ?? [];
          arr.push(widthClass);
          utilityBuckets.set(bk, arr);
        }
      }
      continue; // handled (and dropped when targets is empty)
    }

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

    // Single source of truth for the emitted class — shared with the
    // Inspector's highlight resolver so they never drift. Handles color,
    // arbitrary-value, and shadow-node-classified utility types.
    let utility = utilityForMapping(
      graph,
      node,
      effectiveMapping.utilityType,
      resolved.value,
      options.remBase,
    );
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

  // Mirror icon classes to the partner slot (Figma defines icon-size once for
  // ANY icon; Nuxt sizes leading AND trailing alike). Own tokens win per bucket.
  for (const recipe of Object.values(out)) {
    for (const [from, to] of SLOT_MIRROR) {
      if (recipe.slots[from as RecipeSlot] !== undefined && recipe.slots[to as RecipeSlot] === undefined) {
        recipe.slots[to as RecipeSlot] = recipe.slots[from as RecipeSlot]!;
      }
      for (const axis of Object.values(recipe.variants)) {
        for (const variantBucket of Object.values(axis)) {
          if (variantBucket[from as RecipeSlot] !== undefined && variantBucket[to as RecipeSlot] === undefined) {
            variantBucket[to as RecipeSlot] = variantBucket[from as RecipeSlot]!;
          }
        }
      }
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
    case "size":
    case "border-width":
    case "ring-width":
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
    case "size":
      return "size-";
    case "bg-color":
      return "bg-";
    case "text-color":
      return "text-";
    case "border-color":
      return "border-";
    case "border-width":
      return "border-";
    case "ring-color":
      return "ring-";
    case "ring-width":
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
