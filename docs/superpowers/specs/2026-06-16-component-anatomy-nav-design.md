# Component Anatomy Spec — nav (Coverage-Guide Phase 1, Step 1) — Design

**Date:** 2026-06-16
**Status:** Approved
**Type:** Feature — new grammar data layer (no user-facing behaviour yet)
**Parent design:** `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260616-080346.md`
(office-hours, APPROVED) — the inspector → Design-System Coverage Guide direction.

## Context

The approved direction: the inspector becomes a **coverage guide** that tells the designer what's
**missing** (structural vs optional) to match each Nuxt UI component, because the user designs
atom-first (the element) while Nuxt is composite-first (the whole component). The chosen build
(Approach B) rests on a **curated anatomy spec** — per component, each Nuxt theme slot tagged
`structural` / `optional` with a one-line "what it controls."

This is **Step 1 of Phase 1**: the anatomy-spec data layer, seeded with **nav only** — the design
doc says author nav first (its 30 slots) to size the curation effort before committing to the
other four composites (accordion, dropdown, table, modal).

Out of scope (later increments): the other four composites' anatomy; the coverage engine
(Step 2: `missing = NUXT_SLOTS[comp] − touched`); the coverage UI (Step 3); the `inherited` bucket
(Phase 2).

## The data model

New module `packages/grammar/src/component-anatomy.ts` (lives next to `component-vocab.ts`, which
owns `NUXT_SLOTS`):

```ts
/** How a Nuxt theme slot relates to matching the component. */
export type SlotClassification = "structural" | "optional";

export interface SlotAnatomy {
  /** structural = must design to match the base component; optional = adornment / variant / sub-feature. */
  classification: SlotClassification;
  /** Short (<60 char) phrase: what visual the slot governs (for the to-design list). */
  controls: string;
}

/** Per-component, per-slot anatomy. Keys mirror NUXT_SLOTS exactly (100% coverage required). */
export const COMPONENT_ANATOMY: ReadonlyMap<string, ReadonlyMap<string, SlotAnatomy>> = new Map([
  ["nav", new Map([ /* all 30 nav slots, see below */ ])],
]);

/** The anatomy of a component, or undefined if not curated yet. */
export function anatomyFor(component: string): ReadonlyMap<string, SlotAnatomy> | undefined {
  return COMPONENT_ANATOMY.get(component);
}
```

## nav classification (LOCKED — grounded in the Nuxt UI v4 `NavigationMenu` theme)

Source: Nuxt UI v4 `NavigationMenu` `app.config.ts` theme slots (fetched via the Nuxt UI MCP).
User-confirmed the three judgement calls as **optional** (their components are deliberately
comprehensive + modular/variant-based, but "structural" = the irreducible base-navbar core).

**Structural (4)** — without these no navbar matches:

| slot | controls |
|---|---|
| `root` | navbar container: layout (flex), gap, orientation |
| `list` | items wrapper: layout / alignment of the entries |
| `item` | each entry container: vertical spacing |
| `link` | the link: text, padding, bg, hover, active, focus ring, radius |

**Optional (26)** — adornments / sub-features (controls in the table the implementation will
encode verbatim):

- Link adornments: `linkLeadingIcon` (leading icon size/colour), `linkLeadingAvatar`,
  `linkLeadingAvatarSize`, `linkLeadingChipSize`, `linkTrailing` (trailing container),
  `linkTrailingBadge`, `linkTrailingBadgeSize`, `linkTrailingIcon` (chevron, rotates on open),
  `linkLabel` (link text wrapper; inherits colour from `link`), `linkLabelExternalIcon`.
- Submenu cluster (only for dropdown navs): `childList`, `childLabel`, `childItem`, `childLink`,
  `childLinkWrapper`, `childLinkIcon`, `childLinkLabel`, `childLinkLabelExternalIcon`,
  `childLinkDescription`, `viewportWrapper`, `viewport` (dropdown panel: bg/shadow/radius/ring),
  `content`, `indicator` (active-item bar), `arrow`.
- Grouping: `label` (section heading), `separator` (divider).

Total = 4 + 26 = 30 = `NUXT_SLOTS.nav.size`.

### Value this already surfaces

The live export fills `item` + `linkLeadingIcon`. `link` is **structural + missing** — yet in Nuxt
the interactive look (bg/text/hover/active) lives on `link`. So the user's `nav-item-*` styling
intent likely belongs on `link`; the coverage guide flagging "link: structural, missing" is the
tool's value-prop. (This is an output of the future coverage engine, not this increment, but it's
why the classification is right.)

## Tests

`packages/grammar/src/component-anatomy.test.ts`:
- **100% coverage:** every slot in `NUXT_SLOTS.nav` has an entry in `anatomyFor("nav")`, and vice
  versa (no extra, no missing). This is the invariant that keeps curation honest.
- **Structural set:** the slots classified `structural` for nav are exactly
  `{root, list, item, link}`.
- **Shape:** every entry has a non-empty `controls` string ≤ 60 chars and a valid
  `classification`.
- `anatomyFor("button")` → `undefined` (only nav is curated in this increment).

## Success criteria

- `component-anatomy.ts` exports the model + nav's full 30-slot anatomy; `anatomyFor` works.
- Tests green (100% nav coverage invariant holds); full suite green.
- No consumer yet — purely additive data; no behaviour change.

## Release

Patch release **v0.28.12** (additive internal data, no user-facing change). The minor bump
(v0.29.0) is reserved for when the coverage **view** ships (Step 3, the first user-facing slice of
the coverage guide). CHANGELOG `### Added` (anatomy-spec foundation, nav); README test-count bump.
