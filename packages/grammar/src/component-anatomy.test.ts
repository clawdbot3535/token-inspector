import { describe, it, expect } from "vitest";
import { anatomyFor, COMPONENT_ANATOMY } from "./component-anatomy.js";
import { nuxtSlotsFor } from "./component-vocab.js";

describe("component-anatomy — nav", () => {
  it("covers exactly the nav NUXT_SLOTS (no missing, no extra)", () => {
    const anatomy = anatomyFor("nav");
    expect(anatomy).toBeDefined();
    const slots = nuxtSlotsFor("nav")!;
    expect(new Set(anatomy!.keys())).toEqual(new Set(slots));
  });

  it("classifies exactly {root,list,item,link} as structural", () => {
    const anatomy = anatomyFor("nav")!;
    const structural = [...anatomy.entries()]
      .filter(([, a]) => a.classification === "structural")
      .map(([slot]) => slot);
    expect(new Set(structural)).toEqual(new Set(["root", "list", "item", "link"]));
  });

  it("every slot has a valid classification + a non-empty controls string (<=60 chars)", () => {
    for (const [, a] of anatomyFor("nav")!) {
      expect(["structural", "optional"]).toContain(a.classification);
      expect(a.controls.length).toBeGreaterThan(0);
      expect(a.controls.length).toBeLessThanOrEqual(60);
    }
  });

  it("returns undefined for an uncurated component", () => {
    expect(anatomyFor("button")).toBeUndefined();
    expect(COMPONENT_ANATOMY.has("button")).toBe(false);
  });
});
