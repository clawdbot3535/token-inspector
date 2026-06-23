import type { ScanIssue } from "@core/token-graph.js";

/**
 * Build an owner-classification predicate from a set of ScanIssue.kind strings.
 *
 * The (Y) deviation-routing owners each claim a DISJOINT set of issue kinds, so an
 * issue matches at most one owner predicate. Each owner's KINDS set lives in its own
 * module (the semantic home: its name, JSDoc, and the scanner-line caveat). Those kind
 * strings are emitted in src/scanner.ts; ScanIssue.kind is typed `string`, so a
 * scanner-side kind rename will NOT surface as a compile error — keep each owner set
 * aligned with its scanner emit sites on any rename.
 */
export function makeOwnerPredicate(
  kinds: ReadonlySet<string>,
): (issue: ScanIssue) => boolean {
  return (issue) => kinds.has(issue.kind);
}
