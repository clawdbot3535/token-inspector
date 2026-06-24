# Figma-Fix v2: `collection-anatomy-mismatch` routing — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming)
**Track:** (Y) deviation decision-routing — Figma-Fix owner v2 remainder

## Summary

Route the last un-owned coverage/structure deviation, `collection-anatomy-mismatch`, to
the **Figma-Fix** owner. Today it falls through `ownerOf` to `null` ("Other"); after this
change it gets the muted violet **🎨 fix in Figma** badge and is bucketed under the
Figma-Fix owner filter. This completes the Figma-Fix owner and shrinks the "Other"
backlog by one kind.

`collection-anatomy-mismatch` (emitted at `src/scanner.ts:431-441`, `severity: "warning"`,
`tokenIds: []`, carries `componentName`) fires when a component *looks custom* (has parts
with no Nuxt slot) yet is declared in a non-`components/custom` Figma collection — i.e. it
is mis-filed in the Figma source. The fix is the designer's: move the component to
`components/custom`. That is squarely the Figma-Fix owner's domain (fix lives in the Figma
token source), just a different sub-theme from the five coverage-gap kinds already routed
there.

## Scope — the single behavioral change

Add `"collection-anatomy-mismatch"` to `FIGMA_FIX_KINDS` in `src/app/resolve/figma-fix.ts`
(5 → 6 kinds). That is the entire behavioral change. Because owner routing is set-driven:

- `ownerOf(issue)` (src/app/resolve/owner-of.ts) first-matches over the five disjoint kind
  sets → now returns `"figma-fix"` for this kind.
- The 🎨 badge is registry-driven off `ownerOf` (`OWNER_BADGES` / `ownerBadge`,
  src/app/owner-badges.ts, since v0.55.1) → renders automatically.
- The owner filter (src/app/resolve/owner-of.ts `OWNER_FILTERS`, since v0.55.0) buckets by
  `ownerOf` → the issue moves from "Other" to "Figma-Fix" automatically.

No change to ScanView.vue, owner-of.ts, the scanner, ScanIssue type, severity, or message.

### Disjointness

`collection-anatomy-mismatch` is currently in none of the five owner kind-sets (by-design
{3}, figma-fix {5}, manual-dev {3}, heuristic {2}, data-quality {2}). Adding it to
figma-fix makes it {6}; the sets stay disjoint, so `ownerOf`'s first-match remains
unambiguous.

## Documentation accuracy (same file)

Two stale comments in `figma-fix.ts` must be corrected so the doc matches the widened set:

1. **`isFigmaFix` JSDoc** currently reads "the coverage of the design token set is
   incomplete or inconsistent." `collection-anatomy-mismatch` is not a coverage gap — it
   is a mis-filed collection. Broaden the JSDoc to cover both themes: the token set's
   coverage is incomplete/inconsistent **or** a component is filed in the wrong Figma
   collection.
2. **The emit-site line-number comment** at the top of the file lists the five scanner
   lines. Add `collection-anatomy-mismatch :435`.

## Non-goals

- **No copy affordance.** `tokenIds` is empty and the fix is a single action ("move to
  `components/custom`") — there is no token-name list to copy (unlike v0.56.0's
  `asymmetric-variant-coverage` → `figmaFixTokens`). Pure badge-only routing, consistent
  with the four other non-asymmetric Figma-Fix kinds.
- **No message change.** The existing message already states the one action.
- **No scanner / severity / ScanIssue-type / ScanView change.**
- The parallel `component-looks-custom` issue for the same component (Heuristic owner,
  different kind `clc-<comp>` vs this kind's `cam-<comp>`) is untouched — two distinct
  concerns (the parts vs the collection filing), two rows, two owners. Not deduped.

## Testing

The behavioral change is one set entry; the real work is flipping the guard tests that
currently pin `collection-anatomy-mismatch` as out-of-scope:

- **`src/app/resolve/figma-fix.test.ts`**
  - Line 27 currently asserts `isFigmaFix(issue("collection-anatomy-mismatch"))` is
    `false` (comment: "deliberately out of scope"). Move it into the "is true" group and
    update/remove the comment.
  - The "FIGMA_FIX_KINDS holds exactly the five coverage-gap kinds" assertion (lines 30-40)
    becomes "exactly the six kinds" with `"collection-anatomy-mismatch"` added to the
    expected array. Rename the test title accordingly.
- **`src/app/resolve/owner-of.test.ts`** — add an explicit assertion that
  `ownerOf` of a `collection-anatomy-mismatch` issue returns `"figma-fix"` (was implicitly
  `null`/"Other"). Makes the routing intent a pinned test.
- **Unchanged:** `src/scanner.test.ts` emit tests (lines ~1008/1018) — owner routing is
  orthogonal to emission; they must stay green.
- Full suite green (976 + the new owner-of assertion).
