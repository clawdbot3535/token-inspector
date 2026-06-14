import { describe, it, expect } from "vitest";
import { buildInspectorClassifications } from "./classifications.js";
import type { TokenGraph, TokenNode } from "@core/token-graph.js";

function node(id: string, base: string, type: TokenNode["type"] = "number"): TokenNode {
  return {
    id,
    path: id.split("-"),
    type,
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

describe("buildInspectorClassifications — theme-emit overrides", () => {
  it("classifies a typography role token as theme-static with its --text-* cssName", () => {
    const c = buildInspectorClassifications(
      graph([node("typography-heading-1-font-size", "72px")]),
    );
    expect(c.get("typography-heading-1-font-size")).toMatchObject({
      kind: "theme-static",
      cssName: "--text-heading-1",
      value: "72px",
    });
  });

  it("classifies a layout-primitive token as theme-static with its remapped cssName", () => {
    const c = buildInspectorClassifications(
      graph([node("container-max-width-narrow", "960px")]),
    );
    expect(c.get("container-max-width-narrow")).toMatchObject({
      kind: "theme-static",
      cssName: "--container-narrow",
      value: "960px",
    });
  });

  it("leaves a deduped page-width token as skip (it emits no var of its own)", () => {
    const c = buildInspectorClassifications(
      graph([
        node("container-max-width-narrow", "960px"),
        node("page-max-width-narrow", "960px"),
      ]),
    );
    expect(c.get("page-max-width-narrow")?.kind).toBe("skip");
  });

  it("leaves a component-recipe token as skip", () => {
    const c = buildInspectorClassifications(graph([node("button-bg", "#fff", "color")]));
    expect(c.get("button-bg")?.kind).toBe("skip");
  });
});
