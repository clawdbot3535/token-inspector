import { describe, expect, it } from "vitest";
import { BUTTON_VARIANT_KEYS, COLOR_ROLE_KEYS, KNOWN_VARIANT_NAMES, SIZE_KEYS, STATE_KEYS } from "./component-vocab";

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
