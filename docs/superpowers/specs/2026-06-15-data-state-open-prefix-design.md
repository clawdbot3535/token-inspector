# `data-[state=open]:` State Prefix — Design

**Date:** 2026-06-15
**Status:** Approved
**Type:** Feature (grammar state vocabulary; changes emitted `app.config.ts` output)

## Problem

`accordion-item-text-opened` (the accordion item's text color when the item is expanded) maps
to `null` in the grammar — it's dropped. The state segment `opened` isn't in `STATE_KEYS`, so
the parser doesn't recognize it as an interaction state, and no rule matches the utility
`text-opened`.

Nuxt UI v4's accordion is built on Reka UI, which marks the open item with `data-state="open"`.
The correct Tailwind v4 form is the arbitrary data-variant `data-[state=open]:text-[…]`. The
inspector has no way to emit that today — the deferred "data-state prefix" roadmap item, now
unblocked by a real motivating token.

## How states work today (verified)

- `STATE_KEYS` (component-vocab.ts) = `default, hover, active, disabled, focus, checked, hovered`.
- The parser consumes a trailing `STATE_KEYS` segment as `state`; `matchParsed` sets
  `entry.statePrefix = normalizeState(state)`.
- `normalizeState` (slot-mapping.ts) is the central state→Tailwind-prefix translator:
  `hovered`→`hover`, else identity.
- The recipe engine (`recipe-engine.ts:300`) wraps the emitted utility verbatim:
  `utility = `${statePrefix}:${utility}``. So a `statePrefix` of `data-[state=open]` produces
  `data-[state=open]:text-[var(…)]` with **no engine change**.

## Approach (chosen: extend the state vocabulary + prefix map)

1. Add `opened` (and the `open` synonym) to `STATE_KEYS` so the parser recognizes the trailing
   `-opened` segment as a state.
2. Extend `normalizeState` so `opened` / `open` → `data-[state=open]` (the Reka data-variant);
   all other states keep current behaviour (`hovered`→`hover`, else identity).

Flow for `accordion-item-text-opened` (a color):
`parseSegments` → `{component:accordion, slotPrefix:item, utility:text, state:opened}` →
`matchParsed`: `text` + `valueType==="color"` → `text-color` rule, `statePrefix =
normalizeState("opened") = "data-[state=open]"`, slot forced to `item` → entry
`{slot:item, utilityType:text-color, statePrefix:"data-[state=open]"}` → recipe engine emits
`data-[state=open]:text-[var(…)]` on `slots.item`.

### Rejected alternatives

- **Per-token override** for `accordion-item-text-opened`: not general; any future `*-opened`
  token would need its own override.
- **Also remap `active` / `selected` to data-variants**: `active` already maps to the `active:`
  pseudo-class across many existing tokens and tests; changing it is a separate, large semantic
  question (what Reka attribute each maps to). Out of scope.

## Out of scope

- **Preview rendering of the open state.** `projectToState` understands a fixed pseudo-class
  set and leaves a `data-[state=open]:` prefix on the base (un-projected); `LiveAccordion` has
  no open/closed toggle. Showing the opened color in the preview is separate UI work. The
  primary deliverable is correct **output** (`app.config.ts`).
- **`active` / `selected` data-variants** (separate semantic decision, many tokens).

## Tests

- `packages/grammar/src/slot-mapping.test.ts` (extend):
  - `getSlotMapping("accordion-item-text-opened", "color")` → an entry with `slot === "item"`,
    `utilityType === "text-color"`, `statePrefix === "data-[state=open]"` (was `null`).
  - A regression assertion that existing states are unchanged: e.g. a `*-hover` token still
    yields `statePrefix === "hover"`.
- `src/recipe-engine.test.ts` (extend): building the accordion recipe from a graph with
  `accordion-item-text-opened` (color) yields `slots.item` containing
  `data-[state=open]:text-`.

## Success criteria

- `accordion-item-text-opened` emits `data-[state=open]:text-[…]` on `slots.item`.
- No change to existing state mappings (hover/active/focus/disabled/checked); full suite green.

## Release

Patch release **v0.28.9** (CHANGELOG `### Added`; README test-count bump; tag, merge, push,
GitHub Release). Note the preview-projection of the open state as remaining follow-up.
