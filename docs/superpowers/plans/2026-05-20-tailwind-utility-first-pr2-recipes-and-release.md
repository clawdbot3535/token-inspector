# Tailwind-Utility-First Token Output — PR 2: Recipes + Activation + Release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `resolve-token.ts` + `slot-mapping.ts` + `recipe-engine.ts` so the generated `app.config.ts` becomes a real Nuxt UI v4 starting point with `button` component recipes (slots + variants). Wire the resolver into the Inspector's OutputSection for `skip` tokens. Refactor LiveButton to Strategy B (real Tailwind classes computed by the engine). Remove all legacy renderers and `build-tokens.mjs`. Ship v0.3.0.

**Architecture:** `resolve-token.ts` becomes the shared resolver used by the recipe engine, OutputSection, and LiveButton. `slot-mapping.ts` ships a heuristic + optional `slot-mapping.json` override. `recipe-engine.ts` walks component-layer tokens (allow-list: `['button']` for PR 2), groups by component prefix, applies the slot mapping, classifies each value via the existing classification engine, and assembles `{ slots, variants }` recipes. The new `app-config-renderer` consumes the recipes and emits the full Nuxt UI v4 config.

**Tech Stack:** TypeScript strict + `noUncheckedIndexedAccess: true`, Vitest, Vue 3 Composition API, Tailwind v4, Nuxt UI v4, Node 22+ with `tsx` for the typed CLI.

**Spec:** `docs/superpowers/specs/2026-05-20-tailwind-utility-first-tokens-design.md` (updated commit `94521d2` with PR 2 expansion).

**Prerequisites:** PR 1 merged to main on commit `2ece0bf`. Classification engine, dual-emit CLI, Inspector UI are live. 127 tests pass.

---

## File Structure

### New files

- `src/resolve-token.ts` — Alias-chain resolver. Pure function. Cycle-safe.
- `src/resolve-token.test.ts` — Direct-value, single-alias, multi-stage chain, cycle, broken-ref tests.
- `src/slot-mapping.ts` — Default heuristic + optional JSON override loader. Exports `getSlotMapping(componentName, override?)`.
- `src/slot-mapping.test.ts` — Heuristic match tests + override-merge tests.
- `src/recipe-engine.ts` — Walks component-layer tokens, applies slot-mapping, classifies each value, assembles `{ slots, variants }` objects.
- `src/recipe-engine.test.ts` — End-to-end snapshot tests with a curated button-token fixture.
- `CHANGELOG.md` — Top-level changelog. v0.3.0 entry covering the full Tailwind-utility-first refactor.

### Modified files

- `src/renderers/app-config.ts` — Now consumes the recipe engine. Emits full `defineAppConfig({ ui: { colors, button: { slots, variants } } })`.
- `src/renderers/renderers.test.ts` — Snapshot for the new full app-config output.
- `src/app/components/OutputSection.vue` — `skip` branch fills in the resolved Tailwind class list using `resolve-token.ts` + `classifyToken`.
- `src/app/components/LiveButton.vue` — Refactor to Strategy B (Tailwind classes from recipe engine, inline `<style id="inspector-utilities">` injection).
- `src/app/state.ts` — Drop legacy `OutputTab` entries (`tokens.css`, `app.config.ts`, `tokens.ts` legacy variants). New tabs renamed without "(new)" suffix.
- `src/app/components/CodePreview.vue` — Remove legacy tabs.
- `src/renderers/index.ts` — Remove exports of `cssRenderer`, `tsRenderer`. Rename `tokensCssRenderer` to canonical `tokens.css` id if needed.
- `README.md` — Document the new pipeline, integration steps, philosophy.
- `package.json` — Bump version to `0.3.0`. Remove `build:tokens:legacy` script. `build:tokens` runs only the typed CLI.
- `package-lock.json` — Synced version bump.
- `scripts/build-cli.ts` — Drop the `output/tokens.ts` emission if it was added. Confirm output path stays `output/css/tokens.css` + `output/nuxt/app.config.ts`.

### Deleted files

- `src/renderers/css.ts` — Legacy CSS renderer.
- `src/renderers/ts.ts` — Legacy TS-export renderer.
- `build-tokens.mjs` — Legacy CLI (its logic is now fully in `scripts/build-cli.ts`).
- `src/smoke.test.ts` — Legacy baseline locking 514 declarations / 21 value diffs against the dropped CLI. Replaced by `src/recipe-engine.test.ts` snapshots.
- `src/diff.test.ts` — Diff vs legacy CLI; no longer meaningful once legacy is gone.

---

## Phase F — `resolve-token.ts`

### Task 1: Pure alias resolver

**Files:**
- Create: `src/resolve-token.ts`
- Create: `src/resolve-token.test.ts`

**Context:** The `TokenNode.alias` field holds resolved alias references per theme (`{ base?, light?, dark? }`). Each `ResolvedAlias` has a `to: TokenId`. The `cssValue` field may also contain `var(--target)` string references when an alias couldn't be resolved at build time. The resolver walks both paths (alias chain + var-reference chain) until reaching a primitive value, returning `{ value, path }` on success or `{ error, path }` on cycle / unresolved.

- [ ] **Step 1: Write the failing tests**

Create `src/resolve-token.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveTokenToValue } from "./resolve-token.js";
import type { TokenGraph, TokenNode, Theme } from "./token-graph.js";

function makeNode(opts: {
  id: string;
  base?: string;
  light?: string;
  dark?: string;
  aliasTo?: string;
  aliasToLight?: string;
  aliasToDark?: string;
}): TokenNode {
  return {
    id: opts.id,
    path: opts.id.split("-"),
    type: "color",
    layer: "primitive",
    themes: [],
    cssValue: { base: opts.base, light: opts.light, dark: opts.dark },
    rawValue: { base: opts.base, light: opts.light, dark: opts.dark },
    alias: {
      base: opts.aliasTo ? { to: opts.aliasTo, rawTarget: opts.aliasTo } : undefined,
      light: opts.aliasToLight ? { to: opts.aliasToLight, rawTarget: opts.aliasToLight } : undefined,
      dark: opts.aliasToDark ? { to: opts.aliasToDark, rawTarget: opts.aliasToDark } : undefined,
    },
    source: "color",
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

describe("resolveTokenToValue", () => {
  it("returns the direct value for a primitive node with no alias", () => {
    const graph = makeGraph([
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
    ]);
    const result = resolveTokenToValue("color-blue-500", graph);
    expect(result).toEqual({ value: "#3b82f6", path: ["color-blue-500"] });
  });

  it("walks a single-stage alias", () => {
    const graph = makeGraph([
      makeNode({ id: "color-action-primary", aliasTo: "color-blue-500" }),
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
    ]);
    const result = resolveTokenToValue("color-action-primary", graph);
    expect(result).toEqual({
      value: "#3b82f6",
      path: ["color-action-primary", "color-blue-500"],
    });
  });

  it("walks a multi-stage alias chain", () => {
    const graph = makeGraph([
      makeNode({ id: "button-bg", aliasTo: "color-action-primary" }),
      makeNode({ id: "color-action-primary", aliasTo: "color-blue-500" }),
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
    ]);
    const result = resolveTokenToValue("button-bg", graph);
    expect(result).toEqual({
      value: "#3b82f6",
      path: ["button-bg", "color-action-primary", "color-blue-500"],
    });
  });

  it("resolves through var(--target) references in cssValue", () => {
    const graph = makeGraph([
      makeNode({ id: "alias-via-var", base: "var(--color-blue-500)" }),
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
    ]);
    const result = resolveTokenToValue("alias-via-var", graph);
    expect(result).toEqual({
      value: "#3b82f6",
      path: ["alias-via-var", "color-blue-500"],
    });
  });

  it("honors theme mode for themed alias", () => {
    const graph = makeGraph([
      makeNode({
        id: "color-action-primary",
        aliasToLight: "color-blue-500",
        aliasToDark: "color-blue-300",
      }),
      makeNode({ id: "color-blue-500", base: "#3b82f6" }),
      makeNode({ id: "color-blue-300", base: "#93c5fd" }),
    ]);
    const light = resolveTokenToValue("color-action-primary", graph, "light");
    expect(light).toEqual({
      value: "#3b82f6",
      path: ["color-action-primary", "color-blue-500"],
    });
    const dark = resolveTokenToValue("color-action-primary", graph, "dark");
    expect(dark).toEqual({
      value: "#93c5fd",
      path: ["color-action-primary", "color-blue-300"],
    });
  });

  it("detects cycles", () => {
    const graph = makeGraph([
      makeNode({ id: "a", aliasTo: "b" }),
      makeNode({ id: "b", aliasTo: "a" }),
    ]);
    const result = resolveTokenToValue("a", graph);
    expect(result).toEqual({
      error: "cycle",
      path: ["a", "b", "a"],
    });
  });

  it("reports unresolved when chain ends at missing node", () => {
    const graph = makeGraph([
      makeNode({ id: "broken", aliasTo: "missing-target" }),
    ]);
    const result = resolveTokenToValue("broken", graph);
    expect(result).toEqual({
      error: "unresolved",
      path: ["broken"],
    });
  });

  it("returns unresolved if starting id does not exist", () => {
    const graph = makeGraph([]);
    const result = resolveTokenToValue("nonexistent", graph);
    expect(result).toEqual({
      error: "unresolved",
      path: [],
    });
  });
});
```

- [ ] **Step 2: Run, confirm failure**

```bash
npm test -- src/resolve-token.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `src/resolve-token.ts`:

```ts
// Pure alias resolver. Walks alias chains (via TokenNode.alias) and
// var(--target) references (via cssValue) to find the primitive value
// behind any token. Cycle-safe via visited-set guard.

import type { TokenGraph, TokenNode, Theme } from "./token-graph.js";

export type ResolveResult =
  | { value: string; path: string[] }
  | { error: "cycle" | "unresolved"; path: string[] };

export function resolveTokenToValue(
  tokenId: string,
  graph: TokenGraph,
  mode?: Theme,
): ResolveResult {
  const visited = new Set<string>();
  const path: string[] = [];
  let currentId: string | null = tokenId;

  while (currentId !== null) {
    if (visited.has(currentId)) {
      path.push(currentId);
      return { error: "cycle", path };
    }
    visited.add(currentId);
    path.push(currentId);

    const node: TokenNode | undefined = graph.nodes.get(currentId);
    if (!node) {
      // Started with an id that doesn't exist, OR ended at a missing target.
      if (path.length === 1) return { error: "unresolved", path: [] };
      return { error: "unresolved", path: path.slice(0, -1) };
    }

    // 1. Check the resolved alias field for the requested mode (or base).
    const aliasForMode =
      (mode && node.alias[mode]) ?? node.alias.base ?? node.alias.light ?? node.alias.dark;
    if (aliasForMode) {
      currentId = aliasForMode.to;
      continue;
    }

    // 2. Check cssValue for the requested mode.
    const cssValue =
      (mode && node.cssValue[mode]) ?? node.cssValue.base ?? node.cssValue.light ?? node.cssValue.dark;
    if (cssValue === undefined) {
      return { error: "unresolved", path };
    }

    // 3. Detect var(--target) references and walk through them.
    const varMatch = cssValue.match(/^var\(\s*--([a-z0-9_-]+)\s*(?:,[^)]*)?\)$/i);
    if (varMatch?.[1] !== undefined) {
      currentId = varMatch[1];
      continue;
    }

    // 4. Concrete value reached.
    return { value: cssValue, path };
  }

  return { error: "unresolved", path };
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test -- src/resolve-token.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/resolve-token.ts src/resolve-token.test.ts
git commit -m "feat: add pure alias resolver for token chains"
```

Pre-commit hook (vue-tsc + full suite) must stay green.

---

## Phase G — `slot-mapping.ts`

### Task 2: Heuristic slot mapping + override loader

**Files:**
- Create: `src/slot-mapping.ts`
- Create: `src/slot-mapping.test.ts`

**Context:** Maps a Figma token id (e.g. `button-padding-x-sm`) to a Nuxt UI v4 recipe path (e.g. `{ slot: 'base', utilityType: 'padding-x', variantAxis: 'size', variantKey: 'sm' }`). Heuristic by default; can be overridden by a `slot-mapping.json` file at the project root.

The mapping output is a structured record that downstream consumers (recipe engine) use to assemble the final `{ slots, variants }` shape.

- [ ] **Step 1: Define the data shape**

Create `src/slot-mapping.ts`:

```ts
// Heuristic mapping from Figma component-layer token ids to Nuxt UI v4
// recipe paths. Each token resolves to:
//   { slot: 'base' | 'leadingIcon' | 'trailingIcon' | ... ,
//     utilityType: 'padding-x' | 'padding-y' | 'rounded' | 'font-weight'
//                  | 'text-size' | 'gap' | 'icon-size',
//     variantAxis: 'size' | 'color' | 'state' | null,
//     variantKey:  string | null }
//
// PR 2 ships with conventions for the `button` component. Other
// components follow in later PRs.

export type RecipeSlot = "base" | "leadingIcon" | "trailingIcon" | "label";
export type UtilityType =
  | "padding-x"
  | "padding-y"
  | "rounded"
  | "font-weight"
  | "text-size"
  | "gap"
  | "icon-size";
export type VariantAxis = "size" | "color" | "state";

export interface SlotMappingEntry {
  slot: RecipeSlot;
  utilityType: UtilityType;
  variantAxis: VariantAxis | null;
  variantKey: string | null;
}

export type SlotMappingOverride = Readonly<Record<string, SlotMappingEntry | null>>;

const SIZE_KEYS = new Set(["xs", "sm", "md", "lg", "xl", "2xl"]);
const STATE_KEYS = new Set(["default", "hover", "active", "disabled", "focus"]);

interface ParsedSegments {
  component: string;
  utility: string;
  variant: string | null;
}

function parseSegments(tokenId: string): ParsedSegments | null {
  const parts = tokenId.split("-");
  if (parts.length < 2) return null;
  const component = parts[0]!;
  const last = parts[parts.length - 1]!;

  // Variant axis detection from suffix.
  if (SIZE_KEYS.has(last) || STATE_KEYS.has(last)) {
    return {
      component,
      utility: parts.slice(1, -1).join("-"),
      variant: last,
    };
  }
  return {
    component,
    utility: parts.slice(1).join("-"),
    variant: null,
  };
}

const HEURISTIC_RULES: ReadonlyArray<{
  match: (utility: string) => boolean;
  build: (variant: string | null) => SlotMappingEntry;
}> = [
  {
    match: (u) => u === "padding-x",
    build: (v) => ({
      slot: "base",
      utilityType: "padding-x",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "padding-y",
    build: (v) => ({
      slot: "base",
      utilityType: "padding-y",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "radius" || u === "rounded",
    build: (v) => ({
      slot: "base",
      utilityType: "rounded",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "font-weight" || u === "weight",
    build: (v) => ({
      slot: "base",
      utilityType: "font-weight",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "text-size" || u === "font-size" || u === "text",
    build: (v) => ({
      slot: "base",
      utilityType: "text-size",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "gap",
    build: (v) => ({
      slot: "base",
      utilityType: "gap",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
  {
    match: (u) => u === "icon-size" || u === "icon",
    build: (v) => ({
      slot: "leadingIcon",
      utilityType: "icon-size",
      variantAxis: variantAxisFor(v),
      variantKey: v,
    }),
  },
];

function variantAxisFor(variant: string | null): VariantAxis | null {
  if (!variant) return null;
  if (SIZE_KEYS.has(variant)) return "size";
  if (STATE_KEYS.has(variant)) return "state";
  return null;
}

/**
 * Pure heuristic mapping. Returns null if no rule matches.
 */
export function heuristicSlotMapping(tokenId: string): SlotMappingEntry | null {
  const parsed = parseSegments(tokenId);
  if (!parsed) return null;
  for (const rule of HEURISTIC_RULES) {
    if (rule.match(parsed.utility)) {
      return rule.build(parsed.variant);
    }
  }
  return null;
}

/**
 * Merge heuristic with override. Override entries are keyed by token id;
 * a `null` override explicitly skips a token even if the heuristic would match.
 */
export function getSlotMapping(
  tokenId: string,
  override?: SlotMappingOverride,
): SlotMappingEntry | null {
  if (override && Object.prototype.hasOwnProperty.call(override, tokenId)) {
    return override[tokenId] ?? null;
  }
  return heuristicSlotMapping(tokenId);
}
```

- [ ] **Step 2: Write tests**

Create `src/slot-mapping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { heuristicSlotMapping, getSlotMapping } from "./slot-mapping.js";

describe("heuristicSlotMapping — button", () => {
  it("maps button-padding-x-sm to base/padding-x/size/sm", () => {
    expect(heuristicSlotMapping("button-padding-x-sm")).toEqual({
      slot: "base",
      utilityType: "padding-x",
      variantAxis: "size",
      variantKey: "sm",
    });
  });

  it("maps button-padding-y-lg correctly", () => {
    expect(heuristicSlotMapping("button-padding-y-lg")).toEqual({
      slot: "base",
      utilityType: "padding-y",
      variantAxis: "size",
      variantKey: "lg",
    });
  });

  it("maps button-radius to base/rounded with no variant", () => {
    expect(heuristicSlotMapping("button-radius")).toEqual({
      slot: "base",
      utilityType: "rounded",
      variantAxis: null,
      variantKey: null,
    });
  });

  it("maps button-icon-size-md to leadingIcon/icon-size/size/md", () => {
    expect(heuristicSlotMapping("button-icon-size-md")).toEqual({
      slot: "leadingIcon",
      utilityType: "icon-size",
      variantAxis: "size",
      variantKey: "md",
    });
  });

  it("returns null for unmapped tokens", () => {
    expect(heuristicSlotMapping("button-mystery-token")).toBeNull();
  });

  it("returns null for non-component tokens", () => {
    expect(heuristicSlotMapping("color-blue-500")).toBeNull();
  });
});

describe("getSlotMapping — with overrides", () => {
  it("returns heuristic when no override exists", () => {
    const result = getSlotMapping("button-padding-x-sm", {});
    expect(result?.utilityType).toBe("padding-x");
  });

  it("respects override that adds a mapping for a non-heuristic token", () => {
    const override = {
      "button-shadow": {
        slot: "base" as const,
        utilityType: "rounded" as const,
        variantAxis: null,
        variantKey: null,
      },
    };
    const result = getSlotMapping("button-shadow", override);
    expect(result?.utilityType).toBe("rounded");
  });

  it("respects override that explicitly skips a token (null)", () => {
    const override = { "button-padding-x-sm": null };
    expect(getSlotMapping("button-padding-x-sm", override)).toBeNull();
  });

  it("falls back to heuristic when override does not contain the id", () => {
    const override = { "other-token": null };
    expect(getSlotMapping("button-padding-x-sm", override)?.utilityType).toBe(
      "padding-x",
    );
  });
});
```

- [ ] **Step 3: Run tests, confirm pass**

```bash
npm test -- src/slot-mapping.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/slot-mapping.ts src/slot-mapping.test.ts
git commit -m "feat: add slot-mapping heuristic with override support"
```

---

## Phase H — `recipe-engine.ts`

### Task 3: Walk component tokens, assemble recipes

**Files:**
- Create: `src/recipe-engine.ts`
- Create: `src/recipe-engine.test.ts`

**Context:** Walks the graph's component-layer tokens, filters by allow-list (`['button']` for PR 2), uses `getSlotMapping` to decide where each token belongs, resolves each via `resolveTokenToValue`, classifies via `classifyToken` to get the Tailwind utility class, and assembles a `{ slots, variants }` object per component.

- [ ] **Step 1: Define the output shape**

The engine emits:

```ts
interface ComponentRecipe {
  slots: Partial<Record<RecipeSlot, string>>;  // 'base': 'rounded-md font-medium ...'
  variants: {
    size?: Partial<Record<string, Partial<Record<RecipeSlot, string>>>>;
    color?: Partial<Record<string, Partial<Record<RecipeSlot, string>>>>;
    state?: Partial<Record<string, Partial<Record<RecipeSlot, string>>>>;
  };
}
```

The class strings are space-separated Tailwind utilities. Within a slot, classes are deduplicated and sorted alphabetically for deterministic output (snapshot-stable).

- [ ] **Step 2: Write the failing test**

Create `src/recipe-engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildComponentRecipes } from "./recipe-engine.js";
import type { TokenGraph, TokenNode, GraphLayer, TokenType, SourceLayer } from "./token-graph.js";

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
```

- [ ] **Step 3: Implement the engine**

Create `src/recipe-engine.ts`:

```ts
// Walks component-layer tokens, applies slot-mapping, classifies each
// value via the existing classification engine, and assembles
// Nuxt UI v4 { slots, variants } recipes per component.
//
// Allow-list: pass `{ components: ['button'] }` to scope output.

import type { TokenGraph } from "./token-graph.js";
import { classifyToken } from "./classify-token.js";
import { resolveTokenToValue } from "./resolve-token.js";
import {
  getSlotMapping,
  type SlotMappingOverride,
  type SlotMappingEntry,
  type RecipeSlot,
  type UtilityType,
  type VariantAxis,
} from "./slot-mapping.js";

export interface ComponentRecipe {
  slots: Partial<Record<RecipeSlot, string>>;
  variants: {
    size?: Record<string, Partial<Record<RecipeSlot, string>>>;
    color?: Record<string, Partial<Record<RecipeSlot, string>>>;
    state?: Record<string, Partial<Record<RecipeSlot, string>>>;
  };
}

export interface BuildRecipesOptions {
  components: ReadonlyArray<string>;
  slotMappingOverride?: SlotMappingOverride;
  remBase?: number;
}

export function buildComponentRecipes(
  graph: TokenGraph,
  options: BuildRecipesOptions,
): Record<string, ComponentRecipe> {
  const allowSet = new Set(options.components);
  const out: Record<string, ComponentRecipe> = {};
  const utilityBuckets = new Map<string, string[]>(); // bucket-key -> utilities

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;

    const componentName = node.id.split("-")[0]!;
    if (!allowSet.has(componentName)) continue;

    const mapping = getSlotMapping(node.id, options.slotMappingOverride);
    if (!mapping) continue;

    const resolved = resolveTokenToValue(node.id, graph);
    if ("error" in resolved) continue;

    const classification = classifyToken(
      // Fabricate a tiny shadow node carrying the resolved primitive value so
      // classifyToken does not skip it as component-layer.
      {
        ...node,
        layer: "primitive",
        cssValue: { base: resolved.value },
      },
      graph,
      { remBase: options.remBase },
    );

    const utility = utilityFor(mapping.utilityType, classification);
    if (!utility) continue;

    const bucketKey = bucketKeyFor(componentName, mapping);
    const arr = utilityBuckets.get(bucketKey) ?? [];
    arr.push(utility);
    utilityBuckets.set(bucketKey, arr);
  }

  // Materialize buckets into recipe shape.
  for (const [bucketKey, utilities] of utilityBuckets) {
    const parsed = parseBucketKey(bucketKey);
    if (!parsed) continue;

    const recipe = (out[parsed.component] ??= { slots: {}, variants: {} });
    const dedupedSorted = Array.from(new Set(utilities)).sort();
    const classString = dedupedSorted.join(" ");

    if (parsed.variantAxis === null) {
      recipe.slots[parsed.slot] = classString;
    } else {
      const axis = (recipe.variants[parsed.variantAxis] ??= {});
      const variantBucket = (axis[parsed.variantKey!] ??= {});
      variantBucket[parsed.slot] = classString;
    }
  }

  return out;
}

function utilityFor(
  utilityType: UtilityType,
  classification: ReturnType<typeof classifyToken>,
): string | null {
  if (classification.kind === "skip") return null;

  if (classification.kind === "tailwind-default") {
    // The classification's `utility` is a single utility string like 'p-1'.
    // Strip the default 'p-' prefix from spacing utilities and re-prefix
    // based on the requested utility type.
    const suffix = classification.utility.replace(/^[a-z-]+-/, "");
    return prefixForUtility(utilityType) + suffix;
  }

  // theme-static or theme-mode-variant: use the CSS var as the value via the
  // Tailwind arbitrary-value syntax. e.g. p-[var(--color-x)] for a padding
  // var (unusual but handled).
  if (classification.kind === "theme-static" || classification.kind === "theme-mode-variant") {
    return `${prefixForUtility(utilityType)}[var(${classification.cssName})]`;
  }

  return null;
}

function prefixForUtility(utilityType: UtilityType): string {
  switch (utilityType) {
    case "padding-x": return "px-";
    case "padding-y": return "py-";
    case "rounded": return "rounded-";
    case "font-weight": return "font-";
    case "text-size": return "text-";
    case "gap": return "gap-";
    case "icon-size": return "size-";
  }
}

function bucketKeyFor(componentName: string, mapping: SlotMappingEntry): string {
  if (mapping.variantAxis === null) {
    return `${componentName}|null|null|${mapping.slot}`;
  }
  return `${componentName}|${mapping.variantAxis}|${mapping.variantKey}|${mapping.slot}`;
}

interface ParsedBucket {
  component: string;
  variantAxis: VariantAxis | null;
  variantKey: string | null;
  slot: RecipeSlot;
}

function parseBucketKey(key: string): ParsedBucket | null {
  const parts = key.split("|");
  if (parts.length !== 4) return null;
  const [component, axisRaw, variantKeyRaw, slotRaw] = parts as [string, string, string, string];
  const variantAxis: VariantAxis | null =
    axisRaw === "null" ? null : (axisRaw as VariantAxis);
  const variantKey = variantKeyRaw === "null" ? null : variantKeyRaw;
  return {
    component,
    variantAxis,
    variantKey,
    slot: slotRaw as RecipeSlot,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/recipe-engine.test.ts
```

Expected: all tests pass. Snapshot created on first run — review it before committing. The snapshot should show a `button` recipe with `slots.base` containing `rounded-md font-medium` and `variants.size.sm` / `variants.size.md` containing the appropriate `px-*` / `py-*` / `text-*` utilities.

- [ ] **Step 5: Commit**

```bash
git add src/recipe-engine.ts src/recipe-engine.test.ts src/__snapshots__/recipe-engine.test.ts.snap
git commit -m "feat: add component-recipe engine for Nuxt UI v4 app.config"
```

---

## Phase I — Updated `app-config.ts` renderer

### Task 4: Renderer consumes recipe engine

**Files:**
- Modify: `src/renderers/app-config.ts`
- Modify: `src/renderers/renderers.test.ts` (update snapshot)

**Context:** The PR 1 renderer emits only color-role mapping. PR 2 extends it to emit the full `defineAppConfig` block including `button` recipes from the engine.

- [ ] **Step 1: Update the renderer**

Overwrite `src/renderers/app-config.ts`:

```ts
// Nuxt UI v4 app.config.ts emitter.
//
// Emits a defineAppConfig block with:
//   - ui.colors role mapping (heuristic defaults)
//   - ui.button component recipe (slots + variants) from recipe-engine
//
// The body is always a suggestion — the consuming project may merge or
// replace.

import type { TextRenderer, TokenGraph } from "../token-graph.js";
import { LineBuilder } from "./line-builder.js";
import {
  buildComponentRecipes,
  type ComponentRecipe,
} from "../recipe-engine.js";

interface RoleMapping {
  readonly primary: string;
  readonly neutral: string;
  readonly secondary: string;
  readonly success: string;
  readonly info: string;
  readonly warning: string;
  readonly error: string;
}

const DEFAULT_ROLES: RoleMapping = {
  primary: "blue",
  neutral: "neutral",
  secondary: "sky",
  success: "emerald",
  info: "sky",
  warning: "amber",
  error: "rose",
};

const COMPONENT_ALLOW_LIST = ["button"] as const;

export const appConfigRenderer: TextRenderer = {
  id: "app.config.ts",
  render(graph: TokenGraph) {
    const roles = deriveRoles(graph);
    const recipes = buildComponentRecipes(graph, {
      components: COMPONENT_ALLOW_LIST,
    });

    const lb = new LineBuilder();
    lb.push("// Generated by build-cli — Nuxt UI v4 component recipes + color role mapping");
    lb.push("// Generated from Figma component-layer tokens. Re-run the build to regenerate.");
    lb.blank();
    lb.push("export default defineAppConfig({");
    lb.push("  ui: {");

    // Colors block
    lb.push("    colors: {");
    for (const role of [
      "primary",
      "neutral",
      "secondary",
      "success",
      "info",
      "warning",
      "error",
    ] as const) {
      lb.push(`      ${role}: ${JSON.stringify(roles[role])},`);
    }
    lb.push("    },");

    // Component recipes
    for (const componentName of COMPONENT_ALLOW_LIST) {
      const recipe = recipes[componentName];
      if (!recipe) continue;
      emitRecipe(lb, componentName, recipe);
    }

    lb.push("  },");
    lb.push("});");
    lb.blank();
    return lb.build();
  },
};

function emitRecipe(lb: LineBuilder, name: string, recipe: ComponentRecipe): void {
  lb.push(`    ${name}: {`);

  const slotEntries = Object.entries(recipe.slots);
  if (slotEntries.length > 0) {
    lb.push("      slots: {");
    for (const [slot, classes] of slotEntries) {
      lb.push(`        ${slot}: ${JSON.stringify(classes)},`);
    }
    lb.push("      },");
  }

  const variantsAny =
    Object.keys(recipe.variants.size ?? {}).length > 0 ||
    Object.keys(recipe.variants.color ?? {}).length > 0 ||
    Object.keys(recipe.variants.state ?? {}).length > 0;

  if (variantsAny) {
    lb.push("      variants: {");
    for (const axis of ["size", "color", "state"] as const) {
      const axisMap = recipe.variants[axis];
      if (!axisMap || Object.keys(axisMap).length === 0) continue;
      lb.push(`        ${axis}: {`);
      const sortedKeys = Object.keys(axisMap).sort();
      for (const variantKey of sortedKeys) {
        const slotMap = axisMap[variantKey]!;
        lb.push(`          ${variantKey}: {`);
        for (const [slot, classes] of Object.entries(slotMap)) {
          lb.push(`            ${slot}: ${JSON.stringify(classes)},`);
        }
        lb.push("          },");
      }
      lb.push("        },");
    }
    lb.push("      },");
  }

  lb.push("    },");
}

function deriveRoles(_graph: TokenGraph): RoleMapping {
  // PR 2 keeps the conservative default. Hue-proximity matching is deferred.
  return DEFAULT_ROLES;
}
```

- [ ] **Step 2: Update renderers.test.ts**

Open `src/renderers/renderers.test.ts`. Find the existing app-config test(s) — they assert that the rendered output contains `defineAppConfig({` and the seven color roles. Extend them with a new test asserting that when given a graph with component-layer button tokens, the output contains a `button:` block with `slots:` and `variants:` keys.

A minimal new test:

```ts
it("emits button recipe when component tokens present", () => {
  const graph = /* build a graph with button-padding-x-sm and button-radius */;
  const rendered = appConfigRenderer.render(graph);
  expect(rendered.text).toContain("button: {");
  expect(rendered.text).toContain("slots:");
  expect(rendered.text).toContain("rounded-md"); // from button-radius=0.375rem
});
```

The exact fixture builder depends on the existing test file's helpers. Reuse `makeNode` / `makeGraph` if they exist; create them locally if not.

- [ ] **Step 3: Run + commit**

```bash
npm test -- src/renderers/renderers.test.ts
```

Expected: all assertions pass.

```bash
git add src/renderers/app-config.ts src/renderers/renderers.test.ts
git commit -m "feat: emit component recipes in app.config.ts"
```

Pre-commit hook must stay green.

- [ ] **Step 4: Smoke-run the typed CLI**

```bash
npm run build:tokens:typed
head -60 output/nuxt/app.config.ts
```

Expected: the file now contains a `button: { slots: { ... }, variants: { size: { sm: { base: '...' }, md: { ... } } } }` block matching the Figma component tokens in `components/global.tokens.json`.

If the button block is empty or missing, the graph may not have `button-*` component-layer tokens with the expected naming. Inspect `components/global.tokens.json` to verify token id shapes (`button-padding-x-sm` etc.) and adjust if naming differs.

---

## Phase J — Inspector OutputSection for `skip` tokens

### Task 5: Fill in the PR 2 placeholder

**Files:**
- Modify: `src/app/components/OutputSection.vue`

**Context:** In PR 1, the `skip`-classification branch shows a placeholder text ("Detailed Tailwind class list available in PR 2 (resolve-token.ts)"). Now resolve-token is here — replace the placeholder with the actual resolved Tailwind class list.

- [ ] **Step 1: Update the component**

In `src/app/components/OutputSection.vue`:

1. Add an import:

```ts
import { resolveTokenToValue } from "@core/resolve-token.js";
import { classifyToken } from "@core/classify-token.js";
import { getSlotMapping } from "@core/slot-mapping.js";
import { useState } from "../state.js"; // or whatever the existing state import is
```

(Adjust imports based on existing patterns in OutputSection — if it currently takes `classification` as a prop without graph access, it will need access to the graph too. Add a `graph` prop or use a composable.)

2. Add a `graph` prop (the current `Classification` is computed from the graph already in App.vue, but the resolver needs the full graph). The cleanest option: have the parent (App.vue) compute the resolved Tailwind class list and pass it as a new prop.

Simpler approach: keep OutputSection as-is for classification rendering, and the parent computes the `tailwindClasses` string for skip-kind tokens and passes it as an optional prop:

```ts
interface Props {
  classification: Classification;
  vueTemplateClasses?: string;  // pre-computed by parent for 'skip' kind
}
```

3. In the `skip` branch of the template:

```vue
<div v-else-if="classification.kind === 'skip'" class="space-y-2">
  <p class="text-xs text-zinc-500">
    Component-layer token — resolved at design-system-author time.
  </p>
  <template v-if="vueTemplateClasses">
    <code class="block text-sm font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 whitespace-pre-wrap break-words">
      {{ vueTemplateClasses }}
    </code>
    <button
      type="button"
      class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      @click="copy(vueTemplateClasses)"
    >
      Copy class string
    </button>
  </template>
  <p v-else class="text-xs text-zinc-500 italic">
    No Tailwind utility mapping available (token does not match any slot heuristic).
  </p>
</div>
```

4. In App.vue, add the computation. Where `selectedClassification` is currently defined, add:

```ts
const selectedVueTemplateClasses = computed(() => {
  const id = state.selection.value;
  const graph = state.graph.value;
  if (!id || !graph) return undefined;
  const node = graph.nodes.get(id);
  if (!node || node.layer !== "component") return undefined;
  const mapping = getSlotMapping(id);
  if (!mapping) return undefined;
  const resolved = resolveTokenToValue(id, graph);
  if ("error" in resolved) return undefined;
  const classification = classifyToken(
    { ...node, layer: "primitive", cssValue: { base: resolved.value } },
    graph,
  );
  if (classification.kind === "tailwind-default") {
    return classification.utility;
  }
  return undefined;
});
```

Pass it to OutputSection:

```vue
<OutputSection
  v-if="selectedClassification"
  :classification="selectedClassification"
  :vue-template-classes="selectedVueTemplateClasses"
/>
```

Add the needed imports in App.vue:

```ts
import { resolveTokenToValue } from "@core/resolve-token.js";
import { classifyToken } from "@core/classify-token.js";
import { getSlotMapping } from "@core/slot-mapping.js";
```

- [ ] **Step 2: Visual smoke**

```bash
npm run dev
```

Drop tokens, select a `skip`-classified component token (e.g. `button-padding-x-sm`), confirm the OutputSection now shows a real Tailwind class string (e.g. `px-2`) instead of the PR 1 placeholder.

- [ ] **Step 3: Typecheck + tests + commit**

```bash
npm run typecheck && npm test
```

Expected: typecheck green, tests still pass.

```bash
git add src/app/components/OutputSection.vue src/app/App.vue
git commit -m "feat: surface resolved Tailwind classes for skip tokens in OutputSection"
```

---

## Phase K — LiveButton Strategy B

### Task 6: LiveButton renders Tailwind classes from recipe engine

**Files:**
- Modify: `src/app/components/LiveButton.vue`

**Context:** LiveButton currently renders `<button>` styled with CSS variables (Strategy A). Strategy B: compute the actual Tailwind class list from the recipe engine, render `<button class="...">`, and show the class string adjacent for copy-paste.

- [ ] **Step 1: Inspect current LiveButton**

```bash
cat src/app/components/LiveButton.vue
```

Note the current props, computed values, and template structure.

- [ ] **Step 2: Refactor to Strategy B**

The core change: instead of computing inline `style` from CSS vars, compute Tailwind class lists for each (size × variant) cell from the recipe engine output. The template renders `<button class="...">` and a `<code>` block next to it.

In the `<script setup>`:

```ts
import { computed } from "vue";
import { buildComponentRecipes } from "@core/recipe-engine.js";
import { useState } from "../state.js";  // existing pattern

const state = useState();

const buttonRecipe = computed(() => {
  const graph = state.graph.value;
  if (!graph) return null;
  const recipes = buildComponentRecipes(graph, { components: ["button"] });
  return recipes.button ?? null;
});

const sizes = ["sm", "md", "lg"] as const;

interface PreviewCell {
  size: string;
  classes: string;
}

const previewCells = computed<PreviewCell[]>(() => {
  const recipe = buttonRecipe.value;
  if (!recipe) return [];
  const baseClasses = recipe.slots.base ?? "";
  return sizes.map((size) => {
    const sizeClasses = recipe.variants.size?.[size]?.base ?? "";
    return {
      size,
      classes: [baseClasses, sizeClasses].filter((s) => s.length > 0).join(" "),
    };
  });
});
```

Template:

```vue
<div class="space-y-3">
  <div v-for="cell in previewCells" :key="cell.size" class="flex items-center gap-4">
    <button
      type="button"
      :class="cell.classes + ' bg-blue-500 text-white hover:bg-blue-600 transition-colors'"
    >
      Button {{ cell.size }}
    </button>
    <code class="text-xs font-mono flex-1 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 break-all">
      {{ cell.classes }}
    </code>
  </div>
  <p v-if="!buttonRecipe" class="text-xs text-zinc-500 italic">
    No button tokens detected in the loaded graph.
  </p>
</div>
```

(The hardcoded `bg-blue-500 text-white hover:bg-blue-600` is just visual filler so the buttons render visibly — the actual recipe currently focuses on size/spacing, not color. Color variants are a follow-up PR.)

- [ ] **Step 3: Visual smoke**

```bash
npm run dev
```

Drop tokens, navigate to the LiveButton preview, confirm three buttons render with sizes sm/md/lg and the class string is shown next to each.

- [ ] **Step 4: Tests if any exist**

```bash
grep -l "LiveButton" src/app/**/*.test.ts || echo "no tests for LiveButton"
```

If tests exist, update them. If not, skip — this is a UI component covered by visual smoke.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LiveButton.vue
git commit -m "refactor: LiveButton uses Tailwind classes from recipe engine"
```

---

## Phase M — Resizable Sidebars

### Task 7: Resizable inspector panes via custom composable

**Files:**
- Create: `src/app/composables/use-resizable-pane.ts`
- Create: `src/app/components/ResizeHandle.vue`
- Modify: `src/app/App.vue` (replace fixed-width panel containers with resizable layout)

**Context:** App.vue currently uses fixed-width columns for the token list (left sidebar) and the detail / code-preview pane (right). Make both pane boundaries draggable. Persist user choice to `localStorage` under namespaced keys so the layout survives reloads. No new runtime dependencies — a small custom composable plus a hairline drag-handle component.

### Step 1: Inspect current layout

```bash
grep -n "class=\".*w-\\[\\|flex-1\\|sidebar\\|aside\\|grid-cols" src/app/App.vue | head -30
```

Identify the column structure. Most likely a flex layout with the left pane having a fixed Tailwind width (e.g. `w-80`, `w-96`) and the right content using `flex-1`. Or a CSS grid layout.

Note **how many resizable boundaries** there actually are. The user said "beide sidebars" — confirm whether there is one divider (left list vs. main detail) or two (left list, main, right code-preview). Adapt the rest of the task accordingly.

### Step 2: Write the composable

Create `src/app/composables/use-resizable-pane.ts`:

```ts
// Drag-resize state for a single pane boundary.
//
// Usage:
//   const { width, onPointerDown } = useResizablePane({
//     storageKey: 'inspector.leftPaneWidth',
//     initialWidth: 320,
//     minWidth: 240,
//     maxWidth: 640,
//   });
//
// Apply width to the pane via :style="{ width: width + 'px' }".
// Attach onPointerDown to a <ResizeHandle> sibling component.

import { ref, onMounted, onBeforeUnmount, type Ref } from "vue";

export interface ResizableOptions {
  storageKey: string;
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
}

export interface ResizableHandle {
  width: Ref<number>;
  onPointerDown: (event: PointerEvent) => void;
}

export function useResizablePane(opts: ResizableOptions): ResizableHandle {
  const width = ref(opts.initialWidth);
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function load(): void {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(opts.storageKey);
    if (!raw) return;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    width.value = clamp(parsed, opts.minWidth, opts.maxWidth);
  }

  function persist(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(opts.storageKey, String(width.value));
  }

  function onPointerDown(event: PointerEvent): void {
    dragging = true;
    startX = event.clientX;
    startWidth = width.value;
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    const delta = event.clientX - startX;
    width.value = clamp(startWidth + delta, opts.minWidth, opts.maxWidth);
  }

  function onPointerUp(): void {
    if (!dragging) return;
    dragging = false;
    persist();
  }

  onMounted(() => {
    load();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  });

  return { width, onPointerDown };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

### Step 3: Write the drag-handle component

Create `src/app/components/ResizeHandle.vue`:

```vue
<script setup lang="ts">
interface Props {
  /** Position relative to the pane that owns this handle. */
  side: "left" | "right";
}

interface Emits {
  (event: "pointerdown", e: PointerEvent): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div
    :class="[
      'absolute top-0 bottom-0 w-1 cursor-col-resize select-none group',
      side === 'right' ? 'right-0' : 'left-0',
    ]"
    @pointerdown="(e) => emit('pointerdown', e)"
    role="separator"
    aria-orientation="vertical"
  >
    <!-- Visible hairline on hover -->
    <div
      class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-transparent group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors"
    />
  </div>
</template>
```

### Step 4: Wire into App.vue

In `src/app/App.vue`:

1. Add imports:
```ts
import { useResizablePane } from "./composables/use-resizable-pane.js";
import ResizeHandle from "./components/ResizeHandle.vue";
```

2. Instantiate one composable per resizable pane. If there is only one boundary (most common case — left list pane vs. main content):

```ts
const leftPane = useResizablePane({
  storageKey: "inspector.leftPaneWidth",
  initialWidth: 320,
  minWidth: 240,
  maxWidth: 640,
});
```

If there are two boundaries (left list and right code-preview), add a second:

```ts
const rightPane = useResizablePane({
  storageKey: "inspector.rightPaneWidth",
  initialWidth: 480,
  minWidth: 320,
  maxWidth: 800,
});
```

3. Update the template. Find the existing pane container with the fixed Tailwind width class (e.g. `class="w-80 ..."`). Replace with:

```vue
<aside
  class="relative shrink-0 border-r border-zinc-200 dark:border-zinc-800"
  :style="{ width: leftPane.width.value + 'px' }"
>
  <!-- existing left sidebar content (search, FilterChips, SummaryPanel, list) -->
  …
  <ResizeHandle side="right" @pointerdown="leftPane.onPointerDown" />
</aside>
```

The handle is positioned on the **right edge** of the left pane (visually between left and main).

If there is a right pane too (code-preview / detail panel that should also be resizable), repeat the pattern with the handle on the `left` side of the right pane:

```vue
<aside
  class="relative shrink-0 border-l border-zinc-200 dark:border-zinc-800"
  :style="{ width: rightPane.width.value + 'px' }"
>
  <ResizeHandle side="left" @pointerdown="rightPane.onPointerDown" />
  <!-- existing right pane content -->
</aside>
```

For the `rightPane` case, the delta direction flips — dragging left should INCREASE the right pane's width. Adjust the composable invocation:

Either:
- Add a `direction: 'shrink' | 'grow'` option to the composable and invert the sign internally, OR
- Pass `-deltaX` from a wrapper handler in App.vue, OR
- Use the simplest local solution: when wiring the `rightPane`, multiply `event.clientX - startX` by `-1` before passing to `width.value = clamp(startWidth - delta, ...)`.

The cleanest approach is to add the `direction` option to the composable. Update the composable:

```ts
export interface ResizableOptions {
  storageKey: string;
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  direction?: "grow-right" | "grow-left"; // default "grow-right" (left pane)
}
```

And in `onPointerMove`:
```ts
const rawDelta = event.clientX - startX;
const delta = (opts.direction ?? "grow-right") === "grow-right" ? rawDelta : -rawDelta;
width.value = clamp(startWidth + delta, opts.minWidth, opts.maxWidth);
```

If the layout has only one boundary, skip this option entirely.

### Step 5: Visual smoke

```bash
npm run dev
```

Open in browser, grab each handle, drag left/right. Confirm:
- Width adjusts smoothly during drag
- Snap to min/max at boundaries
- Reload preserves the new width
- Cursor changes to `col-resize` on hover

### Step 6: Typecheck + tests + commit

```bash
npm run typecheck && npm test
```

Expected: all green.

```bash
git add src/app/composables/use-resizable-pane.ts src/app/components/ResizeHandle.vue src/app/App.vue
git commit -m "feat: resizable inspector sidebars with localStorage persistence"
```

Pre-commit hook must stay green.

---

## Phase L — Legacy removal + Release

### Task 8: Delete legacy code paths

**Files:**
- Delete: `src/renderers/css.ts`, `src/renderers/ts.ts`
- Delete: `build-tokens.mjs`
- Delete: `src/smoke.test.ts`, `src/diff.test.ts`
- Modify: `src/renderers/index.ts` (remove legacy exports)
- Modify: `package.json` (remove `build:tokens:legacy` script, simplify `build:tokens`)
- Modify: `src/app/state.ts` (drop legacy `OutputTab` entries, rename `"tokens-css"` to `"tokens.css"`)
- Modify: `src/app/App.vue` and `src/app/components/CodePreview.vue` (drop legacy tabs, update tab strings)
- Modify: `src/renderers/renderers.test.ts` (drop any tests that referenced removed renderers)

- [ ] **Step 1: Delete files**

```bash
git rm src/renderers/css.ts src/renderers/ts.ts build-tokens.mjs src/smoke.test.ts src/diff.test.ts
```

- [ ] **Step 2: Update `src/renderers/index.ts`**

```bash
cat src/renderers/index.ts
```

Remove any exports / registry entries for the deleted `cssRenderer` and `tsRenderer`. Keep only `tokensCssRenderer` and `appConfigRenderer`.

- [ ] **Step 3: Update `package.json`**

Replace the three `build:tokens*` lines with a single:

```json
"build:tokens": "tsx scripts/build-cli.ts"
```

Remove `build:tokens:legacy` and `build:tokens:typed`.

- [ ] **Step 4: Rename OutputTab in state.ts**

Change:

```ts
export type OutputTab = "tokens.css" | "app.config.ts" | "tokens.ts" | "tokens-css";
```

To:

```ts
export type OutputTab = "tokens.css" | "app.config.ts";
```

Update default in `createAppState` to `"tokens.css"` if it points elsewhere.

- [ ] **Step 5: Update CodePreview.vue + App.vue**

Find the tab list in `src/app/App.vue` (where T13 added the `"tokens-css"` tab). Update so the only two tabs are `"tokens.css"` and `"app.config.ts"`. Both now point to the new renderers (the old `tokens.css` legacy tab is gone — the tab name is reused for the new renderer).

The new renderer's id is currently `"tokens-css"`. To keep the OutputTab union clean, rename `tokensCssRenderer.id` to `"tokens.css"` (in `src/renderers/tokens-css.ts`). That makes the existing tab string match directly.

Same for `appConfigRenderer.id` — it's already `"app.config.ts"`, no change needed.

In CodePreview, drop the path-hint conditional for the legacy `tokens.ts` tab. Path hints stay:
- `tokens.css` → `assets/css/tokens.css`
- `app.config.ts` → `app.config.ts (or merge with existing)`

- [ ] **Step 6: Clean up renderers.test.ts**

Remove any tests that referenced the deleted renderers. Keep the tests covering `tokensCssRenderer` and `appConfigRenderer`.

- [ ] **Step 7: Run + typecheck**

```bash
npm run typecheck && npm test
```

Expected: typecheck green; all remaining tests pass. The test count drops (was 127 with smoke + diff; minus those tests, plus new resolve/slot/recipe tests).

- [ ] **Step 8: Run the build**

```bash
npm run build:tokens
ls output/
```

Expected: only `output/css/tokens.css` and `output/nuxt/app.config.ts` produced. No `output/tokens.css`, `output/tokens.ts`, `output/nuxt-ui.app.config.ts` (those came from the legacy `build-tokens.mjs`).

If old files persist from earlier builds, delete them:

```bash
rm -f output/tokens.css output/tokens.ts output/nuxt-ui.app.config.ts
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy renderers, build-tokens.mjs, smoke baseline"
```

Pre-commit hook must stay green.

---

### Task 9: README + CHANGELOG

**Files:**
- Modify: `README.md`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Update README**

Open `README.md`. Update key sections:

- **Title / description**: reframe as "Figma → Nuxt UI v4 design-token adapter and inspector". (Confirm against current title — adjust as needed.)
- **What it does**: a single paragraph explaining the Tailwind-utility-first principle (only mode-variant tokens become CSS vars; primitives match Tailwind defaults or extend `@theme`; component tokens become Nuxt UI recipes).
- **Output**: list the two files (`output/css/tokens.css`, `output/nuxt/app.config.ts`) with one-line descriptions.
- **Integration**: paste the three-line `@import` block:
  ```css
  @import "tailwindcss";
  @import "./tokens.css";
  @import "@nuxt/ui";
  ```
- **Build**: `npm run build:tokens`
- **Inspector**: brief description of what the live UI shows.

Keep it under ~150 lines total.

- [ ] **Step 2: Create CHANGELOG.md**

Create `CHANGELOG.md`:

```markdown
# Changelog

## [0.3.0] — 2026-05-20

### Added
- Classification engine (`src/classify-token.ts`): pure function classifying tokens as `skip`, `tailwind-default`, `theme-static`, or `theme-mode-variant`.
- Tailwind v4 defaults lookup (`src/tailwind-defaults.generated.ts` + `src/tailwind-defaults.ts`).
- New CSS renderer (`src/renderers/tokens-css.ts`) emitting `@theme` + `.dark` blocks scoped to mode-variant tokens.
- `src/resolve-token.ts` alias-chain resolver (cycle-safe).
- `src/slot-mapping.ts` heuristic + optional `slot-mapping.json` override.
- `src/recipe-engine.ts` walking component-layer tokens, assembling Nuxt UI v4 `{ slots, variants }` recipes.
- Updated `src/renderers/app-config.ts` emitting full `defineAppConfig` with `ui.colors` + `ui.button` recipe.
- Typed CLI (`scripts/build-cli.ts`) writing to `output/css/` and `output/nuxt/`.
- Inspector UI: classification badges, filter chips, summary panel, per-token Output section, LiveButton Strategy B preview.

### Changed
- Inspector code-preview tab default is now the new `tokens.css` (lean `@theme`-based output) — about 70% smaller than the legacy format.
- `src/renderers/app-config.ts` was rewritten from verbose slot-binding template to full Nuxt UI v4 recipe emission.

### Removed
- Legacy `build-tokens.mjs` CLI.
- Legacy `src/renderers/css.ts` and `src/renderers/ts.ts` renderers.
- Legacy `output/tokens.css`, `output/tokens.ts`, `output/nuxt-ui.app.config.ts` files.
- Legacy `src/smoke.test.ts` and `src/diff.test.ts` baselines.

### Migration

Consumers of `output/tokens.css` or `output/tokens.ts` from v0.2.0:
- Replace `@import "./tokens.css"` references to point at `./tokens.css` from `output/css/` (relocate the file to wherever your build expects it).
- Remove any imports of `tokens.ts` — the TS-export artifact is no longer emitted. Use Tailwind utility classes generated from `@theme` directly.

## [0.2.0] — 2026-05-14

Initial LiveButton preview pipeline, Figma embed integration, version badge in header. See git history for details.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: update README and add CHANGELOG for v0.3.0"
```

---

### Task 10: Version bump to v0.3.0 + tag + push

**Files:**
- Modify: `package.json` (version)
- Modify: `package-lock.json` (version sync)

- [ ] **Step 1: Bump version**

```bash
npm version 0.3.0 --no-git-tag-version
```

This updates both `package.json` and `package-lock.json` `version` fields to `0.3.0`. Skip the auto-tag (`--no-git-tag-version`) because we'll create an annotated tag after the commit.

- [ ] **Step 2: Verify the version**

```bash
grep '"version"' package.json package-lock.json | head -3
```

Both should show `0.3.0`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to 0.3.0"
```

- [ ] **Step 4: Create annotated tag**

```bash
git tag -a v0.3.0 -m "v0.3.0 — Tailwind-utility-first token output

Major refactor of the build pipeline. Output is now ~70% smaller,
matches Tailwind v4 conventions natively, and includes Nuxt UI v4
component recipes for the button. Legacy build-tokens.mjs and
related artifacts removed. See CHANGELOG.md for details."
```

- [ ] **Step 5: Push commits + tag**

```bash
git push origin main
git push origin v0.3.0
```

If the user prefers to push manually or via a release workflow, skip the push step and stop here.

- [ ] **Step 6: Final visual smoke**

```bash
npm run dev
```

Walk through:
1. Drop `components/*.tokens.json`
2. Verify Inspector UI is intact (badges, filters, summary, output, LiveButton)
3. Switch to the `app.config.ts` code-preview tab — confirm the `button` recipe with `slots` + `variants.size` blocks is visible
4. Switch to `tokens.css` — confirm `@theme` + `.dark` structure
5. Select a `skip`-classified component token (e.g. `button-padding-x-sm`) — confirm the resolved Tailwind class shows in OutputSection
6. Look at the LiveButton preview — three buttons (sm/md/lg) with class strings next to each

If everything looks right, the release is complete.

---

## Spec coverage check

Each PR 2 requirement from `2026-05-20-tailwind-utility-first-tokens-design.md` (updated commit `94521d2`) is implemented by:

- **`resolve-token.ts` (Phase F)** → Task 1
- **`slot-mapping.ts` heuristic + override (Phase G)** → Task 2
- **`recipe-engine.ts` walking component tokens (Phase H)** → Task 3
- **Updated `app-config.ts` renderer with recipes (Phase I)** → Task 4
- **OutputSection `skip` branch filled (Phase J)** → Task 5
- **LiveButton Strategy B (Phase K)** → Task 6
- **Resizable Sidebars (Phase M)** → Task 7
- **Legacy removal (Phase L)** → Task 8
- **README + CHANGELOG (Phase L)** → Task 9
- **v0.3.0 bump + tag + push (Phase L)** → Task 10

### Deferred (not in PR 2)

- Component recipes beyond `button` (`badge`, `card`, `input`, …)
- Hue-proximity matching for color role derivation (still uses default conservative mapping)
- `@tailwindcss/browser` runtime compiler (manual utility generation continues to suffice)
- Issues view new categories ("Custom spacing value detected", "Mode-invariant token in semantic layer", "Component token references mode-variant semantic")
- Playwright CI integration (visual smoke remains local-only via `gstack /browse`)

These can be picked up in subsequent PRs as the use case demands.
