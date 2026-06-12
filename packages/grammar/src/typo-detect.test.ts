import { describe, it, expect } from "vitest";
import { damerauLevenshtein } from "./typo-detect.js";

describe("damerauLevenshtein", () => {
  it("is 0 for identical strings", () => {
    expect(damerauLevenshtein("height", "height")).toBe(0);
  });

  it("counts a single substitution as 1", () => {
    expect(damerauLevenshtein("color", "colar")).toBe(1);
  });

  it("counts a single insertion as 1", () => {
    expect(damerauLevenshtein("eror", "error")).toBe(1);
  });

  it("counts a single deletion as 1", () => {
    expect(damerauLevenshtein("widthh", "width")).toBe(1);
  });

  it("counts an adjacent transposition as 1", () => {
    expect(damerauLevenshtein("height", "heigth")).toBe(1);
    expect(damerauLevenshtein("width", "widht")).toBe(1);
  });

  it("counts the smallest transposition as 1", () => {
    expect(damerauLevenshtein("ab", "ba")).toBe(1);
  });

  it("returns the other length when one string is empty", () => {
    expect(damerauLevenshtein("", "size")).toBe(4);
    expect(damerauLevenshtein("size", "")).toBe(4);
  });

  it("scores unrelated words as large", () => {
    expect(damerauLevenshtein("primary", "shadow")).toBeGreaterThan(2);
  });
});
