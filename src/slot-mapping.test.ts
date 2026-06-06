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

  it("maps button-outline-border to ring-color on the outline variant (D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "variant",
      variantKey: "outline",
    });
  });

  it("maps button-outline-border-disabled to ring-color with disabled prefix (D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border-disabled")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "variant",
      variantKey: "outline",
      statePrefix: "disabled",
    });
  });

  it("keeps button-solid-border as border-color (solid is not ring-framed)", () => {
    expect(heuristicSlotMapping("button-solid-border")).toEqual({
      slot: "base",
      utilityType: "border-color",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("maps button-outline-border-hover to ring-color with hover prefix (D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border-hover")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "variant",
      variantKey: "outline",
      statePrefix: "hover",
    });
  });

  it("maps button-subtle-border to ring-color on the subtle variant (D2c forward-compat)", () => {
    expect(heuristicSlotMapping("button-subtle-border")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: "variant",
      variantKey: "subtle",
    });
  });

  it("maps button-outline-border-width to ring-width on the outline variant (D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border-width")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: "variant",
      variantKey: "outline",
    });
  });

  it("maps an unframed-variant border-width to the border-width utility", () => {
    expect(heuristicSlotMapping("button-solid-border-width")).toEqual({
      slot: "base",
      utilityType: "border-width",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("maps a component-level border-width (no variant) to border-width", () => {
    expect(heuristicSlotMapping("table-border-width")).toEqual({
      slot: "base",
      utilityType: "border-width",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps component-level button-border-width to ring-width on base (D2e resting)", () => {
    expect(heuristicSlotMapping("button-border-width")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps button-ring-width to ring-width with a forced focus prefix (D2e)", () => {
    expect(heuristicSlotMapping("button-ring-width")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
      statePrefix: "focus",
    });
  });

  it("maps input-border-width to ring-width on base (input is ring-framed)", () => {
    expect(heuristicSlotMapping("input-border-width", "number")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps input-ring-width to focus ring-width", () => {
    expect(heuristicSlotMapping("input-ring-width", "number")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
      statePrefix: "focus",
    });
  });

  it("keeps a non-framed component border-width as CSS border-width (table)", () => {
    expect(heuristicSlotMapping("table-border-width")).toEqual({
      slot: "base",
      utilityType: "border-width",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps button-outline-border-width to ring-width via the framed-variant path (D2e/D2c)", () => {
    expect(heuristicSlotMapping("button-outline-border-width")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: "variant",
      variantKey: "outline",
    });
  });

  it("lets an explicit state suffix win over the forced focus on ring-width", () => {
    expect(heuristicSlotMapping("button-ring-width-hover")).toEqual({
      slot: "base",
      utilityType: "ring-width",
      variantAxis: null,
      variantKey: null,
      statePrefix: "hover",
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

  it("emits a state suffix without a variant axis as a base pseudo-class prefix", () => {
    // `button-rounded-focus` has no variant/size/color context, so the state
    // becomes a `focus:` prefix on base (→ `focus:rounded-md`), NOT a dead
    // `variants.state` axis that Nuxt UI v4 has no prop for.
    expect(heuristicSlotMapping("button-rounded-focus")).toEqual({
      slot: "base",
      utilityType: "rounded",
      variantAxis: null,
      variantKey: null,
      statePrefix: "focus",
    });
  });

  it("treats a bare `default` state as the base look (no prefix, no axis)", () => {
    expect(heuristicSlotMapping("button-rounded-default")).toEqual({
      slot: "base",
      utilityType: "rounded",
      variantAxis: null,
      variantKey: null,
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
  it("recognizes checked as a state, emitting a base `checked:` prefix when no variant", () => {
    expect(heuristicSlotMapping("checkbox-bg-checked")).toEqual({
      slot: "base", utilityType: "bg-color", variantAxis: null, variantKey: null, statePrefix: "checked",
    });
  });
  it("normalizes hovered to a hover state prefix under a variant", () => {
    expect(heuristicSlotMapping("button-solid-bg-hovered")).toEqual({
      slot: "base", utilityType: "bg-color", variantAxis: "variant", variantKey: "solid", statePrefix: "hover",
    });
  });
});

describe("sub-element slot extension point (B seam)", () => {
  it("routes nav-item-bg to the item slot via exact-match fallback", () => {
    // nav is inventoried in NUXT_SLOTS; "item" is an exact slot name → routes.
    expect(heuristicSlotMapping("nav-item-bg")?.slot).toBe("item");
  });
  it("routes switch-thumb-border to the thumb slot (switch inventoried)", () => {
    expect(heuristicSlotMapping("switch-thumb-border")?.slot).toBe("thumb");
  });
});

describe("heuristicSlotMapping — text disambiguation by value type", () => {
  it("maps a color-typed bare text token to text-color (no variant axis)", () => {
    expect(heuristicSlotMapping("input-text", "color")).toEqual({
      slot: "base",
      utilityType: "text-color",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps a number-typed font-size token to text-size", () => {
    expect(heuristicSlotMapping("input-font-size", "number")).toEqual({
      slot: "base",
      utilityType: "text-size",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("treats a bare 'text' token as text-size when value type is not color", () => {
    expect(heuristicSlotMapping("input-text", "number")).toEqual({
      slot: "base",
      utilityType: "text-size",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("forwards value type through getSlotMapping", () => {
    expect(getSlotMapping("input-text", undefined, "color")?.utilityType).toBe("text-color");
    expect(getSlotMapping("input-text", undefined, "number")?.utilityType).toBe("text-size");
  });

  it("keeps the variant-axis text-color path intact regardless of value type", () => {
    const expected = heuristicSlotMapping("button-solid-text-default"); // baseline (no valueType)
    expect(expected?.utilityType).toBe("text-color");
    // passing a non-color valueType must NOT downgrade the variant path
    expect(heuristicSlotMapping("button-solid-text-default", "number")).toEqual(expected);
    expect(heuristicSlotMapping("button-solid-text-default", "color")).toEqual(expected);
  });
});

describe("heuristicSlotMapping — new utility types (Task 4)", () => {
  it("maps button-height-sm to base/height/size/sm", () => {
    expect(heuristicSlotMapping("button-height-sm")).toEqual({
      slot: "base",
      utilityType: "height",
      variantAxis: "size",
      variantKey: "sm",
    });
  });

  it("maps button-width to base/width with no variant", () => {
    expect(heuristicSlotMapping("button-width")).toEqual({
      slot: "base",
      utilityType: "width",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps button-line-height-md to base/line-height/size/md", () => {
    expect(heuristicSlotMapping("button-line-height-md")).toEqual({
      slot: "base",
      utilityType: "line-height",
      variantAxis: "size",
      variantKey: "md",
    });
  });

  it("maps button-leading-sm to base/line-height/size/sm (alias)", () => {
    expect(heuristicSlotMapping("button-leading-sm")).toEqual({
      slot: "base",
      utilityType: "line-height",
      variantAxis: "size",
      variantKey: "sm",
    });
  });

  it("maps button-letter-spacing-md to base/letter-spacing/size/md", () => {
    expect(heuristicSlotMapping("button-letter-spacing-md")).toEqual({
      slot: "base",
      utilityType: "letter-spacing",
      variantAxis: "size",
      variantKey: "md",
    });
  });

  it("maps button-tracking-sm to base/letter-spacing/size/sm (alias)", () => {
    expect(heuristicSlotMapping("button-tracking-sm")).toEqual({
      slot: "base",
      utilityType: "letter-spacing",
      variantAxis: "size",
      variantKey: "sm",
    });
  });

  it("maps button-solid-placeholder to base/placeholder-color/variant/solid", () => {
    expect(heuristicSlotMapping("button-solid-placeholder")).toEqual({
      slot: "base",
      utilityType: "placeholder-color",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("maps button-solid-ring-offset-focus to base/ring-offset/variant/solid with focus prefix", () => {
    expect(heuristicSlotMapping("button-solid-ring-offset-focus")).toEqual({
      slot: "base",
      utilityType: "ring-offset",
      variantAxis: "variant",
      variantKey: "solid",
      statePrefix: "focus",
    });
  });

  it("maps button-font-family to base/font-family with no variant", () => {
    expect(heuristicSlotMapping("button-font-family")).toEqual({
      slot: "base",
      utilityType: "font-family",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps button-padding-sm to base/padding/size/sm", () => {
    expect(heuristicSlotMapping("button-padding-sm")).toEqual({
      slot: "base",
      utilityType: "padding",
      variantAxis: "size",
      variantKey: "sm",
    });
  });

  it("maps button-solid-overlay-bg to base/overlay-bg/variant/solid", () => {
    expect(heuristicSlotMapping("button-solid-overlay-bg")).toEqual({
      slot: "base",
      utilityType: "overlay-bg",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });

  it("maps button-solid-overlay to base/overlay-bg/variant/solid (alias)", () => {
    expect(heuristicSlotMapping("button-solid-overlay")).toEqual({
      slot: "base",
      utilityType: "overlay-bg",
      variantAxis: "variant",
      variantKey: "solid",
    });
  });
});

describe("heuristicSlotMapping — border→ring for ring-framed components", () => {
  it("maps input-border to ring-color", () => {
    expect(heuristicSlotMapping("input-border")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
    });
  });

  it("maps input-border-hover to ring-color with a hover prefix", () => {
    expect(heuristicSlotMapping("input-border-hover")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
      statePrefix: "hover",
    });
  });

  it("maps checkbox-border-checked to ring-color with a checked prefix", () => {
    expect(heuristicSlotMapping("checkbox-border-checked")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
      statePrefix: "checked",
    });
  });

  it("keeps table-border as border-color (genuine CSS border, not remapped)", () => {
    expect(heuristicSlotMapping("table-border")).toEqual({
      slot: "base", utilityType: "border-color", variantAxis: null, variantKey: null,
    });
  });

  it("keeps button-solid-border as border-color (deferred to D2b)", () => {
    expect(heuristicSlotMapping("button-solid-border")).toEqual({
      slot: "base", utilityType: "border-color", variantAxis: "variant", variantKey: "solid",
    });
  });

  it("maps modal-border to ring-color (panel frame is a ring)", () => {
    expect(heuristicSlotMapping("modal-border")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
    });
  });

  it("leaves input-border-error null (parses to utility 'border-error', matches no rule; intercept needs exactly 'border')", () => {
    expect(heuristicSlotMapping("input-border-error")).toBeNull();
  });

  it("maps card-border to ring-color (card frame is a ring)", () => {
    expect(heuristicSlotMapping("card-border")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
    });
  });

  it("maps chip-border to ring-color (chip halo is a ring)", () => {
    expect(heuristicSlotMapping("chip-border")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
    });
  });

  it("maps chip-border-active to ring-color with an active prefix", () => {
    expect(heuristicSlotMapping("chip-border-active")).toEqual({
      slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null,
      statePrefix: "active",
    });
  });

  it("keeps switch-border as border-color (sizing border, excluded)", () => {
    expect(heuristicSlotMapping("switch-border")).toEqual({
      slot: "base", utilityType: "border-color", variantAxis: null, variantKey: null,
    });
  });

  it("leaves chip-border-error null (trailing color-role, unchanged)", () => {
    expect(heuristicSlotMapping("chip-border-error")).toBeNull();
  });
});

describe("heuristicSlotMapping — prop-driven states (capability)", () => {
  it("drops input-border-active (Nuxt applies `active` via the highlight prop)", () => {
    expect(heuristicSlotMapping("input-border-active", "color")).toBeNull();
  });
  it("drops textarea-border-active (Nuxt applies `active` via the highlight prop)", () => {
    expect(heuristicSlotMapping("textarea-border-active", "color")).toBeNull();
  });
  it("keeps input-border-focus mapping (focus is a real pseudo-class)", () => {
    expect(heuristicSlotMapping("input-border-focus", "color")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: null,
      variantKey: null,
      statePrefix: "focus",
    });
  });
  it("keeps button-solid-bg-active (`:active` is valid for button)", () => {
    expect(heuristicSlotMapping("button-solid-bg-active")).toEqual({
      slot: "base",
      utilityType: "bg-color",
      variantAxis: "variant",
      variantKey: "solid",
      statePrefix: "active",
    });
  });
  it("does not drop a state-less input token (null-state guard)", () => {
    expect(heuristicSlotMapping("input-border", "color")).toEqual({
      slot: "base",
      utilityType: "ring-color",
      variantAxis: null,
      variantKey: null,
    });
  });
});

describe("sub-element slot routing (exact-match NUXT_SLOTS, fallback)", () => {
  it("routes dropdown-item-* to the item slot", () => {
    const m = heuristicSlotMapping("dropdown-item-bg");
    expect(m?.slot).toBe("item");
  });
  it("routes table-th-* to the th slot", () => {
    expect(heuristicSlotMapping("table-th-bg")?.slot).toBe("th");
  });
  it("routes nav-item-* to the item slot", () => {
    expect(heuristicSlotMapping("nav-item-bg")?.slot).toBe("item");
  });
  it("does NOT regress icon-size (stays leadingIcon, even when the component has an icon slot)", () => {
    expect(heuristicSlotMapping("button-icon-size-md")?.slot).toBe("leadingIcon");
    expect(heuristicSlotMapping("checkbox-icon-size-md")?.slot).toBe("leadingIcon");
  });
  it("does NOT route a naming-mismatch part (checkbox-check stays unrouted)", () => {
    // "check" is not an exact checkbox slot (Nuxt uses "icon") → unsupported-part flags it elsewhere.
    expect(heuristicSlotMapping("checkbox-check-color")?.slot).not.toBe("check");
  });
  it("does not route for a component with no NUXT_SLOTS entry", () => {
    const m = heuristicSlotMapping("widget-item-padding-x");
    // no inventory → "item" cannot be a known slot → either null or slot 'base', never 'item'.
    expect(m?.slot).not.toBe("item");
  });
});
