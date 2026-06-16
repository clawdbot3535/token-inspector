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

// slot → parent it inherits styling from
const EXPECTED_INHERITED: Record<string, Record<string, string>> = {
  nav: { linkLabel: "link", childLinkLabel: "childLink" },
  accordion: { label: "trigger" },
  modal: {},
  table: {},
  dropdown: { itemLabel: "item" },
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

      it("has the locked inherited set with valid parents", () => {
        const anatomy = anatomyFor(comp)!;
        const inherited = [...anatomy.entries()]
          .filter(([, a]) => a.classification === "inherited")
          .map(([slot]) => slot);
        expect(new Set(inherited)).toEqual(new Set(Object.keys(EXPECTED_INHERITED[comp]!)));
        for (const [slot, parent] of Object.entries(EXPECTED_INHERITED[comp]!)) {
          const a = anatomy.get(slot)!;
          expect(a.inheritsFrom).toBe(parent);
          expect(nuxtSlotsFor(comp)!).toContain(parent); // parent is a real slot
        }
      });

      it("every slot: valid classification + non-empty controls (<=60 chars); inherited has a parent", () => {
        for (const [, a] of anatomyFor(comp)!) {
          expect(["structural", "optional", "inherited"]).toContain(a.classification);
          expect(a.controls.length).toBeGreaterThan(0);
          expect(a.controls.length).toBeLessThanOrEqual(60);
          if (a.classification === "inherited") expect(a.inheritsFrom).toBeTruthy();
          else expect(a.inheritsFrom).toBeUndefined();
        }
      });
    });
  }

  it("returns undefined for an uncurated component", () => {
    expect(anatomyFor("button")).toBeUndefined();
    expect(COMPONENT_ANATOMY.has("button")).toBe(false);
  });
});
