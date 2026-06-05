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
});
