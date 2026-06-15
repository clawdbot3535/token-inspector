# Tier-3 Component Previews (chip / sidebar) — Design Spec

**Date:** 2026-06-15
**Status:** Approved
**Feature branch:** `feat/tier3-previews`

## Problem

Tier-1 (v0.26.0) and Tier-2 (v0.27.0) previews cover every standard `ui.*`
component. The two remaining ones — `chip` and `sidebar` — are **custom recipes**:
they emit into `output/nuxt/custom-components.ts` (not `app.config.ts`), built by
`buildCustomRecipes`, not `buildComponentRecipes`. So `usePreviewRecipe` (which
calls `buildComponentRecipes`) can't produce them. They currently show an info
pill.

## Goal

Live previews for `chip` and `sidebar`, reading the custom recipe. This is the
last preview tier — after it, **every component has a live preview**. Ship as
**v0.28.0**.

## Custom-recipe path

`buildCustomRecipes(graph, customParts, {}) → Record<name, ComponentRecipe>`,
where `customParts = customPartsByComponent(scanReport)` (already computed in
`App.vue:113` as `customParts`). The result is a normal `ComponentRecipe` (slots +
variants), so once built, rendering matches the other previews. With the real
allow-list, `customParts` = `{ sidebar: ["item"], chip: ["label", "close"] }`.

Recipe shapes (live export):
```
chip:    base (pill: bg/ring/font/rounded-999px + states) + label (text + states)
         + close (× glyph) + variants.color.{error,success} (base bg/ring + label text)
sidebar: base (panel, w-240px, bg/border/pad) + item (text + hover:/active: + pad/radius)
```

## Architecture

### Composable (`src/app/composables/use-preview-recipe.ts`)

Extract the size logic into a pure helper and add a custom sibling:

```ts
export function representativeSizeClasses(recipe: ComponentRecipe | null): string {
  const sizes = recipe?.variants.size ?? {};
  const keys = Object.keys(sizes);
  if (keys.length === 0) return "";
  const key = keys.includes("md") ? "md" : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
  return sizes[key]?.["base"] ?? "";
}
```

`usePreviewRecipe`'s `sizeClasses` becomes `computed(() => representativeSizeClasses(recipe.value))`.
Add:

```ts
export function useCustomPreviewRecipe(
  graphFn: () => TokenGraph | null,
  componentNameFn: () => string,
  partsFn: () => ReadonlyMap<string, ReadonlyArray<string>>,
): { recipe: ComputedRef<ComponentRecipe | null>; sizeClasses: ComputedRef<string> } {
  const recipe = computed(() => {
    const g = graphFn();
    if (!g) return null;
    const name = componentNameFn();
    return buildCustomRecipes(g, partsFn(), {})[name] ?? null;
  });
  const sizeClasses = computed(() => representativeSizeClasses(recipe.value));
  return { recipe, sizeClasses };
}
```

(`buildCustomRecipes` imported from `@core/custom-recipe-engine.js`.) The existing
`usePreviewRecipe` behavior is unchanged — its tests stay green.

### Previews

Both take props `{ graph, componentName, customParts, highlightUtility?,
completeness? }` and use `useCustomPreviewRecipe(() => props.graph, () =>
props.componentName, () => props.customParts)`. Fallback `<p>No …</p>` when
`recipe` is null. `r(c)` ≔ `extractArbitrary(c)`; states stripped to resting via
`projectToState(c, "default")`.

- **`LiveChip`** — one pill per row: `default` plus each `variants.color.*` key
  (`error`, `success`). Each pill = `slots.base` (+ the variant's `base`) holding
  a label (`slots.label` + the variant's `label`) and a `×` glyph (`slots.close`).
  `data-testid="chip"` per pill. The `close` slot has an export data quirk
  (`close-color` → `size-[#hex]`); rendered as-is, harmless (junk class doesn't
  style the `×`).
- **`LiveSidebar`** — a `slots.base` panel (`data-testid="sidebar-root"`)
  containing three `slots.item` rows (`data-testid="sidebar-item"`) projected to
  `default` / `hover` / `active`.

### Wiring (`App.vue`)

Import both; add `"chip"`, `"sidebar"` to `COMPONENTS_WITH_PREVIEW`; add a
`v-else-if` branch each in **both** template chains, before `LiveButton`, with the
**extra `:custom-parts="customParts"`** prop (chain-1 also `:highlight-utility`).
Name + both branches together (LiveButton catch-all).

## Testing

A jsdom mount test per preview: fallback on `graph: null`; with a fixture graph +
a literal `customParts` Map, the styled elements render and reflect a token value.
`LiveChip`: assert one `chip` element per row (default + 2 color variants = 3) and
the default pill's `base` `style.backgroundColor !== ""`. `LiveSidebar`: assert
`sidebar-root` + three `sidebar-item` rows, root style non-empty.

## Scope boundaries

- Only `chip` + `sidebar`. No change to `buildCustomRecipes`, the scanner, or the
  grammar.
- Data-blocked items (`tooltip`/`popover` recipes, `compoundVariants` emit,
  `data-[state=…]:` prefix form) remain out of scope.

## Release

Ship as **v0.28.0**. README roadmap: Tier-3 released; "Next" = only the
data-blocked items remain. **Every component now has a live preview.**
