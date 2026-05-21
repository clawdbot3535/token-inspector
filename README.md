# Token Inspector

> Figma → Nuxt UI v4 design-token adapter and inspector.

Drop your Figma W3C DTCG token export into the browser. The tool builds a
single in-memory token graph, surfaces it through a searchable inspector
(alias chains, used-by lookups, issues), and renders out:

- A lean `tokens.css` with a Tailwind v4 `@theme` block plus `.dark` overrides
  for mode-variant semantic tokens.
- A minimal Nuxt UI v4 `app.config.ts` with color-role mapping plus a
  `button` component recipe (slots + size variants) derived from your
  Figma component tokens.

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

- **Token list** with classification badges (`tailwind`, `theme`,
  `mode-var`, `skip`) and quick filters
- **Summary panel** with per-classification counts (clickable as
  quick-filters)
- **Token detail** panel showing alias chains, used-by, and a per-token
  "Output" section describing exactly how the token surfaces in
  `tokens.css` or `app.config.ts`
- **Live button preview** rendering the three button sizes with their
  computed Tailwind class strings shown adjacent for copy-paste
- **Code preview** tabs for both output files with target-path hints
- **Issues view** for broken aliases, type mismatches, unresolved refs
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

135 tests across the typed pipeline. Run:

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

v0.3.0 ships the Tailwind-utility-first pipeline. Currently the Nuxt UI
v4 recipe emission covers the `button` component only.

## Roadmap

| Milestone | Status | What ships |
|---|---|---|
| **v0.1.0** | ✅ done | Initial inspector — drag-and-drop, alias chain, code preview, issues view |
| **v0.2.0** | ✅ done | LiveButton preview pipeline, Figma embeds, version badge |
| **v0.3.0** | ✅ done | Tailwind-utility-first output: classification engine, `tokens.css` with `@theme` + `.dark`, Nuxt UI v4 `button` recipe, dual-emit CLI, Inspector classification badges + filter chips + summary panel + per-token Output section, resizable sidebars |
| **PR 4a** | 📋 planned | Engine + scanner foundations: `scanner.ts` aggregating data-quality issues + classification hints + output forecast, smart non-suffix → default-size assignment in recipe engine, `slot-mapping.json` project override, app-config completeness comments. No UI changes, no release |
| **PR 4b → v0.4.0** | 📋 planned | Inspector ScanView (categorized accordions, completeness table, forecast line), permanent HeaderStatusStrip, LiveButton `n/m` partial badge, IssuesView absorbed into ScanView, full v0.4.0 release |
| **PR 3** | 🧊 queued | Figma REST API import via Personal Access Token. Browser-side PAT handling, Figma-Variables → W3C DTCG converter, fetch UI. Needs its own brainstorming round |
| **PR 5+** | 🧊 backlog | Component recipes beyond `button` (`badge`, `card`, `input`, …) once the slot-mapping pattern is validated against more Figma systems |
| **Later** | 🧊 backlog | Hue-proximity color role derivation, `@tailwindcss/browser` runtime compiler for richer LiveButton previews, Playwright CI integration |

Design contract and detailed plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## License

Private project. See `package.json`.
