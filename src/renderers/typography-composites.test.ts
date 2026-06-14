import { describe, it, expect } from "vitest";
import { collectTypographyComposites } from "./typography-composites.js";
import type { TokenGraph, TokenNode } from "../token-graph.js";

function node(id: string, base: string): TokenNode {
  return {
    id,
    path: id.split("-"),
    type: "number",
    layer: "component",
    themes: [],
    cssValue: { base },
    rawValue: { base },
    alias: {},
    source: "global",
  };
}

function graph(nodes: TokenNode[]): TokenGraph {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    aliasIndex: new Map(),
    reverseAliases: new Map(),
    issues: [],
    sources: [],
    meta: { builtAt: "2026-06-14T00:00:00Z", builderVersion: "test" },
  };
}

describe("collectTypographyComposites", () => {
  it("builds a composite for a role with all four properties", () => {
    const out = collectTypographyComposites(
      graph([
        node("typography-heading-1-font-size", "72px"),
        node("typography-heading-1-line-height", "64"),
        node("typography-heading-1-letter-spacing", "-0.4px"),
        node("typography-heading-1-font-weight", "500"),
      ]),
    );
    expect(out).toEqual([
      { cssName: "--text-heading-1", value: "72px", tokenId: "typography-heading-1-font-size" },
      { cssName: "--text-heading-1--line-height", value: "64px", tokenId: "typography-heading-1-line-height" },
      { cssName: "--text-heading-1--letter-spacing", value: "-0.4px", tokenId: "typography-heading-1-letter-spacing" },
      { cssName: "--text-heading-1--font-weight", value: "500", tokenId: "typography-heading-1-font-weight" },
    ]);
  });

  it("normalizes the line-heigth typo but keeps the real token id", () => {
    const out = collectTypographyComposites(
      graph([
        node("typography-heading-2-font-size", "48px"),
        node("typography-heading-2-line-heigth", "40"),
      ]),
    );
    expect(out).toContainEqual({
      cssName: "--text-heading-2--line-height",
      value: "40px",
      tokenId: "typography-heading-2-line-heigth",
    });
  });

  it("leaves values that already carry a unit untouched", () => {
    const out = collectTypographyComposites(
      graph([
        node("typography-heading-1-font-size", "72px"),
        node("typography-heading-1-letter-spacing", "-0.4px"),
      ]),
    );
    expect(out).toContainEqual({
      cssName: "--text-heading-1--letter-spacing",
      value: "-0.4px",
      tokenId: "typography-heading-1-letter-spacing",
    });
  });

  it("omits a role that has no font-size base", () => {
    const out = collectTypographyComposites(
      graph([
        node("typography-label-letter-spacing", "0.4px"),
      ]),
    );
    expect(out).toEqual([]);
  });

  it("ignores non-typography tokens", () => {
    const out = collectTypographyComposites(
      graph([node("spacing-card-gutter", "18px")]),
    );
    expect(out).toEqual([]);
  });
});
