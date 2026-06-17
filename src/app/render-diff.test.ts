import { describe, it, expect } from "vitest";
import { diffComputed } from "./render-diff.js";

describe("diffComputed", () => {
  it("matches identical maps (no false deltas)", () => {
    const m = { backgroundColor: "rgb(86, 103, 167)", borderRadius: "4px" };
    const deltas = diffComputed(m, { ...m });
    expect(deltas.every((d) => d.match)).toBe(true);
    expect(deltas).toHaveLength(2);
  });

  it("flags a differing property with both values", () => {
    const deltas = diffComputed(
      { borderRadius: "8px", backgroundColor: "rgb(0, 0, 0)" },
      { borderRadius: "4px", backgroundColor: "rgb(0, 0, 0)" },
    );
    const radius = deltas.find((d) => d.property === "borderRadius")!;
    expect(radius.match).toBe(false);
    expect(radius.expected).toBe("8px");
    expect(radius.actual).toBe("4px");
    expect(deltas.find((d) => d.property === "backgroundColor")!.match).toBe(true);
  });

  it("treats a key missing from actual as a mismatch (actual empty)", () => {
    const deltas = diffComputed({ padding: "16px" }, {});
    expect(deltas[0]!.match).toBe(false);
    expect(deltas[0]!.actual).toBe("");
  });

  it("ignores trailing whitespace when comparing", () => {
    const deltas = diffComputed({ color: "rgb(1, 2, 3)" }, { color: "rgb(1, 2, 3) " });
    expect(deltas[0]!.match).toBe(true);
  });
});
