# Figma-Fix v2 — Copy-able "tokens to add" list — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — Figma-Fix owner v2

## Summary

The Figma-Fix owner (v0.54.6) flags coverage-gap deviations with an advisory `🎨 fix in
Figma` badge. One of its kinds, `asymmetric-variant-coverage`, already computes the
*exact token names a designer should add in Figma* (e.g. `button-outline-border`,
`button-ghost-border`) — but only embeds them in the issue's message string.

This v2 lifts that list onto the `ScanIssue` as a structured field (`figmaFixTokens`,
mirroring how `possible-typo` carries `typoFrom`/`typoTo`) and surfaces a compact
**📋 Copy N tokens** button in the Scan view, so the designer can copy the list to the
clipboard instead of hand-retyping it from the message.

Only `asymmetric-variant-coverage` is in scope — it is the only coverage-gap kind that
produces a clean list of full token names. The other four keep just the badge.

## Scope

- `asymmetric-variant-coverage` issues carry a new `figmaFixTokens: readonly string[]`
  field (the exact token names to add in Figma).
- The Scan view renders a `📋 Copy N tokens` button for any issue with
  `figmaFixTokens?.length`; clicking copies the newline-joined list to the clipboard.

### Non-goals

- **Message text unchanged.** The `figmaFixTokens` field is additive; the issue's
  `message` string stays byte-identical (the existing scanner test for the message stays
  green).
- **Only `asymmetric-variant-coverage`** gets the field. The other coverage-gap kinds
  (`asymmetric-size-coverage`, `incomplete-size-variant`, `non-suffix-vs-size-conflict`,
  `orphaned-size-key`) are unchanged — they have no clean "tokens to add" list.
- No inline list dump (the token names are already in the message; the button only adds
  the one-click copy).
- No owner / badge / filter change. No new owner.

## Architecture

### Changed — `src/token-graph.ts`

Add an optional field to the `ScanIssue` interface (alongside `typoFrom`/`typoTo`):

```ts
/** For asymmetric-variant-coverage: the exact token names to add in Figma. */
figmaFixTokens?: readonly string[];
```

### Changed — `src/scanner.ts` (the `asymmetric-variant-coverage` emit, ~line 864)

The token list is currently computed inline inside the message template:
`missing.map((v) => \`\\\`${prefix}-${v}-${utilityDisplay}\\\`\`)`. Extract the raw
names once and attach them to the issue, keeping the message byte-identical:

```ts
const tokensToAdd = missing.map((v) => `${prefix}-${v}-${utilityDisplay}`);
// message: ...Add ${tokensToAdd.map((t) => `\`${t}\``).join(", ")} in Figma if the gap is unintentional.
// (same rendered string as before — each name wrapped in markdown backticks)
issues.push({
  // …unchanged id/category/severity/kind/message/tokenIds/componentName…
  figmaFixTokens: tokensToAdd,
});
```

`tokensToAdd` holds the RAW names (no backticks); the message keeps wrapping each in
backticks so its text is unchanged.

### Changed — `src/app/components/ScanView.vue`

- Add a `copyFigmaTokens(issue)` handler (parallel to the existing `copyRename`):
  `await navigator.clipboard?.writeText(issue.figmaFixTokens!.join("\n"))`, wrapped in
  try/catch that silently no-ops (the tokens remain visible in the message).
- Render a compact button for issues with `figmaFixTokens?.length`, near the 🎨 badge,
  with `data-testid="figma-fix-copy"` and label `📋 Copy {{ issue.figmaFixTokens.length }} tokens`,
  `@click.stop="copyFigmaTokens(issue)"`. Styled like the existing typo `[Copy]` affordance.

## Data flow

The scanner already computes the list; v2 attaches it structurally. ScanView reads it
and copies it (newline-joined, so it pastes as a list). No new state, no `App.vue`
change, no emit.

## Invariants & edge cases

- Only `asymmetric-variant-coverage` sets `figmaFixTokens`, so the Copy button appears
  only there; the other four coverage-gap kinds (and all non-figma-fix issues) have no
  `figmaFixTokens` → no button.
- `figmaFixTokens` is always non-empty when set (the emit only fires when `missing.length
  > 0`), but the ScanView gate (`figmaFixTokens?.length`) is defensive anyway.
- Clipboard unavailable → silent no-op (the names are in the message).

## Testing

- **Scanner** (`src/scanner.test.ts`): the existing `asymmetric-variant-coverage` test
  additionally asserts `figmaFixTokens` equals the expected token-name array; assert the
  `message` is unchanged (byte-identical) for that fixture.
- **ScanView** (`src/app/components/ScanView.figmacopy.test.ts`): an issue with
  `figmaFixTokens` renders the `figma-fix-copy` button; clicking it calls
  `navigator.clipboard.writeText` with the `\n`-joined list (clipboard mock as in
  `ScanView.typo.test.ts`); a figma-fix issue WITHOUT `figmaFixTokens` (e.g.
  `orphaned-size-key`) has no Copy button.

## Deliberately out of scope (parked)

- Copy lists for the other coverage-gap kinds (no clean token list).
- An in-app "create these in Figma" automation (the inspector can't write Figma).
- Restyling or relocating the 🎨 badge.
