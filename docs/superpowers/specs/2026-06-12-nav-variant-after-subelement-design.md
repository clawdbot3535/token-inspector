# Variant-after-Sub-Element + nav Overlay Recipes (Bucket B) — Design

**Date:** 2026-06-12
**Status:** Approved (scope: parser fix + nav overlay recipes; both BUTTON_VARIANT_KEYS and COLOR_ROLE_KEYS after the sub-element)
**Feature:** Map component tokens whose Nuxt variant / `overlay` marker sits *after* a sub-element slot (e.g. `nav-item-ghost-bg`, `nav-item-overlay-dark-ghost-bg`) instead of at the fixed 2nd segment.

## Problem

The grammar recognises a Nuxt variant (`solid`/`outline`/`ghost`/`link`/…) or color-role only at the **fixed 2nd segment** (`parts[1]`). The overlay-recipe builder's `stripOverlayPrefix` likewise detects the `overlay` marker only at `parts[1]`. For `nav`, the consistent sub-element `item` occupies position 1, so both markers shift one position right:

- `nav-item-ghost-bg` — `parts[1]="item"` (a slot, not a variant); `ghost` lands at `parts[2]` and leaks into the utility string `ghost-bg`, which matches no heuristic rule → **NULL**. `nav` is the worst-mapped allow-list component (131 tokens in the new export, ~12 mapped); ~35 of the NULLs are this shape (bucket B).
- `nav-item-overlay-dark-ghost-bg` — `parts[1]="item"`, so `stripOverlayPrefix` returns `mode:null` and the token is dropped. nav overlay recipes were deferred in v0.12.0 for exactly this reason.

## Goal

1. **Parser:** a Nuxt variant or color-role sitting immediately after a recognised sub-element slot is detected and routed to that slot's variant axis.
2. **Overlay:** `stripOverlayPrefix` recognises the `overlay-<mode>` marker after a sub-element slot, so `buildOverlayRecipes` (already component-agnostic) emits `navOverlay{Dark,Light}Recipe`.

Success criteria (all asserted by unit tests):
- `heuristicSlotMapping("nav-item-ghost-bg", "color")` → `{ slot: "item", utilityType: "bg-color", variantAxis: "variant", variantKey: "ghost" }`.
- `heuristicSlotMapping("nav-item-link-text", "color")` → `{ slot: "item", utilityType: "text-color", variantAxis: "variant", variantKey: "link" }`.
- A color-role after a sub-element maps too (e.g. `nav-item-primary-bg` → `{ slot: "item", utilityType: "bg-color", variantAxis: "color", variantKey: "primary" }`).
- Trailing state still works: `nav-item-ghost-bg-hover` → adds `statePrefix: "hover"`.
- No regression: `button-ghost-bg` (variant at 2nd segment, no sub-element) is unchanged; `nav-item-foo-bg` (unknown middle segment) stays NULL.
- `stripOverlayPrefix("nav-item-overlay-dark-ghost-bg")` → `{ logicalId: "nav-item-ghost-bg", mode: "dark" }`; existing `stripOverlayPrefix("button-overlay-dark-solid-bg")` → `{ logicalId: "button-solid-bg", mode: "dark" }` is unchanged.
- `buildOverlayRecipes` on a synthetic graph with genuine `nav-item-overlay-{dark,light}-*` tokens emits `navOverlayDark` / `navOverlayLight` recipes with the expected slot/variant deltas.

## Non-goals

- The `link` slot/variant collision (`link` is both a nav slot and a BUTTON_VARIANT_KEY). nav's real pattern is `nav-item-<variant>-<utility>` (item is the slot, link/ghost are variants), so `nav-item-link-…` correctly reads `link` as the variant. `nav-link-…` (link as the slot) is a pre-existing ambiguity already present in the 2nd-segment logic — not introduced or resolved here.
- camelCase child slots (`childLink`, `linkLeadingIcon`, …): `buildGraph` lowercases token ids, so `nav-childlink-…` never matches the camelCase slot name. Out of scope (separate issue).
- Validating that `ghost`/`link` are *real* Nuxt NavigationMenu variants. The grammar maps structurally; whether the emitted variant key is Nuxt-valid is the designer's data concern.
- Whole-component refactors. Both fixes are additive.

## Approach

Shared principle: **a structuring marker (variant, or `overlay`) may sit after a sub-element slot, not only at the fixed 2nd segment.**

### Part 1 — `parseSegments` variant-after-sub-element (grammar package)

In `packages/grammar/src/slot-mapping.ts`, `parseSegments` already (a) detects a variant/color-role at the 2nd segment and (b) consumes a sub-element via the `slotPrefix` seam when `componentSlots` is supplied. Add a second variant/color-role check **after** the `slotPrefix` seam, guarded so it only fires for the new case:

```ts
// Seam (bucket B): a Nuxt variant / color-role may sit AFTER the sub-element
// prefix, not only at the fixed 2nd segment (e.g. `nav-item-ghost-bg` =
// item slot + ghost variant + bg utility). Fires only when a slot prefix was
// just consumed, no variant was found earlier, and a utility segment remains.
if (slotPrefix !== null && variant === null && colorRole === null) {
  const afterSlot = parts[start];
  if (afterSlot !== undefined && end - start > 1) {
    if (BUTTON_VARIANT_KEYS.has(afterSlot)) { variant = afterSlot; start += 1; }
    else if (COLOR_ROLE_KEYS.has(afterSlot)) { colorRole = afterSlot; start += 1; }
  }
}
```

Placed between the `slotPrefix` seam and the trailing size/state strip (so `end` is still `parts.length` and the size/state strip runs on the remaining tail). The block only fires on the fallback path (`heuristicSlotMapping` re-parses with `nuxtSlotsFor(component)`); the normal first pass passes no `componentSlots`, so `slotPrefix` is null and this block is inert → the normal path is regression-free. Both `BUTTON_VARIANT_KEYS` and `COLOR_ROLE_KEYS` are honoured, mirroring the 2nd-segment logic.

No change needed in `matchParsed`/`buildEntry`: they already override the heuristic's default `base` slot with `slotPrefix` and read `variant`/`colorRole` from the parsed context. Update the token-id-shape docstring at the top of the file to note the post-sub-element variant position.

### Part 2 — `stripOverlayPrefix` overlay-after-sub-element (src)

In `src/custom-recipe-engine.ts`, extend `stripOverlayPrefix` with a second case for the overlay marker after a recognised sub-element slot. Import `nuxtSlotsFor` from `@tg/grammar` (already imports `getSlotMapping` from there — no leaf-boundary issue; this file lives in `src/`).

```ts
export function stripOverlayPrefix(tokenId: string): { logicalId: string; mode: OverlayMode | null } {
  const parts = tokenId.split("-");
  // Case 1: overlay at the fixed 2nd segment — `comp-overlay-<mode>-<utility...>`.
  if (parts.length >= 4 && parts[1] === "overlay") {
    const mode = parts[2];
    if (mode === "light" || mode === "dark") {
      return { logicalId: [parts[0], ...parts.slice(3)].join("-"), mode };
    }
  }
  // Case 2: overlay after a sub-element slot — `comp-<sub>-overlay-<mode>-<utility...>`.
  if (parts.length >= 5 && parts[2] === "overlay") {
    const sub = parts[1];
    const slots = sub !== undefined ? nuxtSlotsFor(parts[0]!) : undefined;
    if (sub !== undefined && slots?.has(sub)) {
      const mode = parts[3];
      if (mode === "light" || mode === "dark") {
        return { logicalId: [parts[0], sub, ...parts.slice(4)].join("-"), mode };
      }
    }
  }
  return { logicalId: tokenId, mode: null };
}
```

The reconstructed `logicalId` keeps the sub-element (`nav-item-ghost-bg`), which Part 1 then maps. `buildOverlayRecipes` needs **no change**: it discovers `(component, mode)` pairs from `stripOverlayPrefix`, calls `getSlotMapping(logicalId, undefined, node.type)` (nav's slots come from `nuxtSlotsFor` inside `heuristicSlotMapping`, so no `extraSlots` needed), and `buildComponentRecipes` assembles the sparse delta. Update the `stripOverlayPrefix` docstring (it currently says nav-item-overlay is "deferred").

## Module / file layout

- **Modify** `packages/grammar/src/slot-mapping.ts` — `parseSegments` (the new block) + the top-of-file docstring. `BUTTON_VARIANT_KEYS`/`COLOR_ROLE_KEYS` are already imported.
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — variant-after-sub-element cases + regression cases.
- **Modify** `src/custom-recipe-engine.ts` — `stripOverlayPrefix` (case 2) + `nuxtSlotsFor` import + docstring.
- **Modify** `src/custom-recipe-engine.test.ts` — `stripOverlayPrefix` nav case + a `buildOverlayRecipes` nav-emit case.

No renderer / build-cli / App.vue / scanner changes — the overlay output path is already component-agnostic.

## Testing (TDD)

**`packages/grammar/src/slot-mapping.test.ts`:**
- `nav-item-ghost-bg` (color) → `{ slot:"item", utilityType:"bg-color", variantAxis:"variant", variantKey:"ghost" }`.
- `nav-item-link-text` (color) → `{ slot:"item", utilityType:"text-color", variantAxis:"variant", variantKey:"link" }`.
- `nav-item-primary-bg` (color) → `{ slot:"item", utilityType:"bg-color", variantAxis:"color", variantKey:"primary" }` (color-role after sub-element).
- `nav-item-ghost-bg-hover` (color) → same as ghost-bg plus `statePrefix:"hover"`.
- Regression: `button-ghost-bg` (color) → `{ slot:"base", utilityType:"bg-color", variantAxis:"variant", variantKey:"ghost" }` (unchanged; no sub-element).
- Negative: `nav-item-foo-bg` (unknown middle segment) → still NULL.

**`src/custom-recipe-engine.test.ts`:**
- `stripOverlayPrefix("nav-item-overlay-dark-ghost-bg")` → `{ logicalId:"nav-item-ghost-bg", mode:"dark" }`.
- `stripOverlayPrefix("button-overlay-dark-solid-bg")` → `{ logicalId:"button-solid-bg", mode:"dark" }` (existing behaviour intact).
- `stripOverlayPrefix("nav-item-overlay-foo-…")` → `{ mode:null }` (bad mode); `stripOverlayPrefix("nav-xyz-overlay-dark-…")` where `xyz` is not a nav slot → `{ mode:null }`.
- `buildOverlayRecipes` on a synthetic graph containing `nav-item-ghost-bg` (base) + a genuine, differing `nav-item-overlay-dark-ghost-bg` → output has a `navOverlayDark` recipe whose `item` slot carries the `ghost` variant bg-color; an identical-to-base overlay token is dropped.

Coverage ≥ 80% on the changed functions.

## Known boundaries (documented, not built)

- `link` as a slot (`nav-link-…`) vs `link` as a variant — pre-existing ambiguity; nav uses `item` as the slot so this does not bite the real tokens.
- camelCase child slots (`childLink`, `linkLeadingIcon`) unreachable via routing because `buildGraph` lowercases ids — separate issue.
- nav variant validity vs Nuxt NavigationMenu's real variant prop — a data/deviation concern, not a mapping concern.
- The real `nav-item-*` tokens live only in the new 914-token export (not the committed `components/` fixture), so unit tests are authoritative; a real-export spot-check is a manual option via the inspector's git-import.
