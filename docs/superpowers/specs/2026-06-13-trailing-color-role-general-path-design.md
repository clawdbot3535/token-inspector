# Trailing Color-Role on the General Path (Bucket C) — Design

**Date:** 2026-06-13
**Status:** Approved (map trailing color-roles as `variants.color.*` on the general path by promoting `normalizeTrailingColorRole` into the grammar; retire the now-unreachable `validation-color-via-prop` rule; defer `radio-dot-color-*`)
**Feature:** Map component tokens whose Nuxt color-role sits in the **trailing** position (`checkbox-bg-error`, `switch-thumb-color-success`, `checkbox-bg-checked-error`) on the general (non-custom) emit path, by reusing the existing `normalizeTrailingColorRole` rewrite inside the grammar.

## Problem

The grammar recognises a color-role only at the **2nd segment** (and, since v0.14.0, immediately after a sub-element slot). Figma also names color-roles **trailing** (`radio-bg-error` — `error` is last). On the general path these fall to NULL, so `radio`/`checkbox`/`switch`/… lose their validation-color appearance. The Stage C **custom** path already rescues this shape via `normalizeTrailingColorRole` (moves a trailing color-role to the 2nd position so the existing grammar maps it to `variants.color`), but only for components flagged `component-looks-custom` (just `chip`). The scanner's `validation-color-via-prop` rule (v0.5.0 / D3) reframed these NULLs as "Nuxt applies validation color through the `color` prop, not a recipe slot" — a *can't-map* acknowledgment, not a fix.

On the real 914-token export, **28** component-layer tokens carry a trailing color-role across non-custom components (checkbox 8, radio 8, switch 8, input 2, textarea 2). **26 of them map immediately** once `normalizeTrailingColorRole` runs before the parse; the 2 stragglers (`radio-dot-color-{error,success}`) need the `dot→indicator` slot alias (out of scope).

## Goal

A trailing color-role is recognised on the general path, so non-custom components emit `variants.color.{error,success,…}` recipe entries carrying the designer's exact values — **single source of truth in the grammar**, so the renderer, the scanner, and the custom path all agree.

Success criteria (asserted by unit tests). All color-typed cases pass the `"color"` valueType hint — `heuristicSlotMapping(id, "color")` — mirroring the probe and the v0.14.0 nav tests; the bare-`color` utilities (`thumb-color`, `icon-color`) require it:
- `heuristicSlotMapping("checkbox-bg-error", "color")` → `{ slot:"base", utilityType:"bg-color", variantAxis:"color", variantKey:"error" }`.
- `heuristicSlotMapping("checkbox-bg-checked-error", "color")` → same + `statePrefix:"checked"`.
- `heuristicSlotMapping("switch-thumb-color-success", "color")` → `{ slot:"thumb", utilityType:"text-color", variantAxis:"color", variantKey:"success" }`.
- `heuristicSlotMapping("checkbox-border-error", "color")` → `utilityType:"ring-color"` (ring-framed); `heuristicSlotMapping("switch-border-error", "color")` → `utilityType:"border-color"` (switch is not ring-framed).
- No regression: a 2nd-segment color-role (`button-error-bg`) and an already-normalised id are unchanged; a trailing non-color-role (`button-bg-hover`) is untouched.
- `heuristicSlotMapping("radio-dot-color-error", "color")` stays NULL (documented straggler).
- `getSlotMapping("input-border-error")` is non-null → the `validation-color-via-prop` warning no longer fires (rule removed).

## Non-goals

- `radio-dot-color-{error,success}` — needs the `dot→indicator` slot alias on the general path (a separate slot-alias / camelCase routing concern; `buildGraph` lowercases ids).
- A capability gate verifying Nuxt's recipe actually exposes a `color` axis per component (Option C, declined). We assume the standard semantic color aliases (`error`/`success`/…) are valid `color` variant keys for checkbox/radio/switch/input — they are.
- Whole-component refactors; new component recipes.

## Approach

Shared principle: **a color-role may be named trailing; normalise it to the 2nd position before parsing — once, in the grammar.**

### Part 1 — Move `normalizeTrailingColorRole` into `@tg/grammar`

The function (currently `src/custom-recipe-engine.ts:26`, pure, depends only on `COLOR_ROLE_KEYS`) moves into `packages/grammar/src/slot-mapping.ts` (co-located with its only caller, `heuristicSlotMapping`) and is exported from the grammar package's public entry. `src/custom-recipe-engine.ts` imports it from `@tg/grammar` instead of defining it; its existing call (`custom-recipe-engine.ts:70`) stays correct (normalisation is idempotent) and becomes redundant — left in place to keep the custom path's change footprint nil.

### Part 2 — Apply it at the entry of `heuristicSlotMapping`

In `heuristicSlotMapping` (`slot-mapping.ts:407`), normalise the id once and parse the normalised id in **both** passes:

```ts
const id = normalizeTrailingColorRole(tokenId);
const parsed = parseSegments(id);
// … normal pass (matchParsed) …
const routed = parseSegments(id, slots);   // fallback sub-element routing pass
```

`parsed.component` (= `parts[0]`) is unchanged by normalisation, so `nuxtSlotsFor(parsed.component)` is unaffected. **Value resolution is untouched** — the renderer still resolves the ORIGINAL `node.id`; only the (slot, utilityType, variant axis/key, statePrefix) classification changes. The `getSlotMapping` override seam and the bucket-B after-sub-element logic compose unchanged (verified on the real export: `switch-thumb-color-success` → slot `thumb`; `checkbox-bg-checked-error` → `statePrefix:checked`; `checkbox-border-error` → ring, `switch-border-error` → border).

### Part 3 — Retire the `validation-color-via-prop` rule

With Part 2, `getSlotMapping("<comp>-border-<role>")` is never null for the four validation roles (`error`/`success`/`warning`/`info`, all ∈ `COLOR_ROLE_KEYS`), so the rule — guarded by `getSlotMapping(...) === null` — is **unreachable**. Remove the rule emission (`scanner.ts` ~99–110), the `isValidationColorBorder` helper, and the `VALIDATION_COLOR_ROLES` constant. The rule's premise (don't emit; Nuxt does it via the `color` prop) is now contradicted by the chosen behaviour (we emit the designer's values as `variants.color.*`).

## Module / file layout

- **Modify** `packages/grammar/src/slot-mapping.ts` — add `normalizeTrailingColorRole`; call it at the `heuristicSlotMapping` entry; update the top-of-file shape docstring to note the trailing color-role position.
- **Modify** the grammar package's public entry (barrel/index) — export `normalizeTrailingColorRole`.
- **Modify** `packages/grammar/src/slot-mapping.test.ts` — trailing-color-role positives + regression/negative cases.
- **Modify** `src/custom-recipe-engine.ts` — import `normalizeTrailingColorRole` from `@tg/grammar`; drop the local definition (keep the line-70 call).
- **Modify** `src/scanner.ts` — remove the `validation-color-via-prop` rule + `isValidationColorBorder` + `VALIDATION_COLOR_ROLES`.
- **Modify** `src/scanner.test.ts` — remove the `validation-color-via-prop` (D3) describe block; adapt the cross-referencing case ("still flags input-border-error …") to assert `input-border-error` now maps (no validation warning).
- **Modify** `src/recipe-engine.test.ts` — flip the `SEED for cycle B: input-border-error/success silently dropped` test (now mapped on a color axis) and **regenerate the golden `app.config` snapshot** (input/checkbox/radio/switch gain `variants.color.{error,success}`).

No renderer / build-cli / App.vue change — the emit is automatic once the mapping is non-null.

## Testing (TDD)

- **Grammar (`slot-mapping.test.ts`):** the success-criteria cases above (bg / bg-checked / thumb-color / border ring-vs-border) + regression (`button-error-bg` unchanged; `button-bg-hover` untouched) + negative (`radio-dot-color-error` NULL).
- **Engine (`recipe-engine.test.ts`):** flip the cycle-B SEED; regenerate the golden snapshot.
- **Scanner (`scanner.test.ts`):** remove the D3 block; adapt the cross-ref case.
- **Gate:** full suite + `vue-tsc`; `npm run build`; `npm run build:tokens` — the digest **intentionally changes**: the committed `components/` fixture HAS these tokens, so the `validation-color-via-prop` warnings (input/checkbox/radio/switch/chip) disappear and `variants.color.*` blocks appear. Optional real-export spot-check via git-import: `ui.checkbox` / `ui.switch` / `ui.radio` carry `variants.color.{error,success}`.

## Known boundaries

- `radio-dot-color-{error,success}` deferred — needs the `dot→indicator` alias on the general path.
- Assumes Nuxt UI v4 accepts `error`/`success` as `color` variant keys for these components — no capability gate (a future `color`-axis capability check could catch dead config, mirroring the `state-variant-dead-config` precedent).
- Unlike Bucket B, this change is **visible on the committed `components/` fixture**: the `build:tokens` digest and the golden snapshot shift by design, not as a regression.
- The real `bg`/`thumb`/`icon` trailing-color-role tokens (`checkbox-bg-error`, `switch-thumb-color-success`) live only in the 914-token export, not the committed fixture (which carries the `-border-` shape) — unit tests are authoritative for those.
