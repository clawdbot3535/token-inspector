# Data-Quality owner v2 — malformed-value hint — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — Data-Quality owner v2

## Summary

The Data-Quality owner (v0.54.4) currently claims only `possible-typo` (the 💡 rename
hint). The other data-quality deviation, `malformed-value`, is emitted by the graph
builder when a token's `$value` is malformed (a color `$value` that is not a Figma
`{components, hex}` object; a number/dimension `$value` that is not a number). It
already appears in the scan report — converted 1:1 from a `GraphIssue` to a `ScanIssue`
with `category: "build-time"`, `severity: "error"` — but is unowned ("Other") and shows
as a plain error row.

This v2 routes `malformed-value` to the **Data-Quality owner** and gives it an advisory
hint in the Scan view explaining what is malformed + the expected shape, so the designer
knows to fix the `$value` in the Figma source. Advisory, source-side — no copy (there is
no single corrected value), no severity change (a malformed value genuinely breaks
rendering, so it stays an error; owner is orthogonal to severity).

## Scope

- Add `malformed-value` to `DATA_QUALITY_KINDS` so `ownerOf(issue)` returns `"data-quality"`
  for it (the owner filter buckets it under Data-Quality instead of Other).
- Add a Scan-view advisory hint for malformed-value issues — a generic, type-agnostic
  text (no copy).

### Non-goals

- **No severity/category reclassification.** malformed-value stays `severity: "error"`,
  `category: "build-time"`. Owner ≠ severity.
- **No structured per-type hint.** Threading `malformedType`/`malformedValue` from the
  `GraphIssue` through the scanner to the `ScanIssue` for a per-type message is v2.
- **No copy button** (unlike the typo hint — there is no concrete corrected value).
- No build-graph / scanner / `ScanIssue`-type / recipe-engine / export change.
- The hint is generic (one text for all malformed types); the existing `issue.message`
  (`malformed-value for <id> (type=color)`) is unchanged.

## Architecture

### Changed — `src/app/resolve/owner-of.ts`

One line — add the kind to the Data-Quality set:

```ts
const DATA_QUALITY_KINDS: ReadonlySet<string> = new Set(["possible-typo", "malformed-value"]);
```

`ownerOf(malformed-value issue)` now returns `"data-quality"`. Consequences: the owner
filter buckets it under Data-Quality; Data-Quality has no static badge (it uses
interactive hints), so no badge renders; the by-design accept guard (`ownerOf ===
"by-design"`) is unaffected.

### Changed — `src/app/components/ScanView.vue`

Add a sibling hint span next to the existing typo-hint, gated on the kind:

```html
<span
  v-if="ownerOf(issue) === 'data-quality' && issue.kind === 'malformed-value'"
  class="ml-2 inline-flex items-center gap-1 text-[10px] text-sky-700 dark:text-sky-300"
  data-testid="malformed-hint"
  title="A color $value must be a Figma {components, hex} object; a number/dimension $value must be a number."
>🛠 fix the $value in the Figma source</span>
```

- Mutually exclusive with the typo hint: the typo gate requires `issue.typoTo`; the
  malformed gate requires `issue.kind === 'malformed-value'`. A possible-typo issue has
  `typoTo` (not the malformed kind); a malformed-value issue has the kind (not `typoTo`).
- Sky colour matches the typo hint (same owner). No Copy button.
- The severity tag still shows `error` (red); the hint says *who/how to fix*, the tag
  says *how bad*.

## Data flow

None new. `ownerOf` is a pure function over `issue.kind`; the hint is gated on `kind`.
The graph builder, scanner pipeline, and `ScanIssue` shape are untouched — malformed-value
already reaches the report; this only reframes it (owner + hint).

## Invariants & edge cases

- malformed-value's `issue.id` is `bt-malformed-value-<nodeId>-<n>` (build-time
  converted); the hint keys off `kind`, not id, so it is robust.
- Adding malformed-value to `DATA_QUALITY_KINDS` makes `ownerOf` return data-quality;
  no existing test asserts malformed-value → "Other"/null, so nothing breaks.
- The typo-hint gate is unaffected (malformed-value has no `typoTo`).

## Testing

- **`src/app/resolve/owner-of.test.ts`** (extend) — `ownerOf` of a `malformed-value`
  issue returns `"data-quality"`; `DATA_QUALITY_KINDS` contains both `possible-typo` and
  `malformed-value`.
- **New** `src/app/components/ScanView.malformed.test.ts` — a `malformed-value` issue
  (category `build-time`, severity `error`) renders `[data-testid=malformed-hint]`; a
  `possible-typo` issue does NOT render the malformed hint (it renders the typo hint); a
  non-data-quality issue renders neither.

## Verification caveat

Like the typo hint, malformed-value only appears when an export carries a malformed
`$value` — the default sample export may be clean, so live verification may need a
malformed-bearing export.

## Deliberately out of scope (parked)

- v2 structured per-type hint (`malformedType` + `malformedValue` threaded through the
  GraphIssue → scanner → ScanIssue pipeline, for a precise "color $value must be
  {components, hex}; got X" message).
- The other un-owned data-quality-ish kinds (`duplicate-id`, `unknown-type`, the
  semantic-mode kinds) — separate routing decisions.
