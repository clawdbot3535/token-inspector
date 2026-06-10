import { describe, it, expect } from "vitest";
import { nuxtUiAliasResolver } from "./semantic-role.js";

describe("nuxtUiAliasResolver", () => {
  describe("bg utility", () => {
    it("returns color.bg.muted for base bg (no state)", () => {
      expect(nuxtUiAliasResolver({ component: "switch", part: null, utility: "bg", state: null }))
        .toBe("color.bg.muted");
    });

    it("returns color.action.bg for checked state", () => {
      expect(nuxtUiAliasResolver({ component: "switch", part: null, utility: "bg", state: "checked" }))
        .toBe("color.action.bg");
    });

    it("returns color.action.bg for active state", () => {
      expect(nuxtUiAliasResolver({ component: "button", part: null, utility: "bg", state: "active" }))
        .toBe("color.action.bg");
    });

    it("returns color.bg.disabled for disabled state", () => {
      expect(nuxtUiAliasResolver({ component: "switch", part: null, utility: "bg", state: "disabled" }))
        .toBe("color.bg.disabled");
    });
  });

  describe("border utility", () => {
    it("returns color.border.default", () => {
      expect(nuxtUiAliasResolver({ component: "input", part: null, utility: "border", state: null }))
        .toBe("color.border.default");
    });
  });

  describe("text-color utility", () => {
    it("returns color.text.default", () => {
      expect(nuxtUiAliasResolver({ component: "button", part: null, utility: "text-color", state: null }))
        .toBe("color.text.default");
    });
  });

  describe("ring utility", () => {
    it("returns color.border.focus", () => {
      expect(nuxtUiAliasResolver({ component: "input", part: null, utility: "ring", state: null }))
        .toBe("color.border.focus");
    });
  });

  describe("dimension utilities → null fallback", () => {
    it("returns null for size", () => {
      expect(nuxtUiAliasResolver({ component: "button", part: null, utility: "size", state: null }))
        .toBeNull();
    });

    it("returns null for radius", () => {
      expect(nuxtUiAliasResolver({ component: "button", part: null, utility: "radius", state: null }))
        .toBeNull();
    });

    it("returns null for width", () => {
      expect(nuxtUiAliasResolver({ component: "switch", part: null, utility: "width", state: null }))
        .toBeNull();
    });

    it("returns null for height", () => {
      expect(nuxtUiAliasResolver({ component: "switch", part: null, utility: "height", state: null }))
        .toBeNull();
    });

    it("returns null for padding", () => {
      expect(nuxtUiAliasResolver({ component: "button", part: null, utility: "padding", state: null }))
        .toBeNull();
    });

    it("returns null for gap", () => {
      expect(nuxtUiAliasResolver({ component: "button", part: null, utility: "gap", state: null }))
        .toBeNull();
    });
  });

  describe("unknown utilities → null fallback", () => {
    it("returns null for an unknown utility", () => {
      expect(nuxtUiAliasResolver({ component: "button", part: null, utility: "unknown-xyz", state: null }))
        .toBeNull();
    });

    it("returns null for shadow utility", () => {
      expect(nuxtUiAliasResolver({ component: "card", part: null, utility: "shadow", state: null }))
        .toBeNull();
    });
  });
});
