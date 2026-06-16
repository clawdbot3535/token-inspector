// Coverage engine — joins the per-component anatomy spec to a live TokenGraph and reports which
// theme slots a design has covered and which structural slots are still un-designed. Pure,
// read-only projection over the immutable graph (same contract as the renderers). Consumed by the
// coverage view (Step 3); no other consumer yet.

import { anatomyFor, getSlotMapping, type SlotClassification } from "@tg/grammar";
import type { TokenGraph } from "./token-graph.js";

export interface SlotCoverage {
  slot: string;
  classification: SlotClassification;
  controls: string;
  /** True iff at least one of the component's tokens routes to this slot. */
  touched: boolean;
  /** The component's token ids that route to this slot ([] when untouched). */
  tokenIds: readonly string[];
}

export interface ComponentCoverage {
  component: string;
  /** All anatomy slots in anatomy (NUXT_SLOTS) order. */
  slots: readonly SlotCoverage[];
  structuralTotal: number;
  structuralTouched: number;
  /** Missing slots (touched === false); structural first, then optional, anatomy order within each. */
  toDesign: readonly SlotCoverage[];
}

/** Overlay-context deltas (e.g. `button-overlay-dark-bg`) are a separate recipe, not base coverage.
 *  The bare `overlay` SLOT (e.g. `modal-overlay-bg`) is NOT matched here and stays in scope. */
const OVERLAY_CONTEXT = /-overlay-(dark|light)\b/;

/** Coverage for a curated component, or null if the component has no anatomy. */
export function coverageFor(graph: TokenGraph, component: string): ComponentCoverage | null {
  const anatomy = anatomyFor(component);
  if (!anatomy) return null;

  const tokensBySlot = new Map<string, string[]>();
  for (const node of graph.nodes.values()) {
    if (node.id.split("-")[0] !== component) continue;
    if (OVERLAY_CONTEXT.test(node.id)) continue;
    const slot = getSlotMapping(node.id, undefined, node.type)?.slot;
    if (!slot) continue;
    const arr = tokensBySlot.get(slot);
    if (arr) arr.push(node.id);
    else tokensBySlot.set(slot, [node.id]);
  }

  const slots: SlotCoverage[] = [...anatomy.entries()].map(([slot, a]) => ({
    slot,
    classification: a.classification,
    controls: a.controls,
    touched: tokensBySlot.has(slot),
    tokenIds: tokensBySlot.get(slot) ?? [],
  }));

  const structural = slots.filter((s) => s.classification === "structural");
  const toDesign = slots
    .filter((s) => !s.touched)
    .sort((a, b) => rank(a.classification) - rank(b.classification));

  return {
    component,
    slots,
    structuralTotal: structural.length,
    structuralTouched: structural.filter((s) => s.touched).length,
    toDesign,
  };
}

function rank(c: SlotClassification): number {
  return c === "structural" ? 0 : 1;
}
