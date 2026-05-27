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

describe("heuristicSlotMapping — variant axis (solid/outline/ghost/link)", () => {
  it("maps button-solid-bg to variants.variant.solid base bg-color", () => {
    expect(heuristicSlotMapping("button-solid-bg")).toEqual({
      slot: "base",
      utilityType: "bg-color",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("maps button-solid-bg-hover with hover pseudo-class prefix", () => {
    expect(heuristicSlotMapping("button-solid-bg-hover")).toEqual({
      slot: "base",
      utilityType: "bg-color",
      variantAxis: "variant",
      variantKey: "solid",
      statePrefix: "hover",
    });
  });

  it("treats -default state as no pseudo-class prefix", () => {
    expect(heuristicSlotMapping("button-solid-text-default")).toEqual({
      slot: "base",
      utilityType: "text-color",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("maps button-outline-border to border-color on the outline variant", () => {
    expect(heuristicSlotMapping("button-outline-border")).toEqual({
      slot: "base",
      utilityType: "border-color",
      variantAxis: "variant",
      variantKey: "outline",
    });
  });

  it("maps button-outline-border-disabled with disabled prefix", () => {
    expect(heuristicSlotMapping("button-outline-border-disabled")).toEqual({
      slot: "base",
      utilityType: "border-color",
      variantAxis: "variant",
      variantKey: "outline",
      statePrefix: "disabled",
    });
  });

  it("maps button-ghost-text-active", () => {
    expect(heuristicSlotMapping("button-ghost-text-active")).toEqual({
      slot: "base",
      utilityType: "text-color",
      variantAxis: "variant",
      variantKey: "ghost",
      statePrefix: "active",
    });
  });

  it("maps button-solid-ring-focus to ring-color with focus prefix", () => {
    expect(heuristicSlotMapping("button-solid-ring-focus")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "variant",
      variantKey: "solid",
      statePrefix: "focus",
    });
  });

  it("maps button-link-underline-hover", () => {
    expect(heuristicSlotMapping("button-link-underline-hover")).toEqual({
      slot: "base",
      utilityType: "underline-color",
      variantAxis: "variant",
      variantKey: "link",
      statePrefix: "hover",
    });
  });

  it("treats text as text-color when a variant axis is present", () => {
    expect(heuristicSlotMapping("button-solid-text")).toEqual({
      slot: "base",
      utilityType: "text-color",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("preserves text-size mapping when no variant axis is present", () => {
    expect(heuristicSlotMapping("button-text-sm")).toEqual({
      slot: "base",
      utilityType: "text-size",
      variantAxis: "size",
      variantKey: "sm",
    });
  });

  it("preserves back-compat: state-only bucketing when no variant axis", () => {
    expect(heuristicSlotMapping("button-rounded-focus")).toEqual({
      slot: "base",
      utilityType: "rounded",
      variantAxis: "state",
      variantKey: "focus",
    });
  });

  it("does not over-consume: button-solid (no utility segments) returns null", () => {
    expect(heuristicSlotMapping("button-solid")).toBeNull();
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

describe("color-role variant axis (prefix position)", () => {
  it("maps badge-default-bg to bg-color on the color axis", () => {
    expect(heuristicSlotMapping("badge-default-bg")).toEqual({
      slot: "base", utilityType: "bg-color", variantAxis: "color", variantKey: "default",
    });
  });
  it("maps badge-accent-text to text-color on the color axis", () => {
    expect(heuristicSlotMapping("badge-accent-text")).toEqual({
      slot: "base", utilityType: "text-color", variantAxis: "color", variantKey: "accent",
    });
  });
  it("maps badge-error-border to border-color on the color axis", () => {
    expect(heuristicSlotMapping("badge-error-border")).toEqual({
      slot: "base", utilityType: "border-color", variantAxis: "color", variantKey: "error",
    });
  });
  it("leaves a trailing color-role (chip-bg-error) unmapped — Figma-fix, not heuristic", () => {
    expect(heuristicSlotMapping("chip-bg-error")).toBeNull();
  });
});

describe("extra state keys", () => {
  it("recognizes checked as a state, bucketing by state when no variant", () => {
    expect(heuristicSlotMapping("checkbox-bg-checked")).toEqual({
      slot: "base", utilityType: "bg-color", variantAxis: "state", variantKey: "checked",
    });
  });
  it("normalizes hovered to a hover state prefix under a variant", () => {
    expect(heuristicSlotMapping("button-solid-bg-hovered")).toEqual({
      slot: "base", utilityType: "bg-color", variantAxis: "variant", variantKey: "solid", statePrefix: "hover",
    });
  });
});

describe("sub-element slot extension point (B seam, empty in v0.4.0)", () => {
  it("does not yet recognize sub-element prefixes (item-* stays base/null)", () => {
    // nav-item-bg currently parses utility "item-bg" → no rule → null.
    // When v0.5.0 fills SLOT_PREFIXES, this expectation changes.
    expect(heuristicSlotMapping("nav-item-bg")).toBeNull();
  });
});
