import { describe, it, expect } from "vitest";
import { buildComponentRecipes } from "./recipe-engine.js";
import type { TokenGraph, TokenNode, GraphLayer, TokenType, SourceLayer } from "./token-graph.js";

function makeNode(opts: {
  id: string;
  layer: GraphLayer;
  type: TokenType;
  source: SourceLayer;
  base?: string;
}): TokenNode {
  return {
    id: opts.id,
    path: opts.id.split("-"),
    type: opts.type,
    layer: opts.layer,
    themes: [],
    cssValue: { base: opts.base },
    rawValue: { base: opts.base },
    alias: {},
    source: opts.source,
  };
}

function makeGraph(nodes: TokenNode[]): TokenGraph {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    aliasIndex: new Map(),
    reverseAliases: new Map(),
    issues: [],
    sources: [],
    meta: { builtAt: "2026-05-20T00:00:00Z", builderVersion: "test" },
  };
}

describe("buildComponentRecipes", () => {
  it("returns empty when no component tokens exist", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-blue-500",
        layer: "primitive",
        type: "color",
        source: "color",
        base: "#3b82f6",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes).toEqual({});
  });

  it("assembles a minimal button recipe from size variants", () => {
    const graph = makeGraph([
      makeNode({
        id: "button-padding-x-sm",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "8px",
      }),
      makeNode({
        id: "button-padding-y-sm",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "4px",
      }),
      makeNode({
        id: "button-padding-x-md",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "12px",
      }),
      makeNode({
        id: "button-padding-y-md",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "8px",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button).toBeDefined();
    expect(recipes.button!.variants.size?.sm?.base).toContain("px-2");
    expect(recipes.button!.variants.size?.sm?.base).toContain("py-1");
    expect(recipes.button!.variants.size?.md?.base).toContain("px-3");
    expect(recipes.button!.variants.size?.md?.base).toContain("py-2");
  });

  it("emits slots.base for non-variant tokens", () => {
    const graph = makeGraph([
      makeNode({
        id: "button-radius",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "0.375rem",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("rounded-md");
  });

  it("ignores components outside the allow-list", () => {
    const graph = makeGraph([
      makeNode({
        id: "card-padding-x-sm",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "8px",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.card).toBeUndefined();
  });

  it("snapshot for a representative button recipe", () => {
    const graph = makeGraph([
      makeNode({
        id: "button-radius",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "0.375rem",
      }),
      makeNode({
        id: "button-font-weight",
        layer: "component",
        type: "fontWeight",
        source: "global",
        base: "500",
      }),
      makeNode({
        id: "button-padding-x-sm",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "8px",
      }),
      makeNode({
        id: "button-padding-y-sm",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "4px",
      }),
      makeNode({
        id: "button-padding-x-md",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "12px",
      }),
      makeNode({
        id: "button-padding-y-md",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "8px",
      }),
      makeNode({
        id: "button-text-size-sm",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "0.875rem",
      }),
      makeNode({
        id: "button-text-size-md",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "1rem",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes).toMatchSnapshot();
  });
});
