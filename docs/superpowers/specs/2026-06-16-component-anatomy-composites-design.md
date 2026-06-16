# Component Anatomy — accordion/dropdown/table/modal + nav re-align — Design

**Date:** 2026-06-16
**Status:** Approved
**Type:** Feature — extends the anatomy data layer (no user-facing behaviour yet)
**Parent:** `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260616-080346.md`
(coverage-guide direction) · builds on v0.28.12 (nav anatomy).

## Context

Step 1 of the coverage guide curated `nav`. This increment curates the remaining four composites
(accordion, dropdown, table, modal) and re-aligns `nav` under a refined principle, completing the
five-composite anatomy spec. All classifications are grounded in the live Nuxt UI v4 component
themes (fetched via the Nuxt UI MCP) and validated with the user.

## Principle (locked: "Must-Design")

A slot is **`structural`** iff a designer must supply tokens for it to match the base component —
i.e. it carries a designable visual surface (bg / border / ring / text colour / the primary
text+padding region). Pure layout (`flex`/`w-full`/positioning), empty (`''`), animation-only, and
adornments/sub-features/state slots are **`optional`** (Nuxt's default already matches, so flagging
them "design this" would be noise). Optional slots stay visible in the guide — they're just not
flagged as required.

This **refines v0.28.12**: nav was curated under a looser "skeleton" reading (root/list/item/link).
Under Must-Design only `link` carries a designable surface (bg/text/hover/active/ring/radius);
root=gap+layout, list=flex, item=py-spacing → optional. The user confirmed item → optional, which
is the point: their `nav-item-*` tokens land on `item` (optional) while the structural `link` is
empty — exactly the "you styled item, design link" insight the guide should surface.

## Locked classifications (structural set per component; all other slots optional)

- **nav (re-align):** structural = `link`. (29 others optional.)
- **accordion:** structural = `item` (border), `trigger` (header text/padding/focus/radius),
  `body` (panel text/padding). Optional: root (w-full), header (flex), content (animation),
  leadingIcon, trailingIcon, label.
- **modal:** structural = `overlay` (dim bg), `content` (box: bg/radius/shadow/ring), `body`
  (padding), `title` (text). Optional: header, wrapper (empty), footer, description, close.
- **table:** structural = `th` (header cell: padding/text), `td` (data cell: padding/text).
  Optional: root, base, caption, thead, tbody, tfoot, tr, separator, empty, loading.
- **dropdown:** structural = `content` (panel: bg/shadow/radius/ring), `item` (text/bg/hover/
  active/padding). Optional: input, empty, viewport, arrow, group, label, separator, all
  `item*` adornments (icon/avatar/kbds/wrapper/label/description/externalIcon).

Each component's anatomy covers 100% of its `NUXT_SLOTS` (counts: nav 30, accordion 9, modal 9,
table 12, dropdown 20). `controls` strings (≤60 chars) are encoded per slot from the theme.

## Tasks

1. **Re-align nav + add the four composites** in `packages/grammar/src/component-anatomy.ts`:
   flip nav's root/list/item to `optional` (only `link` stays structural); add `accordion`,
   `dropdown`, `table`, `modal` entries with the classifications above + `controls` strings.
2. **Make the test data-driven** in `component-anatomy.test.ts`: an `EXPECTED_STRUCTURAL` map
   (nav→[link], accordion→[item,trigger,body], modal→[overlay,content,body,title], table→[th,td],
   dropdown→[content,item]); loop over `COMPONENT_ANATOMY` asserting (a) keys === `NUXT_SLOTS[comp]`
   (100% coverage), (b) the structural set matches `EXPECTED_STRUCTURAL`, (c) shape (valid
   classification, non-empty `controls` ≤60 chars). Keep the `anatomyFor("button") → undefined`
   guard (button still uncurated).

## Out of scope

The coverage engine (Step 2), the coverage view (Step 3), the `inherited` bucket (Phase 2), and
the simple components (button/badge/input/card/kbd/progress — their base slot IS the component, no
curation needed).

## Success criteria

- `COMPONENT_ANATOMY` has all five composites; each covers 100% of its `NUXT_SLOTS`; structural
  sets match the locked sets above. nav structural === `{link}`.
- Data-driven test green; full suite green. No consumer yet — additive data.

## Release

Patch **v0.28.13** (additive data + the nav re-align; no user-facing change). CHANGELOG `### Added`
(+ a `### Changed` note that nav's structural set tightened to `link` under the Must-Design
principle); README test-count bump.
