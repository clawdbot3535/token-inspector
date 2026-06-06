# Design: sub-element slot routing (Item A, exact-match)

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/sub-element-routing`
- **Theme:** route Figma sub-element tokens (`dropdown-item-*`, `table-th-*`, `nav-item-*`, …) to
  their Nuxt recipe slot instead of leaving them unrouted, by filling the long-dormant
  "Approach-B seam" from the `NUXT_SLOTS` inventory — **exact name match only**.

## Problem / goal

`RecipeSlot` is a fixed union `"base" | "leadingIcon" | "trailingIcon" | "label"`, and the
`SLOT_PREFIXES` map that `parseSegments` consults is empty (v0.4.0). So a token like
`dropdown-item-padding-x` never reaches `slots.item` — it falls through unrouted (its utility
`item-padding-x` matches no rule → `null`). The recipe can't represent sub-elements, which also
blocks the checkbox/radio/switch previews.

Fill the seam from `NUXT_SLOTS`: when a token's segment (after variant/color-role) **exactly
matches a Nuxt slot of that component**, route the rest of the token to that slot.

**Exact-match only — no aliasing.** Naming mismatches (`check`→`icon`, `row`→`tr`,
`divider`→`separator`, `dot`→`indicator`) are deliberately **left to the `unsupported-part` hint**
(which suggests the Figma rename). Auto-aliasing them in the router would silence that
Figma-cleanup signal, contradicting the unsupported-part cycle's decision. So the router only
routes parts whose Figma name already equals the Nuxt slot name.

Success criteria (against the real export):
- `dropdown-item-*` → `slots.item` (or `variants.size.<sz>.item`), `table-th-*` → `slots.th`,
  `nav-item-*` → `slots.item`. The recipe gains these sub-element slots.
- **No regression for `icon-size`:** `button`/`input`/`checkbox` `*-icon-size-*` tokens still map
  exactly as before (e.g. `button-icon-size-md` → `leadingIcon`), even though `checkbox` has an
  `icon` slot.
- Naming-mismatch parts (`checkbox-check`, `table-row`, `table-divider`) stay **unrouted and
  still flagged** by `unsupported-part` (with their rename suggestion) — the router does not touch
  them.
- `unsupported-part` / `capability-gap` need **no change** — fewer null tokens for the exact-match
  parts (those were never flagged; they were just unrouted), more for nothing.
- Golden `app.config` snapshot updated; full suite + typecheck + build green; verified on the
  export.

## Decisions

- **`RecipeSlot` → `string`.** A slot is any Nuxt slot name; the four current values become
  documented common slots. Mechanical ripple through `recipe-engine.ts`
  (`Record<RecipeSlot, …>` → `Record<string, …>`).
- **Routing is a FALLBACK in `getSlotMapping`, not an unconditional parse-time consume.** Match
  the token the normal way first (no sub-element routing); **only if that yields `null`**, retry
  consuming a leading segment that exactly matches a `NUXT_SLOTS` slot for the component, re-derive
  the utility, and match again. This makes the `icon-size` rule win for `icon` (it matches
  normally, so the fallback never fires) while genuinely-unrouted sub-elements (`item`/`th`) get
  routed. No utility-leading-word list, no alias.
- **Exact match against `NUXT_SLOTS[component]`** (not the global empty `SLOT_PREFIXES`, not
  `FIGMA_NUXT_PART_ALIAS`). Reuses the inventory we built; `slot-mapping.ts` already imports from
  `component-vocab.ts` (no cycle).
- **`base` is never routed** (it is the default; consuming a literal `base` segment is a no-op).
- **Scope: the currently-inventoried components** (`button`, `badge`, `input`, `textarea`, `chip`,
  `checkbox`, `dropdown`, `table`, `nav`). `radio`/`switch` are not in `NUXT_SLOTS` yet, so their
  `thumb`/`dot` don't route — extending the inventory (and their previews) is a follow-on.

## Design

### 1. `RecipeSlot` widening (`slot-mapping.ts`, `recipe-engine.ts`)
- `slot-mapping.ts`: `export type RecipeSlot = string;` (keep the doc comment listing the common
  slots `base`/`leadingIcon`/`trailingIcon`/`label`/`item`/`th`/…). `SlotMappingEntry.slot`,
  `parseSegments`'s `slotPrefix`, and the `slot` arg stay typed `RecipeSlot` (= `string`).
- `recipe-engine.ts`: `slots: Partial<Record<RecipeSlot, string>>` and the three
  `variants.*: Record<string, Partial<Record<RecipeSlot, string>>>` continue to compile unchanged
  once `RecipeSlot` is `string`. `bucketKeyFor` already interpolates `mapping.slot` as a string.

### 2. Fallback sub-element routing (`slot-mapping.ts`, `getSlotMapping`)
- Remove the empty global `SLOT_PREFIXES` map and the unconditional `slotPrefix` consume inside
  `parseSegments` (the dormant seam). Replace with a fallback in `getSlotMapping`:
  1. Compute the mapping the existing way (no sub-element routing). If it is non-null, return it
     (covers `icon-size`, all current behaviour — **zero regression**).
  2. Else, look up `slots = nuxtSlotsFor(component)`. Take the segment at the post-variant/color
     `start` index. If `slots` has it (exact match) and it is not `"base"`, re-derive the utility
     from the remaining segments, match the rules again, and if that matches, return the entry
     with `slot` set to that segment.
  3. Else return `null` (unchanged — still flagged by `unsupported-part`).
- Implementation seam: give `parseSegments` an optional `componentSlots?: ReadonlySet<string>`
  parameter that, when provided, consumes a leading exact-match slot segment (sets `slotPrefix`,
  advances `start`); `getSlotMapping` calls `parseSegments` without it first, then with it on the
  null fallback. (Equivalent structures are fine as long as the normal match is attempted first.)

### 3. Effects
- `dropdown-item-padding-x` → normal utility `item-padding-x` is unknown → fallback: `item` ∈
  `NUXT_SLOTS[dropdown]` → utility `padding-x` matches → `slot: "item"`. Likewise `table-th-bg` →
  `slot: "th"`, `nav-item-radius` → `slot: "item"`.
- `checkbox-icon-size-md` → normal: utility `icon-size` matches the icon-size rule → `leadingIcon`
  (returns before the fallback) → **no regression**.
- `checkbox-check-color`, `table-row-*`, `table-divider` → normal null; fallback: `check`/`row`/
  `divider` not exact Nuxt slots → not routed → stay null → still `unsupported-part`-flagged.
- The recipe output gains `slots.item` / `slots.th` (and per-size variants) for the routed
  components. `unsupported-part`/`capability-gap` detectors are untouched and behave correctly
  (the routed parts were never flagged).

### Tests
- `slot-mapping.test.ts`:
  - `dropdown-item-padding-x` → `{ slot: "item", utilityType: padding-x }` (verify the exact
    `utilityType` the rule produces).
  - `table-th-bg` → `{ slot: "th", utilityType: bg-color }` (or whatever `th-bg`'s `bg` maps to).
  - `nav-item-radius` → `{ slot: "item", … }`.
  - **No regression:** `button-icon-size-md` → `{ slot: "leadingIcon", utilityType: icon-size }`;
    `checkbox-icon-size-md` → `leadingIcon` (matches via rule before the fallback).
  - **Not routed:** `checkbox-check-color` → `null` (check is not a checkbox slot); a component
    with no `NUXT_SLOTS` entry → `null`.
- `recipe-engine.test.ts`: a `dropdown` graph with `dropdown-item-padding-x` emits
  `recipe.dropdown.slots.item` (or the size-variant slot) containing the padding utility; update
  the golden snapshot.

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Against the export (`npm run build:tokens`): confirm the `app.config` now has `item`/`th` slots
  for `dropdown`/`table`/`nav`; confirm `button`/`input`/`checkbox` `icon-size` still land on
  `leadingIcon` (diff the button/input recipe vs `main` — should be unchanged); confirm the
  `unsupported-part` set is unchanged (chip-label/close, button-overlay, table-row/divider,
  checkbox-check still flagged). List the newly-emitted sub-element slots.

## Out of scope
- Aliased routing (`check`→`icon`, etc.) — intentionally left to `unsupported-part`'s rename hint.
- Extending `NUXT_SLOTS` to `radio`/`switch` and their `thumb`/`dot` routing + previews — follow-on.
- The `icon-size`→`trailingIcon` recipe routing fix (the capability-gap's real fix) — separate.

## Risks
- **`RecipeSlot` → `string` loses the closed union.** Acceptable — the type was always meant to
  widen (the "fill SLOT_PREFIXES" comment); a tool that emits arbitrary Nuxt slots can't keep a
  4-value union. No runtime effect.
- **Golden snapshot churn** — the `app.config` snapshot changes (new slots). Expected; update it
  and eyeball the diff (only additions for routed sub-elements; existing slots unchanged).
- **A sub-element segment that is also a utility-leading word** (only `icon` today, for checkbox)
  — handled by the fallback ordering (normal match wins). The verification explicitly checks
  `icon-size` is unregressed.
- **Unforeseen new routings** — any component whose token's segment happens to equal a Nuxt slot
  and didn't map before will now route. The real-export diff surfaces the full set to review.
