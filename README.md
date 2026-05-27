# Token Inspector

> Figma → Nuxt UI v4 design-token adapter and inspector.

Drop your Figma W3C DTCG token export into the browser. The tool builds a
single in-memory token graph, surfaces it through a searchable inspector
(alias chains, used-by lookups, issues), and renders out:

- A lean `tokens.css` with a Tailwind v4 `@theme` block plus `.dark` overrides
  for mode-variant semantic tokens.
- A minimal Nuxt UI v4 `app.config.ts` with color-role mapping plus a
  `button` component recipe (slots, size variants, and visual variants
  `solid` / `outline` / `ghost` / `link` with pseudo-class state prefixes)
  derived from your Figma component tokens. Color utilities resolve to
  `var(--<semantic-id>)` references so dark-mode overrides cascade
  automatically.

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

This keeps `tokens.css` lean (~70% smaller than the legacy output) and
moves component customization to Nuxt UI's recipe layer where it belongs.

## What gets written

```
output/
├── css/
│   └── tokens.css        # @theme + .dark overrides
└── nuxt/
    └── app.config.ts     # Nuxt UI v4 color roles + button recipe
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
  per-classification counts (clickable as quick filters)
- **Token detail** panel showing alias chains, used-by, and an
  **Output** section that highlights the assigned Tailwind class in a
  primary pill (`tokenId → gap-2`) or a warning pill when no mapping
  exists yet
- **Click a component group** in the tree → the middle pane focuses
  the preview on that component. Today only `button` has a rendered
  preview; other components surface an info pill until their own live
  preview lands (`LiveBadge`/`LiveInput`/…, v0.5.0+)
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
  The recipe output now covers the full standard component set:
  `button`, `badge`, `input`, `textarea`, `card`, `modal`, `kbd`,
  `chip`, `checkbox`, `radio`, `switch`, `nav`, `dropdown`, `table`,
  `progress`. Sub-element-heavy components (`nav`, `dropdown`,
  `table`, `progress`, and the form-control internals) are partially
  mapped today; complete slot coverage is planned for v0.5.0+.
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

## Repository layout

```
.
├── components/             # Figma DTCG token exports (color, light, dark, global, …)
├── scripts/
│   ├── build-cli.ts        # Typed CLI: graph → renderers → output/
│   └── extract-tailwind-defaults.mjs  # Re-run after Tailwind upgrades
├── src/
│   ├── classify-token.ts   # Pure classification engine
│   ├── resolve-token.ts    # Alias-chain resolver
│   ├── slot-mapping.ts     # Figma token → Nuxt UI slot/variant heuristic
│   ├── recipe-engine.ts    # Walks component tokens → Nuxt UI recipes
│   ├── tailwind-defaults.* # Generated lookup tables + public matchers
│   ├── token-graph.ts      # Type contract: TokenNode, TokenGraph, …
│   ├── build-graph.ts      # Source files → TokenGraph (pure builder)
│   ├── renderers/          # tokens-css.ts, app-config.ts, line-builder.ts
│   └── app/                # Vue 3 SPA (Vite, Nuxt UI v4, Tailwind v4)
└── docs/superpowers/       # Spec + plan documents driving the design
```

## Tests

233 tests across the typed pipeline. Run:

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

v0.4.0 expands the Nuxt UI v4 recipe output to the full 15-component
standard set (`button`, `badge`, `input`, `textarea`, `card`, `modal`,
`kbd`, `chip`, `checkbox`, `radio`, `switch`, `nav`, `dropdown`,
`table`, `progress`) and ships the Token Scan view with a
component-readiness table and output forecast. Sub-element-heavy
components are partially mapped; full slot coverage and per-component
live previews (`LiveBadge` / `LiveInput` / …) are planned for v0.5.0+.
See `CHANGELOG.md` for the full entry.

## Roadmap

| Milestone | Status | What ships |
|---|---|---|
| **v0.1.0** | ✅ released | Initial inspector — drag-and-drop, alias chain, code preview, issues view |
| **v0.2.0** | ✅ released | LiveButton preview pipeline, Figma embeds, version badge |
| **v0.3.0** | ✅ released | Tailwind-utility-first output: classification engine, `tokens.css` (`@theme` + `.dark`), Nuxt UI v4 `button` recipe, dual-emit CLI, classification badges + filter chips + summary panel + per-token Output section, resizable sidebars |
| **on `main`, unreleased → v0.4.0** | ✅ done | Scanner foundations (`scanner.ts`: data-quality + classification-hints + completeness + output forecast, `slot-mapping.json` override, smart non-suffix recipe assignment, app-config completeness comments); button visual-variant axis (`solid`/`outline`/`ghost`/`link`, color utilities, state→pseudo-class prefixes, dark-mode `var()` cascade, variant×(size,state) preview matrix); `asymmetric-variant-coverage` detector + grouped CLI scan summary; designer-round-2 Inspector UI polish (hierarchical token tree, component-aware preview, Tailwind-class pills, copy-to-clipboard, dark-mode toggle) |
| **v0.4.0** | 📋 next | **Scan View** (`ScanView.vue` — category accordions, component-readiness table, output forecast), permanent `HeaderStatusStrip`, `useScanReport`, LiveButton `n/m` completeness badge, `IssuesView` absorbed into ScanView; **first `badge` component recipe** (recipe output — proves the slot-mapping generalizes beyond `button`); tagged v0.4.0 release |
| **v0.5.0+** | 🔭 planned | **Component recipes, one per release** — `input`, `card`, `dropdown`, `modal`, … recipe output first (the engine is component-agnostic; the tokens already exist in Figma), bespoke live previews (`LiveBadge`/`LiveInput`/…) following incrementally |
| **Inspector read-side** | 🔭 planned | **"Load from URL"** — fetch the committed `*.tokens.json` from a raw GitHub URL instead of the manual drag (the read side of the git workflow; own brainstorm round) |
| **Backlog** | 🧊 | Hue-proximity color-role derivation, `@tailwindcss/browser` runtime compiler for richer previews, Playwright CI, more library-suggestion detectors (companion-token gaps, naming drift), grouping of un-prefixed component-collection tokens (e.g. `components/sidebar`) |

Design contract and detailed plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Token source

Tokens come from the **[`figma-token-export`](https://github.com/clawdbot3535/token-export)**
Figma plugin (separate repo): it reads local Figma variables via the free Plugin API (no
Enterprise) and commits the W3C-DTCG `*.tokens.json` files to a GitHub repo, versioned. The
inspector ingests those files (drag-drop / zip today; URL fetch planned — see the roadmap). This
replaces the abandoned Figma REST API + Personal Access Token approach, which is Enterprise-gated.

## License

Private project. See `package.json`.
