# Tailwind-Utility-First — PR 4: Token Scan + Smart Recipe Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Promote the Inspector's quality-feedback surface from a hidden side panel to a first-class scan view that runs automatically after every token import. Make the recipe engine smarter so it stops dumping `button.padding-y` into `slots.base` while leaving `button.padding-x-md` in `variants.size.md`. Add a configurable `slot-mapping.json` override file. Ship as v0.4.0.

**Architecture:** A new `src/scanner.ts` module aggregates four categories of issues (data-quality, classification-hint, build-time, output-forecast) into a structured `ScanReport`. The recipe engine grows a two-pass walk: pass 1 detects which utility types have size variants in the graph, pass 2 reassigns non-suffix tokens to the configurable default size (typically `md`) instead of `slots.base`. The Inspector gains a `ScanView.vue` component with a permanent header status strip; the existing `IssuesView.vue` is folded into it. LiveButton shows a `n/m` partial badge per size variant.

**Tech Stack:** TypeScript strict + `noUncheckedIndexedAccess: true`, Vitest (table-driven + snapshot), Vue 3 Composition API, Tailwind v4, Nuxt UI v4, Node 22+ with `tsx`.

**Spec:** `docs/superpowers/specs/2026-05-20-tailwind-utility-first-tokens-design.md` (commit `82c871b` with the PR 4 expansion).

**Prerequisites:** PR 2 merged on commit `a9f901b`. v0.3.0 tag + GitHub release shipped. 135 tests pass. Branch from `main`.

---

## File Structure

### New files

- `src/scanner.ts` — Aggregates `GraphIssue`s + new categories + completeness scores + output forecast into a single `ScanReport`.
- `src/scanner.test.ts` — Table-driven tests per scan category.
- `src/slot-mapping-loader.ts` — Loads optional `slot-mapping.json` from project root.
- `src/slot-mapping-loader.test.ts` — Loader tests.
- `src/app/components/ScanView.vue` — Categorized accordion view; replaces the standalone IssuesView call site in App.vue.
- `src/app/components/HeaderStatusStrip.vue` — Permanent compact strip at the top of the inspector showing scan counts.

### Modified files

- `src/token-graph.ts` — Extend `GraphIssue` to carry severity + category mapping (or add a new `ScanIssue` type alongside; pick whichever survives type-narrow checks cleanest in `src/scanner.ts`).
- `src/recipe-engine.ts` — Two-pass walk: pre-scan to detect utility-types with size variants, then assign non-suffix tokens to the default size. Conflict detection.
- `src/renderers/app-config.ts` — Emit completeness comments per incomplete variant.
- `scripts/build-cli.ts` — Read `slot-mapping.json` from repo root (if present) and pass override + default-size config into `buildComponentRecipes`.
- `src/app/state.ts` — Add `scanReport` ref to app state; replace standalone `view: 'inspector' | 'issues'` mode with `'inspector' | 'scan'`.
- `src/app/App.vue` — Mount `HeaderStatusStrip`. Replace `IssuesView` mount with `ScanView`. Compute reactive `ScanReport` via composable.
- `src/app/composables/use-scan-report.ts` (new) — Reactive composable wrapping `scanGraph(state.graph.value)`.
- `src/app/components/LiveButton.vue` — Show `n/m` partial badge per size cell, derived from the scan report's completeness scores.
- `README.md` — Document the Scan view and `slot-mapping.json` config.
- `CHANGELOG.md` — v0.4.0 entry.
- `package.json` + `package-lock.json` — Version bump.

### Deleted / replaced

- `src/app/components/IssuesView.vue` — Functionality absorbed into `ScanView.vue`. Delete after the new view is wired and verified.

---

## Phase N — Scanner module + Engine improvements

### Task 1: Scanner type contract

**Files:**
- Modify: `src/token-graph.ts` (add `ScanIssue`, `ScanReport`, etc. types)

**Context:** The existing `GraphIssue` interface carries only build-time errors. PR 4 needs a richer issue type that supports severity, category, and structured affected-tokens lists. We keep `GraphIssue` for the builder's internal use and add `ScanIssue` as the user-facing report type. The scanner upgrades `GraphIssue` entries into `ScanIssue` entries in the build-time category.

- [ ] **Step 1: Add scan types to token-graph.ts**

Append to `src/token-graph.ts` (after the existing `GraphIssue` block):

```ts
// ---------- Scanner report types (PR 4) ----------

export type ScanSeverity = "error" | "warning" | "hint";

export type ScanCategory =
  | "data-quality"
  | "classification-hint"
  | "build-time";

export interface ScanIssue {
  /** Stable id for UI keying and click-to-highlight. */
  id: string;
  category: ScanCategory;
  severity: ScanSeverity;
  /** Sub-kind within category. Used for grouping in the UI. */
  kind: string;
  /** Human-readable message. */
  message: string;
  /** Token ids affected by this issue. */
  tokenIds: readonly string[];
  /** Component name when the issue is component-scoped. */
  componentName?: string;
  /** Variant key (e.g. "sm") when the issue is variant-scoped. */
  variantKey?: string;
}

export interface CompletenessScore {
  component: string;
  axis: "size" | "color" | "state";
  variantKey: string;
  defined: number;
  total: number;
  missingUtilities: readonly string[];
}

export interface OutputForecast {
  tokensCss: {
    estimatedBytes: number;
    tailwindMatches: number;
    themeExtensions: number;
    modeVariantEntries: number;
  };
  components: ReadonlyArray<{
    name: string;
    inAllowList: boolean;
    variants: readonly CompletenessScore[];
  }>;
  unmappedComponentPrefixes: readonly string[];
}

export interface ScanReport {
  issues: readonly ScanIssue[];
  completeness: readonly CompletenessScore[];
  forecast: OutputForecast;
  /** When the scan was produced (epoch ms). Used for cache busting in UI. */
  generatedAt: number;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS. No existing code uses these new types yet.

- [ ] **Step 3: Commit**

```bash
git add src/token-graph.ts
git commit -m "feat: add ScanIssue/ScanReport types to token-graph"
```

---

### Task 2: Scanner module — data quality + classification hints

**Files:**
- Create: `src/scanner.ts`
- Create: `src/scanner.test.ts`

**Context:** The scanner takes a `TokenGraph` and produces a `ScanReport`. It runs five passes:

1. Build-time issues from `graph.issues` → wrapped as `ScanIssue` (category `build-time`, severity `error`).
2. Data-quality: detect incomplete variants, asymmetric coverage, non-suffix vs size conflicts, orphaned size keys.
3. Classification hints: snap-to-Tailwind candidates, mode-invariant tokens in semantic layer, component tokens referencing mode-variant semantics.
4. Completeness scoring per component/variant.
5. Output forecast (predicted bytes, Tailwind matches, etc.).

For PR 4, the scanner is allow-list scoped (currently `['button']`) just like the recipe engine.

- [ ] **Step 1: Write the failing tests**

Create `src/scanner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scanGraph } from "./scanner.js";
import type {
  TokenGraph,
  TokenNode,
  GraphLayer,
  TokenType,
  SourceLayer,
  Theme,
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
    meta: { builtAt: "2026-05-21T00:00:00Z", builderVersion: "test" },
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
    const buildTime = report.issues.filter((i) => i.category === "build-time");
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
      // padding-y for sm and lg deliberately missing
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const dq = report.issues.filter((i) => i.category === "data-quality" && i.kind === "incomplete-size-variant");
    expect(dq.length).toBeGreaterThan(0);
    // sm and lg both missing padding-y
    const smIssue = dq.find((i) => i.variantKey === "sm");
    const lgIssue = dq.find((i) => i.variantKey === "lg");
    expect(smIssue?.message).toContain("padding-y");
    expect(lgIssue?.message).toContain("padding-y");
  });

  it("flags non-suffix vs size-suffix conflict when values differ", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x", layer: "component", type: "dimension", source: "global", base: "6px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const conflict = report.issues.find((i) => i.kind === "non-suffix-vs-size-conflict");
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe("warning");
    expect(conflict?.tokenIds).toContain("button-padding-x");
    expect(conflict?.tokenIds).toContain("button-padding-x-md");
  });

  it("flags asymmetric size coverage when only some sizes have a utility", () => {
    const graph = makeGraph([
      makeNode({ id: "button-gap-xs", layer: "component", type: "dimension", source: "global", base: "2px" }),
      makeNode({ id: "button-gap-sm", layer: "component", type: "dimension", source: "global", base: "4px" }),
      // gap-md and gap-lg missing
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "12px" }),
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const asym = report.issues.find((i) => i.kind === "asymmetric-size-coverage");
    expect(asym).toBeDefined();
    expect(asym?.message).toContain("gap");
  });

  it("flags orphaned size key when a size suffix appears on exactly one token", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
      makeNode({ id: "button-padding-x-lg", layer: "component", type: "dimension", source: "global", base: "12px" }),
      makeNode({ id: "button-padding-x-xs", layer: "component", type: "dimension", source: "global", base: "4px" }),
      // xs is orphaned — only one token uses it
    ]);
    const report = scanGraph(graph, { components: ["button"] });
    const orphan = report.issues.find((i) => i.kind === "orphaned-size-key");
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
    const hint = report.issues.find((i) => i.kind === "mode-invariant-semantic");
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
    const hint = report.issues.find((i) => i.kind === "snap-to-tailwind");
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
    const md = report.completeness.find((c) => c.component === "button" && c.variantKey === "md");
    const sm = report.completeness.find((c) => c.component === "button" && c.variantKey === "sm");
    const lg = report.completeness.find((c) => c.component === "button" && c.variantKey === "lg");
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
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm test -- src/scanner.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the scanner**

Create `src/scanner.ts`:

```ts
// Aggregates data-quality + classification-hint + build-time issues
// into a single ScanReport. Allow-list scoped per component.

import type {
  TokenGraph,
  TokenNode,
  ScanIssue,
  ScanReport,
  CompletenessScore,
  OutputForecast,
} from "./token-graph.js";
import { classifyToken } from "./classify-token.js";
import { getSlotMapping } from "./slot-mapping.js";
import {
  matchSpacing,
  matchRadius,
  matchFontSize,
} from "./tailwind-defaults.js";

const SIZE_KEYS = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
const TAILWIND_NEIGHBOR_STEPS = 1; // how far from a default to suggest snap

export interface ScanOptions {
  components: ReadonlyArray<string>;
  remBase?: number;
}

export function scanGraph(graph: TokenGraph, options: ScanOptions): ScanReport {
  const issues: ScanIssue[] = [];
  const allowSet = new Set(options.components);

  // 1. Wrap build-time GraphIssues.
  for (const gi of graph.issues) {
    issues.push({
      id: `bt-${gi.kind}-${gi.nodeId ?? "global"}-${issues.length}`,
      category: "build-time",
      severity: "error",
      kind: gi.kind,
      message: gi.message,
      tokenIds: gi.nodeId ? [gi.nodeId] : [],
    });
  }

  // 2. Index component-layer tokens by component prefix.
  const componentTokens = new Map<string, TokenNode[]>();
  const allComponentPrefixes = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const prefix = node.id.split("-")[0];
    if (prefix === undefined) continue;
    allComponentPrefixes.add(prefix);
    if (!allowSet.has(prefix)) continue;
    const arr = componentTokens.get(prefix) ?? [];
    arr.push(node);
    componentTokens.set(prefix, arr);
  }

  // 3. Data-quality + completeness per component.
  const completeness: CompletenessScore[] = [];
  for (const [componentName, tokens] of componentTokens) {
    const utilitiesPerSize = new Map<string, Set<string>>();
    const utilityHasSizeVariants = new Map<string, Set<string>>();
    const utilityNonSuffixValue = new Map<string, { tokenId: string; value: string }>();
    const utilitySuffixValues = new Map<string, Map<string, { tokenId: string; value: string }>>();

    for (const node of tokens) {
      const mapping = getSlotMapping(node.id);
      if (!mapping) continue;
      const utility = mapping.utilityType;
      const variantKey = mapping.variantKey;
      const value = node.cssValue.base ?? node.cssValue.light ?? node.cssValue.dark ?? "";

      if (variantKey === null) {
        utilityNonSuffixValue.set(utility, { tokenId: node.id, value });
      } else {
        if (!utilitySuffixValues.has(utility)) utilitySuffixValues.set(utility, new Map());
        utilitySuffixValues.get(utility)!.set(variantKey, { tokenId: node.id, value });
        if (!utilityHasSizeVariants.has(utility)) utilityHasSizeVariants.set(utility, new Set());
        utilityHasSizeVariants.get(utility)!.add(variantKey);
        if (!utilitiesPerSize.has(variantKey)) utilitiesPerSize.set(variantKey, new Set());
        utilitiesPerSize.get(variantKey)!.add(utility);
      }
    }

    // Canonical utility set = union across sizes
    const canonicalUtilities = new Set<string>();
    for (const set of utilitiesPerSize.values()) {
      for (const u of set) canonicalUtilities.add(u);
    }

    // Non-suffix vs size-suffix conflict
    for (const [utility, nonSuffix] of utilityNonSuffixValue) {
      const sizeMap = utilitySuffixValues.get(utility);
      if (!sizeMap) continue;
      for (const [variantKey, sizeEntry] of sizeMap) {
        if (sizeEntry.value !== nonSuffix.value) {
          issues.push({
            id: `dq-conflict-${componentName}-${utility}-${variantKey}`,
            category: "data-quality",
            severity: "warning",
            kind: "non-suffix-vs-size-conflict",
            message: `${componentName}.${utility} (${nonSuffix.value}) conflicts with ${componentName}.${utility}-${variantKey} (${sizeEntry.value}). Size-specific value wins.`,
            tokenIds: [nonSuffix.tokenId, sizeEntry.tokenId],
            componentName,
          });
          break;
        }
      }
    }

    // Incomplete size variant + completeness score
    for (const variantKey of utilitiesPerSize.keys()) {
      const defined = utilitiesPerSize.get(variantKey) ?? new Set();
      const missing = Array.from(canonicalUtilities).filter((u) => !defined.has(u));
      completeness.push({
        component: componentName,
        axis: "size",
        variantKey,
        defined: defined.size,
        total: canonicalUtilities.size,
        missingUtilities: missing,
      });
      if (missing.length > 0) {
        issues.push({
          id: `dq-incomplete-${componentName}-${variantKey}`,
          category: "data-quality",
          severity: "warning",
          kind: "incomplete-size-variant",
          message: `${componentName}.${variantKey} is missing: ${missing.join(", ")}`,
          tokenIds: [],
          componentName,
          variantKey,
        });
      }
    }

    // Asymmetric size coverage — utility has some sizes but not all
    const allSizes = new Set<string>();
    for (const set of utilityHasSizeVariants.values()) {
      for (const k of set) allSizes.add(k);
    }
    for (const [utility, sizes] of utilityHasSizeVariants) {
      const missingSizes = Array.from(allSizes).filter((s) => !sizes.has(s));
      if (missingSizes.length > 0) {
        issues.push({
          id: `dq-asym-${componentName}-${utility}`,
          category: "data-quality",
          severity: "warning",
          kind: "asymmetric-size-coverage",
          message: `${componentName}.${utility} has sizes [${Array.from(sizes).join(", ")}] but other utilities also cover [${missingSizes.join(", ")}].`,
          tokenIds: [],
          componentName,
        });
      }
    }

    // Orphaned size keys — appears exactly once
    const sizeUseCount = new Map<string, number>();
    for (const sizes of utilityHasSizeVariants.values()) {
      for (const s of sizes) {
        sizeUseCount.set(s, (sizeUseCount.get(s) ?? 0) + 1);
      }
    }
    for (const [size, count] of sizeUseCount) {
      if (count === 1) {
        issues.push({
          id: `dq-orphan-${componentName}-${size}`,
          category: "data-quality",
          severity: "hint",
          kind: "orphaned-size-key",
          message: `${componentName}: size '${size}' appears on only one utility — possibly typo or unfinished pass.`,
          tokenIds: [],
          componentName,
          variantKey: size,
        });
      }
    }
  }

  // 4. Classification hints — mode-invariant in semantic, snap-to-tailwind
  for (const node of graph.nodes.values()) {
    // Mode-invariant in semantic layer
    if (
      (node.source === "light" || node.source === "dark") &&
      node.cssValue.light !== undefined &&
      node.cssValue.dark !== undefined &&
      node.cssValue.light === node.cssValue.dark
    ) {
      issues.push({
        id: `ch-mode-invariant-${node.id}`,
        category: "classification-hint",
        severity: "hint",
        kind: "mode-invariant-semantic",
        message: `${node.id} has identical light + dark values — consider moving to a primitive file.`,
        tokenIds: [node.id],
      });
    }

    // Snap-to-tailwind suggestion for non-matching primitive numerics
    if (
      node.layer === "primitive" &&
      (node.type === "dimension" || node.type === "number")
    ) {
      const value = node.cssValue.base;
      if (value === undefined) continue;
      const matchedSpacing = matchSpacing(value, options.remBase);
      if (matchedSpacing) continue; // exact match — no hint needed
      const suggestion = suggestNearestTailwind(value, options.remBase);
      if (suggestion) {
        issues.push({
          id: `ch-snap-${node.id}`,
          category: "classification-hint",
          severity: "hint",
          kind: "snap-to-tailwind",
          message: `${node.id} = ${value} is close to ${suggestion.utility} (${suggestion.value}) — consider snapping.`,
          tokenIds: [node.id],
        });
      }
    }
  }

  // 5. Output forecast
  const forecast = computeForecast(graph, allowSet, allComponentPrefixes, completeness);

  return {
    issues,
    completeness,
    forecast,
    generatedAt: Date.now(),
  };
}

function suggestNearestTailwind(
  value: string,
  remBase?: number,
): { utility: string; value: string } | null {
  // For PR 4, brute-force: check the immediate Tailwind spacing neighbors.
  const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (!pxMatch?.[1]) return null;
  const px = Number.parseFloat(pxMatch[1]);
  const candidates = [px - 1, px - 2, px + 1, px + 2];
  for (const c of candidates) {
    if (c <= 0) continue;
    const m = matchSpacing(`${c}px`, remBase);
    if (m) {
      return { utility: `p-${m}`, value: `${c}px` };
    }
  }
  return null;
}

function computeForecast(
  graph: TokenGraph,
  allowSet: ReadonlySet<string>,
  allComponentPrefixes: ReadonlySet<string>,
  completeness: ReadonlyArray<CompletenessScore>,
): OutputForecast {
  let tailwindMatches = 0;
  let themeExtensions = 0;
  let modeVariantEntries = 0;
  let estimatedBytes = 200; // header overhead

  for (const node of graph.nodes.values()) {
    const c = classifyToken(node, graph);
    switch (c.kind) {
      case "tailwind-default":
        tailwindMatches++;
        break;
      case "theme-static":
        themeExtensions++;
        estimatedBytes += c.cssName.length + (c.value.length ?? 0) + 8;
        break;
      case "theme-mode-variant":
        modeVariantEntries++;
        estimatedBytes += c.cssName.length * 2 + c.lightValue.length + c.darkValue.length + 16;
        break;
    }
  }

  const componentsByName = new Map<string, CompletenessScore[]>();
  for (const c of completeness) {
    const arr = componentsByName.get(c.component) ?? [];
    arr.push(c);
    componentsByName.set(c.component, arr);
  }

  const components = Array.from(allComponentPrefixes).sort().map((name) => ({
    name,
    inAllowList: allowSet.has(name),
    variants: componentsByName.get(name) ?? [],
  }));

  const unmappedComponentPrefixes = Array.from(allComponentPrefixes)
    .filter((p) => !allowSet.has(p))
    .sort();

  return {
    tokensCss: {
      estimatedBytes,
      tailwindMatches,
      themeExtensions,
      modeVariantEntries,
    },
    components,
    unmappedComponentPrefixes,
  };
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test -- src/scanner.test.ts
```

Expected: all tests pass. The snap-to-tailwind test has a slightly fuzzy assertion (`/p-1\b|p-1\.5/`) — adjust the implementation's neighbor search if needed to produce the expected suggestion for `5px`.

- [ ] **Step 5: Full suite + commit**

```bash
npm run typecheck && npm test
```

Expected: 135 prior + N new tests pass.

```bash
git add src/scanner.ts src/scanner.test.ts
git commit -m "feat: add scanner aggregating data-quality + classification + forecast"
```

---

### Task 3: Recipe engine — smart non-suffix assignment + conflict detection

**Files:**
- Modify: `src/recipe-engine.ts`
- Modify: `src/recipe-engine.test.ts` (add new tests for the heuristic)

**Context:** Currently the engine puts every non-suffix token into `slots.base` and every size-suffixed token into `variants.size.<key>`. The new behavior:

1. Pre-scan pass: for each utility type, detect whether ANY size-suffixed variant exists in the graph.
2. Main pass: when assigning a non-suffix token:
   - If the utility type has NO size variants in the graph → token goes to `slots.base` (current behavior).
   - If the utility type HAS size variants → token goes to `variants.size.<defaultSize>` (new behavior).

`defaultSize` is configurable per component via the `BuildRecipesOptions`. Defaults to `"md"`.

When both `button.padding-x` (non-suffix) AND `button.padding-x-md` exist with different resolved values, the size-suffix wins (more specific), and the engine does NOT log a duplicate-entry — the scanner already surfaces this as `non-suffix-vs-size-conflict`.

- [ ] **Step 1: Extend `BuildRecipesOptions`**

In `src/recipe-engine.ts`, change:

```ts
export interface BuildRecipesOptions {
  components: ReadonlyArray<string>;
  slotMappingOverride?: SlotMappingOverride;
  remBase?: number;
  /**
   * Per-component default size for non-suffix tokens that compete with
   * size-suffixed siblings. When a non-suffix token's utility type has
   * any size variant defined in the graph, the non-suffix value goes
   * into variants.size.<defaultSize> instead of slots.base.
   */
  defaultSizeByComponent?: Readonly<Record<string, string>>;
}
```

- [ ] **Step 2: Update the engine's main loop**

Add a pre-scan before the main loop in `buildComponentRecipes`:

```ts
// Pre-scan: for each (component, utility), detect whether any size-
// suffixed variant exists in the graph. Used to decide whether
// non-suffix tokens go to slots.base or to the default size variant.
const utilityHasSizeVariants = new Map<string, Set<string>>(); // key: `${component}|${utility}`

for (const node of graph.nodes.values()) {
  if (node.layer !== "component") continue;
  const componentName = node.id.split("-")[0];
  if (componentName === undefined || !allowSet.has(componentName)) continue;
  const mapping = getSlotMapping(node.id, options.slotMappingOverride);
  if (!mapping || mapping.variantKey === null) continue;
  if (mapping.variantAxis !== "size") continue;
  const key = `${componentName}|${mapping.utilityType}`;
  if (!utilityHasSizeVariants.has(key)) utilityHasSizeVariants.set(key, new Set());
  utilityHasSizeVariants.get(key)!.add(mapping.variantKey);
}
```

Then in the main loop, modify how the bucket key is built. When `mapping.variantKey === null` (non-suffix token) AND `utilityHasSizeVariants.has("${componentName}|${utility}")`, redirect to the default size:

```ts
let effectiveMapping = mapping;
if (mapping.variantKey === null) {
  const key = `${componentName}|${mapping.utilityType}`;
  const hasSizeVariants = utilityHasSizeVariants.has(key);
  if (hasSizeVariants) {
    const defaultSize = options.defaultSizeByComponent?.[componentName] ?? "md";
    // Skip if a size-specific override for the default size already exists —
    // the size-specific value wins (more specific). The scanner surfaces
    // this as a conflict warning separately.
    const sizeMap = /* the existing size map indexed somehow */;
    // Simplest implementation: track which size-specific values we've already
    // assigned and skip if defaultSize is already taken.
    effectiveMapping = {
      ...mapping,
      variantAxis: "size",
      variantKey: defaultSize,
    };
  }
}
```

The "skip if size-specific already exists" check needs a second pre-scan or in-loop tracking. Simplest:

Track `assignedSizeKeys` per `(component, utility)` while iterating. When considering a non-suffix token, check if `assignedSizeKeys.get(${componentName}|${utility})?.has(defaultSize)` — if yes, skip (the size-specific token already populated this slot).

A safer pattern: do TWO iterations of the graph nodes. First iteration handles all size-suffixed tokens. Second iteration handles non-suffix tokens, checking what's already been assigned.

Implement whichever is cleaner — both produce equivalent output for the conflict case.

- [ ] **Step 3: Write tests for the new behavior**

Extend `src/recipe-engine.test.ts` with:

```ts
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

  it("size-suffix wins when both non-suffix and size-suffix exist for the same size", () => {
    const graph = makeGraph([
      makeNode({ id: "button-padding-x", layer: "component", type: "dimension", source: "global", base: "6px" }),
      makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
    ]);
    const recipes = buildComponentRecipes(graph, { components: ["button"] });
    // The md size-specific value (8px → px-2) wins
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
```

- [ ] **Step 4: Run + commit**

```bash
npm run typecheck && npm test
```

Existing tests must still pass (the simpler cases without size variants behave as before). New tests should pass too.

```bash
git add src/recipe-engine.ts src/recipe-engine.test.ts src/__snapshots__/recipe-engine.test.ts.snap
git commit -m "feat: smart non-suffix → default-size in recipe engine"
```

---

### Task 4: slot-mapping.json loader

**Files:**
- Create: `src/slot-mapping-loader.ts`
- Create: `src/slot-mapping-loader.test.ts`
- Modify: `scripts/build-cli.ts`

**Context:** Lets the user check a `slot-mapping.json` into their project root to override the heuristic per token id AND configure per-component default sizes.

Expected file shape:
```json
{
  "components": {
    "button": { "defaultSize": "md" }
  },
  "overrides": {
    "button-shadow": null,
    "button-some-custom": {
      "slot": "base",
      "utilityType": "rounded",
      "variantAxis": null,
      "variantKey": null
    }
  }
}
```

- [ ] **Step 1: Implement the loader**

Create `src/slot-mapping-loader.ts`:

```ts
import { readFileSync, existsSync } from "node:fs";
import type { SlotMappingOverride } from "./slot-mapping.js";

export interface SlotMappingFile {
  components?: Record<string, { defaultSize?: string }>;
  overrides?: SlotMappingOverride;
}

export interface LoadedSlotMapping {
  overrides: SlotMappingOverride | undefined;
  defaultSizeByComponent: Record<string, string> | undefined;
}

export function loadSlotMappingFile(path: string): LoadedSlotMapping {
  if (!existsSync(path)) return { overrides: undefined, defaultSizeByComponent: undefined };
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as SlotMappingFile;
  const defaultSizeByComponent: Record<string, string> = {};
  for (const [name, config] of Object.entries(parsed.components ?? {})) {
    if (config.defaultSize) defaultSizeByComponent[name] = config.defaultSize;
  }
  return {
    overrides: parsed.overrides,
    defaultSizeByComponent: Object.keys(defaultSizeByComponent).length > 0 ? defaultSizeByComponent : undefined,
  };
}
```

- [ ] **Step 2: Write tests**

Create `src/slot-mapping-loader.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadSlotMappingFile } from "./slot-mapping-loader.js";

describe("loadSlotMappingFile", () => {
  it("returns empty when file does not exist", () => {
    const result = loadSlotMappingFile(resolve(tmpdir(), "nonexistent.json"));
    expect(result.overrides).toBeUndefined();
    expect(result.defaultSizeByComponent).toBeUndefined();
  });

  it("parses components and overrides", () => {
    const path = resolve(tmpdir(), "slot-mapping-test.json");
    writeFileSync(
      path,
      JSON.stringify({
        components: { button: { defaultSize: "lg" } },
        overrides: { "button-shadow": null },
      }),
    );
    try {
      const result = loadSlotMappingFile(path);
      expect(result.defaultSizeByComponent).toEqual({ button: "lg" });
      expect(result.overrides).toEqual({ "button-shadow": null });
    } finally {
      unlinkSync(path);
    }
  });
});
```

- [ ] **Step 3: Wire into build-cli**

Modify `scripts/build-cli.ts` — import the loader, look for `slot-mapping.json` at repo root, pass results into `buildComponentRecipes` (via the `appConfigRenderer.render(graph, options)`-style flow if it exists, OR by passing the options to `appConfigRenderer` directly).

Since `appConfigRenderer.render` currently takes only `graph`, the simplest path: have the loader read the config in build-cli, then pass via a new optional second arg to `appConfigRenderer.render(graph, { slotMappingOverride, defaultSizeByComponent })`. Adapt the `TextRenderer` interface if needed.

Actually, since this is a build-time concern, an alternative: have build-cli call `buildComponentRecipes(graph, {...})` directly, then synthesize the app.config.ts text inline. But that breaks the renderer abstraction.

Cleanest: add an optional second param to the renderer's `render` signature, OR pass the config via a module-level mutable in a less-than-ideal way.

For PR 4, the pragmatic move: extend the renderer's interface to accept optional options. Define `AppConfigRendererOptions` and have `appConfigRenderer.render(graph, options?)` accept the slot-mapping config. Update the `TextRenderer` type to support optional second arg, OR define a new type `AppConfigRenderer` that extends `TextRenderer` with the wider signature.

Document the choice in the commit message.

- [ ] **Step 4: Run + commit**

```bash
npm run typecheck && npm test
```

```bash
git add src/slot-mapping-loader.ts src/slot-mapping-loader.test.ts scripts/build-cli.ts src/renderers/app-config.ts
git commit -m "feat: slot-mapping.json loader for project-level overrides"
```

---

## Phase O — app-config completeness annotations

### Task 5: Renderer emits completeness comments

**Files:**
- Modify: `src/renderers/app-config.ts`
- Modify: `src/renderers/renderers.test.ts` (assert annotations appear)

**Context:** For each incomplete variant (completeness < 100%), prepend a single-line comment listing the missing utility types. Example:

```ts
button: {
  // ...
  variants: {
    size: {
      sm: {
        // Incomplete in Figma: missing padding-y, font-size, gap
        base: "px-2",
      },
      md: {
        base: "px-3 py-2 text-base gap-1",
      },
    },
  },
}
```

The renderer needs access to the completeness scores. Options:
- (A) Have the renderer compute scores internally (call `scanGraph` from inside).
- (B) Pass scores into `appConfigRenderer.render(graph, options)` from the caller (build-cli or Inspector).

Option B is cleaner — the scan already runs upstream. Reuse those results.

- [ ] **Step 1: Plumb scores through**

Extend `AppConfigRendererOptions` (created in Task 4):

```ts
export interface AppConfigRendererOptions {
  slotMappingOverride?: SlotMappingOverride;
  defaultSizeByComponent?: Readonly<Record<string, string>>;
  completeness?: ReadonlyArray<CompletenessScore>;
}
```

In the renderer, look up the score for each variant when emitting. Prepend the comment if `defined < total`.

- [ ] **Step 2: Add test**

```ts
it("emits completeness comment when a variant has missing utilities", () => {
  const graph = makeGraph([
    makeNode({ id: "button-padding-x-sm", layer: "component", type: "dimension", source: "global", base: "8px" }),
    makeNode({ id: "button-padding-x-md", layer: "component", type: "dimension", source: "global", base: "12px" }),
    makeNode({ id: "button-padding-y-md", layer: "component", type: "dimension", source: "global", base: "8px" }),
  ]);
  const rendered = appConfigRenderer.render(graph, {
    completeness: [
      { component: "button", axis: "size", variantKey: "sm", defined: 1, total: 2, missingUtilities: ["padding-y"] },
      { component: "button", axis: "size", variantKey: "md", defined: 2, total: 2, missingUtilities: [] },
    ],
  });
  expect(rendered.text).toContain("Incomplete in Figma: missing padding-y");
});
```

- [ ] **Step 3: Run + commit**

```bash
git add src/renderers/app-config.ts src/renderers/renderers.test.ts
git commit -m "feat: emit completeness comments per incomplete variant"
```

---

## Phase P — Inspector Scan View

### Task 6: useScanReport composable

**Files:**
- Create: `src/app/composables/use-scan-report.ts`

**Context:** Reactive composable wrapping `scanGraph(graph.value, options)`. Recomputes when graph changes.

```ts
import { computed, type ComputedRef, type Ref } from "vue";
import { scanGraph, type ScanOptions } from "@core/scanner.js";
import type { TokenGraph, ScanReport } from "@core/token-graph.js";

const EMPTY_REPORT: ScanReport = {
  issues: [],
  completeness: [],
  forecast: {
    tokensCss: { estimatedBytes: 0, tailwindMatches: 0, themeExtensions: 0, modeVariantEntries: 0 },
    components: [],
    unmappedComponentPrefixes: [],
  },
  generatedAt: 0,
};

export function useScanReport(
  graph: Ref<TokenGraph | null>,
  options: ScanOptions = { components: ["button"] },
): ComputedRef<ScanReport> {
  return computed(() => {
    const g = graph.value;
    if (!g) return EMPTY_REPORT;
    return scanGraph(g, options);
  });
}
```

Commit:

```bash
git add src/app/composables/use-scan-report.ts
git commit -m "feat: useScanReport composable wrapping scanGraph"
```

---

### Task 7: ScanView component

**Files:**
- Create: `src/app/components/ScanView.vue`

**Context:** The main UI surface. Sections:

1. **Summary** — total counts per severity, total tokens, generated-at timestamp.
2. **Category accordions** — collapsible per category (data-quality, classification-hint, build-time). Each row inside an accordion is a clickable issue; click highlights affected tokens in the list.
3. **Component readiness table** — one row per component with each variant's completeness score.
4. **Output forecast** — single text line with predicted bytes, tailwind matches, theme extensions, mode-variant entries, unmapped prefixes.

Sketch the component shape:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ScanReport, ScanIssue, ScanCategory } from "@core/token-graph.js";

interface Props {
  report: ScanReport;
}
interface Emits {
  (event: "select-tokens", tokenIds: readonly string[]): void;
}
const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const CATEGORIES: ReadonlyArray<{ key: ScanCategory; label: string }> = [
  { key: "build-time", label: "Build errors" },
  { key: "data-quality", label: "Data quality" },
  { key: "classification-hint", label: "Classification hints" },
];

const counts = computed(() => {
  const c: Record<ScanCategory, number> = {
    "build-time": 0,
    "data-quality": 0,
    "classification-hint": 0,
  };
  for (const i of props.report.issues) c[i.category]++;
  return c;
});

const grouped = computed(() => {
  const out: Record<ScanCategory, ScanIssue[]> = {
    "build-time": [],
    "data-quality": [],
    "classification-hint": [],
  };
  for (const i of props.report.issues) out[i.category].push(i);
  return out;
});

const severityClass = (sev: string) => ({
  error: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  hint: "text-zinc-500 dark:text-zinc-400",
}[sev] ?? "");
</script>

<template>
  <div class="space-y-4 p-3">
    <!-- Summary line -->
    <div class="flex flex-wrap items-baseline gap-x-3 text-sm">
      <span class="font-semibold">{{ report.issues.length }} issues</span>
      <span class="text-zinc-500">across {{ Object.values(counts).filter(c => c > 0).length }} categories</span>
    </div>

    <!-- Category accordions -->
    <details v-for="cat in CATEGORIES" :key="cat.key" open class="rounded border border-zinc-200 dark:border-zinc-800">
      <summary class="cursor-pointer px-3 py-2 flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
        <span class="font-medium">{{ cat.label }}</span>
        <span class="text-xs font-mono text-zinc-500">{{ counts[cat.key] }}</span>
      </summary>
      <ul v-if="grouped[cat.key].length > 0" class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <li
          v-for="issue in grouped[cat.key]"
          :key="issue.id"
          class="px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
          @click="emit('select-tokens', issue.tokenIds)"
        >
          <div class="flex items-baseline gap-2">
            <span class="text-xs font-mono uppercase" :class="severityClass(issue.severity)">{{ issue.severity }}</span>
            <span class="text-xs text-zinc-500">{{ issue.kind }}</span>
          </div>
          <p class="text-sm mt-1">{{ issue.message }}</p>
        </li>
      </ul>
      <p v-else class="px-3 py-2 text-xs text-zinc-500 italic">No issues.</p>
    </details>

    <!-- Component readiness table -->
    <div v-if="report.completeness.length > 0">
      <h3 class="text-xs font-mono uppercase text-zinc-500 mb-1">Component readiness</h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-zinc-500">
            <th class="py-1">Component</th>
            <th class="py-1">Variant</th>
            <th class="py-1">Score</th>
            <th class="py-1">Missing</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in report.completeness" :key="`${c.component}-${c.variantKey}`" class="border-t border-zinc-100 dark:border-zinc-800">
            <td class="py-1 font-mono text-xs">{{ c.component }}</td>
            <td class="py-1 font-mono text-xs">{{ c.variantKey }}</td>
            <td class="py-1 font-mono text-xs">
              <span :class="c.defined === c.total ? 'text-emerald-600' : 'text-amber-600'">{{ c.defined }}/{{ c.total }}</span>
            </td>
            <td class="py-1 text-xs text-zinc-500">{{ c.missingUtilities.join(', ') || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Forecast -->
    <div class="text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800 pt-3">
      Forecast:
      ~{{ Math.round(report.forecast.tokensCss.estimatedBytes / 100) / 10 }}KB tokens.css,
      {{ report.forecast.tokensCss.tailwindMatches }} Tailwind matches,
      {{ report.forecast.tokensCss.themeExtensions }} theme extensions,
      {{ report.forecast.tokensCss.modeVariantEntries }} mode-variant entries.
      <span v-if="report.forecast.unmappedComponentPrefixes.length > 0">
        Unmapped: {{ report.forecast.unmappedComponentPrefixes.join(', ') }}.
      </span>
    </div>
  </div>
</template>
```

Commit:

```bash
git add src/app/components/ScanView.vue
git commit -m "feat: ScanView component aggregating issues, readiness, forecast"
```

---

### Task 8: HeaderStatusStrip + App.vue wiring

**Files:**
- Create: `src/app/components/HeaderStatusStrip.vue`
- Modify: `src/app/state.ts` (replace `view: 'inspector' | 'issues'` with `'inspector' | 'scan'`)
- Modify: `src/app/App.vue` (mount HeaderStatusStrip, replace IssuesView mount with ScanView, wire token highlighting)

**Context:** A permanent compact strip at the very top of the inspector — shows the scan summary and lets the user toggle to the Scan view.

`HeaderStatusStrip.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ScanReport } from "@core/token-graph.js";

interface Props {
  report: ScanReport;
  scanViewActive: boolean;
}
interface Emits {
  (event: "open-scan"): void;
}
const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const errorCount = computed(() => props.report.issues.filter((i) => i.severity === "error").length);
const warningCount = computed(() => props.report.issues.filter((i) => i.severity === "warning").length);
const hintCount = computed(() => props.report.issues.filter((i) => i.severity === "hint").length);
</script>

<template>
  <button
    type="button"
    class="w-full flex items-baseline gap-3 px-3 py-1.5 text-xs font-mono border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
    :class="scanViewActive && 'bg-zinc-100 dark:bg-zinc-800'"
    @click="emit('open-scan')"
  >
    <span class="text-zinc-500">Scan:</span>
    <span :class="errorCount > 0 ? 'text-red-600' : 'text-zinc-400'">{{ errorCount }} errors</span>
    <span class="text-zinc-400">·</span>
    <span :class="warningCount > 0 ? 'text-amber-600' : 'text-zinc-400'">{{ warningCount }} warnings</span>
    <span class="text-zinc-400">·</span>
    <span class="text-zinc-500">{{ hintCount }} hints</span>
    <span class="ml-auto text-zinc-400">{{ report.forecast.tokensCss.tailwindMatches }} tw · {{ report.forecast.tokensCss.themeExtensions }} theme · {{ report.forecast.tokensCss.modeVariantEntries }} mode-var</span>
  </button>
</template>
```

In `state.ts`, update the view union:

```ts
export type ViewMode = "inspector" | "scan";
```

(Drop `"issues"` if it was there.)

In App.vue, replace the IssuesView mount with ScanView when `view === "scan"`. Pass the scan report. Wire the `select-tokens` event to set `state.selection.value` and `state.highlightedIds.value` to highlight the affected tokens in the list. Mount HeaderStatusStrip at the very top of the layout (above the SummaryPanel from PR 1).

Commit:

```bash
git add src/app/components/HeaderStatusStrip.vue src/app/state.ts src/app/App.vue
git commit -m "feat: header status strip + ScanView wired in App.vue"
```

---

### Task 9: Remove IssuesView.vue

**Files:**
- Delete: `src/app/components/IssuesView.vue`

If any other components still reference IssuesView, update them to use ScanView or remove the imports.

```bash
grep -rn "IssuesView" src/ 2>/dev/null
git rm src/app/components/IssuesView.vue
git commit -m "refactor: remove standalone IssuesView, absorbed into ScanView"
```

---

## Phase Q — LiveButton partial badge

### Task 10: LiveButton shows n/m partial badge per size

**Files:**
- Modify: `src/app/components/LiveButton.vue`

**Context:** Each rendered preview cell gets a small badge next to the button label showing the variant's completeness (e.g., `sm · 2/5 ⚠`). LiveButton receives the scan report or completeness scores via props (App.vue computes upstream).

In `LiveButton.vue`, extend Props:

```ts
interface Props {
  graph: TokenGraph | null;
  completeness?: ReadonlyArray<CompletenessScore>;
}
```

In the template, look up the score for each size:

```vue
<div v-for="cell in previewCells" :key="cell.size" class="flex items-center gap-4">
  <button
    type="button"
    :class="cell.classes + ' bg-blue-500 text-white hover:bg-blue-600 transition-colors'"
  >
    Button {{ cell.size }}
    <span v-if="cellCompleteness(cell.size)" class="ml-2 text-xs font-mono opacity-70">
      {{ cellCompleteness(cell.size)!.defined }}/{{ cellCompleteness(cell.size)!.total }}
    </span>
  </button>
  <!-- existing code preview block -->
</div>
```

With a helper:

```ts
function cellCompleteness(size: string) {
  return props.completeness?.find((c) => c.component === "button" && c.variantKey === size);
}
```

In App.vue, pass `completeness` from the scan report to LiveButton.

Commit:

```bash
git add src/app/components/LiveButton.vue src/app/App.vue
git commit -m "feat: LiveButton shows completeness badge per size variant"
```

---

## Phase R — Release

### Task 11: README + CHANGELOG

**Files:**
- Modify: `README.md` (add Scan View + slot-mapping.json sections)
- Modify: `CHANGELOG.md` (v0.4.0 entry)

In README, add a "Token Scan" subsection describing the categories the scan covers and how to read the readiness table.

In CHANGELOG, add `## [0.4.0] — 2026-05-XX` with Added (scanner, ScanView, HeaderStatusStrip, slot-mapping.json, smart non-suffix, completeness annotations, LiveButton badges), Changed (engine behavior), Removed (IssuesView).

Commit:

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README + CHANGELOG for v0.4.0"
```

### Task 12: Version bump + tag + release

```bash
npm version 0.4.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to 0.4.0"
git checkout main
git merge --ff-only pr4-token-scan-and-smart-recipes
git push origin main
git tag -a v0.4.0 -m "v0.4.0 — Token Scan + Smart Recipe Engine

Scan view aggregates data-quality issues, classification hints,
completeness scores, and output forecast. Engine reassigns non-suffix
tokens to default size when they compete with size-suffix siblings.
slot-mapping.json enables project-level overrides.

See CHANGELOG.md for the full list."
git push origin v0.4.0
git branch -d pr4-token-scan-and-smart-recipes

# GitHub release
awk '/^## \[0\.4\.0\]/,/^## \[0\.3\.0\]/' CHANGELOG.md | sed '$d' > /tmp/v040-notes.md
gh release create v0.4.0 --title "v0.4.0 — Token Scan + Smart Recipe Engine" --notes-file /tmp/v040-notes.md
rm /tmp/v040-notes.md
```

---

## Spec coverage check

Each PR 4 requirement from the spec is covered by:

- **Scanner module + categories** → Tasks 1, 2
- **Smart non-suffix → default-size + conflict detection** → Task 3
- **slot-mapping.json loader** → Task 4
- **app-config completeness comments** → Task 5
- **useScanReport composable** → Task 6
- **ScanView component (categorized accordions, completeness table, forecast)** → Task 7
- **HeaderStatusStrip + App.vue rewiring** → Task 8
- **IssuesView removal** → Task 9
- **LiveButton partial badge** → Task 10
- **README + CHANGELOG + v0.4.0 release** → Tasks 11, 12

### Open items / deferred

- **Hue-proximity color role derivation** — still deferred from PR 2 spec; not in PR 4.
- **`badge`, `card`, `input` component recipes** — still scoped to PR 5+.
- **Playwright CI integration** — visual smoke remains local-only.
