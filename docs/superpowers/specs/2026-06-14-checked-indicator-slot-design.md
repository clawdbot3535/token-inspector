# Checked×Color → Indicator Slot — Design Spec

**Date:** 2026-06-14
**Status:** Approved
**Feature branch:** `feat/checked-indicator-slot`

## Background

The roadmap item "compoundVariants emit path" was investigated and **deferred**:
probing all 914 export tokens found **no** `variant×color` / `size×variant` /
`color×highlight` tokens — the only thing a compoundVariants emit path would
consume. Building that infrastructure would serve zero tokens (the tooltip/popover
anti-pattern). The 125 `variant+state` tokens already emit correctly (state as a
CSS pseudo-prefix within the single variant axis).

The real, data-motivated improvement the probe surfaced is the **6 `checked×color`
tokens**: `checkbox/radio/switch-bg-checked-{error,success}`.

## Problem

`checkbox-bg-checked-error` ("the fill color when checked AND in the error state")
currently emits `variants.color.error.base: "checked:bg-[…]"` — a `checked:`
pseudo-prefix on the `base` slot. The authoritative Nuxt UI v4 themes show this is
wrong for checkbox/radio: the checked fill lives on the **`indicator` slot**
(`variants.color.error.indicator: 'bg-error'`, no prefix — the indicator only
renders when checked). The `checked:` Tailwind pseudo (native `:checked`) does not
match Nuxt's Reka-based data-state component, so the current class is likely inert.

Switch is different: it has **no `indicator` slot**, and Nuxt keeps its checked
fill on `base` (`variants.color.error.base: 'data-[state=checked]:bg-error'`) — so
switch's *slot is already correct*.

## Goal

Route a `checked` bg-color fill to the `indicator` slot (dropping the redundant
`checked` prefix) for components that have an indicator slot.

## Approved decision / mechanism

A single targeted rule in `matchParsed` (`packages/grammar/src/slot-mapping.ts`,
the `HEURISTIC_RULES` loop), mirroring the v0.22.0 overlay-guard pattern (consults
`nuxtSlotsFor`):

```ts
const entry = rule.build(ctx);
// A `checked` bg-color fill belongs on the `indicator` slot for components that
// have one (checkbox/radio): the indicator embodies the checked state, so the
// fill drops the `checked` prefix and moves off `base`. Components without an
// indicator slot (switch) are unchanged.
if (
  slot === "base" &&
  entry.statePrefix === "checked" &&
  entry.utilityType === "bg-color" &&
  nuxtSlotsFor(parsed.component)?.has("indicator")
) {
  return {
    slot: "indicator",
    utilityType: entry.utilityType,
    variantAxis: entry.variantAxis,
    variantKey: entry.variantKey,
  };
}
return slot === "base" ? entry : { ...entry, slot };
```

`SlotMappingEntry` is `{ slot, utilityType, variantAxis, variantKey, statePrefix? }`
— the explicit construction (omitting `statePrefix`) is complete and lint-safe.

## Effect

| Token | Before | After |
|---|---|---|
| `checkbox-bg-checked-error` | `variants.color.error.base: checked:bg-[…]` | `variants.color.error.indicator: bg-[…]` |
| `checkbox-bg-checked-success` | ″ | `…indicator: bg-[…]` |
| `radio-bg-checked-{error,success}` | `…base: checked:bg-[…]` | `…indicator: bg-[…]` |
| `checkbox-bg-checked` (no color) | `base: checked:bg` | `indicator: bg` |
| `switch-bg-checked-{error,success}` | `base: checked:bg` | **unchanged** (no indicator slot) |

Scoped to `bg-color`: `checkbox-border-checked` (→ ring-color) is unaffected.

## Scope boundaries

- **Switch unchanged** — no indicator slot; Nuxt keeps its checked fill on `base`,
  so the slot is already correct. The prefix *form* (`checked:` vs
  `data-[state=checked]:`) is a broader data-state-syntax concern affecting many
  tokens, not specific to checked×color — out of scope, noted as a follow-up.
- `compoundVariants` emit path deferred (no motivating tokens) — revisit when the
  export gains `variant×color` / `size×variant` tokens.
- No renderer / scanner / allow-list change; one grammar rule.

## Testing

- Grammar: `checkbox-bg-checked-error` → `slot: "indicator"`, no `statePrefix`,
  `variantAxis: "color"`, `variantKey: "error"`; `radio-bg-checked-error` →
  indicator; `switch-bg-checked-error` stays `base` with `statePrefix: "checked"`;
  `checkbox-border-checked` unaffected (ring-color, base).
- Update the two existing tests that pin the old base/checked behavior
  (`checkbox-bg-checked` → repoint to `switch-bg-checked` to keep base-prefix
  coverage; `checkbox-bg-checked-error` → new indicator assertion).
- Recipe-engine: checkbox emits `variants.color.error.indicator`.
- Verify against the live export. Ship as **v0.25.0**.
