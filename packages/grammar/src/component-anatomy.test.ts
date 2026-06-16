import { describe, it, expect } from "vitest";
import { anatomyFor, COMPONENT_ANATOMY } from "./component-anatomy.js";
import { nuxtSlotsFor } from "./component-vocab.js";

// The locked structural set per composite (Must-Design principle, validated 2026-06-16).
// Everything else in each component's NUXT_SLOTS is optional.
const EXPECTED_STRUCTURAL: Record<string, string[]> = {
  nav: ["link"],
  accordion: ["item", "trigger", "body"],
  modal: ["overlay", "content", "body", "title"],
  table: ["th", "td"],
  dropdown: ["content", "item"],
};

describe("component-anatomy", () => {
  it("curates exactly the five composites", () => {
    expect(new Set(COMPONENT_ANATOMY.keys())).toEqual(new Set(Object.keys(EXPECTED_STRUCTURAL)));
  });

  for (const comp of Object.keys(EXPECTED_STRUCTURAL)) {
    describe(comp, () => {
      it("covers exactly its NUXT_SLOTS (100%, no missing/extra)", () => {
        const anatomy = anatomyFor(comp);
        expect(anatomy).toBeDefined();
        expect(new Set(anatomy!.keys())).toEqual(new Set(nuxtSlotsFor(comp)!));
      });

      it("has the locked structural set", () => {
        const structural = [...anatomyFor(comp)!.entries()]
          .filter(([, a]) => a.classification === "structural")
          .map(([slot]) => slot);
        expect(new Set(structural)).toEqual(new Set(EXPECTED_STRUCTURAL[comp]));
      });

      it("every slot: valid classification + non-empty controls (<=60 chars)", () => {
        for (const [, a] of anatomyFor(comp)!) {
          expect(["structural", "optional"]).toContain(a.classification);
          expect(a.controls.length).toBeGreaterThan(0);
          expect(a.controls.length).toBeLessThanOrEqual(60);
        }
      });
    });
  }

  it("returns undefined for an uncurated component", () => {
    expect(anatomyFor("button")).toBeUndefined();
    expect(COMPONENT_ANATOMY.has("button")).toBe(false);
  });
});
