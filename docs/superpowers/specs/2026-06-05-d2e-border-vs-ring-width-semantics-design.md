# Design: D2e — `border-width` (resting) vs `ring-width` (focus) semantics

- **Date:** 2026-06-05
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/d2e-width-semantics`
- **Builds on:** D2c (button variant-conditional ring + `border-width`/`ring-width` utility types)

## Problem

The updated Figma export (`assets/tokens-20260605-123353.zip`) introduces two
**component-level** width tokens on button:

| Token | Value | Figma alias | Designer intent |
|-------|-------|-------------|-----------------|
| `button-border-width` | 1 | `border/width/default` (normal) | resting frame width |
| `button-ring-width` | 2 | `border/width/thick` (strong) | focus-ring width |

The designer's token vocabulary is consistent: `border-*` = the resting frame,
`ring-*` = the focus ring (cf. existing `ring-focus` colour, `ring-offset`). This maps
exactly onto Nuxt UI v4's outline frame, which has two ring widths: `ring ring-inset`
(resting, ~1px) and `focus-visible:ring-2` (focus, 2px).

The current grammar gets both backwards (verified by trace against the real export):

```
button-border-width (=1, normal)  →  border-[1px]   on base   ← dead CSS border
button-ring-width   (=2, strong)  →  null                     ← dropped (no rule)
```

1. **`border-width` → `border-[1px]` (CSS border).** On a ring-framed variant the frame is
   a *ring*, not a CSS border, and the base has no border-colour — so the 1px width attaches
   to an invisible border and never reaches the visible ring.
2. **`ring-width` → dropped.** `heuristicSlotMapping` has no rule for a bare `ring-width`
   utility, so the focus-ring width has zero effect.
3. **Preview shows 2px everywhere.** `extractArbitrary`'s `ring` branch hard-codes
   `boxShadow: 0 0 0 2px <colour>` for every ring-colour class, so every ring-framed
   component renders a fixed 2px ring at rest *and* on focus — the normal 1px resting width
   never shows, making everything look "strong".

Net effect, in the user's words: "genau falschrum — ring-width=strong, border-width=normal",
and "ring-width wird auf alle border angewendet, nicht nur auf focused".

## Goal

Map the resting-vs-focus width tokens to the right Nuxt targets, and make the preview render
the real widths.

| Token | → utility / state | Emitted class |
|-------|-------------------|---------------|
| `border-width` on a ring-framed component/variant | `ring-width`, base (resting) | `ring-[1px]` |
| `border-width` on a non-framed component (table, nav) | `border-width`, base | `border-[1px]` |
| `ring-width` (any component) | `ring-width`, **focus** | `focus:ring-[2px]` |

And: the LiveButton/LiveInput preview composes ring colour + ring width into a single ring
per state (resting `0 0 0 1px <colour>`, focus `0 0 0 2px <focus-colour>`).

Success criteria:
- `button-border-width` (component-level, button has ring-framed variants) → `ring-[1px]` on
  `slots.base` (resting ring width for the outline variant; harmless no-op on solid/ghost/link
  which have no resting ring colour).
- `button-ring-width` → `focus:ring-[2px]` on `slots.base` (focus-ring width, all variants).
- `table-border-width` (non-framed) → `border-[1px]` (unchanged from D2c).
- `<comp>-outline-border-width` (variant-level, ring-framed) → `ring-[Npx]` base (unchanged
  from D2c).
- The preview renders the outline button with a 1px resting ring and a 2px focus ring (no
  stray CSS outline, no fixed-2px-everywhere).
- Full suite + typecheck + build green; new behaviour covered by unit tests; verified
  end-to-end against the new export.

## Decisions

- **`ring-*` is the focus-ring family.** A bare `ring-width` token (no state suffix) maps to
  `ring-width` with a forced `focus` state prefix, matching the design convention (`ring-focus`,
  `ring-offset`) and the user's explicit "nur focused" choice. An explicit state suffix, if
  present, wins over the forced focus default.
- **`border-width` is the resting frame width.** On a component that is ring-framed
  (`RING_FRAMED_COMPONENTS`) **or has ring-framed variants** (`RING_FRAMED_VARIANTS`, e.g.
  button) **or is on a ring-framed variant**, it redirects to `ring-width` on base. Otherwise
  it stays `border-width` (CSS). This extends D2c's variant-level redirect to cover
  component-level width tokens on framable components.
- **Preview combines width + colour into one ring (reverses D2c's "keep independent").** D2c
  chose to keep ring-width and ring-colour independent (width → CSS `outline` fallback)
  because ring-width was then speculative. With real resting/focus width tokens, the correct
  render is a single composited ring at the token's width. `extractArbitrary` now tracks the
  latest ring width + ring colour and emits one `boxShadow: 0 0 0 <width|2px> <colour|currentColor>`.
- **`ring-width` and `border-width` share the `ring-width` utility type** on the ring-framed
  path, differing only by state prefix (resting base vs `focus:`). Both already emit `ring-[…]`
  (D2c wiring); no new utility type is needed.

## Design

### 1. Grammar (`src/slot-mapping.ts`)

Two changes in `heuristicSlotMapping`, both before the `HEURISTIC_RULES` loop.

**(a) Extend the ring-framed test to cover component-level width tokens on framable
components.** The `ringFramed` const (added in D2c) currently is:
```typescript
const ringFramed =
  RING_FRAMED_COMPONENTS.has(parsed.component) ||
  isRingFramedVariant(parsed.component, parsed.variant);
```
Add `RING_FRAMED_VARIANTS.has(parsed.component)` so a component-level `button-border-width`
(variant === null) is treated as ring-framed:
```typescript
const ringFramed =
  RING_FRAMED_COMPONENTS.has(parsed.component) ||
  RING_FRAMED_VARIANTS.has(parsed.component) ||
  isRingFramedVariant(parsed.component, parsed.variant);
```
Import `RING_FRAMED_VARIANTS` alongside `isRingFramedVariant`. The existing `border` (→
ring-color) and `border-width` (→ ring-width) intercepts both read `ringFramed`, so
`button-border-width` now → `ring-width` (base, resting). (No component-level `<comp>-border`
colour token exists, so the colour intercept is unaffected in practice.)

**(b) Map a bare `ring-width` utility to `ring-width` + focus.** Add an intercept (after the
`border-width` intercept):
```typescript
// `ring-*` tokens are the focus-ring family (ring-focus colour, ring-offset). A
// bare `ring-width` is the focus-ring width → emit ring-width with a `focus:`
// prefix. An explicit state suffix, if present, wins.
if (parsed.utility === "ring-width") {
  const entry = buildEntry(slot, "ring-width", ctx);
  return entry.statePrefix == null ? { ...entry, statePrefix: "focus" } : entry;
}
```

Resulting mappings:
- `button-border-width` → `{ utilityType: "ring-width", variantAxis: null, variantKey: null }`
  → `ring-[1px]` on base.
- `button-ring-width` → `{ utilityType: "ring-width", variantAxis: null, variantKey: null,
  statePrefix: "focus" }` → `focus:ring-[2px]` on base.
- `table-border-width` → `border-width` (CSS), unchanged (`table` is in neither ring set).
- `button-outline-border-width` → `ring-width` base (unchanged from D2c; now also reachable via
  the component set, but the variant path already covered it).

### 2. Emit (`src/recipe-engine.ts`)

No change. `ring-width` is already an `ARBITRARY_VALUE_TYPES` member with the `ring-` prefix
(D2c), so it emits `ring-[Npx]`; the recipe engine already wraps a `statePrefix` ⇒
`focus:ring-[2px]`. Verify a component-level (`variantKey: null`) `ring-width` with a
`statePrefix` lands on `slots.base` as `focus:ring-[2px]` and is not diverted by the
non-suffix→default-size redirect (it is not — that redirect only fires when `statePrefix == null`).

### 3. Preview (`src/app/extract-arbitrary.ts`)

Replace the independent ring handling (D2c: colour → fixed-2px boxShadow, length → `outline`
fallback) with a **composed single ring**:
- While scanning classes, capture `ringColor` (from `ring-[<colour>]`) and `ringWidth` (from
  `ring-[<length>]`) into locals instead of writing style immediately.
- After the loop, if either is set, emit one shadow:
  `style.boxShadow = \`0 0 0 ${ringWidth ?? "2px"} ${ringColor ?? "currentColor"}\``.
- Drop the `outline*` fallback added in D2c (no longer needed; the width now feeds the
  boxShadow). `isLengthValue` stays (it classifies `ring-[1px]` vs `ring-[#hex]`).
- `border-[length]` → `borderWidth`, `border-[colour]` → `borderColor` (unchanged from D2c;
  still needed for genuinely border-framed components).

State projection (`projectToState`) already strips `focus:` for the focus state and drops it
otherwise, so the resting render sees `ring-[1px]` + `ring-[colour]` → `0 0 0 1px <colour>`,
and the focus render sees `ring-[2px]` + `ring-[focus-colour]` → `0 0 0 2px <focus-colour>`.

### Tests

- **`slot-mapping.test.ts`**: `button-border-width` → ring-width/base/no-state;
  `button-ring-width` → ring-width/base/statePrefix `focus`; `table-border-width` →
  border-width (unchanged); a variant-level `button-outline-ring-width` → ring-width +
  focus on variant.outline.
- **`recipe-engine.test.ts`**: a graph with `button-border-width: 1px` + `button-ring-width:
  2px` emits `ring-[1px]` and `focus:ring-[2px]` on `button.slots.base`; `table-border-width:
  1px` emits `border-[1px]`.
- **`extract-arbitrary.test.ts`**: `ring-[1px] ring-[#4F63D2]` → single `boxShadow: 0 0 0 1px
  #4F63D2` (no `outlineWidth`); `ring-[#4F63D2]` alone → `0 0 0 2px #4F63D2` (default width);
  `ring-[1px]` alone → `0 0 0 1px currentColor` (default colour); `ring-[var(--c)]` → colour.
- **`LiveButton.test.ts`**: outline preview resting ring uses the 1px width (boxShadow starts
  `0 0 0 1px`); after switching to the focus state, the ring is 2px.

### Verification

- `npm run typecheck && npx vitest run && npm run build` — green.
- Replace `components/*.tokens.json` with the new export (from
  `assets/tokens-20260605-123353.zip`), `npm run build:tokens`, confirm `ui.button.slots.base`
  carries `ring-[1px]` (resting) and `focus:ring-[2px]` (focus), and no dead `border-[1px]`.
- Headless: load the new export, confirm the outline button shows a thin (1px) resting ring
  and a thicker (2px) ring on focus; other variants unframed at rest, 2px focus ring.

## Out of scope

- `ring-offset` semantics (already emits on base; not part of this fix).
- Updating the committed `components/*.tokens.json` to the new export as a *product* change —
  done only transiently for verification unless the user wants it committed (separate decision).
- badge (D2d), compoundVariants emit path.

## Risks

- **Extending `ringFramed` with `RING_FRAMED_VARIANTS.has(component)`** also routes a
  hypothetical component-level `<comp>-border` (colour) to ring-colour. No such token exists in
  the export; semantically correct (resting frame of a framable component is a ring). Covered
  by leaving the per-variant border-colour tests green.
- **Preview combine reverses D2c's "independent" decision.** Intentional and now data-driven;
  the D2c `outline`-fallback tests are updated to the composed-ring behaviour.
- **Forced `focus` on bare `ring-width`** is a naming-convention rule. Documented; an explicit
  state suffix overrides it.
