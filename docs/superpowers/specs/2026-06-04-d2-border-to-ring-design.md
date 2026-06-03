# Design: D2 — `border` → `ring` for ring-framed components

- **Date:** 2026-06-04
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/border-to-ring`
- **Cycle:** B (second case — D2 from the deviation-detection seeds)
- **Relates to:** `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md` (D2)

## Problem

Figma component tokens carry a `border` family (`input-border`, `input-border-hover`,
`input-border-focus`, …) and the recipe emits CSS `border-[…]` classes. But Nuxt UI v4
form fields and several other components have **no CSS border** — their frame is a
Tailwind `ring`. Nuxt's `input`/`textarea` base even sets `border-0` explicitly, and
`variant.outline = 'ring ring-inset ring-accented'`. So the emitted `border-[…]` paints a
frame Nuxt never uses, and on focus the recipe emits BOTH a `focus:border-[…]` and a
`focus:ring-[…]` — two conflicting frames.

## Goal

For components whose Nuxt frame is a ring, emit the Figma `border` family as `ring`
utilities instead of `border`, so the recipe matches Nuxt's ring model. Build the
mechanism component-agnostically (a configurable set) and enable it for the components
whose frame is a clean base-level ring. Grammar stays the single source of truth so
recipe-engine, scanner, and the App.vue highlight resolver classify identically.

Success criteria:
- `heuristicSlotMapping("input-border")` → `utilityType: "ring-color"`; `"input-border-hover"`
  → ring-color (state `hover`); `"input-border-focus"` → ring-color (state `focus`).
- A component NOT in the ring-framed set (e.g. `table-border`, `button-solid-border`)
  still → `border-color`.
- Building the real export, `ui.input.slots.base` contains `ring-[var(--…)]` for the
  resting/hover/focus frame and NO `border-[var(--…)]`.
- Full suite + typecheck + build green; cycle-A input artifacts updated intentionally
  (see "Ripple effects").

## Scope

**Ring-framed set (this cycle)** — token prefixes whose Nuxt frame is a clean base ring:
`input`, `textarea`, `checkbox`, `radio`, `kbd`, `dropdown`, `modal`.

**Deferred to D2b** (variant-conditional or special frame; each needs its own decision):
`button` (ring only on `outline`/`subtle`; `solid-border` has no frame), `badge` (same),
`card` (`ring` + `divide-y`), `chip` (decorative halo ring), `switch` (transparent
`border-2` for sizing; ring only on the highlight compound). These keep emitting
`border-color` for now.

**Never remapped** — genuine CSS-border components: `table` (`divide-y`), `nav`
(`border-s`/`border`). These keep `border-color`.

Frame classification was verified against the live Nuxt UI v4 themes (MCP `get-component`).

## Verified facts that de-risk the change

1. **Ring width comes from Nuxt, not us.** The recipe emits only the ring *color*
   (`ring-[var(--…)]`). Nuxt's own theme supplies the width (`ring ring-inset`) and
   tailwind-merge composes them (our color overrides Nuxt's default ring color; the width
   stays). So we never need to emit a ring-width utility.
2. **The `border-focus`/`ring-focus` collision is benign in practice.** `input` has both
   `input-border-focus` and `input-ring-focus`; after the remap both emit
   `focus:ring-[…]`. In the real export both resolve to the SAME `var(--color-state-focus-ring)`,
   so the recipe-engine's dedup-join collapses them to one class. (If a project gave them
   different values, both would emit — a data smell for a future detector, out of scope.)

## Decisions

- **Approach: grammar-level remap.** A `RING_FRAMED_COMPONENTS` set; the `border` rule
  emits `ring-color` when the token's component is in the set, else `border-color`.
  Rejected: per-token `slot-mapping.json` overrides (doesn't scale); recipe-engine
  post-correction (drift across scanner/App.vue, rejected in D1 too).
- **`border-checked` / `border-hovered` etc. remap uniformly.** For ring-framed
  components the mechanism only swaps the *utility* (`border-color`→`ring-color`); the
  state/variant axis handling is unchanged. So `checkbox-border-checked` →
  `checked:ring-[…]`, `radio-border-hovered` → `hover:ring-[…]`. This is assumed correct
  (Nuxt colors these states on the same ring); per-state Nuxt fidelity beyond the utility
  swap is not in scope.
- **Component detection from the token id.** `heuristicSlotMapping` derives the component
  as `tokenId.split("-")[0]` (the existing convention used across recipe-engine/scanner).

## Design

### Change 1 — `RING_FRAMED_COMPONENTS` in `src/component-vocab.ts`

Add a shared set (single source of truth, alongside the existing vocab sets):

```typescript
/**
 * Components whose Nuxt UI v4 frame is a Tailwind `ring` (not a CSS border):
 * their `border-*` tokens emit `ring-*` utilities. Limited to clean base-ring
 * frames; variant-conditional/special framers (button, badge, card, chip,
 * switch) and genuine border framers (table, nav) are intentionally excluded.
 */
export const RING_FRAMED_COMPONENTS: ReadonlySet<string> = new Set([
  "input", "textarea", "checkbox", "radio", "kbd", "dropdown", "modal",
]);
```

### Change 2 — `border` rule in `src/slot-mapping.ts`

`heuristicSlotMapping` derives the component and routes the `border` utility:

```typescript
import { /* …existing… */ RING_FRAMED_COMPONENTS } from "./component-vocab.js";

// inside heuristicSlotMapping, component derived once:
const component = tokenId.split("-")[0] ?? "";
```

Replace the existing `border` rule build so it emits `ring-color` for ring-framed
components:

```typescript
  {
    match: (u) => u === "border",
    build: (ctx) =>
      buildEntry(
        "base",
        RING_FRAMED_COMPONENTS.has(component) ? "ring-color" : "border-color",
        ctx,
      ),
  },
```

(Implementation detail for the plan: `component` must be in scope where the rule's
`build` runs. If the `HEURISTIC_RULES` array is module-level and can't see a local
`component`, resolve this by computing the `border` routing inline in
`heuristicSlotMapping` before the rule loop — same pattern as the existing `text`
disambiguation intercept — rather than threading `component` into every rule. The plan
picks the lower-risk of the two.)

No change to `ring-color` emission itself — `ring-color` already exists and emits
`ring-[…]` via the color path; the `border` tokens simply route to it.

### Change 3 — call sites already pass what's needed

`heuristicSlotMapping`/`getSlotMapping` already receive the full `tokenId`, so the
component is derivable without new parameters. The four call sites from D1 (recipe-engine
×2, scanner, App.vue) need no signature change for D2.

### Change 4 — tests

- `src/slot-mapping.test.ts`:
  - `heuristicSlotMapping("input-border")` → `{ slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null }`.
  - `heuristicSlotMapping("input-border-hover")` → ring-color with `statePrefix: "hover"` (match the existing border-state assertion shape).
  - `heuristicSlotMapping("checkbox-border-checked")` → ring-color, state `checked`.
  - `heuristicSlotMapping("table-border")` → `border-color` (NOT remapped).
  - `heuristicSlotMapping("button-solid-border")` → `border-color` (deferred component).
- `src/recipe-engine.test.ts`: build a graph with `input-border` (+ `input-border-focus`)
  aliasing semantic colors; assert emitted base contains `ring-[var(--…)]` and NOT
  `border-[var(--…)]`.

### Ripple effects (intentional cycle-A updates)

D2 changes `input`'s emitted frame from border to ring, so cycle-A artifacts must be
updated to match the corrected model:
- **`src/recipe-engine.test.ts` cycle-A input characterisation:** the assertions that
  check `focus:border-[#3B82F6]`, `hover:border-[#A1A1AA]`, `border-[#D4D4D8]` become the
  `ring` equivalents (`focus:ring-[#3B82F6]`, etc.). Update them deliberately.
- **`src/__snapshots__/recipe-engine.test.ts.snap`:** the pinned `ui.input` block changes
  border→ring; regenerate with `vitest -u` after confirming the diff is exactly the
  border→ring swap (no unrelated change).
- **`src/app/components/LiveInput.test.ts`:** the JIT-regression test asserts distinct
  inline `borderColor` per state. After D2, `extractArbitrary` maps `ring-[color]` →
  `boxShadow` (not `borderColor`), so update the assertion to check distinct `boxShadow`
  values instead. The fallback/disabled/icon tests are unaffected.
- **LiveInput preview (visual):** input now renders its frame as a `ring` (boxShadow
  `0 0 0 2px <color>`) rather than a CSS border. Visually near-identical (a 2px outline);
  technically a ring, matching Nuxt.

### Verification

- `npm run typecheck && npx vitest run && npm run build` — all green.
- `npx tsx scripts/build-cli.ts`; inspect `output/nuxt/app.config.ts`: `ui.input.base`
  (and `checkbox`, `radio`, `kbd`, `dropdown`, `modal`) emit `ring-[var(--…)]` for frame
  tokens and no `border-[…]`; `table`/`nav` still emit `border-[…]`.
- Headless: load the real export, confirm the `input` preview shows a ring frame across
  states (default/hover/focus), no double frame.

## Out of scope

- D2b: `button`, `badge`, `card`, `chip`, `switch` (variant-conditional/special frames).
- A detector for `border-focus`/`ring-focus` value conflicts (only fires when they differ;
  benign in current data).
- D3 (validation color / compoundVariants).

## Risks

- **Cycle-A regression surface.** The intentional updates to the cycle-A input tests +
  snapshot + LiveInput test are the main surface; each is enumerated above so none is
  missed. The grammar unit tests for the non-remapped components (`table`, `button`)
  guard against over-broad remapping.
- **`component` scoping in the grammar.** The `border` rule needs the component name; the
  plan resolves this via an inline intercept (like the `text` disambiguation) to avoid
  threading `component` into all rules. Low risk, but called out.
- **Other ring-framed components' state tokens.** `checkbox`/`radio`/`switch`-style
  `border-checked`/`border-hovered` become `checked:ring`/`hover:ring`; assumed correct.
  If a specific component's Nuxt state coloring differs, that's a follow-up refinement,
  not a blocker for the utility swap.
