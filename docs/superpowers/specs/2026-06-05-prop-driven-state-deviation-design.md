# Design: Prop-driven state deviation detection (capability cycle — part 1)

- **Date:** 2026-06-05
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/prop-driven-states`
- **Theme:** Nuxt state/variant capability → deviation detection (generalizes the D3
  validation-colour hint). First slice; seeded by `input-border-active`.

## Problem

Figma state names do not map 1:1 onto a Nuxt component's surface, and the surface is
**per-component**. `STATE_KEYS` is global, so any token with a known state suffix emits a
`state:` pseudo-class prefix — even when that component expresses the state via a **prop**, not
a CSS pseudo-class.

Concrete case (verified against the new export + Nuxt Input theme): the designer added an
`active` state to input (`input-border-active = #8A9DDB`, distinct from `input-border-focus`).
Today it maps to `active:ring-[#8A9DDB]` (CSS `:active` = mouse-pressed). But Nuxt Input has
**no** `:active` state — its "active / currently-selected" look is the **`highlight` boolean
prop** (`ring ring-inset ring-<color>`), applied programmatically. So the emitted pseudo-class
is semantically wrong (fires only while pressed) and silently ships in the recipe.

This is the same class as the D3 validation-colour deviation (error/success/warning/info →
`color` prop, not a slot), which the scanner already flags. The general fix is a per-component
model of which states/variants Nuxt drives via a **prop** rather than a class.

## Goal

Encode the **prop-driven** deviations per component, drop those tokens from the recipe (don't
emit a misleading pseudo-class), and flag them in the scanner — exactly mirroring the D3
validation-colour treatment. Seed with `input.active → highlight`.

Success criteria:
- `input-border-active` → `heuristicSlotMapping` returns `null` (no `active:ring-[…]` emitted).
- `button-solid-bg-active` (and any non-`input` `active` token) still maps to `active:bg-[…]`
  — `:active` is valid for button (pressed). The drop is strictly per-component.
- `input-border-focus` / `input-border-hover` / `input-border-disabled` still map to their
  ring-colour pseudo-classes (focus/hover/disabled are real Nuxt states, not prop-driven).
- The scanner emits a `classification-hint` **warning** (`kind: "state-via-prop"`) for
  `input-border-active`, explaining it's applied via the `highlight` prop, with no `ui.input`
  override emitted.
- Full suite + typecheck + build green; covered by unit tests; verified against the new export
  (no `active:` ring on input; the hint shows in the scan).

## Decisions

- **Approach: prop-driven exceptions table** (chosen over a full capability map or
  MCP-derivation). Encode only the deviations — the cases where Nuxt uses a prop. The
  "real pseudo-class" states (hover/focus/disabled) already work via `STATE_KEYS`; the
  "unsupported entirely" bucket is a later slice.
- **Drop + flag** (chosen over keep + flag): the `active:ring-[…]` class is semantically wrong
  (CSS `:active` ≠ the designer's selected/highlight state), so it must not ship. Mirrors D3,
  which drops validation colours and flags them.
- **Per-component, state-keyed table.** `active` is prop-driven for input but a valid
  pseudo-class for button — the table must be keyed by component. This slice covers **states**
  only (the seed is a state). Validation colours stay on their existing D3 path; folding them
  into this table is a later, separate refactor (don't touch working D3 code now).
- **Severity `warning`** to match D3 (it concerns a Figma token and produces no output —
  the user's "warning bei fehlerhaften/unvollständigen Figma-Tokens" rule).
- **Component-layer tokens only.** The scanner loop is already scoped to `node.layer ===
  "component"`; the `skipped` primitives/semantics scaffolding is never touched.

## Design

### 1. Vocabulary (`src/component-vocab.ts`)

New table + helper (placed near `STATE_KEYS`):

```typescript
/**
 * Per-component states that Nuxt UI v4 applies via a PROP, not a CSS
 * pseudo-class. Such tokens cannot be expressed as a recipe slot/class, so the
 * grammar drops them and the scanner flags them as deviations.
 *
 * Seed: Nuxt Input has no `:active` state — its "active / selected" look is the
 * `highlight` boolean prop (`ring ring-inset ring-<color>`). `:active` IS valid
 * for button (pressed), so this is keyed per component. Only deviations live
 * here; real pseudo-class states (hover/focus/disabled) route via STATE_KEYS.
 */
export const PROP_DRIVEN_STATES: ReadonlyMap<string, ReadonlyMap<string, string>> =
  new Map([["input", new Map([["active", "highlight"]])]]);

/** Returns the Nuxt prop that drives `state` on `component`, or null. */
export function propDrivenStateFor(component: string, state: string | null): string | null {
  if (state === null) return null;
  return PROP_DRIVEN_STATES.get(component)?.get(state) ?? null;
}
```

### 2. Grammar (`src/slot-mapping.ts`)

Import `propDrivenStateFor`. In `heuristicSlotMapping`, after `parseSegments` and the `ctx`
build (just before the `text` intercept), add the drop:

```typescript
  // Prop-driven states (input `active` → `highlight` prop) are applied by Nuxt
  // via a prop, not a recipe class — drop them; the scanner flags the deviation.
  if (propDrivenStateFor(parsed.component, parsed.state) !== null) {
    return null;
  }
```

`input-border-active` → `parsed.component = "input"`, `parsed.state = "active"` →
`propDrivenStateFor` returns `"highlight"` → `null`. `button-solid-bg-active` →
`propDrivenStateFor("button", "active")` is `null` → unaffected.

### 3. Scanner (`src/scanner.ts`)

Import `propDrivenStateFor` from `component-vocab`. Add a scanner-local id helper next to
`isValidationColorBorder`:

```typescript
/** {state, prop} when the token's trailing state is prop-driven for its component, else null. */
function propDrivenStateForId(id: string): { state: string; prop: string } | null {
  const segs = id.split("-");
  if (segs.length < 2) return null;
  const component = segs[0]!;
  const last = segs[segs.length - 1]!;
  const prop = propDrivenStateFor(component, last);
  return prop === null ? null : { state: last, prop };
}
```

In the `mapping === null` branch (where the D3 validation-colour hint already lives), add a
sibling `else if` so exactly one hint fires:

```typescript
    if (mapping === null) {
      if (node.type === "color" && isValidationColorBorder(node.id)) {
        // … existing D3 validation-colour hint (unchanged) …
      } else {
        const pd = propDrivenStateForId(node.id);
        if (pd !== null) {
          issues.push({
            id: `pd-${node.id}`,
            category: "classification-hint",
            severity: "warning",
            kind: "state-via-prop",
            message:
              `\`${node.id}\` targets the \`${pd.state}\` state, which Nuxt UI v4 applies via ` +
              `the \`${pd.prop}\` prop (set programmatically), not a recipe slot — ` +
              `\`${prefix}\` has no \`:${pd.state}\` pseudo-class state, so no \`ui.${prefix}\` ` +
              `override is emitted.`,
            tokenIds: [node.id],
            componentName: prefix,
          });
        }
      }
      continue;
    }
```

`input-border-active` (a colour, but `isValidationColorBorder` is false because `active ∉
VALIDATION_COLOR_ROLES`) → falls to the `else` → `propDrivenStateForId` returns
`{state:"active", prop:"highlight"}` → warning. `input-border-error` → validation branch only
(disjoint). No double-fire.

### Tests

- **`component-vocab.test.ts`**: `propDrivenStateFor("input","active") === "highlight"`;
  `propDrivenStateFor("button","active") === null`; `propDrivenStateFor("input", null) === null`;
  `propDrivenStateFor("input","focus") === null`.
- **`slot-mapping.test.ts`**: `input-border-active` → `null`; `input-border-focus` → ring-color
  (focus prefix) unchanged; `button-solid-bg-active` → `active:`/bg-color unchanged.
- **`scanner.test.ts`**: a graph with `input-border-active` (opaque colour) yields one
  `state-via-prop` warning (componentName `input`, mentions `highlight`); `input-border-focus`
  yields no such hint; `input-border-error` still yields the validation-colour hint (not
  state-via-prop).

### Verification

- `npm run typecheck && npx vitest run && npm run build` — green.
- Against the new export (transient swap, as in D2e): `npm run build:tokens`; confirm
  `ui.input` carries **no** `active:ring-[…]` and the CLI scan lists a `state-via-prop` hint
  for `input-border-active`. Restore the committed export after.
- Headless (optional): load the new export, open the scan pane, confirm the `input` group
  shows the `active` deviation warning and the input preview has no `:active` ring.

## Out of scope

- Folding D3's validation-colour deviation into `PROP_DRIVEN_STATES` (later refactor; D3 works).
- Prop-driven **variants** or **color-roles** (this slice is states only).
- The "unsupported entirely" bucket and a full per-component capability map (buckets 1 & 3).
- Any change to how button/other components handle `:active` (valid there).

## Risks

- **Dropping all `input-*-active` tokens.** The drop is keyed on (component, state), so every
  `input-…-active` token is dropped, not just the border. Correct: the whole `active` look is
  the `highlight` prop. The designer only has `input-border-active` today; a future
  `input-bg-active` would also (correctly) drop + flag.
- **Table drift from Nuxt.** Hand-authored, like `RING_FRAMED_COMPONENTS`. Acceptable; the
  scanner hint makes omissions visible rather than silently wrong.
