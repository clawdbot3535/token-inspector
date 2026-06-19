# Design Spec — nav `active` → prop/variant-driven deviation

**Date:** 2026-06-19
**Status:** Approved
**Topic:** Stop emitting the inert `active:` (Tailwind `:active` press) for nav's current-page/selected tokens. Recognize nav `active` as prop/variant-driven (Nuxt UI v4 applies it via a baked-in `active` boolean variant, not a CSS pseudo-class), so the grammar drops it and the scanner flags it as a capability deviation — exactly like the existing input/textarea `highlight` seed.

## Context

Surfaced while scoping a Real-tab `selected`/active cell for nav. Investigation (Nuxt UI MCP, `NavigationMenu` theme) showed nav's active look is delivered by a **tailwind-variants boolean `active` variant** plus ~30 `compoundVariants` keyed on `{ active: true }` × color × variant:

```ts
active: { true: { childLink: 'before:bg-elevated text-highlighted', … }, false: { … } }
// + { color:'primary', variant:'pill', active:true, class:{ link:'text-primary' } } … ×30
```

Two consequences:

1. **The current emit is wrong.** `nav-item-*-active` runs through `normalizeState`, which leaves `active` unchanged → the recipe emits `active:bg-[…]` = Tailwind `:active` (mouse-press), which fires on click, not on the current route. A latent correctness bug, same shape as `checked:` before B.2a.
2. **The active look is not recipe-expressible.** The inspector applies recipes via `:ui="{ slot: classes }"`, which overrides slot **base** classes (applied unconditionally). There is no `ui`-level way to express "these classes only when active" — that requires a compoundVariant, which `ui` slot overrides cannot inject. So a Real-tab "does the recipe's active styling paint?" diff would be meaningless; Nuxt owns the active styling entirely.

This is precisely the `PROP_DRIVEN_STATES` precedent already in the grammar (input/textarea `active` → `highlight` prop: "applied by Nuxt via a prop, not a recipe class — drop them; the scanner flags the deviation"). Nav `active` is the same species: prop/variant-driven, not pseudo-class-driven. So the correct increment is a correctness fix + deviation flag, **not** a Real-tab cell.

## Changes

### 1. Grammar — `PROP_DRIVEN_STATES` (`packages/grammar/src/component-vocab.ts`)

Add a `nav` entry alongside the existing input/textarea entries:

```ts
export const PROP_DRIVEN_STATES: ReadonlyMap<string, ReadonlyMap<string, string>> =
  new Map([
    ["input", new Map([["active", "highlight"]])],
    ["textarea", new Map([["active", "highlight"]])],
    ["nav", new Map([["active", "active"]])],
  ]);
```

This is the only code change. It activates two already-wired paths (no new logic):

- **`slot-mapping.ts:387`** — `getSlotMapping` already returns `null` when `propDrivenStateFor(parsed.component, parsed.state) !== null`. For `nav-item-<variant>-{bg,text}-active`, `parsed.component` is `"nav"` and `parsed.state` is `"active"` (trailing segment), so the token is dropped — no inert `active:` emitted. The check is variant-independent, so all of outline/ghost/link active tokens drop.
- **`scanner.ts:82`** — when `getSlotMapping` returns `null` and `propDrivenStateForId` (which keys on `segs[0]` = `"nav"`) returns non-null, the scanner emits a `state-via-prop` warning: *"`nav-item-…-active` targets the `active` state, which Nuxt UI v4 applies via the `active` prop (set programmatically), not a recipe slot — `nav` has no `:active` pseudo-class state, so no `ui.nav` override is emitted."* That message is accurate as written for nav.

The `"active"` value is the driving prop name (the NavigationMenu item's `active` prop / route match), mirroring how `"highlight"` names input's driving prop.

### 2. Per-component scoping is preserved

`PROP_DRIVEN_STATES` is keyed per component, so adding `nav` does **not** affect `button`, whose `*-active` tokens are a legitimate `:active` press state and must keep emitting `active:`. A test guards this.

## Data flow

Token `nav-item-outline-bg-active` → parsed (`component:"nav"`, `variant:"outline"`, `state:"active"`) → `getSlotMapping` hits the `propDrivenStateFor("nav","active")` guard → returns `null` (dropped; no recipe class). Scanner: the null mapping + `propDrivenStateForId("nav-item-outline-bg-active")` → `{state:"active", prop:"active"}` → a `state-via-prop` warning surfaced in the scan report.

## Error handling / edge cases

- **Overlay-context active tokens** (`nav-item-overlay-dark/light-<variant>-*-active`): the scanner keys on `segs[0]` = `"nav"`, so it would flag them; whether the slot-mapping **drop** also fires depends on whether their `parsed.component` resolves to `"nav"`. This is verified during implementation (a test asserting an overlay active token's mapping). If their `parsed.component` is the overlay group rather than `"nav"`, they are out of scope (a separate overlay concern) and the spec's claims hold for the base nav tokens only — note the result; do not expand scope to chase it.
- A nav **non-active** token (e.g. `nav-item-link-text`) is unaffected — only the trailing `active` state triggers the guard.
- `button-*-active` (press state) is unaffected — `button` is not in `PROP_DRIVEN_STATES`.

## Testing

- **Grammar unit** (`packages/grammar/src/slot-mapping.test.ts`): `getSlotMapping("nav-item-outline-bg-active", undefined, "color")` returns `null` (dropped); a nav non-active token (e.g. `nav-item-link-text` or an existing nav mapping) still maps to a slot; `getSlotMapping("button-solid-bg-active", …)` still yields a mapping whose `statePrefix`/class carries `active:` (button press state preserved).
- **Scanner unit** (`src/scanner.test.ts`): a graph containing `nav-item-outline-bg-active` (component allow-listed) produces a `state-via-prop` warning whose message names the `active` state and the `active` prop; a graph with `button-*-active` produces no such warning for button.
- **Recipe-engine** (`src/recipe-engine.test.ts`): a nav recipe built from a graph with `nav-item-*-active` tokens contains **no** `active:` classes in any slot/variant.
- **Full suite green.** If an existing test asserted that a nav active token emits `active:`, update it to the new dropped/flagged behavior (the earlier grep found none, but the pre-commit suite is authoritative).
- **No browser verification** — this is an emit/scan change, not a render change. `LiveRealNav` renders flat label-only items with no active item, so `active:` never fired there; the recipe output and scan report are fully unit-testable.

## Out of scope / future

- A Real-tab active cell — active is not recipe-expressible (the core finding), so there is nothing to diff.
- Dropdown `selected`/active — no active tokens in the live export.
- Overlay-context nav active tokens beyond what the base `"nav"` component key covers (see edge cases).
- Phase C (hover/focus/active pseudo-states) remains CDP-blocked. Note: this fix removes the *only* legitimate-looking nav `active:` emit, making clear that nav has no pseudo-class active state at all.
