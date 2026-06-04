# Design: D3 — `validation-color-via-prop` scanner detector

- **Date:** 2026-06-04
- **Status:** DRAFT (awaiting user review)
- **Branch:** `fix/d3-validation-color`
- **Cycle:** B (D3 — the first true detection-layer entry)
- **Relates to:** `docs/superpowers/specs/2026-06-03-cycle-b-deviation-detection-seeds.md` (D3)

## Problem

Figma component tokens of the form `<comp>-border-<validation-role>` (e.g.
`input-border-error`, `input-border-success`) are **silently dropped** by the recipe
grammar: `getSlotMapping` parses them to a utility `"border-error"` that matches no rule
and returns `null`. The designer defined these tokens in Figma and gets no output and no
explanation.

This is not a bug to fix in the recipe. Every such token is a **semantic alias** to a
shared validation color (`input-border-error` → `color/border/error`; the others →
`color/status/error-border` / `color/status/ok-border`), and Nuxt UI v4 applies
error/success through the **`color` prop** (`<UInput color="error" />`, or a `UFormField`
on validation) — colored via `compoundVariants` referencing the design-system error/
success color. So the value already lives in the color layer; no per-component recipe
override is needed. The defect is only that the inspector **swallows the token silently**
instead of explaining it.

## Goal

Add a scanner detector that recognizes the dropped `<comp>-border-<validation-role>`
tokens and surfaces a `warning` explaining they are applied via Nuxt's `color` prop and
need no recipe override. No recipe/engine/schema change. This makes the drop visible and
explained ("never silently swallow").

Severity is **`warning`**, per the project convention that warnings flag the Figma
token/component system (these are designer-authored tokens that do not map to a recipe).
This matches the existing `single-mode-semantic` issue, which is also
`category: "classification-hint"` + `severity: "warning"`.

Success criteria:
- A graph containing `input-border-error` produces exactly one scan issue with
  `kind: "validation-color-via-prop"`, `severity: "warning"`,
  `category: "classification-hint"`, `tokenIds: ["input-border-error"]`,
  `componentName: "input"`.
- The same for `input-border-success` and the other components carrying the dropped form
  (`textarea`, `checkbox`, `radio`, `chip`, `switch`).
- A genuinely malformed/unknown dropped token (e.g. `input-mystery-token`) does NOT
  produce this warning.
- A token that maps successfully (e.g. `input-border`, `badge-error-border`) does NOT
  produce this warning.
- Full suite + typecheck + build green; no recipe output change.

## Scope

- **In:** the dropped `<comp>-border-<validation-role>` form, where the **second-to-last**
  segment is `border` and the **last** is a validation color role (`error`, `success`,
  `warning`, `info`). In the current export this is `input`, `textarea`, `checkbox`,
  `radio`, `chip`, `switch` (`-border-error` / `-border-success`).
- **Out:**
  - `badge-error-border` (form `<comp>-<role>-border`): this MAPS to
    `variants.color.error` (a border on the color axis), a different case tied to badge's
    variant/color frame → D2c, not D3.
  - The `compoundVariants` emit path (rejected this cycle).
  - D2c (`button`/`badge` variant-conditional rings).

## Design

### Detection (in `src/scanner.ts`, the main component loop)

The loop at `src/scanner.ts:~60` already does:

```typescript
    const mapping = getSlotMapping(node.id, undefined, node.type);
    if (mapping === null) continue;
```

Insert the detector at the `mapping === null` branch — before `continue` — so a dropped
validation-color border token becomes a warning instead of vanishing:

```typescript
    const mapping = getSlotMapping(node.id, undefined, node.type);
    if (mapping === null) {
      if (isValidationColorBorder(node.id)) {
        issues.push({
          id: `vc-${node.id}`,
          category: "classification-hint",
          severity: "warning",
          kind: "validation-color-via-prop",
          message:
            `\`${node.id}\` is a validation color. Nuxt UI applies error/success ` +
            `through the component's \`color\` prop (e.g. \`color="error"\`, or a ` +
            `\`UFormField\` on validation), not a recipe slot — it lives in the color ` +
            `layer, so no \`ui.${prefix}\` override is emitted.`,
          tokenIds: [node.id],
          componentName: prefix,
        });
      }
      continue;
    }
```

(`prefix` is already computed in the loop. The message stays generic — it does not build a
`<UComponent>` tag from the prefix, because the Nuxt component name is not always the
capitalised prefix, e.g. `radio` → `URadioGroup`.)

### Detection helper

A small pure predicate, defined in `scanner.ts` (or `component-vocab.ts` if a shared
home is cleaner):

```typescript
const VALIDATION_COLOR_ROLES: ReadonlySet<string> = new Set([
  "error", "success", "warning", "info",
]);

/** True for `<comp>-border-<error|success|warning|info>` tokens (the dropped form). */
function isValidationColorBorder(id: string): boolean {
  const segs = id.split("-");
  const last = segs[segs.length - 1];
  const beforeLast = segs[segs.length - 2];
  return beforeLast === "border" && last !== undefined && VALIDATION_COLOR_ROLES.has(last);
}
```

This catches `input-border-error` (`…, border, error`) and excludes
`badge-error-border` (`…, error, border` → last is `border`), `input-border` (no role),
and `input-mystery-token`.

### What does NOT change

- `slot-mapping.ts` / the grammar (the token still returns `null` from `getSlotMapping`).
- `recipe-engine.ts` / `ComponentRecipe` (no `compoundVariants`, no new emit).
- The renderer / `app.config.ts` output (byte-identical).
- The Scan View UI renders issues by `category`/`kind`/`severity` already, so the new warning
  appears automatically with no component change.

### Tests (`src/scanner.test.ts`)

Using the existing `makeNode` fixture convention:
- A graph with a component node `input-border-error` (type color) → `scanGraph` issues
  include exactly one `validation-color-via-prop` warning for it (assert kind,
  `severity: "warning"`, `category: "classification-hint"`, tokenIds, componentName).
- `input-border-success` → same.
- `input-mystery-token` (dropped, not a validation border) → NO such warning.
- `input-border` (maps) → NO such warning.
- `badge-error-border` (maps to color axis) → NO such warning.

### Verification

- `npm run typecheck && npx vitest run && npm run build` — all green.
- `npx tsx scripts/build-cli.ts` — the scan output now lists the validation-color warnings
  (e.g. for `input-border-error`/`-success`); the emitted `app.config.ts` is unchanged
  (no recipe output for these tokens, as before).

## Out of scope

- `compoundVariants` emit path (would let a component override the global error ring).
- D2c (`button`/`badge`).
- A "value differs from the semantic error color" sub-check. The current data shows these
  tokens alias shared semantic colors; a future refinement could compare the value to the
  design-system error color and only warn when redundant vs. flag when divergent. Not now.

## Risks

- **Over-broad match.** A non-Nuxt token coincidentally shaped `…-border-error` would also
  warn. Acceptable: the warning is informational and the shape is specific (border + a
  validation role as the final two segments). The negative test (`input-mystery-token`)
  guards the common false-positive.
- **Allow-list gating.** The main loop only reaches the `mapping === null` branch for
  components in the allow-list (`if (!allowSet.has(prefix)) continue;` runs earlier). All
  the affected components (input, textarea, checkbox, radio, chip, switch) are
  allow-listed, so this is fine; non-allow-listed components simply won'''t warn (consistent
  with the rest of the scan).
