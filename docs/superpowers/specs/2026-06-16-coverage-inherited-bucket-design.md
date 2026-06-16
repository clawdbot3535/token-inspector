# Coverage Guide — `inherited` bucket — Design

**Date:** 2026-06-16
**Status:** Approved
**Type:** Feature — Phase 2 refinement of the coverage guide (anatomy + engine + view)
**Parent:** the coverage-guide arc (`2026-06-16-coverage-view-design.md`, `…-slot-highlight-design.md`)
and the office-hours design doc (`~/.gstack/projects/clawdbot3535-token-inspector/christian-main-design-20260616-080346.md`, Open Q #3, which deferred this bucket).

## Context

The office-hours doc deferred a third `inherited` bucket for one reason: "no reliable inherits-from
detection signal yet." That is now resolved — we **curate** inheritance in the anatomy spec exactly
as we curate structural/optional (no auto-detection). Three slots already note it in their `controls`
strings; this increment promotes them (plus one more) to a real `inherited` classification and gives
the coverage view a third section.

An inherited slot is one whose styling follows a parent slot (a label wrapper takes its parent's
text). Today those slots read as `optional ○` (noise — "you might design `linkLabel`" when it just
follows `link`). The fix: mark them `inherited`, and treat them as **covered when their parent is
designed** (decided with the user).

## Curated inherited set (4 slots)

| Component | Slot | inheritsFrom |
|---|---|---|
| nav | `linkLabel` | `link` |
| nav | `childLinkLabel` | `childLink` |
| accordion | `label` | `trigger` |
| dropdown | `itemLabel` | `item` |

Deliberately **left `optional`** (not inherited): the *description* slots (nav `childLinkDescription`,
modal `description`, dropdown `itemDescription`) — each has its own Nuxt muted default, so it's
"refine if you want", not pure inheritance — and the external-link icon adornments. modal and table
gain no inherited slots.

## Architecture

### 1. Anatomy spec — `packages/grammar/src/component-anatomy.ts`

```ts
export type SlotClassification = "structural" | "optional" | "inherited";

export interface SlotAnatomy {
  classification: SlotClassification;
  controls: string;
  /** Parent slot this one inherits its styling from. Set iff classification === "inherited". */
  inheritsFrom?: string;
}

const i = (inheritsFrom: string, controls: string): SlotAnatomy =>
  ({ classification: "inherited", controls, inheritsFrom });
```

Re-tag the 4 slots from `o(...)` to `i(parent, ...)`:
- nav: `["linkLabel", i("link", "link text wrapper (truncate; follows link)")]`,
  `["childLinkLabel", i("childLink", "submenu link label text (follows childLink)")]`
- accordion: `["label", i("trigger", "trigger label text (follows trigger)")]`
- dropdown: `["itemLabel", i("item", "item label text (follows item)")]`

### 2. Anatomy test — `component-anatomy.test.ts`

- Add `EXPECTED_INHERITED: Record<string, Record<string, string>>` mapping comp → `{slot: parent}`
  (nav→{linkLabel:link, childLinkLabel:childLink}, accordion→{label:trigger}, dropdown→{itemLabel:item};
  modal/table→{}).
- Assert per component: the set of `inherited` slots === keys of `EXPECTED_INHERITED[comp]`, and each
  inherited slot's `inheritsFrom` matches AND is itself a member of `nuxtSlotsFor(comp)` (valid parent).
- Update the shape test: valid classification ∈ `["structural","optional","inherited"]`; an
  `inherited` slot has a non-empty `inheritsFrom`, a non-inherited slot has none.
- `EXPECTED_STRUCTURAL` is unchanged (structural sets don't move).

### 3. Coverage engine — `src/coverage.ts`

```ts
export interface SlotCoverage {
  slot: string;
  classification: SlotClassification;
  controls: string;
  touched: boolean;
  tokenIds: readonly string[];
  /** Parent slot, for inherited slots (mirrors the anatomy). */
  inheritsFrom?: string;
}
```

In `coverageFor`, after building `tokensBySlot`:
- `directlyTouched(slot) = tokensBySlot.has(slot)`.
- For an inherited slot, `touched = directlyTouched(slot) || (inheritsFrom != null && directlyTouched(inheritsFrom))`.
  (Structural/optional slots keep `touched = directlyTouched(slot)`.)
- Carry `inheritsFrom` onto the `SlotCoverage`.
- **`toDesign` excludes `inherited`**: `slots.filter((s) => !s.touched && s.classification !== "inherited")`.
- Structural counts unchanged (count only `classification === "structural"`).
- `tokenIds` unchanged (an inherited slot's own routed tokens, normally empty → it stays a non-clickable
  row, so the v0.30.0 click-to-highlight behaviour is unaffected).

### 4. CoverageView — `src/app/components/CoverageView.vue`

A third section **"Inherited · follows another slot"** rendered last (least actionable). Each row:
- marker `✓` when `touched` (parent designed) else `↳`;
- slot name + `controls`;
- a trailing `inherits <inheritsFrom>` tag.
The 4 slots leave the Optional section (they're now `classification === "inherited"`). Computed:
`inherited = slots.filter((s) => s.classification === "inherited")`. Inherited rows are not buttons
(no own tokens), consistent with the existing "covered rows with tokens are clickable" rule.

## Out of scope

Per-slot depth (how completely a slot is styled), auto-detected inheritance, inheritance chains deeper
than one parent, and inherited slots for the simple (non-curated) components.

## Testing

- **`component-anatomy.test.ts`** — `EXPECTED_INHERITED` set + `inheritsFrom` validity + updated shape test.
- **`src/coverage.test.ts`** — an inherited slot is `touched` when its parent is touched (and `false`
  when neither it nor its parent is); an inherited slot never appears in `toDesign`; `inheritsFrom` is
  carried through.
- **`src/app/components/CoverageView.test.ts`** — the Inherited section renders the inherited slots with
  the `inherits <parent>` tag and a `✓`/`↳` marker tracking the parent; they no longer appear under
  Optional.

## Success criteria

- The 4 slots are classified `inherited` with a valid `inheritsFrom`; structural/optional sets otherwise
  unchanged.
- An inherited slot shows covered (✓) iff its parent is designed; never in the to-design list.
- A third "Inherited" section renders in the coverage view.
- New + existing suites green.

## Release

Minor **v0.31.0** — user-facing third coverage classification + section. CHANGELOG `### Added`;
README test-count bump (and a one-line note in the Coverage Guide bullet that slots split three ways).
