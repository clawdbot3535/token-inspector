import { describe, it, expect } from "vitest";
import { scanGraph, customPartsByComponent } from "./scanner.js";
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

  it("flags orphaned size key when a size appears on fewer utilities than its siblings", () => {
    // padding-x covers sm/md/lg; gap covers sm/md/lg/xl → xl appears on only
    // one utility while sm/md/lg appear on two, so xl is the orphan.
    const graph = makeGraph([
      makeNode({ id: "button-padding-x-sm", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "12px" }),
      makeNode({ id: "button-gap-sm", layer: "component", type: "dimension", source: "global", base: "2px" }),
      makeNode({ id: "button-gap-md", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "button-gap-lg", layer: "component", type: "dimension", source: "global", base: "6px" }),
      makeNode({ id: "button-gap-xl", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const orphan = report.issues.find((i: ScanIssue) => i.kind === "orphaned-size-key");
    expect(orphan).toBeDefined();
    expect(orphan?.variantKey).toBe("xl");
  });

  // Regression: with a single size-bearing utility there is no cross-utility
  // comparison, so no size is an orphan. The old `maxSizeCount === 1` arm
  // flagged every size here (a false positive on any single-utility component).
  it("does NOT flag orphaned size keys for a single size-bearing utility", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x-xs", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "12px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const orphan = report.issues.find((i: ScanIssue) => i.kind === "orphaned-size-key");
    expect(orphan).toBeUndefined();
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

  it("flags a semantic token defined for only one mode (would render in both)", () => {
    // color-accent exists only in dark.tokens.json → classified theme-static
    // with the dark value, emitted as a static @theme entry, so it shows the
    // dark colour in light mode too.
    const graph = makeGraph([
      makeNode({ id: "color-accent", layer: "semantic", type: "color", source: "dark", dark: "#112233" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "single-mode-semantic");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("warning");
    expect(hint?.tokenIds).toContain("color-accent");
    expect(hint?.message).toContain("dark mode only");
  });

  it("does not flag a normal dual-mode semantic token", () => {
    const graph = makeGraph([
      makeNode({ id: "color-bg", layer: "semantic", type: "color", source: "light", light: "#fff", dark: "#000" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const hint = report.issues.find((i: ScanIssue) => i.kind === "single-mode-semantic");
    expect(hint).toBeUndefined();
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
    // Use a value that is genuinely NOT a Tailwind spacing default. 6px is
    // now p-1.5 (after the half-steps fix), 4px is p-1, 8px is p-2 — so 7px is
    // between defaults and triggers the snap suggestion routed to p-*.
    const graph = makeGraph([
      makeNode({
        id: "spacing-custom",
        layer: "primitive",
        type: "dimension",
        source: "dimension",
        base: "7px",
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

describe("scanGraph — validation-color-via-prop (D3)", () => {
  it("warns for a dropped <comp>-border-<validation-role> token", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-error", layer: "component", type: "color", source: "global", base: "#EF4444" }),
    ]);
    const vc = scanGraph(graph, { components: ["input"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(1);
    expect(vc[0]).toMatchObject({
      severity: "warning",
      category: "classification-hint",
      tokenIds: ["input-border-error"],
      componentName: "input",
    });
  });

  it("also warns for a -border-success token", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-success", layer: "component", type: "color", source: "global", base: "#22C55E" }),
    ]);
    const vc = scanGraph(graph, { components: ["input"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(1);
  });

  it("does NOT warn for a non-validation dropped token", () => {
    const graph = makeGraph([
      makeNode({ id: "input-mystery-token", layer: "component", type: "color", source: "global", base: "#000000" }),
    ]);
    const vc = scanGraph(graph, { components: ["input"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(0);
  });

  it("warns for the warning role too", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-warning", layer: "component", type: "color", source: "global", base: "#F59E0B" }),
    ]);
    const vc = scanGraph(graph, { components: ["input"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(1);
  });

  it("does NOT warn for tokens outside the dropped border-role form (input-border, badge-error-border)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border", layer: "component", type: "color", source: "global", base: "#D4D4D8" }),
      makeNode({ id: "badge-error-border", layer: "component", type: "color", source: "global", base: "#FCA5A5" }),
    ]);
    const vc = scanGraph(graph, { components: ["input", "badge"] }).issues
      .filter((i) => i.kind === "validation-color-via-prop");
    expect(vc).toHaveLength(0);
  });
});

describe("scanGraph — D2c border-on-unframed-variant hint", () => {
  function unframed(base: string) {
    return makeGraph([
      makeNode({ id: "button-solid-border", layer: "component", type: "color", source: "global", base }),
    ]);
  }

  it("flags an opaque border on the solid (unframed) variant", () => {
    const report = scanGraph(unframed("#4F63D2"), { components: ["button"] });
    const hint = report.issues.find((i) => i.kind === "border-on-unframed-variant");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("hint");
    expect(hint?.componentName).toBe("button");
    expect(hint?.tokenIds).toContain("button-solid-border");
  });

  it("does not flag a transparent placeholder border", () => {
    const report = scanGraph(unframed("rgba(0, 0, 0, 0)"), { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "border-on-unframed-variant")).toBeUndefined();
  });

  it("flags an opaque rgb() border even when blue is zero", () => {
    const report = scanGraph(unframed("rgb(0, 0, 0)"), { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "border-on-unframed-variant")).toBeDefined();
  });

  it("flags a fully-opaque rgba(...,1) border", () => {
    const report = scanGraph(unframed("rgba(79, 99, 210, 1)"), { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "border-on-unframed-variant")).toBeDefined();
  });

  it("does not flag the outline (framed) variant border", () => {
    const graph = makeGraph([
      makeNode({ id: "button-outline-border", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "border-on-unframed-variant")).toBeUndefined();
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

describe("scanGraph — prop-driven state hint (capability)", () => {
  it("flags input-border-active as applied via the highlight prop", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-active", layer: "component", type: "color", source: "global", base: "#8A9DDB" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    const hint = report.issues.find((i) => i.kind === "state-via-prop");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("warning");
    expect(hint?.componentName).toBe("input");
    expect(hint?.message).toContain("highlight");
    expect(hint?.tokenIds).toContain("input-border-active");
  });

  it("flags textarea-border-active as applied via the highlight prop", () => {
    const graph = makeGraph([
      makeNode({ id: "textarea-border-active", layer: "component", type: "color", source: "global", base: "#8A9DDB" }),
    ]);
    const report = scanGraph(graph, { components: ["textarea"] });
    const hint = report.issues.find((i) => i.kind === "state-via-prop");
    expect(hint).toBeDefined();
    expect(hint?.componentName).toBe("textarea");
    expect(hint?.message).toContain("highlight");
  });

  it("does not flag input-border-focus (real pseudo-class state)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-focus", layer: "component", type: "color", source: "global", base: "#6F82C2" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    expect(report.issues.find((i) => i.kind === "state-via-prop")).toBeUndefined();
  });

  it("still flags input-border-error as a validation colour, not state-via-prop", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-error", layer: "component", type: "color", source: "global", base: "#E64041" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    expect(report.issues.find((i) => i.kind === "validation-color-via-prop")).toBeDefined();
    expect(report.issues.find((i) => i.kind === "state-via-prop")).toBeUndefined();
  });
});

describe("scanGraph — unsupported-part hint (slot inventory)", () => {
  it("flags chip label/close parts (Nuxt chip has no such slot), not bg", () => {
    const graph = makeGraph([
      makeNode({ id: "chip-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
      makeNode({ id: "chip-label-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
      makeNode({ id: "chip-label-text-disabled", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
      makeNode({ id: "chip-close-icon", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const report = scanGraph(graph, { components: ["chip"] });
    const ups = report.issues.filter((i) => i.kind === "unsupported-part");
    expect(ups.map((i) => i.id).sort()).toEqual(["up-chip-close", "up-chip-label"]);
    const labelHit = ups.find((i) => i.id === "up-chip-label")!;
    expect(labelHit.severity).toBe("warning");
    expect(labelHit.componentName).toBe("chip");
    expect(labelHit.message).toContain("label");
    expect(labelHit.tokenIds).toContain("chip-label-text");
    // bg is a mapped utility → never flagged as a part
    expect(report.issues.find((i) => i.kind === "unsupported-part" && i.id === "up-chip-bg")).toBeUndefined();
  });

  it("does not flag a part that IS a Nuxt slot (dropdown item)", () => {
    const graph = makeGraph([
      makeNode({ id: "dropdown-item-padding", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "dropdown-item-hover-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
    ]);
    const report = scanGraph(graph, { components: ["dropdown"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part")).toBeUndefined();
  });

  it("does not flag a validation combo on a mapped utility segment (checkbox-bg-error)", () => {
    const graph = makeGraph([
      makeNode({ id: "checkbox-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "checkbox-bg-error", layer: "component", type: "color", source: "global", base: "#E64041" }),
    ]);
    const report = scanGraph(graph, { components: ["checkbox"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part")).toBeUndefined();
  });

  it("skips an uninventoried component (no NUXT_SLOTS entry)", () => {
    const graph = makeGraph([
      makeNode({ id: "widget-thing-color", layer: "component", type: "color", source: "global", base: "#000000" }),
    ]);
    const report = scanGraph(graph, { components: ["widget"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part")).toBeUndefined();
  });

  it("emits one hint per part across multiple tokens", () => {
    const graph = makeGraph([
      makeNode({ id: "chip-label-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
      makeNode({ id: "chip-label-text-disabled", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const report = scanGraph(graph, { components: ["chip"] });
    const labelHits = report.issues.filter((i) => i.kind === "unsupported-part" && i.id === "up-chip-label");
    expect(labelHits).toHaveLength(1);
    expect(labelHits[0]!.tokenIds.length).toBeGreaterThanOrEqual(2);
  });

  it("does not flag utility/state/dimension 2nd-segments (over-fire fix)", () => {
    const graph = makeGraph([
      makeNode({ id: "checkbox-base-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "checkbox-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
      makeNode({ id: "checkbox-checked", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
    ]);
    const report = scanGraph(graph, { components: ["checkbox"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part" && (i.id === "up-checkbox-size" || i.id === "up-checkbox-checked"))).toBeUndefined();
  });

  it("suggests the Nuxt slot name for a known naming mismatch (table row → tr)", () => {
    const graph = makeGraph([
      makeNode({ id: "table-base-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "table-row-hover-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
    ]);
    const report = scanGraph(graph, { components: ["table"] });
    const hit = report.issues.find((i) => i.kind === "unsupported-part" && i.id === "up-table-row");
    expect(hit).toBeDefined();
    expect(hit!.message).toContain("`tr`");
    expect(hit!.message.toLowerCase()).toContain("rename");
  });
});

describe("scanGraph — capability-gap hint (paired-slot asymmetry)", () => {
  // UPDATED: icon-size fills leadingIcon which now mirrors to trailingIcon — no gap should fire.
  it("does NOT flag trailingIcon when icon-size fills leadingIcon (mirror suppresses it)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-icon-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
      makeNode({ id: "button-bg", layer: "component", type: "color", source: "global", base: "#111111" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const gaps = report.issues.filter((i) => i.kind === "capability-gap");
    expect(gaps.some((g) => /trailingIcon/.test(g.message ?? ""))).toBe(false);
  });

  it("does not flag a capability gap without an icon-size token", () => {
    const graph = makeGraph([
      makeNode({ id: "button-bg", layer: "component", type: "color", source: "global", base: "#222222" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "capability-gap")).toBeUndefined();
  });

  it("skips a component with no NUXT_SLOTS entry", () => {
    const graph = makeGraph([
      makeNode({ id: "widget-icon-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const report = scanGraph(graph, { components: ["widget"] });
    expect(report.issues.find((i) => i.kind === "capability-gap")).toBeUndefined();
  });

  it("emits one capability-gap per (component, slot) across multiple icon tokens", () => {
    const graph = makeGraph([
      makeNode({ id: "button-icon-size-sm", layer: "component", type: "dimension", source: "global", base: "12px" }),
      makeNode({ id: "button-icon-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    // With mirror: leadingIcon fills trailingIcon too — no trailingIcon gap
    expect(
      report.issues.filter((i) => i.kind === "capability-gap" && i.id === "cg-button-trailingIcon"),
    ).toHaveLength(0);
  });

  it("does not flag a trailingIcon capability-gap when icon-size fills leadingIcon (mirrored)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-icon-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
      makeNode({ id: "button-bg", layer: "component", type: "color", source: "global", base: "#333333" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const gaps = report.issues.filter((i) => i.kind === "capability-gap");
    expect(gaps.some((g) => /trailingIcon/.test(g.message ?? ""))).toBe(false);
  });

  it("still flags the reverse direction (explicit trailing token, no leading)", () => {
    // "button-trailingIcon-icon-size-md" routes to trailingIcon via sub-element routing.
    // No leadingIcon token present → mirror is one-way (source→partner only) → leadingIcon gap fires.
    const graph = makeGraph([
      makeNode({ id: "button-trailingIcon-icon-size-md", layer: "component", type: "dimension", source: "global", base: "16px" }),
      makeNode({ id: "button-bg", layer: "component", type: "color", source: "global", base: "#444444" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const gaps = report.issues.filter((i) => i.kind === "capability-gap");
    expect(gaps.some((g) => /leadingIcon/.test(g.message ?? ""))).toBe(true);
  });
});

describe("scanGraph — component-looks-custom hint (part-based divergence flag)", () => {
  it("flags a component with a genuinely-foreign part as looks-custom", () => {
    // `close` is not a chip Nuxt slot, not a NON_PART word, and has no rename alias.
    const graph = makeGraph([
      makeNode({ id: "chip-close-bg", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const report = scanGraph(graph, { components: ["chip"] });
    const clc = report.issues.filter((i) => i.kind === "component-looks-custom");
    expect(clc).toHaveLength(1);
    expect(clc[0]!.componentName).toBe("chip");
    expect(clc[0]!.message).toContain("close");
  });

  it("does NOT flag looks-custom for an aliasable mismatch (dot → indicator)", () => {
    // `dot` IS in FIGMA_NUXT_PART_ALIAS → rename candidate, not custom.
    const graph = makeGraph([
      makeNode({ id: "radio-dot-color", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
    ]);
    const report = scanGraph(graph, { components: ["radio"] });
    expect(report.issues.filter((i) => i.kind === "component-looks-custom")).toHaveLength(0);
  });

  it("does NOT flag a fully-mapped component as looks-custom", () => {
    // button-bg maps cleanly → no null tokens → no foreign parts.
    const graph = makeGraph([
      makeNode({ id: "button-bg", layer: "component", type: "color", source: "global", base: "#4F63D2" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.issues.filter((i) => i.kind === "component-looks-custom")).toHaveLength(0);
  });

  it("component-looks-custom issue carries its foreign parts", () => {
    const graph = makeGraph([
      makeNode({ id: "chip-label-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
      makeNode({ id: "chip-close-bg", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const report = scanGraph(graph, { components: ["chip"] });
    const clc = report.issues.find((i) => i.kind === "component-looks-custom" && i.componentName === "chip");
    expect(clc).toBeDefined();
    expect(clc!.customParts).toEqual(expect.arrayContaining(["label", "close"]));
  });

  it("customPartsByComponent derives a component→parts map from a report", () => {
    const graph = makeGraph([
      makeNode({ id: "chip-label-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
      makeNode({ id: "chip-close-bg", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const report = scanGraph(graph, { components: ["chip"] });
    const map = customPartsByComponent(report);
    expect(map.get("chip")).toEqual(expect.arrayContaining(["label", "close"]));
  });
});
