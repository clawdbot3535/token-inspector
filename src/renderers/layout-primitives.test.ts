import { describe, it, expect } from "vitest";
import { collectLayoutPrimitives } from "./layout-primitives.js";
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

describe("collectLayoutPrimitives", () => {
  it("dedupes identical container & page widths into one --container scale", () => {
    const out = collectLayoutPrimitives(
      graph([
        node("container-max-width", "1280px"),
        node("container-max-width-narrow", "960px"),
        node("container-max-width-prose", "720px"),
        node("page-max-width", "1280px"),
        node("page-max-width-narrow", "960px"),
        node("page-max-width-prose", "720px"),
      ]),
    );
    const widths = out
      .filter((e) => e.cssName.startsWith("--container-"))
      .map((e) => e.cssName)
      .sort();
    expect(widths).toEqual([
      "--container-default",
      "--container-narrow",
      "--container-prose",
    ]);
  });

  it("keeps both widths when values diverge, qualifying the page one", () => {
    const out = collectLayoutPrimitives(
      graph([
        node("container-max-width-narrow", "960px"),
        node("page-max-width-narrow", "1024px"),
      ]),
    );
    expect(out).toContainEqual({ cssName: "--container-narrow", value: "960px", tokenId: "container-max-width-narrow" });
    expect(out).toContainEqual({ cssName: "--container-page-narrow", value: "1024px", tokenId: "page-max-width-narrow" });
  });

  it("maps gaps and paddings to --spacing-* with the axis dropped", () => {
    const out = collectLayoutPrimitives(
      graph([
        node("container-padding-x", "40px"),
        node("page-padding-x-desktop", "40px"),
        node("grid-gap-md", "24px"),
        node("stack-gap-xs", "8px"),
        node("section-padding-y-lg", "80px"),
      ]),
    );
    expect(out).toContainEqual({ cssName: "--spacing-container", value: "40px", tokenId: "container-padding-x" });
    expect(out).toContainEqual({ cssName: "--spacing-page-desktop", value: "40px", tokenId: "page-padding-x-desktop" });
    expect(out).toContainEqual({ cssName: "--spacing-grid-md", value: "24px", tokenId: "grid-gap-md" });
    expect(out).toContainEqual({ cssName: "--spacing-stack-xs", value: "8px", tokenId: "stack-gap-xs" });
    expect(out).toContainEqual({ cssName: "--spacing-section-lg", value: "80px", tokenId: "section-padding-y-lg" });
  });

  it("maps radii to --radius-*", () => {
    const out = collectLayoutPrimitives(
      graph([
        node("grid-item-radius", "8px"),
        node("section-radius-card", "12px"),
        node("section-radius-contained", "16px"),
      ]),
    );
    expect(out).toContainEqual({ cssName: "--radius-grid-item", value: "8px", tokenId: "grid-item-radius" });
    expect(out).toContainEqual({ cssName: "--radius-section-card", value: "12px", tokenId: "section-radius-card" });
    expect(out).toContainEqual({ cssName: "--radius-section-contained", value: "16px", tokenId: "section-radius-contained" });
  });

  it("emits grid-columns as a plain variable", () => {
    const out = collectLayoutPrimitives(graph([node("grid-columns", "12")]));
    expect(out).toEqual([{ cssName: "--grid-columns", value: "12", tokenId: "grid-columns" }]);
  });

  it("ignores non-layout tokens", () => {
    const out = collectLayoutPrimitives(
      graph([node("color-blue-500", "#3b82f6"), node("spacing-1", "4px")]),
    );
    expect(out).toEqual([]);
  });
});
