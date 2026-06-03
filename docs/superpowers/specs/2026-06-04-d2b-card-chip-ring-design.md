# Design: D2b — `card` + `chip` join the ring-framed set

- **Date:** 2026-06-04
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/d2b-variant-frames`
- **Cycle:** B (D2b — the base-level subset of the deferred frame components)
- **Relates to:** `docs/superpowers/specs/2026-06-04-d2-border-to-ring-design.md` (D2 mechanism),
  `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md` (D2 seed)

## Problem

D2 remapped `border`→`ring` for ring-framed components whose frame is a clean base
ring (`input`, `textarea`, `checkbox`, `radio`, `kbd`, `dropdown`, `modal`), and
deferred `button`, `badge`, `card`, `chip`, `switch`. Of those deferred five, **`card`
and `chip` fit the same base-level mechanism** — their `border-*` tokens live on the
`base` slot (no variant/color axis), and Nuxt UI v4 frames both with a ring
(`card` outline/subtle = `ring ring-default`; `chip` base = `ring ring-bg` halo). They
just weren't enabled. `button`/`badge` carry their border tokens on the variant/color
axis (a different, harder problem → D2c), and `switch`'s `border` is a transparent
sizing `border-2`, not a visible frame.

## Goal

Add `card` and `chip` to `RING_FRAMED_COMPONENTS` so their `border-*` tokens emit `ring-*`
like the other ring-framed components — reusing the D2 grammar mechanism unchanged.
Formally exclude `switch`. Defer `button`/`badge` to D2c.

Success criteria:
- `heuristicSlotMapping("card-border")` → `ring-color`; `heuristicSlotMapping("chip-border")`
  → `ring-color`; `heuristicSlotMapping("chip-border-active")` → ring-color + `active`.
- `heuristicSlotMapping("switch-border")` → still `border-color` (excluded).
- `heuristicSlotMapping("chip-border-error")` → still `null` (unchanged; a trailing
  color-role the parser drops — D3 territory).
- Real export: `card` and `chip` frame tokens emit `ring-[…]`, no `border-[…]`;
  `switch`, `table`, `nav` keep `border-[…]`.
- Full suite + typecheck + build green.

## Why this is purely additive (no ripple)

Unlike D2 (which changed `input`, breaking cycle-A input assertions/snapshot/LiveInput),
D2b touches only `card` and `chip`:
- Neither has a live preview component (only `LiveButton`/`LiveInput` exist).
- Neither appears in the golden snapshot fixtures (those pin `button`/`input`).
- No existing test pins `card`/`chip` border output.

So adding them to the set breaks nothing; it only adds new behavior, covered by new
grammar unit tests.

## Decisions

- **Reuse the D2 mechanism unchanged.** `card`/`chip` border tokens are on the `base`
  slot, exactly the shape `RING_FRAMED_COMPONENTS` already handles. No new logic — just
  two set members.
- **Exclude `switch`.** Its `border-*` tokens map to Nuxt's transparent `border-2`
  sizing border (the visible state is a background fill; a ring appears only on the
  `highlight` compound). Remapping `switch-border`→`ring` would paint a frame Nuxt does
  not have. Documented as a non-remap case.
- **Defer `button`/`badge` to D2c.** Their border tokens live on the variant/color axis;
  a naive remap would ring non-framed variants (e.g. `button-solid-border` →
  `variants.variant.solid` = a ring on solid buttons Nuxt has no ring for). They need a
  variant-conditional mechanism, which is a separate design.

## Design

### Change 1 — extend `RING_FRAMED_COMPONENTS` (`src/component-vocab.ts`)

Add `card` and `chip` to the existing set, and extend the doc comment to record the
`switch` exclusion rationale:

```typescript
/**
 * Components whose Nuxt UI v4 frame is a Tailwind `ring` (not a CSS border):
 * their `border-*` tokens emit `ring-*` utilities. Limited to frames expressed
 * on the base slot.
 *
 * Excluded on purpose:
 * - `button`, `badge`: ring is variant/color-conditional (only outline/subtle) —
 *   their border tokens live on the variant/color axis; needs a variant-aware
 *   remap (D2c), not this component-level one.
 * - `switch`: its `border-*` is a transparent `border-2` used only for sizing
 *   (the visible state is a background fill); it is not a frame.
 * - `table`, `nav`: genuine CSS borders (`divide-y`, `border-s`).
 */
export const RING_FRAMED_COMPONENTS: ReadonlySet<string> = new Set([
  "input", "textarea", "checkbox", "radio", "kbd", "dropdown", "modal",
  "card", "chip",
]);
```

No change to `slot-mapping.ts` (the intercept already reads the set) or any call site.

### Change 2 — grammar unit tests (`src/slot-mapping.test.ts`)

Add to the existing "border→ring for ring-framed components" describe block:
- `heuristicSlotMapping("card-border")` → `{ slot: "base", utilityType: "ring-color", variantAxis: null, variantKey: null }`.
- `heuristicSlotMapping("chip-border")` → same shape (ring-color).
- `heuristicSlotMapping("chip-border-active")` → ring-color + `statePrefix: "active"`.
- `heuristicSlotMapping("switch-border")` → `border-color` (excluded — guard against
  accidental inclusion).
- `heuristicSlotMapping("chip-border-error")` → `null` (unchanged; trailing color-role
  the parser drops).

### Verification

- `npm run typecheck && npx vitest run && npm run build` — all green.
- `npx tsx scripts/build-cli.ts`; confirm in `output/nuxt/app.config.ts`: `card` and
  `chip` frame tokens emit `ring-[…]` and no `border-[…]`; `switch`, `table`, `nav` keep
  `border-[…]`.

### Docs

- Seeds doc: extend the D2 FIXED note to add `card`, `chip` to the fixed set and record
  the `switch` exclusion; note `button`/`badge` remain in D2c.
- CHANGELOG: extend the ring-framed Fixed bullet (or add a line) to include `card`/`chip`.

## Out of scope

- D2c: `button`, `badge` (variant/color-conditional ring; the harder mechanism).
- `switch` (sizing border — never remapped).
- D3 (validation color / compoundVariants).

## Risks

- **Base-level non-conditionality (same as D2).** `card-border` is on `base`, so the ring
  applies across all card variants, while Nuxt frames only `outline`/`subtle` (soft uses
  `divide-y`, solid none). This matches the pre-existing border-on-base behavior — the
  remap makes the framed variants more faithful (ring not border) without adding wrongness
  beyond what border-on-base already had. Full per-variant fidelity is D2c's concern.
- **`chip` ring is a decorative halo** (`ring-bg`), not a structural frame. Remapping
  `chip-border`→ring is still correct (it is a ring in Nuxt); the semantic nuance is noted
  but does not change the mechanism.
