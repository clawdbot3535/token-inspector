# Design: D1 — classify bare `text` tokens by value type (fix lost semantic alias)

- **Date:** 2026-06-03
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/lost-semantic-alias`
- **Cycle:** B (first case — D1 from the deviation-detection seeds)
- **Relates to:** `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md`
  (this spec **corrects** that doc's D1 root-cause hypothesis — see "Corrected root cause").

## Problem

The emitted `ui.input` recipe bakes hardcoded hex colors for text:
`text-[#18181B]` (from `input-text`) and `disabled:text-[#A1A1AA]` (from
`input-text-disabled`), while sibling colors in the same recipe correctly emit
themeable `var(--…)` references (e.g. `placeholder:text-[var(--color-text-muted)]`,
`border-[var(--color-border-default)]`). A hardcoded hex does not follow dark mode or
design-system color changes, contradicting the "semantic colors become `var()`"
philosophy. (Exact hex varies by export; a newer Figma export shows `#282631` /
`#8E8D9F`. The pattern, not the value, is the bug.)

## Corrected root cause

The seeds doc hypothesised "the inspector does not follow `com.figma.aliasData`." Runtime
tracing **disproved** this: the alias edges exist and resolve correctly.
`input-text → color-text-primary` (semantic) and the color resolver
(`resolveColorReference` in `recipe-engine.ts`) returns `{ kind: "var",
targetId: "color-text-primary" }` for it. The alias machinery is healthy.

The real cause is a **grammar misclassification** in `heuristicSlotMapping`
(`src/slot-mapping.ts`). Bare `text` maps to the `text-size` rule, and is only
re-routed to `text-color` when a **variant or color-role axis** is present:

```ts
if ((parsed.variant !== null || parsed.colorRole !== null) && parsed.utility === "text")
  return buildEntry(slot, "text-color", ctx);
```

`button-solid-text` (variant `solid`) and `badge-error-text` (color-role `error`) hit this
branch → `text-color` → var(). But `input-text` and `textarea/text` have **no axis** →
they fall through to `text-size`. Because `text-size` is not in `COLOR_UTILITY_TYPES`,
`utilityForMapping` never calls the color resolver and instead emits the raw resolved
value as an arbitrary class → `text-[#hex]`. The alias is never consulted.

The heuristic encoded an assumption ("text means color only with a variant axis") that
holds only for axis-bearing components (button, badge). The correct, axis-independent
signal is the **token's value type**: a color-typed `text` token is a text color.
Verified node types: `input-text` = `color`, `input-font-size` = `number`,
`button-solid-text` = `color`.

## Goal

Classify a bare `text` utility as `text-color` when the token's value type is `color`,
so aliased color tokens emit `var(--…)` again — fixing `input` (and `textarea`) without
regressing button/badge. Grammar stays the single source of truth so recipe-engine,
scanner, and the App.vue highlight resolver classify identically (no drift).

Success criteria:
- `getSlotMapping("input-text", undefined, "color")` → `text-color`.
- `getSlotMapping("input-font-size", undefined, "number")` → `text-size` (unchanged).
- `getSlotMapping("button-solid-text", …)` → `text-color` (unchanged).
- Building the real `components/` export, `ui.input.slots.base` emits
  `text-[var(--color-text-primary)]` and `disabled:text-[var(--color-state-disabled-text)]`
  — no `text-[#hex]` for aliased color tokens.
- Full suite + typecheck + build green; golden snapshots updated intentionally if they move.

## Decisions

- **Approach: thread the value type into the grammar** (not a recipe-engine
  post-correction). The grammar owns classification; all four call sites pass the node's
  type. Rejected alternative: correcting `text-size → text-color` only inside
  `recipe-engine.ts` — it leaves scanner and App.vue misclassifying, reintroducing the
  documented App.vue/recipe drift pattern (the JIT and ring-offset bugs).
- **Scope: fix only.** No new scanner detector. The grammar fix resolves the issue at the
  root for aliased color tokens. A `hardcoded-color` detector (for genuinely alias-less
  color tokens) is out of scope and deferred.
- **Additive condition.** The `valueType === "color"` clause is added to the existing
  disambiguation, not a replacement — so the proven button/badge path is untouched and
  the change is backward-compatible when `valueType` is omitted.

## Design

### Change 1 — value-type-aware grammar (`src/slot-mapping.ts`)

- Add an optional third parameter to the two public entry points:
  - `heuristicSlotMapping(tokenId: string, valueType?: string)`
  - `getSlotMapping(tokenId: string, override?: SlotMappingOverride, valueType?: string)`
    (forwards `valueType` to `heuristicSlotMapping`).
- Extend the `text` disambiguation condition (additive):
  ```ts
  if (
    parsed.utility === "text" &&
    (valueType === "color" || parsed.variant !== null || parsed.colorRole !== null)
  ) {
    return buildEntry(slot, "text-color", ctx);
  }
  ```
- `valueType` is the token node's `type` field (e.g. `"color"`, `"number"`). Only the
  `"color"` value affects behavior; any other value leaves classification unchanged.

### Change 2 — pass the node type at all four call sites

- `src/recipe-engine.ts:167` and `:185` — `getSlotMapping(node.id, options.slotMappingOverride, node.type)`.
- `src/scanner.ts:65` — `getSlotMapping(node.id, undefined, node.type)`.
- `src/app/App.vue:146` — resolve the node's type from the graph for the selected id and
  pass it: `getSlotMapping(id, undefined, graphNode?.type)` (use the App's existing graph
  ref; if the node is not found, pass `undefined`, preserving current behavior).

No change to `resolveColorReference`, `utilityForMapping`, `COLOR_UTILITY_TYPES`, or the
alias machinery — they already work; the fix only ensures color `text` tokens reach them.

### Change 3 — tests

- `src/slot-mapping.test.ts` — classification unit tests:
  - `getSlotMapping("input-text", undefined, "color")` → entry with `utilityType: "text-color"`.
  - `getSlotMapping("input-font-size", undefined, "number")` → `text-size`.
  - `getSlotMapping("input-text", undefined, "number")` → `text-size` (type drives it).
  - `getSlotMapping("button-solid-text", …)` → `text-color` (variant path unchanged, with
    and without `valueType`).
- `src/recipe-engine.test.ts` — end-to-end var proof: build a graph with a semantic color
  node and a component `*-text` token aliasing it (no variant axis), assert the emitted
  base contains `text-[var(--<semantic-id>)]`, not a hex. This is the test that proves the
  actual fix (the cycle-A characterisation fixture uses literal hex with no alias, so it
  cannot show the var path).
- Re-run the cycle-A `input` characterisation snapshot. Expectation: **unchanged** — its
  fixture's `input-text` is a literal color with no alias, so both `text-size` (arbitrary)
  and `text-color` (literal) emit the same `text-[#…]`. If it does move, update it
  deliberately and note why.

### Change 4 — correct the seeds doc

Update the D1 section of
`docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md` to the corrected
root cause (grammar `text`/`text-size` misclassification, not unfollowed `aliasData`), so
the planning record is accurate.

## Verification

- `npm run typecheck && npx vitest run && npm run build` — all green.
- `npx tsx scripts/build-cli.ts` then inspect `output/nuxt/app.config.ts`: `ui.input.base`
  shows `text-[var(--color-text-primary)]` and
  `disabled:text-[var(--color-state-disabled-text)]`; no `text-[#hex]` from aliased color
  tokens. Confirm `button` text classes still emit `text-[var(--…)]` (no regression).
- Manual (optional): reload the inspector, confirm the `input` code preview shows the
  `var()` references.

## Out of scope

- `hardcoded-color` scanner detector for genuinely alias-less color tokens (future).
- D2 (`border` → `ring`) and D3 (validation color / compoundVariants) from the seeds doc.

## Risks

- **Call-site coverage:** the fix only works where the node type is threaded. The four
  call sites are enumerated above; missing one would leave that surface misclassifying.
  The classification unit tests plus the end-to-end recipe test guard the grammar; a brief
  read of each call site confirms the type is passed.
- **`node.type` field name:** assumed to be `type` on `TokenNode` (verified via runtime
  trace returning `"color"` / `"number"`). The plan confirms the exact field before wiring.
