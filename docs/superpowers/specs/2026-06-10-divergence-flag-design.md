# Design: `component-looks-custom` divergence flag (rebuild)

- **Date:** 2026-06-10
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/divergence-flag-rebuild` (off `main`)
- **Theme:** a conservative, part-based component-level scan hint that flags a Figma component as
  genuinely divergent from its Nuxt UI counterpart (→ emit as `custom/<name>`, Stage C) — replacing
  the parked share-based heuristic (`dd8971f`) that over-fired.

## Problem / goal

The parked flag scored divergence by **unmapped-token share**. Measured on the real export, that
over-fires badly: `checkbox` 41%, `radio` 44%, `chip` 45%, `switch` 31%, `progress` 33% unmapped —
all standard Nuxt components whose unmapped tokens come from KNOWN gaps (check/dot naming, the
color/size grammar, validation-via-prop), not from divergence. Share is the wrong signal.

The right signal is **genuinely foreign parts**: a Figma part-segment that is (a) not a Nuxt slot
for that component, (b) not a `NON_PART_SEGMENT` (utility/state/dimension word), and (c) not in
`FIGMA_NUXT_PART_ALIAS` (so not a rename-able typo, but truly foreign). Measured on the real export,
exactly ONE component has such parts: `chip` (`label`, `close`). Nuxt UI's Chip is a small overlay
dot, not a closable tag — so `label`/`close` are real custom parts. The flag should fire on `chip`
and nothing else.

Success criteria:
- A new `component-looks-custom` scan hint fires for a component with ≥1 genuinely-foreign part,
  naming the parts + recommending the `custom/<name>` layer (Stage C). Severity `hint`.
- On the real export it fires for `chip` only; `checkbox`/`radio`/`switch`/`progress`/etc. (high
  unmapped share, but no foreign parts) do NOT fire.
- Built on the existing `unsupported-part` data (same `nullTokensByComponent` + filters); no new
  inventory. Full suite + typecheck green.

## Decisions

- **Part-based, not share-based.** Drop the share heuristic entirely (the parked branch's approach
  is not reused). The signal is the count of non-aliasable foreign parts.
- **≥1 foreign part fires** (hint severity). Even one genuinely-foreign, non-aliasable part is
  enough; naming the specific parts keeps a stray inventory-gap false positive harmless and
  actionable (the user sees exactly which part and judges).
- **Non-aliasable only.** A foreign part WITH a `FIGMA_NUXT_PART_ALIAS` entry (`check`→`icon`,
  `dot`→`indicator`, `row`→`tr`, `divider`→`separator`) is a rename candidate, NOT a custom signal —
  `unsupported-part` already handles it. `component-looks-custom` counts only parts with no alias.
- **Complement, not duplicate, `unsupported-part`.** Per-part: "rename `label`?" (well — `label`
  has no alias, so unsupported-part says "no Nuxt slot for it"). Component rollup: "`chip` has
  foreign parts `label`, `close` → likely a custom component; consider emitting it standalone."
  Both can show; they offer the two real choices (conform vs accept-as-custom).
- **Detector only.** Emitting `custom/<name>` recipes is Stage C — out of scope. This cycle is the
  flag that tells you which components Stage C will target.

## Design

### `src/scanner.ts` — new `component-looks-custom` rollup
Reuse the data the `unsupported-part` pass already builds: `nullTokensByComponent` (component →
`{seg, id}[]`), `mappedSecondSegByComponent`, `nuxtSlotsFor`, `NON_PART_SEGMENTS`,
`FIGMA_NUXT_PART_ALIAS`. After the `unsupported-part` loop, run a per-component rollup:

```
for (const [comp, nullToks] of nullTokensByComponent) {
  const slots = nuxtSlotsFor(comp);
  if (!slots) continue;                       // unknown component → skip
  const mapped = mappedSecondSegByComponent.get(comp) ?? new Set();
  const foreign = new Map<string, string[]>();  // part → token ids, non-aliasable only
  for (const { seg, id } of nullToks) {
    if (mapped.has(seg) || slots.has(seg) || NON_PART_SEGMENTS.has(seg)) continue;
    if (FIGMA_NUXT_PART_ALIAS.has(seg)) continue;   // rename candidate, not custom
    (foreign.get(seg) ?? foreign.set(seg, []).get(seg)!).push(id);
  }
  if (foreign.size >= 1) {
    const parts = [...foreign.keys()];
    issues.push({
      id: `clc-${comp}`,
      category: "classification-hint",
      severity: "hint",
      kind: "component-looks-custom",
      message:
        `\`${comp}\` has ${parts.length} part${parts.length > 1 ? "s" : ""} with no Nuxt UI ` +
        `\`${comp}\` slot and no rename match (${parts.join(", ")}). It is likely a custom ` +
        `component — consider emitting it as \`custom/${comp}\` rather than \`ui.${comp}\`.`,
      tokenIds: [...foreign.values()].flat(),
      componentName: comp,
    });
  }
}
```
(Adapt to the exact local names/types in `scanner.ts`; the `foreign.get ?? set` idiom should be
written cleanly. `kind` is added to the `ScanIssue` kind union in `token-graph.ts`.)

### Tests (`src/scanner.test.ts`)
- A graph with a foreign part (e.g. `chip-close-bg`, where `close` ∉ chip slots / NON_PART / alias)
  → a `component-looks-custom` issue for `chip` naming `close`, with the token id.
- An aliasable mismatch only (e.g. a `radio-dot-*` token, `dot` ∈ FIGMA_NUXT_PART_ALIAS) → NO
  `component-looks-custom` (only `unsupported-part` with the rename). 
- A fully-mapped component → no `component-looks-custom`.

### Verification
- `npm run typecheck && npx vitest run` green.
- Real-export probe (`npm run build:tokens` or a tsx scan): `component-looks-custom` fires for
  `chip` (parts `label`, `close`) and NO other component. Report the exact fired set.
- Headless: load the export, open ScanView → the `chip` hint appears among the classification
  hints; checkbox/radio/switch do NOT carry it. Screenshot.

## Out of scope
- Stage C (`custom/<name>` recipe emission); a "custom" badge in the component tree; tuning beyond
  the ≥1-foreign-part rule; revisiting `NUXT_SLOTS` completeness (if a thin inventory yields a
  false foreign part, the hint names it and the inventory is fixed separately).

## Risks
- **`NUXT_SLOTS` incompleteness → false positive.** If a component's inventory is missing a real
  Nuxt slot, that slot's tokens look foreign and the component falsely flags. Mitigated: the hint
  NAMES the parts (so a false positive is obvious + points at the inventory gap), severity is
  `hint` (advisory), and the measured real-export result is clean (chip only). Accept + monitor.
- **Double-signal with `unsupported-part`.** Intentional and complementary (conform vs custom); not
  a bug. Both are hints.
