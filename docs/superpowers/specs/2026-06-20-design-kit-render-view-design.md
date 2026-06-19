# Design-Kit Render View — Design Spec

**Status:** Draft for review
**Date:** 2026-06-20
**Topic:** Collapse the incoherent Preview/Real tab split into a single, trustworthy "Design-Kit" render of the real Nuxt UI v4 components, themed by the exported tokens.

---

## Mission context

The token-inspector is a **DEV↔Design bridge**: bring the Figma kit into the project automatically, and surface a decision wherever the automation breaks (fix the Figma kit / extend the heuristic / dev intervenes by hand). It is **not** a pixel-QA tool.

The current UI undermines that mission with **two divergent render paths** for the same component:

- **Preview** (`Live*.vue`) — hand-built bespoke HTML approximations, styled by inline styles from `extractArbitrary`. A second, *invented* source of truth that can look right while the real component is wrong. This is "die Lüge."
- **Real** (`LiveReal*.vue` + `use-render-diff.ts`) — the actual Nuxt UI v4 component mounted with the generated recipe, plus a diagnostic delta table. The real engine, but buried under tables and only available for ~15 components.

The two views look unrelated and "passt teils gar nicht zusammen." This spec resolves that **by construction**: there is only one render — the real one.

---

## Goal

For every renderable component, show **one** clean render: the real Nuxt UI v4 component, themed by the user's exported tokens, presented as a Design-Kit panel (resting hero + key variants + key states). Retire the hand-built approximation. Demote the diagnostic deltas to a collapsible secondary panel. Surface a per-component coverage/trust badge.

**Success criteria:**
- Selecting a component shows a single real-render kit panel — no Preview/Real choice to make.
- No component renders via hand-built approximation markup (`Live*.vue`) anymore (see modal/dropdown handling).
- The render-diff deltas still exist but are collapsed by default, not the main stage.
- A trust signal (coverage headline) is visible on each component's panel.
- All existing tests stay green; new mount tests cover the kit panel structure; visual fidelity is verified via headless `/browse` QA (computed-style fidelity is not unit-testable — jsdom returns empty computed values).

---

## Scope

**In scope (this round = "P-1", in-inspector gallery, tree-driven):**
- A single per-component **Kit panel** rendered from the existing real-render machinery.
- Retiring the `Live*.vue` approximation render path.
- Demoting `RenderDeltaTable` output into a collapsible "Diagnose" disclosure.
- A per-component coverage/trust badge on the panel header.
- Collapsing the right-pane tabs from `preview | coverage | real` → `kit | coverage`.

**Explicitly OUT of scope (parked / future rounds):**
- **Q — generated, runnable Nuxt design-kit artifact** (the true-fidelity endgame, later embeddable via iframe). This spec stays at in-inspector render (Stufe 1).
- **Y — decision-routing of deviations into the three owners** (Figma-kit / heuristic / dev). Natural follow-up; builds on the existing scan warnings + capability-deviation detectors.
- **Figma side-by-side comparison (B)** and **acceptance/sign-off checklist (ii)** — dropped as visual-QA features the bridge mission does not need.
- The **"finished components" marker** — dropped (the Figma lib is perpetually WIP; scope is "renderable", not "finished").
- A **whole-kit single-page overview (P-2)** — deferred; P-1 is tree-driven per-component.

---

## Current state (key seams, from the architecture map)

- `src/app/App.vue:182` — `paneTab = ref<"preview"|"coverage"|"real">("preview")`, reset to `"preview"` on component change (~:193).
- `src/app/App.vue:189` — `realRenderSupported` gates the Real tab to `button/table/nav/accordion/chip/sidebar` + everything in `REAL_SLOTTED_REGISTRY`.
- `src/app/App.vue:1048–1083` — the three tab buttons; Real button only when `realRenderSupported`.
- `src/app/App.vue:1092–1130` — Real tab dispatch → `LiveReal*.vue`.
- `src/app/App.vue:1132–…` — Preview tab dispatch → `Live*.vue`.
- `src/app/composables/use-preview-recipe.ts` — `usePreviewRecipe` / `useCustomPreviewRecipe` → the recipe object (shared by both paths).
- `src/app/composables/use-render-diff.ts` — `buildSlotSentinels`, `buildVariantCells`, `buildStateCells`, `useRealRender`, `computeRenderDiff` (browser-only; "real verdict is /browse").
- `src/app/components/RealVariantCell.vue` — wraps one real component instance + its delta table.
- `src/app/components/RenderDeltaTable.vue` — the delta list display.
- `src/app/components/real-slotted-registry.ts` — `REAL_SLOTTED_REGISTRY` maps `card/kbd/badge/progress/switch/checkbox/radio/input/textarea` → `{tag, props, slot?}`.
- `src/app/components/CoverageView.vue` + the `coverage` tab — existing per-component coverage view.
- `src/app/preview-component.ts` — `previewComponentForGroup` tree-label → component routing.
- Inventory: 17 `Live*.vue` (Preview); 6 bespoke `LiveReal*.vue` + `LiveRealSlotted.vue` (9 via registry). **modal** and **dropdown** have Preview only — no real render.

---

## Design

### 1. The Kit panel (per component)

Replace the Preview/Real branch in `App.vue` with one `LiveKitPanel.vue` (new) rendered whenever a component is selected. It reuses the existing real-render machinery — **this is a presentation change, not a new engine.**

Layout (top → bottom), all real rendered Nuxt UI v4 components:
1. **Hero** — the resting component at comfortable size (the "this is your component" shot).
2. **Variant matrix** — the recipe's `color × variant` cells via the existing `buildVariantCells`, laid out as a clean grid of real component instances (reuse `RealVariantCell`'s *render*, drop its always-on table).
3. **State row** — the recipe's states (`hover/active/disabled/focus/checked/open` as applicable) via `buildStateCells`, real instances.
4. **Diagnose disclosure** (collapsed by default) — see §3.

The panel is driven by `selectedComponent`; routing stays via `previewComponentForGroup` (unchanged).

### 2. Retire the approximation

- The `Live*.vue` hand-built render path is removed from the `App.vue` dispatch. The single Kit panel renders the real component for every component that **has** a real render.
- **`Live*.vue` files** are deleted once nothing references them (the orphans this change creates — see "Surgical changes"). Their tests are removed with them.
- **modal / dropdown** (no real render today): **DECISION — FLAG FOR REVIEW.**
  - *Recommended (bounded):* keep this spec scoped to the components that already have a real render; modal/dropdown show an honest **"Real-Render folgt"** placeholder in the Kit panel (their `Live*.vue` is retired too — no second render path survives), and a real inline-open render for them is the immediate next round.
  - *Alternative (wider):* add `LiveRealModal.vue` / `LiveRealDropdown.vue` now — render the overlay's panel **inline in its open state** for showcase. Higher risk (teleport/portal/positioning of Reka overlays), so it would be the riskiest task of this round.
  - The author leans **Recommended**; override in review if you want both pulled into this round.

### 3. Demote diagnostics

- The render-diff deltas (`RenderDeltaTable`) move into a single collapsible **"Diagnose / Abweichungen"** disclosure at the bottom of the Kit panel, **collapsed by default**.
- `useRealRender` / `computeRenderDiff` / `diffComputed` / `render-diff.ts` are **unchanged** — only their placement and default-collapsed presentation change.
- Rationale: the deltas remain the honest fidelity signal (and the trust check that the in-inspector render is faithful — if deltas for compiled classes are ~0, the Kit render is trustworthy), but they are no longer the main stage.

### 4. Coverage / trust badge

- Surface the component's coverage headline (e.g. `14/18 Tokens gemappt`) as a small badge on the Kit panel header, sourced from the existing coverage computation feeding `CoverageView.vue`.
- The separate `coverage` tab and `CoverageView.vue` stay **as-is** (out of scope to redesign); only the headline is mirrored inline. This serves the WIP-trust role: at a glance, how much of this component the render is actually driving.

### 5. Information architecture / tabs

- `paneTab` type changes `"preview" | "coverage" | "real"` → `"kit" | "coverage"`, default `"kit"`; reset to `"kit"` on component change.
- Tab buttons at `App.vue:1048–1083` reduce to **Kit | Coverage**. `realRenderSupported` is no longer a tab-availability gate (the Kit tab always shows); it is repurposed only to decide hero-render vs. "Real-Render folgt" placeholder per component.

---

## Architecture / units

**New:**
- `src/app/components/LiveKitPanel.vue` — the per-component kit panel (hero + variant matrix + state row + collapsed Diagnose + coverage badge). One clear responsibility: present the real render of one component as a kit panel. Depends on `usePreviewRecipe`/`useCustomPreviewRecipe`, `use-render-diff` builders, `RealVariantCell` (render-only mode), and the coverage headline.
- Possibly `src/app/components/KitDiagnoseDisclosure.vue` — thin wrapper that lazy-mounts the existing `RenderDeltaTable`s when expanded (keeps `LiveKitPanel` focused). Optional; inline if trivial.

**Changed:**
- `src/app/App.vue` — replace the Preview/Real dispatch (lines ~1092–end of preview block) with the single `LiveKitPanel`; update `paneTab` type/default/reset and the tab buttons.
- `src/app/components/RealVariantCell.vue` — add a `showDiagnostics` (default false) or split the render from the table so the kit can reuse the real-instance render without the always-on `RenderDeltaTable`.
- `src/app/preview-component.ts` — unchanged in logic; keep as routing.

**Removed (once unreferenced):**
- `Live*.vue` approximation components + their tests (subject to the modal/dropdown decision in §2).

**Untouched (reused as-is):**
- `use-render-diff.ts`, `render-diff.ts`, `real-slotted-registry.ts`, `extract-arbitrary.ts`, `project-to-state.ts`, `CoverageView.vue`, the recipe engine.

---

## Data flow

`graph` (built from export) → `usePreviewRecipe(graph, {component})` → recipe → `buildSlotSentinels`/`buildVariantCells`/`buildStateCells` → real Nuxt UI components mounted with `:ui` → `LiveKitPanel` lays them out (hero/matrix/states) → on expand, `computeRenderDiff` fills the Diagnose disclosure. Coverage headline computed from the same graph+recipe. **No change to how the export is parsed or how recipes are built** — the input and engine are identical; only the rendering/layout surface changes.

## Error handling / fidelity trust

- **Component without a real render** (modal/dropdown per §2): honest "Real-Render folgt" placeholder, never a silent blank or a fallback to approximation.
- **Runtime-Tailwind faithfulness ceiling:** the in-inspector render uses runtime Tailwind, which can lag/be incomplete. The Diagnose disclosure (deltas) is the explicit measure of this gap — if a component shows large deltas for compiled classes, that is surfaced, not hidden. The Kit render is labeled implicitly as Stufe-1 fidelity; Stufe-2 (Q) is the future true-build path.
- **Custom components (chip/sidebar):** continue through `useCustomPreviewRecipe` + `buildSlotSentinels`; they already have real renders.

## Testing

- **Mount tests** (jsdom, vitest) for `LiveKitPanel`: correct routing per `selectedComponent`; hero + variant cells + state cells present for a fixture component; Diagnose disclosure present and collapsed by default; coverage badge shows the headline number; "Real-Render folgt" placeholder for a no-real-render component.
- **App.vue IA mount tests:** `paneTab` defaults to `"kit"`, Kit|Coverage tabs render, switching works, reset-on-component-change. Extend the existing `App.*.test.ts` family.
- **Computed-style fidelity is NOT unit-tested** (jsdom returns empty `getComputedStyle`); visual fidelity verified via headless **/browse** QA on the live export, per the existing `use-render-diff.ts` contract ("real verdict is /browse").
- Pre-commit gate (vue-tsc + full vitest) must stay green; update test counts where the harness reports them (README).

---

## Surgical changes / orphans

Removing the `Live*.vue` dispatch will orphan the `Live*.vue` files, their imports in `App.vue`, and possibly helpers used only by them (e.g. parts of `extract-arbitrary.ts`/`project-to-state.ts` if the real path doesn't use them). Remove only the orphans **this change** creates; verify each `extract-arbitrary`/`project-to-state` export still has a consumer (the real path may still use `extractArbitrary` for the diff probe and `projectToState` for expected-state) before deleting. Do not pre-emptively delete shared helpers.

---

## Open decisions for your review

1. **modal/dropdown (§2):** placeholder now + real inline-open render next round (recommended), or add `LiveRealModal`/`LiveRealDropdown` in this round (wider, riskier)?
2. **Coverage (§4):** mirror only the headline inline and keep `CoverageView`/`coverage` tab as-is (recommended), or fold coverage fully into the Kit panel and drop the separate tab?
3. **Variant/state breadth (§1):** show the full `buildVariantCells`/`buildStateCells` matrix (complete, can be large), or a curated representative subset per component (cleaner kit, but needs a selection rule)?

---

## Future rounds (explicitly parked)

- **Q:** generated runnable Nuxt design-kit (`app.config.ts`+`tokens.css`+`custom-components.ts`) in a real Nuxt runtime, later iframe-embedded → true Stufe-2 fidelity.
- **Y:** decision-routing of every deviation/unmapped token into Figma-kit / heuristic / dev owners — makes the bridge explicit; builds on scan warnings + capability-deviation detectors.
- **P-2:** whole-kit single-page showcase overview as a Kit landing.
