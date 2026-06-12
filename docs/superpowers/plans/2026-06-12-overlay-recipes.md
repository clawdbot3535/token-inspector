# Overlay Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognise the `overlay-light`/`overlay-dark` token segment, drop the ~90 overlay tokens identical to their base, and emit the ~149 genuine overlay-surface overrides as sparse `<comp>Overlay{Dark,Light}Recipe` delta objects in the existing `custom-components.ts` artifact (in scope this cycle: `badge`, `button`).

**Architecture:** A new `stripOverlayPrefix` helper plus a `buildOverlayRecipes` builder reuse the Stage C delegation pattern — per (component, mode) they construct a per-token `slotMappingOverride` (genuine overlay token → `getSlotMapping(logicalId)`, everything else → `null`) and delegate all assembly to the existing `buildComponentRecipes`. `customComponentsRenderer` merges the overlay map into its output; the build-cli + web gates switch to "emit/show when the rendered text is non-empty" so the artifact appears for overlay-only graphs too.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Vue 3 SPA, `@tg/grammar` workspace, `tsx` build CLI.

---

## Reference: the real data (from `clawdbot3535/design-token-export`)

`overlay-{light,dark}` sits as the 2nd segment after the component name for the in-scope components:

```
button-solid-bg            = #5667A7   (base)
button-overlay-dark-solid-bg  = #FAFAFA   (genuine — differs)   → buttonOverlayDark
button-overlay-light-solid-bg = #18181B   (genuine — differs)   → buttonOverlayLight
nav-item-overlay-dark-ghost-bg            (sub-element → DEFERRED, produces nothing)
```

Measured genuine/identical split (a token is *genuine* when its value differs from base, or base is absent):

| component | sub-element? | dark genuine/identical | light genuine/identical | in scope |
|---|---|---|---|---|
| badge | no | 22 / 16 | 21 / 17 | **yes** |
| button | no | 30 / 7 | 27 / 9 | **yes** |
| nav | yes (`item-`) | 23 / 20 | 20 / 21 | deferred (bucket B) |

`stripOverlayPrefix` only fires when `parts[1] === "overlay"`, which excludes the `nav-item-overlay-*`
case (there `parts[1] === "item"`), so nav recipes are empty and omitted — no special-casing needed.

---

## File Structure

- **Modify** `src/custom-recipe-engine.ts` — add `stripOverlayPrefix` + `buildOverlayRecipes`
  (sits next to `normalizeTrailingColorRole` + `buildCustomRecipes`; same delegation pattern).
- **Modify** `src/renderers/custom-components.ts` — merge `buildOverlayRecipes(graph)` into the
  rendered recipe map; generalise the header comment.
- **Modify** `scripts/build-cli.ts` — gate the `custom-components.ts` write on rendered-text-non-empty
  instead of `customParts.size > 0`.
- **Modify** `src/app/state.ts` + `src/app/App.vue` — show the `custom-components.ts` tab when the
  rendered text is non-empty (covers overlay-only graphs).
- **Test** alongside: `src/custom-recipe-engine.test.ts`, `src/renderers/renderers.test.ts`.

---

## Task 1: `stripOverlayPrefix` helper

**Files:**
- Modify: `src/custom-recipe-engine.ts` (append after `normalizeTrailingColorRole`)
- Test: `src/custom-recipe-engine.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/custom-recipe-engine.test.ts`:

```ts
import { stripOverlayPrefix } from "./custom-recipe-engine.js";

describe("stripOverlayPrefix", () => {
  it("strips a 2nd-segment overlay-dark and reports the mode", () => {
    expect(stripOverlayPrefix("button-overlay-dark-solid-bg")).toEqual({
      logicalId: "button-solid-bg",
      mode: "dark",
    });
  });
  it("strips a 2nd-segment overlay-light", () => {
    expect(stripOverlayPrefix("badge-overlay-light-accent-bg")).toEqual({
      logicalId: "badge-accent-bg",
      mode: "light",
    });
  });
  it("is a no-op when overlay sits after a sub-element (deferred nav case)", () => {
    expect(stripOverlayPrefix("nav-item-overlay-dark-ghost-bg")).toEqual({
      logicalId: "nav-item-overlay-dark-ghost-bg",
      mode: null,
    });
  });
  it("is a no-op for a non-overlay token", () => {
    expect(stripOverlayPrefix("button-solid-bg")).toEqual({
      logicalId: "button-solid-bg",
      mode: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/custom-recipe-engine.test.ts -t stripOverlayPrefix`
Expected: FAIL — `stripOverlayPrefix` not exported.

- [ ] **Step 3: Implement the helper**

Append to `src/custom-recipe-engine.ts`:

```ts
export type OverlayMode = "light" | "dark";

/**
 * Detects an `overlay-light`/`overlay-dark` segment in the 2nd position
 * (immediately after the component name) and returns the logical base id with
 * the segment removed plus the detected mode. A no-op (mode `null`) when the
 * segment is absent or sits after a sub-element (e.g. `nav-item-overlay-*`,
 * which is deferred until variant-after-sub-element mapping lands) — there
 * `parts[1]` is the sub-element, not `"overlay"`.
 */
export function stripOverlayPrefix(tokenId: string): {
  logicalId: string;
  mode: OverlayMode | null;
} {
  const parts = tokenId.split("-");
  if (parts[1] !== "overlay") return { logicalId: tokenId, mode: null };
  const mode = parts[2];
  if (mode !== "light" && mode !== "dark") return { logicalId: tokenId, mode: null };
  const logicalId = [parts[0], ...parts.slice(3)].join("-");
  return { logicalId, mode };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/custom-recipe-engine.test.ts -t stripOverlayPrefix`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/custom-recipe-engine.ts src/custom-recipe-engine.test.ts
git commit -m "feat(overlay): stripOverlayPrefix — detect 2nd-segment overlay-light/dark"
```

---

## Task 2: `buildOverlayRecipes` builder

**Files:**
- Modify: `src/custom-recipe-engine.ts` (append)
- Test: `src/custom-recipe-engine.test.ts` (append)

- [ ] **Step 1: Write the failing test (focused in-memory fixture)**

Append to `src/custom-recipe-engine.test.ts`. This builds a tiny graph with a genuine override, an
identical-to-base override (dedup target), and a sub-element overlay token (deferral target), using
the same `makeNode`/`makeGraph` shape as `src/recipe-engine.test.ts`:

```ts
import { buildOverlayRecipes } from "./custom-recipe-engine.js";
import type { TokenNode, TokenGraph, GraphLayer, TokenType, SourceLayer } from "./token-graph.js";

function ovNode(id: string, base: string, layer: GraphLayer = "component", type: TokenType = "color", source: SourceLayer = "global"): TokenNode {
  return {
    id, path: id.split("-"), type, layer, themes: [],
    cssValue: { base }, rawValue: { base }, alias: {}, source,
  };
}
function ovGraph(nodes: TokenNode[]): TokenGraph {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    aliasIndex: new Map(), reverseAliases: new Map(), issues: [], sources: [],
    meta: { builtAt: "2026-06-12T00:00:00Z", builderVersion: "test" },
  };
}

describe("buildOverlayRecipes", () => {
  it("emits a sparse dark recipe with only the genuine override", () => {
    const graph = ovGraph([
      ovNode("button-solid-bg", "#5667A7"),
      ovNode("button-overlay-dark-solid-bg", "#FAFAFA"),   // genuine — differs from base
      ovNode("button-ghost-bg", "#111111"),
      ovNode("button-overlay-dark-ghost-bg", "#111111"),   // identical to base — dropped
    ]);
    const recipes = buildOverlayRecipes(graph);
    expect(recipes["buttonOverlayDark"]).toBeDefined();
    // genuine solid override present:
    expect(recipes["buttonOverlayDark"].variants.color?.solid?.base).toMatch(/bg-\[/);
    // identical ghost override absent (deduped):
    expect(recipes["buttonOverlayDark"].variants.color?.ghost).toBeUndefined();
    // no light recipe (no light tokens):
    expect(recipes["buttonOverlayLight"]).toBeUndefined();
  });

  it("treats an overlay token with no base counterpart as genuine", () => {
    const graph = ovGraph([
      ovNode("badge-overlay-light-accent-bg", "#5667A7"), // no badge-accent-bg base node
    ]);
    const recipes = buildOverlayRecipes(graph);
    expect(recipes["badgeOverlayLight"]?.variants.color?.accent?.base).toMatch(/bg-\[/);
  });

  it("defers sub-element overlay tokens (nav-item-overlay-*) — emits nothing", () => {
    const graph = ovGraph([
      ovNode("nav-item-overlay-dark-ghost-bg", "#FAFAFA"),
    ]);
    expect(buildOverlayRecipes(graph)).toEqual({});
  });

  it("returns {} for a graph with no overlay tokens", () => {
    const graph = ovGraph([ovNode("button-solid-bg", "#5667A7")]);
    expect(buildOverlayRecipes(graph)).toEqual({});
  });
});
```

> Note: `button-overlay-dark-solid-bg` strips to `button-solid-bg`, whose mapping is
> `{ variantAxis: "color", variantKey: "solid", slot: "base", utilityType: "bg-color" }` — so the
> override emits `variants.color.solid.base`. `accent` is a colour-role, so
> `badge-overlay-light-accent-bg` → `badge-accent-bg` → `variants.color.accent.base`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/custom-recipe-engine.test.ts -t buildOverlayRecipes`
Expected: FAIL — `buildOverlayRecipes` not exported.

- [ ] **Step 3: Implement the builder**

Append to `src/custom-recipe-engine.ts`. Add `resolveTokenToValue` to the imports (it lives in
`./resolve-token.js` and returns `{ value: string } | { error: ... }`):

```ts
import { resolveTokenToValue } from "./resolve-token.js";
```

```ts
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A genuine overlay override is one whose resolved value differs from its base
 * counterpart's. Conservative: if the base id has no node / cannot resolve,
 * treat the overlay token as genuine (never silently drop on uncertainty); if
 * the overlay token itself cannot resolve, it is not emittable → not genuine.
 */
function isGenuineOverlay(overlayId: string, logicalId: string, graph: TokenGraph): boolean {
  const ov = resolveTokenToValue(overlayId, graph);
  if ("error" in ov) return false;
  const base = resolveTokenToValue(logicalId, graph);
  if ("error" in base) return true; // no/unresolvable base → genuine
  return base.value !== ov.value;
}

/**
 * Build sparse `<component>Overlay<Mode>` delta recipes from `overlay-light` /
 * `overlay-dark` tokens. Reuses the buildCustomRecipes delegation: per
 * (component, mode) we override each genuine overlay token to the slot/variant
 * its logical (prefix-stripped) id maps to, null everything else, and let
 * buildComponentRecipes assemble — so only this mode's genuine overrides are
 * emitted, valued from the real overlay nodes. Identical-to-base tokens and
 * sub-element overlay tokens (stripOverlayPrefix mode === null) are dropped.
 */
export function buildOverlayRecipes(graph: TokenGraph): Record<string, ComponentRecipe> {
  // Discover which (component, mode) pairs have overlay tokens.
  const pairs = new Set<string>(); // `${component}|${mode}`
  for (const node of graph.nodes.values()) {
    if (node.layer !== "component") continue;
    const { mode } = stripOverlayPrefix(node.id);
    if (mode === null) continue;
    pairs.add(`${node.id.split("-")[0]}|${mode}`);
  }

  const out: Record<string, ComponentRecipe> = {};
  for (const pair of pairs) {
    const [component, mode] = pair.split("|") as [string, OverlayMode];
    const override: Record<string, ReturnType<typeof getSlotMapping>> = {};
    for (const node of graph.nodes.values()) {
      if (node.layer !== "component") continue;
      if (node.id.split("-")[0] !== component) continue;
      const { logicalId, mode: m } = stripOverlayPrefix(node.id);
      if (m === mode && isGenuineOverlay(node.id, logicalId, graph)) {
        override[node.id] = getSlotMapping(logicalId, undefined, node.type);
      } else {
        override[node.id] = null; // base, other mode, identical, or sub-element → skip
      }
    }
    const built = buildComponentRecipes(graph, {
      components: [component],
      slotMappingOverride: override as SlotMappingOverride,
    });
    const recipe = built[component];
    if (recipe && (Object.keys(recipe.slots).length > 0 ||
        Object.values(recipe.variants).some((axis) => axis && Object.keys(axis).length > 0))) {
      out[`${component}Overlay${capitalize(mode)}`] = recipe;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/custom-recipe-engine.test.ts`
Expected: PASS (all stripOverlayPrefix + buildOverlayRecipes + the existing Stage C tests).

If `variants.color.solid.base` is undefined, log the `override` map and confirm
`button-overlay-dark-solid-bg` resolved to `{ variantAxis:"color", variantKey:"solid", slot:"base", utilityType:"bg-color" }`. Do NOT weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/custom-recipe-engine.ts src/custom-recipe-engine.test.ts
git commit -m "feat(overlay): buildOverlayRecipes — sparse per-mode delta recipes via override delegation"
```

---

## Task 3: Renderer integration

**Files:**
- Modify: `src/renderers/custom-components.ts`
- Test: `src/renderers/renderers.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/renderers/renderers.test.ts`. Reuse the existing `realGraph()` helper for the
empty-overlay case, and build a tiny overlay graph inline for the positive case (mirror the `ovNode`
shape from `custom-recipe-engine.test.ts`; if a local node factory already exists in this file, use it):

```ts
import type { TokenNode } from "../token-graph.js";

function ovGraphR(nodes: TokenNode[]) {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    aliasIndex: new Map(), reverseAliases: new Map(), issues: [], sources: [],
    meta: { builtAt: "2026-06-12T00:00:00Z", builderVersion: "test" },
  } as const;
}
const ovN = (id: string, base: string): TokenNode => ({
  id, path: id.split("-"), type: "color", layer: "component", themes: [],
  cssValue: { base }, rawValue: { base }, alias: {}, source: "global",
});

describe("customComponentsRenderer overlay recipes", () => {
  it("emits an overlay recipe const for a graph with genuine overlay tokens", () => {
    const graph = ovGraphR([
      ovN("button-solid-bg", "#5667A7"),
      ovN("button-overlay-dark-solid-bg", "#FAFAFA"),
    ]) as never;
    const out = customComponentsRenderer.render(graph, {});
    expect(out.text).toContain("export const buttonOverlayDarkRecipe");
    expect(out.text).toMatch(/Nuxt UI cannot express/i);
  });

  it("still returns empty text for a graph with neither custom nor overlay output", () => {
    const graph = ovGraphR([ovN("button-solid-bg", "#5667A7")]) as never;
    expect(customComponentsRenderer.render(graph, {}).text).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderers/renderers.test.ts -t "overlay recipes"`
Expected: FAIL — overlay recipes not merged; no `buttonOverlayDarkRecipe`, header text unchanged.

- [ ] **Step 3: Merge overlay recipes into the renderer**

In `src/renderers/custom-components.ts`:

Add the import:

```ts
import { buildCustomRecipes, buildOverlayRecipes } from "../custom-recipe-engine.js";
```

Replace the recipe-building lines in `render` (currently `const recipes = buildCustomRecipes(...)`)
with a merged map, and generalise the header comment:

```ts
    const parts = options?.customParts ?? new Map();
    const recipes = {
      ...buildCustomRecipes(graph, parts, {
        defaultSizeByComponent: options?.defaultSizeByComponent,
      }),
      ...buildOverlayRecipes(graph),
    };
    const names = Object.keys(recipes).sort();
    if (names.length === 0) {
      return new LineBuilder().build();
    }

    const lb = new LineBuilder();
    lb.push("// Generated by build-cli — recipes Nuxt UI cannot express natively:");
    lb.push("// custom components (foreign parts Nuxt has no slot for) AND overlay-surface");
    lb.push("// overrides (component appearance on a dark/light overlay — no Nuxt prop exists).");
    lb.push("// Hand-apply via tailwind-variants: const ui = tv(chipRecipe) / tv(base, buttonOverlayDarkRecipe).");
    lb.blank();
```

Leave the `for (const name of names)` loop and `emitCustomRecipe` unchanged — the map key already
drives the `export const <name>Recipe` export name (so `buttonOverlayDark` → `buttonOverlayDarkRecipe`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderers/renderers.test.ts`
Expected: PASS. The existing custom-recipe (chip) renderer tests stay green — their `realGraph()`
fixture has no overlay tokens, so `buildOverlayRecipes` returns `{}` and merges to nothing.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/custom-components.ts src/renderers/renderers.test.ts
git commit -m "feat(overlay): merge overlay recipes into custom-components.ts renderer"
```

---

## Task 4: Wiring — gate on rendered output, not customParts.size

**Files:**
- Modify: `scripts/build-cli.ts`
- Modify: `src/app/App.vue`

- [ ] **Step 1: Wire build-cli to gate on non-empty render**

In `scripts/build-cli.ts`, the current custom-components block is:

```ts
if (customParts.size > 0) {
  const customRendered = customComponentsRenderer.render(graph, {
    customParts,
    defaultSizeByComponent: slotMapping.defaultSizeByComponent,
  });
  writeOut("nuxt/custom-components.ts", customRendered.text);
}
```

Replace it with a render-first, write-if-non-empty gate (so overlay-only graphs also emit the file):

```ts
const customRendered = customComponentsRenderer.render(graph, {
  customParts,
  defaultSizeByComponent: slotMapping.defaultSizeByComponent,
});
if (customRendered.text.trim().length > 0) {
  writeOut("nuxt/custom-components.ts", customRendered.text);
}
```

- [ ] **Step 2: Run the CLI against the new export to verify**

Temporarily point the CLI at the new export to confirm overlay recipes appear (the local
`components/` fixture predates overlay):

```bash
cp -r components /tmp/components-backup && cp /tmp/dt-export/*.json components/ && npm run build:tokens; cp /tmp/components-backup/*.json components/ && rm -rf /tmp/components-backup
```

Then check (the build wrote to `output/nuxt/`, which is gitignored):

```bash
grep -c "OverlayDarkRecipe\|OverlayLightRecipe" output/nuxt/custom-components.ts   # expect > 0 (badge/button)
grep -c "navOverlay" output/nuxt/custom-components.ts                              # expect 0 (deferred)
```

> If `/tmp/dt-export` is gone, re-clone: `git clone https://github.com/clawdbot3535/design-token-export /tmp/dt-export`. Do NOT commit the swapped `components/` — the cp restores it.

- [ ] **Step 3: Wire the web tab to show on non-empty render**

In `src/app/App.vue`, the custom tab visibility is currently driven by `customParts.value.size > 0`
in the `outputTabs` computed. Add a computed that renders the artifact and gate on its text, so
overlay-only graphs reveal the tab:

```ts
const customOutputText = computed(() => {
  const g = state.graph.value;
  if (!g) return "";
  return customComponentsRenderer.render(g, { customParts: customParts.value }).text;
});
const outputTabs = computed(() =>
  customOutputText.value.trim().length > 0
    ? (["tokens.css", "app.config.ts", "custom-components.ts"] as const)
    : (["tokens.css", "app.config.ts"] as const),
);
```

`customComponentsRenderer` is already imported in App.vue (Stage C). The existing `watch(outputTabs, …)`
stale-tab reset stays as-is. `downloadAll` already includes the custom file conditionally on
`customParts.value.size > 0`; widen that condition to `customOutputText.value.trim().length > 0` so an
overlay-only download includes the file:

```ts
    ...(customOutputText.value.trim().length > 0
      ? [{
          name: customComponentsRenderer.id,
          data: customComponentsRenderer.render(g, { customParts: customParts.value }).text,
        }]
      : []),
```

- [ ] **Step 4: Typecheck + gate test**

Run: `npm run typecheck` → expect PASS.
Run: `npx vitest run src/app/App.test.ts` → expect PASS (gate smoke test).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-cli.ts src/app/App.vue
git commit -m "feat(overlay): emit/show custom-components.ts when render is non-empty (covers overlay-only)"
```

---

## Task 5: Integration verification + full gate

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck** — Run: `npm run typecheck` → PASS.
- [ ] **Step 2: Full test suite** — Run: `npm run test` → PASS (target ≥ 583).
- [ ] **Step 3: Production build** — Run: `npm run build` → `✓ built`.
- [ ] **Step 4: Real-export spot check** — repeat the Task 4 Step 2 swap and confirm
  `output/nuxt/custom-components.ts` contains `buttonOverlayDarkRecipe`, `buttonOverlayLightRecipe`,
  `badgeOverlayDarkRecipe`, `badgeOverlayLightRecipe`, and NO `navOverlay*`. Restore `components/`.
- [ ] **Step 5: Final commit (if any verification artifact changed)** —
  `git add -A && git commit -m "chore(overlay): verify full gate green" || echo "nothing to commit"`.

---

## Known boundaries (documented, not gaps)

- `nav-item-overlay-*` (and any future sub-element overlay) is deferred until variant-after-sub-element
  mapping (bucket B) lands — `stripOverlayPrefix` returns `mode: null` for it, so it produces no recipe.
- Overlay recipes are sparse deltas: only tokens differing from base are emitted; the dev merges them
  onto the base recipe. Identical-to-base overlay tokens are intentionally dropped.
- The local `components/` fixture is NOT refreshed in this plan (kept a separate, deliberate change so
  existing snapshots are reviewed on their own). Overlay unit tests use focused in-memory graphs.

## Self-Review

- **Spec coverage:** stripOverlayPrefix → Task 1. buildOverlayRecipes + dedup + delegation → Task 2.
  Renderer merge + header → Task 3. Sparse-delta (genuine-only) → Task 2 (isGenuineOverlay + null-skip).
  Scope badge/button, nav deferred → Task 1 (position rule) + Task 2 test. Gate widening → Task 4.
  Success criteria (recipe names, identical dropped, app.config unchanged, gate green) → Tasks 2/3/4/5.
- **Placeholder scan:** none; every code step is concrete and grounded in real signatures
  (`getSlotMapping`, `buildComponentRecipes`, `resolveTokenToValue`, `ComponentRecipe`, `makeNode` shape).
- **Type consistency:** `OverlayMode` = `"light"|"dark"` used in stripOverlayPrefix + buildOverlayRecipes;
  recipe map keys `<component>Overlay<Mode>` (e.g. `buttonOverlayDark`) consistent between builder,
  renderer export name, and tests; `buildOverlayRecipes(graph)` single-arg consistent across renderer +
  build-cli + web.
