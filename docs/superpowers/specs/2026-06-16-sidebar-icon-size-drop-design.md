# Drop Unroutable icon-size (sidebar collapse) — Design

**Date:** 2026-06-16
**Status:** Approved
**Type:** Bugfix (grammar slot-mapping; changes emitted `app.config.ts` / custom-components output)

## Problem

The sidebar preview item renders collapsed to 16×16px. `sidebar-item-icon-size` (value `16`)
is emitted as `size-4` on the custom recipe's `item` slot, which sets the item's width AND
height. The broader sweep confirmed this is the last collapsed preview (accordion + nav were
fixed in v0.28.8 / v0.28.10).

The v0.28.10 fix routes `icon-size` to the component's leading-icon slot via
`leadingIconSlotFor(component)`. But sidebar is a **custom** component (`KNOWN_CUSTOM`, not in
`NUXT_SLOTS`), so `leadingIconSlotFor("sidebar")` is `undefined` — there is no icon slot to
route to. The size then falls back onto the `item` container and collapses it.

The same shape affects **chip** (`chip-close-icon-size` → `size-2.5` on the `close` slot; chip's
`NUXT_SLOTS` are `{root, base}`, no icon slot).

## How icon-size routes today (post-v0.28.10)

```ts
if (entry.utilityType === "icon-size" && !/icon$/i.test(slot)) {
  const iconSlot = leadingIconSlotFor(parsed.component);
  if (iconSlot) return { ...entry, slot: iconSlot };
}
return slot === "base" ? entry : { ...entry, slot };  // ← sidebar-item: { ...entry, slot:"item" }
```

For `sidebar-item-icon-size`: `iconSlot` is undefined → falls to `{...entry, slot:"item"}` →
`size-4` on the item.

## Approach (chosen: drop the unroutable icon-size)

When an `icon-size` utility has a non-icon sub-element prefix and there is **no** leading-icon
slot to route to, return `null` (drop it) instead of collapsing the container:

```ts
if (entry.utilityType === "icon-size" && !/icon$/i.test(slot)) {
  const iconSlot = leadingIconSlotFor(parsed.component);
  if (iconSlot) return { ...entry, slot: iconSlot };
  // No icon slot to size: an icon-size on a non-icon sub-element container
  // (sidebar-item, chip-close) can't be honoured — drop it rather than emit a
  // `size-*` that collapses the container's width+height.
  if (slot !== "base") return null;
}
return slot === "base" ? entry : { ...entry, slot };
```

Rationale: an icon-size token names the size of *an icon*. If the component has no icon slot,
the token is an orphan — it cannot be applied to any icon, and leaving it on the container only
collapses the container. Dropping is strictly better.

Edge cases (verified):
- **sidebar `item`** — `leadingIconSlotFor` undefined, `slot="item" !== "base"` → dropped. The
  custom recipe's `item` slot loses `size-4`; the item renders full-width.
- **chip `close`** — same → `size-2.5` dropped. (The separate `size-[#A1A1AA]` from the
  `chip-close-color → size-[#hex]` data bug is a different mechanism and stays — out of scope.)
- **bare `<comp>-icon-size`** (slot `base`) — `slot === "base"`, so the new guard does not fire;
  it routes to the icon rule's `leadingIcon` (a phantom slot Nuxt ignores), never collapsing the
  base. Unchanged.
- **nav / accordion** — `iconSlot` is found first (`linkLeadingIcon` / `leadingIcon`) and returns
  before the drop. Unchanged.

### Rejected alternatives

- **Add an icon slot to sidebar's custom anatomy:** speculative (do sidebar items even carry an
  icon?) and grows the emitted custom recipe.
- **Leave it:** visible collapse.

## Tests

- `packages/grammar/src/slot-mapping.test.ts`:
  - `heuristicSlotMapping("sidebar-item-icon-size", undefined, new Set(["item"]))` → `null`
    (dropped; the `extraSlots` param mirrors how `buildCustomRecipes` routes sidebar).
  - `heuristicSlotMapping("chip-close-icon-size", undefined, new Set(["label","close"]))` → `null`.
  - Regression guards already present: `nav-item-icon-size` → `linkLeadingIcon`,
    `accordion-item-icon-size` → `leadingIcon`, `button-trailingIcon-icon-size-md` → `trailingIcon`.
- `src/custom-recipe-engine.test.ts` (or nearest): `buildCustomRecipes` for a sidebar fixture with
  `sidebar-item-icon-size` + a non-icon item token yields `slots.item` WITHOUT `size-`.
- Browser re-check (verification, no code): the sidebar item renders full-width (not 16px).

## Success criteria

- `sidebar-item-icon-size` (and `chip-close-icon-size`) map to `null`; the sidebar custom recipe's
  `item` slot no longer carries `size-4`; the live preview item renders full-width.
- nav / accordion / bare / explicit-icon-prefix mappings unchanged; full suite green.

## Release

Patch release **v0.28.11** (CHANGELOG `### Fixed`; README test-count bump; tag, merge, push,
GitHub Release). Note the chip `close-color → size-[#hex]` data bug as a separate remaining item.
