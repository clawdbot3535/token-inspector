# Coverage Engine — Design

**Date:** 2026-06-16
**Status:** Approved
**Type:** Feature — Step 2 of the Design-System Coverage Guide (internal/additive; no user-facing view yet)
**Parent:** `~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260616-080346.md`
(coverage-guide direction) · builds on v0.28.13 (the five-composite anatomy spec).

## Context

The anatomy spec (v0.28.12–v0.28.13) is the data layer: per component, every Nuxt UI v4 theme
slot classified `structural` / `optional` with a one-line `controls`. Step 2 is the **engine** that
joins that spec to a live `TokenGraph` and reports, per component, which slots a design has covered
and which structural slots are still un-designed. Step 3 (the user-facing view) consumes this; it is
out of scope here.

## Validated by probe (before writing)

A throwaway probe ran the proposed logic against the live export (`tokens-20260615-161948.zip`) for
all five composites. Findings (these are the engine's expected real output):

- **nav:** touched `{item, linkLeadingIcon}` → structural-missing `{link}`.
- **accordion:** touched `{item, leadingIcon}` → structural-missing `{trigger, body}`.
- **modal:** touched `{content, overlay}` → structural-missing `{body, title}`.
- **table:** touched `{base, td, th}` → structural-missing `{}` (fully covered).
- **dropdown:** touched `{content, item}` → structural-missing `{}` (fully covered).

Two risks resolved by the probe:

1. **camelCase-reachability (from the design doc).** `buildGraph` lowercases ids, so camelCase slots
   reached *via slot-prefix matching* are unreachable — BUT every **structural** slot in all five
   composites is a single lowercase word (`link`, `item`, `trigger`, `body`, `overlay`, `content`,
   `title`, `th`, `td`), so it's correctly reachable. The camelCase slots that did get touched
   (`linkLeadingIcon`, `leadingIcon`) are `optional` and were reached via the icon-size rule. Net:
   the risk does **not** produce false-positive structural gaps. (Optional camelCase slots may still
   under-report "touched"; acceptable for Phase 1 — they're never flagged as required.)

   **Caveat found during TDD — the nav `link` variant collision.** `link` is both nav's one
   structural *slot* AND a Nuxt button-*variant value* (`solid|outline|…|link`). The grammar reads a
   2nd-segment `link` as the variant, so `nav-link-bg` routes to `slots.base` + `variantKey: "link"`,
   **not** to the `link` slot. Consequence: nav's `link` slot is effectively unreachable by
   `nav-link-*` tokens, so the guide reports it missing even if a designer supplies them. For the
   live export this is still *correct* (no `nav-link-*` tokens exist; `link` is genuinely empty), and
   the engine faithfully implements the locked `touched = getSlotMapping routes there` semantics — so
   this is a **grammar/anatomy modelling issue to address separately**, not an engine bug. Flagged
   for Step 3 (the "design the link slot" insight can't turn green until the collision is resolved).
2. **overlay double-meaning.** A first probe over-excluded with `/overlay/` and wrongly dropped
   modal's `overlay` **slot** token (`modal-overlay-bg`), reporting `overlay` as missing. The fix:
   exclude only overlay-**context** variants — ids matching `-overlay-(dark|light)` (the separate
   overlay-delta recipes) — never the bare `overlay` slot.

## Architecture

A pure function in core (it iterates the `TokenGraph`), consuming `anatomyFor` + `getSlotMapping`
from `@tg/grammar`. Same read-only contract as the renderers — graph in, report out, no mutation.

```
src/coverage.ts
  coverageFor(graph: TokenGraph, component: string): ComponentCoverage | null
```

### Types

```ts
import type { SlotClassification } from "@tg/grammar";

export interface SlotCoverage {
  slot: string;
  classification: SlotClassification;   // "structural" | "optional"
  controls: string;                     // from the anatomy spec
  touched: boolean;                     // ∃ token routing to this slot
}

export interface ComponentCoverage {
  component: string;
  slots: readonly SlotCoverage[];       // all anatomy slots, in anatomy order
  structuralTotal: number;
  structuralTouched: number;
  /** Missing slots (touched === false), structural first, then optional; anatomy order within each. */
  toDesign: readonly SlotCoverage[];
}
```

### Algorithm

1. `anatomy = anatomyFor(component)`; if `undefined` → return `null` (uncurated component).
2. `touched` set: for every graph node whose `id.split("-")[0] === component` AND that is not an
   overlay-context variant (`!/-overlay-(dark|light)\b/.test(id)`), add `getSlotMapping(id,
   undefined, node.type)?.slot` when non-null.
3. `slots` = anatomy entries (insertion order) → `{slot, classification, controls, touched: touched.has(slot)}`.
4. `toDesign` = `slots.filter(s => !s.touched)`, stable-sorted structural-before-optional.
5. `structuralTotal` / `structuralTouched` counted from `slots`.

The token filter (`split("-")[0]`) is the scanner's existing component-name convention. No
`extraSlots` / `override` needed — all five composites are standard `NUXT_SLOTS` components, so
`getSlotMapping`'s pass-2 fallback routes them (the probe confirms).

## Tasks

1. **`src/coverage.ts`** — the types above + `coverageFor`. Pure; no I/O; no mutation.
2. **`src/coverage.test.ts`** — synthetic graphs via `buildGraph` fixtures:
   - uncurated component (`button`) → `null`.
   - nav with a `nav-link-*` token → `link.touched === true`, `structuralTouched === 1`, `toDesign`
     has no structural entry.
   - nav with only a `nav-item-*` token → `link` missing (structural), `item` touched (optional);
     `toDesign[0].slot === "link"` (structural sorted first); `structuralTouched === 0`.
   - modal with `modal-overlay-bg` → `overlay.touched === true` (the slot, NOT excluded) — guards
     the precise overlay-context exclusion.
   - overlay-context exclusion: a graph whose only structural-slot token is an overlay-context
     variant (`-overlay-dark-`/`-overlay-light-`) leaves that slot missing.
   - shape: `slots` covers 100% of the anatomy; `toDesign` is structural-before-optional.

## Out of scope

The coverage **view** (Step 3, web UI — the user-facing slice, v0.29.0); the `inherited` bucket
(Phase 2); wiring the engine into the scanner/App (no consumer yet — additive).

## Success criteria

- `coverageFor` returns the probe's findings for each composite when run on the live export.
- `null` for uncurated components.
- `toDesign` lists structural-missing first.
- New tests green; full suite green.

## Release

Patch **v0.28.14** (internal/additive engine; no user-facing change). CHANGELOG `### Added`;
README test-count bump.
