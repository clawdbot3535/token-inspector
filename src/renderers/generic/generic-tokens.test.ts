// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildGenericCss, buildGenericJson, genericTokenStats } from "./generic-tokens.js";
import type { TokenGraph, TokenNode } from "../../token-graph.js";

const node = (
  id: string,
  layer: string,
  cssValue: { base?: string; light?: string; dark?: string },
): TokenNode =>
  ({
    id,
    path: id.split("-"),
    type: "color",
    layer,
    themes: [],
    cssValue,
    rawValue: {},
    alias: {},
    source: "global",
  }) as unknown as TokenNode;

const graph = (nodes: TokenNode[]): TokenGraph =>
  ({ nodes: new Map(nodes.map((n) => [n.id, n])) }) as unknown as TokenGraph;

const g = graph([
  node("color-bg-base", "semantic", { light: "#FFFFFF", dark: "#09090B" }),
  node("color-accent-500", "primitive", { base: "#4F63D2" }),
  node("rounded-md", "primitive", { base: "6px" }),
  node("button-bg", "component", { base: "#123456" }), // component → excluded
]);

describe("buildGenericCss", () => {
  const css = buildGenericCss(g);

  it("emits :root with the design tokens (primitive + semantic), raw names, NO @theme", () => {
    expect(css).toContain(":root {");
    expect(css).not.toContain("@theme");
    expect(css).toContain("--color-bg-base: #FFFFFF;");
    expect(css).toContain("--color-accent-500: #4F63D2;");
    expect(css).toContain("--rounded-md: 6px;");
  });

  it("emits .dark only for mode-aware tokens", () => {
    expect(css).toMatch(/\.dark \{[\s\S]*--color-bg-base: #09090B;/);
    // single-value primitives never appear in .dark
    expect(css).not.toMatch(/\.dark \{[\s\S]*--color-accent-500/);
  });

  it("excludes component-layer tokens", () => {
    expect(css).not.toContain("button-bg");
  });
});

describe("buildGenericJson", () => {
  const json = JSON.parse(buildGenericJson(g));

  it("keys by token id with a consistent { value, dark? } shape", () => {
    expect(json["color-bg-base"]).toEqual({ value: "#FFFFFF", dark: "#09090B" });
    expect(json["color-accent-500"]).toEqual({ value: "#4F63D2" });
  });

  it("excludes component-layer tokens", () => {
    expect(json["button-bg"]).toBeUndefined();
  });
});

describe("genericTokenStats", () => {
  it("counts the non-component tokens + how many have a dark override", () => {
    const stats = genericTokenStats(g);
    expect(stats.total).toBe(3); // color-bg-base, color-accent-500, rounded-md (button-bg excluded)
    expect(stats.dark).toBe(1); // only color-bg-base has a dark value
  });
});
