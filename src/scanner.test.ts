import { describe, it, expect } from "vitest";
import { scanGraph } from "./scanner.js";
import type {
  TokenGraph,
  TokenNode,
  GraphLayer,
  TokenType,
  SourceLayer,
  Theme,
  ScanIssue,
  CompletenessScore,
} from "./token-graph.js";

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

function makeGraph(nodes: TokenNode[], issues: TokenGraph["issues"] = []): TokenGraph {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    aliasIndex: new Map(),
    reverseAliases: new Map(),
    issues,
    sources: [],
    meta: { builtAt: "2026-05-22T00:00:00Z", builderVersion: "test" },
  };
}

describe("scanGraph — build-time issues", () => {
  it("wraps GraphIssues as ScanIssues in the build-time category", () => {
    const graph = makeGraph(
      [],
      [
        {
          kind: "unresolved-alias",
          nodeId: "missing-target",
          message: "unresolved alias: missing-target",
        },
      ],
    );
    const report = scanGraph(graph, { components: ["button"] });
    const buildTime = report.issues.filter((i: ScanIssue) => i.category === "build-time");
    expect(buildTime).toHaveLength(1);
    expect(buildTime[0]?.severity).toBe("error");
    expect(buildTime[0]?.kind).toBe("unresolved-alias");
  });
});

describe("scanGraph — data-quality", () => {
  it("flags incomplete size variant when sm/lg utility coverage diverges from md", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x-sm", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "12px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "16px" }),
      makeNode({ id: "button-padding-y-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const dq = report.issues.filter((i: ScanIssue) => i.category === "data-quality" && i.kind === "incomplete-size-variant");
    expect(dq.length).toBeGreaterThan(0);
    const smIssue = dq.find((i: ScanIssue) => i.variantKey === "sm");
    const lgIssue = dq.find((i: ScanIssue) => i.variantKey === "lg");
    expect(smIssue?.message).toContain("padding-y");
    expect(lgIssue?.message).toContain("padding-y");
  });

  it("flags non-suffix vs size-suffix conflict when values differ", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x", layer: "component", type: "dimension", source: "global", base: "6px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const conflict = report.issues.find((i: ScanIssue) => i.kind === "non-suffix-vs-size-conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe("warning");
    expect(conflict?.tokenIds).toContain("button-padding-x");
    expect(conflict?.tokenIds).toContain("button-padding-x-md");
  });

  it("flags asymmetric size coverage when only some sizes have a utility", () => {
    const graph = makeGraph([
      makeNode({ id: "button-gap-xs", layer: "component", type: "dimension", source: "global", base: "2px" }),
      makeNode({ id: "button-gap-sm", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "12px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const asym = report.issues.find((i: ScanIssue) => i.kind === "asymmetric-size-coverage");
    expect(asym).toBeDefined();
    expect(asym?.message).toContain("gap");
  });

  it("flags orphaned size key when a size suffix appears on exactly one token", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "12px" }),
      makeNode({ id: "button-padding-x-xs", layer: "component", type: "dimension", source: "global", base: "4px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const orphan = report.issues.find((i: ScanIssue) => i.kind === "orphaned-size-key");
    expect(orphan).toBeDefined();
    expect(orphan?.variantKey).toBe("xs");
  });
});

describe("scanGraph — classification hints", () => {
  it("flags mode-invariant semantic tokens", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-text-static",
        layer: "semantic",
        type: "color",
        source: "light",
        light: "#000",
        dark: "#000",
      }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "mode-invariant-semantic");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("hint");
  });

  it("flags snap-to-tailwind candidates for close-but-not-matching primitives", () => {
    const graph = makeGraph([
      makeNode({
        id: "spacing-custom-5",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "5px",
      }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "snap-to-tailwind");
    expect(hint).toBeDefined();
    expect(hint?.message).toMatch(/p-1\b|p-1\.5/);
  });
});

describe("scanGraph — completeness scoring", () => {
  it("computes per-variant completeness with missing utilities", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x-sm", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-y-sm", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "12px" }),
      makeNode({ id: "button-padding-y-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-gap-md", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const md = report.completeness.find((c: CompletenessScore) => c.component === "button" && c.variantKey === "md");
    const sm = report.completeness.find((c: CompletenessScore) => c.component === "button" && c.variantKey === "sm");
    const lg = report.completeness.find((c: CompletenessScore) => c.component === "button" && c.variantKey === "lg");
    expect(md?.defined).toBe(3);
    expect(md?.total).toBe(3);
    expect(sm?.defined).toBe(2);
    expect(sm?.missingUtilities).toContain("gap");
    expect(lg?.defined).toBe(1);
    expect(lg?.missingUtilities).toEqual(expect.arrayContaining(["padding-y", "gap"]));
  });
});

describe("scanGraph — output forecast", () => {
  it("reports unmapped component prefixes outside the allow-list", () => {
    const graph = makeGraph([
      makeNode({ id: "card-padding-x-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.forecast.unmappedComponentPrefixes).toContain("card");
  });

  it("counts tailwind matches vs theme extensions for primitives", () => {
    const graph = makeGraph([
      makeNode({ id: "spacing-1", layer: "primitive", type: "dimension", source: "dimension", base: "4px" }),
      makeNode({ id: "spacing-card-gutter", layer: "primitive", type: "dimension", source: "dimension", base: "18px" }),
      makeNode({ id: "color-action-primary", layer: "semantic", type: "color", source: "light", light: "#2563eb", dark: "#60a5fa" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.forecast.tokensCss.tailwindMatches).toBe(1);
    expect(report.forecast.tokensCss.themeExtensions).toBeGreaterThanOrEqual(1);
    expect(report.forecast.tokensCss.modeVariantEntries).toBe(1);
  });
});
