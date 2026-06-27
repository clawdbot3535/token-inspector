// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hexToOklch } from "./oklch.js";

function parse(s: string): [number, number, number] {
  const m = s.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (!m) throw new Error(`not an oklch string: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe("hexToOklch", () => {
  it("white → oklch(1 0 0)", () => {
    expect(hexToOklch("#FFFFFF")).toBe("oklch(1 0 0)");
  });

  it("black → oklch(0 0 0)", () => {
    expect(hexToOklch("#000000")).toBe("oklch(0 0 0)");
  });

  it("red #FF0000 → ~oklch(0.6279 0.2577 29.23) (full-pipeline reference)", () => {
    const [L, C, H] = parse(hexToOklch("#FF0000"));
    expect(L).toBeCloseTo(0.6279, 2);
    expect(C).toBeCloseTo(0.2577, 2);
    expect(H).toBeCloseTo(29.23, 0);
  });

  it("forces hue to 0 for achromatic colors (no garbage hue at C≈0)", () => {
    // mid gray → C rounds to 0 → H must be 0, not an atan2 artifact.
    expect(hexToOklch("#808080")).toMatch(/^oklch\([\d.]+ 0 0\)$/);
  });

  it("accepts 3-digit + lowercase hex", () => {
    expect(hexToOklch("#fff")).toBe("oklch(1 0 0)");
  });

  it("passes non-hex values through unchanged (rgba, var, …)", () => {
    expect(hexToOklch("rgba(0,0,0,0.1)")).toBe("rgba(0,0,0,0.1)");
    expect(hexToOklch("var(--x)")).toBe("var(--x)");
  });
});
