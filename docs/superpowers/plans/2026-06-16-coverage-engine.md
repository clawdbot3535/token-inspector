# Coverage Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A pure `coverageFor(graph, component)` that joins the anatomy spec to a live TokenGraph and reports per-slot touched/missing + a structural-first to-design list.

**Architecture:** New core module `src/coverage.ts`. Read-only projection over the immutable `TokenGraph`, consuming `anatomyFor` + `getSlotMapping` from `@tg/grammar`. No mutation, no I/O. No consumer yet (Step 3 wires the view).

**Tech Stack:** TypeScript, Vitest, `buildGraph` fixtures, `@tg/grammar`.

---

### Task 1: The coverage engine

**Files:**
- Create: `src/coverage.ts`
- Test: `src/coverage.test.ts`

- [ ] **Step 1: Write the failing test** (`src/coverage.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { buildGraph } from "./build-graph.js";
import { coverageFor } from "./coverage.js";
import type { SourceFile } from "./token-graph.js";

// One global layer carrying component tokens as colors. getSlotMapping routes by id+type,
// not by value validity, so a bare-hex value is fine for touched-detection.
function graphWith(ids: string[]) {
  const tree: Record<string, unknown> = {};
  for (const id of ids) {
    const segs = id.split("-");
    let cur = tree;
    segs.forEach((seg, i) => {
      if (i === segs.length - 1) cur[seg] = { $value: "#abcdef", $type: "color" };
      else cur = (cur[seg] ??= {}) as Record<string, unknown>;
    });
  }
  const sources: SourceFile[] = [{ name: "global", data: tree }];
  return buildGraph(sources);
}

describe("coverageFor", () => {
  it("returns null for an uncurated component", () => {
    expect(coverageFor(graphWith(["button-solid-bg"]), "button")).toBeNull();
  });

  it("marks a structural slot touched when a token routes to it", () => {
    const cov = coverageFor(graphWith(["nav-link-bg"]), "nav")!;
    expect(cov).not.toBeNull();
    const link = cov.slots.find((s) => s.slot === "link")!;
    expect(link.touched).toBe(true);
    expect(link.classification).toBe("structural");
    expect(cov.structuralTouched).toBe(1);
    expect(cov.toDesign.some((s) => s.slot === "link")).toBe(false);
  });

  it("reports a missing structural slot and sorts it first in toDesign", () => {
    const cov = coverageFor(graphWith(["nav-item-bg"]), "nav")!;
    expect(cov.slots.find((s) => s.slot === "link")!.touched).toBe(false);
    expect(cov.slots.find((s) => s.slot === "item")!.touched).toBe(true); // item is optional
    expect(cov.structuralTouched).toBe(0);
    expect(cov.toDesign[0].slot).toBe("link"); // structural before optional
    expect(cov.toDesign[0].classification).toBe("structural");
    // every optional-missing entry sorts after the last structural-missing
    const firstOptional = cov.toDesign.findIndex((s) => s.classification === "optional");
    const lastStructural = cov.toDesign.map((s) => s.classification).lastIndexOf("structural");
    expect(lastStructural).toBeLessThan(firstOptional);
  });

  it("counts the modal-overlay-bg token toward the overlay SLOT (not excluded)", () => {
    const cov = coverageFor(graphWith(["modal-overlay-bg"]), "modal")!;
    expect(cov.slots.find((s) => s.slot === "overlay")!.touched).toBe(true);
  });

  it("excludes overlay-context variants from coverage", () => {
    // The only nav-link token is an overlay-context delta → link stays missing.
    const cov = coverageFor(graphWith(["nav-link-overlay-dark-bg"]), "nav")!;
    expect(cov.slots.find((s) => s.slot === "link")!.touched).toBe(false);
  });

  it("covers 100% of the anatomy in slots", () => {
    const cov = coverageFor(graphWith(["modal-content-bg"]), "modal")!;
    const slotNames = new Set(cov.slots.map((s) => s.slot));
    // modal has 9 anatomy slots
    expect(cov.slots.length).toBe(9);
    expect(slotNames.has("overlay")).toBe(true);
    expect(slotNames.has("title")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx vitest run src/coverage.test.ts`
Expected: FAIL — `coverage.js` module not found.

- [ ] **Step 3: Implement `src/coverage.ts`**

```ts
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

  const touched = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.id.split("-")[0] !== component) continue;
    if (OVERLAY_CONTEXT.test(node.id)) continue;
    const slot = getSlotMapping(node.id, undefined, node.type)?.slot;
    if (slot) touched.add(slot);
  }

  const slots: SlotCoverage[] = [...anatomy.entries()].map(([slot, a]) => ({
    slot,
    classification: a.classification,
    controls: a.controls,
    touched: touched.has(slot),
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
```

Note: `Array.prototype.sort` is stable in modern V8/Node, so equal-rank entries keep anatomy order.

- [ ] **Step 4: Run the test; verify it passes**

Run: `npx vitest run src/coverage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test` (or rely on the pre-commit gate)
Expected: all green (795 + 6 = 801).

- [ ] **Step 6: Commit**

```bash
git add src/coverage.ts src/coverage.test.ts
git commit -m "feat(coverage): coverage engine — anatomy vs live graph, structural-first to-design list"
```

## Self-review checks
- Spec coverage: every spec test intent has a Step-1 test. ✓
- No placeholders. ✓
- Type consistency: `SlotCoverage`/`ComponentCoverage`/`coverageFor` names match the spec. ✓
