# Layout Primitives Theme Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit the `container` / `page` / `grid` / `stack` / `section` layout primitives as Tailwind v4 `@theme` utilities — widths → `--container-*`, gaps/paddings → `--spacing-*`, radii → `--radius-*`, plus `grid-columns` as a plain var — in `output/css/tokens.css`.

**Architecture:** A pure renderer-owned module (`src/renderers/layout-primitives.ts`) reads the component-layer layout tokens from the graph and returns `{cssName, value, tokenId}` entries via a deterministic id→namespace mapping (dedup + divergence guard for the container/page widths). `tokens-css.ts` gains a new `layout-primitives` section and pushes the collected entries into it. `classify-token.ts` is untouched — same pattern as the v0.20.0 `typography-composites.ts`.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest, `tsx` for `build:tokens`.

See design spec: `docs/superpowers/specs/2026-06-14-layout-primitives-theme-export-design.md`.

---

## File Structure

- **Create** `src/renderers/layout-primitives.ts` — pure: graph → layout-primitive entries.
- **Create** `src/renderers/layout-primitives.test.ts` — unit tests for the above.
- **Modify** `src/renderers/tokens-css.ts` — new `layout-primitives` SectionKey + header; call the collector.
- **Modify** `src/renderers/tokens-css.test.ts` — integration test.
- **Regenerate** `output/css/tokens.css` (gitignored; verification only — local fixture lacks these tokens, so also probe the remote export).

---

### Task 1: Layout-primitive collection module (pure)

**Files:**
- Create: `src/renderers/layout-primitives.ts`
- Test: `src/renderers/layout-primitives.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderers/layout-primitives.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectLayoutPrimitives } from "./layout-primitives.js";
import type { TokenGraph, TokenNode } from "../token-graph.js";

function node(id: string, base: string): TokenNode {
  return {
    id,
    path: id.split("-"),
    type: "number",
    layer: "component",
    themes: [],
    cssValue: { base },
    rawValue: { base },
    alias: {},
    source: "global",
  };
}

function graph(nodes: TokenNode[]): TokenGraph {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    aliasIndex: new Map(),
    reverseAliases: new Map(),
    issues: [],
    sources: [],
    meta: { builtAt: "2026-06-14T00:00:00Z", builderVersion: "test" },
  };
}

describe("collectLayoutPrimitives", () => {
  it("dedupes identical container & page widths into one --container scale", () => {
    const out = collectLayoutPrimitives(
      graph([
        node("container-max-width", "1280px"),
        node("container-max-width-narrow", "960px"),
        node("container-max-width-prose", "720px"),
        node("page-max-width", "1280px"),
        node("page-max-width-narrow", "960px"),
        node("page-max-width-prose", "720px"),
      ]),
    );
    const widths = out
      .filter((e) => e.cssName.startsWith("--container-"))
      .map((e) => e.cssName)
      .sort();
    expect(widths).toEqual([
      "--container-default",
      "--container-narrow",
      "--container-prose",
    ]);
  });

  it("keeps both widths when values diverge, qualifying the page one", () => {
    const out = collectLayoutPrimitives(
      graph([
        node("container-max-width-narrow", "960px"),
        node("page-max-width-narrow", "1024px"),
      ]),
    );
    expect(out).toContainEqual({ cssName: "--container-narrow", value: "960px", tokenId: "container-max-width-narrow" });
    expect(out).toContainEqual({ cssName: "--container-page-narrow", value: "1024px", tokenId: "page-max-width-narrow" });
  });

  it("maps gaps and paddings to --spacing-* with the axis dropped", () => {
    const out = collectLayoutPrimitives(
      graph([
        node("container-padding-x", "40px"),
        node("page-padding-x-desktop", "40px"),
        node("grid-gap-md", "24px"),
        node("stack-gap-xs", "8px"),
        node("section-padding-y-lg", "80px"),
      ]),
    );
    expect(out).toContainEqual({ cssName: "--spacing-container", value: "40px", tokenId: "container-padding-x" });
    expect(out).toContainEqual({ cssName: "--spacing-page-desktop", value: "40px", tokenId: "page-padding-x-desktop" });
    expect(out).toContainEqual({ cssName: "--spacing-grid-md", value: "24px", tokenId: "grid-gap-md" });
    expect(out).toContainEqual({ cssName: "--spacing-stack-xs", value: "8px", tokenId: "stack-gap-xs" });
    expect(out).toContainEqual({ cssName: "--spacing-section-lg", value: "80px", tokenId: "section-padding-y-lg" });
  });

  it("maps radii to --radius-*", () => {
    const out = collectLayoutPrimitives(
      graph([
        node("grid-item-radius", "8px"),
        node("section-radius-card", "12px"),
        node("section-radius-contained", "16px"),
      ]),
    );
    expect(out).toContainEqual({ cssName: "--radius-grid-item", value: "8px", tokenId: "grid-item-radius" });
    expect(out).toContainEqual({ cssName: "--radius-section-card", value: "12px", tokenId: "section-radius-card" });
    expect(out).toContainEqual({ cssName: "--radius-section-contained", value: "16px", tokenId: "section-radius-contained" });
  });

  it("emits grid-columns as a plain variable", () => {
    const out = collectLayoutPrimitives(graph([node("grid-columns", "12")]));
    expect(out).toEqual([{ cssName: "--grid-columns", value: "12", tokenId: "grid-columns" }]);
  });

  it("ignores non-layout tokens", () => {
    const out = collectLayoutPrimitives(
      graph([node("color-blue-500", "#3b82f6"), node("spacing-1", "4px")]),
    );
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/layout-primitives.test.ts`
Expected: FAIL — `Cannot find module './layout-primitives.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderers/layout-primitives.ts`:

```ts
// Tailwind v4 @theme emission for layout primitive tokens.
//
// The design system authors layout primitives — container / page / grid / stack /
// section — in components/global.tokens.json. They live in the `global` source →
// component layer, so classify-token.ts skips them. This module re-surfaces them as
// Tailwind v4 @theme custom properties that generate real utilities:
//
//   widths        (…max-width…)        → --container-* (→ max-w-*)
//   gaps/paddings (…gap…/…padding…)    → --spacing-*   (→ p-/px-/py-/m-/gap-*)
//   radii         (…radius…)           → --radius-*    (→ rounded-*)
//   grid-columns  (a raw count)        → --grid-columns (no utility — variable only)
//
// container & page define identical width values, so widths dedupe into one
// --container-* scale. Guard: if a variant's values ever diverge, keep both and
// qualify the non-container family (--container-page-<variant>) — never overwrite.

import type { TokenGraph } from "../token-graph.js";

export interface LayoutPrimitiveEntry {
  /** CSS custom property name, including the leading `--`. */
  cssName: string;
  /** Resolved CSS value. */
  value: string;
  /** Originating token id (for the Inspector line map). */
  tokenId: string;
}

const FAMILIES = ["container", "page", "grid", "stack", "section"] as const;

const SPACING_DROP: ReadonlySet<string> = new Set(["gap", "padding", "x", "y"]);
const RADIUS_DROP: ReadonlySet<string> = new Set(["radius"]);
const WIDTH_DROP: ReadonlySet<string> = new Set(["max", "width"]);

function familyOf(id: string): string | null {
  for (const f of FAMILIES) {
    if (id === f || id.startsWith(`${f}-`)) return f;
  }
  return null;
}

function stripWords(parts: readonly string[], drop: ReadonlySet<string>): string[] {
  return parts.filter((p) => !drop.has(p));
}

interface WidthDraft {
  family: string;
  variant: string;
  value: string;
  tokenId: string;
}

export function collectLayoutPrimitives(graph: TokenGraph): LayoutPrimitiveEntry[] {
  const entries: LayoutPrimitiveEntry[] = [];
  const widths: WidthDraft[] = [];

  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const id = node.id;
    const family = familyOf(id);
    if (!family) continue;
    const value = node.cssValue.base;
    if (value === undefined || value === "") continue;
    const parts = id.split("-");

    if (id.includes("max-width")) {
      const variant = stripWords(parts.slice(1), WIDTH_DROP).join("-") || "default";
      widths.push({ family, variant, value, tokenId: id });
    } else if (parts.includes("radius")) {
      entries.push({ cssName: `--radius-${stripWords(parts, RADIUS_DROP).join("-")}`, value, tokenId: id });
    } else if (parts.includes("gap") || parts.includes("padding")) {
      entries.push({ cssName: `--spacing-${stripWords(parts, SPACING_DROP).join("-")}`, value, tokenId: id });
    } else {
      // grid-columns and any other layout-family token with no utility namespace.
      entries.push({ cssName: `--${id}`, value, tokenId: id });
    }
  }

  // Widths → --container-* with dedup + divergence guard.
  const byVariant = new Map<string, WidthDraft[]>();
  for (const w of widths) {
    const list = byVariant.get(w.variant) ?? [];
    list.push(w);
    byVariant.set(w.variant, list);
  }
  for (const [variant, toks] of byVariant) {
    const distinct = new Set(toks.map((t) => t.value));
    if (toks.length === 1 || distinct.size === 1) {
      const canonical = toks.find((t) => t.family === "container") ?? toks[0]!;
      entries.push({ cssName: `--container-${variant}`, value: canonical.value, tokenId: canonical.tokenId });
    } else {
      for (const t of toks) {
        const key = t.family === "container" ? variant : `${t.family}-${variant}`;
        entries.push({ cssName: `--container-${key}`, value: t.value, tokenId: t.tokenId });
      }
    }
  }

  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/layout-primitives.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderers/layout-primitives.ts src/renderers/layout-primitives.test.ts
git commit -m "feat(renderer): collect layout primitives as Tailwind v4 @theme utilities"
```

---

### Task 2: Wire into the renderer with a Layout Primitives section

**Files:**
- Modify: `src/renderers/tokens-css.ts`
- Test: `src/renderers/tokens-css.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe("tokensCssRenderer", …)` block in `src/renderers/tokens-css.test.ts`:

```ts
  it("emits layout primitives under a Layout Primitives section", () => {
    const graph = makeGraph([
      makeNode({ id: "container-max-width-narrow", layer: "component", type: "number", source: "global", base: "960px" }),
      makeNode({ id: "stack-gap-md", layer: "component", type: "number", source: "global", base: "24px" }),
      makeNode({ id: "section-radius-card", layer: "component", type: "number", source: "global", base: "12px" }),
      makeNode({ id: "grid-columns", layer: "component", type: "number", source: "global", base: "12" }),
    ]);
    const result = tokensCssRenderer.render(graph);
    const secIdx = result.text.indexOf("Layout Primitives");
    expect(secIdx).toBeGreaterThan(-1);
    expect(result.text).toContain("--container-narrow: 960px;");
    expect(result.text).toContain("--spacing-stack-md: 24px;");
    expect(result.text).toContain("--radius-section-card: 12px;");
    expect(result.text).toContain("--grid-columns: 12;");
    expect(result.text.indexOf("--container-narrow:")).toBeGreaterThan(secIdx);
    // Line map points each output line at its real source token.
    expect(result.lines.has("container-max-width-narrow")).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/tokens-css.test.ts -t "Layout Primitives"`
Expected: FAIL — output has no "Layout Primitives" section.

- [ ] **Step 3: Write minimal implementation**

In `src/renderers/tokens-css.ts`:

Add the import after the existing renderer imports:

```ts
import { collectLayoutPrimitives } from "./layout-primitives.js";
```

Add `"layout-primitives"` to the `SectionKey` union (after `"non-default-font"`):

```ts
type SectionKey =
  | "primitive-colors"
  | "mode-invariant-brand"
  | "non-default-spacing"
  | "non-default-radius"
  | "non-default-font"
  | "layout-primitives"
  | "mode-variant-semantics"
  | "mode-variant-shadows";
```

Add the header row to `SECTION_HEADERS` (after the `non-default-font` row):

```ts
  ["non-default-font", "Non-default Typography"],
  ["layout-primitives", "Layout Primitives"],
  ["mode-variant-semantics", "Mode-variant Semantics (light defaults)"],
```

In `render`, after the `collectTypographyComposites(graph)` loop (and before `const lb = new LineBuilder();`), add:

```ts
    for (const entry of collectLayoutPrimitives(graph)) {
      push(sections, "layout-primitives", {
        cssName: entry.cssName,
        value: entry.value,
        tokenId: entry.tokenId,
        modeInvariantHint: false,
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/tokens-css.test.ts`
Expected: PASS (all existing + the new test).

- [ ] **Step 5: Commit**

```bash
git add src/renderers/tokens-css.ts src/renderers/tokens-css.test.ts
git commit -m "feat(renderer): emit layout primitives in a Layout Primitives @theme section"
```

---

### Task 3: Regenerate + verify against the live export

**Files:**
- Regenerate: `output/css/tokens.css` (gitignored — verification only).

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test`
Expected: all pass.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 2: Verify against the live 914-token export (the local fixture has none of these)**

Create `scripts/_probe-layout-emit.ts`:

```ts
import { parseGitUrl, fetchTokenFiles } from "../src/app/git-import.js";
import { loadSources } from "../src/app/load-sources.js";
import { buildGraph } from "../src/build-graph.js";
import { collectLayoutPrimitives } from "../src/renderers/layout-primitives.js";

const ref = parseGitUrl("https://github.com/clawdbot3535/design-token-export");
if (!ref) throw new Error("bad url");
const files = await fetchTokenFiles(ref);
const result = await loadSources(files);
const g = buildGraph(result.sources);
for (const e of collectLayoutPrimitives(g).sort((a, b) => a.cssName.localeCompare(b.cssName))) {
  console.log(`${e.cssName}: ${e.value};  /* ${e.tokenId} */`);
}
```

Run: `npx tsx scripts/_probe-layout-emit.ts && rm -f scripts/_probe-layout-emit.ts`
Expected: 21 lines — `--container-{default,narrow,prose}`, `--grid-columns: 12`, `--radius-{grid-item,section-card,section-contained}`, and `--spacing-{container,grid-{sm,md,lg},page-{desktop,mobile,tablet},section-{sm,md,lg},stack-{xs,sm,md,lg}}`. No `--container-page-*` (values are identical → deduped).

- [ ] **Step 3: (optional) regenerate the local artifact**

Run: `npm run build:tokens`
Expected: exits 0; `output/css/tokens.css` regenerated. The local fixture has no layout primitives, so no "Layout Primitives" section appears locally — the remote probe in Step 2 is the real check. Nothing to commit (gitignored).

---

### Task 4: Release (gated on green tree + user OK)

Follow the project's release flow. Target **v0.21.0**.

- [ ] Bump `package.json` to `0.21.0` (`npm version 0.21.0 --no-git-tag-version`).
- [ ] Add `CHANGELOG.md` entry for v0.21.0 (layout-primitive `@theme` emit: container/page widths → `--container-*`, gaps/paddings → `--spacing-*`, radii → `--radius-*`, `grid-columns` var; width dedup + divergence guard; new "Layout Primitives" section).
- [ ] Add the README roadmap line for v0.21.0; update the "Next" line (layout-primitive emit now done).
- [ ] Commit `chore(release): v0.21.0 — layout-primitive @theme emit`, tag `v0.21.0`.
- [ ] Merge to `main` (`--ff-only`), push (use `gh auth switch --user clawdbot3535` if push 403s, then switch back to `d56de`), publish the GitHub Release, delete the feature branch.

---

## Self-Review

- **Spec coverage:** mapping rule (widths/spacing/radius/columns/fallback) → Task 1 impl + tests; dedup + divergence guard → Task 1 tests 1–2; axis-drop → Task 1 test 3; grid-columns var → test 5; new "Layout Primitives" section + wiring → Task 2; remote-export verification → Task 3 Step 2; release → Task 4.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `collectLayoutPrimitives(graph) → LayoutPrimitiveEntry[]` defined in Task 1, called identically in Task 2; `{cssName, value, tokenId}` matches the `push()` ThemeEntry fields (`modeInvariantHint: false` supplied at the call site). The `layout-primitives` SectionKey is added to both the union and `SECTION_HEADERS`.
