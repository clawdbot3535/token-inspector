# Coverage View + nav-`link` grammar fix — Design

**Date:** 2026-06-16
**Status:** Approved
**Type:** Feature — Step 3 of the Design-System Coverage Guide (first user-facing slice) + a grammar correctness fix
**Parent:** `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260616-080346.md`
· builds on v0.28.14 (the coverage engine).

## Context

The coverage engine (`coverageFor`, v0.28.14) is built but has no consumer. Step 3 surfaces it in the
inspector: when a curated composite is selected, the component pane offers a **Coverage** tab next to
the **Preview**, showing which Nuxt slots the design has covered and which structural slots are still
un-designed. Bundled with it: a grammar fix for the **nav `link` collision** found during the engine's
TDD, so nav's flagship "design the link slot" insight is trustworthy from day one.

## Part 1 — Grammar fix: nav `link` slot-vs-variant

### Problem

`link` is both nav's one structural **slot** AND a Nuxt button-**variant** value (`solid|outline|soft|
subtle|ghost|link`). `heuristicSlotMapping` runs two passes; **pass 1** (`parseSegments(id)` with no
`componentSlots`) consumes a 2nd-segment `link` as a variant (slot-mapping.ts:114-118) and `matchParsed`
returns `slots.base` + `variantKey:"link"` — which is non-null, so it's returned early (line 520) and
**pass 2's slot routing never runs**. Result: `nav-link-bg` lands on `base`+variant, never the `link`
slot, so the coverage guide can never mark `link` touched even if the designer supplies `nav-link-*`.

There is a genuine ambiguity — NavigationMenu also has a `variant: pill|link`. We choose **slot-first**
(anatomy-first), consistent with this tool's slot-based purpose and the `nav-<slot>-*` token naming.

### Fix (two coordinated changes, scoped by slot-membership)

1. **`heuristicSlotMapping` — add a `variantShadowsSlot` guard** (mirrors the existing
   `overlayShadowsSlot`): when the pass-1 result's `variantAxis === "variant"` and its `variantKey` is
   one of `nuxtSlotsFor(component)`, do **not** return it — fall through to pass-2 slot routing.

   ```ts
   const variantShadowsSlot =
     normal?.variantAxis === "variant" &&
     normal?.variantKey != null &&
     (nuxtSlotsFor(parsed.component)?.has(normal.variantKey) ?? false);
   if (normal && !overlayShadowsSlot && !variantShadowsSlot) return normal;
   ```

2. **`parseSegments` — guard the 2nd-segment variant/color-role consumption** so pass 2 (which passes
   `componentSlots`) leaves a slot-named segment for the slotPrefix seam:

   ```ts
   if (parts.length >= 3 && second !== undefined && !(componentSlots?.has(second))) {
     if (BUTTON_VARIANT_KEYS.has(second)) { variant = second; start = 2; }
     else if (COLOR_ROLE_KEYS.has(second)) { colorRole = second; start = 2; }
   }
   ```

   `componentSlots` is `undefined` in pass 1, so `!undefined?.has(...)` is `true` → **pass 1 is exactly
   unchanged**. In pass 2, `nav-link-bg` skips variant consumption (`navSlots.has("link")`), so the
   slotPrefix seam (123-139) claims `link` → `slots.link`.

### Behaviour after the fix

- `nav-link-bg` → `{slot:"link", utilityType:"bg-color", variantAxis:null}` (was `base`+variant `link`).
- `nav-link-color` / `nav-link-text` → `slots.link` text-color.
- `button-link-bg` → `{slot:"base", variantAxis:"variant", variantKey:"link"}` **unchanged** (button has
  no `link` slot, so `variantShadowsSlot` is false and the pass-2 guard never engages).
- The 140-test grammar suite + recipe-engine + scanner suites run as the ripple check (pre-commit gate).
  Any test that characterized the old `nav-link → base+variant` behaviour is a correctness update.

## Part 2 — Coverage view

### `CoverageView.vue` (new presentational component)

- **Props:** `coverage: ComponentCoverage` (computed in App.vue via `coverageFor`).
- **Renders:**
  - Header: `{component} — coverage` + `{structuralTouched}/{structuralTotal} structural`.
  - **Structural (must-design)** section: each `slots` entry with `classification === "structural"`,
    showing `✓` (touched) or `✗` (missing, tagged "to design") + slot name + `controls`.
  - **Optional** section: each optional slot, `✓` (touched) or `○` (untouched / Nuxt default) + name +
    `controls`. Optional slots stay visible (user requirement).
- Pure presentational — no graph access, no mutation. Testable in isolation like `Live*`/`ScanView`.

### App.vue wiring (component-selected pane, ~line 987+)

- `const coverage = computed(() => state.graph.value && selectedComponent
    ? coverageFor(state.graph.value, selectedComponent) : null);`
- `const paneTab = ref<"preview" | "coverage">("preview");` reset to `"preview"` on `selectedComponent`
  change (watch) so each component opens on Preview.
- Tab bar **(`Preview | Coverage`) renders only when `coverage` is non-null** (the five composites);
  other components show just the preview, unchanged. The Coverage tab carries a small badge with the
  structural-missing count (`structuralTotal − structuralTouched`) when > 0.
- When `coverage && paneTab === "coverage"` → `<CoverageView :coverage="coverage" />`; otherwise the
  existing Live* preview chain.
- Scope: coverage lives in the **component-selected** chain only (reached by clicking a component group
  in the tree, which clears the node selection). The node-selected chain (token detail) is unchanged.
- `data-testid="coverage-tab"` / `"preview-tab"` for testability.

### Out of scope (first slice)

Click-a-slot-to-highlight-tokens; coverage in the node-selected chain; the overview/dashboard variant;
non-composite components; the `inherited` bucket.

## Testing

- **`packages/grammar/src/slot-mapping.test.ts`** (additions): `nav-link-bg`/`nav-link-color` →
  `slots.link`; `button-link-bg` → `base`+variant `link` unchanged.
- **`src/app/components/CoverageView.test.ts`** (new): mount with a fixture `ComponentCoverage` →
  structural section shows `✗` + "to design" for a missing slot; optional section visible; count header
  correct.
- **`src/app/App.coverage.test.ts`** (new): selecting a composite (nav) shows `Preview | Coverage` tabs;
  clicking Coverage mounts `CoverageView`; selecting a non-composite (button) shows no Coverage tab.

## Success criteria

- `nav-link-*` routes to `slots.link`; `button-link-*` unchanged; full grammar suite green.
- Selecting a composite offers a Coverage tab that lists structural (✓/✗) + optional (✓/○) slots with
  the structural count; non-composites are unchanged.
- New + existing suites green.

## Release

Minor **v0.29.0** — first user-facing slice of the Coverage Guide (grammar fix + coverage view).
CHANGELOG `### Added` (view) + `### Fixed` (nav-link routing); README test-count bump.
