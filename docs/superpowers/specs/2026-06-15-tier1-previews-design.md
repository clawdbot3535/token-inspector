# Tier-1 Component Previews + Preview Composable — Design Spec

**Date:** 2026-06-15
**Status:** Approved
**Feature branch:** `feat/tier1-previews`

## Problem

The Inspector renders bespoke live previews for the form controls
(`button`, `input`/`textarea`, `badge`, `switch`, `checkbox`, `radio`). Ten
components still have none — clicking them shows an info pill. v0.20.0–v0.25.0
made every component recipe correct, but you can't *see* the result for
card/modal/dropdown/nav/table/progress/accordion/kbd/chip/sidebar.

This release does the first, simplest tier. Two enabling facts:
- The three single-element components have trivial recipe shapes:
  `card` = `slots.root`, `kbd` = `slots.base`, `progress` = `slots.base` +
  `slots.indicator` + `variants.size`.
- `SIZE_ORDER` + the `sizeClasses` computed are copy-pasted across the
  checkbox/radio/switch previews (flagged in prior review). Adding more previews
  without extracting it multiplies the duplication.

## Goal

Ship live previews for `card`, `kbd`, `progress`, built on a shared preview
composable that also de-duplicates the existing form-control trio.

## Scope (this release, v0.26.0)

1. **Shared composable** `src/app/composables/use-preview-recipe.ts`.
2. **Refactor** `LiveCheckbox` / `LiveRadio` / `LiveSwitch` onto it
   (behavior-preserving — existing tests stay green).
3. **New previews** `LiveCard`, `LiveKbd`, `LiveProgress`.
4. **Wiring** in `App.vue`.

**Out of scope (later releases):** Tier 2 (`modal`, `dropdown`, `accordion`,
`nav`, `table`), Tier 3 custom recipes (`chip`, `sidebar`). `LiveBadge` /
`LiveButton` are left untouched — their size handling (a user-facing switcher /
a full variant×size×state matrix) differs from the trio's "pick one size", so
folding them in risks regressions for no shared benefit.

## Architecture

### Composable

```ts
// src/app/composables/use-preview-recipe.ts
import { computed, type ComputedRef } from "vue";
import { buildComponentRecipes, type ComponentRecipe } from "@core/recipe-engine.js";
import type { TokenGraph } from "@core/token-graph.js";

const SIZE_ORDER: readonly string[] = ["xs", "sm", "md", "lg", "xl"];

/**
 * Build the recipe for a component and expose the "representative size" base
 * classes (md if present, else the smallest defined). Dedups the recipe-build +
 * SIZE_ORDER/sizeClasses logic previously copy-pasted across the form-control
 * previews. Getters keep it reactive without depending on a specific Vue ref API.
 */
export function usePreviewRecipe(
  graphFn: () => TokenGraph | null,
  componentNameFn: () => string,
): { recipe: ComputedRef<ComponentRecipe | null>; sizeClasses: ComputedRef<string> } {
  const recipe = computed<ComponentRecipe | null>(() => {
    const g = graphFn();
    if (!g) return null;
    return buildComponentRecipes(g, { components: [componentNameFn()] })[componentNameFn()] ?? null;
  });
  const sizeClasses = computed<string>(() => {
    const sizes = recipe.value?.variants.size ?? {};
    const keys = Object.keys(sizes);
    if (keys.length === 0) return "";
    const key = keys.includes("md")
      ? "md"
      : [...keys].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))[0]!;
    return sizes[key]?.["base"] ?? "";
  });
  return { recipe, sizeClasses };
}
```

`sizeClasses` reproduces the current checkbox/radio/switch behavior exactly, so
the refactor is behavior-preserving.

### Refactor (checkbox / radio / switch)

Each replaces its inline `recipe` computed + `SIZE_ORDER` const + `sizeClasses`
computed with:

```ts
const { recipe, sizeClasses } = usePreviewRecipe(() => props.graph, () => props.componentName);
```

`baseClasses` / `indicatorClasses` / `cells` stay in each component (they differ).

### New previews (mirror the existing pattern)

All three: build recipe via the composable; resolve classes to inline styles via
`extractArbitrary(projectToState(...))` (JIT-safe); show a fallback message when
the component has no tokens; props `{ graph, componentName, highlightUtility?,
completeness? }` matching the existing previews.

- **`LiveCard`** (`componentName` default `"card"`) — one box styled by
  `slots.root`, with sample title + body text inside. No size variants.
- **`LiveKbd`** (default `"kbd"`) — a `<kbd>` styled by `slots.base` showing a
  sample key label (`⌘K`). No size variants.
- **`LiveProgress`** (default `"progress"`) — a track styled by `slots.base` +
  `sizeClasses` (height), containing an inner fill styled by `slots.indicator`
  at a fixed 60% width. Uses `sizeClasses` from the composable.

### Wiring (`App.vue`)

- Add `"card"`, `"kbd"`, `"progress"` to `COMPONENTS_WITH_PREVIEW` (line 163).
- Import the three components.
- Add a `v-else-if` branch for each in **both** template chains (≈ lines 765-821
  and 871-902), same gate shape and props as the existing entries:
  `previewSupported && selectedComponent === '<name>' && selectedNode.id.split('-')[0] === selectedComponent`.

## Testing

- **Composable unit test** (`use-preview-recipe.test.ts`): a graph with a
  `progress-height-md` token → `sizeClasses` contains `h-[…]`; no size tokens →
  `sizeClasses === ""`; missing component → `recipe === null`.
- **Component mount tests** (jsdom, mirror `LiveCheckbox.test.ts`) for each new
  preview: fallback message when `graph` is null; renders its styled element when
  tokens are present; the element reflects a token value (e.g. card root bg,
  kbd bg, progress indicator bg).
- The existing `LiveCheckbox` / `LiveRadio` / `LiveSwitch` tests stay green after
  the refactor (the behavior-preserving check).

## Release

Ship as **v0.26.0**. README roadmap: move card/kbd/progress previews to released;
note Tier 2/3 previews still planned.
