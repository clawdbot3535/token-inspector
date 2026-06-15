# Nav item-icon-size Slot Routing — Design

**Date:** 2026-06-15
**Status:** Approved
**Type:** Bugfix (grammar slot-mapping; changes emitted `app.config.ts` output)

## Problem

The nav preview item collapses the same way the accordion item did before v0.28.8:
`nav-item-icon-size` (value `20`) is emitted as `size-5` on `slots.item`, which sets the
item's width AND height. The nav item slot is
`border-[1px] focus:ring-[2px] font-[400] gap-1 h-[60px] leading-[14px] px-1.5 py-1.5
rounded-md size-5 text-sm tracking-[…]` — the `size-5` overrides the intended `h-[60px]` and
collapses the item to 20px.

The v0.28.8 fix routes `icon-size` to the icon slot, but only when the component has a
`leadingIcon` slot. **Nav's leading-icon slot is `linkLeadingIcon`** (its anatomy is
link-scoped), so `nuxtSlotsFor("nav").has("leadingIcon")` is false and the gate didn't fire —
the size stayed on `item`.

### Not in scope

Four nav tokens map to `null` (`nav-item-ring-radius`, `nav-item-focus-offset`,
`nav-item-outline-text-inverted`, `nav-item-link-text-visited`) — unmapped utilities
(`ring-radius`, `focus-offset`) and unrecognized state/role words (`inverted`, `visited`).
Separate, lower-value work. Also out: mirroring `linkLeadingIcon`→`linkTrailingIcon`, and any
nav preview state projection.

## How icon-size routes today (post-v0.28.8)

In `slot-mapping.ts` `matchParsed`, the icon-size branch:

```ts
if (
  entry.utilityType === "icon-size" &&
  !/icon$/i.test(slot) &&
  (nuxtSlotsFor(parsed.component)?.has(entry.slot) ?? false)  // entry.slot === "leadingIcon"
) {
  return entry;
}
return slot === "base" ? entry : { ...entry, slot };
```

`entry.slot` is hard-coded `leadingIcon` (the icon rule's slot). Nav has no `leadingIcon`, so
the gate fails and the size lands on the `item` sub-element prefix.

## Approach (chosen: route to the component's actual leading-icon slot)

Add `leadingIconSlotFor(component)` to `component-vocab.ts`: returns the component's
leading-icon slot from `NUXT_SLOTS` — `leadingIcon` if present, else the slot matching
`/leadingIcon$/i` (`linkLeadingIcon` for nav, `itemLeadingIcon` for dropdown), else
`undefined`.

```ts
/** The component's leading-icon slot (leadingIcon / linkLeadingIcon / itemLeadingIcon), or
 *  undefined if it has none. icon-size routes here instead of collapsing a sub-element base. */
export function leadingIconSlotFor(component: string): string | undefined {
  const slots = nuxtSlotsFor(component);
  if (!slots) return undefined;
  if (slots.has("leadingIcon")) return "leadingIcon";
  return [...slots].find((s) => /leadingIcon$/i.test(s));
}
```

Generalize the `matchParsed` icon-size branch to route to it:

```ts
if (entry.utilityType === "icon-size" && !/icon$/i.test(slot)) {
  const iconSlot = leadingIconSlotFor(parsed.component);
  if (iconSlot) return { ...entry, slot: iconSlot };
}
return slot === "base" ? entry : { ...entry, slot };
```

Effect by component (verified against the export's icon-size tokens):
- **nav** — `leadingIconSlotFor("nav") === "linkLeadingIcon"` → `nav-item-icon-size` routes to
  `linkLeadingIcon`, off the item; the item keeps its `h-[60px]` and renders full-width.
- **accordion** — `leadingIconSlotFor("accordion") === "leadingIcon"` → unchanged from v0.28.8
  (`{...entry, slot:"leadingIcon"}` equals the old `entry`); `SLOT_MIRROR` still copies to
  `trailingIcon`.
- **button / badge / input** (bare `icon-size`, slot `base`) — `leadingIconSlotFor` returns
  `leadingIcon`; `{...entry, slot:"leadingIcon"}` equals the existing entry → unchanged.
- **explicit icon prefix** (`button-trailingIcon-icon-size`) — `/icon$/i.test(slot)` true →
  branch skipped → stays `trailingIcon`.
- **chip / sidebar** — no leading-icon slot → `undefined` → branch skipped → unchanged.

### Rejected alternatives

- **Hardcode `{nav: "linkLeadingIcon"}`**: per-component map, less general, equal effort.
- **Also fix the 4 nav nulls**: separate utilities/states, lower value.

## Tests

- `packages/grammar/src/slot-mapping.test.ts`:
  - **Update** the v0.28.8 assertion `nav-item-icon-size → {slot:"item", …}` to
    `→ {slot:"linkLeadingIcon", utilityType:"icon-size", variantAxis:null, variantKey:null}`.
  - `accordion-item-icon-size` → `{slot:"leadingIcon", …}` (unchanged — regression guard).
  - `button-trailingIcon-icon-size-md` → `{slot:"trailingIcon", …}` (unchanged — regression guard).
- `src/recipe-engine.test.ts`: building the nav recipe from a fixture with `nav-item-icon-size`
  + `nav-item-padding-y` yields `slots.item` WITHOUT `size-` and `slots.linkLeadingIcon` WITH it.
- Browser re-check (verification, no code): the nav item renders full-width (not 20px).

## Success criteria

- `nav-item-icon-size` maps to `linkLeadingIcon`; the nav `slots.item` no longer carries
  `size-5`; the live preview item renders at natural width.
- accordion / button / explicit-icon-prefix / chip / sidebar mappings unchanged; full suite green.

## Release

Patch release **v0.28.10** (CHANGELOG `### Fixed`; README test-count bump; tag, merge, push,
GitHub Release). Note the remaining nav nulls as known follow-ups.
