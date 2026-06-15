# Token Inspector

> Figma → Nuxt UI v4 design-token adapter and inspector.

Drop your Figma W3C DTCG token export into the browser. The tool builds a
single in-memory token graph, surfaces it through a searchable inspector
(alias chains, used-by lookups, issues), and renders out:

- A lean `tokens.css` with a Tailwind v4 `@theme` block plus `.dark` overrides
  for mode-variant semantic tokens, the typography type-scale as composite
  `--text-<role>` utilities (font-size + paired `--line-height` / `--letter-spacing`
  / `--font-weight`), and the layout primitives (`--container-*` / `--spacing-*`
  / `--radius-*`, plus a `--grid-columns` var).
- A minimal Nuxt UI v4 `app.config.ts` with color-role mapping plus component
  recipes for the standard set (`button`, `badge`, `input`, `card`, … — 16
  components): slots, size / color-role / visual variants (`solid` / `outline`
  / `ghost` / `link`) with pseudo-class state prefixes, derived from your Figma
  component tokens. Color utilities resolve to `var(--<semantic-id>)` references
  so dark-mode overrides cascade automatically.
- A `custom-components.ts` with `<name>Recipe` exports for components that have
  no Nuxt UI v4 pendant (e.g. `chip`, `sidebar`), kept out of `ui.*`.

100% client-side. No backend, no upload, nothing leaves the browser tab.

## Philosophy: Tailwind-utility-first

A token becomes a CSS Custom Property only if its resolved value differs
between light and dark mode. Everything else either matches a Tailwind
default (no output) or extends Tailwind's `@theme` as a static value:

| Token shape | What it becomes |
|---|---|
| Mode-variant semantic (light ≠ dark) | `@theme` + `.dark` override |
| Mode-invariant matching Tailwind default | Nothing — use the Tailwind utility |
| Mode-invariant not matching Tailwind default | `@theme` extension |
| Component-layer (button-*, badge-*, …) | `app.config.ts` recipe, not CSS var |
| Type-scale / layout primitive (typography-*, container-*, grid-*, …) | `@theme` utility (`--text-<role>`, `--container-*`, `--spacing-*`, `--radius-*`) |

This keeps `tokens.css` lean (~70% smaller than the legacy output) and
moves component customization to Nuxt UI's recipe layer where it belongs.

**Mode-invariant surface tokens** (e.g. `color/surface/overlay-dark`) are a
recognised pattern: a component rendered on a known background (a dark hero
image, a fixed overlay) must look identical in both light and dark mode. These
tokens fall into the "mode-invariant" rows above — they emit as single-value
`@theme` extensions and are used in recipes **without** a `dark:` variant, so
they stay invariant by construction. Nuxt UI v4 / Tailwind have no first-class
concept for this; the absence of `dark:` is the convention.

**Typography & layout primitives** authored in the `global` source (`typography-heading-1-*`,
`container-*`, `grid-*`, `stack-*`, `section-*`) are component-layer but belong to the theme: they
emit as Tailwind v4 `@theme` utilities. The per-role type scale becomes the canonical composite form
(`--text-heading-1` + `--text-heading-1--line-height` / `--letter-spacing` / `--font-weight`); widths
→ `--container-*` (`max-w-*`), gaps/paddings → `--spacing-*`, radii → `--radius-*`.

**Out of token scope:**

- **`font-family` component tokens** still emit as Tailwind arbitrary classes
  (`font-[Inter]`); primitive `fontFamily` tokens (e.g. `font-family/display`)
  are recognised. A named `--font-display` namespace is future work.
- **Icons** are not design tokens. They live as Figma component instances
  (instance-swap) and as Nuxt UI component props
  (`<UButton icon="i-lucide-rocket" />`); the inspector's `figma-mapping.json`
  only carries a `defaultIcon` for the live preview.

**Standard vs custom components:** the allow-list is the set of *supported
targets* (the 16 Nuxt UI v4 components), not "always emitted" — a component
without tokens is silently skipped. Components whose Figma semantics diverge
from Nuxt UI (e.g. a classic `chip` while Nuxt's `UChip` is an indicator dot;
or a `sidebar` with no Nuxt pendant) emit into a separate
`output/nuxt/custom-components.ts` as `export const <name>Recipe = { slots,
variants }` — kept out of `ui.*` so they don't masquerade as Nuxt UI recipes.

## What gets written

```
output/
├── css/
│   └── tokens.css            # @theme (+ typography & layout primitives) + .dark overrides
└── nuxt/
    ├── app.config.ts         # Nuxt UI v4 color roles + component recipes
    └── custom-components.ts  # <name>Recipe for components with no Nuxt UI pendant
```

## Build

```bash
npm install
npm run build:tokens
```

Inputs are read from `components/*.tokens.json` (Figma W3C DTCG export).

## Integration in a Nuxt project

In your Nuxt project's main stylesheet:

```css
/* assets/css/main.css */
@import "tailwindcss";
@import "./tokens.css";
@import "@nuxt/ui";
```

Drop the generated `app.config.ts` next to your existing one (or merge).
Nuxt UI v4 picks up the color roles and the button recipe automatically.

## Inspector UI

Run the live inspector to explore the loaded token graph:

```bash
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # vue-tsc -b && vite build
npm run preview      # serve the production build locally
npm run test         # vitest (unit + integration)
npm run typecheck    # vue-tsc --noEmit
```

A Husky pre-commit hook runs `typecheck` + `tests` on every commit.

The UI shows:

- **Hierarchical token tree** in the left sidebar — tokens group by
  their Figma path (`button/solid/bg-hover`, `color/blue/500`, …) with
  collapsible nodes and per-group counts. Expansion persists to
  `localStorage`; ancestor groups auto-expand on external selection;
  search forces every group open. Header strip exposes Expand-all /
  Collapse-all and the visible-token count
- **Classification badges** (`tailwind`, `theme`, `mode-var`, `skip`)
  on every leaf, plus filter chips and a summary panel with
  per-classification counts (clickable as quick filters). The badge
  reflects the real emit: typography roles and layout primitives that
  become `@theme` vars show as `theme`, not `skip`

- **Token detail** panel showing alias chains, used-by, and an
  **Output** section that highlights the assigned Tailwind class in a
  primary pill (`tokenId → gap-2`) or a warning pill when no mapping
  exists yet
- **Click a component group** in the tree → the middle pane focuses
  the preview on that component. Every standard component has a bespoke
  live preview (`button`, `input`/`textarea`, `badge`, `switch`,
  `checkbox`, `radio`, `card`, `kbd`, `progress`, `modal`, `dropdown`,
  `accordion`, `nav`, `table`); the remaining custom-recipe components
  (`chip`, `sidebar`) surface an info pill
- **Live button preview** rendering a full **variant × (size, state)
  matrix** per visual variant. Pseudo-class-prefixed classes
  (`hover:`, `active:`, `disabled:`, `focus:`) are promoted to base
  styles per cell so every state is statically visible without
  hovering. A size switcher in the variant header picks which size
  the state cells render at; `leadingIcon`-slot tokens are visualised
  with a Lucide icon. The rendered `tokens.css` is auto-injected into
  the Inspector DOM so `var(--*)` references resolve at runtime
- **Code preview** tabs for both output files with target-path hints,
  line-level highlighting of selected tokens, and substring
  highlighting of the assigned Tailwind class when a
  component-layer token is selected — works both in the right-pane
  rendered output AND in every per-variant code box
- **Copy buttons everywhere** swap their label to "Copied!" with a
  success-coloured border for ~1.5s after a write
- **Dark-mode toggle** flips the entire UI (Tailwind `dark:` variants +
  Nuxt UI components react via a `html.dark` class sync)
- **Token Scan view** — a dedicated scan panel reached via the header
  status strip or the view switcher. Covers:
  - **Issue accordions** grouped by category: broken aliases, type
    mismatches, unresolved references, and
    `asymmetric-variant-coverage` findings with "add `<token-id>` in
    Figma" suggestions per gap
  - **Component-readiness table** showing each component in the
    standard set with its slot coverage count and completeness
    percentage — at a glance you can see which components are fully
    mapped and which are partial
  - **Output forecast** — a summary of how many tokens will emit
    `@theme` CSS vars vs match a Tailwind default (no output) vs
    land in the `app.config.ts` recipe layer
  The recipe output covers the full standard component set:
  `button`, `badge`, `input`, `textarea`, `card`, `modal`, `kbd`,
  `chip`, `checkbox`, `radio`, `switch`, `nav`, `dropdown`, `table`,
  `progress`, `accordion`. Sub-element routing maps each component to
  its real Nuxt UI v4 slots (`card → root`, `dropdown`/`modal →
  content` + `item`/`overlay`, `progress → base`/`indicator`, a
  `checked` fill → `indicator`). A handful of odd-shaped tokens stay
  unmapped by design and are listed in the scan; see `CHANGELOG.md`.
- **Resizable sidebars** — drag the boundaries to resize the panes;
  width persists in `localStorage`

## What it accepts

Drop any combination of these files (drag-and-drop or file picker):

| File | Layer |
|---|---|
| `color.tokens.json` | color |
| `dimension.tokens.json` | dimension |
| `typography.tokens.json` | typography |
| `light.tokens.json` | light theme |
| `dark.tokens.json` | dark theme |
| `global.tokens.json` | global |
| `figma-mapping.json` | optional — Figma component links + default icons |
| `*.zip` | Figma export bundle, auto-extracted |

The naming convention matches Figma's default DTCG export, so the typical
workflow is: export from Figma → drop the whole zip → done.

### Load and commit from Git

Beyond drag-and-drop, the inspector reads and writes Git directly:

- **Load from Git** — paste a public GitHub/GitLab directory URL (e.g.
  `github.com/owner/repo/tree/main/tokens`) and the inspector fetches every `*.tokens.json`
  (+ `figma-mapping.json`) in that folder via the host REST API. Token-less, public repos only.
- **Commit to Git** — once a graph is loaded, the header **Commit…** panel writes the generated
  `tokens.css` + `app.config.ts` back to a target repo in one atomic commit (GitHub Git Data API /
  GitLab Commits API), behind a confirm step. Needs a write token (GitHub fine-grained
  **Contents: Read and write**, or classic `repo` / `public_repo`; GitLab `write_repository`) held
  in `sessionStorage` only. The target repo must already have one commit — the Git Data API can't
  bootstrap an empty repo, so initialise it with a README first.

## Repository layout

```
.
├── components/             # Figma DTCG token exports (color, light, dark, global, …)
├── packages/
│   └── grammar/            # @tg/grammar: slot-mapping, component-vocab, scaffold, typo-detect
├── scripts/
│   ├── build-cli.ts        # Typed CLI: graph → renderers → output/
│   └── extract-tailwind-defaults.mjs  # Re-run after Tailwind upgrades
├── src/
│   ├── classify-token.ts   # Pure classification engine
│   ├── resolve-token.ts    # Alias-chain resolver
│   ├── recipe-engine.ts    # Walks component tokens → Nuxt UI recipes (consumes @tg/grammar)
│   ├── tailwind-defaults.* # Generated lookup tables + public matchers
│   ├── token-graph.ts      # Type contract: TokenNode, TokenGraph, …
│   ├── build-graph.ts      # Source files → TokenGraph (pure builder)
│   ├── renderers/          # tokens-css.ts, typography-composites.ts, layout-primitives.ts, app-config.ts, custom-components.ts
│   └── app/                # Vue 3 SPA (Vite, Nuxt UI v4, Tailwind v4)
└── docs/superpowers/       # Spec + plan documents driving the design
```

## Tests

686 tests across the typed pipeline (`src/` + the `@tg/grammar` package + the Vue app). Run:

```bash
npm test         # full suite
npm run typecheck
```

A Husky pre-commit hook runs typecheck + tests on every commit.

## Stack

- Vue 3 (Composition API, `<script setup>`)
- Nuxt UI v4 — semantic tokens, dark mode, Lucide icons
- Tailwind CSS v4
- Vite 6
- Vitest

## Deployment

Configured for static deployment on Vercel. Any static host works
(GitHub Pages, S3+CloudFront, Cloudflare Pages) since there are no API routes,
no SSR, and no server-side state.

The build version is injected from `package.json` at build time and surfaced
as a badge in the header so the running build is always visible.

## Status

Current release: **v0.27.0**. The adapter is feature-complete against the live
914-token Figma export — every token either maps, emits as a theme var, or is a
documented by-design skip.

What works today:

- **Recipes** for all 16 standard components, routed to their real Nuxt UI v4
  slots (`card → root`, `dropdown`/`modal → content` + `item`/`overlay`,
  `progress → base`/`indicator`, a `checked` fill → `indicator`). Components with
  no Nuxt pendant (`chip`, `sidebar`) emit to `custom-components.ts`.
- **Theme export** beyond colors: the typography type-scale as composite
  `--text-<role>` utilities, and the layout primitives (`--container-*` /
  `--spacing-*` / `--radius-*`).
- **Inspector parity** — the live classification badges, summary, and detail
  match what the renderer actually emits (typography / layout tokens read as
  `theme`, not `skip`).
- **Git round-trip** (load from a public repo, commit output back via a write
  PAT), bespoke live previews for every standard component, and a scan view (issues,
  per-component readiness, output forecast, possible-typo detection).

The per-version detail lives in the Roadmap table below and in `CHANGELOG.md`.
Deferred until the export has tokens that need them: a `compoundVariants` emit
path, `tooltip`/`popover` recipes, and the `data-[state=…]:` prefix form for
Reka-based components.

## Roadmap

| Milestone | Status | What ships |
|---|---|---|
| **v0.1.0** | ✅ released | Initial inspector — drag-and-drop, alias chain, code preview, issues view |
| **v0.2.0** | ✅ released | LiveButton preview pipeline, Figma embeds, version badge |
| **v0.3.0** | ✅ released | Tailwind-utility-first output: classification engine, `tokens.css` (`@theme` + `.dark`), Nuxt UI v4 `button` recipe, dual-emit CLI, classification badges + filter chips + summary panel + per-token Output section, resizable sidebars |
| **v0.4.0** | ✅ released | **Multi-component mapping + Token Scan view.** Scanner (`scanner.ts`: data-quality, classification-hints, completeness, output forecast), `slot-mapping.json` overrides, smart non-suffix recipe assignment; allow-list expanded from `button`-only to the full 15-component standard set; button visual-variant axis (`solid`/`outline`/`ghost`/`link`, color utilities, state→pseudo-class prefixes, dark-mode `var()` cascade, variant×(size,state) preview matrix); permanent `ScanView` (category accordions, component-readiness table, forecast) + `HeaderStatusStrip` + `useScanReport`; `asymmetric-variant-coverage` detector |
| **v0.4.1** | ✅ released | **Preview fidelity + CLI/UI output parity.** Live preview resolves recipe scale/arbitrary classes to inline styles, so heights, padding, and font-family/weight no longer depend on Tailwind's JIT; Inspector preview + download carry the same `// Incomplete in Figma` comments as the CLI; CLI scans all 15 components; scanner orphaned-size-key false positive fixed; input hardening (array-root JSON, figma-mapping, slot-mapping parse) |
| **v0.4.2** | ✅ released | **Scan quality + test infrastructure.** `single-mode-semantic` warning (dark-only / light-only tokens that leak across modes); Vue component-test harness (`@vue/test-utils` + jsdom), `projectToState` extracted and unit-tested |
| **v0.4.3** | ✅ released | **CI, coverage & test safety.** GitHub Actions CI (typecheck + test + build + token CLI), coverage tooling, golden `app.config.ts` snapshot, Tailwind-defaults version pin, `scripts/` type-checking; `DimensionRuler` rem/em→px scaling |
| **v0.5.0** | ✅ released | **`input` recipe + `LiveInput`, cycle-B deviation work, sidebar layer sections.** `input` recipe golden-pinned + bespoke `LiveInput` preview (leading/trailing icons, JIT-safe); `Live` pill in the sidebar; D1 — bare `text` colors classified by value type so aliased tokens emit `var(--…)` again; D2/D2b — `border`→`ring` for ring-framed components (`input`, `textarea`, `checkbox`, `radio`, `kbd`, `dropdown`, `modal`, `card`, `chip`) via `RING_FRAMED_COMPONENTS`; D3 — `validation-color-via-prop` scan warning for dropped `error`/`success` border tokens; sidebar regrouped into collapsible `Components`/`Semantic`/`Primitives` layer sections (`buildLayeredTree`), redundant `Component` filter chip removed |
| **v0.6.0** | ✅ released | **Variant-conditional rings, width semantics, scan rework, capability hints.** Scan-area rework (`ScanView` Issues/Readiness/Forecast tabs + severity filter + per-component grouping); **D2c** — `button` variant-conditional rings (`RING_FRAMED_VARIANTS`) + `border-width`/`ring-width` utility types + `border-on-unframed-variant` hint; **D2e** — `border-width`=resting / `ring-width`=focus, resting ring-width paired to its ring-colour (no stray ring on `solid`/`ghost`/`link`); **prop-driven states** — `input`/`textarea` `active`→`highlight` prop + `state-via-prop` warning; drop fully-transparent colour emissions (`color-opacity.ts`); **Nuxt slot inventory** (`NUXT_SLOTS`) + `unsupported-part` hint (`NON_PART_SEGMENTS` + `FIGMA_NUXT_PART_ALIAS` rename suggestions) |
| **v0.7.0** | ✅ released | **Live previews for the core form controls + sub-element routing + capability-gap.** Live previews for `textarea`/`badge`/`switch`/`checkbox`/`radio` (joining `button`/`input`) — token-driven surfaces + decorative indicators where the grammar doesn't map; `badge` size switch; `button` preview aligned (size switch + header score); **sub-element slot routing** (`dropdown-item`/`table-th`/`nav-item` → their Nuxt slot by exact match, as a fallback after the normal map; `RecipeSlot`→`string`); **`capability-gap`** scan hint (`SLOT_PAIRS`; flags an uncovered Nuxt slot like `trailingIcon`); `checked` projection; `NUXT_SLOTS` += `switch`/`radio` + `dot`→`indicator` alias |
| **v0.8.0** | ✅ released | **Git workflow round-trip — import + export.** **Load from Git** (`git-import.ts`) — fetch `*.tokens.json` (+ `figma-mapping.json`) from a public GitHub/GitLab repo directory URL (token-less REST listing → raw → `loadSources`), alongside drag-and-drop; **Commit to Git** (`git-export.ts`) — write the generated `tokens.css` + `app.config.ts` back to a repo in one atomic commit (GitHub Git Data API / GitLab Commits API) behind a header `Commit…` panel + confirm step, write PAT held in `sessionStorage` only; empty-repo commits surface a clear "initialise first" error |
| **v0.9.0** | ✅ released | **`size` grammar + icon mirror + leaner App shell.** Bare `size` utility (`size-[…]` emit; token-driven `checkbox`/`radio` box + `switch` thumb sizing, thumb colour promoted to background; real-export nulls 79 → 74); **`SLOT_MIRROR`** — `leadingIcon` classes mirror to `trailingIcon` in recipes AND the scanner's filled-slot accounting (capability-gap misreport gone, own trailing tokens win); `App.vue` 1047 → 905 (`CommitPanel`/`GitLoader` extracted + component tests + an app-gate smoke test through the real `handleFiles` path); pressed states + `aria-pressed`/`aria-expanded` for the scan-view switch and the `Commit…` toggle |
| **v0.10.0** | ✅ released | **Custom-component divergence flag + leaner sidebar + push-aware badge + grammar workspace.** `component-looks-custom` scan flag (compares each component's emitted parts against the Nuxt slot inventory minus `NON_PART_SEGMENTS` / `FIGMA_NUXT_PART_ALIAS`; discriminator is the share of *foreign* parts, not unmapped tokens, so adapter-incompleteness no longer reads as custom — fires for `chip` only on the real export); `Live {n}` sidebar filter chip (narrows the component tree to those with an interactive preview); push-state version badge (emerald when `main` ⇄ `origin/main` in sync, amber when unpushed, via build-time `__APP_UNPUSHED__`); grammar (vocabulary + ~450-line slot-mapping engine) extracted from `src/` into the `@tg/grammar` workspace package (byte-identical refactor) |
| **v0.11.0** | ✅ released | **Stage C — `custom/<name>` full-anatomy emit.** Components flagged `component-looks-custom` are routed OUT of `ui.<name>` (a pointer comment replaces the block) and INTO `output/nuxt/custom-components.ts` as `export const <name>Recipe = {slots,variants} as const`; `chip` now emits its full anatomy (base + `label` + `close` slots, `error`/`success` colour variants) instead of a misleading 1-slot `ui.chip`. Mechanism: grammar `extraSlots` routes foreign sub-elements, `normalizeTrailingColorRole` reconstructs trailing colour-role variants, `buildCustomRecipes` delegates assembly to the component-recipe builder via per-token `slotMappingOverride`; conditional web Output tab |
| **v0.12.0** | ✅ released | **Overlay-surface recipes.** `overlay-light` / `overlay-dark` component tokens (a component's look on a dark/light scrim — orthogonal to page dark-mode, both exist at once, no Nuxt `surface` prop) emit as sparse `<comp>Overlay{Dark,Light}Recipe` deltas in `custom-components.ts` (`button` / `badge`; `nav` deferred); identical-to-base overlay tokens dropped; `overlay` added to `NON_PART_SEGMENTS` so the divergence flag stops false-flagging `button` / `badge` |
| **v0.13.0** | ✅ released | **Typo / "did-you-mean" detector.** A graph-wide `possible-typo` data-quality pass (`detectPossibleTypos` in `data-quality.ts`) flags a token-id segment within one Damerau-Levenshtein edit of a value-bearing vocabulary word and emits the reconstructed correction ("did you mean `…line-height`?"); a frequency guard (a segment on ≥ 3 tokens is treated as intentional vocabulary) plus a curated `NON_TYPO_WORDS` skip-set are the keystones against false positives — 2 true / 0 false positives on the real fixture (`spaching`→`spacing`, `heigth`→`height`) |
| **v0.14.0** | ✅ released | **Variant-after-sub-element mapping + `nav` overlay recipes (Bucket B).** `parseSegments` now detects a Nuxt variant / colour-role sitting *after* a recognised sub-element slot (`nav-item-ghost-bg` → `item` slot + `ghost` variant), fallback-path-only (guarded by `slotPrefix !== null`) so every variant-at-2nd-segment token is unchanged — ~35 previously-NULL `nav` tokens now map; `stripOverlayPrefix` gains an overlay-after-sub-element case so `buildOverlayRecipes` emits `navOverlay{Dark,Light}` (the `nav` gap deferred in v0.12.0); plus a `setupFiles` polyfill restoring jsdom `localStorage` under Node 26 |
| **v0.15.0** | ✅ released | **Trailing colour-roles on the general path (Bucket C).** `checkbox` / `radio` / `switch` / `input` / `textarea` tokens whose Nuxt colour-role is named last (`checkbox-bg-error`, `switch-thumb-color-success`, `checkbox-bg-checked-error`) now emit `variants.color.{error,success}` — `normalizeTrailingColorRole` promoted from the custom path into `@tg/grammar` and applied once at the `heuristicSlotMapping` entry, so renderer / scanner / custom path classify identically (with a `STATE_KEYS` guard so a trailing `default` stays a state, not a colour-role). 26 previously-NULL tokens map (`border→ring` for ring-framed, trailing `-checked-` preserved); the now-unreachable `validation-color-via-prop` scanner rule is removed. `radio-dot-color-*` deferred (needs the `dot→indicator` alias). |
| **v0.16.0** | ✅ released | **Accordion as a Nuxt-native component (Bucket D).** `accordion` added to `NUXT_SLOTS` (the Nuxt UI v4 Accordion theme slots — root / item / header / trigger / content / body / leadingIcon / trailingIcon / label) and to `COMPONENT_ALLOW_LIST` — two purely-additive vocabulary entries, no logic change. The existing sub-element routing then maps the new export's 18 `accordion-item-*` tokens to `ui.accordion.slots.item` (14 map; 4 stragglers — `border-focus-ring` / `focus-offset` / `ring-radius` / `text-opened` — deferred). `accordion` is not flagged `component-looks-custom` (its `item` is a real Nuxt slot). `sidebar` deferred (no Nuxt UI v4 recipe → custom emit). |
| **v0.17.0** | ✅ released | **Reclassify layout / typography primitives (Bucket E).** `typography` / `container` / `page` / `grid` / `stack` / `section` tokens are authored in the `global` source, so `buildGraph` classified them as component-layer and they read as "unmapped". A new `NON_COMPONENT_PREFIXES` set (`@tg/grammar`) lets the scan forecast split the not-in-allow-list prefixes into `nonComponentPrefixes` (the 6 layout / type-scale primitives) and `unmappedComponentPrefixes` (genuine unsupported components, e.g. `sidebar`); `ScanView` labels them honestly ("theme/CSS, not `ui.*` recipes"). Suppress-the-noise scope: no layer change, no CSS-var emit (deferred to the fonts pipeline), no grammar mapping change. |
| **v0.18.0** | ✅ released | **Sidebar as a known-custom component (Bucket D, part 2).** Nuxt UI v4 has no sidebar, so `sidebar` emits a *custom* recipe. A new `KNOWN_CUSTOM_COMPONENTS` registry (`@tg/grammar`, `sidebar → ["item"]`) is seeded into `customPartsByComponent` — the single seam both the CLI and the web derive `customParts` from — so `customComponentsRenderer` emits `export const sidebarRecipe` with `base` (bg / border / padding / width) and `item` (bg / text with `active:` / `hover:`, icon-size / padding / radius) slots (13/16 tokens; `sidebar-section-label-*` ×2 and `sidebar-width-collapsed` deferred). It bypasses the `component-looks-custom` flag, keeping `NUXT_SLOTS` / `COMPONENT_ALLOW_LIST` Nuxt-only; token-less projects emit no empty recipe. **Completes all five new-export mapping buckets (A–E).** |
| **v0.19.0** | ✅ released | **Honour part aliases in slot routing.** `parseSegments`' `slotPrefix` seam now consults the curated `FIGMA_NUXT_PART_ALIAS` map (`{ row→tr, divider→separator, check→icon, dot→indicator }`) — exact slot match first, then alias — so a Figma part name routes to its Nuxt slot. Unblocks the 5 `radio-dot-*` tokens (→ the `indicator` slot; incl. the Bucket C stragglers `radio-dot-color-{error,success}`). The scanner's `unsupported-part` "rename X→Y" hint now skips aliased-routable parts (the grammar handles them), retiring the now-moot `up-table-row` / `up-table-divider` rename nags. (`table-row-*` mid-token state and `table-divider` missing-utility stay NULL — separate shape issues.) |
| **v0.20.0** | ✅ released | **Typography theme export.** The per-role type scale (`typography-heading-1-*`, `typography-heading-2-*`) is authored in the `global` source → component layer, so `classifyToken` skipped it. A renderer-owned pre-pass (`typography-composites.ts`) re-surfaces the roles that define a font-size as the Tailwind v4 canonical composite form — `--text-<role>` plus `--text-<role>--line-height` / `--letter-spacing` / `--font-weight` companions (→ a `text-<role>` utility). `sectionFor` now also routes the primitive `--letter-spacing-*` / `--line-height-*` under "Non-default Typography" (was leaking into Primitive Colors). The source typo `line-heigth` is normalized in the composite output (scanner warning retained); unitless line-heights get a `px` length. `body` / `label` (color-only / no font-size) stay out of scope. |
| **v0.21.0** | ✅ released | **Layout-primitive theme export.** The `container` / `page` / `grid` / `stack` / `section` primitives (24 tokens, authored in the `global` source → component layer → skipped by `classifyToken`) emit as Tailwind v4 `@theme` utilities via a renderer-owned pre-pass (`layout-primitives.ts`): widths→`--container-*` (`max-w-*`), gaps/paddings→`--spacing-*` (`p-`/`px-`/`py-`/`gap-*`), radii→`--radius-*` (`rounded-*`), `grid-columns` as a plain var. Container & page widths dedupe into one `--container-*` scale (identical values; divergence-guarded); spacing keys drop the axis (`section-padding-y-lg`→`--spacing-section-lg`). New "Layout Primitives" `@theme` section; verified against the live export (21 entries). Completes the v0.17.0-deferred Bucket E CSS-var emit. |
| **v0.22.0** | ✅ released | **Component recipes for `card` / `dropdown` / `modal`.** A per-component default base slot (`@tg/grammar` `COMPONENT_BASE_SLOT`: `card → root`, `dropdown`/`modal → content`) so bare tokens route to the correct Nuxt UI v4 slot instead of the hard-coded `base` — correcting the (already allow-listed) emit. `card`/`modal` added to `NUXT_SLOTS`. A guard lets an `overlay` slot win over the `overlay-bg` utility so `modal-overlay-bg` lands on `slots.overlay` (no more bg collision on content). Verified against the live export: card→`root`, dropdown→`content`+`item`, modal→`content`+`overlay`. Deferred: `dropdown-item-hover-bg` (mid-token dup), `dropdown-item-text-muted`. |
| **v0.23.0** | ✅ released | **Inspector badge parity.** Typography-role and layout-primitive tokens emit `@theme` vars (v0.20.0/v0.21.0) but were authored in the `global` source → component layer, so the Inspector classified them `skip` (wrong row badge, wrong summary count, false "no mapping" warning). `useClassifications` now overrides them to the existing `theme-static` kind via the renderer pre-passes (`buildInspectorClassifications`), so badge / summary / filter / detail all match the real emit. One seam; no new `ClassificationKind`, no `classify-token.ts`/renderer change, CLI untouched. Recipe tokens + deduped page-widths correctly stay `skip`. |
| **v0.24.0** | ✅ released | **Progress component recipe.** `progress-fill-bg` / `progress-track-bg` were NULL; `progress` registered in `NUXT_SLOTS` + `FIGMA_NUXT_PART_ALIAS` gains `fill → indicator`, `track → base` so they route to `slots.indicator` (fill bar) / `slots.base` (rail). 6/6 tokens mapped; verified against the live export. `tooltip`/`popover` have no tokens (not registered); `kbd` already emits correctly. Purely additive grammar vocab. |
| **v0.25.0** | ✅ released | **Checked×color fills → `indicator` slot.** The `checkbox`/`radio` `*-bg-checked-{error,success}` tokens emitted `variants.color.<role>.base: checked:bg-[…]` (a `checked:` prefix Nuxt UI v4's Reka checkbox/radio don't use); a `matchParsed` rule now routes a `checked` bg-color fill to `variants.color.<role>.indicator` (prefix dropped) for components with an `indicator` slot. Switch unchanged (no indicator slot — Nuxt keeps its checked fill on `base`). `LiveCheckbox`/`LiveRadio` previews read the indicator fill. Verified against the live export. |
| **v0.26.0** | ✅ released | **Live previews for `card` / `kbd` / `progress`.** A shared `usePreviewRecipe` composable (recipe build + representative `sizeClasses`) dedups the `checkbox`/`radio` previews; `LiveCard` (root box), `LiveKbd` (keycap), and `LiveProgress` (track + `indicator` fill + size→height) render their recipes as inline styles (JIT-safe) in both preview panes. `switch` left on its size-switcher logic (Badge/Button archetype). Tier-2 (`modal`/`dropdown`/`accordion`/`nav`/`table`) + Tier-3 (`chip`/`sidebar`) previews deferred. |
| **v0.27.0** | ✅ released | **Live previews for `modal` / `dropdown` / `accordion` / `nav` / `table`** (Tier-2, multi-element). `LiveModal` (content on overlay), `LiveDropdown` (content + resting/hover/active item rows), `LiveAccordion` (resting + disabled rows), `LiveNav` (one row per variant — colours live in `variants.variant.*.item`), `LiveTable` (`base` wrapper + `th`/`td`). All reuse `usePreviewRecipe` + `extractArbitrary(projectToState(...))` → inline styles, wired into both preview chains. Representative fidelity. |
| **Next** | 🔭 planned | Tier-3 custom-recipe previews (`chip`, `sidebar` — rendered from `custom-components.ts`); data-state prefix form (`data-[state=checked]:`) for Reka components; `tooltip`/`popover` recipes + `compoundVariants` emit path once the export has tokens that need them || **Backlog** | 🧊 | Hue-proximity color-role derivation (currently a fixed mapping); `App.vue` mount-test coverage; Playwright E2E in CI (unit CI already shipped in v0.4.3); dependency-major upgrades (vitest 3 — removes the dual-vite cast — vite, TypeScript); `@tailwindcss/browser` runtime compiler for richer previews; more library-suggestion detectors (companion-token gaps, naming drift); grouping of un-prefixed component-collection tokens (e.g. `components/sidebar`) |

Design contract and detailed plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.
A snapshot project analysis (architecture, verified findings, prioritised recommendations)
that informs the backlog lives in [`docs/PROJECT-ANALYSIS.md`](docs/PROJECT-ANALYSIS.md).

## Token source

Tokens come from the **[`figma-token-export`](https://github.com/clawdbot3535/token-export)**
Figma plugin (separate repo): it reads local Figma variables via the free Plugin API (no
Enterprise) and commits the W3C-DTCG `*.tokens.json` files to a GitHub repo, versioned. The
inspector ingests those files (drag-drop / zip, or directly from a public GitHub/GitLab repo URL —
see "Load and commit from Git" above). This
replaces the abandoned Figma REST API + Personal Access Token approach, which is Enterprise-gated.

## License

Private project. See `package.json`.
