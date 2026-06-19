import { describe, it, expect } from "vitest";
import { diffComputed, canonicalizeShadow } from "./render-diff.js";

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

describe("canonicalizeShadow", () => {
  it("drops Tailwind's transparent placeholder layers", () => {
    const composite =
      "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
      "rgb(228, 228, 231) 0px 0px 0px 1px, rgba(0, 0, 0, 0) 0px 0px 0px 0px";
    expect(canonicalizeShadow(composite)).toBe("rgb(228, 228, 231) 0px 0px 0px 1px");
  });

  it("keeps the commas inside rgb()/rgba() intact (no mis-split)", () => {
    expect(canonicalizeShadow("rgb(1, 2, 3) 0px 0px 0px 2px")).toBe("rgb(1, 2, 3) 0px 0px 0px 2px");
  });

  it("collapses empty / all-transparent / none to \"none\"", () => {
    expect(canonicalizeShadow("")).toBe("none");
    expect(canonicalizeShadow("none")).toBe("none");
    expect(canonicalizeShadow("rgba(0, 0, 0, 0) 0px 0px 0px 0px")).toBe("none");
  });
});

describe("diffComputed — box-shadow canonicalization", () => {
  it("matches a single-layer ring against Tailwind's composite of the same ring", () => {
    const expected = { boxShadow: "rgb(228, 228, 231) 0px 0px 0px 1px" };
    const actual = {
      boxShadow:
        "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, " +
        "rgb(228, 228, 231) 0px 0px 0px 1px, rgba(0, 0, 0, 0) 0px 0px 0px 0px",
    };
    expect(diffComputed(expected, actual)[0]!.match).toBe(true);
  });

  it("still flags a genuinely different ring (spread differs)", () => {
    const expected = { boxShadow: "rgb(228, 228, 231) 0px 0px 0px 2px" };
    const actual = { boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(228, 228, 231) 0px 0px 0px 1px" };
    expect(diffComputed(expected, actual)[0]!.match).toBe(false);
  });
});
