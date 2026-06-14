# Progress Recipe Completion — Design Spec

**Date:** 2026-06-14
**Status:** Approved
**Feature branch:** `feat/progress-recipe`

## Problem

Asked to add recipes for `tooltip` / `popover` / `kbd` / `progress`. Probing the
live export narrows the real work to **progress**:

| Component | Tokens | Status |
|---|---|---|
| tooltip | 0 | nothing to map |
| popover | 0 | nothing to map |
| kbd | 9 | already correct — allow-listed, Nuxt base slot **is** `base` (MCP-confirmed `ui: { base }`), already emits a full `slots.base` recipe |
| progress | 6 | only `progress-radius` + `height-{sm,md,lg}` map; `progress-fill-bg` and `progress-track-bg` are NULL |

`progress` is already in `COMPONENT_ALLOW_LIST` and emits, but `progress-fill-bg`
and `progress-track-bg` don't map: their `fill` / `track` segments are neither a
Nuxt slot nor a known utility (`fill-bg` / `track-bg` aren't utilities), so
`getSlotMapping` returns null.

## Source tokens (live export)

```
progress-fill-bg   = #5667A7   (NULL today → should be slots.indicator)
progress-track-bg  = #E4E4E7   (NULL today → should be slots.base)
progress-radius    = 999px     (maps → slots.base rounded-[999px])
progress-height-sm = 4px        (maps → variants.size.sm.base h-[4px])
progress-height-md = 8px        (maps → variants.size.md.base h-[8px])
progress-height-lg = 12px       (maps → variants.size.lg.base h-[12px])
```

## Nuxt UI v4 Progress slots (MCP `ui` theme keys)

`root, base, indicator, status, steps, step` — the **rail is `base`**, the **fill
bar is `indicator`**.

## Goal

Map all 6 `progress-*` tokens to a correct `ui.progress` recipe.

## Approved decisions / mechanism

Reuse the v0.19.0 part-alias seam — two additive vocabulary changes, no logic
change:

1. **`NUXT_SLOTS` gains `progress`**: `["root", "base", "indicator", "status",
   "steps", "step"]`. Lets the sub-element router recognise `indicator` / `base`
   as routable slots.
2. **`FIGMA_NUXT_PART_ALIAS` gains** `["fill", "indicator"]` and
   `["track", "base"]`. The Figma part names `fill` / `track` route to the Nuxt
   slots `indicator` / `base` (exact-match first, then alias — the existing
   seam). `progress-fill-bg` → `slots.indicator` (bg-color);
   `progress-track-bg` → `slots.base` (bg-color).

No `COMPONENT_ALLOW_LIST` change (progress already there), no
`COMPONENT_BASE_SLOT` entry (`base` is the correct default — radius/height
already map there).

**Global alias, not progress-scoped:** `fill` / `track` appear on *only* progress
in the entire export, and an alias fires only when its target slot exists for the
component, so ripple is nil. Consistent with the existing global
`FIGMA_NUXT_PART_ALIAS`. (`track → base` is also semantically right for a switch
track, should it ever gain tokens.) The scanner's `unsupported-part` hint already
skips aliased-routable parts (v0.19.0), so the new aliases also silence any rename
nag for `progress-fill` / `progress-track`.

## Expected output

```
ui.progress.slots.base:       bg-[#E4E4E7] rounded-[999px]
ui.progress.slots.indicator:  bg-[#5667A7]
ui.progress.variants.size:    sm→h-[4px], md→h-[8px], lg→h-[12px] (on base)
```

## Scope boundaries

- **tooltip / popover:** not registered — zero tokens (speculative vocab; the
  repo's convention is to register a component when it has tokens).
- **kbd:** unchanged — already emits a correct `slots.base` recipe.
- No renderer / scanner-logic change; purely additive grammar vocabulary.

## Testing

- Grammar: `getSlotMapping("progress-fill-bg")` → `slot: "indicator"`,
  `utilityType: "bg-color"`; `getSlotMapping("progress-track-bg")` →
  `slot: "base"`, `utilityType: "bg-color"`; `nuxtSlotsFor("progress")` has
  `indicator`.
- Recipe-engine: `buildComponentRecipes(..., { components: ["progress"] })` emits
  `slots.indicator` (fill bg) + `slots.base` (track bg + radius) + size variants.
- Verify against the live export (6/6 mapped). Ship as **v0.24.0**.
