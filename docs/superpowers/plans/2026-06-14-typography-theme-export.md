# Typography Theme Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit the typography type-scale roles (heading-1, heading-2) as Tailwind v4 composite `--text-<role>` custom properties, and fix the primitive `--letter-spacing-*` / `--line-height-*` misrouting, in `output/css/tokens.css`.

**Architecture:** A pure renderer-owned module (`typography-composites.ts`) reads role tokens from the graph, normalizes the source `line-heigth` typo, appends `px` to unitless line-heights, and returns composite `{cssName, value, tokenId}` entries. `tokens-css.ts` pushes them into the `non-default-font` section (existing alphabetical sort keeps base + modifiers adjacent) and `sectionFor` is extended to route the primitive letter-spacing/line-height tokens. `classify-token.ts` is untouched.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest, `tsx` for `build:tokens`.

See design spec: `docs/superpowers/specs/2026-06-14-typography-theme-export-design.md`.

---

## File Structure

- **Create** `src/renderers/typography-composites.ts` — pure: graph → composite entries.
- **Create** `src/renderers/typography-composites.test.ts` — unit tests for the above.
- **Modify** `src/renderers/tokens-css.ts` — call the collector; extend `sectionFor`.
- **Modify** `src/renderers/tokens-css.test.ts` — integration tests for composites + misrouting fix.
- **Regenerate** `output/css/tokens.css` — via `npm run build:tokens`.

---

### Task 1: Composite collection module (pure)

**Files:**
- Create: `src/renderers/typography-composites.ts`
- Test: `src/renderers/typography-composites.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderers/typography-composites.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectTypographyComposites } from "./typography-composites.js";
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

describe("collectTypographyComposites", () => {
  it("builds a composite for a role with all four properties", () => {
    const out = collectTypographyComposites(
      graph([
        node("typography-heading-1-font-size", "72px"),
        node("typography-heading-1-line-height", "64"),
        node("typography-heading-1-letter-spacing", "-0.4px"),
        node("typography-heading-1-font-weight", "500"),
      ]),
    );
    expect(out).toEqual([
      { cssName: "--text-heading-1", value: "72px", tokenId: "typography-heading-1-font-size" },
      { cssName: "--text-heading-1--line-height", value: "64px", tokenId: "typography-heading-1-line-height" },
      { cssName: "--text-heading-1--letter-spacing", value: "-0.4px", tokenId: "typography-heading-1-letter-spacing" },
      { cssName: "--text-heading-1--font-weight", value: "500", tokenId: "typography-heading-1-font-weight" },
    ]);
  });

  it("normalizes the line-heigth typo but keeps the real token id", () => {
    const out = collectTypographyComposites(
      graph([
        node("typography-heading-2-font-size", "48px"),
        node("typography-heading-2-line-heigth", "40"),
      ]),
    );
    expect(out).toContainEqual({
      cssName: "--text-heading-2--line-height",
      value: "40px",
      tokenId: "typography-heading-2-line-heigth",
    });
  });

  it("leaves values that already carry a unit untouched", () => {
    const out = collectTypographyComposites(
      graph([
        node("typography-heading-1-font-size", "72px"),
        node("typography-heading-1-letter-spacing", "-0.4px"),
      ]),
    );
    expect(out).toContainEqual({
      cssName: "--text-heading-1--letter-spacing",
      value: "-0.4px",
      tokenId: "typography-heading-1-letter-spacing",
    });
  });

  it("omits a role that has no font-size base", () => {
    const out = collectTypographyComposites(
      graph([
        node("typography-label-letter-spacing", "0.4px"),
      ]),
    );
    expect(out).toEqual([]);
  });

  it("ignores non-typography tokens", () => {
    const out = collectTypographyComposites(
      graph([node("spacing-card-gutter", "18px")]),
    );
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/typography-composites.test.ts`
Expected: FAIL — `Cannot find module './typography-composites.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderers/typography-composites.ts`:

```ts
// Composite Tailwind v4 type-scale emission for typography role tokens.
//
// The design system authors per-role type scales in components/global.tokens.json
// as flat tokens: typography-<role>-font-size / -line-height / -letter-spacing /
// -font-weight. These live in the `global` source → component layer, so the
// classification engine (classify-token.ts) skips them. This module re-surfaces
// the subset that forms a Tailwind v4 type scale (roles that define a font-size)
// as composite custom properties:
//
//   --text-<role>: <font-size>;
//   --text-<role>--line-height: <line-height>;
//   --text-<role>--letter-spacing: <letter-spacing>;
//   --text-<role>--font-weight: <font-weight>;
//
// Tailwind v4 consumes these to generate a `text-<role>` utility that sets all
// four properties at once.

import type { TokenGraph } from "../token-graph.js";

export interface TypographyCompositeEntry {
  /** CSS custom property name, including the leading `--`. */
  cssName: string;
  /** Resolved CSS value. */
  value: string;
  /** Originating token id (for the Inspector line map). */
  tokenId: string;
}

// Matches `typography-<role>-<prop>` after typo normalisation. <role> is greedy
// so multi-segment roles (heading-1, heading-2) are captured whole.
const ROLE_ID =
  /^typography-(.+)-(font-size|line-height|letter-spacing|font-weight)$/;

type RoleProp = "font-size" | "line-height" | "letter-spacing" | "font-weight";

/** Normalise the known source typo so `line-heigth` routes as `line-height`. */
function normalizeId(id: string): string {
  return id.replace(/-line-heigth(?=-|$)/, "-line-height");
}

/** Append `px` to a bare numeric (used for unitless line-height role tokens). */
function withLengthUnit(value: string): string {
  return /^-?\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value;
}

export function collectTypographyComposites(
  graph: TokenGraph,
): TypographyCompositeEntry[] {
  const roles = new Map<
    string,
    Map<RoleProp, { value: string; tokenId: string }>
  >();

  for (const node of graph.nodes.values()) {
    const m = normalizeId(node.id).match(ROLE_ID);
    if (!m) continue;
    const role = m[1]!;
    const prop = m[2] as RoleProp;
    const value = node.cssValue.base;
    if (value === undefined || value === "") continue;
    let propMap = roles.get(role);
    if (!propMap) {
      propMap = new Map();
      roles.set(role, propMap);
    }
    // Keep the original (un-normalised) id so the line map points at the real token.
    propMap.set(prop, { value, tokenId: node.id });
  }

  const entries: TypographyCompositeEntry[] = [];
  for (const [role, propMap] of roles) {
    const fontSize = propMap.get("font-size");
    if (!fontSize) continue; // no base font-size → not a Tailwind type scale
    entries.push({
      cssName: `--text-${role}`,
      value: fontSize.value,
      tokenId: fontSize.tokenId,
    });
    const lineHeight = propMap.get("line-height");
    if (lineHeight) {
      entries.push({
        cssName: `--text-${role}--line-height`,
        value: withLengthUnit(lineHeight.value),
        tokenId: lineHeight.tokenId,
      });
    }
    const letterSpacing = propMap.get("letter-spacing");
    if (letterSpacing) {
      entries.push({
        cssName: `--text-${role}--letter-spacing`,
        value: letterSpacing.value,
        tokenId: letterSpacing.tokenId,
      });
    }
    const fontWeight = propMap.get("font-weight");
    if (fontWeight) {
      entries.push({
        cssName: `--text-${role}--font-weight`,
        value: fontWeight.value,
        tokenId: fontWeight.tokenId,
      });
    }
  }
  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/typography-composites.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderers/typography-composites.ts src/renderers/typography-composites.test.ts
git commit -m "feat(renderer): collect typography roles as Tailwind v4 --text-<role> composites"
```

---

### Task 2: Wire composites into the renderer

**Files:**
- Modify: `src/renderers/tokens-css.ts`
- Test: `src/renderers/tokens-css.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe("tokensCssRenderer", …)` block in `src/renderers/tokens-css.test.ts`:

```ts
  it("emits typography roles as composite --text-<role> custom properties", () => {
    const graph = makeGraph([
      makeNode({ id: "typography-heading-1-font-size", layer: "component", type: "number", source: "global", base: "72px" }),
      makeNode({ id: "typography-heading-1-line-height", layer: "component", type: "number", source: "global", base: "64" }),
      makeNode({ id: "typography-heading-1-letter-spacing", layer: "component", type: "number", source: "global", base: "-0.4px" }),
      makeNode({ id: "typography-heading-1-font-weight", layer: "component", type: "number", source: "global", base: "500" }),
    ]);
    const result = tokensCssRenderer.render(graph);
    expect(result.text).toContain("--text-heading-1: 72px;");
    expect(result.text).toContain("--text-heading-1--line-height: 64px;");
    expect(result.text).toContain("--text-heading-1--letter-spacing: -0.4px;");
    expect(result.text).toContain("--text-heading-1--font-weight: 500;");
    // Lands under the Typography section.
    const typoIdx = result.text.indexOf("Non-default Typography");
    expect(typoIdx).toBeGreaterThan(-1);
    expect(result.text.indexOf("--text-heading-1:")).toBeGreaterThan(typoIdx);
    // Line map points the base line at its real source token.
    expect(result.lines.has("typography-heading-1-font-size")).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/tokens-css.test.ts -t "composite"`
Expected: FAIL — output does not contain `--text-heading-1`.

- [ ] **Step 3: Write minimal implementation**

In `src/renderers/tokens-css.ts`, add the import near the top (after the existing imports):

```ts
import { collectTypographyComposites } from "./typography-composites.js";
```

Then, inside `render`, immediately after the `for (const [tokenId, classification] of classifications)` loop closes (before `const lb = new LineBuilder();`), add:

```ts
    for (const entry of collectTypographyComposites(graph)) {
      push(sections, "non-default-font", {
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
git commit -m "feat(renderer): emit typography --text-<role> composites in tokens.css"
```

---

### Task 3: Fix primitive letter-spacing / line-height misrouting

**Files:**
- Modify: `src/renderers/tokens-css.ts` (`sectionFor`)
- Test: `src/renderers/tokens-css.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe("tokensCssRenderer", …)` block in `src/renderers/tokens-css.test.ts`:

```ts
  it("routes primitive letter-spacing and line-height under Typography, not Colors", () => {
    const graph = makeGraph([
      makeNode({ id: "letter-spacing-tight", layer: "primitive", type: "number", source: "typography", base: "-0.4px" }),
      makeNode({ id: "line-height-2xl", layer: "primitive", type: "number", source: "typography", base: "24px" }),
    ]);
    const result = tokensCssRenderer.render(graph);
    const typoIdx = result.text.indexOf("Non-default Typography");
    const colorIdx = result.text.indexOf("Primitive Colors");
    expect(typoIdx).toBeGreaterThan(-1);
    expect(result.text.indexOf("--letter-spacing-tight")).toBeGreaterThan(typoIdx);
    expect(result.text.indexOf("--line-height-2xl")).toBeGreaterThan(typoIdx);
    // Not in the Primitive Colors section (which, if present, precedes Typography).
    if (colorIdx > -1) {
      expect(result.text.indexOf("--letter-spacing-tight")).toBeGreaterThan(colorIdx);
    }
  });
```

> Note: `line-height-2xl` = `24px` is not a Tailwind default leading value, so it
> classifies as `theme-static` and reaches `sectionFor`. (Tailwind `leading-*`
> are unitless ratios, so px line-heights never match a default.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/tokens-css.test.ts -t "routes primitive"`
Expected: FAIL — `--letter-spacing-tight` / `--line-height-2xl` currently sort into Primitive Colors (before the Typography header).

- [ ] **Step 3: Write minimal implementation**

In `src/renderers/tokens-css.ts`, extend the typography branch of `sectionFor`:

```ts
  if (
    cssName.startsWith("--text-") ||
    cssName.startsWith("--font-") ||
    cssName.startsWith("--leading-") ||
    cssName.startsWith("--tracking-") ||
    cssName.startsWith("--letter-spacing-") ||
    cssName.startsWith("--line-height-")
  ) {
    return "non-default-font";
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/tokens-css.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/tokens-css.ts src/renderers/tokens-css.test.ts
git commit -m "fix(renderer): route primitive letter-spacing/line-height under Typography"
```

---

### Task 4: Regenerate output, full verification

**Files:**
- Regenerate: `output/css/tokens.css`

- [ ] **Step 1: Regenerate the committed output**

Run: `npm run build:tokens`
Expected: exits 0; `output/css/tokens.css` updated. (If it exits non-zero due to a
pre-existing asymmetric-variant error on the local fixture, capture the output and
confirm the typography section still regenerated — see project memory on
`build:tokens` exit-1-by-design.)

- [ ] **Step 2: Eyeball the typography section**

Run: `awk '/Non-default Typography/,/Mode-variant/' output/css/tokens.css`
Expected: contains `--text-heading-1`, `--text-heading-1--line-height: 64px`,
`--text-heading-2`, `--text-heading-2--line-height: 40px`, and the primitive
`--letter-spacing-*` / `--line-height-*` now in this section (not Primitive Colors).
Confirm each `--text-<role>` base is immediately followed by its `--*` modifiers.

- [ ] **Step 3: Full suite + typecheck**

Run: `npm test`
Expected: all pass. If `tokens-css.test.ts.snap` or `renderers.test.ts.snap`
changed, confirm the diff is intentional (only typography additions/moves), then
update with `npx vitest run -u` and re-run.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add output/css/tokens.css src/renderers/__snapshots__
git commit -m "chore(tokens): regenerate tokens.css with typography composites"
```

---

### Task 5: Release (gated on green tree + user OK)

Follow the project's established release flow (version bump, CHANGELOG entry,
README roadmap line, tag, push, GitHub Release). Target **v0.20.0**.

- [ ] Bump `package.json` version to `0.20.0`.
- [ ] Add `CHANGELOG.md` entry for v0.20.0 (typography `--text-<role>` composite export + letter-spacing/line-height routing fix; note typo normalized in output, scanner warning retained; body/label out of scope).
- [ ] Add the README roadmap line for v0.20.0.
- [ ] Commit `chore(release): v0.20.0 — typography --text-<role> composite theme export`, tag `v0.20.0`.
- [ ] Push (use `gh auth switch --user clawdbot3535` if push 403s) and publish the GitHub Release.

---

## Self-Review

- **Spec coverage:** Decision 1 (composite) → Tasks 1–2. Decision 2 (misrouting) → Task 3. Decision 3 (typo normalize + keep warning) → Task 1 test "normalizes the line-heigth typo" + scanner untouched. Scope boundary (only font-size roles) → Task 1 test "omits a role that has no font-size base". Line-height px → Task 1 tests + Task 2 assertion `--text-heading-1--line-height: 64px`.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `collectTypographyComposites(graph) → TypographyCompositeEntry[]` used identically in Task 1 (definition) and Task 2 (call site); `{cssName, value, tokenId}` shape matches the `push()` ThemeEntry fields (`modeInvariantHint: false` supplied at the call site).
