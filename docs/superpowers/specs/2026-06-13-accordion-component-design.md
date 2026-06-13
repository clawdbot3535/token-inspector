# Accordion as an Allow-List Component (Bucket D, part 1) — Design

**Date:** 2026-06-13
**Status:** Approved (add `accordion` as a Nuxt-native allow-list component; defer the 4 straggler tokens and `sidebar` to separate efforts)
**Feature:** Map the new export's `accordion-item-*` component tokens by adding `accordion` to `COMPONENT_ALLOW_LIST` and `NUXT_SLOTS`, so the existing sub-element routing emits a `ui.accordion` recipe.

## Problem

The 2026-06-12 export introduced two new components, `accordion` (18 tokens) and `sidebar` (16 tokens). Neither is in `COMPONENT_ALLOW_LIST` or `NUXT_SLOTS`, so neither is scanned or emitted — all `accordion-*` tokens read as NULL.

`accordion` is a genuine Nuxt UI v4 component (theme slots `root` / `item` / `header` / `trigger` / `content` / `body` / `leadingIcon` / `trailingIcon` / `label`, plus a `disabled` variant). Every one of its 18 export tokens is shaped `accordion-item-*` — they all target the `item` slot. `sidebar` is **not** a Nuxt UI v4 (free) component and needs invented anatomy + a custom emit; it is **out of scope** here (its own later effort).

## Goal

Adding `accordion` to the two vocabulary tables makes the existing grammar + sub-element routing map its `item` tokens to a `ui.accordion` recipe — no renderer change. Verified on the real export (slots passed as `extraSlots`): **14 of 18** tokens map to `slot: "item"`; 4 stay NULL (non-standard utility names / a non-state word — see Non-goals).

Success criteria (asserted by unit tests):
- `nuxtSlotsFor("accordion")` returns the 9-slot set.
- `COMPONENT_ALLOW_LIST` includes `"accordion"`.
- `heuristicSlotMapping("accordion-item-bg", "color")` → `{ slot: "item", utilityType: "bg-color", variantAxis: null, variantKey: null }`.
- `heuristicSlotMapping("accordion-item-border", "color")` → `utilityType: "border-color"` (accordion is **not** ring-framed).
- `heuristicSlotMapping("accordion-item-text-disabled", "color")` → `text-color` + `statePrefix: "disabled"`.
- `heuristicSlotMapping("accordion-item-padding-x")` → `{ slot: "item", utilityType: "padding-x", … }`; `…-font-size` → `text-size`; `…-gap` → `gap`; `…-icon-size` → `icon-size`.
- `buildComponentRecipes(<synthetic accordion graph>, { components: ["accordion"] })` emits `recipes["accordion"].slots.item` carrying the resolved classes (e.g. a `bg-[…]` and a `disabled:text-[…]`).
- The 4 stragglers stay NULL: `accordion-item-border-focus-ring`, `accordion-item-focus-offset`, `accordion-item-ring-radius`, `accordion-item-text-opened`.
- `accordion` is **not** flagged `component-looks-custom` (its only sub-element, `item`, is a real Nuxt slot) → it emits as `ui.accordion`, not `custom/accordion`.

## Non-goals

- The 4 straggler tokens. `accordion-item-text-opened` — `opened` is a real accordion state (Nuxt uses `data-[state=open]`) but not a `STATE_KEY`; adding it globally would affect every component, so it is deferred. `accordion-item-border-focus-ring` / `-focus-offset` / `-ring-radius` are non-standard utility names (a data-quality / vocab concern), left NULL and documented.
- `sidebar` — no Nuxt UI v4 recipe; a separate custom-emit effort.
- A capability gate for accordion's `disabled` variant: the grammar encodes `accordion-item-*-disabled` as a `disabled:` pseudo-class on the `item` slot, not as Nuxt's prop-driven `variants.disabled.true.trigger`. This is consistent with how states are handled for every other component; not reconciled here.

## Approach

Two additive vocabulary entries; the grammar and renderer already do the rest.

### Part 1 — `NUXT_SLOTS` entry (grammar package)

In `packages/grammar/src/component-vocab.ts`, add to the `NUXT_SLOTS` map (the Nuxt UI v4 Accordion theme slots, from the component's `app.config` theme):

```ts
  ["accordion", new Set([
    "root", "item", "header", "trigger", "content", "body",
    "leadingIcon", "trailingIcon", "label",
  ])],
```

`nuxtSlotsFor("accordion")` then returns this set, so `heuristicSlotMapping`'s fallback routing consumes the `item` sub-element and maps the remaining utility (`bg`, `border`, `text`, `font-size`, `gap`, `padding-x/y`, `icon-size`, `line-height`, `letter-spacing`, `font-weight`, `ring-width`, with trailing `disabled` states).

### Part 2 — `COMPONENT_ALLOW_LIST` entry (renderer)

In `src/renderers/app-config.ts`, add `"accordion"` to `COMPONENT_ALLOW_LIST`. The scanner then scans it and `appConfigRenderer` emits `ui.accordion` (the renderer iterates the allow-list and emits any component with mapped tokens). Because `item` is a real accordion slot, the `component-looks-custom` divergence flag does not fire, so it stays in `app.config.ts` (not routed to `custom-components.ts`).

No change to `slot-mapping.ts`, the renderers' logic, the scanner, or the CLI — the emit path is already component-agnostic over the allow-list.

## Module / file layout

- **Modify** `packages/grammar/src/component-vocab.ts` — add the `accordion` `NUXT_SLOTS` entry.
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — `nuxtSlotsFor("accordion")` + the `accordion-item-*` mapping cases + straggler negatives (co-located with the existing `heuristicSlotMapping` tests).
- **Modify** `src/renderers/app-config.ts` — add `"accordion"` to `COMPONENT_ALLOW_LIST`.
- **Modify** `src/recipe-engine.test.ts` — a `buildComponentRecipes` test emitting `ui.accordion.slots.item`.

No renderer / build-cli / App.vue / scanner change.

## Testing (TDD)

- **Grammar:** `nuxtSlotsFor("accordion")` set; the 14 mapping cases above (a representative subset — bg / border / text-disabled / padding-x / font-size / gap / icon-size); the 4 straggler negatives.
- **Allow-list:** assert `COMPONENT_ALLOW_LIST` contains `"accordion"`.
- **Engine:** `buildComponentRecipes` on a synthetic accordion graph emits `recipes["accordion"].slots.item` with the expected classes (incl. a `disabled:` prefix); assert no `variants` are spuriously emitted.
- **Gate:** full suite + `vue-tsc`; `npm run build`; `npm run build:tokens` — the digest is **unchanged** (the committed `components/` fixture has no `accordion` tokens, so this is a no-op there, like the nav bucket). Optional real-export spot-check via git-import: `ui.accordion` appears with `slots.item` populated and `accordion` is not in `custom-components.ts`.

## Known boundaries

- 4 straggler tokens deferred (above).
- `sidebar` deferred (no Nuxt recipe; separate custom-emit effort).
- The real `accordion-*` tokens live only in the 914-token export, not the committed `components/` fixture, so the unit tests (synthetic graph) are authoritative; the real-export spot-check is a manual option.
- `accordion-item-ring-width` maps (util `ring-width`) while its colour partner `accordion-item-border-focus-ring` is a NULL straggler — a ring-width with no paired ring-colour can paint a stray ring (cf. the D2e lesson). Acceptable for now; surfaces only on the real export.
