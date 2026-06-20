# Q1 — Runnable Vite+@nuxt/ui Kit Export — Design Spec

**Status:** Draft for review
**Date:** 2026-06-20
**Topic:** Emit a complete, runnable **Vite + Vue 3 + @nuxt/ui** project alongside the existing token export, so the user runs `npm i && npm run dev` and sees their components rendered by the **real build-time Tailwind compiler** — the literal product. This is **Q1** of the "true-export fidelity" north star (Q2 = embed it in an iframe, deferred).

---

## Mission context

The inspector is a DEV↔Design bridge. v0.49.0 made the in-inspector Kit render the real `@nuxt/ui` v4 components, but the styles are applied via **runtime** Tailwind (`@tailwindcss/browser`), which "can lag/be incomplete." The feasibility recon (this session) established the only remaining gap to "the real product" is the **Tailwind compiler** (runtime vs build-time) — the component layer is already real `@nuxt/ui` v4, and the export (`tokens.css` + the `ui` recipe object + `custom-components.ts`) is self-contained. Q1 closes that last gap by emitting a project that compiles with the **real `@tailwindcss/vite`**.

**Confirmed mechanism (research, `@nuxt/ui` 4.7.1):** a standalone Vite+@nuxt/ui app applies a global theme via the **`ui` option of the `@nuxt/ui` Vite plugin**: `ui({ ui: <the ui object> })` in `vite.config.ts`. `AppConfigUI` (the option's type) extends `TVConfig` → it covers **both colours and every component's slot/variant overrides** at build time (baked into a virtual `#build/app.config` module; `useAppConfig()` reads it). This is the same mechanism the inspector already uses for colours. No workaround, no `:root` hack (the inspector's runtime substitution is not needed — `@tailwindcss/vite` processes `tokens.css`'s `@theme` natively). The only transform: unwrap the export's `defineAppConfig({ ui })` and pass the inner `ui` object to the plugin.

---

## Goal

The inspector emits a runnable Vite+Vue+@nuxt/ui kit project (as files in the existing export bundle) that, on `npm i && npm run dev`, renders the user's components globally themed by their tokens via real build-time Tailwind.

**Success criteria:**
- The export bundle contains a self-contained, runnable kit project (`kit/` subfolder).
- `npm i && npm run build` in `kit/` succeeds with no errors.
- The rendered components are themed by the user's tokens (colours + component overrides) via the Vite plugin's `ui` option + `tokens.css` compiled by `@tailwindcss/vite`.
- The kit emitter is pure + unit-tested; the build-and-render fidelity is validated once via an integration check (generate → `npm i` → `npm run build`).
- Existing tests stay green; no recipe/output change to the existing renderers (the kit emitter is additive).

---

## Scope

**In scope:**
- A **kit emitter** producing the runnable Vite+@nuxt/ui harness files, wired into the existing `buildExportFiles()` under a `kit/` path.
- A **representative-lean gallery** `App.vue` (one instance + the key variants per component, NOT a full matrix).
- Delivery via the **existing export bundle** (download-zip + git-export) — no separate button.

**Out of scope (parked):**
- **Q2 — embedding the kit in an in-app iframe** (WebContainer/COOP-COEP) — the next round.
- **The Nuxt target** (`nuxt.config` + `app.config.ts` auto-load) — deferred follow-up; v1 is Vite+@nuxt/ui only (the user's actual product).
- A **rich playground** (per-component pages, routing, prop controls / Storybook-like) — the lean gallery is enough to prove fidelity.
- Changing the existing `tokens-css`/`app-config`/`custom-components` renderers' output.

---

## Current state (key seams, from recon)

- The export is held in memory as renderer outputs, assembled by `CommitPanel.buildExportFiles()` → `[{ path, content }]`, shipped by the download-zip + the git-export (`git-export.ts`).
- Renderers (singletons): `tokensCssRenderer` (`src/renderers/tokens-css.ts` → `tokens.css`, an `@theme` block), `appConfigRenderer` (`src/renderers/app-config.ts` → `app.config.ts` = `defineAppConfig({ ui: { colors, <component>: { slots, variants } } })`, `COMPONENT_ALLOW_LIST` of 16), `customComponentsRenderer` (`src/renderers/custom-components.ts` → `custom-components.ts` = `export const <name>Recipe = {...} as const` for chip/sidebar, consumed via `tv()`).
- The app is itself a Vite+Vue+@nuxt/ui app (`@nuxt/ui` ^4 dependency, `@nuxt/ui/vite` + `@tailwindcss/vite` in `vite.config.ts`) — so the generated kit mirrors a setup the repo already proves works.
- `output/README.md` documents the consuming-project CSS imports (`@import "tailwindcss"; @import "./tokens.css"; @import "@nuxt/ui";`).

---

## Design — units

### 1. The `ui` object seam (`buildUiObject`)
The kit's `vite.config.ts` needs the **raw `ui` object** (not the `defineAppConfig`-wrapped string). The `appConfigRenderer` already builds this object before stringifying it into `defineAppConfig({...})`. **Refactor a shared `buildUiObject(graph) → UiConfig`** out of `app-config.ts` that both the existing renderer (wraps it in `defineAppConfig`) and the kit emitter (serialises it into `theme.ts`) call. This keeps a single source of truth for the theme and avoids fragile string-stripping. (If a clean extraction proves hard, the fallback is to transform the `app-config.ts` string — unwrap `export default defineAppConfig(` → `export const theme =` … `)` → `;` — but the shared-function path is preferred; flag for the plan.)

### 2. The kit emitter (`src/renderers/kit/`)
A new module producing the harness files as `[{ path, content }]` under `kit/`:
- `kit/theme.ts` — `export const theme = <buildUiObject(graph) serialised> as const;`
- `kit/vite.config.ts` — `defineConfig({ plugins: [vue(), tailwindcss(), ui({ ui: theme })] })` (imports `./theme`, `@vitejs/plugin-vue`, `@tailwindcss/vite`, `@nuxt/ui/vite`). Static template + the theme import.
- `kit/src/main.ts` — `createApp(App).mount('#app')` + `import "./main.css"`.
- `kit/src/main.css` — `@import "tailwindcss"; @import "../tokens.css"; @import "@nuxt/ui";` (relative to where `tokens.css` lands in the bundle).
- `kit/index.html` — mounts `#app`, loads `src/main.ts`.
- `kit/src/App.vue` — the gallery (§3).
- `kit/package.json` — deps (`vue`, `@nuxt/ui` `^4`, `@tailwindcss/vite`, `vite`, `@vitejs/plugin-vue`), scripts (`dev`, `build`, `preview`). Versions pinned to what the inspector itself uses (read from the repo's `package.json` at emit time, or a fixed known-good set — flag for the plan).
- `kit/README.md` — `npm i && npm run dev`.
- The existing `tokens.css` + `custom-components.ts` are placed in the bundle so the kit's relative imports resolve (e.g. `tokens.css` at the kit root or referenced path).

Most files are **static templates**; only `theme.ts` and the gallery are graph-derived.

### 3. The gallery (`kit/src/App.vue`)
`<UApp>` wrapping a section per component. Because the theme is global (via the Vite plugin `ui` option), the gallery uses **plain component markup** — no per-component `:ui` needed. A `GALLERY_SNIPPETS: Record<string, string>` in the emitter maps each `COMPONENT_ALLOW_LIST` component to a small markup block (one default instance + the key variants, e.g. `<UButton>Button</UButton>` + `<UButton variant="outline">…`). The emitter stitches the snippets for the components present in the export into `App.vue` sections.
- **Standard `@nuxt/ui` components** (button/input/badge/switch/…): plain markup, themed globally.
- **Custom components (chip/sidebar)**: rendered via `tv(chipRecipe)` from `custom-components.ts` — include if the snippet is straightforward; otherwise defer chip/sidebar from the gallery v1 and note it (flag for the plan).

### 4. Delivery
The kit emitter's files join `buildExportFiles()`'s `[{ path, content }]` under `kit/`. The existing download-zip and git-export pipelines ship them unchanged. No new UI/button. (Optional later: a one-click "download runnable kit" — out of scope.)

---

## Data flow

`graph → buildUiObject(graph)` (shared) → `appConfigRenderer` (existing `app.config.ts`) AND the kit emitter's `theme.ts`. The kit emitter also emits the static harness + the graph-derived gallery. `buildExportFiles()` assembles all renderer outputs (existing files + `kit/*`) → download-zip / git-export. No change to recipe building or the existing renderers' output (only the extracted `buildUiObject` is shared).

## Error handling / fidelity

- The kit is **self-contained** — `npm i` pulls real `@nuxt/ui`/`vite`/`@tailwindcss/vite`; `npm run build` uses the real build-time compiler. This is the fidelity guarantee (vs. the inspector's runtime-Tailwind approximation).
- If a component has no recipe in the export, its `theme.ts` entry is simply absent → the gallery renders the component with Nuxt UI defaults (honest, not broken).
- Serialisability: the `ui` object is JSON-serialisable (the research noted `TVConfig` function-style themes are pre-resolved by `getTemplates` before serialisation; the export's `ui` is plain slot/variant strings, so this is a non-issue).

## Testing

- **Unit (pure emitter):** assert the generated `vite.config.ts` contains `ui({ ui: theme })` + the plugin imports; `package.json` has the required deps + `dev`/`build` scripts; `main.css` has the three `@import`s; `theme.ts` exports a `theme` object carrying the export's colours + a component override; `App.vue` contains a gallery section per expected component. `buildUiObject` returns the same `ui` object the `app-config` renderer wraps (a characterisation test guarding the shared seam).
- **Integration validation (the real Q proof, manual/one-shot):** generate the kit from the live export into a temp dir, run `npm i && npm run build` (or `vite build`), confirm it exits 0 and the components render (a `/browse` of the kit's dev server, or a built-output check). This is the ultimate fidelity check — documented as a validation step, not a jsdom unit test.
- Existing renderer tests stay green; the `buildUiObject` extraction must not change `app.config.ts`'s output (characterisation-guarded).
- Pre-commit gate (vue-tsc + full vitest) green throughout.

## Resolved decisions (review-approved)
1. **Target = Vite+@nuxt/ui** (the user's actual product). Nuxt target deferred.
2. **Gallery = representative-lean** (one instance + key variants per component), not a full matrix.
3. **Delivery = the existing export bundle** (download-zip + git-export), no separate button.

## Flagged for the plan (implementation details)
- The `buildUiObject` extraction from `app-config.ts` (shared function preferred over string-strip).
- `package.json` dep versions (read from the repo's `package.json` vs a fixed known-good set).
- chip/sidebar in the gallery (include via `tv()` if straightforward, else defer with a note).

## Future (parked)
- **Q2** — embed the generated kit in an in-app iframe (real build in the browser via WebContainer; needs COOP/COEP headers on the host).
- **Nuxt target** (`nuxt.config` + `app.config.ts`).
- Richer gallery / per-component playground; a one-click "download runnable kit" button.
