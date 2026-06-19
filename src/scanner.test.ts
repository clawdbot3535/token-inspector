import { describe, it, expect } from "vitest";
import { scanGraph, customPartsByComponent, componentCollections, declaredCustomComponents } from "./scanner.js";
import { KNOWN_CUSTOM_COMPONENTS } from "@tg/grammar";
import { detectPossibleTypos } from "./data-quality.js";
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

  it("maps input-border-error now (no state-via-prop, no validation warning)", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-error", layer: "component", type: "color", source: "global", base: "#E64041" }),
    ]);
    const report = scanGraph(graph, { components: ["input"] });
    expect(report.issues.find((i) => i.kind === "state-via-prop")).toBeUndefined();
    expect(report.issues.find((i) => i.kind === "validation-color-via-prop")).toBeUndefined();
  });
  it("flags nav-item-outline-bg-active as applied via the active variant/prop", () => {
    const graph = makeGraph([
      makeNode({ id: "nav-item-outline-bg-active", layer: "component", type: "color", source: "global", base: "#5667A7" }),
    ]);
    const report = scanGraph(graph, { components: ["nav"] });
    const hint = report.issues.find((i) => i.kind === "state-via-prop");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("warning");
    expect(hint?.componentName).toBe("nav");
    expect(hint?.message).toContain("active");
    expect(hint?.tokenIds).toContain("nav-item-outline-bg-active");
  });
});

describe("scanGraph — unsupported-state hint (stateless components)", () => {
  it("flags kbd-bg-active as an unsupported state (kbd is stateless)", () => {
    const graph = makeGraph([
      makeNode({ id: "kbd-bg-active", layer: "component", type: "color", source: "global", base: "#27272A" }),
    ]);
    const report = scanGraph(graph, { components: ["kbd"] });
    const hint = report.issues.find((i) => i.kind === "unsupported-state");
    expect(hint).toBeDefined();
    expect(hint?.severity).toBe("warning");
    expect(hint?.componentName).toBe("kbd");
    expect(hint?.message).toContain("stateless");
    expect(hint?.tokenIds).toContain("kbd-bg-active");
  });

  it("does not flag button-solid-bg-active as unsupported-state (button has :active)", () => {
    const graph = makeGraph([
      makeNode({ id: "button-solid-bg-active", layer: "component", type: "color", source: "global", base: "#5667A7" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.issues.find((i) => i.kind === "unsupported-state")).toBeUndefined();
  });

  it("does not flag kbd-bg (a non-state kbd token maps, never reaching the null branch)", () => {
    const graph = makeGraph([
      makeNode({ id: "kbd-bg", layer: "component", type: "color", source: "global", base: "#27272A" }),
    ]);
    const report = scanGraph(graph, { components: ["kbd"] });
    expect(report.issues.find((i) => i.kind === "unsupported-state")).toBeUndefined();
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

  it("does not flag an aliased-routable part (table row → tr); the grammar routes it", () => {
    const graph = makeGraph([
      makeNode({ id: "table-base-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
      makeNode({ id: "table-row-hover-bg", layer: "component", type: "color", source: "global", base: "#F4F4F5" }),
    ]);
    const report = scanGraph(graph, { components: ["table"] });
    expect(report.issues.find((i) => i.kind === "unsupported-part" && i.id === "up-table-row")).toBeUndefined();
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

  it("does not flag a normal component as custom just because it has overlay tokens", () => {
    // overlay is a context/structuring segment (e.g. button-overlay-dark-solid-bg),
    // not a foreign Nuxt slot — NON_PART_SEGMENTS must include it.
    const graph = makeGraph([
      makeNode({ id: "button-solid-bg", layer: "component", type: "color", source: "global", base: "#5667A7" }),
      makeNode({ id: "button-overlay-dark-solid-bg", layer: "component", type: "color", source: "global", base: "#FAFAFA" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const flagged = report.issues.find((i) => i.kind === "component-looks-custom" && i.componentName === "button");
    expect(flagged).toBeUndefined();
  });
});

describe("detectPossibleTypos", () => {
  it("flags a one-off misspelled segment with a suggestion", () => {
    // `heading` recurs (freq 3) so it is treated as intentional vocab; only the
    // one-off `heigth` on heading-2 is flagged.
    const graph = makeGraph([
      makeNode({ id: "typography-heading-1-line-height", layer: "semantic", type: "dimension", source: "global", base: "40px" }),
      makeNode({ id: "typography-heading-2-line-heigth", layer: "semantic", type: "dimension", source: "global", base: "32px" }),
      makeNode({ id: "typography-heading-3-line-height", layer: "semantic", type: "dimension", source: "global", base: "28px" }),
    ]);
    const issues = detectPossibleTypos(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "possible-typo",
      severity: "warning",
      category: "data-quality",
      tokenIds: ["typography-heading-2-line-heigth"],
    });
    expect(issues[0]!.message).toContain("height");
  });

  it("does not flag `heading` as `leading` when it recurs (frequency guard)", () => {
    const graph = makeGraph([
      makeNode({ id: "typography-heading-1-font-size", layer: "semantic", type: "dimension", source: "global", base: "32px" }),
      makeNode({ id: "typography-heading-2-font-size", layer: "semantic", type: "dimension", source: "global", base: "28px" }),
      makeNode({ id: "typography-heading-3-font-size", layer: "semantic", type: "dimension", source: "global", base: "24px" }),
    ]);
    expect(detectPossibleTypos(graph)).toHaveLength(0);
  });

  it("ignores correctly-spelled, numeric and short segments", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "color-primary-500", layer: "primitive", type: "color", source: "global", base: "#abc" }),
    ]);
    expect(detectPossibleTypos(graph)).toHaveLength(0);
  });

  it("notes when the corrected token already exists", () => {
    const graph = makeGraph([
      makeNode({ id: "input-border-radius", layer: "component", type: "dimension", source: "global", base: "4px" }),
      makeNode({ id: "input-border-raduis", layer: "component", type: "dimension", source: "global", base: "4px" }),
    ]);
    const issues = detectPossibleTypos(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("already exists");
  });

  it("scanGraph surfaces possible-typo issues", () => {
    const graph = makeGraph([
      makeNode({ id: "typography-heading-1-line-height", layer: "semantic", type: "dimension", source: "global", base: "40px" }),
      makeNode({ id: "typography-heading-2-line-heigth", layer: "semantic", type: "dimension", source: "global", base: "32px" }),
      makeNode({ id: "typography-heading-3-line-height", layer: "semantic", type: "dimension", source: "global", base: "28px" }),
    ]);
    const report = scanGraph(graph, { components: [] });
    expect(report.issues.some((i) => i.kind === "possible-typo")).toBe(true);
  });

  it("flags the spaching->spacing real-world typo", () => {
    const graph = makeGraph([
      makeNode({ id: "badge-letter-spaching", layer: "component", type: "dimension", source: "global", base: "0.5px" }),
    ]);
    const issues = detectPossibleTypos(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("spacing");
  });
});

describe("scanGraph — non-component prefixes (Bucket E)", () => {
  it("splits layout/type-scale primitives out of the unmapped list", () => {
    const graph = makeGraph([
      makeNode({ id: "typography-body-color", layer: "component", type: "color", source: "global", base: "#18181B" }),
      makeNode({ id: "grid-gap-sm", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "sidebar-item-bg", layer: "component", type: "color", source: "global", base: "#FFFFFF" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    expect(report.forecast.nonComponentPrefixes).toEqual(["grid", "typography"]);
    expect(report.forecast.unmappedComponentPrefixes).toContain("sidebar");
    expect(report.forecast.unmappedComponentPrefixes).not.toContain("typography");
    expect(report.forecast.unmappedComponentPrefixes).not.toContain("grid");
  });
});

describe("customPartsByComponent — known-custom registry (sidebar)", () => {
  it("seeds sidebar even with no scanner flags", () => {
    const map = customPartsByComponent({ issues: [] });
    expect(map.get("sidebar")).toEqual(["item"]);
  });

  it("includes both a registry component and a scanner-flagged one", () => {
    const graph = makeGraph([
      makeNode({ id: "chip-label-text", layer: "component", type: "color", source: "global", base: "#52525B" }),
      makeNode({ id: "chip-close-bg", layer: "component", type: "color", source: "global", base: "#A1A1AA" }),
    ]);
    const map = customPartsByComponent(scanGraph(graph, { components: ["chip"] }));
    expect(map.get("sidebar")).toEqual(["item"]);
    expect(map.get("chip")).toEqual(expect.arrayContaining(["label", "close"]));
  });
});

describe("customPartsByComponent — declaredCustom membership", () => {
  it("adds a declared-custom component as a membership-only entry ([] parts)", () => {
    const map = customPartsByComponent({ issues: [] }, new Set(["fancywidget"]));
    expect(map.has("fancywidget")).toBe(true);
    expect([...(map.get("fancywidget") ?? [])]).toEqual([]);
  });

  it("does not clobber a component-looks-custom component's parts", () => {
    const report = { issues: [
      { id: "clc-chip", category: "classification-hint", severity: "hint",
        kind: "component-looks-custom", componentName: "chip", customParts: ["close", "label"],
        message: "", tokenIds: [] },
    ] } as unknown as { issues: ScanIssue[] };
    const map = customPartsByComponent(report, new Set(["chip"]));
    expect([...(map.get("chip") ?? [])].sort()).toEqual(["close", "label"]);
  });

  it("is backward-compatible without the declaredCustom arg", () => {
    expect(customPartsByComponent({ issues: [] }).size).toBe(KNOWN_CUSTOM_COMPONENTS.size);
  });
});

describe("componentCollections / declaredCustomComponents", () => {
  function gWithCollections() {
    return makeGraph([
      { ...makeNode({ id: "sidebar-width", layer: "component", type: "number", source: "global" }), collection: "components/custom" },
      { ...makeNode({ id: "sidebar-item-text", layer: "component", type: "color", source: "global", base: "#fff" }), collection: "components/custom" },
      { ...makeNode({ id: "button-bg", layer: "component", type: "color", source: "global", base: "#000" }), collection: "components/global" },
    ]);
  }

  it("maps each component to its collection", () => {
    const m = componentCollections(gWithCollections());
    expect(m.get("sidebar")).toBe("components/custom");
    expect(m.get("button")).toBe("components/global");
  });

  it("declaredCustomComponents = components in components/custom", () => {
    const set = declaredCustomComponents(gWithCollections());
    expect([...set]).toEqual(["sidebar"]);
  });
});

describe("scanGraph — collection/anatomy disagreement", () => {
  function clcNode(id: string, collection: string) {
    return { ...makeNode({ id, layer: "component", type: "color", source: "global", base: "#fff" }), collection };
  }

  it("flags a component that looks custom but is declared components/global (chip-like)", () => {
    const graph = makeGraph([clcNode("chip-close-bg", "components/global")]);
    const report = scanGraph(graph, { components: ["chip"] });
    const m = report.issues.find((i) => i.kind === "collection-anatomy-mismatch");
    expect(m).toBeDefined();
    expect(m?.severity).toBe("warning");
    expect(m?.componentName).toBe("chip");
    expect(m?.message).toContain("components/custom");
  });

  it("does NOT flag a looks-custom component already declared components/custom", () => {
    const graph = makeGraph([clcNode("chip-close-bg", "components/custom")]);
    const report = scanGraph(graph, { components: ["chip"] });
    expect(report.issues.find((i) => i.kind === "collection-anatomy-mismatch")).toBeUndefined();
  });

  it("flags a declared-custom component with no derivable parts (custom-without-parts)", () => {
    const graph = makeGraph([clcNode("fancywidget-bg", "components/custom")]);
    const report = scanGraph(graph, { components: ["fancywidget"] });
    const w = report.issues.find((i) => i.kind === "custom-without-parts");
    expect(w).toBeDefined();
    expect(w?.componentName).toBe("fancywidget");
  });
});
