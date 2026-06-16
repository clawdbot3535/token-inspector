# Drop Unroutable icon-size on Container Slots (sidebar collapse) — Design

**Date:** 2026-06-16
**Status:** Approved
**Type:** Bugfix (grammar slot-mapping; changes emitted custom-components output)

## Problem

The sidebar preview item renders collapsed to 16×16px. `sidebar-item-icon-size` (value `16`)
is emitted as `size-4` on the custom recipe's `item` slot, which sets the item's width AND
height. The broader sweep confirmed this is the last collapsed preview (accordion + nav were
fixed in v0.28.8 / v0.28.10).

The v0.28.10 fix routes `icon-size` to the component's leading-icon slot via
`leadingIconSlotFor(component)`. But sidebar is a **custom** component (`KNOWN_CUSTOM`, not in
`NUXT_SLOTS`), so `leadingIconSlotFor("sidebar")` is `undefined` — there is no icon slot to
route to. The size then falls back onto the `item` container and collapses it.

## Why "drop any unroutable icon-size" is too broad

`chip-close-icon-size` also routes onto a no-icon-slot sub-element (`close`). But chip's `close`
is an icon-like **leaf**, and `size-N` there sizes the close button correctly — the existing
`custom-recipe-engine.test.ts` test asserts `chip.slots.close` carries `size-3`. Dropping it
would regress chip and break that test.

The distinction: sidebar's `item` is a layout **container** (a full-width row that `size-*`
collapses); chip's `close` is a **leaf** (sizing it is correct). The fix must drop only on
containers.

(Separately, `chip-close-icon` — a *colour*-valued token — mis-emits `size-[#hex]` because the
`icon` rule is value-type-blind. That is an inert/invalid class, a different bug, and is a
**separate follow-up**, not part of this fix.)

## Approach (chosen: drop unroutable icon-size on container slots)

In `matchParsed`'s icon-size branch (after the v0.28.10 `leadingIconSlotFor` check), drop the
icon-size when it would land on a layout-container sub-element with no icon slot to route to:

```ts
// Layout-container slots a stray `size-*` would collapse (width+height). Leaf slots
// (close, label, indicator, thumb, …) legitimately carry an icon size.
const ICON_SIZE_CONTAINER_SLOTS = new Set(["item", "content", "root", "wrapper"]);

// … inside the HEURISTIC_RULES loop:
if (entry.utilityType === "icon-size" && !/icon$/i.test(slot)) {
  const iconSlot = leadingIconSlotFor(parsed.component);
  if (iconSlot) return { ...entry, slot: iconSlot };
  // No icon slot to route to: an icon-size on a container slot can't be honoured and
  // would only collapse it (sidebar-item). Drop it. Leaf slots (chip-close) keep it.
  if (ICON_SIZE_CONTAINER_SLOTS.has(slot)) return null;
}
return slot === "base" ? entry : { ...entry, slot };
```

Effect (verified against the export's icon-size tokens):
- **sidebar `item`** — no icon slot, `slot="item"` ∈ container set → **dropped**. The custom
  recipe's `item` slot loses `size-4`; the item renders full-width.
- **chip `close`** — no icon slot, but `slot="close"` ∉ container set → falls through →
  `{...entry, slot:"close"}` → `size-N` on close **kept** (existing chip test passes, chip
  unchanged).
- **nav / accordion** — `iconSlot` (`linkLeadingIcon` / `leadingIcon`) found first → return
  before the drop. Unchanged.
- **bare `<comp>-icon-size`** (slot `base`) — `base` ∉ container set and the guard only fires
  for the icon-size branch; routes to the icon rule's `leadingIcon` (phantom slot), never
  collapsing the base. Unchanged.

### Rejected alternatives

- **Drop ALL unroutable icon-size (regardless of slot):** regresses chip's `close` (sizes the
  close button — intended + tested).
- **Add an icon slot to sidebar's custom anatomy:** speculative and grows the emitted recipe.

## Tests

- `packages/grammar/src/slot-mapping.test.ts`:
  - `heuristicSlotMapping("sidebar-item-icon-size", undefined, new Set(["item"]))` → `null`
    (dropped; `extraSlots` mirrors how `buildCustomRecipes` routes sidebar).
  - `heuristicSlotMapping("chip-close-icon-size", undefined, new Set(["label","close"]))` →
    `{slot:"close", utilityType:"icon-size", …}` (NOT dropped — leaf slot regression guard).
  - Existing guards intact: `nav-item-icon-size` → `linkLeadingIcon`, `accordion-item-icon-size`
    → `leadingIcon`, `button-trailingIcon-icon-size-md` → `trailingIcon`.
- `src/custom-recipe-engine.test.ts`: `buildCustomRecipes` for a sidebar fixture with
  `sidebar-item-icon-size` + a non-icon item token yields `slots.item` WITHOUT `size-`. The
  existing chip test (`chip.slots.close` matches `/\bsize-\d/`) must still pass.
- Browser re-check (verification, no code): the sidebar item renders full-width (not 16px).

## Success criteria

- `sidebar-item-icon-size` maps to `null`; the sidebar custom recipe's `item` slot no longer
  carries `size-4`; the live preview item renders full-width.
- chip / nav / accordion / bare / explicit-icon-prefix mappings unchanged; full suite green
  (incl. the existing chip `slots.close` size assertion).

## Release

Patch release **v0.28.11** (CHANGELOG `### Fixed`; README test-count bump; tag, merge, push,
GitHub Release). Note the chip `close-icon` colour → `size-[#hex]` type-blindness bug as a
separate follow-up.
