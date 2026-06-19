# Design: actionable `unresolved-alias` diagnostic (grouped + library hint)

- **Date:** 2026-06-19
- **Status:** DRAFT (awaiting user review)
- **Branch:** `feat/unresolved-alias-diagnostic` (target release v0.47.0)
- **Origin:** /investigate of the `unresolved alias: color/white/alpha/…` scanner errors at full-export
  load. Root cause confirmed: the resolver is correct (index keys `build-graph.ts:193` + lookup `:234`
  both use `applyNameFixes(...toLowerCase())` slash-form; `exact-key-match-but-unresolved = 0`). The
  alias targets are simply absent from every loaded source — most likely library/remote variables the
  exporter (`figma-token-export`, local-variables-only) records as `aliasData` targets but never exports
  as tokens (red/amber/green alpha are local → resolve; white/black alpha are not). See memory
  `unresolved-alias-queued.md`.

## Problem / goal

The `unresolved-alias` warnings are CORRECT — they flag aliases pointing at targets absent from all
loaded sources. But today they are (a) **noisy** (one error per dangling alias — 6 on the live export)
and (b) **unactionable** (the message `unresolved alias: color/white/alpha/500-8` says nothing about
*why* or *what to do*). The goal is to make the diagnostic actionable WITHOUT silencing it: group the
errors by missing target-family and explain the likely cause.

Success criteria:
- On the live export, the 6 per-alias `unresolved-alias` errors collapse into **2 grouped issues**
  (`color/white/alpha/*` ×4, `color/black/alpha/*` ×2), each naming the missing leaves and carrying a
  cause hint.
- The grouped issue lists the aliasing tokens (so the UI highlights the tokens that hold the dangling
  references) and stays severity `error` (genuine unresolved references — de-noised, not hidden).
- Other build-time issue kinds (`duplicate-id`, `unknown-type`, `malformed-value`) are unchanged (still
  1:1). No silencing, no severity downgrade, no resolver change.
- Full suite + typecheck green.

## Decisions

- **Enhance at the scanner seam, not the graph builder.** `scanner.ts` is the diagnostic aggregator
  (`scanGraph`, header comment "data-quality + classification-hint + build-time issues"). The grouping
  + hint live there. `build-graph.ts` stays the pure graph builder.
- **Carry the alias target as structured data, not parsed text.** `GraphIssue` gains an optional
  `target?: string`. `build-graph.ts` sets it to `aliasAttempt.rawTarget` when emitting an
  `unresolved-alias`. This removes the alternative — `message.replace("unresolved alias: ", "")` — which
  would couple the scanner to build-graph's exact wording. The `message` is unchanged for the
  graph-issue path.
- **Group by target-family = the target minus its last segment.** `color/white/alpha/500-8` →
  family `color/white/alpha`. A target with no `/` is its own family (group of one). Grouping is over
  the `unresolved-alias` issues only.
- **Severity stays `error`; cause hint is neutral-with-library-lean.** The hint commits to the most
  likely cause but stays honest: "Likely library/remote variables not included by the local-only
  export … or dangling references." It does not assert "library" as fact (we cannot tell library from a
  genuinely-missing/typo'd target without near-match detection, which is explicitly out of scope).

## Design

### `src/token-graph.ts` — `GraphIssue.target`
Add an optional field:
```ts
export interface GraphIssue {
  kind: "unresolved-alias" | "duplicate-id" | "unknown-type" | "malformed-value";
  nodeId?: TokenId;
  message: string;
  path?: readonly string[];
  /** For unresolved-alias: the raw alias target (slash path) that could not be resolved. */
  target?: string;
}
```

### `src/build-graph.ts` (~:296-302) — set `target`
When pushing the `unresolved-alias` issue, add `target: aliasAttempt.rawTarget`. Message unchanged.

### `src/scanner.ts` (~:66-76) — group unresolved aliases
Split the build-time loop:
- For every `gi` in `graph.issues` whose `kind !== "unresolved-alias"`: emit 1:1 exactly as today.
- Collect all `unresolved-alias` issues; group them by `familyOf(gi.target ?? "")`. For each family emit
  ONE `ScanIssue`:
  - `id`: `bt-unresolved-alias-<family-slug>` (family lowercased, non-alphanumerics → `-`).
  - `category: "build-time"`, `severity: "error"`, `kind: "unresolved-alias"`.
  - `tokenIds`: every aliasing `nodeId` in the family (deduped, in encounter order).
  - `message` (see format below).

`familyOf(target)`: `const i = target.lastIndexOf("/"); return i === -1 ? target : target.slice(0, i);`
Leaf list per family: the unique last-segments (`target.slice(i + 1)`) in encounter order.

**Orthogonal to the existing UI grouping.** `src/app/scan-grouping.ts` (`groupIssuesByComponent`)
groups ScanIssues by `componentName` (with a `General` bucket) — a different axis. Unresolved-alias
issues have no `componentName`, so they land in `General`; this scanner-level family-grouping reduces
them from 6 rows to 2 BEFORE the component grouping sees them. The two layers do not interact and
`scan-grouping.ts` is untouched.

### Message format
```
<N> alias(es) reference unresolved targets under `<family>/*` (<leaf1>, <leaf2>, …) — absent from all
loaded sources. Likely library/remote variables not included by the local-only export (export them or
include the library), or dangling references.
```
Where `<N>` = number of aliasing tokens in the family (= `tokenIds.length`). Example (live export):
`4 aliases reference unresolved targets under \`color/white/alpha/*\` (500-8, 500-15, 500-80) — absent
from all loaded sources. Likely library/remote variables not included by the local-only export (export
them or include the library), or dangling references.`

(If a family has a single member and `target` has no `/`, the message degrades gracefully: family =
the target, leaf list = the target.)

## Tests
`src/scanner.test.ts` (add a describe block):
- Build a graph (via `buildGraph`) from a small fixture with dangling aliases across TWO families,
  e.g. semantic tokens aliasing `color/white/alpha/500-8`, `color/white/alpha/500-15`, and
  `color/black/alpha/500-60`, where those targets are NOT defined.
- Assert: exactly 2 `unresolved-alias` ScanIssues (one per family); each `severity: "error"`,
  `category: "build-time"`; the `color/white/alpha` issue lists `500-8` and `500-15` and counts 2
  aliasing tokens; the message contains the family `color/white/alpha/*` and the library hint phrase;
  `tokenIds` equals the aliasing node ids.
- Assert a non-alias build-time issue (e.g. a `malformed-value`) is still emitted 1:1 (regression
  guard that only `unresolved-alias` is grouped).
- Update/replace any existing test that asserts the old per-alias `unresolved alias: <target>` ScanIssue
  message (search `scanner.test.ts` and `build-graph.test.ts` for `unresolved alias`).

## Verification
- `npm run typecheck && npx vitest run` green.
- Re-run `scripts/probe-unresolved-alias.ts` over the latest export (`assets/tokens-20260619-093216.zip`)
  to confirm the underlying graph issues are unchanged (still 6 graph-level `unresolved-alias`), and add
  a one-off check that `scanGraph` collapses them to 2 grouped ScanIssues.

## Out of scope
- **"Did you mean?" / near-match (typo) detection** — explicitly deferred (overlaps the existing typo
  detector, v0.13.0 unpushed). The hint stays cause-neutral.
- **Severity downgrade / suppression** — the warnings stay `error`; we de-noise by grouping, not hiding.
- **Exporter changes** (exporting library/remote alias targets) — that is a `figma-token-export`
  feature, a separate repo and decision.
- **Resolver / build-graph alias-resolution logic** — confirmed correct; untouched beyond adding the
  `target` field.
- **UI grouping work** — none needed; the existing issue list renders the 2 richer rows as-is.

## Risks
- **Existing tests asserting the 1:1 message** will break by design — they must be updated to the
  grouped shape (called out in Tests). Low risk: a focused search covers them.
- **Family extraction edge cases** (target with no `/`, or trailing `/`) — handled by `familyOf`'s
  `lastIndexOf` guard; covered by a degenerate-case note in the message format.
- **`scripts/probe-unresolved-alias.ts`** is an investigation artifact (currently untracked). It is a
  useful reusable diagnostic for "which aliases are unresolved in export X" — the plan commits it
  alongside the feature; if undesired it can be dropped without affecting the feature.
