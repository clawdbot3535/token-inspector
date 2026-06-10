# Design: icon slot mirror — `icon-size` fills trailingIcon too

- **Date:** 2026-06-10
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/icon-slot-mirror`
- **Theme:** Figma's `icon-size` token describes *any* icon in the component, but the grammar
  hard-codes its slot to `leadingIcon` — so recipes ship `leadingIcon: "size-4"` with an empty
  `trailingIcon`, and the `capability-gap` detector flags the very gap the adapter itself created.
  Mirror leadingIcon's classes to trailingIcon in both consumers via one shared constant.

## Problem / goal

- The `icon-size` rule emits `buildEntry("leadingIcon", …)` (slot-mapping.ts:257). Real recipes:
  `button`/`input`/`badge` have `leadingIcon: size-4/2.5`, `trailingIcon: —`.
- Nuxt UI's own theme sizes BOTH icon slots from the same size variant — a trailing icon rendered
  with our recipe gets no size today.
- The `capability-gap` hint (SLOT_PAIRS `[leadingIcon, trailingIcon]`) flags `trailingIcon`
  unfilled for these components — a misreport: the Figma file is fine, the adapter routes
  one-sidedly.

Success criteria:
- Recipes: every component whose `leadingIcon` is filled (slots AND size-variant entries) gets the
  same classes on `trailingIcon` — UNLESS trailingIcon already has its own token-driven classes.
- Scanner: `capability-gap` no longer fires for trailingIcon when leadingIcon is filled (the
  mirror counts); the reverse direction (explicit trailing tokens, no leading) still flags.
- One shared constant expresses the mirror; engine and scanner both consume it (no scattered
  special-cases).
- Golden snapshot diff = exactly the new `trailingIcon` entries. Full suite + typecheck + build
  green; real-export verification + headless QA (LiveInput's trailing icon picks up the size).

## Decisions

- **Mirror at the consumers, not in the grammar.** `getSlotMapping` stays single-slot (changing it
  to multi-entry would touch every consumer). The mirror is a post-step in the recipe engine + a
  recording tweak in the scanner, both driven by one constant.
- **Shared constant in `component-vocab.ts`** (next to `SLOT_PAIRS`, line ~169):
  ```typescript
  /** Slots whose classes mirror to a partner slot when the partner has no own
   *  tokens. Figma defines icon utilities once (`icon-size`) for ANY icon;
   *  Nuxt's theme sizes leading AND trailing alike. */
  export const SLOT_MIRROR: ReadonlyArray<readonly [from: string, to: string]> = [
    ["leadingIcon", "trailingIcon"],
  ];
  ```
- **Own tokens win.** The engine mirrors into `trailingIcon` only where that key is absent — a
  Figma file with explicit `…-trailingIcon-…` tokens (exact-match routing) keeps its own values,
  per-bucket (slots and each size-variant entry checked independently).
- **Scanner mirrors at record time:** when a token's `mapping.slot` is a mirror source, the
  partner slot is added to `filledSlotsByComponent` too. `capability-gap` logic itself is
  unchanged — it simply sees the truthful fill set. (Accepted consequence: the current
  button/input/badge trailingIcon hints disappear — they were adapter misreports; the reverse
  direction still fires.)
- **Blanket mirror of the leadingIcon bucket is safe today:** `leadingIcon` is only ever written
  by the `icon-size` rule (and explicit `leadingIcon-*` routed tokens, which are equally
  icon-generic), so no utility-type filtering is needed. If a future rule writes
  leading-specific classes, the constant is the single place to revisit.

## Design

### 1. `src/component-vocab.ts`
Add `SLOT_MIRROR` (code above) next to `SLOT_PAIRS`.

### 2. `src/recipe-engine.ts` — post-build mirror step
At the end of `buildComponentRecipes` (after all tokens are bucketed, before returning), for each
recipe and each `[from, to]` of `SLOT_MIRROR`:
- `if (recipe.slots[from] !== undefined && recipe.slots[to] === undefined) recipe.slots[to] = recipe.slots[from];`
- For every `variants.<axis>.<key>` object: same copy (`entry[from]` → `entry[to]` when `to` absent).
(Direct assignment into the recipe being built — consistent with how the builder already writes
`recipe.slots[…]`; the recipe object is local to the build, not shared input.)

### 3. `src/scanner.ts` — record-time mirror
Where `filledSlotsByComponent` records `mapping.slot` (~line 148), also add the partner:
```typescript
    fslots.add(mapping.slot);
    for (const [from, to] of SLOT_MIRROR) {
      if (mapping.slot === from) fslots.add(to);
    }
```
(Import `SLOT_MIRROR` from component-vocab alongside the existing `SLOT_PAIRS` import.)

### Tests
- `recipe-engine.test.ts`: a button graph with `icon-size: 16` → `slots.trailingIcon` equals
  `slots.leadingIcon` (`size-[16px]`); a graph with an explicit
  `button-trailingIcon-size: 20` AND `icon-size: 16` → trailingIcon keeps `size-[20px]` (own token
  wins); a size-keyed case (`icon-size-md`) mirrors inside `variants.size.md`.
- `scanner.test.ts`: a component with only `icon-size` filled → NO `capability-gap` for
  trailingIcon; a component with ONLY an explicit trailing token → capability-gap for leadingIcon
  still fires.
- Golden snapshot: update reviewed — only new `trailingIcon` entries.

### Verification
- `npm run typecheck && npx vitest run && npm run build`; `npm run build:tokens` → diff vs main:
  only `trailingIcon` additions; capability-gap hints for button/input/badge trailingIcon gone
  from the scan output.
- Headless QA: load the real export; LiveInput's trailing icon carries the icon size (inline,
  JIT-safe); scan view shows no trailingIcon capability-gap; console clean. Screenshot.

## Out of scope
- `icon-color` (doesn't map today — separate grammar question), `chip-close-icon-*` (naming
  mismatch → rename path), multi-entry grammar returns, new SLOT_PAIRS.

## Risks
- **capability-gap loses its current main output** — intended (misreport), documented above; the
  reverse direction keeps it alive.
- **Blanket mirror too broad later** — mitigated: single constant + comment marks the revisit point.
- **Golden churn** — expected, reviewed to be trailingIcon-only.
