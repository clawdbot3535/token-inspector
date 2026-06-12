# Typo / Did-You-Mean Detector — Design

**Date:** 2026-06-12
**Status:** Approved (direction + frequency-guard refinement)
**Feature:** A scanner pass that flags token-id segments that look like misspellings
of known grammar vocabulary, with a "did you mean `X`?" suggestion.

## Problem

Designers hand-name tokens in Figma. A misspelled segment makes a token silently
fall to NULL during slot mapping (or, for non-component tokens, emit a CSS var
under a wrong name) with no signal. The 2026-06-12 / 914-token export contains a
confirmed instance:

- `typography-heading-2-line-heigth` — `heigth` is a transposition typo of
  `height`. The token's sibling headings use `line-height`; this one diverges
  silently.

A second, structurally different data bug exists (`textarea-ring-width 2` — a
duplicate key with a trailing space + counter, a Figma auto-dedup artifact). That
is **out of scope** here: it is not a spelling typo. It belongs to
`duplicate-id` / a future "whitespace-in-segment" check.

## Goal

Surface probable spelling typos in token-id segments as a new `ScanIssue`
(`kind: "possible-typo"`), so they appear in both the CLI digest and the web
ScanView, each with a concrete correction suggestion.

Success criteria:
- `typography-heading-2-line-heigth` produces exactly one `possible-typo` issue
  suggesting `height`.
- `typography-heading-1..6` (where `heading` collides with `leading` at Damerau
  distance 1) produce **zero** false positives.
- Correctly-spelled tokens, short segments, and numeric segments produce nothing.

## Non-goals

- Structural/duplicate-key bugs (`ring-width 2`) — separate concern.
- Misspelled slot/part names — already covered by `unsupported-part` +
  `component-looks-custom` (with `FIGMA_NUXT_PART_ALIAS` rename hints). Including
  them here would double-report.
- Misspelled component names (whole-prefix divergence) — rare; deferred.
- Size keys (`xs`/`sm`/`md`/…) as targets — too short, collision-prone.
- Any UI work — the report types and renderers already handle arbitrary kinds.

## Approach

A graph-wide pass over every token id, splitting on `-`. Each segment is checked
against the grammar's **value-bearing vocabulary** using Damerau-Levenshtein
distance. The core risk — a legitimate domain word (`heading`) sitting one edit
from a value word (`leading`) — is handled by a **frequency guard**: real
vocabulary recurs across many tokens, typos are one-offs.

### Reference vocabulary (suggestion targets)

`TARGETS = (NON_PART_SEGMENTS ∪ KNOWN_VARIANT_NAMES)` filtered to length ≥ 4.

- `NON_PART_SEGMENTS` — property/dimension/utility words: `height`, `width`,
  `radius`, `weight`, `family`, `leading`, `tracking`, `spacing`, `padding`,
  `offset`, `color`, `border`, `placeholder`, `underline`, `stroke`, `shadow`,
  `overlay`, `resize`, etc. (already includes `STATE_KEYS` + `selected`/`visited`).
- `KNOWN_VARIANT_NAMES` — `solid`/`outline`/`ghost`/`link`/`subtle`/`soft`
  + color roles `primary`/`secondary`/`success`/`error`/`warning`/`info`/
  `neutral`/`accent`/`default`.

Length ≥ 4 drops noisy short targets (`bg`, `gap`, `min`, `max`).

### Skip set (segments never flagged)

A candidate segment is skipped — treated as legitimate — when **any** holds:

1. **Length < 4** (too short to reason about reliably).
2. **Numeric** (`/^\d+$/`, e.g. `2`, `500`).
3. **Already known vocabulary** — segment ∈ `TARGETS` ∪ `SIZE_KEYS` ∪ all
   `NUXT_SLOTS` values ∪ the component allow-list names. (A legit `height`, `md`,
   `label`, `button` is never a typo.)
4. **Frequency ≥ `INTENTIONAL_FREQ` (= 3)** — the segment appears on 3+ distinct
   tokens, so it is intentional vocabulary (e.g. `heading`, `body`, `caption`,
   `container`, `section`), not a one-off typo.

Rule 4 is the keystone: it removes the need for a hand-maintained typography /
layout word list and self-adapts to whatever the export contains.

**Accepted tradeoff:** a *systematic* misspelling repeated on ≥ 3 tokens is not
flagged. This is intentional — a consistent (even if "wrong") name still emits a
consistent value; the high-value catch is the *inconsistent* one-off that
diverges from its siblings.

### Matching

For a surviving candidate segment, compute Damerau-Levenshtein distance to every
target. Damerau (not plain Levenshtein) is required so that a transposition
(`heigth` ↔ `height`, `widht` ↔ `width`) counts as distance **1**.

- Max distance: `seg.length >= 7 ? 2 : 1`.
- Flag only when the nearest target is **unique** at the minimum distance (a tie
  → ambiguous → no suggestion).

### Output

One `ScanIssue` per distinct `(segment → suggestion)` pair, aggregating all
affected token ids:

```ts
{
  id: `typo-${segment}-${suggestion}`,
  category: "data-quality",
  severity: "warning",
  kind: "possible-typo",
  message: "`heigth` looks like a typo of `height` — did you mean " +
           "`typography-heading-2-line-height`? (1 token)",
  tokenIds: ["typography-heading-2-line-heigth"],
}
```

If the corrected id (segment replaced by suggestion) already exists in
`graph.nodes`, the message is strengthened (the rename target demonstrably
exists, so it is almost certainly a typo). This is a message refinement, not a
gate.

## Module layout

Clean split along the existing seam (vocabulary lives in the grammar package; the
scanner owns graph traversal and issue emission):

- **`packages/grammar/src/typo-detect.ts`** (new) — pure, dependency-light:
  - `export function damerauLevenshtein(a: string, b: string): number`
  - `export interface VocabSuggestion { word: string; distance: number }`
  - `export function suggestVocabWord(segment: string, maxDistance?: number):
    VocabSuggestion | null` — returns the unique nearest value-word within
    `maxDistance`, or `null` if the segment is itself known vocab, no match is in
    range, or the nearest match is ambiguous. Assembles `TARGETS` from
    `component-vocab.ts`. Exported from the package `index.ts`.
- **`src/scanner.ts`** — `export function detectPossibleTypos(graph: TokenGraph):
  ScanIssue[]`, mirroring the existing exported `detectAsymmetricVariantCoverage`.
  Builds the segment-frequency map, applies the skip rules (incl. frequency),
  calls `suggestVocabWord`, aggregates, and emits. Called from `scanGraph` and
  spread into the issues list.

No changes to `token-graph.ts` types (`kind` is an open `string`), `build-cli.ts`
(prints `[kind] message` grouped by severity — warnings printed in full), or
`ScanView.vue` (filters generically by severity; no per-kind allowlist). During
implementation, confirm no hidden per-kind label map would suppress the new kind.

## Constants

```ts
const MIN_SEGMENT_LEN = 4;
const INTENTIONAL_FREQ = 3;   // segment on ≥3 tokens ⇒ intentional vocabulary
// max distance scales with length: len >= 7 ? 2 : 1
```

## Testing (TDD)

**`packages/grammar` — `typo-detect.test.ts`:**
- `damerauLevenshtein`: equality = 0; single insertion / deletion / substitution
  = 1; **transposition** (`height`↔`heigth`) = 1; far strings = large.
- `suggestVocabWord`: `heigth`→`height`, `widht`→`width`, `eror`→`error`,
  `outilne`→`outline`, `succss`→`success`; returns `null` for an exact vocab word
  (`height`), an out-of-range word (`foobar`), and an ambiguous tie.

**`src/scanner.test.ts` — `detectPossibleTypos` describe block** (uses existing
`makeNode`/`makeGraph` helpers):
- `typography-heading-2-line-heigth` (freq 1) ⇒ exactly one `possible-typo`
  suggesting `height`, severity `warning`, category `data-quality`.
- `typography-heading-1..6-line-height` present (so `heading` freq ≥ 3) ⇒ **no**
  `heading → leading` false positive.
- Correctly-spelled graph ⇒ no `possible-typo` issues.
- Numeric (`2`) and short (`bg`, `md`) segments ⇒ ignored.
- Ambiguous tie ⇒ ignored.
- (Integration) `scanGraph` output includes the `possible-typo` issues.

Coverage target ≥ 80% on both new modules.

## Out-of-scope follow-ups (noted, not built)

- `ring-width 2` whitespace/duplicate-key bug → verify `duplicate-id` behavior or
  add a small "whitespace-in-segment" data-quality check.
- Distance-2 tuning / per-target weighting if real-world FP/FN data warrants.
- Slot/component-name typo coverage if demand appears.
