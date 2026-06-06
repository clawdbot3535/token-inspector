# Design: `badge` live preview

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/badge-live-preview`
- **Theme:** a live preview for the `badge` component, the fourth after `button`, `input`,
  `textarea`. A gap-filler between the larger roadmap cycles.

## Problem / goal

`badge` has a recipe but no rendered preview (no `Live` pill, no visual). Add a faithful,
JIT-safe preview.

Findings that shape the design:
- The real `badge` recipe is **`color` × `size`**, with **no `variant` axis and no interaction
  states** — the Figma badge tokens are colour-keyed (`accent`/`default`/`error`/`success`/
  `info`/`warning`/`neutral`) across sizes (`sm`/`md`). A badge is a static status indicator.
- `badge` renders as a **`<span>`** (Nuxt `Badge` `as="span"`), not a `<button>`.
- badge uses **real CSS `border-[var(…)]`** (it is not in `RING_FRAMED_COMPONENTS`). The existing
  `extractArbitrary` already renders this: `border-[var]` → `borderColor`, and a preflight
  compensation adds `borderWidth: 1px` + `borderStyle: solid` when only a colour is set (so the
  border is visible). **No new `extract-arbitrary` entries are needed** — every family in the
  badge recipe (`font-[400]`, `rounded-sm`, `leading-[…]`, `px-*`, `text-[…]`, `bg-[var]`,
  `border-[var]`, `text-[var]`, `size-*`) is already handled.

`LiveButton` does not fit: it iterates `variant` rows with a **state** axis and renders
`<button>`. badge is colour-primary, static, and a `<span>`. So a **new, purpose-built
`LiveBadge.vue`** (Approach B, chosen) is cleaner than generalising `LiveButton` or extracting a
shared composable. The shared pipeline (`buildComponentRecipes` → compose → `extractArbitrary`)
is ~15 lines and re-expressed simply in `LiveBadge`.

Success criteria:
- Selecting the `badge` component renders a **size-rows × colour-badges** matrix: one row per
  size (`sm`, `md`), each a wrapping line of `<span>` badges, one per colour role, each badge
  labelled with its colour role and styled by `base + color[role].base + size[sz].base`.
- Borders render (the JIT-safe inline `borderColor` + compensated `1px solid`).
- The sidebar shows the `Live` pill for `badge`.
- No `<button>` elements, no state axis.
- `input`/`textarea`/`button` previews unchanged; full suite + typecheck + build green; headless
  QA clean.

## Decisions

- **New `LiveBadge.vue` (Approach B).** badge's matrix is genuinely different (colour-primary,
  static, `<span>`); a purpose-built component is simpler and leaves the 330-line `LiveButton`
  untouched. The recipe→cell pipeline is small enough that duplication is modest.
- **Layout L1: size rows × colour badges.** Colour is the defining axis, so all colour roles sit
  side by side per size — the palette is scannable at a glance. Two short rows (sm, md) beat ~8
  tall colour rows (L2) or a size-less flat row (L3).
- **Badge content = the colour role name.** Self-documenting — `error` renders in the error text
  colour on the error background, so the badge shows what it is.
- **No state axis, no size switcher, no leading icon.** badge is static; the leading-icon
  treatment is deferred (YAGNI), consistent with how `LiveButton` deferred trailing icons.
- **Inspector parity, trimmed:** a per-size `completeness` n/m badge (reusing the
  `cellCompleteness(sizeKey)` idea), a `copy` button, and one representative code block
  (`default` colour × `md` size, or the first available of each) with `highlightUtility`
  segments. A code block per colour cell is out of scope (the per-token Output section in
  `App.vue` already shows a clicked token's classes).
- **No `extract-arbitrary` changes** — verified the families are all covered.

## Design

### 1. `src/app/components/LiveBadge.vue` (new)

Mirrors the `LiveButton`/`LiveInput` pipeline (imports `buildComponentRecipes`, `extractArbitrary`,
`projectToState`, `useCopyToClipboard`).

- **Props:** `graph: TokenGraph | null`, `componentName?: string` (default `"badge"`),
  `highlightUtility?: string`, `completeness?: ReadonlyArray<CompletenessScore>`.
- **`badgeRecipe`** = `buildComponentRecipes(graph, { components: [componentName] })[componentName] ?? null`.
- **Axes (derived from the recipe, not hard-coded):**
  - `sizes` = keys of `recipe.variants.size`, ordered by a known size order (`xs < sm < md < lg < xl`); falls back to a single `"default"` pseudo-size when there is no size axis.
  - `colors` = keys of `recipe.variants.color` (sorted); falls back to a single `"default"` pseudo-colour when there is no colour axis.
- **Rows:** for each `size`, a `BadgeCell[]` — for each `color`, compose
  `merged = [base, recipe.variants.color[color].base, recipe.variants.size[size].base]`
  (filter empties, join), then `{ classes, style } = extractArbitrary(projectToState(merged, "default"))`.
  Each cell carries its `color` label.
- **Template:** for each size row — a left axis-label (`sm`/`md`) + a wrapping flex of `<span>`
  badges. Each `<span class="inline-flex items-center [cell.classes]" :style="cell.style">` shows
  the colour-role name; a small `<span>` beneath (or `title`) names the role. Optional per-size
  `completeness` n/m. Plus a `copy` button and one representative code block (first colour × `md`,
  else first size) rendered through `highlightSegments` for the `highlightUtility` chip.
- **Fallback:** when `badgeRecipe` is null, the same italic "No `<component>` tokens detected"
  message the siblings use.
- **Immutability:** any per-cell style augmentation spreads into a new object (never mutate
  `extractArbitrary`'s result).

### 2. `src/app/App.vue` (wiring)

- `COMPONENTS_WITH_PREVIEW = new Set(["button", "input", "textarea", "badge"]);`.
- Import `LiveBadge`.
- Both mount sites become a three-way branch:
  `v-if isFieldComponent (input/textarea) → LiveInput`; `v-else-if selectedComponent === 'badge' → LiveBadge`; `v-else-if previewSupported (button) → LiveButton`.
  (The first site keeps its `selectedNode.id.split('-')[0] === selectedComponent` guard on each branch.)
- Update the "Live preview not yet available" copy to list `badge` too (proactively, so it does
  not go stale).

### 3. Tests (`src/app/components/LiveBadge.test.ts`)

Use the `@vue/test-utils` + jsdom harness and `buildGraph`, mirroring `LiveInput.test.ts`
(`mountOpts = { global: { stubs: { UIcon: true } } }`).

- **fallback:** `graph: null` → renders the "No badge tokens" message, no `<span>` badges.
- **renders a span matrix (no buttons):** a `badgeGraph()` with two colour roles (e.g.
  `default`, `error`) × two sizes (`sm`, `md`) → there are `<span>` badge cells, **zero
  `<button>`** elements, and the number of badge cells equals colours × sizes (4).
- **real border renders (JIT guard):** a colour cell with a `border` token → its `<span>` has an
  inline `borderColor` set and `borderStyle === "solid"` / `borderWidth` non-empty (the preflight
  compensation), proving the recipe's CSS border is resolved to inline styles, not left to JIT.
- **size rows:** there is one labelled row per size (`sm`, `md`).

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Headless QA (the app ingests the committed `components/*.tokens.json`): select the `badge`
  component; confirm the colour×size matrix of `<span>` badges (visible coloured backgrounds +
  borders), the sidebar `Live` pill on `badge`, and a clean console. Screenshot for the record.

## Out of scope
- A state axis, a size switcher, leading icons (badge static; icons deferred).
- A code block per colour cell (single representative block only).
- Any `extract-arbitrary` additions (none needed).
- Generalising `LiveButton` or extracting a shared composable (Approach A/C) — revisit only if a
  fourth matrix-style preview makes the duplication costly.

## Risks
- **Many colour roles widen the rows.** Mitigated by the wrapping flex (L1) — rows wrap; ~7
  badges per row is comfortable.
- **A future `variant` axis on badge** (if Figma adds solid/outline tokens) would need a second
  axis in `LiveBadge`. Not present today; not pre-built (YAGNI). The matrix already derives its
  axes from the recipe, so adding a variant loop later is localised.
- **Duplication with `LiveButton`/`LiveInput`** (the recipe→cell→highlight scaffolding). Accepted
  per Approach B; if a fourth such component arrives, extract a composable then (Approach C).
