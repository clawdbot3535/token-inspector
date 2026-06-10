// Scaffold: generate a DTCG token tree from a Profile entry.
// Every emitted token ID maps via getSlotMapping with 0 unmapped — proven by tests.

import type { DtcgNode, DtcgTree } from "./dtcg.js";
import type { ComponentProfile, Profile } from "./profile.js";

export interface ScaffoldOpts {
  /** Override which states to emit (default: component profile's states). */
  states?: string[];
  /** Override which sizes to emit (default: component profile's sizes). */
  sizes?: string[];
  /** Override which parts to emit (default: component profile's parts). */
  parts?: string[];
  /** Value strategy (currently only "placeholder" is implemented). */
  valueStrategy?: "placeholder" | "alias-semantic";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_UTILITIES = new Set(["bg", "text-color", "border", "ring", "underline", "placeholder", "color"]);

function isColorUtility(utility: string): boolean {
  return COLOR_UTILITIES.has(utility);
}

function makeLeaf(utility: string): DtcgNode {
  if (isColorUtility(utility)) {
    return { $type: "color", $value: "#000000" };
  }
  return { $type: "number", $value: 0 };
}

/**
 * Set a value at `segments` path in the tree, creating intermediate nodes as needed.
 * The segments list must not be re-split — utilities like "icon-size" are one segment.
 */
function setPath(tree: DtcgTree, segments: string[], leaf: DtcgNode): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = tree;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (node[seg] === undefined) node[seg] = {};
    node = node[seg];
  }
  const last = segments[segments.length - 1]!;
  // Only set if not already occupied (avoid overwriting subtree with leaf)
  if (node[last] === undefined) {
    node[last] = leaf;
  }
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
function emitSegmentSets(
  component: string,
  part: string | null,
  spec: { utility: string; states?: boolean; sized?: boolean; variants?: boolean },
  profile: ComponentProfile,
  opts: Required<Pick<ScaffoldOpts, "states" | "sizes">>,
): string[][] {
  const sets: string[][] = [];
  const { utility } = spec;

  const partSeg: string[] = part ? [part] : [];

  // Helper: push a segment set
  const push = (...segs: string[]) => sets.push(segs);

  // Base
  push(component, ...partSeg, utility);

  // Per variant (+ per state within variant)
  if (spec.variants && profile.variants.length > 0) {
    for (const v of profile.variants) {
      push(component, v, ...partSeg, utility);

      if (spec.states) {
        for (const s of opts.states) {
          push(component, v, ...partSeg, utility, s);
        }
      }
    }
  }

  // Per state (base, no variant)
  if (spec.states) {
    for (const s of opts.states) {
      push(component, ...partSeg, utility, s);
    }
  }

  // Per size
  if (spec.sized) {
    for (const sz of opts.sizes) {
      push(component, ...partSeg, utility, sz);
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
      const segSets = emitSegmentSets(
        component,
        part as string | null,
        spec,
        compProfile,
        { states: effectiveStates, sizes: effectiveSizes },
      );

      const leaf = makeLeaf(spec.utility);
      for (const segs of segSets) {
        setPath(tree, segs, leaf);
      }
    }
  }

  return tree;
}
