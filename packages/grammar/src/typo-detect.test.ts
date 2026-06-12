import { describe, it, expect } from "vitest";
import { damerauLevenshtein, suggestVocabWord } from "./typo-detect.js";

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

describe("suggestVocabWord", () => {
  it("suggests the transposed property word", () => {
    expect(suggestVocabWord("heigth")).toEqual({ word: "height", distance: 1 });
  });

  it("suggests for a misspelled variant", () => {
    expect(suggestVocabWord("outilne")?.word).toBe("outline");
  });

  it("suggests for a misspelled color role", () => {
    expect(suggestVocabWord("eror")).toEqual({ word: "error", distance: 1 });
  });

  it("returns null for a correctly-spelled vocab word", () => {
    expect(suggestVocabWord("height")).toBeNull();
    expect(suggestVocabWord("outline")).toBeNull();
  });

  it("returns null for an unrelated word", () => {
    expect(suggestVocabWord("zzzzzz")).toBeNull();
  });

  it("returns null on an ambiguous tie", () => {
    // `lint` is distance 1 from BOTH `line` (property) and `link` (variant).
    expect(suggestVocabWord("lint")).toBeNull();
  });

  it("respects maxDistance", () => {
    expect(suggestVocabWord("xxradius")).toBeNull(); // distance 2, default max 1
    expect(suggestVocabWord("xxradius", 2)?.word).toBe("radius");
  });
});
