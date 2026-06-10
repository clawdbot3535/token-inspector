# Design: token-creator app (Stage 2) — grammar-aware scaffolding UI

- **Date:** 2026-06-10
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/creator-app`
- **Parent design:** `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260610-113605.md`
  (token-creator). **Stage 2** of that plan; Stage 1 (`@tg/grammar` + `scaffold`) is merged.
- **Theme:** a second app in the repo where you pick a Nuxt UI component, toggle slots/states/sizes,
  and get a token set that maps 100% by construction — with a LIVE preview in real colours
  (aliased into your loaded token set) and a one-click download.

## Problem / goal

Stage 1 proved `scaffold()` produces 0-unmapped token sets, but only via the CLI/tests — no UI, and
placeholder values render black. Stage 2 is the UI: a creator app that loads your existing tokens
(the value palette), scaffolds a chosen component with **alias-semantic** values resolved against
that palette, and shows the real `Live*` preview + a "100% mapped" badge, with download.

Success criteria:
- `apps/creator/` is a second vite entry in this repo (own URL); reuses the inspector's `Live*`
  components, `extract-arbitrary`, `recipe-engine`, and load pipeline via `@`/`@core`, and
  `scaffold`/profile from `@tg/grammar`. No package extraction (later refactor).
- Flow: load tokens → pick component (15) → toggle slots/states/sizes → live preview (real colours
  for the 7 components with a `Live*`; recipe/JSON for the other 8) + "100% mapped" badge → download
  the `*.tokens.json`.
- `scaffold` gains a working `valueStrategy: "alias-semantic"` driven by an `aliasResolver`
  callback; the creator supplies a nuxt-ui default-alias map. Aliases resolve through `buildGraph`
  against the loaded tokens → the preview shows real colours.
- Full suite + typecheck + build (both entries) green; the creator loads + previews a real component
  in headless QA.

## Decisions

- **Same-repo second app, reuse by alias.** `apps/creator/{index.html,main.ts,Creator.vue}` + a
  vite multi-entry build. The creator imports the inspector's `src/app` components (`Live*`, the
  load pipeline `loadSources`/`buildGraph`, `GitLoader`) and `src/` engine (`recipe-engine`,
  `extract-arbitrary`, `resolve`) directly through the existing `@`/`@core` aliases. The clean
  `packages/render` extraction is a deliberate later refactor (Stage 1 proved the pattern).
- **Alias-semantic values via a resolver callback.** `scaffold` stays generic: a new opt
  `aliasResolver(ctx) => string | null` lets a caller supply the semantic alias target per token
  (ctx = `{component, part, utility, state, size, variant}`); null → raw placeholder fallback. The
  creator ships a nuxt-ui default map (`semantic-role.ts`) — best-effort `(utility,state) →
  semantic token name` (`bg → color.bg.muted`, `bg+checked → color.action.bg`, `border →
  color.border.default`, …). Aliases are emitted as DTCG `{...}` references and resolved by
  `buildGraph` against the loaded palette.
- **Live render for 7, structural output for 8.** Only `button, input, textarea, badge, switch,
  checkbox, radio` have a `Live*` component. The preview pane renders the matching `Live*` when one
  exists; otherwise it shows the recipe slot classes + token JSON + the mapped badge (no rendered
  component). Honest, mirrors the inspector.
- **Load is the entry gate.** Before tokens are loaded, the creator shows a load prompt (drag/drop +
  the `GitLoader`). The value palette = the loaded graph; without it, alias-semantic falls back to
  raw and the preview is black (allowed, but the prompt steers you to load first).
- **v1 = download; commit + per-token override are v1.1.** The default-alias map is best-effort; a
  per-token alias picker (click a token → choose from the loaded set) and `Commit…` (reuse the
  extracted `CommitPanel` + `git-export`) are the next iteration.

## Design

### App shell
- `apps/creator/index.html` (mounts `#creator`), `apps/creator/main.ts` (creates the Vue app from
  `Creator.vue`, imports the shared tailwind/`@nuxt/ui` setup like `src/app/main.ts`).
- `vite.config.ts`: `build.rollupOptions.input = { inspector: "index.html", creator:
  "apps/creator/index.html" }`. Dev serves both (`/` and `/apps/creator/`).

### `apps/creator/Creator.vue` (root, layout A — 3 columns)
- **Header:** title + target ("nuxt-ui") + the "✓ 100% mapped · N tokens" badge.
- **Left pane — configure:** `ComponentPicker.vue` (the 15 from the profile) + `SlotConfig.vue`
  (slots/states/sizes as toggle chips, default all-on, driven by the selected component's profile).
- **Center pane — preview:** if a `Live*` exists for the component → mount it with the built graph;
  else a recipe/empty-render fallback. Plus the mapped badge.
- **Right pane — output:** the live `*.tokens.json` (pretty-printed), the `alias`/`raw` value-strategy
  toggle, a **Download** button (single `<component>.tokens.json`, via a Blob download).

### State / data flow (a small composable `useCreator.ts`)
1. `loadedGraph` — from `loadSources` + `buildGraph` of dropped/fetched token files (reuse).
2. `selected` — `{ component, slots, states, sizes, valueStrategy }`.
3. `scaffoldTree = scaffold(profile, component, { parts: slots, states, sizes, valueStrategy,
   aliasResolver })`.
4. `mapped` — `flattenDtcg(scaffoldTree)` → `getSlotMapping` → unmapped count (badge).
5. `previewGraph = buildGraph([...loadedSources, { name: "creator", data: scaffoldTree }])` — the
   loaded palette + the scaffolded component, so aliases resolve. Passed to the `Live*` as `:graph`,
   `:component-name="component"`.
6. `download()` — `JSON.stringify(scaffoldTree)` as `<component>.tokens.json`.

### `scaffold` extension (`packages/grammar/src/scaffold.ts`)
- `ScaffoldOpts` gains `aliasResolver?: (ctx: AliasCtx) => string | null`. When
  `valueStrategy === "alias-semantic"` and the resolver returns a name, the leaf `$value` is
  `"{" + name + "}"` (DTCG alias) instead of the placeholder. Raw fallback otherwise. New tests for
  both branches. (The flat-under-component structure + serializability are unchanged.)
- `semantic-role.ts` (in `apps/creator/`, NOT the package — it's nuxt-ui value heuristics, not
  grammar): the default `(utility, state) → semantic name` map + a `nuxtUiAliasResolver`.

### Tests
- `packages/grammar/src/scaffold.test.ts`: a token with an `aliasResolver` returning `"color.x"` →
  leaf `$value === "{color.x}"`; resolver returning `null` → placeholder; still 0-unmapped and
  serializable.
- `apps/creator/Creator.test.ts` (jsdom): mount with a small loaded graph; pick `switch`; assert the
  mapped badge shows 0 unmapped and the `switch-track` preview renders (the `Live*` mounts with the
  built graph). Stub heavy bits as the inspector's `App.test.ts` does.
- `apps/creator/semantic-role.test.ts`: the default map resolves a known utility/state to a name;
  unknown → null.

### Verification
- `npm run typecheck && npx vitest run && npm run build` (build emits BOTH entries) green.
- Headless QA: open `/apps/creator/`, load `components/*.tokens.json`, pick `switch`, toggle a state
  off → preview + JSON update, badge stays "100% mapped"; pick `button` → size variants; download
  works; console clean. Screenshot.

## Out of scope (v1.1 / later)
- Per-token alias override picker; `Commit…` (reuse `CommitPanel`/`git-export`); custom components;
  the `packages/render` extraction; shadcn profile; the plugin import (Stage 3).
- Live render for the 8 non-`Live*` components (they show structural output only).

## Risks
- **vite multi-entry** must not break the inspector build or its deploy. Mitigation: the inspector
  entry (`index.html` → `src/app/main.ts`) is unchanged; the creator is purely additive. Verify both
  build + the inspector's headless smoke still passes.
- **Best-effort default-alias map** — colours may be off if the user's semantic naming differs from
  the map's guesses. Documented; raw fallback + an "unresolved" hint where a target is missing; the
  per-token override (v1.1) is the real fix.
- **Reuse coupling** — the creator imports inspector internals directly. Acceptable for v1 (chosen);
  the eventual `packages/render` package formalises the boundary.
