# Design: two small inspector UI tweaks — Live filter + push-state version badge

- **Date:** 2026-06-10
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/inspector-ui` (off `main`)
- **Theme:** (1) a "Live" toggle chip that filters the component tree to components with a live
  preview; (2) the header version badge turns green when the local build is fully pushed, amber
  with N unpushed commits.

## Fix 1 — "Live" filter chip

The component tree shows a `LIVE` badge on components with a preview (`COMPONENTS_WITH_PREVIEW`,
App.vue:137 — the 7: button/input/textarea/badge/switch/checkbox/radio). Add a toggle that narrows
the tree to those.

- **State:** `const liveOnly = ref(false)` in `App.vue`.
- **Chip:** a toggle chip in the filter row, beside `<FilterChips>` (App.vue ~595), labelled
  `Live {n}` where `n` = count of `COMPONENTS_WITH_PREVIEW` components present in the loaded graph.
  Active style mirrors the existing chip "active" look; `aria-pressed`. `@click` toggles `liveOnly`.
- **Filter:** pass `:live-only="liveOnly"` + the existing `:preview-components` to `ComponentTree`.
  `ComponentTree` hides component-layer groups whose component ∉ `previewComponents` when
  `liveOnly` is true (the LIVE badge logic via `hasPreview` already knows which are live — reuse
  it). Non-component layers (Semantic/Primitives) are unaffected (the filter only narrows the
  Components section); when `liveOnly` is on and a non-live component is selected, selection is
  unaffected (no forced reselect) — keep it minimal.
- **Decision:** the chip lives in the filter row (per the user) as a sibling of `FilterChips`, NOT
  inside `FilterChips` (which is classification-specific — a different axis). It's a boolean toggle,
  independent of the classification filter (both can be active).

## Fix 2 — push-state version badge

The header badge (`App.vue:446-447`) shows `v{__APP_VERSION__}`. Make it green when the local HEAD
is fully pushed, amber when there are unpushed commits.

- **Build-time inject (`vite.config.ts` `define`):** `__APP_UNPUSHED__` =
  ```js
  (() => { try { return parseInt(execSync("git rev-list --count @{u}..HEAD", {stdio:["ignore","pipe","ignore"]}).toString().trim(), 10) || 0; } catch { return 0; } })()
  ```
  `@{u}..HEAD` = commits on HEAD not on the upstream branch (unpushed). On any failure (no repo, no
  upstream, CI/Vercel, detached HEAD) → `0` (treat as pushed; the build never breaks). Add
  `__APP_UNPUSHED__: JSON.stringify(<number>)` to `define`. Declare `__APP_UNPUSHED__: number` in
  the existing global ambient types (wherever `__APP_VERSION__` is declared).
- **Badge (`App.vue`):** `const unpushed = __APP_UNPUSHED__;` Class binding: green when
  `unpushed === 0` (e.g. `bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300`),
  amber when `> 0` (`bg-amber-100 text-amber-700 …`). Title: `v{appVersion}` when pushed, else
  `v{appVersion} · {unpushed} unpushed`.
- **Honest scope:** evaluated once at vite start (dev) / build time — a local DEV cue, not live.
  Documented; the `0`-fallback means deployed builds show green.

## Tests
- `ComponentTree.test.ts` (extend): with `liveOnly` true + `previewComponents` set, a non-preview
  component group is not rendered; with `liveOnly` false, it is. (If the existing ComponentTree
  test harness makes this awkward, assert the filter predicate at the App level instead — mirror
  the existing tree tests.)
- Fix 2 is build-config + a class binding; no unit test (the git define isn't unit-testable). Build
  + headless verify it.

## Verification
- `npm run typecheck && npx vitest run && npm run build` green.
- Headless: load the export; the `Live N` chip toggles the tree to the 7 live components and back;
  the version badge is AMBER now (we have unpushed commits) with the count in the tooltip — and
  would be green at 0 unpushed. Screenshot.

## Out of scope
- Persisting the live filter; a live filter on non-component layers; live runtime push detection
  (it's build-time only); changing the existing classification chips.
