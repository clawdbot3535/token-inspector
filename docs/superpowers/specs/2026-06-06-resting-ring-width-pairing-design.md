# Design: Pair a component-level resting ring-width with its ring-colour

- **Date:** 2026-06-06
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/resting-ring-width-pairing`
- **Fixes:** the D2e bug where component-level `button-border-width` emits `ring-[1px]` on
  `slots.base`, giving solid/ghost/link an unwanted resting ring.

## Problem

D2e maps the component-level `button-border-width` (= 1) to a `ring-width` mapping with
`variantAxis: null, variantKey: null, statePrefix: null`. The recipe engine buckets that onto
`slots.base`, which **every** variant inherits. Only `outline` has a resting ring-*colour*
(`button-outline-border` → ring-colour on `variants.variant.outline`); solid/ghost/link have
none, so they inherit a bare `ring-[1px]` that paints a **1px currentColor resting ring** Nuxt
never intended (`ring-[Npx]` without a ring-colour still draws a ring). Verified in the real
output: `button.slots.base` carries `ring-[1px]`; solid/ghost/link have no resting ring-colour
of their own.

The mistake is conceptual: a resting ring-*width* is meaningless without a resting ring-*colour*,
and the colour's location depends on the framing model:
- **button** (variant-conditional, `RING_FRAMED_VARIANTS`): the resting ring-colour is
  **per-variant** (`outline`). So the width belongs on `outline`, not base.
- **input** (whole-component, `RING_FRAMED_COMPONENTS`): the resting ring-colour is on **base**
  (`input-border` → ring-colour, `variantAxis: null`). So the width correctly belongs on base.

Today's "component-level resting ring-width → base" rule is right for input and wrong for button.

## Goal

Emit a component-level resting ring-width only where a resting ring-*colour* lives, never on a
bare `slots.base` that unframed variants inherit. Drop it if there is no resting ring-colour to
pair with.

Success criteria:
- `button-border-width` → `ring-[1px]` on `variants.variant.outline.base` (composing with the
  outline ring-colour); **not** on `slots.base`. solid/ghost/link have no resting ring.
- `input-border-width` → `ring-[1px]` stays on `slots.base` (input's resting ring-colour is on
  base). No regression.
- A component-level resting ring-width with **no** resting ring-colour anywhere → dropped.
- Per-variant resting ring-widths (`button-outline-border-width` → `variants.variant.outline`)
  and the **focus** ring-width (`button-ring-width` → `focus:ring-[2px]`, `statePrefix: focus`)
  are **unaffected** — focus rings are intended on all variants (each has a focus ring-colour).
- Full suite + typecheck + build green; verified against the new export.

## Decisions

- **Pair width with colour by location** (the user's chosen Approach A). The resting ring-width
  is relocated to the bucket(s) holding a resting ring-colour for that component — covering both
  framing models with one rule, and honouring any width value (1px, 2px, …).
- **"Resting" = `statePrefix == null`.** Focus/hover ring-widths keep their current
  base-with-prefix behaviour (intended; each variant carries its own focus ring-colour).
- **"Component-level" = `variantAxis === null && variantKey === null`.** Per-variant
  ring-widths already land correctly and are untouched.
- **Opaque colours only count as a pairing target.** A transparent ring-colour is dropped from
  the recipe (the drop-transparent-colours fix), so pairing a width with it would re-introduce a
  stray ring. The pre-scan gates targets on `isOpaqueColor`.
- **Drop when no target.** A resting ring-width with nowhere to pair is meaningless → skip it
  (no scanner hint this cycle — YAGNI; can add later).

## Design

All in `src/recipe-engine.ts`, in `buildComponentRecipes`.

### 1. Pre-scan: resting ring-colour targets per component

Alongside the existing size-variant pre-scan (~line 164), add a second pre-scan that records,
per component, the bucket location(s) of each **resting** (`statePrefix == null`) **opaque**
`ring-colour` mapping:

```typescript
// Where each component's RESTING ring-colour lives (base for whole-component
// framers like input; the framed variant(s) for variant-conditional framers
// like button). A component-level resting ring-WIDTH is paired to these
// locations so it never paints a colourless ring on an unframed variant.
type RingColourTarget = { variantAxis: VariantAxis | null; variantKey: string | null };
const restingRingColourTargets = new Map<string, RingColourTarget[]>();

for (const node of graph.nodes.values()) {
  if (node.layer !== "component") continue;
  const componentName = node.id.split("-")[0];
  if (componentName === undefined || !allowSet.has(componentName)) continue;
  const mapping = getSlotMapping(node.id, options.slotMappingOverride, node.type);
  if (!mapping || mapping.utilityType !== "ring-color" || mapping.statePrefix != null) continue;
  if (mapping.variantAxis !== null && mapping.variantAxis !== "variant") continue;
  const resolved = resolveTokenToValue(node.id, graph);
  if ("error" in resolved || !isOpaqueColor(resolved.value)) continue; // dropped colours aren't targets
  const list = restingRingColourTargets.get(componentName) ?? [];
  const target: RingColourTarget = { variantAxis: mapping.variantAxis, variantKey: mapping.variantKey };
  if (!list.some((t) => t.variantAxis === target.variantAxis && t.variantKey === target.variantKey)) {
    list.push(target);
  }
  restingRingColourTargets.set(componentName, list);
}
```

For button this yields `[{ variantAxis: "variant", variantKey: "outline" }]`; for input
`[{ variantAxis: null, variantKey: null }]`.

### 2. Main loop: redirect the component-level resting ring-width

In the per-node loop, after the transparent-colour skip (~line 200) and **before** the
size-redirect block (~line 207), intercept the component-level resting ring-width:

```typescript
// A component-level resting ring-width (no variant, no state) must pair with a
// resting ring-COLOUR, or it paints a colourless ring on every variant. Emit it
// only at the colour's location(s); drop it if there is none. (Fixes the D2e
// leak where button-border-width ringed solid/ghost/link.)
if (
  mapping.utilityType === "ring-width" &&
  mapping.variantAxis === null &&
  mapping.variantKey === null &&
  mapping.statePrefix == null
) {
  const targets = restingRingColourTargets.get(componentName) ?? [];
  const widthClass = utilityForMapping(graph, node, mapping.utilityType, resolved.value, options.remBase);
  if (widthClass) {
    for (const target of targets) {
      const targetMapping: SlotMappingEntry = {
        ...mapping,
        variantAxis: target.variantAxis,
        variantKey: target.variantKey,
      };
      const bk = bucketKeyFor(componentName, targetMapping);
      const arr = utilityBuckets.get(bk) ?? [];
      arr.push(widthClass);
      utilityBuckets.set(bk, arr);
    }
  }
  continue; // handled (and dropped when targets is empty)
}
```

`utilityForMapping` for `ring-width` depends only on the resolved value (`ring-[1px]`), so the
class is computed once and pushed to each target bucket. `bucketKeyFor` with `variantAxis:
"variant", variantKey: "outline", slot: "base"` produces `button|variant|outline|base` — the
same bucket as `button-outline-border`'s ring-colour, so they compose.

### Traces
- **button**: `button-border-width` → intercepted → target `{variant, outline}` → bucket
  `button|variant|outline|base` (joins `ring-[var(--color-action-bg)]`). solid/ghost/link: no
  `ring-[1px]` on base. ✓
- **input**: `input-border-width` → intercepted → target `{base}` → bucket `input|null|null|base`
  (joins `ring-[var(--color-border-default)]`). Identical to today. ✓
- **no-colour component**: a component-level resting ring-width with no resting ring-colour →
  `targets` empty → dropped. ✓

### Tests (`src/recipe-engine.test.ts`)
- button: component-level `button-border-width` (1px) + `button-outline-border` (opaque colour)
  → `variants.variant.outline.base` contains `ring-[1px]`; `slots.base` does **not**; a
  `button-solid-bg` opaque token still emits its `bg-` but the solid variant has no `ring-[`.
- input: `input-border-width` (1px) + `input-border` (opaque) → `slots.base` contains `ring-[1px]`
  (regression guard for whole-component framers).
- drop: `button-border-width` (1px) with **no** resting ring-colour token → no `ring-[1px]`
  anywhere in the button recipe.
- focus untouched: `button-ring-width` (`focus:ring-[2px]`, component-level) still lands on
  `slots.base` as `focus:ring-[2px]` (statePrefix path, not intercepted).

### Verification
- `npm run typecheck && npx vitest run && npm run build` — green.
- Against the new export (transient swap, restore after — `assets/tokens-20260605-123353.zip`):
  `npm run build:tokens`; confirm `button.slots.base` has **no** `ring-[1px]`,
  `button.variants.variant.outline.base` **does**, solid/ghost/link have no resting `ring-[`,
  and `input.slots.base` still has `ring-[1px]`. Restore.
- Headless (optional): load the new export, confirm solid/ghost/link button previews have no
  resting ring while outline does.

## Out of scope
- A scanner hint for a dropped (unpaired) component-level resting ring-width — deferred (YAGNI).
- The focus ring-width on variants without a focus ring-colour (not part of the reported bug;
  all button variants have focus ring-colours).
- The parked `feat/component-divergence-flag` and the slot/part inventory — separate.

## Risks
- **Whole-component framers (input/textarea/checkbox/…).** Their resting ring-colour is on base
  (`variantAxis: null`), so the width stays on base — verified for input; the rule is uniform, so
  the same holds for the others. The input regression test guards this.
- **Multiple framed variants.** If a component had resting ring-colours on several variants, the
  width is emitted on each — correct. Button has only `outline` today.
- **Order independence.** The pre-scan runs before the main loop, so targets are known when the
  width is encountered regardless of token order.
