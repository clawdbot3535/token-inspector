# Design: capability-gap detector (paired-slot asymmetry)

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/capability-gap-detector`
- **Theme:** the inverse of `unsupported-part`. `unsupported-part` flags a Figma part Nuxt has
  no slot for; this flags a **Nuxt slot the Figma tokens leave uncovered** — specifically when
  one half of a leading/trailing slot pair is filled and the counterpart isn't.

## Problem / goal

Nuxt UI components expose `leadingIcon` **and** `trailingIcon` slots, but the Figma export only
carries a generic `icon-size` token, which the slot-mapping grammar routes to `leadingIcon`
only. So `trailingIcon` is a real Nuxt capability that no Figma token fills — today it is
**neither mapped nor flagged**; it silently falls out. There is no signal that Nuxt offers more
than the tokens use.

Add a scanner **capability-gap** hint that surfaces this: when, for a component, one half of a
leading/trailing slot pair is filled by a mapped token and the other half is a real Nuxt slot
(`∈ NUXT_SLOTS`) but unfilled, emit an informational hint.

Key framing (from exploration): `icon-size` is a **generic** size — Nuxt sizes both the leading
and trailing icon from the same value. So `trailingIcon` empty is an **adapter routing gap**
(Figma has the size; the adapter routes it to one slot), not a missing Figma token. The hint's
message says so. The actual routing fix (emit `icon-size` to both slots) is a separate
recipe-engine cycle, **out of scope** here.

Success criteria (against the real export):
- `button` / `input` / `textarea` / `badge` (all have `icon-size` → `leadingIcon`, and a
  `trailingIcon` Nuxt slot) → exactly one `capability-gap` hint each, on `trailingIcon`.
- Components with no `icon-size` token (chip, card, …) → `leadingIcon` unfilled → no asymmetry →
  **not** flagged.
- Structural slots (`label`, `leadingAvatar`, the `leading`/`trailing` wrappers) are never
  flagged — they are not part of a grammar-fillable pair.
- Severity `hint`; one hint per (component, unfilled slot). Scanner-only; no grammar/recipe/output
  change. Full suite + typecheck + build green; verified against the export.

## Decisions

- **Paired-slot asymmetry, not "all unfilled slots".** Naively flagging every `NUXT_SLOTS` entry
  with no token over-fires massively (label/avatar/wrapper slots are structural and never
  tokenised). Asymmetry — one half of a pair filled, the other not — is precise and needs no
  curated allow-list (the lesson from `unsupported-part` / `NON_PART_SEGMENTS`).
- **Pairs are over the grammar-fillable `RecipeSlot`s.** `RecipeSlot = "base" | "leadingIcon" |
  "trailingIcon" | "label"`. The only leading/trailing pair the grammar can actually fill is
  **`leadingIcon ↔ trailingIcon`**. The `leading`/`trailing` input wrappers are `NUXT_SLOTS`
  entries but not `RecipeSlot` values, so no token ever fills them → no asymmetry to detect there
  (correctly silent). `SLOT_PAIRS` is a one-entry list today, extensible.
- **Severity `hint`, not `warning`.** Nothing is wrong with a Figma token and nothing is dropped
  — it is a coverage diagnosis ("Nuxt can use more than your tokens cover"). The `warning`
  severity is reserved for tokens that produce no output (validation-color, state-via-prop,
  unsupported-part).
- **The message names the routing nuance** (icon-size is shared; adapter routes to leadingIcon
  only) so it is actionable without implying the Figma token is missing.
- **Filled = the set of `mapping.slot`** over a component's non-null mapped tokens — reuses the
  existing `getSlotMapping` call in the scanner index loop.

## Design

### `component-vocab.ts` — `SLOT_PAIRS`

```typescript
/** Leading/trailing slot counterparts among the grammar-fillable RecipeSlots.
 * Used by the capability-gap detector: when one half is filled by a Figma token
 * and the other is a real Nuxt slot but unfilled, that asymmetry is flagged.
 * Only `leadingIcon`/`trailingIcon` is fillable today (the `leading`/`trailing`
 * input wrappers are not RecipeSlot values). Extensible. Typed as `string` pairs
 * (not `RecipeSlot`) on purpose: `slot-mapping.ts` already imports from
 * `component-vocab.ts`, so importing `RecipeSlot` here would create a cycle; the
 * values are only ever compared against the `string` `NUXT_SLOTS` sets. */
export const SLOT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["leadingIcon", "trailingIcon"],
];
```

### `scanner.ts` — accumulate filled slots + emit the hint

In the index loop, alongside the existing `unsupported-part` accumulators, record the mapped
slot per component:

```typescript
const filledSlotsByComponent = new Map<string, Set<string>>();
// … in the non-null mapping path (where `mapping` is defined):
const fs = filledSlotsByComponent.get(prefix) ?? new Set<string>();
fs.add(mapping.slot);
filledSlotsByComponent.set(prefix, fs);
```

After the loop, for each component **with a `NUXT_SLOTS` entry**, walk the pairs:

```typescript
for (const [comp, slots] of /* components with a NUXT_SLOTS entry */) {
  const filled = filledSlotsByComponent.get(comp) ?? new Set<string>();
  for (const [a, b] of SLOT_PAIRS) {
    for (const [filledSide, gapSide] of [[a, b], [b, a]] as const) {
      if (filled.has(filledSide) && !filled.has(gapSide) && slots.has(gapSide)) {
        issues.push({
          id: `cg-${comp}-${gapSide}`,
          category: "classification-hint",
          severity: "hint",
          kind: "capability-gap",
          message:
            `Nuxt UI v4 \`${comp}\` has a \`${gapSide}\` slot, but the Figma tokens only fill ` +
            `\`${filledSide}\` (via \`icon-size\`). Nuxt sizes both icons from the same value, so ` +
            `\`${gapSide}\` stays unsized in the recipe — add a trailing token, route \`icon-size\` ` +
            `to both adapter-side, or ignore if a leading-only icon is intended.`,
          tokenIds: [],
          componentName: comp,
        });
      }
    }
  }
}
```

Notes:
- Iterate only components that have a `NUXT_SLOTS` entry (skip the uninventoried — can't judge).
- `tokenIds: []` — this hint is about an absent token, so it references none. Verified
  idiomatic: `ScanIssue.tokenIds` is `readonly string[]` and three existing detectors
  (`incomplete-size-variant`, `asymmetric-size-coverage`, `orphaned-size-key`) already emit
  `tokenIds: []`. The message + `componentName` carry the signal.
- The symmetric `[[a,b],[b,a]]` walk means if only `trailingIcon` were ever filled, the gap would
  be reported on `leadingIcon` — correct and direction-agnostic.

### Tests (`scanner.test.ts`, new describe block)
- **flags trailingIcon when icon-size fills leadingIcon:** a graph with `button-icon-size-md`
  (+ a base token so the component is processed) → exactly one `capability-gap` issue,
  `id === "cg-button-trailingIcon"`, severity `hint`, `componentName === "button"`, message
  contains `trailingIcon`.
- **no gap without icon-size:** a `chip` graph with only `chip-bg` (no icon-size) → no
  `capability-gap` (leadingIcon unfilled → no asymmetry). (chip also has no trailingIcon slot, so
  doubly safe.)
- **no gap when both sides filled:** if a component had both leading and trailing filled, no hint
  — simulate by a graph where `filled` has both (can be a focused unit on the pair logic, or skip
  if not expressible through the grammar today; document why).
- **uninventoried component skipped:** a token for a component with no `NUXT_SLOTS` entry → no
  `capability-gap`.
- **one hint per (component, slot):** multiple `button-icon-size-*` tokens → still a single
  `cg-button-trailingIcon`.

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Against the export (the CLI/app scan): confirm exactly `button`, `input`, `textarea`, `badge`
  each emit one `capability-gap` hint on `trailingIcon`, and no other component does. List the set.

## Out of scope
- The recipe-engine **routing fix** (emit `icon-size` to `trailingIcon` too) — separate cycle; a
  design may deliberately want a leading-only icon, so auto-routing is a decision of its own.
- A curated broader "expected-token slots" list (beyond paired asymmetry).
- Non-icon pairs / avatar slots / wrapper slots.

## Risks
- **Is the hint noise?** It fires for 4 components, all on `trailingIcon`, all the same root
  cause. That is a true, consistent finding, not noise; `hint` severity keeps it low-priority in
  the scan UI. If it reads as repetitive, a future grouping in `ScanView` (already groups by
  component) handles presentation.
- **`tokenIds: []`** — resolved: idiomatic (three existing detectors do it; `ScanView` groups by
  `componentName`, which is present).
- **`RecipeSlot` import cycle** — resolved: `slot-mapping.ts` imports from `component-vocab.ts`, so
  `SLOT_PAIRS` is typed `readonly [string, string]` (no `RecipeSlot` import).
