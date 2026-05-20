import { describe, it, expect } from "vitest";
import {
  normalizeToRem,
  matchSpacing,
  matchRadius,
  matchFontSize,
} from "./tailwind-defaults.js";

describe("normalizeToRem", () => {
  it("converts px to rem at default 16px base", () => {
    expect(normalizeToRem("4px")).toBe("0.25rem");
    expect(normalizeToRem("16px")).toBe("1rem");
    expect(normalizeToRem("0px")).toBe("0");
  });

  it("respects custom rem base", () => {
    expect(normalizeToRem("16px", 14)).toBe("1.142857rem");
  });

  it("passes rem values through unchanged", () => {
    expect(normalizeToRem("0.5rem")).toBe("0.5rem");
    expect(normalizeToRem("0rem")).toBe("0");
  });

  it("treats unitless 0 as the canonical zero", () => {
    expect(normalizeToRem("0")).toBe("0");
  });

  it("returns null for non-length values", () => {
    expect(normalizeToRem("auto")).toBeNull();
    expect(normalizeToRem("100%")).toBeNull();
  });
});

describe("matchSpacing", () => {
  it("matches Tailwind default px values", () => {
    expect(matchSpacing("4px")).toBe("1");
    expect(matchSpacing("16px")).toBe("4");
  });

  it("matches Tailwind default rem values", () => {
    expect(matchSpacing("0.25rem")).toBe("1");
  });

  it("returns null for custom values", () => {
    expect(matchSpacing("5px")).toBeNull();
    expect(matchSpacing("18px")).toBeNull();
  });
});

describe("matchRadius", () => {
  it("matches default keyword sizes", () => {
    // 0.375rem → md
    expect(matchRadius("0.375rem")).toBe("md");
    expect(matchRadius("6px")).toBe("md");
  });

  it("returns null for non-default radii", () => {
    expect(matchRadius("14px")).toBeNull();
  });
});

describe("matchFontSize", () => {
  it("matches base font sizes", () => {
    expect(matchFontSize("1rem")).toBe("base");
    expect(matchFontSize("0.875rem")).toBe("sm");
  });
});
