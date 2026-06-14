# Inspector Badge Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Inspector classify typography-role and layout-primitive tokens as `theme-static` (with their real `--text-*`/`--container-*`/… cssName), matching what the renderer emits — fixing the row badge, summary count, filter, and detail panel in one seam.

**Architecture:** Extract a pure `buildInspectorClassifications(graph)` in `src/app/classifications.ts` that runs `classifyGraph(graph)` then overrides the component-layer tokens the renderer pre-passes emit (`collectTypographyComposites` + `collectLayoutPrimitives`) to `theme-static`. `useClassifications` consumes it. No core/`classify-token.ts`/renderer change.

**Tech Stack:** TypeScript, Vue 3 composable, Vitest. ESM (`.js` suffix), `@core/*` → `./src/*`. Pre-commit runs `vue-tsc` + full vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-inspector-badge-parity-design.md`

---

## File Structure

- **Modify** `src/app/classifications.ts` — add pure `buildInspectorClassifications(graph)`; `useClassifications` calls it.
- **Create** `src/app/classifications.test.ts` — unit tests for the override.

No other file changes (badge / summary / OutputSection / filter all consume the map already).

---

### Task 1: Pure inspector-classification builder with theme-emit overrides

**Files:**
- Modify: `src/app/classifications.ts`
- Test: `src/app/classifications.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/classifications.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildInspectorClassifications } from "./classifications.js";
import type { TokenGraph, TokenNode } from "@core/token-graph.js";

function node(id: string, base: string, type: TokenNode["type"] = "number"): TokenNode {
  return {
    id,
    path: id.split("-"),
    type,
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

describe("buildInspectorClassifications — theme-emit overrides", () => {
  it("classifies a typography role token as theme-static with its --text-* cssName", () => {
    const c = buildInspectorClassifications(
      graph([node("typography-heading-1-font-size", "72px")]),
    );
    expect(c.get("typography-heading-1-font-size")).toMatchObject({
      kind: "theme-static",
      cssName: "--text-heading-1",
      value: "72px",
    });
  });

  it("classifies a layout-primitive token as theme-static with its remapped cssName", () => {
    const c = buildInspectorClassifications(
      graph([node("container-max-width-narrow", "960px")]),
    );
    expect(c.get("container-max-width-narrow")).toMatchObject({
      kind: "theme-static",
      cssName: "--container-narrow",
      value: "960px",
    });
  });

  it("leaves a deduped page-width token as skip (it emits no var of its own)", () => {
    const c = buildInspectorClassifications(
      graph([
        node("container-max-width-narrow", "960px"),
        node("page-max-width-narrow", "960px"),
      ]),
    );
    expect(c.get("page-max-width-narrow")?.kind).toBe("skip");
  });

  it("leaves a component-recipe token as skip", () => {
    const c = buildInspectorClassifications(graph([node("button-bg", "#fff", "color")]));
    expect(c.get("button-bg")?.kind).toBe("skip");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/classifications.test.ts`
Expected: FAIL — `buildInspectorClassifications` is not exported.

- [ ] **Step 3: Implement**

In `src/app/classifications.ts`, add imports below the existing ones:

```ts
import { collectTypographyComposites } from "@core/renderers/typography-composites.js";
import { collectLayoutPrimitives } from "@core/renderers/layout-primitives.js";
```

Add the pure builder (after the imports, before `useClassifications`):

```ts
/**
 * Inspector classification map: the core classification, plus overrides for the
 * component-layer tokens the renderer emits as Tailwind v4 @theme vars
 * (typography roles → --text-*, layout primitives → --container-/--spacing-/--radius-*).
 * Those would otherwise read as `skip`, diverging from the actual CLI/download
 * output. Reuses the existing `theme-static` kind so the badge, summary, filter,
 * and detail panel all reflect the real emit.
 */
export function buildInspectorClassifications(
  graph: TokenGraph,
): Map<string, Classification> {
  const out = new Map<string, Classification>(classifyGraph(graph));
  for (const e of [
    ...collectTypographyComposites(graph),
    ...collectLayoutPrimitives(graph),
  ]) {
    out.set(e.tokenId, {
      kind: "theme-static",
      cssName: e.cssName,
      value: e.value,
      modeInvariantHint: false,
    });
  }
  return out;
}
```

Then change the `classifications` computed in `useClassifications` to use it:

```ts
  const classifications = computed<ReadonlyMap<string, Classification>>(() => {
    const g = graph.value;
    if (!g) return new Map();
    return buildInspectorClassifications(g);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/classifications.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/classifications.ts src/app/classifications.test.ts
git commit -m "feat(app): Inspector classifies typography/layout tokens as theme (badge parity)"
```

---

### Task 2: Verify full suite + live export

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test`
Expected: all pass (incl. the existing `App.test.ts`, which stubs `OutputSection`).

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 2: Verify the override against the live export**

Create `scripts/_probe-badge.ts`:

```ts
import { parseGitUrl, fetchTokenFiles } from "../src/app/git-import.js";
import { loadSources } from "../src/app/load-sources.js";
import { buildGraph } from "../src/build-graph.js";
import { buildInspectorClassifications } from "../src/app/classifications.js";

const ref = parseGitUrl("https://github.com/clawdbot3535/design-token-export")!;
const g = buildGraph((await loadSources(await fetchTokenFiles(ref))).sources);
const c = buildInspectorClassifications(g);
const sample = [
  "typography-heading-1-font-size", "typography-heading-2-line-heigth",
  "container-max-width-narrow", "stack-gap-md", "section-radius-card", "grid-columns",
  "page-max-width-narrow", "card-bg",
];
for (const id of sample) {
  const k = c.get(id);
  console.log(`${id}: ${k?.kind}${k && "cssName" in k ? " " + k.cssName : ""}`);
}
```

Run: `npx tsx scripts/_probe-badge.ts && rm -f scripts/_probe-badge.ts`
Expected: typography/`container`/`stack`/`section`/`grid-columns` tokens → `theme-static` with their emitted cssName; `page-max-width-narrow` → `skip` (deduped); `card-bg` → `skip` (recipe token).

---

### Task 3: Release (gated on green tree + user OK)

Target **v0.23.0**.

- [ ] Bump `package.json` to `0.23.0` (`npm version 0.23.0 --no-git-tag-version`).
- [ ] `CHANGELOG.md` entry (Inspector badge parity: typography-role + layout-primitive tokens now classify as `theme-static` in the live view, matching the emitted `--text-*`/`--container-*`/… vars; fixes the false "no mapping" warning; reuses the existing theme badge; deduped page-widths + recipe tokens stay skip).
- [ ] README roadmap line for v0.23.0; update the "Next" line (drop the Inspector-badge-parity item).
- [ ] Commit `chore(release): v0.23.0 — Inspector badge parity`, tag `v0.23.0`.
- [ ] Merge to `main` (`--ff-only`), push (`gh auth switch --user clawdbot3535` if 403, then back to `d56de`), publish the GitHub Release, delete the branch.

---

## Self-Review

- **Spec coverage:** one-seam override → Task 1 impl; theme-static reuse → Task 1; scope (typography+layout, recipe tokens stay skip) → Task 1 tests; deduped page-width edge → Task 1 test; live verify → Task 2.
- **Placeholder scan:** none — concrete code/commands throughout.
- **Type consistency:** `buildInspectorClassifications(graph: TokenGraph): Map<string, Classification>` defined and consumed in Task 1; the override object matches the `theme-static` variant shape (`kind`, `cssName`, `value`, `modeInvariantHint`). Pre-pass entries are `{cssName, value, tokenId}`. `Classification`/`classifyGraph` already imported in `classifications.ts`.
