# Design: capability-deviation detectors (disabled-via-opacity + resting-shadowed-by-state)

- **Date:** 2026-06-19
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/capability-deviation-detectors` (target release v0.48.0 — additive feature)
- **Origin:** the Real-tab fidelity sweep + /investigate of the genuine state-color deltas
  (memory `real-render-fidelity-tab`, `nuxt-state-variant-capability-deviation`). After the box-shadow
  tooling noise was removed (v0.47.1/.2), the remaining state-color deltas were traced to two
  **Nuxt-UI-wins mechanisms** where the recipe is faithful but Nuxt UI's own styling shadows it. These
  detectors surface those mechanisms as named scan warnings (siblings to `state-via-prop` /
  `unsupported-state`).

## Problem / goal

The scanner already flags capability deviations where a token **fails to map** (`state-via-prop`,
`unsupported-state`, both fired when `getSlotMapping === null`). But two deviations occur where the
token **maps fine** yet Nuxt UI shadows its effect, so they're invisible in the scan and only show as
silent ✗ in the Real tab:

1. **disabled-via-opacity:** Nuxt UI v4 dims form-control `disabled` state via `disabled:opacity-*`,
   not colour. A `disabled` colour token maps to `disabled:bg/text-[…]` but never visibly applies.
2. **resting-shadowed-by-state:** Nuxt UI v4's switch drives its resting track colour via
   `data-[state=unchecked]:bg-accented` (a data-attribute variant, specificity 0,1,1). The recipe's
   resting colour is a plain utility (0,1,0), so Nuxt out-specifies it when unchecked.

Goal: emit a `classification-hint`/`warning` for each, explaining *why* a faithful token won't render —
turning the silent Real-tab ✗ into actionable scan output. Scan-only; no recipe/output change.

## Decisions

- **Capability lives in `@tg/grammar`, detection in the scanner** — the same split every existing
  detector uses (`STATELESS_COMPONENTS` / `PROP_DRIVEN_STATES` / `RING_FRAMED_VARIANTS` in
  `component-vocab.ts`; the dispatch in `scanner.ts`).
- **Fire in the non-null mapping branch** (`scanner.ts` ~line 204+, where the D2c unframed-border
  detector already lives) — these tokens map successfully; the deviation is what Nuxt does with them.
- **Per-token issues** (consistent with `state-via-prop` / `unsupported-state`), not grouped. The
  disabled-colour tokens per component are few (1–3), so per-token is not noisy and matches the
  sibling detectors.
- **New `ScanIssue.kind` strings** (`disabled-via-opacity`, `resting-shadowed-by-state`). `kind` is an
  open `string` (token-graph.ts) — no type change.
- **Conservative, verified capability sets** — seed only components we can verify; the plan verifies
  against Nuxt UI v4's actual themes so we never mis-flag.

## Design

### `@tg/grammar` `src/component-vocab.ts` — two new exported sets
```ts
/** Components whose `disabled` state Nuxt UI v4 dims via opacity (not colour) — so a
 *  `disabled` COLOUR token maps to `disabled:bg/text-[…]` but never visibly applies. */
export const OPACITY_DISABLED_COMPONENTS: ReadonlySet<string> = new Set([
  "input", "textarea", "checkbox", "radio", "switch",
]);

/** Components whose RESTING colour Nuxt UI v4 drives via a `data-[state=…]` variant
 *  (higher specificity than a plain utility), so the recipe's plain resting colour is
 *  out-specified. (switch: `data-[state=unchecked]:bg-accented` on the track/base slot.) */
export const RESTING_STATE_SHADOWED: ReadonlySet<string> = new Set(["switch"]);
```
(`input`/`checkbox`/`switch` are confirmed by the Real-tab deltas; `textarea`/`radio` are the same
Nuxt component families — Task 0 of the plan verifies all five, and checks `button`/`select`, against
Nuxt UI v4 theme source before locking the set.)

### `src/scanner.ts` — two detectors in the non-null mapping branch
A `COLOR_UTILITIES = new Set(["bg-color", "text-color", "border-color", "ring-color"])` helper, then,
after a non-null `mapping` is obtained (~line 204, alongside the existing `filledSlots` / D2c logic):

**Detector A — disabled-via-opacity:**
```ts
if (
  OPACITY_DISABLED_COMPONENTS.has(prefix) &&
  mapping.statePrefix === "disabled" &&
  COLOR_UTILITIES.has(mapping.utilityType)
) {
  issues.push({
    id: `dvo-${node.id}`,
    category: "classification-hint",
    severity: "warning",
    kind: "disabled-via-opacity",
    message:
      `\`${node.id}\` sets a \`disabled\` colour, but Nuxt UI v4 dims \`${prefix}\`'s disabled ` +
      `state via opacity (not colour) — the override is emitted but won't visibly apply.`,
    tokenIds: [node.id],
    componentName: prefix,
  });
}
```

**Detector B — resting-shadowed-by-state:**
```ts
if (
  RESTING_STATE_SHADOWED.has(prefix) &&
  !mapping.statePrefix &&
  mapping.utilityType === "bg-color" &&
  mapping.slot === "base"
) {
  issues.push({
    id: `rss-${node.id}`,
    category: "classification-hint",
    severity: "warning",
    kind: "resting-shadowed-by-state",
    message:
      `\`${node.id}\` sets \`${prefix}\`'s resting track colour as a plain utility, but Nuxt UI v4 ` +
      `drives it via \`data-[state=unchecked]:\` (higher specificity) — the resting override is ` +
      `out-specified at rest.`,
    tokenIds: [node.id],
    componentName: prefix,
  });
}
```
Both import `OPACITY_DISABLED_COMPONENTS` / `RESTING_STATE_SHADOWED` from `@tg/grammar` (added to the
existing import). `mapping.statePrefix` for a `disabled` token is `"disabled"` (verified in the recipe
output: `disabled:bg-[…]`); a resting token has no `statePrefix`.

### Why scanner, not recipe
These are diagnostics, not output changes. The recipe still emits the tokens faithfully (the design
intent); the scan now explains why two classes of them won't render in the real Nuxt UI component.

## Tests
- `packages/grammar/src/component-vocab.test.ts`: assert both sets contain the expected members
  (`input`/`checkbox`/`switch` in OPACITY_DISABLED; `switch` in RESTING_STATE_SHADOWED) and that a
  non-form-control (e.g. `nav`) is absent.
- `src/scanner.test.ts` (build graphs via `buildGraph`, like the existing detector tests):
  - **A fires:** `input-bg-disabled` (a disabled colour) on `input` → one `disabled-via-opacity`
    warning with `componentName: "input"`.
  - **A does NOT fire:** a `disabled` colour on a component NOT in the set (e.g. `nav-link-bg-disabled`
    if nav isn't in the set), and a NON-disabled `input` colour (`input-bg`), and a non-colour disabled
    token (e.g. `input-radius-disabled` if one exists / a width).
  - **B fires:** `switch-bg` (resting, base, bg-color) → one `resting-shadowed-by-state` warning.
  - **B does NOT fire:** `switch-bg-checked` (has a state) and `switch-thumb-…` (not the base slot).
- A probe/CLI check over the live export (`assets/tokens-20260619-214856.zip`): the new warnings
  appear for the expected tokens and nowhere unexpected.

## Out of scope
- **Recipe/output changes** — none; scan-only. The recipe keeps emitting the tokens.
- **UI work** — the new kinds render through the existing scan-issue list (no component change).
- **Auto-fixing / suppressing the tokens** — we explain, we don't silence (the design intent is real).
- **Other capability mechanisms** beyond these two (e.g. prop-driven colour on other components) —
  separate increments if they surface.

## Risks
- **Wrong capability set → mis-flag.** Mitigated: seed only delta-confirmed + same-family components;
  Task 0 verifies against Nuxt UI v4 theme source before the set is locked; conservative membership
  (exclude unverified `button`/`select` until checked).
- **`statePrefix` shape.** The detector keys on `mapping.statePrefix === "disabled"` and the
  falsy-resting check; the plan confirms the exact `statePrefix` value `getSlotMapping` returns for a
  disabled token and a resting token before wiring the conditions.
- **`mapping.slot === "base"` for switch track.** Confirmed via the recipe (switch track = `base`
  slot); the plan re-confirms with a probe.
