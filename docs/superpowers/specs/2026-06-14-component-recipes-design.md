# Component Recipes (card / dropdown / modal) — Design Spec

**Date:** 2026-06-14
**Status:** Approved
**Feature branch:** `feat/component-recipes`

## Problem

The live export carries tokens for three Nuxt UI v4 components the inspector
does not yet emit recipes for: `card` (4), `dropdown` (10), `modal` (5). They are
component-layer tokens that currently read as unmapped. Unlike accordion (v0.16.0,
purely-additive vocab whose tokens were all `accordion-item-*`), these have **bare
surface tokens** (`card-bg`, `dropdown-bg`, `modal-bg`) that must route to each
component's base/default slot — and Nuxt UI v4 names those differently:

- **Card** base slot = `root` (no `base` slot)
- **Dropdown** base slot = `content` (no `base` slot)
- **Modal** base slot = `content` (+ an `overlay` slot)

`slot-mapping.ts` hard-codes the default base slot for bare tokens as `"base"`
(`matchParsed`, line ~363: `const slot = parsed.slotPrefix ?? "base"`). So bare
card/dropdown/modal tokens would mis-route to a non-existent `slots.base`.

## Goal

Emit correct `ui.card` / `ui.dropdown` / `ui.modal` recipe blocks (utility-first,
Nuxt-native) by teaching the grammar a per-component default base slot.

## Source tokens (live 914-token export)

```
card:     bg=#FFFFFF  border=#E4E4E7  padding=24px  radius=8px
dropdown: bg=#FFFFFF  border=#E4E4E7  radius=8px
          item-bg-active=#E4E4E7  item-bg-hover=#F4F4F5  item-hover-bg=#F4F4F5(dup)
          item-padding=8px  item-radius=6px  item-text=#18181B  item-text-muted=#52525B
modal:    bg=#FFFFFF  border=#E4E4E7  overlay-bg=rgba(0,0,0,0.5)  padding=12px  radius=12px
```

`dropdown` is already in `NUXT_SLOTS`; `card` and `modal` are not. **All three
are already in `COMPONENT_ALLOW_LIST`**, so they already emit today — but to the
wrong slots: a real-export probe shows `card`/`dropdown`/`modal` bare tokens land
on `slots.base`, and `modal-overlay-bg` lands on `slots.base` too (colliding with
the modal content `bg`). So this is a **correctness fix** of the existing emit,
not a net-new emit. The local `components/` fixture (old export) is not the source
of truth — unit tests on synthetic ids are authoritative and a throwaway
remote-export probe confirms end-to-end.

## Nuxt UI v4 slot inventories (from the Nuxt UI MCP `ui` theme keys)

- **card:** `root, header, title, description, body, footer`
- **modal:** `overlay, content, header, wrapper, body, footer, title, description, close`
- **dropdown:** already present (`content, item, …`)

## Approved decisions / mechanism

The one real logic change is a **per-component default base slot**; everything
else is additive vocabulary.

1. **`COMPONENT_BASE_SLOT` map** (`component-vocab.ts`):
   `{ card → "root", dropdown → "content", modal → "content" }`. A
   `defaultBaseSlot(component)` helper returns the mapped value or `"base"`.
2. **`matchParsed` default** (`slot-mapping.ts` line ~363):
   `const slot = parsed.slotPrefix ?? defaultBaseSlot(parsed.component)`.
   Only the three mapped components change; every existing component keeps
   `"base"`. Safe: the lone existing dropdown test uses a sub-element token
   (`dropdown-item-bg`), so it is unaffected.
3. **`NUXT_SLOTS`** gains `card` and `modal` (dropdown already there).
4. **Overlay slot vs `overlay-bg` utility guard** (`slot-mapping.ts`,
   `heuristicSlotMapping`): the normal pass matches `modal-overlay-bg` as the
   `overlay-bg` *utility* and short-circuits before the slot fallback can route
   the `overlay` *slot*. Add a guard: if the normal pass produced the
   `overlay-bg` utility **and** the component has an `overlay` slot, fall through
   to the slot fallback so it routes `slots.overlay` (bg-color). Scoped to
   components with an `overlay` slot (only modal today; badge/button have none),
   so zero ripple. `overlay` alone (no `-light`/`-dark`) is not touched by the
   overlay-recipes `stripOverlayPrefix`, and `overlay` ∈ `NON_PART_SEGMENTS` only
   affects the scanner, not the router.

No `COMPONENT_ALLOW_LIST` change — all three are already allow-listed.

`RecipeSlot` is `string` (not a closed union), so `root`/`content`/`overlay`
need no type change.

### Existing tests updated (the emit is being corrected, not added)

- `packages/grammar/src/slot-mapping.test.ts`: `modal-border` `slot: "base"` →
  `"content"`; `card-border` `slot: "base"` → `"root"`.
- `src/recipe-engine.test.ts` (~line 750): card-padding assertion
  `recipes.card?.slots.base` → `recipes.card?.slots.root`.

(The scanner forecast / "outside-allow-list" tests scan with `components:
["button"]`, so card/modal aren't processed there — unaffected. Completeness/null
counts are unchanged: tokens still map, only the slot name differs.)

## Expected output

| Component | mapped | → slots |
|---|---|---|
| **card** (4/4) | bg, border, padding, radius | all → `slots.root` |
| **dropdown** (~8/10) | bg/border/radius → `content`; item-{bg-active, bg-hover, padding, radius, text} → `item` | `content` + `item` |
| **modal** (5/5) | bg/border/radius/padding → `content`; overlay-bg → `overlay` | `content` + `overlay` |

## Scope boundaries / deferred stragglers (NULL by design)

- `dropdown-item-hover-bg` — mid-token state (`hover` before `bg`); a duplicate of
  `dropdown-item-bg-hover` (same `#F4F4F5`). Same shape as the `table-row-hover-bg`
  straggler.
- `dropdown-item-text-muted` — `muted` is not a `COLOR_ROLE_KEY`.
- No scanner change, no renderer-logic change beyond the allow-list + base-slot map.
- Inspector live-badge parity unchanged (out of scope, as for prior features).
