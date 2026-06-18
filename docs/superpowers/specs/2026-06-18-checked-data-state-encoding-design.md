# Design Spec — Phase B.2a: fix `checked` encoding (`checked:` → `data-[state=checked]`)

**Date:** 2026-06-18
**Status:** Approved
**Topic:** The grammar emits `checked:` (Tailwind `:checked`) for checked-state tokens, but Nuxt UI v4's checkbox/switch/radio are Reka components driven by `data-[state=checked]` — so those classes never fire on the real components. Fix the emit + the preview projection so checked styling actually paints. Prerequisite for the Phase B.2b Real-tab checked cell.

## Context

Surfaced while scoping Phase B.2 (Real-tab `checked` diff). The live export carries trailing-state checked tokens — `*-bg-checked`, `*-border-checked`, `*-thumb-color-checked`, plus `bg-checked-error`/`-success` (checked × color). The grammar parses the trailing `checked` segment as a state and `normalizeState` returns it unchanged → the recipe emits `checked:bg-[…]` etc.

Nuxt UI v4's Checkbox/Switch/RadioGroup are **Reka UI** components (`CheckboxRoot`/`CheckboxIndicator`, `SwitchRoot`/`SwitchThumb`) whose state is the `data-state="checked"` attribute, **not** a native `:checked` input. Nuxt UI's own theme uses `data-[state=checked]` (31 occurrences). So `checked:` (compiled to `…:checked`) never matches → checked styling is a **latent recipe-output bug for all consumers**, not just the Real tab. (Same class of issue as `open` → `data-[state=open]`, fixed earlier in the grammar.)

This is Phase **B.2a** — the encoding fix. Phase **B.2b** (the Real-tab `checked` cell: registry unchecked-baseline flip + a checked state cell) builds on it and is the next increment.

## The coupling: emit + preview projection

Changing the emit alone would regress the existing **mock previews**: `LiveCheckbox`, `LiveRadio`, and `LiveSwitch` all call `projectToState(merged, "checked")` to render the checked look. `projectToState`'s prefix parser (`^([a-z-]+):`) cannot parse a `data-[state=checked]:` prefix, so the promoted-to-base checked classes would vanish from the preview. So the fix MUST update both the grammar emit and `projectToState` together, keeping the emit path and the preview-projection path consistent.

## Changes

### 1. Grammar — `normalizeState` (`packages/grammar/src/slot-mapping.ts`)

Add a `checked` case alongside the existing `open` case:

```ts
function normalizeState(s: string): string {
  if (s === "hovered") return "hover";
  if (s === "opened" || s === "open") return "data-[state=open]";
  if (s === "checked") return "data-[state=checked]";
  return s;
}
```

`normalizeState` is already applied at every `statePrefix` assignment site (including the color-variant path), so `bg-checked-error`/`-success` carry `data-[state=checked]:` into their color variants automatically. Result: `switch-bg-checked` → `data-[state=checked]:bg-[…]` on the root slot (fires on the Reka `SwitchRoot`); `thumb-color-checked` → `data-[state=checked]:…` on the thumb.

### 2. `projectToState` (`src/app/project-to-state.ts`)

Generalize the per-class parser to also recognize the `data-[state=<name>]:` prefix form. For each class:
- If it matches `^data-\[state=([a-z]+)\]:(.+)$` → the prefix-state is the captured name; promote when it equals the requested `state`, drop otherwise.
- Else if it matches the existing `^([a-z-]+):(.+)$` pseudo-prefix → existing behavior.
- Else → base.

So `projectToState("bg-[#a] data-[state=checked]:bg-[#b]", "checked")` → `"bg-[#a] bg-[#b]"`. This keeps the checkbox/radio/switch previews projecting `checked` correctly, and generalizes to `open` (and any future `data-[state=…]`) at no extra cost. The `STATE_PREFIXES` set and `PreviewState` union are unchanged (the data-state names — `checked`, `open` — are already valid `state` arguments).

### 3. Tests updated

- `packages/grammar/src/slot-mapping.test.ts` — assertions expecting `checked:` → `data-[state=checked]:`.
- `src/recipe-engine.test.ts` — same, for any checked-emitting recipe assertion.
- `src/app/project-to-state.test.ts` — update checked-projection assertions to the data-state form; add a case proving `data-[state=checked]:x` promotes under `"checked"` and drops under another state.

## Data flow (unchanged shape)

Token `…-bg-checked` → grammar parses trailing state `checked` → `normalizeState` → `data-[state=checked]` statePrefix → recipe emits `data-[state=checked]:bg-[…]`. Preview: `projectToState(slotClasses, "checked")` promotes it → `extractArbitrary` → inline style (unchanged downstream). Real component: the Reka root carries `data-state="checked"` when checked, so the class fires.

## Error handling

- A `data-[state=X]:` class with an unrecognized/other state → dropped for the requested projection (same as other-state pseudo classes today).
- Non-checkable component with a stray `checked` token → emits `data-[state=checked]:`; harmless (never matches), same as before but now at least targeting the right attribute.

## Testing

- **Grammar unit:** a `switch-bg-checked` (or synthetic) token → recipe slot class is `data-[state=checked]:bg-[…]`, NOT `checked:bg-[…]`.
- **`projectToState` unit:** `data-[state=checked]:` promotes under `"checked"`, drops under `"hover"`; existing pseudo-prefix behavior preserved.
- **Preview regression:** the existing `LiveCheckbox`/`LiveRadio`/`LiveSwitch` tests still pass (they project `checked`); update fixtures only if they asserted the literal `checked:` string.
- **Browser verification** via `/browse`: (a) checkbox/switch are checked-at-rest, so their resting Real-tab diff should now show the `data-[state=checked]:` classes firing (match improves vs the pre-fix `checked:` no-op); (b) the mock previews still render the checked look. Capture before/after match deltas for the release notes.

## Risks (caught by browser verification)

- **Reka attribute value:** assumes Reka emits `data-state="checked"` for checkbox AND switch (Nuxt UI's theme uses `data-[state=checked]` for both). The browser check confirms the class actually fires.
- **Preview regression:** the `projectToState` generalization must not change behavior for the existing pseudo-prefixes (hover/active/disabled/focus) — covered by keeping that branch intact + the preview tests.

## Out of scope / future

- **Phase B.2b:** the Real-tab `checked` state cell — registry unchecked-baseline flip (checkbox/switch `modelValue:false`, radio non-matching) + a checked cell rendered via `buildStateCells`/`RealVariantCell`. Builds on this fix.
- `open` Real-tab cell, `selected` (item-level) — later.
