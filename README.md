# Token Inspector

> Figma design-token inspector and `tokens.css` generator.

Drop your Figma W3C DTCG token export into the browser and the tool builds a single
in-memory token graph, surfaces it through a searchable inspector (alias chains,
used-by lookups, issues), and renders out a Tailwind-compatible `tokens.css` with
light + dark theme variables and component aliases.

100% client-side. No backend, no upload, nothing leaves the browser tab.

## What it accepts

Drop any combination of these files (drag-and-drop or file picker):

| File | Layer |
| --- | --- |
| `color.tokens.json` | color |
| `dimension.tokens.json` | dimension |
| `typography.tokens.json` | typography |
| `light.tokens.json` | light theme |
| `dark.tokens.json` | dark theme |
| `global.tokens.json` | global |
| `figma-mapping.json` | optional — Figma component links + default icons |
| `*.zip` | Figma export bundle, auto-extracted |

The naming convention matches Figma's default DTCG export, so the typical workflow
is: export from Figma → drop the whole zip → done.

## Quick start

```bash
npm install
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

## Features

- **Token graph** — single immutable structure over all source layers, built once
  per drop. Both renderers and UI read the same graph.
- **Alias chain inspector** — click any token to see the full reference chain.
- **Used-by lookup** — find every token that references the selected one.
- **Issues view** — surfaces broken aliases, unresolved references, type
  mismatches.
- **Code preview** — generated `tokens.css`, copy or download directly.
- **Figma embeds** — if `figma-mapping.json` is supplied, the inspector links each
  component to its Figma node and renders the official Figma embed.
- **Live Button preview** — for any `button-*` token, renders a real `<button>`
  grid (variants × states × sizes) styled by the live token values, with
  synchronized hover-highlighting across preview, sidebar, and code panel.
- **Zip drop** — accepts the Figma export bundle directly; no need to unpack.

## Architecture

```
src/
├── token-graph.ts          # type contract for the in-memory graph
├── build-graph.ts          # SourceFile[] → TokenGraph
├── renderers/              # graph → CSS emitter
└── app/                    # Vue 3 SPA (Vite, Nuxt UI v4, Tailwind v4)
    ├── App.vue             # top-level inspector layout
    ├── load-sources.ts     # drop → SourceFile[] (zip unwrap + layer detection)
    ├── figma-mapping.ts    # optional Figma component mapping
    ├── component-preview.ts # token resolution for live previews
    └── components/         # inspector and preview Vue components
```

The pipeline is one-directional: raw Figma JSON → `SourceFile[]` → `TokenGraph` →
(renderers + UI). The graph is never mutated; new input produces a new graph.

## Deployment

Configured for static deployment on Vercel. Any static host works
(GitHub Pages, S3+CloudFront, Cloudflare Pages) since there are no API routes,
no SSR, and no server-side state.

The build version is injected from `package.json` at build time and surfaced as a
badge in the header so the running build is always visible.

## Stack

- Vue 3 (Composition API, `<script setup>`)
- Nuxt UI v4 — semantic tokens, dark mode, Lucide icons
- Tailwind CSS v4
- Vite 6
- Vitest

## License

Private project. See `package.json`.
