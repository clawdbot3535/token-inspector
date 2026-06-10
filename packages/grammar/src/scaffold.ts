// Scaffold: generate a DTCG token tree from a Profile entry.
// Every emitted token ID maps via getSlotMapping with 0 unmapped — proven by tests.

import type { DtcgNode, DtcgTree } from "./dtcg.js";
import type { ComponentProfile, Profile } from "./profile.js";

/** Context passed to aliasResolver for each emitted token leaf. */
export interface AliasCtx {
  component: string;
  part: string | null;
  utility: string;
  state: string | null;
}

export interface ScaffoldOpts {
  /** Override which states to emit (default: component profile's states). */
  states?: string[];
  /** Override which sizes to emit (default: component profile's sizes). */
  sizes?: string[];
  /** Override which parts to emit (default: component profile's parts). */
  parts?: string[];
  /** Value strategy (currently "placeholder" or "alias-semantic"). */
  valueStrategy?: "placeholder" | "alias-semantic";
  /**
   * Called for every leaf when valueStrategy === "alias-semantic".
   * Return a DTCG token reference name (e.g. "color.bg.muted") to emit an alias,
   * or null/undefined to fall back to the placeholder value.
   */
  aliasResolver?: (ctx: AliasCtx) => string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_UTILITIES = new Set(["bg", "text-color", "border", "ring", "underline", "placeholder", "color"]);

function isColorUtility(utility: string): boolean {
  return COLOR_UTILITIES.has(utility);
}

function makeLeaf(utility: string, alias?: string | null): DtcgNode {
  if (isColorUtility(utility)) {
    return { $type: "color", $value: alias ? `{${alias}}` : "#000000" };
  }
  return { $type: "number", $value: alias ? `{${alias}}` : 0 };
}

/**
 * Place a leaf under `{ component: { restKey: leaf } }`, where restKey is every
 * ID segment after the component joined by "-". This two-level shape keeps the
 * component as the top group (so buildGraph assigns the component layer) while
 * every token is a flat sibling key — which avoids the "a node is both a leaf
 * AND a branch" collision (e.g. `bg` for `switch-bg` vs a parent of
 * `switch-bg-checked`) that an all-segments-nested tree would create, and the
 * shared-leaf cycle that came with it. Each leaf is fresh, so the tree is
 * acyclic and JSON-serializable. buildGraph still derives the same dash-joined
 * ID (`switch` + `bg-checked` → `switch-bg-checked`).
 */
function placeLeaf(tree: DtcgTree, segments: string[], leaf: DtcgNode): void {
  const component = segments[0]!;
  const restKey = segments.slice(1).join("-");
  const group: DtcgTree = (tree[component] as DtcgTree | undefined) ?? {};
  tree[component] = group;
  if (group[restKey] === undefined) group[restKey] = leaf;
}

// ── Core emitter ─────────────────────────────────────────────────────────────

/**
 * Emit token ID segments for a single (part, utilitySpec) pair.
 * Returns an array of segment-lists (each list = one token ID path in the DTCG tree).
 *
 * ID shape (matching buildGraph's slug derivation):
 *   base:         [component, utility]
 *   with part:    [component, part, utility]        — part = Nuxt slot name (sub-element routing)
 *   with variant: [component, variant, utility]
 *   with state:   [component, utility, state]
 *   combined:     [component, variant, utility, state]
 *   with size:    [component, utility, size]
 *
 * IMPORTANT: utility is treated as ONE segment (may contain dashes like "icon-size").
 * We never re-split utilities; they nest as single keys.
 */
type SegmentEmission = { segs: string[]; state: string | null };

function emitSegmentSets(
  component: string,
  part: string | null,
  spec: { utility: string; states?: boolean; sized?: boolean; variants?: boolean },
  profile: ComponentProfile,
  opts: Required<Pick<ScaffoldOpts, "states" | "sizes">>,
): SegmentEmission[] {
  const sets: SegmentEmission[] = [];
  const { utility } = spec;

  const partSeg: string[] = part ? [part] : [];

  // Helper: push a segment set with an optional state
  const push = (state: string | null, ...segs: string[]) => sets.push({ segs, state });

  // Base
  push(null, component, ...partSeg, utility);

  // Per variant (+ per state within variant)
  if (spec.variants && profile.variants.length > 0) {
    for (const v of profile.variants) {
      push(null, component, v, ...partSeg, utility);

      if (spec.states) {
        for (const s of opts.states) {
          push(s, component, v, ...partSeg, utility, s);
        }
      }
    }
  }

  // Per state (base, no variant)
  if (spec.states) {
    for (const s of opts.states) {
      push(s, component, ...partSeg, utility, s);
    }
  }

  // Per size
  if (spec.sized) {
    for (const sz of opts.sizes) {
      push(null, component, ...partSeg, utility, sz);
    }
  }

  return sets;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a DTCG token tree for `component` according to `profile`.
 *
 * Every emitted token ID (as produced by flattenDtcg) maps via getSlotMapping
 * with 0 unmapped — this invariant is enforced by scaffold.test.ts.
 */
export function scaffold(
  profile: Profile,
  component: string,
  opts?: ScaffoldOpts,
): DtcgTree {
  const compProfile = profile.components[component];
  if (!compProfile) {
    throw new Error(`scaffold: component "${component}" not found in profile "${profile.name}"`);
  }

  const effectiveStates = opts?.states ?? compProfile.states;
  const effectiveSizes = opts?.sizes ?? compProfile.sizes;
  const effectiveParts = opts?.parts ?? compProfile.parts;

  const tree: DtcgTree = {};

  for (const spec of compProfile.utilities) {
    // Which parts does this utility apply to?
    const specParts = spec.parts ?? (effectiveParts.length > 0 ? effectiveParts : [null as unknown as string]);
    const partsToUse: (string | null)[] = specParts.map((p) => p as string | null);

    for (const part of partsToUse) {
      const emissions = emitSegmentSets(
        component,
        part as string | null,
        spec,
        compProfile,
        { states: effectiveStates, sizes: effectiveSizes },
      );

      for (const { segs, state } of emissions) {
        const alias =
          opts?.valueStrategy === "alias-semantic"
            ? (opts.aliasResolver?.({ component, part: part as string | null, utility: spec.utility, state }) ?? null)
            : null;
        placeLeaf(tree, segs, makeLeaf(spec.utility, alias));
      }
    }
  }

  return tree;
}
