# Inspector Badge Parity — Design Spec

**Date:** 2026-06-14
**Status:** Approved
**Feature branch:** `feat/inspector-badge-parity`

## Problem

Typography roles (`typography-heading-1-*`, `typography-heading-2-*`) and layout
primitives (`container-*`, `page-*`, `grid-*`, `stack-*`, `section-*`) now emit
Tailwind v4 `@theme` vars in the CLI / in-app download (v0.20.0 + v0.21.0, via
the renderer pre-passes `collectTypographyComposites` / `collectLayoutPrimitives`).
But the Inspector still classifies them `skip: component-layer` because
`classify-token.ts` skips all component-layer tokens. Result — the Inspector
diverges from the actual output:

- Row badge (`ComponentTree`) shows **skip** instead of **theme**.
- `SummaryPanel` counts them under **skipped**, not **theme-static**.
- The summary filter buckets them under **skip**.
- The detail panel (`OutputSection`) shows a **false "⚠ No Tailwind utility
  mapping"** warning (they don't map to a recipe, so `vueTemplateClasses` is
  empty → the warning branch).

This is the loose end shared by the typography and layout-primitive features. The
CLI/download are correct; only the Inspector's live view is wrong.

## Goal

Make the Inspector's live classification reflect what the renderer actually emits
for these tokens: show them as **theme** vars with the real `cssName`/`value`.

## Architecture

All four surfaces (badge, summary, filter, detail) read from the single map
produced by `useClassifications` (`src/app/classifications.ts`). So the fix is one
seam: after `classifyGraph(g)`, override the classification for the tokens the
pre-passes emit, reusing the **existing** `theme-static` kind:

```ts
const base = classifyGraph(g);
const out = new Map(base);
for (const e of [...collectTypographyComposites(g), ...collectLayoutPrimitives(g)]) {
  out.set(e.tokenId, {
    kind: "theme-static",
    cssName: e.cssName,
    value: e.value,
    modeInvariantHint: false,
  });
}
return out;
```

Because everything downstream consumes this map:
- the row badge shows the existing **theme** (sky) badge,
- `SummaryPanel` counts them under **theme-static** (and the filter works),
- `OutputSection`'s existing `theme-static` branch renders "CSS variable:
  `--text-heading-1`, Value: `72px`, Copy var()" — the false warning never shows.

**No** new `ClassificationKind` (avoids rippling its 4 switch sites), **no**
`OutputSection` / `ClassificationBadge` change, **no** `classify-token.ts` change.
The CLI is untouched; the two views now agree.

Import path: `@core/renderers/typography-composites.js` and
`@core/renderers/layout-primitives.js` (`@core/*` → `./src/*`). The pre-pass
modules are pure (graph in, entries out), safe to call from the web layer.

## Approved decisions

1. **Reuse the `theme-static` ("theme") badge** — these genuinely are theme vars,
   so the existing badge, summary bucket, and filter are all accurate; avoids a
   new `ClassificationKind`.
2. **Scope = typography roles + layout primitives** (the emitted-as-theme-var
   set). Component-recipe tokens (card/dropdown/modal/button/…) stay `skip` —
   they already surface their recipe classes via `vueTemplateClasses`.
3. **Deduped page-width tokens** (e.g. `page-max-width-narrow`, folded into
   `--container-narrow`) keep `skip` — they emit no var of their own, so `skip`
   is accurate. They are absent from the pre-pass output, so the override skips
   them naturally.

## Testing

Unit tests on `useClassifications` (or a small extracted pure helper) with a
synthetic graph:
- a typography role token (`typography-heading-1-font-size`, component layer) →
  `theme-static` with `cssName: "--text-heading-1"`.
- a layout token (`container-max-width-narrow`) → `theme-static` with
  `cssName: "--container-narrow"`.
- a deduped page-width token present alongside its container twin stays `skip`.
- a component-recipe token (`button-bg`) stays `skip`.
- the summary count moves from `skipped` to `themeStatic` accordingly.

## Out of scope

- No change to the CLI renderer or `classify-token.ts`.
- Component-recipe badge semantics (they already show recipe classes).
- Ship as **v0.23.0**.
