# Design: D2c — button variant-conditional ring + `border-width` grammar

- **Date:** 2026-06-05
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/d2c-variant-rings`
- **Cycle:** B deviation detection, part c (button). `badge` is deferred to a later
  cycle (D2d); it frames on the color axis and entangles with the D3 validation-color
  detector.

## Problem

Two gaps in the heuristic for button border tokens:

1. **`button.outline.border` maps to an invisible `border-color`.** Nuxt UI v4 frames the
   `outline` (and `subtle`) button variant with a Tailwind `ring ring-inset ring-<color>`,
   not a CSS border. The button `base` slot sets no `border-*` and no `ring`, and Tailwind
   v4 preflight zeros `border-width` on every element — so the designer's opaque
   `button.outline.border` (`#4F63D2`, plus `border-hover` / `border-disabled`) renders
   nothing today. It must emit `ring-color` on the `outline` variant.

   `button` is **not** in `RING_FRAMED_COMPONENTS` (input, checkbox, …) because its framing
   is *variant-conditional*: only `outline`/`subtle` are framed; `solid`/`soft`/`ghost`/
   `link` have no frame. The whole-component intercept is therefore the wrong tool.

2. **`button.outline.border-width` is silently dropped.** The designer added a `border-width`
   token per variant in Figma (e.g. `button.outline.border-width`). The parser yields
   `utility: "border-width"`, which matches no `HEURISTIC_RULES` entry, so
   `heuristicSlotMapping` returns `null` and the token vanishes with no output and no warning.
   On the only framed variant the width is the **ring width**, not a CSS border width.

The non-`outline` button border tokens (`button.solid/ghost/link.border`) are all
`rgba(0, 0, 0, 0)` (transparent `alpha:0`) — deliberate "no border" placeholders that align
with Nuxt (those variants have no frame). They are not deviations today, but an *opaque*
border later on one of those variants would be a real deviation Nuxt silently drops.

## Goal

Teach the grammar that for a *variant-conditional framer* (button), the `outline`/`subtle`
variants are ring-framed, so their `border` → `ring-color` and `border-width` → `ring-width`;
emit those as `ring-[…]` arbitrary classes; make the LiveButton preview render them without
relying on the JIT; and add a scanner hint when an opaque border sits on an unframed button
variant.

Success criteria:
- `button-outline-border` → `ring-color` on `variant.outline`; `-hover` / `-disabled`
  suffixes become `hover:` / `disabled:` prefixed ring classes (existing state handling).
- `button-outline-border-width` → `ring-width` on `variant.outline`, emitted as `ring-[1px]`.
- `button-solid/ghost/link-border` continue to map to `border-color` (transparent no-ops,
  unchanged).
- A non-framed component/variant `border-width` token (none in this export) emits
  `border-[Npx]` via a new `border-width` utility type.
- The LiveButton preview shows the outline variant's ring without garbage (no `0 0 0 2px 1px`).
- The scanner emits a `classification-hint` `hint` when an **opaque** `border` / `border-width`
  token sits on an unframed button variant (`solid`/`ghost`/`link`). It does not fire on the
  current export (those borders are `alpha:0`).
- Full suite + typecheck + build green; new behavior covered by unit tests.

## Decisions

- **Per-variant ring framing as a `Map`, not by widening `RING_FRAMED_COMPONENTS`.** A new
  `RING_FRAMED_VARIANTS: ReadonlyMap<string, ReadonlySet<string>>` = `{ button: {outline,
  subtle} }`. `button` stays out of `RING_FRAMED_COMPONENTS` (whole-component framing would
  wrongly ring `solid`/`ghost`/`link`). `subtle` is included because Nuxt genuinely frames it
  (correctness, not speculation) even though this export has no `subtle` tokens.
- **`border-width` is a first-class utility type.** New `UtilityType` members `border-width`
  and `ring-width`, both arbitrary-value types emitting `border-[Npx]` / `ring-[Npx]`.
  Tailwind disambiguates `ring-[1px]` (width) from `ring-[#hex]` (color) by value shape, so
  the `ring-`/`border-` prefixes are reused.
- **Ring width and ring color stay independent in the preview.** `ring-color` keeps its
  current fixed-2px `boxShadow`; `ring-width` emits a separate `outline` fallback
  (`outlineStyle: solid; outlineWidth: <value>; outlineColor: currentColor`). The two use
  different CSS properties so neither corrupts the other. The recipe **output** is correct
  (`ring-[1px]`); the preview ring is a deliberate approximation (its visible thickness comes
  from the 2px boxShadow, not the token). Chosen over merging width+color into one boxShadow
  to keep the diff small and stateless.
- **Scanner hint included.** An opaque border on an unframed button variant is flagged even
  though no such token exists yet, matching the "warn on faulty/incomplete Figma tokens"
  principle. Gated on opacity so the transparent placeholders never trip it.

## Design

### 1. Grammar (`src/component-vocab.ts`, `src/slot-mapping.ts`)

**`component-vocab.ts`** — new export:
```typescript
/**
 * Components whose ring frame is variant-conditional: only the listed variants
 * draw a Tailwind `ring` (others have no frame). Distinct from
 * RING_FRAMED_COMPONENTS, where every border is a ring. Nuxt UI v4 frames the
 * button `outline` and `subtle` variants with `ring ring-inset`.
 */
export const RING_FRAMED_VARIANTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["button", new Set(["outline", "subtle"])],
]);

export function isRingFramedVariant(component: string, variant: string | null): boolean {
  if (variant === null) return false;
  return RING_FRAMED_VARIANTS.get(component)?.has(variant) ?? false;
}
```

**`slot-mapping.ts`**:
- Add `"border-width"` and `"ring-width"` to the `UtilityType` union (and the header comment).
- Extend the existing border intercept (currently only `RING_FRAMED_COMPONENTS`) so a `border`
  *or* `border-width` token on a ring-framed component **or** ring-framed variant redirects to
  the ring utility:
  ```typescript
  const framed =
    RING_FRAMED_COMPONENTS.has(parsed.component) ||
    isRingFramedVariant(parsed.component, parsed.variant);
  if (parsed.utility === "border" && framed) {
    return buildEntry(slot, "ring-color", ctx);
  }
  if (parsed.utility === "border-width" && framed) {
    return buildEntry(slot, "ring-width", ctx);
  }
  ```
- Add a `HEURISTIC_RULES` entry for the non-framed fallback:
  ```typescript
  { match: (u) => u === "border-width", build: (ctx) => buildEntry("base", "border-width", ctx) },
  ```
  (placed near the existing `border` / `width` rules).

Worked example — `button-outline-border-width`: `parseSegments` →
`{ component: "button", variant: "outline", utility: "border-width", … }` (the trailing
`width` is not a SIZE/STATE suffix, so it stays part of the utility). `framed` is true via
`isRingFramedVariant("button", "outline")` → `buildEntry("base", "ring-width", ctx)` with
`variantAxis: "variant"`, `variantKey: "outline"`.

State suffixes still work: `button-outline-border-hover` →
`{ variant: "outline", utility: "border", state: "hover" }` → intercept → `ring-color` with
`statePrefix: "hover"` (unchanged `buildEntry` path).

### 2. Emit (`src/recipe-engine.ts`)

- Add `"ring-width"` and `"border-width"` to `ARBITRARY_VALUE_TYPES` (emit
  `prefix-[<resolvedValue>]`).
- `prefixForUtility`: `case "ring-width": return "ring-";` / `case "border-width": return
  "border-";`.
- `shadowIdFor` switch: add both to the `"arbitrary-temp"` group (never read, satisfies the
  exhaustive switch).

Result: `button-outline-border-width` (value `1px`) → `ring-[1px]` under
`variants.variant.outline.base`.

### 3. Preview (`src/app/extract-arbitrary.ts`)

- Helper `isLengthValue(value: string): boolean` — true when the arbitrary value is a CSS
  length (starts with a digit / `.` / `-`, or carries a `px`/`rem`/`em` unit) rather than a
  color (`#…`, `rgb…`, `var(…)`, a colour word).
- `ring` branch: if `isLengthValue(value)` → set `outlineStyle: "solid"`, `outlineWidth:
  value`, `outlineColor: "currentColor"` (independent ring-width fallback); else keep the
  existing `boxShadow: 0 0 0 2px <value>` (ring color). This stops `ring-[1px]` from producing
  `0 0 0 2px 1px`.
- `border` prefix: if `isLengthValue(value)` → `borderWidth: value`; else existing
  `borderColor` (via `ARBITRARY_TO_CSS.border`). The existing preflight compensation
  (`borderColor` present ⇒ default `borderWidth: 1px` + `borderStyle: solid`) is unchanged; a
  `border-[1px]` width without a colour just sets the width.

### 4. Scanner hint (`src/scanner.ts`)

- Helper `isOpaqueColor(value: string): boolean` — `false` for `transparent`, `rgba(…, 0)`,
  and `#RRGGBB00`; `true` otherwise (plain hex, named, `var(…)`).
- Helper `isUnframedVariantBorder(id: string): boolean` — parses the token: its component has
  an entry in `RING_FRAMED_VARIANTS`, the utility is `border` or `border-width`, and the
  variant is present but **not** in that component's framed set.
- In the index loop (after `getSlotMapping`, which is now non-null for these tokens), add a
  check independent of the `mapping === null` branch:
  ```typescript
  if (isUnframedVariantBorder(node.id) && opaque(node)) {
    issues.push({
      id: `uvb-${node.id}`,
      category: "classification-hint",
      severity: "hint",
      kind: "border-on-unframed-variant",
      message: `\`${node.id}\` sets a border on the \`${variant}\` button variant, which Nuxt UI v4 renders without a frame (only \`outline\`/\`subtle\` are ring-framed). This border will not appear in the output.`,
      tokenIds: [node.id],
      componentName: prefix,
    });
  }
  ```
  where `opaque(node)` is `isOpaqueColor(value)` for `type === "color"` and `value > 0` for a
  numeric `border-width`. It does not `continue` — the token still flows through its normal
  (border-color) mapping.

### Tests

- **`slot-mapping.test.ts`**: `button-outline-border` → ring-color/variant.outline;
  `button-outline-border-width` → ring-width/variant.outline; `button-outline-border-hover` →
  ring-color + statePrefix hover; `button-solid-border` → border-color (unchanged);
  a non-framed `border-width` (e.g. `table-border-width`) → border-width utility;
  `isRingFramedVariant` truth table.
- **`recipe-engine.test.ts`**: a button graph with `button-outline-border-width: 1px` emits
  `ring-[1px]` under `variants.variant.outline`; `border-width` on a non-framed token emits
  `border-[Npx]`.
- **`extract-arbitrary.test.ts`**: `ring-[1px]` → `outlineWidth: 1px` (+ solid/currentColor),
  no `boxShadow`; `ring-[#4F63D2]` → `boxShadow` (unchanged); `border-[2px]` → `borderWidth`;
  `border-[#fff]` → `borderColor` (unchanged).
- **`LiveButton.test.ts`**: outline-variant preview exposes a ring/outline (smoke).
- **`scanner.test.ts`**: opaque border on `button-solid` → one `border-on-unframed-variant`
  hint; transparent `rgba(0,0,0,0)` on `button-ghost` → no hint; `button-outline-border` → no
  hint (framed).

### Verification

- `npm run typecheck && npx vitest run && npm run build` — all green.
- `npm run build:tokens` and inspect `output/app.config.ts`: `ui.button.variants.variant.
  outline` carries `ring-[…]` for the outline border/border-width (after adding a
  `button-outline-border-width` token to the export, or via a fixture).
- Headless: load the export, open the button preview, confirm the outline variant shows its
  ring; open the scan pane and confirm no false hint on the current (transparent) export.

## Out of scope

- `badge` (color-axis framing, D3-entangled) — deferred to D2d.
- `compoundVariants` emit path (Nuxt expresses `color × variant` rings via compoundVariants;
  the recipe schema has no compoundVariants support — tracked separately).
- Adding the `button-outline-border-width` token to the committed export (the designer owns
  the Figma export; the grammar handles it whenever it lands).
- Dropping/normalizing transparent placeholder borders (value-level filtering, not grammar).

## Risks

- **Preview double-frame.** On the outline variant, `ring-color` (2px boxShadow) and
  `ring-width` (outline fallback) both render, so the preview can show a 2px ring plus a
  thin outline. Accepted: the recipe output is correct and the preview is explicitly an
  approximation (the "keep independent" decision).
- **`isLengthValue` / `isOpaqueColor` edge cases.** Both are small classifiers over a known
  value vocabulary (px/rem hex/rgba/var). Covered by unit tests; `var(--…)` is treated as a
  color (opaque) which is correct for the color-token path.
- **Hint that never fires on real data.** The `border-on-unframed-variant` detector is
  speculative for this export. It is unit-tested against a synthetic opaque token so the path
  is exercised, and it is a low-severity `hint`.
