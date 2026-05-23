import { describe, it, expect } from "vitest";
import { buildComponentRecipes } from "./recipe-engine.js";
import type { TokenGraph, TokenNode, GraphLayer, TokenType, SourceLayer } from "./token-graph.js";

function makeNode(opts: {
  id: string;
  layer: GraphLayer;
  type: TokenType;
  source: SourceLayer;
  base?: string;
  /** Optional alias target id; sets node.alias.base. */
  aliasTo?: string;
}): TokenNode {
  return {
    id: opts.id,
    path: opts.id.split("-"),
    type: opts.type,
    layer: opts.layer,
    themes: [],
    cssValue: { base: opts.base },
    rawValue: { base: opts.base },
    alias:
      opts.aliasTo !== undefined
        ? { base: { to: opts.aliasTo, rawTarget: opts.aliasTo } }
        : {},
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

describe("buildComponentRecipes — variant axis (solid/outline/ghost/link)", () => {
  it("emits variants.variant.solid.base from a solid-bg color token", () => {
    const graph = makeGraph([
      makeNode({
        id: "button-solid-bg",
        layer: "component",
        type: "color",
        source: "global",
        base: "#4F63D2",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe("bg-[#4F63D2]");
  });

  it("collapses state suffixes into pseudo-class prefixes inside the variant", () => {
    const graph = makeGraph([
      makeNode({
        id: "button-solid-bg",
        layer: "component",
        type: "color",
        source: "global",
        base: "#4F63D2",
      }),
      makeNode({
        id: "button-solid-bg-hover",
        layer: "component",
        type: "color",
        source: "global",
        base: "#3D50BE",
      }),
      makeNode({
        id: "button-solid-bg-disabled",
        layer: "component",
        type: "color",
        source: "global",
        base: "#E4E4E7",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const cls = recipes.button?.variants.variant?.solid?.base ?? "";
    expect(cls).toContain("bg-[#4F63D2]");
    expect(cls).toContain("hover:bg-[#3D50BE]");
    expect(cls).toContain("disabled:bg-[#E4E4E7]");
  });

  it("emits separate buckets for solid/outline/ghost/link", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
      makeNode({ id: "button-outline-border", layer: "component", type: "color", source: "global", base: "#5667A7" }),
      makeNode({ id: "button-ghost-text", layer: "component", type: "color", source: "global", base: "#18181B" }),
      makeNode({ id: "button-link-underline", layer: "component", type: "color", source: "global", base: "#41508D" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const v = recipes.button?.variants.variant;
    expect(v?.solid?.base).toBe("bg-[#4F63D2]");
    expect(v?.outline?.base).toBe("border-[#5667A7]");
    expect(v?.ghost?.base).toBe("text-[#18181B]");
    expect(v?.link?.base).toBe("underline-[#41508D]");
  });

  it("default state does not produce a pseudo-class prefix", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-text-default", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe("text-[#FFFFFF]");
  });

  it("ring-focus token maps to focus:ring-[hex]", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-ring-focus", layer: "component", type: "color", source: "global", base: "#6F82C2" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe("focus:ring-[#6F82C2]");
  });
});

describe("buildComponentRecipes — semantic var references for colors", () => {
  it("emits var(--<semantic-id>) when the component token aliases to a semantic node", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-action-bg",
        layer: "semantic",
        type: "color",
        source: "light",
        base: "#4F63D2",
      }),
      makeNode({
        id: "button-solid-bg",
        layer: "component",
        type: "color",
        source: "global",
        aliasTo: "color-action-bg",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe(
      "bg-[var(--color-action-bg)]",
    );
  });

  it("emits var(--<primitive-id>) when the component aliases straight to a primitive", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-accent-500",
        layer: "primitive",
        type: "color",
        source: "color",
        base: "#4F63D2",
      }),
      makeNode({
        id: "button-solid-bg",
        layer: "component",
        type: "color",
        source: "global",
        aliasTo: "color-accent-500",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe(
      "bg-[var(--color-accent-500)]",
    );
  });

  it("stops at the FIRST non-component ancestor, not the terminal primitive", () => {
    // component → semantic → primitive
    // Expected: var(--color-action-bg), NOT var(--color-accent-500).
    const graph = makeGraph([
      makeNode({
        id: "color-accent-500",
        layer: "primitive",
        type: "color",
        source: "color",
        base: "#4F63D2",
      }),
      makeNode({
        id: "color-action-bg",
        layer: "semantic",
        type: "color",
        source: "light",
        aliasTo: "color-accent-500",
      }),
      makeNode({
        id: "button-solid-bg",
        layer: "component",
        type: "color",
        source: "global",
        aliasTo: "color-action-bg",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe(
      "bg-[var(--color-action-bg)]",
    );
  });

  it("walks through intra-component aliases until the first non-component target", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-action-bg",
        layer: "semantic",
        type: "color",
        source: "light",
        base: "#4F63D2",
      }),
      makeNode({
        id: "button-solid-bg-default",
        layer: "component",
        type: "color",
        source: "global",
        aliasTo: "color-action-bg",
      }),
      makeNode({
        id: "button-solid-bg",
        layer: "component",
        type: "color",
        source: "global",
        aliasTo: "button-solid-bg-default",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    // Should skip the intra-component hop and land on the semantic var.
    expect(recipes.button?.variants.variant?.solid?.base).toBe(
      "bg-[var(--color-action-bg)]",
    );
  });

  it("falls back to literal hex when the component token has no alias", () => {
    const graph = makeGraph([
      makeNode({
        id: "button-solid-bg",
        layer: "component",
        type: "color",
        source: "global",
        base: "#4F63D2",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe("bg-[#4F63D2]");
  });

  it("preserves the state prefix on top of the var reference", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-action-bg-hover",
        layer: "semantic",
        type: "color",
        source: "light",
        base: "#3D50BE",
      }),
      makeNode({
        id: "button-solid-bg-hover",
        layer: "component",
        type: "color",
        source: "global",
        aliasTo: "color-action-bg-hover",
      }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe(
      "hover:bg-[var(--color-action-bg-hover)]",
    );
  });
});

describe("buildComponentRecipes — smart non-suffix assignment", () => {
  it("non-suffix token goes to slots.base when the utility has no size variants", () => {
    const graph = makeGraph([
      makeNode({ id: "button-radius", layer: "component", type: "dimension", source: "global", base: "0.375rem" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("rounded-md");
    expect(recipes.button?.variants.size?.md?.base).toBeUndefined();
  });

  it("non-suffix token goes to variants.size.md when the utility has size variants elsewhere", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toBeUndefined();
    expect(recipes.button?.variants.size?.md?.base).toContain("px-2");
    expect(recipes.button?.variants.size?.lg?.base).toContain("px-4");
  });

  it("size-suffix wins when both non-suffix and size-suffix exist for the same default size", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x", layer: "component", type: "dimension", source: "global", base: "6px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.size?.md?.base).toContain("px-2");
    expect(recipes.button?.variants.size?.md?.base).not.toContain("px-[6px]");
  });

  it("respects defaultSizeByComponent override", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const recipes = buildComponentRecipes(graph, {
      components: ["button"],
      defaultSizeByComponent: { button: "sm" },
    });
    expect(recipes.button?.variants.size?.sm?.base).toContain("px-2");
    expect(recipes.button?.variants.size?.md?.base).toBeUndefined();
  });
});
