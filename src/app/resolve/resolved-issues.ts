import type { ScanReport } from "@core/token-graph.js";
import { heuristicExtendable } from "./heuristic-extendable.js";

/** Issue ids that are FULLY resolved: the issue has ≥1 heuristic-extendable
 *  token and every such token is in the session override (`resolved`). The
 *  single source of truth for "this deviation is handled". */
export function resolvedIssueIds(report: ScanReport, resolved: ReadonlySet<string>): Set<string> {
  const resolvableTokenIds = new Set(heuristicExtendable(report).map((r) => r.tokenId));
  const out = new Set<string>();
  for (const issue of report.issues) {
    const resolvable = issue.tokenIds.filter((t) => resolvableTokenIds.has(t));
    if (resolvable.length > 0 && resolvable.every((t) => resolved.has(t))) out.add(issue.id);
  }
  return out;
}
