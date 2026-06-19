# Design Spec — non-trailing state parsing (`<state>-<utility>`)

**Date:** 2026-06-19
**Status:** Approved
**Topic:** The grammar parses an interaction state only as the **trailing** token segment (`bg-disabled` ✓), but the live export also uses `<state>-<utility>` ordering (`hover-bg`, `disabled-bg`), which goes `null`. Recognize a state in non-trailing position so those tokens route (where the state is real) or are flagged (where it isn't).

## Context

`parseSegments` (`slot-mapping.ts`) consumes a state only when it is the last segment (the trailing size/state suffix block). So:
- `dropdown-item-hover-bg`, `table-row-hover-bg` (hover leading) → `null` — but dropdown items + table rows **do** have hover, so these should route to `hover:bg-[…]`.
- `badge-disabled-bg`, `badge-disabled-text`, `badge-disabled-border` (disabled leading) → `null`. UBadge is a **stateless** static `<span>` (verified: its Nuxt theme has variants `fieldGroup/color/variant/size/square` — no `disabled`, no `:disabled`), so these are genuinely unsupported, not routable.

Both halves stem from one root cause: state parsed trailing-only. The scanner's `unsupportedStateForId` (and `propDrivenStateForId`) also check the trailing segment only, so leading-state tokens on stateless/prop-driven components are doubly missed.

## Changes

### 1. Grammar — non-trailing state in `parseSegments` (`packages/grammar/src/slot-mapping.ts`)

After the existing trailing size/state suffix block (~lines 157-166), add a non-trailing state scan over the remaining utility range:

```ts
  // Non-trailing state: a STATE_KEYS segment (excluding `default`, which doubles as a
  // color-role) elsewhere in the utility range, e.g. `hover-bg` / `disabled-bg`. Only
  // runs when no trailing state was found; the matched segment is removed from the utility.
  let utilityParts = parts.slice(start, end);
  if (state === null && utilityParts.length > 1) {
    const i = utilityParts.findIndex((s) => s !== "default" && STATE_KEYS.has(s));
    if (i !== -1) {
      state = utilityParts[i]!;
      utilityParts = [...utilityParts.slice(0, i), ...utilityParts.slice(i + 1)];
    }
  }
  return { component, utility: utilityParts.join("-"), variant, colorRole, size, state, slotPrefix };
```

(Replaces the current `utility: parts.slice(start, end).join("-")` in the return with the `utilityParts`-based computation.) Disambiguation: only `STATE_KEYS` members count, and `default` is excluded (it is also a color-role); `hover/active/disabled/focus/checked/hovered/open/opened` are not variant/color/utility names, so they are unambiguous. Trailing-state detection runs first, so existing `bg-disabled`-style tokens are unchanged. `utilityParts.length > 1` guards against stripping the state when it is the only segment (leaving an empty utility).

Effect (in `heuristicSlotMapping`'s second pass, where `nuxtSlotsFor` is the `componentSlots`, so `item`/`row` are consumed as slot-prefixes):
- `dropdown-item-hover-bg` → `{ slot: item, utility: bg, state: hover }` → `hover:bg-[…]`.
- `table-row-hover-bg` → `hover:bg-[…]` on the row/`tr` slot.
- `badge-disabled-bg` → `{ slot: base, utility: bg, state: disabled }` (then handled by §2).

`normalizeState` is unchanged — the state's *encoding* (hover→`hover:`, etc.) is its existing concern; this change only *recognizes* the state's position.

### 2. `badge` → `STATELESS_COMPONENTS` (`packages/grammar/src/component-vocab.ts`)

Add `"badge"` to `STATELESS_COMPONENTS`. With §1, `badge-disabled-*` now parses `state=disabled`, so the existing stateless guard in `parseSegments`/`matchParsed` drops it (no inert `disabled:` emit). badge stays in `NUXT_SLOTS` — its non-state tokens (`badge-bg`→base, `badge-label-text`→label) still map; only its state tokens drop.

### 3. Scanner detector parity (`src/scanner.ts`)

Update both helpers to detect a state in any non-component segment (not just trailing), so leading-state tokens on stateless/prop-driven components are still flagged:

```ts
function propDrivenStateForId(id: string): { state: string; prop: string } | null {
  const segs = id.split("-");
  if (segs.length < 2) return null;
  const component = segs[0]!;
  for (const seg of segs.slice(1)) {
    const prop = propDrivenStateFor(component, seg);
    if (prop !== null) return { state: seg, prop };
  }
  return null;
}

function unsupportedStateForId(id: string): { state: string } | null {
  const segs = id.split("-");
  if (segs.length < 2) return null;
  const component = segs[0]!;
  if (!STATELESS_COMPONENTS.has(component)) return null;
  const state = segs.slice(1).find((s) => s !== "default" && STATE_KEYS.has(s));
  return state === undefined ? null : { state };
}
```

`propDrivenStateFor(component, seg)` only returns non-null for curated `(component, state)` pairs (input/textarea/nav × `active`), so scanning all segments is safe (only `active` matches). For badge: `unsupportedStateForId("badge-disabled-bg")` → `{ state: "disabled" }` → `unsupported-state` warning.

## Data flow

`dropdown-item-hover-bg` → parse extracts `state=hover`, `utility=bg`, `slot=item` → recipe `item` slot gains `hover:bg-[…]`. `badge-disabled-bg` → parse extracts `state=disabled` → stateless guard (badge ∈ `STATELESS_COMPONENTS`) drops it → scanner `unsupported-state` warning.

## Error handling / edge cases

- A state-only token (`<comp>-disabled` with no utility) → `utilityParts.length > 1` is false → state not stripped → unchanged (avoids empty utility).
- `default` segment → excluded from the state scan (color-role).
- Existing trailing-state tokens (`bg-disabled`, `text-active`) → trailing detection runs first → unchanged.
- Variant/color-role segments already consumed before the utility range → not re-interpreted as state.
- dropdown-item hover: emits `hover:bg` (standard hover); mouse hover fires `:hover` on Reka items, so this is correct. (Any future `data-[highlighted]` refinement is a separate encoding concern, like checked→`data-[state=checked]`.)

## Testing

- **Grammar unit** (`slot-mapping.test.ts`): `dropdown-item-hover-bg` → `{ slot:"item", utilityType:"bg-color", statePrefix:"hover" }` (or the project's mapping shape); `table-row-hover-bg` → hover on the row/`tr` slot; `badge-disabled-bg` → `null` (dropped via STATELESS); a trailing-state token (`button-solid-bg-active`) is unchanged; `default` is not mistaken for a state; a state-only token isn't stripped to empty utility.
- **`component-vocab` unit:** `STATELESS_COMPONENTS.has("badge")` is `true`; badge still in `NUXT_SLOTS`.
- **Scanner unit** (`scanner.test.ts`): `badge-disabled-bg` → `unsupported-state` warning (leading state detected); a non-stateless leading-state token (`dropdown-item-hover-bg`) → no `unsupported-state`.
- **Recipe** (`custom-recipe-engine.test.ts` / `recipe-engine.test.ts`): a dropdown recipe gains `hover:` on the item slot from `dropdown-item-hover-bg`.
- **Full suite green.** If an existing test asserted a leading-state token was `null`/unmapped, update it.
- **Browser verification** via `/browse`: dropdown/table show the hover-state classes in the recipe/Real tab; badge surfaces the `unsupported-state` warning for `badge-disabled-*`. Dark-leak guard 0.

## Out of scope / future

- Per-component hover encoding (`:hover` vs Reka `data-[highlighted]`) — separate, like the checked/open normalizations; this spec only recognizes the state's position.
- `card`/`progress` in `STATELESS_COMPONENTS` — add when an export carries their state tokens (none today; badge is the motivated one).
- `dropdown-item-text-muted` (muted color modifier) and the genuinely-unsupported utilities (`ring-radius`, `focus-offset`, `:visited`) — separate gaps, not state-ordering.
