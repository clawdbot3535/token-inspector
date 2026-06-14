import { describe, it, expect } from "vitest";
import { tokensCssRenderer } from "./tokens-css.js";
import { classifyGraph } from "../classify-token.js";
import type {
  TokenGraph,
  TokenNode,
  GraphLayer,
  TokenType,
  SourceLayer,
  Theme,
} from "../token-graph.js";

function makeNode(opts: {
  id: string;
  layer: GraphLayer;
  type: TokenType;
  source: SourceLayer;
  base?: string;
  light?: string;
  dark?: string;
}): TokenNode {
  const themes: readonly Theme[] =
    opts.light !== undefined || opts.dark !== undefined
      ? (["light", "dark"] as const)
      : [];
  return {
    id: opts.id,
    path: opts.id.split("-"),
    type: opts.type,
    layer: opts.layer,
    themes,
    cssValue: { base: opts.base, light: opts.light, dark: opts.dark },
    rawValue: { base: opts.base, light: opts.light, dark: opts.dark },
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

describe("tokensCssRenderer", () => {
  it("emits an empty @theme block when no tokens classify into the output", () => {
    const graph = makeGraph([
      makeNode({
        id: "spacing-1",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "4px",
      }),
    ]);
    const result = tokensCssRenderer.render(graph);
    expect(result.text).toContain("@theme {");
    expect(result.text).not.toContain("--spacing-1");
  });

  it("emits primitive colors in the @theme block", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-blue-500",
        layer: "primitive",
        type: "color",
        source: "color",
        base: "#3b82f6",
      }),
    ]);
    const result = tokensCssRenderer.render(graph);
    expect(result.text).toMatchSnapshot();
  });

  it("emits mode-variant semantics with .dark overrides", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-action-primary",
        layer: "semantic",
        type: "color",
        source: "light",
        light: "#2563eb",
        dark: "#60a5fa",
      }),
      makeNode({
        id: "color-surface-default",
        layer: "semantic",
        type: "color",
        source: "light",
        light: "#ffffff",
        dark: "#0a0a0a",
      }),
    ]);
    const result = tokensCssRenderer.render(graph);
    expect(result.text).toMatchSnapshot();
  });

  it("includes mode-invariant comment for semantic nodes with identical light/dark", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-text-static",
        layer: "semantic",
        type: "color",
        source: "light",
        light: "#000000",
        dark: "#000000",
      }),
    ]);
    const result = tokensCssRenderer.render(graph);
    expect(result.text).toContain("/* mode-invariant: same in light + dark */");
  });

  it("emits a line map keyed by token id", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-blue-500",
        layer: "primitive",
        type: "color",
        source: "color",
        base: "#3b82f6",
      }),
    ]);
    const result = tokensCssRenderer.render(graph);
    expect(result.lines.get("color-blue-500")?.length).toBeGreaterThan(0);
  });

  it("sorts tokens alphabetically within each section", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-zinc-500",
        layer: "primitive",
        type: "color",
        source: "color",
        base: "#71717a",
      }),
      makeNode({
        id: "color-amber-500",
        layer: "primitive",
        type: "color",
        source: "color",
        base: "#f59e0b",
      }),
    ]);
    const result = tokensCssRenderer.render(graph);
    const amberIdx = result.text.indexOf("--color-amber-500");
    const zincIdx = result.text.indexOf("--color-zinc-500");
    expect(amberIdx).toBeGreaterThan(0);
    expect(amberIdx).toBeLessThan(zincIdx);
  });

  it("classifies through classifyGraph and renders consistently", () => {
    const graph = makeGraph([
      makeNode({
        id: "spacing-card-gutter",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "18px",
      }),
    ]);
    const classifications = classifyGraph(graph);
    expect(classifications.size).toBe(1);
    const result = tokensCssRenderer.render(graph);
    expect(result.text).toContain("--spacing-card-gutter: 18px;");
  });

  it("emits typography roles as composite --text-<role> custom properties", () => {
    const graph = makeGraph([
      makeNode({ id: "typography-heading-1-font-size", layer: "component", type: "number", source: "global", base: "72px" }),
      makeNode({ id: "typography-heading-1-line-height", layer: "component", type: "number", source: "global", base: "64" }),
      makeNode({ id: "typography-heading-1-letter-spacing", layer: "component", type: "number", source: "global", base: "-0.4px" }),
      makeNode({ id: "typography-heading-1-font-weight", layer: "component", type: "number", source: "global", base: "500" }),
    ]);
    const result = tokensCssRenderer.render(graph);
    expect(result.text).toContain("--text-heading-1: 72px;");
    expect(result.text).toContain("--text-heading-1--line-height: 64px;");
    expect(result.text).toContain("--text-heading-1--letter-spacing: -0.4px;");
    expect(result.text).toContain("--text-heading-1--font-weight: 500;");
    // Lands under the Typography section.
    const typoIdx = result.text.indexOf("Non-default Typography");
    expect(typoIdx).toBeGreaterThan(-1);
    expect(result.text.indexOf("--text-heading-1:")).toBeGreaterThan(typoIdx);
    // Line map points the base line at its real source token.
    expect(result.lines.has("typography-heading-1-font-size")).toBe(true);
  });

  it("routes primitive letter-spacing and line-height under Typography, not Colors", () => {
    const graph = makeGraph([
      makeNode({ id: "letter-spacing-tight", layer: "primitive", type: "number", source: "typography", base: "-0.4px" }),
      makeNode({ id: "line-height-2xl", layer: "primitive", type: "number", source: "typography", base: "24px" }),
    ]);
    const result = tokensCssRenderer.render(graph);
    const typoIdx = result.text.indexOf("Non-default Typography");
    const colorIdx = result.text.indexOf("Primitive Colors");
    expect(typoIdx).toBeGreaterThan(-1);
    expect(result.text.indexOf("--letter-spacing-tight")).toBeGreaterThan(typoIdx);
    expect(result.text.indexOf("--line-height-2xl")).toBeGreaterThan(typoIdx);
    // Not in the Primitive Colors section (which, if present, precedes Typography).
    if (colorIdx > -1) {
      expect(result.text.indexOf("--letter-spacing-tight")).toBeGreaterThan(colorIdx);
    }
  });
});
