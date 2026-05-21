import { describe, it, expect } from "vitest";
import { heuristicSlotMapping, getSlotMapping } from "./slot-mapping.js";

describe("heuristicSlotMapping — button", () => {
  it("maps button-padding-x-sm to base/padding-x/size/sm", () => {
    expect(heuristicSlotMapping("button-padding-x-sm")).toEqual({
      slot: "base",
      utilityType: "padding-x",
      variantAxis: "size",
      variantKey: "sm",
    });
  });

  it("maps button-padding-y-lg correctly", () => {
    expect(heuristicSlotMapping("button-padding-y-lg")).toEqual({
      slot: "base",
      utilityType: "padding-y",
      variantAxis: "size",
      variantKey: "lg",
    });
  });

  it("maps button-radius to base/rounded with no variant", () => {
    expect(heuristicSlotMapping("button-radius")).toEqual({
      slot: "base",
      utilityType: "rounded",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps button-icon-size-md to leadingIcon/icon-size/size/md", () => {
    expect(heuristicSlotMapping("button-icon-size-md")).toEqual({
      slot: "leadingIcon",
      utilityType: "icon-size",
      variantAxis: "size",
      variantKey: "md",
    });
  });

  it("returns null for unmapped tokens", () => {
    expect(heuristicSlotMapping("button-mystery-token")).toBeNull();
  });

  it("returns null for non-component tokens", () => {
    expect(heuristicSlotMapping("color-blue-500")).toBeNull();
  });
});

describe("getSlotMapping — with overrides", () => {
  it("returns heuristic when no override exists", () => {
    const result = getSlotMapping("button-padding-x-sm", {});
    expect(result?.utilityType).toBe("padding-x");
  });

  it("respects override that adds a mapping for a non-heuristic token", () => {
    const override = {
      "button-shadow": {
        slot: "base" as const,
        utilityType: "rounded" as const,
        variantAxis: null,
        variantKey: null,
      },
    };
    const result = getSlotMapping("button-shadow", override);
    expect(result?.utilityType).toBe("rounded");
  });

  it("respects override that explicitly skips a token (null)", () => {
    const override = { "button-padding-x-sm": null };
    expect(getSlotMapping("button-padding-x-sm", override)).toBeNull();
  });

  it("falls back to heuristic when override does not contain the id", () => {
    const override = { "other-token": null };
    expect(getSlotMapping("button-padding-x-sm", override)?.utilityType).toBe(
      "padding-x",
    );
  });
});
