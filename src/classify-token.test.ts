import { describe, it, expect } from "vitest";
import { classifyToken } from "./classify-token.js";
import type {
  TokenGraph,
  TokenNode,
  GraphLayer,
  TokenType,
  Theme,
  SourceLayer,
} from "./token-graph.js";

const EMPTY_GRAPH: TokenGraph = {
  nodes: new Map(),
  aliasIndex: new Map(),
  reverseAliases: new Map(),
  issues: [],
  sources: [],
  meta: { builtAt: "2026-05-20T00:00:00Z", builderVersion: "test" },
};

function makeNode(opts: {
  id: string;
  layer: GraphLayer;
  type: TokenType;
  source: SourceLayer;
  base?: string;
  light?: string;
  dark?: string;
  themes?: readonly Theme[];
}): TokenNode {
  const themes: readonly Theme[] =
    opts.themes ?? (opts.light !== undefined || opts.dark !== undefined
      ? (["light", "dark"] as const)
      : []);
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

describe("classifyToken", () => {
  describe("skip — component layer", () => {
    it("classifies component-layer tokens as skip regardless of type", () => {
      const node = makeNode({
        id: "button-bg-default",
        layer: "component",
        type: "color",
        source: "global",
        base: "#2563eb",
      });
      const result = classifyToken(node, EMPTY_GRAPH);
      expect(result).toEqual({ kind: "skip", reason: "component-layer" });
    });

    it("skips even component-layer tokens that look mode-variant", () => {
      const node = makeNode({
        id: "button-border",
        layer: "component",
        type: "color",
        source: "global",
        light: "#000",
        dark: "#fff",
      });
      const result = classifyToken(node, EMPTY_GRAPH);
      expect(result.kind).toBe("skip");
    });
  });

  describe("tailwind-default — numeric primitives", () => {
    it("maps 4px spacing to p-1", () => {
      const node = makeNode({
        id: "spacing-1",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "4px",
      });
      const result = classifyToken(node, EMPTY_GRAPH);
      expect(result).toEqual({
        kind: "tailwind-default",
        utility: "p-1",
        utilityCategory: "spacing",
        resolvedValue: "4px",
      });
    });

    it("maps 0.375rem radius to rounded-md", () => {
      const node = makeNode({
        id: "radius-md",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "0.375rem",
      });
      const result = classifyToken(node, EMPTY_GRAPH);
      expect(result.kind).toBe("tailwind-default");
      if (result.kind === "tailwind-default") {
        expect(result.utility).toBe("rounded-md");
      }
    });
  });

  describe("theme-static — primitives with no Tailwind match", () => {
    it("emits primitive colors as theme-static", () => {
      const node = makeNode({
        id: "color-blue-500",
        layer: "primitive",
        type: "color",
        source: "color",
        base: "#3b82f6",
      });
      const result = classifyToken(node, EMPTY_GRAPH);
      expect(result).toEqual({
        kind: "theme-static",
        cssName: "--color-blue-500",
        value: "#3b82f6",
        modeInvariantHint: false,
      });
    });

    it("emits custom spacing values as theme-static", () => {
      const node = makeNode({
        id: "spacing-card-gutter",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "18px",
      });
      const result = classifyToken(node, EMPTY_GRAPH);
      expect(result.kind).toBe("theme-static");
      if (result.kind === "theme-static") {
        expect(result.cssName).toBe("--spacing-card-gutter");
        expect(result.value).toBe("18px");
      }
    });
  });

  describe("theme-mode-variant — semantic with diverging light/dark", () => {
    it("classifies as mode-variant when light !== dark", () => {
      const node = makeNode({
        id: "color-action-primary",
        layer: "semantic",
        type: "color",
        source: "light",
        light: "#2563eb",
        dark: "#60a5fa",
      });
      const result = classifyToken(node, EMPTY_GRAPH);
      expect(result).toEqual({
        kind: "theme-mode-variant",
        cssName: "--color-action-primary",
        lightValue: "#2563eb",
        darkValue: "#60a5fa",
      });
    });
  });

  describe("modeInvariantHint — semantic with identical light/dark", () => {
    it("flags semantic nodes where light === dark", () => {
      const node = makeNode({
        id: "color-text-static",
        layer: "semantic",
        type: "color",
        source: "light",
        light: "#000000",
        dark: "#000000",
      });
      const result = classifyToken(node, EMPTY_GRAPH);
      expect(result.kind).toBe("theme-static");
      if (result.kind === "theme-static") {
        expect(result.modeInvariantHint).toBe(true);
      }
    });
  });

  describe("determinism", () => {
    it("returns identical classification on repeated calls", () => {
      const node = makeNode({
        id: "color-action-primary",
        layer: "semantic",
        type: "color",
        source: "light",
        light: "#2563eb",
        dark: "#60a5fa",
      });
      const a = classifyToken(node, EMPTY_GRAPH);
      const b = classifyToken(node, EMPTY_GRAPH);
      expect(a).toEqual(b);
    });
  });

  describe("custom remBase", () => {
    it("respects a non-default rem base for px-to-rem matching", () => {
      // At remBase=20, 5px === 0.25rem === Tailwind spacing-1
      const node = makeNode({
        id: "spacing-1",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "5px",
      });
      const result = classifyToken(node, EMPTY_GRAPH, { remBase: 20 });
      expect(result.kind).toBe("tailwind-default");
    });
  });
});
