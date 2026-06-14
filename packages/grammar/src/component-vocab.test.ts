import { describe, expect, it } from "vitest";
import {
  BUTTON_VARIANT_KEYS,
  COLOR_ROLE_KEYS,
  KNOWN_VARIANT_NAMES,
  SIZE_KEYS,
  STATE_KEYS,
  RING_FRAMED_VARIANTS,
  isRingFramedVariant,
  PROP_DRIVEN_STATES,
  propDrivenStateFor,
  NUXT_SLOTS,
  nuxtSlotsFor,
  NON_PART_SEGMENTS,
  NON_COMPONENT_PREFIXES,
  KNOWN_CUSTOM_COMPONENTS,
  FIGMA_NUXT_PART_ALIAS,
  SLOT_PAIRS,
} from "./component-vocab";

describe("component-vocab", () => {
  it("button variants and color roles are disjoint", () => {
    for (const k of BUTTON_VARIANT_KEYS) expect(COLOR_ROLE_KEYS.has(k)).toBe(false);
  });
  it("KNOWN_VARIANT_NAMES is the union of button variants and color roles", () => {
    for (const k of BUTTON_VARIANT_KEYS) expect(KNOWN_VARIANT_NAMES.has(k)).toBe(true);
    for (const k of COLOR_ROLE_KEYS) expect(KNOWN_VARIANT_NAMES.has(k)).toBe(true);
  });
  it("state keys include real states plus checked/hovered", () => {
    for (const k of ["default", "hover", "active", "disabled", "focus", "checked", "hovered"]) {
      expect(STATE_KEYS.has(k)).toBe(true);
    }
  });
  it("size keys cover the Tailwind scale", () => {
    for (const k of ["xs", "sm", "md", "lg", "xl", "2xl"]) expect(SIZE_KEYS.has(k)).toBe(true);
  });
});

describe("RING_FRAMED_VARIANTS / isRingFramedVariant", () => {
  it("marks button outline and subtle as ring-framed", () => {
    expect(isRingFramedVariant("button", "outline")).toBe(true);
    expect(isRingFramedVariant("button", "subtle")).toBe(true);
  });
  it("does not mark solid/ghost/link as ring-framed", () => {
    expect(isRingFramedVariant("button", "solid")).toBe(false);
    expect(isRingFramedVariant("button", "ghost")).toBe(false);
    expect(isRingFramedVariant("button", "link")).toBe(false);
  });
  it("returns false for a null variant or an unknown component", () => {
    expect(isRingFramedVariant("button", null)).toBe(false);
    expect(isRingFramedVariant("input", "outline")).toBe(false);
  });
  it("framed variant keys are a subset of BUTTON_VARIANT_KEYS", () => {
    for (const v of RING_FRAMED_VARIANTS.get("button") ?? []) {
      expect(BUTTON_VARIANT_KEYS.has(v)).toBe(true);
    }
  });
});

describe("PROP_DRIVEN_STATES / propDrivenStateFor", () => {
  it("marks input `active` as driven by the highlight prop", () => {
    expect(propDrivenStateFor("input", "active")).toBe("highlight");
  });
  it("does not mark `active` as prop-driven for button (valid :active there)", () => {
    expect(propDrivenStateFor("button", "active")).toBeNull();
  });
  it("returns null for a null state, a real pseudo-class state, and unknown components", () => {
    expect(propDrivenStateFor("input", null)).toBeNull();
    expect(propDrivenStateFor("input", "focus")).toBeNull();
    expect(propDrivenStateFor("table", "active")).toBeNull();
  });
  it("marks textarea `active` as driven by the highlight prop (input's twin)", () => {
    expect(propDrivenStateFor("textarea", "active")).toBe("highlight");
  });
});

describe("NUXT_SLOTS / nuxtSlotsFor", () => {
  it("inventories switch and radio slots", () => {
    expect(nuxtSlotsFor("switch")?.has("thumb")).toBe(true);
    expect(nuxtSlotsFor("radio")?.has("indicator")).toBe(true);
  });
  it("aliases the radio dot to the Nuxt indicator slot", () => {
    expect(FIGMA_NUXT_PART_ALIAS.get("dot")).toBe("indicator");
  });
  it("knows chip has only root/base (no label/close)", () => {
    const chip = nuxtSlotsFor("chip");
    expect(chip?.has("base")).toBe(true);
    expect(chip?.has("label")).toBe(false);
    expect(chip?.has("close")).toBe(false);
  });
  it("knows the sub-element slots that exist (dropdown item, table th, nav item)", () => {
    expect(nuxtSlotsFor("dropdown")?.has("item")).toBe(true);
    expect(nuxtSlotsFor("table")?.has("th")).toBe(true);
    expect(nuxtSlotsFor("nav")?.has("item")).toBe(true);
  });
  it("returns undefined for an uninventoried component", () => {
    expect(nuxtSlotsFor("typography")).toBeUndefined();
  });
  it("every inventoried component has a non-empty slot set", () => {
    for (const [, slots] of NUXT_SLOTS) {
      expect(slots.size).toBeGreaterThan(0);
    }
  });
});

describe("NON_PART_SEGMENTS / FIGMA_NUXT_PART_ALIAS", () => {
  it("treats utility/state/dimension words as non-parts", () => {
    for (const w of ["size", "min", "resize", "ring", "letter", "checked", "focus", "bg"]) {
      expect(NON_PART_SEGMENTS.has(w)).toBe(true);
    }
  });
  it("does not list genuine part nouns as non-parts", () => {
    for (const p of ["label", "close", "row", "divider", "check", "item", "icon"]) {
      expect(NON_PART_SEGMENTS.has(p)).toBe(false);
    }
  });
  it("treats `overlay` as a non-part structuring segment", () => {
    expect(NON_PART_SEGMENTS.has("overlay")).toBe(true);
  });
  it("aliases Figma part names to Nuxt slot names", () => {
    expect(FIGMA_NUXT_PART_ALIAS.get("row")).toBe("tr");
    expect(FIGMA_NUXT_PART_ALIAS.get("divider")).toBe("separator");
    expect(FIGMA_NUXT_PART_ALIAS.get("check")).toBe("icon");
  });
});

describe("SLOT_PAIRS", () => {
  it("pairs leadingIcon with trailingIcon", () => {
    expect(SLOT_PAIRS.some(([a, b]) => a === "leadingIcon" && b === "trailingIcon")).toBe(true);
  });
  it("every pair is two distinct non-empty slot names", () => {
    for (const [a, b] of SLOT_PAIRS) {
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
      expect(a).not.toBe(b);
    }
  });
});

describe("nuxtSlotsFor — accordion", () => {
  it("returns the Nuxt UI v4 Accordion theme slots", () => {
    const slots = nuxtSlotsFor("accordion");
    expect(slots).toBeDefined();
    for (const s of ["root", "item", "header", "trigger", "content", "body", "leadingIcon", "trailingIcon", "label"]) {
      expect(slots!.has(s)).toBe(true);
    }
  });
});

describe("NON_COMPONENT_PREFIXES", () => {
  it("lists the layout / type-scale primitive prefixes", () => {
    for (const p of ["typography", "container", "page", "grid", "stack", "section"]) {
      expect(NON_COMPONENT_PREFIXES.has(p)).toBe(true);
    }
  });
  it("does not list a real Nuxt component", () => {
    expect(NON_COMPONENT_PREFIXES.has("button")).toBe(false);
    expect(NON_COMPONENT_PREFIXES.has("sidebar")).toBe(false);
  });
});

describe("KNOWN_CUSTOM_COMPONENTS", () => {
  it("maps sidebar to its routable sub-element slots", () => {
    expect(KNOWN_CUSTOM_COMPONENTS.get("sidebar")).toEqual(["item"]);
  });
  it("does not list a real Nuxt component", () => {
    expect(KNOWN_CUSTOM_COMPONENTS.has("button")).toBe(false);
  });
});
