import { describe, it, expect } from "vitest";
import { resolveTokenToValue } from "./resolve-token.js";
import type { TokenGraph, TokenNode, Theme } from "./token-graph.js";

function makeNode(opts: {
  id: string;
  base?: string;
  light?: string;
  dark?: string;
  aliasTo?: string;
  aliasToLight?: string;
  aliasToDark?: string;
}): TokenNode {
  return {
    id: opts.id,
    path: opts.id.split("-"),
    type: "color",
    layer: "primitive",
    themes: [],
    cssValue: { base: opts.base, light: opts.light, dark: opts.dark },
    rawValue: { base: opts.base, light: opts.light, dark: opts.dark },
    alias: {
      base: opts.aliasTo ? { to: opts.aliasTo, rawTarget: opts.aliasTo } : undefined,
      light: opts.aliasToLight ? { to: opts.aliasToLight, rawTarget: opts.aliasToLight } : undefined,
      dark: opts.aliasToDark ? { to: opts.aliasToDark, rawTarget: opts.aliasToDark } : undefined,
    },
    source: "color",
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

describe("resolveTokenToValue", () => {
  it("returns the direct value for a primitive node with no alias", () => {
    const graph = makeGraph([
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
    ]);
    const result = resolveTokenToValue("color-blue-500", graph);
    expect(result).toEqual({ value: "#3b82f6", path: ["color-blue-500"] });
  });

  it("walks a single-stage alias", () => {
    const graph = makeGraph([
      makeNode({ id: "color-action-primary", aliasTo: "color-blue-500" }),
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
    ]);
    const result = resolveTokenToValue("color-action-primary", graph);
    expect(result).toEqual({
      value: "#3b82f6",
      path: ["color-action-primary", "color-blue-500"],
    });
  });

  it("walks a multi-stage alias chain", () => {
    const graph = makeGraph([
      makeNode({ id: "button-bg", aliasTo: "color-action-primary" }),
      makeNode({ id: "color-action-primary", aliasTo: "color-blue-500" }),
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
    ]);
    const result = resolveTokenToValue("button-bg", graph);
    expect(result).toEqual({
      value: "#3b82f6",
      path: ["button-bg", "color-action-primary", "color-blue-500"],
    });
  });

  it("resolves through var(--target) references in cssValue", () => {
    const graph = makeGraph([
      makeNode({ id: "alias-via-var", base: "var(--color-blue-500)" }),
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
    ]);
    const result = resolveTokenToValue("alias-via-var", graph);
    expect(result).toEqual({
      value: "#3b82f6",
      path: ["alias-via-var", "color-blue-500"],
    });
  });

  it("honors theme mode for themed alias", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-action-primary",
        aliasToLight: "color-blue-500",
        aliasToDark: "color-blue-300",
      }),
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
      makeNode({ id: "color-blue-300", base: "#93c5fd" }),
    ]);
    const light = resolveTokenToValue("color-action-primary", graph, "light");
    expect(light).toEqual({
      value: "#3b82f6",
      path: ["color-action-primary", "color-blue-500"],
    });
    const dark = resolveTokenToValue("color-action-primary", graph, "dark");
    expect(dark).toEqual({
      value: "#93c5fd",
      path: ["color-action-primary", "color-blue-300"],
    });
  });

  it("detects cycles", () => {
    const graph = makeGraph([
      makeNode({ id: "a", aliasTo: "b" }),
      makeNode({ id: "b", aliasTo: "a" }),
    ]);
    const result = resolveTokenToValue("a", graph);
    expect(result).toEqual({
      error: "cycle",
      path: ["a", "b", "a"],
    });
  });

  it("reports unresolved when chain ends at missing node", () => {
    const graph = makeGraph([
      makeNode({ id: "broken", aliasTo: "missing-target" }),
    ]);
    const result = resolveTokenToValue("broken", graph);
    expect(result).toEqual({
      error: "unresolved",
      path: ["broken"],
    });
  });

  it("returns unresolved if starting id does not exist", () => {
    const graph = makeGraph([]);
    const result = resolveTokenToValue("nonexistent", graph);
    expect(result).toEqual({
      error: "unresolved",
      path: [],
    });
  });
});
