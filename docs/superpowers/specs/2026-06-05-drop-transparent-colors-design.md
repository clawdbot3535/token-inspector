# Design: Drop fully-transparent colour emissions

- **Date:** 2026-06-05
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/drop-transparent-colors`

## Problem

The designer's Figma button defines a `border` (and `bg`) token for every variant for
structural uniformity, set to `color/transparent` where the variant has no paint. The adapter
faithfully emits these as dead classes:

```
ui.button.variants.variant.solid.base  → … border-[var(--color-transparent)] …
ui.button.variants.variant.ghost.base  → … border-[var(--color-transparent)] …
ui.button.variants.variant.link.base   → … border-[var(--color-transparent)] …
```

A transparent border paints nothing **and** trips the preview's preflight compensation
(`extractArbitrary` adds `borderWidth: 1px; borderStyle: solid` whenever `borderColor` is set),
producing a phantom 1px border on ghost/link previews. Nuxt UI v4's ghost/link/solid variants
have no border at all; the transparent token is a no-op placeholder.

9 component tokens resolve to fully-transparent in the committed export (a mix of `border` and
`bg`: `button-{solid,ghost,link}-border`, `button-{outline,ghost,link}-bg` and their
`-disabled`/`-hover` states); ~22 in the newer export (plus the `button-overlay-*` family).
`resolveTokenToValue` returns the terminal value `rgba(0, 0, 0, 0)` for each (verified).

## Goal

Stop emitting any colour-utility class whose token resolves to a **fully-transparent** value
(alpha 0). Omitting it lets Nuxt's default apply — which for these variants is also
transparent / no-border, so the rendered result is identical, minus the dead output and the
preview phantom.

Success criteria:
- A component colour token resolving to `rgba(…, 0)` / `transparent` / `#RRGGBB00` emits **no**
  class (border, bg, ring, …). `button-ghost-border` / `button-link-border` / `button-solid-border`
  no longer appear in `ui.button`; ghost/link/solid have no `border-[…]` class.
- Opaque colours are unaffected (`button-outline-border` still emits `ring-[#4F63D2]`,
  `button-solid-bg` still emits `bg-[#4F63D2]`).
- Non-colour utilities (widths, spacing, …) are unaffected.
- Full suite + typecheck + build green; verified against committed + new export.

## Decisions

- **Value-based, not variant-based.** The rule keys on the resolved colour value (alpha 0), not
  on which variant — so it uniformly removes every transparent placeholder (border *and* bg),
  per the user's choice ("drop all transparent colours").
- **Single source of truth for opacity.** Extract the existing `isOpaqueColor` helper from
  `scanner.ts` into a shared `src/color-opacity.ts`; both `scanner.ts` (D2c unframed-variant
  hint) and `recipe-engine.ts` import it. The function was already bug-fixed once (the `rgb()`
  alpha mis-capture) — one copy prevents drift.
- **Skip in the recipe engine, before emit.** Gate on `COLOR_UTILITY_TYPES` so only colour
  utilities are affected; dimensions/widths can't be "transparent".
- **Safe here.** Verified that Nuxt's default for each of the 9 transparent tokens is
  congruent (no border / transparent bg), so dropping changes nothing visible. The general
  edge case (transparent used to *override* a non-transparent Nuxt default) does not occur in
  this data and is out of scope.

## Design

### 1. Shared opacity helper (`src/color-opacity.ts`, new)

Move the body of `scanner.ts`'s `isOpaqueColor` verbatim into a new module and export it:

```typescript
/**
 * True for a colour value that paints (alpha > 0). Fully-transparent values
 * (`transparent`, `rgba(…, 0)`, `#RRGGBB00`, empty) return false. `rgb(…)` (no
 * alpha), plain hex, named colours, and `var(…)` are treated as opaque.
 * Single source of truth — consumed by the scanner (deviation hints) and the
 * recipe engine (dropping transparent emissions).
 */
export function isOpaqueColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "") return false;
  const rgba = v.match(/^rgba\(\s*[^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/);
  if (rgba) return parseFloat(rgba[1]!) > 0;
  if (/^rgb\([^)]*\)$/.test(v)) return true;
  const hex8 = v.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/);
  if (hex8) return parseInt(hex8[1]!, 16) > 0;
  return true; // #RRGGBB, named colours, var(…)
}
```

### 2. Scanner uses the shared helper (`src/scanner.ts`)

Delete the local `isOpaqueColor` definition; import it from `./color-opacity.js`. No behaviour
change (the D2c hint and any callers keep working). Existing scanner tests stay green.

### 3. Recipe engine drops transparent colours (`src/recipe-engine.ts`)

Import `isOpaqueColor`. In `buildComponentRecipes`, right after the resolved-value guard
(lines 190-191: `const resolved = resolveTokenToValue(node.id, graph); if ("error" in resolved)
continue;`), add:

```typescript
    // A fully-transparent colour paints nothing — emitting a class (e.g.
    // border-[var(--color-transparent)]) is dead output and trips the preview's
    // border-preflight compensation. Skip it; Nuxt's (equally transparent)
    // default applies.
    if (COLOR_UTILITY_TYPES.has(mapping.utilityType) && !isOpaqueColor(resolved.value)) {
      continue;
    }
```

`COLOR_UTILITY_TYPES` already exists in this file (line 65). `mapping` is in scope (the
non-null mapping from `getSlotMapping`). This runs before the size-redirect and
`utilityForMapping`, so the token is fully skipped (not added to any bucket).

### Tests

- **`color-opacity.test.ts`** (new, or fold into an existing util test): `isOpaqueColor`
  truth table — `"rgba(0, 0, 0, 0)"`/`"transparent"`/`"#00000000"`/`""` → false;
  `"#4F63D2"`/`"rgb(0,0,0)"`/`"rgba(0,0,0,1)"`/`"var(--x)"`/`"#000000ff"` → true. (Migrate the
  intent of the scanner's existing opacity coverage here.)
- **`recipe-engine.test.ts`**: a transparent `button-ghost-border` (`rgba(0,0,0,0)`) emits **no**
  class in `variants.variant.ghost` (the bucket is empty or absent); a transparent
  `button-ghost-bg` likewise; an opaque `button-solid-bg` (`#4F63D2`) still emits `bg-[#4F63D2]`;
  an opaque `button-outline-border` still emits `ring-[#…]`.
- **`scanner.test.ts`**: unchanged — confirm the suite stays green after the import swap.

### Verification

- `npm run typecheck && npx vitest run && npm run build` — green.
- `npm run build:tokens` (committed export): confirm `ui.button` has **no**
  `border-[var(--color-transparent)]` / `bg-[var(--color-transparent)]` on any variant;
  ghost/link/solid have no `border-[…]`; outline still rings; opaque bgs intact.
- Against the new export (transient swap, restore after): same check — none of the ~22
  transparent tokens emit; the `button-overlay-*` transparent ones drop too.
- Headless (optional): load an export, confirm ghost/link button previews have no phantom
  1px border.

## Out of scope

- Transparent-as-override (forcing transparent over a non-transparent Nuxt default) — not in
  this data; would need Nuxt-default knowledge to handle.
- The component divergence flag (`feat/component-divergence-flag`, parked) — separate.
- Removing the now-unused `--color-transparent` CSS var from `tokens.css` (harmless; leave it).

## Risks

- **A test asserting a transparent emission would break.** None is expected (existing
  recipe-engine tests use opaque fixtures), but the full suite must stay green; if one surfaces,
  it was asserting the dead-output bug and should be updated.
- **`isOpaqueColor` extraction.** Verbatim move + import swap; the scanner's existing opacity
  tests (rgb/rgba distinction) guard against regression. Keep the function byte-identical.
