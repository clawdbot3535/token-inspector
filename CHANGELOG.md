# Changelog

## [0.3.0] — 2026-05-21

The Tailwind-utility-first refactor. Two-PR effort spanning the
classification engine, new renderers, and the Nuxt UI v4 recipe emission.

### Added

- **Classification engine** (`src/classify-token.ts`): pure function
  classifying every token as `skip`, `tailwind-default`, `theme-static`,
  or `theme-mode-variant`.
- **Tailwind v4 defaults lookup** (`src/tailwind-defaults.generated.ts` +
  `src/tailwind-defaults.ts`): committed mapping value → utility-suffix
  per category (spacing, radius, font-size, font-weight, tracking,
  leading, border-width).
- **`src/resolve-token.ts`**: cycle-safe alias-chain resolver.
- **`src/slot-mapping.ts`**: heuristic mapping from Figma token-id
  segments to Nuxt UI v4 slot/variant paths, with optional override
  argument.
- **`src/recipe-engine.ts`**: walks component-layer tokens, applies
  slot-mapping, classifies values, assembles Nuxt UI v4
  `{ slots, variants }` recipes. Allow-list: `['button']`.
- **New CSS renderer** (`src/renderers/tokens-css.ts`) emitting `@theme`
  + `.dark` blocks scoped to mode-variant tokens.
- **Updated `src/renderers/app-config.ts`** emitting full Nuxt UI v4
  `defineAppConfig` with color roles + button recipe.
- **Typed CLI** (`scripts/build-cli.ts`, runs via `tsx`) writing to
  `output/css/` and `output/nuxt/`.
- **Inspector UI**: classification badges per token, filter chips,
  summary panel, per-token Output section showing resolved Tailwind
  classes for component-layer tokens, LiveButton preview rendering
  real `<button>` elements with the recipe's class strings shown
  adjacent for copy-paste.
- **Resizable sidebars**: drag the boundaries between left, main, and
  right panes; widths persist in `localStorage`.

### Changed

- `tokens.css` output ~70% smaller than the v0.2.0 legacy format because
  Tailwind-default-matching tokens drop out entirely.
- `app.config.ts` now emits a usable Nuxt UI v4 starting point instead
  of a verbose stub.

### Removed

- Legacy `build-tokens.mjs` CLI.
- Legacy `src/renderers/css.ts` and `src/renderers/ts.ts`.
- Legacy `output/tokens.css`, `output/tokens.ts`,
  `output/nuxt-ui.app.config.ts` (the typed CLI writes to
  `output/css/` and `output/nuxt/` only).
- `src/smoke.test.ts` and `src/diff.test.ts` baselines (replaced by
  per-module unit + snapshot tests).

### Migration from v0.2.0

For consumers of the legacy output:

- Replace any `@import "./tokens.css"` references to point at the new
  location: copy `output/css/tokens.css` to your Nuxt project's
  `assets/css/` and update the import path.
- Remove imports of `tokens.ts` — the TS-export artifact is no longer
  emitted. Use Tailwind utility classes generated from `@theme` directly.
- Replace `nuxt-ui.app.config.ts` with the new `output/nuxt/app.config.ts`
  (or merge if you have customizations).

## [0.2.0] — 2026-05-14

Initial LiveButton preview pipeline, Figma embed integration, version
badge in header. See git log for details.

## [0.1.0] — 2026-05-13

Initial Token Inspector — drag-and-drop Figma DTCG export, alias chain
visualization, code preview, issues view.
