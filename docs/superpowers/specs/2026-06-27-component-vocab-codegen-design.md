# Design: Codegen the Nuxt UI component vocabulary

**Date:** 2026-06-27
**Status:** approved (brainstorm) — pending spec review
**Target version:** v0.62.0 (minor — new capability)

## Problem

token-inspector maps Figma component-layer tokens (`button-*`, `toast-*`, …) onto Nuxt UI v4
`app.config.ui` recipes. The mapping is driven by a hand-maintained slot vocabulary in
`packages/grammar/src/component-vocab.ts`:

- `NUXT_SLOTS` — a `Map<component, Set<slotName>>` for **16** components.
- `COMPONENT_ALLOW_LIST` — the components the renderers will emit a recipe for.

The recipe engine, scanner, and renderers are all **generic** over these two structures. The *only*
per-component manual work is the slot vocabulary. So every time the Figma kit gains a new component, a
developer must hand-edit the grammar (add slots + allow-list entry).

The Figma kit is **work-in-progress and constantly expanding**. The latest export (2026-06-19) already added
**`toast`** — a real Nuxt UI component we don't yet map (the canonical `components/` snapshot is 2026-06-12 and
predates it). `sidebar` is already handled via the custom path (`KNOWN_CUSTOM_COMPONENTS`). Hand-adding each new
component does not scale.

## Goal

Make supporting a new Figma component **zero-to-low friction**: when the kit adds a component that is a real
Nuxt UI component, it should be supported with no per-component code edit. Toast is the immediate beneficiary and
the validation case.

## Approach (chosen): codegen the vocabulary from Nuxt UI

Nuxt UI **is** the target and already defines every component's theme slots. Instead of hand-transcribing them
(which is what the current `NUXT_SLOTS` already is — e.g. nav's slot list mirrors NavigationMenu's theme), we
**derive** the slot vocabulary from Nuxt UI's own theme definitions and cover **all ~60 components** at once.

Rejected alternatives (from brainstorm): (B) a user-maintained `component-vocab.json` side-car — lower automation,
manual slot entry; (C) a detect-and-scaffold affordance in the scanner/Resolve loop — more UI work, still
per-component. (A) codegen gives the highest automation and zero ongoing per-component friction.

## Architecture

### 1. Codegen script — `scripts/gen-nuxt-vocab.ts`

- **Source:** Nuxt UI theme files from the GitHub source tree (`src/theme/*.ts`), pinned to the **installed**
  `@nuxt/ui` version (read from `node_modules/@nuxt/ui/package.json` — currently `4.7.1` → tag `v4.7.1`). The
  source themes are clean TS (proven trivially readable via `gh api .../contents/src/theme/<comp>.ts`). The
  installed bundle (`dist/shared/ui.*.mjs`) is the offline fallback but is minified + hash-named → less robust.
  Network is needed only when the codegen is *run* (a maintenance step), never at build/test time.
- **Extraction:** each theme file's default export is either an object `{ slots, variants, … }` or a function
  `(options) => ({ slots, variants, … })`. We do **not** evaluate the theme (the option-function + Tailwind
  strings are irrelevant); we only need the **keys** of the static `slots: { … }` object literal. Extract them
  via the TypeScript compiler API (AST: find the `slots` property initializer, read its property names) — robust
  against formatting. Components with no `slots` (slotless, e.g. `kbd`) yield an empty set.
- **Figma→Nuxt name map (curated):** a small table mapping our Figma prefixes to Nuxt theme filenames where they
  differ — e.g. `nav → navigation-menu`, `dropdown → dropdown-menu`. Most match directly (button, badge, card,
  toast, modal, …). The generated vocabulary is keyed by **our Figma prefix**.
- **Output:** `packages/grammar/src/nuxt-slots.generated.ts` — a committed, deterministic file exporting the raw
  per-component slot sets + the component name list. Header marks it generated ("do not edit by hand; run
  `npm run gen:vocab`"). A `gen:vocab` script is added to package.json.

### 2. Grammar refactor — `component-vocab.ts`

- `NUXT_SLOTS` becomes: **generated base** (`nuxt-slots.generated.ts`) **+ a curated overlay** that captures the
  few things Nuxt UI cannot tell us:
  - deliberate deviations from the raw theme (e.g. `chip` is kept minimal / routed custom);
  - any Figma-specific slot exceptions discovered during reconciliation.
  The overlay is a small explicit `Map` merged over the generated base (overlay wins), so the source of every
  deviation is visible and version-controlled.
- `COMPONENT_ALLOW_LIST` = generated component set ∪ curated additions.
- `FIGMA_NUXT_PART_ALIAS` (Figma part-name → Nuxt slot, e.g. `desc → description`, `dot → indicator`) stays
  hand-curated — Nuxt UI does not know Figma's naming. Add `desc → description` for toast.
- `KNOWN_CUSTOM_COMPONENTS` (chip, sidebar, …) stays hand-curated.

### 3. Result

All ~60 Nuxt UI components are in the vocabulary. A new Figma component that is a Nuxt UI component is
auto-supported — the recipe engine emits its `ui.<component>` recipe as soon as its tokens appear, no code edit.
On a Nuxt UI upgrade, re-running `npm run gen:vocab` re-syncs the vocabulary (and surfaces any slot changes).

## Reconciliation (the key risk)

The current `NUXT_SLOTS` is already a hand-transcription of Nuxt UI's themes, so the generated output for the
existing 16 should be **close to identical** — low risk, but must be verified:

1. Generate for the 16, **diff** against the current `NUXT_SLOTS`.
2. Per difference, decide: (a) generated is the correct/complete Nuxt set and the hand entry was incomplete →
   adopt generated; (b) the current is a deliberate curation (e.g. `chip` minimal) → keep it in the overlay.
3. The Figma→Nuxt name map resolves the `nav`/`dropdown` naming differences.

**The 1013 existing tests are the guard**: the 16 components' recipe/scan behavior must be unchanged. Any test
that flips reveals a reconciliation decision to make explicit (adopt vs overlay).

## Scope boundaries (v1)

- **In:** the per-component **slot** vocabulary (`NUXT_SLOTS`) + `COMPONENT_ALLOW_LIST`, generated from Nuxt UI;
  the curated overlay/alias/custom layers; the `gen:vocab` script + generated file; `toast` support falls out.
- **Out (unchanged / token-naming-driven):** variant vocabulary (size/color) — already derived from token naming,
  no per-component generation needed. Figma-specific aliases + custom components stay curated.
- **Out (deferred):** previews/gallery for newly-supported components (toast is an overlay shown via
  `useToast()`, same inline-render concern as modal/dropdown) — recipe generation only in v1.
- **Out (separate task):** refreshing the canonical `components/` snapshot to the latest export — big test diff,
  different concern. Toast support is validated by a **dogfood** run on the 2026-06-19 export, not by changing the
  committed fixture.

## Validation / testing

- **Unit:** grammar test that the generated vocabulary loads + the overlay merges (toast → its slots; `desc`
  alias). Recipe-engine test with synthetic `toast-*` tokens → maps to the right slots (root/title/description/
  progress + color variants).
- **Regression guard:** the full existing suite stays green (the 16 unchanged).
- **Dogfood:** run the CLI on the 2026-06-19 export → confirm a correct `ui.toast` recipe is emitted (root +
  title + description + progress + success/error/warning/info color variants), and that a couple of other now-in-
  vocabulary components (e.g. alert) would map if tokens existed.
- **Codegen sanity:** optional test asserting the committed generated file is in sync with a fresh codegen run
  (so drift is caught).

## Open implementation details (for the plan)

- Exact AST-extraction of `slots` keys (handle both object- and function-form default exports).
- The `default` toast color variant (Nuxt colors are success/error/warning/info/primary/neutral; `default` is not
  a Nuxt color → map to neutral or treat as the base; decide during impl, non-blocking).
- Whether `COMPONENT_ANATOMY` (component-anatomy.ts, "keys mirror NUXT_SLOTS exactly") must also be regenerated /
  kept in sync — it currently mirrors NUXT_SLOTS for the coverage view. New components would lack anatomy; decide
  whether anatomy is generated too or stays curated for the inventoried subset.
- **Which theme files to include.** Nuxt UI's `src/theme/` has ~60+ files, many irrelevant to a token kit
  (Pro/app-shell/content: `dashboard-*`, `chat-*`, `editor-*`, `blog-post*`, `prose`, `auth-form`, `header`,
  `footer`, …). Generating for *all* is harmless (extra allow-list entries are no-ops without tokens) but noisy.
  Decide in the plan: include all, or filter to a "form + display + overlay" component subset (button, badge,
  input, select, checkbox, radio, switch, textarea, toast, alert, tooltip, popover, tabs, breadcrumb, card,
  modal, drawer, table, accordion, navigation-menu, dropdown-menu, progress, kbd, chip, avatar, …). Leaning
  toward a curated **include-list** of genuine component themes to keep the generated file focused.
