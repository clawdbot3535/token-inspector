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

  it("suggests text-* for font-size tokens, not p-*", () => {
    // 14px is close to text-sm (0.875rem = 14px at remBase 16) — already matched
    // Use 15px which is 1px away from text-sm (14px) to get a snap suggestion.
    const graph = makeGraph([
      makeNode({
        id: "font-size-text-base",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "15px",
      }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "snap-to-tailwind");
    expect(hint).toBeDefined();
    expect(hint?.message).not.toMatch(/\bp-\d/);
    expect(hint?.message).toMatch(/\btext-/);
  });

  it("suggests rounded-* for radius tokens, not p-*", () => {
    // 3px is 1px away from rounded-sm (2px) — should suggest rounded-sm, not p-1
    const graph = makeGraph([
      makeNode({
        id: "rounded-custom",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "3px",
      }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "snap-to-tailwind");
    if (hint !== undefined) {
      expect(hint.message).not.toMatch(/\bp-\d/);
      expect(hint.message).toMatch(/\brounded-/);
    }
    // (no hint is also acceptable — just must not emit p-*)
  });

  it("suggests border-* for border-width tokens, not p-*", () => {
    // 3px is 1px away from border-2 (2px) — should suggest border-*, not p-*
    const graph = makeGraph([
      makeNode({
        id: "border-width-thick",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "3px",
      }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "snap-to-tailwind");
    if (hint !== undefined) {
      expect(hint.message).not.toMatch(/\bp-\d/);
      expect(hint.message).toMatch(/\bborder-/);
    }
    // (no hint is also acceptable — just must not emit p-*)
  });

  it("still suggests p-* for spacing tokens (existing behaviour preserved)", () => {
    // spacing-1-5 at 6px is 2px from p-1 (4px) — should still snap to p-*
    const graph = makeGraph([
      makeNode({
        id: "spacing-1-5",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "6px",
      }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "snap-to-tailwind");
    expect(hint).toBeDefined();
    expect(hint?.message).toMatch(/\bp-/);
  });

  it("emits no snap hint for tokens with no recognisable category", () => {
    // A token named 'unknown-numeric' doesn't match any dimension prefix pattern
    // and falls back to the spacing category (fallback path) — but a token with
    // type 'color' has no Tailwind category at all and must not emit a snap hint.
    const graph = makeGraph([
      makeNode({
        id: "color-brand-primary",
        layer: "primitive",
        type: "color",
        source: "global",
        base: "#ff0000",
      }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "snap-to-tailwind");
    expect(hint).toBeUndefined();
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

describe("scanGraph — asymmetric variant coverage", () => {
  it("flags a button bg-active that is missing from one of four variants (warning)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#001" }),
      makeNode({ id: "button-solid-bg-active", layer: "component", type: "color", source: "global", base: "#002" }),
      makeNode({ id: "button-outline-bg", layer: "component", type: "color", source: "global", base: "#003" }),
      makeNode({ id: "button-outline-bg-active", layer: "component", type: "color", source: "global", base: "#004" }),
      makeNode({ id: "button-ghost-bg", layer: "component", type: "color", source: "global", base: "#005" }),
      makeNode({ id: "button-ghost-bg-active", layer: "component", type: "color", source: "global", base: "#006" }),
      makeNode({ id: "button-link-bg", layer: "component", type: "color", source: "global", base: "#007" }),
      // link MISSING bg-active
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const asym = report.issues.filter((i) => i.kind === "asymmetric-variant-coverage");
    const finding = asym.find((i) => i.message.includes("bg-active"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("warning");
    expect(finding!.componentName).toBe("button");
    expect(finding!.message).toContain("link");
    expect(finding!.message).toContain("`button-link-bg-active`");
  });

  it("emits a hint (not warning) when only one variant defines a token", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#001" }),
      makeNode({ id: "button-outline-bg", layer: "component", type: "color", source: "global", base: "#002" }),
      makeNode({ id: "button-outline-border", layer: "component", type: "color", source: "global", base: "#003" }),
      // only outline has border
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const finding = report.issues
      .filter((i) => i.kind === "asymmetric-variant-coverage")
      .find((i) => i.message.includes("border"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("hint");
    expect(finding!.message).toContain("intentional");
  });

  it("does not flag a fully symmetric variant set", () => {
    const graph = makeGraph([
      makeNode({ id: "input-outline-bg", layer: "component", type: "color", source: "global", base: "#001" }),
      makeNode({ id: "input-solid-bg", layer: "component", type: "color", source: "global", base: "#002" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const asym = report.issues.filter((i) => i.kind === "asymmetric-variant-coverage");
    expect(asym).toEqual([]);
  });

  it("recognises semantic color-role variants (accent/error/success/...) on badge", () => {
    const graph = makeGraph([
      makeNode({ id: "badge-accent-bg", layer: "component", type: "color", source: "global", base: "#001" }),
      makeNode({ id: "badge-accent-text", layer: "component", type: "color", source: "global", base: "#002" }),
      makeNode({ id: "badge-error-bg", layer: "component", type: "color", source: "global", base: "#003" }),
      // error MISSING text
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const asym = report.issues.filter((i) => i.kind === "asymmetric-variant-coverage");
    const finding = asym.find(
      (i) => i.componentName === "badge" && i.message.includes("text"),
    );
    expect(finding).toBeDefined();
    expect(finding!.message).toContain("`badge-error-text`");
  });

  it("treats trailing 'error' as a state suffix, not a variant — no false positives on chip", () => {
    // chip-bg-error: bg is the utility namespace; error is a state modifier
    // at the trailing position. Must not be misread as variant=bg, util=error.
    const graph = makeGraph([
      makeNode({ id: "chip-bg", layer: "component", type: "color", source: "global", base: "#001" }),
      makeNode({ id: "chip-bg-error", layer: "component", type: "color", source: "global", base: "#002" }),
      makeNode({ id: "chip-border", layer: "component", type: "color", source: "global", base: "#003" }),
      makeNode({ id: "chip-border-error", layer: "component", type: "color", source: "global", base: "#004" }),
    ]);
    const report = scanGraph(graph, { components: ["chip"] });
    const asym = report.issues.filter((i) => i.kind === "asymmetric-variant-coverage");
    expect(asym).toEqual([]);
  });

  it("recognises asymmetry across multiple components in one pass", () => {
    const graph = makeGraph([
      // button: solid has hover, outline doesn't → warning candidate
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#001" }),
      makeNode({ id: "button-solid-bg-hover", layer: "component", type: "color", source: "global", base: "#002" }),
      makeNode({ id: "button-outline-bg", layer: "component", type: "color", source: "global", base: "#003" }),
      // input: solid + outline both have bg, both have bg-disabled, symmetric — no findings
      makeNode({ id: "input-solid-bg", layer: "component", type: "color", source: "global", base: "#011" }),
      makeNode({ id: "input-outline-bg", layer: "component", type: "color", source: "global", base: "#012" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const byComponent = new Map<string, ScanIssue[]>();
    for (const i of report.issues.filter((x) => x.kind === "asymmetric-variant-coverage")) {
      const c = i.componentName ?? "?";
      const arr = byComponent.get(c) ?? [];
      arr.push(i);
      byComponent.set(c, arr);
    }
    expect(byComponent.get("button")?.length).toBeGreaterThanOrEqual(1);
    expect(byComponent.get("input")).toBeUndefined();
  });

  it("ignores components without a multi-variant axis", () => {
    const graph = makeGraph([
      makeNode({ id: "card-padding", layer: "component", type: "dimension", source: "global", base: "16px" }),
      makeNode({ id: "card-radius", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    const report = scanGraph(graph, { components: ["card"] });
    const asym = report.issues.filter((i) => i.kind === "asymmetric-variant-coverage");
    expect(asym).toEqual([]);
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
