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
    // modal-content-bg routes cleanly to the `content` slot.
    const cov = coverageFor(graphWith(["modal-content-bg"]), "modal")!;
    expect(cov).not.toBeNull();
    const content = cov.slots.find((s) => s.slot === "content")!;
    expect(content.touched).toBe(true);
    expect(content.classification).toBe("structural");
    expect(cov.structuralTouched).toBe(1);
    expect(cov.toDesign.some((s) => s.slot === "content")).toBe(false);
  });

  it("counts a nav-link-* token toward the link slot (grammar fix, end-to-end)", () => {
    // The nav `link` slot collides with the Nuxt `link` button-variant; the grammar fix
    // routes nav-link-* to the slot, so the engine must now mark `link` touched (and drop it
    // from the to-design list). This is the feature's flagship correctness claim.
    const cov = coverageFor(graphWith(["nav-link-bg"]), "nav")!;
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
