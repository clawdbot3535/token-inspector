import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { describe, it, expect } from "vitest";
import { normalizeTrailingColorRole, buildCustomRecipes, stripOverlayPrefix, buildOverlayRecipes } from "./custom-recipe-engine.js";
import { buildGraph } from "./build-graph.js";
import type { SourceFile, SourceLayer, TokenNode, TokenGraph, GraphLayer, TokenType } from "./token-graph.js";

function realGraph() {
  const dir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../components",
  );
  const files: ReadonlyArray<{ name: SourceLayer; file: string }> = [
    { name: "color", file: "color.tokens.json" },
    { name: "dimension", file: "dimension.tokens.json" },
    { name: "typography", file: "typography.tokens.json" },
    { name: "light", file: "light.tokens.json" },
    { name: "dark", file: "dark.tokens.json" },
    { name: "global", file: "global.tokens.json" },
  ];
  const sources: SourceFile[] = files.map((s) => ({
    name: s.name,
    data: JSON.parse(readFileSync(resolve(dir, s.file), "utf8")) as Record<
      string,
      unknown
    >,
  }));
  return buildGraph(sources);
}

describe("normalizeTrailingColorRole", () => {
  it("moves a trailing color-role to the 2nd segment", () => {
    expect(normalizeTrailingColorRole("chip-bg-error")).toBe("chip-error-bg");
    expect(normalizeTrailingColorRole("chip-border-success")).toBe("chip-success-border");
  });
  it("moves a trailing color-role ahead of a sub-element + property", () => {
    expect(normalizeTrailingColorRole("chip-label-text-error")).toBe("chip-error-label-text");
  });
  it("leaves a trailing STATE word untouched", () => {
    expect(normalizeTrailingColorRole("chip-bg-hover")).toBe("chip-bg-hover");
    expect(normalizeTrailingColorRole("chip-label-text-active")).toBe("chip-label-text-active");
  });
  it("leaves a 2nd-segment color-role untouched", () => {
    expect(normalizeTrailingColorRole("button-error-bg")).toBe("button-error-bg");
  });
  it("leaves short ids untouched", () => {
    expect(normalizeTrailingColorRole("chip-bg")).toBe("chip-bg");
  });
});

describe("buildCustomRecipes", () => {
  it("returns {} when no components are flagged", () => {
    expect(buildCustomRecipes(realGraph(), new Map())).toEqual({});
  });

  it("builds a full-fidelity chip recipe with sub-element slots + color variants", () => {
    const recipes = buildCustomRecipes(
      realGraph(),
      new Map([["chip", ["label", "close"]]]),
    );
    const chip = recipes["chip"];
    expect(chip).toBeDefined();
    expect(chip!.slots.base).toBeTypeOf("string");
    expect(chip!.slots.label).toBeTypeOf("string");
    expect(chip!.slots.label).toMatch(/text-\[/);
    // icon-size resolves via the spacing scale (size-3), NOT arbitrary size-[..] (JIT-class guard)
    expect(chip!.slots.close).toMatch(/\bsize-\d/);
    expect(chip!.slots.close).not.toMatch(/size-\[/);
    expect(chip!.variants.color?.error?.base).toBeTypeOf("string");
    expect(chip!.variants.color?.error?.label).toMatch(/text-\[/);
    expect(chip!.variants.color?.success?.base).toBeTypeOf("string");
  });

  it("only builds the flagged components", () => {
    const recipes = buildCustomRecipes(
      realGraph(),
      new Map([["chip", ["label", "close"]]]),
    );
    expect(Object.keys(recipes)).toEqual(["chip"]);
  });
});

describe("stripOverlayPrefix", () => {
  it("strips a 2nd-segment overlay-dark and reports the mode", () => {
    expect(stripOverlayPrefix("button-overlay-dark-solid-bg")).toEqual({
      logicalId: "button-solid-bg",
      mode: "dark",
    });
  });
  it("strips a 2nd-segment overlay-light", () => {
    expect(stripOverlayPrefix("badge-overlay-light-accent-bg")).toEqual({
      logicalId: "badge-accent-bg",
      mode: "light",
    });
  });
  it("is a no-op when overlay sits after a sub-element (deferred nav case)", () => {
    expect(stripOverlayPrefix("nav-item-overlay-dark-ghost-bg")).toEqual({
      logicalId: "nav-item-overlay-dark-ghost-bg",
      mode: null,
    });
  });
  it("is a no-op for a non-overlay token", () => {
    expect(stripOverlayPrefix("button-solid-bg")).toEqual({
      logicalId: "button-solid-bg",
      mode: null,
    });
  });
  it("is a no-op when there is no property segment after the mode", () => {
    expect(stripOverlayPrefix("x-overlay-dark")).toEqual({ logicalId: "x-overlay-dark", mode: null });
  });
});

// ---------------------------------------------------------------------------
// buildOverlayRecipes
// ---------------------------------------------------------------------------

function ovNode(
  id: string,
  base: string,
  layer: GraphLayer = "component",
  type: TokenType = "color",
  source: SourceLayer = "global",
): TokenNode {
  return {
    id,
    path: id.split("-"),
    type,
    layer,
    themes: [],
    cssValue: { base },
    rawValue: { base },
    alias: {},
    source,
  };
}

function ovGraph(nodes: TokenNode[]): TokenGraph {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    aliasIndex: new Map(),
    reverseAliases: new Map(),
    issues: [],
    sources: [],
    meta: { builtAt: "2026-06-12T00:00:00Z", builderVersion: "test" },
  };
}

describe("buildOverlayRecipes", () => {
  it("emits a sparse dark recipe with only the genuine override, omitting the identical and the absent-light recipes", () => {
    const graph = ovGraph([
      ovNode("button-solid-bg", "#5667A7"),
      ovNode("button-overlay-dark-solid-bg", "#FAFAFA"),   // genuine — differs from base
      ovNode("button-ghost-bg", "#111111"),
      ovNode("button-overlay-dark-ghost-bg", "#111111"),   // identical to base — dropped
    ]);
    const recipes = buildOverlayRecipes(graph);
    expect(recipes["buttonOverlayDark"]).toBeDefined();
    // getSlotMapping("button-solid-bg") → variantAxis:"variant", variantKey:"solid"
    expect(recipes["buttonOverlayDark"].variants.variant?.solid?.base).toMatch(/bg-\[/);
    expect(recipes["buttonOverlayDark"].variants.variant?.ghost).toBeUndefined();
    expect(recipes["buttonOverlayLight"]).toBeUndefined();
  });

  it("treats an overlay token with no base counterpart as genuine", () => {
    const graph = ovGraph([
      ovNode("badge-overlay-light-accent-bg", "#5667A7"),
    ]);
    const recipes = buildOverlayRecipes(graph);
    expect(recipes["badgeOverlayLight"]?.variants.color?.accent?.base).toMatch(/bg-\[/);
  });

  it("defers sub-element overlay tokens (nav-item-overlay-*) — emits nothing", () => {
    const graph = ovGraph([ ovNode("nav-item-overlay-dark-ghost-bg", "#FAFAFA") ]);
    expect(buildOverlayRecipes(graph)).toEqual({});
  });

  it("returns {} for a graph with no overlay tokens", () => {
    const graph = ovGraph([ ovNode("button-solid-bg", "#5667A7") ]);
    expect(buildOverlayRecipes(graph)).toEqual({});
  });
});
