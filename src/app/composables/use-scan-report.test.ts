import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { useScanReport } from "./use-scan-report.js";
import type {
  TokenGraph,
  TokenNode,
  GraphLayer,
  TokenType,
  SourceLayer,
} from "@core/token-graph.js";

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
    meta: { builtAt: "2026-05-27T00:00:00Z", builderVersion: "test" },
  };
}

describe("useScanReport", () => {
  it("returns the empty report when the graph is null", () => {
    const report = useScanReport(ref<TokenGraph | null>(null));
    expect(report.value.issues).toEqual([]);
    expect(report.value.completeness).toEqual([]);
    expect(report.value.generatedAt).toBe(0);
  });

  it("returns a ScanReport for a minimal graph", () => {
    const graph = makeGraph([
      makeNode({
        id: "button-px",
        layer: "component",
        type: "dimension",
        source: "global",
        base: "12px",
      }),
    ]);
    const report = useScanReport(ref<TokenGraph | null>(graph));
    expect(report.value).toBeDefined();
    expect(Array.isArray(report.value.issues)).toBe(true);
    expect(typeof report.value.generatedAt).toBe("number");
    expect(report.value.generatedAt).toBeGreaterThan(0);
  });
});
