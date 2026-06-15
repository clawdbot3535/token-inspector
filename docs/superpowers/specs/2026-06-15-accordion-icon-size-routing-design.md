# Accordion icon-size Slot Routing — Design

**Date:** 2026-06-15
**Status:** Approved
**Type:** Bugfix (grammar slot-mapping; changes emitted `app.config.ts` output)

## Problem

The accordion live preview (reachable since v0.28.7) renders its item collapsed to ~20px
wide. Root cause: the `accordion-item-icon-size` token (value `20`) is emitted as `size-5`
on `slots.item`, which sets the item's width AND height to 20px.

`slot-mapping.ts` `matchParsed` (line ~420-441) matches the `icon-size` utility with the
icon rule, which builds an entry on the `leadingIcon` slot. But the final line forces the
matched entry onto the parsed sub-element prefix:

```ts
return slot === "base" ? entry : { ...entry, slot };  // slot = parsed.slotPrefix = "item"
```

So `accordion-item-icon-size` → `{slot:"leadingIcon", utilityType:"icon-size"}` is rewritten
to `{slot:"item", …}` → `size-5` on the item box. The override is correct for ordinary
utilities (e.g. `nav-item-bg` → bg on the item), but wrong for `icon-size`, which always
targets an icon slot, never the sub-element's own box.

### What is NOT in scope (recon corrected the earlier read)

- **`accordion-item-bg`** — value is `{components:[0,0,0], alpha:0}` (fully transparent by
  design); the engine correctly omits it. Not a bug.
- **`accordion-item-text-opened`** — `getSlotMapping → null`; it's the open-state text color,
  which needs the deferred `data-[state=open]:` prefix form. Separate, data-state concern.
- **`nav-item-icon-size`** — same `icon-size`-on-sub-element shape, but nav's icon slot is
  `linkLeadingIcon` (not `leadingIcon`), so the gated fix below intentionally leaves it
  unchanged. Nav's item-scoped icon routing is its own follow-up.

## Approach (chosen: gate the icon-slot routing on the component having that slot)

In `matchParsed`, before the sub-element override, keep the icon rule's slot when the matched
entry is an `icon-size` utility **and** the component actually has the icon rule's target slot
(`leadingIcon`) in its `NUXT_SLOTS`:

```ts
for (const rule of HEURISTIC_RULES) {
  if (rule.match(parsed.utility)) {
    const entry = rule.build(ctx);
    // … existing checked-indicator special-case …

    // icon utilities target the component's icon slot, not the sub-element base
    // they were named under: accordion-item-icon-size sizes the chevron, not the
    // item box. Only when the component actually has that icon slot — otherwise
    // keep current behaviour (no mis-routing to a slot the recipe ignores).
    if (
      entry.utilityType === "icon-size" &&
      (nuxtSlotsFor(parsed.component)?.has(entry.slot) ?? false)
    ) {
      return entry;
    }

    return slot === "base" ? entry : { ...entry, slot };
  }
}
```

Effect by component (verified against the export's icon-size tokens):
- **accordion** — `NUXT_SLOTS` has `leadingIcon` → `accordion-item-icon-size` routes to
  `leadingIcon` (mirrored to `trailingIcon` by `SLOT_MIRROR`), off the item. The item renders
  at its natural padding-driven size.
- **nav / chip / sidebar** — no `leadingIcon` slot (`linkLeadingIcon` / custom), so the gate is
  false and behaviour is unchanged. **Zero regression.**
- **Bare `<comp>-icon-size`** (button/badge/input/checkbox) — already routes to `leadingIcon`
  via the `slot === "base"` branch; untouched.

### Rejected alternatives

- **Universal (always keep the icon slot):** fixes accordion but rewrites nav/chip/sidebar
  `icon-size` onto a `leadingIcon` slot they don't have — incorrect recipe output.
- **Drop `icon-size` on sub-element bases:** stops the collapse but loses icon sizing; the
  gated route actually sizes the icon.

## Tests

- `packages/grammar/src/slot-mapping.test.ts` (extend):
  - `accordion-item-icon-size` → `{slot:"leadingIcon", utilityType:"icon-size"}` (was `item`).
  - `button-icon-size-md` → `{slot:"leadingIcon", …}` (unchanged — no sub-element).
  - `accordion-item-bg` → `{slot:"item", utilityType:"bg-color"}` (unchanged — non-icon utility still routes to the sub-element).
  - `nav-item-icon-size` → `{slot:"item", …}` (unchanged — nav has no `leadingIcon`; documents the deliberate non-regression).
- `src/recipe-engine.test.ts` (or the nearest recipe test): building the accordion recipe from
  a fixture with `accordion-item-icon-size` + `accordion-item-padding-*` yields `slots.item`
  WITHOUT `size-5` and `slots.leadingIcon` (and `slots.trailingIcon` via mirror) WITH it.
- Browser re-check (verification, no code): the accordion item renders full-width (not 20px).

## Success criteria

- `accordion-item-icon-size` maps to `leadingIcon`; the accordion `slots.item` no longer carries
  `size-5`; the live preview item renders at natural width.
- No change to nav/chip/sidebar/bare icon-size mappings; full suite green.

## Release

Patch release **v0.28.8** (CHANGELOG `### Fixed`; README test-count bump; tag, merge, push,
GitHub Release). Note the remaining accordion follow-ups (`text-opened` data-state, nav-item
icon-size) as known.
