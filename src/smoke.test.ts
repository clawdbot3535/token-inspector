// Smoke test: load the real Figma exports under components/ and verify
// the new builder + renderers produce a graph and CSS that matches the
// expectations established by build-tokens.mjs (which already runs in CI).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGraph } from "./build-graph.js";
import type { SourceFile, SourceLayer } from "./token-graph.js";
import { cssRenderer } from "./renderers/css.js";

const ROOT = resolve(__dirname, "..");
const COMPONENTS = resolve(ROOT, "components");

const FILES: Record<SourceLayer, string> = {
  color: "color.tokens.json",
  dimension: "dimension.tokens.json",
  typography: "typography.tokens.json",
  light: "light.tokens.json",
  dark: "dark.tokens.json",
  global: "global.tokens.json",
};

function loadAll(): SourceFile[] {
  return (Object.entries(FILES) as Array<[SourceLayer, string]>).map(
    ([name, file]) => ({
      name,
      data: JSON.parse(readFileSync(resolve(COMPONENTS, file), "utf8")),
    }),
  );
}

describe("smoke: real Figma exports", () => {
  const sources = loadAll();
  const graph = buildGraph(sources);

  it("produces a non-empty graph", () => {
    expect(graph.nodes.size).toBeGreaterThan(100);
  });

  it("classifies nodes into all three cascade layers", () => {
    const layers = new Set([...graph.nodes.values()].map((n) => n.layer));
    expect(layers.has("primitive")).toBe(true);
    expect(layers.has("semantic")).toBe(true);
    expect(layers.has("component")).toBe(true);
  });

  it("merges semantic light + dark variants on shared ids", () => {
    const semantic = [...graph.nodes.values()].filter((n) => n.layer === "semantic");
    const themed = semantic.filter(
      (n) => n.cssValue.light !== undefined && n.cssValue.dark !== undefined,
    );
    expect(themed.length).toBeGreaterThan(0);
  });

  it("resolves component aliases to existing primitive/semantic ids", () => {
    const components = [...graph.nodes.values()].filter((n) => n.layer === "component");
    const aliased = components.filter((n) => n.alias.base !== undefined);
    expect(aliased.length).toBeGreaterThan(0);
    for (const node of aliased) {
      expect(graph.nodes.has(node.alias.base!.to)).toBe(true);
    }
  });

  it("CSS output contains all four cascade blocks", () => {
    const out = cssRenderer.render(graph);
    expect(out.text).toContain("@theme {");
    expect(out.text).toContain(":root {");
    expect(out.text).toContain('html.dark, [data-theme="dark"]');
  });

  it("CSS output keeps shadow values balanced (no dangling parens)", () => {
    const out = cssRenderer.render(graph);
    const open = (out.text.match(/\(/g) || []).length;
    const close = (out.text.match(/\)/g) || []).length;
    expect(open).toBe(close);
  });

  it("CSS LineMap covers a meaningful fraction of nodes", () => {
    const out = cssRenderer.render(graph);
    expect(out.lines.size).toBeGreaterThan(graph.nodes.size * 0.5);
  });

  it("reports issues array (may be empty for clean exports)", () => {
    expect(Array.isArray(graph.issues)).toBe(true);
  });
});
