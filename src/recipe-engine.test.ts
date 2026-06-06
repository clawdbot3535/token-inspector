import { describe, it, expect } from "vitest";
import { buildComponentRecipes, utilityForMapping } from "./recipe-engine.js";
import type { TokenGraph, TokenNode, GraphLayer, TokenType, SourceLayer, SourceFile } from "./token-graph.js";
import { buildGraph } from "./build-graph.js";

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
    expect(v?.outline?.base).toBe("ring-[#5667A7]"); // D2c: outline border → ring
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

  it("a bare state token (no variant) emits a base pseudo-class prefix, not a dead variants.state", () => {
    // Regression: `button-radius-focus` used to bucket into variants.state.focus,
    // which Nuxt UI v4 never applies (no `state` prop). It must fold into base
    // as `focus:rounded-md`, which the pseudo-class actually triggers.
    const graph = makeGraph([
      makeNode({ id: "button-radius-focus", layer: "component", type: "dimension", source: "global", base: "6px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("focus:rounded-md");
    expect(Object.keys(recipes.button?.variants ?? {})).not.toContain("state");
  });

  it("emits ring-[Npx] for an outline border-width token (D2c)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-outline-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.outline?.base).toBe("ring-[1px]");
  });

  it("emits border-[Npx] for an unframed-variant border-width token", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-border-width", layer: "component", type: "number", source: "global", base: "2px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe("border-[2px]");
  });

  it("emits border-[Npx] for a component-level border-width token (no variant)", () => {
    const graph = makeGraph([
      makeNode({ id: "table-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["table"] });
    expect(recipes.table?.slots.base).toBe("border-[1px]");
  });

  it("emits focus:ring-[2px] from button-ring-width; resting ring-[1px] is dropped (no ring-colour to pair with) (D2e)", () => {
    // button-border-width maps to a resting ring-width. Without a resting
    // ring-colour in the graph there is no pairing target, so the width is
    // dropped rather than painting a colourless ring on every variant.
    // button-ring-width has statePrefix="focus" and is unaffected by the fix.
    const graph = makeGraph([
      makeNode({ id: "button-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
      makeNode({ id: "button-ring-width", layer: "component", type: "number", source: "global", base: "2px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const base = recipes.button?.slots.base ?? "";
    expect(base).not.toContain("ring-[1px]"); // no ring-colour → width dropped
    expect(base).toContain("focus:ring-[2px]");
  });

  it("pairs a component-level resting ring-width with the framed variant's ring-colour (D2e leak fix)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
      makeNode({ id: "button-outline-border", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#222222" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    // ring-[1px] lands on outline (with its ring colour), NOT on slots.base.
    expect(recipes.button?.variants.variant?.outline?.base ?? "").toContain("ring-[1px]");
    expect(recipes.button?.slots.base ?? "").not.toContain("ring-[1px]");
    // unframed variants get no resting ring.
    expect(recipes.button?.variants.variant?.solid?.base ?? "").not.toContain("ring-[");
  });

  it("keeps a whole-component resting ring-width on base when the ring-colour is on base (input)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
      makeNode({ id: "input-border", layer: "component", type: "color", source: "global", base: "#E4E4E7" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["input"] });
    expect(recipes.input?.slots.base ?? "").toContain("ring-[1px]");
  });

  it("drops a component-level resting ring-width with no resting ring-colour to pair with", () => {
    const graph = makeGraph([
      makeNode({ id: "button-border-width", layer: "component", type: "number", source: "global", base: "1px" }),
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#222222" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const r = recipes.button;
    const anyRingWidth =
      (r?.slots.base ?? "").includes("ring-[1px]") ||
      Object.values(r?.variants.variant ?? {}).some((v) => (v.base ?? "").includes("ring-[1px]"));
    expect(anyRingWidth).toBe(false);
  });

  it("leaves the focus ring-width on base (component-level, intended on all variants)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-ring-width", layer: "component", type: "number", source: "global", base: "2px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base ?? "").toContain("focus:ring-[2px]");
  });

  it("keeps a state-prefixed token out of the non-suffix default-size redirect", () => {
    // padding-y has size siblings, so a NON-suffix padding-y would be redirected
    // into variants.size. A focus-state padding-y must NOT be swallowed by that
    // logic — it emits focus:py-* on base.
    const graph = makeGraph([
      makeNode({ id: "button-padding-y-sm", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "button-padding-y-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-y-focus", layer: "component", type: "dimension", source: "global", base: "12px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("focus:py-3"); // 12px → py-3
    expect(Object.keys(recipes.button?.variants ?? {})).not.toContain("state");
  });

  it("drops a fully-transparent border colour (no class emitted)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-ghost-border", layer: "component", type: "color", source: "global", base: "rgba(0, 0, 0, 0)" }),
      makeNode({ id: "button-ghost-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const cls = recipes.button?.variants.variant?.ghost?.base ?? "";
    expect(cls).not.toContain("border-");
    expect(cls).toContain("text-[#52525B]");
  });

  it("drops a fully-transparent background colour", () => {
    const graph = makeGraph([
      makeNode({ id: "button-link-bg", layer: "component", type: "color", source: "global", base: "rgba(0, 0, 0, 0)" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    const cls = recipes.button?.variants.variant?.link?.base ?? "";
    expect(cls).not.toContain("bg-");
  });

  it("keeps opaque colours (transparent rule is value-gated)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toBe("bg-[#4F63D2]");
  });
});

describe("utilityForMapping — highlight/recipe parity", () => {
  // Regression: the Inspector's highlight resolver used to re-derive the class
  // through the shadow-node path only, so an arbitrary-value type like
  // ring-offset computed `ring-offset-1` while the recipe emitted
  // `ring-offset-[4px]` — no match, no highlight. Both now share this function.
  it("emits the arbitrary class for ring-offset, matching the recipe's base token", () => {
    const graph = makeGraph([
      makeNode({ id: "button-ring-offset", layer: "component", type: "dimension", source: "global", base: "4px" }),
    ]);
    const node = graph.nodes.get("button-ring-offset")!;
    const util = utilityForMapping(graph, node, "ring-offset", "4px");
    expect(util).toBe("ring-offset-[4px]");

    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect((recipes.button?.slots.base ?? "").split(/\s+/)).toContain(util);
  });

  it("emits a scale class for a non-arbitrary type (rounded), also matching the recipe", () => {
    const graph = makeGraph([
      makeNode({ id: "button-radius", layer: "component", type: "dimension", source: "global", base: "6px" }),
    ]);
    const node = graph.nodes.get("button-radius")!;
    expect(utilityForMapping(graph, node, "rounded", "6px")).toBe("rounded-md");
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

describe("buildComponentRecipes — arbitrary-value utility types (Task 6)", () => {
  it("height token emits h-[40px] in slots.base", () => {
    const graph = makeGraph([
      makeNode({ id: "button-height", layer: "component", type: "dimension", source: "global", base: "40px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("h-[40px]");
  });

  it("height token with size suffix emits h-[32px] in variants.size.sm", () => {
    const graph = makeGraph([
      makeNode({ id: "button-height-sm", layer: "component", type: "dimension", source: "global", base: "32px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.size?.sm?.base).toContain("h-[32px]");
  });

  it("width token emits w-[120px] in slots.base", () => {
    const graph = makeGraph([
      makeNode({ id: "button-width", layer: "component", type: "dimension", source: "global", base: "120px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("w-[120px]");
  });

  it("line-height token emits leading-[1.5] in variants.size.md", () => {
    const graph = makeGraph([
      makeNode({ id: "button-line-height-md", layer: "component", type: "dimension", source: "global", base: "1.5" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.size?.md?.base).toContain("leading-[1.5]");
  });

  it("letter-spacing token emits tracking-[0.5px] in variants.size.sm", () => {
    const graph = makeGraph([
      makeNode({ id: "button-letter-spacing-sm", layer: "component", type: "dimension", source: "global", base: "0.5px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.size?.sm?.base).toContain("tracking-[0.5px]");
  });

  it("font-family token emits font-[Inter] in slots.base", () => {
    const graph = makeGraph([
      makeNode({ id: "button-font-family", layer: "component", type: "fontFamily", source: "global", base: "Inter" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("font-[Inter]");
  });

  it("font-family value containing spaces escapes to underscores (font-[Google_Sans_Flex])", () => {
    const graph = makeGraph([
      makeNode({ id: "button-font-family", layer: "component", type: "fontFamily", source: "global", base: "Google Sans Flex" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("font-[Google_Sans_Flex]");
  });

  it("padding token emits p-[12px] in slots.base when no size variants", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding", layer: "component", type: "dimension", source: "global", base: "12px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("p-[12px]");
  });

  it("ring-offset token emits ring-offset-[2px] in slots.base", () => {
    const graph = makeGraph([
      makeNode({ id: "button-ring-offset", layer: "component", type: "dimension", source: "global", base: "2px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.slots.base).toContain("ring-offset-[2px]");
  });

  it("placeholder-color token emits placeholder:text-[#AABBCC] from literal", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-placeholder", layer: "component", type: "color", source: "global", base: "#AABBCC" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toContain("placeholder:text-[#AABBCC]");
  });

  it("placeholder-color aliasing a semantic id emits placeholder:text-[var(--<id>)]", () => {
    const graph = makeGraph([
      makeNode({ id: "color-placeholder", layer: "semantic", type: "color", source: "light", base: "#9CA3AF" }),
      makeNode({ id: "button-solid-placeholder", layer: "component", type: "color", source: "global", aliasTo: "color-placeholder" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toContain(
      "placeholder:text-[var(--color-placeholder)]",
    );
  });

  it("overlay-bg token emits bg-[#00000033] in variants.variant.solid.base from literal", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-overlay-bg", layer: "component", type: "color", source: "global", base: "#00000033" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toContain("bg-[#00000033]");
  });

  it("overlay-bg aliasing a semantic id emits bg-[var(--<id>)]", () => {
    const graph = makeGraph([
      makeNode({ id: "color-overlay", layer: "semantic", type: "color", source: "light", base: "#00000033" }),
      makeNode({ id: "button-solid-overlay-bg", layer: "component", type: "color", source: "global", aliasTo: "color-overlay" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    expect(recipes.button?.variants.variant?.solid?.base).toContain(
      "bg-[var(--color-overlay)]",
    );
  });
});

describe("robustness — messy/inconsistent tokens degrade gracefully", () => {
  it("does not throw and omits unmapped tokens (trailing color-role, unknown utility, sub-element)", () => {
    const graph = makeGraph([
      // trailing color-role → unmapped (Figma-fix territory)
      makeNode({ id: "chip-bg-error", layer: "component", type: "color", source: "global", base: "#f00" }),
      // sub-element → unmapped in v0.4.0
      makeNode({ id: "nav-item-bg", layer: "component", type: "color", source: "global", base: "#0f0" }),
      // unknown utility → unmapped
      makeNode({ id: "card-frobnicate", layer: "component", type: "number", source: "global", base: "3" }),
      // maps → p-[8px]
      makeNode({ id: "card-padding", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    let recipes: ReturnType<typeof buildComponentRecipes>;
    expect(() => {
      recipes = buildComponentRecipes(graph, { components: ["chip", "nav", "card"] });
    }).not.toThrow();
    expect(recipes!.card?.slots.base).toContain("p-[8px]");
    expect(JSON.stringify(recipes!)).not.toContain("frobnicate");
  });
});

// Mirrors the real `input` subtree in components/global.tokens.json (literal
// values so the snapshot is hermetic — the real export resolves these to
// var() refs, which the CLI e2e step in the plan verifies separately).
//
// Uses buildGraph() (the full raw-token → recipe pipeline) on purpose, unlike
// the makeGraph()-based unit tests above — this exercises the parser→recipe
// seam end to end. Integer $values (e.g. 36, 6) are resolved to CSS by
// buildGraph (36 → h-[36px], font-size 14 → the text-sm scale step).
function inputGraph() {
  const global = {
    input: {
      border: { $value: "#D4D4D8", $type: "color" },
      "border-hover": { $value: "#A1A1AA", $type: "color" },
      "border-focus": { $value: "#3B82F6", $type: "color" },
      "border-disabled": { $value: "#E4E4E7", $type: "color" },
      "border-error": { $value: "#EF4444", $type: "color" },
      "border-success": { $value: "#22C55E", $type: "color" },
      "bg-disabled": { $value: "#F4F4F5", $type: "color" },
      text: { $value: "#18181B", $type: "color" },
      "text-disabled": { $value: "#A1A1AA", $type: "color" },
      placeholder: { $value: "#71717A", $type: "color" },
      "placeholder-disabled": { $value: "#D4D4D8", $type: "color" },
      "solid-bg": { $value: "#FAFAFA", $type: "color" },
      "outline-bg": { $value: "#FFFFFF", $type: "color" },
      "ring-focus": { $value: "#3B82F6", $type: "color" },
      height: { $value: 36, $type: "number" },
      "padding-x": { $value: 6, $type: "number" },
      "padding-y": { $value: 8, $type: "number" },
      radius: { $value: 6, $type: "number" },
      "radius-focus": { $value: 8, $type: "number" },
      "ring-offset": { $value: 4, $type: "number" },
      "font-size": { $value: 14, $type: "number" },
      "font-weight": { $value: 400, $type: "number" },
      "icon-size-md": { $value: 16, $type: "number" },
    },
  };
  const sources: SourceFile[] = [{ name: "global", data: global }];
  return buildGraph(sources);
}

describe("buildComponentRecipes — input characterisation (cycle A baseline)", () => {
  it("pins the emitted ui.input recipe block", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    expect(recipes["input"]).toMatchSnapshot();
  });

  it("promotes interaction-state tokens to pseudo-class prefixes on base", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).toContain("focus:ring-[#3B82F6]");
    expect(base).toContain("hover:ring-[#A1A1AA]");
    expect(base).toContain("disabled:bg-[#F4F4F5]");
    expect(base).toContain("focus:rounded-lg");
  });

  it("SEED for cycle B: input-border-error/success are silently dropped (no color axis)", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    expect(recipes["input"]?.variants.color).toBeUndefined();
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).not.toContain("#EF4444");
    expect(base).not.toContain("#22C55E");
  });

  it("SEED for cycle B: emits a `solid` variant that Nuxt UI input does not define", () => {
    const recipes = buildComponentRecipes(inputGraph(), { components: ["input"] });
    expect(recipes["input"]?.variants.variant?.["solid"]).toEqual({ base: "bg-[#FAFAFA]" });
    expect(recipes["input"]?.variants.variant?.["outline"]).toBeDefined();
  });
});

describe("buildComponentRecipes — color text tokens emit var() (D1)", () => {
  // A semantic color target + a component `text` token aliasing it via the
  // Figma alias extension, with NO variant axis — the input shape that used to
  // leak a hardcoded hex.
  function aliasedTextGraph() {
    const light = {
      color: { text: { primary: { $value: "#18181B", $type: "color" } } },
    };
    const global = {
      input: {
        text: {
          $value: "#18181B",
          $type: "color",
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "color/text/primary" },
          },
        },
      },
    };
    const sources: SourceFile[] = [
      { name: "light", data: light },
      { name: "global", data: global },
    ];
    return buildGraph(sources);
  }

  it("emits text-[var(--color-text-primary)] for an aliased color text token", () => {
    const recipes = buildComponentRecipes(aliasedTextGraph(), { components: ["input"] });
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).toContain("text-[var(--color-text-primary)]");
    expect(base).not.toContain("text-[#18181B]");
  });

  it("classifies a number-typed text token as text-size, not a color (D1 negative)", () => {
    const global = { input: { text: { $value: 14, $type: "number" } } };
    const recipes = buildComponentRecipes(
      buildGraph([{ name: "global", data: global }]),
      { components: ["input"] },
    );
    const base = recipes["input"]?.slots.base ?? "";
    // number-typed `text` → text-size path, never a color var/hex.
    expect(base).not.toContain("text-[var");
    expect(base).not.toContain("text-[#");
    expect(base.length).toBeGreaterThan(0); // it still emits *something* (a text-size class)
  });
});

describe("buildComponentRecipes — sub-element slot routing", () => {
  it("emits a sub-element slot for an exact-match Nuxt slot token", () => {
    const graph = makeGraph([
      makeNode({ id: "dropdown-item-bg", layer: "component", type: "color", source: "global", base: "#18181B" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["dropdown"] });
    const item = recipes["dropdown"]?.slots.item ?? "";
    const base = recipes["dropdown"]?.slots.base ?? "";
    expect(item).toContain("bg-[#18181B]");
    expect(base).not.toContain("bg-[#18181B]");
  });
});

describe("buildComponentRecipes — ring-framed border emits ring (D2)", () => {
  function aliasedBorderGraph() {
    const light = {
      color: { border: { default: { $value: "#D4D4D8", $type: "color" } } },
    };
    const global = {
      input: {
        border: {
          $value: "#D4D4D8",
          $type: "color",
          $extensions: {
            "com.figma.aliasData": { targetVariableName: "color/border/default" },
          },
        },
      },
    };
    const sources: SourceFile[] = [
      { name: "light", data: light },
      { name: "global", data: global },
    ];
    return buildGraph(sources);
  }

  it("emits ring-[var(--color-border-default)] for input-border, not a CSS border", () => {
    const recipes = buildComponentRecipes(aliasedBorderGraph(), { components: ["input"] });
    const base = recipes["input"]?.slots.base ?? "";
    expect(base).toContain("ring-[var(--color-border-default)]");
    expect(base).not.toContain("border-[");
  });
});
