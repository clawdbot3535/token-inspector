# Typography Theme Export — Design Spec

**Date:** 2026-06-14
**Status:** Approved
**Feature branch:** `feat/typography-theme`

## Problem

The design system authors a per-role type scale (`typography-heading-1-*`,
`typography-heading-2-*`, `typography-body-*`, `typography-label-*`) in
`components/global.tokens.json`. Two defects keep these — and adjacent
primitives — out of (or misplaced in) the generated `output/css/tokens.css`:

1. **Roles never emit.** The `global` source maps to the **component** layer
   (`build-graph.ts` `layerFor`), and `classify-token.ts` unconditionally
   skips component-layer tokens (line 72). So the 11 `typography-*` role
   tokens never reach the CSS output.
2. **Primitives misrouted.** The primitive `--letter-spacing-*` and
   `--line-height-*` tokens *do* emit, but `sectionFor` only recognises the
   `--tracking-`/`--leading-` prefixes, so they fall through to the
   **Primitive Colors** section instead of **Non-default Typography**.

## Goal

Emit the typography **type-scale roles** as Tailwind v4 canonical composite
custom properties, and fix the primitive misrouting — all in
`output/css/tokens.css` and the in-app download (same renderer).

## Approved decisions

1. **Output form: composite + modifiers** (Tailwind v4 canonical). Verified
   against the Tailwind v4 docs (`font-size.mdx`, `theme.mdx`): a role's
   font-size becomes `--text-<role>` and the rest become
   `--text-<role>--line-height` / `--letter-spacing` / `--font-weight`
   companions. Tailwind then generates a `text-<role>` utility that sets all
   four at once. The flat form was rejected — it is not a Tailwind concept and
   produces inert variables.

   ```css
   @theme {
     --text-heading-1: 72px;
     --text-heading-1--line-height: 64px;
     --text-heading-1--letter-spacing: -0.4000000059604645px;
     --text-heading-1--font-weight: 500;
   }
   /* enables: class="text-heading-1" */
   ```

2. **Fold in the misrouting fix.** Extend `sectionFor` so `--letter-spacing-*`
   and `--line-height-*` land under **Non-default Typography**.

3. **Normalize the source typo, keep the warning.** The source has
   `typography-heading-2-line-heigth` (misspelled). The composite step treats
   `line-heigth` as `line-height` so heading-2 still gets its modifier with the
   correct CSS name, **but** the scanner's possible-typo detector is untouched,
   so the source repo is still flagged. (`build-graph.ts` `NAME_FIXES` does NOT
   catch this id — its regexes are anchored/slash-bound — so the typo really
   does reach the renderer and must be normalized there.)

## Scope boundaries

- **Only roles with a font-size become composites** — that is `heading-1` and
  `heading-2`. A Tailwind type scale needs a base font-size.
- **`body` and `label` are out of scope.** `typography-body-color` and
  `typography-label-color` are colors (Tailwind's `--text-*--*` modifiers do
  not include color), and `typography-label-letter-spacing` has no font-size to
  attach to. They remain component-layer/skipped — no behavior change.
- **Line-height gets a `px` length.** `inferUnit` strips the unit from
  `-line-height` *suffix* tokens (`NO_UNIT` `/-line-height$/`), so role
  line-heights arrive unitless (`"64"`, `"40"`). A unitless
  `--text-*--line-height` is a multiplier in CSS, so the composite step appends
  `px` to bare numerics. Font-size (`-size$`) and letter-spacing (`-spacing$`)
  already carry `px` and pass through unchanged.

## Architecture

A **renderer-owned pre-pass** (`src/renderers/typography-composites.ts`) reads
role tokens directly from the graph and returns composite `{cssName, value,
tokenId}` entries. `tokens-css.ts` pushes them into the `non-default-font`
section, where the existing alphabetical sort keeps each `--text-<role>` base
adjacent to its `--text-<role>--*` modifiers.

`classify-token.ts` is **not** changed. Adding a new `Classification` kind would
ripple to four switch sites (`tokens-css.ts`, `app/classifications.ts`,
`recipe-engine.ts`, `scanner.ts`) plus the union — disproportionate for this
feature. Trade-off: the Inspector's live per-token badge still shows these roles
as `skip: component-layer`, while the CSS output now contains them. The CLI and
the in-app download stay consistent (same renderer). Reconciling the Inspector
badge is a documented follow-up.

## Out of scope / follow-ups

- Inspector live-view badge parity for the composite roles.
- `body`/`label` color tokens as semantic text colors.
- Layout primitives (container/page/grid/stack/section).
- Rounding the verbose `-0.4000000059604645px` letter-spacing values (the
  existing primitives are emitted unrounded too — staying consistent).
