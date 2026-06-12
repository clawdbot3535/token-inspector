// Builds full-fidelity { slots, variants } recipes for components the scanner
// flagged `component-looks-custom`. These diverge from their Nuxt UI counterpart
// (foreign sub-element parts Nuxt has no slot for), so they are emitted to
// custom-components.ts as hand-implementation references, NOT as ui.<name> overrides.
//
// Strategy (Task 3): compute a per-token slotMappingOverride using a permissive
// slot set (the component's foreign parts) plus a trailing-color-role
// normalization, then DELEGATE assembly to buildComponentRecipes.

import { COLOR_ROLE_KEYS, getSlotMapping, type SlotMappingOverride } from "@tg/grammar";
import type { TokenGraph } from "./token-graph.js";
import {
  buildComponentRecipes,
  type ComponentRecipe,
} from "./recipe-engine.js";

/**
 * The grammar recognizes a color-role only as the 2nd segment
 * (`button-error-bg`). Figma also names them trailing (`chip-bg-error`).
 * Move a trailing color-role to the 2nd position so the existing grammar
 * maps it to variants.color. A trailing STATE/SIZE word is left untouched
 * (the grammar already handles those as suffixes). No-op when the 2nd
 * segment is already a color-role or the id is too short.
 */
export function normalizeTrailingColorRole(tokenId: string): string {
  const parts = tokenId.split("-");
  if (parts.length < 3) return tokenId;
  const last = parts[parts.length - 1];
  const second = parts[1];
  if (last === undefined || second === undefined) return tokenId;
  if (!COLOR_ROLE_KEYS.has(last)) return tokenId; // trailing state/size/prop — leave it
  if (COLOR_ROLE_KEYS.has(second)) return tokenId; // already 2nd-segment color-role
  const component = parts[0];
  const middle = parts.slice(1, parts.length - 1); // property/sub-element segments
  return [component, last, ...middle].join("-");
}

export interface BuildCustomRecipesOptions {
  readonly defaultSizeByComponent?: Readonly<Record<string, string>>;
  readonly remBase?: number;
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
      slotMappingOverride: override as SlotMappingOverride,
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
 * Detects an `overlay-light`/`overlay-dark` segment in the 2nd position
 * (immediately after the component name) and returns the logical base id with
 * the segment removed plus the detected mode. A no-op (mode `null`) when the
 * segment is absent or sits after a sub-element (e.g. `nav-item-overlay-*`,
 * which is deferred until variant-after-sub-element mapping lands) — there
 * `parts[1]` is the sub-element, not `"overlay"`.
 */
export function stripOverlayPrefix(tokenId: string): {
  logicalId: string;
  mode: OverlayMode | null;
} {
  const parts = tokenId.split("-");
  if (parts.length < 4) return { logicalId: tokenId, mode: null };
  if (parts[1] !== "overlay") return { logicalId: tokenId, mode: null };
  const mode = parts[2];
  if (mode !== "light" && mode !== "dark") return { logicalId: tokenId, mode: null };
  const logicalId = [parts[0], ...parts.slice(3)].join("-");
  return { logicalId, mode };
}
