// Builds full-fidelity { slots, variants } recipes for components the scanner
// flagged `component-looks-custom`. These diverge from their Nuxt UI counterpart
// (foreign sub-element parts Nuxt has no slot for), so they are emitted to
// custom-components.ts as hand-implementation references, NOT as ui.<name> overrides.
//
// Strategy (Task 3): compute a per-token slotMappingOverride using a permissive
// slot set (the component's foreign parts) plus a trailing-color-role
// normalization, then DELEGATE assembly to buildComponentRecipes.

import { getSlotMapping, normalizeTrailingColorRole, nuxtSlotsFor, type SlotMappingOverride } from "@tg/grammar";

export { normalizeTrailingColorRole }; // re-exported for src/custom-recipe-engine.test.ts
import type { TokenGraph } from "./token-graph.js";
import {
  buildComponentRecipes,
  type ComponentRecipe,
} from "./recipe-engine.js";
import { resolveTokenToValue } from "./resolve-token.js";

export interface BuildCustomRecipesOptions {
  readonly defaultSizeByComponent?: Readonly<Record<string, string>>;
  readonly remBase?: number;
  /** Session slot-mapping override (from the user's resolutions); merged OVER
   *  the auto-computed per-token override so resolved tokens win. */
  readonly slotMappingOverride?: SlotMappingOverride;
}

/**
 * Build full-fidelity recipes for flagged-custom components.
 *
 * For each (component → foreign parts) entry we precompute a slotMappingOverride
 * for every one of that component's tokens — using normalizeTrailingColorRole +
 * the permissive `extraSlots` heuristic — then delegate the actual slot/variant
 * assembly to buildComponentRecipes. The override is keyed by the ORIGINAL token
 * id, so value resolution and class emission run on the real node; only the
 * (slot, utilityType, variant axis/key, statePrefix) decision is ours.
 */
export function buildCustomRecipes(
  graph: TokenGraph,
  partsByComponent: ReadonlyMap<string, ReadonlyArray<string>>,
  options: BuildCustomRecipesOptions = {},
): Record<string, ComponentRecipe> {
  const out: Record<string, ComponentRecipe> = {};

  for (const [component, parts] of partsByComponent) {
    const extraSlots = new Set(parts);
    const override: Record<string, ReturnType<typeof getSlotMapping>> = {};

    for (const node of graph.nodes.values()) {
      if (node.layer !== "component") continue;
      // Filter uses the first "-"-segment for EXACT equality, so "nav" and "navbar" never cross-contaminate.
      const prefix = node.id.split("-")[0];
      if (prefix !== component) continue;
      const normId = normalizeTrailingColorRole(node.id);
      override[node.id] = getSlotMapping(normId, undefined, node.type, extraSlots);
    }

    const built = buildComponentRecipes(graph, {
      components: [component],
      // Cast is safe: Record<string, SlotMappingEntry | null> satisfies the Readonly target. A null entry explicitly skips that token in buildComponentRecipes (no class emitted).
      slotMappingOverride: { ...override, ...(options.slotMappingOverride ?? {}) } as SlotMappingOverride,
      defaultSizeByComponent: options.defaultSizeByComponent,
      remBase: options.remBase,
    });
    const recipe = built[component];
    if (recipe !== undefined) out[component] = recipe;
  }

  return out;
}

export type OverlayMode = "light" | "dark";

/**
 * Detects an `overlay-light`/`overlay-dark` marker and returns the logical base
 * id with the marker removed plus the mode. The marker may sit either at the
 * fixed 2nd segment (`button-overlay-dark-solid-bg` → `button-solid-bg`) or
 * after a recognised sub-element slot (`nav-item-overlay-dark-ghost-bg` →
 * `nav-item-ghost-bg`). Returns mode `null` when no overlay marker is present,
 * the mode is invalid, or the pre-overlay segment is not a known slot.
 */
export function stripOverlayPrefix(tokenId: string): {
  logicalId: string;
  mode: OverlayMode | null;
} {
  const parts = tokenId.split("-");
  // Case 1: overlay at the fixed 2nd segment — `comp-overlay-<mode>-<utility...>`.
  if (parts.length >= 4 && parts[1] === "overlay") {
    const mode = parts[2];
    if (mode === "light" || mode === "dark") {
      return { logicalId: [parts[0], ...parts.slice(3)].join("-"), mode };
    }
  }
  // Case 2: overlay after a recognised sub-element slot —
  // `comp-<sub>-overlay-<mode>-<utility...>` (e.g. nav-item-overlay-dark-ghost-bg).
  // The logical id keeps the sub-element; the variant-after-sub-element parser
  // change then maps it.
  if (parts.length >= 5 && parts[2] === "overlay") {
    const sub = parts[1];
    const slots = sub !== undefined ? nuxtSlotsFor(parts[0]!) : undefined;
    if (sub !== undefined && slots?.has(sub)) {
      const mode = parts[3];
      if (mode === "light" || mode === "dark") {
        return { logicalId: [parts[0], sub, ...parts.slice(4)].join("-"), mode };
      }
    }
  }
  return { logicalId: tokenId, mode: null };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A genuine overlay override is one whose resolved value differs from its base
 * counterpart's. Conservative: if the base id has no node / cannot resolve,
 * treat the overlay token as genuine (never silently drop on uncertainty); if
 * the overlay token itself cannot resolve, it is not emittable → not genuine.
 */
function isGenuineOverlay(overlayId: string, logicalId: string, graph: TokenGraph): boolean {
  // Compares base-mode (un-themed) values — overlay tokens are flat literals in this corpus.
  const ov = resolveTokenToValue(overlayId, graph);
  if ("error" in ov) return false;
  const base = resolveTokenToValue(logicalId, graph);
  if ("error" in base) return true; // no/unresolvable base → genuine
  return base.value !== ov.value;
}

/**
 * Build sparse `<component>Overlay<Mode>` delta recipes from `overlay-light` /
 * `overlay-dark` tokens. Reuses the buildCustomRecipes delegation: per
 * (component, mode) we override each genuine overlay token to the slot/variant
 * its logical (prefix-stripped) id maps to, null everything else, and let
 * buildComponentRecipes assemble — so only this mode's genuine overrides are
 * emitted, valued from the real overlay nodes. Identical-to-base tokens and
 * sub-element overlay tokens (stripOverlayPrefix mode === null) are dropped.
 */
export function buildOverlayRecipes(graph: TokenGraph): Record<string, ComponentRecipe> {
  const pairs = new Set<string>(); // `${component}|${mode}`
  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const { mode } = stripOverlayPrefix(node.id);
    if (mode === null) continue;
    pairs.add(`${node.id.split("-")[0]}|${mode}`);
  }

  const out: Record<string, ComponentRecipe> = {};
  for (const pair of pairs) {
    const sep = pair.indexOf("|");
    const component = pair.slice(0, sep);
    const mode = pair.slice(sep + 1) as OverlayMode;
    const override: Record<string, ReturnType<typeof getSlotMapping>> = {};
    for (const node of graph.nodes.values()) {
      if (node.layer !== "component") continue;
      if (node.id.split("-")[0] !== component) continue;
      const { logicalId, mode: m } = stripOverlayPrefix(node.id);
      if (m === mode && isGenuineOverlay(node.id, logicalId, graph)) {
        override[node.id] = getSlotMapping(logicalId, undefined, node.type);
      } else {
        override[node.id] = null; // base, other mode, identical, or sub-element → skip
      }
    }
    const built = buildComponentRecipes(graph, {
      components: [component],
      slotMappingOverride: override as SlotMappingOverride,
    });
    const recipe = built[component];
    if (
      recipe !== undefined &&
      (Object.keys(recipe.slots).length > 0 ||
        Object.values(recipe.variants).some((axis) => axis !== undefined && Object.keys(axis).length > 0))
    ) {
      out[`${component}Overlay${capitalize(mode)}`] = recipe;
    }
  }
  return out;
}
