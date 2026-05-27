# Changelog

## [Unreleased]

Button visual-variant axis end-to-end + scanner library-suggestions +
preview state matrix + designer-round-2 inspector UI polish. Shipped on
`main` ahead of the next tagged release.

### Added

- **Hierarchical component tree** in the left sidebar
  (`src/app/token-tree.ts` + `ComponentTree.vue`). Tokens group by their
  Figma path (`button/solid/bg-hover`, `color/blue/500`, …) with
  collapsible nodes and per-group descendant counts. Expansion state
  persists to `localStorage`; ancestor groups auto-expand when a token
  is selected from outside the tree (issues view, used-by, deep link);
  an active search forces every group open without polluting the
  persistent state. Header strip exposes Expand-all / Collapse-all
  and the current visible-token count.
- **Component-aware middle pane**: clicking a tree group sets the
  `selectedComponent` and renders a `LiveButton` preview for that
  component, even when no token is selected. Click `button` to preview
  button; non-button components show a polite "preview only available
  for button currently" hint until its own live preview lands (v0.5.0+).
- **State-axis size switcher** above the state-axis row: pick which
  size the state cells render at. Hoisted into the variant-header row
  so the two axis columns stay symmetric.
- **Variant × (size, state) preview matrix** per visual variant. The
  size row varies sm/md/lg at the default state; the state row holds
  the chosen size and varies default/hover/active/disabled/focus.
  `projectToState` promotes pseudo-class-prefixed classes
  (`hover:bg-[var(...)]` etc.) to base classes for static per-state
  rendering; disabled cells get the standard `opacity: 0.6` +
  `cursor: not-allowed` UX affordance.
- **Leading-icon rendering** in `LiveButton`: when the recipe declares
  a `leadingIcon` slot, every preview cell includes a Lucide icon.
  Icon name comes from `figma-mapping.json` `defaultIcon` when present,
  otherwise falls back to a generic placeholder. Trailing-icon support
  is deliberately out of scope here — in the current Figma setup the
  trailing-icon configuration lives on component variants (iconOnly /
  noIcon / both) rather than on tokens, so a complete treatment waits
  deferred to v0.5.0+ component previews.
- **Button labels** (`Button`, `Badge`, …) inside the preview cells
  instead of repeating the size identifier. The size / state label
  moves below the button.
- **Highlighted assigned Tailwind class** in `OutputSection`. The
  skip-branch now shows the resolved utility in a primary-coloured
  pill with a `tokenId → class` arrow layout instead of burying it in
  a small code box. The no-mapping case gets a parallel warning-tinted
  pill (orange ring, ⚠) with a hint to add a `slot-mapping.json`
  override.
- **Copy-to-clipboard composable** (`useCopyToClipboard`): shared
  `{copy, wasJustCopied}` with ~1.5s reactive success feedback. Every
  copy button across `OutputSection` and `LiveButton` swaps its label
  to "Copied!" and shows a success-coloured border for that window.
- **Code-preview highlighting on skip-token click**: clicking a
  component-layer token highlights the resolved Tailwind utility
  inside every variant's code block (middle pane) AND in the
  right-pane `CodePreview` (dashed primary ring), and auto-switches
  the outputTab to `app.config.ts`. Whole-token match
  (split-on-whitespace + `===`) so `gap-2` doesn't false-positive
  inside `gap-20`.
- **Dark mode toggle now actually flips the UI**: a watch on
  `state.theme` syncs `document.documentElement.classList` so
  Tailwind `dark:` variants and Nuxt UI components react. Before the
  toggle only affected which value `resolveCss` returned for the
  *displayed* tokens.
- **Visual variant axis** in slot-mapping: `solid` / `outline` / `ghost`
  / `link` (plus `subtle` / `soft`) recognised at the 2nd id segment,
  with state suffixes (`hover` / `active` / `disabled` / `focus`)
  folded into Tailwind pseudo-class prefixes when a variant is present.
- **Color utility types**: `bg-color`, `text-color`, `border-color`,
  `ring-color`, `underline-color`. Recipe engine short-circuits the
  shadow-node Tailwind-default matching for these and emits arbitrary
  values directly.
- **Semantic `var()` references** for color utilities: the recipe
  engine walks one alias step to the first non-component ancestor and
  emits `bg-[var(--color-action-bg)]` instead of baked hex. Dark-mode
  overrides in `tokens.css` apply automatically; fallback to literal
  hex when no alias exists.
- **`variants.variant`** axis in `ComponentRecipe` + `app-config`
  renderer. Generated `app.config.ts` now emits `variants.variant.{solid,
  outline, ghost, link}` blocks per component.
- **`asymmetric-variant-coverage` scanner detector**
  (`src/scanner.ts`): runs on every component in the graph (not
  scoped to the allow-list). Discriminates variants from utility
  namespaces via `KNOWN_VARIANT_NAMES` and trailing-position state
  detection so `chip.bg-error` (state) and `badge.error.bg`
  (variant) are not conflated. Findings carry concrete
  "add `<token-id>` in Figma" suggestions and are severity-tiered
  (hint when 1 sibling has it, warning when 2+ do).
- **Build-CLI scan summary**: `scripts/build-cli.ts` prints a grouped
  `errors / warnings / hints (first 10)` digest after writing
  outputs. Exit code is non-zero only when errors exist so CI stays
  green on design-quality findings.
- **LiveButton variant × state matrix**: per visual variant the
  preview now renders a sizes row (sm/md/lg) AND a states row
  (default/hover/active/disabled/focus). `projectToState` promotes
  pseudo-class-prefixed classes to base for static per-state
  rendering. `disabled` cells get standard `opacity: 0.6` +
  `cursor: not-allowed` UI affordances.
- **`extractArbitrary`** helper in LiveButton: translates dynamic
  arbitrary-value classes (`px-[10px]`, `bg-[var(--x)]`) to inline
  CSS because Tailwind v4 JIT only sees static class strings. Maps
  border-color → adds 1px solid default; text-decoration-color →
  adds underline default.
- **`useInjectedTokensCss` composable**
  (`src/app/composables/use-injected-tokens-css.ts`): mounts the
  rendered `tokens.css` into `<head>` so `var(--*)` references in
  the live preview resolve at runtime. Substitutes `@theme {` for
  `:root {` in the injected copy because `@theme` is a Tailwind
  build-time directive that browsers ignore.

### Changed

- `slot-mapping.ts` `parseSegments` now returns `{component, variant,
  utility, size, state}` instead of `{component, utility, variant}`.
  `SlotMappingEntry` gains an optional `statePrefix` field.
- `VariantAxis` type adds `"variant"`. `UtilityType` adds the five
  color types.
- `scanner.ts` data-quality checks skip non-size axis tokens to avoid
  size-completeness false positives on variant tokens.
- `app.config.ts` renderer iterates `["size", "color", "variant",
  "state"]` axes (added `"variant"`).

### Fixed

- Live preview was emitting baked-in hex values that failed
  Tailwind v4 JIT (classes like `px-[10px]` never made it into the
  bundle because they only exist as runtime strings).
- Live preview was emitting `var(--*)` references that resolved to
  nothing because the rendered `tokens.css` was never mounted into
  the Inspector document.

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
