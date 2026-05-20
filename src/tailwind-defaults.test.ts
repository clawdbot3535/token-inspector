import { describe, it, expect } from "vitest";
import {
  normalizeToRem,
  matchSpacing,
  matchRadius,
  matchFontSize,
  matchTracking,
  matchLeading,
  matchBorderWidth,
  matchFontWeight,
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

describe("matchTracking", () => {
  it("matches em-based tracking values via literal lookup", () => {
    expect(matchTracking("0.025em")).toBe("wide");
    expect(matchTracking("-0.025em")).toBe("tight");
    expect(matchTracking("0em")).toBe("normal");
  });

  it("returns null for unknown tracking values", () => {
    expect(matchTracking("0.123em")).toBeNull();
  });
});

describe("matchLeading", () => {
  it("matches unitless line-height values via literal lookup", () => {
    expect(matchLeading("1.5")).toBe("normal");
    expect(matchLeading("1.25")).toBe("tight");
    expect(matchLeading("2")).toBe("loose");
  });

  it("returns null for unknown leading values", () => {
    expect(matchLeading("1.7")).toBeNull();
  });
});

describe("matchBorderWidth", () => {
  it("returns null because Tailwind v4 does not expose --border-* in @theme", () => {
    expect(matchBorderWidth("1px")).toBeNull();
    expect(matchBorderWidth("2px")).toBeNull();
  });
});

describe("matchFontWeight", () => {
  it("matches unitless weight values", () => {
    expect(matchFontWeight("400")).toBe("normal");
    expect(matchFontWeight("700")).toBe("bold");
    expect(matchFontWeight("100")).toBe("thin");
  });

  it("returns null for unknown weight values", () => {
    expect(matchFontWeight("450")).toBeNull();
  });
});
