# Layout Primitives Theme Export — Design Spec

**Date:** 2026-06-14
**Status:** Approved
**Feature branch:** `feat/layout-primitives`

## Problem

The design system authors layout primitives — `container`, `page`, `grid`,
`stack`, `section` (24 tokens) — in `components/global.tokens.json`. The `global`
source maps to the **component** layer (`build-graph.ts` `layerFor`), so
`classify-token.ts` skips them and they never reach `output/css/tokens.css`.

v0.17.0 (Bucket E) reclassified these prefixes in the **scan forecast** so they
read as "theme/CSS primitives" rather than "unmapped components", but explicitly
deferred the CSS-var emit to this work. This feature delivers that emit.

## Goal

Emit the layout primitives as **Tailwind v4 `@theme` custom properties that
generate real utilities** (utility-first, the project's thesis): widths →
`--container-*` (`max-w-*`), gaps/paddings → `--spacing-*` (`p/px/py/m/gap-*`),
radii → `--radius-*` (`rounded-*`).

## Source tokens (from the live 914-token export)

```
container-max-width=1280px  -max-width-narrow=960px  -max-width-prose=720px  -padding-x=40px
page-max-width=1280px  -max-width-narrow=960px  -max-width-prose=720px
page-padding-x-desktop=40px  -tablet=24px  -mobile=16px
grid-columns=12  -gap-sm=16px  -gap-md=24px  -gap-lg=32px  -item-radius=8px
stack-gap-xs=8px  -gap-sm=16px  -gap-md=24px  -gap-lg=40px
section-padding-y-sm=48px  -md=64px  -lg=80px  -radius-card=12px  -radius-contained=16px
```

All are `type=number`, `layer=component`, `source=global`. Note: the local
`components/` fixture (old 514-token export) has **none** of these — they exist
only in the live export. Unit tests on synthetic ids are authoritative; the
remote export is the end-to-end check.

## Deterministic mapping rule

Derived from the token id:

| id contains | namespace | utility | key |
|---|---|---|---|
| `max-width` | `--container-*` | `max-w-*` | variant only (family dropped → dedup); bare → `default` |
| `gap` / `padding` | `--spacing-*` | `p/px/py/m/gap-*` | family + variant; the type word and axis (`x`/`y`) dropped |
| `radius` | `--radius-*` | `rounded-*` | family + variant (type word dropped) |
| `columns` | none | none | full id (`--grid-columns`) — plain var |
| (other) | none | none | full id `--<id>` — faithful fallback |

## Resulting output (21 entries: 24 source − 3 deduped page widths)

```css
@theme {
  /* — Layout Primitives — */
  --container-default: 1280px;       /* max-w-default; container + page share */
  --container-narrow: 960px;
  --container-prose: 720px;
  --spacing-container: 40px;         /* container-padding-x */
  --spacing-page-desktop: 40px;
  --spacing-page-tablet: 24px;
  --spacing-page-mobile: 16px;
  --spacing-grid-sm: 16px;
  --spacing-grid-md: 24px;
  --spacing-grid-lg: 32px;
  --spacing-stack-xs: 8px;
  --spacing-stack-sm: 16px;
  --spacing-stack-md: 24px;
  --spacing-stack-lg: 40px;
  --spacing-section-sm: 48px;        /* section-padding-y-sm */
  --spacing-section-md: 64px;
  --spacing-section-lg: 80px;
  --radius-grid-item: 8px;
  --radius-section-card: 12px;
  --radius-section-contained: 16px;
  --grid-columns: 12;                /* no Tailwind utility — variable only */
}
```

## Approved decisions

1. **Widths: dedupe** container & page into one `--container-*` scale (values are
   identical). **Guard:** if two width tokens map to the same `cssName` with
   **different** values, keep both — qualify the page one as
   `--container-page-<variant>` — never silently overwrite. So the common case is
   clean and a future divergence loses no data.
2. **Bare `max-width` (no variant) → key `default`** (`--container-default`).
3. **Drop the axis (`x`/`y`) from spacing keys** — Tailwind spacing is
   axis-agnostic, the designer picks `py-section-lg`. (`section-padding-y-lg` →
   `--spacing-section-lg`.)
4. **`grid-columns: 12` → a plain `--grid-columns` var** (no namespace fits a
   single column count; dropping it would lose data). The only non-utility token.
5. **Output grouping:** one new **"Layout Primitives"** `@theme` section so they
   read as a coherent system rather than scattering into the existing
   Spacing/Radius blocks.

## Architecture

A pure renderer-owned module `src/renderers/layout-primitives.ts` exporting
`collectLayoutPrimitives(graph): LayoutPrimitiveEntry[]` (`{cssName, value,
tokenId}`), read straight from the graph nodes. `tokens-css.ts` gains a new
`layout-primitives` `SectionKey` + header and pushes the collected entries into
that section (existing alphabetical sort orders them). `classify-token.ts` is
**untouched** — same rationale as the typography feature (a new `Classification`
kind would ripple to four switch sites). Mirrors the v0.20.0
`typography-composites.ts` pattern.

Trade-off (same as typography): the Inspector live per-token badge still shows
these as `skip: component-layer`; the CLI and the in-app download (same renderer)
include them. Badge parity is a follow-up.

## Scope boundaries / follow-ups

- Only the five families above (`container`, `page`, `grid`, `stack`, `section`)
  — the set v0.17.0 reclassified as `NON_COMPONENT_PREFIXES`.
- No layer change, no `classify-token.ts` change, no scanner change.
- `output/css/tokens.css` is a gitignored build artifact.
- Inspector live-badge parity for these primitives: deferred.
