# Honour Part Aliases in Slot Routing (dot→indicator &c.) — Design

**Date:** 2026-06-14
**Status:** Approved (grammar routing honours `FIGMA_NUXT_PART_ALIAS`; the scanner retires the now-moot "rename" hint for aliased-routable parts)
**Feature:** Route a sub-element segment to its Nuxt slot via the curated `FIGMA_NUXT_PART_ALIAS` map, so `radio-dot-*` (and other aliased parts) map instead of reading as NULL.

## Problem

`FIGMA_NUXT_PART_ALIAS` (`@tg/grammar`) is a curated Figma→Nuxt slot-rename table — `{ row→tr, divider→separator, check→icon, dot→indicator }`. The **scanner** uses it to suggest renames (the `unsupported-part` "rename row→tr" hint), but the **grammar's** sub-element routing (`parseSegments`' `slotPrefix` seam, `slot-mapping.ts`) only matches a segment that is **exactly** a Nuxt slot (`componentSlots.has(slotSeg)`). So `radio-dot-color-error` — where `dot` is Figma's name for Nuxt's `indicator` slot — never routes and reads as NULL. These include the two Bucket C stragglers (`radio-dot-color-{error,success}`).

This also leaves the scanner inconsistent: it suggests "rename `dot`→`indicator`" for tokens the grammar *could* route if it honoured the same alias.

## Goal

The `slotPrefix` seam honours `FIGMA_NUXT_PART_ALIAS` (exact match first, then alias), and the `unsupported-part` detector treats an aliased-routable part as handled (no rename hint).

Verified on the real export (the alias only affects a segment whose alias target is a real slot for that component): **5 `radio-dot-*` tokens** map (`color`, `color-disabled`, `color-error`, `color-success`, `size-md` → the `indicator` slot). The `table-row-*` and `table-divider` tokens stay NULL for *separate* reasons (a mid-token state, a missing utility — not the alias), but no longer draw a misleading rename hint.

Success criteria (asserted by unit tests):
- `heuristicSlotMapping("radio-dot-color-error", "color")` → `{ slot:"indicator", utilityType:"text-color", variantAxis:"color", variantKey:"error" }`.
- `heuristicSlotMapping("radio-dot-color", "color")` → `{ slot:"indicator", utilityType:"text-color", variantAxis:null, variantKey:null }`.
- `heuristicSlotMapping("radio-dot-color-disabled", "color")` → `text-color` + `statePrefix:"disabled"`.
- `heuristicSlotMapping("radio-dot-size-md")` → `{ slot:"indicator", utilityType:"size", variantAxis:"size", variantKey:"md" }`.
- No regression: an exact-match slot still wins (`radio-item-…` routes to `item`); a component with no aliased target stays NULL (`button-dot-bg` → NULL, button has no `indicator` slot).
- Boundary: `heuristicSlotMapping("table-row-hover-bg", "color")` stays NULL (the alias routes `row→tr`, but `hover` sits mid-token, so the utility `hover-bg` matches no rule — a separate state-ordering issue).
- Scanner: a graph with an aliased-part token (`table-row-hover-bg`) raises **no** `unsupported-part` hint for `row` (it is aliased-routable); a genuinely-foreign part (`chip-label-…`) still raises one.

## Non-goals

- `table-row-hover-bg` / `table-row-selected-bg` — blocked by a mid-token state (`row-hover-bg`) and a non-state word (`selected`), not by the alias. A separate "state-before-utility" concern.
- `table-divider` — `table-divider` has no utility segment after the slot (a bare-slot colour). Separate.
- `check→icon` — no `*-check-*` tokens in the export; the alias entry is covered latently.
- No new aliases; `FIGMA_NUXT_PART_ALIAS` is unchanged. No renderer change.

## Approach

### Part 1 — `slotPrefix` seam honours the alias (grammar)

In `packages/grammar/src/slot-mapping.ts`, `parseSegments`' `slotPrefix` seam currently consumes `slotSeg` only on an exact slot match. Add an alias fallback (import `FIGMA_NUXT_PART_ALIAS`):

```ts
  let slotPrefix: RecipeSlot | null = null;
  const slotSeg = parts[start];
  if (slotSeg !== undefined && slotSeg !== "base" && componentSlots !== undefined) {
    if (componentSlots.has(slotSeg)) {
      slotPrefix = slotSeg;
      start += 1;
    } else {
      // Honour the curated Figma→Nuxt rename map: a segment whose alias target
      // is a real slot for this component routes to that Nuxt slot name.
      const aliased = FIGMA_NUXT_PART_ALIAS.get(slotSeg);
      if (aliased !== undefined && componentSlots.has(aliased)) {
        slotPrefix = aliased;
        start += 1;
      }
    }
  }
```

`slotPrefix` becomes the **Nuxt** slot name (`indicator`), so the emitted recipe uses Nuxt's vocabulary. The seam runs only on the fallback routing pass (`componentSlots` supplied), so the normal first pass is unaffected — purely additive.

### Part 2 — retire the rename hint for aliased-routable parts (scanner)

In `src/scanner.ts`, the `unsupported-part` detector skips a part `seg` when it is mapped / a real slot / a non-part. Add: also skip when its alias target is a real slot for the component (the grammar now routes it), so it no longer suggests an unnecessary rename:

```ts
    for (const { seg, id } of nullToks) {
      const aliasTarget = FIGMA_NUXT_PART_ALIAS.get(seg);
      if (
        mapped.has(seg) || slots.has(seg) || NON_PART_SEGMENTS.has(seg) ||
        (aliasTarget !== undefined && slots.has(aliasTarget))
      ) continue;
      // … existing byPart accumulation …
    }
```

This removes the `up-<comp>-<alias>` rename hints (e.g. `up-table-row`, `up-table-divider`, `up-radio-dot`). Genuinely-foreign parts (e.g. chip's `label`/`close`, which are not in the alias map) are unchanged. `FIGMA_NUXT_PART_ALIAS` is already imported in `scanner.ts`.

## Module / file layout

- **Modify** `packages/grammar/src/slot-mapping.ts` — `parseSegments` seam alias fallback (import `FIGMA_NUXT_PART_ALIAS`).
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — `radio-dot-*` mappings + regression/boundary cases.
- **Modify** `src/scanner.ts` — `unsupported-part` skips aliased-routable parts.
- **Modify** `src/scanner.test.ts` — flip the `table row → tr` rename test (no longer fires); a chip foreign-part test still fires.

No renderer / `app-config` / `FIGMA_NUXT_PART_ALIAS` change.

## Testing (TDD)

- **Grammar (`slot-mapping.test.ts`):** the success-criteria mappings; regression (`radio-item-…` exact; `button-dot-bg` → NULL); boundary (`table-row-hover-bg` → NULL).
- **Scanner (`scanner.test.ts`):** flip the `up-table-row` test — `table-row-hover-bg` raises no `unsupported-part` for `row`; keep a chip `label`/`close` foreign-part test that still fires.
- **Gate:** full suite + `vue-tsc`; `npm run build`; `npm run build:tokens` — the digest **changes**: the committed `components/` fixture has `table-row-*` and `table-divider` tokens, so the `up-table-row` and `up-table-divider` rename hints disappear (the scanner now treats them as aliased-routable). No `app.config` / golden-snapshot change — no fixture token newly maps (the fixture has no `radio-dot-*`; the table tokens stay NULL for the separate reasons above). Optional real-export spot-check: `radio-dot-color-*` map to `indicator`; the rename hints for aliased parts are gone.

## Known boundaries

- The alias routes the slot only; tokens blocked by *other* shape issues (`table-row-hover-bg` mid-token state, `table-divider` missing utility) stay NULL and now have no hint — silent (deferred to a future state-ordering / bare-slot effort).
- The real `radio-dot-*` tokens live only in the 914-token export; the committed fixture has the table tokens (which don't map) but no `radio-dot-*`. Unit tests on synthetic ids are authoritative for the mapping.
