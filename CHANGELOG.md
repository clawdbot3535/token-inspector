# Changelog

## [0.22.0] — 2026-06-14

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

## [0.21.0] — 2026-06-14

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

## [0.20.0] — 2026-06-14

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

## [0.19.0] — 2026-06-14

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

## [0.18.0] — 2026-06-14

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

## [0.17.0] — 2026-06-14

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

## [0.16.0] — 2026-06-13

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

## [0.15.0] — 2026-06-13

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

## [0.14.0] — 2026-06-13

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

## [0.13.0] — 2026-06-12

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

## [0.12.0] — 2026-06-12

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

## [0.11.0] — 2026-06-12

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

## [0.10.0] — 2026-06-12

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

## [0.9.0] — 2026-06-10

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

## [0.8.0] — 2026-06-09

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

## [0.7.0] — 2026-06-06

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

## [0.6.0] — 2026-06-06

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

## [0.5.0] — 2026-06-04

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

## [0.4.5] — 2026-05-31

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

## [0.4.4] — 2026-05-31

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

## [0.4.3] — 2026-05-31

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

## [0.4.2] — 2026-05-31

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

## [0.4.1] — 2026-05-31

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

## [0.4.0] — 2026-05-27

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
