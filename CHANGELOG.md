# Changelog

## [0.65.3](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.65.3) — 2026-06-28

### Added

- **The framework-agnostic target now also emits a typed `tokens/tokens.ts`.** It completes the generic target's
  consumption trio — `variables.css` (styling), `tokens.json` (tooling), and now `tokens.ts` (type-safe code
  import). The module is an `as const` object plus an exported `TokenName` union, so TS/JS consumers get literal
  types + autocomplete with no JSON-import flags or loaders:
  ```ts
  export const tokens = { "color-bg-base": { value: "#FFFFFF", dark: "#09090B" }, … } as const;
  export type TokenName = keyof typeof tokens;
  ```
- Backed by `buildGenericTs(graph)` in `src/renderers/generic/generic-tokens.ts` (reuses the same `collect` pass
  as the CSS/JSON outputs — DRY). Validated by typechecking the generated file with `tsc --noEmit --strict`. No
  scanner/recipe-engine change. 1057 tests.

## [0.65.2](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.65.2) — 2026-06-27

### Changed

- **The shadcn theme now emits `oklch()` colors instead of hex — matching shadcn/ui's own convention.** shadcn's
  default `globals.css` is written in OKLCH, so our export now drops in alongside the shadcn defaults without a
  hex/oklch mix. Colors are perceptually identical; only the notation changed. `--radius` stays a px length.
- Backed by a new pure, dependency-free `hexToOklch` (`src/renderers/shadcn/oklch.ts`) — Björn Ottosson's reference
  sRGB → linear → LMS → OKLab → OKLCH conversion, validated against white/black/red reference values. Achromatic
  colors pin hue to `0` (`oklch(L 0 0)`, shadcn's convention); non-hex values pass through unchanged. 1055 tests.

## [0.65.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.65.1) — 2026-06-27

### Added

- **The health report now summarizes the whole multi-target output.** A new **Output targets** section in
  `REPORT.md` lists each target — Nuxt UI (`app.config.ts` + kit, with the component count), shadcn/ui
  (`globals.css`, with the mapped-var count + the note that `--chart-*`/`--sidebar-*` have no Figma equivalent),
  and Generic (`variables.css` + `tokens.json`, with the token + dark-mode counts). Until now the report only
  described the Nuxt mapping; the shadcn and generic targets had no feedback at all, and the shadcn coverage gap
  hid in a CSS comment nobody reads. The diagnostic layer now covers every output.
- Backed by two small coverage helpers exposed from the renderers: `shadcnThemeStats(graph)` and
  `genericTokenStats(graph)` (each reuses the renderer's own resolve/collect pass — no duplication). No scanner
  or recipe-engine change. 1049 tests.

## [0.65.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.65.0) — 2026-06-27

### Added

- **A third output target: a framework-agnostic design-token export (`tokens/variables.css` + `tokens/tokens.json`).**
  `css/tokens.css` is Tailwind v4 `@theme`-shaped (useless without Tailwind) and `shadcn/globals.css` uses shadcn's
  var names — this new target emits the resolved design tokens under their OWN names, so any non-Tailwind consumer
  (plain CSS, React/CSS-modules, Svelte, Style Dictionary pipelines, mobile) can use them directly:
  - `tokens/variables.css` — plain `:root` + `.dark` CSS custom properties, no `@theme`.
  - `tokens/tokens.json` — a flat JSON keyed by token id, each `{ "value": …, "dark"?: … }`.
  Scope is the design-token layer — every non-component token (the 145 primitive + 51 semantic tokens, resolved);
  component-layer tokens are excluded (they become recipe classes, not vars). Validated on the real export: 196
  tokens, 44 with dark-mode overrides. Emitted by both the CLI (`output/tokens/`) and the `Download .zip` bundle.
- Backed by a new pure module `src/renderers/generic/generic-tokens.ts` (`buildGenericCss` / `buildGenericJson`),
  registered as the `generic` target — a single entry in the `TARGETS` registry introduced in v0.64.1, so neither
  the CLI nor the web download needed touching. No scanner/recipe-engine change. 1046 tests.

## [0.64.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.64.1) — 2026-06-27

### Changed

- **Internal: output targets are now first-class.** A new `Target` abstraction (`src/targets.ts`) groups each
  component system's output behind one interface — `nuxt` (the Tailwind theme + `app.config.ts` recipes +
  custom-components + the runnable kit) and `shadcn` (the theme `globals.css`) — exposed as a `TARGETS` registry.
  The `build:tokens` CLI and the web app's `Download .zip` both iterate `TARGETS`, so adding a future target is a
  single registry entry instead of an edit to both call sites (which is what adding shadcn in v0.64.0 required).
  Also de-duplicates the `customParts` derivation that was repeated across the two call sites. No new output and the
  CLI output is byte-identical.
- **The download `.zip` now mirrors the CLI output layout.** `tokens.css`, `app.config.ts`, and
  `custom-components.ts` previously sat at the zip root while `kit/` and `shadcn/` were nested; they now live under
  `css/` and `nuxt/` like the CLI's `output/`, so the bundle unzips to the same clean `css/ nuxt/ kit/ shadcn/`
  structure. File contents are unchanged. `REPORT.md` and `slot-mapping.json` remain at the root (they are
  cross-cutting, not target output).

## [0.64.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.64.0) — 2026-06-27

### Added

- **The inspector now emits a second target: a shadcn/ui theme (`shadcn/globals.css`) — the first step toward
  multi-target output beyond Nuxt UI.** shadcn theming is primarily CSS variables (components are copied in and read
  `--background`, `--primary`, `--radius`, …), so a real, usable shadcn theme is reachable WITHOUT the per-component
  recipe machinery. The new renderer maps the Figma semantic tokens to shadcn's CSS-variable convention and emits a
  complete `globals.css`: a `:root` block (light values), a `.dark` block (dark values), and an `@theme inline` block
  (so `bg-background`, `text-foreground`, `border-border`, the `--radius-*` scale, etc. work as Tailwind v4 utilities).
  Emitted by both the `build:tokens` CLI (`output/shadcn/globals.css`) and the web app's `Download .zip` bundle.
- The mapping is curated but near 1:1 — both vocabularies follow the same modern semantic conventions, so the Figma
  taxonomy the designer already built (`color-bg-base`, `color-action-bg`, `color-state-focus-ring`,
  `color-status-error-*`, …) maps cleanly onto shadcn's (`--background`, `--primary`, `--ring`, `--destructive`, …).
  Validated end-to-end on the real export: all of shadcn's core color vars resolved. A shadcn var whose source token
  is absent is skipped (never broken CSS) and listed in a trailing comment; `--chart-*` / `--sidebar-*` (no clean
  Figma equivalent) are noted for manual addition.
- Backed by a new pure module `src/renderers/shadcn/shadcn-theme.ts` (`buildShadcnTheme(graph): string`). Hex values
  (valid + dependency-free; oklch is a possible v2). No scanner/recipe-engine change. 1036 tests.

## [0.63.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.63.0) — 2026-06-27

### Added

- **A shareable Design System Health Report (`REPORT.md`) is now generated with every export.** The inspector
  already computed everything — the scan, the owner taxonomy, per-component completeness, the output forecast —
  but only inside the app. The new `REPORT.md` aggregates it into a stakeholder-readable Markdown digest, emitted
  by both the `build:tokens` CLI (`output/REPORT.md`) and the web app's `Download .zip` bundle. It has four
  sections: a one-line summary (components · tokens · scan counts), a **Deviations by owner** table that frames
  every deviation by *who fixes it* (🎨 Figma-Fix = designer, 🛠 Data-Quality = source, 🔧 Manual-Dev = dev,
  🔁 Heuristic = reroutable, ⊘ by-design = nothing to do), a **Component completeness** table flagging incomplete
  size/color variants, a **Designer action items** checklist (the Figma-Fix + Data-Quality issues, the things a
  designer can act on), and an **Output forecast** line. The owner framing is what makes the diagnosis
  communicable to non-developers.
- Backed by a new pure module `src/app/report/health-report.ts` (`buildHealthReport(graph, scanReport): string`)
  — deterministic (no timestamp, so the output is stable + git-diff-friendly). Validated end-to-end on the real
  Figma export. No scanner/recipe-engine change. 1030 tests.

## [0.62.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.62.0) — 2026-06-27

### Added

- **The component slot vocabulary is now derived from Nuxt UI itself (codegen) — new Figma components are
  auto-supported, and `toast` is the first.** The Figma kit is a moving target; previously every new component
  needed a hand-edit to the grammar's `NUXT_SLOTS` map. Now a codegen script (`npm run gen:vocab`) reads the
  installed `@nuxt/ui` version, fetches that release's theme definitions, and generates the per-component slot
  vocabulary for a curated include-list of ~25 genuine components (button, badge, input, toast, alert, tooltip,
  popover, tabs, select, breadcrumb, drawer, avatar, …). A Figma component that is a Nuxt UI component is therefore
  emitted automatically once its tokens appear — no per-component code edit. Re-run `npm run gen:vocab` after a
  `@nuxt/ui` upgrade to re-sync.
- **`toast` support falls out of this for free** — validated end-to-end on the real Figma export: a complete
  `ui.toast` recipe (root / title / description / progress + default·error·info·success·warning color variants),
  with `toast-desc-*` aliased to the `description` slot and the bare tokens routed to `root`.
- Mechanics: `NUXT_SLOTS` is composed from the generated base (`nuxt-slots.generated.ts`, committed + deterministic)
  plus a small curated overlay (`nuxt-vocab-curated.ts`) for the few things Nuxt UI can't tell us — Figma↔Nuxt name
  differences (`nav→navigation-menu`, `dropdown→dropdown-menu`, `radio→radio-group`), deliberate deviations (`chip`),
  and the `desc→description` alias. `COMPONENT_ALLOW_LIST` is derived from the generated set. `defaultBaseSlot` now
  auto-derives `root` when a component has no `base` slot, so root-based components (toast, alert, …) need no entry.
- **Reconciliation was clean:** 14 of the 15 inventoried components matched the codegen exactly; only `textarea`'s
  hand entry had over-transcribed `input`'s slots, and the generated 2-slot set is the real Nuxt UI textarea theme
  (adopted, no test or real-data impact). The 5 composites' slots are unchanged (the `component-anatomy` mirror test
  guards them); `COMPONENT_ANATOMY` stays curated at its subset. No recipe-engine / scanner change. 1024 tests.

## [0.61.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.61.1) — 2026-06-26

### Fixed

- **The `build:tokens` CLI now emits the runnable `kit/` project too — its output matches the web app's
  `Download .zip`.** The CLI wrote `tokens.css` + `app.config.ts` + `custom-components.ts` but not the runnable
  Vite + `@nuxt/ui` kit (only the web app's download produced it), so the two export paths diverged. The CLI now
  also writes the 9 `output/kit/` files via the existing `buildKitFiles`, threading the same `slot-mapping.json`
  overrides + per-component default sizes it already applies to `app.config.ts`. Surfaced by an end-to-end QA pass
  on the real Figma export (the kit builds with real Tailwind — 246 KB CSS — and the recipes' arbitrary values
  land in the compiled output).
- Also threaded `slotMappingOverride` into the CLI's `custom-components.ts` render (it already passed
  `defaultSizeByComponent` but not the override), matching the web app so a resolved custom-component token is
  reflected in the CLI output. Glue-only change in `scripts/build-cli.ts`; no `src/` change. 1013 tests.

## [0.61.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.61.0) — 2026-06-25

### Added

- **An imported `slot-mapping.json`'s `components.{defaultSize}` is now applied in the browser — completing
  the import round-trip.** v0.59.0 let you re-import a `slot-mapping.json` to restore the session's resolve
  overrides, but a per-component default size in that file (`components: { button: { defaultSize: "lg" } }`) was
  parsed and then discarded. It's now captured on import and threaded into every output render — the on-screen
  `app.config.ts` / `custom-components.ts` tabs, the downloaded bundle's renders, and the runnable `kit/` —
  so the generated output honors it, matching the CLI. A non-suffix token (e.g. `button-padding-x`) with a
  size sibling redirects to the configured default size instead of `md`.
- Threaded alongside the resolve override: `useRenderedOutput` gained a fifth `defaultSizeByComponent` ref param,
  `buildKitFiles → buildKitTheme` / `buildKitGallery` gained a third param (the `appConfig` / `custom` renderers
  and `buildComponentRecipes` already accepted the option), and App.vue captures it on import into a new
  `defaultSizeByComponent` ref passed to all four render sites. The **live preview is intentionally untouched** —
  it picks a representative size (`md`/smallest) independently of the recipe's default-size designation, so it
  does not consume `defaultSizeByComponent` (no `provide`/`inject` needed, unlike the resolve override). Niche by
  nature (a hand-authored config field, not produced by the Resolve loop); no scanner/graph change. 1013 tests.

## [0.60.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.60.0) — 2026-06-25

### Added

- **`snap-to-tailwind` hints now have a one-click "Copy" for the suggested value.** When a primitive sits a
  step or two off the Tailwind scale, the Scan view already noted it (e.g. *"`spacing-custom-5` = 5px is close
  to p-1 (4px) — consider snapping."*), but acting on it meant re-typing the value. The hint now shows a
  **📋 Copy `<value>`** button that copies the Tailwind-aligned value (e.g. `4px`) — the change you make to the
  token in Figma. Mirrors the existing typo and Figma-Fix copy affordances.
- Backed by a new structured `snapTo` field on the `ScanIssue` (the scanner already computed the value for the
  message; it now also carries it, byte-identically — the message is unchanged). The Copy button is gated on
  `kind === "snap-to-tailwind"`, sitting alongside the kind's existing 🎨 Figma-Fix badge. This is the one
  newly-routed (v0.58.0) kind with a concrete copy-able artifact; the others remain advisory (their message is
  the action). No scanner-logic, owner-routing, or count change. 1010 tests.

## [0.59.2](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.59.2) — 2026-06-25

### Fixed

- **The runnable `kit/` project in the export bundle now reflects your resolves too — completing the
  "output reflects resolves" pass.** v0.59.1 threaded the session resolve override into `app.config.ts` and
  `custom-components.ts`, but the bundle's runnable Vite + `@nuxt/ui` kit (`kit/theme.ts` and the gallery
  `kit/src/App.vue`) still built its recipes without it — so `npm run dev` inside the exported kit rendered the
  un-resolved theme. The override is now threaded through `buildKitFiles → buildKitTheme` *and* `buildKitGallery`
  (both independently call `buildComponentRecipes`), and App.vue's `Download .zip` passes the session
  `resolveOverride`. Every recipe-based render in the bundle — `app.config.ts`, `custom-components.ts`, and the
  `kit/` files — now matches the on-screen Kit preview and the bundled `slot-mapping.json`. The new param is
  optional, so the CLI and existing callers are unchanged; the kit still renders only allow-list components (its
  existing scope), and `kit/tokens.css` is unaffected (no recipes). 1007 tests.

## [0.59.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.59.1) — 2026-06-25

### Fixed

- **The generated output — the on-screen code tabs AND the downloaded bundle — now reflects your resolves.**
  The live Kit preview already re-rendered with the session's resolve overrides, but the generated
  `app.config.ts` / `custom-components.ts` (both the on-screen output tabs and the files in
  `tokens-bundle.zip`) ignored them — so the code you read and shipped silently diverged from the preview,
  and (since v0.59.0) from the `slot-mapping.json` the bundle carries. The resolve override is now threaded
  into every recipe-based render, so the output matches the preview and the bundled mapping.
- Implemented by threading a `slotMappingOverride` through the render path: `customComponentsRenderer` gained
  the option (passed into `buildCustomRecipes`, which already accepted it; `appConfigRenderer` already had it),
  `useRenderedOutput` gained a fourth `slotMappingOverride` ref param (so the on-screen tabs honor it), and
  App.vue passes the session `resolveOverride` to the on-screen render, the `custom-components.ts` download
  text, and the bundle's `app.config.ts` render. `tokens.css` is unaffected (no recipes). Out of scope (a
  possible follow-on): the runnable `kit/` files in the bundle are not yet threaded. 1005 tests.

## [0.59.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.59.0) — 2026-06-25

### Added

- **`slot-mapping.json` now travels with the export bundle and can be re-imported (resolve round-trip).**
  The Resolve loop lets you reroute unmapped tokens into a session `slot-mapping.json`, but that override only
  left the app via a separate "Download slot-mapping.json" button — the main `tokens-bundle.zip` didn't carry
  it, and re-loading your tokens lost every resolve. Now:
  - **Export:** `Download all` folds a `slot-mapping.json` into `tokens-bundle.zip` whenever you have resolves
    (none is added when there are none — no empty `{ overrides: {} }`). The standalone download button stays.
  - **Import:** dropping or picking a `slot-mapping.json` (alone or inside a zip, alongside your token files)
    restores the session's overrides live — the Kit re-renders, the Scan view shows the resolves as ✓ resolved,
    and the header counts update. Loading one on its own no longer trips the "no token files" message.
- Mirrors the existing `figma-mapping.json` side-car pattern: `loadSources` detects `slot-mapping.json` and
  returns it on a new `LoadResult.slotMapping` (parsed via the existing `parseSlotMappingFile`; a malformed file
  warns and is skipped). A new pure `slotMappingBundleEntry(override)` helper (in `export-slot-mapping.ts`)
  produces the bundle entry. On import the overrides **replace** the session override (load-a-saved-state
  semantics). Scope: only `overrides` feed the live recipe engine — a `slot-mapping.json`'s `defaultSizeByComponent`
  is parsed but not applied in the browser (unchanged), and the bundle's pre-rendered `app.config.ts` is not
  re-rendered with the override (the CLI is the consumer that applies the file). 1002 tests.

## [0.58.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.58.1) — 2026-06-25

### Added

- **Typo issues now carry a read-only "Preview" that shows whether fixing the typo would change how the
  token maps (Data-Quality rename-impact preview).** A `possible-typo` deviation already showed a copy-able
  `💡 from → to` rename hint, but a designer couldn't tell whether the typo was *costing* them a mapped token
  or was merely cosmetic. Each typo issue now has a **Preview** toggle (shown when the inspector has the token
  graph) that expands an inline before→after for every affected token: the corrected id, how it maps today vs.
  after the fix, and a verdict — **recovers** (an unmapped token becomes mapped, e.g. `button-heigth-md` →
  `button-height-md` starts mapping to `slots.base · height`), **corrects** (the mapping changes), or
  **cosmetic** (no output change, e.g. an auto-normalized `line-heigth`). It stays advisory: the fix still
  belongs in the Figma source — the preview only *measures* the impact, it does not apply the rename.
- The impact is computed by a new pure module `src/app/resolve/typo-impact.ts` (`typoRenameImpact(graph,
  issue)`) that runs the real slot-mapping path (`getSlotMapping` from `@tg/grammar`) on both the typo'd id and
  the corrected id — no graph mutation, no recipe-engine change, no `provide`/`inject`. The impact is measured
  at the component slot-mapping level; a token that doesn't slot-map (a primitive/typography token) reports
  `cosmetic`, accurate for the current corpus. ScanView gains an additive optional `graph` prop (passed from
  App.vue); without it the Preview toggle simply doesn't render. Scanner, `ScanIssue`, owner routing, badges
  and header counts are all unchanged. 993 tests.

## [0.58.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.58.0) — 2026-06-24

### Changed

- **Owner routing is now complete — every scan-issue kind is routed to one of the five (Y) owners,
  and the "Other" filter bucket is empty.** The owner taxonomy (heuristic / Data-Quality / by-design /
  Figma-Fix / Manual-Dev) previously left seven issue kinds un-routed, so they fell into the catch-all
  "Other" owner filter. Those seven are now assigned:
  - **→ Data-Quality:** `unresolved-alias`, `duplicate-id`, `unknown-type` — the three build-time
    `GraphIssue` kinds (bridged to `ScanIssue`s in `scanner.ts`). A broken alias reference, a duplicate
    token id, and an unknown `$type` are all malformed *source values*, joining `possible-typo` and
    `malformed-value` in Data-Quality's "fix the Figma source data" domain. They gain the Data-Quality
    filter bucket; their build-time error display is unchanged (Data-Quality has no static badge).
  - **→ Figma-Fix:** `single-mode-semantic`, `mode-invariant-semantic`, `snap-to-tailwind` — token-set
    *shape* refinements the designer makes in Figma (a missing mode value; a semantic that belongs in a
    primitive file; a primitive a step off the Tailwind scale). Unlike the Data-Quality kinds the value
    is well-formed — the set's structure is what to refine. They gain the muted violet **🎨 fix in Figma**
    badge and Figma-Fix filter bucket.
  - **→ by-design:** `border-on-unframed-variant` — Nuxt UI v4 paints rings only on the `outline`/`subtle`
    variants, so a border on `solid`/`ghost`/`link` physically cannot render: an inherent framework
    constraint with no source fix. It gains the muted **⊘ by-design** badge plus the **Accept** toggle.
- The change is purely set-driven: three entries added to `DATA_QUALITY_KINDS` (`owner-of.ts`), one to
  `BY_DESIGN_KINDS` (`by-design.ts`), three to `FIGMA_FIX_KINDS` (`figma-fix.ts`). Because badge rendering,
  owner-filter bucketing and the by-design Accept toggle all follow `ownerOf`, no `scanner.ts`,
  `ScanView.vue` or `owner-badges.ts` change was needed. The five owner kind-sets remain pairwise disjoint
  (23 distinct routed kinds), so `ownerOf`'s first-match stays unambiguous. The **"Other" filter is now a
  forward-compat bucket** for a hypothetical future kind not yet assigned an owner — no real scanner kind
  lands there today. Header counts are unchanged (owner ⊥ severity; Accept stays opt-in). 984 tests.

## [0.57.4](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.57.4) — 2026-06-24

### Fixed

- **The Scan view's empty-state message now reflects the active owner filter.** When the Issues tab's filtered
  list is empty, the "No … issues." line previously reflected only the severity filter — so filtering to an
  owner that has no issues (while other owners do) misleadingly showed "No issues." It now reads both filters:
  e.g. "No Figma-Fix issues." (owner only), "No warning issues." (severity only), "No by-design warning issues."
  (both). The wording logic moved into a new pure, unit-tested view-layer helper
  `src/app/empty-issues-message.ts` (`emptyIssuesMessage(severity, owner)`), mirroring the `owner-badges.ts`
  pattern — it reads the owner label from the `OWNER_FILTERS` registry (single source, no second owner→text
  mapping) and drops each qualifier when its filter is "all". The severity-only behavior is preserved exactly.
  981 tests.

## [0.57.3](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.57.3) — 2026-06-24

### Changed

- **`collection-anatomy-mismatch` now routes to the Figma-Fix owner (Figma-Fix owner v2 completion).**
  A `collection-anatomy-mismatch` deviation (a component that *looks custom* — has parts with no Nuxt slot —
  yet is declared in a non-`components/custom` Figma collection, i.e. mis-filed in the source) now gets the
  muted violet **🎨 fix in Figma** badge and is bucketed under the **Figma-Fix** owner filter, instead of
  falling into "Other". Its message already states the one fix ("consider moving it to `components/custom`"),
  so this is pure advisory routing — no copy button, no message change. Because owner routing is set-driven
  (`ownerOf` first-matches over the disjoint kind-sets, and the badge + owner filter follow automatically),
  the entire change is one entry in `FIGMA_FIX_KINDS` (now 6 kinds) plus a broadened `isFigmaFix` JSDoc; no
  ScanView / `ownerOf` / scanner / type change. This completes the Figma-Fix owner. 976 tests.

## [0.57.2](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.57.2) — 2026-06-24

### Added

- **Accepted by-design deviations now survive a page reload (accept persistence).** The **Accept** toggle
  (by-design owner v2, v0.57.0) marked an issue acknowledged and subtracted it from the header count, but the
  state lived only in memory — every reload re-counted everything you'd already reviewed. Accept state is now
  persisted to `localStorage` (key `inspector.accepted`, namespaced alongside `inspector.tree.expanded`), so
  accepted issues stay cleared across sessions. Backed by a new pure, unit-tested module
  `src/app/accepted-storage.ts` (`loadAcceptedIds` / `saveAcceptedIds`) that mirrors the existing
  `expandedPaths` load/persist pattern — defensive against missing/malformed/non-array storage (degrades to an
  empty Set). App.vue seeds `acceptedIds` from `loadAcceptedIds()` on mount and saves on every toggle; strictly
  additive (no change to the count logic, the recipe engine, or the resolve override, which stays in-session by
  design). 976 tests.

## [0.57.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.57.1) — 2026-06-24

### Added

- **Malformed token values get an advisory hint (Data-Quality owner v2).** A `malformed-value` deviation
  (a color `$value` that isn't a Figma `{components, hex}` object, or a number/dimension `$value` that isn't
  a number) is now routed to the **Data-Quality** owner (it was unowned/"Other") and shows a
  **🛠 fix the $value in the Figma source** hint in the Scan view, with a tooltip stating the expected shape.
  This completes the Data-Quality owner alongside the `possible-typo` rename hint. Advisory and source-side —
  no copy (there's no single corrected value); the severity stays `error` (a malformed value breaks
  rendering — owner is orthogonal to severity). Implemented by adding `malformed-value` to
  `DATA_QUALITY_KINDS` + one ScanView hint span gated on the kind (mutually exclusive with the typo hint); no
  scanner/`ScanIssue`/build-graph change. 971 tests.

## [0.57.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.57.0) — 2026-06-24

### Added

- **Accept by-design deviations to clear them from the count (by-design owner v2).** A by-design issue
  (`⊘ capability-gap` / `state-via-prop` / `unsupported-state`) in the Scan view now has an **Accept** toggle:
  clicking marks it acknowledged (**✓ accepted**, click again to un-accept) and **subtracts it from the header
  `N errors · warnings · hints` count**. This is the dismiss half of the by-design owner — v1 explained, v2
  lets you clear reviewed constraints from the noise. It is the first *passive* resolution action, orthogonal
  to the Heuristic owner's active *resolve*: accept is keyed by `issue.id` (so `capability-gap`, which has no
  tokens, works), held in-session (a ref, like the resolve override), and feeds only presentation + the count
  — not the recipe engine. Backed by a pure `acceptedByDesignIds(report, accepted)` helper (mirrors
  `resolvedIssueIds`); the header subtracts `resolved ∪ accepted`. Only by-design issues are acceptable; no
  scanner/`ScanIssue`/engine/export change. 968 tests.

## [0.56.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.56.0) — 2026-06-24

### Added

- **Copy the tokens to add in Figma (Figma-Fix owner v2).** An `asymmetric-variant-coverage` deviation
  (e.g. a utility defined on `solid` but missing on `outline`/`ghost`) now shows a **📋 Copy N tokens**
  button in the Scan view that copies the exact token names to create in Figma (e.g.
  `button-outline-border`, `button-ghost-border`) to the clipboard, newline-separated. The scanner already
  computed this list for the message; it is now also carried structurally on the issue
  (`figmaFixTokens: readonly string[]`, mirroring `possible-typo`'s `typoFrom`/`typoTo`) and surfaced as a
  one-click action — so a designer can paste the list instead of hand-retyping it. Only
  `asymmetric-variant-coverage` carries the field (the only coverage-gap kind producing a clean token list);
  the message text is unchanged. 958 tests.

## [0.55.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.55.1) — 2026-06-24

### Changed

- **Owner badges render from a shared registry.** The three static advisory badges in the Scan view
  (`⊘ by-design`, `🎨 fix in Figma`, `🔧 hand-code`) — previously three near-duplicate `<span>` branches —
  now render from one registry-driven span backed by a new view-layer `src/app/owner-badges.ts`
  (`OWNER_BADGES` + `ownerBadge(owner)`), keyed off the v0.55.0 `ownerOf(issue)` aggregator. The typo hint's
  gate is re-expressed from the hardcoded `possible-typo` kind literal to `ownerOf(issue) === 'data-quality'`,
  removing that literal's duplication. Behaviour-preserving — identical badges, testids, colours, titles, and
  typo gating, proven by the unchanged badge/typo tests. Presentation stays in the view layer; the resolve
  layer is untouched. 954 tests.

## [0.55.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.55.0) — 2026-06-24

### Added

- **Filter scan deviations by owner.** The Scan view's Issues tab gains a second chip row — **All ·
  Heuristic · Data-Quality · by-design · Figma-Fix · Manual-Dev · Other** — that filters the issue list by
  its (Y) routing owner, combined with the existing severity filter via AND. "Other" surfaces the deviation
  kinds no owner claims yet (the still-to-route backlog). This is the first cross-cutting feature after the
  five-owner taxonomy completed in v0.54.7. Backed by a new single-source `ownerOf(issue): Owner | null`
  aggregator + `OWNER_FILTERS` registry in `src/app/resolve/owner-of.ts` (over the five disjoint owner
  kind-sets; `HEURISTIC_EXTENDABLE_KINDS` is now exported). No scanner change, no `ScanIssue` field, no badge
  refactor — additive only. 951 tests.

## [0.54.7](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.54.7) — 2026-06-23

### Added

- **Hand-code-only deviations get a dev-owned badge (Manual-Dev owner v1) — the (Y) owner taxonomy is now
  complete.** Three "hand-code-only" deviations in the Scan view — `custom-without-parts`,
  `disabled-via-opacity`, `resting-shadowed-by-state` — now carry a muted **🔧 hand-code** badge (teal)
  marking them as resolvable only by hand-coding in the Nuxt app (a custom recipe, or a CSS override that
  fights Nuxt's default). This is (Y)'s **fifth and final owner**, completing the routing taxonomy
  (Heuristic-Extension · Data-Quality · by-design · Figma-Fix · Manual-Dev). The two capability-deviation
  kinds are claimed here rather than by-design because, unlike `capability-gap` (Nuxt has no such slot),
  they are overridable by hand-written CSS. Advisory by nature: the badge is non-interactive and the header
  counts are unchanged.

### Changed

- **Owner classifiers share a `makeOwnerPredicate` factory.** With the third set+predicate classifier
  landing, the owner-predicate mechanic is consolidated into a new `src/app/resolve/owners.ts`; `by-design`
  and `figma-fix` were refactored onto it (behaviour-preserving — their existing tests, unchanged, are the
  regression guard). Each owner keeps its own named `*_KINDS` set and scanner-line caveat; only the mechanic
  is shared. All five owner kind-sets are verified disjoint. No scanner change, no `ScanIssue` field, no new
  state. 943 tests.

## [0.54.6](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.54.6) — 2026-06-23

### Added

- **Coverage-gap deviations are reframed as a Figma to-do list (Figma-Fix owner v1).** Five "coverage-gap"
  deviations in the Scan view — `asymmetric-variant-coverage`, `asymmetric-size-coverage`,
  `incomplete-size-variant`, `non-suffix-vs-size-conflict`, `orphaned-size-key` — now carry a muted
  **🎨 fix in Figma** badge marking them as the designer's domain (the Figma token set is incomplete or
  inconsistent → add or align tokens in the source). This is (Y)'s fourth owner, after Heuristic-Extension,
  Data-Quality, and by-design. Advisory by nature: the badge is non-interactive, the existing
  `issue.message` keeps carrying the specific "what to add" (e.g. `asymmetric-variant-coverage` already
  lists the exact tokens), and the header counts are unchanged. Implemented as a pure `isFigmaFix(issue)`
  classifier in `src/app/resolve/` (a standalone `FIGMA_FIX_KINDS` set, disjoint from the other owners) plus
  one additive `ScanView` template branch — no scanner change, no `ScanIssue` field, no new state. 935 tests.

## [0.54.5](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.54.5) — 2026-06-23

### Added

- **Constraint deviations are reframed as expected (by-design owner v1).** Three "capability-family"
  deviations in the Scan view — `capability-gap`, `state-via-prop`, `unsupported-state` — now carry a
  muted **⊘ by-design** badge marking them as inherent Nuxt UI constraints (the design tokens ask for
  something Nuxt UI architecturally can't express, so there's nothing to fix). This is (Y)'s third owner,
  after Heuristic-Extension and Data-Quality. Advisory by nature: the badge is non-interactive, the
  existing `issue.message` keeps carrying the specific "why", and the header counts are unchanged (this
  owner *explains*, it doesn't *dismiss*). Implemented as a pure `isByDesign(issue)` classifier in
  `src/app/resolve/` (a standalone `BY_DESIGN_KINDS` set, deliberately not reused from
  `CAPABILITY_DEVIATION_KINDS` since that set spans the opposite owner) plus one additive `ScanView`
  template branch — no scanner change, no `ScanIssue` field, no new state. 929 tests.

## [0.54.4](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.54.4) — 2026-06-22

### Added

- **Typo deviations show a copy-able rename hint (Data-Quality owner v1).** A `possible-typo` deviation in
  the Scan view now shows a **💡 `from` → `to`** hint with a **Copy** button — the first slice of (Y)'s
  **Data-Quality** owner. The typo detector already found the correction (e.g. `heigth` → `height`); this
  surfaces it structurally (new `typoFrom`/`typoTo` fields on the issue) and as a one-click action. Advisory
  by nature — the fix belongs in the Figma source, so there's no in-app override or ✓ (unlike the
  Heuristic-Extension owner). Typo-only; `malformed-value` and an in-session rename preview are parked. No
  scanner-logic/recipe/export change. 923 tests.

## [0.54.3](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.54.3) — 2026-06-22

### Changed

- **The scan summary count reflects resolution progress.** The header's `N errors · N warnings · N hints`
  (`HeaderStatusStrip`) now excludes fully-resolved deviations — as you resolve deviations, the counts
  drop. Presentation-only: a new pure `resolvedIssueIds(report, resolved)` helper (the single source of
  truth for "this deviation is handled", also adopted by `ScanView`'s ✓ for DRY) subtracts resolved
  issues from the counts; `scanGraph`, `customParts`, and the export are untouched. (The deeper
  override-aware `scanGraph` — which would make resolved issues disappear and supersede the per-issue ✓ —
  and an override-aware export were deliberately not done; the `slot-mapping.json` download stays the
  canonical persistence.) 919 tests.

## [0.54.2](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.54.2) — 2026-06-22

### Changed

- **Custom components (`chip`/`sidebar`) now live-re-render on resolve.** Resolving a deviation on a
  custom component updates its live Kit render — the session slot-mapping override is threaded into the
  custom-recipe path (`buildCustomRecipes` merges it OVER its auto-computed per-token mapping, so resolved
  tokens win; `useCustomPreviewRecipe` injects the same `RESOLVE_OVERRIDE_KEY` the standard path uses).
  Closes the v0.54.0 limitation #1 (the live token export's heuristic-extendable deviations are all on
  `chip`, so this is the case users actually hit). Live-render only — no change to the scanner, the
  `custom-components.ts` output, or standard-component behaviour. This also unblocks the deeper
  override-aware `scanGraph` (parked): resolved custom tokens now have a landing spot. 914 tests.

## [0.54.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.54.1) — 2026-06-21

### Changed

- **Resolved deviations show ✓ resolved (override-aware Resolve affordance).** Once you Apply a
  resolution, that deviation's **Resolve →** button is replaced by a **✓ resolved** mark in the Scan view
  (an issue with several heuristic-extendable tokens keeps offering Resolve for the still-unresolved
  ones). Closes the v0.54.0 limitation where resolved issues kept nagging. Localized to the resolve UI:
  `App.vue` passes a `resolved` token-id set (from the session override) to `ScanView`; no change to the
  scan report, `customParts`, or the export. (The deeper "override-aware `scanGraph`" that drops the
  warning count + re-routes the export is parked — it needs custom-component override support first, or
  resolved custom tokens would vanish from both outputs.) 912 tests.

## [0.54.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.54.0) — 2026-06-21

### Added

- **Resolve deviations into a `slot-mapping.json` override (heuristic-extension loop).** The Scan view's
  Issues tab now shows a **Resolve →** button on the deviations where the slot-mapping heuristic can't
  place a token (`unsupported-part` / `component-looks-custom`). Clicking it opens an editor pre-filled
  with a best guess (slot / utility type / variant axis); **Apply** routes the token live (the Kit render
  re-runs in-session with the override) and a **Download `slot-mapping.json`** button exports the
  accumulated overrides for your repo/CLI. This is the first vertical slice of **deviation
  decision-routing (Y)** — one owner (Heuristic-Extension), end to end.
  - New pure `src/app/resolve/` module: `heuristicExtendable` (classifier + utility-type guess),
    `buildSlotMappingFile` (round-trips `parseSlotMappingFile`), and a `RESOLVE_OVERRIDE_KEY`
    provide/inject seam threaded into `usePreviewRecipe` → `buildComponentRecipes` (the engine already
    accepted a `slotMappingOverride`; no engine change).

### Notes

- **v1 scope/limits (the other (Y) owners + polish are parked):** the live in-app re-render applies to
  **standard** components (the `usePreviewRecipe` path); **custom** components (`chip`/`sidebar`, via
  `useCustomPreviewRecipe`) resolve + export correctly but don't live-re-render yet. Resolved issues stay
  in the list (the scan report isn't override-aware — no "✓/drop-out" yet). The other four deviation
  owners (Figma-Fix / Manual-Dev / by-design-Constraint / Data-Quality) and the full 24-kind routing are
  later rounds. 910 tests.

## [0.53.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.53.0) — 2026-06-21

### Added

- **"Live Build" tab — open your generated kit as a real, runnable build on StackBlitz.** The Kit view
  gains a third tab (`Kit | Coverage | Live Build`) with an **Open in StackBlitz ↗** button that loads
  your kit (from the v0.52.0 `buildKitFiles`) as a live Vite + @nuxt/ui project rendered by the **real
  build-time Tailwind compiler** — the literal product, not the in-app runtime-Tailwind approximation.
  Your kit is sent to stackblitz.com only on click (ephemeral, not saved). New pure `src/app/live-build/`
  module: `toLiveBuildFiles` (kit `ExportFile[]` → StackBlitz file tree) + a `LiveBuildSubstrate` seam
  (`@stackblitz/sdk`).

### Notes

- **Scoped down from an in-app embed after a de-risk validation.** The feature was first built as an
  embedded WebContainer that renders the build inside the inspector. Live testing showed that render is
  ~identical to the existing runtime-Tailwind Kit preview — which is reassuring (it validates that
  preview's fidelity) but means the embed's cost bought no visual gain: it needs host COOP/COEP isolation
  headers, hits a cross-origin-isolation catch-22 (`require-corp` blocks the StackBlitz iframe;
  `credentialless` only works in a real, non-headless browser), is Chromium-best, and takes 30–90 s to
  boot. So the embed (and its `vercel.json`/vite isolation headers) was dropped in favor of the reliable
  new-tab affordance that works in all browsers with zero header complexity.
- **Test infra:** `@tailwindcss/browser` is now aliased to a no-op stub in vitest — jsdom can't parse the
  v4 CSS it injects, and the resulting unhandled rejection intermittently failed the suite even though all
  tests passed. 900 tests.

## [0.52.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.52.0) — 2026-06-20

### Added

- **Runnable kit export (`kit/`).** The export bundle now includes a complete, self-contained
  Vite + Vue 3 + @nuxt/ui project under `kit/`. Run `npm install && npm run dev` (or `build`) inside it
  and your components render via the **real build-time Tailwind compiler** (`@tailwindcss/vite`),
  globally themed by your tokens — the literal product, closing the runtime-Tailwind fidelity gap left
  by the in-inspector Kit view (which uses `@tailwindcss/browser`).
  - `kit/theme.ts` carries the generated `ui` theme (colour roles + per-component slot/variant
    overrides), built from the **same** `deriveRoles` + `buildComponentRecipes` the `app.config.ts`
    renderer uses, and applied globally via the `@nuxt/ui` Vite plugin's `ui` option (`ui({ ui: theme })`).
  - `kit/tokens.css` is the existing `@theme` token output, compiled at build time.
  - `kit/src/App.vue` is a lean gallery: one instance + key variants per component present in the
    export (the 15 standard allow-listed components; custom `tv()` components `chip`/`sidebar` deferred).
  - Emitted by a new pure `src/renderers/kit/` module (`kit-theme` / `kit-gallery` / `kit-templates` /
    `kit-emitter`) and shipped in **both** export pipelines — the download-zip and the git-export.

### Notes

- Validated end-to-end: a kit generated from the live token export runs `npm install && vite build`
  clean (exit 0), producing a compiled stylesheet via the real build-time compiler. Additive only —
  no change to the existing `tokens.css` / `app.config.ts` / `custom-components.ts` renderer output.
  890 tests.

## [0.51.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.51.0) — 2026-06-20

### Changed

- **Kit colour cells render checked for `switch`/`checkbox`/`radio`.** Nuxt UI applies a component's
  `color` to the **checked** track, so the Kit's COLORS row previously showed near-invisible colour on
  unchecked controls (just a faint ring). The colour cells for these checkable components now render in
  the checked state, so error/success/etc. are actually visible. (`KitMatrix` augments only the
  colour-axis cells' props; variant/state rows and non-checkable components are unaffected.)

### Fixed

- **De-duplicated the "Known Nuxt behaviors" notes across all capability-deviation kinds.** A component
  with N colour tokens for the same deviation (e.g. `badge` with `badge-disabled-bg/text/border`, or
  `nav` with 11 `nav-item-*-active` tokens) showed N near-identical notes differing only by token id.
  Each capability kind (`disabled-via-opacity`, `resting-shadowed-by-state`, `unsupported-state`,
  `state-via-prop`, `unsupported-part`) now has a token-agnostic message and the notes dedup by text, so
  the same deviation collapses to ONE note (badge 9→1, nav 11→1, chip→1). The inline ⓘ notes benefit too.

### Notes

- Surfaced during a `/browse` component walk-through of the live export — all components render
  correctly; modal/dropdown still show the "Real render coming" placeholders. Presentation/diagnostics
  layer only, no recipe/output change. 879 tests.

## [0.50.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.50.0) — 2026-06-20

### Added

- **Kit deviation explainer — inline `ⓘ` notes + a "Known Nuxt behaviors" panel.** The Kit render now
  explains *why* a faithful token can look "wrong" when it's actually correct Nuxt UI behavior. A
  curated catalog (`kit-behaviors.ts`) plus a bridge that reuses the existing capability-deviation
  scanner warnings drives a small inline note per cell — e.g. `button` `outline` shows "Nuxt adds an
  inset ring — expected", `link` shows "underline on hover only", and `input`'s disabled cell shows
  "Nuxt UI v4 dims disabled via opacity, not colour — the override is emitted but won't visibly apply"
  (from the `disabled-via-opacity` detector). Notes appear only on cells that have one (no clutter). A
  collapsible **Known Nuxt behaviors** panel lists the component's notes as a reference. The catalog is
  seeded narrow (button outline/link) and grows over time; the scanner-derived state notes are free.

### Changed

- **Kit cells laid out as labeled axis-rows.** A new shared `KitMatrix.vue` arranges each component's
  variant/state cells as **Variants / Colors / States** rows (instead of a vertical single-cell stack),
  so the kit is scannable at a glance. The 12 cell-bearing components (button, chip, the 9 slotted
  form/display components, accordion) render through it; `table`/`nav`/`sidebar` are resting-only (no
  variant/state cells, so nothing to lay out).

### Fixed

- **Variant/state cells now match the hero's padding.** `buildVariantCells`/`buildStateCells` inject
  the recipe's representative size classes into the base slot, so the rendered variant/state cells no
  longer fall back to Nuxt UI's default padding while the hero used the token padding. (Reported via the
  Kit render: outline/variant cells had visibly different padding from the resting hero.)

### Notes

- Render fidelity / visual layout verified via headless `/browse` on the live export (not jsdom-testable).
  875 tests. The matrix + inline-notes are a presentation/diagnostics layer — no recipe/output change.

## [0.49.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.49.0) — 2026-06-20

### Changed

- **One trustworthy "Kit" view replaces the Preview/Real tab split.** The component pane no longer
  offers two divergent renders (a hand-built approximation vs. the real component). It now shows a
  single **Kit** view: the real Nuxt UI v4 component themed by your generated recipe, with the
  render-diff diagnostics demoted to a collapsible **Diagnostics / deltas** toggle (default
  collapsed) and a per-component coverage badge (`X/Y mapped`, shown where curated anatomy exists).
  The right-pane tabs collapse `Preview | Coverage | Real` → **`Kit | Coverage`**. Rationale: the
  hand-built preview was a second, invented source of truth that could look right while the real
  render diverged — exactly what made the two views "not match." Removing it makes the inspector a
  faithful DEV↔Design bridge: what you see *is* the real component your tokens produce.
- **`modal` / `dropdown`** show an honest **"Real render coming"** placeholder (a real inline-open
  render for these overlay components is the next round) rather than the old approximation.
- **`apps/creator`** preview migrated to the same Kit render (`LiveKitPanel`), retiring its
  approximation dispatch; the raw recipe data remains available via the JSON output tab.

### Removed

- **The 16 hand-built `Live*.vue` approximation components + their tests** (`LiveButton`, `LiveBadge`,
  `LiveInput`, `LiveSwitch`, `LiveCheckbox`, `LiveRadio`, `LiveCard`, `LiveKbd`, `LiveProgress`,
  `LiveModal`, `LiveTable`, `LiveDropdown`, `LiveAccordion`, `LiveNav`, `LiveSidebar`, `LiveChip`).
  The real-render path (`LiveReal*.vue` + `LiveKitPanel.vue`) is now the only render. Net **−2569**
  lines. The suite drops to **861 tests** (the deleted components' approximation tests went with
  them); the real-render fidelity itself is verified via headless `/browse` QA (not jsdom-testable).

### Notes

- Diagnostics fidelity (the render-diff deltas) is unchanged — only its placement moved (collapsed by
  default). The per-token in-preview highlight overlay was dropped with the approximation; the
  code-preview highlighting is unaffected.

## [0.48.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.48.1) — 2026-06-20

### Changed (internal)

- **Removed a dead `PROP_DRIVEN_STATES` import** from `packages/grammar/src/component-vocab.test.ts`.
  The test exercises `propDrivenStateFor` (which stays); the set import was unused. Pre-existing dead
  code — the pre-commit `typecheck` excludes `.test.ts`, so only the IDE flagged it. Test-only, no
  behaviour change. 946 tests.

## [0.48.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.48.0) — 2026-06-20

### Added

- **Capability-deviation scan warnings — why a faithful token silently fails to render in Nuxt UI
  v4.** Two new scan-only detectors flag tokens that map correctly but get shadowed by the real
  component, so the override is emitted yet never visibly applies:
  - **`disabled-via-opacity`** — Nuxt UI dims a form control's `disabled` state via opacity, not
    colour, so a `disabled` colour token (bg/text/border/ring) on input/textarea/checkbox/radio/switch
    maps to `disabled:…-[#hex]` but stays invisible behind the opacity dim. Fires across slots
    (base/icon/indicator/label) because opacity dims the whole component; `placeholder-color` is
    deliberately excluded.
  - **`resting-shadowed-by-state`** — switch's resting track is driven by
    `data-[state=unchecked]:bg-accented` (specificity 0,1,1), which out-specifies a plain recipe
    utility (0,1,0); a resting `switch-bg` colour therefore loses at rest. Narrowly scoped to switch's
    `base` `bg-color`.

  Both are diagnostics only — no recipe/output/slot-mapping change; the recipe keeps emitting the
  tokens. Seeded conservatively from the Real-tab fidelity sweep (input/checkbox/switch confirmed;
  textarea/radio share the Nuxt UI component family; button/select excluded for lack of evidence). On
  the live export they fire on 15 disabled-colour tokens and 3 switch resting-bg tokens, with no false
  positives outside the sets. 946 tests.

## [0.47.2](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.47.2) — 2026-06-19

### Fixed

- **Real-tab `ring-offset` box-shadow (resolves the v0.47.1 residual).** `extract-arbitrary` now models
  `ring-offset-[N]` as Tailwind's two-layer offset composite (offset layer at `N`, ring layer at
  `calc(N + width)`, `#fff` offset colour by default), instead of ignoring it and emitting a single
  ring layer. `canonicalizeShadow` also normalizes the `inset` keyword — Nuxt UI renders form-control
  rings inset, but the recipe has no inset concept to express, so inset ≈ outset for the comparison.
  Together these clear the box-shadow false-positives on input/textarea/checkbox/radio (textarea and
  radio now fully match) and on button/kbd. Remaining box-shadow deltas are now **genuine** signal,
  not tooling noise — e.g. chip shows the recipe's ring vs the real custom-chip's `none`. 938 tests.

## [0.47.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.47.1) — 2026-06-19

### Fixed

- **Real-tab box-shadow false positives.** The fidelity diff compared `box-shadow` by raw string
  equality, but the probe (`extract-arbitrary`) emits a single ring layer while real Tailwind renders
  a 5-layer ring composite with transparent placeholder layers — so every ring/shadow-bearing
  component reported a spurious `boxShadow` ✗ (8 components in the live export). Fix: `canonicalizeShadow`
  in `render-diff.ts` strips Tailwind's empty placeholder layers before comparing, and
  `extract-arbitrary`'s ring-width default is aligned to Tailwind v4's `1px` (was `2px`). A clean
  ring-colour component (card) now matches exactly; the remaining `box-shadow` deltas are meaningful.
  **Known residual:** `extract-arbitrary` does not model `ring-offset`/inset, so components with a
  ring-offset (input/textarea/checkbox/radio/chip) still show a `box-shadow` delta — a probe-modelling
  gap, not a recipe defect (modelling Tailwind's full ring math was judged too brittle). Surfaced by a
  full Real-tab fidelity sweep; dropdown/modal/progress are pixel-faithful (0 deltas). 934 tests.

## [0.47.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.47.0) — 2026-06-19

### Changed

- **Actionable `unresolved-alias` diagnostic.** Dangling-alias errors (an alias pointing at a target
  absent from all loaded sources) are now grouped by missing target-family into one issue per family
  with a cause hint, instead of one opaque error per alias. On the live export the 6 separate
  `unresolved alias: color/white|black/alpha/…` errors collapse into 2 actionable issues
  (`color/white/alpha/*` ×3, `color/black/alpha/*` ×2), each naming the missing leaves + the aliasing
  tokens and explaining the likely cause: a library/remote variable the local-only Figma export did
  not include (export it or include the library), or a dangling reference. Severity stays `error` —
  de-noised, not hidden. Root-caused via /investigate: the resolver is correct (index + lookup both
  normalize to slash-form, 0 resolution bugs); the gap is that white/black alpha primitives are absent
  from the exported sources. `GraphIssue` gained a structured `target` field so the scanner groups on
  data, not parsed message text. Adds `scripts/probe-unresolved-alias.ts` (reusable diagnostic). 929 tests.

## [0.46.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.46.1) — 2026-06-19

### Changed

- **Real-tab polish / tech-debt consolidation** (no behavior change). Extracted `RADIO_ITEM_VALUE` /
  `ACCORDION_ITEM_VALUE` (= `"a"`) into `real-slotted-registry.ts` as the single source of truth, shared by
  the registry entry, the `STATE_PROPS_OVERRIDE` (radio/accordion), and `LiveRealAccordion` — removing the
  duplicated literal a reviewer flagged as a drift risk. Tightened the radio checked-cell mount test (asserts
  exactly one cell is selected + the resting radio is unselected). Documented why `LiveRealButton` passes
  `componentName` (no checked/open cells) and why the `apps/creator` smoke test uses a 15s timeout
  (full-suite worker-pool contention; ~120ms standalone).

## [0.46.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.46.0) — 2026-06-19

### Added

- **Non-trailing state parsing (`<state>-<utility>`).** The grammar parsed an interaction state only
  as the trailing token segment (`bg-disabled` ✓), so the export's `<state>-<utility>` ordering
  (`hover-bg`, `disabled-bg`) went `null`. `parseSegments` now also pulls a `STATE_KEYS` segment
  (excluding `default`, which doubles as a color-role) out of the utility range when no trailing state
  was found. Result against the live export: `dropdown-item-hover-bg` and `table-row-hover-bg` route to
  `hover:bg-[…]` on their item/`tr` slots (previously dropped). Trailing-state tokens are unchanged
  (detected first).

### Fixed

- **`badge` recognized as stateless.** UBadge is a static label (its Nuxt theme has no `disabled`
  variant / `:disabled`). With non-trailing state parsing, `badge-disabled-*` are now recognized as a
  `disabled` state and — since `badge` joins `STATELESS_COMPONENTS` — **dropped** (no inert `disabled:`
  emit) and flagged as `unsupported-state`. The scanner's `unsupportedStateForId` / `propDrivenStateForId`
  detectors gained non-trailing parity (scan all non-component segments), so all 9 `badge-disabled-*`
  tokens (incl. overlay variants) surface the warning.

## [0.45.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.45.0) — 2026-06-19

### Added

- **chip close-button — routed + rendered as a button.** The designer's `chip-close-button-size`
  token was dropped (mapped to `null`: the `button` segment between the `close` slot-prefix and the
  `size` utility made the utility `button-size`, unknown), so the chip recipe had no `close` slot and
  the preview drew an unstyled `×` in a `<span>`. Now a curated composite alias `close-button`→`close`
  (in `FIGMA_NUXT_PART_ALIAS`) + a 2-segment composite lookup in the slot-mapping routes
  `chip-close-button-size` → the `close` slot as `size-[Npx]`. Both previews (`LiveChip`,
  `LiveRealChip`) render the close as a `<button>` wrapping the close-slotted `<span>` (the button
  carries only UA-reset scaffolding; the recipe classes / diff-sentinel stay on the span, preserving
  sentinel-purity). Verified in-browser: chip close is a sized `<button>` (`size-[10px]`), Real-tab
  `close` slot `2/2` (`width`/`height`).

### Notes

- The curated composite alias is explicit (mirrors `dot`→`indicator`), **not** a generic word-absorber:
  it only matches entries in the alias map. The general nested-named-element case (e.g. a badge inside
  nav-item → its own `linkTrailingBadge` slot) is out of scope — it has no tokens today and is
  separately blocked by the camelCase-slot issue; each such element would get its own explicit entry.
- Incidental: bumped the `apps/creator` smoke-test timeout (5s→15s) — a pre-existing full-suite
  pool-contention flake (the test runs in 119ms standalone), unrelated to this change.

## [0.44.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.44.0) — 2026-06-19

### Added

- **Collection-aware custom routing — the Figma `components/custom` taxonomy now drives the inspector.**
  Every token carries `$extensions["com.figma.collectionName"]` (e.g. `components/global`,
  `components/custom`); the inspector previously ignored it. Now `build-graph` stamps
  `TokenNode.collection`, and a component declared `components/custom` is added to the custom-component
  set (emitted as `custom/<name>`), **augmenting** the existing registry + anatomy heuristic without
  clobbering their richer parts. Two new scanner deviations surface disagreements:
  - **`collection-anatomy-mismatch`** (warning): a component that *looks* custom (foreign parts with no
    Nuxt slot) but is declared `components/global` — e.g. **chip** (`close`/`label` aren't UChip slots).
    Message suggests moving it to `components/custom`. The heuristic still wins (no silent demotion).
  - **`custom-without-parts`** (warning): a component declared `components/custom` with no derivable
    parts (no Nuxt analog, not registry/heuristic flagged) — its recipe may be empty.

### Notes

- On the current export this changes **no recipe output** (sidebar is already registry-custom, chip
  already heuristic-custom) — the observable effect is the chip `collection-anatomy-mismatch` warning,
  plus the taxonomy now being authoritative for future exports (a reclassified chip or a novel custom
  component becomes custom by declaration). Part-derivation for novel declared-custom components is
  deferred (covered by the `custom-without-parts` warning).

## [0.43.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.43.0) — 2026-06-19

### Added

- **Unsupported-state detector — completes the capability-deviation trilogy.** A state token on a
  component that has *no* interaction states at all (kbd → Nuxt UI v4's `UKbd` is a static key
  display) was emitting an inert `active:` prefix (`kbd-bg-active` → `active:bg-[…]`, which never
  fires). A new `STATELESS_COMPONENTS` set (seeded with `kbd`) makes the grammar drop these tokens
  and the scanner flag a new `unsupported-state` deviation: *"`kbd` is a stateless component (no
  hover/active/focus/disabled) — so no `ui.kbd` override is emitted."* This is distinct from
  `state-via-prop` (Bucket 2): there a prop drives the state; here the state does not exist. Together
  with real pseudo-classes (Bucket 1) and prop-driven states (Bucket 2, input/textarea/nav), the
  three buckets now share one scanner seam — all dispatched by *why* the grammar mapping is null.

### Notes

- `kbd` is the only seed (the live-export case). `badge`/`card`/`progress` are candidate additions
  when an export carries their state tokens; custom components (chip/sidebar, designer-controlled)
  are excluded, and dropdown/table have real states.

## [0.42.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.42.0) — 2026-06-19

### Fixed

- **nav `active` is now recognized as prop/variant-driven — stops emitting the inert `active:`.**
  Nuxt UI v4's NavigationMenu applies the active (current-page) look via a baked-in `active` boolean
  variant plus ~30 compoundVariants, **not** a CSS `:active` pseudo-class. The grammar was leaving
  `active` untouched, so `nav-item-*-active` emitted `active:bg-[…]` = Tailwind `:active` (mouse-press),
  which fires on click rather than on the current route — and which the recipe couldn't deliver anyway
  (slot `ui` overrides apply unconditionally; the active look is a compoundVariant Nuxt owns). Adding
  `nav` to `PROP_DRIVEN_STATES` (alongside the input/textarea `highlight` seed) drops these tokens and
  the scanner flags them as a `state-via-prop` deviation: *"`nav` has no `:active` pseudo-class state,
  so no `ui.nav` override is emitted."* Per-component scoping preserves button's legitimate `:active`
  press state.

### Notes

- The scaffold "0 unmapped tokens" assertions now exclude prop-driven state tokens (nav active),
  documenting that they are intentionally unrouteable. The nuxt-ui scaffold profile still generates
  `nav.states: ["active"]`; whether it should stop emitting those unrouteable tokens is a separate
  future question.

## [0.41.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.41.0) — 2026-06-18

### Added

- **Real-tab v2 Phase B.3 — accordion `open`-state cell.** The accordion now renders **closed** at
  rest and the Real tab adds a dedicated **open** cell that force-opens a panel so its
  `data-[state=open]:` classes fire and get diffed against the projected intent. `buildStateCells`
  gains an `open` state (detected via `data-[state=open]:`) with an accordion override that supplies
  `default-value` activation; `projectToState` accepts the `open` state; `LiveRealAccordion` is
  refactored from its single open-at-rest render to the unified `[resting, …buildStateCells]` cells
  model (via `RealVariantCell`, like `LiveRealSlotted`). Verified in-browser against the live export
  (`accordion-item/text-opened`): resting `item` text `✓ rgb(65,80,141)` (closed/base color), open
  cell `item` text `✓ rgb(161,161,170)` (the opened color — `data-[state=open]:text-[…]` fires) with
  the panel body rendered. A `disabled` cell also appears (the accordion carries disabled tokens).

### Fixed

- **Resolves the accordion's open-at-rest probe artifact.** Previously `LiveRealAccordion` rendered
  open-at-rest with a base-only probe, so the opened styling fired but couldn't be represented in the
  diff. With the closed baseline + dedicated open cell, the resting probe matches the closed render
  and the open intent gets its own correct cell — the same class of fix as B.2b for checked.

## [0.40.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.40.0) — 2026-06-18

### Added

- **Real-tab v2 Phase B.2b — unchecked baseline + dedicated `checked` cell.** The checkable
  components (checkbox, switch, radio) now render **unchecked** at rest, and the Real tab adds a
  dedicated **checked** cell that renders the real component checked so its `data-[state=checked]:`
  classes fire and get diffed against the projected intent. `buildStateCells` gains a `checked` state
  detected via a per-state prefix map (`checked → data-[state=checked]:`, the Reka form from B.2a, not
  the inert Tailwind `checked:`), plus a `componentName` param so radio's checked cell uses its item
  value (`modelValue:"a"`) instead of the `true` default. Verified in-browser against the live export:
  checkbox `checked` cell `indicator 1/1` (`rgb(86,103,167)`) + `icon 1/1`; switch `checked` `base`
  `backgroundColor ✓ rgb(86,103,167)`; radio `checked` `base` ring fires the accent color.

### Fixed

- **Resolves the B.2a resting-diff artifact.** With the unchecked baseline, the resting probe (base
  only) now matches the unchecked render instead of being undercut by checked classes firing at rest —
  e.g. the switch resting `thumb` diff is back to `3/4` (was `2/4` under B.2a). Not an output change;
  the recipe emit was already correct.

## [0.39.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.39.1) — 2026-06-18

### Fixed

- **Checked-state tokens now emit `data-[state=checked]:` instead of `checked:`.** Nuxt UI v4's
  checkbox/switch/radio are Reka components driven by the `data-state="checked"` attribute, not a
  native `:checked` input — so the recipe's `checked:` classes (Tailwind `:checked`) never fired.
  `normalizeState` now maps `checked` → `data-[state=checked]` (mirroring `open` →
  `data-[state=open]`; confirmed against Nuxt UI's own theme), and `projectToState` learns the
  `data-[state=X]:` form so the mock previews stay consistent (and `open` is covered for free). The
  checked-bg→indicator routing was updated to the normalized value. Verified in-browser: the rendered
  switch now carries firing `data-[state=checked]:` classes, **0 bare `checked:`** remain.

### Notes

- Because checkbox/switch render checked-at-rest while the Real tab's *resting* probe is base-only,
  their resting diff now reads slightly lower (the checked classes correctly fire but the base-only
  probe can't represent them). This is a measurement artifact, not an output regression — **Phase B.2b**
  (unchecked-baseline flip + a dedicated checked cell) resolves it next.

## [0.39.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.39.0) — 2026-06-18

### Added

- **Real-tab v2 Phase B.1 — per-slot `disabled`-state diffs.** The Real tab now renders each
  component **disabled** (real `disabled` prop) so the recipe's `disabled:` classes and Nuxt UI's own
  disabled styling both fire, then diffs each slot against the projected intent
  (`projectToState(slot, "disabled")`). Data-driven `buildStateCells` emits a disabled cell only when
  the recipe carries `disabled:` classes (the grammar recognizes the trailing-state form, e.g.
  `input-bg-disabled`). Verified on the live export: `switch` `base 5/6 · thumb 2/4`, `checkbox`
  `icon 0/1 · label 0/1`, `radio` `indicator 1/2`, `input`/`textarea` `base 9/10` — the partial
  matches are legitimate findings (Nuxt UI's own disabled dimming vs the recipe's intent).
- **`LiveRealSlotted` unified onto a cell loop** (`[resting, ...state, ...variant]` through one
  `RealVariantCell`-wrapped literal-tag chain). This also makes the generic components' **variant/color
  cells** render — `badge` now shows its `variant`/`color` diffs (closing the deferred Phase A.1), and
  `input`/`textarea` their variant/color cells.

### Notes

- `checked` (the checkable components render checked-at-rest, so it needs an unchecked-baseline
  redesign), `open` (needs a `projectToState` `data-[state=open]` extension), and `selected`
  (item-level) remain Phase B.2+.

## [0.38.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.38.0) — 2026-06-18

### Added

- **Real-tab v2 Phase A — per-variant fidelity diffs.** The Real tab now diffs each `variant`/`color`
  recipe key per slot (not just the resting look), rendering the real component *in that variant* so
  Nuxt UI's own variant theming is active and any override is caught. Data-driven `buildVariantCells`
  turns the recipe's `variant`/`color` axes into per-key cells (composed sentinel `:ui` + diff specs +
  the real Nuxt variant prop); a shared `RealVariantCell` renders each block (host + per-slot diff +
  label). Live for **button** (variant) and the custom **chip** (color). Verified on the live export:
  button `solid 5/5 · outline 3/5 · ghost 3/4 · link 3/6`; chip `error`/`success` each
  `base 11/12 · label 0/1 · close 3/3` — the partial matches are legitimate findings (variant tokens
  not fully painting / Nuxt variant override), exactly what the diff surfaces.

### Notes

- `size` stays the representative resting diff. Settable interaction states (disabled/checked/open) =
  Phase B; pseudo-class states (hover/focus/active) = Phase C, blocked by the `/browse` CDP allowlist.
  `badge` (color, in the generic `LiveRealSlotted`) deferred to a Phase A.1 follow-up.

## [0.37.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.37.1) — 2026-06-17

### Fixed

- **Colour-valued icon tokens now emit `text-[colour]` instead of a nonsensical `size-[#hex]`.**
  The grammar's icon-size rule is name-based and value-type-blind, so a colour token like
  `chip-close-icon` was emitted as `size-[#hex]` (an invalid utility). `utilityForMapping` now
  detects an `icon-size` utility carrying a colour value (`node.type === "color"`) and emits the
  icon's colour via `text-[…]` (Nuxt UI icons take colour from text-colour), resolving the same
  var/literal reference the colour path uses. Surfaced by the v0.37.0 Real tab (chip `close 0/2`);
  verified on the live export: `close 0/2 → 3/3 match`.

## [0.37.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.37.0) — 2026-06-17

### Added

- **Real-render fidelity for the custom components `chip` and `sidebar`.** Selecting either now
  offers the **Real** tab. Since these are custom (no stock Nuxt UI component to mount), two bespoke
  components — `LiveRealChip` / `LiveRealSidebar` — render the hand-built anatomy and apply the
  custom recipe's slot classes through the real runtime Tailwind compiler, then diff each slot.
  Real-render now covers **all 15 components** (4 bespoke + 9 generic + 2 custom). For custom
  components the diff validates that the emitted recipe classes actually compile and paint as
  intended (rather than catching third-party-base override) — verified in-browser: chip
  `base 11/12 · label 1/1 · close 0/2`, sidebar `base 8/9 · item 6/6`. The chip `close 0/2` is a
  genuine finding — it surfaces the known `chip-close-icon` data-quality issue (a color token
  emitted as an invalid `size-[#hex]`).

### Notes

- Sentinel-bearing elements carry only their recipe slot classes; layout scaffolding lives on
  non-sentinel wrappers, so a static class can never pre-satisfy a computed property and mask a
  real per-slot delta. v1 diffs resting slots only (chip color variants deferred).

## [0.36.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.36.1) — 2026-06-17

### Fixed

- **The Real tab no longer flips the inspector chrome to dark mode under a dark OS.** The runtime
  `@tailwindcss/browser` compiler observes the whole document, and its bare `@import "tailwindcss"`
  activation block defaulted to `prefers-color-scheme` dark — so it regenerated the inspector's own
  `dark:` utilities (SKIP tags, code preview, …) as `@media (prefers-color-scheme: dark)` rules that
  fired under a dark OS, overriding the app's class-based `.dark` toggle. The activation block now
  declares the same class-based dark variant the app uses (`@custom-variant dark (&:where(.dark, .dark *))`),
  so runtime `dark:` rules stay scoped to `.dark`. Verified in-browser: prefers-color-scheme
  dark-utility rules 43 → 0.

## [0.36.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.36.0) — 2026-06-17

### Added

- **Real-render fidelity for 9 standard components** (`card`, `kbd`, `badge`, `progress`,
  `switch`, `checkbox`, `radio`, `input`, `textarea`). Selecting any of them now offers the
  **Real** tab: the actual Nuxt UI v4 component, themed by the generated recipe, with a per-slot
  fidelity delta table. Driven by one generic `LiveRealSlotted.vue` + a `real-slotted-registry.ts`
  (component → `{ tag, props, slot? }`); `App.vue`'s `realRenderSupported` and a `v-else-if` branch
  route the 9 to it. Custom components (`chip`, `sidebar`) are deferred — they diverge from any
  stock Nuxt UI component, so there is no faithful `U<X>` to diff against. All 9 verified in-browser
  (e.g. badge `base 4/4`, checkbox `base 3/4 · indicator/icon/label 1/1`).

### Notes

- Components render via literal Nuxt UI tags in a `v-if` chain, not a dynamic `<component :is>`:
  Nuxt UI's Vite plugin auto-imports by scanning literal template tags at compile time, so a
  string `:is` renders an unresolved native element. Caught and fixed during in-browser verification.

## [0.35.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.35.0) — 2026-06-17

### Added

- **Real-render fidelity for the inline composites `nav` and `accordion`.** Selecting either now
  offers the **Real** tab with a real `<UNavigationMenu>` / `<UAccordion>` themed by the generated
  recipe and a per-slot delta table. Two shared helpers landed: `buildSlotSentinels(recipe.slots)`
  builds the `:ui` + diff specs for every **populated** slot (so the diff targets what's *styled* —
  `item` — not the structural-but-empty `link`/`trigger`/`body`), and `useRealRender(host, specsFn)`
  extracts the compiler-paint refresh (`LiveRealTable` refactored onto both). `RenderDeltaTable`
  gained an optional slot `label`. Accordion force-opens its first panel so `trigger`/`body` render
  if they carry tokens. Verified live: nav `item · 11/12`, accordion `item · 10/13` + `trailingIcon · 2/2`.

### Fixed

- **Added `vue-router` (memory history, empty routes) in `main.ts`.** Nuxt UI's router-link-based
  components — `NavigationMenu` in particular — require a router to provide the route-location
  injection; without one, nav items silently failed to render (caught by the `/browse` fidelity
  verdict, which jsdom unit tests couldn't). This unblocks nav's real render and any future
  router-dependent component.

## [0.34.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.34.0) — 2026-06-17

### Added

- **Fidelity check reaches its first multi-element composite (`table`).** Selecting `table` now offers
  the **Real** tab: a real Nuxt UI v4 `<UTable>` themed by the generated recipe, with a **per-slot**
  delta table for `th` and `td`. The new mechanism is **sentinel classes** — each slot's `:ui` class
  string gets a unique marker (`ti-slot-th`/`ti-slot-td`) appended, so the diff finds each slot's DOM
  element by our own contract rather than Nuxt UI's internal structure (which exposes no `data-slot`
  hooks). `computeSlotDiffs(host, specs)` queries each sentinel and reuses Spec 2's `computeRenderDiff`
  per slot; `RenderDeltaTable` gained an optional slot `label`. This solves the per-slot DOM resolution
  Spec 2 deferred, generically — every future composite supplies its own `{slot, selector, classes}`.
- Verified against the live export: a real `<UTable>` renders (sentinels land on th×2 / td×4) and both
  slots match — `th · 3/3`, `td · 2/2`. Scope: `table` (th/td). nav/accordion (inline) and the portaled
  modal/dropdown are the next increments.

## [0.33.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.33.0) — 2026-06-17

### Added

- **Render-vs-tokens fidelity verdict (Spec 2).** The Real tab now shows a per-property delta table
  under the rendered button: it diffs the real `<UButton>`'s computed **base** styles against the
  recipe's intent and reports `✓`/`✗` per property with an `N/M match` headline. A pure
  `diffComputed` (string-equality on `getComputedStyle`-normalized values) feeds a presentational
  `RenderDeltaTable`; the browser glue (`computeRenderDiff`) resolves the recipe's base classes via
  `extractArbitrary` → a hidden probe → `getComputedStyle` (the same canonicalizer both sides pass
  through, so no `rgb()`/unit reconciliation). Catches Nuxt UI's merge overriding or dropping a
  token-driven class, attributed to the exact property.
- Verified against the live export: **11/12 properties match**, with the one mismatch correctly
  surfaced and attributed — `lineHeight: expected 16px → rendered 24px` (Nuxt UI's line-height
  winning over the recipe). Depth the Coverage Guide can't see. Scope: base slot, button, resting
  variant; other slots / variants / composites / the Figma-frame diff are later increments.

## [0.32.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.32.0) — 2026-06-17

### Added

- **Real-render tab (fidelity foundation).** Selecting `button` now offers a third **Real** tab
  (`Preview | Coverage | Real`) that renders an actual Nuxt UI v4 `<UButton>` themed by the
  generated recipe — not the inline-style `Live*` approximation. A new `@tailwindcss/browser`
  runtime compiler (lazy-loaded via `use-runtime-tailwind.ts`) compiles the recipe's arbitrary
  classes (`bg-[var(--color-action-bg)]`, `rounded-[…]`) on the fly, which the build-time compiler
  can't (they're generated at runtime from dropped tokens); the existing `tokens.css` injection
  supplies the `var()` values. Verified in a real browser: the rendered button's computed
  `background-color` equals its `--color-action-bg` token byte-for-byte.
- This is **Spec 1** of the render-vs-tokens fidelity check (office-hours direction). The
  `getComputedStyle`→token **diff** (the attributed-delta verdict) and extending the real render to
  the multi-element composites are the next increments; the seam is generic.

## [0.31.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.31.0) — 2026-06-16

### Added

- **`inherited` slot bucket in the Coverage Guide.** A third slot classification (`@tg/grammar`'s
  `SlotAnatomy` gains `inheritsFrom`): slots that follow a parent slot's styling — nav `linkLabel`→
  `link`, nav `childLinkLabel`→`childLink`, accordion `label`→`trigger`, dropdown `itemLabel`→`item`.
  In the coverage engine an inherited slot is **covered when its parent is designed** (`touched =
  direct || parent-touched`) and is **never** listed in the to-design list — designing the parent
  covers it. The coverage view renders them in a third **"Inherited · follows another slot"** section
  (after Structural and Optional) with a `✓`/`↳` marker tracking the parent and an "inherits
  `<parent>`" tag. Structural counts are unchanged. Completes the Coverage-Guide arc (anatomy →
  engine → view → highlight → filter fixes → inherited).

## [0.30.2](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.30.2) — 2026-06-16

### Fixed

- **ScanView token highlight now also clears an active kind-filter**, matching the coverage view
  (v0.30.1). Clicking an issue's tokens in the scan view while a kind-filter (color/dimension/…) was
  active highlighted tokens that were filtered out of the tree. `onScanSelectTokens` (extracted from
  the inline handler) resets the classification filter to `all` before selecting, so the highlight
  and its auto-expand are visible.

## [0.30.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.30.1) — 2026-06-16

### Fixed

- **Coverage slot-click highlight now clears an active kind-filter.** When a kind-filter
  (color/dimension/…) was active in the token tree, clicking a covered slot highlighted tokens that
  were filtered out of view — a silent no-op. The handler now resets the classification filter to
  `all` first, so the slot's tokens are revealed and their groups expand. Closes the v0.30.0 known
  follow-up.

## [0.30.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.30.0) — 2026-06-16

### Added

- **Click a covered slot to highlight its tokens.** In the coverage view, a slot that has tokens is
  now a clickable row; clicking it highlights those tokens in the left token tree and expands their
  ancestor groups so they're revealed, while staying on the Coverage tab (no navigation to
  node-detail). Untouched slots stay inert. Backed by a new `SlotCoverage.tokenIds` on the coverage
  engine — the token ids that route to each slot, collected in `coverageFor`.

## [0.29.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.29.0) — 2026-06-16

First user-facing slice of the **Design-System Coverage Guide**: the inspector now tells a designer
which Nuxt UI theme slots of a component are still un-designed.

### Added

- **Coverage view** — selecting one of the five curated composites (`nav`, `accordion`, `modal`,
  `table`, `dropdown`) in the component tree now offers a **`Preview | Coverage`** tab in the
  component pane. The Coverage tab (`CoverageView.vue`) lists the component's slots in two sections —
  **Structural · must design** (✓ touched / ✗ + a "to design" tag) and **Optional · designed or Nuxt
  default** (✓ / ○) — with a `structuralTouched/structuralTotal` count and a badge on the tab showing
  the number of un-designed structural slots. Tabs appear only for components with a curated anatomy;
  every other component shows just the preview, unchanged. Backed by the `coverageFor` engine
  (v0.28.14) over the anatomy spec.

### Fixed

- **`nav-link-*` now routes to the `link` slot** instead of `slots.base` + a `link` *variant*. `link`
  is both nav's structural theme slot and a Nuxt button-variant value; the grammar consumed it as a
  variant before slot routing could claim it. A `variantShadowsSlot` guard in `heuristicSlotMapping`
  plus a `componentSlots` guard in `parseSegments` make a 2nd-segment that is one of the component's
  own slots win over the variant interpretation. Scoped by slot-membership, so `button-link-*` (button
  has no `link` slot) is unchanged. This makes nav's flagship "design the link slot" insight reachable
  — supplying `nav-link-*` tokens now turns it green in the coverage view.

## [0.28.14](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.14) — 2026-06-16

### Added

- **Coverage engine** (`src/coverage.ts`) — `coverageFor(graph, component)` joins the
  five-composite anatomy spec to a live `TokenGraph` and returns, per component, every theme slot
  with its `structural`/`optional` classification, a `controls` label, and whether any token routes
  to it (`touched`) — plus a `toDesign` list of the un-designed slots, **structural-missing first**.
  Pure, read-only projection over the immutable graph (same contract as the renderers); returns
  `null` for uncurated components. This is Step 2 of the Design-System Coverage Guide; no
  user-facing view consumes it yet. Validated against the live export: nav still needs `link`,
  accordion `trigger`/`body`, modal `body`/`title`; table and dropdown are fully covered.
- Overlay-context deltas (`*-overlay-(dark|light)-*`) are excluded from coverage (they're a separate
  recipe), while the modal `overlay` **slot** (`modal-overlay-bg`) is correctly counted.

### Notes

- TDD surfaced a **nav `link` collision**: `link` is both nav's structural slot and a Nuxt
  button-variant value, so `nav-link-*` tokens route to `slots.base` + variant rather than the
  `link` slot. The engine faithfully reports what the recipe would contain; resolving the collision
  is a separate grammar/anatomy concern, flagged for the upcoming coverage view.

## [0.28.13](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.13) — 2026-06-16

### Added

- **Anatomy for the remaining four composites** — `component-anatomy.ts` now curates `accordion`,
  `dropdown`, `table`, and `modal` (alongside `nav`), completing the five-composite anatomy spec
  that backs the coverage guide. Each is grounded in the live Nuxt UI v4 theme and covers 100% of
  its `NUXT_SLOTS`. Structural sets (Must-Design): accordion = `item`/`trigger`/`body`,
  modal = `overlay`/`content`/`body`/`title`, table = `th`/`td`, dropdown = `content`/`item`.
  Tests are now data-driven across all five (coverage + structural-set + shape invariants).

### Changed

- **`nav` structural set tightened to `link`** under the locked "Must-Design" principle (a slot is
  structural only if a designer must supply tokens to match it — bg/border/text/padding). nav's
  `root` (gap/layout), `list` (flex), and `item` (py-spacing) moved to `optional` (Nuxt's defaults
  already match; flagging them "design this" would be noise). This is why the guide will show the
  user's `nav-item-*` tokens (on the optional `item`) next to the empty structural `link` — the
  "you styled item, design link" insight. Additive/internal — no user-facing behaviour yet.

## [0.28.12](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.12) — 2026-06-16

### Added

- **Component-anatomy layer (coverage-guide foundation)** — `packages/grammar/src/component-anatomy.ts`
  classifies each Nuxt UI theme slot as `structural` (must design to match the base component) or
  `optional` (adornment / variant / sub-feature), with a one-line "what it controls." Seeded with
  `nav` (all 30 `NavigationMenu` slots; structural = `root`/`list`/`item`/`link`), grounded in the
  Nuxt UI v4 theme. A 100%-coverage test ties the anatomy to `NUXT_SLOTS`. Additive data — no
  user-facing behaviour yet; it backs the upcoming design-coverage guide (see
  `docs/superpowers/specs/2026-06-16-component-anatomy-nav-design.md` and the office-hours design
  doc).

## [0.28.11](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.11) — 2026-06-16

### Fixed

- **Sidebar preview item collapsed to ~16px** — `sidebar-item-icon-size` was emitted as `size-4`
  on the custom recipe's `item` slot (sidebar is custom and has no icon slot to route to, so the
  v0.28.10 fix couldn't reach it). An unroutable `icon-size` that lands on a layout-container slot
  (`item` / `content` / `root` / `wrapper`) is now dropped instead of collapsing the container.
  Leaf slots keep their icon size — chip's `close` button is unchanged (it's not a container).
  This closes the last collapsed preview from the live export (accordion / nav / sidebar all fixed).

### Notes

- Separate remaining chip item: `chip-close-icon` (a colour-valued token) mis-emits an inert
  `size-[#hex]` because the `icon` rule is value-type-blind — a different, low-priority follow-up.

## [0.28.10](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.10) — 2026-06-15

### Fixed

- **Nav preview item collapsed to ~20px** — `nav-item-icon-size` was emitted as `size-5` on
  `slots.item`, overriding the item's `h-[60px]`. The v0.28.8 icon-size fix only matched a
  `leadingIcon` slot, but nav's leading-icon slot is `linkLeadingIcon`. A new
  `leadingIconSlotFor(component)` now derives the leading-icon slot from `NUXT_SLOTS`
  (`leadingIcon` / `linkLeadingIcon` / `itemLeadingIcon`), so `nav-item-icon-size` routes to
  `linkLeadingIcon` and the item renders full-width (verified: 20px → 384px×60px in the
  preview). accordion (`leadingIcon`), bare icon-size, explicit icon prefixes
  (`button-trailingIcon-icon-size`), and chip/sidebar (no leading-icon slot) are unchanged.

### Notes

- Remaining nav follow-ups (unmapped): `nav-item-ring-radius`, `nav-item-focus-offset`,
  `nav-item-outline-text-inverted`, `nav-item-link-text-visited` — separate, lower-priority.

## [0.28.9](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.9) — 2026-06-15

### Added

- **`data-[state=open]:` state prefix** — `accordion-item-text-opened` (the accordion item's
  text colour when expanded) previously mapped to `null` and was dropped. The grammar now
  recognises the `opened` / `open` state and maps it to Reka's `data-[state=open]` data-variant,
  so the token emits `data-[state=open]:text-[…]` on `slots.item` (matching Nuxt UI v4's
  Reka-driven open state). The recipe engine already prepends the prefix verbatim, so no engine
  change was needed. Existing pseudo-class states (hover/focus/active/disabled/checked) are
  unchanged.

### Notes

- Rendering the opened state in the live preview is separate follow-up (`projectToState` /
  `LiveAccordion` have no open/closed projection yet). Other data-state mappings
  (`active` / `selected` → data-variants) remain a separate semantic decision.

## [0.28.8](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.8) — 2026-06-15

### Fixed

- **Accordion preview item collapsed to ~20px** — `accordion-item-icon-size` was emitted as
  `size-5` on `slots.item` (the item box), because `matchParsed` forced the icon rule's
  `leadingIcon` slot onto the `item` sub-element prefix. An `icon-size` utility now keeps the
  icon slot when the sub-element prefix is a non-icon container and the component actually has
  that icon slot (`nuxtSlotsFor(component).has("leadingIcon")`), so the size lands on
  `leadingIcon` / `trailingIcon` (the chevron) and the item renders at its natural width
  (verified: 20px → 384px in the preview). An explicit icon-slot prefix
  (`button-trailingIcon-icon-size`) is respected unchanged; nav / chip / sidebar (no
  `leadingIcon` slot) are unchanged.

### Notes

- Remaining accordion follow-ups: `accordion-item-text-opened` (open-state colour, needs the
  `data-[state=open]:` prefix form) and `nav-item-icon-size` (nav's icon slot is
  `linkLeadingIcon`) are still routed as before — separate, lower-priority work.

## [0.28.7](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.7) — 2026-06-15

### Fixed

- **`accordion` / `nav` live previews were unreachable** — their tokens are prefixed
  `accordion-item-*` / `nav-item-*`, so the token tree grouped them as `accordion-item` /
  `nav-item`, which didn't match the `accordion` / `nav` keys in `COMPONENTS_WITH_PREVIEW`.
  Clicking those groups showed no preview, no "Live" pill, and they were missed by the Live
  count. A shared `previewComponentForGroup` helper now maps a `<comp>-item` group to its
  preview component at all three seams (selection routing, the "Live" pill / `liveOnly`
  filter, and the Live count). Overlay / layout / typography groups are untouched (they
  don't end in `-item`).

### Notes

- The accordion recipe still has two latent issues that this fix makes visible (confirmed in
  the browser: the `accordion-item-icon-size` token lands on `slots.item` as `size-5`, so the
  item renders ~20px wide, and `accordion-item-bg` is dropped so the item is transparent).
  Those change emitted `app.config.ts` output and are a separate follow-up.

## [0.28.6](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.6) — 2026-06-15

### Fixed

- **Live previews dropped all-sides padding** — the recipe engine emits a single padding token
  as the shorthand `p-[..]`, but `extract-arbitrary.ts` mapped only the per-axis forms
  (`px`/`py`/`pl`/`pr`/`pt`/`pb`), so `p-[24px]` and friends fell through unresolved and rendered
  as **zero padding** on the `card`, `modal`, `dropdown`, `switch`, `checkbox`, and `radio`
  previews (content jammed to the edges, a strong deviation from the Figma source). Added `p` →
  `padding` to `ARBITRARY_TO_CSS`. (The scale-class path already handled `p`; only the
  arbitrary-value path was missing it.) Regression test added — this is the JIT-class preview
  pitfall, now guarded for the shorthand.

## [0.28.5](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.5) — 2026-06-15

### Docs

- **Color value format documented** — the README's *What it accepts* section now states the
  color `$value` contract: color tokens must use Figma's object form
  (`{ components, alpha?, hex }`), and a bare DTCG hex string (`"$value": "#09090B"`) is
  reported as a `malformed-value` issue. Confirmed by-design — the inspector is a Figma-export
  adapter, not a general DTCG validator; only `color` requires the object form.

## [0.28.4](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.4) — 2026-06-15

### Tests

- **`App.vue` scan-view toggle characterization** — `src/app/App.scan-view.test.ts` mounts the app
  and asserts the issues toggle: the button is hidden for a graph with no issues, present for one
  with issues, and clicking it switches `state.view` so `ScanView` mounts/unmounts (with
  `aria-pressed` tracking). Completes the `App.vue` mount-test coverage.

### Changed

- The scan/issues toggle button gains `data-testid="scan-toggle"` (test hook). Additive — no
  behavior change.

## [0.28.3](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.3) — 2026-06-15

### Tests

- **`App.vue` output-tab characterization** — `src/app/App.output-tabs.test.ts` mounts the app
  with a custom-flagged (`sidebar`) fixture to assert the conditional `custom-components.ts` tab
  appears, is absent for a plain component, and that the active-tab fallback watch resets the
  output tab to `tokens.css` when the selected tab disappears (custom tab selected → graph
  cleared → reload a plain set → tab falls back).

### Changed

- The clear-graph (Re-drop) button gains `data-testid="clear-graph"` (test hook). Additive — no
  behavior change.

## [0.28.2](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.2) — 2026-06-15

### Tests

- **`App.vue` view-state characterization** — `src/app/App.view-state.test.ts` mounts the app
  and asserts the four app-level view-state behaviors: the theme toggle flips the
  `document.documentElement` `dark`/`light` class, the live-filter chip flips its `aria-pressed`,
  the output tabs switch the selected tab, and selecting a component-layer node auto-switches the
  output tab to `app.config.ts`.

### Changed

- Output-tab buttons now carry `role="tab"` + `aria-selected` (a tablist a11y fix and the test
  seam). Additive — no behavior change.

## [0.28.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.1) — 2026-06-15

### Tests

- **`App.vue` preview-routing characterization** — `src/app/App.preview-routing.test.ts`
  mounts the app, stubs every `Live*` with a name-emitting stub, and drives selection through
  the `ComponentTree` events to assert that each `COMPONENTS_WITH_PREVIEW` member routes to its
  own preview in **both** template chains (token-selected and component-group), and that the
  `LiveButton` catch-all never fires for a non-button component. Also asserts an unsupported
  component (`tooltip`) renders no preview. Closes the one untested seam in `App.vue` — the
  routing footgun where a forgotten branch silently renders button-shaped. No production change.

## [0.28.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.28.0) — 2026-06-15

Live previews for `chip` and `sidebar` — the two custom-recipe components. **Every component now has
a live preview in the Inspector.**

### Added

- **`useCustomPreviewRecipe` composable** — like `usePreviewRecipe`, but builds via
  `buildCustomRecipes(graph, customParts, {})` instead of `buildComponentRecipes`, so previews can
  render components that emit to `custom-components.ts` rather than `app.config.ts`. The shared size
  logic is factored into `representativeSizeClasses(recipe)`, used by both composables.
- **`LiveChip`** — a pill per colour: `default` + each `variants.color.*` (`error`, `success`), each
  rendering `slots.base` + `slots.label` + a `×` from `slots.close`.
- **`LiveSidebar`** — a `slots.base` panel containing three `slots.item` rows (resting / hover /
  active).

Both take a `customParts` prop (App.vue's existing `customPartsByComponent` computed) and are wired
into both Inspector preview panes.

### Notes

- The chip `close` slot carries an export data quirk (`close-color` tokens map to `size-[#hex]`);
  rendered as-is, harmless (the junk class doesn't style the `×`).
- This completes the preview work: **every standard and custom component renders.** Only the
  data-blocked items remain — `tooltip`/`popover` recipes, the `compoundVariants` emit path, and the
  `data-[state=…]:` prefix form — all waiting on tokens that don't exist in the export yet.

## [0.27.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.27.0) — 2026-06-15

Live previews for the five multi-element components — `modal`, `dropdown`, `accordion`, `nav`,
`table` now render in the Inspector instead of showing an info pill.

### Added

- **`LiveModal`** — a content panel on a dimmed overlay (`content` + `overlay` slots).
- **`LiveDropdown`** — a menu surface (`content`) with three item rows: resting / hovered / active
  (the `item` slot's `hover:`/`active:` states promoted to applied styles via `projectToState`).
- **`LiveAccordion`** — header rows in resting + disabled states (`item` slot).
- **`LiveNav`** — one item row per variant (`outline`/`ghost`/`link`); the colours live in the
  `variants.variant.*.item` classes, so each variant is rendered from its merged base+variant classes.
- **`LiveTable`** — a mini table: header (`th`) + body (`td`) cells inside the `base` wrapper.

All reuse the v0.26.0 pattern (`usePreviewRecipe` + `extractArbitrary(projectToState(...))` → inline
styles, JIT-safe), show a fallback message when the component has no tokens, and are wired into both
Inspector preview panes.

### Notes

- Representative fidelity — each preview shows the states/variants its recipe defines, not an
  exhaustive matrix.
- Tier-3 custom-recipe previews (`chip`, `sidebar`, rendered from `custom-components.ts` rather than
  `ui.*`) remain deferred, along with the data-blocked items (`tooltip`/`popover`, `compoundVariants`).

## [0.26.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.26.0) — 2026-06-15

Live previews for `card`, `kbd`, and `progress` — you can now *see* these recipes render in the
Inspector, not just read their classes. Built on a shared preview composable.

### Added

- **`usePreviewRecipe` composable** (`src/app/composables/use-preview-recipe.ts`) — builds a
  component recipe and exposes the representative `sizeClasses` (md, else smallest). De-duplicates the
  recipe-build + `SIZE_ORDER`/`sizeClasses` logic that was copy-pasted in the `checkbox` and `radio`
  previews (now refactored onto it).
- **`LiveCard`** — renders the `card` `root` slot (bg / ring / padding / radius) as a styled box.
- **`LiveKbd`** — renders the `kbd` `base` slot as a styled keycap.
- **`LiveProgress`** — renders the `progress` track (`base` slot + size→height) with an `indicator`
  fill at 60%.

All three resolve their recipe classes to inline styles (JIT-safe, same as the existing previews) and
show a fallback message when the component has no tokens. Wired into both Inspector preview panes.

### Notes

- `switch` was left on its own size-switcher logic (it's the Badge/Button archetype, not the simple
  md-or-first `sizeClasses`) — folding it onto the composable would have changed its behavior. Only
  `checkbox`/`radio` were refactored.
- Deferred to later releases: Tier-2 previews (`modal`, `dropdown`, `accordion`, `nav`, `table`) and
  Tier-3 custom-recipe previews (`chip`, `sidebar`).

## [0.25.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.25.0) — 2026-06-15

Checked×color fills route to the `indicator` slot — `checkbox`/`radio` checked-state color tokens now
emit where Nuxt UI v4 actually styles them. (The `compoundVariants` emit path was investigated and
deferred — see Notes.)

### Changed

- **A `checked` bg-color fill routes to the `indicator` slot** (`@tg/grammar`, `matchParsed`). The 6
  `checkbox/radio/switch-bg-checked-{error,success}` tokens previously emitted
  `variants.color.<role>.base: "checked:bg-[…]"` — a `checked:` pseudo-prefix that Nuxt UI v4's
  Reka-based checkbox/radio don't use. They now emit `variants.color.<role>.indicator: bg-[…]`
  (the indicator embodies the checked state, so the prefix is dropped), matching the Nuxt theme. The
  rule fires only for components with an `indicator` slot (consults `nuxtSlotsFor`), so **switch is
  unchanged** (no indicator slot — Nuxt keeps its checked fill on `base`). Scoped to `bg-color`:
  `checkbox-border-checked` (→ ring-color) is unaffected.
- **`LiveCheckbox` / `LiveRadio` previews** read the checked fill from the `indicator` slot, so the
  checked cell still renders its background after the routing change.

### Notes

- **`compoundVariants` emit path: deferred.** Probing all 914 export tokens found no `variant×color` /
  `size×variant` / `color×highlight` tokens — the only input a compoundVariants emit path would
  consume — so building that infrastructure would serve zero tokens. The 125 `variant+state` tokens
  already emit correctly (state as a CSS pseudo-prefix within the single variant axis). Revisit when
  the export gains such tokens.
- Follow-up: the prop/data-state prefix *form* (`checked:` vs `data-[state=checked]:`) for switch and
  other Reka components is a broader state-syntax concern, out of scope here.
- Verified against the live export: checkbox/radio error+success fills on `indicator`; switch unchanged.

## [0.24.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.24.0) — 2026-06-14

Progress component recipe — the `progress-fill-bg` / `progress-track-bg` tokens now route to their
Nuxt UI v4 slots, completing the `ui.progress` recipe (6/6 tokens mapped, was 4/6).

### Added

- **`progress` registered in `NUXT_SLOTS`** (`root, base, indicator, status, steps, step`) and two
  `FIGMA_NUXT_PART_ALIAS` entries — `fill → indicator`, `track → base`. The Figma part names route to
  the Nuxt slots via the v0.19.0 alias seam: `progress-fill-bg` → `slots.indicator` (the fill bar),
  `progress-track-bg` → `slots.base` (the rail). `progress-radius` (→ `slots.base rounded`) and
  `progress-height-{sm,md,lg}` (→ `variants.size`) already mapped. Purely additive grammar vocabulary;
  no renderer / scanner / allow-list change (progress was already allow-listed).

### Notes

- Verified against the live export: `slots.base` (track bg + radius), `slots.indicator` (fill bg),
  `variants.size` sm/md/lg → `h-[4px]`/`h-[8px]`/`h-[12px]`.
- The aliases are global but ripple-free: `fill`/`track` appear on *only* `progress` in the export, and
  an alias fires only when its target slot exists for the component.
- **`tooltip` / `popover` were checked and have zero tokens** in the export — not registered (would be
  speculative vocab). **`kbd`** already emits a correct `slots.base` recipe (Nuxt base slot *is* `base`)
  — unchanged.

## [0.23.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.23.0) — 2026-06-14

Inspector badge parity — the live view now classifies typography-role and layout-primitive tokens as
`theme`, matching the `--text-*` / `--container-*` / `--spacing-*` / `--radius-*` vars the renderer
emits (v0.20.0 + v0.21.0). Closes the loose end shared by those two features.

### Fixed

- **Typography roles and layout primitives no longer read as `skip` in the Inspector.** They emit
  `@theme` vars in the CLI/download but were authored in the `global` source → component layer, so
  `classifyToken` skipped them — the row badge showed `skip`, the summary counted them under
  `skipped`, and the detail panel showed a false "⚠ No Tailwind utility mapping". `useClassifications`
  now overrides those tokens to the existing `theme-static` kind (via the renderer pre-passes
  `collectTypographyComposites` / `collectLayoutPrimitives`), so the badge, summary count, filter, and
  detail panel (CSS variable + value + Copy var()) all reflect the real emit.

### Notes

- One seam: a pure `buildInspectorClassifications(graph)` in `src/app/classifications.ts` that everything
  downstream already consumes. No new `ClassificationKind`, no `classify-token.ts` or renderer change,
  CLI untouched.
- Reuses the existing `theme` badge — these genuinely are theme vars.
- Deduped page-width tokens (e.g. `page-max-width-narrow`, folded into `--container-narrow`) and
  component-recipe tokens (card/dropdown/modal/button/…, which already surface their recipe classes)
  correctly stay `skip`.

## [0.22.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.22.0) — 2026-06-14

Component recipes for `card` / `dropdown` / `modal` — a per-component default base slot so their
bare tokens route to the correct Nuxt UI v4 slot, plus modal's overlay backdrop on its own slot.

### Changed

- **Per-component default base slot** (`@tg/grammar`). Bare component tokens previously defaulted to
  `slots.base`, but Nuxt UI v4 names the styling base differently per component. A new
  `COMPONENT_BASE_SLOT` map (`card → root`, `dropdown → content`, `modal → content`) + `defaultBaseSlot()`
  helper drives `matchParsed`'s default; every other component keeps `base`. This corrects the existing
  (already allow-listed) emit: `card` surface tokens now land on `slots.root`, `dropdown`/`modal` bare
  tokens on `slots.content`. `card`/`modal` are added to `NUXT_SLOTS` (dropdown was already there).
- **An `overlay` slot wins over the `overlay-bg` utility.** `modal-overlay-bg` matched the `overlay-bg`
  base utility and collided with the modal content `bg` on one slot. A guard in `heuristicSlotMapping`
  routes it to `slots.overlay` when the component has an `overlay` slot (only modal today — zero ripple).

### Notes

- Verified against the live export: `card` → `slots.root`; `dropdown` → `slots.content` + `slots.item`;
  `modal` → `slots.content` + `slots.overlay` (no bg collision).
- Deferred stragglers (NULL by design): `dropdown-item-hover-bg` (mid-token state — a duplicate of
  `dropdown-item-bg-hover`, same value) and `dropdown-item-text-muted` (`muted` is not a color-role key).
- No `COMPONENT_ALLOW_LIST` or renderer change — the three were already allow-listed; this fixes the
  slot they emit to.

## [0.21.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.21.0) — 2026-06-14

Layout-primitive theme export — the `container` / `page` / `grid` / `stack` / `section` primitives now
emit as Tailwind v4 `@theme` utilities, completing the CSS-var emit that v0.17.0 (Bucket E) deferred.

### Added

- **Layout primitives → Tailwind v4 `@theme` utilities** (`src/renderers/layout-primitives.ts`). The 24
  `container`/`page`/`grid`/`stack`/`section` tokens are authored in the `global` source → component
  layer, so `classifyToken` skips them. A renderer-owned pre-pass re-surfaces them via a deterministic
  id→namespace mapping: widths (`…max-width…`) → `--container-*` (`max-w-*`), gaps/paddings
  (`…gap…`/`…padding…`) → `--spacing-*` (`p-`/`px-`/`py-`/`m-`/`gap-*`), radii (`…radius…`) →
  `--radius-*` (`rounded-*`), and `grid-columns` as a plain `--grid-columns` var (no namespace fits a
  raw column count). `classify-token.ts` is untouched (same rationale as v0.20.0). They land in a new
  **"Layout Primitives"** `@theme` section.

### Notes

- **Container & page widths dedupe** into one `--container-*` scale (their values are identical:
  1280/960/720). Guard: if a variant's values ever diverge, both are kept and the non-container family
  is qualified (`--container-page-<variant>`) — never silently overwritten. The bare `max-width` (no
  variant) becomes `--container-default`.
- **Spacing keys drop the axis** (`x`/`y`) — Tailwind spacing is axis-agnostic, so `section-padding-y-lg`
  → `--spacing-section-lg` and the designer picks `py-section-lg`.
- Verified against the live 914-token export: 21 entries (24 source − 3 deduped page widths).
- The Inspector live per-token badge still shows these as `skip: component-layer`; the CLI and in-app
  download (same renderer) include them. Inspector badge parity is a follow-up.
- `output/css/tokens.css` is a gitignored build artifact; the local `components/` fixture has none of
  these tokens (they exist only in the live export), so unit tests on synthetic ids are authoritative.

## [0.20.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.20.0) — 2026-06-14

Typography theme export — the per-role type scale now emits as Tailwind v4 canonical composite
`--text-<role>` custom properties, and the primitive letter-spacing / line-height tokens are routed
under Typography instead of leaking into Primitive Colors.

### Added

- **`--text-<role>` composite type scale** (`src/renderers/typography-composites.ts`). The roles
  `typography-heading-1-*` / `typography-heading-2-*` are authored in the `global` source → component
  layer, so `classifyToken` skips them. A renderer-owned pre-pass re-surfaces the roles that define a
  font-size as the Tailwind v4 canonical composite form — `--text-<role>` (font-size) plus
  `--text-<role>--line-height` / `--letter-spacing` / `--font-weight` companions — which Tailwind
  consumes to generate a `text-<role>` utility that sets all four at once. `classify-token.ts` is
  untouched (no new `Classification` kind, which would ripple to four switch sites).

### Changed

- **`sectionFor` routes primitive `--letter-spacing-*` and `--line-height-*` under "Non-default
  Typography".** They previously fell through to the Primitive Colors fallback because only the
  `--tracking-` / `--leading-` prefixes were recognised.
- **The source typo `typography-heading-2-line-heigth` is normalized in the composite output**
  (`line-heigth` → `--text-heading-2--line-height`) so heading-2 still gets a correctly-named
  modifier. The scanner's `possible-typo` detector is untouched, so the source repo is still flagged
  (`build:tokens` keeps warning). Unitless line-height role values get a `px` length (a unitless
  `--text-*--line-height` would be a CSS multiplier).

### Known boundaries

- **Only roles with a font-size become composites** (`heading-1`, `heading-2`). `typography-body-color`
  and `typography-label-color` are colors (Tailwind's `--text-*--*` modifiers do not include color),
  and `typography-label-letter-spacing` has no base font-size — they remain skipped, no behavior change.
- The Inspector's live per-token badge still shows these roles as `skip: component-layer`; the CLI and
  the in-app download (same renderer) include the composites. Inspector badge parity is a follow-up.
- `output/css/tokens.css` is a gitignored build artifact (regenerate with `npm run build:tokens`).

## [0.19.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.19.0) — 2026-06-14

Honour part aliases in slot routing — a Figma part name (`row`, `divider`, `check`, `dot`) routes to
its Nuxt slot, so `radio-dot-*` tokens map to the `indicator` slot instead of reading as NULL.

### Changed

- **`parseSegments`' `slotPrefix` seam consults `FIGMA_NUXT_PART_ALIAS`.** The grammar's sub-element
  routing already matched a segment that is exactly a Nuxt slot; it now also honours the curated
  Figma→Nuxt rename map (`{ row→tr, divider→separator, check→icon, dot→indicator }`) — exact match
  first, then the alias to the Nuxt slot name. This unblocks the 5 `radio-dot-*` tokens (`color`,
  `color-disabled`, `color-error`, `color-success`, `size-md` → the `indicator` slot), including the
  two Bucket C stragglers `radio-dot-color-{error,success}`. Additive: the alias fires only when an
  exact match fails and the alias target is a real slot of the component.
- **The `unsupported-part` "rename X→Y" hint skips aliased-routable parts.** Since the grammar now
  routes these parts, the scanner's rename suggestion (`up-table-row`, `up-table-divider`,
  `up-radio-dot`) is obsolete and is retired. Genuinely-foreign parts (e.g. chip's `label`/`close`,
  which are not in the alias map) are still flagged.

### Known boundaries

- `table-row-hover-bg` / `table-row-selected-bg` (a mid-token state — `row-hover-bg`) and
  `table-divider` (no utility segment after the slot) stay NULL — separate token-shape issues the
  alias does not touch, now silent (no misleading rename hint). Deferred to a future state-ordering /
  bare-slot effort.
- The committed `components/` fixture has the `table-row-*` / `table-divider` tokens (so the
  `build:tokens` rename hints disappear) but no `radio-dot-*`; the unit tests on synthetic ids are
  authoritative for the new mappings.

## [0.18.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.18.0) — 2026-06-14

Sidebar as a known-custom component (Bucket D, part 2) — the export's `sidebar` tokens emit a custom
recipe, since Nuxt UI v4 (free) has no sidebar component. This completes all five new-export mapping
buckets (A–E).

### Added

- **`KNOWN_CUSTOM_COMPONENTS` registry** (in `@tg/grammar`) — components with no Nuxt UI recipe that
  the inspector emits as hand-anatomy custom recipes, independent of the scanner's
  `component-looks-custom` flag. Maps a component to its routable sub-element slots; currently
  `sidebar → ["item"]`.
- **`sidebar` custom emit.** `customPartsByComponent` seeds the registry before the scanner-flagged
  entries, so both the CLI (`build-cli.ts`) and the web (`App.vue`) — which derive `customParts` from
  that one function — emit `export const sidebarRecipe` into `output/nuxt/custom-components.ts`. The
  recipe has a `base` slot (bg / border / padding-x/y / width) and an `item` slot (bg and text with
  `active:` / `hover:` prefixes, icon-size / padding-x/y / radius). On the real export, 13 of 16
  `sidebar-*` tokens map. The registry bypasses the `component-looks-custom` flag (which skips
  components with no `NUXT_SLOTS` entry), keeping `NUXT_SLOTS` and `COMPONENT_ALLOW_LIST` Nuxt-only.

### Known boundaries

- 3 straggler tokens stay NULL: `sidebar-section-label-{color,size}` (the two-word `section-label`
  sub-element does not route — the same multi-segment / camelCase slot limit as nav's `childLink`)
  and `sidebar-width-collapsed` (`collapsed` is not a `STATE_KEY`).
- `buildCustomRecipes` skips components with no matching tokens, so a project without `sidebar`
  tokens (including the committed `components/` fixture) emits no empty `sidebarRecipe` — a no-op
  there; the unit tests on synthetic graphs are authoritative.

## [0.17.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.17.0) — 2026-06-14

Reclassify layout / typography primitives (Bucket E) — the export's type-scale and layout tokens
(`typography-*`, `container-*`, `page-*`, `grid-*`, `stack-*`, `section-*`) stop reading as "unmapped
components" and are reported honestly as theme/CSS primitives.

### Added

- **`NON_COMPONENT_PREFIXES`** (in `@tg/grammar`) — the six top-level prefixes that are layout /
  type-scale primitives, not Nuxt components (`typography`, `container`, `page`, `grid`, `stack`,
  `section`). They are authored in the `global` source, so `buildGraph` classifies them as
  component-layer; this set lets the scanner tell them apart from genuine components.
- **`OutputForecast.nonComponentPrefixes`.** The scan forecast (`computeForecast`) now splits the
  not-in-`COMPONENT_ALLOW_LIST` prefixes into `nonComponentPrefixes` (the known primitives) and
  `unmappedComponentPrefixes` (genuine unsupported components — e.g. `sidebar`, which stays flagged
  because it really is a component awaiting a custom emit). `ScanView` renders an honest
  "Layout/typography primitives (theme/CSS, not `ui.*` recipes): …" line beside the "Unmapped:" one.
  Real-export split: non-component = `container, grid, page, section, stack, typography`; unmapped =
  `sidebar`.

### Known boundaries

- **Suppress-the-noise scope only.** These tokens stay component-layer (`classifyToken` still skips
  them, so no CSS is emitted) and remain under the Components UI tab. Emitting them as `@theme` CSS
  custom properties (with canonical Tailwind names) is deferred to the separate fonts-pipeline
  effort — reclassifying to the `primitive` layer would have emitted raw, non-canonical
  `--typography-*` / `--grid-*` vars.
- `NON_COMPONENT_PREFIXES` is a closed set matched to the current export; a future primitive family
  would read as an unmapped component until added — a visible, self-correcting signal.

## [0.16.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.16.0) — 2026-06-13

Accordion as a Nuxt-native component (Bucket D) — the new export's `accordion-item-*` tokens now map
to a `ui.accordion` recipe by registering `accordion` in the component vocabulary. `sidebar`
(no Nuxt UI v4 recipe) is deferred to a separate effort.

### Added

- **`accordion` allow-list component.** `accordion` is added to `NUXT_SLOTS` (the Nuxt UI v4 Accordion
  theme slots — `root` / `item` / `header` / `trigger` / `content` / `body` / `leadingIcon` /
  `trailingIcon` / `label`) and to `COMPONENT_ALLOW_LIST`. These two purely-additive vocabulary
  entries are all it takes: the existing sub-element routing and `appConfigRenderer` then map the
  18 `accordion-item-*` tokens to `ui.accordion.slots.item` (14 map — `bg`, `border` →
  `border-color` since accordion is not ring-framed, `text`, `font-size`, `font-weight`, `gap`,
  `padding-x/y`, `icon-size`, `line-height`, `letter-spacing`, `ring-width`, with trailing
  `disabled` states as `disabled:` prefixes). Because `item` is a real Nuxt slot, `accordion` is not
  flagged `component-looks-custom` — it emits as `ui.accordion`, not `custom/accordion`. Verified on
  the real 914-token export.

### Known boundaries

- 4 `accordion-item-*` straggler tokens stay NULL and are deferred: `border-focus-ring`,
  `focus-offset`, `ring-radius` (non-standard utility names — a data-quality concern) and
  `text-opened` (`opened` is a real accordion state but not a `STATE_KEY`; adding it globally would
  affect every component).
- `sidebar` (16 tokens) is not done — Nuxt UI v4 (free) has no sidebar component, so it needs
  invented anatomy and a custom emit; a separate later effort.
- The real `accordion-*` tokens live only in the 914-token export, not the committed `components/`
  fixture, so this is a no-op on the local `build:tokens` digest; the unit tests (synthetic graph)
  are authoritative.

## [0.15.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.15.0) — 2026-06-13

Trailing colour-roles on the general path (Bucket C) — form-control tokens whose Nuxt colour-role is
named last (`checkbox-bg-error`, `switch-thumb-color-success`, `checkbox-bg-checked-error`) now map
to `variants.color.{error,success}` instead of falling to a NULL mapping, the same way the custom
path already handled `chip`.

### Added

- **`variants.color.{error,success,…}` for non-custom form controls.** `checkbox` / `radio` /
  `switch` / `input` / `textarea` tokens whose colour-role sits in the trailing position now emit a
  colour variant carrying the designer's exact value — with `border→ring` for ring-framed components
  and a trailing `-checked-` state preserved. 26 previously-dropped tokens map (2 stragglers remain;
  see Known boundaries).

### Changed

- **`normalizeTrailingColorRole` promoted into `@tg/grammar`.** It moves out of
  `src/custom-recipe-engine.ts` and runs once at the `heuristicSlotMapping` entry, so the renderer,
  the scanner, and the custom path all classify a trailing colour-role identically — a single source
  of truth (the custom path's own call becomes a redundant no-op). A `STATE_KEYS` guard keeps a
  trailing `default` a state: `default` is both a colour-role alias and the "default state" suffix
  (the only `COLOR_ROLE_KEYS` ∩ `STATE_KEYS` overlap), and without the guard `button-solid-text-default`
  regressed to NULL on the general path.

### Removed

- **`validation-color-via-prop` scanner rule.** It fired only when a `<comp>-border-<role>` token
  failed to map; those tokens now map (the role is a colour-role the grammar normalises), so the
  rule was unreachable and is removed along with its `isValidationColorBorder` helper. It previously
  reframed these NULLs as "Nuxt applies validation colour via the `color` prop" — the inspector now
  emits the designer's values directly as `variants.color.*`.

### Known boundaries

- `radio-dot-color-{error,success}` still map to NULL — they normalise to `radio-error-dot-color`,
  but `dot` is not recognised as a `radio` slot on the general path (needs the `dot→indicator`
  alias; `buildGraph` lowercases ids). Deferred.
- The emitted `variants.color.*` assumes Nuxt UI v4 accepts `error`/`success` as `color` variant
  keys for these components (the standard semantic aliases) — no capability gate.
- Unlike the v0.12.0 (overlay) and v0.14.0 (nav) buckets, this is visible on the committed
  `components/` fixture: the `build:tokens` digest loses its `validation-color-via-prop` warnings and
  gains `variants.color.*` blocks, and the `recipe-engine` golden snapshot was regenerated.

## [0.14.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.14.0) — 2026-06-13

Variant-after-sub-element mapping (Bucket B) — `nav` component tokens whose Nuxt variant or `overlay`
marker sits *after* a sub-element slot (e.g. `nav-item-ghost-bg`, `nav-item-overlay-dark-ghost-bg`)
now map instead of falling to a NULL mapping, and `nav` overlay recipes — deferred in v0.12.0 —
finally emit.

### Added

- **`navOverlayDark` / `navOverlayLight` recipes.** `stripOverlayPrefix` now recognises an
  `overlay-<mode>` marker sitting after a recognised sub-element slot
  (`nav-item-overlay-dark-ghost-bg` → logical `nav-item-ghost-bg`, mode `dark`, resolved via
  `nuxtSlotsFor`), so the already component-agnostic `buildOverlayRecipes` emits sparse
  `navOverlay{Dark,Light}Recipe` deltas into `output/nuxt/custom-components.ts` — closing the nav
  gap left open in v0.12.0.

### Changed

- **`parseSegments` detects a variant / color-role after a sub-element slot.** The grammar
  previously recognised a Nuxt variant (`ghost`/`link`/…) or color-role only at the fixed 2nd
  segment, so `nav-item-ghost-bg` (where `item` is the slot) leaked `ghost-bg` into the utility
  string and went NULL. A new post-`slotPrefix` check honours both `BUTTON_VARIANT_KEYS` and
  `COLOR_ROLE_KEYS`. It fires only on the fallback routing pass (guarded by `slotPrefix !== null`),
  so the normal first pass — and every variant-at-2nd-segment token like `button-ghost-bg` — is
  unchanged. ~35 NULL nav tokens now map to `{ slot: "item", variantAxis: "variant", … }`.

### Fixed

- **`localStorage` restored in the jsdom test environment under Node 26.** Node 22+ exposes a native
  `localStorage` global that returns `undefined` unless `--localstorage-file` is passed; under Node
  26 it shadowed jsdom's own `localStorage` in Vitest (while `sessionStorage` came through),
  breaking the `CommitPanel` / `GitLoader` component tests and blocking the pre-commit gate. A
  `setupFiles` polyfill (`src/test-setup.ts`) installs an in-memory `Storage` when a DOM is present
  and `localStorage` is missing; node-environment engine tests have no `window` and are untouched.

### Known boundaries

- `link` as a *slot* (`nav-link-…`) vs `link` as a *variant* is a pre-existing 2nd-segment
  ambiguity; nav's real tokens use `item` as the slot, so it does not bite them.
- camelCase child slots (`childLink`, `linkLeadingIcon`) stay unreachable because `buildGraph`
  lowercases token ids — a separate issue.
- The real `nav-item-*` tokens live only in the 914-token export, not the committed `components/`
  fixture, so the unit tests are authoritative; the local CLI scan digest is unchanged (a no-op
  there).

## [0.13.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.13.0) — 2026-06-12

Typo / did-you-mean detector — a designer who misspells a token segment (`line-heigth`,
`badge-letter-spaching`) now gets a concrete "did you mean `height`?" warning instead of the token
silently falling to a NULL mapping.

### Added

- **`possible-typo` scanner pass.** A new graph-wide `data-quality` detector (`detectPossibleTypos`
  in `src/data-quality.ts`) splits every token id on `-` and flags a segment that sits within one
  Damerau-Levenshtein edit of a value-bearing vocabulary word (property/dimension words, variants,
  color roles, states), emitting a `warning` with the reconstructed corrected id ("did you mean
  `typography-heading-2-line-height`?") and a note when that corrected token already exists. It
  surfaces in both the CLI scan digest and the web ScanView with no UI change — both render
  arbitrary issue kinds, filtered by severity.
- **`damerauLevenshtein` + `suggestVocabWord`** pure helpers in
  `packages/grammar/src/typo-detect.ts`. Damerau (optimal string alignment) scores an adjacent
  transposition as one edit, so `heigth`↔`height` is distance 1 (plain Levenshtein would score 2).
  `suggestVocabWord` returns the unique nearest vocabulary word, or null on an ambiguous tie.

### Changed

- **Frequency guard (the keystone against false positives).** A segment occurring on ≥ 3 distinct
  tokens is treated as intentional vocabulary and skipped — this is what stops `heading` (one edit
  from `leading`) being flagged, with no hand-maintained typography word list. Only genuine one-off
  typos surface.
- **`NON_TYPO_WORDS`** (in `component-vocab.ts`) — a curated skip-set for legitimate one-off words
  that collide with a value word but are too rare for the frequency guard: `full` (`rounded-full` ↔
  `fill`) and `loading` (`color-state-loading-bg` ↔ `leading`). Nuxt slot names (`NUXT_SLOTS`
  values, e.g. `trailing`) and size keys are likewise never flagged. On the real fixture the
  detector yields 2 true positives (`spaching`→`spacing`, `heigth`→`height`) and 0 false positives.

### Known boundaries

- Structural data bugs like `textarea-ring-width 2` (a duplicate-key / whitespace-in-segment Figma
  artifact) are out of scope — that is not a spelling typo and belongs to `duplicate-id` / a future
  whitespace-segment check.
- A *systematic* misspelling repeated on ≥ 3 tokens is intentionally not flagged — it stays
  consistent and still emits a value; the detector targets the inconsistent one-off that diverges
  from its siblings.

## [0.12.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.12.0) — 2026-06-12

Overlay-surface recipes — when the export carries `overlay-light`/`overlay-dark` component tokens,
the inspector emits the genuine ones as sparse delta recipes instead of dropping them as unmappable.

### Added

- **`overlay-light` / `overlay-dark` recipes.** The latest Figma export ships component tokens for a
  component's appearance on a dark/light **overlay surface** (e.g. `button-overlay-dark-solid-bg` =
  a solid button rendered on a dark scrim → white). This is orthogonal to page dark-mode
  (`overlay-dark` ≠ `overlay-light`, both exist at once) and Nuxt UI has no `surface` prop for it.
  The inspector now recognises the segment, **drops the tokens identical to their base** (≈90 of
  ≈239 on the real export), and emits the genuine overrides as **sparse delta** objects —
  `export const <component>Overlay{Dark,Light}Recipe = { … } as const` — in `custom-components.ts`,
  to be merged onto the base recipe via `tv()`. In scope this release: `button` and `badge`. The
  artifact + its Inspector output tab now appear whenever the render is non-empty (overlay-only
  graphs included), not only when a component is flagged custom.
- **Conservative dedup.** A token counts as a genuine override only when its resolved value differs
  from its base counterpart's; when the base is absent or unresolvable it is kept (never silently
  dropped).

### Changed

- **`overlay` is a non-part structuring segment.** Added `overlay` to the grammar's
  `NON_PART_SEGMENTS` so the `component-looks-custom` divergence detector no longer mistakes the
  overlay context segment for a foreign part — `button` and `badge` stay normal `ui.*` overrides in
  `app.config.ts` instead of being misrouted to `custom-components.ts`. (`chip` still flags correctly
  on its real foreign parts `label`/`close`.)

### Known boundaries

- `nav-item-overlay-*` is deferred: its stripped logical id (`nav-item-…-ghost-bg`) needs
  variant-after-sub-element mapping, which is not yet implemented. `nav` overlay recipes follow once
  that lands.
- The recipe reuse is delegated to the existing `buildComponentRecipes` via a per-token override
  (keyed by the original id), so ring-pairing, size defaulting, and icon-mirror behave unchanged.

## [0.11.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.11.0) — 2026-06-12

Stage C — components that look custom now emit their **full anatomy** to a dedicated
`custom-components.ts` artifact instead of a misleading, half-empty `ui.<name>` override.

### Added

- **`custom-components.ts` output.** Components the scanner flags `component-looks-custom`
  (only `chip` today) are routed out of `app.config.ts`'s `ui:` block and into a new
  `custom-components.ts` artifact, as dependency-free `export const <name>Recipe = { slots, variants }
  as const` objects the dev team hand-implements via `tv()`. The recipe captures the component's
  **full anatomy** — including the sub-element slots (`label`, `close`) and the colour-role
  variants the old pipeline silently dropped. For `chip` this means `slots.base/label/close` plus
  `variants.color.{error,success}` with both `base` and `label` entries, where before `ui.chip`
  emitted only a single `base` slot and discarded the rest. A matching output tab appears in the
  Inspector (shown only when something is flagged) and the file joins the download bundle.
- **Trailing colour-role reconstruction.** `normalizeTrailingColorRole` rewrites Figma's trailing
  colour-role naming (`chip-bg-error`) to the 2nd-segment form (`chip-error-bg`) the grammar
  understands, so these tokens — dropped as a "Figma-fix" in the normal pipeline — become proper
  `variants.color` entries in the custom recipe.

### Changed

- **`app.config.ts` no longer mis-applies custom components.** A flagged component is replaced in
  the `ui:` block with a one-line pointer comment (`// chip: looks custom → see custom-components.ts`)
  rather than a recipe block — Nuxt UI no longer receives a `ui.chip` override that would partially
  land on its own, differently-shaped component.
- **Grammar gains a permissive `extraSlots` routing hook.** `heuristicSlotMapping` accepts an optional
  `extraSlots` set so foreign sub-element segments route to their own slots; the custom builder
  delegates all recipe assembly to the existing `buildComponentRecipes` via a per-token override
  (keyed by the original id), inheriting ring-pairing, size defaulting, and icon-mirror unchanged.
  Default behaviour is byte-identical — the standard `ui.*` recipes are untouched.

### Known limitations

- `chip-close-icon-color` (utility word `icon-color` — no heuristic rule) and `chip-border-focus-ring`
  remain unmapped and are intentionally dropped, exactly as they were before. The custom recipe still
  captures the close **size** and all label/base content.

## [0.10.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.10.0) — 2026-06-12

A scan that flags components which look hand-built, a sidebar that narrows to the live previews,
a version badge that knows whether `main` is pushed, and the grammar lifted out of `src/` into its
own workspace package.

### Added

- **`component-looks-custom` divergence flag.** The scanner now compares each component's emitted
  parts against the Nuxt UI slot inventory (`nuxtSlotsFor`, minus `NON_PART_SEGMENTS` and the
  `FIGMA_NUXT_PART_ALIAS` renames). When a component is carried by *foreign* parts — slots Nuxt UI
  has no place for — it raises a `component-looks-custom` hint rather than silently mismapping. The
  discriminator is the share of foreign parts, not unmapped tokens, so adapter-incompleteness no
  longer reads as a custom component. On the real export it fires for `chip` only.
- **Live filter chip.** A `Live {n}` toggle in the sidebar filter row narrows the component-layer
  tree to the components that actually have an interactive preview (`liveOnly` prop + an
  `isVisible` predicate on `ComponentTree`). The count reflects how many of those are present in
  the loaded graph.
- **Push-state version badge.** The header version badge is now emerald when `main` is in sync with
  `origin/main` and amber when commits are unpushed, driven by a build-time `__APP_UNPUSHED__`
  count (`origin/main..HEAD`, wrapped in try/catch so a detached or upstream-less checkout never
  breaks the build).

### Changed

- **Grammar extracted into the `@tg/grammar` workspace package.** The component vocabulary and the
  ~450-line slot-mapping engine moved out of `src/` into `packages/grammar`; the inspector core
  (`scanner.ts`, `recipe-engine.ts`, `slot-mapping-loader.ts`, the renderers, and `App.vue`) now
  consumes them as a published workspace dependency. Behaviour is byte-identical — this is a
  module-boundary refactor, not a logic change.

## [0.9.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.9.0) — 2026-06-10

Grammar + preview fidelity (`size` utility, icon slot mirror), a leaner `App.vue` with gate
tests, and visible toggle states.

### Added

- **Bare `size` utility.** The grammar now maps the bare `size` token word (Tailwind `size-N` =
  width+height): `checkbox-size-{sm,md}`, `radio-size-{sm,md}` → `variants.size.{k}.base`,
  `switch-thumb-size-md` → `variants.size.md.thumb`; the recipe engine emits `size-[18px]`-style
  arbitrary classes. Component-null count on the real export: 79 → 74 (the remaining size nulls
  are naming-mismatch/typography cases, not grammar gaps).
- **Token-driven preview sizing.** `LiveCheckbox`/`LiveRadio` boxes take their dimensions from the
  recipe's size variant (static `size-5` stays as the token-less fallback); `LiveSwitch`'s thumb is
  now token-driven for size AND colour (a bare `color` on the thumb is promoted to the knob's
  background — it is a shape, not text).
- **Icon slot mirror (`SLOT_MIRROR`).** Figma defines `icon-size` once for ANY icon; recipes now
  mirror `leadingIcon` classes to `trailingIcon` (own trailing tokens win, per bucket), and the
  scanner counts the mirrored slot as filled — the `capability-gap` hint no longer misreports
  `trailingIcon` for `button`/`input`/`badge`. One shared constant drives both consumers.
- **`App.vue` gate smoke test** — mounts the real app, loads a token file through the real
  `handleFiles` path, and pins the loader/commit-panel reachability gates (the placement-bug class).

### Changed

- **`App.vue` slimmed 1047 → 905 lines:** the commit panel and the git loader are now
  `CommitPanel.vue` / `GitLoader.vue` with their own component tests (behaviour byte-identical;
  PAT handling unchanged: sessionStorage only).
- **Visible toggle states + ARIA:** the scan-view switch (header status strip and the issues
  button) shows a pressed treatment with `aria-pressed`; the `Commit…` panel toggle shows its open
  state with `aria-expanded`.

## [0.8.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.8.0) — 2026-06-09

The **git workflow round-trip** — load Figma tokens straight from a repo, commit the generated
Nuxt output back.

### Added

- **Load from Git** (`git-import.ts`) — paste a public GitHub/GitLab directory URL and the
  inspector fetches every `*.tokens.json` (+ `figma-mapping.json`) in it via the host REST API
  (token-less), feeding the same `loadSources` pipeline as drag-and-drop. `parseGitUrl(url)` +
  `fetchTokenFiles(ref)`; a repo-URL field + **Load from Git** button in the empty state.
- **Commit to Git** (`git-export.ts`) — a header **Commit…** panel writes the generated
  `tokens.css` + `app.config.ts` back to a target repo in **one atomic commit**: GitHub via the
  Git Data API (ref → blobs → tree → commit → ref), GitLab via the Commits API (`actions[]`). A
  confirm step gates the write. The write PAT is held in `sessionStorage` only (never
  `localStorage`), is never logged, and is never written into committed content. Committing to an
  empty repo surfaces a clear "add an initial commit first" error — the Git Data API cannot
  bootstrap an empty repository.

### Notes

- Import is public and token-less; export needs a write token — GitHub fine-grained
  **Contents: Read and write** (or classic `repo` / `public_repo`), GitLab `write_repository`.

## [0.7.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.7.0) — 2026-06-06

Live previews for the core form controls (`textarea`, `badge`, `switch`, `checkbox`, `radio` —
joining `button`/`input`), **sub-element slot routing**, and the **`capability-gap`** scan hint.

### Added

- **Live previews — `textarea`, `badge`, `switch`, `checkbox`, `radio`.** Each renders in the
  inspector with the sidebar `Live` pill. `LiveInput` generalises to a `<textarea>`; `LiveBadge`
  shows a colour×size matrix with a `sm/md` size switch; `LiveSwitch` a token-driven track + a
  decorative thumb (unchecked/checked); `LiveCheckbox`/`LiveRadio` a token-driven box with a
  decorative checkmark/dot. The token-driven surfaces (colours, ring, radius, checked state) are
  faithful; indicators and sizes the grammar doesn't map are drawn decoratively.
- **Sub-element slot routing.** Figma sub-element tokens (`dropdown-item-*`, `table-th-*`,
  `nav-item-*`) route to their Nuxt recipe slot by **exact name match** against `NUXT_SLOTS`, as a
  fallback after the normal mapping so `icon-size` is unchanged. `RecipeSlot` is widened to
  `string`. Naming mismatches (`check`/`row`/`divider`/`dot`) stay `unsupported-part`-flagged with
  a Figma rename suggestion (not auto-aliased).
- **`capability-gap` scan hint.** Flags a Nuxt slot the Figma tokens leave uncovered (e.g.
  `trailingIcon` when only the leading icon is tokenised) — the inverse of `unsupported-part`,
  driven by `SLOT_PAIRS`.
- **`checked` projection.** The preview can render a control's checked appearance from the
  recipe's `checked:`-prefixed classes. `NUXT_SLOTS` gains `switch`/`radio`, plus a
  `dot`→`indicator` rename alias.

### Changed

- **`button` preview aligned with `badge`** — the size-axis row is replaced by a recipe-derived
  `xs/sm/md/lg` size switch + a header completeness score.

## [0.6.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.6.0) — 2026-06-06

A large post-`0.5.0` batch: the scan-area rework, `button` variant-conditional rings with
correct `border-width`/`ring-width` semantics, prop-driven state handling, dropping
transparent colour emissions, and the Nuxt slot/part inventory with its `unsupported-part`
scan hint.

### Added

- **`button` variant-conditional rings (D2c).** Nuxt UI v4 frames only `outline`/`subtle`
  button variants as a ring, so their border tokens now emit `ring-*` (via
  `RING_FRAMED_VARIANTS`) while `solid`/`ghost`/`link` stay frameless. New `border-width`
  and `ring-width` utility types are recognised, and a `border-on-unframed-variant` scan
  hint flags a border set on a frameless variant (it would never render).
- **Prop-driven state handling.** `input`/`textarea` `active` tokens map to Nuxt's
  `highlight` prop (set programmatically), not a `:active` pseudo-class; a `state-via-prop`
  scan warning explains why those tokens emit no recipe override.
- **Nuxt slot/part inventory + `unsupported-part` hint.** `NUXT_SLOTS` (per-component Nuxt
  theme slot names) + `nuxtSlotsFor`. A new `unsupported-part` scan warning flags Figma
  tokens whose part has no Nuxt slot (e.g. `chip-label`, `chip-close`, `button-overlay`),
  and suggests the rename for known naming mismatches (`row`→`tr`, `divider`→`separator`,
  `check`→`icon`) — driven by `NON_PART_SEGMENTS` (utility/state/dimension words are never
  parts) and `FIGMA_NUXT_PART_ALIAS`.

### Changed

- **Scan view reworked into tabs.** The scan area is now **Issues / Readiness / Forecast**
  tabs. The Issues tab adds a severity filter (`All` / `Errors` / `Warnings` / `Hints`) and
  groups issues by component (collapsible, `General` for component-less issues), replacing
  the single scroll and the technical category accordions. Row-click still jumps to the
  token.
- **`border-width` vs `ring-width` semantics (D2e).** `*-border-width` is the resting frame
  width, `*-ring-width` is the focus-ring width — mapped distinctly so a resting frame and a
  focus ring no longer collide on one utility.

### Fixed

- **No stray resting ring on frameless button variants (D2e).** A component-level resting
  `ring-width` is now paired with its resting ring-*colour* by location (the framed `outline`
  variant for `button`, `base` for `input`), or dropped when there is none — so
  `solid`/`ghost`/`link` no longer inherit a colourless `ring-[1px]` on `slots.base`.
- **Fully-transparent colours no longer emit dead classes.** `ghost`/`link` borders set to
  `transparent` (and any `rgba(…,0)` / `#RRGGBB00`) are dropped instead of emitting
  `border-[var(--color-transparent)]`; opacity is detected by a shared `isOpaqueColor`
  (`color-opacity.ts`).

## [0.5.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.5.0) — 2026-06-04

The v0.5.0 milestone: the first component recipe past `button` (`input` + `LiveInput`),
the cycle-B deviation work (semantic-alias fix, `border`→`ring` for ring-framed
components, the validation-color detector), and a sidebar restructured into layer
sections.

### Added

- **Sidebar grouped into layer sections.** The left token tree is now split into
  collapsible `Components` / `Semantic` / `Primitives` sections (Components expanded by
  default), so component tokens are no longer mixed in with raw primitives. The redundant
  `Component` filter chip was removed; `All` / `Tailwind` / `Theme` / `Dark-var` remain.
- **`input` recipe verified + `LiveInput` preview.** The `ui.input` recipe the
  engine already emits is now pinned by a golden snapshot, and a bespoke
  `LiveInput.vue` renders the input across its real interaction states
  (default / hover / focus / disabled) with JIT-safe inline styles, matching
  the `button` treatment. The preview shows a leading icon (default
  `i-lucide-search` for inputs) and a trailing icon (default
  `i-lucide-chevron-down`), both rendered when the recipe declares an
  icon-size token. No engine or grammar changes.
- **`Live` pill in the component sidebar.** Top-level components that have a
  rendered preview (`button`, `input`) now show a small `Live` pill in the
  `ComponentTree`, driven by the same `COMPONENTS_WITH_PREVIEW` source of
  truth as the preview gate — so the pill can never drift from actual preview
  support.
- **Scan warning for validation-color tokens.** `<comp>-border-<error|success>` tokens
  (e.g. `input-border-error`) no longer vanish silently. The scanner now emits a
  `validation-color-via-prop` warning explaining Nuxt UI applies error/success through the
  component's `color` prop (or a `UFormField`), so the token needs no recipe override — it
  lives in the color layer.

### Fixed

- **Ring-framed components emit `ring-*` for their `border-*` tokens.** Nuxt UI v4
  form fields and several other components draw their frame as a Tailwind ring
  (with `border-0`), not a CSS border. `input`, `textarea`, `checkbox`, `radio`,
  `kbd`, `dropdown`, `modal`, `card`, and `chip` border tokens now emit `ring-[…]`
  (resting, hover, focus, …) instead of `border-[…]`, removing the double frame on
  focus. `button`/`badge` (variant/color-conditional rings) are deferred; `switch`
  (sizing border) and `table`/`nav` (genuine borders) are not remapped.
- **Component `text` color tokens emit themeable `var(--…)` again.** A bare `text`
  utility was classified as `text-size` unless a variant/color-role axis was present, so
  axis-less color tokens (`input-text`, `input-text-disabled`, `textarea/text`) leaked a
  hardcoded `text-[#hex]` instead of a semantic `var()` reference. Bare `text` is now
  classified as `text-color` whenever the token's value type is `color`, threaded through
  the slot-mapping grammar's call sites.
- **Leading/trailing icon no longer overlaps the input text in the preview.**
  The recipe's `px-*` padding resolved to an inline `paddingLeft`, which beats
  any `pl-*` class, so the offset for the absolutely-positioned icon was
  ignored and the icon overlapped the placeholder. `LiveInput` now reserves
  icon space via inline padding (which composes with the recipe's inline
  styles) instead of a class.

### Known deviations (still open after the cycle-B work)

- **Validation colors** (`<comp>-border-<error|success>`) are now surfaced by the
  `validation-color-via-prop` scan warning, but the recipe still emits no override — a
  `compoundVariants` emit path is deferred (Nuxt applies them via the `color` prop).
- **`button` / `badge` rings are variant/color-conditional** (only `outline`/`subtle`),
  so their `border-*` tokens still emit a CSS `border` rather than a `ring` — deferred
  (D2c) until a variant-aware remap exists.
- `input-solid-bg` emits a `solid` variant that Nuxt UI v4 `input` does not define.

Full detector/resolution analysis:
`docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`.

## [0.4.5](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.4.5) — 2026-05-31

### Fixed

- **Inspector highlight now matches the recipe for arbitrary-value and color
  tokens.** Selecting a token like `ring-offset` (also `height`, `width`,
  `line-height`, `letter-spacing`, `font-family`, `padding`, and all color
  tokens) highlighted nothing — in the code preview *and* the live-preview chip.
  The Inspector re-derived the class through the shadow-node classification path
  only, computing e.g. `ring-offset-1` while the recipe engine emitted
  `ring-offset-[4px]`, so the strings never matched. Extracted
  `utilityForMapping` in `recipe-engine.ts` as the single source of truth for
  the emitted class, now shared by `buildComponentRecipes` and the Inspector's
  highlight resolver (`App.vue`). Verified byte-identical recipe output (golden
  snapshot) and exact highlight↔recipe match on the real export.

### Changed (internal)

- Removed the now-dead `state` variant axis (state tokens have emitted
  pseudo-class prefixes since v0.4.4): the `VariantAxis` member,
  `ComponentRecipe.variants.state`, `CompletenessScore.axis: "state"`, and the
  app-config state branch.

## [0.4.4](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.4.4) — 2026-05-31

### Fixed

- **State tokens without a variant context emitted dead config.** A token like
  `button-radius-focus` (also `gap-focus`, `padding-y-focus`) parsed to a
  `variants.state.focus` axis and rendered `ui.button.variants.state.focus` —
  but Nuxt UI v4 has no `state` prop (focus/hover/active are pseudo-states), so
  the block was never applied. Such a token now emits a Tailwind pseudo-class
  prefix on the base slot (`focus:rounded-md`), which the pseudo-class actually
  triggers — matching how color-state tokens (`button-solid-bg-hover` →
  `hover:bg-[…]`) already behaved. Fixed the slot-mapping grammar
  (`src/slot-mapping.ts`, bare-state branch) and excluded state-prefixed tokens
  from the non-suffix→default-size redirect (`src/recipe-engine.ts`). A bare
  `default` state now correctly maps to the unprefixed base look. +3 regression
  tests; verified end-to-end against the real export (the dead `variants.state`
  block is gone, `focus:rounded-md` now lands in `slots.base`).

## [0.4.3](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.4.3) — 2026-05-31

Tooling, test-safety, and a preview-display fix.

### Fixed

- **`DimensionRuler` scales by unit.** The dimension bar treated every numeric
  value as pixels, so a `2rem` token drew a 2px bar and negative lengths drew
  nothing with no indication. It now normalizes rem/em to px, hides the bar for
  non-length units (`%`, `vw`, `calc()`), and draws an empty bar for negative
  lengths while the value text still reports the real number
  (`src/app/components/DimensionRuler.vue`).

### Added

- **CI** — `.github/workflows/ci.yml` runs typecheck + tests + build +
  `build:tokens` on push/PR (the pre-commit hook had claimed CI parity that
  didn't exist).
- **Coverage** — `@vitest/coverage-v8` + a `coverage` script and config.
- **Golden `app.config.ts` snapshot** pinning the exact emitted structure, and a
  **Tailwind-version pin** test asserting the generated defaults table matches
  the installed `tailwindcss` (fails loud on an un-regenerated bump).
- **`scripts/build-cli.ts` is now type-checked** — `typecheck` runs
  `vue-tsc -b && tsc -p tsconfig.scripts.json` (the CLI was previously in no
  tsconfig).

### Changed (internal)

- `LiveButton` builds the disabled-cell style immutably (spread, no mutation).
- Comment honesty: removed stale legacy/PR-era references in the CLI header,
  `slot-mapping`, `recipe-engine`, and the `deriveRoles`/`nearestUtilityHint`
  reserved stubs.

## [0.4.2](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.4.2) — 2026-05-31

Scan-quality and test-infrastructure patch.

### Added

- **`single-mode-semantic` scan warning.** A semantic token defined for only
  one of light/dark (e.g. present only in `dark.tokens.json`) cannot classify
  as `theme-mode-variant`, so the cascade emits its sole value as a static
  `@theme` entry that renders in **both** modes — a dark-only token shows its
  dark value in light mode. The Scan view now surfaces this as a warning
  instead of silently mis-rendering (`src/scanner.ts`).

### Changed (internal)

- **Vue component-test infrastructure.** Added `@vue/test-utils` + `jsdom` and
  wired the Vue plugin into `vitest.config.ts` so `.vue` SFCs compile in tests
  (engine tests stay in the node environment; component tests opt into jsdom
  per-file). Extracted `projectToState` out of `LiveButton.vue` into
  `src/app/project-to-state.ts` and added unit + mounted-component tests. Suite
  grows to 270 tests.

## [0.4.1](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.4.1) — 2026-05-31

Preview-fidelity and output-parity patch. No new features. Fixes a class of
silent rendering bugs in the live preview, aligns the Inspector's output with
the CLI, removes a scanner false positive, and hardens input boundaries.

### Fixed

- **Live preview renders real token values regardless of Tailwind JIT.** The
  recipe engine emits real Tailwind classes (`py-2.5`, `h-[44px]`,
  `font-light`, `font-[Inter]`), but Tailwind v4's JIT only generates classes
  present as static text in scanned source — so a recipe class rendered only by
  coincidence (`px-2.5` ships in `@nuxt/ui`, `py-2.5` does not). `LiveButton`
  now resolves **both** arbitrary (`x-[…]`) and scale (`py-2.5`) classes to
  inline styles via the inverted `tailwind-defaults` tables
  (`src/app/extract-arbitrary.ts`). Symptoms fixed: button heights collapsing
  to content height, `lg` vertical padding rendering as `0`.
- **`font-[Inter]` applied to `font-family`, not `font-weight`.** Font-family
  and font-weight share the `font-` prefix; the preview wrote the family name
  to `fontWeight` (an invalid value the browser ignored). Disambiguated by
  value shape.
- **font-weight scale classes (`font-light`/`font-bold`/…) now render.** Six of
  nine weights never appear statically, so the JIT skipped them; they now
  resolve to inline `fontWeight`.
- **Inspector output now matches the CLI.** The on-screen `app.config.ts`
  preview and the `Download .zip` bundle dropped the renderer options the CLI
  passes, so `// Incomplete in Figma` comments were missing even while the Scan
  view showed the same gaps. Scan completeness is now threaded into the
  app.config render (`App.vue`, `state.ts`).
- **CLI scans the full component allow-list.** `build:tokens` scanned only
  `button` while rendering all 15 components, silently dropping completeness and
  data-quality findings for the other 14 (`scripts/build-cli.ts`).
- **Scanner orphaned-size-key false positive.** The hint fired on every
  single-utility component; it now runs only when ≥2 utility types carry size
  variants (`src/scanner.ts`).
- **Input hardening.** Array-root JSON is rejected instead of producing
  numeric-keyed garbage nodes; `figma-mapping.json` component elements are
  validated as objects (`src/app/load-sources.ts`); a malformed
  `slot-mapping.json` now throws a clear `Invalid slot-mapping.json` error
  instead of a raw `SyntaxError` (`src/slot-mapping-loader.ts`).

### Added

- `docs/PROJECT-ANALYSIS.md` — multi-agent project analysis report.
- Regression tests: `extract-arbitrary` font cases, scanner orphan x2,
  `slot-mapping-loader` malformed input, new `load-sources.test.ts` (258 tests).

## [0.4.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.4.0) — 2026-05-27

Multi-component recipe output + Token Scan view. The allow-list expands
from `button` only to the full 15-component standard set. A new permanent
Scan view replaces the standalone Issues view with category accordions,
a component-readiness table, and an output forecast.

### Added

- **Token Scan view** (`ScanView.vue`): replaces the standalone Issues view
  with categorised issue accordions (broken aliases, type mismatches,
  unresolved refs, asymmetric-variant-coverage findings), a
  **component-readiness table** showing per-component slot coverage and
  completeness percentage, and an **output forecast** summarising how many
  tokens will emit CSS vars vs Tailwind utilities vs recipe entries.
- **Permanent `HeaderStatusStrip`**: always-visible strip below the app
  header showing the active token-count, scan-finding counts (errors /
  warnings / hints), and a link to the Scan view. Replaces the previous
  ephemeral status overlay.
- **`useScanReport` composable**: derives the scan report (issue list,
  per-component readiness, forecast) reactively from the token graph;
  shared between `HeaderStatusStrip` and `ScanView`.
- **Multi-component recipe output** — the recipe allow-list now covers
  the full 15-component standard set:
  `button`, `badge`, `input`, `textarea`, `card`, `modal`, `kbd`,
  `chip`, `checkbox`, `radio`, `switch`, `nav`, `dropdown`, `table`,
  `progress`.
- **Color-role variant axis** in slot-mapping: color roles
  (`default` / `accent` / `primary` / `secondary` / `success` /
  `error` / `warning` / `info` / `neutral`) are recognised as a
  variant dimension alongside the visual-variant axis, with configurable
  prefix position in the token id.
- **9 new utility types**: `height`, `width`, `line-height`,
  `letter-spacing`, `placeholder-color`, `ring-offset`, `font-family`,
  `padding`, `overlay-bg` — all rendered as Tailwind arbitrary values
  (`h-[var(--x)]`, `font-[var(--x)]`, etc.).
- **`checked` / `hovered` state recognition**: slot-mapping parses
  `checked` and `hovered` suffixes into the state dimension alongside the
  existing `hover` / `active` / `disabled` / `focus`.
- **LiveButton `n/m` completeness badge**: each size cell in the preview
  matrix now shows how many of the expected slots are populated (e.g.
  `4/6`) so designers can spot gaps at a glance.
- **`component-vocab.ts`** — shared constants file for component names,
  variant names, utility types, and state names consumed by slot-mapping,
  recipe-engine, and scanner.
- **Graceful degradation on inconsistent tokens**: when a token matches the
  allow-list but its utility isn't recognized or its value chain can't be
  resolved, the recipe engine omits it (no crash); the gap surfaces in the
  Scan view's readiness table rather than breaking the build.
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

- **`issues` view mode renamed to `scan`**: `IssuesView` is absorbed
  into the new `ScanView`; all route/state references updated.
- Recipe engine mapping hardened for the full 15-component standard
  set — slot-path inference validated against real token shapes for
  each component.
- `slot-mapping.ts` `parseSegments` now returns `{component, variant,
  utility, size, state}` instead of `{component, utility, variant}`.
  `SlotMappingEntry` gains an optional `statePrefix` field.
- `VariantAxis` type adds `"variant"`. `UtilityType` adds the five
  color types and the 9 new dimension types.
- `scanner.ts` data-quality checks skip non-size axis tokens to avoid
  size-completeness false positives on variant tokens.
- `app.config.ts` renderer iterates `["size", "color", "variant",
  "state"]` axes (added `"variant"`).

### Removed

- **Standalone `IssuesView`** component — functionality absorbed into
  `ScanView` with richer categorisation and the readiness table.
- **Dead Figma-PAT-integration references** (config fields, comments,
  and type stubs left over from the abandoned REST-API approach).

### Fixed

- `snap-to-tailwind` classification hint is now **category-aware**: a 14px
  font-size suggests `text-sm` (not `p-3`), a radius token suggests
  `rounded-*` (not `p-*`), border-width suggests `border-*`. Previously the
  detector compared every primitive numeric against the spacing scale
  regardless of its category.
- Tailwind-defaults lookup tables now cover **Tailwind v4's fractional spacing
  half-steps** (`p-0.5` = 2px, `p-1.5` = 6px, `p-2.5` = 10px, `p-3.5` = 14px)
  and **`rounded-none`** (0px), and `normalizeToRem` canonicalises zero to
  `"0rem"` (the form the tables key zero by). Designer tokens using these
  legitimate Tailwind defaults are no longer flagged as "consider snapping".
- Live preview was emitting baked-in hex values that failed
  Tailwind v4 JIT (classes like `px-[10px]` never made it into the
  bundle because they only exist as runtime strings).
- Live preview was emitting `var(--*)` references that resolved to
  nothing because the rendered `tokens.css` was never mounted into
  the Inspector document.

### Known / v0.5.0 backlog

Sub-element recipe slots for `nav`, `dropdown`, `table`, and `progress`
(`item-*`, `th` / `td` / `row`, `track` / `fill`) and the internal slots
for form controls (`checkbox`, `radio`, `switch`) — `thumb`, `dot`,
`check` — are not yet mapped. These components currently emit partial
recipes; full slot coverage is targeted for v0.5.0+. Per-component live
previews (`LiveBadge`, `LiveInput`, `LiveCard`, …) are also deferred to
v0.5.0+; today only `button` has a rendered preview.

**Fonts pipeline:** primitive `fontFamily` tokens carry values today but
are not yet promoted to `@theme { --font-* }` declarations, so component
`font-family` tokens render as Tailwind arbitrary classes (`font-[Inter]`)
instead of named utilities (`font-display`). A `@theme`-emission + named-class
mapping pass (analogous to the existing colour `var(--color-…)` aliasing) is
targeted for v0.5.0+.

**Icons** are intentionally outside the token graph — they are Figma
component instances + Nuxt UI component props (`<UButton icon="i-lucide-rocket" />`),
not theme variables.

**Custom-component convention (`custom/<name>/…`):** Figma components that
diverge from Nuxt UI v4's standard set (e.g. a classic chip while Nuxt's
`UChip` is an indicator dot; or a custom `sidebar` with no Nuxt pendant) get
the path prefix `custom/<name>/…` in Figma. Today these tokens surface as
"No Tailwind utility mapping" hints in the inspector (honest WIP signal); the
allow-list stays focused on the 15 Nuxt-standard components and emits them only
when token data is present. v0.5.0+ adds engine-side recognition of the
`custom-` prefix and a dedicated `customRecipes` section in `app.config.ts`
(outside `ui.*`), so divergent and Nuxt-standard components can coexist
cleanly.

## [0.3.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.3.0) — 2026-05-21

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

## [0.2.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.2.0) — 2026-05-14

Initial LiveButton preview pipeline, Figma embed integration, version
badge in header. See git log for details.

## [0.1.0](https://github.com/clawdbot3535/token-inspector/releases/tag/v0.1.0) — 2026-05-13

Initial Token Inspector — drag-and-drop Figma DTCG export, alias chain
visualization, code preview, issues view.
