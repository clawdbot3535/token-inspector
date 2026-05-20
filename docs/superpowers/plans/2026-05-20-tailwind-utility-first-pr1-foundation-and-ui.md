# Tailwind-Utility-First Token Output — PR 1: Foundation + UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure classification engine that decides for each token whether it becomes a Tailwind utility (no output), a `@theme` static var, or a mode-variant CSS Custom Property with `.dark` override. Wire two new renderers (`tokens-css.ts`, minimal `app-config.ts`) and a typed CLI that dual-emits alongside legacy `output/*` files. Surface classification info in the Inspector UI (badges, filter chips, summary panel, per-token Output section). Do not break v0.2.0 LiveButton preview or the legacy output format — PR 2 handles activation and removal.

**Architecture:** A pure function `classifyToken(node, graph)` returns a discriminated union describing how the token surfaces in the output (`skip`, `tailwind-default`, `theme-static`, `theme-mode-variant`). Renderers consume the classification map. The Inspector UI shows the same classification next to each token. Legacy renderers and `output/*` remain untouched; the new CLI writes to `output/css/` and `output/nuxt/` in parallel.

**Tech Stack:** TypeScript (strict), Vitest (snapshot + table-driven), Vue 3 Composition API, Tailwind v4 (`@theme` CSS-native), Node 22+ with `--experimental-strip-types` for the typed CLI runner. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-20-tailwind-utility-first-tokens-design.md`

---

## File Structure

### New files

- `scripts/extract-tailwind-defaults.mjs` — Read-once script that parses Tailwind's own `@theme` CSS and writes `src/tailwind-defaults.generated.ts`.
- `scripts/build-cli.ts` — Typed CLI runner; uses `buildGraph` + classification + new renderers, writes to `output/css/` and `output/nuxt/`.
- `src/tailwind-defaults.generated.ts` — Committed lookup tables: `value (string) → utility-suffix (string)` per category.
- `src/tailwind-defaults.ts` — Public API: `matchSpacing(value)`, `matchRadius(value)`, etc. plus `normalizeToRem(value, base?)`.
- `src/tailwind-defaults.test.ts` — Tests for the public API.
- `src/classify-token.ts` — The classification engine.
- `src/classify-token.test.ts` — Table-driven tests, one fixture per discriminated kind.
- `src/renderers/tokens-css.ts` — New renderer; produces `@theme { … }` + `.dark { … }` from a `Map<TokenId, Classification>`.
- `src/renderers/tokens-css.test.ts` — Snapshot tests.
- `src/app/classifications.ts` — Vue composable: builds a `Map<TokenId, Classification>` from the current graph; reactive.
- `src/app/components/ClassificationBadge.vue` — Small text-badge component (`tailwind` / `theme` / `mode-var` / `skip`).
- `src/app/components/FilterChips.vue` — Classification quick-filter chip row.
- `src/app/components/SummaryPanel.vue` — Top-strip totals + per-kind counts; clickable as quick-filters.
- `src/app/components/OutputSection.vue` — Per-classification "Output" / "Vue Template Usage" section in the detail panel.

### Modified files

- `package.json` — Add `extract-tailwind-defaults` and `build:tokens` (extended) npm scripts.
- `src/renderers/index.ts` — Export the new `tokensCssRenderer`. Leave existing renderers in place.
- `src/renderers/app-config.ts` — Drastically reduce to a minimal Nuxt UI color-role mapping (still consumed by Inspector + new CLI; legacy `build-tokens.mjs` is untouched and keeps its own inline implementation).
- `src/app/state.ts` — Extend `OutputTab` union and add `classificationFilter` filter state.
- `src/app/App.vue` — Mount `SummaryPanel`, `FilterChips`, `ClassificationBadge` (in list rows), and `OutputSection` (in detail panel).
- `src/app/components/CodePreview.vue` — Add tabs for the new outputs alongside legacy.

### Unchanged in PR 1 (touched in PR 2)

- `build-tokens.mjs` — Legacy CLI continues to write `output/*` unchanged.
- `src/renderers/css.ts`, `src/renderers/ts.ts` — Legacy renderers kept for transition.
- `src/smoke.test.ts` — Legacy baseline test stays.

---

## Phase A — Foundation

Pure logic. No user-visible changes. Each task is independently green and commit-ready.

### Task 1: Extract Tailwind v4 defaults into a committed lookup

**Files:**
- Create: `scripts/extract-tailwind-defaults.mjs`
- Create: `src/tailwind-defaults.generated.ts`
- Modify: `package.json` (add `extract-tailwind-defaults` script)

**Context:** Tailwind v4 ships its default `@theme` block as a CSS file inside `node_modules/tailwindcss`. The script reads that file, parses the variable declarations, and groups them by category (spacing, radius, font-size, etc.). Output is a TS file that exports plain `Record<string, string>` maps keyed by **value** (e.g. `'0.25rem'`) and valued by **utility suffix** (e.g. `'1'` for `p-1`). The generated file is committed so the build is deterministic.

- [ ] **Step 1: Create the extraction script**

Create `scripts/extract-tailwind-defaults.mjs`:

```js
#!/usr/bin/env node
// Reads Tailwind v4's default @theme CSS and writes a typed lookup table.
// Re-run after every Tailwind version bump:  npm run extract-tailwind-defaults
//
// The generated file is committed so production builds are deterministic
// and do not depend on node_modules at runtime.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const candidatePaths = [
  resolve(repoRoot, "node_modules/tailwindcss/theme.css"),
  resolve(repoRoot, "node_modules/tailwindcss/preflight.css"),
  resolve(repoRoot, "node_modules/tailwindcss/src/theme.css"),
];

const tailwindCssPath = candidatePaths.find((p) => existsSync(p));
if (!tailwindCssPath) {
  console.error("Could not locate Tailwind's theme.css. Checked:");
  for (const p of candidatePaths) console.error("  -", p);
  process.exit(1);
}

const css = readFileSync(tailwindCssPath, "utf8");

// Match the entire @theme { ... } block. Tailwind v4 uses exactly one.
const themeMatch = css.match(/@theme[^{]*\{([\s\S]*?)\n\}/);
if (!themeMatch) {
  console.error("No @theme block found in", tailwindCssPath);
  process.exit(1);
}

const declarations = {};
for (const line of themeMatch[1].split("\n")) {
  const m = line.match(/--([a-z][a-z0-9-]*)\s*:\s*([^;]+);/i);
  if (m) declarations[m[1]] = m[2].trim();
}

// Group: prefix -> { value -> suffix }
function group(prefix) {
  const out = {};
  const stripped = prefix.endsWith("-") ? prefix : prefix + "-";
  for (const [name, value] of Object.entries(declarations)) {
    if (!name.startsWith(stripped)) continue;
    const suffix = name.slice(stripped.length);
    if (suffix.includes("-") && !/^\d/.test(suffix)) {
      // multi-segment names like "weight-bold" go to a sub-map
      continue;
    }
    out[value] = suffix;
  }
  return out;
}

const tables = {
  SPACING: group("spacing"),
  RADIUS: group("radius"),
  FONT_SIZE: group("text"),
  FONT_WEIGHT: group("font-weight"),
  TRACKING: group("tracking"),
  LEADING: group("leading"),
  BORDER_WIDTH: group("border"),
};

function emit(name, table) {
  const entries = Object.entries(table)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
  return `export const ${name}: Readonly<Record<string, string>> = Object.freeze({\n${entries}\n});`;
}

const tailwindVersion = JSON.parse(
  readFileSync(resolve(repoRoot, "node_modules/tailwindcss/package.json"), "utf8"),
).version;

const body = [
  "// Auto-generated by scripts/extract-tailwind-defaults.mjs — do not edit by hand.",
  `// Source: ${tailwindCssPath.replace(repoRoot + "/", "")}`,
  `// Tailwind version: ${tailwindVersion}`,
  "",
  emit("SPACING", tables.SPACING),
  emit("RADIUS", tables.RADIUS),
  emit("FONT_SIZE", tables.FONT_SIZE),
  emit("FONT_WEIGHT", tables.FONT_WEIGHT),
  emit("TRACKING", tables.TRACKING),
  emit("LEADING", tables.LEADING),
  emit("BORDER_WIDTH", tables.BORDER_WIDTH),
  "",
].join("\n");

const outPath = resolve(repoRoot, "src/tailwind-defaults.generated.ts");
writeFileSync(outPath, body);

console.log("wrote", outPath);
for (const [name, table] of Object.entries(tables)) {
  console.log(" ", name, Object.keys(table).length, "entries");
}
```

- [ ] **Step 2: Add npm script**

In `package.json`, add to `scripts`:

```json
"extract-tailwind-defaults": "node scripts/extract-tailwind-defaults.mjs"
```

- [ ] **Step 3: Run the extraction**

```bash
npm run extract-tailwind-defaults
```

Expected: prints `wrote …/src/tailwind-defaults.generated.ts` and entry counts per category. If it errors with "Could not locate Tailwind's theme.css", inspect `node_modules/tailwindcss` to find the actual path and add it to `candidatePaths`.

- [ ] **Step 4: Hand-verify generated table**

Open `src/tailwind-defaults.generated.ts`. Spot-check that `SPACING` contains an entry mapping `"0.25rem"` to `"1"` (for `p-1`), `"1rem"` to `"4"` (for `p-4`), and `"24rem"` to `"96"`. Spot-check `RADIUS` contains a `"0.375rem" -> "md"` entry. If any are missing, the extraction script needs adjustment — review the script's regex against the actual `theme.css` content.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-tailwind-defaults.mjs src/tailwind-defaults.generated.ts package.json
git commit -m "feat: generate Tailwind v4 default lookup tables"
```

---

### Task 2: Public API for Tailwind-default matching

**Files:**
- Create: `src/tailwind-defaults.ts`
- Create: `src/tailwind-defaults.test.ts`

**Context:** The generated file gives us raw maps. This task wraps them with a typed API: `matchSpacing(value)`, `matchRadius(value)`, etc., and a `normalizeToRem(value, base?)` helper that turns `"4px"` into `"0.25rem"` for value-keyed lookup. Values may arrive as `"4px"`, `"0.25rem"`, `"4"` (unitless number-as-string), or `"0px"` — `normalizeToRem` covers all four. The base is configurable per build (default `16`) to support non-standard root font sizes.

- [ ] **Step 1: Write failing tests**

Create `src/tailwind-defaults.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeToRem,
  matchSpacing,
  matchRadius,
  matchFontSize,
} from "./tailwind-defaults.js";

describe("normalizeToRem", () => {
  it("converts px to rem at default 16px base", () => {
    expect(normalizeToRem("4px")).toBe("0.25rem");
    expect(normalizeToRem("16px")).toBe("1rem");
    expect(normalizeToRem("0px")).toBe("0");
  });

  it("respects custom rem base", () => {
    expect(normalizeToRem("16px", 14)).toBe("1.142857rem");
  });

  it("passes rem values through unchanged", () => {
    expect(normalizeToRem("0.5rem")).toBe("0.5rem");
    expect(normalizeToRem("0rem")).toBe("0");
  });

  it("treats unitless 0 as the canonical zero", () => {
    expect(normalizeToRem("0")).toBe("0");
  });

  it("returns null for non-length values", () => {
    expect(normalizeToRem("auto")).toBeNull();
    expect(normalizeToRem("100%")).toBeNull();
  });
});

describe("matchSpacing", () => {
  it("matches Tailwind default px values", () => {
    expect(matchSpacing("4px")).toBe("1");
    expect(matchSpacing("16px")).toBe("4");
  });

  it("matches Tailwind default rem values", () => {
    expect(matchSpacing("0.25rem")).toBe("1");
  });

  it("returns null for custom values", () => {
    expect(matchSpacing("5px")).toBeNull();
    expect(matchSpacing("18px")).toBeNull();
  });
});

describe("matchRadius", () => {
  it("matches default keyword sizes", () => {
    // 0.375rem → md
    expect(matchRadius("0.375rem")).toBe("md");
    expect(matchRadius("6px")).toBe("md");
  });

  it("returns null for non-default radii", () => {
    expect(matchRadius("14px")).toBeNull();
  });
});

describe("matchFontSize", () => {
  it("matches base font sizes", () => {
    expect(matchFontSize("1rem")).toBe("base");
    expect(matchFontSize("0.875rem")).toBe("sm");
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm test -- src/tailwind-defaults.test.ts
```

Expected: FAIL with module-not-found for `./tailwind-defaults.js`.

- [ ] **Step 3: Implement the API**

Create `src/tailwind-defaults.ts`:

```ts
// Public API over the generated Tailwind v4 defaults table.
// All matchers return a utility suffix on hit (e.g. "1" for spacing,
// "md" for radius) or null when the value does not correspond to a
// Tailwind default.

import {
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  TRACKING,
  LEADING,
  BORDER_WIDTH,
} from "./tailwind-defaults.generated.js";

const DEFAULT_REM_BASE = 16;

/**
 * Normalize a CSS length string to the rem form used as the lookup key.
 * Returns null for non-length values (auto, %, calc(), …).
 * `0` is canonicalized — `"0px"`, `"0rem"`, and `"0"` all return `"0"`.
 */
export function normalizeToRem(value: string, remBase = DEFAULT_REM_BASE): string | null {
  const trimmed = value.trim();
  if (trimmed === "0" || /^0(px|rem)$/.test(trimmed)) return "0";

  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (pxMatch) {
    const px = Number.parseFloat(pxMatch[1]);
    const rem = px / remBase;
    return `${trimRem(rem)}rem`;
  }

  const remMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)rem$/);
  if (remMatch) {
    const n = Number.parseFloat(remMatch[1]);
    return `${trimRem(n)}rem`;
  }

  return null;
}

function trimRem(n: number): string {
  // 6 decimal places, then strip trailing zeros, then trailing '.'
  return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function matcher(table: Readonly<Record<string, string>>) {
  return (value: string, remBase?: number): string | null => {
    const normalized = normalizeToRem(value, remBase);
    if (normalized === null) return null;
    return table[normalized] ?? table[value] ?? null;
  };
}

export const matchSpacing = matcher(SPACING);
export const matchRadius = matcher(RADIUS);
export const matchFontSize = matcher(FONT_SIZE);
export const matchTracking = matcher(TRACKING);
export const matchLeading = matcher(LEADING);
export const matchBorderWidth = matcher(BORDER_WIDTH);

/**
 * Font-weight values are unitless ("400", "700"). Direct lookup.
 */
export function matchFontWeight(value: string): string | null {
  return FONT_WEIGHT[value.trim()] ?? null;
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```bash
npm test -- src/tailwind-defaults.test.ts
```

Expected: PASS on all tests. If the radius assertion fails (e.g. `matchRadius("0.375rem") → "md"` returns something else), open the generated file and confirm Tailwind v4 maps `md` to `0.375rem`. Adjust the test if Tailwind's defaults differ from this plan.

- [ ] **Step 5: Commit**

```bash
git add src/tailwind-defaults.ts src/tailwind-defaults.test.ts
git commit -m "feat: add public API for Tailwind-default value matching"
```

---

### Task 3: Implement the classification engine

**Files:**
- Create: `src/classify-token.ts`

**Context:** Pure function. Takes a `TokenNode` and the full `TokenGraph` (graph is currently unused in PR 1 — passed for forward compatibility with PR 2's `resolve-token.ts`, where we'll walk alias chains). Returns a discriminated union. The decision tree exactly follows the spec (component-layer → skip; mode-variant → mode-variant; type-numeric + Tailwind-default match → tailwind-default; otherwise theme-static).

Mode-variance check is a node-level comparison: `node.themes.includes("light") && node.themes.includes("dark") && node.cssValue.light !== node.cssValue.dark`. Indirect mode-variance through aliases is out of scope for PR 1 — semantic-layer nodes carry their resolved light/dark values directly per `TokenNode.cssValue`. Component-layer mode-variance is impossible because component-layer tokens are skipped.

- [ ] **Step 1: Write the classification module**

Create `src/classify-token.ts`:

```ts
// Pure classification engine. Given a TokenNode, decides how it surfaces
// in the output: as a Tailwind utility (no output), a static @theme var,
// a mode-variant @theme var with .dark override, or skipped entirely.
//
// This module is the single source of truth shared by:
//   - renderers/tokens-css.ts (build-time output)
//   - src/app/classifications.ts (Inspector live view)

import type { TokenGraph, TokenNode } from "./token-graph.js";
import {
  matchSpacing,
  matchRadius,
  matchFontSize,
  matchFontWeight,
  matchTracking,
  matchLeading,
  matchBorderWidth,
} from "./tailwind-defaults.js";

export type ClassificationKind =
  | "skip"
  | "tailwind-default"
  | "theme-static"
  | "theme-mode-variant";

export type Classification =
  | { kind: "skip"; reason: "component-layer" }
  | {
      kind: "tailwind-default";
      utility: string; // e.g. 'p-1', 'rounded-md'
      utilityCategory: TailwindCategory;
      resolvedValue: string; // e.g. '0.25rem' — for Inspector tooltip
    }
  | {
      kind: "theme-static";
      cssName: string; // e.g. '--color-blue-500' (with leading --)
      value: string; // e.g. '#3b82f6'
      modeInvariantHint: boolean; // true if node is in semantic layer but light === dark
      utilityHint?: { utility: string; resolvedValue: string }; // close-but-not-exact suggestion
    }
  | {
      kind: "theme-mode-variant";
      cssName: string;
      lightValue: string;
      darkValue: string;
    };

export type TailwindCategory =
  | "spacing"
  | "radius"
  | "font-size"
  | "font-weight"
  | "tracking"
  | "leading"
  | "border-width";

export interface ClassifyOptions {
  /** Root font size in px for px-to-rem conversion. Default 16. */
  remBase?: number;
}

/**
 * Classify a single token. The graph argument is currently unused but
 * reserved for PR 2's indirect-alias mode-variance resolution.
 */
export function classifyToken(
  node: TokenNode,
  _graph: TokenGraph,
  options: ClassifyOptions = {},
): Classification {
  // 1. Layer check — component-layer tokens never appear in output.
  if (node.layer === "component") {
    return { kind: "skip", reason: "component-layer" };
  }

  // 2. Mode-variance check — semantic nodes with diverging light/dark.
  const lightValue = node.cssValue.light;
  const darkValue = node.cssValue.dark;
  const hasLight = lightValue !== undefined;
  const hasDark = darkValue !== undefined;
  if (hasLight && hasDark && lightValue !== darkValue) {
    return {
      kind: "theme-mode-variant",
      cssName: `--${node.id}`,
      lightValue: lightValue as string,
      darkValue: darkValue as string,
    };
  }

  // 3. Resolve the single canonical value for non-mode-variant nodes.
  const value =
    node.cssValue.base ?? node.cssValue.light ?? node.cssValue.dark ?? "";
  if (!value) {
    // No value at all — defensively classify as static empty.
    return {
      kind: "theme-static",
      cssName: `--${node.id}`,
      value: "",
      modeInvariantHint: false,
    };
  }

  // 4. Numeric types — try Tailwind-default match.
  const category = tailwindCategoryFor(node);
  if (category) {
    const matched = matchForCategory(category, value, options.remBase);
    if (matched) {
      return {
        kind: "tailwind-default",
        utility: `${utilityPrefix(category)}${matched}`,
        utilityCategory: category,
        resolvedValue: value,
      };
    }
    // Numeric but no match — emit as theme-static with hint.
    return {
      kind: "theme-static",
      cssName: `--${node.id}`,
      value,
      modeInvariantHint: isModeInvariantSemantic(node),
      utilityHint: nearestUtilityHint(category, value, options.remBase),
    };
  }

  // 5. Non-numeric (color, shadow, gradient, font-family, string) — theme-static.
  return {
    kind: "theme-static",
    cssName: `--${node.id}`,
    value,
    modeInvariantHint: isModeInvariantSemantic(node),
  };
}

/**
 * Build a full classification map for the graph.
 */
export function classifyGraph(
  graph: TokenGraph,
  options: ClassifyOptions = {},
): Map<string, Classification> {
  const out = new Map<string, Classification>();
  for (const node of graph.nodes.values()) {
    out.set(node.id, classifyToken(node, graph, options));
  }
  return out;
}

// ---------- Helpers ----------

function isModeInvariantSemantic(node: TokenNode): boolean {
  // Node lives in the semantic source (light/dark) but its light/dark
  // values are identical — caller may want to surface a warning.
  if (node.source !== "light" && node.source !== "dark") return false;
  if (node.cssValue.light === undefined || node.cssValue.dark === undefined) {
    return false;
  }
  return node.cssValue.light === node.cssValue.dark;
}

function tailwindCategoryFor(node: TokenNode): TailwindCategory | null {
  // Map TokenType + id-prefix to Tailwind category.
  switch (node.type) {
    case "dimension":
    case "number": {
      const id = node.id;
      if (/^spacing-/.test(id) || /-spacing-/.test(id) || /^space-/.test(id)) {
        return "spacing";
      }
      if (/^radius-/.test(id) || /-radius-/.test(id) || /^rounded-/.test(id)) {
        return "radius";
      }
      if (/^font-size-/.test(id) || /^text-/.test(id)) return "font-size";
      if (/^tracking-/.test(id) || /^letter-spacing-/.test(id)) return "tracking";
      if (/^leading-/.test(id) || /^line-height-/.test(id)) return "leading";
      if (/^border(-width)?-/.test(id)) return "border-width";
      // Fallback: treat as spacing for unprefixed numerics.
      return "spacing";
    }
    case "fontWeight":
      return "font-weight";
    default:
      return null;
  }
}

function matchForCategory(
  category: TailwindCategory,
  value: string,
  remBase?: number,
): string | null {
  switch (category) {
    case "spacing":
      return matchSpacing(value, remBase);
    case "radius":
      return matchRadius(value, remBase);
    case "font-size":
      return matchFontSize(value, remBase);
    case "font-weight":
      return matchFontWeight(value);
    case "tracking":
      return matchTracking(value, remBase);
    case "leading":
      return matchLeading(value, remBase);
    case "border-width":
      return matchBorderWidth(value, remBase);
  }
}

function utilityPrefix(category: TailwindCategory): string {
  switch (category) {
    case "spacing":
      return "p-"; // Inspector display only — actual usage may be p- / m- / gap-.
    case "radius":
      return "rounded-";
    case "font-size":
      return "text-";
    case "font-weight":
      return "font-";
    case "tracking":
      return "tracking-";
    case "leading":
      return "leading-";
    case "border-width":
      return "border-";
  }
}

function nearestUtilityHint(
  category: TailwindCategory,
  _value: string,
  _remBase?: number,
): { utility: string; resolvedValue: string } | undefined {
  // PR 1 ships without nearest-neighbor computation. The hint field is
  // reserved; the Inspector simply omits the subline when undefined.
  // PR 2 may fill this in if the visual review surfaces real need.
  void category;
  return undefined;
}
```

- [ ] **Step 2: Sanity-check with the typechecker**

```bash
npm run typecheck
```

Expected: PASS — no type errors. The `_graph` and `_value` underscore prefixes silence "unused parameter" lints.

- [ ] **Step 3: Commit**

```bash
git add src/classify-token.ts
git commit -m "feat: add token classification engine"
```

---

### Task 4: Classification test suite

**Files:**
- Create: `src/classify-token.test.ts`

**Context:** Table-driven tests, one fixture per discriminated kind. We build minimal `TokenNode` fixtures inline (no need for full graphs since `classifyToken` only reads from the node itself in PR 1). Property test: classification is deterministic across repeated calls on the same input.

- [ ] **Step 1: Write the test file**

Create `src/classify-token.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests, confirm they pass**

```bash
npm test -- src/classify-token.test.ts
```

Expected: PASS on all tests. If the `rounded-md` test fails because the generated table maps `md` to a different rem value, regenerate via `npm run extract-tailwind-defaults` and adjust the test's expected value.

- [ ] **Step 3: Commit**

```bash
git add src/classify-token.test.ts
git commit -m "test: cover classification engine across all kinds"
```

---

## Phase B — Renderers + Dual-Emit

New renderers produce the Tailwind-utility-first output. The CLI dual-emits alongside legacy.

### Task 5: New CSS renderer with `@theme` + `.dark` sections

**Files:**
- Create: `src/renderers/tokens-css.ts`
- Create: `src/renderers/tokens-css.test.ts`
- Modify: `src/renderers/index.ts`

**Context:** Builds a renderer that consumes a classification map and emits a single `tokens.css` string. Sections in fixed order (Primitive Colors → Mode-invariant Brand Colors → Non-default Spacing → Non-default Radius → Mode-variant Semantics → Mode-variant Shadows). Alphabetical within each section. Section headers as single-line comments. Mode-invariant tokens get a `/* mode-invariant: same in light + dark */` comment line before the declaration. Tailwind-default classifications are skipped (no output). Skip classifications are also skipped.

The renderer follows the existing `TextRenderer` contract from `src/token-graph.ts` — returns `{ text, lines: LineMap }` for Inspector cross-highlighting.

- [ ] **Step 1: Write snapshot tests**

Create `src/renderers/tokens-css.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Write the renderer**

Create `src/renderers/tokens-css.ts`:

```ts
// Tailwind-utility-first CSS renderer.
//
// Consumes the classification map for a TokenGraph and emits:
//   @theme { ... }       (Tailwind v4 theme block)
//   .dark { ... }        (mode-variant overrides)
//
// Tokens classified as `tailwind-default` or `skip` produce no output.

import type { TextRenderer, TokenGraph } from "../token-graph.js";
import { LineBuilder } from "./line-builder.js";
import { classifyGraph, type Classification } from "../classify-token.js";

type SectionKey =
  | "primitive-colors"
  | "mode-invariant-brand"
  | "non-default-spacing"
  | "non-default-radius"
  | "non-default-font"
  | "mode-variant-semantics"
  | "mode-variant-shadows";

const SECTION_HEADERS: ReadonlyArray<readonly [SectionKey, string]> = [
  ["primitive-colors", "Primitive Colors"],
  ["mode-invariant-brand", "Mode-invariant Brand Colors"],
  ["non-default-spacing", "Non-default Spacing"],
  ["non-default-radius", "Non-default Radius"],
  ["non-default-font", "Non-default Typography"],
  ["mode-variant-semantics", "Mode-variant Semantics (light defaults)"],
  ["mode-variant-shadows", "Mode-variant Shadows"],
];

interface ThemeEntry {
  cssName: string;
  value: string;
  tokenId: string;
  modeInvariantHint: boolean;
}

interface DarkOverride {
  cssName: string;
  value: string;
  tokenId: string;
}

export const tokensCssRenderer: TextRenderer = {
  id: "tokens-css",
  render(graph: TokenGraph) {
    const classifications = classifyGraph(graph);
    const sections = new Map<SectionKey, ThemeEntry[]>();
    for (const [key] of SECTION_HEADERS) {
      sections.set(key, []);
    }

    const darkOverrides: DarkOverride[] = [];

    for (const [tokenId, classification] of classifications) {
      const node = graph.nodes.get(tokenId);
      if (!node) continue;
      bucketize(node.id, node.type, classification, sections, darkOverrides);
    }

    const lb = new LineBuilder();
    lb.push("/* Generated by build-cli — do not edit by hand */");
    lb.push("/* Source: components/*.tokens.json */");
    lb.blank();
    lb.push("@theme {");
    let firstSection = true;
    for (const [sectionKey, label] of SECTION_HEADERS) {
      const entries = sections.get(sectionKey) ?? [];
      if (entries.length === 0) continue;
      if (!firstSection) lb.blank();
      firstSection = false;
      lb.push(`  /* — ${label} — */`);
      entries.sort((a, b) => a.cssName.localeCompare(b.cssName));
      for (const entry of entries) {
        if (entry.modeInvariantHint) {
          lb.push("  /* mode-invariant: same in light + dark */");
        }
        lb.pushWithToken(`  ${entry.cssName}: ${entry.value};`, entry.tokenId);
      }
    }
    lb.push("}");

    if (darkOverrides.length > 0) {
      lb.blank();
      lb.push("/* Dark mode overrides */");
      lb.push(".dark {");
      darkOverrides.sort((a, b) => a.cssName.localeCompare(b.cssName));
      for (const o of darkOverrides) {
        lb.pushWithToken(`  ${o.cssName}: ${o.value};`, o.tokenId);
      }
      lb.push("}");
    }

    lb.blank();
    return lb.build();
  },
};

function bucketize(
  tokenId: string,
  tokenType: string,
  c: Classification,
  sections: Map<SectionKey, ThemeEntry[]>,
  darkOverrides: DarkOverride[],
): void {
  if (c.kind === "skip" || c.kind === "tailwind-default") return;

  if (c.kind === "theme-mode-variant") {
    const isShadow = tokenType === "shadow";
    const key: SectionKey = isShadow
      ? "mode-variant-shadows"
      : "mode-variant-semantics";
    push(sections, key, {
      cssName: c.cssName,
      value: c.lightValue,
      tokenId,
      modeInvariantHint: false,
    });
    darkOverrides.push({
      cssName: c.cssName,
      value: c.darkValue,
      tokenId,
    });
    return;
  }

  // theme-static
  const key = sectionFor(tokenType, c.cssName, c.modeInvariantHint);
  push(sections, key, {
    cssName: c.cssName,
    value: c.value,
    tokenId,
    modeInvariantHint: c.modeInvariantHint,
  });
}

function push(
  sections: Map<SectionKey, ThemeEntry[]>,
  key: SectionKey,
  entry: ThemeEntry,
): void {
  const arr = sections.get(key) ?? [];
  arr.push(entry);
  sections.set(key, arr);
}

function sectionFor(
  tokenType: string,
  cssName: string,
  modeInvariantHint: boolean,
): SectionKey {
  if (tokenType === "color") {
    return modeInvariantHint ? "mode-invariant-brand" : "primitive-colors";
  }
  if (cssName.startsWith("--spacing-")) return "non-default-spacing";
  if (cssName.startsWith("--radius-") || cssName.startsWith("--rounded-")) {
    return "non-default-radius";
  }
  if (
    cssName.startsWith("--text-") ||
    cssName.startsWith("--font-") ||
    cssName.startsWith("--leading-") ||
    cssName.startsWith("--tracking-")
  ) {
    return "non-default-font";
  }
  // Fallback for unrecognized prefixes.
  return "primitive-colors";
}
```

- [ ] **Step 3: Export from the renderer index**

Modify `src/renderers/index.ts` — add the new export. The exact line depends on the current content; add this export alongside the others (do not remove existing exports):

```ts
export { tokensCssRenderer } from "./tokens-css.js";
```

If `defaultRenderers` is an array or registry in `src/renderers/index.ts`, append `tokensCssRenderer` to it. The Inspector will pick it up automatically once `state.ts` references the new tab in Task 12.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/renderers/tokens-css.test.ts
```

Expected: PASS on all tests. Snapshot tests create new snapshot files on first run — review the diff before committing.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/tokens-css.ts src/renderers/tokens-css.test.ts src/renderers/index.ts src/renderers/__snapshots__/
git commit -m "feat: add Tailwind-utility-first tokens.css renderer"
```

---

### Task 6: Reduce `app-config.ts` renderer to minimal Nuxt UI color mapping

**Files:**
- Modify: `src/renderers/app-config.ts`
- Modify: `src/renderers/renderers.test.ts` (update assertions if they exist for the old behavior)

**Context:** The existing `app-config.ts` renderer emits a verbose template wired to specific Nuxt UI slots. The new contract: emit only a minimal `defineAppConfig` block with `ui.colors` role mapping (`primary`, `neutral`, `secondary`, `success`, `info`, `warning`, `error`). Role mapping is heuristic — scan the semantic palette names in the graph and match by name similarity to Nuxt UI role names. Conservative fallback to `'blue'`, `'zinc'`, etc.

- [ ] **Step 1: Read the existing renderer**

```bash
cat src/renderers/app-config.ts
```

Note the existing structure — it implements the `TextRenderer` contract with an `id` and `render(graph)` method. Keep that contract.

- [ ] **Step 2: Rewrite the renderer**

Overwrite `src/renderers/app-config.ts` with the minimal version:

```ts
// Minimal Nuxt UI v4 color-role mapping.
//
// Emits a defineAppConfig block with ui.colors mapping standard Nuxt UI
// roles (primary, neutral, secondary, success, info, warning, error) to
// palette names derived from the loaded graph. The body is always
// rendered as a suggestion — the consuming project may merge or replace.

import type { TextRenderer, TokenGraph } from "../token-graph.js";
import { LineBuilder } from "./line-builder.js";

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

export const appConfigRenderer: TextRenderer = {
  id: "app.config.ts",
  render(graph: TokenGraph) {
    const roles = deriveRoles(graph);
    const lb = new LineBuilder();
    lb.push("// Generated by build-cli — Nuxt UI v4 color role mapping");
    lb.push("// Suggested defaults; adjust to your taste in the consuming Nuxt project.");
    lb.blank();
    lb.push("export default defineAppConfig({");
    lb.push("  ui: {");
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
    lb.push("  },");
    lb.push("});");
    lb.blank();
    return lb.build();
  },
};

/**
 * Heuristic role derivation from the graph's semantic palette names.
 * For PR 1, returns DEFAULT_ROLES — Inspector's "suggestion" framing
 * is honest because we have not yet implemented hue-proximity matching.
 * PR 2 may sharpen this once the build is wired end-to-end.
 */
function deriveRoles(_graph: TokenGraph): RoleMapping {
  return DEFAULT_ROLES;
}
```

- [ ] **Step 3: Update existing tests if needed**

```bash
npm test -- src/renderers/renderers.test.ts
```

If tests fail because they asserted the old verbose output, edit `src/renderers/renderers.test.ts` to assert the new minimal shape: presence of `defineAppConfig`, presence of each role key, and absence of the old `button.slots.base` comments.

- [ ] **Step 4: Verify renderers.test.ts passes**

```bash
npm test -- src/renderers/renderers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/app-config.ts src/renderers/renderers.test.ts
git commit -m "refactor: reduce app-config renderer to minimal Nuxt UI color map"
```

---

### Task 7: Typed CLI that dual-emits to `output/css/` and `output/nuxt/`

**Files:**
- Create: `scripts/build-cli.ts`
- Modify: `package.json`

**Context:** A new CLI that uses the typed pipeline (`buildGraph` + classification + new renderers) and writes to `output/css/tokens.css` and `output/nuxt/app.config.ts`. Runs via Node 22's `--experimental-strip-types`. The legacy `build-tokens.mjs` continues to write `output/tokens.css`, `output/tokens.ts`, and `output/nuxt-ui.app.config.ts` unchanged. The combined `npm run build:tokens` script runs both.

- [ ] **Step 1: Write the CLI**

Create `scripts/build-cli.ts`:

```ts
#!/usr/bin/env node
// Typed CLI for the Tailwind-utility-first pipeline.
// Reads components/*.tokens.json, builds the graph, classifies every
// token, and writes the new tokens.css + app.config.ts to output/css/
// and output/nuxt/. The legacy build-tokens.mjs remains untouched and
// continues to write output/* in parallel during the transition window.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../src/build-graph.ts";
import { tokensCssRenderer } from "../src/renderers/tokens-css.ts";
import { appConfigRenderer } from "../src/renderers/app-config.ts";
import type { SourceFile, SourceLayer } from "../src/token-graph.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const inDir = resolve(repoRoot, "components");
const outRoot = resolve(repoRoot, "output");

const SOURCE_FILES: ReadonlyArray<{ name: SourceLayer; file: string }> = [
  { name: "color", file: "color.tokens.json" },
  { name: "dimension", file: "dimension.tokens.json" },
  { name: "typography", file: "typography.tokens.json" },
  { name: "light", file: "light.tokens.json" },
  { name: "dark", file: "dark.tokens.json" },
  { name: "global", file: "global.tokens.json" },
];

function load(name: SourceLayer, file: string): SourceFile {
  const path = resolve(inDir, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  return { name, data };
}

function writeOut(relativePath: string, content: string): void {
  const full = resolve(outRoot, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log("wrote", relativePath, content.length, "bytes");
}

const sources = SOURCE_FILES.map((s) => load(s.name, s.file));
const graph = buildGraph(sources);

if (graph.issues.length > 0) {
  console.warn(`built with ${graph.issues.length} issue(s):`);
  for (const issue of graph.issues.slice(0, 10)) {
    console.warn(" ", issue.kind, issue.message);
  }
}

const cssRendered = tokensCssRenderer.render(graph);
const appConfigRendered = appConfigRenderer.render(graph);

writeOut("css/tokens.css", cssRendered.text);
writeOut("nuxt/app.config.ts", appConfigRendered.text);
```

- [ ] **Step 2: Extend npm scripts**

Modify `package.json` `scripts` block:

```json
"build:tokens": "npm run build:tokens:legacy && npm run build:tokens:typed",
"build:tokens:legacy": "node build-tokens.mjs",
"build:tokens:typed": "node --experimental-strip-types scripts/build-cli.ts"
```

(Replace the existing single `build:tokens` line with these three.)

- [ ] **Step 3: Run the new CLI**

```bash
npm run build:tokens:typed
```

Expected output: lines like `wrote css/tokens.css NNNN bytes` and `wrote nuxt/app.config.ts MM bytes`. If Node prints an "experimental warning" about strip-types, that is expected. If the script errors with `Unknown file extension ".ts"`, the local Node is older than 22 — verify with `node --version`.

- [ ] **Step 4: Inspect the output**

```bash
head -40 output/css/tokens.css
head -20 output/nuxt/app.config.ts
```

Expected: the CSS file starts with the generated header, contains an `@theme {` block with section headers, and ends with a `.dark {` block (assuming the dropped tokens have any mode-variant entries). The `app.config.ts` contains the `defineAppConfig` block with seven role entries.

- [ ] **Step 5: Verify legacy output is still produced**

```bash
npm run build:tokens
ls output/
ls output/css/
ls output/nuxt/
```

Expected: `output/` contains the legacy files (`tokens.css`, `tokens.ts`, `nuxt-ui.app.config.ts`) AND the new subdirectories `output/css/` and `output/nuxt/`.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-cli.ts package.json
git commit -m "feat: add typed CLI with dual-emit to output/css and output/nuxt"
```

---

## Phase C — Inspector UI

Surface classification info in the live Inspector without breaking existing flows.

### Task 8: Classifications composable

**Files:**
- Create: `src/app/classifications.ts`

**Context:** A small Vue composable that builds and memoizes the classification map for the current graph. Reactive to `graph` changes. Used by every UI component that needs to query a token's classification (badge, summary, output section).

- [ ] **Step 1: Write the composable**

Create `src/app/classifications.ts`:

```ts
// Reactive classification map for the loaded graph.
//
// Builds Map<TokenId, Classification> on demand and memoizes by graph
// identity — recomputes only when a new graph is dropped.

import { computed, type ComputedRef, type Ref } from "vue";
import type { TokenGraph } from "@core/token-graph.js";
import {
  classifyGraph,
  type Classification,
  type ClassificationKind,
} from "@core/classify-token.js";

export interface ClassificationSummary {
  readonly total: number;
  readonly tailwind: number;
  readonly themeStatic: number;
  readonly modeVariant: number;
  readonly skipped: number;
}

export function useClassifications(
  graph: Ref<TokenGraph | null>,
): {
  classifications: ComputedRef<ReadonlyMap<string, Classification>>;
  summary: ComputedRef<ClassificationSummary>;
  kindOf: (tokenId: string) => ClassificationKind | null;
} {
  const classifications = computed<ReadonlyMap<string, Classification>>(() => {
    const g = graph.value;
    if (!g) return new Map();
    return classifyGraph(g);
  });

  const summary = computed<ClassificationSummary>(() => {
    let tailwind = 0;
    let themeStatic = 0;
    let modeVariant = 0;
    let skipped = 0;
    for (const c of classifications.value.values()) {
      switch (c.kind) {
        case "tailwind-default":
          tailwind++;
          break;
        case "theme-static":
          themeStatic++;
          break;
        case "theme-mode-variant":
          modeVariant++;
          break;
        case "skip":
          skipped++;
          break;
      }
    }
    return {
      total: tailwind + themeStatic + modeVariant + skipped,
      tailwind,
      themeStatic,
      modeVariant,
      skipped,
    };
  });

  function kindOf(tokenId: string): ClassificationKind | null {
    return classifications.value.get(tokenId)?.kind ?? null;
  }

  return { classifications, summary, kindOf };
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS. Resolves the `@core/` alias correctly per `vite.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/classifications.ts
git commit -m "feat: add classifications composable for Inspector UI"
```

---

### Task 9: ClassificationBadge component

**Files:**
- Create: `src/app/components/ClassificationBadge.vue`

**Context:** A small text-badge component (no icon, no emoji). One of four states: `tailwind`, `theme`, `mode-var`, `skip`. Each gets a distinct neutral color from the Nuxt UI semantic palette to avoid visual noise. The badge is consumed by token list rows and (via slot inclusion) the summary panel.

- [ ] **Step 1: Write the component**

Create `src/app/components/ClassificationBadge.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ClassificationKind } from "@core/classify-token.js";

interface Props {
  kind: ClassificationKind;
}

const props = defineProps<Props>();

interface BadgeStyle {
  label: string;
  classes: string;
}

const STYLES: Record<ClassificationKind, BadgeStyle> = {
  "tailwind-default": {
    label: "tailwind",
    classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  "theme-static": {
    label: "theme",
    classes: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  "theme-mode-variant": {
    label: "mode-var",
    classes: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  skip: {
    label: "skip",
    classes: "bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
  },
};

const style = computed<BadgeStyle>(() => STYLES[props.kind]);
</script>

<template>
  <span
    :class="['inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide', style.classes]"
  >
    {{ style.label }}
  </span>
</template>
```

- [ ] **Step 2: Integrate into App.vue token list**

In `src/app/App.vue`, locate the token list rendering (search for the component that renders filtered node rows — likely `<TokenPreview>` or a `v-for` over `useFilteredNodes`). Add an import:

```ts
import ClassificationBadge from "./components/ClassificationBadge.vue";
import { useClassifications } from "./classifications.js";
```

Below the existing state setup, instantiate the composable:

```ts
const { kindOf } = useClassifications(state.graph);
```

In the token list row template, alongside the existing token name/value display, add:

```vue
<ClassificationBadge v-if="kindOf(node.id)" :kind="kindOf(node.id)!" />
```

Adjust the row layout (flex/gap) so the badge fits inline without breaking existing spacing.

- [ ] **Step 3: Visual smoke**

```bash
npm run dev
```

Open `http://localhost:5173`, drop the `components/*.tokens.json` files, confirm each row shows a badge that reflects the classification.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/ClassificationBadge.vue src/app/App.vue
git commit -m "feat: add classification badges to token list"
```

---

### Task 10: Filter chips for classification

**Files:**
- Create: `src/app/components/FilterChips.vue`
- Modify: `src/app/state.ts`
- Modify: `src/app/App.vue`

**Context:** Quick-filter chip row: **All · Tailwind · Theme · Dark-var · Component**. Default `All`. Selecting a chip filters the token list to that kind. State extends `Filters` with a `classificationKind: 'all' | ClassificationKind` field.

- [ ] **Step 1: Extend state**

In `src/app/state.ts`, add to the `Filters` interface:

```ts
export type ClassificationFilter =
  | "all"
  | "tailwind-default"
  | "theme-static"
  | "theme-mode-variant"
  | "skip";

export interface Filters {
  search: string;
  layers: ReadonlyArray<GraphLayer>;
  types: ReadonlyArray<TokenType>;
  classification: ClassificationFilter;
}
```

Update the `createAppState` default to include `classification: "all"`.

If a `useFilteredNodes` helper exists in the same file, extend its filter predicate to honor `state.filters.value.classification` by consulting the classifications composable.

- [ ] **Step 2: Write the FilterChips component**

Create `src/app/components/FilterChips.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ClassificationFilter } from "../state.js";
import type { ClassificationSummary } from "../classifications.js";

interface Props {
  modelValue: ClassificationFilter;
  summary: ClassificationSummary;
}

interface Emits {
  (event: "update:modelValue", value: ClassificationFilter): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

interface ChipDef {
  value: ClassificationFilter;
  label: string;
  count: (s: ClassificationSummary) => number;
}

const CHIPS: ReadonlyArray<ChipDef> = [
  { value: "all", label: "All", count: (s) => s.total },
  { value: "tailwind-default", label: "Tailwind", count: (s) => s.tailwind },
  { value: "theme-static", label: "Theme", count: (s) => s.themeStatic },
  { value: "theme-mode-variant", label: "Dark-var", count: (s) => s.modeVariant },
  { value: "skip", label: "Component", count: (s) => s.skipped },
];

const chips = computed(() =>
  CHIPS.map((c) => ({
    ...c,
    n: c.count(props.summary),
    active: c.value === props.modelValue,
  })),
);
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <button
      v-for="chip in chips"
      :key="chip.value"
      type="button"
      :class="[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
        chip.active
          ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
          : 'bg-transparent text-zinc-700 border-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800',
      ]"
      @click="emit('update:modelValue', chip.value)"
    >
      <span>{{ chip.label }}</span>
      <span class="text-[10px] font-mono opacity-70">{{ chip.n }}</span>
    </button>
  </div>
</template>
```

- [ ] **Step 3: Mount in App.vue**

Import and mount above the token list:

```ts
import FilterChips from "./components/FilterChips.vue";
const { summary, classifications } = useClassifications(state.graph);
```

```vue
<FilterChips
  v-model="state.filters.value.classification"
  :summary="summary"
/>
```

(`v-model` here binds to the ref-of-object's `.classification` property. If Vue complains, switch to an explicit `:model-value` + `@update:model-value` handler that calls `state.filters.value = { ...state.filters.value, classification: $event }` — immutable update per coding-style.md.)

- [ ] **Step 4: Visual smoke**

```bash
npm run dev
```

Drop tokens, click each chip in turn, confirm the list filters down. Counts should match the badge tallies.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/FilterChips.vue src/app/state.ts src/app/App.vue
git commit -m "feat: add classification filter chips"
```

---

### Task 11: Summary panel

**Files:**
- Create: `src/app/components/SummaryPanel.vue`
- Modify: `src/app/App.vue`

**Context:** Top-of-Inspector compact strip showing the totals. Reuses `ClassificationSummary` from the composable. Each segment is clickable and sets the classification filter — effectively a richer presentation of `FilterChips`. Keep both components on screen since one is in-list-context, the other in summary-context.

- [ ] **Step 1: Write the component**

Create `src/app/components/SummaryPanel.vue`:

```vue
<script setup lang="ts">
import type { ClassificationSummary } from "../classifications.js";
import type { ClassificationFilter } from "../state.js";

interface Props {
  summary: ClassificationSummary;
}

interface Emits {
  (event: "select", filter: ClassificationFilter): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div
    class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-900 text-sm"
  >
    <button
      type="button"
      class="font-semibold hover:underline"
      @click="emit('select', 'all')"
    >
      {{ summary.total }} tokens
    </button>
    <span class="text-zinc-400">·</span>
    <button
      type="button"
      class="hover:underline"
      @click="emit('select', 'tailwind-default')"
    >
      <span class="font-mono">{{ summary.tailwind }}</span>
      <span class="text-zinc-500"> Tailwind matches</span>
    </button>
    <span class="text-zinc-400">·</span>
    <button
      type="button"
      class="hover:underline"
      @click="emit('select', 'theme-static')"
    >
      <span class="font-mono">{{ summary.themeStatic }}</span>
      <span class="text-zinc-500"> theme-static</span>
    </button>
    <span class="text-zinc-400">·</span>
    <button
      type="button"
      class="hover:underline"
      @click="emit('select', 'theme-mode-variant')"
    >
      <span class="font-mono">{{ summary.modeVariant }}</span>
      <span class="text-zinc-500"> mode-variant</span>
    </button>
    <span class="text-zinc-400">·</span>
    <button
      type="button"
      class="hover:underline"
      @click="emit('select', 'skip')"
    >
      <span class="font-mono">{{ summary.skipped }}</span>
      <span class="text-zinc-500"> skipped</span>
    </button>
  </div>
</template>
```

- [ ] **Step 2: Mount in App.vue**

Above the token list and FilterChips, add:

```ts
import SummaryPanel from "./components/SummaryPanel.vue";
```

```vue
<SummaryPanel
  :summary="summary"
  @select="
    (f) =>
      (state.filters.value = { ...state.filters.value, classification: f })
  "
/>
```

- [ ] **Step 3: Visual smoke**

```bash
npm run dev
```

Confirm the strip appears, totals add up to the token list length, and clicking each segment filters as expected.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/SummaryPanel.vue src/app/App.vue
git commit -m "feat: add classification summary panel"
```

---

### Task 12: Output section in token detail panel

**Files:**
- Create: `src/app/components/OutputSection.vue`
- Modify: `src/app/App.vue`

**Context:** When a token is selected, the detail panel shows a new "Output" section keyed by classification kind. Each kind renders differently per the spec. For `skip`, the section header instead reads "Vue Template Usage" and shows the resolved Tailwind class list — but in PR 1 we only have the alias-resolved CSS-var fallback (full resolution is PR 2's `resolve-token.ts`). Inspector message: "(detailed class list available in PR 2)".

- [ ] **Step 1: Write the component**

Create `src/app/components/OutputSection.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { Classification } from "@core/classify-token.js";

interface Props {
  classification: Classification;
}

const props = defineProps<Props>();

const heading = computed(() =>
  props.classification.kind === "skip" ? "Vue Template Usage" : "Output",
);

function copy(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
}
</script>

<template>
  <section class="border-t border-zinc-200 dark:border-zinc-800 mt-4 pt-4">
    <h3 class="text-xs font-mono uppercase text-zinc-500 mb-2">
      {{ heading }}
    </h3>

    <div v-if="classification.kind === 'tailwind-default'" class="space-y-2">
      <p class="text-xs text-zinc-500">
        Tailwind has this — no custom property emitted.
      </p>
      <div class="flex items-center gap-2">
        <code class="text-lg font-mono px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800">
          {{ classification.utility }}
        </code>
        <button
          type="button"
          class="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          @click="copy(classification.utility)"
        >
          Copy
        </button>
      </div>
      <p class="text-xs text-zinc-500 font-mono">
        resolves to {{ classification.resolvedValue }}
      </p>
    </div>

    <div v-else-if="classification.kind === 'theme-static'" class="space-y-2">
      <p v-if="classification.modeInvariantHint" class="text-xs text-amber-700 dark:text-amber-400">
        mode-invariant: same value in light + dark
      </p>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        <dt class="text-zinc-500">CSS variable</dt>
        <dd class="font-mono">{{ classification.cssName }}</dd>
        <dt class="text-zinc-500">Value</dt>
        <dd class="font-mono">{{ classification.value }}</dd>
      </dl>
      <div class="flex gap-2">
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          @click="copy(`var(${classification.cssName})`)"
        >
          Copy var()
        </button>
      </div>
      <p v-if="classification.utilityHint" class="text-xs text-zinc-500">
        ≈ <code class="font-mono">{{ classification.utilityHint.utility }}</code>
        ({{ classification.utilityHint.resolvedValue }}) — consider snapping
      </p>
    </div>

    <div v-else-if="classification.kind === 'theme-mode-variant'" class="space-y-2">
      <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        <dt class="text-zinc-500">CSS variable</dt>
        <dd class="font-mono">{{ classification.cssName }}</dd>
        <dt class="text-zinc-500">Light</dt>
        <dd class="font-mono">{{ classification.lightValue }}</dd>
        <dt class="text-zinc-500">Dark</dt>
        <dd class="font-mono">{{ classification.darkValue }}</dd>
      </dl>
      <div class="flex gap-2">
        <button
          type="button"
          class="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          @click="copy(`var(${classification.cssName})`)"
        >
          Copy var()
        </button>
      </div>
    </div>

    <div v-else-if="classification.kind === 'skip'" class="space-y-2">
      <p class="text-xs text-zinc-500">
        Component-layer token — resolved at design-system-author time.
      </p>
      <p class="text-xs text-zinc-500 italic">
        Detailed Tailwind class list available in PR 2 (resolve-token.ts).
      </p>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Mount in App.vue**

In the detail panel template (where the selected token's metadata is shown), import:

```ts
import OutputSection from "./components/OutputSection.vue";
```

Compute the classification for the current selection:

```ts
const selectedClassification = computed(() => {
  const id = state.selection.value;
  if (!id) return null;
  return classifications.value.get(id) ?? null;
});
```

Mount below the existing alias chain / used-by sections:

```vue
<OutputSection
  v-if="selectedClassification"
  :classification="selectedClassification"
/>
```

- [ ] **Step 3: Visual smoke**

```bash
npm run dev
```

Drop tokens, select tokens of each kind in turn, confirm the Output section renders differently per kind.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/OutputSection.vue src/app/App.vue
git commit -m "feat: add Output section to token detail panel"
```

---

### Task 13: CodePreview tab update for new outputs

**Files:**
- Modify: `src/app/state.ts`
- Modify: `src/app/components/CodePreview.vue`

**Context:** During the transition, both legacy and new outputs should be inspectable. Extend `OutputTab` union with two new tabs:

- `"tokens.css (new)"` — rendered by `tokensCssRenderer`
- `"app.config.ts (new)"` — rendered by `appConfigRenderer` (minimal version)

Leave existing tabs alone for now. PR 2 will rename and remove the legacy tabs.

- [ ] **Step 1: Extend the OutputTab union**

In `src/app/state.ts`:

```ts
export type OutputTab =
  | "tokens.css"
  | "app.config.ts"
  | "tokens.ts"
  | "tokens.css (new)"
  | "app.config.ts (new)";
```

In `createAppState`, keep the default `"tokens.css"`.

- [ ] **Step 2: Wire the new tabs in CodePreview.vue**

Open `src/app/components/CodePreview.vue`. Find where the existing tabs are rendered (typically a `v-for` over the tab list) and the renderers are dispatched.

Where the component imports renderers (or receives them via prop), add:

```ts
import { tokensCssRenderer } from "@core/renderers/tokens-css.js";
import { appConfigRenderer } from "@core/renderers/app-config.js";
```

Add the two new tab labels to whichever list drives `v-for`. Where the component picks which renderer to call based on the active tab, add cases for the new labels — call `tokensCssRenderer.render(graph)` and `appConfigRenderer.render(graph)` respectively. Display target-path hints next to each tab title:

- `tokens.css (new)` → "assets/css/tokens.css"
- `app.config.ts (new)` → "app.config.ts (or merge with existing)"

(Path hints can be a small subline below the tab title or a tooltip — the exact layout is up to the implementer; the spec only requires the hints to be visible somewhere.)

- [ ] **Step 3: Visual smoke**

```bash
npm run dev
```

Drop tokens, switch between all five tabs, confirm:
- Old tabs render as before
- `tokens.css (new)` shows the new structured CSS (with `@theme` and `.dark` blocks)
- `app.config.ts (new)` shows the minimal Nuxt UI config
- Target-path hints appear next to the new tabs

- [ ] **Step 4: Commit**

```bash
git add src/app/state.ts src/app/components/CodePreview.vue
git commit -m "feat: add new output tabs to CodePreview alongside legacy"
```

---

### Task 14: Full test run + final sanity

**Files:** None modified.

**Context:** Run the entire suite and the full token build to make sure nothing regressed.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass — the pre-existing 92 plus the new tests added in Tasks 2, 4, 5. The legacy `smoke.test.ts` must still pass: PR 1 does not touch the legacy renderers or output format.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run both build paths**

```bash
npm run build:tokens
```

Expected: both legacy `output/*` and new `output/css/`, `output/nuxt/` files are produced. Open the new `output/css/tokens.css` and confirm it is materially shorter than the legacy `output/tokens.css` (the Tailwind-default matches drop out, plus all component-layer tokens drop out).

- [ ] **Step 4: Visual smoke of the full Inspector**

```bash
npm run dev
```

Walk through:
1. Drop `components/*.tokens.json` files
2. Verify SummaryPanel + FilterChips render with non-zero counts
3. Filter to "Tailwind", confirm only Tailwind-default tokens show
4. Filter to "Dark-var", confirm only mode-variant semantics show
5. Select a token of each kind in turn, verify the OutputSection renders appropriately
6. Switch CodePreview to "tokens.css (new)" and "app.config.ts (new)", confirm they show the expected content
7. Drop the dark theme toggle (if present), confirm mode-variant tokens visually flip in the existing LiveButton preview — LiveButton is **not** modified in PR 1, so its existing behavior (CSS-var-based inline styles) must still work end-to-end

- [ ] **Step 5: Final commit (if any leftover untracked artifacts)**

```bash
git status
```

If there are leftover `output/css/`, `output/nuxt/`, or snapshot files that should be ignored, add them to `.gitignore` (the existing `output/` likely already covers most of it):

```bash
git diff .gitignore || true
```

If `.gitignore` needs an update:

```bash
git add .gitignore
git commit -m "chore: ignore new dual-emit output directories"
```

---

## Spec coverage check

Each requirement from `2026-05-20-tailwind-utility-first-tokens-design.md` is implemented by:

- **Classification engine, four kinds (`skip`, `tailwind-default`, `theme-static`, `theme-mode-variant`)** → Task 3, tests Task 4
- **Tailwind defaults lookup, committed-generated, configurable rem base** → Tasks 1, 2
- **New `tokens.css` renderer, `@theme` + `.dark` sections, mode-invariant comments** → Task 5
- **Minimal `app.config.ts` renderer (always-emitted suggestion)** → Task 6
- **Dual-emit CLI: `output/css/tokens.css` + `output/nuxt/app.config.ts` alongside legacy** → Task 7
- **Classification badges in token list** → Task 9
- **Filter chips, default `All`** → Task 10
- **Summary panel with clickable segments** → Task 11
- **Token detail "Output" section per kind, "Vue Template Usage" for `skip`** → Task 12
- **CodePreview new tabs with target-path hints** → Task 13
- **Legacy `output/*` untouched, v0.2.0 LiveButton preview keeps working** → Verified in Task 14

### Deferred to PR 2 (per spec)

- LiveButton Strategy B (runtime utility injection)
- `resolve-token.ts` for indirect-alias resolution in `skip` Vue Template Usage hints
- "Close but not exact" nearest-neighbor hint computation (the `utilityHint` field is reserved but unfilled)
- Removal of legacy renderers, `tokens.ts` export, `smoke.legacy.test.ts`
- README/CHANGELOG update, v0.3.0 version bump
- New Issues categories ("Custom spacing value detected", "Mode-invariant token in semantic layer", "Component token references mode-variant semantic")

These deferrals are intentional — PR 1 produces a working, testable system with no breakages. PR 2 activates and releases.
